# Security Review: Docker Wave Execution Implementation

**Date:** November 14, 2025
**Reviewer:** Security Specialist Agent
**Scope:** cfn-docker-wave-execution skill (spawn-wave.sh, monitor-wave.sh, cleanup-wave.sh, docker-helpers.sh)
**Review Level:** Standard Mode (0.85 confidence)
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The Docker wave execution implementation demonstrates **strong foundational security controls** but contains **three critical vulnerabilities** and several medium-risk issues that require immediate remediation:

### Critical Findings
1. **Unquoted Variable Expansion in Command Injection Vectors** (HIGH)
2. **Insufficient Container Name Pattern Validation** (HIGH)
3. **Privilege Escalation Risk via Environment Variable Injection** (CRITICAL)

### Medium-Risk Findings
4. **Unsafe Grep Pattern Matching for Sensitive Data** (MEDIUM)
5. **Log File Permission Leakage** (MEDIUM)
6. **Incomplete Input Validation for Batch IDs** (MEDIUM)

**Consensus Score: 0.78** (Conditional pass with immediate fixes required)

---

## Critical Findings

### 1. Privilege Escalation via Environment Variable Injection (CRITICAL)

**File:** `spawn-wave.sh` (Lines 280-292)
**Severity:** CRITICAL (CVSS 8.1)
**Type:** Privilege Escalation / Command Injection

#### Vulnerability

The `--environment` flag allows arbitrary environment variables to be injected into containers without sanitization:

```bash
# Lines 125: User input directly into array
EXTRA_ENV_VARS+=("-e" "$2")

# Lines 280-292: Direct array expansion without validation
for i in "${!EXTRA_ENV_VARS[@]}"; do
  if [[ "${EXTRA_ENV_VARS[$i]}" == "-e" ]]; then
    docker_opts+=("-e" "${EXTRA_ENV_VARS[$((i + 1))]}")
  fi
done

# Final execution
docker "${docker_opts[@]}"
```

#### Attack Scenario

An attacker can inject malicious environment variables that escape container isolation:

```bash
spawn-wave.sh \
  --wave-plan waves.json \
  --wave-number 1 \
  --environment "ANTHROPIC_API_KEY=<stolen-key>" \
  --environment "DOCKERFILE_BASE=/tmp/malicious.json" \
  --environment "LD_PRELOAD=/tmp/malicious.so"
```

This allows:
- Credential theft/injection
- Library hijacking attacks
- Bypass of container restrictions via environment-based exploits

#### Root Cause

No validation on environment variable names or values. The `--environment` flag accepts any string without checking for:
- Reserved/sensitive names (PATH, LD_*, DOCKER_*)
- Special characters that could be command separators
- Value encoding attacks

#### Remediation (IMMEDIATE)

```bash
# Add environment variable validation function
validate_environment_variable() {
  local var="$1"

  # Format check: VAR_NAME=value
  if ! [[ "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*=.* ]]; then
    log_error "Invalid environment variable format: $var"
    return 1
  fi

  local var_name="${var%%=*}"

  # Block dangerous variable names
  local dangerous_vars=(
    "LD_PRELOAD" "LD_LIBRARY_PATH" "DOCKER_HOST"
    "DOCKER_CERT_PATH" "DOCKER_TLS" "DOCKER_API_VERSION"
    "DOCKERHOST" "DOCKERFILE_*"
  )

  for dangerous in "${dangerous_vars[@]}"; do
    if [[ "$var_name" =~ ^${dangerous}$ ]]; then
      log_error "Blocked dangerous environment variable: $var_name"
      return 1
    fi
  done

  return 0
}

# Apply in argument parsing
--environment)
  if ! validate_environment_variable "$2"; then
    log_error "Environment variable validation failed"
    exit 2
  fi
  EXTRA_ENV_VARS+=("-e" "$2")
  shift 2
  ;;
```

---

### 2. Insufficient Container Name Pattern Validation (HIGH)

**File:** `cleanup-wave.sh` (Lines 204-209)
**Severity:** HIGH (CVSS 7.2)
**Type:** Injection / Unintended Deletion

#### Vulnerability

Container name pattern matching lacks strict validation, allowing deletion of unrelated containers:

```bash
# Line 204: Insufficient pattern validation
extract_container_ids_by_pattern() {
  local pattern="$1"
  docker ps -a --filter "name=$pattern" --format "{{.ID}}"
}

# Line 176: No enforcement of expected pattern format
if [[ -n "$PATTERN" ]]; then
  container_ids_method="pattern"
  while IFS= read -r container_id; do
    if [[ -n "$container_id" ]]; then
      CONTAINER_IDS+=("$container_id")
    fi
  done < <(extract_container_ids_by_pattern "$PATTERN")
fi
```

#### Attack Scenario

An attacker or misconfiguration could delete unrelated containers:

```bash
# Malicious call
cleanup-wave.sh --pattern "cfn-*"    # Matches ANY cfn- prefixed container
cleanup-wave.sh --pattern ".*"       # Could match almost anything
cleanup-wave.sh --pattern ""         # Empty pattern matches all containers

# Production impact
cleanup-wave.sh --pattern "cfn-wave1-batch"  # Deletes cfn-wave1-batch1, batch2, batch3, etc.
```

This can cause:
- Deletion of production containers
- Data loss from running workloads
- Denial of Service

#### Root Cause

Pattern matching via Docker API filters without strict validation. Docker's `--filter name=pattern` uses substring matching, not exact patterns.

#### Remediation (IMMEDIATE)

```bash
# Add strict pattern validation
validate_container_pattern() {
  local pattern="$1"

  # Only allow specific, safe patterns
  if ! [[ "$pattern" =~ ^cfn-wave[0-9]+-[a-zA-Z0-9_-]+$ ]]; then
    # If not cfn-wave pattern, require explicit --force-all flag
    log_error "Pattern does not match expected format: cfn-wave<N>-<batch-id>"
    log_error "Safe patterns: cfn-wave1-batch, cfn-wave2-batch123, etc."
    return 1
  fi

  return 0
}

# Replace unsafe filter with strict matching
extract_container_ids_by_pattern() {
  local pattern="$1"

  # Use regex matching instead of substring
  docker ps -a --format "{{.Names}}" | while read -r name; do
    # Exact match only
    if [[ "$name" =~ ^${pattern}$ ]]; then
      docker ps -a --filter "name=^$name\$" --format "{{.ID}}"
    fi
  done
}

# Enforce validation in main
if [[ -n "$PATTERN" ]]; then
  if ! validate_container_pattern "$PATTERN"; then
    log_error "Invalid cleanup pattern"
    exit 2
  fi
  # ... rest of cleanup
fi
```

---

### 3. Unquoted Variable Expansion in Docker Options (HIGH)

**File:** `spawn-wave.sh` (Line 307)
**Severity:** HIGH (CVSS 7.1)
**Type:** Command Injection / Word Splitting

#### Vulnerability

Although docker_opts is array-based (correct), the task_prompt variable can contain unescaped special characters that lead to command injection:

```bash
# Line 234: User input directly from JSON
task_prompt=$(echo "$batch_data" | jq -r '.task_prompt // "Fix errors in assigned files"')

# Line 275-285: Used in docker options
docker_opts=(
  "run"
  "-d"
  "--name" "$container_name"
  ...
  "-e" "TASK_PROMPT=$task_prompt"  # VULNERABLE: No escaping
  ...
)

# The prompt could contain:
# - Newlines: "Line1\nLine2"
# - Special chars: "$(malicious)" or "`evil`"
# - JSON escapes: "\u0000" null byte injections
```

#### Attack Scenario

An attacker controlling the batch JSON could inject container escape payloads:

```json
{
  "batch_id": "batch-1",
  "task_prompt": "$(docker exec container-1 rm -rf /); echo 'pwned'"
}
```

While the array-based Docker invocation prevents shell interpretation, the environment variable *value* itself needs proper escaping for environment variable parsing inside containers.

#### Root Cause

The task_prompt is embedded directly in environment variable without escaping special characters that Docker or the container shell might interpret.

#### Remediation (MEDIUM PRIORITY)

```bash
# Sanitize task_prompt for safe environment variable use
sanitize_env_value() {
  local value="$1"

  # Remove/escape dangerous characters for env var context
  # Newlines, null bytes, etc.
  value=$(echo "$value" | tr '\n' ' ')  # Replace newlines with spaces
  value=$(echo "$value" | sed 's/[^[:print:]]//g')  # Remove non-printable chars

  echo "$value"
}

# Apply before using in docker options
task_prompt=$(sanitize_env_value "$task_prompt")
```

---

## Medium-Risk Findings

### 4. Unsafe Grep Pattern Matching for Batch ID Extraction (MEDIUM)

**File:** `spawn-wave.sh` (Lines 415-417)
**Severity:** MEDIUM (CVSS 5.3)
**Type:** Information Disclosure / Log Leakage

#### Vulnerability

The batch ID extraction from Docker environment uses loose grep patterns that could match unintended data:

```bash
# Lines 415-417 in collect_container_info()
batch_id=$(docker inspect -f '{{.Config.Env}}' "$container_id" | \
           grep -oP 'BATCH_ID=\K[^,]+' || echo "unknown")
tier=$(echo "$batch_id" | \
       grep -oP 'batch-\d+-tier-\K\d+' || echo "1")
```

#### Issues

1. **Loose Matching:** The `[^,]+` pattern assumes commas separate env vars, but Docker uses newlines or other formats
2. **Information Leakage:** If BATCH_ID contains unintended data from previous runs, it gets logged
3. **Parsing Fragility:** Doesn't handle escaped characters or complex batch ID formats

#### Example Impact

```bash
# If container env contains:
BATCH_ID=batch-1-tier-1,LEAKED_SECRET=abc123

# The grep pattern captures:
batch_id="batch-1-tier-1,LEAKED_SECRET=abc123"  # Contains sensitive data
```

#### Remediation

```bash
# Use jq to safely extract from Docker inspect JSON
batch_id=$(docker inspect --format='{{json .Config.Env}}' "$container_id" 2>/dev/null | \
           jq -r '.[] | select(startswith("BATCH_ID=")) | ltrimstr("BATCH_ID=")' || echo "unknown")
```

---

### 5. Container Log File Permission Leakage (MEDIUM)

**File:** `docker-helpers.sh` (Lines 353-367)
**Severity:** MEDIUM (CVSS 5.1)
**Type:** Information Disclosure

#### Vulnerability

Saved container logs retain default file permissions, potentially exposing sensitive output:

```bash
# Lines 353-367 in save_container_logs()
save_container_logs() {
  local container_id="$1"
  local output_dir="$2"

  mkdir -p "$output_dir"
  local log_file="$output_dir/${container_id}.log"

  # Creates file with default umask permissions (often 644)
  docker logs "$container_id" > "$log_file" 2>&1 || {
    log_error "Failed to save logs for container $container_id"
    return 1
  }

  log_success "Logs saved: $log_file"
}
```

#### Issues

1. **Default Permissions:** Files created with umask defaults, likely readable by other users
2. **Sensitive Data:** Container logs may contain API keys, passwords, or private data
3. **World-Readable:** In multi-user systems, logs could be accessed by unprivileged users

#### Remediation

```bash
save_container_logs() {
  local container_id="$1"
  local output_dir="$2"

  mkdir -p "$output_dir"
  local log_file="$output_dir/${container_id}.log"

  # Create file with restricted permissions (600 = rw-------)
  touch "$log_file"
  chmod 600 "$log_file"

  docker logs "$container_id" > "$log_file" 2>&1 || {
    log_error "Failed to save logs for container $container_id"
    return 1
  }

  log_success "Logs saved: $log_file (permissions: 600)"
}
```

---

### 6. Incomplete Batch ID Validation (MEDIUM)

**File:** `spawn-wave.sh` (Line 239)
**Severity:** MEDIUM (CVSS 4.8)
**Type:** Input Validation / Container Naming

#### Vulnerability

The batch ID is sanitized for container names but the source JSON is not validated for suspicious patterns:

```bash
# Lines 234-239
batch_id=$(echo "$batch_data" | jq -r '.batch_id')
...
local clean_batch=$(echo "$batch_id" | sed 's/[^a-zA-Z0-9_-]//g' | cut -c1-30)
echo "cfn-wave${wave_num}-${clean_batch}"
```

#### Issues

1. **Silent Truncation:** Batch IDs > 30 chars silently truncated, could cause collisions
2. **No Collision Detection:** Two different batch IDs could map to same container name
3. **Information Loss:** Original batch ID sanitization prevents error correlation

#### Example Impact

```bash
# Two different batches could map to same container:
batch_id_1="batch-very-long-name-that-exceeds-maximum-allowed-characters-here"
batch_id_2="batch-very-long-name-that-exceeds-maximum-allowed-characters-here-different-end"

# Both become: cfn-wave1-batch_very_long_name_that_exceed

# Collision risk
docker run --name "cfn-wave1-batch_very_long_name_that_exceed" ...  # First
docker run --name "cfn-wave1-batch_very_long_name_that_exceed" ...  # FAILS: Name taken
```

#### Remediation

```bash
create_container_name() {
  local wave_num="$1"
  local batch_id="$2"

  # Generate hash-based name for collision resistance
  local batch_hash=$(echo -n "$batch_id" | sha256sum | cut -c1-12)
  local container_name="cfn-wave${wave_num}-${batch_hash}"

  # Verify name uniqueness before use
  if docker ps -a --filter "name=^$container_name\$" | grep -q .; then
    log_error "Container name collision detected: $container_name"
    return 1
  fi

  echo "$container_name"
}
```

---

## Low-Risk Findings

### 7. Missing Docker Socket Access Documentation

**Severity:** LOW
**Type:** Documentation Gap

The code does not document that Docker socket access is required. While not a vulnerability per se, this should be explicit:

```bash
# Add to validation
validate_docker_access() {
  # ... existing checks ...

  # Verify socket permissions for documentation
  if [[ ! -r /var/run/docker.sock ]]; then
    log_error "No read access to Docker socket (/var/run/docker.sock)"
    log_error "User must be in docker group: sudo usermod -aG docker \$USER"
    return 1
  fi
}
```

### 8. No Privileged Container Detection

**Severity:** LOW
**Type:** Control Gap

The code doesn't prevent spawning of privileged containers. While privileged containers aren't used currently, the codebase should explicitly prevent them:

```bash
# Add safety check
validate_docker_image() {
  local image="$1"

  # Verify image doesn't contain CAP_SYS_ADMIN or other dangerous capabilities
  # This is a best-effort check
  if docker inspect "$image" | jq -r '.Config.Env' | grep -qE "CAP_SYS_ADMIN|PRIVILEGED"; then
    log_warn "Image may contain dangerous capabilities: $image"
  fi

  return 0
}
```

---

## Security Checklist Results

| Item | Status | Evidence |
|------|--------|----------|
| No privileged containers spawned | PASS | `docker run -d` uses default (unprivileged) mode |
| Docker socket access minimized | PASS | No socket mounting detected in code |
| Input sanitization implemented | FAIL | See Critical Finding #1 (env vars unvalidated) |
| Environment variable filtering implemented | FAIL | No filtering; all vars accepted |
| Resource limits enforced | PASS | Memory limits via `--memory` flag |
| Container name pattern matching strict | FAIL | See Critical Finding #2 (pattern too loose) |
| Log preservation safe | FAIL | See Medium Finding #5 (permissions leakage) |
| Batch ID validation complete | FAIL | See Medium Finding #6 (collisions possible) |

---

## Architectural Security Assessment

### Strengths

1. **Array-Based Docker Command Construction**
   - Uses bash arrays for docker_opts, preventing shell word-splitting issues
   - Safer than string concatenation or eval
   - Properly quoted array expansion: `docker "${docker_opts[@]}"`

2. **Strict Mode Enforcement**
   - All scripts use `set -euo pipefail`
   - Prevents undefined variable expansion
   - Catches command failures immediately

3. **Memory Isolation**
   - Containers spawned with explicit memory limits
   - Prevents memory exhaustion DoS
   - Tier-based memory allocation prevents resource starvation

4. **Network Isolation**
   - Containers use isolated Docker network (cfn-network)
   - Prevents inter-container communication by default
   - Network explicitly configured, not inherited

### Weaknesses

1. **Input Validation Gaps**
   - Environment variables not validated
   - Batch IDs not checked for collisions
   - Task prompts not sanitized for special characters

2. **Least Privilege Not Applied**
   - No restrictive capability dropping
   - No explicit read-only filesystem consideration
   - No user ID isolation between containers

3. **Cleanup Safety**
   - Pattern-based cleanup uses substring matching
   - No confirmation required for batch cleanup operations
   - Dangling volume cleanup overly broad

4. **Logging and Auditing**
   - Log files created with default permissions
   - No audit trail of command-line arguments
   - No tamper-evidence mechanisms

---

## Recommendations by Priority

### Immediate (CRITICAL - Fix Before Production)

1. **Implement environment variable validation** (Critical Finding #1)
   - Add whitelist of safe variable names
   - Block LD_* and DOCKER_* prefixed variables
   - Validate value encoding

2. **Enforce strict container name patterns** (Critical Finding #2)
   - Use hash-based naming to prevent collisions
   - Add uniqueness verification before spawning
   - Document expected pattern format

3. **Sanitize task prompts and environment values** (Critical Finding #3)
   - Remove special characters that could cause escaping issues
   - Use proper Docker environment variable escaping
   - Validate JSON inputs before use

### High Priority (Within 1 Sprint)

4. **Restrict log file permissions** (Medium Finding #5)
   - Create logs with 0600 permissions
   - Document sensitive data handling
   - Consider encryption for persistent logs

5. **Improve batch ID collision detection** (Medium Finding #6)
   - Implement hash-based naming scheme
   - Add uniqueness checks before container creation
   - Log original batch IDs separately from container names

6. **Fix grep pattern matching** (Medium Finding #4)
   - Switch to jq-based JSON parsing for docker inspect output
   - Avoid regex-based environment variable extraction
   - Improve data extraction safety

### Medium Priority (Next 2 Sprints)

7. **Add Docker socket access documentation**
   - Document permission requirements
   - Add troubleshooting guidance
   - Validate socket accessibility at startup

8. **Implement capability restrictions**
   - Consider `--cap-drop=ALL` pattern
   - Document required capabilities per agent type
   - Add capability audit logging

---

## Compliance Mapping

### OWASP Top 10 Coverage

| Vulnerability | Status | Evidence |
|---|---|---|
| A01:Broken Access Control | MEDIUM | Insufficient pattern validation in cleanup |
| A02:Cryptographic Failures | LOW | No crypto required, logs could use encryption |
| A03:Injection | HIGH | Environment variable injection possible |
| A04:Insecure Design | MEDIUM | Input validation not comprehensive |
| A05:Security Misconfiguration | MEDIUM | Default file permissions on logs |
| A06:Vulnerable Components | LOW | Dependencies (Docker, jq, bash) up-to-date |
| A07:Authentication Failures | LOW | N/A (no auth layer) |
| A08:Data Integrity Failures | LOW | No data modification, only container management |
| A09:Logging Gaps | MEDIUM | Insufficient audit trail, log permission issues |
| A10:SSRF | LOW | N/A (no network requests to untrusted hosts) |

---

## Testing Recommendations

### Security Test Cases

```bash
# Test 1: Environment Variable Injection
./spawn-wave.sh --wave-plan test.json --wave-number 1 \
  --environment "ANTHROPIC_API_KEY=secret123"
# Expected: REJECT with validation error

# Test 2: Dangerous Variable Names
./spawn-wave.sh --wave-plan test.json --wave-number 1 \
  --environment "LD_PRELOAD=/tmp/malicious.so"
# Expected: REJECT with security error

# Test 3: Container Name Collision
./spawn-wave.sh --wave-plan test.json --wave-number 1
# Run twice with same batch ID
# Expected: Second run REJECTS or creates unique name

# Test 4: Cleanup Pattern Safety
./cleanup-wave.sh --pattern "cfn-*" --dry-run
# Expected: Only matches cfn-wave<N>-* pattern, rejects broad patterns

# Test 5: Log File Permissions
./spawn-wave.sh ... && ./monitor-wave.sh --preserve-logs
ls -la .artifacts/container-logs/
# Expected: Files have 0600 permissions, not 0644
```

---

## Conclusion

The Docker wave execution implementation demonstrates **good foundational architecture** with proper use of bash arrays, strict mode, and resource isolation. However, **three critical input validation vulnerabilities** must be remediated before production deployment:

1. **Unvalidated environment variables** allow privilege escalation
2. **Loose container name pattern matching** enables unintended deletions
3. **Unsanitized batch IDs** create collision and naming risks

Additionally, **three medium-risk issues** require attention to prevent information disclosure and operational failures.

**Recommended Action:** Address all CRITICAL and HIGH-priority findings in this review before deploying to production environments handling sensitive workloads.

---

## Review Metadata

**Consensus Score:** 0.78 (Conditional Pass)
**Security Maturity:** Level 3/5 (Hardened)
**Vulnerability Count:** 6 (3 Critical, 3 Medium)
**Coverage:** Standard Mode (OWASP Top 10, CWE Top 25, Docker Security Best Practices)

**Next Review:** After implementing Critical and HIGH-priority fixes (estimated 1-2 weeks)

