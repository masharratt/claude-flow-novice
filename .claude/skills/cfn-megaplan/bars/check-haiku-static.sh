#!/usr/bin/env bash
# Bar B static weasel-word scan (mandatory first pass before the haiku probe).
# Source of the banned-phrase list: bars/haiku-executable.md, specificity checklist item 6.
#
# Usage:   check-haiku-static.sh <plan-file>
# Output:  JSON findings array on stdout: [{"file":"...","line":N,"phrase":"..."}]
#          Empty array [] when clean.
# Exit:    0 = no findings, 1 = one or more findings, 2 = usage or file error.
set -euo pipefail

PLAN="${1:-}"
if [ -z "$PLAN" ]; then
  echo 'usage: check-haiku-static.sh <plan-file>' >&2
  exit 2
fi
if [ ! -f "$PLAN" ]; then
  echo "error: file not found: $PLAN" >&2
  exit 2
fi

# Banned vague phrases (regex, matched case-insensitively with non-alnum boundaries).
# Single source of truth: bars/weasel-phrases.txt (shared with check-verifiable-static.sh).
# Falls back to the inline array if the file is missing (defence in depth).
# "gracefully" is flagged unconditionally; the owning phase clears the finding by
# naming the defined behavior instead.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHRASE_FILE="$SCRIPT_DIR/weasel-phrases.txt"
PATTERNS=()
if [ -f "$PHRASE_FILE" ]; then
  while IFS= read -r pat; do
    case "$pat" in ''|'#'*) continue ;; esac
    PATTERNS+=("$pat")
  done < "$PHRASE_FILE"
fi
if [ "${#PATTERNS[@]}" -eq 0 ]; then
  PATTERNS=(
    'appropriately'
    'as needed'
    'as appropriate'
    'handle accordingly'
    'figure out'
    'etc\.'
    'and so on'
    'TBD'
    'properly'
    'gracefully'
    'where applicable'
  )
fi

json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  printf '%s' "$s"
}

FILE_JSON=$(json_escape "$PLAN")
findings=()

for pat in "${PATTERNS[@]}"; do
  # Plain-text phrase for the JSON output (strip regex escapes).
  phrase=$(json_escape "${pat//\\/}")
  while IFS= read -r line_no; do
    [ -n "$line_no" ] || continue
    findings+=("{\"file\":\"${FILE_JSON}\",\"line\":${line_no},\"phrase\":\"${phrase}\"}")
  done < <(grep -inE "(^|[^[:alnum:]])${pat}([^[:alnum:]]|$)" "$PLAN" | cut -d: -f1 || true)
done

if [ "${#findings[@]}" -eq 0 ]; then
  echo '[]'
  exit 0
fi

printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
exit 1
