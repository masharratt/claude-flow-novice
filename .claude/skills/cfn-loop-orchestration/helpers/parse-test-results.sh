#!/usr/bin/env bash
set -euo pipefail

parse_jest_output() {
    local output="$1"
    local total=0 passed=0 failed=0 skipped=0 duration=0
    local failed_names=()

    local tests_line=$(echo "$output" | grep "^Tests:" || echo "")
    
    if [ -n "$tests_line" ]; then
        [[ "$tests_line" =~ ([0-9]+)[[:space:]]*passed ]] && passed="${BASH_REMATCH[1]}"
        [[ "$tests_line" =~ ([0-9]+)[[:space:]]*failed ]] && failed="${BASH_REMATCH[1]}"
        [[ "$tests_line" =~ ([0-9]+)[[:space:]]*skipped ]] && skipped="${BASH_REMATCH[1]}"
        [[ "$tests_line" =~ ([0-9]+)[[:space:]]*total ]] && total="${BASH_REMATCH[1]}"
    fi

    # OPTIMIZATION: Replace bc with BASH arithmetic (75-150ms savings)
    if [[ "$output" =~ Time:[[:space:]]*([0-9.]+)[[:space:]]*s ]]; then
        duration=$(awk "BEGIN {printf \"%.0f\", ${BASH_REMATCH[1]} * 1000}")
    fi

    while IFS= read -r line; do
        [[ "$line" =~ ●[[:space:]]*(.*) ]] && failed_names+=("${BASH_REMATCH[1]}")
    done <<< "$output"

    # OPTIMIZATION: Replace bc with awk
    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    # OPTIMIZATION: Single jq call
    local failed_names_json="[]"
    [ ${#failed_names[@]} -gt 0 ] && failed_names_json=$(printf '%s\n' "${failed_names[@]}" | jq -Rs 'split("\n") | map(select(length > 0))')

    cat <<EOF
{"framework":"jest","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":$duration,"failed_test_names":$failed_names_json}
EOF
}

parse_mocha_output() {
    local output="$1"
    local total=0 passed=0 failed=0 skipped=0 duration=0
    local failed_names=()

    [[ "$output" =~ ([0-9]+)[[:space:]]*passing ]] && passed="${BASH_REMATCH[1]}"
    [[ "$output" =~ ([0-9]+)[[:space:]]*failing ]] && failed="${BASH_REMATCH[1]}"
    [[ "$output" =~ ([0-9]+)[[:space:]]*pending ]] && skipped="${BASH_REMATCH[1]}"
    total=$((passed + failed + skipped))

    # OPTIMIZATION: Replace bc with awk
    if [[ "$output" =~ passing[[:space:]]*\(([0-9]+)ms\) ]]; then
        duration="${BASH_REMATCH[1]}"
    elif [[ "$output" =~ passing[[:space:]]*\(([0-9.]+)s\) ]]; then
        duration=$(awk "BEGIN {printf \"%.0f\", ${BASH_REMATCH[1]} * 1000}")
    fi

    while IFS= read -r line; do
        [[ "$line" =~ ^[[:space:]]*[0-9]+\)[[:space:]]*(.*): ]] && failed_names+=("${BASH_REMATCH[1]}")
    done <<< "$output"

    # OPTIMIZATION: Replace bc with awk
    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    # OPTIMIZATION: Single jq call
    local failed_names_json="[]"
    [ ${#failed_names[@]} -gt 0 ] && failed_names_json=$(printf '%s\n' "${failed_names[@]}" | jq -Rs 'split("\n") | map(select(length > 0))')

    cat <<EOF
{"framework":"mocha","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":$duration,"failed_test_names":$failed_names_json}
EOF
}

parse_pytest_output() {
    local output="$1"
    local total=0 passed=0 failed=0 skipped=0 duration=0
    local failed_names=()

    [[ "$output" =~ ([0-9]+)[[:space:]]*passed ]] && passed="${BASH_REMATCH[1]}"
    [[ "$output" =~ ([0-9]+)[[:space:]]*failed ]] && failed="${BASH_REMATCH[1]}"
    [[ "$output" =~ ([0-9]+)[[:space:]]*skipped ]] && skipped="${BASH_REMATCH[1]}"
    total=$((passed + failed + skipped))

    # OPTIMIZATION: Replace bc with awk
    [[ "$output" =~ in[[:space:]]+([0-9.]+)s ]] && duration=$(awk "BEGIN {printf \"%.0f\", ${BASH_REMATCH[1]} * 1000}")

    while IFS= read -r line; do
        [[ "$line" =~ FAILED[[:space:]]+([^[:space:]]+) ]] && failed_names+=("${BASH_REMATCH[1]}")
    done <<< "$output"

    # OPTIMIZATION: Replace bc with awk
    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    # OPTIMIZATION: Single jq call
    local failed_names_json="[]"
    [ ${#failed_names[@]} -gt 0 ] && failed_names_json=$(printf '%s\n' "${failed_names[@]}" | jq -Rs 'split("\n") | map(select(length > 0))')

    cat <<EOF
{"framework":"pytest","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":$duration,"failed_test_names":$failed_names_json}
EOF
}

parse_tap_output() {
    local output="$1"
    local total=0 passed=0 failed=0 skipped=0
    local failed_names=()

    [[ "$output" =~ 1\.\.([0-9]+) ]] && total="${BASH_REMATCH[1]}"
    passed=$(echo "$output" | grep -c "^ok " || true)
    failed=$(echo "$output" | grep -c "^not ok " || true)
    skipped=$(echo "$output" | grep -c "^ok .* # SKIP" || true)
    passed=$((passed - skipped))

    while IFS= read -r line; do
        [[ "$line" =~ ^not\ ok\ [0-9]+\ (.*) ]] && failed_names+=("${BASH_REMATCH[1]}")
    done <<< "$output"

    # OPTIMIZATION: Replace bc with awk
    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    # OPTIMIZATION: Single jq call
    local failed_names_json="[]"
    [ ${#failed_names[@]} -gt 0 ] && failed_names_json=$(printf '%s\n' "${failed_names[@]}" | jq -Rs 'split("\n") | map(select(length > 0))')

    cat <<EOF
{"framework":"tap","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":0,"failed_test_names":$failed_names_json}
EOF
}

parse_junit_xml() {
    local xml_file="$1"
    [ ! -f "$xml_file" ] && echo '{"error":"File not found"}' && return 1

    local total=0 failures=0 errors=0 skipped=0 duration=0

    if command -v xmllint &>/dev/null; then
        total=$(xmllint --xpath "sum(//testsuite/@tests)" "$xml_file" 2>/dev/null || echo "0")
        failures=$(xmllint --xpath "sum(//testsuite/@failures)" "$xml_file" 2>/dev/null || echo "0")
        errors=$(xmllint --xpath "sum(//testsuite/@errors)" "$xml_file" 2>/dev/null || echo "0")
        skipped=$(xmllint --xpath "sum(//testsuite/@skipped)" "$xml_file" 2>/dev/null || echo "0")
        duration=$(xmllint --xpath "sum(//testsuite/@time)" "$xml_file" 2>/dev/null || echo "0")
    else
        total=$(grep -oP 'tests="\K[0-9]+' "$xml_file" | awk '{s+=$1} END {print s}')
        failures=$(grep -oP 'failures="\K[0-9]+' "$xml_file" | awk '{s+=$1} END {print s}')
        errors=$(grep -oP 'errors="\K[0-9]+' "$xml_file" | awk '{s+=$1} END {print s}')
        skipped=$(grep -oP 'skipped="\K[0-9]+' "$xml_file" | awk '{s+=$1} END {print s}')
        duration=$(grep -oP 'time="\K[0-9.]+' "$xml_file" | awk '{s+=$1} END {print s}')
    fi

    total=${total:-0} failures=${failures:-0} errors=${errors:-0} skipped=${skipped:-0} duration=${duration:-0}
    local failed=$((failures + errors))
    local passed=$((total - failed - skipped))

    # OPTIMIZATION: Replace bc with awk
    local duration_ms=$(awk "BEGIN {printf \"%.0f\", $duration * 1000}")

    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    cat <<EOF
{"framework":"junit","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":$duration_ms,"failed_test_names":[]}
EOF
}

parse_go_test_output() {
    local output="$1"
    local total=0 passed=0 failed=0 skipped=0 duration=0
    local failed_names=()

    passed=$(echo "$output" | grep -c "^--- PASS:" || true)
    failed=$(echo "$output" | grep -c "^--- FAIL:" || true)
    skipped=$(echo "$output" | grep -c "^--- SKIP:" || true)
    total=$((passed + failed + skipped))

    while IFS= read -r line; do
        [[ "$line" =~ ^---\ FAIL:\ (.*) ]] && failed_names+=("${BASH_REMATCH[1]}")
    done <<< "$output"

    # OPTIMIZATION: Replace bc with awk
    [[ "$output" =~ ok[[:space:]]+[^[:space:]]+[[:space:]]+([0-9.]+)s ]] && duration=$(awk "BEGIN {printf \"%.0f\", ${BASH_REMATCH[1]} * 1000}")

    local pass_rate="0.0000"
    if [ "$total" -gt 0 ]; then
        pass_rate=$(awk "BEGIN {printf \"%.4f\", $passed / $total}")
    fi

    # OPTIMIZATION: Single jq call
    local failed_names_json="[]"
    [ ${#failed_names[@]} -gt 0 ] && failed_names_json=$(printf '%s\n' "${failed_names[@]}" | jq -Rs 'split("\n") | map(select(length > 0))')

    cat <<EOF
{"framework":"go","total_tests":$total,"passed_tests":$passed,"failed_tests":$failed,"skipped_tests":$skipped,"pass_rate":$pass_rate,"duration_ms":$duration,"failed_test_names":$failed_names_json}
EOF
}

auto_detect_framework() {
    local input="$1"

    if [ -f "$input" ]; then
        if grep -q "<testsuite" "$input" 2>/dev/null; then
            echo "junit"
            return 0
        fi
        input=$(cat "$input")
    fi

    if [[ "$input" =~ Test\ Suites: ]] || [[ "$input" =~ PASS[[:space:]]+.*\.test\.(js|ts) ]]; then
        echo "jest"
        return 0
    fi

    if [[ "$input" =~ [0-9]+\ passing ]] && [[ "$input" =~ [0-9]+\ failing ]]; then
        echo "mocha"
        return 0
    fi

    if [[ "$input" =~ ====.*passed.*==== ]] || [[ "$input" =~ FAILED.*\.py:: ]]; then
        echo "pytest"
        return 0
    fi

    if [[ "$input" =~ 1\.\.[0-9]+ ]] || [[ "$input" =~ ok\ [0-9]+ ]] || [[ "$input" =~ not\ ok\ [0-9]+ ]]; then
        echo "tap"
        return 0
    fi

    if [[ "$input" =~ ---\ PASS: ]] || [[ "$input" =~ ---\ FAIL: ]]; then
        echo "go"
        return 0
    fi

    echo "unknown"
    return 1
}

parse_test_results() {
    local framework="$1"
    local input="$2"

    if [ "$framework" = "auto" ]; then
        framework=$(auto_detect_framework "$input")
        if [ "$framework" = "unknown" ]; then
            echo '{"error":"Unable to auto-detect testing framework"}'
            return 1
        fi
    fi

    local output="$input"
    [ -f "$input" ] && output=$(cat "$input")

    case "$framework" in
        jest) parse_jest_output "$output" ;;
        mocha) parse_mocha_output "$output" ;;
        pytest) parse_pytest_output "$output" ;;
        tap) parse_tap_output "$output" ;;
        junit) parse_junit_xml "$input" ;;
        go) parse_go_test_output "$output" ;;
        *) echo '{"error":"Unknown framework"}' && return 1 ;;
    esac
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    [ $# -lt 2 ] && echo "Usage: $0 <framework|auto> <output_file_or_string>" && exit 1
    parse_test_results "$1" "$2"
fi
