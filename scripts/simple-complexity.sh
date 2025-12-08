#!/usr/bin/env bash
# Simple cyclomatic complexity calculator for bash scripts

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "Usage: $0 <bash-script>"
    exit 1
fi

echo "Cyclomatic Complexity Analysis: $(basename "$FILE")"
echo "=================================================="

# Count decision points
IF_COUNT=$(grep -cE '^\s*(if|elif)\s+' "$FILE" 2>/dev/null || echo 0)
LOOP_COUNT=$(grep -cE '^\s*(for|while|until)\s+' "$FILE" 2>/dev/null || echo 0)
CASE_COUNT=$(grep -cE '^\s*case\s+' "$FILE" 2>/dev/null || echo 0)
AND_OR=$(grep -vE '^\s*#' "$FILE" | grep -oE '(\&\&|\|\|)' | wc -l)
FUNC_COUNT=$(grep -cE 'function\s+[a-zA-Z_]|^[a-zA-Z_][a-zA-Z0-9_]*\s*\(\)' "$FILE" 2>/dev/null || echo 0)

# Calculate total (base 1 + decision points)
TOTAL=$((1 + IF_COUNT + LOOP_COUNT + CASE_COUNT + AND_OR / 2))

echo "Decision Points:"
echo "  if/elif:        $IF_COUNT"
echo "  loops:          $LOOP_COUNT"
echo "  case:           $CASE_COUNT"
echo "  &&/||:          $AND_OR"
echo "  functions:      $FUNC_COUNT"
echo ""
echo "Total Complexity: $TOTAL"
echo ""

if [ $TOTAL -ge 40 ]; then
    echo "Rating: Very Complex (refactor required)"
elif [ $TOTAL -ge 20 ]; then
    echo "Rating: Complex (refactor recommended)"
elif [ $TOTAL -ge 10 ]; then
    echo "Rating: Moderate"
else
    echo "Rating: Simple"
fi

echo "=================================================="
