#!/bin/bash
set -euo pipefail

BEFORE=""
AFTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --before) BEFORE="$2"; shift 2 ;;
    --after) AFTER="$2"; shift 2 ;;
    *) echo "ERROR: Unknown parameter: $1" >&2; exit 1 ;;
  esac
done

# Find new/modified files (compare before and after git status)
CHANGED_FILES=$(comm -13 <(echo "$BEFORE" | sort) <(echo "$AFTER" | sort) 2>/dev/null || true)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c '^' 2>/dev/null || echo "0")

# Build deliverables JSON array
DELIVERABLES="["
FIRST=true
while IFS= read -r line; do
  if [ -n "$line" ]; then
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      DELIVERABLES+=","
    fi
    # Escape quotes in filename
    ESCAPED_LINE=$(echo "$line" | sed 's/"/\\"/g')
    DELIVERABLES+="\"$ESCAPED_LINE\""
  fi
done <<< "$CHANGED_FILES"
DELIVERABLES+="]"

# Output JSON
cat <<EOF
{
  "files_changed": $FILE_COUNT,
  "deliverables": $DELIVERABLES
}
EOF
