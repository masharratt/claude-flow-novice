# PHASE 07: Help System + Waiting Agent Pool with SDK Pause

**Duration**: Week 7
**Phase Type**: Support System
**Dependencies**: PHASE_06_MESH_COORDINATION (mesh coordination operational)
**Next Phase**: PHASE_08_DEADLOCK_DETECTION

---

## Overview

Build a help request routing system that matches blocked agents with capable helpers. Implement zero-cost waiting agent pool using SDK pause capabilities, enabling agents to wait without token consumption and resume instantly when help requests arrive.

## Success Criteria

### Numerical Thresholds
- [ ] **Help Matcher Performance**: Find suitable helpers in <100ms
  - Measured via: Capability matching algorithm benchmark
  - Target: <100ms (p95) for capability search across 50+ agents
- [ ] **Help Request Routing**: Route to best-match agent within 200ms
  - Measured via: End-to-end help request performance tests
  - Target: <200ms from request to helper assignment
- [ ] **Waiting Agent Pool Cost**: Zero tokens consumed while paused
  - Measured via: Query controller token usage tracking
  - Target: 0 tokens for all WAITING state agents
- [ ] **Helper Resume Latency**: <50ms on help request arrival
  - Measured via: Query controller resume performance tests
  - Target: <50ms (p95) from paused to active state
- [ ] **Checkpoint Recovery**: Restore helper state in <500ms
  - Measured via: Checkpoint recovery benchmark for helpers
  - Target: <500ms (p99) for full helper state restoration
- [ ] **Paused Pool Scalability**: Support 50+ paused agents
  - Measured via: Large-scale paused agent pool tests
  - Target: 50+ agents paused simultaneously with zero cost

### Binary Completion Checklist
- [ ] `src/coordination/v2/help-system/help-request.ts` implemented
- [ ] `src/coordination/v2/help-system/help-matcher.ts` implemented
- [ ] `src/coordination/v2/help-system/help-coordinator.ts` implemented
- [ ] `src/coordination/v2/help-system/waiting-agent-pool.ts` implemented
- [ ] Help request timeout and retry logic operational
- [ ] Integration with state machine (WAITING → HELPING transitions) complete
- [ ] Help request metrics and monitoring working
- [ ] SDK query control for help request lifecycle integrated
- [ ] Paused agent pool (zero token cost while waiting) functional
- [ ] Resume helpers when dependency arrives enabled
- [ ] Checkpoint-based helper state preservation tested
- [ ] Resume from checkpoint when help needed validated

## Developer Assignments

### Developer 1 (Lead)
- `help-request.ts`, `help-matcher.ts`, `help-coordinator.ts`
- SDK query control for help request lifecycle

### Developer 2
- `waiting-agent-pool.ts`, timeout/retry logic
- SDK paused agent pool, resume on dependency arrival

### Developer 3
- State machine integration (WAITING → HELPING)
- Help request metrics, checkpoint-based helper preservation

### SDK Specialist
- Query control for WAITING state pause
- Zero-cost agent pool, event-driven resume, checkpoint helper state

## Phase Completion Criteria

**This phase is complete when**:
1. All 12 binary checklist items verified
2. All 6 numerical thresholds met
3. Help matcher finds helpers in <100ms
4. Waiting agents consume zero tokens
5. Helpers resume in <50ms
6. Checkpoint recovery <500ms
7. 50+ agent paused pool scales correctly

---

**Phase Status**: Not Started
**Estimated Effort**: 40-60 developer hours
**Critical Path**: No (support system, not core coordination)
