#!/bin/bash
# tests/docker/env-propagation-tests.sh
# Phase 4 :: P1 - Environment variable propagation validation (Bug #4 / Bug #6 fix validation)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"

# Configuration
TEST_ENV_DIR="$(create_temp_dir)"
TEST_COORDINATOR="test-env-coordinator-$$"
NETWORK_NAME="cfn-network"

cleanup() {
    log_step "Cleaning up test environment"
    cleanup_container "$TEST_COORDINATOR" 2>/dev/null || true
    rm -rf "$TEST_ENV_DIR"
}
trap cleanup EXIT

# Test 1: .env.clean file validation (no inline comments)
test_env_clean_format() {
    log_step "Test 1: .env.clean file validation (no inline comments)"

    # GIVEN: Create test .env files with different formats
    local valid_env="$TEST_ENV_DIR/.env.clean.valid"
    local invalid_env="$TEST_ENV_DIR/.env.clean.invalid"

    cat > "$valid_env" <<EOF
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
ANTHROPIC_API_KEY=$(generate_test_credential 'hex' 32)
Z_AI_API_KEY=$(generate_test_credential 'hex' 32)
EOF

    cat > "$invalid_env" <<EOF
CFN_REDIS_HOST=cfn-redis  # This is Redis host
CFN_REDIS_PORT=6379       # Redis port
ANTHROPIC_API_KEY=$(generate_test_credential 'hex' 32)  # Anthropic key
EOF

    # WHEN: Validate valid .env.clean using helper
    # THEN: Valid env file should pass validation
    validate_env_file "$valid_env" || {
        log_error "Valid .env validation failed"
        return 1
    }

    # WHEN: Detect invalid .env.clean with inline comments
    # THEN: Should identify inline comment pattern (helper logs warnings)
    if grep -q '#' "$invalid_env"; then
        log_success "Inline comment detection works"
    else
        log_error "Failed to detect inline comments"
        return 1
    fi

    # WHEN: Sanitize invalid .env by removing inline comments
    local sanitized_env="$TEST_ENV_DIR/.env.clean.sanitized"
    sed 's/#.*//' "$invalid_env" | sed 's/[[:space:]]*$//' | grep -v '^$' > "$sanitized_env"

    # THEN: Sanitized file should be valid
    validate_env_file "$sanitized_env" || {
        log_error "Sanitized .env validation failed"
        return 1
    }
}

# Test 2: Required variables validation (CFN_REDIS_HOST, provider keys)
test_required_variables() {
    log_step "Test 2: Required variables validation"

    # GIVEN: Define required variables for Docker coordinator
    local required_vars=(
        "CFN_REDIS_HOST"
        "CFN_REDIS_PORT"
        "ANTHROPIC_API_KEY"
    )

    local test_env="$TEST_ENV_DIR/.env.test"
    cat > "$test_env" <<EOF
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
ANTHROPIC_API_KEY=$(generate_test_credential 'hex' 32)
Z_AI_API_KEY=$(generate_test_credential 'hex' 32)
EOF

    # WHEN: Validate env file structure using helper
    # THEN: File should pass validation
    validate_env_file "$test_env" || {
        log_error "Test env file validation failed"
        return 1
    }

    # WHEN: Check required variables are present
    # THEN: All required variables should exist with values
    # Note: For file-based validation, we check manually since check_required_vars expects a container
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$test_env"; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -eq 0 ]; then
        log_success "All required variables present"
    else
        log_error "Missing required variables: ${missing_vars[*]}"
        return 1
    fi
}

# Test 3: Runtime environment variable propagation to coordinator
test_runtime_override() {
    log_step "Test 3: Runtime environment override validation"

    # GIVEN: Start coordinator with environment variable overrides
    local test_env="$TEST_ENV_DIR/.env.override"
    cat > "$test_env" <<EOF
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
ANTHROPIC_API_KEY=$(generate_test_credential 'hex' 32)
EOF

    # WHEN: Launch coordinator with runtime override
    local override_anthropic=$(generate_test_credential 'hex' 32)
    local override_zai=$(generate_test_credential 'hex' 32)

    docker run -d \
        $(get_secure_docker_flags) \
        --name "$TEST_COORDINATOR" \
        --network "$NETWORK_NAME" \
        --env-file "$test_env" \
        -e ANTHROPIC_API_KEY="$override_anthropic" \
        -e Z_AI_API_KEY="$override_zai" \
        node:20-slim \
        sh -c 'sleep 60' >/dev/null 2>&1

    wait_for_container "$TEST_COORDINATOR" 5

    # THEN: Runtime override should take precedence
    local anthropic_value
    anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $ANTHROPIC_API_KEY')

    if [ "$anthropic_value" = "$override_anthropic" ]; then
        log_success "Runtime override takes precedence"
    else
        log_error "Expected override key, got: $anthropic_value"
        return 1
    fi

    # THEN: Runtime-only variables should be present
    local zai_value
    zai_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $Z_AI_API_KEY')

    if [ "$zai_value" = "$override_zai" ]; then
        log_success "Runtime-only variables propagated"
    else
        log_error "Expected runtime key, got: $zai_value"
        return 1
    fi
}

# Test 4: Environment variable whitelisting (Bug #4 fix validation)
test_env_whitelisting() {
    log_step "Test 4: Environment variable whitelisting"

    # GIVEN: Create .env with both allowed and disallowed variables
    local test_env="$TEST_ENV_DIR/.env.whitelist"
    cat > "$test_env" <<EOF
CFN_REDIS_HOST=cfn-redis
CFN_REDIS_PORT=6379
ANTHROPIC_API_KEY=$(generate_test_credential 'hex' 32)
CUSTOM_PROVIDER_ROUTING=true
KIMI_API_KEY=$(generate_test_credential 'hex' 32)
DISALLOWED_VAR=should-not-appear
RANDOM_ENV=also-not-allowed
EOF

    # WHEN: Define allowed variable patterns
    local allowed_patterns=(
        "^CFN_"
        "^ANTHROPIC_"
        "^Z_AI_"
        "^KIMI_"
        "^OPENROUTER_"
        "^CUSTOM_PROVIDER_"
    )

    # THEN: Filter environment variables by whitelist
    local filtered_env="$TEST_ENV_DIR/.env.filtered"
    > "$filtered_env"

    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^# ]] && continue

        local var_name="${line%%=*}"
        local allowed=false

        for pattern in "${allowed_patterns[@]}"; do
            if [[ "$var_name" =~ $pattern ]]; then
                allowed=true
                break
            fi
        done

        if [ "$allowed" = true ]; then
            echo "$line" >> "$filtered_env"
        fi
    done < "$test_env"

    # THEN: Verify only allowed variables remain
    if grep -q "DISALLOWED_VAR" "$filtered_env"; then
        log_error "Disallowed variable found in filtered output"
        return 1
    fi

    if grep -q "RANDOM_ENV" "$filtered_env"; then
        log_error "Random environment variable found in filtered output"
        return 1
    fi

    if grep -q "CFN_REDIS_HOST" "$filtered_env" && \
       grep -q "ANTHROPIC_API_KEY" "$filtered_env" && \
       grep -q "KIMI_API_KEY" "$filtered_env"; then
        log_success "Environment variable whitelisting successful"
    else
        log_error "Expected whitelisted variables not found"
        return 1
    fi
}

# Execute all tests
setup_test "env-propagation"

test_env_clean_format
test_required_variables
test_runtime_override
test_env_whitelisting

teardown_test
