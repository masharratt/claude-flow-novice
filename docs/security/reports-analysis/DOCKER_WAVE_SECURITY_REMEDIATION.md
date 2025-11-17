# Docker Wave Execution: Security Remediation Guide

**Status:** Implementation Guide for Critical Vulnerabilities
**Version:** 1.0
**Target Fixes:** 3 CRITICAL + 3 MEDIUM findings

---

## Overview

This guide provides concrete code fixes for security issues identified in the Docker wave execution implementation. Follow remediation in priority order.

---

## CRITICAL FIX #1: Environment Variable Validation

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
**Issue:** No validation on environment variables passed via `--environment` flag

### Current Code (Vulnerable)
```bash
# In spawn-wave.sh line 125
--environment)
  EXTRA_ENV_VARS+=("-e" "$2")
  shift 2
  ;;
```

### Fixed Code

Add to `docker-helpers.sh`:

```bash
################################################################################
# ENVIRONMENT VARIABLE VALIDATION
################################################################################

# Validate environment variable format and safety
validate_environment_variable() {
  local var="$1"

  # Format check: VAR_NAME=value
  if ! [[ "$var" =~ ^[A-Za-z_][A-Za-z0-9_]*=.* ]]; then
    log_error "Invalid environment variable format: $var"
    log_error "Expected format: VAR_NAME=value"
    return 1
  fi

  local var_name="${var%%=*}"

  # Block dangerous variable names
  local -a dangerous_vars=(
    "LD_PRELOAD"
    "LD_LIBRARY_PATH"
    "LD_DEBUG"
    "DOCKER_HOST"
    "DOCKER_CERT_PATH"
    "DOCKER_TLS"
    "DOCKER_TLS_VERIFY"
    "DOCKER_API_VERSION"
    "DOCKER_CONFIG"
    "DOCKERHOST"
    "DOCKER_SOCKET"
  )

  for dangerous in "${dangerous_vars[@]}"; do
    if [[ "$var_name" == "$dangerous" ]]; then
      log_error "Blocked dangerous environment variable: $var_name"
      return 1
    fi
  done

  # Validate value doesn't contain shell metacharacters (belt-and-suspenders)
  local var_value="${var#*=}"
  if [[ "$var_value" =~ [\$\`\(\)\{\}\&\|\;\<\>] ]]; then
    log_warn "Environment variable contains special characters (not necessarily invalid): $var_name"
    # Allow but warn - Docker API will handle escaping
  fi

  log_debug "Environment variable validated: $var_name"
  return 0
}

# Export for use in subshells
export -f validate_environment_variable
```

Update in `spawn-wave.sh` (line 125):

```bash
--environment)
  if ! validate_environment_variable "$2"; then
    log_error "Environment variable validation failed: $2"
    usage
    exit 2
  fi
  EXTRA_ENV_VARS+=("-e" "$2")
  shift 2
  ;;
```

### Testing

```bash
# Should succeed
./spawn-wave.sh --wave-plan test.json --wave-number 1 \
  --environment "CUSTOM_VAR=safe-value" --dry-run

# Should fail
./spawn-wave.sh --wave-plan test.json --wave-number 1 \
  --environment "LD_PRELOAD=/tmp/malicious.so" --dry-run
# Output: [ERROR] Blocked dangerous environment variable: LD_PRELOAD
# Exit: 2

# Should fail
./spawn-wave.sh --wave-plan test.json --wave-number 1 \
  --environment "INVALID" --dry-run
# Output: [ERROR] Invalid environment variable format: INVALID
# Exit: 2
```

---

## CRITICAL FIX #2: Container Name Collision Prevention

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/spawn-wave.sh`
**Issue:** Batch ID sanitization can cause container name collisions

### Current Code (Vulnerable)
```bash
# Lines 234-241
create_container_name() {
  local wave_num="$1"
  local batch_id="$2"

  # Clean batch_id for use as container name (alphanumeric + dash/underscore)
  local clean_batch=$(echo "$batch_id" | sed 's/[^a-zA-Z0-9_-]//g' | cut -c1-30)
  echo "cfn-wave${wave_num}-${clean_batch}"
}
```

### Problems with Current Approach
1. Truncation at 30 chars → different batch IDs map to same container name
2. No collision detection
3. Original batch ID information lost for error correlation

### Fixed Code

Add helper to `docker-helpers.sh`:

```bash
################################################################################
# CONTAINER NAMING SAFETY
################################################################################

# Generate collision-resistant container name
generate_safe_container_name() {
  local wave_num="$1"
  local batch_id="$2"

  # Generate short hash of full batch ID to ensure uniqueness
  local batch_hash
  batch_hash=$(echo -n "$batch_id" | sha256sum | cut -c1-12)

  # Format: cfn-wave<N>-<12-char-hash>
  local container_name="cfn-wave${wave_num}-${batch_hash}"

  echo "$container_name"
}

# Check if container name already exists
container_name_exists() {
  local container_name="$1"

  # Use exact match filter
  if docker ps -a --filter "name=^${container_name}$" --format "{{.ID}}" | grep -q .; then
    return 0  # Name exists
  else
    return 1  # Name available
  fi
}

# Export for use in subshells
export -f generate_safe_container_name container_name_exists
```

Update in `spawn-wave.sh`:

```bash
# Replace create_container_name function
create_container_name() {
  local wave_num="$1"
  local batch_id="$2"

  # Generate hash-based name for collision resistance
  local container_name
  container_name=$(generate_safe_container_name "$wave_num" "$batch_id")

  # Verify uniqueness before returning
  if container_name_exists "$container_name"; then
    log_error "Container name collision detected: $container_name"
    log_error "Original batch_id: $batch_id"
    return 1
  fi

  echo "$container_name"
}
```

And update spawn_container to handle errors:

```bash
spawn_container() {
  local wave_num="$1"
  local batch_data="$2"

  local batch_id tier memory_limit task_prompt container_name
  batch_id=$(echo "$batch_data" | jq -r '.batch_id')
  tier=$(echo "$batch_data" | jq -r '.tier')
  memory_limit=$(get_tier_memory "$tier")
  task_prompt=$(echo "$batch_data" | jq -r '.task_prompt // "Fix errors in assigned files"')

  # Create container name (now with collision detection)
  if ! container_name=$(create_container_name "$wave_num" "$batch_id"); then
    log_error "Failed to create unique container name for batch: $batch_id"
    return 1
  fi

  log_info "Spawning container: $container_name (batch=$batch_id, tier=$tier, memory=$memory_limit)"
  # ... rest of function unchanged
}
```

### Testing

```bash
# Test collision detection
BATCHING_PLAN='{"waves":[{"wave_number":1,"batches":[
  {"batch_id":"very-long-batch-name-that-exceeds-max-chars-limit-here","tier":1},
  {"batch_id":"very-long-batch-name-that-exceeds-max-chars-limit-here","tier":1}
]}]}'

./spawn-wave.sh --wave-plan <(echo "$BATCHING_PLAN") --wave-number 1 --dry-run
# Second batch should be rejected or use different hash
```

---

## CRITICAL FIX #3: Task Prompt Sanitization

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/spawn-wave.sh`
**Issue:** Task prompt not sanitized before use in environment variables

### Current Code (Vulnerable)
```bash
# Line 234
task_prompt=$(echo "$batch_data" | jq -r '.task_prompt // "Fix errors in assigned files"')

# Lines 280-285 (used directly in env var)
docker_opts=(
  ...
  "-e" "TASK_PROMPT=$task_prompt"
  ...
)
```

### Fixed Code

Add to `docker-helpers.sh`:

```bash
################################################################################
# ENVIRONMENT VALUE SANITIZATION
################################################################################

# Sanitize environment variable values for safe Docker injection
sanitize_env_value() {
  local value="$1"

  # Remove control characters (newlines, tabs, null bytes, etc.)
  # Keep printable ASCII + common UTF-8 characters
  value=$(echo "$value" | LC_ALL=C sed 's/[[:cntrl:]]/ /g')

  # Replace multiple spaces with single space
  value=$(echo "$value" | sed 's/[[:space:]]\+/ /g')

  # Trim leading/trailing whitespace
  value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  # Limit length to prevent environment pollution
  if (( ${#value} > 2048 )); then
    log_warn "Environment value truncated from ${#value} to 2048 chars"
    value="${value:0:2048}"
  fi

  echo "$value"
}

# Export for use in subshells
export -f sanitize_env_value
```

Update in `spawn-wave.sh`:

```bash
spawn_container() {
  local wave_num="$1"
  local batch_data="$2"

  local batch_id tier memory_limit task_prompt container_name
  batch_id=$(echo "$batch_data" | jq -r '.batch_id')
  tier=$(echo "$batch_data" | jq -r '.tier')
  memory_limit=$(get_tier_memory "$tier")
  task_prompt=$(echo "$batch_data" | jq -r '.task_prompt // "Fix errors in assigned files"')

  # SANITIZE TASK PROMPT
  task_prompt=$(sanitize_env_value "$task_prompt")

  # Create container name
  if ! container_name=$(create_container_name "$wave_num" "$batch_id"); then
    log_error "Failed to create unique container name for batch: $batch_id"
    return 1
  fi

  log_info "Spawning container: $container_name (batch=$batch_id, tier=$tier, memory=$memory_limit)"

  # ... rest of function with sanitized task_prompt
}
```

### Testing

```bash
# Test with special characters
BATCHING_PLAN='{"waves":[{"wave_number":1,"batches":[
  {"batch_id":"batch-1","task_prompt":"Line1\nLine2\nLine3","tier":1}
]}]}'

./spawn-wave.sh --wave-plan <(echo "$BATCHING_PLAN") --wave-number 1 --dry-run
# Should show newlines converted to spaces
```

---

## MEDIUM FIX #1: Log File Permission Hardening

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
**Lines:** 353-367
**Issue:** Saved logs use default world-readable permissions

### Current Code (Vulnerable)
```bash
save_container_logs() {
  local container_id="$1"
  local output_dir="$2"

  mkdir -p "$output_dir"
  local log_file="$output_dir/${container_id}.log"

  docker logs "$container_id" > "$log_file" 2>&1 || {
    log_error "Failed to save logs for container $container_id"
    return 1
  }

  log_success "Logs saved: $log_file"
}
```

### Fixed Code

```bash
save_container_logs() {
  local container_id="$1"
  local output_dir="$2"

  if [[ -z "$container_id" ]] || [[ -z "$output_dir" ]]; then
    log_error "Container ID and output directory required"
    return 1
  fi

  mkdir -p "$output_dir"

  # Create directory with restricted permissions
  chmod 700 "$output_dir" || {
    log_warn "Failed to restrict log directory permissions: $output_dir"
  }

  local log_file="$output_dir/${container_id}.log"

  # Create empty file with restricted permissions (0600)
  touch "$log_file"
  chmod 600 "$log_file" || {
    log_error "Failed to set log file permissions: $log_file"
    return 1
  }

  log_info "Saving logs for container $container_id to $log_file"

  # Write logs to file with restricted permissions
  docker logs "$container_id" > "$log_file" 2>&1 || {
    log_error "Failed to save logs for container $container_id"
    return 1
  }

  log_success "Logs saved: $log_file (permissions: 0600)"
  return 0
}
```

### Testing

```bash
# After running containers with log preservation
./monitor-wave.sh --containers spawned.json --preserve-logs

# Verify permissions
ls -la .artifacts/container-logs/
# Output should show: -rw------- 1 user group ...

# Verify non-owner cannot read
su - otheruser -c "cat .artifacts/container-logs/*.log"
# Should be permission denied
```

---

## MEDIUM FIX #2: Improved Batch ID Extraction

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/spawn-wave.sh`
**Lines:** 415-417
**Issue:** Unsafe grep pattern matching for Docker environment variables

### Current Code (Vulnerable)
```bash
batch_id=$(docker inspect -f '{{.Config.Env}}' "$container_id" | \
           grep -oP 'BATCH_ID=\K[^,]+' || echo "unknown")
tier=$(echo "$batch_id" | \
       grep -oP 'batch-\d+-tier-\K\d+' || echo "1")
```

### Problems
1. Assumes comma-separated env vars (Docker uses newlines)
2. Loose matching could capture unintended data
3. Information leakage if BATCH_ID contains sensitive data

### Fixed Code

```bash
# Add to docker-helpers.sh
extract_container_batch_id() {
  local container_id="$1"

  # Use jq to safely parse Docker inspect output
  docker inspect --format='{{json .Config.Env}}' "$container_id" 2>/dev/null | \
    jq -r '.[] | select(startswith("BATCH_ID=")) | ltrimstr("BATCH_ID=")' || \
    echo "unknown"
}

extract_container_tier() {
  local batch_id="$1"

  # Extract tier from batch ID safely using bash parameter expansion
  if [[ "$batch_id" =~ batch-[0-9]+-tier-([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "1"  # Default tier
  fi
}

export -f extract_container_batch_id extract_container_tier
```

Update in `collect_container_info()`:

```bash
collect_container_info() {
  local wave_num="$1"
  local pattern="cfn-wave${wave_num}-*"

  log_info "Collecting container information for pattern: $pattern"

  local containers_json="[]"
  local container_count=0

  # Query running and exited containers
  while IFS= read -r container_id; do
    local container_name started_at batch_id tier memory_limit status

    container_name=$(docker inspect -f '{{.Name}}' "$container_id" | sed 's|^/||')
    started_at=$(docker inspect -f '{{.State.StartedAt}}' "$container_id")
    status=$(docker inspect -f '{{.State.Status}}' "$container_id")

    # Use improved extraction functions
    batch_id=$(extract_container_batch_id "$container_id")
    tier=$(extract_container_tier "$batch_id")
    memory_limit=$(docker inspect -f '{{.HostConfig.Memory}}' "$container_id" | awk '{printf "%.0fm\n", $1/1024/1024}' || echo "unknown")

    local container_obj
    container_obj=$(jq -n \
      --arg container_id "$container_id" \
      --arg container_name "$container_name" \
      --arg batch_id "$batch_id" \
      --arg tier "$tier" \
      --arg memory_limit "$memory_limit" \
      --arg status "$status" \
      --arg started_at "$started_at" \
      '{
        container_id: $container_id,
        container_name: $container_name,
        batch_id: $batch_id,
        tier: ($tier | tonumber),
        memory_limit: $memory_limit,
        status: $status,
        started_at: $started_at
      }')

    containers_json=$(echo "$containers_json" | jq --argjson obj "$container_obj" '. += [$obj]')
    container_count=$((container_count + 1))

  done < <(docker ps -a --filter "name=$pattern" --format "{{.ID}}")

  log_info "Found $container_count containers"

  echo "$containers_json"
}
```

---

## MEDIUM FIX #3: Strict Container Cleanup Pattern Validation

### Location
**File:** `.claude/skills/cfn-docker-wave-execution/cleanup-wave.sh`
**Lines:** 204-209
**Issue:** Loose pattern matching could delete unrelated containers

### Current Code (Vulnerable)
```bash
extract_container_ids_by_pattern() {
  local pattern="$1"

  docker ps -a --filter "name=$pattern" --format "{{.ID}}"
}
```

### Fixed Code

Add validation function:

```bash
# Add to docker-helpers.sh
validate_container_cleanup_pattern() {
  local pattern="$1"

  # Only allow specific, safe patterns
  # Valid: cfn-wave1-*, cfn-wave2-*, etc.
  if ! [[ "$pattern" =~ ^cfn-wave[0-9]+-[a-zA-Z0-9_-]+(\*)?$ ]]; then
    log_error "Container cleanup pattern does not match safety requirements"
    log_error "Pattern: $pattern"
    log_error "Expected format: cfn-wave<N>-<batch-id> or cfn-wave<N>-*"
    log_error "Examples: cfn-wave1-batch-1, cfn-wave2-*, cfn-wave3-batch_123"
    return 1
  fi

  return 0
}

export -f validate_container_cleanup_pattern
```

Update in `cleanup-wave.sh`:

```bash
# Add validation in validate_arguments()
validate_arguments() {
  # ... existing checks ...

  # Validate pattern if provided
  if [[ -n "$PATTERN" ]]; then
    if ! validate_container_cleanup_pattern "$PATTERN"; then
      exit 2
    fi
  fi

  log_debug "Arguments validated"
}

# Also update extract_container_ids_by_pattern to use exact matching
extract_container_ids_by_pattern() {
  local pattern="$1"

  # Convert shell pattern to Docker regex for more precise matching
  # Replace * with .* for regex
  local docker_filter="${pattern//'*'/'.*'}"

  docker ps -a --format "{{.Names}}" | while read -r name; do
    # Use exact regex matching instead of substring matching
    if [[ "$name" =~ ^${docker_filter}$ ]]; then
      # Get container ID for the matched name
      docker ps -a --filter "name=^${name}$" --format "{{.ID}}"
    fi
  done
}
```

### Testing

```bash
# Test 1: Valid patterns should work
./cleanup-wave.sh --pattern "cfn-wave1-batch-1" --dry-run
# Success

./cleanup-wave.sh --pattern "cfn-wave2-*" --dry-run
# Success

# Test 2: Invalid patterns should fail
./cleanup-wave.sh --pattern "cfn-*" --dry-run
# Error: Pattern does not match safety requirements

./cleanup-wave.sh --pattern "*" --dry-run
# Error: Pattern does not match safety requirements

./cleanup-wave.sh --pattern "production-*" --dry-run
# Error: Pattern does not match safety requirements
```

---

## Implementation Checklist

- [ ] **Critical Fix #1:** Add validate_environment_variable() to docker-helpers.sh
- [ ] **Critical Fix #1:** Update spawn-wave.sh --environment handler
- [ ] **Critical Fix #2:** Add generate_safe_container_name() to docker-helpers.sh
- [ ] **Critical Fix #2:** Add container_name_exists() to docker-helpers.sh
- [ ] **Critical Fix #2:** Update create_container_name() in spawn-wave.sh
- [ ] **Critical Fix #3:** Add sanitize_env_value() to docker-helpers.sh
- [ ] **Critical Fix #3:** Update spawn_container() to sanitize task_prompt
- [ ] **Medium Fix #1:** Update save_container_logs() in docker-helpers.sh
- [ ] **Medium Fix #2:** Add extraction functions to docker-helpers.sh
- [ ] **Medium Fix #2:** Update collect_container_info() in spawn-wave.sh
- [ ] **Medium Fix #3:** Add validate_container_cleanup_pattern() to docker-helpers.sh
- [ ] **Medium Fix #3:** Update cleanup-wave.sh validation
- [ ] **Medium Fix #3:** Update extract_container_ids_by_pattern() function
- [ ] **Testing:** Run security test suite (see SECURITY_REVIEW document)
- [ ] **Documentation:** Update SKILL.md with new validation behavior
- [ ] **Code Review:** Security review of all changes
- [ ] **Deployment:** Deploy to staging environment first

---

## Verification Steps

After implementing fixes, verify with:

```bash
# 1. Syntax check
bash -n spawn-wave.sh
bash -n monitor-wave.sh
bash -n cleanup-wave.sh
bash -n lib/docker-helpers.sh

# 2. Functional test
./spawn-wave.sh --help
./monitor-wave.sh --help
./cleanup-wave.sh --help

# 3. Security validation
./.claude/hooks/cfn-invoke-post-edit.sh spawn-wave.sh --agent-id test
./.claude/hooks/cfn-invoke-post-edit.sh cleanup-wave.sh --agent-id test
./.claude/hooks/cfn-invoke-post-edit.sh lib/docker-helpers.sh --agent-id test

# 4. Run test suite
./tests/docker/docker-wave-execution-security-tests.sh
```

---

## Rollback Plan

If issues arise after deployment:

```bash
# Revert to previous version
git checkout HEAD~1 -- .claude/skills/cfn-docker-wave-execution/

# Or restore from backup
cp .backups/*/docker-helpers.sh .claude/skills/cfn-docker-wave-execution/lib/

# Verify functionality
./spawn-wave.sh --help
```

---

## Timeline

- **Week 1:** Implement and test CRITICAL fixes
- **Week 2:** Implement and test MEDIUM fixes
- **Week 3:** Full security test cycle and deployment
- **Week 4:** Production monitoring and incident response readiness

