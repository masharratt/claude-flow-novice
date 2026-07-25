# Architecture Test Helpers Documentation

**Phase 4 - Loop 3 Iteration 1**

## Overview

`architecture-test-helpers.sh` provides specialized validation utilities for P1 architecture tests, extending the Docker-specific helpers from `test-helpers.sh` with CFN Loop, coordinator, and provider-specific functions.

## Integration Hierarchy

```
tests/test-utils.sh               # Base: logging, assertions, Redis, Docker basics
    ↓
tests/docker/test-helpers.sh      # Docker: images, containers, networking, lifecycle
    ↓
tests/docker/architecture-test-helpers.sh  # Architecture: CFN Loop, coordinator, providers
```

## Usage Pattern

```bash
#!/bin/bash
# tests/docker/my-p1-test.sh
# Phase X :: Test description

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"
# ^ This automatically sources test-helpers.sh and test-utils.sh

cleanup() {
    cleanup_docker_test
}
trap cleanup EXIT

# Now you have access to all helper functions
```

## Function Categories

### 1. Environment Variable Validation

#### `env_var_exists "VAR_NAME"`
Check if environment variable exists and is non-empty.

**Returns:** 0 if exists, 1 if missing/empty

**Example:**
```bash
if env_var_exists "CFN_REDIS_HOST"; then
    log_success "Redis host configured"
fi
```

#### `validate_env_file "/path/to/.env"`
Comprehensive .env file validation:
- File existence
- Inline comment detection
- Empty value detection
- Duplicate key detection

**Returns:** 0 if valid, 1 if issues found

**Example:**
```bash
validate_env_file "$PROJECT_ROOT/.env.poc" || {
    log_error "Invalid .env file"
    exit 1
}
```

#### `check_required_vars "container-name" "VAR1" "VAR2" "VAR3"`
Verify required environment variables exist in container.

**Returns:** 0 if all present, 1 if any missing

**Example:**
```bash
check_required_vars "cfn-coordinator-123" \
    "CFN_REDIS_HOST" \
    "CFN_REDIS_PORT" \
    "TASK_ID"
```

#### `validate_runtime_override "container" "VAR_NAME" "expected-value"`
Validate environment variable was properly overridden at runtime.

**Returns:** 0 if matches, 1 if mismatch

**Example:**
```bash
validate_runtime_override "test-agent" "LOG_LEVEL" "debug"
```

### 2. CFN Loop Validation

#### `validate_gate_threshold threshold score1 score2 score3...`
Calculate average confidence score and validate against Loop 3 gate threshold.

**Uses:** bc for floating-point arithmetic

**Returns:** 0 if average >= threshold, 1 otherwise

**Example:**
```bash
# Gate check: average of 3 agents must be >= 0.75
validate_gate_threshold 0.75 0.85 0.80 0.90
```

#### `validate_consensus threshold score1 score2 score3...`
Calculate average validator score and validate against Loop 2 consensus threshold.

**Uses:** bc for floating-point arithmetic

**Returns:** 0 if consensus >= threshold, 1 otherwise

**Example:**
```bash
# Consensus: average of 4 validators must be >= 0.90
validate_consensus 0.90 0.88 0.92 0.91 0.89
```

#### `parse_po_decision "container-name"`
Extract Product Owner decision from container logs.

**Returns:** "PROCEED" | "ITERATE" | "ABORT" | "UNKNOWN"

**Example:**
```bash
decision=$(parse_po_decision "cfn-product-owner-123")

case "$decision" in
    PROCEED) log_success "Task approved" ;;
    ITERATE) log_info "Refinement needed" ;;
    ABORT) log_error "Task rejected" ;;
    *) log_error "Invalid decision" ;;
esac
```

#### `validate_iteration_metadata "redis-key" "expected-iteration"`
Verify iteration number stored in Redis metadata.

**Returns:** 0 if matches, 1 if mismatch

**Example:**
```bash
validate_iteration_metadata "swarm:task-123:agent-1" "2"
```

### 3. Coordinator Lifecycle

#### `wait_for_coordinator "task-id" "status" [timeout]`
Block until coordinator reaches expected status (default timeout: 30s).

**Returns:** 0 if reached, 1 if timeout

**Example:**
```bash
wait_for_coordinator "task-abc123" "running" 60 || {
    log_error "Coordinator failed to start"
    exit 1
}
```

#### `get_coordinator_status "task-id"`
Get current coordinator status from Redis.

**Returns:** Status string or "unknown"

**Example:**
```bash
status=$(get_coordinator_status "task-abc123")
echo "Coordinator status: $status"
```

#### `parse_coordinator_logs "container-name" "pattern"`
Extract matching log lines from coordinator container.

**Returns:** Matching lines or empty string

**Example:**
```bash
errors=$(parse_coordinator_logs "cfn-coordinator-123" "ERROR")
if [ -n "$errors" ]; then
    log_error "Coordinator errors detected:"
    echo "$errors"
fi
```

#### `check_coordinator_heartbeat "task-id" [max-age-seconds]`
Verify coordinator heartbeat freshness (default max age: 30s).

**Returns:** 0 if fresh, 1 if stale/missing

**Example:**
```bash
check_coordinator_heartbeat "task-abc123" 10 || {
    log_warn "Coordinator heartbeat stale"
}
```

#### `count_spawned_agents "task-id"`
Count agents spawned by coordinator for given task.

**Returns:** Agent count (integer)

**Example:**
```bash
agent_count=$(count_spawned_agents "task-abc123")
log_info "Spawned $agent_count agents"
```

### 4. Provider Authentication

#### `validate_provider_auth "provider" "container-name"`
Validate provider-specific authentication variables.

**Supported Providers:**
- `zai`: Requires ZAI_API_KEY, ZAI_BASE_URL
- `kimi`: Requires KIMI_API_KEY, KIMI_BASE_URL
- `anthropic`: Requires ANTHROPIC_API_KEY
- `openrouter`: Requires OPENROUTER_API_KEY

**Returns:** 0 if valid, 1 if missing credentials

**Example:**
```bash
validate_provider_auth "zai" "cfn-agent-123" || {
    log_error "Z.ai credentials missing"
    exit 1
}
```

#### `test_provider_failover "container" "primary" "fallback"`
Test provider failover configuration.

**Returns:** 0 if either provider configured, 1 if both missing

**Example:**
```bash
test_provider_failover "cfn-agent-123" "zai" "anthropic"
```

#### `validate_custom_routing "container-name"`
Validate custom provider routing configuration.

**Returns:** 0 if valid, 1 if misconfigured

**Example:**
```bash
validate_custom_routing "cfn-coordinator-123"
```

### 5. Build and Sync

#### `check_image_freshness "image:tag" [max-age-seconds]`
Verify Docker image was built recently (default max age: 3600s).

**Returns:** 0 if fresh, 1 if stale/missing

**Example:**
```bash
check_image_freshness "cfn-agent:latest" 7200 || {
    log_warn "Image may be outdated, consider rebuilding"
}
```

#### `validate_rsync_exclusions "/path/to/project"`
Validate recommended .dockerignore patterns for efficient builds.

**Returns:** 0 (non-fatal warnings for missing patterns)

**Example:**
```bash
validate_rsync_exclusions "$PROJECT_ROOT"
```

#### `verify_build_context_size "/path/to/project" [max-mb]`
Check build context size (default max: 100MB).

**Returns:** 0 if acceptable, 1 if too large

**Example:**
```bash
verify_build_context_size "$PROJECT_ROOT" 150
```

### 6. Wave Spawning and Parallelism

#### `validate_wave_parallelism "task-id" [expected-parallel]`
Verify expected number of agents running in parallel (default: 3).

**Returns:** 0 if matches, 1 if mismatch

**Example:**
```bash
# Expect 5 agents running in parallel
validate_wave_parallelism "task-abc123" 5
```

#### `monitor_sequential_waves "task-id" [num-waves]`
Monitor sequential wave execution with timeout handling.

**Returns:** 0 if all waves complete, 1 if timeout

**Example:**
```bash
# Monitor 3 sequential waves
monitor_sequential_waves "task-abc123" 3 || {
    log_error "Wave execution failed"
    exit 1
}
```

### 7. TypeScript Error Analysis

#### `parse_typescript_errors "container-name"`
Count TypeScript errors in agent container logs.

**Returns:** Error count (integer)

**Example:**
```bash
error_count=$(parse_typescript_errors "typescript-agent-123")
log_info "Found $error_count TypeScript errors"
```

#### `validate_error_delta before after`
Validate error count reduction.

**Returns:** 0 if reduced, 1 if unchanged/increased

**Example:**
```bash
before_errors=10
after_errors=5

validate_error_delta $before_errors $after_errors || {
    log_error "Error count did not decrease"
}
```

#### `create_error_map "container-name"`
Generate JSON map of files to error counts.

**Output:** JSON objects (one per line)

**Example:**
```bash
create_error_map "typescript-agent-123" > /tmp/error-map.json
```

## Error Handling

All functions follow consistent error handling patterns:

1. **Return Codes:** 0 for success, 1 for failure
2. **Logging:** Use log_success, log_error, log_warn for visibility
3. **Cleanup:** Non-blocking where appropriate (build validation)
4. **Strict Mode:** All scripts use `set -euo pipefail`

## Dependencies

### Required External Tools
- `docker` - Container management
- `docker-compose` - Service orchestration
- `bc` - Floating-point arithmetic (gate/consensus validation)
- `jq` - JSON parsing (optional, for advanced scenarios)

### Required Files
- `tests/test-utils.sh` - Base test utilities
- `tests/docker/test-helpers.sh` - Docker-specific helpers

### Redis Configuration
- Uses `$REDIS_CLI_CMD` from test-utils.sh
- Default: `docker exec cfn-redis redis-cli`
- Configurable via `CFN_REDIS_HOST` and `CFN_REDIS_PORT`

## Integration with P1 Tests

### Test 6: Environment Variable Propagation
```bash
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

test_env_propagation() {
    validate_env_file "$PROJECT_ROOT/.env.poc"
    check_required_vars "cfn-agent" "CFN_REDIS_HOST" "TASK_ID"
    validate_runtime_override "cfn-agent" "LOG_LEVEL" "debug"
}
```

### Test 7: Wave Spawning
```bash
test_wave_execution() {
    validate_wave_parallelism "task-123" 5
    monitor_sequential_waves "task-123" 3
}
```

### Test 8: TypeScript Analysis
```bash
test_typescript_errors() {
    errors=$(parse_typescript_errors "typescript-agent")
    validate_error_delta 15 $errors
}
```

### Test 9: CFN Loop Compliance
```bash
test_cfn_loop() {
    validate_gate_threshold 0.75 0.85 0.80 0.90
    validate_consensus 0.90 0.88 0.92 0.91
    decision=$(parse_po_decision "product-owner")
}
```

## Testing the Helpers

### Unit Test Pattern
```bash
#!/bin/bash
# tests/docker/test-architecture-helpers.sh

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

test_gate_threshold_pass() {
    log_step "Test: Gate threshold passes"
    validate_gate_threshold 0.75 0.85 0.80 0.90
    assert_success $? "Gate threshold validation"
}

test_gate_threshold_fail() {
    log_step "Test: Gate threshold fails"
    ! validate_gate_threshold 0.90 0.85 0.80 0.70
    assert_success $? "Gate threshold rejection"
}

test_gate_threshold_pass
test_gate_threshold_fail
```

## Best Practices

1. **Always source from architecture-test-helpers.sh** - It includes the full chain
2. **Use cleanup traps** - Ensure containers are removed even on failure
3. **Validate inputs** - Check container/task existence before operations
4. **Use timeouts** - Prevent infinite waits in CI/CD environments
5. **Log verbosely** - Use log_step, log_info for debugging
6. **Handle edge cases** - Empty arrays, missing containers, network issues

## Troubleshooting

### "Container not found" Errors
Ensure container exists before calling helpers:
```bash
if ! is_container_running "cfn-agent-123"; then
    log_error "Container not running"
    exit 1
fi
```

### Floating-Point Math Errors
Ensure `bc` is installed:
```bash
if ! command -v bc &>/dev/null; then
    log_error "bc not installed (required for gate/consensus validation)"
    exit 1
fi
```

### Redis Connection Issues
Verify Redis container is running:
```bash
if ! verify_redis_health; then
    log_error "Redis not healthy"
    exit 1
fi
```

## Version History

- **v1.0.0** (2025-11-13): Initial implementation for Phase 4 P1 tests
  - Environment variable validation
  - CFN Loop helpers (gate, consensus, PO decision)
  - Coordinator lifecycle management
  - Provider authentication validation
  - Build and sync helpers
  - Wave spawning support
  - TypeScript error analysis

## Related Documentation

- `tests/claude.md` - Test authoring standards
- `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md` - P1 test specifications
- `tests/docker/test-helpers.sh` - Docker-specific utilities
- `tests/test-utils.sh` - Base test framework
