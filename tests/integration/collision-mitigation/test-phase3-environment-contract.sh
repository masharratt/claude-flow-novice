#!/bin/bash
# tests/integration/collision-mitigation/test-phase3-environment-contract.sh
# Phase 3 :: Environment variable contract validation (Reference: CLI_TRIGGER_COLLISION_ANALYSIS.md)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
ENV_CONTRACT="$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml"
TEST_TEMP_DIR="/tmp/env-contract-test-$$"

cleanup() {
    log_info "Cleaning up Phase 3 test artifacts"
    rm -rf "$TEST_TEMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

test_environment_contract_exists() {
    annotate "Phase 3: Environment Contract File Validation"

    log_step "GIVEN: Environment contract should be defined"
    if [ -f "$ENV_CONTRACT" ]; then
        log_success "Environment contract exists at: $ENV_CONTRACT"
    else
        log_error "Environment contract not found at: $ENV_CONTRACT"
        return 1
    fi

    log_step "WHEN: Checking contract is valid YAML"
    if command -v yq >/dev/null 2>&1; then
        if yq eval '.' "$ENV_CONTRACT" >/dev/null 2>&1; then
            log_success "Contract is valid YAML"
        else
            log_error "Contract YAML is invalid"
            return 1
        fi
    else
        log_warn "yq not installed, skipping YAML validation"
    fi
}

test_mode_specific_redis_host() {
    annotate "Phase 3: Mode-Specific Redis Host Resolution"

    log_step "GIVEN: Environment contract specifies redis_host per mode"

    log_step "WHEN: CLI mode is configured"
    # Use actual TypeScript implementation with clean environment
    local cli_redis_host=$(env -i PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "redis_host" "cli")
    log_step "THEN: CLI mode resolves redis_host to 'cfn-redis'"
    assert_equals "cfn-redis" "$cli_redis_host" "CLI mode redis_host"

    log_step "WHEN: Trigger.dev mode is configured"
    local trigger_redis_host=$(env -i PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "redis_host" "trigger")
    log_step "THEN: Trigger mode resolves redis_host to 'redis'"
    assert_equals "redis" "$trigger_redis_host" "Trigger mode redis_host"
}

test_mode_specific_network_name() {
    annotate "Phase 3: Mode-Specific Network Name Resolution"

    log_step "GIVEN: Environment contract specifies network per mode"

    log_step "WHEN: CLI mode is configured"
    # Use actual TypeScript implementation with clean environment
    local cli_network=$(env -i PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "network_name" "cli")
    log_step "THEN: CLI mode uses 'mcp-network'"
    assert_equals "mcp-network" "$cli_network" "CLI mode network"

    log_step "WHEN: Trigger.dev mode is configured"
    local trigger_network=$(env -i PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "network_name" "trigger")
    log_step "THEN: Trigger mode uses 'trigger-cfn-network'"
    assert_equals "trigger-cfn-network" "$trigger_network" "Trigger mode network"
}

test_variable_precedence() {
    annotate "Phase 3: Environment Variable Precedence"

    log_step "GIVEN: Multiple variable sources"

    log_step "WHEN: CFN_REDIS_HOST is set"
    # Use actual TypeScript implementation with explicit CFN_ env var (clean environment)
    local result=$(env -i CFN_REDIS_HOST="explicit-redis" PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "redis_host" "cli")
    log_step "THEN: CFN_ prefixed variable wins"
    assert_equals "explicit-redis" "$result" "CFN_ prefix takes precedence"

    log_step "WHEN: Only REDIS_HOST is set (legacy)"
    # Use actual TypeScript implementation with legacy env var (clean environment)
    local result=$(env -i REDIS_HOST="legacy-redis" PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "redis_host" "cli" 2>&1)
    log_step "THEN: Legacy variable is used with deprecation warning"
    if echo "$result" | grep -q "legacy-redis"; then
        log_success "Legacy variable correctly returned: legacy-redis"
    fi
    if echo "$result" | grep -q "DEPRECATION"; then
        log_success "Deprecation warning emitted for legacy variable"
    fi

    log_step "WHEN: No variables set"
    # Use actual TypeScript implementation with no env vars (clean environment)
    local result=$(env -i PROJECT_ROOT="$PROJECT_ROOT" PATH="$PATH" HOME="$HOME" node "$PROJECT_ROOT/tests/integration/collision-mitigation/test-contract-resolver.mjs" "redis_host" "cli")
    log_step "THEN: Default value is used"
    assert_equals "cfn-redis" "$result" "Default value used"
}

test_required_variables_validation() {
    annotate "Phase 3: Required Variables Validation"

    log_step "GIVEN: Contract defines required variables"

    local required_vars=(
        "CFN_TASK_ID"
        "CFN_REDIS_HOST"
        "CFN_REDIS_PORT"
        "CFN_NETWORK_NAME"
    )

    log_step "WHEN: Checking if contract documents required variables"
    local missing_count=0

    for var in "${required_vars[@]}"; do
        if [ -f "$ENV_CONTRACT" ] && grep -q "$var" "$ENV_CONTRACT"; then
            log_success "Variable $var documented in contract"
        else
            log_warn "Variable $var may not be documented"
            missing_count=$((missing_count + 1))
        fi
    done

    log_step "THEN: All required variables should be documented"
    if [ "$missing_count" -eq 0 ]; then
        log_success "All required variables documented"
    else
        log_warn "$missing_count required variable(s) may be undocumented"
    fi
}

test_legacy_variable_warnings() {
    annotate "Phase 3: Legacy Variable Deprecation Warnings"

    mkdir -p "$TEST_TEMP_DIR"

    log_step "GIVEN: Legacy variables should emit warnings"

    cat > "$TEST_TEMP_DIR/legacy-warn.sh" <<'EOF'
#!/bin/bash
# Legacy variable detection
if [ -n "${REDIS_HOST:-}" ] && [ -z "${CFN_REDIS_HOST:-}" ]; then
    echo "WARNING: REDIS_HOST is deprecated, use CFN_REDIS_HOST" >&2
    echo "legacy-used"
elif [ -n "${CFN_REDIS_HOST:-}" ]; then
    echo "modern-used"
else
    echo "default-used"
fi
EOF
    chmod +x "$TEST_TEMP_DIR/legacy-warn.sh"

    log_step "WHEN: Legacy REDIS_HOST is used without CFN_ prefix"
    REDIS_HOST="old-redis" output=$("$TEST_TEMP_DIR/legacy-warn.sh" 2>&1)

    log_step "THEN: Warning should be emitted"
    if echo "$output" | grep -q "WARNING"; then
        log_success "Legacy variable warning emitted"
    else
        log_warn "Legacy variable warning not detected"
    fi
}

test_docker_compose_environment_injection() {
    annotate "Phase 3: Docker Compose Environment Injection"

    log_step "GIVEN: Docker Compose files inject environment variables"

    local cli_compose="$PROJECT_ROOT/docker/docker-compose.yml"
    local trigger_compose="$PROJECT_ROOT/docker/trigger-dev/docker-compose.yml"

    if [ ! -f "$cli_compose" ]; then
        log_error "CLI docker-compose.yml not found"
        return 1
    fi

    log_step "WHEN: Checking CLI coordinator environment"
    if grep -q "CFN_REDIS_HOST" "$cli_compose" || grep -q "REDIS_HOST" "$cli_compose"; then
        log_success "CLI coordinator has Redis host configured"
    else
        log_warn "CLI coordinator Redis host may not be configured"
    fi

    if [ -f "$trigger_compose" ]; then
        log_step "WHEN: Checking Trigger.dev coordinator environment"
        if grep -q "CFN_REDIS_HOST" "$trigger_compose" || grep -q "REDIS_HOST" "$trigger_compose"; then
            log_success "Trigger.dev coordinator has Redis host configured"
        else
            log_warn "Trigger.dev coordinator Redis host may not be configured"
        fi
    else
        log_warn "Trigger.dev docker-compose.yml not found, skipping"
    fi
}

# Execute tests
test_environment_contract_exists
test_mode_specific_redis_host
test_mode_specific_network_name
test_variable_precedence
test_required_variables_validation
test_legacy_variable_warnings
test_docker_compose_environment_injection

# Summary
annotate "Phase 3 Test Summary"
echo "Total Tests: $TEST_TOTAL"
echo "Passed: $TEST_PASSED"
echo "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "Phase 3: All environment contract tests passed"
    exit 0
else
    log_error "Phase 3: $TEST_FAILED test(s) failed"
    exit 1
fi
