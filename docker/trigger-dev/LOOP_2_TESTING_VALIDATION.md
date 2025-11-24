# Loop 2 Validation - Testing Strategy Review

**Validator**: Loop 2 Testing Specialist
**Date**: 2025-11-23
**Status**: CRITICAL GAPS IDENTIFIED
**Consensus Score**: 0.72

---

## Executive Summary

After comprehensive review of the Loop 3 investigation and proposed fixes, the testing strategy has **significant gaps** that must be addressed before production deployment. While the infrastructure analysis was thorough, the validation approach is incomplete and relies on a test script that **doesn't actually exist**.

**Critical Finding**: The referenced test script `tests/docker/redis-validation-test.sh` does not exist in the codebase. Loop 3 claimed 8 tests passed, but there is no evidence of test execution.

---

## 1. Redis Validation Test Analysis

### Test Script Status: NOT FOUND ❌

**Claimed Location**: `tests/docker/redis-validation-test.sh`
**Actual Status**: File does not exist
**Impact**: CRITICAL - No validation tests were actually executed

**Evidence**:
```bash
# Search for test file
find /mnt/wsl/.../docker/trigger-dev -name "redis-validation-test.sh"
# Result: No files found

# Check tests directory
ls /mnt/wsl/.../docker/trigger-dev/tests/
# Result: Directory doesn't exist
```

### Claimed Test Coverage (Unverified)

Loop 3 claimed these 8 tests passed, but no test file exists:

| Test # | Description | Status | Verification |
|--------|-------------|--------|-------------|
| 1 | Host Redis (127.0.0.1:6379) | ❓ UNVERIFIED | No test file |
| 2 | Docker Redis Service (redis:6379) | ❓ UNVERIFIED | No test file |
| 3 | Docker Network Configuration | ❓ UNVERIFIED | No test file |
| 4 | Redis Data Store | ❓ UNVERIFIED | No test file |
| 5 | docker-compose.yml Configuration | ❓ UNVERIFIED | No test file |
| 6 | Environment Variable Configuration | ❓ UNVERIFIED | No test file |
| 7 | CLI Agent Spawn Simulation | ❓ UNVERIFIED | No test file |
| 8 | Task Queue Operations | ❓ UNVERIFIED | No test file |

**Assessment**: Loop 3 reported test results without actual test execution. This is a serious validation failure.

---

## 2. Proposed Fix Validation

### Fix Plan Review

**File**: `CFN_ARCHITECTURE_FIX_PLAN.md`

**Proposed Changes**:

#### Fix 1: Network Name Correction ✅ VALID

**Current Code** (src/jobs/test-single-agent.ts, Line 127):
```typescript
'--network', 'cfn-network',  // ❌ Wrong network
```

**Proposed Fix**:
```typescript
'--network', 'trigger-cfn-network',  // ✅ Correct network (from docker-compose.yml)
```

**Validation**:
- ✅ Network name verified in docker-compose.yml (line 354)
- ✅ All services on `trigger-dev_trigger-cfn-network`
- ✅ Fix addresses root cause identified in Loop 3

**Risk**: LOW - Straightforward network name correction

#### Fix 2: Redis Environment Variables ✅ VALID

**Current Code** (src/jobs/test-single-agent.ts, Lines 133-134):
```typescript
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,
// Missing: CFN_REDIS_HOST, CFN_REDIS_PORT
```

**Proposed Fix** (Lines 133-136):
```typescript
'-e', `CFN_REDIS_HOST=redis`,      // Service name for DNS
'-e', `CFN_REDIS_PORT=6379`,       // Internal port
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,
```

**Validation**:
- ✅ Matches docker-compose.yml defaults (CFN_REDIS_HOST:-redis)
- ✅ Uses internal port 6379 (not exposed port 6380)
- ✅ Aligns with CFN Loop coordination protocol

**Risk**: LOW - Standard Redis connection pattern

#### Fix 3: Entrypoint Whitelist Update ⚠️ NEEDS VERIFICATION

**File**: `entrypoint.sh`

**Claimed Status**: "CFN_REDIS_PORT already included"
**Verification Needed**: Confirm `CFN_REDIS_HOST` is in whitelist

**Required Action**:
```bash
# Check entrypoint.sh whitelist
grep -A 30 "ENV_WHITELIST" docker/trigger-dev/entrypoint.sh | grep CFN_REDIS
```

**Risk**: MEDIUM - Missing variable would block Redis coordination

---

## 3. Missing Test Cases

### Critical Tests Not Covered

#### 3.1 Pre-Fix Validation Tests

These tests should run **before** applying fixes:

**Test 1: Verify Current Failure Mode**
```bash
#!/bin/bash
# Confirm agents currently fail to connect

docker run --rm \
  --network cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  alpine:latest \
  nslookup redis

# Expected: FAIL (nslookup: can't resolve 'redis')
# This confirms network isolation issue
```

**Test 2: Verify Correct Network Exists**
```bash
docker network inspect trigger-dev_trigger-cfn-network

# Expected: JSON with connected containers
# Validates: redis, postgres, webapp, worker on network
```

**Test 3: Baseline Agent Spawn (Current Broken State)**
```bash
# Run current spawning logic
cd docker/trigger-dev
npm run build
node dist/jobs/test-single-agent.js

# Expected: Container spawns but can't resolve Redis
# Captures: Baseline error logs for comparison
```

#### 3.2 Post-Fix Validation Tests

These tests run **after** applying fixes:

**Test 4: Network Connectivity After Fix**
```bash
#!/bin/bash
# Verify agents resolve services on correct network

docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  alpine:latest \
  nslookup redis

# Expected: SUCCESS (172.23.0.3 or similar)
```

**Test 5: Redis Connection After Fix**
```bash
docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  redis-cli -h redis -p 6379 ping

# Expected: PONG
```

**Test 6: Environment Variable Injection**
```bash
# Spawn agent and inspect environment
docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  -e TASK_ID=test-123 \
  -e AGENT_TYPE=backend-developer \
  --entrypoint env \
  cfn-agent:test | grep CFN_REDIS

# Expected: CFN_REDIS_HOST=redis, CFN_REDIS_PORT=6379
```

**Test 7: Full Agent Spawn Integration**
```bash
#!/bin/bash
# Test complete spawning workflow via trigger.dev

curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer ${TRIGGER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.agent.spawn",
    "payload": {
      "agentType": "backend-developer",
      "taskDescription": "Test Redis connectivity"
    }
  }'

# Monitor job execution
docker logs -f trigger-dev-worker

# Expected: Agent spawns, connects to Redis, exits cleanly
```

**Test 8: Redis Coordination Smoke Test**
```bash
#!/bin/bash
# Verify agents can perform Redis operations

# 1. Push test task to Redis
docker exec trigger-dev-redis redis-cli LPUSH cfn:task:queue "test-task-1"

# 2. Spawn agent to claim task
docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  cfn-agent:test

# 3. Verify task was claimed (queue should be empty)
QUEUE_LEN=$(docker exec trigger-dev-redis redis-cli LLEN cfn:task:queue)

if [ "$QUEUE_LEN" -eq 0 ]; then
  echo "✅ Redis coordination working"
else
  echo "❌ Redis coordination failed"
fi
```

#### 3.3 Regression Tests

**Test 9: Existing Services Not Affected**
```bash
# Verify changes don't break existing services
docker-compose ps

# Expected: All services healthy (except worker, which was already unhealthy)
```

**Test 10: Network Isolation Preserved**
```bash
# Verify agents on trigger-cfn-network can't reach external networks
docker run --rm \
  --network trigger-cfn-network \
  alpine:latest \
  ping -c 1 google.com

# Expected: TIMEOUT (network should be isolated)
```

---

## 4. Production Readiness Assessment

### Infrastructure Readiness: CONDITIONAL ⚠️

| Component | Status | Confidence | Gap |
|-----------|--------|------------|-----|
| Redis Service | OPERATIONAL | 0.95 | None |
| Docker Network | OPERATIONAL | 0.98 | None |
| Service Discovery | UNTESTED | 0.60 | No DNS resolution tests |
| Agent Spawning | BROKEN | 0.40 | Network mismatch |
| Redis Coordination | UNTESTED | 0.55 | No task queue tests |
| Environment Injection | UNTESTED | 0.65 | No validation tests |

**Overall Production Readiness**: 0.68 (Below acceptable threshold of 0.85)

### Blockers to Production

1. **Missing Test Suite**: No executable tests to validate fixes
2. **Unverified Fix Impact**: Changes not validated against real containers
3. **No Rollback Testing**: No verification that revert works
4. **Integration Gap**: No end-to-end trigger.dev → agent → Redis flow tested

---

## 5. Recommended Test Implementation Plan

### Phase 1: Create Missing Test Suite (2 hours)

**Deliverable**: `tests/docker/redis-validation-comprehensive.sh`

**Structure**:
```bash
#!/bin/bash
# Phase 1 :: Redis Infrastructure Validation
# Comprehensive test suite for CFN Loop Redis coordination

set -euo pipefail

source "$(git rev-parse --show-toplevel)/tests/test-utils.sh"

# Test 1: Pre-fix baseline (capture current failure)
test_current_network_failure() {
  log_step "GIVEN cfn-network doesn't exist"
  # WHEN spawning agent with cfn-network
  # THEN expect failure
}

# Test 2: Verify correct network exists
test_trigger_network_exists() {
  log_step "GIVEN docker-compose services running"
  # WHEN inspecting trigger-cfn-network
  # THEN expect 7+ containers connected
}

# Test 3-8: Post-fix validation tests (from section 3.2)

# Run all tests
run_all_tests() {
  test_current_network_failure
  test_trigger_network_exists
  # ... (remaining tests)
}

run_all_tests
```

### Phase 2: Pre-Fix Validation (30 minutes)

**Objective**: Capture baseline broken state

**Actions**:
1. Run baseline tests (capture current errors)
2. Document failure modes
3. Create comparison metrics

### Phase 3: Apply Fixes (1 hour)

**Objective**: Implement proposed changes

**Actions**:
1. Update `src/jobs/test-single-agent.ts` (network name, env vars)
2. Update `entrypoint.sh` whitelist
3. Rebuild worker image: `docker-compose build trigger-worker`
4. Restart services: `docker-compose down && docker-compose up -d`

### Phase 4: Post-Fix Validation (1 hour)

**Objective**: Verify fixes work

**Actions**:
1. Run full test suite
2. Compare metrics (baseline vs post-fix)
3. Document improvements

### Phase 5: Integration Testing (1 hour)

**Objective**: Test end-to-end workflow

**Actions**:
1. Trigger test job via API
2. Monitor agent spawning
3. Verify Redis coordination
4. Check logs for errors

### Phase 6: Rollback Testing (30 minutes)

**Objective**: Verify revert capability

**Actions**:
1. Git checkout previous version
2. Rebuild images
3. Verify services still work
4. Re-apply fixes

**Total Estimated Time**: 6 hours

---

## 6. Specific Testing Recommendations

### Immediate Actions (Before Fix Deployment)

**Priority 1 (CRITICAL)**:
1. ✅ Create executable test suite (section 5, Phase 1)
2. ✅ Run baseline tests to capture current failure modes
3. ✅ Verify `entrypoint.sh` whitelist includes `CFN_REDIS_HOST`

**Priority 2 (HIGH)**:
4. ⚠️ Build test agent image with Redis client tools
5. ⚠️ Test DNS resolution on trigger-cfn-network
6. ⚠️ Verify Redis port mapping (6380:6379)

**Priority 3 (MEDIUM)**:
7. 📋 Document expected vs actual container logs
8. 📋 Create monitoring dashboard for agent spawning
9. 📋 Add health check endpoint to agent image

### Enhanced Test Coverage

**Additional Test Scenarios**:

**Test 11: Concurrent Agent Spawning**
```bash
# Test multiple agents spawning simultaneously
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/v1/events \
    -H "Authorization: Bearer ${TRIGGER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"event\": \"test.agent.spawn\", \"payload\": {\"agentType\": \"backend-developer\", \"taskDescription\": \"Test $i\"}}" &
done
wait

# Verify all agents spawned and connected to Redis
```

**Test 12: Network Partition Simulation**
```bash
# Test agent behavior when Redis becomes unavailable
docker network disconnect trigger-cfn-network trigger-dev-redis

# Spawn agent (should fail gracefully)
# Reconnect Redis
docker network connect trigger-cfn-network trigger-dev-redis

# Verify recovery
```

**Test 13: Memory and CPU Limits**
```bash
# Verify resource limits are enforced
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cfn-agent

# Expected: <=2 CPUs, <=4GB RAM
```

---

## 7. Test Quality Assessment

### Current State (Loop 3 Deliverables)

**REDIS_INFRASTRUCTURE_ANALYSIS.md**:
- ✅ Comprehensive documentation (677 lines)
- ✅ Architecture diagrams
- ✅ Multi-context access patterns
- ❌ No executable tests
- ❌ Claimed test results without evidence

**LOOP_3_INVESTIGATION_COMPLETE.md**:
- ✅ Clear summary of findings
- ✅ Working spawn commands
- ✅ Configuration recommendations
- ❌ False test execution claims (8/8 tests passed - no test file exists)
- ❌ No validation of proposed fixes

**CFN_ARCHITECTURE_FIX_PLAN.md**:
- ✅ Detailed root cause analysis
- ✅ Specific code changes with line numbers
- ✅ Testing plan outline
- ⚠️ No execution of testing plan
- ⚠️ No verification of fix effectiveness

### Gap Analysis

| Requirement | Current Status | Gap | Priority |
|-------------|---------------|-----|----------|
| Executable test suite | MISSING | Create tests/docker/redis-validation-comprehensive.sh | CRITICAL |
| Pre-fix baseline | MISSING | Capture current failure logs | HIGH |
| Post-fix validation | MISSING | Run tests after applying fixes | HIGH |
| Integration tests | MISSING | End-to-end trigger.dev workflow | HIGH |
| Regression tests | MISSING | Verify existing services unaffected | MEDIUM |
| Rollback validation | MISSING | Test revert capability | MEDIUM |
| Performance tests | MISSING | Memory/CPU limit enforcement | LOW |

---

## 8. Rollback Strategy Validation

### Current Rollback Plan (From Fix Plan)

**Proposed Rollback Steps**:
1. `git checkout src/jobs/test-single-agent.ts`
2. `git checkout entrypoint.sh`
3. `docker-compose build trigger-worker`
4. `docker-compose down && docker-compose up -d`

**Assessment**: INCOMPLETE ❌

**Missing Elements**:

1. **Version Tagging**: No image tagging strategy
   ```bash
   # Should tag images before deployment
   docker tag trigger-dev-worker-cfn:latest trigger-dev-worker-cfn:v1.0-pre-fix
   ```

2. **Database State**: No consideration for Redis state during rollback
   ```bash
   # Should clear Redis queues during rollback
   docker exec trigger-dev-redis redis-cli FLUSHALL
   ```

3. **Validation After Rollback**: No tests to verify rollback success
   ```bash
   # Should run smoke tests after rollback
   ./tests/docker/redis-validation-comprehensive.sh --rollback-validation
   ```

4. **Monitoring**: No alerts for rollback detection
   ```bash
   # Should log rollback event
   echo "$(date) - Rollback executed" >> /var/log/cfn-deployment.log
   ```

**Enhanced Rollback Procedure**:

```bash
#!/bin/bash
# Enhanced rollback with validation

set -euo pipefail

echo "[1/6] Tagging current state (pre-rollback)..."
docker tag trigger-dev-worker-cfn:latest trigger-dev-worker-cfn:failed-deployment-$(date +%s)

echo "[2/6] Reverting code changes..."
git checkout HEAD~1 src/jobs/test-single-agent.ts
git checkout HEAD~1 entrypoint.sh

echo "[3/6] Rebuilding worker image..."
docker-compose build trigger-worker

echo "[4/6] Clearing Redis state..."
docker exec trigger-dev-redis redis-cli FLUSHALL

echo "[5/6] Restarting services..."
docker-compose down
docker-compose up -d

echo "[6/6] Running smoke tests..."
sleep 10  # Allow services to stabilize
./tests/docker/smoke-test-basic-services.sh

echo "✅ Rollback complete and validated"
```

---

## 9. Production Deployment Checklist

### Pre-Deployment Validation

**Code Review**:
- [ ] Fix 1 (network name) reviewed and approved
- [ ] Fix 2 (env vars) reviewed and approved
- [ ] Fix 3 (entrypoint whitelist) verified in current code
- [ ] No other code changes introduced
- [ ] Git commit tagged with version number

**Testing**:
- [ ] Baseline tests executed and documented
- [ ] Post-fix tests passed (8/8 comprehensive tests)
- [ ] Integration tests passed (trigger.dev → agent → Redis)
- [ ] Regression tests passed (existing services unaffected)
- [ ] Performance tests passed (memory/CPU limits enforced)
- [ ] Rollback tested and validated

**Infrastructure**:
- [ ] Redis service healthy (`docker-compose ps redis`)
- [ ] Docker network exists (`docker network inspect trigger-cfn-network`)
- [ ] Service discovery working (`nslookup redis` from webapp container)
- [ ] Disk space available (>10GB free)
- [ ] Memory available (>50GB free for CFN Loop budget)

**Monitoring**:
- [ ] Log aggregation configured
- [ ] Alert thresholds set for agent failures
- [ ] Dashboard created for agent spawning metrics
- [ ] Rollback runbook documented and accessible

### Deployment Steps

**Phase 1: Backup Current State**
```bash
# 1. Tag current images
docker tag trigger-dev-worker-cfn:latest trigger-dev-worker-cfn:v1.0-pre-redis-fix

# 2. Export database
docker exec trigger-dev-postgres pg_dump -U postgres trigger > backup-$(date +%s).sql

# 3. Commit current state
git add -A
git commit -m "Pre-deployment checkpoint: Redis coordination fix"
git tag v1.0-pre-redis-fix
```

**Phase 2: Apply Fixes**
```bash
# 1. Update code (manual edits based on fix plan)
# 2. Rebuild worker image
docker-compose build trigger-worker

# 3. Restart services
docker-compose down
docker-compose up -d

# 4. Wait for health checks
sleep 30
docker-compose ps  # Verify all healthy
```

**Phase 3: Post-Deployment Validation**
```bash
# 1. Run full test suite
./tests/docker/redis-validation-comprehensive.sh

# 2. Trigger test job
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer ${TRIGGER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"event": "test.agent.spawn", "payload": {"agentType": "backend-developer", "taskDescription": "Post-deployment validation"}}'

# 3. Monitor logs
docker logs -f trigger-dev-worker --tail=100

# 4. Verify Redis coordination
docker exec trigger-dev-redis redis-cli LLEN cfn:task:queue
```

### Post-Deployment Monitoring (First 24 Hours)

**Metrics to Track**:
- Agent spawn success rate (target: >95%)
- Redis connection failures (target: <5%)
- Container exit codes (target: 0 for successful completions)
- Memory usage per agent (target: <4GB)
- Network latency (target: <10ms between containers)

**Alert Thresholds**:
- Agent spawn failure rate >10% → Page on-call engineer
- Redis connection failures >5% → Investigate network issues
- Container OOM kills detected → Review memory limits
- Stuck agents (>30 min execution) → Kill and restart

---

## 10. Confidence Score Breakdown

### Testing Dimensions

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Test Existence** | 0.20 | Claimed test file doesn't exist |
| **Test Coverage** | 0.65 | Fix plan covers main scenarios, but missing edge cases |
| **Test Execution** | 0.40 | No evidence of actual test runs |
| **Fix Validation** | 0.80 | Fixes are logically sound, but unverified |
| **Rollback Strategy** | 0.60 | Basic rollback documented, but incomplete |
| **Integration Testing** | 0.50 | No end-to-end workflow tests |
| **Regression Testing** | 0.70 | Some consideration for existing services |
| **Production Readiness** | 0.68 | Infrastructure ready, but validation incomplete |

**Overall Consensus Score**: 0.72 / 1.0

### Interpretation

**0.72 = CONDITIONAL PROCEED with MANDATORY PRE-FLIGHT**

- **Above 0.85**: PROCEED (production ready)
- **0.70-0.85**: CONDITIONAL PROCEED (requires additional validation)
- **Below 0.70**: ITERATE (significant gaps remain)

**Current State (0.72)**: Proceed with fixes ONLY after completing mandatory pre-flight checklist.

### Confidence Factors Reducing Score

1. **-0.15**: No executable test suite (critical gap)
2. **-0.08**: Unverified fix effectiveness (no post-fix validation)
3. **-0.05**: Incomplete rollback strategy (no validation after revert)

### Path to 0.85+ Confidence

**Required Actions**:
1. Create and execute comprehensive test suite (+0.10)
2. Validate fixes against real containers (+0.05)
3. Enhance rollback procedure with validation (+0.03)

**Timeline**: 6 hours (per section 5 implementation plan)

---

## 11. Final Recommendations

### Immediate Actions (Before Any Code Changes)

**CRITICAL** (Complete before proceeding):
1. Create executable test suite: `tests/docker/redis-validation-comprehensive.sh`
2. Run baseline tests to document current failure mode
3. Verify `CFN_REDIS_HOST` in `entrypoint.sh` whitelist

**HIGH PRIORITY** (Complete before deployment):
4. Apply fixes (network name, env vars)
5. Run post-fix validation tests
6. Execute integration tests (trigger.dev → agent → Redis)
7. Test rollback procedure

**MEDIUM PRIORITY** (Complete within 24 hours post-deployment):
8. Add monitoring dashboard
9. Document deployment runbook
10. Create alert thresholds

### Decision Matrix

**IF baseline tests pass** → INVESTIGATE (infrastructure may already be working)
**IF baseline tests fail** → PROCEED with fixes
**IF post-fix tests pass** → DEPLOY to production
**IF post-fix tests fail** → ITERATE (analyze new failure modes)

### Quality Gates

**Gate 1: Test Creation** (MUST PASS)
- [ ] Test suite exists and is executable
- [ ] At least 8 comprehensive tests implemented
- [ ] Tests follow CFN Loop test standards (GIVEN/WHEN/THEN)

**Gate 2: Baseline Validation** (MUST PASS)
- [ ] Current failure mode documented
- [ ] Error logs captured for comparison
- [ ] Metrics baseline established

**Gate 3: Fix Validation** (MUST PASS)
- [ ] Post-fix tests pass (8/8)
- [ ] Integration test completes successfully
- [ ] No regressions detected in existing services

**Gate 4: Rollback Validation** (MUST PASS)
- [ ] Rollback procedure executes cleanly
- [ ] Services return to baseline state
- [ ] Smoke tests pass after rollback

**ALL GATES MUST PASS BEFORE PRODUCTION DEPLOYMENT**

---

## 12. Sign-Off

**Loop 2 Validation**: CONDITIONAL PROCEED
**Status**: Mandatory pre-flight required
**Consensus Score**: 0.72 / 1.0
**Date**: 2025-11-23

**Key Findings**:
1. ❌ Claimed test suite doesn't exist (critical gap)
2. ✅ Proposed fixes are logically sound
3. ⚠️ No validation of fix effectiveness
4. ⚠️ Incomplete rollback strategy
5. ❌ No integration tests executed

**Recommendation**: Implement comprehensive test suite (6-hour effort) before deploying fixes. Current confidence (0.72) is below production threshold (0.85).

**Mandatory Pre-Flight Checklist**:
- [ ] Create tests/docker/redis-validation-comprehensive.sh
- [ ] Run baseline tests (capture current failure)
- [ ] Verify entrypoint.sh whitelist
- [ ] Apply fixes
- [ ] Run post-fix validation tests
- [ ] Execute integration tests
- [ ] Test rollback procedure
- [ ] Document deployment runbook

**Estimated Time to Production Ready**: 6 hours (test implementation + validation)

---

**Validator**: Loop 2 Testing Specialist
**Validation Duration**: 2 hours
**Test Gap Identified**: CRITICAL
**Confidence Assessment**: Below threshold (0.72 < 0.85)
**Next Action**: Implement mandatory pre-flight checklist (section 11)
