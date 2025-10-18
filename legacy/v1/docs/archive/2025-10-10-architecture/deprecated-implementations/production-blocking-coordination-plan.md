# Production Blocking Coordination - Investigation & Implementation Plan

**Status:** Investigation Complete → Planning Phase
**Target:** Production-ready blocking coordination for real-world CFN Loop scenarios
**Priority:** P0 (Core Infrastructure)

---

## 1. Real-World Requirements Analysis

### 1.1 Current System Integration Points

**Existing Coordination Systems:**
1. **CFN Loop (4-layer coordination):**
   - Loop 0: Epic/Sprint orchestration
   - Loop 1: Phase execution
   - Loop 2: Consensus validation (2-4 validators, ≥0.90 threshold)
   - Loop 3: Implementation swarm (max 10 iterations, ≥0.75 confidence)
   - Loop 4: Product Owner GOAP decision (PROCEED/DEFER/ESCALATE)

2. **Swarm Coordination:**
   - Mesh topology (2-7 agents, peer-to-peer)
   - Hierarchical topology (8+ agents, coordinator→sub-agents)
   - Redis-backed state persistence (24-hour TTL)
   - Agent lifecycle: spawning, active, waiting, complete, failed

3. **Agent State Management (existing):**
   - File: `src/redis/swarm-state-manager.js`
   - Features: State persistence, snapshots, recovery
   - TTL: 24 hours for state, 5 minutes for snapshots
   - Connection pool with retry strategy

### 1.2 Real-World Scenarios Requiring Blocking

**Scenario 1: CFN Loop 2 → Loop 3 Dependency**
```
Loop 3 (Implementation):
  - Coordinators A, B, C spawn 30 coder agents
  - Duration: 5-15 minutes depending on complexity
  - State: Must stay alive for Loop 2 validation

Loop 2 (Validation):
  - Spawns 2-4 validator agents
  - Reviews all Loop 3 outputs
  - Duration: 3-10 minutes
  - Sends retry requests if consensus <0.90

REQUIREMENT: Loop 3 coordinators MUST block until Loop 2 completes
```

**Scenario 2: Multi-Phase Epic Coordination**
```
Phase 1 (Authentication):
  - Implementation coordinator spawns 10 agents
  - Review coordinator validates
  - Duration: 10-20 minutes

Phase 2 (Authorization):
  - Depends on Phase 1 completion signal
  - Cannot start until Phase 1 validated

REQUIREMENT: Phase transitions require blocking coordination
```

**Scenario 3: Swarm Recovery After Interruption**
```
Initial Swarm:
  - Coordinator spawns 50 agents
  - System interruption at agent 30
  - Redis state: 30 completed, 20 pending

Recovery Swarm:
  - New coordinator reads Redis state
  - Resumes from agent 31
  - Duration: Variable (1-60 minutes)

REQUIREMENT: Original coordinator must stay alive OR
             Recovery coordinator must detect dead state
```

### 1.3 Production Failure Scenarios

**Failure Category 1: Network Partitions**
- Redis connection lost mid-blocking
- Coordinator cannot send/receive signals
- Duration: 5 seconds to 5 minutes
- **Impact:** Coordinators block indefinitely OR exit prematurely

**Failure Category 2: Process Crashes**
- Coordinator-C crashes after Loop 3 completes
- Loop 3 coordinators still waiting for signal
- No completion signal ever arrives
- **Impact:** Infinite blocking (30-minute timeout trigger)

**Failure Category 3: Resource Exhaustion**
- System runs out of memory mid-coordination
- OOM killer terminates random processes
- Coordinators may be killed without cleanup
- **Impact:** Orphaned Redis state, zombie agents

**Failure Category 4: Clock Skew**
- Distributed systems across multiple machines
- System clocks not synchronized
- Timestamp-based logic fails
- **Impact:** Premature timeouts OR infinite blocking

**Failure Category 5: Signal Race Conditions**
- Completion signal sent before coordinator enters blocking
- Coordinator never sees the signal
- Duration: Microseconds to seconds
- **Impact:** Infinite blocking until timeout

---

## 2. Gap Analysis

### 2.1 Current Implementation Gaps

**Gap 1: No Signal Acknowledgment**
```bash
# Current (send-only):
redis-cli setex "coordination:signal:coordinator-a:complete" 3600 "true"

# Problem: No confirmation that coordinator received signal
# Impact: Cannot distinguish between:
#   - Signal not sent
#   - Signal sent but not received
#   - Signal received but coordinator crashed
```

**Gap 2: Timeout Not Production-Tested**
```bash
# Specified: 30 minutes (1800s)
# Tested: 140s max (7.8% of specified timeout)
# Unknown: Does timeout actually trigger at 1800s?
# Unknown: What happens if timeout triggers during retry processing?
```

**Gap 3: Heartbeat Persistence Unverified**
```bash
# Code shows heartbeat emission every 5s with 90s TTL
# Test duration: 140s (28 heartbeats expected)
# Validation: Heartbeat keys expired before consensus validation
# Gap: Cannot confirm heartbeat mechanism works in production
```

**Gap 4: Dead Coordinator Detection Not Enforced**
```bash
# Code: Checks if Coordinator-C heartbeat >120s old
# Action: Logs WARNING only
# Gap: No escalation, no exit, no recovery
# Impact: Coordinators block for 30 minutes despite dead coordinator
```

**Gap 5: Network Partition Handling**
```bash
# Current: Redis connection with retry (max 3 attempts)
# Retry delay: 50ms * attempt (max 2000ms)
# Gap: After 3 failures, what happens?
# Gap: Can coordinator re-enter blocking loop after reconnect?
```

**Gap 6: Recovery from Premature Exit**
```bash
# Scenario: Coordinator crashes, restarts, re-enters blocking
# Question: Does it re-subscribe to same signal?
# Question: Can multiple instances block on same signal?
# Gap: No idempotency guarantees
```

### 2.2 Integration Gaps

**Integration Gap 1: CFN Loop State Machine**
```
Current CFN Loop:
  Loop 3 → Loop 2 (how does transition happen?)

Gap: No explicit state machine for loop transitions
Gap: Blocking coordination not integrated with loop state
Gap: Product Owner decision (Loop 4) not aware of blocking status
```

**Integration Gap 2: Swarm State Manager**
```
Existing: src/redis/swarm-state-manager.js
Features: State persistence, snapshots, recovery

Gap: No integration with blocking coordination
Gap: Blocking state not persisted for recovery
Gap: Cannot resume blocking after system restart
```

**Integration Gap 3: Agent Lifecycle Hooks**
```
Existing: pre_task, post_task hooks in agent profiles

Gap: No "waiting" or "blocking" lifecycle hook
Gap: No hook for "signal received" event
Gap: Cannot customize blocking behavior per agent type
```

**Integration Gap 4: Memory Coordination**
```
Existing: Cross-agent memory via memory_key pattern

Gap: Blocking state not stored in memory
Gap: Cannot query "which coordinators are blocking?"
Gap: No shared blocking context across agent swarms
```

---

## 3. Production Requirements

### 3.1 Functional Requirements

**FR-1: Reliable Signal Delivery**
- Coordinators MUST receive completion signals within 5 seconds
- System MUST retry failed signal deliveries
- System MUST confirm signal receipt via ACK

**FR-2: Timeout Enforcement**
- Coordinators MUST timeout after 30 minutes max
- System MUST log timeout events
- System MUST clean up state on timeout

**FR-3: Dead Coordinator Detection**
- System MUST detect dead coordinators within 2 minutes
- System MUST notify blocked coordinators
- System MUST provide recovery path (escalate OR auto-recovery)

**FR-4: Network Partition Resilience**
- Coordinators MUST handle Redis disconnection
- System MUST reconnect within 10 seconds
- System MUST resume blocking after reconnection

**FR-5: State Persistence**
- Blocking state MUST persist to Redis
- System MUST support recovery after crash/restart
- TTL: 24 hours minimum

**FR-6: Observability**
- System MUST expose blocking metrics (duration, iteration count)
- System MUST log all state transitions
- System MUST provide real-time monitoring dashboard

### 3.2 Non-Functional Requirements

**NFR-1: Performance**
- Signal latency: <1 second (p99)
- Heartbeat overhead: <1% CPU
- Redis operations: <10ms per operation

**NFR-2: Scalability**
- Support 100+ concurrent blocking coordinators
- Support 1000+ agents in single swarm
- Redis memory: <100MB per 1000 coordinators

**NFR-3: Reliability**
- Uptime: 99.9%
- Signal delivery success: 99.99%
- State persistence success: 99.999%

**NFR-4: Maintainability**
- Modular design (pluggable signal transports)
- Comprehensive logging
- Self-healing capabilities

---

## 4. Failure Mode & Effects Analysis (FMEA)

| Failure Mode | Likelihood | Impact | Detection | Mitigation | Priority |
|--------------|-----------|--------|-----------|------------|----------|
| **Redis Connection Loss** | Medium | Critical | Health check fails | Auto-reconnect + backoff | P0 |
| **Coordinator Process Crash** | Medium | High | Heartbeat expires | Timeout + orphan cleanup | P0 |
| **Signal Lost (Network)** | Low | Critical | No ACK received | Retry with exponential backoff | P0 |
| **Signal Sent Before Blocking** | Low | Critical | Coordinator never unblocks | Signal persistence (24h TTL) | P0 |
| **Clock Skew** | Low | Medium | Timeout triggers early | Use Redis TIME command | P1 |
| **Memory Exhaustion** | Low | Critical | OOM kills processes | Resource limits + monitoring | P1 |
| **Stale Heartbeat** | Medium | Medium | Heartbeat >2min old | Auto-escalate to timeout | P1 |
| **Retry Queue Overflow** | Low | Medium | Queue length >1000 | Rate limiting + backpressure | P2 |
| **Duplicate Signals** | Low | Low | Multiple SETEX calls | Idempotent signal handling | P2 |
| **Orphaned Blocking State** | Medium | Medium | State TTL expires | Automated cleanup script | P2 |

---

## 5. Comprehensive Test Strategy

### 5.1 Unit Tests (Component Level)

**Test Suite 1: Blocking Loop Logic**
```javascript
// Test: Infinite loop without iteration limit
// Test: Timeout triggers at 1800s
// Test: Signal detection exits loop
// Test: Retry queue processing during blocking
// Test: Heartbeat emission every 5s
```

**Test Suite 2: Signal Mechanism**
```javascript
// Test: Signal delivery via Redis SETEX
// Test: Signal received within 5s
// Test: Signal persistence (24h TTL)
// Test: Signal ACK mechanism
// Test: Duplicate signal handling (idempotency)
```

**Test Suite 3: State Management**
```javascript
// Test: Blocking state persists to Redis
// Test: State recovery after crash
// Test: State transitions (waiting → complete → failed)
// Test: State cleanup on timeout
```

### 5.2 Integration Tests (System Level)

**Test Scenario 1: Happy Path**
```
Duration: 5 minutes
Steps:
  1. Spawn Coordinator-A (blocks)
  2. Spawn Coordinator-B (blocks)
  3. Spawn Coordinator-C (reviews)
  4. C sends completion signal after 3 minutes
  5. A and B exit within 5 seconds
Expected: 100% success rate
```

**Test Scenario 2: Timeout Trigger**
```
Duration: 35 minutes
Steps:
  1. Spawn Coordinator-A (blocks)
  2. Set timeout to 5 minutes (instead of 30)
  3. Never send completion signal
  4. Verify timeout triggers at 5 minutes
  5. Verify state cleaned up
Expected: Timeout triggers correctly
```

**Test Scenario 3: Dead Coordinator**
```
Duration: 10 minutes
Steps:
  1. Spawn Coordinator-A (blocks)
  2. Spawn Coordinator-C (starts heartbeat)
  3. Kill Coordinator-C after 2 minutes
  4. Verify Coordinator-A detects dead C
  5. Verify Coordinator-A escalates OR times out
Expected: Detection within 2 minutes
```

**Test Scenario 4: Network Partition**
```
Duration: 10 minutes
Steps:
  1. Spawn Coordinator-A (blocks)
  2. Use iptables to block Redis traffic
  3. Wait 30 seconds
  4. Restore Redis traffic
  5. Verify Coordinator-A reconnects
  6. Send completion signal
  7. Verify Coordinator-A exits
Expected: Reconnect + resume blocking
```

**Test Scenario 5: Signal Race Condition**
```
Duration: 30 seconds
Steps:
  1. Send completion signal to Redis
  2. Immediately spawn Coordinator-A (enters blocking)
  3. Verify Coordinator-A sees existing signal
  4. Verify Coordinator-A exits immediately
Expected: No infinite blocking
```

### 5.3 Stress Tests (Performance & Scale)

**Stress Test 1: 100 Concurrent Coordinators**
```
Setup: 100 coordinators blocking simultaneously
Signal: Send to all 100 at once
Metrics:
  - Max signal delivery time (p99)
  - Redis memory usage
  - CPU usage
Target: <5s p99, <1GB memory, <50% CPU
```

**Stress Test 2: Long-Duration Blocking**
```
Setup: Coordinator blocks for 60 minutes
Signal: Send after 60 minutes
Metrics:
  - Heartbeat continuity (100% expected)
  - State consistency
  - Memory leaks
Target: No memory leaks, stable state
```

**Stress Test 3: High Retry Load**
```
Setup: 1000 retry requests queued
Processing: Coordinator processes while blocking
Metrics:
  - Queue processing rate
  - Memory usage under load
  - Redis latency
Target: >100 retries/sec, <2GB memory
```

### 5.4 Chaos Engineering Tests

**Chaos Test 1: Random Process Kills**
```
Scenario: Kill random coordinators every 30s
Duration: 10 minutes
Validation:
  - Orphaned states cleaned up
  - System recovers automatically
  - No zombie processes
```

**Chaos Test 2: Redis Restarts**
```
Scenario: Restart Redis every 2 minutes
Duration: 10 minutes
Validation:
  - Coordinators reconnect
  - State persisted before restart
  - No data loss
```

**Chaos Test 3: Clock Skew Simulation**
```
Scenario: Set system clock +/- 5 minutes
Validation:
  - Timeout logic still works
  - Heartbeat detection still works
  - Uses Redis TIME (not local time)
```

---

## 6. Implementation Plan

### 6.1 Phase 1: Core Fixes (P0 - Week 1)

**Task 1.1: Implement Signal ACK Protocol**
```bash
# Coordinator receives signal:
redis-cli setex "coordination:signal:coordinator-a:complete" 3600 "true"

# Coordinator acknowledges:
redis-cli setex "coordination:ack:coordinator-a:complete" 300 '{
  "coordinator": "coordinator-a",
  "timestamp": <time>,
  "iteration": <count>
}'

# Sender verifies ACK:
redis-cli get "coordination:ack:coordinator-a:complete"
```

**Task 1.2: Enforce Dead Coordinator Detection**
```bash
# Current: WARNING only
if [ $C_AGE -gt 120 ]; then
  echo "⚠️ WARNING: Coordinator-C heartbeat is ${C_AGE}s old"
fi

# Fixed: ESCALATE after 3 warnings
if [ $C_AGE -gt 120 ]; then
  WARNINGS=$((WARNINGS + 1))
  if [ $WARNINGS -ge 3 ]; then
    echo "❌ CRITICAL: Coordinator-C dead, escalating to timeout"
    exit 1
  fi
fi
```

**Task 1.3: Add Redis Health Check**
```bash
# Every 10 iterations (50 seconds)
if [ $((ITERATION % 10)) -eq 0 ]; then
  REDIS_STATUS=$(redis-cli --pass "$REDIS_PASS" --no-auth-warning ping 2>&1)
  if [ "$REDIS_STATUS" != "PONG" ]; then
    echo "❌ Redis health check failed, retrying..."
    # Retry logic here
  fi
fi
```

**Task 1.4: Extended Timeout Test**
```bash
# Test timeout at 3 minutes instead of 30
TIMEOUT=180
# Run for 5 minutes without signal
# Verify timeout triggers at 3 minutes
```

**Deliverables:**
- ✅ Signal ACK mechanism implemented
- ✅ Dead coordinator detection enforced
- ✅ Redis health check added
- ✅ 3-minute timeout test passing
- ✅ Documentation updated

**Success Criteria:**
- Consensus score improves from 0.83 to ≥0.90
- All P0 failure modes mitigated
- Extended timeout test passes

### 6.2 Phase 2: Integration (P1 - Week 2)

**Task 2.1: Integrate with Swarm State Manager**
```javascript
// Add blocking state to swarm-state-manager.js
async saveBlockingState(coordinatorId, state) {
  await this.redis.setex(
    `swarm:blocking:${coordinatorId}`,
    this.config.stateTTL,
    JSON.stringify({
      state: 'waiting',
      dependencies: state.dependencies,
      startTime: Date.now(),
      timeout: state.timeout
    })
  );
}
```

**Task 2.2: Add Agent Lifecycle Hooks**
```yaml
# In agent profiles:
lifecycle:
  on_blocking_start: "npx claude-flow@alpha hooks on-blocking"
  on_signal_received: "npx claude-flow@alpha hooks on-signal"
  on_blocking_timeout: "npx claude-flow@alpha hooks on-timeout"
```

**Task 2.3: CFN Loop State Machine Integration**
```javascript
// CFN Loop state transitions
const cfnLoopState = {
  loop3: { status: 'complete', confidence: 0.85 },
  loop2: { status: 'waiting', validators: ['validator-1', 'validator-2'] },
  blocking: {
    coordinators: ['coordinator-a', 'coordinator-b'],
    state: 'waiting_for_validation'
  }
};
```

**Deliverables:**
- ✅ Swarm state manager integration
- ✅ Agent lifecycle hooks
- ✅ CFN Loop state machine
- ✅ Integration tests passing

### 6.3 Phase 3: Production Hardening (P1 - Week 3)

**Task 3.1: Observability Dashboard**
```javascript
// Real-time metrics:
// - Active blocking coordinators
// - Average blocking duration
// - Signal delivery latency
// - Heartbeat status
// - Timeout events
```

**Task 3.2: Auto-Recovery Mechanisms**

**What Recovery Covers:**
1. **Orphaned State Cleanup** - Remove stale coordinator Redis keys
2. **Failed Signal Retry** - Resend signals with exponential backoff
3. **Dead Coordinator Detection** - Escalate to parent after 2 minutes
4. **Replacement Coordinator Spawning** - Parent spawns NEW coordinator (fresh, no old context)

**What Recovery Does NOT Cover:**
- Cannot revive terminated coordinator in-place
- Cannot restore terminated coordinator's context
- Parent must re-initialize work if coordinator dies mid-execution

**Implementation: On-Demand Cleanup Script**

Create `scripts/cleanup-blocking-coordination.sh`:
```bash
#!/bin/bash
# Cleanup orphaned blocking coordination state
# Safe for automated execution via cron/systemd timer

# Find coordinators with stale heartbeats (>10 minutes)
# Delete all associated Redis state:
#   - coordination:heartbeat:*
#   - coordination:signal:*:complete
#   - coordination:ack:*:complete
#   - coordination:retry:*
#   - agent:*:state
# Log all cleanup actions
```

**Scheduling Options:**
1. **Systemd timer** (production): Every 5 minutes
   ```ini
   [Timer]
   OnUnitActiveSec=5min
   ```
2. **Cron job** (simpler): `*/5 * * * * /path/to/scripts/cleanup-blocking-coordination.sh`
3. **Manual** (development): `npm run cleanup:blocking`

**Why On-Demand Script (Not Background Process):**
- CFN Loop sessions are ephemeral (start/stop frequently)
- Cleanup needed even when main service is down
- Standard Unix pattern (cron/systemd timer)
- Simple to implement, test, and debug
- No process management overhead

**Deliverables:**
- ✅ `scripts/cleanup-blocking-coordination.sh` implemented
- ✅ Systemd timer unit files created
- ✅ npm script added: `npm run cleanup:blocking`
- ✅ Cleanup logs to `~/.claude-flow/logs/blocking-cleanup.log`
- ✅ Integration tests verify cleanup works correctly

**Task 3.3: Comprehensive Monitoring**
```javascript
// Prometheus metrics:
blocking_coordinators_total
blocking_duration_seconds
signal_delivery_latency_seconds
heartbeat_failures_total
timeout_events_total
```

**Deliverables:**
- ✅ Monitoring dashboard
- ✅ Auto-recovery scripts
- ✅ Prometheus integration
- ✅ Chaos tests passing

### 6.4 Phase 4: Documentation & Training (P2 - Week 4)

**Task 4.1: Update Documentation**
- Blocking coordination pattern guide
- Failure recovery playbook
- Monitoring runbook
- Integration examples

**Task 4.2: Create Training Materials**
- Video walkthrough of blocking coordination
- Troubleshooting guide
- Best practices document

**Deliverables:**
- ✅ Complete documentation
- ✅ Training materials
- ✅ Knowledge base articles

---

## 7. Risk Mitigation

### 7.1 Technical Risks

**Risk 1: Backward Compatibility**
- **Mitigation:** Feature flag for new blocking mechanism
- **Rollback:** Keep old mechanism available

**Risk 2: Performance Degradation**
- **Mitigation:** Benchmark before/after
- **Threshold:** <5% performance impact allowed

**Risk 3: Redis Single Point of Failure**
- **Mitigation:** Redis Sentinel for HA
- **Future:** Redis Cluster for horizontal scaling

### 7.2 Operational Risks

**Risk 1: Insufficient Testing**
- **Mitigation:** Comprehensive test suite (see section 5)
- **Staging:** 2-week staging deployment before production

**Risk 2: Monitoring Gaps**
- **Mitigation:** Prometheus + Grafana + PagerDuty
- **Runbook:** Documented response procedures

---

## 8. Success Metrics

### 8.1 Quantitative Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Consensus Score | 0.83 | ≥0.90 | Validator assessment |
| Signal Latency (p99) | Unknown | <1s | Prometheus |
| Timeout Accuracy | Unknown | 99% | Long-duration tests |
| Heartbeat Reliability | Unknown | 99.9% | Redis key monitoring |
| Dead Detection Time | Unknown | <2min | Chaos tests |
| Production Uptime | Unknown | 99.9% | Uptime monitoring |

### 8.2 Qualitative Metrics

- ✅ Production validators approve (consensus ≥0.90)
- ✅ Integration with existing CFN Loop
- ✅ Documentation complete and reviewed
- ✅ Training completed for engineering team

---

## 9. Next Steps

### Immediate Actions (This Week)

1. ✅ Review this plan with stakeholders
2. ⏳ Implement Phase 1 tasks (P0 fixes)
3. ⏳ Set up test environment for extended tests
4. ⏳ Create tracking issues for each task

### Short-Term (Next 2 Weeks)

1. Complete Phase 1 and Phase 2
2. Run comprehensive test suite
3. Get consensus validation on fixes
4. Deploy to staging environment

### Long-Term (Next Month)

1. Complete Phase 3 and Phase 4
2. Production deployment with monitoring
3. Gather production metrics
4. Iterate based on real-world usage

---

## 10. Appendices

### Appendix A: Related Documents

- `docs/coordination-patterns/blocking-coordination-pattern.md` - Original pattern design
- `test-results/hello-world/BLOCKING-COORDINATION-TEST-RESULTS.md` - Test results
- `test-results/hello-world/blocking-verification.md` - Timing analysis
- `src/redis/swarm-state-manager.js` - Existing state management

### Appendix B: References

- Redis Pub/Sub: https://redis.io/topics/pubsub
- Redis Sentinel: https://redis.io/topics/sentinel
- CFN Loop methodology: `.claude/agents/cfn-loop/product-owner.md`
- Agent profiles: `.claude/agents/CLAUDE.md`

---

**Plan Status:** ✅ COMPLETE
**Review Required:** YES
**Implementation:** PENDING APPROVAL
**Estimated Effort:** 4 weeks (1 engineer)
**Risk Level:** Medium (well-defined, testable)
