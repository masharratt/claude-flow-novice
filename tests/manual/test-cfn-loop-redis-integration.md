# CFN Loop Redis Integration - End-to-End Testing

**Phase 4 Deliverable 5: Comprehensive Testing Documentation**

This document provides testing scenarios for the Redis-coordinated CFN Loop integration across MVP, Standard, and Enterprise modes.

---

## Prerequisites

1. **Redis Server Running:**
   ```bash
   redis-cli ping
   # Expected: PONG
   ```

2. **SQLite Memory System Initialized:**
   ```bash
   node -e "const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs'); const mem = new SQLiteMemorySystem({swarmId: 'test', agentId: 'test'}); mem.initialize().then(() => console.log('✅ SQLite ready'));"
   # Expected: ✅ SQLite ready
   ```

3. **spawn-workers.js Available:**
   ```bash
   which node && test -f src/cli/hybrid-routing/spawn-workers.js && echo "✅ CLI ready"
   # Expected: ✅ CLI ready
   ```

---

## Test Suite Overview

| Test | Mode | Scenario | Expected Outcome |
|------|------|----------|------------------|
| T1 | MVP | Happy path (both gates pass) | PROCEED decision |
| T2 | Standard | Gate pass, consensus fail | DEFER with concerns |
| T3 | Enterprise | Both gates fail | DEFER with retry |
| T4 | MVP | Critical blocker (security) | ESCALATE to main chat |
| T5 | Standard | Timeout in Loop 3 | Gate failure, retry |
| T6 | Enterprise | Compliance failure in Loop 2 | ESCALATE to main chat |
| T7 | MVP | Cost overrun | ESCALATE to main chat |
| T8 | Standard | All iterations exhausted | DEFER decision |

---

## Test 1: MVP Happy Path (Both Gates Pass)

### Objective
Verify that MVP mode successfully coordinates Loop 3 → Loop 2 → Loop 4 when both gates pass.

### Setup
```bash
export PHASE_ID="test-mvp-happy"
export MODE="mvp"

# Clean Redis
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop4:decision"
```

### Test Steps

**Step 1: Spawn Loop 3 Workers**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement simple hello-world endpoint for MVP testing" \
  --agents=coder,tester \
  --topology=sequential \
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=900000
```

**Expected:**
- 2 workers spawn (coder, tester)
- Workers complete implementation
- Gate check: `avgConfidence >= 0.65`
- Redis signal: `LPUSH swarm:cfn:mvp:${PHASE_ID}:loop3:complete`

**Verification:**
```bash
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"
# Expected: 1

redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop3:complete" 0
# Expected: JSON with { loop: 3, gatePassed: true, avgConfidence: >= 0.65 }
```

**Step 2: Loop 2 Waits and Spawns Validators**
```bash
# Monitor BLPOP (should unblock immediately if Loop 3 signaled)
redis-cli --bigkeys | grep "swarm:cfn:mvp:${PHASE_ID}"

# Spawn validators
node src/cli/hybrid-routing/spawn-workers.js \
  "Validate MVP hello-world implementation" \
  --agents=code-quality-validator,security-specialist \
  --topology=sequential \
  --redis-channel="swarm:cfn:mvp:${PHASE_ID}:loop2" \
  --provider=zai \
  --timeout=600000
```

**Expected:**
- BLPOP unblocks with Loop 3 results
- 2 validators spawn (code-quality-validator, security-specialist)
- Consensus check: `avgConsensus >= 0.85`
- Redis signal: `LPUSH swarm:cfn:mvp:${PHASE_ID}:loop2:complete`

**Verification:**
```bash
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop2:complete"
# Expected: 1

redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop2:complete" 0
# Expected: JSON with { loop: 2, consensusPassed: true, avgConsensus: >= 0.85 }
```

**Step 3: Loop 4 Product Owner Decision**
```bash
# Product Owner should BLPOP Loop 2, then make GOAP decision
# (Simulate Product Owner reading from Redis and SQLite)

loop3_data=$(redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop3:complete" 0)
loop2_data=$(redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop2:complete" 0)

echo "Loop 3: $loop3_data"
echo "Loop 2: $loop2_data"
```

**Expected Decision:**
- Gate passed: ✅
- Consensus passed: ✅
- Decision: **PROCEED**
- Redis signal: `LPUSH swarm:cfn:mvp:${PHASE_ID}:loop4:decision`

**Verification:**
```bash
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop4:decision"
# Expected: 1

redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop4:decision" 0
# Expected: JSON with { decision: "PROCEED", reasoning: "Both gates passed..." }
```

**SQLite Verification:**
```bash
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: 'test-mvp-happy', agentId: 'product-owner'});
mem.initialize().then(async () => {
  const loop3 = await mem.memoryAdapter.get('cfn/phase:test-mvp-happy/loop3/results', {agentId: 'product-owner'});
  const loop2 = await mem.memoryAdapter.get('cfn/phase:test-mvp-happy/loop2/consensus', {agentId: 'product-owner'});
  const loop4 = await mem.memoryAdapter.get('cfn/phase:test-mvp-happy/loop4/decision', {agentId: 'product-owner'});
  console.log('Loop 3:', loop3);
  console.log('Loop 2:', loop2);
  console.log('Loop 4:', loop4);
  process.exit(0);
});
"
```

**Expected SQLite:**
- Loop 3: ACL 4, TTL 30 days, gatePassed: true
- Loop 2: ACL 3, TTL 90 days, consensusPassed: true
- Loop 4: ACL 4, TTL 365 days, decision: "PROCEED"

### Success Criteria
- ✅ All Redis channels populated
- ✅ SQLite ACL levels correct (Loop 3: 4, Loop 2: 3, Loop 4: 4)
- ✅ Retention periods correct (30d, 90d, 365d)
- ✅ Decision = PROCEED
- ✅ No errors in logs

---

## Test 2: Standard Mode - Gate Pass, Consensus Fail

### Objective
Verify DEFER decision when Loop 3 passes but Loop 2 consensus fails.

### Setup
```bash
export PHASE_ID="test-standard-consensus-fail"
export MODE="standard"

redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop4:decision"
```

### Test Steps

**Step 1: Spawn Loop 3 Workers (Pass Gate)**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement payment API with authentication" \
  --agents=architect,coder,coder,tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=1800000
```

**Expected:**
- Gate check: `avgConfidence >= 0.75` ✅
- Redis signal: `LPUSH swarm:cfn:standard:${PHASE_ID}:loop3:complete`

**Step 2: Spawn Loop 2 Validators (Fail Consensus)**
```bash
# Manually inject low-confidence validator results to simulate consensus failure
node src/cli/hybrid-routing/spawn-workers.js \
  "Validate payment API - simulate consensus failure" \
  --agents=code-quality-validator,security-specialist,perf-analyzer,interaction-tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop2" \
  --provider=zai \
  --timeout=1200000
```

**Simulated Validator Results:**
```javascript
// Inject into Redis to simulate consensus failure
const validatorResults = [
  { validatorId: 'code-quality-1', confidence: 0.95 },  // Pass
  { validatorId: 'security-1', confidence: 0.88 },      // Pass
  { validatorId: 'perf-1', confidence: 0.70 },          // Fail (security concern)
  { validatorId: 'interaction-1', confidence: 0.85 }    // Pass
];

const avgConsensus = 0.845; // < 0.90 threshold
const consensusPassed = false;

redis-cli lpush "swarm:cfn:standard:${PHASE_ID}:loop2:complete" '{"loop": 2, "consensusPassed": false, "avgConsensus": 0.845}'
```

**Expected Decision:**
- Gate passed: ✅
- Consensus passed: ❌
- Decision: **DEFER**
- Reasoning: "Gate passed but consensus failed - continue with concerns logged"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:standard:${PHASE_ID}:loop4:decision" 0
# Expected: JSON with { decision: "DEFER", reasoning: "Gate passed but consensus failed..." }
```

**SQLite Backlog Check:**
```bash
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: 'test-standard-consensus-fail', agentId: 'product-owner'});
mem.initialize().then(async () => {
  const backlog = await mem.memoryAdapter.get('cfn/phase:test-standard-consensus-fail/backlog', {agentId: 'product-owner'});
  console.log('Backlog:', backlog);
  process.exit(0);
});
"
```

**Expected:**
- Backlog contains concerns from perf-analyzer (low confidence 0.70)
- Retention: 365 days

### Success Criteria
- ✅ Loop 3 gate passed (≥0.75)
- ✅ Loop 2 consensus failed (<0.90)
- ✅ Decision = DEFER
- ✅ Backlog created with validator concerns
- ✅ No escalation to main chat

---

## Test 3: Enterprise Mode - Both Gates Fail

### Objective
Verify DEFER with retry when both Loop 3 gate and Loop 2 consensus fail.

### Setup
```bash
export PHASE_ID="test-enterprise-both-fail"
export MODE="enterprise"

redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop4:decision"
```

### Test Steps

**Step 1: Spawn Loop 3 Workers (Fail Gate)**
```bash
# Simulate gate failure by injecting low-confidence results
redis-cli lpush "swarm:cfn:enterprise:${PHASE_ID}:loop3:complete" '{"loop": 3, "gatePassed": false, "avgConfidence": 0.78, "iteration": 5}'
```

**Expected:**
- Gate check: `0.78 < 0.85` ❌
- Iterations exhausted (5/15)

**Step 2: Spawn Loop 2 Validators (Fail Consensus)**
```bash
# Simulate consensus failure
redis-cli lpush "swarm:cfn:enterprise:${PHASE_ID}:loop2:complete" '{"loop": 2, "consensusPassed": false, "avgConsensus": 0.88}'
```

**Expected:**
- Consensus check: `0.88 < 0.95` ❌

**Expected Decision:**
- Gate passed: ❌
- Consensus passed: ❌
- Decision: **DEFER**
- Reasoning: "Both loops failed - retry with combined feedback"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:enterprise:${PHASE_ID}:loop4:decision" 0
# Expected: { decision: "DEFER", reasoning: "Both loops failed - retry with combined feedback" }
```

### Success Criteria
- ✅ Loop 3 gate failed (<0.85)
- ✅ Loop 2 consensus failed (<0.95)
- ✅ Decision = DEFER
- ✅ Retry recommendations in decision
- ✅ No escalation (iterations not exhausted: 5/15)

---

## Test 4: MVP Mode - Critical Blocker (Security Vulnerability)

### Objective
Verify ESCALATE decision when critical security blocker detected.

### Setup
```bash
export PHASE_ID="test-mvp-security-escalate"
export MODE="mvp"

redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop4:decision"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:escalate"
```

### Test Steps

**Step 1: Simulate Loop 3 with Security Finding**
```bash
redis-cli lpush "swarm:cfn:mvp:${PHASE_ID}:loop3:complete" '{
  "loop": 3,
  "gatePassed": true,
  "avgConfidence": 0.75,
  "workers": [
    { "workerId": "coder-1", "confidence": 0.80 },
    { "workerId": "tester-1", "confidence": 0.70 }
  ],
  "securityFindings": [
    { "severity": "critical", "cvss": 9.1, "description": "SQL injection vulnerability" }
  ]
}'
```

**Step 2: Simulate Loop 2 Consensus**
```bash
redis-cli lpush "swarm:cfn:mvp:${PHASE_ID}:loop2:complete" '{
  "loop": 2,
  "consensusPassed": true,
  "avgConsensus": 0.90,
  "validators": [
    { "validatorId": "code-quality-1", "confidence": 0.88 },
    { "validatorId": "security-1", "confidence": 0.92, "blockers": [{"type": "security-critical", "cvss": 9.1}] }
  ]
}'
```

**Expected Decision:**
- Gate passed: ✅
- Consensus passed: ✅
- Critical blocker: ✅ (CVSS 9.1 ≥ 7.0)
- Decision: **ESCALATE**
- Reasoning: "Critical blockers detected - human decision required"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop4:decision" 0
# Expected: { decision: "ESCALATE", reasoning: "Critical blockers detected..." }

redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:escalate" 0
# Expected: JSON with escalation details and CVSS score
```

### Success Criteria
- ✅ Decision = ESCALATE
- ✅ Escalation channel populated
- ✅ Main chat receives escalation signal
- ✅ Critical blocker details included (CVSS 9.1)

---

## Test 5: Standard Mode - Loop 3 Timeout

### Objective
Verify gate failure when Loop 3 workers timeout.

### Setup
```bash
export PHASE_ID="test-standard-timeout"
export MODE="standard"

redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop3:complete"
```

### Test Steps

**Step 1: Spawn Workers with Short Timeout**
```bash
# Set timeout to 1 second to force timeout
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement complex distributed system (will timeout)" \
  --agents=architect,coder,coder,tester \
  --topology=collaborative \
  --redis-channel="swarm:cfn:standard:${PHASE_ID}:loop3" \
  --provider=zai \
  --timeout=1000
```

**Expected:**
- Workers timeout after 1 second
- No results produced
- Gate check: `avgConfidence = 0` (no data)
- Gate failed: ❌

**Verification:**
```bash
redis-cli llen "swarm:cfn:standard:${PHASE_ID}:loop3:complete"
# Expected: 0 (timeout prevents signal)
```

### Success Criteria
- ✅ Timeout triggered
- ✅ No Redis signal sent
- ✅ Loop 2 BLPOP still waiting (no unblock)
- ✅ Error logged with timeout reason

---

## Test 6: Enterprise Mode - Compliance Failure

### Objective
Verify ESCALATE when compliance validator fails.

### Setup
```bash
export PHASE_ID="test-enterprise-compliance-fail"
export MODE="enterprise"

redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:loop4:decision"
redis-cli del "swarm:cfn:enterprise:${PHASE_ID}:escalate"
```

### Test Steps

**Step 1: Simulate Loop 3 Success**
```bash
redis-cli lpush "swarm:cfn:enterprise:${PHASE_ID}:loop3:complete" '{
  "loop": 3,
  "gatePassed": true,
  "avgConfidence": 0.90
}'
```

**Step 2: Simulate Loop 2 with Compliance Failure**
```bash
redis-cli lpush "swarm:cfn:enterprise:${PHASE_ID}:loop2:complete" '{
  "loop": 2,
  "consensusPassed": false,
  "avgConsensus": 0.88,
  "validators": [
    { "validatorId": "code-quality-1", "confidence": 0.95 },
    { "validatorId": "security-1", "confidence": 0.92 },
    { "validatorId": "perf-1", "confidence": 0.90 },
    { "validatorId": "interaction-1", "confidence": 0.88 },
    { "validatorId": "compliance-1", "confidence": 0.75, "blockers": [{"type": "compliance-failure", "regulation": "HIPAA", "violation": "PHI not encrypted"}] }
  ]
}'
```

**Expected Decision:**
- Gate passed: ✅
- Consensus passed: ❌ (0.88 < 0.95)
- Critical blocker: ✅ (compliance failure)
- Decision: **ESCALATE**
- Reasoning: "Critical blockers detected - human decision required"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:enterprise:${PHASE_ID}:loop4:decision" 0
# Expected: { decision: "ESCALATE", reasoning: "Critical blockers detected - compliance failure" }

redis-cli lindex "swarm:cfn:enterprise:${PHASE_ID}:escalate" 0
# Expected: JSON with HIPAA violation details
```

### Success Criteria
- ✅ Decision = ESCALATE
- ✅ Compliance violation details in escalation
- ✅ Regulation type (HIPAA) included
- ✅ Main chat receives escalation

---

## Test 7: MVP Mode - Cost Overrun

### Objective
Verify ESCALATE when cost exceeds target by >20%.

### Setup
```bash
export PHASE_ID="test-mvp-cost-overrun"
export MODE="mvp"

redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:loop4:decision"
redis-cli del "swarm:cfn:mvp:${PHASE_ID}:escalate"
```

### Test Steps

**Step 1: Simulate Loop 3 with Cost Overrun**
```bash
redis-cli lpush "swarm:cfn:mvp:${PHASE_ID}:loop3:complete" '{
  "loop": 3,
  "gatePassed": true,
  "avgConfidence": 0.75,
  "costActual": 2.00,
  "costTarget": 1.50
}'
```

**Cost Analysis:**
- Target: $1.50 (MVP limit)
- Actual: $2.00
- Overrun: 33% (>120% threshold)

**Expected Decision:**
- Gate passed: ✅
- Cost overrun: ✅ (33% > 20%)
- Decision: **ESCALATE**
- Reasoning: "Budget overruns detected - exceeds cost limit by 33%"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop4:decision" 0
# Expected: { decision: "ESCALATE", reasoning: "Budget overruns..." }
```

### Success Criteria
- ✅ Decision = ESCALATE
- ✅ Cost overrun percentage calculated correctly
- ✅ Cost target and actual included in decision
- ✅ Main chat receives budget alert

---

## Test 8: Standard Mode - All Iterations Exhausted

### Objective
Verify DEFER decision when all iterations exhausted without passing gate.

### Setup
```bash
export PHASE_ID="test-standard-iterations-exhausted"
export MODE="standard"

redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop3:complete"
redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop2:complete"
redis-cli del "swarm:cfn:standard:${PHASE_ID}:loop4:decision"
```

### Test Steps

**Step 1: Simulate 10 Failed Iterations**
```bash
redis-cli lpush "swarm:cfn:standard:${PHASE_ID}:loop3:complete" '{
  "loop": 3,
  "gatePassed": false,
  "avgConfidence": 0.72,
  "iteration": 10,
  "maxIterations": 10
}'
```

**Expected:**
- Gate: 0.72 < 0.75 ❌
- Iterations: 10/10 (exhausted)
- Decision: **DEFER**
- Reasoning: "Gate failed after 10 iterations - manual intervention required"

**Verification:**
```bash
redis-cli lindex "swarm:cfn:standard:${PHASE_ID}:loop4:decision" 0
# Expected: { decision: "DEFER", reasoning: "Gate failed after 10 iterations..." }
```

### Success Criteria
- ✅ Decision = DEFER (not ESCALATE, since no critical blocker)
- ✅ Iteration count included in decision
- ✅ Retry recommendations provided
- ✅ Main chat receives DEFER with manual intervention flag

---

## Performance Benchmarks

### Target Latencies

| Loop | MVP | Standard | Enterprise |
|------|-----|----------|------------|
| Loop 3 | <15 min | <30 min | <60 min |
| Loop 2 | <10 min | <20 min | <40 min |
| Loop 4 | <30 sec | <30 sec | <30 sec |
| **Total** | **<25 min** | **<50 min** | **<100 min** |

### Redis Performance

```bash
# Benchmark LPUSH/BLPOP
redis-benchmark -t lpush,blpop -n 10000 -q

# Expected:
# LPUSH: >50,000 ops/sec
# BLPOP: >30,000 ops/sec
```

### SQLite Performance

```bash
# Benchmark write operations
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: 'perf-test', agentId: 'test'});
mem.initialize().then(async () => {
  const start = Date.now();
  for (let i = 0; i < 100; i++) {
    await mem.memoryAdapter.set(\`key-\${i}\`, {data: i}, {agentId: 'test', aclLevel: 4});
  }
  const elapsed = Date.now() - start;
  console.log(\`100 writes in \${elapsed}ms (\${(elapsed/100).toFixed(2)}ms/write)\`);
  process.exit(0);
});
"

# Expected: <60ms per write
```

---

## Monitoring Commands

### Check Redis Channel Status
```bash
# List all CFN Loop channels
redis-cli keys "swarm:cfn:*"

# Get channel length (number of messages)
redis-cli llen "swarm:cfn:mvp:${PHASE_ID}:loop3:complete"

# Peek at latest message (without removing)
redis-cli lindex "swarm:cfn:mvp:${PHASE_ID}:loop3:complete" 0
```

### Check SQLite Data
```bash
# Query Loop 3 results
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: '${PHASE_ID}', agentId: 'monitor'});
mem.initialize().then(async () => {
  const data = await mem.memoryAdapter.get('cfn/phase:${PHASE_ID}/loop3/results', {agentId: 'monitor'});
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
});
"
```

### Check Active Workers
```bash
# List running spawn-workers.js processes
ps aux | grep spawn-workers.js

# Monitor worker logs
tail -f logs/spawn-workers-*.log
```

---

## Cleanup

### After Each Test
```bash
# Clean Redis channels
redis-cli keys "swarm:cfn:*:${PHASE_ID}:*" | xargs redis-cli del

# Clean SQLite (optional - data auto-expires via TTL)
rm -f data/swarm-memory-${PHASE_ID}.db
```

### Complete Reset
```bash
# Flush all Redis data (DANGER: only use in test environment)
redis-cli flushall

# Remove all SQLite databases
rm -f data/swarm-memory-*.db

# Kill all workers
pkill -f spawn-workers.js
```

---

## Troubleshooting Guide

### Issue: BLPOP Timeout
**Symptom:** Loop 2 waits forever for Loop 3 signal

**Debug:**
```bash
# Check if Loop 3 completed
redis-cli llen "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete"

# Check worker processes
ps aux | grep spawn-workers.js

# Check worker logs for errors
tail -f logs/spawn-workers-*.log
```

**Fix:**
- If Loop 3 didn't signal: Re-run gate check manually
- If workers hung: Kill and respawn
- If timeout too short: Increase timeout in coordinator

---

### Issue: Decision Not Matching Expected
**Symptom:** Product Owner makes wrong GOAP decision

**Debug:**
```bash
# Read Loop 3 and Loop 2 results
redis-cli lindex "swarm:cfn:${MODE}:${PHASE_ID}:loop3:complete" 0
redis-cli lindex "swarm:cfn:${MODE}:${PHASE_ID}:loop2:complete" 0

# Check for critical blockers
redis-cli lindex "swarm:cfn:${MODE}:${PHASE_ID}:loop2:complete" 0 | jq '.validators[] | select(.blockers != null)'
```

**Fix:**
- Verify gate/consensus thresholds match mode expectations
- Check for hidden critical blockers (security, cost, compliance)
- Review GOAP decision matrix in product-owner.md

---

### Issue: SQLite ACL Access Denied
**Symptom:** Agent cannot read Loop 2 consensus (ACL 3)

**Debug:**
```bash
node -e "
const {SQLiteMemorySystem} = require('./src/sqlite/SwarmMemoryManager.cjs');
const mem = new SQLiteMemorySystem({swarmId: '${PHASE_ID}', agentId: 'product-owner'});
mem.initialize().then(async () => {
  try {
    const data = await mem.memoryAdapter.get('cfn/phase:${PHASE_ID}/loop2/consensus', {agentId: 'product-owner'});
    console.log('✅ Access granted:', data);
  } catch (err) {
    console.error('❌ Access denied:', err.message);
  }
  process.exit(0);
});
"
```

**Fix:**
- Verify agentId matches allowed readers for ACL level
- Check ACL hierarchy: Level 3 (Swarm) readable by validators + Product Owner
- Ensure data was written with correct ACL level

---

## Success Metrics

### Phase 4 Acceptance Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Redis coordination working | 100% | ⏳ Test |
| SQLite persistence working | 100% | ⏳ Test |
| MVP mode gate threshold | ≥0.65 | ⏳ Test |
| Standard mode gate threshold | ≥0.75 | ⏳ Test |
| Enterprise mode gate threshold | ≥0.85 | ⏳ Test |
| MVP consensus threshold | ≥0.85 | ⏳ Test |
| Standard consensus threshold | ≥0.90 | ⏳ Test |
| Enterprise consensus threshold | ≥0.95 | ⏳ Test |
| PROCEED decisions working | 100% | ⏳ Test |
| DEFER decisions working | 100% | ⏳ Test |
| ESCALATE decisions working | 100% | ⏳ Test |
| ACL levels correct | 100% | ⏳ Test |
| Retention periods correct | 100% | ⏳ Test |
| Cost tracking working | 100% | ⏳ Test |
| Compliance audit working | 100% (Enterprise) | ⏳ Test |

---

## Next Steps

1. **Execute Tests T1-T8** in order
2. **Record Results** in test log (create `tests/manual/test-cfn-loop-results.log`)
3. **Fix Failures** and re-test
4. **Update Documentation** based on findings
5. **Mark Phase 4 Complete** when all tests pass

---

## References

- **Mode Patterns:** `.claude/cfn-mode-patterns.md`
- **CFN Loop Rules:** `.claude/cfn-loop-rules.md`
- **Implementation Plan:** `planning/orchestration/PHASE-4-IMPLEMENTATION-PLAN.md`
- **Coordinators:** `.claude/agents/cfn-loop/cfn-coordinator-{mvp,standard,enterprise}.md`
- **Product Owner:** `.claude/agents/cfn-loop/product-owner.md`
