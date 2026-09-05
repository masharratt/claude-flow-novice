#!/usr/bin/env bash
# verify-run.sh — mechanical executor for a VERIFY manifest (Bar A, G37).
# The single done authority for cfn-loop-task: runs each AC's check, records a
# results file, and reports done ONLY when every AC is green and nothing is unresolved.
# Prose never counts — a needs_agent / predicate_unverified row is "done" only after
# `resolve` stamps captured evidence into the results file.
#
# Subcommands:
#   run     --verify <VERIFY_<slug>.md> [--out <RESULTS.json>] [--only AC-3,AC-7] [--timeout N]
#   resolve --results <RESULTS.json> --ac AC-3 --pass true|false --evidence-file <f>
#   summary --results <RESULTS.json>
#   backfill-evidence --results <RESULTS.json> --verify <VERIFY_<slug>.md>
#           writes each green row's real output into that AC's `evidence` field
#           (replacing the plan-stage `PENDING:` placeholder), then the manifest
#           must be re-blessed with bars/bless-verify.sh --stage exit
#
# Env:  CFN_VERIFY_TIMEOUT_S      per-check timeout seconds (default 300)
#       CFN_VERIFY_DATABASE_URL   when set, db-query: checks run via psql; else -> needs_agent
#
# Exit: 0 = all green AND nothing unresolved
#       1 = one or more red, unresolved, or tool_missing ACs
#       2 = usage / parse / file error / evidence refusal
#       4 = VERIFY manifest sha256 mismatch (edited after Bar A blessed it)
#
# Deps: jq, timeout(1); psql only when CFN_VERIFY_DATABASE_URL is set.
#
# Per-check tool preflight (S008): a check whose command is not on PATH is
# reported as mode=error / pass=false, never as a pass. Declare a check's
# non-obvious tools in `requires.tools: ["rg", ...]`; common tools are inferred.
# See CFN_KNOWN_TOOLS and tool_install_hint below.
set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

DEFAULT_TIMEOUT="${CFN_VERIFY_TIMEOUT_S:-300}"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/parse-test-summary.sh
source "$SCRIPT_DIR/lib/parse-test-summary.sh"

die2() { echo "{\"error\":\"$1\"}" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die2 "$1 not found on PATH"; }

now_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Extract the LAST fenced ```json block from a markdown file.
extract_manifest() {
  awk '
    /^```json/     { inblock=1; buf=""; next }
    inblock && /^```/ { inblock=0; last=buf; next }
    inblock        { buf = buf $0 "\n" }
    END            { printf "%s", last }
  ' "$1"
}

# Strip a leading `playwright:` taxonomy prefix, returning the bare command.
# Bar A REQUIRES e2e/ui ACs to carry this prefix; it is a kind marker, not part
# of the command, so it must come off before execution.
strip_pw() {
  local c="$1"
  case "$c" in
    playwright:*) c="${c#playwright:}"; printf '%s' "${c#"${c%%[![:space:]]*}"}" ;;
    *) printf '%s' "$c" ;;
  esac
}

# S009 (origin: B1 VERIFY manifest global preamble): every check in the B1
# manifest carries an inline shell preamble before the real command
# (`set -o pipefail; OUT=/tmp/...; export CURVE26_LOCAL_DATABASE_URL="$..."; <cmd>`),
# which that manifest documents as part of every check cell. The preamble is
# legitimate shell the executor already runs whole via `bash -c`, but classify()
# and is_authoritative() read the FIRST WORD of the string, so the real
# command's tool word sat invisible behind `set` and all 134 rows graded
# needs_agent without executing. Strip the leading `set -o pipefail;`,
# assignment and `export` statements for CLASSIFICATION ONLY; execution keeps
# the full string so pipefail and the env export still take effect.
#
# Safety: a statement is stripped only when a `;` separates it from what
# follows, so an env-prefix form with no semicolon (`FOO=1 pnpm ...`,
# `export FOO=1 pnpm ...`) is never mangled, and the loop cannot run past the
# first non-preamble statement.
strip_prelude() {
  local c="$1" head rest
  while :; do
    head="${c%%;*}"
    [ "$head" = "$c" ] && break
    # S012 (origin: staff-person-refresh VERIFY manifest, exit gate 2026-09-02):
    # the assignment arm named exactly one variable, OUT. 33 of 58 rows opened
    # with a different one (F="path/to/file.ts"; test -s "$F" && grep -q ...),
    # so the first word graded as `F="..."` and every one of them read
    # needs_agent without executing. Any leading scalar assignment is prelude
    # for CLASSIFICATION purposes; the discriminator is a NAME= at the very
    # start of the statement, which cannot match a command word because the
    # name pattern admits no whitespace before the `=`. Same contract as S009
    # and S011: execution keeps the full string, assignment included.
    if [[ "$head" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      rest="${c#*;}"
      c="${rest#"${rest%%[![:space:]]*}"}"
      continue
    fi
    case "$head" in
      "set -o pipefail"|export\ *)
        rest="${c#*;}"
        c="${rest#"${rest%%[![:space:]]*}"}"
        ;;
      case\ *)
        # S011 (origin: B4 VERIFY manifest, exit gate 2026-08-24): 271 of 306
        # rows carry an inline endpoint guard between the export and the real
        # command (case "$CURVE26_LOCAL_DATABASE_URL" in ...local patterns...)
        # :;; *) echo "refusing non-local endpoint"; exit 2;; esac; pnpm ...).
        # The guard is legitimate shell the executor runs whole via bash -c,
        # but strip_prelude stopped at it, so first word graded as `case` and
        # every guarded row read needs_agent without executing. Skip through
        # the guard's esac; for CLASSIFICATION ONLY, same contract as the
        # export strip above: execution keeps the full string, guard included,
        # so a non-local endpoint still aborts the check itself.
        rest="${c#*esac;}"
        [ "$rest" = "$c" ] && break
        c="${rest#"${rest%%[![:space:]]*}"}"
        ;;
      *) break ;;
    esac
  done
  printf '%s' "$c"
}

# Classify a check string -> executable | db-query | needs_agent
#
# S007 (origin: HANDOFF_verify_manifest_runnability.md): `playwright:` used to
# map unconditionally to needs_agent while Bar A's taxonomy REQUIRED that exact
# prefix on every e2e/ui AC. A Bar-A-compliant e2e AC therefore could never be
# mechanically green, and authors routed around it by mislabeling `kind` -- which
# is the kind/command drift the other handoff reported as its own defect. The
# discriminator is now what FOLLOWS the prefix: a real shell command executes;
# a prose assertion ("playwright: snapshot select#course, options match query",
# the form Bar A's own examples use) still needs an agent.
classify() {
  local check="$1"
  case "$check" in
    db-query*) echo db-query; return ;;
  esac
  check="$(strip_pw "$check")"
  check="$(strip_prelude "$check")"
  local first="${check%% *}"
  case "$first" in
    # S012: `test` and `[` are the guard form a check opens with when it must
    # prove its own target exists before asserting on it
    # (test -s "$F" && grep -q ... && pnpm vitest run ...). They are shell
    # builtins that self-assert by exit code, which is why is_authoritative
    # already accepts them; omitting them here made 32 such rows unrunnable.
    vitest|jest|mocha|ava|cargo|pytest|go|npx|npm|pnpm|yarn|playwright|node|bash|tsc|curl|grep|rg|jq|test|\[) echo executable ;;
    *) echo needs_agent ;;
  esac
}

# Verify an AC's `requires` preconditions.
# Sets REQ_ENV (newline-separated NAME=value assignments the check must run
# with) and, on failure, PRECOND_REASON. Returns 0 met / 1 unmet.
#
# Both channels are globals, NOT stdout: a `$(check_requires ...)` call would
# run the function in a subshell, where PRECOND_REASON is assigned and then
# discarded when the subshell exits.
#
# S007: "infra absent" must be reported distinctly from "feature broken". NSC's
# loop had 27 rows that were unrunnable for want of a DB, a dev server, or an
# env pin, all indistinguishable from real failures, so a human hand-verified
# every one to find out which were which.
#
# `env` entries carry two different meanings by shape, deliberately:
#   NAME=value  -> EXPORTED into the check. The manifest declares the pins the
#                  check needs, so a human can read the row and reproduce the
#                  run by hand unchanged.
#   NAME        -> ASSERTED present in the runner's own environment. For
#                  secrets (DB URLs, tokens) that must never be written into a
#                  manifest that gets committed.
PRECOND_REASON=""
REQ_ENV=""
check_requires() {
  local ac="$1"
  PRECOND_REASON=""
  REQ_ENV=""
  local req; req="$(echo "$ac" | jq -c '.requires // {}')"
  [ "$req" = "{}" ] && return 0

  local n i entry name
  n="$(echo "$req" | jq '(.env // []) | length')"
  i=0
  while [ "$i" -lt "$n" ]; do
    entry="$(echo "$req" | jq -r ".env[$i]")"
    i=$((i + 1))
    case "$entry" in
      *=*) REQ_ENV="${REQ_ENV}${entry}"$'\n' ;;
      *)
        name="$entry"
        if [ -z "${!name:-}" ]; then
          PRECOND_REASON="precondition_unmet: required env var $name is unset in the runner's environment"
          return 1
        fi ;;
    esac
  done

  if [ "$(echo "$req" | jq -r '.db // false')" = "true" ] && [ -z "${CFN_VERIFY_DATABASE_URL:-}" ]; then
    PRECOND_REASON="precondition_unmet: requires.db but CFN_VERIFY_DATABASE_URL is unset"
    return 1
  fi

  local url; url="$(echo "$req" | jq -r '.http // ""')"
  if [ -n "$url" ]; then
    if ! command -v curl >/dev/null 2>&1; then
      PRECOND_REASON="precondition_unmet: requires.http $url but curl is not on PATH"
      return 1
    fi
    # Any HTTP response proves the service is listening; a 404 still means the
    # dev server is up. Only a connection failure is a blocked precondition.
    if ! curl -sS -o /dev/null --max-time 5 "$url" >/dev/null 2>&1; then
      PRECOND_REASON="precondition_unmet: requires.http $url is unreachable (service not running?)"
      return 1
    fi
  fi
  return 0
}

# ---------------- tool preflight (S008) ----------------
#
# S008 (origin: MP0 deferral 102). Every check runs through `bash -c`, which
# inherits no shell functions, no aliases and no interactive rc file. When the
# command a check names is absent from PATH, the shell prints
# "command not found" and produces NO stdout, and the single most common check
# shape in a static manifest is
#
#     n=$(<tool> ... | wc -l); test "$n" -eq 0
#
# so `wc -l` reads the empty output as ZERO OFFENDERS and the AC scores GREEN.
# A missing tool was indistinguishable from a clean repo. One manifest carried
# 113 `rg` uses across 49 of its 241 checks, all of which silently false-passed
# on every machine except the one that happened to have a private ripgrep build.
#
# A missing tool is therefore an `error` row: mode=error, pass=false. Never
# `blocked` (a human may resolve a blocked row with hand-captured evidence, and
# "the tool was not installed" is not evidence of anything) and never green.
#
# Three independent detectors, because no single one is sufficient:
#   1. requires.tools[]  — what the manifest DECLARES the check needs. Explicit,
#      carries the best install hint, but an author can forget it.
#   2. inference over CFN_KNOWN_TOOLS — names matched only in a shell COMMAND
#      position. Candidates come from a fixed list, so a pattern string can
#      never invent a tool name that is not really a tool.
#   3. post-run scan of the captured output for the shell's own not-found
#      diagnostic. Catches a tool nested inside $(...) or a loop body, where the
#      outer command still exits 0. Defeated by `2>/dev/null` inside the check,
#      which is exactly why 1 and 2 exist.
#
# Resolution uses `type -P`, a PATH search only: a tool that exists solely as an
# exported shell function resolves for `command -v` but is not reproducible from
# a clone, and reporting it as present is how this bug survived.

# Deliberately EXCLUDES project-local devDependency binaries (tsc, tsx, vitest,
# jest, playwright, jscpd, eslint, prettier). Those are resolved from
# node_modules/.bin by the package manager that invokes them, are never expected
# on PATH, and listing them here reported four already-correct checks as broken.
# The package manager itself (pnpm/npm/npx/yarn/node) IS listed, because that is
# the thing that has to exist. Declare an unusual tool in requires.tools[].
CFN_KNOWN_TOOLS="rg jq grep egrep fgrep sed awk gawk python3 python node npx npm pnpm yarn psql curl wget git timeout sha256sum shasum pytest cargo go docker supabase shellcheck yq gh openssl base64 comm diff perl ruby php java mvn gradle make cmake gcc clang rustc dotnet kubectl terraform aws gcloud az fly flyctl vercel wrangler sort uniq wc xargs find tr cut head tail stat date column realpath readlink mktemp tee"

# Install line per tool. A row that says "rg is missing" and nothing else sends
# the reader hunting; the row states how to get it.
tool_install_hint() {
  case "$1" in
    rg)   echo "rg (ripgrep >= 14, needs --glob and -U multiline): apt-get install -y ripgrep | brew install ripgrep | cargo install ripgrep | static build from https://github.com/BurntSushi/ripgrep/releases" ;;
    jq)   echo "jq: apt-get install -y jq | brew install jq" ;;
    psql) echo "psql: apt-get install -y postgresql-client | brew install libpq" ;;
    pnpm) echo "pnpm: corepack enable && corepack prepare pnpm@latest --activate" ;;
    tsx)  echo "tsx: pnpm add -D tsx (invoke as 'pnpm tsx', not bare 'tsx')" ;;
    node|npx) echo "$1: install Node 22+ (nvm install 22, or the distro package)" ;;
    jscpd) echo "jscpd: pnpm add -D jscpd (invoke via 'pnpm exec jscpd')" ;;
    timeout|sha256sum|sort|wc|tr|cut|head|tail|stat|date|comm|mktemp|tee|realpath|readlink)
          echo "$1: GNU coreutils (apt-get install -y coreutils | brew install coreutils)" ;;
    *)    echo "$1: not on PATH, install it and re-run" ;;
  esac
}

# Tool names this check names in a shell COMMAND position, one per line.
infer_tools() {
  local check="$1" t
  # `exec` and `command` are NOT command-position markers here: `pnpm exec tsc`
  # put a node_modules binary in what looked like a PATH position.
  local pre='(^|[;&|(){]|\$\(|`|[[:space:]](then|do|else|elif|env|time|xargs|sudo)[[:space:]])[[:space:]]*'
  local post='([[:space:]]|$|`|\)|;)'
  for t in $CFN_KNOWN_TOOLS; do
    if [[ "$check" =~ ${pre}${t}${post} ]]; then printf '%s\n' "$t"; fi
  done
}

# Sets MISSING_TOOLS (newline-separated). Returns 0 when every tool resolves.
MISSING_TOOLS=""
check_tools() {
  local check="$1" ac="$2"
  MISSING_TOOLS=""
  local t seen="" declared
  declared="$(echo "$ac" | jq -r '(.requires.tools // [])[]' 2>/dev/null)"
  for t in $declared $(infer_tools "$check"); do
    case " $seen " in *" $t "*) continue ;; esac
    seen="$seen $t"
    # type -P is a PATH search only: no functions, no aliases, no builtins.
    env -u LC_ALL LC_MESSAGES=C bash -c "type -P -- '$t' >/dev/null 2>&1" && continue
    MISSING_TOOLS="${MISSING_TOOLS}${t}"$'\n'
  done
  [ -z "${MISSING_TOOLS//[[:space:]]/}" ]
}

# One reason string for a set of missing tools, install lines included.
missing_tools_reason() {
  local names="" hints="" t
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    names="${names}${names:+ }${t}"
    hints="${hints}${hints:+ ; }$(tool_install_hint "$t")"
  done <<< "$1"
  echo "tool_missing: $names not on PATH — this check cannot prove its predicate, and an absent tool must never read as zero offenders. Install: $hints"
}

# Names the shell itself reported as not found, from captured output.
# Matches only the shell's own diagnostic shape, never arbitrary prose that
# happens to end in "not found".
scan_not_found() {
  printf '%s\n' "$1" \
    | grep -oE '^(bash|sh|dash|env|timeout)(: line [0-9]+)?: [^:]+: (command )?not found$' \
    | sed -E 's/.*: ([^:]+): (command )?not found$/\1/' \
    | sort -u | tr '\n' ' ' | sed 's/ *$//'
}

# exit-code-authoritative? runner kinds prove pass by exit code; predicate kinds
# (curl/grep/rg/jq/db-query) do so ONLY if the check self-asserts.
is_authoritative() {
  local check; check="$(strip_prelude "$1")"
  case "${check%% *}" in
    vitest|jest|mocha|ava|cargo|pytest|go|npx|npm|pnpm|yarn|playwright|node|bash|tsc) return 0 ;;
  esac
  # predicate kinds: authoritative only if the command itself fails on a false predicate
  if echo "$check" | grep -qE '(jq -e|grep -q|rg -q| -eq | -ne |\[\[|test )'; then
    return 0
  fi
  return 1
}

# S007: does this check restrict the run to specific test NAMES?
#
# A name-filtered run reports the file's non-matching tests as "skipped" in the
# same summary field that a real `.skip()` lands in -- vitest prints
# "Tests  7 passed | 12 skipped (19)" for both. The runner cannot tell them
# apart from the summary alone, so it reads the flag in the check itself, which
# is unambiguous. Scoped per runner (a bare ` -t ` means nothing to pytest,
# whose filter is -k) so an unrelated -t in some other command never relaxes
# the S002 rule. Callers must still require passed>0 and failed==0; this
# predicate only says "skips here are expected".
has_name_filter() {
  local check="$1" runner="$2"
  case "$runner" in
    vitest|jest)   echo "$check" | grep -qE '(^| )(-t|--testNamePattern)([= ]|$)' && return 0 ;;
    playwright)    echo "$check" | grep -qE '(^| )(-g|--grep)([= ]|$)' && return 0 ;;
    pytest)        echo "$check" | grep -qE '(^| )-k([= ]|$)' && return 0 ;;
    go)            echo "$check" | grep -qE '(^| )-run([= ]|$)' && return 0 ;;
  esac
  return 1
}

json_str() { jq -Rn --arg s "$1" '$s'; }

# ---------------- run ----------------
cmd_run() {
  local VERIFY="" OUT="" ONLY="" TIMEOUT="$DEFAULT_TIMEOUT"
  while [ $# -gt 0 ]; do
    case "$1" in
      --verify)  VERIFY="${2:-}"; shift 2 ;;
      --out)     OUT="${2:-}"; shift 2 ;;
      --only)    ONLY="${2:-}"; shift 2 ;;
      --timeout) TIMEOUT="${2:-}"; shift 2 ;;
      *) die2 "unknown run arg: $1" ;;
    esac
  done
  [ -n "$VERIFY" ] || die2 "run requires --verify <file>"
  [ -f "$VERIFY" ] || die2 "verify file not found: $VERIFY"
  need jq; need timeout

  # sha256 integrity (W2): sidecar sits beside the manifest, derived from its own
  # dir + basename — planning/<slug>/.VERIFY_<slug>.sha256 for a per-plan dir, or
  # planning/.VERIFY_<slug>.sha256 for a legacy flat layout.
  local dir base sidecar
  dir="$(dirname "$VERIFY")"; base="$(basename "$VERIFY" .md)"
  sidecar="$dir/.$base.sha256"
  if [ -f "$sidecar" ]; then
    local want got
    want="$(tr -d '[:space:]' < "$sidecar")"
    got="$(sha256sum "$VERIFY" | awk '{print $1}')"
    if [ "$want" != "$got" ]; then
      echo "{\"error\":\"VERIFY manifest sha256 mismatch — edited after Bar A blessed it\",\"want\":\"$want\",\"got\":\"$got\"}" >&2
      exit 4
    fi
  else
    echo "warn: no integrity sidecar ($sidecar) — pre-hash-era manifest, proceeding" >&2
  fi

  local MANIFEST; MANIFEST="$(extract_manifest "$VERIFY")"
  # case glob, not `printf | grep -q`: grep -q exits early, printf takes
  # SIGPIPE (141), pipefail makes it the pipeline status, valid manifest
  # rejected as empty. Linear, no subprocess.
  case "$MANIFEST" in *[![:space:]]*) ;; *) die2 "no fenced json manifest block in $VERIFY" ;; esac
  echo "$MANIFEST" | jq -e . >/dev/null 2>&1 || die2 "manifest json does not parse"

  local SLUG SHA MANIFEST_CWD
  SLUG="$(echo "$MANIFEST" | jq -r '.slug // "unknown"')"
  SHA="$(sha256sum "$VERIFY" | awk '{print $1}')"
  [ -n "$OUT" ] || OUT="$dir/VERIFY_RESULTS_${SLUG}.json"
  # S007: manifest-global cwd. Every check used to run from the git top-level,
  # but in a monorepo the runner config (vitest.config / playwright.config /
  # tsconfig path aliases) lives in a subdirectory and every manifest path is
  # relative to it -- so from the repo root none of them resolved. Playwright
  # specifically CANNOT run from the repo root when two @playwright/test
  # versions resolve, so this is not fixable by path-prefixing the checks.
  MANIFEST_CWD="$(echo "$MANIFEST" | jq -r '.cwd // ""')"
  # S010 (origin: B1 gate run 2, 2026-08-22): the B1 manifest's `cwd` is the
  # absolute path of the main checkout, authored during planning before the
  # implementation worktree existed. The b1 code lives in the worktree, so a
  # gate run from the manifest cwd collects the MAIN tree's test population,
  # which carries none of the b1 titles: 116 rows graded zero_tests_ran against
  # the wrong tree and every file-scoped check exited "No test files found".
  # The manifest is sha256-blessed, so the operator gets the same pointer
  # pattern CFN_VERIFY_DATABASE_URL already uses: CFN_VERIFY_CWD overrides the
  # manifest-global cwd. Per-AC `cwd` still wins over both, and the sha256
  # integrity check above still pins the manifest bytes.
  if [ -n "${CFN_VERIFY_CWD:-}" ]; then
    MANIFEST_CWD="$CFN_VERIFY_CWD"
    echo "note: CFN_VERIFY_CWD set, manifest cwd overridden to $MANIFEST_CWD" >&2
  fi

  # optional --only filter
  local only_filter=""
  if [ -n "$ONLY" ]; then only_filter=",${ONLY},"; fi

  local n i results=()
  n="$(echo "$MANIFEST" | jq '.acs | length')"
  i=0
  while [ "$i" -lt "$n" ]; do
    local ac acid kind check pass
    ac="$(echo "$MANIFEST" | jq -c ".acs[$i]")"
    acid="$(echo "$ac" | jq -r '.id // "AC-?"')"
    kind="$(echo "$ac" | jq -r '.kind // ""')"
    check="$(echo "$ac" | jq -r '.check // ""')"
    pass="$(echo "$ac" | jq -r '.pass // ""')"
    i=$((i + 1))

    if [ -n "$only_filter" ] && [[ "$only_filter" != *",${acid},"* ]]; then
      continue
    fi

    local class mode exit_code excerpt pass_val pred_unv evidence reason
    local ac_cwd run_cwd exec_check req_env nf_tools
    mode=""; exit_code="null"; excerpt=""; pass_val="null"; pred_unv="false"; evidence=""
    # S005 (origin: MANIFEST_HANDOFF_conversational_interview_engine.md item 2):
    # every row states WHY it landed where it did, in-band. A check that ran 0
    # tests was already red, but the only thing an author saw was the runner's
    # tail -- for cargo, incremental-compile fs warnings -- with nothing saying
    # "this proved nothing". Authors read that as a feature failure and went
    # hunting in correct code.
    reason=""
    class="$(classify "$check")"
    exec_check="$(strip_pw "$check")"

    if [ "$class" = "db-query" ] && [ -z "${CFN_VERIFY_DATABASE_URL:-}" ]; then
      class="needs_agent"
      reason="needs_agent: db-query check but CFN_VERIFY_DATABASE_URL is unset — resolve with captured evidence, or set the var and re-run"
    fi

    # --- cwd resolution: per-AC overrides manifest-global overrides repo root.
    ac_cwd="$(echo "$ac" | jq -r '.cwd // ""')"
    [ -n "$ac_cwd" ] || ac_cwd="$MANIFEST_CWD"
    run_cwd="$PROJECT_ROOT"
    if [ -n "$ac_cwd" ]; then
      case "$ac_cwd" in
        /*) run_cwd="$ac_cwd" ;;
        *)  run_cwd="$PROJECT_ROOT/$ac_cwd" ;;
      esac
    fi
    if [ "$class" != "needs_agent" ] && [ ! -d "$run_cwd" ]; then
      class="blocked"
      reason="precondition_unmet: cwd '$ac_cwd' does not exist (resolved to $run_cwd)"
    fi

    # --- requires{} preconditions. Reported as `blocked`, never as red: an
    # absent DB or a dead dev server is not a feature defect, and collapsing
    # the two forced a human to hand-verify every row to tell them apart.
    req_env=""
    if [ "$class" = "executable" ] || [ "$class" = "db-query" ]; then
      if check_requires "$ac"; then
        req_env="$REQ_ENV"
      else
        class="blocked"
        reason="$PRECOND_REASON"
      fi
    fi

    # --- S008 tool preflight. Runs AFTER requires{} (an absent DB is infra, not
    # a broken toolchain) and BEFORE execution, so a check whose tool is missing
    # never gets the chance to score its empty output as a pass.
    if [ "$class" = "executable" ]; then
      if ! check_tools "$exec_check" "$ac"; then
        class="error"
        reason="$(missing_tools_reason "$MISSING_TOOLS")"
      fi
    fi

    case "$class" in
      executable)
        local raw rc
        local -a envargs=()
        if [ -n "$req_env" ]; then
          while IFS= read -r envline; do
            [ -n "$envline" ] && envargs+=("$envline")
          done <<< "$req_env"
        fi
        # LC_MESSAGES=C pins the shell's not-found wording so scan_not_found
        # below is not defeated by a localized diagnostic. LC_ALL is dropped
        # rather than set, so collation (sort -u counts) is left alone.
        raw="$(cd "$run_cwd" && timeout "$TIMEOUT" env -u LC_ALL LC_MESSAGES=C ${envargs[@]+"${envargs[@]}"} bash -c "$exec_check" 2>&1)"; rc=$?
        exit_code="$rc"
        excerpt="$(printf '%s\n' "$raw" | tail -20)"
        mode="executed"
        # S008 detector 3: a tool absent inside $(...) or a loop body leaves the
        # outer command exiting 0. Never adjudicate such a run as a pass.
        nf_tools="$(scan_not_found "$raw")"
        if [ -n "$nf_tools" ]; then
          mode="error"; pass_val="false"
          reason="$(missing_tools_reason "$(printf '%s\n' $nf_tools)")"
          echo "  [$acid] tool_missing (reported by the shell at run time): $nf_tools" >&2
        elif is_authoritative "$exec_check"; then
          # S002 (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77): exit code 0
          # alone must never close a runner-kind AC: a fully skipIf-ed test file
          # exits 0 and used to mark the AC green. Parse the captured stdout via
          # the shared summary parser (same logic gate-check.sh already uses).
          # Deliberate choice: RED, not unresolved, for both cases below:
          #   - zero-collected: the check named a test that did not run, so the
          #     check itself is broken.
          #   - skipped/todo present: a skipped guard is not a guard.
          # Exit code is only trusted when the runner's own summary is
          # unrecognized ("unknown": mocha/ava/bash/tsc, non-verbose `go test`,
          # or an unparseable summary shape); those keep the pre-S002
          # exit-code-only semantics because this parser does not cover them.
          # S005 moved cargo, cargo-nextest and `go test -v` OUT of that set.
          local raw_tmp
          raw_tmp="$(mktemp)"
          printf '%s\n' "$raw" > "$raw_tmp"
          if parse_test_summary "$raw_tmp"; then
            if [ "$PTS_COLLECTED" -eq 0 ]; then
              pass_val="false"
              reason="zero_tests_ran: check ran 0 tests (runner=$PTS_RUNNER, filtered_out=$PTS_FILTERED) — the selector or flag in this check matched no test, so it proves nothing. Fix the check, not the feature."
              echo "  [$acid] zero_tests_ran (runner=$PTS_RUNNER, filtered_out=$PTS_FILTERED) — check selector/flag matched no test" >&2
            elif [ "$PTS_TODO" -eq 0 ] && has_name_filter "$exec_check" "$PTS_RUNNER" \
                 && { [ "$PTS_SKIP" -gt 0 ] || [ "$PTS_FAIL" -gt 0 ]; }; then
              # S007: the check asked for specific test NAMES, so the file's
              # other tests being "skipped" is the selector working, not a
              # disabled guard. Judge on passed/failed instead of skipped.
              # todo>0 is excluded above on purpose: a `.todo(` placeholder is
              # never selector-induced, so it keeps failing under S002.
              # S012 (origin: B4 exit gate 5E.0, 2026-08-24): the zero_tests_ran
              # arm used to fire on PASS==0 alone, so a name-filtered run whose
              # ONE matched test FAILED (0 passed, 1 failed, rest skipped)
              # mislabeled as "selector matched no test". A failing match is
              # evidence the selector works: require FAIL==0 too before calling
              # the selector dead, and let the failed>0 arm below report
              # runner_failed with the real counts.
              if [ "$PTS_PASS" -eq 0 ] && [ "$PTS_FAIL" -eq 0 ]; then
                pass_val="false"
                reason="zero_tests_ran: name-filtered run matched no test (0 passed, $PTS_SKIP skipped of $PTS_COLLECTED collected, runner=$PTS_RUNNER) — the selector in this check proves nothing. Fix the check, not the feature."
                echo "  [$acid] zero_tests_ran (name filter matched 0 of $PTS_COLLECTED, runner=$PTS_RUNNER)" >&2
              elif [ "$PTS_FAIL" -gt 0 ] || [ "$rc" -ne 0 ]; then
                pass_val="false"
                reason="runner_failed: exit $rc, $PTS_FAIL failed / $PTS_PASS passed (name-filtered, runner=$PTS_RUNNER)"
              else
                pass_val="true"
                reason="ok: $PTS_PASS passed, 0 failed (name-filtered run; the $PTS_SKIP skipped are the file's other tests excluded by this check's own selector, runner=$PTS_RUNNER)"
              fi
            elif [ "$PTS_SKIP" -gt 0 ] || [ "$PTS_TODO" -gt 0 ]; then
              pass_val="false"
              reason="skipped_present: $PTS_SKIP skipped / $PTS_TODO todo of $PTS_COLLECTED collected (runner=$PTS_RUNNER) — a skipped guard is not a guard"
            elif [ "$rc" -eq 0 ]; then
              pass_val="true"
              reason="ok: $PTS_PASS/$PTS_COLLECTED passed (runner=$PTS_RUNNER)"
            else
              pass_val="false"
              reason="runner_failed: exit $rc, $PTS_FAIL failed of $PTS_COLLECTED collected (runner=$PTS_RUNNER)"
            fi
          else
            if [ "$rc" -eq 0 ]; then
              pass_val="true"
              reason="exit_code_only: runner summary unrecognized, trusting exit 0 — no proof any test ran"
            else
              pass_val="false"
              reason="exit_code_only: runner summary unrecognized, exit $rc"
            fi
          fi
          rm -f "$raw_tmp"
        else
          if [ "$rc" -ne 0 ]; then
            pass_val="false"
            reason="predicate_failed: exit $rc"
          else
            pred_unv="true"; pass_val="null"
            reason="predicate_unverified: exit 0 but the check does not self-assert (no jq -e / grep -q / comparison) — resolve with captured evidence"
          fi
        fi
        ;;
      db-query)
        local sql raw rc
        sql="${check#db-query:}"; sql="${sql#db-query}"
        raw="$(cd "$run_cwd" && timeout "$TIMEOUT" psql "$CFN_VERIFY_DATABASE_URL" -X -A -t -c "$sql" 2>&1)"; rc=$?
        exit_code="$rc"
        excerpt="$(printf '%s\n' "$raw" | tail -20)"
        mode="executed"
        if [ "$rc" -ne 0 ]; then
          pass_val="false"
          reason="predicate_failed: psql exit $rc"
        else
          pred_unv="true"; pass_val="null"
          reason="predicate_unverified: psql exit 0 but the query does not self-assert — resolve with the captured rows"
        fi
        ;;
      error)
        # S008: the check's own toolchain is absent. Red, not blocked: `blocked`
        # invites a hand-resolve, and "the tool was not installed" proves
        # nothing about the feature. exit_code 127 is the shell's own
        # command-not-found code, recorded so the row reads like what happened.
        mode="error"; pass_val="false"; exit_code=127
        echo "  [$acid] $reason" >&2
        ;;
      blocked)
        # A third state, distinct from red. The check never ran, so it says
        # nothing about the feature -- bring the infrastructure up and re-run,
        # or resolve the row with evidence captured by hand.
        mode="blocked"; pass_val="null"
        ;;
      needs_agent)
        mode="needs_agent"; pass_val="null"
        [ -n "$reason" ] || reason="needs_agent: check is not mechanically executable by this runner — resolve with captured evidence"
        ;;
    esac

    results+=("$(jq -n \
      --arg ac "$acid" --arg kind "$kind" --arg check "$check" --arg mode "$mode" \
      --argjson ec "$exit_code" --argjson pass "$pass_val" --argjson pu "$pred_unv" \
      --arg out "$excerpt" --arg ev "$evidence" --arg rs "$reason" --arg ts "$(now_ts)" \
      '{ac_id:$ac,kind:$kind,check:$check,mode:$mode,exit_code:$ec,pass:$pass,predicate_unverified:$pu,reason:$rs,output_excerpt:$out,evidence:$ev,timestamp:$ts}')")
  done

  local arr arrfile; arr="$(printf '%s\n' "${results[@]:-}" | jq -s '.')"
  # ARG_MAX guard: --argjson passes $arr as a command-line arg, which blows the
  # kernel limit (~128KB) on a large manifest (103 ACs x ~20-line excerpts).
  # Write $arr to a temp file and read it via --slurpfile instead ($results is
  # then [[<array>]], so unwrap with $results[0]).
  arrfile="$(mktemp)"; printf '%s\n' "$arr" > "$arrfile"
  local doc
  doc="$(jq -n --arg slug "$SLUG" --arg vf "$VERIFY" --arg sha "$SHA" --arg ts "$(now_ts)" \
    --slurpfile results "$arrfile" \
    '{slug:$slug,verify_file:$vf,verify_sha256:$sha,timestamp:$ts,results:($results[0])} | . + {summary: (
        .results as $r |
        {total: ($r|length),
         executed: ([$r[]|select(.mode=="executed")]|length),
         needs_agent: ([$r[]|select(.mode=="needs_agent")]|length),
         blocked: ([$r[]|select(.mode=="blocked")]|length),
         error: ([$r[]|select(.mode=="error")]|length),
         tool_missing: ([$r[]|select((.reason // "")|startswith("tool_missing"))]|length),
         green: ([$r[]|select(.pass==true)]|length),
         red: ([$r[]|select(.pass==false)]|length),
         unresolved: ([$r[]|select(.pass==null)]|length),
         zero_ran: ([$r[]|select((.reason // "")|startswith("zero_tests_ran"))]|length)}
        | . + {all_green: (.red==0 and .unresolved==0 and .total>0)}
      )}')"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$OUT"
  echo "$doc" | jq -c '.summary + {out: "'"$OUT"'"}'

  if [ "$(echo "$doc" | jq -r '.summary.all_green')" = "true" ]; then exit 0; fi
  exit 1
}

# ---------------- resolve ----------------
cmd_resolve() {
  local RESULTS="" AC="" PASS="" EVF=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --results)       RESULTS="${2:-}"; shift 2 ;;
      --ac)            AC="${2:-}"; shift 2 ;;
      --pass)          PASS="${2:-}"; shift 2 ;;
      --evidence-file) EVF="${2:-}"; shift 2 ;;
      *) die2 "unknown resolve arg: $1" ;;
    esac
  done
  [ -f "$RESULTS" ] || die2 "results file not found: $RESULTS"
  [ -n "$AC" ] || die2 "resolve requires --ac"
  [ "$PASS" = "true" ] || [ "$PASS" = "false" ] || die2 "resolve --pass must be true|false"
  [ -f "$EVF" ] || die2 "evidence file not found: $EVF"
  need jq

  local ev nlines
  ev="$(cat "$EVF")"
  nlines="$(printf '%s\n' "$ev" | grep -cE '.')"
  [ "$nlines" -ge 3 ] || die2 "evidence too thin (<3 non-empty lines) — capture the real output excerpt"

  jq -e --arg ac "$AC" 'any(.results[]; .ac_id==$ac)' "$RESULTS" >/dev/null \
    || die2 "AC $AC not present in results"

  local doc
  doc="$(jq --arg ac "$AC" --argjson pass "$PASS" --arg ev "$ev" --arg ts "$(now_ts)" '
    .results |= map(if .ac_id==$ac then
        .pass=$pass | .predicate_unverified=false | .mode="resolved" | .evidence=$ev | .timestamp=$ts
      else . end)
    | .summary = ( .results as $r |
        {total: ($r|length),
         executed: ([$r[]|select(.mode=="executed")]|length),
         needs_agent: ([$r[]|select(.mode=="needs_agent")]|length),
         blocked: ([$r[]|select(.mode=="blocked")]|length),
         error: ([$r[]|select(.mode=="error")]|length),
         tool_missing: ([$r[]|select((.reason // "")|startswith("tool_missing"))]|length),
         green: ([$r[]|select(.pass==true)]|length),
         red: ([$r[]|select(.pass==false)]|length),
         unresolved: ([$r[]|select(.pass==null)]|length),
         zero_ran: ([$r[]|select((.reason // "")|startswith("zero_tests_ran"))]|length)}
        | . + {all_green: (.red==0 and .unresolved==0 and .total>0)} )
  ' "$RESULTS")"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$RESULTS"
  echo "$doc" | jq -c '.summary'
  exit 0
}

# ---------------- backfill-evidence ----------------
# Writes each GREEN row's real output back into the manifest's `evidence` field,
# replacing the `PENDING: <reason>` placeholder a plan-stage bless allows.
#
# S007: Bar A requires runtime evidence per AC, but the manifest is authored
# during planning, before the code it checks exists — so the placeholder is the
# only honest plan-stage value, and something has to collect on it later. The
# exit-gate run already executed every check, so its recorded output IS the
# evidence; asking a human to paste one excerpt per AC across a 147-AC manifest
# is how a gate stops being run at all.
#
# Only green rows are backfilled. A red row's output is evidence that the check
# FAILED; pasting it in would let `check-verifiable-static.sh --stage exit` pass
# on a manifest whose checks do not pass.
cmd_backfill() {
  local RESULTS="" VERIFY=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --results) RESULTS="${2:-}"; shift 2 ;;
      --verify)  VERIFY="${2:-}"; shift 2 ;;
      *) die2 "unknown backfill-evidence arg: $1" ;;
    esac
  done
  [ -f "$RESULTS" ] || die2 "results file not found: $RESULTS"
  [ -n "$VERIFY" ] || die2 "backfill-evidence requires --verify"
  [ -f "$VERIFY" ] || die2 "verify file not found: $VERIFY"
  need jq

  local manifest
  manifest="$(extract_manifest "$VERIFY")"
  case "$manifest" in *[![:space:]]*) ;; *) die2 "no fenced json manifest block in $VERIFY" ;; esac
  echo "$manifest" | jq -e . >/dev/null 2>&1 || die2 "manifest json does not parse"

  # The manifest goes to jq through a FILE, not --argjson. A manifest with ~140
  # ACs is well over 100KB, and --argjson puts every byte of it on the argv of
  # the jq process: combined with the results file it blows past ARG_MAX and jq
  # dies "Argument list too long" before reading anything.
  local mtmp; mtmp="$(mktemp)"
  printf '%s' "$manifest" > "$mtmp"
  local updated
  updated="$(jq -n --slurpfile m "$mtmp" --slurpfile r "$RESULTS" '
    ( [ $r[0].results[]
        | select(.pass == true)
        | { key: .ac_id,
            value: ( if (.evidence // "") != "" then .evidence else (.output_excerpt // "") end ) }
        | select(.value != "") ] | from_entries ) as $ev
    | $m[0] | .acs |= map( if $ev[.id] then .evidence = $ev[.id] else . end )
  ')" || { rm -f "$mtmp"; die2 "could not merge evidence into the manifest"; }
  rm -f "$mtmp"

  # Splice the new manifest into the LAST fenced json block, byte-preserving
  # everything else in the file (the AC table and gate report live above it).
  local tmp; tmp="$(mktemp)"
  printf '%s' "$updated" > "$tmp.json"
  awk -v jf="$tmp.json" '
    /^```json/ { n++ }
    { line[NR] = $0; if (/^```json/) start[n] = NR }
    /^```$/    { if (n > 0 && start[n] && !stop[n]) stop[n] = NR }
    END {
      s = start[n]; e = stop[n];
      for (i = 1; i <= NR; i++) {
        if (i == s) { print line[i]; while ((getline l < jf) > 0) print l; }
        else if (i > s && i < e) { continue }
        else print line[i]
      }
    }
  ' "$VERIFY" > "$tmp" && mv "$tmp" "$VERIFY"
  rm -f "$tmp.json"

  local n
  n="$(jq -r '[.results[] | select(.pass == true)] | length' "$RESULTS")"
  echo "{\"backfilled\":$n,\"verify\":\"$VERIFY\"}"
  echo "note: the sha256 sidecar is now stale — re-bless with bars/bless-verify.sh --stage exit" >&2
  exit 0
}

# ---------------- summary ----------------
cmd_summary() {
  local RESULTS=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --results) RESULTS="${2:-}"; shift 2 ;;
      *) die2 "unknown summary arg: $1" ;;
    esac
  done
  [ -f "$RESULTS" ] || die2 "results file not found: $RESULTS"
  need jq
  echo "$(jq -c '.summary' "$RESULTS")"
  [ "$(jq -r '.summary.all_green' "$RESULTS")" = "true" ] && exit 0
  exit 1
}

SUB="${1:-}"; shift || true
case "$SUB" in
  run)                cmd_run "$@" ;;
  resolve)            cmd_resolve "$@" ;;
  summary)            cmd_summary "$@" ;;
  backfill-evidence)  cmd_backfill "$@" ;;
  *) echo "usage: verify-run.sh {run|resolve|summary|backfill-evidence} ..." >&2; exit 2 ;;
esac
