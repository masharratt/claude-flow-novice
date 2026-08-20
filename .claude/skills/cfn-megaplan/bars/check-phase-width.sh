#!/usr/bin/env bash
# Bar checker — phase/lane width caps for cfn-loop-task lane derivation.
# Lanes are derived one-per-phase (step-number major: 2.x, 3.x, ...). A phase wider
# than one agent can execute in reasonable wall-clock serialises silently: measured
# 2026-08-19, a 48-step single-phase lane ran 2+ hours on one agent when a by-file
# split into 4 lanes was legal and worth ~3x. This gate makes plans arrive lane-sized.
#
# Checks (per step-number major, across ALL step tables in the plan):
#   - step count      <= MAX_STEPS (default 15)  -> error over
#   - distinct files  <= MAX_FILES (default 8)   -> error over
#   Suffix rows (2.7a) count into their major. Comma-separated File cells are
#   split; the union is deduped. No step rows at all = vacuous pass (exit 0).
#
# Usage:  check-phase-width.sh <planning/<slug>/PLAN_<slug>.md> [--max-steps N] [--max-files M]
# Output: JSON findings array on stdout:
#           [{"file":"...","ac_id":"phase-<major>","field":"steps|files","issue":"...","severity":"error"}]
# Exit:   0 = clean (or no step rows), 1 = error finding present, 2 = usage / file-not-found
set -euo pipefail

MAX_STEPS=15
MAX_FILES=8
PLAN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --max-steps) MAX_STEPS="${2:?}"; shift 2 ;;
    --max-files) MAX_FILES="${2:?}"; shift 2 ;;
    *) PLAN="$1"; shift ;;
  esac
done

if [ -z "$PLAN" ]; then
  echo 'usage: check-phase-width.sh <planning/<slug>/PLAN_<slug>.md> [--max-steps N] [--max-files M]' >&2
  exit 2
fi
if [ ! -f "$PLAN" ]; then
  echo "error: file not found: $PLAN" >&2
  exit 2
fi

json_escape() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}
  printf '%s' "$s"
}
FILE_JSON=$(json_escape "$PLAN")

declare -A STEP_COUNT=()   # major -> step row count
declare -A FILE_SET=()     # "major|path" -> 1
declare -A FILE_COUNT=()   # major -> distinct file count
ROWS_SEEN=0

while IFS= read -r line; do
  case "$line" in '|'*) ;; *) continue ;; esac
  # first cell = step id, second cell = File. Pipes inside later cells (verify
  # commands, backticked unions) sit past field 3 and cannot shift fields 2-3.
  step="$(printf '%s' "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$2); print $2}')"
  # step id: <major>.<minor>[letter]  (e.g. 2.1, 2.12a). Bare "#" / "---" rows skipped.
  if ! printf '%s' "$step" | grep -qE '^[0-9]+\.[0-9]+[a-z]?$'; then continue; fi
  major="${step%%.*}"
  ROWS_SEEN=$((ROWS_SEEN+1))
  STEP_COUNT[$major]=$(( ${STEP_COUNT[$major]:-0} + 1 ))
  filecell="$(printf '%s' "$line" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$3); print $3}')"
  filecell="${filecell//\`/}"
  IFS=',' read -ra parts <<< "$filecell"
  for p in "${parts[@]}"; do
    p="$(printf '%s' "$p" | sed -e 's/^[ \t]*//' -e 's/[ \t]*$//')"
    [ -n "$p" ] || continue
    [ "$p" = "-" ] && continue
    if [ -z "${FILE_SET[$major|$p]:-}" ]; then
      FILE_SET[$major|$p]=1
      FILE_COUNT[$major]=$(( ${FILE_COUNT[$major]:-0} + 1 ))
    fi
  done
done < "$PLAN"

findings=()
add_finding() { # major field issue
  findings+=("{\"file\":\"${FILE_JSON}\",\"ac_id\":\"phase-$(json_escape "$1")\",\"field\":\"$2\",\"issue\":\"$(json_escape "$3")\",\"severity\":\"error\"}")
}

for major in $(printf '%s\n' "${!STEP_COUNT[@]}" | sort -n); do
  n=${STEP_COUNT[$major]}
  f=${FILE_COUNT[$major]:-0}
  if [ "$n" -gt "$MAX_STEPS" ]; then
    add_finding "$major" steps "phase $major has $n steps (cap $MAX_STEPS): split into sub-phases clustered by owned file; cross-cluster needs become Produces/Consumes rows"
  fi
  if [ "$f" -gt "$MAX_FILES" ]; then
    add_finding "$major" files "phase $major touches $f distinct files (cap $MAX_FILES): split into sub-phases clustered by owned file; cross-cluster needs become Produces/Consumes rows"
  fi
done

if [ "$ROWS_SEEN" -eq 0 ]; then
  echo "check-phase-width: no step rows found (vacuous pass)" >&2
else
  echo "check-phase-width: ${#STEP_COUNT[@]} phase(s), $ROWS_SEEN step rows, ${#findings[@]} finding(s) (caps: steps=$MAX_STEPS files=$MAX_FILES)" >&2
fi

if [ "${#findings[@]}" -eq 0 ]; then echo '[]'; exit 0; fi
printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
exit 1
