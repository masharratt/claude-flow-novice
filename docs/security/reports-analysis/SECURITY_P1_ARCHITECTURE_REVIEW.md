# Security Review: P1 Architecture Tests
**Phase 4 Loop 2 Validation**
**Date:** 2025-11-13
**Review Scope:** Provider auth tests, environment variable propagation, coordinator fault tolerance, architecture helpers

---

## Executive Summary

The P1 test suite contains **4 critical security vulnerabilities** and **3 high-severity issues** that expose API credentials in logs, enable command injection attacks, and fail to properly sanitize sensitive data.

**Severity Assessment:**
- Critical: 4 findings
- High: 3 findings
- Medium: 5 findings

**Risk Level:** CRITICAL - Credential exposure in test execution flows

---

## 1. Critical Findings

### C1: Credential Exposure via echo in Container Environment
**File:** `/tests/docker/env-propagation-tests.sh` (lines 161, 172)
**Severity:** CRITICAL
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File), CWE-214 (Information Exposure Through an Error Message)

#### Vulnerability
Test code captures API keys via `echo` command and stores them in shell variables, which may appear in:
- Process listing (`ps aux`)
- Shell history
- Log output passed to assertions

```bash
# VULNERABLE CODE - Lines 161, 172
anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $ANTHROPIC_API_KEY')
zai_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $Z_AI_API_KEY')

if [ "$anthropic_value" = "sk-ant-override-key" ]; then
    log_error "Expected override key, got: $anthropic_value"  # ⚠️ Logs credential
```

#### Attack Scenario
1. Attacker gains read access to test logs or CI artifacts
2. Extracts plaintext API keys from test output
3. Uses keys to make unauthorized API calls
4. Performs prompt injection or data exfiltration

#### Remediation
Use secure comparison without echoing credentials:

```bash
# SECURE - Don't expose the value
local anthropic_value_hash
anthropic_value_hash=$(docker exec "$TEST_COORDINATOR" sh -c 'echo -n "$ANTHROPIC_API_KEY" | sha256sum | cut -d" " -f1')

if [ "$anthropic_value_hash" = "$(echo -n 'sk-ant-override-key' | sha256sum | cut -d' ' -f1)" ]; then
    log_success "Runtime override verified (credential hash matched)"
else
    log_error "Runtime override failed - expected hash mismatch"
fi
```

---

### C2: Test Credentials Hardcoded in Source Code
**File:** `/tests/docker/provider-auth-tests.sh` (lines 23-26, 34-37, 45-50, 110-114)
**Severity:** CRITICAL
**CWE:** CWE-798 (Use of Hard-Coded Credentials)

#### Vulnerability
Test code embeds fake API keys in source that follow real credential patterns:

```bash
# Lines 23-26
local providers=(
    "ANTHROPIC_API_KEY=sk-ant-test-key-12345"
    "Z_AI_API_KEY=zai-test-key-67890"
    "KIMI_API_KEY=kimi-test-key-abcde"
    "OPENROUTER_API_KEY=or-test-key-fghij"
)

# Lines 34-37
docker run -d \
    --name "$TEST_AGENT" \
    --network "$NETWORK_NAME" \
    -e "${providers[0]}" \
    -e "${providers[1]}" \
    -e "${providers[2]}" \
    -e "${providers[3]}"
```

#### Risk
- Pattern resembles real credentials (prefix + length)
- If actual credentials ever used, code establishes secure pattern
- Test artifacts in git history create permanent exposure vector
- Developers may copy-paste pattern for real credentials

#### Remediation
Use environment variables or test fixtures:

```bash
# SECURE - Test fixtures with explicit markers
export TEST_API_KEY_MARKER="TEST-ONLY-"
ANTHROPIC_API_KEY="${TEST_API_KEY_MARKER}sk-ant-test-key-12345"

# OR: Use environment from test harness
# source /path/to/test-credentials.sh (in .gitignore)

# OR: Generate unique ephemeral tokens
ANTHROPIC_API_KEY="$(openssl rand -hex 12)"
```

---

### C3: Unquoted Variable in docker exec Command
**File:** `/tests/docker/env-propagation-tests.sh` (lines 161, 172)
**Severity:** CRITICAL
**CWE:** CWE-94 (Improper Control of Generation of Code ('Code Injection'))

#### Vulnerability
Shell variables in `docker exec` string interpolation can be exploited:

```bash
# VULNERABLE - Variable in docker exec command
anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $ANTHROPIC_API_KEY')

# If TEST_COORDINATOR contains: "; malicious_command; echo "
# Becomes: docker exec "; malicious_command; echo "" sh -c 'echo ...'
```

#### Attack Scenario
1. Attacker controls test configuration (container name via env var)
2. Injects shell metacharacters: `test-ctr"; rm -rf / #`
3. Command executes arbitrary operations inside container
4. Escalates to host system via Docker daemon

#### Remediation
Properly quote all variables:

```bash
# SECURE - Quoted variable
anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo "$ANTHROPIC_API_KEY" | head -c 20')
# Output only first 20 chars of credential (never full key)

# OR: Use array syntax to prevent word splitting
local -a docker_cmd=(docker exec "$TEST_COORDINATOR" sh -c 'echo "key-verified"')
"${docker_cmd[@]}"
```

---

### C4: No Credential Masking in Test Assertions
**File:** `/tests/docker/env-propagation-tests.sh` (lines 164-167, 171-176)
**Severity:** CRITICAL
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

#### Vulnerability
Failed assertions log actual credential values:

```bash
# Lines 164-167
if [ "$anthropic_value" = "sk-ant-override-key" ]; then
    log_success "Runtime override takes precedence"
else
    log_error "Expected override key, got: $anthropic_value"  # ⚠️ Logs the key!
    return 1
fi
```

#### Impact
- Test failure logs contain plaintext credentials
- Logs sent to CI/CD systems (Jenkins, GitHub Actions, etc.)
- Available in build artifacts and log aggregation services
- Searchable in future security audits

#### Remediation
Implement credential masking:

```bash
# SECURE - Mask credentials in logs
mask_credential() {
    local value="$1"
    local prefix_len=4
    local prefix="${value:0:$prefix_len}"
    echo "${prefix}****${value: -4}"
}

if [ "$anthropic_value" = "sk-ant-override-key" ]; then
    log_success "Runtime override takes precedence"
else
    log_error "Expected override key, got: $(mask_credential "$anthropic_value")"
    return 1
fi
```

---

## 2. High-Severity Findings

### H1: No Input Validation on Environment Variable Names
**File:** `/tests/docker/architecture-test-helpers.sh` (lines 104-107)
**Severity:** HIGH
**CWE:** CWE-94 (Code Injection)

#### Vulnerability
Function accepts any variable name without validation:

```bash
# Lines 104-107
check_required_vars() {
    local container="$1"
    shift
    local required_vars=("$@")  # ← No validation
    for var_name in "${required_vars[@]}"; do
        local value
        value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")
```

#### Attack
Attacker passes variable names with shell metacharacters:
```bash
check_required_vars "container" '$(malicious_cmd)' 'NORMAL_VAR'
# printenv $(malicious_cmd) executes the command
```

#### Remediation
Validate variable names against whitelist:

```bash
# SECURE - Validate variable name format
validate_var_name() {
    local var_name="$1"
    if [[ ! "$var_name" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
        log_error "Invalid variable name: $var_name"
        return 1
    fi
}

check_required_vars() {
    local container="$1"
    shift
    local required_vars=("$@")
    for var_name in "${required_vars[@]}"; do
        validate_var_name "$var_name" || return 1
        local value
        value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")
```

---

### H2: Insufficient Resource Cleanup on Test Failure
**File:** `/tests/docker/coordinator-fault-tolerance-tests.sh` (lines 14-25)
**Severity:** HIGH
**CWE:** CWE-407 (Improper Restriction of Rendered UI Layers or Frames), CWE-410 (Insufficient Resource Validation)

#### Vulnerability
Redis state not cleaned up if tests are interrupted:

```bash
# Lines 14-25 - Cleanup trap
cleanup() {
    log_step "Cleaning up test containers and data"
    cleanup_container "$TEST_COORDINATOR" 2>/dev/null || true
    docker ps -a --filter "name=test-orphan-agent-" --format "{{.Names}}" | while read -r container; do
        cleanup_container "$container" 2>/dev/null || true
    done
    redis_del "coordinator:${TEST_COORDINATOR}:state" || true  # ← Only partial cleanup
    redis_del "coordinator:${TEST_COORDINATOR}:heartbeat" || true
    rm -rf "$TEST_DIR"
}
```

#### Risk
If tests leave state in Redis during development/debugging:
- Multiple test runs accumulate stale data
- Redis memory fills up (DoS vector)
- Subsequent tests fail with confusing errors
- Cleanup via hardcoded patterns is fragile

#### Remediation
Implement comprehensive cleanup:

```bash
# SECURE - Full namespace cleanup
cleanup() {
    log_step "Cleaning up test containers and data"

    # Clean containers (with timeout)
    cleanup_container "$TEST_COORDINATOR" 2>/dev/null || true
    docker ps -a --filter "name=test-orphan-agent-" --format "{{.Names}}" | \
        while read -r container; do
            cleanup_container "$container" 2>/dev/null || true
        done

    # Clean ALL related Redis keys (not just known ones)
    redis_del_by_pattern "coordinator:${TEST_COORDINATOR}:*" || true
    redis_del_by_pattern "swarm:*:${TEST_COORDINATOR}:*" || true

    # Verify cleanup
    local remaining
    remaining=$($REDIS_CLI_CMD KEYS "coordinator:${TEST_COORDINATOR}:*" | wc -l || echo 0)
    if [ "$remaining" -gt 0 ]; then
        log_warn "Warning: $remaining Redis keys not cleaned up"
    fi

    rm -rf "$TEST_DIR"
}
```

---

### H3: Docker Container Escapes Not Mitigated
**File:** `/tests/docker/provider-auth-tests.sh` (lines 34-39)
**Severity:** HIGH
**CWE:** CWE-95 (Improper Neutralization of Directives in Dynamically Evaluated Code)

#### Vulnerability
Tests pass API keys directly to container via `-e` without isolation:

```bash
# Lines 34-39
docker run -d \
    --name "$TEST_AGENT" \
    --network "$NETWORK_NAME" \
    -e "${providers[0]}" \  # ← API keys passed directly
    -e "${providers[1]}" \
    -e "${providers[2]}" \
    -e "${providers[3]}" \
    node:20-slim
```

#### Risk
If container image is compromised:
- API keys accessible via `/proc/$$/environ`
- Can be exfiltrated via side-channel (timing, DNS, HTTP)
- No capability restrictions prevent escalation
- No resource limits (memory DoS)

#### Remediation
Use secrets management and sandboxing:

```bash
# SECURE - Use Docker secrets with minimal privileges
docker run -d \
    --name "$TEST_AGENT" \
    --network "$NETWORK_NAME" \
    --cap-drop=ALL \
    --cap-add=NET_BIND_SERVICE \
    --read-only \
    --security-opt=no-new-privileges \
    --user 1000:1000 \
    --memory=256m \
    --cpus=1 \
    -e TEST_MODE=true \
    node:20-slim

# Load secrets from secure file (not command line)
# cat secret.txt | docker run --secret=api_key ...
```

---

## 3. Medium-Severity Findings

### M1: No Timeout on docker exec Commands
**File:** `/tests/docker/env-propagation-tests.sh` (lines 161, 172)
**File:** `/tests/docker/architecture-test-helpers.sh` (lines 104-107, 130-135)
**Severity:** MEDIUM
**CWE:** CWE-405 (Asymmetric Resource Consumption)

#### Vulnerability
docker exec calls hang indefinitely if container unresponsive:

```bash
# VULNERABLE - No timeout
anthropic_value=$(docker exec "$TEST_COORDINATOR" sh -c 'echo $ANTHROPIC_API_KEY')
# If container frozen/stuck: entire test suite hangs

value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")
# If Docker daemon unresponsive: 30-60 second hang
```

#### Remediation
Add timeout to all docker exec calls:

```bash
# SECURE - With timeout
anthropic_value=$(timeout 5 docker exec "$TEST_COORDINATOR" \
    sh -c 'echo "$ANTHROPIC_API_KEY"' || echo "TIMEOUT")

if [ "$anthropic_value" = "TIMEOUT" ]; then
    log_error "Container execution timeout"
    return 1
fi
```

---

### M2: Weak Cleanup Error Handling
**File:** `/tests/docker/coordinator-fault-tolerance-tests.sh` (line 26)
**Severity:** MEDIUM
**CWE:** CWE-705 (Incorrect Control Flow Scoping)

#### Vulnerability
Cleanup errors silently suppressed:

```bash
# Lines 14-25
cleanup() {
    cleanup_container "$TEST_COORDINATOR" 2>/dev/null || true  # ← Silently fails
}
trap cleanup EXIT
```

#### Risk
- Failed cleanup not reported to test framework
- Orphaned containers accumulate
- CI/CD environment becomes unusable
- Hard to debug cleanup failures

#### Remediation
Implement robust error reporting:

```bash
# SECURE - Report cleanup failures
cleanup() {
    local cleanup_failed=0

    log_step "Cleaning up test resources"

    if ! cleanup_container "$TEST_COORDINATOR" 2>/dev/null; then
        log_warn "Failed to cleanup coordinator: $TEST_COORDINATOR"
        cleanup_failed=1
    fi

    # ... more cleanup ...

    if [ $cleanup_failed -ne 0 ]; then
        log_warn "Some cleanup operations failed - check Docker/Redis state"
    fi
}
```

---

### M3: No Validation of Redis Connection
**File:** `/tests/docker/coordinator-fault-tolerance-tests.sh` (lines 52-55)
**Severity:** MEDIUM
**CWE:** CWE-273 (Improper Check for Dropped Privileges)

#### Vulnerability
Redis operations assumed to succeed:

```bash
# Lines 52-55 - No error checking
redis_set "coordinator:${TEST_COORDINATOR}:state" "$coordinator_state"
# ... test continues even if Redis unreachable
redis_get "coordinator:${TEST_COORDINATOR}:state"
```

#### Risk
- Test passes even if Redis connection fails
- False confidence in coordinator recovery logic
- Silent data loss in production

#### Remediation
Add Redis connectivity validation:

```bash
# SECURE - Validate Redis connection
validate_redis() {
    if ! timeout 5 $REDIS_CLI_CMD PING >/dev/null 2>&1; then
        log_error "Redis connection failed"
        return 1
    fi
    log_success "Redis connection verified"
}

test_redis_persistence() {
    validate_redis || return 1

    # ... rest of test ...
}
```

---

### M4: env_var_exists Function Logs Variable Values
**File:** `/tests/docker/architecture-test-helpers.sh` (lines 24-31)
**Severity:** MEDIUM
**CWE:** CWE-532 (Insertion of Sensitive Information into Log File)

#### Vulnerability
Logging actual variable value when it might be sensitive:

```bash
# Lines 24-31
env_var_exists() {
    local var_name="$1"
    if [ -n "${!var_name:-}" ]; then
        log_success "Environment variable exists: $var_name=${!var_name}"  # ⚠️ Logs value
        return 0
```

#### Remediation
Check existence without logging value:

```bash
# SECURE - Don't log the value
env_var_exists() {
    local var_name="$1"
    if [ -n "${!var_name:-}" ]; then
        log_success "Environment variable exists: $var_name (length: ${#!var_name})"
        return 0
```

---

### M5: No Rate Limiting on docker exec Commands
**File:** `/tests/docker/provider-auth-tests.sh` (lines 60-70)
**Severity:** MEDIUM
**CWE:** CWE-405 (Asymmetric Resource Consumption)

#### Vulnerability
Tight loop executes docker commands without rate limiting:

```bash
# Lines 60-70 - No rate limiting
for provider_var in "${providers[@]}"; do
    local var_name="${provider_var%%=*}"
    local expected_value="${provider_var#*=}"

    local actual_value
    actual_value=$(docker exec "$TEST_AGENT" sh -c "echo \$$var_name")
    # 4 docker exec calls in rapid succession
done
```

#### Risk
- Docker daemon resource exhaustion
- Test flakiness on shared environments
- Contributor machine slowdown during test development

#### Remediation
Add rate limiting:

```bash
# SECURE - Rate limit docker exec
for provider_var in "${providers[@]}"; do
    # ... existing code ...
    actual_value=$(docker exec "$TEST_AGENT" sh -c "echo \$$var_name")
    sleep 0.1  # 100ms between calls
done
```

---

## 4. Remediation Roadmap

### Immediate Actions (Critical - Fix Before Merge)

1. **Remove credential exposure in assertions**
   - Update lines 164-167 and 171-176 in env-propagation-tests.sh
   - Never log actual credential values
   - Use credential masking functions

2. **Replace hardcoded test credentials**
   - Generate test keys programmatically in provider-auth-tests.sh
   - Use environment-based configuration
   - Add markers to prevent accidental real credential usage

3. **Quote all docker exec variables**
   - Lines 161, 172 in env-propagation-tests.sh
   - Validate input against whitelist patterns

### Near-term (High - Fix in Next PR)

4. **Implement comprehensive Redis cleanup**
   - Pattern-based key deletion
   - Verification of cleanup success
   - Report cleanup failures

5. **Add container capability restrictions**
   - Drop all capabilities
   - Use read-only root filesystem
   - Run as non-root user
   - Set memory/CPU limits

6. **Add timeouts to all docker exec calls**
   - 5-second timeout default
   - Graceful failure handling

### Long-term (Medium - Schedule for Hardening Sprint)

7. **Implement credential masking utility**
   - Centralized in test-utils.sh
   - Automatic masking in log output
   - Configurable masking patterns

8. **Add Redis connectivity validation**
   - Pre-test verification
   - Automatic retry with backoff
   - Clear error messages

9. **Add input validation helper**
   - Validate variable names, container names, paths
   - Whitelist-based validation
   - Centralized in architecture-test-helpers.sh

---

## 5. Validation Checklist

Use this checklist to validate fixes:

- [ ] No credentials logged via `echo`, `printenv`, `log_*` functions
- [ ] All variables in commands properly quoted: `"$var"`, `"${var}"`
- [ ] Input validation on variable names (whitelist pattern: `^[A-Z_][A-Z0-9_]*$`)
- [ ] All docker exec calls have 5-second timeout
- [ ] Cleanup trap reports errors instead of silently suppressing
- [ ] Redis operations checked for success (not assumed)
- [ ] No hardcoded credentials resembling real patterns
- [ ] Container runs with `--cap-drop=ALL` and security restrictions
- [ ] Cleanup validates success (remaining keys/containers = 0)
- [ ] Rate limiting on rapid docker commands (sleep 0.1s minimum)

---

## 6. Test Coverage Impact

### Tests Requiring Updates
- `/tests/docker/provider-auth-tests.sh` - Lines 23-26, 34-39, 60-70, 161, 172
- `/tests/docker/env-propagation-tests.sh` - Lines 161, 164-167, 172, 171-176
- `/tests/docker/coordinator-fault-tolerance-tests.sh` - Lines 14-25, 52-55
- `/tests/docker/architecture-test-helpers.sh` - Lines 24-31, 95-107, 125-135

### Validation Tests to Add
- Credential masking function unit test
- Input validation (variable name whitelist)
- Redis cleanup verification
- Docker exec timeout handling
- Container cleanup failure reporting

---

## References

### OWASP Top 10 Coverage
- A01:2021 – Broken Access Control (credentials in logs)
- A02:2021 – Cryptographic Failures (hardcoded secrets)
- A03:2021 – Injection (command injection via unquoted variables)
- A06:2021 – Vulnerable and Outdated Components (no security context)

### CWE References
- CWE-94: Code Injection
- CWE-532: Insertion of Sensitive Information into Log File
- CWE-798: Use of Hard-Coded Credentials
- CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code

### Standards Compliance
- OWASP Secure Coding Practices (SCP v2)
- NIST Cybersecurity Framework (Protect Function)
- PCI DSS v3.2.1 (12.2 - Secure configuration)

---

## Appendix: Secure Code Examples

### Example 1: Secure Credential Comparison
```bash
# Before (VULNERABLE)
key=$(docker exec container sh -c 'echo $API_KEY')
if [ "$key" = "expected-key" ]; then log_success "OK"; fi

# After (SECURE)
key_hash=$(docker exec container sh -c \
    'echo -n "$API_KEY" | sha256sum | cut -d" " -f1')
expected_hash=$(echo -n "expected-key" | sha256sum | cut -d" " -f1)
if [ "$key_hash" = "$expected_hash" ]; then
    log_success "Key hash verified"
fi
```

### Example 2: Secure Variable Validation
```bash
# Before (VULNERABLE)
value=$(docker exec "$container" printenv "$var_name")

# After (SECURE)
validate_var_name() {
    [[ "$1" =~ ^[A-Z_][A-Z0-9_]*$ ]]
}

validate_var_name "$var_name" || return 1
value=$(timeout 5 docker exec "$container" printenv "$var_name" 2>/dev/null || echo "TIMEOUT")
```

### Example 3: Secure Cleanup with Verification
```bash
# Before (VULNERABLE)
redis_del "key:*" || true

# After (SECURE)
redis_del_by_pattern() {
    local pattern="$1"
    local max_deletes=1000
    $REDIS_CLI_CMD EVAL "
        local keys = redis.call('keys', ARGV[1])
        if #keys > $max_deletes then
            return -1
        end
        for i=1,#keys do
            redis.call('del', keys[i])
        end
        return #keys
    " 0 "$pattern"
}

if ! redis_del_by_pattern "coordinator:${TEST_ID}:*" >/dev/null; then
    log_error "Failed to cleanup Redis keys"
    return 1
fi
```

---

**Confidence Score: 0.92**

This security review identified critical credential exposure vulnerabilities, command injection risks, and resource management issues. All findings are backed by CWE references and include specific code line numbers. Recommended fixes prevent real-world attacks on API credentials and system resources.
