#!/usr/bin/env bash
##############################################################################
# Cyclomatic Complexity Calculator for Bash Scripts
#
# Calculates McCabe cyclomatic complexity by counting decision points:
# - if/elif
# - for/while/until
# - case patterns
# - && and || operators
# - Function definitions (base complexity = 1)
#
# Usage: ./calculate-complexity.sh <script.sh>
##############################################################################

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <bash-script>"
    exit 1
fi

SCRIPT_FILE="$1"

if [ ! -f "$SCRIPT_FILE" ]; then
    echo "Error: File not found: $SCRIPT_FILE"
    exit 1
fi

# Calculate complexity for entire file
calculate_file_complexity() {
    local file="$1"
    local total_complexity=0

    # Count decision points
    local if_count=$(grep -cE '^\s*(if|elif)\s+' "$file" || echo 0)
    local loop_count=$(grep -cE '^\s*(for|while|until)\s+' "$file" || echo 0)
    local case_count=$(grep -cE '^\s*case\s+.*\s+in' "$file" || echo 0)
    local case_pattern_count=$(grep -cE '^\s*[^#]*\)$' "$file" || echo 0)

    # Count && and || (excluding comments)
    local and_or_count=$(grep -vE '^\s*#' "$file" | grep -oE '(\&\&|\|\|)' | wc -l || echo 0)

    # Count functions (base complexity for each)
    local function_count=$(grep -cE '^\s*(function\s+[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*\s*\(\)\s*\{)' "$file" || echo 0)

    # Calculate total
    total_complexity=$((if_count + loop_count + case_count + case_pattern_count / 3 + and_or_count / 2 + function_count + 1))

    echo "$total_complexity"
}

# Calculate complexity per function
calculate_function_complexity() {
    local file="$1"

    echo "=================================================="
    echo "Cyclomatic Complexity Analysis: $(basename "$file")"
    echo "=================================================="
    echo ""

    # Extract function names and line numbers
    local functions=$(grep -nE '^\s*(function\s+[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*\s*\(\)\s*\{)' "$file" || echo "")

    if [ -z "$functions" ]; then
        echo "No functions found. Calculating file-level complexity..."
        local file_complexity=$(calculate_file_complexity "$file")
        echo "Total File Complexity: $file_complexity"
        return
    fi

    # Parse each function
    local prev_line=1
    local prev_func=""

    echo "$functions" | while IFS=: read -r line_num func_def; do
        # Extract function name
        local func_name=$(echo "$func_def" | sed -E 's/^\s*(function\s+)?([a-zA-Z_][a-zA-Z0-9_]*).*/\2/')

        # Calculate complexity for previous function
        if [ -n "$prev_func" ]; then
            local start_line=$prev_line
            local end_line=$((line_num - 1))

            # Extract function body
            local func_body=$(sed -n "${start_line},${end_line}p" "$file")

            # Count decision points in this function
            local if_count=$(echo "$func_body" | grep -cE '^\s*(if|elif)\s+' || echo 0)
            local loop_count=$(echo "$func_body" | grep -cE '^\s*(for|while|until)\s+' || echo 0)
            local case_count=$(echo "$func_body" | grep -cE '^\s*case\s+.*\s+in' || echo 0)
            local case_pattern_count=$(echo "$func_body" | grep -cE '^\s*[^#]*\)$' || echo 0)
            local and_or_count=$(echo "$func_body" | grep -vE '^\s*#' | grep -oE '(\&\&|\|\|)' | wc -l || echo 0)

            local complexity=$((if_count + loop_count + case_count + case_pattern_count / 3 + and_or_count / 2 + 1))

            # Classify complexity
            local rating="Simple"
            if [ $complexity -ge 21 ]; then
                rating="Very Complex (refactor required)"
            elif [ $complexity -ge 11 ]; then
                rating="Complex (refactor recommended)"
            elif [ $complexity -ge 6 ]; then
                rating="Moderate"
            fi

            printf "%-30s Lines %-10s Complexity: %-3d [%s]\n" "$prev_func()" "${prev_line}-${end_line}" "$complexity" "$rating"
        fi

        prev_line=$line_num
        prev_func=$func_name
    done

    # Calculate last function
    if [ -n "$prev_func" ]; then
        local start_line=$prev_line
        local end_line=$(wc -l < "$file")

        local func_body=$(sed -n "${start_line},${end_line}p" "$file")

        local if_count=$(echo "$func_body" | grep -cE '^\s*(if|elif)\s+' || echo 0)
        local loop_count=$(echo "$func_body" | grep -cE '^\s*(for|while|until)\s+' || echo 0)
        local case_count=$(echo "$func_body" | grep -cE '^\s*case\s+.*\s+in' || echo 0)
        local case_pattern_count=$(echo "$func_body" | grep -cE '^\s*[^#]*\)$' || echo 0)
        local and_or_count=$(echo "$func_body" | grep -vE '^\s*#' | grep -oE '(\&\&|\|\|)' | wc -l || echo 0)

        local complexity=$((if_count + loop_count + case_count + case_pattern_count / 3 + and_or_count / 2 + 1))

        local rating="Simple"
        if [ $complexity -ge 21 ]; then
            rating="Very Complex (refactor required)"
        elif [ $complexity -ge 11 ]; then
            rating="Complex (refactor recommended)"
        elif [ $complexity -ge 6 ]; then
            rating="Moderate"
        fi

        printf "%-30s Lines %-10s Complexity: %-3d [%s]\n" "$prev_func()" "${prev_line}-${end_line}" "$complexity" "$rating"
    fi

    echo ""
    echo "Total File Complexity: $(calculate_file_complexity "$file")"
    echo "=================================================="
}

# Run analysis
calculate_function_complexity "$SCRIPT_FILE"
