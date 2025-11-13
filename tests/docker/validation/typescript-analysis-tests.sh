#!/bin/bash
# tests/docker/typescript-analysis-tests.sh
# Phase 4 :: P1 - TypeScript error analysis validation (Bug #10 TypeScript iteration support)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

# Configuration
TEST_DIR="$(create_temp_dir)"

cleanup() {
    log_step "Cleaning up test files"
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: TypeScript error parsing accuracy
test_error_parsing() {
    log_step "Test 1: TypeScript error parsing accuracy (tsc output)"

    # GIVEN: Sample tsc output with multiple error formats
    local tsc_output="$TEST_DIR/tsc-output.txt"
    cat > "$tsc_output" <<'EOF'
src/agent.ts(45,12): error TS2304: Cannot find name 'Redis'.
src/coordinator.ts(123,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils/helper.ts(67,20): error TS2339: Property 'nonExistent' does not exist on type 'Config'.
src/cli/spawn.ts(89,15): error TS7006: Parameter 'options' implicitly has an 'any' type.
EOF

    # WHEN: Parse error lines using TypeScript error pattern
    # Pattern: file.ts(line,col): error TS####: message
    local error_pattern='([^(]+)\(([0-9]+),([0-9]+)\): error (TS[0-9]+): (.+)$'
    local parsed_errors=()

    while IFS= read -r line; do
        if [[ "$line" =~ $error_pattern ]]; then
            local file="${BASH_REMATCH[1]}"
            local line_num="${BASH_REMATCH[2]}"
            local col="${BASH_REMATCH[3]}"
            local code="${BASH_REMATCH[4]}"
            local message="${BASH_REMATCH[5]}"
            parsed_errors+=("$file:$line_num:$code")
        fi
    done < "$tsc_output"

    # THEN: Should parse all 4 errors correctly
    if [ ${#parsed_errors[@]} -eq 4 ]; then
        log_success "Parsed 4 TypeScript errors correctly"
    else
        log_error "Expected 4 errors, parsed ${#parsed_errors[@]}"
        return 1
    fi

    # THEN: Verify specific error codes were captured
    if printf '%s\n' "${parsed_errors[@]}" | grep -q "TS2304"; then
        log_success "Detected TS2304 (Cannot find name)"
    else
        log_error "Failed to detect TS2304 error"
        return 1
    fi

    if printf '%s\n' "${parsed_errors[@]}" | grep -q "TS2322"; then
        log_success "Detected TS2322 (Type mismatch)"
    else
        log_error "Failed to detect TS2322 error"
        return 1
    fi
}

# Test 2: Error count validation across iterations
test_error_count_validation() {
    log_step "Test 2: Error count validation"

    # GIVEN: Three iterations with decreasing error counts
    local iteration1="$TEST_DIR/iteration1-errors.txt"
    local iteration2="$TEST_DIR/iteration2-errors.txt"
    local iteration3="$TEST_DIR/iteration3-errors.txt"

    # Iteration 1: 5 errors
    cat > "$iteration1" <<'EOF'
src/file1.ts(10,5): error TS2304: Cannot find name 'foo'.
src/file2.ts(20,10): error TS2322: Type mismatch.
src/file3.ts(30,15): error TS2339: Property missing.
src/file4.ts(40,20): error TS7006: Implicit any.
src/file5.ts(50,25): error TS2345: Argument error.
EOF

    # Iteration 2: 3 errors (progress)
    cat > "$iteration2" <<'EOF'
src/file2.ts(20,10): error TS2322: Type mismatch.
src/file3.ts(30,15): error TS2339: Property missing.
src/file5.ts(50,25): error TS2345: Argument error.
EOF

    # Iteration 3: 0 errors (complete)
    touch "$iteration3"

    # WHEN: Count errors in each iteration
    # Strip newlines to avoid "integer expression expected" errors
    local count1 count2 count3
    count1=$(grep -c "error TS" "$iteration1" 2>/dev/null || echo 0)
    count1=${count1//[^0-9]/}  # Remove any non-numeric chars including newlines
    count2=$(grep -c "error TS" "$iteration2" 2>/dev/null || echo 0)
    count2=${count2//[^0-9]/}
    count3=$(grep -c "error TS" "$iteration3" 2>/dev/null || echo 0)
    count3=${count3//[^0-9]/}

    log_info "Error counts: Iter1=$count1, Iter2=$count2, Iter3=$count3"

    # THEN: Error count should decrease monotonically
    if [ "$count1" -gt "$count2" ] && [ "$count2" -gt "$count3" ]; then
        log_success "Error count decreased monotonically (5 → 3 → 0)"
    else
        log_error "Error count did not decrease monotonically"
        return 1
    fi

    # THEN: Validate error delta using helper
    validate_error_delta "$count1" "$count2" || {
        log_error "Iteration 1→2 did not reduce errors"
        return 1
    }

    validate_error_delta "$count2" "$count3" || {
        log_error "Iteration 2→3 did not reduce errors"
        return 1
    }
}

# Test 3: File-to-error mapping
test_file_error_mapping() {
    log_step "Test 3: File-to-error mapping"

    # GIVEN: Errors spanning multiple files
    local tsc_output="$TEST_DIR/tsc-file-mapping.txt"
    cat > "$tsc_output" <<'EOF'
src/agent.ts(45,12): error TS2304: Cannot find name 'Redis'.
src/agent.ts(67,20): error TS2339: Property 'connect' missing.
src/coordinator.ts(123,5): error TS2322: Type mismatch.
src/coordinator.ts(145,10): error TS2345: Argument error.
src/coordinator.ts(167,15): error TS7006: Implicit any.
src/utils/helper.ts(89,25): error TS2304: Cannot find name 'Config'.
EOF

    # WHEN: Build file-to-error-count mapping
    declare -A file_errors
    local error_pattern='([^(]+)\([0-9]+,[0-9]+\): error TS[0-9]+:'

    while IFS= read -r line; do
        if [[ "$line" =~ $error_pattern ]]; then
            local file="${BASH_REMATCH[1]}"
            file_errors["$file"]=$((${file_errors[$file]:-0} + 1))
        fi
    done < "$tsc_output"

    # THEN: Verify file error counts
    if [ "${file_errors[src/agent.ts]}" -eq 2 ]; then
        log_success "src/agent.ts: 2 errors"
    else
        log_error "Expected 2 errors in agent.ts, got ${file_errors[src/agent.ts]:-0}"
        return 1
    fi

    if [ "${file_errors[src/coordinator.ts]}" -eq 3 ]; then
        log_success "src/coordinator.ts: 3 errors"
    else
        log_error "Expected 3 errors in coordinator.ts, got ${file_errors[src/coordinator.ts]:-0}"
        return 1
    fi

    if [ "${file_errors[src/utils/helper.ts]}" -eq 1 ]; then
        log_success "src/utils/helper.ts: 1 error"
    else
        log_error "Expected 1 error in helper.ts, got ${file_errors[src/utils/helper.ts]:-0}"
        return 1
    fi

    # THEN: Identify files with most errors (prioritization)
    local max_errors=0
    local max_file=""

    for file in "${!file_errors[@]}"; do
        if [ "${file_errors[$file]}" -gt "$max_errors" ]; then
            max_errors="${file_errors[$file]}"
            max_file="$file"
        fi
    done

    if [ "$max_file" = "src/coordinator.ts" ] && [ "$max_errors" -eq 3 ]; then
        log_success "Identified highest priority file: $max_file ($max_errors errors)"
    else
        log_error "Failed to identify highest priority file"
        return 1
    fi
}

# Test 4: Error severity classification
test_error_severity() {
    log_step "Test 4: Error severity classification"

    # GIVEN: Different TypeScript error codes with varying severity
    local tsc_output="$TEST_DIR/tsc-severity.txt"
    cat > "$tsc_output" <<'EOF'
src/file1.ts(10,5): error TS2304: Cannot find name 'Module'.
src/file2.ts(20,10): error TS2322: Type 'string' is not assignable to type 'number'.
src/file3.ts(30,15): error TS7006: Parameter implicitly has 'any' type.
src/file4.ts(40,20): error TS2339: Property 'foo' does not exist on type 'Bar'.
src/file5.ts(50,25): error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.
EOF

    # WHEN: Classify errors by severity
    # Critical: TS2304 (missing imports), TS2339 (missing properties)
    # High: TS2322 (type mismatch), TS2345 (argument type)
    # Medium: TS7006 (implicit any)

    local critical_count=0
    local high_count=0
    local medium_count=0

    while IFS= read -r line; do
        if [[ "$line" =~ error\ (TS[0-9]+): ]]; then
            local code="${BASH_REMATCH[1]}"
            case "$code" in
                TS2304|TS2339) critical_count=$((critical_count + 1)) ;;
                TS2322|TS2345) high_count=$((high_count + 1)) ;;
                TS7006) medium_count=$((medium_count + 1)) ;;
            esac
        fi
    done < "$tsc_output"

    log_info "Severity distribution: Critical=$critical_count, High=$high_count, Medium=$medium_count"

    # THEN: Verify classification counts
    if [ "$critical_count" -eq 2 ]; then
        log_success "Classified 2 critical errors (TS2304, TS2339)"
    else
        log_error "Expected 2 critical errors, got $critical_count"
        return 1
    fi

    if [ "$high_count" -eq 2 ]; then
        log_success "Classified 2 high severity errors (TS2322, TS2345)"
    else
        log_error "Expected 2 high errors, got $high_count"
        return 1
    fi

    if [ "$medium_count" -eq 1 ]; then
        log_success "Classified 1 medium severity error (TS7006)"
    else
        log_error "Expected 1 medium error, got $medium_count"
        return 1
    fi

    # THEN: Critical errors should be prioritized
    local total_errors=$((critical_count + high_count + medium_count))
    local critical_pct=$(( (critical_count * 100) / total_errors ))

    if [ "$critical_pct" -ge 30 ]; then
        log_success "Critical errors: ${critical_pct}% (prioritization needed)"
    else
        log_info "Critical errors: ${critical_pct}%"
    fi
}

# Execute all tests
setup_test "typescript-analysis"

test_error_parsing
test_error_count_validation
test_file_error_mapping
test_error_severity

teardown_test
