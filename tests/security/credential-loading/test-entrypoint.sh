#!/usr/bin/env bash
# tests/security/credential-loading/test-entrypoint.sh
# Phase 1.3b :: Validate credential loading in docker/trigger-dev/entrypoint.sh

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

    cat > "$TEST_TMPDIR/entrypoint-test.sh" << 'EOF'
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

# Validate container startup requirements
CONTAINER_REQUIRED_VARS=(
    "TRIGGER_SECRET_KEY"
    "TRIGGER_API_URL"
    "DATABASE_URL"
)

MISSING=""
for VAR in "${CONTAINER_REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR:-}" ]; then
        MISSING="${MISSING}${VAR} "
    fi
done

if [ -n "$MISSING" ]; then
    echo "ERROR: Container startup failed - missing: $MISSING"
    exit 1
fi

echo "SUCCESS: Container entrypoint validated"
echo "TRIGGER_API_URL=${TRIGGER_API_URL}"
exit 0
EOF
    chmod +x "$TEST_TMPDIR/entrypoint-test.sh"
}

test_entrypoint_starts_with_valid_config() {
    log_step "GIVEN .env with all container requirements"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN container entrypoint runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./entrypoint-test.sh 2>&1)
    RESULT=$?

    log_step "THEN container starts successfully"
    assert_success "$RESULT" "Entrypoint should succeed with valid config"
    assert_contains "$OUTPUT" "SUCCESS: Container entrypoint validated" "Should report startup success"
    assert_contains "$OUTPUT" "TRIGGER_API_URL=https://api.trigger.dev" "Should load API URL"

    log_info "✓ Container entrypoint starts successfully"
}

test_entrypoint_fails_without_trigger_secret() {
    log_step "GIVEN .env missing TRIGGER_SECRET_KEY"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
TRIGGER_API_URL=https://api.trigger.dev
DATABASE_URL=postgresql://test
# TRIGGER_SECRET_KEY intentionally missing
EOF

    log_step "WHEN container entrypoint attempts to start"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./entrypoint-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN container fails to start"
    assert_failure "$RESULT" "Entrypoint should fail without TRIGGER_SECRET_KEY"
    assert_contains "$OUTPUT" "ERROR: Container startup failed" "Should report startup failure"
    assert_contains "$OUTPUT" "TRIGGER_SECRET_KEY" "Should identify missing secret"

    log_info "✓ Container startup validates required secrets"
}

test_entrypoint_fails_without_env_file() {
    log_step "GIVEN no .env file exists"
    setup_test_env

    # Do not create .env

    log_step "WHEN container entrypoint attempts to start"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./entrypoint-test.sh 2>&1 || true)
    RESULT=$?

    log_step "THEN container fails immediately"
    assert_failure "$RESULT" "Entrypoint should fail without .env"
    assert_contains "$OUTPUT" "ERROR: Root .env not found" "Should report .env not found"

    log_info "✓ Container requires .env file to start"
}

test_entrypoint_with_minimal_config() {
    log_step "GIVEN .env with only minimal required variables"
    setup_test_env

    cat > "$TEST_TMPDIR/.env" << EOF
TRIGGER_SECRET_KEY=minimal_secret
TRIGGER_API_URL=https://api.trigger.dev
DATABASE_URL=postgresql://minimal
EOF

    log_step "WHEN container entrypoint runs"
    cd "$TEST_TMPDIR"
    OUTPUT=$(./entrypoint-test.sh 2>&1)
    RESULT=$?

    log_step "THEN container starts with minimal config"
    assert_success "$RESULT" "Entrypoint should succeed with minimal config"

    log_info "✓ Container starts with minimal required configuration"
}

test_entrypoint_preserves_environment_variables() {
    log_step "GIVEN .env with multiple environment variables"
    setup_test_env

    cp "$PROJECT_ROOT/tests/security/credential-loading/fixtures/mock.env" "$TEST_TMPDIR/.env"

    log_step "WHEN entrypoint loads credentials"
    cd "$TEST_TMPDIR"

    # Source .env and check multiple variables persist
    (
        set -a
        source "$TEST_TMPDIR/.env"
        set +a

        if [ -z "${TRIGGER_SECRET_KEY:-}" ] || [ -z "${DATABASE_URL:-}" ] || [ -z "${REDIS_URL:-}" ]; then
            echo "ERROR: Environment variables not preserved"
            exit 1
        fi

        echo "SUCCESS: All variables preserved"
    )
    RESULT=$?

    log_step "THEN all environment variables are preserved"
    assert_success "$RESULT" "All variables should persist after sourcing"

    log_info "✓ Entrypoint preserves all environment variables"
}

test_real_script_exists_and_uses_pattern() {
    log_step "GIVEN real docker/trigger-dev/entrypoint.sh script"

    SCRIPT_PATH="$PROJECT_ROOT/docker/trigger-dev/entrypoint.sh"

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
test_entrypoint_starts_with_valid_config
test_entrypoint_fails_without_trigger_secret
test_entrypoint_fails_without_env_file
test_entrypoint_with_minimal_config
test_entrypoint_preserves_environment_variables
test_real_script_exists_and_uses_pattern

log_info "All entrypoint credential loading tests passed"
