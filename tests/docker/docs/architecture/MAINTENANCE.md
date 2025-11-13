# Docker Test Suite Maintenance Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Maintainers:** CFN Dev Team

---

## Overview

This guide provides procedures for maintaining the Docker test suite, including test execution, failure diagnosis, helper function usage, and security pattern application.

**Related Documentation:**
- Architecture: `tests/docker/ARCHITECTURE.md`
- Execution: `tests/docker/EXECUTION_GUIDE.md`
- Technical Debt: `tests/docker/TECHNICAL_DEBT.md`
- Standards: `tests/CLAUDE.md`

---

## Test Execution Procedures

### Running Individual Tests

```bash
# Execute single test
bash tests/docker/<test-name>.sh

# With custom environment
CFN_REDIS_HOST=localhost CFN_REDIS_PORT=6379 bash tests/docker/<test-name>.sh

# With debugging enabled
DEBUG=1 bash tests/docker/<test-name>.sh
```

### Running Test Suites

```bash
# Run all P0 (critical) tests
for test in tests/docker/{redis-coordination,agent-lifecycle,memory-budget,provider-auth,coordinator-iteration}-tests.sh; do
    bash "$test" || echo "FAILED: $test"
done

# Run all P1 (high priority) tests
for test in tests/docker/{clustering-accuracy,env-propagation,wave-spawning,typescript-analysis,cfn-loop-compliance}-tests.sh; do
    bash "$test" || echo "FAILED: $test"
done

# Run production pattern validation
bash tests/docker/intelligent-coordinator-test.sh
```

### Test Organization

**Priority Levels:**
- **P0 (Critical):** Must pass for production - Redis, agent lifecycle, memory, auth
- **P1 (High):** Architecture alignment - clustering, env propagation, wave spawning
- **P2 (Medium):** Reliability improvements - build sync, fault tolerance

**Test Categories:**
- Coordination: `redis-coordination-tests.sh`, `cfn-loop-compliance-tests.sh`
- Lifecycle: `agent-lifecycle-tests.sh`, `coordinator-iteration-tests.sh`
- Performance: `memory-budget-tests.sh`, `wave-spawning-tests.sh`
- Security: `provider-auth-tests.sh`, `env-propagation-tests.sh`
- Integration: `intelligent-coordinator-test.sh`, `docker-hello-world-parity-tests.sh`

---

## Common Failure Modes and Fixes

### 1. Redis Connection Failures

**Symptom:**
```
Error: Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Diagnosis:**
- Check if Redis container is running: `docker ps --filter "name=cfn-redis"`
- Verify environment variables: `echo $CFN_REDIS_HOST $CFN_REDIS_PORT`
- Test connection: `redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" ping`

**Fix:**
```bash
# Start Redis container
docker run -d --name cfn-redis \
    --network cfn-network \
    -p 6379:6379 \
    redis:7.2-alpine

# Update environment
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
```

**Related Issue:** Bug #6 - See `tests/docker/TECHNICAL_DEBT.md`

### 2. Container Exit Code Failures

**Symptom:**
```
Expected exit code: 0
Got exit code: 1
```

**Diagnosis:**
```bash
# Check container logs
docker logs <container-id>

# Inspect container status
docker inspect --format='{{.State.ExitCode}}: {{.State.Error}}' <container-id>

# View last 50 lines
docker logs --tail 50 <container-id>
```

**Common Causes:**
1. Missing environment variables (CFN_API_KEY, CFN_REDIS_*)
2. Volume mount failures (check PROJECT_ROOT path)
3. Network isolation issues
4. Memory limits exceeded

**Fix Pattern:**
```bash
# Verify environment file
cat .env | grep -E "CFN_(API_KEY|REDIS_HOST|REDIS_PORT)"

# Check volume mounts
docker inspect <container-id> --format='{{json .Mounts}}' | jq

# Verify network connectivity
docker exec <container-id> ping -c 1 cfn-redis
```

### 3. Agent Completion Timeout

**Symptom:**
```
Timeout waiting for agent completion after 300 seconds
```

**Diagnosis:**
```bash
# Check agent status
docker ps --filter "label=cfn.task.id=<task-id>"

# Check Redis coordination keys
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" keys "swarm:*"

# Check agent heartbeat
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" get "coordinator:heartbeat"
```

**Common Causes:**
1. Agent process stuck (infinite loop, deadlock)
2. Redis coordination failure (Bug #6)
3. Docker volume permission issues
4. Network latency

**Fix Pattern:**
```bash
# Kill stuck container
docker kill <container-id>

# Check for zombie processes
docker ps -a --filter "status=exited" --filter "label=cfn.task.id=<task-id>"

# Clear Redis coordination state
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" flushall
```

### 4. Memory Budget Exceeded

**Symptom:**
```
Error: Cannot spawn wave - memory budget exceeded (1500MB used / 1024MB limit)
```

**Diagnosis:**
```bash
# Check running containers memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"

# Check memory limits
docker inspect <container-id> --format='{{.HostConfig.Memory}}'
```

**Fix:**
```bash
# Increase memory budget (coordinator env)
export CFN_MEMORY_BUDGET_MB=2048

# Reduce tier allocations
export CFN_TIER1_MEMORY_MB=256
export CFN_TIER2_MEMORY_MB=384
export CFN_TIER3_MEMORY_MB=512
export CFN_TIER4_MEMORY_MB=768
```

### 5. Docker Image Not Found

**Symptom:**
```
Error: Unable to find image 'cfn-intelligent-coordinator:latest' locally
```

**Fix:**
```bash
# Build missing image
docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

# Or pull from registry
docker pull your-registry/cfn-intelligent-coordinator:latest
docker tag your-registry/cfn-intelligent-coordinator:latest cfn-intelligent-coordinator:latest
```

### 6. Network Isolation Issues

**Symptom:**
```
Error: network cfn-network not found
```

**Fix:**
```bash
# Create Docker network
docker network create cfn-network

# Verify network
docker network ls | grep cfn-network

# Connect container to network
docker network connect cfn-network <container-id>
```

### 7. Permission Denied on Volume Mounts

**Symptom:**
```
Error: EACCES: permission denied, open '/mnt/workspace/.env'
```

**Fix:**
```bash
# Check file permissions
ls -la .env

# Fix ownership (match container user)
chmod 644 .env

# Or use Docker user mapping
docker run --user "$(id -u):$(id -g)" ...
```

---

## Helper Function Usage Guide

### Test Utilities (test-utils.sh)

**Location:** `tests/test-utils.sh`

**Core Logging Functions:**
```bash
# Structured logging
log_step "Starting test phase 1"        # Blue, numbered step
log_info "Processing 10 files"          # Cyan, informational
log_success "Test passed"                # Green, success state
log_warning "Partial results"            # Yellow, warning state
log_error "Test failed: reason"          # Red, error state

# Test assertions
assert_success "command" "Expected success"
assert_equals "expected" "actual" "Values should match"
assert_not_empty "$variable" "Variable must be set"
```

**Docker Helpers:**
```bash
# Image management
verify_image "cfn-agent:latest"
ensure_image "cfn-agent:latest" "Dockerfile.agent"
get_image_size "cfn-agent:latest"

# Container lifecycle
start_redis          # Start Redis on cfn-network
stop_redis           # Stop and remove Redis
cleanup_containers   # Remove all test containers

# Security patterns
flags=$(get_secure_docker_flags)
docker run $flags ...
```

**Example Usage:**
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    cleanup_containers
    stop_redis
}
trap cleanup EXIT

test_redis_connection() {
    log_step "Testing Redis connection"
    start_redis

    assert_success "redis-cli -h localhost -p 6379 ping" "Redis should respond"
    log_success "Redis connection verified"
}

test_redis_connection
```

### Architecture Test Helpers (architecture-test-helpers.sh)

**Location:** `tests/docker/architecture-test-helpers.sh`

**Environment Validation:**
```bash
# Required variables check
check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"

# Env file validation
validate_env_file ".env"

# Gate threshold validation
validate_gate_threshold "0.85" "standard"
```

**Coordinator Validation:**
```bash
# Heartbeat freshness check
check_coordinator_heartbeat "$COORDINATOR_ID" 30  # 30 second threshold

# Wait for coordinator ready
wait_for_coordinator "$COORDINATOR_ID" 120  # 120 second timeout

# Parse coordinator logs
errors=$(parse_coordinator_logs "/tmp/coordinator.log")
```

**TypeScript Analysis:**
```bash
# Parse TypeScript errors
error_count=$(parse_typescript_errors "/tmp/tsc.log")

# Validate error reduction
validate_error_delta 100 50 "50% reduction"  # initial, final, target
```

**Wave Spawning Validation:**
```bash
# Validate wave parallelism
validate_wave_parallelism 4 5  # expected, actual

# Count spawned agents
agent_count=$(count_spawned_agents "$TASK_ID")
```

**Example Usage:**
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

test_coordinator_setup() {
    log_step "Validating coordinator environment"

    # Environment validation
    check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"
    validate_env_file ".env"
    validate_gate_threshold "0.75" "standard"

    # Start coordinator
    COORDINATOR_ID=$(docker run -d ...)

    # Wait for ready state
    wait_for_coordinator "$COORDINATOR_ID" 120
    check_coordinator_heartbeat "$COORDINATOR_ID" 30

    log_success "Coordinator setup validated"
}
```

### Remediation Helpers (remediation-helpers.sh)

**Location:** `tests/docker/remediation-helpers.sh`

**Docker Pattern Migrations:**
```bash
# Add security flags to docker run command
add_security_flags_to_docker_run "/path/to/test.sh"

# Add architecture helper sourcing
add_architecture_helper_sourcing "/path/to/test.sh"

# Add cleanup trap
add_cleanup_trap "/path/to/test.sh"
```

**Batch Operations:**
```bash
# Update multiple tests
for test in tests/docker/*.sh; do
    add_architecture_helper_sourcing "$test"
done
```

---

## Security Pattern Reference

### 1. Secure Docker Flags

**Pattern:**
```bash
# Get standardized security flags
SECURE_FLAGS=$(get_secure_docker_flags)

# Apply to container spawn
docker run $SECURE_FLAGS \
    --name my-container \
    my-image:latest
```

**Flags Applied:**
- `--security-opt no-new-privileges` - Prevent privilege escalation
- `--read-only` - Immutable filesystem
- `--tmpfs /tmp:rw,noexec,nosuid,size=100m` - Writable temp with restrictions
- `--cap-drop ALL` - Drop all Linux capabilities

**When to Use:**
- Production deployments (REQUIRED)
- Integration tests (RECOMMENDED)
- Validation tests (OPTIONAL)

**Exemptions:**
- Tests requiring write access to volumes
- Debugging scenarios
- Performance profiling (caps may interfere)

### 2. Test Credential Generation

**Pattern:**
```bash
# Generate temporary test credentials
TEST_API_KEY=$(generate_test_credential "api_key")
TEST_PASSWORD=$(generate_test_credential "password")

# Use in container
docker run \
    -e CFN_API_KEY="$TEST_API_KEY" \
    my-image:latest
```

**Benefits:**
- No hardcoded secrets in test files
- Unique credentials per test run
- Automatic cleanup on test exit

### 3. Environment Variable Propagation

**Pattern:**
```bash
# Validate required variables
check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"

# Pass to container
docker run \
    -e CFN_API_KEY="$CFN_API_KEY" \
    -e CFN_REDIS_HOST="$CFN_REDIS_HOST" \
    -e CFN_REDIS_PORT="$CFN_REDIS_PORT" \
    my-image:latest
```

**Bug #6 Compliance:**
- ALWAYS use `CFN_REDIS_HOST` and `CFN_REDIS_PORT`
- NEVER hardcode `127.0.0.1:6379` or `localhost:6379`
- Validate with: `bash tests/docker/validate-bug6-redis-vars.sh`

### 4. Container Status Tracking

**Pattern (Bug #4 Compliance):**
```bash
# Start container
CONTAINER_ID=$(docker run -d my-image:latest)

# Wait for completion (proper)
docker wait "$CONTAINER_ID"

# Check exit code
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID")

# Validate
assert_equals "0" "$EXIT_CODE" "Container should exit successfully"
```

**Anti-Patterns:**
```bash
# DON'T: Sleep-based waiting
sleep 30
docker ps | grep my-container  # Race condition

# DON'T: Redis queue polling without container status
while [ $(redis-cli get task:completed) -lt 10 ]; do
    sleep 5  # Infinite loop if agents fail to report
done
```

---

## Docker Pattern Best Practices

### 1. Container Cleanup

**Pattern:**
```bash
cleanup() {
    # Remove specific containers
    docker rm -f coordinator-test-$$ 2>/dev/null || true
    docker rm -f agent-test-$$ 2>/dev/null || true

    # Remove by label
    docker rm -f $(docker ps -aq --filter "label=test.run=$$") 2>/dev/null || true

    # Network cleanup
    docker network rm test-network-$$ 2>/dev/null || true
}
trap cleanup EXIT
```

**Guidelines:**
- Always use `trap cleanup EXIT` in test files
- Use unique container names (include PID: `$$`)
- Use labels for batch cleanup
- Suppress errors with `|| true` (idempotent)

### 2. Network Isolation

**Pattern:**
```bash
# Create isolated network
NETWORK_NAME="test-network-$$"
docker network create "$NETWORK_NAME"

# Attach containers
docker run --network "$NETWORK_NAME" --name redis-$$ redis:7.2-alpine
docker run --network "$NETWORK_NAME" -e REDIS_HOST=redis-$$ my-agent:latest

# Cleanup
trap "docker network rm $NETWORK_NAME" EXIT
```

**Benefits:**
- Isolated test environments
- No port conflicts
- Container-to-container DNS

### 3. Volume Mount Safety

**Pattern:**
```bash
# Read-only mounts for source code
docker run \
    -v "$PROJECT_ROOT:/workspace:ro" \
    my-image:latest

# Writable mounts for output
docker run \
    -v "$PROJECT_ROOT/output:/output:rw" \
    my-image:latest

# Verify mounts
docker inspect <container-id> --format='{{json .Mounts}}' | jq
```

**Guidelines:**
- Use `:ro` for source code volumes
- Use `:rw` only when necessary
- Validate paths exist before mounting
- Check permissions match container user

### 4. Memory and CPU Limits

**Pattern:**
```bash
# Set resource limits
docker run \
    --memory="512m" \
    --memory-swap="512m" \
    --cpus="1.0" \
    my-image:latest
```

**Guidelines:**
- Always set memory limits for resource-intensive tests
- Use consistent limits across test suite
- Monitor with `docker stats`
- Account for total budget in wave spawning tests

---

## Maintenance Schedule

### Daily
- Monitor test failures in CI
- Review agent completion rates
- Check Redis connection health

### Weekly
- Run full test suite locally
- Review new test coverage gaps
- Update helper function usage

### Monthly
- Review technical debt backlog
- Update documentation
- Archive obsolete tests
- Refactor common patterns

### Quarterly
- Security audit (Trivy scans)
- Performance benchmarking
- Dependency updates
- Test suite optimization

---

## Troubleshooting Checklist

Before filing a bug, verify:

**Environment:**
- [ ] `.env` file exists with all required variables
- [ ] `CFN_REDIS_HOST` and `CFN_REDIS_PORT` are set correctly
- [ ] `CFN_API_KEY` is valid (not expired/revoked)
- [ ] Docker daemon is running

**Images:**
- [ ] All required images are built (`docker images | grep cfn`)
- [ ] Image tags match test expectations
- [ ] Images are up-to-date with latest code

**Network:**
- [ ] `cfn-network` exists (`docker network ls`)
- [ ] Redis is reachable on network
- [ ] No port conflicts (6379, coordinator ports)

**Containers:**
- [ ] No zombie containers from previous runs
- [ ] Container logs show expected startup
- [ ] Exit codes are 0 for successful tests

**Helpers:**
- [ ] `test-utils.sh` is sourced correctly
- [ ] Helper functions exist in sourced files
- [ ] PROJECT_ROOT resolves correctly

---

## Quick Reference Commands

```bash
# Test execution
bash tests/docker/<test-name>.sh

# Redis debugging
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" keys "*"
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" get coordinator:heartbeat

# Container debugging
docker ps -a --filter "label=cfn.task.id=*"
docker logs <container-id>
docker inspect <container-id>
docker stats --no-stream

# Network debugging
docker network inspect cfn-network
docker exec <container-id> ping cfn-redis

# Image management
docker images | grep cfn
docker build -t <image>:<tag> -f <Dockerfile> .
docker rmi <image>:<tag>

# Cleanup
docker rm -f $(docker ps -aq --filter "label=cfn.task.id=*")
docker network prune -f
docker volume prune -f
```

---

## Additional Resources

- **Test Standards:** `tests/CLAUDE.md`
- **Architecture:** `tests/docker/ARCHITECTURE.md`
- **Execution Guide:** `tests/docker/EXECUTION_GUIDE.md`
- **Technical Debt:** `tests/docker/TECHNICAL_DEBT.md`
- **Bug Tracking:** `docs/bugs/`
- **Helper Documentation:** `tests/docker/ARCHITECTURE_TEST_HELPERS.md`

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-13
**Maintainers:** CFN Dev Team
