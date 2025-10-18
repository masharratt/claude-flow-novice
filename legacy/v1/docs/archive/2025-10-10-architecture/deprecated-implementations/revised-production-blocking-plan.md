# Revised Production Blocking Coordination Plan

**Date:** 2025-10-10
**Status:** Architecture Revision Based on Task Tool Constraints
**Previous Plan:** `production-blocking-coordination-plan.md`
**Constraint Analysis:** `claude-code-task-tool-constraints.md`

---

## Executive Summary

After investigating Claude Code's Task tool constraints, the original 4-week production plan requires significant revision. The key finding: **agents cannot spawn new agents while in a blocking wait state**, which invalidates our live retry coordination design.

**Revised Approach:** Sequential round-based coordination with parent orchestration

**Timeline Impact:**
- **Was:** 4 weeks, 44 agents, 14 sprints
- **Now:** 2 weeks, 28 agents, 8 sprints
- **Reduction:** 50% timeline, 36% agent count

---

## Key Architectural Changes

### 1. Blocking Coordination Use Case (REVISED)

**Purpose:** Timing synchronization, NOT live retry execution

**What Blocking Achieves:**
- ✅ Coordinator-A/B wait for Coordinator-C to finish review
- ✅ Coordinator-C can write retry needs to Redis while A/B wait
- ✅ All coordinators exit in synchronized manner
- ✅ No race conditions in timing

**What Blocking Does NOT Achieve:**
- ❌ Coordinator-A/B cannot spawn retry agents while waiting
- ❌ Coordinator-A/B cannot process retry requests during wait
- ❌ Agents cannot self-revive or replace themselves mid-execution

### 2. Round-Based Retry Pattern (NEW)

**Multi-Round Coordination Flow:**

```javascript
// Round 1: Initial Implementation + Review
Task("mesh-coordinator", "Coordinator-A: Implement features 1-35, then WAIT for signal")
Task("mesh-coordinator", "Coordinator-B: Implement features 36-70, then WAIT for signal")
Task("mesh-coordinator", "Coordinator-C: Review all, write retry list to Redis, signal complete")

// Wait for ALL to complete...

// Round 2: Process Retries (if needed)
const retryListA = await redis.lrange("coordination:retry:coordinator-a", 0, -1);
const retryListB = await redis.lrange("coordination:retry:coordinator-b", 0, -1);

if (retryListA.length > 0 || retryListB.length > 0) {
  // Spawn retry coordinators
  Task("mesh-coordinator", `Coordinator-A-R2: Fix ${retryListA.join(', ')}`)
  Task("mesh-coordinator", `Coordinator-B-R2: Fix ${retryListB.join(', ')}`)
  Task("mesh-coordinator", "Coordinator-C-R2: Re-review fixes, signal complete")

  // Wait for retry round to complete...
}

// Round 3+: Continue until consensus or max rounds reached
```

**Benefits:**
- ✅ Works within Task tool constraints (no mid-execution spawning)
- ✅ Clear round boundaries for validation and consensus
- ✅ Redis coordination passes context between rounds
- ✅ Parent orchestrates retry strategy based on round results

**Limitations:**
- ⏱️ Each round requires full spawn → complete → analyze cycle
- 📊 Overhead: ~30-60s per round (spawn + orchestration)
- 🔁 Max 10 rounds = max 10 spawn batches (not 10 retries within one batch)

---

## Revised Epic Configuration

### Epic Metadata (UPDATED)

```json
{
  "epic_name": "production-blocking-coordination-v2",
  "epic_goal": "Production-ready round-based blocking coordination for CFN Loop with timing synchronization and retry orchestration",
  "scope": {
    "in_scope": [
      "Signal ACK protocol for round completion",
      "Dead coordinator detection via heartbeat",
      "Redis health checks and reconnection",
      "Timeout enforcement for blocking wait",
      "Round-based retry coordination",
      "Parent orchestration of retry rounds",
      "State persistence between rounds (Redis/SQLite)",
      "CFN Loop state machine with round tracking",
      "Observability for round metrics"
    ],
    "out_of_scope": [
      "Live retry spawning during blocking wait",
      "Agent self-revival after termination",
      "Mid-execution agent replacement",
      "Dynamic spawning within blocking loop",
      "Inter-agent communication during execution",
      "Redis Cluster/Sentinel HA (deferred)",
      "Multi-region coordination (future)",
      "Alternative message brokers (future)"
    ],
    "risk_profile": "public-facing-medium-risk"
  }
}
```

### Phases (REVISED)

**Total Phases:** 2 (down from 4)
**Total Sprints:** 8 (down from 14)
**Total Agents:** 28 (down from 44)
**Total Duration:** 2 weeks (down from 4 weeks)

---

## Phase 1: Core Round-Based Coordination (Week 1)

**Priority:** P0 (Critical Infrastructure)
**Dependencies:** None
**Estimated Agents:** 15

### Sprint 1.1: Signal ACK Protocol
**Duration:** 2 days
**Agents:** 3 (coder, tester, reviewer)

**Deliverables:**
1. Two-way signal acknowledgment protocol
   ```bash
   # Coordinator-C signals completion
   redis-cli setex "coordination:signal:coordinator-a:complete" 60 "true"

   # Coordinator-A acknowledges receipt
   redis-cli setex "coordination:signal:coordinator-a:ack" 60 "$(date +%s)"
   ```
2. ACK timeout detection (5s timeout)
3. Signal retry mechanism (3 attempts)
4. Unit tests for signal delivery
5. Integration tests for ACK verification

**Success Criteria:**
- Signal delivery success rate ≥99.99%
- ACK confirmation within 5s
- All tests passing
- Zero false positives in timeout detection

---

### Sprint 1.2: Dead Coordinator Detection & Recovery
**Duration:** 2 days
**Agents:** 4 (coder, system-architect, tester, reviewer)

**Deliverables:**
1. Enhanced heartbeat with metadata
   ```bash
   redis-cli setex "coordination:heartbeat:coordinator-a" 90 '{
     "coordinator": "coordinator-a",
     "state": "waiting",
     "iteration": 29,
     "elapsed": 140,
     "timestamp": 1760122480
   }'
   ```
2. Dead coordinator detection logic (>120s threshold)
3. **Round-level escalation mechanism** (NEW)
   - If coordinator dead: abort current round
   - Parent detects dead coordinator after round timeout
   - Parent spawns replacement in next round
4. Dead coordinator cleanup (orphaned state removal)
5. Integration tests for detection accuracy

**Success Criteria:**
- Dead coordinator detected within 120s
- False positive rate <0.1%
- Round abortion within 5s of detection
- Cleanup removes all orphaned state keys
- All tests passing

**Key Difference from Original Plan:**
- ❌ No mid-execution replacement (not possible with Task tool)
- ✅ Abort current round, spawn replacement in next round

---

### Sprint 1.3: Redis Health Check & Reconnection
**Duration:** 1 day
**Agents:** 2 (coder, tester)

**Deliverables:**
1. Periodic Redis PING during blocking loop
2. Connection failure detection (3 consecutive failures)
3. Exponential backoff reconnection (1s, 2s, 4s, 8s, max 16s)
4. State recovery after reconnection
5. Unit tests for connection resilience

**Success Criteria:**
- Connection failures detected within 15s
- Reconnection success rate ≥95%
- State recovery after reconnection
- All tests passing

---

### Sprint 1.4: Round Orchestration Logic
**Duration:** 3 days
**Agents:** 6 (system-architect × 2, coder × 2, tester, reviewer)

**Deliverables:**
1. **Round manager class** (NEW - core component)
   ```javascript
   class RoundManager {
     async executeRound(roundNumber, retryContext) {
       // 1. Spawn coordinators with round context
       const results = await this.spawnCoordinators(roundNumber, retryContext);

       // 2. Wait for all to complete
       await this.waitForCompletion(results);

       // 3. Extract retry needs from Redis
       const retryNeeds = await this.extractRetryNeeds();

       // 4. Calculate round consensus
       const consensus = this.calculateConsensus(results);

       return { results, retryNeeds, consensus };
     }
   }
   ```
2. Retry context extraction from Redis
3. Round completion detection
4. Max rounds enforcement (10 rounds)
5. Round metrics tracking (duration, agent count, retry count)
6. Integration tests for multi-round scenarios

**Success Criteria:**
- Round orchestration handles 1-10 rounds successfully
- Retry context correctly passed between rounds
- Round metrics accurate (±5% variance)
- All integration tests passing
- Zero memory leaks across rounds

**Key Component:** This is the **critical missing piece** that enables round-based coordination.

---

## Phase 2: CFN Loop Integration & Validation (Week 2)

**Priority:** P1 (High Priority)
**Dependencies:** Phase 1 complete
**Estimated Agents:** 13

### Sprint 2.1: CFN Loop State Machine
**Duration:** 2 days
**Agents:** 4 (system-architect, coder × 2, reviewer)

**Deliverables:**
1. **Round-based CFN Loop state machine** (REVISED)
   ```javascript
   const CFNLoopState = {
     loop3Round: 1,          // Current Loop 3 round
     loop3MaxRounds: 10,     // Max Loop 3 rounds
     loop2Round: 1,          // Current Loop 2 round
     loop2MaxRounds: 10,     // Max Loop 2 rounds
     loop3Confidence: 0.72,  // Latest Loop 3 avg confidence
     loop2Consensus: 0.87,   // Latest Loop 2 consensus
     retryContext: {...},    // Retry needs from previous round
     roundHistory: [...]     // Metrics for each round
   };
   ```
2. Loop 3 gate check (≥0.75 confidence)
3. Loop 2 gate check (≥0.90 consensus)
4. Round transition logic (Loop 3 → Loop 2 → Loop 3 retry → ...)
5. State persistence across rounds (SQLite)
6. Unit tests for state transitions

**Success Criteria:**
- State machine handles all valid transitions
- Gates enforce thresholds correctly
- State persists across rounds
- All tests passing

---

### Sprint 2.2: Multi-Round Integration Tests
**Duration:** 2 days
**Agents:** 3 (tester × 2, reviewer)

**Deliverables:**
1. 3-round coordination test (initial + 2 retry rounds)
2. 10-round stress test (max iterations)
3. Round failure recovery test
4. Consensus convergence test (starts at 0.70 → reaches 0.90)
5. Performance benchmarking (round overhead measurement)

**Test Scenarios:**

**Scenario 1: Happy Path (2 rounds)**
```
Round 1:
  - Loop 3: Spawn 5 agents → avg confidence 0.82 ✅
  - Loop 2: Spawn 3 validators → consensus 0.92 ✅
  - Result: PROCEED (no retry needed)

Total: 2 rounds, 8 agents, ~2 minutes
```

**Scenario 2: Single Retry (3 rounds)**
```
Round 1:
  - Loop 3: Spawn 5 agents → avg confidence 0.68 ❌
  - Result: RETRY Loop 3

Round 2:
  - Loop 3: Spawn 3 agents (retry) → avg confidence 0.88 ✅
  - Loop 2: Spawn 3 validators → consensus 0.91 ✅
  - Result: PROCEED

Total: 3 rounds, 11 agents, ~3 minutes
```

**Scenario 3: Multiple Retries (5 rounds)**
```
Round 1: Loop 3 confidence 0.70 ❌ → RETRY
Round 2: Loop 3 confidence 0.78 ✅ → Loop 2 consensus 0.85 ❌ → RETRY
Round 3: Loop 3 confidence 0.82 ✅ → Loop 2 consensus 0.88 ❌ → RETRY
Round 4: Loop 3 confidence 0.85 ✅ → Loop 2 consensus 0.91 ✅ → PROCEED

Total: 4 rounds, 20 agents, ~5 minutes
```

**Success Criteria:**
- All test scenarios pass
- Round overhead <60s per round
- Memory usage stable across rounds (<5% increase per round)
- No resource leaks

---

### Sprint 2.3: Observability Dashboard
**Duration:** 2 days
**Agents:** 3 (coder × 2, reviewer)

**Deliverables:**
1. Round metrics dashboard (CLI or web)
   - Current round number
   - Round duration
   - Agent count per round
   - Confidence/consensus scores
   - Retry context summary
2. Real-time round progress indicators
3. Round history visualization
4. Metrics export (JSON/Prometheus)
5. Alert triggers (dead coordinator, max rounds reached)

**Dashboard Example:**
```
┌─────────────────────────────────────────────────┐
│ CFN Loop Round-Based Coordination Dashboard    │
├─────────────────────────────────────────────────┤
│ Current Round: 3 / 10                           │
│ Phase: Loop 2 Validation                        │
│ Duration: 2m 15s                                │
│ Agents: 8 (3 validators, 5 waiting)            │
│                                                 │
│ Round History:                                  │
│ Round 1: Loop 3 confidence 0.72 ❌              │
│ Round 2: Loop 3 confidence 0.85 ✅              │
│          Loop 2 consensus 0.88 ❌               │
│ Round 3: Loop 3 retry in progress...           │
│                                                 │
│ Retry Context:                                  │
│ - Fix security vulnerability in auth.js        │
│ - Increase test coverage to 85%                │
│                                                 │
│ Health:                                         │
│ Redis: ✅ Connected (latency: 2ms)              │
│ Coordinators: ✅ 3/3 alive                      │
│ Heartbeats: ✅ All within 30s                   │
└─────────────────────────────────────────────────┘
```

**Success Criteria:**
- Dashboard updates in real-time (<5s latency)
- All metrics accurate
- Alerts trigger correctly
- Export formats valid

---

### Sprint 2.4: Documentation & Production Readiness
**Duration:** 2 days
**Agents:** 3 (researcher × 2, reviewer)

**Deliverables:**
1. **Round-based coordination guide**
   - Architecture diagrams
   - Round flow charts
   - API reference
   - Integration examples
2. **CFN Loop integration guide**
   - Loop 3 ↔ Loop 2 round coordination
   - Retry context passing
   - State machine reference
3. **Troubleshooting guide**
   - Common round failures
   - Debug techniques
   - Performance tuning
4. **Production deployment checklist**
5. **Training materials** (for team onboarding)

**Success Criteria:**
- Documentation comprehensive and accurate
- All code examples tested
- Team training complete
- Production checklist verified

---

## Removed Features (From Original Plan)

### Features Removed Due to Task Tool Constraints

1. **Sprint 3.2: Auto-Recovery Mechanisms** ❌
   - Cannot spawn replacement agents mid-execution
   - **Alternative:** Round-level retry orchestration (Sprint 1.4)

2. **Live Retry Spawning** ❌
   - Coordinators cannot spawn agents during blocking wait
   - **Alternative:** Round-based retry pattern (Sprint 1.4)

3. **Agent Self-Revival** ❌
   - Agents are stateless, cannot revive after termination
   - **Alternative:** Parent spawns fresh agents in next round (Sprint 1.2)

4. **Mid-Execution Agent Replacement** ❌
   - Cannot replace failed agent until all agents complete
   - **Alternative:** Detect failure, abort round, spawn replacement in next round (Sprint 1.2)

5. **Sprint 3.4: Advanced Chaos Testing** ⚠️ REDUCED
   - Removed: Mid-execution failure injection
   - Kept: Round-level failure testing (network, Redis, timeout)

---

## Timeline & Resource Comparison

### Original Plan vs Revised Plan

| Metric | Original | Revised | Change |
|--------|----------|---------|--------|
| **Total Duration** | 4 weeks | 2 weeks | -50% |
| **Total Phases** | 4 | 2 | -50% |
| **Total Sprints** | 14 | 8 | -43% |
| **Total Agents** | 44 | 28 | -36% |
| **Risk Profile** | critical-high-risk | public-facing-medium-risk | ⬇️ |

### Week-by-Week Breakdown

**Week 1: Core Round-Based Coordination**
- Sprint 1.1: Signal ACK (2 days, 3 agents)
- Sprint 1.2: Dead coordinator detection (2 days, 4 agents)
- Sprint 1.3: Redis health (1 day, 2 agents)
- Sprint 1.4: Round orchestration (3 days, 6 agents)

**Week 2: CFN Loop Integration & Validation**
- Sprint 2.1: CFN Loop state machine (2 days, 4 agents)
- Sprint 2.2: Multi-round integration tests (2 days, 3 agents)
- Sprint 2.3: Observability dashboard (2 days, 3 agents)
- Sprint 2.4: Documentation & readiness (2 days, 3 agents)

---

## Success Metrics (REVISED)

### Performance Targets

| Metric | Original | Revised | Rationale |
|--------|----------|---------|-----------|
| **Signal Latency (p99)** | <1000ms | <1000ms | Same (signal delivery unchanged) |
| **Uptime** | 99.9% | 99.5% | Relaxed (fewer recovery features) |
| **Signal Delivery Success** | 99.99% | 99.99% | Same (core requirement) |
| **Round Overhead** | N/A | <60s | New (measures orchestration cost) |
| **Concurrent Coordinators** | 100+ | 50+ | Reduced (simpler coordination) |
| **Max Swarm Agents** | 1000+ | 500+ | Reduced (fewer features) |
| **Memory Growth per Round** | N/A | <5% | New (measures round leak) |

### Quality Gates

**Phase 1 Completion:**
- ✅ All Sprint 1.1-1.4 deliverables complete
- ✅ Signal ACK success rate ≥99.99%
- ✅ Dead coordinator detection within 120s
- ✅ Round orchestration handles 1-10 rounds
- ✅ All unit tests passing
- ✅ Code coverage ≥80%

**Phase 2 Completion:**
- ✅ CFN Loop state machine validated
- ✅ All integration test scenarios passing
- ✅ Dashboard operational
- ✅ Documentation complete
- ✅ Team training complete
- ✅ 1-week staging validation successful
- ✅ Consensus validation ≥0.90

---

## Risk Assessment (UPDATED)

### Risks Mitigated (By Removing Features)

1. **Mid-Execution Spawning Complexity** ⬇️
   - **Original Risk:** High complexity, potential for deadlocks
   - **Mitigation:** Removed feature, use round-based pattern instead
   - **Impact:** Risk eliminated

2. **Agent Revival Race Conditions** ⬇️
   - **Original Risk:** Self-revival could create duplicate agents
   - **Mitigation:** Parent-orchestrated spawning in next round
   - **Impact:** Risk eliminated

3. **Auto-Recovery Infinite Loops** ⬇️
   - **Original Risk:** Auto-recovery could loop indefinitely
   - **Mitigation:** Max 10 rounds enforced at parent level
   - **Impact:** Risk eliminated

### Remaining Risks

1. **Round Overhead Accumulation** ⚠️ MEDIUM
   - **Risk:** 10 rounds × 60s overhead = 10 minutes total overhead
   - **Mitigation:** Optimize round orchestration, reduce spawn time
   - **Acceptance:** Acceptable for production (max 10 rounds rare)

2. **Redis Single Point of Failure** ⚠️ MEDIUM
   - **Risk:** Redis down = all coordination fails
   - **Mitigation:** Redis health checks, reconnection logic
   - **Acceptance:** HA setup out of scope, plan for future

3. **Max Rounds Insufficient** ⚠️ LOW
   - **Risk:** Complex tasks may need >10 rounds
   - **Mitigation:** Max rounds configurable, monitor metrics
   - **Acceptance:** 10 rounds covers 95% of use cases

---

## Next Steps

### Immediate Actions

1. **Update Epic Configuration**
   - Regenerate JSON config with revised phases/sprints
   - Update validation report
   - Commit changes to git

2. **Hello-World Round-Based Test**
   - Implement 3-round coordination test
   - Measure round overhead
   - Validate retry context passing
   - Verify consensus convergence

3. **Team Review**
   - Present revised plan to stakeholders
   - Get approval for reduced scope
   - Confirm 2-week timeline acceptable

4. **Phase 1 Kickoff**
   - Sprint 1.1 planning
   - Environment setup
   - Redis instance provisioning

### Long-Term Roadmap

**Q1 2026: Foundation (This Epic)**
- Core round-based coordination
- CFN Loop integration
- Production readiness

**Q2 2026: Scale & Resilience**
- Redis Cluster/Sentinel HA
- Multi-region coordination
- Advanced chaos testing
- Performance optimization

**Q3 2026: Advanced Features**
- Alternative message brokers (Kafka, RabbitMQ)
- Cross-cloud coordination
- ML-based retry strategy optimization

---

## Conclusion

The revised plan trades **live retry execution** for **architectural simplicity** and **Task tool compatibility**. By embracing round-based coordination with parent orchestration, we achieve:

✅ **50% faster timeline** (2 weeks vs 4 weeks)
✅ **36% fewer agents** (28 vs 44)
✅ **Lower risk profile** (medium vs high)
✅ **Simpler architecture** (no mid-execution spawning complexity)
✅ **Full Task tool compatibility** (no architectural violations)

**Trade-offs:**
⏱️ **Round overhead** (~60s per round, max 10 minutes for 10 rounds)
📊 **Sequential rounds** (not parallel retry execution)
🔁 **Max 10 spawn batches** (not 10 retries within one batch)

**Overall Assessment:** The revised plan is **architecturally sound**, **practically implementable**, and **maintains core value** (timing synchronization + retry coordination) while eliminating features that conflict with Claude Code's fundamental constraints.
