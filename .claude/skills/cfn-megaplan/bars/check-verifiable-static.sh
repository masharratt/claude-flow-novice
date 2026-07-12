#!/usr/bin/env bash
# Bar A static checker — mechanizes the verifiable-done gate (bars/verifiable-done.md).
# Runs BEFORE the LLM gate report; a FAIL here means the VERIFY manifest is not
# machine-decidable and cfn-loop-task could not mechanically decide "done".
#
# Usage:   check-verifiable-static.sh <planning/VERIFY_<slug>.md>
# Output:  JSON findings array on stdout:
#            [{"file":"...","ac_id":"...","field":"...","issue":"...","severity":"error|warn"}]
#          Empty array [] when clean.
# Exit:    0 = clean OR warnings only
#          1 = one or more error-severity findings
#          2 = usage / file-not-found / jq-missing / no json manifest block
# Deps:    jq
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHRASE_FILE="$SCRIPT_DIR/weasel-phrases.txt"

VERIFY="${1:-}"
if [ -z "$VERIFY" ]; then
  echo 'usage: check-verifiable-static.sh <planning/VERIFY_<slug>.md>' >&2
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
  for f in id check kind pass maps_to; do
    if [ "$(echo "$AC" | jq --arg k "$f" 'has($k)')" != "true" ]; then
      add_finding "$ACID" "$f" "AC missing required field" "error"
    fi
  done

  KIND=$(echo "$AC" | jq -r '.kind // ""' | tr '[:upper:]' '[:lower:]')
  CHECK=$(echo "$AC" | jq -r '.check // ""')
  PASS=$(echo "$AC" | jq -r '.pass // ""')

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
      *)                                                 add_finding "$ACID" "kind" "unrecognized check kind '$KIND' (cannot verify taxonomy)" "warn" ;;
    esac
    if [ "$tax_ok" -eq 0 ]; then
      add_finding "$ACID" "check" "check form does not match taxonomy for kind '$KIND'" "error"
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

# out_of_band_core_fr subset of core_fr_runtime_observed -> WARN (runtime_signal_missing)
if cov_has out_of_band_core_fr; then
  ODIFF=$(echo "$COV" | jq -c '(.out_of_band_core_fr // []) - (.core_fr_runtime_observed // [])')
  if [ "$ODIFF" != "[]" ]; then
    add_finding "coverage" "core_fr_runtime_observed" "out-of-band core FR(s) $ODIFF have no runtime-observed signal (runtime_signal_missing)" "warn"
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
