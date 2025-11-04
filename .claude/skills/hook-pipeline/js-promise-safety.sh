#!/usr/bin/env bash
# Manual check for unhandled promises (fallback if ESLint not available)

set -euo pipefail

FILE="${1:-}"
if [[ ! "$FILE" =~ \.(js|ts|jsx|tsx|mjs|cjs)$ ]]; then
  exit 0
fi

# Read file into array for context-aware checking
mapfile -t FILE_LINES < "$FILE"

# Check for async function calls without await/catch/then/return
UNHANDLED=""

for ((i=0; i<${#FILE_LINES[@]}; i++)); do
  line_num=$((i + 1))
  content="${FILE_LINES[$i]}"

  # Skip empty lines and comments
  if [[ -z "$content" ]] || [[ "$content" =~ ^[[:space:]]*// ]] || [[ "$content" =~ ^[[:space:]]*\* ]]; then
    continue
  fi

  # Skip if line doesn't contain function calls
  if ! echo "$content" | grep -qE '\w+\(\)'; then
    continue
  fi

  # Skip function definitions (async function foo(), function foo(), const foo = async)
  if echo "$content" | grep -qE '(async[[:space:]]+function|function[[:space:]]+|const[[:space:]]+\w+[[:space:]]*=[[:space:]]*async|let[[:space:]]+\w+[[:space:]]*=[[:space:]]*async|var[[:space:]]+\w+[[:space:]]*=[[:space:]]*async)'; then
    continue
  fi

  # Skip if line contains await, catch, then, or return
  if echo "$content" | grep -qE '(await|\.catch|\.then|return)'; then
    continue
  fi

  # Check next line for .catch() or .then() chaining (within 2 lines)
  has_chaining=false
  for ((j=1; j<=2 && (i+j)<${#FILE_LINES[@]}; j++)); do
    next_line="${FILE_LINES[$((i+j))]}"
    if echo "$next_line" | grep -qE '^[[:space:]]*\.(catch|then)'; then
      has_chaining=true
      break
    fi
  done

  if [[ "$has_chaining" == "true" ]]; then
    continue
  fi

  # Check if inside try-catch block (look back up to 10 lines)
  in_try_catch=false
  try_depth=0
  for ((j=1; j<=10 && (i-j)>=0; j++)); do
    prev_line="${FILE_LINES[$((i-j))]}"

    # Count braces to track depth
    if echo "$prev_line" | grep -qE '\{'; then
      ((try_depth++)) || true
    fi
    if echo "$prev_line" | grep -qE '\}'; then
      ((try_depth--)) || true
    fi

    # Found a try block at same depth
    if [[ $try_depth -gt 0 ]] && echo "$prev_line" | grep -qE '^[[:space:]]*try[[:space:]]*\{'; then
      in_try_catch=true
      break
    fi
  done

  if [[ "$in_try_catch" == "true" ]]; then
    continue
  fi

  # Extract function name and check if it's async
  FUNC_NAME=$(echo "$content" | grep -oE '\w+\(\)' | head -1 | sed 's/()//')

  if [[ -z "$FUNC_NAME" ]]; then
    continue
  fi

  # Check if function is async (look for async function definition)
  if grep -qE "async[[:space:]]+(function[[:space:]]+${FUNC_NAME}|const[[:space:]]+${FUNC_NAME}|let[[:space:]]+${FUNC_NAME}|var[[:space:]]+${FUNC_NAME})" "$FILE"; then
    if [[ -n "$UNHANDLED" ]]; then
      UNHANDLED="${UNHANDLED}"$'\n'"$line_num:$content"
    else
      UNHANDLED="$line_num:$content"
    fi
  fi
done

if [ -n "$UNHANDLED" ]; then
  echo "⚠️  Promise Safety Warning: Potential unhandled async calls" >&2
  echo "" >&2
  echo "$UNHANDLED" | while IFS=: read -r line_num content; do
    echo "   Line $line_num: ${content}" >&2
  done
  echo "" >&2
  echo "   Recommendation: Add 'await' or '.catch()' to handle promise" >&2
  echo "   Better: Run ESLint with @typescript-eslint/no-floating-promises" >&2
  echo "" >&2
  exit 2
fi

exit 0
