#!/usr/bin/env bash
# Bar A static checker — mechanizes the verifiable-done gate (bars/verifiable-done.md).
# Runs BEFORE the LLM gate report; a FAIL here means the VERIFY manifest is not
# machine-decidable and cfn-loop-task could not mechanically decide "done".
#
# Usage:   check-verifiable-static.sh <planning/<slug>/VERIFY_<slug>.md> [--stage plan|exit]
#          --stage plan (default) — the manifest is being blessed at planning
#            time, before the code exists. `evidence: "PENDING: <reason>"` is
#            accepted (warn), because a check for unwritten code cannot have run.
#          --stage exit — the manifest is being re-blessed at the completion
#            gate. Every check has had code to run against, so a surviving
#            PENDING marker is an error.
# Output:  JSON findings array on stdout:
#            [{"file":"...","ac_id":"...","field":"...","issue":"...","severity":"error|warn"}]
#          Empty array [] when clean.
# Exit:    0 = clean OR warnings only
#          1 = one or more error-severity findings
#          2 = usage / bad --stage / file-not-found / jq-missing / no json manifest block
# Deps:    jq
#
# Additional checks (beyond core validation):
#   - absence-assertion pairing: negative checks (grep -c ... -eq 0, ! grep, etc.)
#     must be paired with a population assertion (test -s <file>, ls | grep, etc.)
#   - stale-literal count warning: bare counts (2..999) followed by plural nouns
#     (tables, columns, endpoints, etc.) are warned - enumerate sets instead
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHRASE_FILE="$SCRIPT_DIR/weasel-phrases.txt"

# Shared runner-summary parser, used to validate that an AC's pasted `evidence`
# actually shows tests running. Sourced from the orchestration skill because it
# is already the single source of this logic for gate-check.sh and
# verify-run.sh; a third copy here would drift from those two. Degrades to a
# warn-level finding (see EVIDENCE_PARSER_OK) when the file is not reachable,
# so this checker never hard-fails on a missing sibling skill.
EVIDENCE_PARSER_OK=0
PARSER_LIB="$SCRIPT_DIR/../../cfn-loop-orchestration-v2/cli/lib/parse-test-summary.sh"
if [ -f "$PARSER_LIB" ]; then
  # shellcheck source=../../cfn-loop-orchestration-v2/cli/lib/parse-test-summary.sh
  source "$PARSER_LIB" && EVIDENCE_PARSER_OK=1
fi

# Controlled `kind` vocabulary. Closed set, exact match, lowercased.
#
# S007 (origin: MANIFEST_HANDOFF_conversational_interview_engine.md pattern 5):
# an unrecognized kind used to fall through to a WARN. That made the taxonomy
# check -- the lint whose whole job is catching a `check` body that contradicts
# its `kind` -- unreachable for any kind outside the case patterns. The real
# manifest that motivated this declared `kind: cargo-test` with a grep body and
# sailed through, because a kind that matches no case matches no rule either.
VALID_KINDS="unit integration e2e ui e2e/ui assembled-path wiring-guard db db-query http curl build type compile static lint migration-rehearsal perf a11y security"

# NEGATIVE and POPULATION assertion patterns (absence-assertion pairing, field report 2026-08-19)
# A check whose pass condition is "grep found nothing" passes on a scan that looked at nothing.
# Rule: every negative check must pair with a presence assertion on the population scanned.
# SQL-shaped absence idioms are added because they are the dominant form in this
# program and none of the shell-shaped patterns above reach them: a check reading
# `SELECT count(*) FROM violations` piped to `grep -q "^0$"`, or a boolean
# `SELECT NOT EXISTS (...)`, is an absence assertion in exactly the sense this gate
# exists to catch, and was passing through unflagged.
NEGATIVE_PATTERNS="!(grep)|grep -c.*-eq 0|grep -c.*== 0|-eq 0 |== 0 |wc -l.*(-eq|==) 0|-z [$][(]|test ! -e|\[ ! -[efsd] |! test|grep -L|not (exist|found|present|match)|returns? (0 rows|nothing|empty)|grep -q[a-z]* .?\^?0[$]|count\([^)]*\) *= *0|= *0;|NOT EXISTS|IS NULL *\)? *AS|no rows"
# Byte/size/non-empty idioms added 2026-08-19: an absence check often proves its
# population by emitting a size (wc -c, sha256sum, a dump byte count) and comparing
# it above zero in the pass condition. Those are presence assertions and were being
# read as absent.
# Equality-to-a-nonzero idiom added 2026-08-19, third widening of this gate. Two more
# presence halves were being read as absent: a shell guard spelled `[ "$t" -eq 41 ]`, and a
# command that prints `present=1 tables=41 violations=0` with the pass condition demanding
# exact equality. Both are strictly stronger presence assertions than `-gt 0`, because they
# pin the population to an exact expected size instead of merely non-empty. The nonzero
# restriction is the whole point: `-eq 0` and `violations=0` are ABSENCE halves and must not
# match here, or the gate would accept an absence check as its own presence pairing.
POPULATION_PATTERNS="-gt 0|-ge 1|> 0|>= 1|scanned|population|count(ed)?.*(-gt|-ge|>)|test -s|\[ -s |\[ -e |\[ -f |\[ -d |test -[efd] |wc -l.*(-gt|-ge) |ls .*grep -q|jq -e|expect(ed)? (files|rows|tables|count)|wc -c|sha256sum|non-?empty|(size|bytes?|rows?|files?|lines?|tables?|entries|digests?) +(of [^ ]+ +)?[><]=? *[0-9][0-9,]*|-eq +[1-9][0-9,]*|(present|found|scanned|applied|tables?|rows?|files?|lines?|entries|count)=[1-9][0-9,]*"
# Kinds whose check must drive a test runner, so whose evidence must show a
# runner summary with a non-zero collected count.
RUNNER_KINDS="unit integration e2e ui e2e/ui assembled-path"

in_list() { # needle haystack
  case " $2 " in *" $1 "*) return 0 ;; esac
  return 1
}

VERIFY="${1:-}"
STAGE="plan"
if [ $# -gt 0 ]; then shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="${2:-}"; shift 2 || true ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
case "$STAGE" in
  plan|exit) : ;;
  *) echo "error: --stage must be 'plan' or 'exit' (got '$STAGE')" >&2; exit 2 ;;
esac

if [ -z "$VERIFY" ]; then
  echo 'usage: check-verifiable-static.sh <planning/<slug>/VERIFY_<slug>.md> [--stage plan|exit]' >&2
  exit 2
fi
if [ ! -f "$VERIFY" ]; then
  echo "error: file not found: $VERIFY" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo 'error: jq is required but not found on PATH' >&2
  exit 2
fi

# ---- weasel patterns (shared source, inline fallback) ----
WEASEL=()
if [ -f "$PHRASE_FILE" ]; then
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue ;; esac
    WEASEL+=("$pat")
  done < "$PHRASE_FILE"
fi
if [ "${#WEASEL[@]}" -eq 0 ]; then
  WEASEL=('appropriately' 'as needed' 'as appropriate' 'handle accordingly' \
          'figure out' 'etc\.' 'and so on' 'TBD' 'properly' 'gracefully' 'where applicable')
fi

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

FILE_JSON=$(json_escape "$VERIFY")
findings=()
add_finding() { # ac_id field issue severity
  findings+=("{\"file\":\"${FILE_JSON}\",\"ac_id\":\"$(json_escape "$1")\",\"field\":\"$(json_escape "$2")\",\"issue\":\"$(json_escape "$3")\",\"severity\":\"$4\"}")
}

emit_and_exit() {
  if [ "${#findings[@]}" -eq 0 ]; then
    echo '[]'
    exit 0
  fi
  printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
  # error-severity present -> exit 1, warnings only -> exit 0
  for f in "${findings[@]}"; do
    case "$f" in *'"severity":"error"'*) exit 1 ;; esac
  done
  exit 0
}

# ---- extract LAST fenced ```json block ----
MANIFEST=$(awk '
  /^```json/     { inblock=1; buf=""; next }
  inblock && /^```/ { inblock=0; last=buf; next }
  inblock        { buf = buf $0 "\n" }
  END            { printf "%s", last }
' "$VERIFY")

if [ -z "${MANIFEST//[[:space:]]/}" ]; then
  echo '[{"file":"'"$FILE_JSON"'","ac_id":"(file)","field":"manifest","issue":"no fenced json manifest block found","severity":"error"}]'
  exit 1
fi

if ! echo "$MANIFEST" | jq -e . >/dev/null 2>&1; then
  echo '[{"file":"'"$FILE_JSON"'","ac_id":"(file)","field":"manifest","issue":"json manifest does not parse","severity":"error"}]'
  exit 1
fi

# ---- Check 1: required top-level keys ----
for key in slug acs done_rule coverage; do
  if [ "$(echo "$MANIFEST" | jq --arg k "$key" 'has($k)')" != "true" ]; then
    add_finding "(manifest)" "$key" "required top-level key missing" "error"
  fi
done

# ---- Check 1b: required coverage keys (wiring counters — MANDATORY, not presence-keyed).
# An opt-in wiring gate is dodgeable by omission, which is the same failure class it exists to
# prevent (S004 / MP-A rootcause: a manifest that stayed silent on wiring got no wiring gate at
# all). See bars/verifiable-done.md for the full rationale.
for key in wiring_total wiring_mapped; do
  if [ "$(echo "$MANIFEST" | jq --arg k "$key" 'if has("coverage") then (.coverage | has($k)) else false end')" != "true" ]; then
    add_finding "(manifest)" "$key" "required coverage key missing" "error"
  fi
done

# ---- Per-AC checks (1 shape, 2 taxonomy, 3 decidability, 4 weasel) ----
AC_COUNT=$(echo "$MANIFEST" | jq '.acs | length' 2>/dev/null || echo 0)
i=0
while [ "$i" -lt "$AC_COUNT" ]; do
  AC=$(echo "$MANIFEST" | jq -c ".acs[$i]")
  ACID=$(echo "$AC" | jq -r '.id // "AC-?"')

  # 1: shape
  for f in id check kind pass maps_to evidence; do
    if [ "$(echo "$AC" | jq --arg k "$f" 'has($k)')" != "true" ]; then
      add_finding "$ACID" "$f" "AC missing required field" "error"
    fi
  done

  KIND=$(echo "$AC" | jq -r '.kind // ""' | tr '[:upper:]' '[:lower:]')
  CHECK=$(echo "$AC" | jq -r '.check // ""')
  PASS=$(echo "$AC" | jq -r '.pass // ""')
  EVIDENCE=$(echo "$AC" | jq -r '.evidence // ""')

  # 1c: controlled kind vocabulary (S007). Exact membership, error not warn.
  if [ -n "$KIND" ] && ! in_list "$KIND" "$VALID_KINDS"; then
    add_finding "$ACID" "kind" "unrecognized check kind '$KIND' — must be one of: $VALID_KINDS" "error"
  fi

  # 1d: run-before-bless evidence (S007). The `check` must have been EXECUTED
  # once and its actual output pasted here before the manifest is hashed.
  # Authoring happens against the plan and verification happens against the
  # code; nothing else in the loop forces those two to be the same statement,
  # which is how 21/147 and 71/104 ACs went runtime-red against correct code.
  if [ -z "${EVIDENCE//[[:space:]]/}" ]; then
    add_finding "$ACID" "evidence" "no runtime evidence — run this check once and paste its actual output (test result line, grep hit count, or exit status) before blessing the manifest" "error"
  elif [[ "$EVIDENCE" =~ ^[[:space:]]*PENDING([[:space:]]*:|[[:space:]]|$) ]]; then
    # A greenfield manifest is authored before the code exists, so its checks
    # cannot have been run. `PENDING: <reason>` keeps the field honest instead
    # of inviting a fabricated paste, and the exit-stage bless turns every
    # surviving marker into a hard failure.
    if [ "$STAGE" = "exit" ]; then
      add_finding "$ACID" "evidence" "evidence_pending: still 'PENDING' at the exit bless — the code exists now, so run this check and paste its real output" "error"
    else
      add_finding "$ACID" "evidence" "evidence_pending: placeholder accepted at the plan-stage bless; the exit-stage bless will reject it" "warn"
    fi
  elif [ "$EVIDENCE_PARSER_OK" -eq 1 ] && in_list "$KIND" "$RUNNER_KINDS"; then
    # A runner-kind AC's evidence must show tests actually running. Without
    # this, the bar just moves the rubber stamp one field to the left: cargo
    # exits 0 whether the filter matched 645 tests or 0, so an author doing a
    # manual preflight sees exit 0 and blesses a check that proves nothing.
    EV_TMP=$(mktemp)
    printf '%s\n' "$EVIDENCE" > "$EV_TMP"
    if parse_test_summary "$EV_TMP"; then
      if [ "$PTS_COLLECTED" -eq 0 ]; then
        add_finding "$ACID" "evidence" "evidence_zero_ran: pasted evidence shows 0 tests collected (runner=$PTS_RUNNER, filtered_out=$PTS_FILTERED) — the check's selector or flag matched no test, so this evidence proves nothing" "error"
      fi
    else
      add_finding "$ACID" "evidence" "evidence for a runner kind does not contain a recognizable test-runner summary line — paste the runner's own 'test result' / 'Tests N passed' output, not a description of it" "warn"
    fi
    rm -f "$EV_TMP"
  elif [ "$EVIDENCE_PARSER_OK" -eq 0 ] && in_list "$KIND" "$RUNNER_KINDS"; then
    add_finding "$ACID" "evidence" "evidence not machine-checked: parse-test-summary.sh not found at $PARSER_LIB" "warn"
  fi

  # 1e: unrunnable selector shorthand (S007). `<file>::<name>` is a
  # manifest-internal convention no runner implements: vitest and playwright
  # both read it as a single filename and report "No test files found" (exit
  # non-zero, zero tests run). 89 of one field manifest's 104 checks used it.
  if echo "$CHECK" | grep -qE '[A-Za-z0-9_/.-]+\.(spec|test)\.[a-z]+::|\.rs::|\.py::[a-z_]+ '; then
    add_finding "$ACID" "check" "unrunnable_selector: '<file>::<name>' is not a selector any runner accepts — use -t \"<name>\" (vitest/jest), -g \"<name>\" (playwright), or 'cargo test <path> -- --exact'" "error"
  fi

  # 1e2: dead test-name selector (S008). A `-t "<name>"` (vitest/jest) or
  # `-g "<name>"` (playwright) whose named test file exists but holds no such
  # title selects zero tests. verify-run.sh classifies that as `zero_tests_ran`
  # and forces red, so it is not a false green, but the row is then red for a
  # reason that has nothing to do with the feature and the real verdict is never
  # reached. This class has bitten twice: first as a leading `^` anchoring to the
  # describe title instead of the it title, then as an `FR-N:` tag convention the
  # manifest assumed and the tests never adopted (80 of 146 selectors dead in one
  # manifest, across five waves reported green). An alternation counts as live if
  # any one branch matches, which is how the runner reads it.
  SEL=$(printf '%s' "$CHECK" | grep -oE '(^| )-[tg] "[^"]+"' | head -1 | sed -E 's/^ ?-[tg] "//; s/"$//' || true)
  if [ -n "$SEL" ]; then
    SELFILE=$(printf '%s' "$CHECK" | grep -oE '(vitest|jest|playwright)[a-z ]* run [^ ]+' | head -1 | awk '{print $NF}' || true)
    if [ -z "$SELFILE" ]; then
      SELFILE=$(printf '%s' "$CHECK" | grep -oE '[A-Za-z0-9_/.-]+\.(spec|test)\.[a-z]+' | head -1 || true)
    fi
    if [ -n "$SELFILE" ] && [ -f "$SELFILE" ]; then
      SELHIT=0
      OLDIFS="$IFS"; IFS='|'
      for branch in $SEL; do
        BR=$(printf '%s' "$branch" | sed -E 's/^\^//; s/\$$//')
        [ -n "$BR" ] || continue
        if grep -qF -- "$BR" "$SELFILE"; then SELHIT=1; break; fi
      done
      IFS="$OLDIFS"
      if [ "$SELHIT" -eq 0 ]; then
        add_finding "$ACID" "check" "dead_selector: the check filters tests by name with '$SEL' but $SELFILE holds no test title matching it, so this check collects 0 tests and can never report on the feature. Drop the -t/-g filter to run the whole file, or align the selector with a real test title." "error"
      fi
    elif [ -n "$SELFILE" ]; then
      if [ "$STAGE" = "exit" ]; then
        add_finding "$ACID" "check" "dead_selector: the check filters by name with '$SEL' but its test file $SELFILE does not exist at the exit bless, so the selector collects 0 tests" "error"
      else
        add_finding "$ACID" "check" "dead_selector: test file $SELFILE for selector '$SEL' does not exist yet (plan stage accepted; the exit bless requires it and validates the selector against its titles)" "warn"
      fi
    fi
  fi

  # 1e3: check invokes a command that is not an executable on PATH (S009).
  # `verify-run.sh` runs every check with `bash -c`, and a non-interactive bash
  # inherits neither shell functions nor aliases. So a check whose command is
  # provided by a function looks fine in an interactive shell and dies with
  # "command not found" under the runner. That is red for a reason that has
  # nothing to do with the feature, the same failure shape as dead_selector.
  # Found live: `rg` on a machine with no ripgrep binary, where Claude Code
  # defines rg() as a wrapper around its own bundled copy. 113 uses across 49
  # of 241 checks looked healthy and could not run.
  # `command -v` is the WRONG test here: it prints the bare name for a function
  # or a builtin and so reports success for exactly the case that breaks. Only
  # an absolute path means an executable a child bash can find, which is what
  # the leading-slash test below asserts.
  CHK_CMDS=$(printf '%s' "$CHECK" \
    | sed -E 's/^[a-z]+: //' \
    | sed -E 's/\$\(/\n/g; s/`/\n/g; s/&&/\n/g; s/\|\|/\n/g; s/\|/\n/g; s/;/\n/g' \
    | sed -E 's/^[[:space:]]*(!|then|else|do)[[:space:]]+//' \
    | awk '{print $1}' \
    | grep -E '^[a-z][a-z0-9_.-]+$' \
    | sort -u || true)
  for cmd in $CHK_CMDS; do
    case "$cmd" in
      test|echo|printf|cd|export|set|unset|exit|return|if|then|else|elif|fi|\
      for|while|do|done|case|esac|local|read|eval|exec|true|false|source|\
      shift|trap|wait|command|type|hash|umask|alias|time|timeout|env|\
      shopt|let|declare|typeset|function|getopts|pushd|popd|jobs|kill) continue ;;
      # Not commands at all: these reach the command position only as branches
      # of a quoted regex alternation inside a check, e.g. the
      # `(const|let|var|function|class)` declaration pattern of a single-copy
      # constants guard, which the `|` split above cannot tell from a pipe.
      var|const|class|def|fn|impl|struct|enum|interface) continue ;;
    esac
    RESOLVED=$(command -v "$cmd" 2>/dev/null || true)
    case "$RESOLVED" in
      /*) continue ;;
    esac
    if [ "$STAGE" = "exit" ]; then
      add_finding "$ACID" "check" "tool_unavailable: the check invokes '$cmd', which resolves to no executable on PATH (it is a shell function, an alias, or absent). verify-run.sh executes checks with 'bash -c', which inherits neither, so this check cannot run and reports red regardless of the feature. Install the real binary, or export the function with 'export -f $cmd' before the run, or rewrite the check against a tool that ships as an executable." "error"
    else
      add_finding "$ACID" "check" "tool_unavailable: the check invokes '$cmd', which resolves to no executable on PATH on this machine (shell function, alias, or absent). Under 'bash -c' it is command-not-found. Provision the binary before the exit bless, or export the function into the runner's environment." "warn"
    fi
  done

  # 1f: requires{} precondition shape (S007). verify-run.sh reports an unmet
  # precondition as `blocked` rather than red; a malformed one would silently
  # never be enforced.
  if [ "$(echo "$AC" | jq 'has("requires")')" = "true" ]; then
    REQ=$(echo "$AC" | jq -c '.requires')
    ENV_N=$(echo "$REQ" | jq '(.env // []) | length')
    ei=0
    while [ "$ei" -lt "$ENV_N" ]; do
      ENTRY=$(echo "$REQ" | jq -r ".env[$ei]")
      if ! echo "$ENTRY" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*(=.*)?$'; then
        add_finding "$ACID" "requires.env" "malformed env precondition '$ENTRY' — must be NAME (asserted present) or NAME=value (exported into the check)" "error"
      fi
      ei=$((ei + 1))
    done
    if [ "$(echo "$REQ" | jq 'has("http")')" = "true" ]; then
      REQ_HTTP=$(echo "$REQ" | jq -r '.http')
      echo "$REQ_HTTP" | grep -qE '^https?://' \
        || add_finding "$ACID" "requires.http" "http precondition '$REQ_HTTP' is not an absolute http(s) URL" "error"
    fi
    if [ "$(echo "$REQ" | jq 'has("db")')" = "true" ] \
       && [ "$(echo "$REQ" | jq -r '.db | type')" != "boolean" ]; then
      add_finding "$ACID" "requires.db" "db precondition must be a boolean" "error"
    fi
  fi

  # 2: taxonomy — check form must match the kind family
  if [ -n "$CHECK" ] && [ -n "$KIND" ]; then
    tax_ok=1
    case "$KIND" in
      *playwright*|e2e|ui|e2e/ui)                       echo "$CHECK" | grep -qiE '^playwright:' || tax_ok=0 ;;
      # WIDENED 2026-08-19: this family only knew `db-query`, the repo skill that
      # reads DATABASE_URL from root .env unconditionally and therefore resolves to
      # the SHARED production project. A plan that correctly moves its db checks onto
      # an explicitly-named local endpoint (`psql "$CURVE26_LOCAL_DATABASE_URL"`) was
      # then reported off-taxonomy for doing the safe thing: 5 checks in
      # planning/mp0_foundations_curve2026/VERIFY_mp0_foundations_curve2026.md went red
      # for exactly that reason. Vocabulary gap in this checker, not a defect in the
      # manifest. Widening only ever ACCEPTS more, so no manifest that passes today
      # can go red because of it.
      *db*)                                              echo "$CHECK" | grep -qiE '^(db-query|psql |psql")' || tax_ok=0 ;;
      *curl*|http)                                       echo "$CHECK" | grep -qiE '^curl' || tax_ok=0 ;;
      # WIDENED 2026-07-31: the two families below only knew Rust/Go/tsc verbs,
      # so a check that ran the single most obvious tool for its own family --
      # `next build` for a build, `eslint` for a lint -- was rejected as
      # off-taxonomy. That is a vocabulary gap in this checker, not a defect in
      # the manifest: 8 checks in planning/loan_intake_rebuild/VERIFY_loan_intake_rebuild.md all ran
      # green by hand while being reported as errors here. Widening only ever
      # ACCEPTS more, so no manifest that passes today can go red because of it.
      *build*|*type*|*compile*)                          echo "$CHECK" | grep -qiE '(tsc|cargo check|go build|compile|next build|vite build|webpack|npm run|pnpm run|yarn run|sh -n|bash -n)' || tax_ok=0 ;;
      *static*|*lint*)                                   echo "$CHECK" | grep -qiE '(grep|rg |ast|no occurrences|no free-text|snapshot|eslint|shellcheck|ruff|clippy|test -[defrsxz]|(^|[;&| ])ls |node -e)' || tax_ok=0 ;;
      *wiring-guard*)                                    echo "$CHECK" | grep -qiE '(grep|rg |ast)' || tax_ok=0 ;;
      *migration-rehearsal*)                             echo "$CHECK" | grep -qiE 'migration-rehearsal' || tax_ok=0 ;;
      *unit*|*integration*|*assembled*)                  echo "$CHECK" | grep -qiE '(vitest|jest|mocha|ava|cargo|pytest|go |golang|npx|npm|pnpm|node |bash |tsc)' || tax_ok=0 ;;
      # Vocabulary membership is enforced by check 1c above (error). A kind
      # that is IN the vocabulary but has no form rule here (perf, a11y,
      # security) is intentionally unconstrained on check form.
      *)                                                 : ;;
    esac
    if [ "$tax_ok" -eq 0 ]; then
      add_finding "$ACID" "check" "check form does not match taxonomy for kind '$KIND'" "error"
    fi
  fi

  # 1g: optional `reference` key (ab-critic trigger). Orthogonal to the executable
  # check: the AC keeps its kind/check; `reference` adds a quality bar on top. When
  # present it must name ONE specific artifact (a repo-relative path, an absolute
  # path, or an http(s) URL). Globs are rejected (they let an author point at a
  # category instead of an artifact); a non-string or empty value is rejected (a
  # placeholder reference is worse than none). A local path that does not yet
  # resolve warns at the plan-stage bless (the artifact may not exist yet) and
  # errors at the exit bless: same two-stage contract as the evidence rule (1d).
  # cfn: path resolution is cwd-relative only (no repo-root normalization), relies
  # on the gate being invoked from repo root; upgrade if a manifest needs to pin
  # its own resolution base.
  if [ "$(echo "$AC" | jq 'has("reference")')" = "true" ]; then
    REF_TYPE=$(echo "$AC" | jq -r '.reference | type')
    if [ "$REF_TYPE" != "string" ]; then
      add_finding "$ACID" "reference" "reference must be a non-empty string path or URL (got $REF_TYPE)" "error"
    else
      REF=$(echo "$AC" | jq -r '.reference')
      REF_TRIM=$(echo "$REF" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      if [ -z "$REF_TRIM" ]; then
        add_finding "$ACID" "reference" "reference key present but empty, must be a non-empty path or URL, or omit the key" "error"
      elif echo "$REF_TRIM" | grep -qE '[*?{}]'; then
        add_finding "$ACID" "reference" "reference must not be a glob, name one specific artifact" "error"
      elif ! echo "$REF_TRIM" | grep -qE '^https?://'; then
        if [ ! -e "$REF_TRIM" ]; then
          if [ "$STAGE" = "exit" ]; then
            add_finding "$ACID" "reference" "reference path does not resolve at exit bless: $REF_TRIM" "error"
          else
            add_finding "$ACID" "reference" "reference path does not resolve yet (plan stage accepted, exit bless will require it): $REF_TRIM" "warn"
          fi
        fi
      fi
    fi
  fi

  # 2b: flag-tautology WARN for wiring-guard ACs (S004 / MP-A rootcause, verifiable-done.md rule 4e).
  # cfn: token grep only, no flag-default analysis (a wiring AC IS a tautology only when the
  # referenced flag ALSO defaults the feature off, which this script cannot determine) — WARN,
  # never hard-fail; the step-6a gate report resolves the real verdict. Upgrade trigger: if this
  # WARN's false-positive rate makes reviewers start ignoring it, add a config/env-default reader.
  if echo "$KIND" | grep -qiE 'wiring-guard'; then
    TRIGGER=$(echo "$AC" | jq -r '.trigger // ""')
    FLAG_BLOB="$CHECK $PASS $TRIGGER"
    if echo "$FLAG_BLOB" | grep -qiE '(_enabled\b|_flag\b|feature[_-]?flag|process\.env\.|getenv\(|env::var\(|os\.environ|skipif\(|runif\()'; then
      add_finding "$ACID" "check" "flag_tautology_risk: wiring-guard AC references an apparent feature/env-flag token — verify the flag does not also default the feature off (green-by-skip); not mechanically provable, resolve in the step-6a gate report" "warn"
    fi
  fi

  # 3: pass decidability
  if [ -n "$PASS" ]; then
    trimmed=$(echo "$PASS" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    if echo "$trimmed" | grep -qiE '^(does not throw|renders|exists|compiles|no error)$'; then
      add_finding "$ACID" "pass" "shallow pass condition '$trimmed' — needs a real predicate" "error"
    elif ! echo "$PASS" | grep -qE '([<>=!]=|[<>=]|'\''[^'\'']+'\''|"[^"]+"|[0-9]+[[:space:]]+rows?|exit[[:space:]]*(code[[:space:]]*)?[0-9]|status[[:space:]]+[0-9]{3}|contains|equals|==)'; then
      add_finding "$ACID" "pass" "pass condition is not decidable (no comparison / literal / row count / exit code / exact string)" "error"
    fi
    # 4: weasel
    for w in "${WEASEL[@]}"; do
      if echo "$PASS" | grep -qiE "(^|[^[:alnum:]])${w}([^[:alnum:]]|$)"; then
        add_finding "$ACID" "pass" "weasel phrase '${w//\\/}' in pass condition" "error"
      fi
    done
  fi

  # 2e: absence-assertion pairing (field report 2026-08-19)
  # A check whose pass condition is "grep found nothing" passes on a scan that looked at nothing.
  # Rule: every negative check must pair with a presence assertion on the population scanned.
  if [ -n "$CHECK" ]; then
    # Check if this is a NEGATIVE check (pass condition is "nothing found")
    is_negative=0
    if echo "$CHECK" | grep -qiE "$NEGATIVE_PATTERNS"; then
      is_negative=1
    fi
    
    if [ "$is_negative" -eq 1 ]; then
      # NEGATIVE check requires a population assertion in the same check body
      # -e is required: POPULATION_PATTERNS begins with "-gt 0|..." and without it
      # GNU grep parses the leading -g as an option, errors out, and the population
      # half of this absence-pairing gate can never succeed. The gate that exists to
      # catch vacuous absence assertions was itself dead.
      # Scan check AND pass together. The presence half is frequently expressed as the
      # pass condition over a number the check emits ("dump byte size > 10,000"), which
      # is the pairing this gate asks for. Scanning only the check body read those as
      # absence-only and produced a false positive on every correctly-paired AC.
      # Negative detection above deliberately still reads only $CHECK.
      if ! printf '%s\n%s' "$CHECK" "$PASS" | grep -qiE -e "$POPULATION_PATTERNS"; then
        add_finding "$ACID" "check" "absence-only check: pass condition is 'nothing found' with no assertion that the scanned population is non-empty; pair it with a presence check on files/rows/tables scanned (e.g. test -s <file> && ! grep ...)" "error"
      fi
    fi
  fi
  i=$((i + 1))
done

# ---- Check 5: coverage consistency ----
COV=$(echo "$MANIFEST" | jq -c '.coverage // {}')

cov_num() { echo "$COV" | jq -r --arg k "$1" 'if has($k) then .[$k] else "" end'; }
cov_has() { [ "$(echo "$COV" | jq --arg k "$1" 'has($k)')" = "true" ]; }

# paired counter equality (presence-keyed): total present => mapped present and equal
check_pair() { # total_key mapped_key label severity
  local tk="$1" mk="$2" label="$3" sev="$4" tv mv
  if cov_has "$tk"; then
    tv=$(cov_num "$tk"); mv=$(cov_num "$mk")
    if ! cov_has "$mk"; then
      add_finding "coverage" "$mk" "$label: $tk present but $mk missing" "$sev"
    elif [ "$tv" != "$mv" ]; then
      add_finding "coverage" "$mk" "$label: $mk ($mv) != $tk ($tv) — unmapped items" "$sev"
    fi
  fi
}

check_pair fr_total fr_mapped "FR coverage" error
check_pair ec_total ec_mapped "EC coverage" error
check_pair cc_total cc_mapped "concurrency (CC) coverage" error
check_pair sm_total sm_mapped "state-machine (SM) coverage" error
check_pair obs_required_total obs_required_mapped "observability (OBS) coverage" error
check_pair adv_total adv_mapped "adversarial-data (ADV) coverage" error
check_pair wiring_total wiring_mapped "wiring (composition-root) coverage" error

# wiring_total == 0 is legal ONLY with an explicit, non-empty 'no_new_components_reason'
# (zero-new-components escape hatch, same precedent as core_fr/no_core_mechanism_reason below).
# A bare wiring_total: 0 with no justification is indistinguishable from an omitted counter.
if cov_has wiring_total; then
  WT=$(cov_num wiring_total)
  if [ "$WT" = "0" ]; then
    if cov_has no_new_components_reason; then
      REASON=$(echo "$COV" | jq -r '.no_new_components_reason // ""')
      TRIMMED_REASON=$(echo "$REASON" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
      if [ -z "$TRIMMED_REASON" ]; then
        add_finding "coverage" "no_new_components_reason" "no_new_components_reason present but empty/whitespace" "error"
      fi
    else
      add_finding "coverage" "wiring_total" "wiring_total is 0 with no 'no_new_components_reason' declared" "error"
    fi
  fi
fi

# core_fr subset of core_fr_assembled_path_ok
if cov_has core_fr; then
  CORE_LEN=$(echo "$COV" | jq '.core_fr | length')
  if [ "$CORE_LEN" -eq 0 ]; then
    if ! cov_has no_core_mechanism_reason; then
      add_finding "coverage" "core_fr" "core_fr empty and no 'no_core_mechanism_reason' declared" "error"
    fi
  else
    DIFF=$(echo "$COV" | jq -c '(.core_fr // []) - (.core_fr_assembled_path_ok // [])')
    if [ "$DIFF" != "[]" ]; then
      add_finding "coverage" "core_fr_assembled_path_ok" "core FR(s) $DIFF have no clean assembled-path AC" "error"
    fi
  fi
fi

# core_fr_requires_input_correlation -> literal_stub_correlation (CQR gap #1 / rule f).
# A [core] FR whose input is externally produced / non-deterministic (LLM output,
# free-text, webhook payload) can be satisfied by a handler that returns a constant
# literal -- wired correctly, semantically empty. Decidability (rule c) cannot tell a
# real computation from a constant; "action == Deepen" is decidable and a literal
# stub satisfies it. This rule requires >=1 mapped AC to seed a concrete token into
# the upstream input (seeds: "seed:<TOKEN>") AND reference that TOKEN in its pass
# condition, so a constant-valued stub (which cannot reproduce the seeded token)
# fails the predicate. Presence-keyed: no-op when the coverage key is absent.
# Origin: /home/masha/projects/fireside-family/planning/handoff_cqr_megaplan_gaps.md gap #1.
if cov_has core_fr_requires_input_correlation; then
  MISSING=$(echo "$MANIFEST" | jq -c '
    .acs as $all |
    (.coverage.core_fr_requires_input_correlation // []) as $need |
    [ $need[] | . as $fr |
        select(
          [ $all[] | select((.maps_to // []) | index($fr)) ] as $acs |
          $acs | any(
            . as $ac |
            ([ ($ac.seeds // "") | match("seed:([A-Za-z0-9_]+)"; "g") | .captures[0].string ]) as $toks |
            ($toks | length > 0) and ($toks | any(. as $t | ($ac.pass // "") | test($t)))
          )
        )
    ] as $sat |
    ($need - $sat)')
  if [ "$MISSING" != "[]" ]; then
    add_finding "coverage" "core_fr_requires_input_correlation" "literal_stub_correlation: core FR(s) $MISSING declared as requiring input correlation, but no mapped AC seeds a concrete token (seeds: \"seed:<TOKEN>\") and references it in pass — a constant-valued handler stub (e.g. a literal TierCOutput) would satisfy the current pass condition without parsing the upstream input" "error"
  fi
fi

# out_of_band_core_fr subset of core_fr_runtime_observed -> WARN (runtime_signal_missing)
if cov_has out_of_band_core_fr; then
  ODIFF=$(echo "$COV" | jq -c '(.out_of_band_core_fr // []) - (.core_fr_runtime_observed // [])')
  if [ "$ODIFF" != "[]" ]; then
    add_finding "coverage" "core_fr_runtime_observed" "out-of-band core FR(s) $ODIFF have no runtime-observed signal (runtime_signal_missing)" "warn"
  fi
fi

# boundary_fr -> [boundary] tag integration coverage (CQR gap #2).
# An FR that reads/writes a persistence layer or external service, whose observable
# semantics depend on boundary behavior (ordering, filtering, limits), must be backed
# by >=1 kind: integration AC driving the REAL DB/HTTP path. A builder-isolation unit
# test (in-memory fixtures) does not cross the boundary and cannot catch a behavioral
# reversal at the seam (e.g. ORDER BY ASC vs latest-first). Presence-keyed: no-op
# when boundary_fr is absent (the undeclared-boundary WARN below is the nudge).
# Origin: /home/masha/projects/fireside-family/planning/handoff_cqr_megaplan_gaps.md gap #2.
if cov_has boundary_fr; then
  BLEN=$(echo "$COV" | jq '.boundary_fr | length')
  if [ "$BLEN" -eq 0 ]; then
    if ! cov_has no_boundary_fr_reason; then
      add_finding "coverage" "boundary_fr" "boundary_fr empty and no 'no_boundary_fr_reason' declared" "error"
    fi
  else
    # declarative subset (mirrors core_fr / core_fr_assembled_path_ok)
    BDIFF=$(echo "$COV" | jq -c '(.boundary_fr // []) - (.boundary_fr_integration_ok // [])')
    if [ "$BDIFF" != "[]" ]; then
      add_finding "coverage" "boundary_fr_integration_ok" "boundary FR(s) $BDIFF have no integration AC driving the real DB/HTTP path" "error"
    fi
    # per-FR scan (stronger than the declarative _ok list): catch an author who
    # marks an FR ok but maps only non-integration ACs to it. The declarative
    # core_fr_assembled_path_ok check cannot catch this lie; this scan does.
    BSCAN=$(echo "$MANIFEST" | jq -c '
      .acs as $all |
      (.coverage.boundary_fr // []) as $need |
      [ $need[] | . as $fr | select([ $all[] | select((.maps_to // []) | index($fr)) ] | any(.kind == "integration")) ] as $sat |
      ($need - $sat)')
    if [ "$BSCAN" != "[]" ]; then
      add_finding "coverage" "boundary_fr" "boundary FR(s) $BSCAN have no AC with kind: integration — a unit/builder-isolation AC does not cross the persistence/service boundary" "error"
    fi
  fi
else
  # boundary_fr not declared. Nudge if any AC check references a DB/SQL/HTTP
  # boundary -- the CQR ORDER-BY reversal shipped precisely because the boundary
  # FR was never tagged. WARN (not error): keyword match is heuristic and may fire
  # on a unit test that incidentally mentions SQL; resolve in the step-6a review.
  BOUNDISH=$(echo "$MANIFEST" | jq -r '[.acs[] | (.check // "")] | join("\n")')
  if echo "$BOUNDISH" | grep -qiE '(db-query|psql|ORDER BY|repository\.|fetch_asserted|\.sql\b|curl -|SELECT .+ FROM|INSERT INTO|UPDATE .+ SET)'; then
    add_finding "coverage" "boundary_fr" "boundary_fr_undeclared: AC checks reference a DB/SQL/HTTP boundary but no boundary_fr coverage is declared — if any FR crosses a persistence/service boundary with ordering/filter/limit semantics, tag it [boundary] and add a kind: integration AC (CQR gap #2)" "warn"
  fi
fi

# migration_rehearsal shape
# WIDENED 2026-08-19: the AC-id half was '^AC-[A-Za-z0-9]+$', which rejects any id
# carrying a second hyphen group. That is the normal shape for a category-plus-number
# id: AC-MIG-1, AC-BP-TABLET-1, AC-FR-56-TIMING. A manifest was forced to either name
# the coverage field something its own AC table does not contain, or drop the field.
# Widening only ACCEPTS more, so no manifest that passes today can go red because of it.
if cov_has migration_rehearsal; then
  MR=$(cov_num migration_rehearsal)
  if ! echo "$MR" | grep -qE '^(AC-[A-Za-z0-9]+(-[A-Za-z0-9]+)*|warn:.+|n/a:.+)$'; then
    add_finding "coverage" "migration_rehearsal" "value '$MR' not one of AC-<id> | warn:<reason> | n/a:<reason>" "error"
  fi
fi

# viewport_missing flag -> WARN (enterprise promotion is the caller's job)
if [ "$(echo "$COV" | jq -r 'if has("viewport_missing") then .viewport_missing else false end')" = "true" ]; then
  add_finding "coverage" "viewport_missing" "user-flow e2e AC(s) missing --project=<viewport> (viewport_missing)" "warn"
fi


# ---- Check 6: stale-literal count warning (field report 2026-08-19) ----
# House rule: enumerate, never count. Warn on bare counts that must match enumerations.
# Scan all string values in the manifest for bare counts 2..999 followed by plural nouns.
STALE_FINDINGS=()
STALE_COUNT=0
STALE_CAP=10

# Extract all string values from the manifest and scan for stale literals
ALL_STRINGS=$(echo "$MANIFEST" | jq -r '.. | strings' | grep -oP '(?<![A-Za-z0-9_-])([2-9]|[1-9][0-9]|[1-9][0-9]{2})[[:space:]]+(?:[A-Za-z]+[[:space:]]+){0,2}(tables|columns|policies|migrations|endpoints|routes|screens|features|steps|checks|files|tests|roles|fields|states|transitions|events|jobs|queues|flags)\b' | sort -u || true)

if [ -n "$ALL_STRINGS" ]; then
  while IFS= read -r stale_match; do
    [ -z "$stale_match" ] && continue
    if [ "$STALE_COUNT" -lt "$STALE_CAP" ]; then
      STALE_FINDINGS+=("$stale_match")
      STALE_COUNT=$((STALE_COUNT + 1))
    fi
  done <<< "$ALL_STRINGS"
  
  if [ "$STALE_COUNT" -gt 0 ]; then
    for stale in "${STALE_FINDINGS[@]}"; do
      add_finding "manifest" "stale-literal" "bare count '$stale' in manifest text: counts drift from enumerations; enumerate the set and derive both sides, compare as sets both directions (field report 2026-08-19)" "warn"
    done
    
    # Add capped message if needed
    total_matches=$(echo "$ALL_STRINGS" | wc -l)
    if [ "$total_matches" -gt "$STALE_CAP" ]; then
      add_finding "manifest" "stale-literal" "... and $((total_matches - STALE_CAP)) more stale-literal matches (capped at $STALE_CAP)" "warn"
    fi
  fi
fi
emit_and_exit
