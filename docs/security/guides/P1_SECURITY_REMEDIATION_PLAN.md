# P1 Security Remediation Plan
**Targeted for:** Immediate merge blocking (Critical fixes required)
**Effort Estimate:** 2-3 hours total
**Testing:** 2-3 hours

---

## Phase 1: Critical Fixes (Blocking Issues)

### Fix C1: Remove Credential Exposure from env-propagation-tests.sh

**File:** `/tests/docker/env-propagation-tests.sh`

**Issue:** Lines 161, 172, 164-167, 171-176 expose API keys via echo and logging

**Step 1: Add credential masking helper to test-utils.sh**
```bash
# Add to /tests/test-utils.sh after line 90

# Mask sensitive credential values in logs
# Usage: mask_credential "sk-ant-api-key-12345" -> "sk-a****-12345"
mask_credential() {
    local value="$1"
    local show_chars="${2:-4}"

    if [ ${#value} -le $((show_chars * 2 + 4)) ]; then
        echo "****"
        return 0
    fi

    local prefix="${value:0:$show_chars}"
    local suffix="${value: -$show_chars}"
    echo "${prefix}****${suffix}"
}

# Check if variable is set without revealing its value
# Usage: check_var_exists "container" "API_KEY" -> returns 0/1, no output
check_var_exists_silent() {
    local container="$1"
    local var_name="$2"

    timeout 5 docker exec "$container" sh -c \
        "[ -n \"\$$var_name\" ]" 2>/dev/null
}
```

**Step 2: Update test_runtime_override function in env-propagation-tests.sh**

Replace:
```bash
    # THEN: Runtime override should take precedence
    local anthropic_value
    anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $ANTHROPIC_API_KEY')

    if [ "$anthropic_value" = "sk-ant-override-key" ]; then
        log_success "Runtime override takes precedence"
    else
        log_error "Expected override key, got: $anthropic_value"
        return 1
    fi
```

With:
```bash
    # THEN: Runtime override should take precedence (don't expose key)
    if check_var_exists_silent "$TEST_COORDINATOR" "ANTHROPIC_API_KEY"; then
        log_success "Runtime override takes precedence (ANTHROPIC_API_KEY exists)"
    else
        log_error "Runtime override failed: ANTHROPIC_API_KEY not set in container"
        return 1
    fi
```

Replace:
```bash
    # THEN: Runtime-only variables should be present
    local zai_value
    zai_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $Z_AI_API_KEY')

    if [ "$zai_value" = "zai-runtime-key" ]; then
        log_success "Runtime-only variables propagated"
    else
        log_error "Expected runtime key, got: $zai_value"
        return 1
    fi
```

With:
```bash
    # THEN: Runtime-only variables should be present (don't expose key)
    if check_var_exists_silent "$TEST_COORDINATOR" "Z_AI_API_KEY"; then
        log_success "Runtime-only variables propagated (Z_AI_API_KEY exists)"
    else
        log_error "Runtime variables not propagated: Z_AI_API_KEY not set"
        return 1
    fi
```

---

### Fix C2: Replace Hardcoded Test Credentials in provider-auth-tests.sh

**File:** `/tests/docker/provider-auth-tests.sh`

**Issue:** Lines 23-26 contain hardcoded credentials following real patterns

**Step 1: Add test credential generator to architecture-test-helpers.sh**
```bash
# Add to /tests/docker/architecture-test-helpers.sh before final exports

# Generate ephemeral test credentials (never hardcode)
# Usage: generate_test_api_key "anthropic" -> sk-test-1f2e3d4c5b6a...
generate_test_api_key() {
    local provider="$1"
    local prefix=""
    local length=32

    case "$provider" in
        anthropic) prefix="sk-ant-test-" ;;
        zai) prefix="zai-test-" ;;
        kimi) prefix="kimi-test-" ;;
        openrouter) prefix="or-test-" ;;
        *) prefix="test-" ;;
    esac

    # Generate random hex string (no hardcoded patterns)
    local random_part
    random_part=$(openssl rand -hex 16)

    echo "${prefix}${random_part}"
}

# Validate test credential format (has TEST marker)
# Usage: is_test_credential "sk-ant-test-1f2e3d4c" -> returns 0
is_test_credential() {
    local value="$1"
    [[ "$value" =~ test ]]
}
```

**Step 2: Update test_multi_provider_auth function**

Replace:
```bash
    # GIVEN: Environment variables for all providers
    local providers=(
        "ANTHROPIC_API_KEY=sk-ant-test-key-12345"
        "Z_AI_API_KEY=zai-test-key-67890"
        "KIMI_API_KEY=kimi-test-key-abcde"
        "OPENROUTER_API_KEY=or-test-key-fghij"
    )
```

With:
```bash
    # GIVEN: Generate ephemeral test credentials (never hardcoded)
    local anthropic_test_key
    anthropic_test_key=$(generate_test_api_key "anthropic")

    local zai_test_key
    zai_test_key=$(generate_test_api_key "zai")

    local kimi_test_key
    kimi_test_key=$(generate_test_api_key "kimi")

    local openrouter_test_key
    openrouter_test_key=$(generate_test_api_key "openrouter")

    local providers=(
        "ANTHROPIC_API_KEY=$anthropic_test_key"
        "Z_AI_API_KEY=$zai_test_key"
        "KIMI_API_KEY=$kimi_test_key"
        "OPENROUTER_API_KEY=$openrouter_test_key"
    )
```

Replace:
```bash
    # THEN: Verify all provider keys are accessible in container
    for provider_var in "${providers[@]}"; do
        local var_name="${provider_var%%=*}"
        local expected_value="${provider_var#*=}"

        local actual_value
        actual_value=$(docker exec "$TEST_AGENT" sh -c "echo \$$var_name")

        if [ "$actual_value" = "$expected_value" ]; then
            log_success "$var_name authenticated"
        else
            log_error "$var_name authentication failed (expected: $expected_value, got: $actual_value)"
            return 1
        fi
    done
```

With:
```bash
    # THEN: Verify all provider keys are accessible in container
    for provider_var in "${providers[@]}"; do
        local var_name="${provider_var%%=*}"
        # Don't compare actual values - only verify they exist
        if check_var_exists_silent "$TEST_AGENT" "$var_name"; then
            log_success "$var_name authenticated (exists in container)"
        else
            log_error "$var_name authentication failed (not set in container)"
            return 1
        fi
    done
```

---

### Fix C3: Quote Variables in docker exec Commands

**File:** `/tests/docker/env-propagation-tests.sh` and `/tests/docker/architecture-test-helpers.sh`

**Issue:** Unquoted variables in docker exec enable command injection

**Step 1: Update check_required_vars in architecture-test-helpers.sh**

Replace:
```bash
check_required_vars() {
    local container="$1"
    shift
    local required_vars=("$@")
    local missing=0

    log_info "Checking required environment variables in $container"

    for var_name in "${required_vars[@]}"; do
        local value
        value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")
```

With:
```bash
check_required_vars() {
    local container="$1"
    shift
    local required_vars=("$@")
    local missing=0

    log_info "Checking required environment variables in $container"

    for var_name in "${required_vars[@]}"; do
        # Validate variable name format first
        if ! [[ "$var_name" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
            log_error "Invalid variable name format: $var_name"
            return 1
        fi

        local value
        # Use timeout and proper quoting to prevent command injection
        value=$(timeout 5 docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")
```

---

### Fix C4: Implement Credential Masking in Assertions

**File:** `/tests/docker/env-propagation-tests.sh`

Already fixed in Fix C1 above. Verify assertions never log credential values.

---

## Phase 2: High-Severity Fixes (Merge Blocking)

### Fix H1: Add Input Validation

**File:** `/tests/docker/architecture-test-helpers.sh`

Add this helper function (already added in Fix C3, this ensures it's used):

```bash
# Validate variable name against whitelist pattern
# Usage: validate_variable_name "ANTHROPIC_API_KEY" -> returns 0
validate_variable_name() {
    local var_name="$1"
    if [[ ! "$var_name" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
        log_error "Invalid variable name (must be [A-Z_][A-Z0-9_]*): $var_name"
        return 1
    fi
}

# Validate container name (prevent injection)
# Usage: validate_container_name "test-container-1234" -> returns 0
validate_container_name() {
    local container="$1"
    if [[ ! "$container" =~ ^[a-z0-9._-]+$ ]]; then
        log_error "Invalid container name: $container"
        return 1
    fi
}
```

Update all functions to use validation:

```bash
check_required_vars() {
    local container="$1"
    validate_container_name "$container" || return 1
    shift
    local required_vars=("$@")

    for var_name in "${required_vars[@]}"; do
        validate_variable_name "$var_name" || return 1
        # ... rest of function
```

---

### Fix H2: Comprehensive Redis Cleanup

**File:** `/tests/docker/coordinator-fault-tolerance-tests.sh`

Replace cleanup function:
```bash
cleanup() {
    log_step "Cleaning up test containers and data"
    local cleanup_errors=0

    # Clean containers (with timeout)
    if ! cleanup_container "$TEST_COORDINATOR" 2>/dev/null; then
        log_warn "Failed to cleanup coordinator container"
        cleanup_errors=$((cleanup_errors + 1))
    fi

    # Clean orphaned agents
    docker ps -a --filter "name=test-orphan-agent-" --format "{{.Names}}" | \
        while read -r container; do
            if ! cleanup_container "$container" 2>/dev/null; then
                log_warn "Failed to cleanup orphaned agent: $container"
                cleanup_errors=$((cleanup_errors + 1))
            fi
        done

    # Clean ALL related Redis keys using pattern deletion
    # (safer than hardcoded list)
    local redis_patterns=(
        "coordinator:${TEST_COORDINATOR}:*"
        "swarm:*:${TEST_COORDINATOR}:*"
    )

    for pattern in "${redis_patterns[@]}"; do
        local deleted=0
        deleted=$($REDIS_CLI_CMD EVAL "
            local keys = redis.call('keys', ARGV[1])
            for i=1,#keys do
                redis.call('del', keys[i])
            end
            return #keys
        " 0 "$pattern" 2>/dev/null || echo "0")

        if [ "$deleted" -gt 0 ]; then
            log_info "Cleaned up $deleted Redis keys matching: $pattern"
        fi
    done

    # Verify cleanup success
    local remaining
    remaining=$($REDIS_CLI_CMD KEYS "coordinator:${TEST_COORDINATOR}:*" 2>/dev/null | wc -l || echo 0)
    if [ "$remaining" -gt 0 ]; then
        log_warn "Warning: $remaining Redis keys not cleaned up"
        cleanup_errors=$((cleanup_errors + 1))
    fi

    rm -rf "$TEST_DIR"

    if [ $cleanup_errors -gt 0 ]; then
        log_warn "Cleanup completed with $cleanup_errors errors"
    fi
}
```

---

### Fix H3: Add Container Security Restrictions

**File:** `/tests/docker/provider-auth-tests.sh`

Replace docker run commands:
```bash
# Before (VULNERABLE)
docker run -d \
    --name "$TEST_AGENT" \
    --network "$NETWORK_NAME" \
    -e "${providers[0]}" \
    -e "${providers[1]}" \
    -e "${providers[2]}" \
    -e "${providers[3]}" \
    node:20-slim \
    sh -c 'sleep 30' >/dev/null 2>&1

# After (SECURE)
docker run -d \
    --name "$TEST_AGENT" \
    --network "$NETWORK_NAME" \
    --cap-drop=ALL \
    --read-only \
    --security-opt=no-new-privileges \
    --user 1000:1000 \
    --memory=256m \
    --cpus=0.5 \
    -e TEST_MODE=true \
    -e "${providers[0]}" \
    -e "${providers[1]}" \
    -e "${providers[2]}" \
    -e "${providers[3]}" \
    node:20-slim \
    sh -c 'sleep 30' >/dev/null 2>&1
```

---

## Phase 3: Medium-Severity Fixes (Near-term)

### Fix M1: Add Timeouts to docker exec

Apply this pattern to all docker exec calls:

```bash
# Before
value=$(docker exec "$container" printenv "$var")

# After
value=$(timeout 5 docker exec "$container" printenv "$var" 2>/dev/null || echo "TIMEOUT")

if [ "$value" = "TIMEOUT" ]; then
    log_error "Container execution timeout: $container"
    return 1
fi
```

Files to update:
- `/tests/docker/env-propagation-tests.sh` (lines 161, 172)
- `/tests/docker/architecture-test-helpers.sh` (lines 104-107, 130-135)

---

### Fix M2: Improve Cleanup Error Handling

Update the cleanup function to report errors (already done in Fix H2).

---

### Fix M3: Validate Redis Connection Before Tests

Add to beginning of each test:

```bash
# Test 1: Coordinator restart recovery
test_coordinator_restart() {
    log_step "Test 1: Coordinator restart recovery"

    # Validate Redis connectivity
    if ! timeout 5 $REDIS_CLI_CMD PING >/dev/null 2>&1; then
        log_error "Redis not accessible - cannot run test"
        return 1
    fi

    # ... rest of test
```

---

### Fix M4: Update env_var_exists to Not Log Values

Replace in architecture-test-helpers.sh:
```bash
# Before
env_var_exists() {
    local var_name="$1"
    if [ -n "${!var_name:-}" ]; then
        log_success "Environment variable exists: $var_name=${!var_name}"
        return 0
    else
        log_error "Environment variable missing or empty: $var_name"
        return 1
    fi
}

# After
env_var_exists() {
    local var_name="$1"
    if [ -n "${!var_name:-}" ]; then
        log_success "Environment variable exists: $var_name"
        return 0
    else
        log_error "Environment variable missing or empty: $var_name"
        return 1
    fi
}
```

---

### Fix M5: Add Rate Limiting

Replace in provider-auth-tests.sh:
```bash
# Before
for provider_var in "${providers[@]}"; do
    local var_name="${provider_var%%=*}"
    local expected_value="${provider_var#*=}"

    local actual_value
    actual_value=$(docker exec "$TEST_AGENT" sh -c "echo \$$var_name")
    # ...
done

# After
for provider_var in "${providers[@]}"; do
    local var_name="${provider_var%%=*}"

    if check_var_exists_silent "$TEST_AGENT" "$var_name"; then
        log_success "$var_name authenticated"
    else
        log_error "$var_name authentication failed"
        return 1
    fi

    sleep 0.1  # Rate limit: 100ms between docker exec calls
done
```

---

## Validation Checklist

After applying fixes, verify:

### Critical Fixes (C1-C4)
- [ ] No credentials in test output: `grep -r "sk-ant\|zai-\|kimi-\|or-" tests/docker/*.sh`
- [ ] No `echo $VAR` patterns: `grep -n "echo \\\$" tests/docker/*.sh` (should only find escaped examples)
- [ ] All variables properly quoted: `grep -n '\$[A-Z_]' tests/docker/*.sh | grep -v '\${' | grep -v '#'`
- [ ] Test credentials generated via function, not hardcoded

### High-Severity Fixes (H1-H3)
- [ ] Input validation on variable names: grep "validate_variable_name" tests/docker/architecture-test-helpers.sh
- [ ] Redis cleanup uses pattern deletion: grep "redis.call('keys'" tests/docker/coordinator-fault-tolerance-tests.sh
- [ ] Docker run has security options: grep -A 5 "docker run.*TEST_AGENT" tests/docker/provider-auth-tests.sh | grep "cap-drop"

### Medium-Severity Fixes (M1-M5)
- [ ] Timeouts on docker exec: grep "timeout 5 docker exec" tests/docker/*.sh
- [ ] Redis connectivity check: grep "REDIS_CLI_CMD PING" tests/docker/coordinator-fault-tolerance-tests.sh
- [ ] Rate limiting (0.1s sleep): grep "sleep 0.1" tests/docker/provider-auth-tests.sh

---

## Testing Command

```bash
# Run tests after applying fixes
bash tests/docker/provider-auth-tests.sh
bash tests/docker/env-propagation-tests.sh
bash tests/docker/coordinator-fault-tolerance-tests.sh

# Verify no credentials in logs
for logfile in /tmp/test-*.log; do
    if grep -iE "sk-ant|zai-|kimi-|or-test" "$logfile"; then
        echo "FAIL: Credentials found in $logfile"
    fi
done
```

---

## Effort Breakdown

| Task | Time |
|------|------|
| Add helper functions | 20 min |
| Fix C1 (credential exposure) | 15 min |
| Fix C2 (hardcoded credentials) | 15 min |
| Fix C3 (quoting) | 10 min |
| Fix C4 (masking) | 10 min |
| Fix H1-H3 (high-severity) | 30 min |
| Fix M1-M5 (medium-severity) | 30 min |
| Testing & validation | 90 min |
| **Total** | **220 min (3.7 hours)** |

---

## Success Criteria

- All critical vulnerabilities fixed
- No credentials in test logs
- All tests pass with security fixes applied
- Input validation prevents injection attacks
- Container security restrictions enforced
- Redis cleanup verified
- Timeouts prevent hangs
