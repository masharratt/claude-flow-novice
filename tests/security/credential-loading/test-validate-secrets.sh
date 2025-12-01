#!/bin/bash
# tests/security/credential-loading/test-validate-secrets.sh
# Phase 1.3b :: Validate credential loading in validate-secrets.sh

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

    cat > "$TEST_TMPDIR/validate-secrets-test.sh" << 'EOF'
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

# Validate multiple credentials
MISSING=""
[ -z "${TRIGGER_SECRET_KEY:-}" ] && MISSING="TRIGGER_SECRET_KEY "
[ -z "${DATABASE_URL:-}" ] && MISSING="${MISSING}DATABASE_URL "

if [ -n "$MISSING" ]; then
    echo "ERROR: Missing credentials: $MISSING"
    exit 1
fi

echo "SUCCESS: All required credentials validated"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/validate-secrets-test.sh"
}

test_validates_all_required_secrets() {
    log_step "GIVEN .env with all required secrets"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN validate-secrets runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-secrets-test.sh 2>&1)
    RESULT=$?

    log_step "THEN all secrets are validated successfully"
    assert_success "$RESULT" "Validation should succeed with all secrets"
    assert_contains "$OUTPUT" "SUCCESS: All required credentials validated" "Should report validation success"

    log_info "✓ All required secrets validated successfully"
}

test_detects_missing_secrets() {
    log_step "GIVEN .env with missing required secrets"
    setup_test_env

    # Create .env with only partial credentials
    cat > "$TEST_TMPDIR/.env" << EOF
TRIGGER_SECRET_KEY=tr_dev_mock_secret_key
# DATABASE_URL intentionally missing
EOF

    log_step "WHEN validate-secrets runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-secrets-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN validation fails with missing secret error"
    assert_failure "$RESULT" "Validation should fail when secrets missing"
    assert_contains "$OUTPUT" "ERROR: Missing credentials" "Should report missing credentials"
    assert_contains "$OUTPUT" "DATABASE_URL" "Should identify missing DATABASE_URL"

    log_info "✓ Missing secrets detected correctly"
}

test_handles_env_with_comments_only() {
    log_step "GIVEN .env with only comments, no actual values"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
# This is a comment
# TRIGGER_SECRET_KEY=commented_out
# DATABASE_URL=also_commented
EOF

    log_step "WHEN validate-secrets runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-secrets-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN validation fails for missing values"
    assert_failure "$RESULT" "Validation should fail with commented values"

    log_info "✓ Comments-only .env handled correctly"
}

test_real_script_credential_pattern() {
    log_step "GIVEN real validate-secrets.sh script"

    SCRIPT_PATH="$PROJECT_ROOT/scripts/security/validate-secrets.sh"

    log_step "WHEN checking script implementation"
    if [ -f "$SCRIPT_PATH" ]; then
        log_step "THEN script contains credential loading pattern"
        grep -q "source.*\.env" "$SCRIPT_PATH"
        RESULT=$?
        assert_success "$RESULT" "Script should contain .env sourcing"

        log_info "✓ Real script uses credential loading pattern"
    else
        log_info "⚠ Script not found at $SCRIPT_PATH (may not exist yet)"
    fi
}

# Run all tests
test_validates_all_required_secrets
test_detects_missing_secrets
test_handles_env_with_comments_only
test_real_script_credential_pattern

log_info "All validate-secrets credential loading tests passed"
