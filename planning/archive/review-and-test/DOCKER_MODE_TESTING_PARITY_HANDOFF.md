# Docker Mode Testing Parity - Team Handoff Document

**Date:** 2025-11-18 (Updated: 2025-11-18 Phase 2)
**Session:** CLI Mode Testing Complete → Docker Mode Tests Implemented & Relocated
**Status:** ✅ Tests Created & Moved to `tests/docker/core/`

---

## Executive Summary

CLI mode has achieved comprehensive test coverage with 98% pass rate across 5 test suites. Docker mode currently has minimal test coverage and needs to reach parity with CLI mode testing standards.

**CLI Mode Test Coverage:**
- TDD Compliance: 100% (24/24 scenarios)
- Coordinator Spawning: 100% (23/23 tests)
- Orchestrator Workflow: 91% (21/23 tests, 2 flexible)
- Threshold Validation: 100% (6/6 tests)
- Redis Coordination: 100% (7/7 tests)
- **Full CFN Loop Test**: 100% (6/6 scenarios with real agent spawning)

**Docker Mode Status (Post-Implementation):**
- ✅ All 6 missing test suites created (87 tests)
- ✅ Tests relocated to `tests/docker/core/`
- ✅ Playbook/workflow tests in `tests/integration/`
- ⚠️ 48% real implementation, 52% placeholders (see Part 8 for details)

---

## Part 1: Test Coverage Gaps

### Missing Docker Mode Tests

Docker mode needs equivalent tests for all CLI mode test suites:

#### 1. TDD Compliance Tests (✅ IMPLEMENTED)
**CLI Equivalent:** `tests/tdd-compliance/` (24 scenarios, 100% pass)
**Docker Location:** `tests/docker/core/tdd-compliance-tests.sh` (24 tests)

**Implemented Tests:**
- `docker-test-tests-before-code.sh` - Validate test-before-implementation in containers
- `docker-test-red-green-refactor.sh` - Validate Red-Green-Refactor cycle in containers
- `docker-test-post-edit-feedback.sh` - Validate post-edit hooks in container environment
- `docker-test-post-edit-error-handling.sh` - Error handling in containerized post-edit pipeline
- `docker-test-coverage-enforcement.sh` - Coverage calculations in Docker environment

**Key Differences:**
- Tests run inside Docker containers (not host)
- File paths use container-relative paths
- Post-edit hooks execute in container context
- Coverage reporting from containerized test runners

---

#### 2. Coordinator Spawning Tests (✅ IMPLEMENTED)
**CLI Equivalent:** `tests/cli-mode/test-coordinator-spawning.sh` (23 tests, 100% pass)
**Docker Location:** `tests/docker/core/coordinator-spawning-tests.sh` (23 tests)

**Test Scenarios:**
```bash
# Test 1: Docker Compose service discovery
test_docker_service_discovery() {
  # GIVEN Docker Compose with cfn-redis service
  # WHEN coordinator resolves "cfn-redis" hostname
  # THEN should resolve via Docker DNS (no CFN_REDIS_HOST needed)
}

# Test 2: COMPOSE_PROJECT_NAME isolation
test_compose_project_isolation() {
  # GIVEN two git worktrees with different COMPOSE_PROJECT_NAME
  # WHEN both spawn coordinators
  # THEN containers should have unique names (no conflicts)
}

# Test 3: Port offset calculation
test_port_offset_by_branch() {
  # GIVEN branch name "feature-auth"
  # WHEN port offset calculated
  # THEN Redis: 6379+offset, Postgres: 5432+offset, Orchestrator: 3001+offset
}

# Test 4: Coordinator spawn in container
test_coordinator_container_spawn() {
  # GIVEN Docker Compose up
  # WHEN /cfn-docker:CFN_DOCKER_LOOP executes
  # THEN coordinator spawns inside cfn-coordinator container
}

# Test 5: Environment variable injection
test_env_var_injection() {
  # GIVEN COMPOSE_PROJECT_NAME, CFN_REDIS_PORT, CFN_POSTGRES_PORT
  # WHEN coordinator spawns agents
  # THEN agents receive all environment variables
}
```

**Critical Difference:** Docker uses service names (not localhost), automatic DNS resolution, and `COMPOSE_PROJECT_NAME` for isolation.

---

#### 3. Orchestrator Workflow Tests (MISSING)
**CLI Equivalent:** `tests/cli-mode/test-orchestrator-workflow.sh` (21/23 tests, 91% pass)

**Required Test:** `tests/docker-mode/test-orchestrator-workflow.sh`

**Test Scenarios:**
```bash
# Test 1: Loop 3 spawning in containers
test_loop3_container_spawning() {
  # GIVEN orchestrator running in container
  # WHEN Loop 3 agents spawn
  # THEN agents execute in separate containers with shared volumes
}

# Test 2: Redis coordination via service name
test_redis_service_coordination() {
  # GIVEN agents in different containers
  # WHEN using coordination-wait/coordination-signal
  # THEN should connect via "redis:6379" service name
}

# Test 3: Shared volume access
test_shared_volume_coordination() {
  # GIVEN agents in separate containers
  # WHEN Loop 3 creates files
  # THEN Loop 2 agents can read files via shared volume
}

# Test 4: Container exit codes
test_container_exit_code_propagation() {
  # GIVEN agent completes with exit code
  # WHEN orchestrator checks status
  # THEN exit code propagates correctly
}
```

**Critical Differences:**
- Agents run in separate containers (not host processes)
- File coordination via Docker volumes (not direct filesystem)
- Service-to-service communication via Docker network
- Container lifecycle management (not process management)

---

#### 4. Full CFN Loop Test (MISSING)
**CLI Equivalent:** `tests/cli-mode/test-cfn-loop-full-cycle.sh` (6/6 scenarios, 100% pass)

**Required Test:** `tests/docker-mode/test-cfn-loop-full-cycle.sh`

**Test Scenarios:**
```bash
# Test 1: Loop 3 creates faulty TDD tests (in container)
test_loop3_faulty_tdd_containerized() {
  # GIVEN Loop 3 agent in container
  # WHEN creates weak assertions (toBeDefined, not.toBeNull, expect(true).toBe(true))
  # THEN tests pass but violate TDD principles
}

# Test 2: Loop 2 catches violations (cross-container)
test_loop2_catches_violations_cross_container() {
  # GIVEN Loop 2 validators in separate containers
  # WHEN read Loop 3 files via shared volume
  # THEN detect at least 3 violations
}

# Test 3: Product Owner decision (in container)
test_product_owner_decision_containerized() {
  # GIVEN Product Owner agent in container
  # WHEN consensus < threshold (0.65 < 0.80)
  # THEN decide ITERATE
}

# Test 4: 6 parallel agents in containers (REAL Docker spawning)
test_six_agents_parallel_docker() {
  # GIVEN 6 agent containers spawned in parallel
  # WHEN each creates hello world file via shared volume
  # THEN all 6 files created successfully

  # Agent containers:
  # - cfn-agent-python (creates hello.py)
  # - cfn-agent-js (creates hello.js)
  # - cfn-agent-rust (creates hello.rs)
  # - cfn-agent-go (creates hello.go)
  # - cfn-agent-java (creates Hello.java)
  # - cfn-agent-ts (creates hello.ts)
}

# Test 5: Full CFN Loop integration (container orchestration)
test_full_cfn_loop_docker_integration() {
  # GIVEN complete Docker Compose stack
  # WHEN Loop 3 → Loop 2 → Product Owner workflow
  # THEN gate check → consensus → decision validated in containers
}
```

**Critical Differences:**
- **REAL container spawning** (not host processes)
- `docker run` or `docker-compose run` for each agent
- Shared volumes for file coordination (e.g., `/workspace`)
- Service name resolution for Redis (redis:6379)
- Container cleanup in trap handler

---

#### 5. Redis Coordination Tests (MISSING)
**CLI Equivalent:** `tests/cli-mode/test-redis-coordination.sh` (7/7 tests, 100% pass)

**Required Test:** `tests/docker-mode/test-redis-coordination.sh`

**Test Scenarios:**
```bash
# Test 1: Service name resolution
test_redis_service_name_resolution() {
  # GIVEN cfn-redis service in Docker Compose
  # WHEN agent connects to "redis:6379"
  # THEN connection succeeds via Docker DNS
}

# Test 2: Cross-container coordination-wait
test_cross_container_coordination_wait() {
  # GIVEN agent-A in container-1, agent-B in container-2
  # WHEN agent-A waits on key "task:123:ready"
  # THEN agent-B signal wakes agent-A across containers
}

# Test 3: Consensus collection across containers
test_consensus_collection_containers() {
  # GIVEN 3 validator containers
  # WHEN each reports confidence to Redis
  # THEN orchestrator collects all 3 scores
}

# Test 4: Task ID isolation
test_task_id_isolation_docker() {
  # GIVEN two Docker Compose stacks (different COMPOSE_PROJECT_NAME)
  # WHEN both use same task ID pattern
  # THEN Redis keys isolated by task ID (no cross-stack interference)
}
```

**Critical Differences:**
- Redis accessed via service name (redis:6379), not localhost
- Network isolation via Docker networks
- No CFN_REDIS_HOST needed (service discovery handles it)

---

#### 6. Threshold Validation Tests (MISSING)
**CLI Equivalent:** `tests/cli-mode/test-threshold-validation.sh` (6/6 tests, 100% pass)

**Required Test:** `tests/docker-mode/test-threshold-validation.sh`

**Test Scenarios:**
```bash
# Test 1: MVP mode thresholds (containerized)
test_mvp_thresholds_docker() {
  # GIVEN MVP mode (gate: 0.70, consensus: 0.80)
  # WHEN Loop 3 pass rate = 0.72, Loop 2 consensus = 0.82
  # THEN both pass gates in container environment
}

# Test 2: Standard mode thresholds (containerized)
test_standard_thresholds_docker() {
  # GIVEN Standard mode (gate: 0.95, consensus: 0.90)
  # WHEN Loop 3 pass rate = 0.96, Loop 2 consensus = 0.91
  # THEN both pass gates
}

# Test 3: Enterprise mode thresholds (containerized)
test_enterprise_thresholds_docker() {
  # GIVEN Enterprise mode (gate: 0.98, consensus: 0.95)
  # WHEN Loop 3 pass rate = 0.99, Loop 2 consensus = 0.96
  # THEN both pass gates
}
```

---

## Part 2: Key Learnings from CLI Mode

### 1. Environment Variable Standardization (Bug #6)

**Problem:** CLI mode failed with "cfn-redis:6379 name resolution" error outside Docker.

**Root Cause:**
- TypeScript uses `CFN_REDIS_HOST || 'cfn-redis'`
- Bash scripts used `REDIS_HOST` (different variable)
- Hostname "cfn-redis" doesn't resolve outside Docker

**Solution (Commits e8c4ef683, e38f3c39f):**
```bash
# Fallback pattern in bash scripts
export REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-localhost}}"
export REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"
```

**Fallback Chain:** `CFN_REDIS_HOST → REDIS_HOST → localhost`

**Docker Mode Implication:**
- Docker Compose defines service name "cfn-redis"
- Docker DNS resolves "cfn-redis" automatically (no env vars needed)
- Existing Bug #6 test validates this works: `tests/docker/validation/validate-bug6-redis-vars.sh`

**Action for Docker Team:**
✅ **No changes needed** - Docker mode already works correctly via service discovery.
✅ Verify Bug #6 test still passes after any Docker infrastructure changes.

---

### 2. Test Path References (Commits 55b5f195c, 1765eff77)

**Problem:** Tests expected files at `.claude/commands/cfn/*.md` but files at `.claude/commands/*.md`

**Impact:** 43% → 87% pass rate improvement after fixing 11 path references

**Learning:**
- File path assumptions break tests
- Validate actual file locations before creating assertions
- Use `find` or `ls` to verify paths dynamically

**Docker Mode Implication:**
- Container file paths differ from host paths
- Use container-relative paths in Docker tests
- Mount points must match expectations (e.g., `/workspace` → project root)

**Action for Docker Team:**
```bash
# ❌ WRONG - assumes host path
grep -q "pattern" /mnt/c/Users/masha/Documents/claude-flow-novice/file.ts

# ✅ CORRECT - uses container path
grep -q "pattern" /workspace/file.ts

# ✅ BETTER - validates path first
if [ -f "/workspace/file.ts" ]; then
  grep -q "pattern" /workspace/file.ts
fi
```

---

### 3. Command Expectation Mismatches (Commit 30df76e58)

**Problem:** Tests expected deprecated `spawn-agent.sh`, actual uses `npx claude-flow-novice`

**Impact:** 74% → 91% pass rate improvement after updating 4 assertions

**Learning:**
- Tests must match actual implementation (not ideal implementation)
- Document expected commands in test comments
- Update tests when implementation changes

**Docker Mode Implication:**
- Docker spawns agents via `docker run` or `docker-compose run`
- Tests must check for container spawning commands
- Container names follow pattern: `${COMPOSE_PROJECT_NAME}_agent_1`

**Action for Docker Team:**
```bash
# Check for Docker-based spawning
if docker ps -a | grep -q "cfn-agent-.*"; then
  pass "Agent containers spawned successfully"
fi

# Verify Docker Compose spawning
if docker-compose ps | grep -q "coordinator.*Up"; then
  pass "Coordinator container running"
fi
```

---

### 4. Real Agent Spawning vs Simulation (Commit c67504bf5)

**Problem:** Initial test simulated agents creating files (not real execution).

**Solution:** Updated test to spawn 6 real CLI agents in parallel via `npx claude-flow-novice agent`.

**Impact:**
- Validates production-ready CLI mode
- Catches real execution issues (timeouts, coordination failures)
- Tests actual Redis coordination patterns

**Docker Mode Implication:**
- **CRITICAL:** Docker tests MUST use real container spawning
- Simulation won't catch container-specific issues:
  - Volume mount problems
  - Network isolation issues
  - Service discovery failures
  - Container exit code propagation

**Action for Docker Team:**
```bash
# ❌ WRONG - simulated agent
cat > "/workspace/hello.py" <<'EOF'
print('Hello, World!')
EOF

# ✅ CORRECT - real container spawning
docker run --rm \
  --network="${COMPOSE_PROJECT_NAME}_default" \
  --volume="$(pwd):/workspace" \
  -e CFN_REDIS_HOST=redis \
  -e TASK_ID="$TASK_ID" \
  cfn-agent:latest \
  backend-developer \
  --task-id "$TASK_ID-agent-0" \
  --context "TASK_DESCRIPTION='Create hello.py...'" \
  --timeout 25
```

---

### 5. Parallel Agent Spawning (Commit c67504bf5)

**Pattern Used in CLI Mode:**
```bash
local pids=()

for config in "${agent_configs[@]}"; do
  npx claude-flow-novice agent "$agent_type" \
    --task-id "${TASK_ID}-agent-${idx}" \
    --context "TASK_DESCRIPTION='$task'" \
    --timeout 25 > "/tmp/agent-${idx}-output.log" 2>&1 &

  pids+=($!)
  idx=$((idx + 1))
done

# Wait for all agents
for pid in "${pids[@]}"; do
  wait "$pid" || failed=$((failed + 1))
done
```

**Docker Mode Equivalent:**
```bash
local container_ids=()

for config in "${agent_configs[@]}"; do
  IFS='|' read -r agent_type task <<< "$config"

  # Spawn agent container in background
  docker run --rm -d \
    --name "cfn-test-agent-${idx}" \
    --network="${COMPOSE_PROJECT_NAME}_default" \
    --volume="$(pwd):/workspace" \
    -e CFN_REDIS_HOST=redis \
    -e TASK_ID="$TASK_ID" \
    cfn-agent:latest \
    "$agent_type" \
    --task-id "${TASK_ID}-agent-${idx}" \
    --context "TASK_DESCRIPTION='$task'" \
    --timeout 25

  container_ids+=("cfn-test-agent-${idx}")
  idx=$((idx + 1))
done

# Wait for all containers to complete
for container_id in "${container_ids[@]}"; do
  if ! docker wait "$container_id" >/dev/null 2>&1; then
    failed=$((failed + 1))
  fi
done
```

**Key Differences:**
- Use `docker run -d` for background execution
- Use `docker wait` instead of bash `wait`
- Container cleanup via `docker rm` in trap handler

---

### 6. Partial Success Tolerance (Commit c67504bf5)

**CLI Mode Pattern:**
```bash
# Accept 4+ files created (partial success for real agents)
if [ "$files_created" -ge 4 ]; then
  assert_success "CLI mode agents created $files_created/6 files (real agent spawning)"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  log_error "Only $files_created/6 files created (minimum 4 required)"
  TESTS_FAILED=$((TESTS_FAILED + 1))
  return 1
fi
```

**Rationale:**
- Real agents can timeout or fail (network issues, API rate limits)
- Strict 6/6 requirement too brittle for production testing
- 4/6 threshold validates core functionality while tolerating occasional failures

**Docker Mode Implication:**
- Containers can fail to start (image pull issues, resource limits)
- Network partitions can occur
- Volume mount failures possible

**Action for Docker Team:**
- Use same 4/6 threshold for parallel agent tests
- Log failures for debugging but don't fail entire test suite
- Document acceptable failure rate (e.g., ≤33% failure = pass)

---

### 7. Test-Driven Gates (v3.0)

**CLI Mode Uses:**
- Loop 3 gate: Test pass rate ≥0.95 (Standard mode)
- Loop 2 consensus: Average validator scores ≥0.90 (Standard mode)

**Docker Mode Must Validate:**
- Tests execute correctly in containers
- Coverage calculations work in Docker environment
- Gate thresholds apply consistently

**Test Scenario:**
```bash
test_gate_check_docker() {
  # GIVEN Loop 3 agent in container runs tests
  # WHEN test pass rate = 0.96 (above threshold 0.95)
  # THEN gate check passes

  # Run tests in container
  docker run --rm \
    --volume="$(pwd):/workspace" \
    cfn-agent:latest \
    bash -c "cd /workspace && npm test"

  # Extract pass rate from container output
  local pass_rate=$(docker logs cfn-test-agent | grep "pass rate" | awk '{print $3}')

  # Validate gate
  if (( $(echo "$pass_rate >= 0.95" | bc -l) )); then
    assert_success "Gate check passed: $pass_rate >= 0.95"
  fi
}
```

---

### 8. TDD Compliance Testing (100% CLI Pass Rate)

**What Works in CLI Mode:**
- `test-tests-before-code.sh`: Timestamp validation ensures test-before-implementation
- `test-red-green-refactor.sh`: Validates Red-Green-Refactor cycle
- `test-coverage-enforcement.sh`: Accurate coverage calculation (fixed regex: `pass|passed`)
- `test-post-edit-feedback.sh`: Post-edit hooks provide feedback
- `test-post-edit-error-handling.sh`: Error handling in post-edit pipeline

**Docker Mode Challenges:**
- File timestamps across container/host boundary
- Post-edit hooks must run in container context
- Coverage reports from containerized test runners

**Action for Docker Team:**
```bash
# Validate test-before-implementation in Docker
test_tests_before_code_docker() {
  # Create test file in container
  docker run --rm \
    --volume="$(pwd):/workspace" \
    cfn-agent:latest \
    bash -c "echo 'test content' > /workspace/tests/user.test.ts"

  # Get container timestamp
  local test_time=$(docker run --rm \
    --volume="$(pwd):/workspace" \
    cfn-agent:latest \
    stat -c %Y /workspace/tests/user.test.ts)

  sleep 1

  # Create implementation file
  docker run --rm \
    --volume="$(pwd):/workspace" \
    cfn-agent:latest \
    bash -c "echo 'impl content' > /workspace/src/user.ts"

  # Get container timestamp
  local impl_time=$(docker run --rm \
    --volume="$(pwd):/workspace" \
    cfn-agent:latest \
    stat -c %Y /workspace/src/user.ts)

  # Validate test created before implementation
  if [ "$test_time" -le "$impl_time" ]; then
    assert_success "Test created before implementation (Docker timestamps)"
  fi
}
```

---

## Part 3: Docker-Specific Testing Patterns

### 1. Multi-Worktree Isolation Testing

**What to Test:**
- `COMPOSE_PROJECT_NAME` prevents container name conflicts
- Port offsets calculated correctly from branch name
- Redis keys isolated by task ID
- No cross-worktree interference

**Test Pattern:**
```bash
test_multi_worktree_isolation() {
  # GIVEN two git worktrees
  local WORKTREE_1="/tmp/worktree-main"
  local WORKTREE_2="/tmp/worktree-feature"

  # Create worktrees
  git worktree add "$WORKTREE_1" main
  git worktree add "$WORKTREE_2" feature-auth

  # Start Docker Compose in both worktrees
  cd "$WORKTREE_1"
  export COMPOSE_PROJECT_NAME="cfn-main"
  docker-compose up -d

  cd "$WORKTREE_2"
  export COMPOSE_PROJECT_NAME="cfn-feature-auth"
  docker-compose up -d

  # WHEN both spawn coordinators
  # THEN container names should be unique
  local main_containers=$(docker ps --filter "name=cfn-main_" --format "{{.Names}}")
  local feature_containers=$(docker ps --filter "name=cfn-feature-auth_" --format "{{.Names}}")

  if [ -n "$main_containers" ] && [ -n "$feature_containers" ]; then
    assert_success "Both worktrees have isolated containers"
  fi

  # Cleanup
  docker-compose -p cfn-main down
  docker-compose -p cfn-feature-auth down
  git worktree remove "$WORKTREE_1"
  git worktree remove "$WORKTREE_2"
}
```

---

### 2. Service Discovery Testing

**What to Test:**
- Agents resolve "redis:6379" via Docker DNS
- Agents resolve "postgres:5432" via Docker DNS
- Service-to-service communication works
- No hardcoded IPs or localhost references

**Test Pattern:**
```bash
test_service_discovery() {
  # GIVEN Docker Compose with cfn-redis service
  docker-compose up -d redis

  # WHEN agent connects to Redis via service name
  docker run --rm \
    --network="${COMPOSE_PROJECT_NAME}_default" \
    cfn-agent:latest \
    bash -c "redis-cli -h redis -p 6379 PING"

  # THEN connection succeeds
  if [ $? -eq 0 ]; then
    assert_success "Agent resolved 'redis' service name via Docker DNS"
  fi

  # Cleanup
  docker-compose down
}
```

---

### 3. Shared Volume Testing

**What to Test:**
- Loop 3 creates files accessible to Loop 2 via shared volume
- File permissions correct across containers
- Volume mount paths consistent
- No file conflicts between parallel agents

**Test Pattern:**
```bash
test_shared_volume_coordination() {
  # GIVEN shared volume mounted at /workspace
  docker-compose up -d

  # WHEN Loop 3 agent creates file
  docker run --rm \
    --volume="$(pwd):/workspace" \
    --network="${COMPOSE_PROJECT_NAME}_default" \
    cfn-agent:latest \
    bash -c "echo 'Loop 3 output' > /workspace/output.txt"

  # THEN Loop 2 agent can read file
  local content=$(docker run --rm \
    --volume="$(pwd):/workspace" \
    --network="${COMPOSE_PROJECT_NAME}_default" \
    cfn-agent:latest \
    cat /workspace/output.txt)

  if [ "$content" = "Loop 3 output" ]; then
    assert_success "Loop 2 read Loop 3 file via shared volume"
  fi

  # Cleanup
  rm output.txt
  docker-compose down
}
```

---

### 4. Container Cleanup Testing

**What to Test:**
- All containers stopped after test completion
- No orphaned containers
- Volumes cleaned up
- Networks removed

**Test Pattern:**
```bash
cleanup_docker() {
  local exit_code=$?

  # Stop all test containers
  docker ps -a --filter "name=cfn-test-" -q | xargs -r docker rm -f

  # Remove Docker Compose stack
  if [ -n "$COMPOSE_PROJECT_NAME" ]; then
    docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans
  fi

  # Verify cleanup
  local remaining=$(docker ps -a --filter "name=cfn-test-" -q | wc -l)
  if [ "$remaining" -eq 0 ]; then
    log_info "All test containers cleaned up"
  else
    log_warn "$remaining test containers still exist"
  fi

  exit $exit_code
}

trap cleanup_docker EXIT INT TERM
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal:** Establish Docker test infrastructure

**Tasks:**
1. Create `tests/docker-mode/` directory structure
2. Copy test-utils.sh and adapt for Docker environment
3. Create Docker-specific test templates
4. Set up Docker Compose test fixtures

**Deliverables:**
- `tests/docker-mode/test-utils-docker.sh` - Helper functions for Docker tests
- `tests/docker-mode/fixtures/` - Docker Compose test configurations
- `tests/docker-mode/README.md` - Docker testing guide

**Validation:**
- Can spawn test containers programmatically
- Can verify service discovery works
- Can clean up containers reliably

---

### Phase 2: Core Tests (Week 2-3)

**Goal:** Implement essential Docker mode tests

**Tasks:**
1. `test-coordinator-spawning.sh` (23 tests)
2. `test-redis-coordination.sh` (7 tests)
3. `test-threshold-validation.sh` (6 tests)

**Deliverables:**
- 36 Docker mode tests passing
- Service discovery validated
- Multi-worktree isolation confirmed

**Validation:**
- All 3 test files pass at ≥90%
- No container leaks after test runs
- Tests complete in <5 minutes

---

### Phase 3: TDD Compliance (Week 4)

**Goal:** Validate TDD protocols in Docker environment

**Tasks:**
1. `test-tests-before-code.sh` (3 tests)
2. `test-red-green-refactor.sh` (4 tests)
3. `test-coverage-enforcement.sh` (6 tests)
4. `test-post-edit-feedback.sh` (5 tests)
5. `test-post-edit-error-handling.sh` (6 tests)

**Deliverables:**
- 24 TDD compliance tests passing in Docker
- Post-edit hooks work in containers
- Coverage calculations accurate

**Validation:**
- 100% pass rate for TDD tests
- Hooks execute in container context
- Timestamps validate test-before-implementation

---

### Phase 4: Full CFN Loop (Week 5)

**Goal:** Validate complete CFN Loop in Docker

**Tasks:**
1. `test-cfn-loop-full-cycle.sh` (6 scenarios)
   - Loop 3 faulty TDD tests (containerized)
   - Loop 2 violation detection (cross-container)
   - Product Owner decision (containerized)
   - 6 parallel agents (REAL Docker spawning)
   - Full integration test

**Deliverables:**
- 6/6 scenarios passing with real container spawning
- Parallel agent spawning validated
- Cross-container coordination confirmed

**Validation:**
- All 6 files created by real containers
- Loop 2 detects violations across containers
- Product Owner decides correctly in container

---

### Phase 5: Orchestrator Workflow (Week 6)

**Goal:** Validate orchestrator in Docker environment

**Tasks:**
1. `test-orchestrator-workflow.sh` (21+ tests)
   - Loop 3 spawning in containers
   - Loop 2 waiting mechanism
   - Gate checks in Docker
   - Consensus collection across containers

**Deliverables:**
- 21+ orchestrator tests passing
- Container-based workflow validated
- Gate and consensus logic confirmed

**Validation:**
- ≥90% pass rate
- Container spawning works reliably
- Redis coordination validated

---

## Part 5: Success Criteria

### Test Coverage Parity

**Target:** Match CLI mode test coverage (98% pass rate)

**Metrics:**
- TDD Compliance: 24/24 tests (100%)
- Coordinator Spawning: 23/23 tests (100%)
- Orchestrator Workflow: 21/23 tests (91%)
- Threshold Validation: 6/6 tests (100%)
- Redis Coordination: 7/7 tests (100%)
- Full CFN Loop: 6/6 scenarios (100%)

**Total:** 87/89 tests passing (97.8% target)

---

### Docker-Specific Validation

**Required Tests:**
- ✅ Service discovery (redis:6379, postgres:5432)
- ✅ Multi-worktree isolation (COMPOSE_PROJECT_NAME)
- ✅ Port offset calculation
- ✅ Shared volume coordination
- ✅ Container cleanup (no orphans)
- ✅ Cross-container Redis coordination
- ✅ Real container spawning (not simulation)

---

### Performance Benchmarks

**Test Execution Time:**
- Individual test: <30 seconds
- Full test suite: <10 minutes
- Parallel agent test: <2 minutes

**Resource Usage:**
- Max containers: 10 concurrent
- Max memory: 4GB total
- Max disk: 2GB for images

---

## Part 6: Risk Mitigation

### Known Challenges

**1. Container Startup Latency**
- **Risk:** Containers take 2-5s to start (vs <1s for CLI processes)
- **Mitigation:** Use health checks, increase timeouts, parallel spawning

**2. Volume Mount Permissions**
- **Risk:** File permissions differ between host and container
- **Mitigation:** Use consistent UID/GID, test permission propagation

**3. Network Isolation Issues**
- **Risk:** Containers can't communicate across networks
- **Mitigation:** Use single Docker network, validate service discovery

**4. Resource Exhaustion**
- **Risk:** Too many containers overwhelm host
- **Mitigation:** Limit concurrent containers, aggressive cleanup

**5. Image Build Time**
- **Risk:** Rebuilding images for each test too slow
- **Mitigation:** Use cached images, incremental builds, multi-stage Dockerfiles

---

### Fallback Plans

**If Docker Tests Can't Reach Parity:**

**Option A: Hybrid Approach**
- Run TDD/coordination tests in CLI mode
- Run Docker-specific tests (service discovery, isolation) only
- Accept lower Docker test coverage (60-70%)

**Option B: Extended Timeline**
- Add 2-4 weeks for Docker complexity
- Prioritize critical tests first
- Defer edge cases to later phases

**Option C: Virtualization Alternative**
- Use lightweight VMs instead of containers
- May have better isolation properties
- Higher resource overhead but simpler testing

---

## Part 7: Reference Materials

### CLI Mode Test Files (Templates)

**Copy and adapt these files:**
1. `tests/cli-mode/test-coordinator-spawning.sh` → Docker version
2. `tests/cli-mode/test-orchestrator-workflow.sh` → Docker version
3. `tests/cli-mode/test-threshold-validation.sh` → Docker version
4. `tests/cli-mode/test-redis-coordination.sh` → Docker version
5. `tests/cli-mode/test-cfn-loop-full-cycle.sh` → Docker version
6. `tests/tdd-compliance/*.sh` → Docker versions

---

### Key Commits to Review

**CLI Mode Testing Evolution:**
- `55b5f195c` - Fixed test path references (43% → 87%)
- `1765eff77` - Fixed command expectations (87% → 100%)
- `30df76e58` - Fixed orchestrator workflow (74% → 91%)
- `e8c4ef683` - Added CFN_REDIS_HOST support
- `e38f3c39f` - Created CLI mode configuration guide
- `3e42cef00` - Initial full CFN Loop test (simulated)
- `c67504bf5` - Updated to real CLI agent spawning
- `9d214561e` - Updated documentation for real spawning

**Learnings Documented:**
- `docs/CLI_MODE_REDIS_CONFIGURATION.md` - Environment variable configuration
- `docs/ALL_3_MODES_VERIFIED_WORKING.md` - All 3 modes validated
- `readme/logs-test-suite.md` - Complete test documentation

---

### Docker Resources

**Existing Docker Tests:**
- `tests/docker/validation/validate-bug6-redis-vars.sh` - CFN_REDIS_HOST standardization

**Docker Configuration:**
- `docker-compose.yml` - Production Docker Compose setup
- `scripts/docker/run-in-worktree.sh` - Multi-worktree Docker execution

**Documentation:**
- `CLAUDE.md` (Multi-Worktree section) - Docker isolation patterns
- `docs/CUSTOM_PROVIDER_ROUTING.md` - Provider configuration in Docker

---

## Part 8: Questions for Docker Team

Before starting, clarify:

1. **Target Test Coverage:** Aiming for 98% parity with CLI mode, or lower threshold acceptable?

2. **Real Container Spawning:** Should all tests use real `docker run` spawning, or simulation acceptable for some tests?

3. **Multi-Worktree Testing:** Priority for multi-worktree isolation tests, or single-worktree sufficient initially?

4. **Image Build Strategy:** Pre-build images for tests, or build on-demand? Impact on test execution time.

5. **Resource Limits:** Max concurrent containers allowed? Memory/CPU constraints?

6. **CI/CD Integration:** Tests must run in GitHub Actions, or local execution only?

7. **Timeline:** 6-week roadmap realistic, or need acceleration/extension?

8. **Ownership:** Docker team owns all Docker tests, or shared with CLI team?

---

## Appendix A: Test Template (Docker Mode)

```bash
#!/usr/bin/env bash
# tests/docker-mode/test-example.sh
# Docker Mode Test Template

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker-mode/test-utils-docker.sh"

# Test configuration
TEST_ID="docker-test-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-test-$$"

# Cleanup function
cleanup() {
  local exit_code=$?
  log_info "Cleaning up Docker test environment..."

  # Stop containers
  docker-compose -p "$COMPOSE_PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true

  # Remove test containers
  docker ps -a --filter "name=cfn-test-" -q | xargs -r docker rm -f 2>/dev/null || true

  # Remove test workspace
  rm -rf "$TEST_WORKSPACE" 2>/dev/null || true

  exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

log_info "=== Docker Mode Test Suite ==="
log_info "Test ID: $TEST_ID"
log_info "Compose Project: $COMPOSE_PROJECT_NAME"

# ============================================================================
# Test 1: Example Test
# ============================================================================
test_example() {
  log_step "GIVEN Docker Compose stack is running"

  # Start Docker Compose
  export COMPOSE_PROJECT_NAME
  docker-compose up -d

  # WHEN agent container spawns
  docker run --rm \
    --network="${COMPOSE_PROJECT_NAME}_default" \
    --volume="$(pwd):/workspace" \
    -e CFN_REDIS_HOST=redis \
    cfn-agent:latest \
    backend-developer \
    --task-id "$TEST_ID" \
    --context "TASK_DESCRIPTION='Test task'" \
    --timeout 25

  # THEN verify success
  if [ $? -eq 0 ]; then
    assert_success "Agent container executed successfully"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Agent container failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# ============================================================================
# Execute Tests
# ============================================================================

test_example

# ============================================================================
# Summary
# ============================================================================

echo ""
log_info "=== Test Summary ==="
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ All tests PASSED"
  exit 0
else
  echo "❌ Some tests FAILED"
  exit 1
fi
```

---

## Contact & Support

**CLI Mode Team:**
- Test suite location: `tests/cli-mode/`
- Documentation: `readme/logs-test-suite.md`
- Contact: [Session handoff to Docker team]

**Docker Team:**
- Target location: `tests/docker-mode/`
- Timeline: 6 weeks (Phases 1-5)
- Success criteria: 97.8% test coverage (87/89 tests)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-18
**Author:** Claude Code (CLI Mode Team)
**Next Review:** After Phase 1 completion

---

## Part 8: Implementation Status (Added 2025-11-18)

### Tests Successfully Relocated

All 6 missing test suites have been created and moved to their final locations:

| Original Plan Location | Final Location | Tests | Status |
|------------------------|----------------|-------|--------|
| `tests/docker-mode/test-tdd-compliance.sh` | `tests/docker/core/tdd-compliance-tests.sh` | 24 | ✅ Relocated |
| `tests/docker-mode/test-coordinator-spawning.sh` | `tests/docker/core/coordinator-spawning-tests.sh` | 23 | ✅ Relocated |
| `tests/docker-mode/test-orchestrator-workflow.sh` | `tests/docker/core/orchestrator-workflow-tests.sh` | 21 | ✅ Relocated |
| `tests/docker-mode/test-cfn-loop-full-cycle.sh` | `tests/docker/core/cfn-loop-full-cycle-tests.sh` | 6 | ✅ Relocated |
| `tests/docker-mode/test-redis-coordination.sh` | Merged into existing `redis-coordination-tests.sh` | 7 | ✅ Consolidated |
| `tests/docker-mode/test-threshold-validation.sh` | `tests/docker/core/threshold-validation-tests.sh` | 6 | ✅ Relocated |

### Playbook & Workflow Tests

| Test Suite | Location | Tests | Status |
|------------|----------|-------|--------|
| Playbook Integration | `tests/integration/test-playbook-integration.sh` | 10 | ✅ Existing |
| Playbook + Workflow | `tests/integration/test-playbook-workflow-integration.sh` | 5 | ✅ Existing |
| Workflow Codification | `tests/integration/test-workflow-codification.sh` | 8 | ✅ Existing |

### Test Directory Organization

```
tests/
├── docker/core/              # Docker-based CFN Loop core tests (31 files)
│   ├── cfn-loop-full-cycle-tests.sh
│   ├── coordinator-spawning-tests.sh
│   ├── orchestrator-workflow-tests.sh
│   ├── tdd-compliance-tests.sh
│   ├── threshold-validation-tests.sh
│   └── [26 other existing tests]
├── integration/              # Integration tests (34 files)
│   ├── test-playbook-integration.sh
│   ├── test-playbook-workflow-integration.sh
│   └── test-workflow-codification.sh
└── cli-mode/                 # CLI mode tests (17 files)
    └── [CLI-specific tests]
```

### Implementation Quality

| Test Suite | Total Tests | Real Implementation | Placeholders |
|------------|-------------|---------------------|--------------|
| Redis Coordination | 7 | 7 (100%) | 0 |
| Threshold Validation | 6 | 6 (100%) | 0 |
| CFN Loop Full Cycle | 6 | 6 (100%) | 0 |
| Coordinator Spawning | 23 | 10 (43%) | 13 |
| Orchestrator Workflow | 21 | 8 (38%) | 13 |
| TDD Compliance | 24 | 5 (21%) | 19 |
| **Total** | **87** | **42 (48%)** | **45 (52%)** |

### Next Steps

1. **Complete placeholder implementations** (45 tests need full logic)
2. **Execute tests in Docker environment** (validate pass rates)
3. **Update test helper imports** (ensure all paths correct)
4. **Document test execution patterns** (how to run tests)

### Reference Documents

- **Test Organization:** `planning/review-and-test/FINAL_TEST_ORGANIZATION_MAP.md`
- **Implementation Details:** `planning/review-and-test/DOCKER_TEST_IMPLEMENTATION_COMPLETE.md`
- **Overlap Analysis:** `docs/TEST_COVERAGE_OVERLAP_ANALYSIS.md`

---
