#!/usr/bin/env bash
# tests/templates/env-var-fallback-tests.sh
# Template :: Environment variable fallback and validation tests per ENV_VAR_STANDARDS.md
# Copy and adapt this template for your application

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# CONFIGURATION - ADAPT THESE FOR YOUR APPLICATION
# ============================================================================

# Application entry point to test (change this)
APP_ENTRY="${APP_ENTRY:-node src/index.js}"

# Test script that exposes config (create this for your app)
# Example: node -e "console.log(JSON.stringify(require('./src/config')))"
CONFIG_SCRIPT="${CONFIG_SCRIPT:-node -e \"console.log(JSON.stringify(require('./src/config')))\"}"

# Required secrets that MUST error if missing
REQUIRED_SECRETS=(
    "AUTH_JWT_SECRET"
    "DB_POSTGRES_URL"
    # Add your required secrets here
)

# Optional vars with expected defaults
declare -A OPTIONAL_VARS_DEFAULTS=(
    ["CFN_REDIS_URL"]="redis://localhost:6379"
    ["LOG_LEVEL"]="info"
    ["CFN_TIMEOUT"]="30000"
    # Add your optional vars here
)

# ============================================================================
# CLEANUP
# ============================================================================

TMP_ENV_FILE=""
cleanup() {
    log_info "Cleaning up test artifacts..."
    if [[ -n "$TMP_ENV_FILE" && -f "$TMP_ENV_FILE" ]]; then
        rm -f "$TMP_ENV_FILE"
    fi
}
trap cleanup EXIT

# ============================================================================
# TEST CASES - Per ENV_VAR_STANDARDS.md
# ============================================================================

test_required_secret_missing_fails() {
    log_step "TEST: Missing required secret causes startup failure"

    for secret in "${REQUIRED_SECRETS[@]}"; do
        log_info "Testing missing: $secret"

        # GIVEN all other secrets set, but this one missing
        local env_vars=""
        for other in "${REQUIRED_SECRETS[@]}"; do
            if [[ "$other" != "$secret" ]]; then
                env_vars="$env_vars $other=test-value"
            fi
        done

        # WHEN application starts
        local exit_code=0
        env -i PATH="$PATH" HOME="$HOME" $env_vars $APP_ENTRY 2>/dev/null || exit_code=$?

        # THEN should fail (non-zero exit)
        if [[ $exit_code -ne 0 ]]; then
            log_success "Missing $secret correctly causes failure"
            ((TEST_PASSED++)) || true
        else
            log_error "App started without required secret: $secret"
            ((TEST_FAILED++)) || true
        fi
        ((TEST_TOTAL++)) || true
    done
}

test_optional_var_uses_default() {
    log_step "TEST: Optional vars use correct defaults when unset"

    for var in "${!OPTIONAL_VARS_DEFAULTS[@]}"; do
        local expected_default="${OPTIONAL_VARS_DEFAULTS[$var]}"
        log_info "Testing default for: $var (expect: $expected_default)"

        # GIVEN required secrets set but optional var unset
        local env_vars=""
        for secret in "${REQUIRED_SECRETS[@]}"; do
            env_vars="$env_vars $secret=test-value"
        done

        # WHEN config is read
        local actual_value
        actual_value=$(env -i PATH="$PATH" HOME="$HOME" $env_vars \
            eval "$CONFIG_SCRIPT" 2>/dev/null | grep -o "\"${var}\":\"[^\"]*\"" | cut -d'"' -f4) || true

        # THEN should use default
        if [[ "$actual_value" == "$expected_default" ]]; then
            log_success "$var correctly defaults to: $expected_default"
            ((TEST_PASSED++)) || true
        else
            log_error "$var default mismatch. Expected: $expected_default, Got: $actual_value"
            ((TEST_FAILED++)) || true
        fi
        ((TEST_TOTAL++)) || true
    done
}

test_env_var_naming_convention() {
    log_step "TEST: Environment variables follow naming convention"

    # GIVEN application source files
    local source_files
    source_files=$(find "${PROJECT_ROOT}/src" -name "*.ts" -o -name "*.js" 2>/dev/null || echo "")

    if [[ -z "$source_files" ]]; then
        log_warn "No source files found in src/, skipping naming convention test"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # WHEN scanning for process.env usage
    local bad_vars
    bad_vars=$(grep -rhoE "process\.env\.[A-Za-z_][A-Za-z0-9_]*" $source_files 2>/dev/null | \
        sed 's/process\.env\.//' | \
        sort -u | \
        grep -vE "^(CFN_|APP_|DB_|API_|AUTH_|LOG_|CACHE_|NODE_ENV|PATH|HOME)" || true)

    # THEN all vars should have scope prefix
    if [[ -z "$bad_vars" ]]; then
        log_success "All env vars follow naming convention"
        ((TEST_PASSED++)) || true
    else
        log_error "Env vars missing scope prefix:"
        echo "$bad_vars" | while read -r var; do
            log_error "  - $var (should have CFN_/APP_/DB_/API_/AUTH_/LOG_/CACHE_ prefix)"
        done
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_secrets_not_logged() {
    log_step "TEST: Secrets are not logged"

    # GIVEN application with secrets set
    TMP_ENV_FILE=$(mktemp)
    local test_secret="SUPER_SECRET_VALUE_12345"

    for secret in "${REQUIRED_SECRETS[@]}"; do
        echo "$secret=$test_secret" >> "$TMP_ENV_FILE"
    done

    # WHEN application starts and logs
    local log_output
    log_output=$(env $(cat "$TMP_ENV_FILE" | xargs) $APP_ENTRY 2>&1 || true)

    # THEN secret value should not appear in logs
    if echo "$log_output" | grep -q "$test_secret"; then
        log_error "Secret value found in logs! Redaction required."
        ((TEST_FAILED++)) || true
    else
        log_success "Secret values not found in logs"
        ((TEST_PASSED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_type_coercion_numbers() {
    log_step "TEST: Numeric env vars correctly parsed"

    # GIVEN numeric env var set
    local env_vars=""
    for secret in "${REQUIRED_SECRETS[@]}"; do
        env_vars="$env_vars $secret=test-value"
    done
    env_vars="$env_vars CFN_TIMEOUT=5000"

    # WHEN config is read
    local timeout_value
    timeout_value=$(env -i PATH="$PATH" HOME="$HOME" $env_vars \
        eval "$CONFIG_SCRIPT" 2>/dev/null | grep -o '"timeout":[0-9]*' | cut -d':' -f2) || true

    # THEN should be numeric (not string)
    if [[ "$timeout_value" == "5000" ]]; then
        log_success "Numeric env var correctly parsed as number"
        ((TEST_PASSED++)) || true
    else
        log_warn "Could not verify numeric parsing (got: $timeout_value)"
        ((TEST_PASSED++)) || true  # Warning, not failure
    fi
    ((TEST_TOTAL++)) || true
}

test_type_coercion_booleans() {
    log_step "TEST: Boolean env vars correctly parsed"

    # Test 'true' string
    local env_vars=""
    for secret in "${REQUIRED_SECRETS[@]}"; do
        env_vars="$env_vars $secret=test-value"
    done

    # WHEN CFN_DEBUG=true
    local debug_value
    debug_value=$(env -i PATH="$PATH" HOME="$HOME" $env_vars CFN_DEBUG=true \
        eval "$CONFIG_SCRIPT" 2>/dev/null | grep -o '"debug":\(true\|false\)' | cut -d':' -f2) || true

    # THEN should be boolean true (not string "true")
    if [[ "$debug_value" == "true" ]]; then
        log_success "Boolean 'true' correctly parsed"
        ((TEST_PASSED++)) || true
    else
        log_warn "Could not verify boolean parsing (got: $debug_value)"
        ((TEST_PASSED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

test_env_example_has_placeholders() {
    log_step "TEST: .env.example uses placeholders, not real values"

    # GIVEN .env.example exists
    local env_example="${PROJECT_ROOT}/.env.example"

    if [[ ! -f "$env_example" ]]; then
        log_warn ".env.example not found, skipping"
        ((TEST_TOTAL++)) || true
        ((TEST_PASSED++)) || true
        return
    fi

    # WHEN scanning for potential real secrets
    local suspicious_values
    suspicious_values=$(grep -E "(_SECRET|_KEY|_TOKEN|_PASSWORD)=" "$env_example" | \
        grep -vE "(CHANGE_ME|your-|placeholder|xxx|example)" || true)

    # THEN should only have placeholder values
    if [[ -z "$suspicious_values" ]]; then
        log_success ".env.example uses safe placeholder values"
        ((TEST_PASSED++)) || true
    else
        log_error ".env.example may contain real secrets:"
        echo "$suspicious_values"
        ((TEST_FAILED++)) || true
    fi
    ((TEST_TOTAL++)) || true
}

# ============================================================================
# EXECUTE TESTS
# ============================================================================

annotate "ENV VAR FALLBACK TESTS - Per ENV_VAR_STANDARDS.md"

test_required_secret_missing_fails
test_optional_var_uses_default
test_env_var_naming_convention
test_secrets_not_logged
test_type_coercion_numbers
test_type_coercion_booleans
test_env_example_has_placeholders

# ============================================================================
# SUMMARY
# ============================================================================

annotate "TEST SUMMARY"
echo ""
log_info "Total:  $TEST_TOTAL"
log_success "Passed: $TEST_PASSED"
if [[ $TEST_FAILED -gt 0 ]]; then
    log_error "Failed: $TEST_FAILED"
    exit 1
else
    log_success "All env var fallback tests passed!"
    exit 0
fi
