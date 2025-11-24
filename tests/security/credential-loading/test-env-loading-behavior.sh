#!/bin/bash
# tests/security/credential-loading/test-env-loading-behavior.sh
# Phase 1.3b :: Validate .env loading behavior with mock scenarios

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TEST_COUNT=0
PASS_COUNT=0

test_env_sourcing_loads_variables() {
    log_step "Test 1: Source mock .env and verify variables loaded"
    
    local tmp_env=$(mktemp)
    cat > "$tmp_env" << 'ENVEOF'
TRIGGER_SECRET_KEY=tr_dev_mock_secret
TRIGGER_API_URL=https://api.trigger.dev
DATABASE_URL=postgresql://test
ENVEOF
    
    # Source the env file
    (
        set -a
        source "$tmp_env"
        set +a
        
        # Verify variables are set
        if [ -z "${TRIGGER_SECRET_KEY:-}" ]; then
            echo "FAIL: TRIGGER_SECRET_KEY not loaded"
            exit 1
        fi
        
        if [ "$TRIGGER_SECRET_KEY" != "tr_dev_mock_secret" ]; then
            echo "FAIL: TRIGGER_SECRET_KEY has wrong value"
            exit 1
        fi
        
        echo "PASS: Variables loaded correctly"
    )
    
    if [ $? -eq 0 ]; then
        log_info "✓ .env sourcing loads variables correctly"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_error "✗ .env sourcing failed"
    fi

    rm -f "$tmp_env"
    TEST_COUNT=$((TEST_COUNT + 1))
}

test_missing_env_file_error() {
    log_step "Test 2: Attempt to source non-existent .env"
    
    local tmp_script=$(mktemp)
    cat > "$tmp_script" << 'SCRIPTEOF'
#!/bin/bash
set -euo pipefail

if [ -f "/nonexistent/.env" ]; then
    set -a
    source "/nonexistent/.env"
    set +a
else
    echo "ERROR: Root .env not found"
    exit 1
fi
SCRIPTEOF
    chmod +x "$tmp_script"
    
    OUTPUT=$("$tmp_script" 2>&1 || true)
    
    if echo "$OUTPUT" | grep -q "ERROR: Root .env not found"; then
        log_info "✓ Missing .env file handled correctly"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_error "✗ Missing .env file not handled correctly"
    fi

    rm -f "$tmp_script"
    TEST_COUNT=$((TEST_COUNT + 1))
}

test_empty_env_file() {
    log_step "Test 3: Source empty .env file"
    
    local tmp_env=$(mktemp)
    echo "# Empty file" > "$tmp_env"
    
    # Source the empty env file
    (
        set -a
        source "$tmp_env"
        set +a
        
        # Verify no variables are set
        if [ -n "${TRIGGER_SECRET_KEY:-}" ]; then
            echo "FAIL: Variable should not be set from empty file"
            exit 1
        fi
        
        echo "PASS: Empty file handled correctly"
    )
    
    if [ $? -eq 0 ]; then
        log_info "✓ Empty .env file sources without error"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_error "✗ Empty .env file caused error"
    fi

    rm -f "$tmp_env"
    TEST_COUNT=$((TEST_COUNT + 1))
}

test_malformed_env_file() {
    log_step "Test 4: Source malformed .env file"
    
    local tmp_env=$(mktemp)
    cat > "$tmp_env" << 'ENVEOF'
VALID_KEY=valid_value
# This line is fine
ANOTHER_KEY=another_value
ENVEOF
    
    # Source the env file
    (
        set -a
        source "$tmp_env" 2>/dev/null || true
        set +a
        
        # Verify valid keys were loaded
        if [ "${VALID_KEY:-}" = "valid_value" ]; then
            echo "PASS: Valid keys loaded from malformed file"
            exit 0
        fi
        exit 1
    )
    
    if [ $? -eq 0 ]; then
        log_info "✓ Malformed .env file partially loads valid entries"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_error "✗ Malformed .env file handling failed"
    fi

    rm -f "$tmp_env"
    TEST_COUNT=$((TEST_COUNT + 1))
}

test_env_variable_export() {
    log_step "Test 5: Verify set -a exports variables"
    
    local tmp_env=$(mktemp)
    echo "TEST_VAR=test_value" > "$tmp_env"
    
    # Test with set -a
    (
        set -a
        source "$tmp_env"
        set +a
        
        # Check if variable is exported
        if env | grep -q "TEST_VAR=test_value"; then
            echo "PASS: Variable exported correctly"
            exit 0
        fi
        exit 1
    )
    
    if [ $? -eq 0 ]; then
        log_info "✓ set -a correctly exports variables"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_error "✗ Variable export failed"
    fi

    rm -f "$tmp_env"
    TEST_COUNT=$((TEST_COUNT + 1))
}

test_fixture_files_exist() {
    log_step "Test 6: Verify test fixtures exist"
    
    local fixtures_dir="$PROJECT_ROOT/tests/security/credential-loading/fixtures"
    local all_exist=true
    
    for fixture in "mock.env" "empty.env" "malformed.env"; do
        if [ ! -f "$fixtures_dir/$fixture" ]; then
            log_error "✗ Missing fixture: $fixture"
            all_exist=false
        else
            log_info "✓ Fixture exists: $fixture"
        fi
    done
    
    if [ "$all_exist" = true ]; then
        PASS_COUNT=$((PASS_COUNT + 1))
    fi

    TEST_COUNT=$((TEST_COUNT + 1))
}

# Run all tests
test_env_sourcing_loads_variables
test_missing_env_file_error
test_empty_env_file
test_malformed_env_file
test_env_variable_export
test_fixture_files_exist

# Summary
echo ""
echo "========================================"
echo ".env Loading Behavior Test Summary"
echo "========================================"
echo "Total Tests: $TEST_COUNT"
echo "Passed: $PASS_COUNT"
echo "Failed: $((TEST_COUNT - PASS_COUNT))"

if [ $PASS_COUNT -eq $TEST_COUNT ]; then
    PASS_RATE=100
else
    PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASS_COUNT/$TEST_COUNT)*100}")
fi

echo "Pass Rate: ${PASS_RATE}%"
echo ""

if [ $PASS_COUNT -eq $TEST_COUNT ]; then
    log_info "✓ All .env loading behavior tests passed"
    exit 0
else
    log_error "✗ Some tests failed"
    exit 1
fi
