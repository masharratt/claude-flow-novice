#!/bin/bash
set -euo pipefail

OUTPUT="$1"

# Pattern 1: Explicit confidence (0.0-1.0)
if CONF=$(echo "$OUTPUT" | grep -oP '[Cc]onfidence[:\s]*([0-9.]+)' | grep -oP '([0-9.]+)' | head -1); then
  echo "$CONF"
  exit 0
fi

# Pattern 2: Percentage (85%)
if PERCENT=$(echo "$OUTPUT" | grep -oP '([0-9]{1,3})%' | grep -oP '[0-9]+' | head -1); then
  echo "scale=2; $PERCENT / 100" | bc
  exit 0
fi

# Pattern 3: Natural language with score in parentheses
if CONF=$(echo "$OUTPUT" | grep -oP '\(([0-9.]+)\)' | grep -oP '[0-9.]+' | head -1); then
  echo "$CONF"
  exit 0
fi

# Pattern 4: Score with colon
if CONF=$(echo "$OUTPUT" | grep -oP '[Ss]core[:\s]*([0-9.]+)' | grep -oP '([0-9.]+)' | head -1); then
  echo "$CONF"
  exit 0
fi

# No confidence found
echo "0.0"
