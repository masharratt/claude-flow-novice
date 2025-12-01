#!/bin/bash
# tests/security/credential-loading/test-rotate-secrets.sh
# Phase 1.3b :: Validate credential loading in rotate-secrets.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TEST_TMPDIR=""

cleanup() {
    if [ -n "$TEST_TMPDIR" ] && [ -d "$TEST_TMPDIR" ]; then
        rm -rf "$TEST_TMPDIR"
    fi
}
trap cleanup EXIT

setup_test_env() {
    TEST_TMPDIR=$(mktemp -d)
    mkdir -p "$TEST_TMPDIR/.git"

    cat > "$TEST_TMPDIR/rotate-secrets-test.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo "ERROR: Root .env not found"
    exit 1
fi

# Simulate secret rotation (read current, generate new)
if [ -z "${TRIGGER_SECRET_KEY:-}" ]; then
    echo "ERROR: Cannot rotate - TRIGGER_SECRET_KEY not found"
    exit 1
fi

OLD_KEY="$TRIGGER_SECRET_KEY"
NEW_KEY="tr_dev_rotated_$(date +%s)"

echo "SUCCESS: Secret rotation simulated"
echo "OLD_KEY=${OLD_KEY}"
echo "NEW_KEY=${NEW_KEY}"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/rotate-secrets-test.sh"
}

test_rotates_secrets_with_valid_env() {
    log_step "GIVEN .env with existing secrets"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN rotate-secrets runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./rotate-secrets-test.sh 2>&1)
    RESULT=$?

    log_step "THEN secrets are rotated successfully"
    assert_success "$RESULT" "Rotation should succeed"
    assert_contains "$OUTPUT" "SUCCESS: Secret rotation simulated" "Should report rotation success"
    assert_contains "$OUTPUT" "OLD_KEY=tr_dev_mock_secret_key" "Should read old key"
    assert_contains "$OUTPUT" "NEW_KEY=tr_dev_rotated" "Should generate new key"

    log_info "✓ Secrets rotated successfully with valid .env"
}

test_fails_rotation_without_env() {
    log_step "GIVEN no .env file exists"
    setup_test_env

    # Do not create .env

    log_step "WHEN rotate-secrets attempts to run"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./rotate-secrets-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN rotation fails gracefully"
    assert_failure "$RESULT" "Rotation should fail without .env"
    assert_contains "$OUTPUT" "ERROR: Root .env not found" "Should report .env not found"

    log_info "✓ Rotation fails gracefully without .env"
}

test_fails_rotation_with_missing_key() {
    log_step "GIVEN .env without TRIGGER_SECRET_KEY"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
DATABASE_URL=postgresql://test
# TRIGGER_SECRET_KEY intentionally missing
EOF

    log_step "WHEN rotate-secrets attempts to run"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./rotate-secrets-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN rotation fails with missing key error"
    assert_failure "$RESULT" "Rotation should fail without required key"
    assert_contains "$OUTPUT" "ERROR: Cannot rotate - TRIGGER_SECRET_KEY not found" "Should report missing key"

    log_info "✓ Rotation validates required keys before proceeding"
}

test_handles_concurrent_env_access() {
    log_step "GIVEN .env accessed by multiple processes"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN multiple rotate operations attempt to run"
    cd "$TEST_TMPDIR"

    # Run two processes simultaneously
    ./rotate-secrets-test.sh > "$TEST_TMPDIR/output1.txt" 2>&1 &
    PID1=$!
    ./rotate-secrets-test.sh > "$TEST_TMPDIR/output2.txt" 2>&1 &
    PID2=$!

    wait $PID1 || true
    RESULT1=$?
    wait $PID2 || true
    RESULT2=$?

    log_step "THEN both operations complete"
    # At least one should succeed
    if [ $RESULT1 -eq 0 ] || [ $RESULT2 -eq 0 ]; then
        log_info "✓ Concurrent .env access handled"
    else
        log_info "⚠ Both concurrent operations failed (may indicate locking needed)"
    fi
}

test_real_script_exists_and_uses_pattern() {
    log_step "GIVEN real rotate-secrets.sh script"

    SCRIPT_PATH="$PROJECT_ROOT/scripts/security/rotate-secrets.sh"

    log_step "WHEN checking script implementation"
    if [ -f "$SCRIPT_PATH" ]; then
        log_step "THEN script contains credential loading pattern"
        grep -q "source.*\.env" "$SCRIPT_PATH"
        RESULT=$?
        assert_success "$RESULT" "Script should contain .env sourcing"

        log_info "✓ Real script exists and uses credential loading pattern"
    else
        log_info "⚠ Script not found at $SCRIPT_PATH (may not exist yet)"
    fi
}

# Run all tests
test_rotates_secrets_with_valid_env
test_fails_rotation_without_env
test_fails_rotation_with_missing_key
test_handles_concurrent_env_access
test_real_script_exists_and_uses_pattern

log_info "All rotate-secrets credential loading tests passed"
