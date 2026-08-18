#!/usr/bin/env bash
# Bar checker — produce/consume edge sanity for cfn-loop-task wave ordering.
# Validates the Implementation Steps table's Produces/Consumes columns so
# cfn-loop-task (LANE DERIVATION step 5/6) can derive dependency-correct waves.
# A FAIL means the metadata would mislead lane scheduling.
#
# Checks:
#   - each Produces/Consumes cell is `-` or a concrete <path>[:<symbol>] list (no weasel, not empty)
#   - no identifier is Produced by two different steps (duplicate producer -> error)
#   - each Consumes identifier matches some Produces identifier, else dangling (-> warn)
#
# Usage:  check-produce-consume.sh <planning/<slug>/PLAN_<slug>.md>
# Output: JSON findings array on stdout:
#           [{"file":"...","ac_id":"<step>","field":"produces|consumes","issue":"...","severity":"error|warn"}]
#         Empty array [] when clean OR when the plan has no Produces/Consumes columns (pre-feature plan).
# Exit:   0 = clean OR warnings only OR no such columns
#         1 = one or more error-severity findings
#         2 = usage / file-not-found
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHRASE_FILE="$SCRIPT_DIR/weasel-phrases.txt"

PLAN="${1:-}"
if [ -z "$PLAN" ]; then
  echo 'usage: check-produce-consume.sh <planning/<slug>/PLAN_<slug>.md>' >&2
  exit 2
fi
if [ ! -f "$PLAN" ]; then
  echo "error: file not found: $PLAN" >&2
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
  WEASEL=('appropriately' 'as needed' 'as appropriate' 'the relevant file' \
          'the relevant export' 'a helper that' 'handle' 'figure out' 'etc\.' 'TBD')
fi

json_escape() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}
  printf '%s' "$s"
}
FILE_JSON=$(json_escape "$PLAN")
findings=()
add_finding() { # step field issue severity
  findings+=("{\"file\":\"${FILE_JSON}\",\"ac_id\":\"$(json_escape "$1")\",\"field\":\"$(json_escape "$2")\",\"issue\":\"$(json_escape "$3")\",\"severity\":\"$4\"}")
}
emit_and_exit() {
  if [ "${#findings[@]}" -eq 0 ]; then echo '[]'; exit 0; fi
  printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
  for f in "${findings[@]}"; do
    case "$f" in *'"severity":"error"'*) exit 1 ;; esac
  done
  exit 0
}

# Split a markdown table row into cells, treating `|` inside a backtick span as
# literal (verify-command cells contain a shell pipe; TS union types are backticked).
split_row() { # row -> one trimmed cell per line
  local line="$1" ch cell="" inbt=0 i len=${#line}
  for (( i=0; i<len; i++ )); do
    ch=${line:i:1}
    if [ "$ch" = '`' ]; then inbt=$((1-inbt)); cell+="$ch"; continue; fi
    if [ "$ch" = '|' ] && [ "$inbt" -eq 0 ]; then
      printf '%s\n' "$(printf '%s' "$cell" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      cell=""; continue
    fi
    cell+="$ch"
  done
  printf '%s\n' "$(printf '%s' "$cell" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
}

# strip surrounding backticks from a token
debacktick() { local s="$1"; s="${s//\`/}"; printf '%s' "$s"; }

ID_RE='^[A-Za-z0-9._/-]+(:[A-Za-z0-9_.]+)?$'

declare -A PRODUCER_STEP   # identifier -> step that produces it (dup detection)
CONSUMES=()                # "step<TAB>id"

header_found=0
IDX_PROD=-1; IDX_CONS=-1; IDX_NUM=0

validate_cell() { # step field rawcell
  local step="$1" field="$2" raw="$3"
  local cell; cell=$(debacktick "$raw")
  cell=$(printf '%s' "$cell" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  if [ -z "$cell" ]; then
    add_finding "$step" "$field" "empty cell — use \`-\` or a concrete <path>[:<symbol>] list" "error"; return
  fi
  # weasel scan on the raw cell
  local w
  for w in "${WEASEL[@]}"; do
    if printf '%s' "$cell" | grep -qiE "(^|[^[:alnum:]])${w}([^[:alnum:]]|$)"; then
      add_finding "$step" "$field" "weasel phrase '${w//\\/}' — name a concrete <path>[:<symbol>] or \`-\`" "error"; return
    fi
  done
  [ "$cell" = "-" ] && return
  # comma-separated identifier list
  local IFS_SAVE="$IFS" tok
  IFS=','; read -ra toks <<< "$cell"; IFS="$IFS_SAVE"
  for tok in "${toks[@]}"; do
    tok=$(printf '%s' "$tok" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [ -z "$tok" ] && continue
    if ! printf '%s' "$tok" | grep -qE "$ID_RE"; then
      add_finding "$step" "$field" "identifier '$tok' is not a <path>[:<symbol>] token" "error"; continue
    fi
    if [ "$field" = "produces" ]; then
      if [ -n "${PRODUCER_STEP[$tok]:-}" ] && [ "${PRODUCER_STEP[$tok]}" != "$step" ]; then
        add_finding "$step" "produces" "duplicate producer: '$tok' also produced by step ${PRODUCER_STEP[$tok]} (ambiguous lane owner)" "error"
      else
        PRODUCER_STEP[$tok]="$step"
      fi
    else
      CONSUMES+=("$step	$tok")
    fi
  done
}

while IFS= read -r line; do
  case "$line" in \|*) ;; *)
    if [ "$header_found" = 1 ]; then break; fi
    continue ;;
  esac
  # skip separator rows |---|---|
  if printf '%s' "$line" | grep -qE '^\|[[:space:][:punct:]]*-{2,}'; then continue; fi
  mapfile -t cells < <(split_row "$line")
  if [ "$header_found" = 0 ]; then
    if printf '%s\n' "${cells[@]}" | grep -qx "Produces" && printf '%s\n' "${cells[@]}" | grep -qx "Consumes"; then
      header_found=1
      for j in "${!cells[@]}"; do
        case "${cells[$j]}" in
          Produces) IDX_PROD=$j ;;
          Consumes) IDX_CONS=$j ;;
          '#')      IDX_NUM=$j ;;
        esac
      done
    fi
    continue
  fi
  STEP="${cells[$IDX_NUM]:-?}"; [ -z "$STEP" ] && STEP="?"
  validate_cell "$STEP" "produces" "${cells[$IDX_PROD]:-}"
  validate_cell "$STEP" "consumes" "${cells[$IDX_CONS]:-}"
done < "$PLAN"

# Pre-feature plan (no such columns) -> clean, backward compatible.
if [ "$header_found" = 0 ]; then echo '[]'; exit 0; fi

# Dangling-consume pass (warn): a consumed id matching no producer is a pre-existing symbol or a typo.
for entry in "${CONSUMES[@]:-}"; do
  [ -z "$entry" ] && continue
  cstep="${entry%%	*}"; cid="${entry##*	}"
  if [ -z "${PRODUCER_STEP[$cid]:-}" ]; then
    add_finding "$cstep" "consumes" "dangling consume: '$cid' matches no Produces in this plan (pre-existing symbol, or a typo — verify string matches byte-for-byte)" "warn"
  fi
done

emit_and_exit
