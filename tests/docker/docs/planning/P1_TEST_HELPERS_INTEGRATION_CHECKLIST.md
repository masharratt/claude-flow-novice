# P1 Test Helpers Integration Checklist

Use this checklist when implementing P1 tests (Tests 6-12) with architecture-test-helpers.sh

## Pre-Integration Checklist

- [ ] Reviewed `ARCHITECTURE_TEST_HELPERS.md` documentation
- [ ] Ran `test-architecture-helpers.sh` to verify helpers work (22/22 tests pass)
- [ ] Reviewed `example-p1-test.sh` integration patterns
- [ ] Verified `bc` is installed (`command -v bc`)
- [ ] Verified Docker is available (`docker ps`)
- [ ] Verified Redis container is running (for integration tests)

## Script Template Checklist

- [ ] Added proper shebang: `#!/bin/bash`
- [ ] Enabled strict mode: `set -euo pipefail`
- [ ] Resolved PROJECT_ROOT: `PROJECT_ROOT=$(git rev-parse --show-toplevel)`
- [ ] Sourced helpers: `source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"`
- [ ] Added cleanup trap: `trap cleanup EXIT`
- [ ] Added test metadata comment block

## Environment Variable Tests (Test 6)

- [ ] Use `validate_env_file` for .env file validation
- [ ] Use `check_required_vars` for container variable checks
- [ ] Use `validate_runtime_override` for override verification
- [ ] Use `env_var_exists` for local environment checks

**Example:**
```bash
validate_env_file "$PROJECT_ROOT/.env.poc"
check_required_vars "cfn-agent-123" "CFN_REDIS_HOST" "TASK_ID"
validate_runtime_override "cfn-agent-123" "LOG_LEVEL" "debug"
```

## Wave Spawning Tests (Test 7)

- [ ] Use `validate_wave_parallelism` for parallel agent validation
- [ ] Use `monitor_sequential_waves` for wave completion tracking
- [ ] Verify container labels: `task_id`, `wave`

**Example:**
```bash
validate_wave_parallelism "task-abc123" 5
monitor_sequential_waves "task-abc123" 3
```

## TypeScript Analysis Tests (Test 8)

- [ ] Use `parse_typescript_errors` for error counting
- [ ] Use `validate_error_delta` for reduction validation
- [ ] Use `create_error_map` for file-level analysis

**Example:**
```bash
errors=$(parse_typescript_errors "typescript-agent-123")
validate_error_delta 15 $errors
create_error_map "typescript-agent-123" > /tmp/error-map.json
```

## CFN Loop Compliance Tests (Test 9)

- [ ] Use `validate_gate_threshold` for Loop 3 gate check
- [ ] Use `validate_consensus` for Loop 2 consensus
- [ ] Use `parse_po_decision` for Product Owner decision
- [ ] Use `validate_iteration_metadata` for iteration tracking

**Example:**
```bash
validate_gate_threshold 0.75 0.85 0.90 0.88
validate_consensus 0.90 0.92 0.91 0.93 0.89
decision=$(parse_po_decision "product-owner-123")
validate_iteration_metadata "swarm:task:agent" "2"
```

## Coordinator Tests (Tests 11)

- [ ] Use `wait_for_coordinator` for status waiting
- [ ] Use `get_coordinator_status` for status checks
- [ ] Use `parse_coordinator_logs` for log analysis
- [ ] Use `check_coordinator_heartbeat` for health monitoring
- [ ] Use `count_spawned_agents` for agent tracking

**Example:**
```bash
wait_for_coordinator "task-abc123" "running" 60
status=$(get_coordinator_status "task-abc123")
check_coordinator_heartbeat "task-abc123" 10
agent_count=$(count_spawned_agents "task-abc123")
```

## Provider Authentication Tests (Test 12)

- [ ] Use `validate_provider_auth` for credential checks
- [ ] Use `test_provider_failover` for failover validation
- [ ] Use `validate_custom_routing` for routing checks

**Example:**
```bash
validate_provider_auth "zai" "cfn-agent-123"
test_provider_failover "cfn-agent-123" "zai" "anthropic"
validate_custom_routing "cfn-coordinator-123"
```

## Build Tests (Test 10)

- [ ] Use `check_image_freshness` for image age validation
- [ ] Use `validate_rsync_exclusions` for .dockerignore checks
- [ ] Use `verify_build_context_size` for size validation

**Example:**
```bash
check_image_freshness "cfn-agent:latest" 3600
validate_rsync_exclusions "$PROJECT_ROOT"
verify_build_context_size "$PROJECT_ROOT" 100
```

## Error Handling Checklist

- [ ] Disable errexit for test sections: `set +e`
- [ ] Re-enable after tests: `set -e`
- [ ] Use structured logging: `log_step`, `log_info`, `log_success`, `log_error`
- [ ] Add timeouts for async operations
- [ ] Verify container existence before operations
- [ ] Clean up test artifacts in cleanup trap

## Common Patterns

### Pattern 1: Gate/Consensus Validation
```bash
# Collect scores
scores=($(collect_agent_scores "task-id"))

# Validate threshold
if validate_gate_threshold 0.75 "${scores[@]}"; then
    log_success "Gate passed"
else
    log_error "Gate failed"
fi
```

### Pattern 2: Container Variable Check
```bash
# Start container
docker run -d --name test-agent -e VAR=value image:tag

# Verify variables
check_required_vars "test-agent" "VAR" "OTHER_VAR"
```

### Pattern 3: Error Delta Tracking
```bash
# Get error counts
before=$(parse_typescript_errors "agent-iter1")
after=$(parse_typescript_errors "agent-iter2")

# Validate reduction
validate_error_delta $before $after
```

## Troubleshooting

### bc not found
```bash
if ! command -v bc &>/dev/null; then
    log_error "bc not installed (required for floating-point math)"
    exit 1
fi
```

### Container not found
```bash
if ! docker ps -a --format '{{.Names}}' | grep -q "^container-name$"; then
    log_error "Container not found"
    exit 1
fi
```

### Redis connection issues
```bash
if ! docker exec cfn-redis redis-cli ping &>/dev/null; then
    log_error "Redis not responding"
    exit 1
fi
```

## Post-Integration Checklist

- [ ] All tests pass locally
- [ ] Test scripts are executable (`chmod +x`)
- [ ] Line endings are Unix format (LF, not CRLF)
- [ ] Syntax validation passes (`bash -n script.sh`)
- [ ] Cleanup trap verified (containers removed)
- [ ] Documentation updated with test examples
- [ ] Test results logged appropriately

## Reference Files

- **Helpers:** `tests/docker/architecture-test-helpers.sh`
- **Documentation:** `tests/docker/ARCHITECTURE_TEST_HELPERS.md`
- **Unit Tests:** `tests/docker/test-architecture-helpers.sh`
- **Examples:** `tests/docker/example-p1-test.sh`
- **Template:** `tests/claude.md` (authoring standards)

## Success Criteria

- [ ] Test implements required P1 scenario
- [ ] Uses architecture helpers appropriately
- [ ] Follows shell scripting best practices
- [ ] Includes proper error handling
- [ ] Cleans up resources properly
- [ ] Executes successfully in CI/CD
- [ ] Documentation is clear and complete

---

**Last Updated:** 2025-11-13
**Version:** 1.0.0
**Related:** Phase 4 - Loop 3 Iteration 1
