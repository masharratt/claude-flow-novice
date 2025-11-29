# Backlog Handoff: Trigger.dev Coordinator Performance Optimization

**Created**: 2025-11-29
**Source**: RuVector Corrective Epic v2 - Loop 2 Performance Validation
**Priority**: HIGH
**Estimated Effort**: 2-3 days

---

## Executive Summary

During Loop 2 validation of the RuVector Corrective Epic, the Performance Validator identified critical performance bottlenecks in the trigger.dev coordinator layer. These issues are **out-of-scope** for the RuVector epic but require dedicated attention to ensure end-to-end SLA compliance.

**Key Finding**: The coordinator defeats parallelism by polling tasks sequentially, introducing O(n) latency overhead that will prevent meeting SLA targets at scale.

---

## Issues Identified

### 1. Sequential Polling Anti-Pattern (CRITICAL)

**Location**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts:366-426`

**Problem**: After triggering parallel tasks, the coordinator polls each implementation one-by-one in a blocking loop:

```typescript
// CURRENT: Sequential polling (O(n) latency)
for (const handle of implementationHandles) {
  const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
  // Blocks until this task completes before checking next
}
```

**Impact**:
- 10 parallel agents → 10x sequential wait time
- 100 agents at 30s each → 50 minutes instead of ~30 seconds
- Negates the benefit of parallel execution

**Solution**: Use `batch.retrieve()` or `Promise.all()` pattern:

```typescript
// RECOMMENDED: Parallel polling
const batchDetails = await batch.retrieve(batchHandle.batchId);
const results = await Promise.all(
  batchDetails.runs.map(runId => runs.poll(runId, { pollIntervalMs: 2000 }))
);
```

**Files to Modify**:
- `src/trigger/cfn-coordinator.ts`
- `src/trigger/stress-test-real-ai.ts`

---

### 2. Missing SLA Enforcement in Coordinator (CRITICAL)

**Location**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts`

**Problem**: The coordinator spawns decomposers and validators but **never calls** `measureSLA()` or `checkCompliance()` from the SLA enforcement module. SLA definitions exist but are never validated during execution.

**Impact**:
- Phase timing violations go undetected
- No early termination on SLA breach
- Compliance reports show no data

**Solution**: Add SLA checkpoints at phase boundaries:

```typescript
import { measureSLA, slaEnforcer } from '../lib/sla-enforcement';

// Wrap decomposition phase
const { result: decompositionResult, slaCheck } = await measureSLA(
  'phase2_decomposition',
  () => runDecompositionSwarm(taskDescription)
);

if (slaCheck.breached) {
  console.warn(`SLA BREACH: Decomposition took ${slaCheck.elapsed}ms (target: ${slaCheck.target}ms)`);
  // Optionally abort or escalate
}
```

**Files to Modify**:
- `src/trigger/cfn-coordinator.ts`
- `src/trigger/cfn-orchestrator.ts`

---

### 3. Timeout/SLA Value Misalignment (HIGH)

**Location**: Multiple files

**Problem**: `pollWithTimeout()` uses 120s (2 min) for individual decomposers, but SLA defines 2500ms target. This 48x discrepancy means actual enforcement would fail immediately.

| Component | Current Timeout | SLA Target | Discrepancy |
|-----------|-----------------|------------|-------------|
| Decomposer poll | 120,000ms | 2,500ms | 48x |
| Validator poll | 120,000ms | 30,000ms | 4x |
| Total loop | 600,000ms | 150,000ms | 4x |

**Solution Options**:
1. **Adjust SLA targets** to realistic values based on actual execution times
2. **Reduce timeouts** to match SLA targets (may cause premature failures)
3. **Implement tiered timeouts** with SLA-aware early warning

**Recommendation**: Option 3 - Implement warning threshold at SLA target, hard timeout at 2x SLA target.

---

### 4. Missing RuVector Query Performance Tracking (MEDIUM)

**Location**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts`

**Problem**: While `benchmarks.test.ts` validates <100ms query latency, the coordinator never measures RAG search performance during `findSimilarDecompositions()` calls.

**Impact**:
- No visibility into production query latency
- Cannot detect RuVector performance degradation
- Missing metrics for capacity planning

**Solution**: Wrap RuVector calls with timing:

```typescript
const queryStart = Date.now();
const similarPatterns = await findSimilarDecompositions(taskDescription);
const queryLatency = Date.now() - queryStart;

if (queryLatency > 100) {
  console.warn(`RuVector query slow: ${queryLatency}ms (target: <100ms)`);
}
```

---

### 5. Stress Test Sequential Polling (HIGH)

**Location**: `docker/trigger-dev/src/trigger/stress-test-real-ai.ts:72-91`

**Problem**: Uses sequential for-loop polling for 100+ agents instead of parallel polling.

```typescript
// CURRENT: Sequential
for (const runId of runIds) {
  const result = await runs.poll(runId, { pollIntervalMs: 2000 });
}
```

**Solution**: Same as Issue #1 - use `Promise.all()` for parallel polling.

---

### 6. Async Validator File I/O (MEDIUM)

**Location**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts:404-411`

**Problem**: TODO comments indicate async validators cannot receive code content, only file paths. This causes validators to perform file I/O instead of in-memory analysis.

```typescript
// TODO: Async validators can't receive full code content
// They only get file paths and must read files themselves
```

**Impact**:
- Additional I/O latency per validator
- Potential file system bottleneck with many validators
- Inconsistent state if files change during validation

**Solution**: Pass code content via Redis or task payload instead of file paths.

---

## Recommended Epic Structure

### Epic: Trigger.dev Coordinator Performance Optimization

**Duration**: 2-3 days
**Priority**: HIGH

#### Sprint 1: Parallel Polling (1 day)

| Task | File | Effort |
|------|------|--------|
| Implement batch.retrieve() pattern | cfn-coordinator.ts | 2h |
| Replace sequential loops with Promise.all() | cfn-coordinator.ts | 2h |
| Update stress test polling | stress-test-real-ai.ts | 1h |
| Add parallel polling tests | tests/coordinator-polling.test.ts | 2h |

#### Sprint 2: SLA Integration (1 day)

| Task | File | Effort |
|------|------|--------|
| Add measureSLA() at phase boundaries | cfn-coordinator.ts | 2h |
| Implement SLA breach handling | cfn-coordinator.ts | 2h |
| Align timeout values with SLA targets | cfn-coordinator.ts | 1h |
| Add SLA integration tests | tests/coordinator-sla.test.ts | 2h |

#### Sprint 3: Observability (0.5 day)

| Task | File | Effort |
|------|------|--------|
| Add RuVector query timing | cfn-coordinator.ts | 1h |
| Implement performance metrics export | cfn-coordinator.ts | 2h |
| Add metrics documentation | COORDINATOR_METRICS.md | 1h |

---

## Acceptance Criteria

1. **Parallel Polling**: 100 agents complete polling in <2 minutes (vs current ~50 minutes)
2. **SLA Enforcement**: All phase boundaries call `checkCompliance()`
3. **Timeout Alignment**: Timeouts set to 2x SLA targets with warning at 1x
4. **RuVector Tracking**: Query latency logged and alerted if >100ms
5. **Test Coverage**: New tests for parallel polling and SLA integration

---

## Dependencies

- RuVector Corrective Epic v2: ✅ COMPLETE
- SLA enforcement module: ✅ Available at `src/lib/sla-enforcement.ts`
- Trigger.dev SDK v4: ✅ batch.retrieve() available

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| batch.retrieve() API changes | HIGH | Pin SDK version, add integration tests |
| SLA targets too aggressive | MEDIUM | Start with warning-only mode, tune based on production data |
| Parallel polling overwhelms Redis | LOW | Implement rate limiting if needed |

---

## References

- Loop 2 Performance Validation Report: `LOOP2_CONSENSUS_FINAL.md`
- SLA Enforcement Module: `src/lib/sla-enforcement.ts`
- Trigger.dev SDK v4 Docs: Batch API, runs.poll()
- RuVector Benchmarks: `PHASE4_BENCHMARK_RESULTS.md`

---

## Contact

**Identified By**: Performance Validator (Loop 2)
**Epic Owner**: TBD
**Technical Lead**: TBD

---

*This handoff document was generated as part of the RuVector Corrective Epic v2 Loop 2 validation process.*
