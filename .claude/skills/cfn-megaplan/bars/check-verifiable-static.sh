#!/usr/bin/env bash
# Bar A static checker — mechanizes the verifiable-done gate (bars/verifiable-done.md).
# Runs BEFORE the LLM gate report; a FAIL here means the VERIFY manifest is not
# machine-decidable and cfn-loop-task could not mechanically decide "done".
#
# Usage:   check-verifiable-static.sh <planning/VERIFY_<slug>.md> [--stage plan|exit]
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
  echo 'usage: check-verifiable-static.sh <planning/VERIFY_<slug>.md> [--stage plan|exit]' >&2
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
      *db*)                                              echo "$CHECK" | grep -qiE '^db-query' || tax_ok=0 ;;
      *curl*|http)                                       echo "$CHECK" | grep -qiE '^curl' || tax_ok=0 ;;
      *build*|*type*|*compile*)                          echo "$CHECK" | grep -qiE '(tsc|cargo check|go build|compile)' || tax_ok=0 ;;
      *static*|*lint*)                                   echo "$CHECK" | grep -qiE '(grep|rg |ast|no occurrences|no free-text|snapshot)' || tax_ok=0 ;;
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
if cov_has migration_rehearsal; then
  MR=$(cov_num migration_rehearsal)
  if ! echo "$MR" | grep -qE '^(AC-[A-Za-z0-9]+|warn:.+|n/a:.+)$'; then
    add_finding "coverage" "migration_rehearsal" "value '$MR' not one of AC-<id> | warn:<reason> | n/a:<reason>" "error"
  fi
fi

# viewport_missing flag -> WARN (enterprise promotion is the caller's job)
if [ "$(echo "$COV" | jq -r 'if has("viewport_missing") then .viewport_missing else false end')" = "true" ]; then
  add_finding "coverage" "viewport_missing" "user-flow e2e AC(s) missing --project=<viewport> (viewport_missing)" "warn"
fi

emit_and_exit
