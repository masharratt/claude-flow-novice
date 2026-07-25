# Docker Test Suite Architecture

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Purpose:** Test suite organization, helper functions, and testing patterns

---

## Overview

The Docker test suite validates the CFN Loop Docker-based agent orchestration system, including coordinator logic, agent lifecycle, Redis coordination, and multi-provider support.

**Key Components:**
- Test organization (P0, P1, P2 priority levels)
- Helper function categories (test-utils, architecture-helpers)
- Security patterns (credential generation, Docker flags)
- Docker patterns (container status tracking, Bug #6 compliance)

**Related Documentation:**
- Execution Guide: `tests/docker/EXECUTION_GUIDE.md`
- Maintenance: `tests/docker/MAINTENANCE.md`
- Technical Debt: `tests/docker/TECHNICAL_DEBT.md`
- Standards: `tests/CLAUDE.md`

---

## Test Organization

### Directory Structure

```
tests/
├── CLAUDE.md                          # Test authoring standards
├── test-utils.sh                      # Base helper functions
│
├── docker/                            # Docker-specific tests
│   ├── ARCHITECTURE.md                # This file
│   ├── EXECUTION_GUIDE.md             # Execution procedures
│   ├── MAINTENANCE.md                 # Maintenance guide
│   ├── TECHNICAL_DEBT.md              # Known issues tracking
│   │
│   ├── test-helpers.sh                # Docker test utilities
│   ├── architecture-test-helpers.sh   # Architecture validation helpers
│   ├── remediation-helpers.sh         # Migration/refactoring helpers
│   │
│   ├── P0 (Critical Tests)            # Must pass for production
│   │   ├── redis-coordination-tests.sh
│   │   ├── agent-lifecycle-tests.sh
│   │   ├── memory-budget-tests.sh
│   │   ├── provider-auth-tests.sh
│   │   └── coordinator-iteration-tests.sh
│   │
│   ├── P1 (High Priority Tests)       # Architecture alignment
│   │   ├── clustering-accuracy-tests.sh
│   │   ├── env-propagation-tests.sh
│   │   ├── wave-spawning-tests.sh
│   │   ├── typescript-analysis-tests.sh
│   │   └── cfn-loop-compliance-tests.sh
│   │
│   ├── P2 (Medium Priority Tests)     # Reliability improvements
│   │   ├── build-sync-tests.sh
│   │   ├── coordinator-fault-tolerance-tests.sh
│   │   └── rate-limiting-tests.sh (future)
│   │
│   ├── Integration Tests              # End-to-end validation
│   │   ├── intelligent-coordinator-test.sh
│   │   └── docker-hello-world-parity-tests.sh
│   │
│   ├── Validation Tests               # Quick checks
│   │   ├── validate-bug6-redis-vars.sh
│   │   ├── validate-redis-connection.sh
│   │   └── simple-container-test.sh
│   │
│   └── Utility Tests                  # Debugging/profiling
│       ├── b10-debug-single-agent.sh
│       ├── b10-typescript-fix-test.sh
│       ├── memory-profiling.sh
│       └── simple-memory-profile.sh
│
├── cli-mode/                          # CLI mode tests (future)
├── task-mode/                         # Task mode tests (future)
└── archive/                           # Historical tests
    └── historical/
        └── sprint-*/
```

### Priority Levels

**P0 (Critical) - Must Pass for Production**

Tests that validate core functionality required for production deployment.

| Test | Purpose | Estimated Time |
|------|---------|----------------|
| redis-coordination-tests.sh | Redis heartbeat, registration, coordination | 3 min |
| agent-lifecycle-tests.sh | Agent spawn, execute, cleanup | 2 min |
| memory-budget-tests.sh | Memory limits, OOM prevention | 2 min |
| provider-auth-tests.sh | API key propagation, multi-provider | 2 min |
| coordinator-iteration-tests.sh | Iteration loop, convergence | 1 min |

**Pass Threshold:** 100% required for production (currently 76% due to Bug #6)

**P1 (High Priority) - Architecture Alignment**

Tests that validate architecture patterns and advanced features.

| Test | Purpose | Estimated Time |
|------|---------|----------------|
| clustering-accuracy-tests.sh | Error clustering, tier allocation | 3 min |
| env-propagation-tests.sh | Environment variable inheritance | 2 min |
| wave-spawning-tests.sh | Wave parallelism, memory per wave | 3 min |
| typescript-analysis-tests.sh | Error parsing, complexity scoring | 4 min |
| cfn-loop-compliance-tests.sh | CFN Loop protocol validation | 3 min |

**Pass Threshold:** 90% required for architecture validation

**P2 (Medium Priority) - Reliability Improvements**

Tests that improve system reliability but are not blocking.

| Test | Purpose | Estimated Time |
|------|---------|----------------|
| build-sync-tests.sh | Build context, layer caching | 3 min |
| coordinator-fault-tolerance-tests.sh | Restart recovery, crash handling | 4 min |
| rate-limiting-tests.sh | API rate limits, backoff (future) | 3 min |

**Pass Threshold:** 80% acceptable

### Test Categories

**By Function:**
1. **Coordination Tests:** Redis, pub/sub, heartbeat, completion tracking
2. **Lifecycle Tests:** Agent spawn, execute, cleanup, metadata
3. **Performance Tests:** Memory budget, wave spawning, resource limits
4. **Security Tests:** Auth propagation, credential handling, Docker flags
5. **Integration Tests:** End-to-end coordinator flows

**By Execution Stage:**
1. **Smoke Tests:** Basic connectivity, image availability (2 min)
2. **Unit Tests:** Individual component validation (10 min)
3. **Integration Tests:** Multi-component workflows (10 min)
4. **System Tests:** Full coordinator execution (10 min)
5. **Fault Tolerance Tests:** Error recovery, resilience (10 min, optional)

---

## Helper Function Categories

### 1. Test Utilities (test-utils.sh)

**Location:** `tests/test-utils.sh`

**Purpose:** Base test infrastructure shared across all test types (Docker, CLI, Task mode)

#### Logging Functions

```bash
# Structured logging
log_step "message"        # Blue, numbered step
log_info "message"        # Cyan, informational
log_success "message"     # Green, success state
log_warning "message"     # Yellow, warning state
log_error "message"       # Red, error state
```

**Usage Example:**
```bash
log_step "Starting Redis coordination test"
log_info "Checking Redis connection..."
log_success "Redis connection established"
```

#### Assertion Functions

```bash
# Test assertions
assert_success "command" "Expected success message"
assert_equals "expected" "actual" "Comparison message"
assert_not_empty "$variable" "Variable must be set"
assert_file_exists "/path/to/file"
```

**Usage Example:**
```bash
assert_success "redis-cli ping" "Redis should be reachable"
assert_equals "0" "$EXIT_CODE" "Container should exit successfully"
assert_not_empty "$CFN_API_KEY" "API key must be configured"
```

#### Docker Helpers

```bash
# Image management
verify_image "image:tag"                    # Check if image exists
ensure_image "image:tag" "Dockerfile"       # Build if missing
get_image_size "image:tag"                  # Get size in MB

# Container lifecycle
start_redis                                 # Start Redis on cfn-network
stop_redis                                  # Stop and remove Redis
cleanup_containers                          # Remove all test containers

# Security patterns
flags=$(get_secure_docker_flags)
docker run $flags ...
```

**Security Flags Function:**
```bash
get_secure_docker_flags() {
    cat << 'DOCKER_FLAGS'
--security-opt no-new-privileges
--read-only
--tmpfs /tmp:rw,noexec,nosuid,size=100m
--cap-drop ALL
DOCKER_FLAGS
}
```

**Usage:**
- `--security-opt no-new-privileges`: Prevent privilege escalation
- `--read-only`: Immutable filesystem (prevents tampering)
- `--tmpfs /tmp`: Writable temp with noexec/nosuid
- `--cap-drop ALL`: Drop all Linux capabilities

### 2. Architecture Test Helpers (architecture-test-helpers.sh)

**Location:** `tests/docker/architecture-test-helpers.sh`

**Purpose:** Docker-specific validation patterns for coordinator architecture

#### Environment Validation

```bash
# Required variables check
check_required_vars "VAR1" "VAR2" "VAR3"
# Example: check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"

# Env file validation
validate_env_file "/path/to/.env"

# Gate threshold validation
validate_gate_threshold "0.75" "standard"
validate_gate_threshold "0.85" "enterprise"
```

**Usage Example:**
```bash
# Validate test prerequisites
check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"
validate_env_file ".env"
validate_gate_threshold "0.75" "standard"
```

#### Coordinator Validation

```bash
# Heartbeat freshness check
check_coordinator_heartbeat "coordinator-id" 30  # 30 second threshold

# Wait for coordinator ready
wait_for_coordinator "coordinator-id" 120        # 120 second timeout

# Parse coordinator logs
errors=$(parse_coordinator_logs "/tmp/coordinator.log")
```

**Usage Example:**
```bash
# Start coordinator and validate
COORDINATOR_ID=$(docker run -d cfn-intelligent-coordinator:latest)
wait_for_coordinator "$COORDINATOR_ID" 120
check_coordinator_heartbeat "$COORDINATOR_ID" 30
```

#### TypeScript Analysis

```bash
# Parse TypeScript errors
error_count=$(parse_typescript_errors "/tmp/tsc.log")

# Validate error reduction
validate_error_delta 100 50 "50% reduction"  # initial, final, target
```

**Usage Example:**
```bash
# Test error reduction
initial_errors=$(parse_typescript_errors "/tmp/tsc-before.log")
final_errors=$(parse_typescript_errors "/tmp/tsc-after.log")
validate_error_delta "$initial_errors" "$final_errors" "Expected reduction"
```

#### Wave Spawning Validation

```bash
# Validate wave parallelism
validate_wave_parallelism 4 5  # expected, actual

# Count spawned agents
agent_count=$(count_spawned_agents "task-id")
```

**Usage Example:**
```bash
# Test wave spawning
TASK_ID="test-task-$$"
# ... spawn wave ...
actual_agents=$(count_spawned_agents "$TASK_ID")
validate_wave_parallelism 4 "$actual_agents"
```

#### Consensus Validation

```bash
# Validate consensus threshold
validate_consensus 0.90 0.92  # threshold, actual

# Parse iteration metadata
metadata=$(parse_iteration_metadata "/tmp/iteration.json")
```

**Usage Example:**
```bash
# Test Loop 2 consensus
actual_consensus=$(redis-cli get "consensus:task-$$")
validate_consensus 0.90 "$actual_consensus"
```

### 3. Remediation Helpers (remediation-helpers.sh)

**Location:** `tests/docker/remediation-helpers.sh`

**Purpose:** Migration and refactoring automation for test suite updates

#### Docker Pattern Migrations

```bash
# Add security flags to docker run command
add_security_flags_to_docker_run "/path/to/test.sh"

# Add architecture helper sourcing
add_architecture_helper_sourcing "/path/to/test.sh"

# Add cleanup trap
add_cleanup_trap "/path/to/test.sh"
```

**Usage Example:**
```bash
# Batch update tests
for test in tests/docker/*.sh; do
    add_architecture_helper_sourcing "$test"
    add_security_flags_to_docker_run "$test"
done
```

---

## Security Patterns

### 1. Secure Docker Flags

**Pattern:** Standardized security hardening for container spawning

**Implementation:**
```bash
# Get flags
SECURE_FLAGS=$(get_secure_docker_flags)

# Apply to container spawn
docker run $SECURE_FLAGS \
    --name test-agent \
    -e CFN_API_KEY="$CFN_API_KEY" \
    cfn-agent:latest
```

**Flags Applied:**
- `--security-opt no-new-privileges` (CVE mitigation)
- `--read-only` (filesystem immutability)
- `--tmpfs /tmp:rw,noexec,nosuid,size=100m` (safe temp)
- `--cap-drop ALL` (minimal capabilities)

**Current Adoption:**
- 7/89 docker run commands (7.9%)
- Target: 80%+ for production/integration tests

**Exemptions:**
- Debug tests (write access needed)
- Profiling tests (capability overhead)
- Quick validators (simplicity over security)

### 2. Test Credential Generation

**Pattern:** Generate temporary, unique credentials per test run

**Implementation:**
```bash
# Generate test credentials
TEST_API_KEY=$(generate_test_credential "api_key")
TEST_PASSWORD=$(generate_test_credential "password")

# Use in container
docker run \
    -e CFN_API_KEY="$TEST_API_KEY" \
    cfn-agent:latest
```

**Benefits:**
- No hardcoded secrets
- Unique credentials per run
- Automatic cleanup on test exit

**Security Note:**
- Credentials are random UUIDs
- Not suitable for production API validation
- For integration tests, use real credentials from CI secrets

### 3. Environment Variable Propagation

**Pattern:** Validate and propagate environment variables to containers

**Implementation:**
```bash
# Validate required variables
check_required_vars "CFN_API_KEY" "CFN_REDIS_HOST" "CFN_REDIS_PORT"

# Pass to container with validation
docker run \
    -e CFN_API_KEY="$CFN_API_KEY" \
    -e CFN_REDIS_HOST="$CFN_REDIS_HOST" \
    -e CFN_REDIS_PORT="$CFN_REDIS_PORT" \
    cfn-agent:latest

# Verify propagation
docker exec <container-id> env | grep CFN_
```

**Bug #6 Compliance:**
- ALWAYS use `CFN_REDIS_HOST` and `CFN_REDIS_PORT`
- NEVER hardcode `127.0.0.1:6379` or `localhost:6379`
- Validate with: `bash tests/docker/validate-bug6-redis-vars.sh`

---

## Docker Patterns

### 1. Container Status Tracking (Bug #4 Compliance)

**Pattern:** Use Docker API for container completion tracking (not sleep loops)

**Anti-Pattern (INCORRECT):**
```bash
# DON'T: Sleep-based waiting
docker run -d --name agent-test my-agent:latest
sleep 30  # Race condition - may exit before 30s or take longer
if docker ps | grep agent-test; then
    echo "Still running"  # Unreliable
fi
```

**Correct Pattern:**
```bash
# Start container
CONTAINER_ID=$(docker run -d --name agent-test my-agent:latest)

# Wait for completion (blocks until exit)
docker wait "$CONTAINER_ID"

# Check exit code
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID")

# Validate
assert_equals "0" "$EXIT_CODE" "Container should exit successfully"
```

**Advanced Pattern (with timeout):**
```bash
# Wait with timeout
timeout 300 docker wait "$CONTAINER_ID" || {
    log_error "Container timeout after 300 seconds"
    docker kill "$CONTAINER_ID"
    exit 1
}

# Check result
if [ "$(docker inspect --format='{{.State.Status}}' "$CONTAINER_ID")" = "exited" ]; then
    EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID")
    log_success "Container exited with code $EXIT_CODE"
else
    log_error "Container did not exit cleanly"
fi
```

**Current Adoption:**
- 11/24 tests use proper status tracking (46%)
- Target: 100% for all tests spawning containers

### 2. Container Cleanup

**Pattern:** Use cleanup trap to ensure container removal on test exit

**Implementation:**
```bash
#!/bin/bash
set -euo pipefail

cleanup() {
    # Remove specific containers
    docker rm -f agent-test-$$ 2>/dev/null || true
    docker rm -f coordinator-test-$$ 2>/dev/null || true

    # Remove by label
    docker rm -f $(docker ps -aq --filter "label=test.run=$$") 2>/dev/null || true

    # Network cleanup
    docker network rm test-network-$$ 2>/dev/null || true
}
trap cleanup EXIT

# ... test logic ...
```

**Guidelines:**
- Use unique container names (include PID: `$$`)
- Use labels for batch cleanup (`--label test.run=$$`)
- Suppress errors with `|| true` (idempotent cleanup)
- Always use `trap cleanup EXIT` (runs even on failure)

**Current Adoption:**
- 26/51 tests use cleanup traps (51%)
- Target: 100% for all tests spawning containers

### 3. Network Isolation

**Pattern:** Create isolated Docker networks per test run

**Implementation:**
```bash
# Create isolated network
NETWORK_NAME="test-network-$$"
docker network create "$NETWORK_NAME"

# Attach containers
docker run -d --network "$NETWORK_NAME" --name redis-$$ redis:7.2-alpine
docker run --network "$NETWORK_NAME" \
    -e CFN_REDIS_HOST=redis-$$ \
    cfn-agent:latest

# Cleanup
trap "docker network rm $NETWORK_NAME 2>/dev/null || true" EXIT
```

**Benefits:**
- Isolated test environments (no cross-contamination)
- No port conflicts (multiple tests can run in parallel)
- Container-to-container DNS (use container names as hostnames)

**Usage:**
- Integration tests (coordinator + Redis + agents)
- Multi-container scenarios
- Parallel test execution

### 4. Volume Mount Safety

**Pattern:** Use read-only mounts for source code, writable for output

**Implementation:**
```bash
# Read-only mount for source code
docker run \
    -v "$PROJECT_ROOT:/workspace:ro" \
    cfn-agent:latest

# Writable mount for output
docker run \
    -v "$PROJECT_ROOT/output:/output:rw" \
    cfn-agent:latest

# Verify mounts
docker inspect <container-id> --format='{{json .Mounts}}' | jq
```

**Guidelines:**
- Use `:ro` for source code volumes (prevents accidental modification)
- Use `:rw` only when necessary (logs, output files)
- Validate paths exist before mounting
- Check permissions match container user (avoid permission denied errors)

---

## Test Execution Patterns

### 1. GIVEN/WHEN/THEN Structure

**Pattern:** Structure test functions with clear setup, action, validation phases

**Implementation:**
```bash
test_redis_coordination() {
    log_step "Test: Redis coordination flow"

    # GIVEN: Redis is running and coordinator is configured
    start_redis
    check_required_vars "CFN_REDIS_HOST" "CFN_REDIS_PORT"

    # WHEN: Coordinator starts and registers
    COORDINATOR_ID=$(docker run -d \
        -e CFN_REDIS_HOST="$CFN_REDIS_HOST" \
        -e CFN_REDIS_PORT="$CFN_REDIS_PORT" \
        cfn-intelligent-coordinator:latest)

    wait_for_coordinator "$COORDINATOR_ID" 120

    # THEN: Heartbeat is present and fresh
    check_coordinator_heartbeat "$COORDINATOR_ID" 30
    assert_success "redis-cli get coordinator:heartbeat" "Heartbeat key exists"

    log_success "Redis coordination validated"
}
```

**Benefits:**
- Clear test intent
- Easy to debug failures
- Self-documenting tests

### 2. Cleanup Trap Pattern

**Pattern:** Ensure cleanup runs even on test failure

**Implementation:**
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    log_info "Cleaning up test resources"
    docker rm -f coordinator-test-$$ agent-test-$$ 2>/dev/null || true
    stop_redis
    docker network rm test-network-$$ 2>/dev/null || true
}
trap cleanup EXIT

# ... test functions ...

# Execute tests
test_function_1
test_function_2

log_success "All tests passed"
```

**Why `trap cleanup EXIT`:**
- Runs on normal exit (test pass)
- Runs on error exit (test fail)
- Runs on signal (Ctrl+C, SIGTERM)
- Prevents resource leaks

### 3. Assertion-Based Validation

**Pattern:** Use assert functions instead of if/then for validation

**Anti-Pattern:**
```bash
# DON'T: Manual validation
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID")
if [ "$EXIT_CODE" != "0" ]; then
    echo "ERROR: Container failed with exit code $EXIT_CODE"
    exit 1
fi
```

**Correct Pattern:**
```bash
# DO: Use assertions
EXIT_CODE=$(docker inspect --format='{{.State.ExitCode}}' "$CONTAINER_ID")
assert_equals "0" "$EXIT_CODE" "Container should exit successfully"
```

**Benefits:**
- Structured error messages
- Automatic test failure
- Consistent output format

---

## Test Suite Metrics

### Current State (as of 2025-11-13)

**Test Count:**
- Total tests: 40 (P0: 17, P1: 14, P2: 7, Integration: 2)
- Passing tests: 32 (80%)
- Blocked tests: 8 (20%)

**Helper Adoption:**
- Files with helper sourcing: 19/51 (37%)
- Files using helper functions: 5/19 (26%)
- Security flags adoption: 7/89 docker run commands (7.9%)

**Docker Patterns:**
- Container status tracking: 11/24 tests (46%)
- Cleanup traps: 26/51 tests (51%)
- Redis standardization: 136/136 references (100%)

**Technical Debt:**
- Bug #6 (Redis variables): Blocks 4 tests
- Infrastructure incomplete: Blocks 4 tests
- Unsecured docker commands: 88 instances
- Dockerfile root access: 1 issue
- Unused helper imports: 7 files

### Target State (by 2025-12-01)

**Test Count:**
- Total tests: 40 (unchanged)
- Passing tests: 40 (100%)
- Blocked tests: 0

**Helper Adoption:**
- Files with helper sourcing: 51/51 (100%)
- Files using helper functions: 40/51 (78%)
- Security flags adoption: 70/89 docker run commands (80%)

**Docker Patterns:**
- Container status tracking: 24/24 tests (100%)
- Cleanup traps: 51/51 tests (100%)
- Redis standardization: 100% (maintained)

**Technical Debt:**
- Bug #6: RESOLVED
- Infrastructure tests: UNBLOCKED
- Unsecured commands: 80% RESOLVED
- Dockerfile root access: RESOLVED
- Unused imports: RESOLVED

---

## Additional Resources

- **Execution Guide:** `tests/docker/EXECUTION_GUIDE.md`
- **Maintenance Guide:** `tests/docker/MAINTENANCE.md`
- **Technical Debt:** `tests/docker/TECHNICAL_DEBT.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Helper Documentation:** `tests/docker/ARCHITECTURE_TEST_HELPERS.md`
- **Phase 5 Report:** `tests/docker/PHASE5_ITER1_HELPER_ADOPTION_REPORT.md`
- **Docker Pattern Assessment:** `tests/docker/PHASE_5_DOCKER_PATTERN_ASSESSMENT.md`

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-13
**Maintainers:** CFN Dev Team
