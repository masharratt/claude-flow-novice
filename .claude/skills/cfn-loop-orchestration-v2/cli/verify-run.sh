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
#       1 = one or more red or unresolved ACs
#       2 = usage / parse / file error / evidence refusal
#       4 = VERIFY manifest sha256 mismatch (edited after Bar A blessed it)
#
# Deps: jq, timeout(1); psql only when CFN_VERIFY_DATABASE_URL is set.
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
  local first="${check%% *}"
  case "$first" in
    vitest|jest|mocha|ava|cargo|pytest|go|npx|npm|pnpm|yarn|playwright|node|bash|tsc|curl|grep|rg|jq) echo executable ;;
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

# exit-code-authoritative? runner kinds prove pass by exit code; predicate kinds
# (curl/grep/rg/jq/db-query) do so ONLY if the check self-asserts.
is_authoritative() {
  local check="$1"
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
  [ -n "${MANIFEST//[[:space:]]/}" ] || die2 "no fenced json manifest block in $VERIFY"
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
    local ac_cwd run_cwd exec_check req_env
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

    case "$class" in
      executable)
        local raw rc
        local -a envargs=()
        if [ -n "$req_env" ]; then
          while IFS= read -r envline; do
            [ -n "$envline" ] && envargs+=("$envline")
          done <<< "$req_env"
        fi
        raw="$(cd "$run_cwd" && timeout "$TIMEOUT" env ${envargs[@]+"${envargs[@]}"} bash -c "$exec_check" 2>&1)"; rc=$?
        exit_code="$rc"
        excerpt="$(printf '%s\n' "$raw" | tail -20)"
        mode="executed"
        if is_authoritative "$exec_check"; then
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
              if [ "$PTS_PASS" -eq 0 ]; then
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
  [ -n "${manifest//[[:space:]]/}" ] || die2 "no fenced json manifest block in $VERIFY"
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
