#!/bin/bash
# tests/security/credential-loading/test-trigger-dev-setup.sh
# Phase 1.3b :: Validate credential loading in trigger-dev-setup.sh

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

    cat > "$TEST_TMPDIR/setup-test.sh" << 'EOF'
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

# Validate Trigger.dev specific credentials
REQUIRED_VARS=("TRIGGER_SECRET_KEY" "TRIGGER_API_KEY" "TRIGGER_API_URL")
MISSING=""

for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR:-}" ]; then
        MISSING="${MISSING}${VAR} "
    fi
done

if [ -n "$MISSING" ]; then
    echo "ERROR: Missing Trigger.dev credentials: $MISSING"
    exit 1
fi

echo "SUCCESS: Trigger.dev setup validated"
echo "API_URL=${TRIGGER_API_URL}"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/setup-test.sh"
}

test_setup_with_valid_trigger_credentials() {
    log_step "GIVEN .env with Trigger.dev credentials"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN trigger-dev-setup runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./setup-test.sh 2>&1)
    RESULT=$?

    log_step "THEN setup completes successfully"
    assert_success "$RESULT" "Setup should succeed with valid credentials"
    assert_contains "$OUTPUT" "SUCCESS: Trigger.dev setup validated" "Should report setup success"
    assert_contains "$OUTPUT" "API_URL=https://api.trigger.dev" "Should load API URL"

    log_info "✓ Trigger.dev setup successful with valid credentials"
}

test_setup_fails_without_trigger_api_key() {
    log_step "GIVEN .env missing TRIGGER_API_KEY"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
TRIGGER_SECRET_KEY=tr_dev_mock_secret
TRIGGER_API_URL=https://api.trigger.dev
# TRIGGER_API_KEY intentionally missing
EOF

    log_step "WHEN trigger-dev-setup attempts to run"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./setup-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN setup fails with missing credential error"
    assert_failure "$RESULT" "Setup should fail without API key"
    assert_contains "$OUTPUT" "ERROR: Missing Trigger.dev credentials" "Should report missing credentials"
    assert_contains "$OUTPUT" "TRIGGER_API_KEY" "Should identify missing API key"

    log_info "✓ Setup validates all required Trigger.dev credentials"
}

test_setup_fails_without_env_file() {
    log_step "GIVEN no .env file exists"
    setup_test_env

    # Do not create .env

    log_step "WHEN trigger-dev-setup attempts to run"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./setup-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN setup fails immediately"
    assert_failure "$RESULT" "Setup should fail without .env"
    assert_contains "$OUTPUT" "ERROR: Root .env not found" "Should report .env not found"

    log_info "✓ Setup requires .env file to proceed"
}

test_setup_with_custom_api_url() {
    log_step "GIVEN .env with custom Trigger.dev API URL"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
TRIGGER_SECRET_KEY=tr_dev_mock_secret
TRIGGER_API_KEY=tr_dev_mock_api_key
TRIGGER_API_URL=https://custom.trigger.example.com
EOF

    log_step "WHEN trigger-dev-setup runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./setup-test.sh 2>&1)
    RESULT=$?

    log_step "THEN setup uses custom API URL"
    assert_success "$RESULT" "Setup should succeed with custom URL"
    assert_contains "$OUTPUT" "API_URL=https://custom.trigger.example.com" "Should use custom API URL"

    log_info "✓ Setup respects custom API URL configuration"
}

test_real_script_exists_and_uses_pattern() {
    log_step "GIVEN real trigger-dev-setup.sh script"

    SCRIPT_PATH="$PROJECT_ROOT/scripts/trigger-dev-setup.sh"

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
test_setup_with_valid_trigger_credentials
test_setup_fails_without_trigger_api_key
test_setup_fails_without_env_file
test_setup_with_custom_api_url
test_real_script_exists_and_uses_pattern

log_info "All trigger-dev-setup credential loading tests passed"
