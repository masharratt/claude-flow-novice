# Docker Test Suite Technical Debt

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Status:** Active Tracking

---

## Executive Summary

This document tracks known technical debt in the Docker test suite, including infrastructure-blocked tests, security gaps, and code quality issues.

**Total Debt Items:** 5 categories
**Estimated Remediation Effort:** 16-24 hours
**Priority Distribution:**
- P0 (Critical): 1 item (Bug #6)
- P1 (High): 2 items (Infrastructure tests, security flags)
- P2 (Medium): 2 items (Unused imports, Dockerfile root access)

---

## 1. Infrastructure-Blocked Tests (4 Tests)

### Status: BLOCKED - Infrastructure Not Ready

**Priority:** P1 (High)
**Estimated Effort:** 8-12 hours (infrastructure setup + test updates)
**Blocker:** Docker coordinator architecture incomplete

### Affected Tests

#### 1.1 redis-coordination-tests.sh

**Current State:** Partially blocked

**Working Tests:**
- ✅ Test 1: Redis heartbeat validation
- ✅ Test 2: Coordinator registration
- ✅ Test 3: Agent spawning metadata

**Blocked Tests:**
- ❌ Test 4: Agent completion reporting (Bug #6 - variable name mismatch)
- ❌ Test 5: Task coordination flow (Bug #6)
- ❌ Test 6: Multi-agent synchronization (Bug #6)

**Root Cause:**
- Bug #6: Node.js CLI uses `REDIS_HOST`/`REDIS_PORT` instead of `CFN_REDIS_HOST`/`CFN_REDIS_PORT`
- Agents fail with "Could not connect to Redis at 127.0.0.1:6379: Connection refused"
- Variable name alignment needed in `src/cli/anthropic-client.ts` and `src/cli/agent-spawn.ts`

**Resolution Path:**
1. Fix variable names in Node.js CLI (2 hours)
2. Rebuild agent images (30 minutes)
3. Update test expectations (1 hour)
4. Validate end-to-end flow (1 hour)

**Owner:** Backend Developer
**Target Date:** Week of 2025-11-18

#### 1.2 agent-lifecycle-tests.sh

**Current State:** Infrastructure incomplete

**Blocked Scenarios:**
- Agent spawn → execute → cleanup lifecycle
- Metadata propagation across lifecycle stages
- Graceful shutdown with state persistence

**Root Cause:**
- Bug #6 prevents agent completion reporting
- No heartbeat updates during execution
- Cleanup validation depends on Redis state

**Resolution Path:**
1. Fix Bug #6 variable mismatch (prerequisite)
2. Implement lifecycle state machine in coordinator
3. Add lifecycle event logging to agents
4. Update test to validate state transitions

**Estimated Effort:** 4 hours (post Bug #6 fix)

**Owner:** Docker Specialist
**Target Date:** Week of 2025-11-18

#### 1.3 clustering-accuracy-tests.sh

**Current State:** Concept validation only

**Blocked Scenarios:**
- Tier allocation accuracy
- Error complexity clustering
- Batch size optimization

**Root Cause:**
- Coordinator uses simple sequential spawning (no clustering logic yet)
- Tier assignment is hardcoded, not dynamic
- Test expectations assume unimplemented features

**Resolution Path:**
1. Implement error clustering algorithm in coordinator (4 hours)
2. Add tier assignment logic based on complexity (2 hours)
3. Update test to validate clustering behavior (2 hours)
4. Benchmark clustering accuracy (1 hour)

**Estimated Effort:** 9 hours

**Owner:** Backend Developer
**Target Date:** Week of 2025-11-25

#### 1.4 build-sync-tests.sh

**Current State:** Docker build process not optimized

**Blocked Scenarios:**
- Build context size validation
- Layer caching efficiency
- Multi-stage build sync

**Root Cause:**
- Docker images use suboptimal layer ordering
- No build cache invalidation strategy
- Multi-stage builds not fully utilized

**Resolution Path:**
1. Optimize Dockerfiles with proper layer ordering (2 hours)
2. Implement .dockerignore rules (1 hour)
3. Add build cache warming to CI (2 hours)
4. Update test to validate optimizations (1 hour)

**Estimated Effort:** 6 hours

**Owner:** DevOps Engineer
**Target Date:** Week of 2025-12-02

### Summary

| Test | Blocker | Effort | Owner | Target Date |
|------|---------|--------|-------|-------------|
| redis-coordination-tests.sh | Bug #6 | 4.5h | Backend Dev | 2025-11-18 |
| agent-lifecycle-tests.sh | Bug #6 | 4h | Docker Specialist | 2025-11-18 |
| clustering-accuracy-tests.sh | Missing clustering | 9h | Backend Dev | 2025-11-25 |
| build-sync-tests.sh | Build optimization | 6h | DevOps | 2025-12-02 |

**Total Remediation Effort:** 23.5 hours

---

## 2. Dockerfile.coordinator Root Access Issue

### Status: SECURITY RISK - Non-blocking

**Priority:** P2 (Medium)
**Estimated Effort:** 2 hours
**Security Impact:** Medium

### Problem Description

**Current State:**
```dockerfile
# Dockerfile.coordinator runs as root
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "docker/coordinator/src/coordinator.js"]
# No USER directive - runs as root (UID 0)
```

**Security Implications:**
1. Container breakout risk (root in container = root on host)
2. Privilege escalation attack surface
3. Volume mount permission issues
4. Non-compliance with least privilege principle

**Affected Components:**
- `Dockerfile.coordinator`
- `docker/coordinator/src/coordinator.js`
- All integration tests using coordinator image

### Resolution Path

**Step 1: Create Non-Root User (30 minutes)**
```dockerfile
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 cfn && \
    adduser -D -u 1001 -G cfn cfn

WORKDIR /app

# Copy with correct ownership
COPY --chown=cfn:cfn . .

# Install dependencies as root (needed for npm)
RUN npm install --production && \
    chown -R cfn:cfn node_modules

# Switch to non-root user
USER cfn

CMD ["node", "docker/coordinator/src/coordinator.js"]
```

**Step 2: Update Volume Mounts (30 minutes)**
```bash
# Update tests to use --user flag
docker run \
    --user 1001:1001 \
    -v "$PROJECT_ROOT:/workspace:ro" \
    cfn-intelligent-coordinator:latest
```

**Step 3: Fix File Permissions (30 minutes)**
```bash
# Ensure output directories are writable
mkdir -p /tmp/coordinator-output
chmod 777 /tmp/coordinator-output

# Mount with proper ownership
docker run \
    -v "/tmp/coordinator-output:/output:rw" \
    cfn-intelligent-coordinator:latest
```

**Step 4: Test and Validate (30 minutes)**
```bash
# Verify non-root execution
docker run cfn-intelligent-coordinator:latest id
# Expected: uid=1001(cfn) gid=1001(cfn)

# Test file write capabilities
docker run \
    -v "/tmp/test:/output:rw" \
    cfn-intelligent-coordinator:latest \
    sh -c "echo test > /output/test.txt"

# Run full integration test
bash tests/docker/intelligent-coordinator-test.sh
```

### Impact Analysis

**Breaking Changes:**
- Volume mount permissions may change
- Tests may fail if expecting root file ownership
- CI pipelines may need permission adjustments

**Non-Breaking:**
- Coordinator functionality unchanged
- Redis connectivity unchanged
- Agent spawning logic unchanged

**Rollback Plan:**
```bash
# If issues occur, revert to root user temporarily
docker run --user 0:0 cfn-intelligent-coordinator:latest
```

### Estimated Effort Breakdown

| Task | Effort | Owner |
|------|--------|-------|
| Dockerfile updates | 30 min | DevOps |
| Test volume mount updates | 30 min | Docker Specialist |
| Permission fixes | 30 min | DevOps |
| Integration testing | 30 min | Tester |
| **Total** | **2 hours** | - |

**Target Date:** Week of 2025-11-18
**Owner:** DevOps Engineer

---

## 3. Unsecured Docker Commands (88 Instances)

### Status: SECURITY GAP - Low Priority

**Priority:** P1 (High)
**Estimated Effort:** 4-6 hours (mass update)
**Security Impact:** Medium

### Problem Description

**Current State:**
- 89 total `docker run` commands in test suite
- 7 use `get_secure_docker_flags()` (7.9% coverage)
- 82 lack security hardening (92.1% gap)

**Missing Security Flags:**
```bash
# Current (unsecured)
docker run -d --name test-agent my-agent:latest

# Desired (secured)
docker run -d --name test-agent \
    --security-opt no-new-privileges \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=100m \
    --cap-drop ALL \
    my-agent:latest
```

### Affected Files (20 Tests)

**High Priority (Production Patterns):**
1. `intelligent-coordinator-test.sh` - Production reference test
2. `docker-hello-world-parity-tests.sh` - Integration validation
3. `container-test-runner.sh` - Test execution framework

**Medium Priority (Validation Tests):**
4. `50-agent-parallel-test.sh` - Parallelism testing
5. `agent-lifecycle-tests.sh` - Lifecycle validation
6. `memory-budget-tests.sh` - Resource management
7. `coordinator-iteration-tests.sh` - Iteration loop
8. `clustering-accuracy-tests.sh` - Clustering logic

**Low Priority (Debug/Utility Tests):**
9. `b10-debug-single-agent.sh` - Debugging tool
10. `b10-iterative-memory-test.sh` - Memory profiling
11. `b10-typescript-fix-test.sh` - TypeScript validation
12. `simple-memory-profile.sh` - Quick profiling
13. `validate-bug6-redis-vars.sh` - Bug validation
14. `validate-redis-connection.sh` - Connection test

**Plus 6 additional files** (see `PHASE_5_DOCKER_PATTERN_ASSESSMENT.md`)

### Resolution Options

#### Option A: Mass Update (Recommended)

**Approach:** Apply security flags to all production/integration tests

**Effort:** 4 hours
- Update 8 high/medium priority tests (30 min each)
- Run full test suite validation (1 hour)
- Update documentation (30 min)

**Benefits:**
- Consistent security posture
- Production-ready test patterns
- Reduced attack surface

**Risks:**
- May break tests expecting write access
- Volume mount permissions may need adjustment
- Some tests may need `--read-only` exemptions

#### Option B: Policy-Based Approach

**Approach:** Define security flag policy by test category

**Policy:**
- **REQUIRED:** Production tests, integration tests
- **RECOMMENDED:** Validation tests, lifecycle tests
- **OPTIONAL:** Debug tests, profiling tests, quick validators

**Effort:** 6 hours
- Document policy (1 hour)
- Update REQUIRED tests (2 hours)
- Update RECOMMENDED tests (2 hours)
- Validate and document exemptions (1 hour)

**Benefits:**
- Flexibility for debugging scenarios
- Clear policy documentation
- Gradual rollout

**Risks:**
- Inconsistent patterns across test suite
- Requires ongoing policy enforcement

#### Option C: Deferred (Not Recommended)

**Approach:** Accept current state, document exemptions

**Effort:** 1 hour (documentation only)

**Risks:**
- Continued security gap
- Technical debt accumulation
- Potential compliance issues

### Recommendation

**Choose Option A (Mass Update)** for the following reasons:
1. Test suite is stable (Phase 5 complete)
2. Helper function already exists (`get_secure_docker_flags()`)
3. Consistent patterns improve maintainability
4. Security hardening aligns with production requirements

### Resolution Path

**Phase 1: High Priority Tests (2 hours)**
```bash
# Update production pattern tests
for test in intelligent-coordinator-test.sh \
            docker-hello-world-parity-tests.sh \
            container-test-runner.sh; do
    # Add security flags to docker run commands
    sed -i 's/docker run/docker run $(get_secure_docker_flags)/g' "tests/docker/$test"
done

# Validate
bash tests/docker/intelligent-coordinator-test.sh
```

**Phase 2: Medium Priority Tests (2 hours)**
```bash
# Update validation tests
for test in 50-agent-parallel-test.sh \
            memory-budget-tests.sh \
            coordinator-iteration-tests.sh; do
    # Add security flags with exemptions for specific scenarios
    # Manual updates required (some tests need write access)
done
```

**Phase 3: Documentation (30 minutes)**
```bash
# Document exemptions
cat >> tests/docker/MAINTENANCE.md <<EOF

## Security Flag Exemptions

The following tests do NOT use security flags:
- Debug tests: b10-*.sh (write access needed for debugging)
- Profiling tests: *-memory-profile.sh (performance overhead)
- Quick validators: validate-*.sh (simplicity over security)
EOF
```

### Estimated Effort Breakdown

| Phase | Tasks | Effort | Owner |
|-------|-------|--------|-------|
| Phase 1 | High priority updates | 2h | Docker Specialist |
| Phase 2 | Medium priority updates | 2h | Docker Specialist |
| Phase 3 | Documentation | 30m | Technical Writer |
| **Total** | - | **4.5h** | - |

**Target Date:** Week of 2025-11-18
**Owner:** Docker Specialist

---

## 4. Unused Helper Imports (7 Files)

### Status: CODE QUALITY - Low Priority

**Priority:** P2 (Medium)
**Estimated Effort:** 1 hour
**Impact:** Code clarity, maintainability

### Problem Description

**Current State:**
- 12 files source `architecture-test-helpers.sh`
- 5 files actively use helper functions
- 7 files have unused imports (58% import waste)

**Affected Files:**
1. `intelligent-coordinator-test.sh` - Sources but doesn't use helpers
2. `b10-typescript-fix-test.sh` - Sources but doesn't use helpers
3. `50-agent-parallel-test.sh` - Sources but doesn't use helpers
4. `memory-budget-tests.sh` - Sources but doesn't use helpers
5. `coordinator-iteration-tests.sh` - Sources but doesn't use helpers
6. `clustering-accuracy-tests.sh` - Sources but doesn't use helpers
7. `test-docker-stabilization.sh` - Sources but doesn't use helpers

### Impact Analysis

**Pros of Keeping Unused Imports:**
- Future-proofing (helpers available when needed)
- Consistent test structure (all tests source same helpers)
- Low overhead (sourcing is fast)

**Cons of Keeping Unused Imports:**
- Misleading code (suggests helpers are used when they're not)
- Dependency tracking confusion
- Harder to identify actual helper usage

### Resolution Options

#### Option A: Remove Unused Imports (Recommended)

**Effort:** 1 hour
```bash
# Audit helper usage
for test in tests/docker/*.sh; do
    if grep -q "source.*architecture-test-helpers.sh" "$test"; then
        if ! grep -qE "(check_required_vars|validate_|parse_|count_)" "$test"; then
            echo "UNUSED: $test"
        fi
    fi
done

# Remove unused source directives
# (Manual removal with validation)
```

**Benefits:**
- Accurate dependency tracking
- Clearer code intent
- Easier refactoring

**Risks:**
- Future additions may need to re-add imports
- Inconsistent test structure

#### Option B: Opportunistic Adoption (Preferred)

**Approach:** Replace inline validation with helpers where applicable

**Effort:** 2-3 hours
- `intelligent-coordinator-test.sh`: Use `wait_for_coordinator()`, `parse_coordinator_logs()`
- `b10-typescript-fix-test.sh`: Use `parse_typescript_errors()`, `validate_error_delta()`
- `50-agent-parallel-test.sh`: Use `validate_wave_parallelism()`, `count_spawned_agents()`
- `memory-budget-tests.sh`: Use `verify_build_context_size()`

**Benefits:**
- Reduces inline code duplication
- Validates helper function value
- Improves test maintainability

**Risks:**
- Requires test logic changes
- May introduce regressions if helpers misbehave

#### Option C: Document as Intentional

**Approach:** Accept unused imports, document as future-proofing

**Effort:** 15 minutes
```bash
# Add comment to files with unused imports
# tests/docker/intelligent-coordinator-test.sh

# Source architecture helpers (unused currently, reserved for future enhancements)
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"
```

**Benefits:**
- Zero refactoring risk
- Clear intent

**Drawbacks:**
- Technical debt persists
- No immediate value

### Recommendation

**Choose Option B (Opportunistic Adoption)** for the following reasons:
1. Validates helper function design
2. Reduces code duplication
3. Improves long-term maintainability
4. Demonstrates value of Phase 4 helper development

### Resolution Path

**Week 1: High-Value Refactoring (2 hours)**
- Update `intelligent-coordinator-test.sh` with `wait_for_coordinator()`
- Update `b10-typescript-fix-test.sh` with `parse_typescript_errors()`

**Week 2: Opportunistic Updates (1 hour)**
- Update `50-agent-parallel-test.sh` with `validate_wave_parallelism()`
- Update `memory-budget-tests.sh` with `verify_build_context_size()`

**Week 3: Cleanup (30 minutes)**
- Remove remaining unused imports from other files
- Document helper adoption metrics

### Estimated Effort Breakdown

| Task | Effort | Owner |
|------|--------|-------|
| High-value refactoring | 2h | Backend Developer |
| Opportunistic updates | 1h | Docker Specialist |
| Cleanup and docs | 30m | Technical Writer |
| **Total** | **3.5h** | - |

**Target Date:** Week of 2025-11-25
**Owner:** Backend Developer (lead)

---

## 5. Bug #6: Redis Variable Name Mismatch

### Status: CRITICAL BUG - Blocks 4 Tests

**Priority:** P0 (Critical)
**Estimated Effort:** 2 hours
**Impact:** Blocks agent completion reporting

### Problem Description

**Root Cause:**
Node.js CLI uses inconsistent variable names for Redis configuration:
- `src/cli/anthropic-client.ts`: Uses `REDIS_HOST` and `REDIS_PORT`
- `src/cli/agent-spawn.ts`: Uses `REDIS_HOST` and `REDIS_PORT`
- Test environment: Sets `CFN_REDIS_HOST` and `CFN_REDIS_PORT`
- Result: Agents default to hardcoded `127.0.0.1:6379`, causing connection failures

**Symptom:**
```
Error: Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Affected Components:**
1. `src/cli/anthropic-client.ts` - Redis client initialization
2. `src/cli/agent-spawn.ts` - Agent environment setup
3. `docker/agent/init.sh` - Agent initialization script
4. All tests expecting agent completion reporting

### Resolution Path

**Step 1: Update Variable Names (1 hour)**

**File: `src/cli/anthropic-client.ts`**
```typescript
// Before
const redisClient = redis.createClient({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

// After
const redisClient = redis.createClient({
  host: process.env.CFN_REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.CFN_REDIS_PORT || '6379', 10)
});
```

**File: `src/cli/agent-spawn.ts`**
```typescript
// Before
const agentEnv = {
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  // ...
};

// After
const agentEnv = {
  CFN_REDIS_HOST: process.env.CFN_REDIS_HOST || '127.0.0.1',
  CFN_REDIS_PORT: process.env.CFN_REDIS_PORT || '6379',
  // ...
};
```

**Step 2: Rebuild Agent Images (30 minutes)**
```bash
# Rebuild with updated CLI code
docker build -t cfn-agent:latest -f Dockerfile.agent .
docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

# Verify variable propagation
docker run --rm -e CFN_REDIS_HOST=test-redis -e CFN_REDIS_PORT=6379 \
    cfn-agent:latest env | grep CFN_REDIS
```

**Step 3: Validate Fix (30 minutes)**
```bash
# Run Bug #6 validation test
bash tests/docker/validate-bug6-redis-vars.sh

# Run blocked tests
bash tests/docker/redis-coordination-tests.sh
bash tests/docker/agent-lifecycle-tests.sh

# Run integration test
bash tests/docker/intelligent-coordinator-test.sh
```

### Estimated Effort Breakdown

| Task | Effort | Owner |
|------|--------|-------|
| Code updates | 1h | Backend Developer |
| Image rebuilds | 30m | DevOps |
| Validation | 30m | Tester |
| **Total** | **2h** | - |

**Target Date:** URGENT - Week of 2025-11-14
**Owner:** Backend Developer
**Status:** HIGH PRIORITY - Blocks 4 tests

### Related Issues

- Bug #4: Docker coordinator architecture (FIXED)
- Bug #3: Redis CLI with host flags (FIXED)
- See: `docs/bugs/BUG_6_REDIS_VARIABLE_NAMES.md` (if exists)

---

## Summary Table

| Issue | Priority | Effort | Owner | Target Date | Status |
|-------|----------|--------|-------|-------------|--------|
| Bug #6: Redis variables | P0 | 2h | Backend Dev | 2025-11-14 | URGENT |
| Infrastructure tests (4) | P1 | 23.5h | Mixed | 2025-11-18+ | BLOCKED |
| Unsecured docker commands (88) | P1 | 4.5h | Docker Spec | 2025-11-18 | PLANNED |
| Dockerfile root access | P2 | 2h | DevOps | 2025-11-18 | PLANNED |
| Unused helper imports (7) | P2 | 3.5h | Backend Dev | 2025-11-25 | OPTIONAL |

**Total Estimated Effort:** 35.5 hours

**Critical Path:**
1. Fix Bug #6 (2h) - URGENT
2. Unblock infrastructure tests (23.5h) - Dependent on Bug #6
3. Security hardening (4.5h + 2h) - Independent, can run in parallel
4. Code quality (3.5h) - Lowest priority, deferred

---

## Tracking and Updates

**Review Cadence:** Weekly
**Owner:** Lead Developer
**Last Review:** 2025-11-13

**Update Process:**
1. Weekly review of blocked tests
2. Update effort estimates based on progress
3. Adjust target dates as priorities shift
4. Archive resolved issues to `TECHNICAL_DEBT_ARCHIVE.md`

---

## Additional Resources

- **Bug Tracking:** `docs/bugs/`
- **Test Maintenance:** `tests/docker/MAINTENANCE.md`
- **Test Execution:** `tests/docker/EXECUTION_GUIDE.md`
- **Architecture:** `tests/docker/ARCHITECTURE.md`
- **Helper Adoption Report:** `tests/docker/PHASE5_ITER1_HELPER_ADOPTION_REPORT.md`
- **Docker Pattern Assessment:** `tests/docker/PHASE_5_DOCKER_PATTERN_ASSESSMENT.md`

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-13
**Next Review:** 2025-11-20
