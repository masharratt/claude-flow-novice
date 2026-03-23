#!/usr/bin/env bash
#######################################################################
# CFN E2E Batch Analyzer
# Discovers and categorizes test files by size/complexity
#######################################################################

# Thresholds for categorization
FAST_THRESHOLD="${FAST_THRESHOLD:-10}"      # < 10 tests = fast
MEDIUM_THRESHOLD="${MEDIUM_THRESHOLD:-50}"   # 10-50 tests = medium
                                             # > 50 tests = large

# Count tests in a file (approximate by counting test/it blocks)
count_tests_in_file() {
    local file="$1"
    local count=0

    if [[ -f "$file" ]]; then
        # Count test(), it(), and test.describe() blocks
        count=$(grep -cE '^\s*(test|it|test\.describe)\s*\(' "$file" 2>/dev/null || echo "0")
    fi

    echo "$count"
}

# Categorize a single test file
categorize_file() {
    local file="$1"
    local test_count
    test_count=$(count_tests_in_file "$file")

    if [[ $test_count -lt $FAST_THRESHOLD ]]; then
        echo "fast"
    elif [[ $test_count -lt $MEDIUM_THRESHOLD ]]; then
        echo "medium"
    else
        echo "large"
    fi
}

# Analyze all test files in directory
analyze_batches() {
    local test_dir="$1"

    if [[ ! -d "$test_dir" ]]; then
        echo "Error: Directory not found: $test_dir" >&2
        return 1
    fi

    local total_fast=0
    local total_medium=0
    local total_large=0
    local total_tests=0

    echo "Analyzing test files in: $test_dir"
    echo "Thresholds: fast=<${FAST_THRESHOLD}, medium=<${MEDIUM_THRESHOLD}, large=>=${MEDIUM_THRESHOLD}"
    echo ""

    while IFS= read -r -d '' file; do
        local filename
        filename=$(basename "$file")
        local test_count
        test_count=$(count_tests_in_file "$file")
        local category
        category=$(categorize_file "$file")

        case "$category" in
            fast) ((total_fast++)) ;;
            medium) ((total_medium++)) ;;
            large) ((total_large++)) ;;
        esac

        ((total_tests += test_count))

        printf "  %-40s %3d tests  [%s]\n" "$filename" "$test_count" "$category"
    done < <(find "$test_dir" -type f \( -name "*.spec.ts" -o -name "*.test.ts" \) -print0 2>/dev/null | sort -z)

    echo ""
    echo "Summary:"
    echo "  Fast files:   $total_fast"
    echo "  Medium files: $total_medium"
    echo "  Large files:  $total_large"
    echo "  Total tests:  ~$total_tests (approximate)"
}

# Populate batch arrays (to be sourced by runner)
categorize_test_files() {
    local test_dir="$1"

    # Clear existing arrays
    FAST_BATCHES=()
    MEDIUM_BATCHES=()
    LARGE_BATCHES=()

    while IFS= read -r -d '' file; do
        local category
        category=$(categorize_file "$file")

        case "$category" in
            fast) FAST_BATCHES+=("$file") ;;
            medium) MEDIUM_BATCHES+=("$file") ;;
            large) LARGE_BATCHES+=("$file") ;;
        esac
    done < <(find "$test_dir" -type f \( -name "*.spec.ts" -o -name "*.test.ts" \) -print0 2>/dev/null | sort -z)
}

# Generate batch config JSON
generate_batch_config() {
    local test_dir="$1"
    local output_file="${2:-/tmp/cfn-e2e-batches.json}"

    categorize_test_files "$test_dir"

    cat > "$output_file" <<EOF
{
  "analyzed_at": "$(date -Iseconds)",
  "test_dir": "$test_dir",
  "thresholds": {
    "fast": $FAST_THRESHOLD,
    "medium": $MEDIUM_THRESHOLD
  },
  "batches": {
    "fast": $(printf '%s\n' "${FAST_BATCHES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo '[]'),
    "medium": $(printf '%s\n' "${MEDIUM_BATCHES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo '[]'),
    "large": $(printf '%s\n' "${LARGE_BATCHES[@]}" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo '[]')
  },
  "counts": {
    "fast": ${#FAST_BATCHES[@]},
    "medium": ${#MEDIUM_BATCHES[@]},
    "large": ${#LARGE_BATCHES[@]}
  }
}
EOF

    echo "Batch config written to: $output_file"
}

# Main execution when run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 1 ]]; then
        echo "Usage: $(basename "$0") <test-directory> [--json <output-file>]"
        echo ""
        echo "Examples:"
        echo "  $(basename "$0") tests/e2e"
        echo "  $(basename "$0") tests/e2e --json /tmp/batches.json"
        exit 1
    fi

    test_dir="$1"
    shift

    if [[ "${1:-}" == "--json" ]]; then
        output_file="${2:-/tmp/cfn-e2e-batches.json}"
        generate_batch_config "$test_dir" "$output_file"
    else
        analyze_batches "$test_dir"
    fi
fi
