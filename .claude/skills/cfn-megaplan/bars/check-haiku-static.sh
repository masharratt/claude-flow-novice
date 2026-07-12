#!/usr/bin/env bash
# Bar B static scan (mandatory first pass before the haiku probe).
# Source of the banned-phrase list: bars/haiku-executable.md, specificity checklist item 6.
# Source of the optional-DI assist: bars/haiku-executable.md, specificity checklist item 9 (S005).
#
# Usage:   check-haiku-static.sh <plan-file> [core-fr-interfaces-file]
# Output:  JSON findings array on stdout:
#            [{"file":"...","line":N,"phrase":"...","severity":"error"}]         (weasel)
#            [{"file":"...","line":N,"symbol":"...","severity":"warn"}]          (optional-DI)
#          Empty array [] when clean.
# Exit:    0 = no error-severity findings (warn findings alone do not fail),
#          1 = one or more error-severity findings, 2 = usage or file error.
#
# cfn: bash-grep-only optional-DI assist, no TS AST. Scoped to file paths named in the
# core-fr-interfaces-file arg (never repo-wide) to keep false positives bounded. Upgrade
# trigger: false-positive/negative rate high enough that reviewers start ignoring the WARN,
# or Bar B needs a general (non-scoped) optional-DI detector -- needs ts-morph/tsc, not bash.
set -euo pipefail

PLAN="${1:-}"
IFACES="${2:-}"
if [ -z "$PLAN" ]; then
  echo 'usage: check-haiku-static.sh <plan-file> [core-fr-interfaces-file]' >&2
  exit 2
fi
if [ ! -f "$PLAN" ]; then
  echo "error: file not found: $PLAN" >&2
  exit 2
fi
if [ -n "$IFACES" ] && [ ! -f "$IFACES" ]; then
  echo "error: file not found: $IFACES" >&2
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

has_error=0

for pat in "${PATTERNS[@]}"; do
  # Plain-text phrase for the JSON output (strip regex escapes).
  phrase=$(json_escape "${pat//\\/}")
  while IFS= read -r line_no; do
    [ -n "$line_no" ] || continue
    findings+=("{\"file\":\"${FILE_JSON}\",\"line\":${line_no},\"phrase\":\"${phrase}\",\"severity\":\"error\"}")
    has_error=1
  done < <(grep -inE "(^|[^[:alnum:]])${pat}([^[:alnum:]]|$)" "$PLAN" | cut -d: -f1 || true)
done

# Optional-DI mechanical assist (S005, checklist item 9). WARN severity only, never fails
# the gate alone. Scoped strictly to file paths named in $IFACES -- never a repo-wide scan.
if [ -n "$IFACES" ]; then
  while IFS= read -r ifline; do
    case "$ifline" in ''|'#'*) continue ;; esac
    iface_file="${ifline%%:*}"
    [ -n "$iface_file" ] || continue
    iface_file_json=$(json_escape "$iface_file")
    while IFS=: read -r line_no line_text; do
      [ -n "$line_no" ] || continue
      # TS optional-property token: identifier followed by `?:` (e.g. `thread?:`).
      symbol=$(printf '%s' "$line_text" | grep -oE '[A-Za-z_][A-Za-z0-9_]*\?[[:space:]]*:' | head -n1 | sed -E 's/\?[[:space:]]*:$//')
      [ -n "$symbol" ] || continue
      symbol_json=$(json_escape "$symbol")
      findings+=("{\"file\":\"${FILE_JSON}\",\"line\":${line_no},\"symbol\":\"${symbol_json}\",\"detail\":\"optional-property on core-fr dependency interface ${iface_file_json}\",\"severity\":\"warn\"}")
    done < <(grep -nF "$iface_file" "$PLAN" | grep -E '[A-Za-z_][A-Za-z0-9_]*\?[[:space:]]*:' || true)
  done < "$IFACES"
fi

if [ "${#findings[@]}" -eq 0 ]; then
  echo '[]'
  exit 0
fi

printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
[ "$has_error" -eq 0 ] && exit 0
exit 1
