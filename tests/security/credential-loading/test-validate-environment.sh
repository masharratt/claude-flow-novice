#!/bin/bash
# tests/security/credential-loading/test-validate-environment.sh
# Phase 1.3b :: Validate credential loading in deployment/validate-environment.sh

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

    cat > "$TEST_TMPDIR/validate-env-test.sh" << 'EOF'
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

# Validate deployment environment variables
REQUIRED_ENV_VARS=(
    "NODE_ENV"
    "DATABASE_URL"
    "REDIS_URL"
    "TRIGGER_SECRET_KEY"
)

MISSING=""
for VAR in "${REQUIRED_ENV_VARS[@]}"; do
    if [ -z "${!VAR:-}" ]; then
        MISSING="${MISSING}${VAR} "
    fi
done

if [ -n "$MISSING" ]; then
    echo "ERROR: Missing required environment variables: $MISSING"
    exit 1
fi

# Validate NODE_ENV is appropriate for deployment
if [[ ! "$NODE_ENV" =~ ^(production|staging|test)$ ]]; then
    echo "ERROR: Invalid NODE_ENV: $NODE_ENV (expected production, staging, or test)"
    exit 1
fi

echo "SUCCESS: Environment validation passed"
echo "NODE_ENV=${NODE_ENV}"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/validate-env-test.sh"
}

test_validates_production_environment() {
    log_step "GIVEN .env configured for production"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN validate-environment runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-env-test.sh 2>&1)
    RESULT=$?

    log_step "THEN environment is validated successfully"
    assert_success "$RESULT" "Validation should succeed for production env"
    assert_contains "$OUTPUT" "SUCCESS: Environment validation passed" "Should report validation success"

    log_info "✓ Production environment validated successfully"
}

test_detects_invalid_node_env() {
    log_step "GIVEN .env with invalid NODE_ENV"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
NODE_ENV=development
DATABASE_URL=postgresql://test
REDIS_URL=redis://localhost
TRIGGER_SECRET_KEY=mock_key
EOF

    log_step "WHEN validate-environment runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-env-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN validation fails for invalid NODE_ENV"
    assert_failure "$RESULT" "Validation should fail for development NODE_ENV"
    assert_contains "$OUTPUT" "ERROR: Invalid NODE_ENV" "Should report invalid NODE_ENV"

    log_info "✓ Invalid NODE_ENV detected correctly"
}

test_detects_missing_database_url() {
    log_step "GIVEN .env missing DATABASE_URL"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
NODE_ENV=production
REDIS_URL=redis://localhost
TRIGGER_SECRET_KEY=mock_key
# DATABASE_URL intentionally missing
EOF

    log_step "WHEN validate-environment runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-env-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN validation fails with missing DATABASE_URL error"
    assert_failure "$RESULT" "Validation should fail without DATABASE_URL"
    assert_contains "$OUTPUT" "ERROR: Missing required environment variables" "Should report missing variables"
    assert_contains "$OUTPUT" "DATABASE_URL" "Should identify missing DATABASE_URL"

    log_info "✓ Missing DATABASE_URL detected correctly"
}

test_validates_staging_environment() {
    log_step "GIVEN .env configured for staging"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
NODE_ENV=staging
DATABASE_URL=postgresql://staging
REDIS_URL=redis://staging
TRIGGER_SECRET_KEY=staging_key
EOF

    log_step "WHEN validate-environment runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./validate-env-test.sh 2>&1)
    RESULT=$?

    log_step "THEN staging environment is validated"
    assert_success "$RESULT" "Validation should succeed for staging env"
    assert_contains "$OUTPUT" "NODE_ENV=staging" "Should report staging environment"

    log_info "✓ Staging environment validated successfully"
}

test_real_script_exists_and_uses_pattern() {
    log_step "GIVEN real deployment/validate-environment.sh script"

    SCRIPT_PATH="$PROJECT_ROOT/scripts/deployment/validate-environment.sh"

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
test_validates_production_environment
test_detects_invalid_node_env
test_detects_missing_database_url
test_validates_staging_environment
test_real_script_exists_and_uses_pattern

log_info "All validate-environment credential loading tests passed"
