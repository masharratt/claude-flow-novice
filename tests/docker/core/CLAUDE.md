# Docker Mode Core Test Standards

**Purpose:** Define requirements for tests to be included in the Docker Mode core test suite.

## Core Test Inclusion Criteria

Tests in `tests/docker/core/` MUST meet ALL of the following requirements:

### 1. Clear Purpose & Documentation
- [ ] Test file includes header docstring with purpose, phase, and priority
- [ ] Test addresses specific bug, coordinator validation, or core Docker functionality
- [ ] Test name clearly indicates what is being validated
- [ ] Bug/Phase references included (e.g., "Bug #4", "Phase 3", "P0/P1/P2")

**Example:**
```bash
#!/bin/bash
# tests/docker/coordinator-spawning-tests.sh
# Phase 8.2 :: P0 - Docker-in-Docker Worker Spawning (Coordinator V3)
# Tests coordinator's ability to spawn worker containers via Docker socket
```

### 2. Production Code Fidelity
- [ ] Integration/E2E tests MUST use real cfn-agent images (not alpine:latest)
- [ ] Tests validate actual spawn-agent.sh behavior
- [ ] Tests validate actual Docker socket access patterns
- [ ] Tests use production coordinator entrypoints (not inline scripts)

**Anti-Pattern (BUG #21 Lesson):**
```bash
# ❌ WRONG - Mocks don't catch production bugs
docker run alpine:latest sh -c "echo 'mock agent'"

# ✅ CORRECT - Real production images and scripts
./.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh \
  --agent backend-developer \
  --task-id "$TASK_ID"
```

### 3. Non-Redundant Coverage
- [ ] Test provides unique validation not covered by other core tests
- [ ] Test cannot be replaced by existing core tests
- [ ] Test adds measurable value to coordinator or Docker workflow coverage
- [ ] Redundant tests moved to `core/legacy/` with documentation

### 4. Test Categories & Focus Areas

**Agent Lifecycle:**
- Spawn-to-exit workflows
- Metadata capture and validation
- Auto-removal and cleanup
- Orphan process detection

**Coordinator Tests:**
- Dynamic planning via API
- Docker-in-Docker worker spawning
- Atomic task assignment
- Iteration loop validation
- Fault tolerance and recovery
- Validation logic and error handling

**Coordination & Infrastructure:**
- Redis coordination with Node.js client
- Environment variable propagation
- YAML contract consistency validation

**Memory & Resource Management:**
- Memory budget enforcement
- Wave spawning patterns
- Tier allocation (512MB, 600MB, 800MB, 1024MB)
- OOM prevention

**Wave Orchestration:**
- Wave-based orchestration integration
- Multi-wave with crash recovery
- Wave security and edge cases

**Parameter Validation:**
- Coordinator → Orchestrate.sh handoff
- Parameter fallback enforcement

### 5. Test Structure Compliance
- [ ] Uses `set -euo pipefail` for strict error handling
- [ ] Sources `$PROJECT_ROOT/tests/test-utils.sh` for shared helpers
- [ ] Implements `cleanup()` function with `trap cleanup EXIT`
- [ ] Cleans up Docker containers, networks, volumes
- [ ] Uses structured logging (`log_step`, `log_info`, `annotate`)
- [ ] Follows GIVEN/WHEN/THEN comment structure for clarity

**Required Template:**
```bash
#!/bin/bash
# tests/docker/core/test-name.sh
# Phase X :: Priority - Purpose

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # Remove containers
  docker rm -f container1 container2 2>/dev/null || true
  # Remove networks
  docker network rm test-network 2>/dev/null || true
  # Remove volumes
  docker volume rm test-volume 2>/dev/null || true
}
trap cleanup EXIT

test_scenario() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN assert_* "<result>"
}

test_scenario
```

### 6. Docker-Specific Requirements
- [ ] Test validates actual Docker behavior (not just scripts)
- [ ] Test checks container logs for errors (not just exit codes)
- [ ] Test validates Docker socket access when applicable
- [ ] Test verifies environment variable propagation
- [ ] Test ensures proper network isolation
- [ ] Test validates volume mounts when used

**Critical Validation Pattern:**
```bash
# Don't just check exit code
if docker run cfn-agent:latest ...; then
  echo "Container started"
fi

# Check container logs for actual errors
docker logs "$CONTAINER_ID" 2>&1 | grep -i "error"
if [ $? -eq 0 ]; then
  echo "Found errors in container logs"
  exit 1
fi
```

### 7. Test Runner Integration
- [ ] Test is executable (`chmod +x`)
- [ ] Test is discovered by `run-all-tests.sh` pattern matching
- [ ] Test passes when run via test runner
- [ ] Test handles cleanup even on failure
- [ ] Test respects --quick, --integration, --full modes

### 8. Maintenance & Evolution
- [ ] Test can run idempotently (multiple times without conflicts)
- [ ] Test includes comments explaining Docker-specific validation
- [ ] Test references related bug/phase documentation
- [ ] Test has clear pass/fail criteria
- [ ] Test cleans up all Docker resources

## Legacy Test Movement Criteria

Move tests to `core/legacy/` when they:

1. **Bug-specific validation** - Targeted at resolved bugs (keep for historical reference)
2. **Missing descriptions** - No clear purpose documented in headers
3. **Superseded functionality** - Newer tests provide better coverage
4. **Component-specific bugs** - Dashboard, specific agent bugs now fixed
5. **No unique value** - Duplicate coverage with existing core tests

**When moving to legacy:**
- Update `core/legacy/README.md` with:
  - Test name and original purpose
  - Reason for legacy move (bug fixed, superseded, etc.)
  - Replacement test if applicable
  - Historical context for future reference

## Test Runner Requirements

The `tests/docker/run-all-tests.sh` script MUST:

### Quick Mode (`--quick`)
- Run critical integration tests only
- Complete in <5 minutes
- Require Redis and Docker
- Exit code 0 if all critical tests pass
- Skip wave orchestration and long-running tests

### Integration Mode (`--integration`)
- Run all integration tests from `core/`
- Complete in <15 minutes
- Require Redis, Docker, cfn-agent image
- Exit code 0 if ≥95% tests pass
- Include coordinator and coordination tests

### Full Mode (`--full`)
- Run ALL core tests including E2E and orchestration
- Complete in <40 minutes
- Require all dependencies (Redis, Docker, cfn-agent, orchestrator)
- Exit code 0 if ≥90% tests pass (allow infrastructure flakiness)
- Include wave orchestration and stress tests

### Standard Features
- [ ] Automatic prerequisite checking (Redis, Docker, cfn-agent image)
- [ ] Color-coded output (pass/fail/skip)
- [ ] Summary report with pass/fail counts
- [ ] Automatic cleanup of Docker resources after tests
- [ ] Auto-start Redis if not running
- [ ] **Excludes `core/legacy/` tests by default**

### Test Discovery Pattern
```bash
# Core tests (all .sh files in core/ excluding legacy/)
for test in tests/docker/core/*.sh; do
  # Skip if in legacy subdirectory
  if [[ "$test" == *"/legacy/"* ]]; then
    continue
  fi
  run_test "$test"
done

# E2E tests (if in full mode)
for test in tests/docker/core/e2e/*.sh; do
  run_test "$test"
done

# ❌ WRONG - Don't include legacy
for test in tests/docker/core/legacy/*.sh; do
  run_test "$test"  # NO - legacy excluded by default
done
```

### Resource Cleanup After Tests
```bash
cleanup_test_resources() {
  echo "Cleaning up test containers..."
  docker ps -a | grep "cfn-test-" | awk '{print $1}' | xargs docker rm -f 2>/dev/null || true

  echo "Cleaning up test networks..."
  docker network ls | grep "cfn-test-" | awk '{print $1}' | xargs docker network rm 2>/dev/null || true

  echo "Cleaning up test volumes..."
  docker volume ls | grep "cfn-test-" | awk '{print $2}' | xargs docker volume rm 2>/dev/null || true
}
trap cleanup_test_resources EXIT
```

## Quality Gates

### Integration Test Requirements
- **Pass Rate:** ≥95% (allow for transient Docker issues)
- **Coverage:** All coordinator workflows, agent spawning, Redis coordination
- **Speed:** <2 minutes per test average
- **Resource Cleanup:** 100% (no orphaned containers/networks/volumes)

### E2E Test Requirements
- **Pass Rate:** ≥90% (allow for infrastructure issues)
- **Coverage:** Full Docker workflows with real production images
- **Speed:** <5 minutes per test average
- **Resource Cleanup:** 100% (verified after test completion)

### Orchestration Test Requirements
- **Pass Rate:** ≥85% (complex multi-container scenarios)
- **Coverage:** Wave spawning, memory budgets, fault tolerance
- **Speed:** <10 minutes per test average
- **Resource Cleanup:** 100% (critical for wave tests)

## Docker-Specific Best Practices

### Container Naming
```bash
# Use unique test IDs to avoid conflicts
TEST_ID="test-$(date +%s)-$$"
CONTAINER_NAME="cfn-test-${TEST_ID}"

docker run --name "$CONTAINER_NAME" cfn-agent:latest
```

### Log Validation
```bash
# Always check container logs for errors
CONTAINER_ID=$(docker run -d cfn-agent:latest ...)
sleep 2  # Allow container to start

docker logs "$CONTAINER_ID" 2>&1 | tee /tmp/container.log
if grep -i "error\|fatal\|exception" /tmp/container.log; then
  echo "Container has errors"
  exit 1
fi
```

### Network Isolation
```bash
# Create test-specific networks
NETWORK_NAME="cfn-test-${TEST_ID}"
docker network create "$NETWORK_NAME"

# Connect containers to test network
docker run --network "$NETWORK_NAME" ...

# Cleanup network in trap
cleanup() {
  docker network rm "$NETWORK_NAME" 2>/dev/null || true
}
```

### Volume Cleanup
```bash
# Use named volumes for easier cleanup
VOLUME_NAME="cfn-test-vol-${TEST_ID}"
docker volume create "$VOLUME_NAME"

docker run -v "${VOLUME_NAME}:/data" ...

cleanup() {
  docker volume rm "$VOLUME_NAME" 2>/dev/null || true
}
```

## Review Checklist

Before adding a test to Docker core:

- [ ] Test meets all 8 inclusion criteria
- [ ] Test validates actual Docker behavior (not just scripts)
- [ ] Test uses production cfn-agent images
- [ ] Test is non-redundant with existing core tests
- [ ] Test follows Docker template structure
- [ ] Test cleans up ALL Docker resources (containers, networks, volumes)
- [ ] Test integrated into `run-all-tests.sh` discovery pattern
- [ ] Test checks container logs for errors (not just exit codes)
- [ ] Test can run idempotently without conflicts
- [ ] Legacy tests moved if applicable

## Related Documentation

- `tests/CORE_TEST_SUMMARY.md` - Complete core test catalog
- `tests/CLAUDE.md` - Global test authoring standards
- `tests/docker/core/legacy/README.md` - Legacy test reference
- `docs/BUG_21_PRODUCTION_TESTING_REQUIREMENTS.md` - Production testing requirements
- `.claude/skills/cfn-docker-agent-spawning/SKILL.md` - Agent spawning documentation
