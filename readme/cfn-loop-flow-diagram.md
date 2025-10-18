# CFN Loop Flow Diagram - Complete Implementation

## Complete CFN Loop Flow (All 4 Loops)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CFN LOOP SYSTEM                              │
│                  Complete Flow with Loop 4 ✅                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 0: Epic/Sprint Orchestration                                   │
│                                                                       │
│ ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐          │
│ │Sprint 1 │───▶│Sprint 2 │───▶│Sprint 3 │───▶│Sprint N │          │
│ └─────────┘    └─────────┘    └─────────┘    └─────────┘          │
│                                                                       │
│ • No iteration limit                                                 │
│ • Multi-phase coordination                                           │
│ • Auto-transition between sprints                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 1: Phase Execution                                             │
│                                                                       │
│ ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐              │
│ │Phase 1 │───▶│Phase 2 │───▶│Phase 3 │───▶│Phase N │              │
│ └────────┘    └────────┘    └────────┘    └────────┘              │
│                                                                       │
│ • No iteration limit                                                 │
│ • Sequential phases within sprint                                    │
│ • Each phase runs Loop 2 wrapper                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 2: Phase-Level Iterations (Max 10)                             │
│                                                                       │
│ ┌──────────────────────────────────────────────────────┐            │
│ │  Iteration 1  │  Iteration 2  │  ...  │  Iteration N │            │
│ │       │             │                        │        │            │
│ │       ▼             ▼                        ▼        │            │
│ │   Loop 3        Loop 3                   Loop 3      │            │
│ └──────────────────────────────────────────────────────┘            │
│                                                                       │
│ • Wraps Loop 3 execution                                             │
│ • Retry on consensus failure                                         │
│ • Inject feedback for improvements                                   │
│ • Escalate if max iterations reached                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 3: Primary Swarm Implementation (Max 10/subtask)               │
│                                                                       │
│ ┌───────────────────────────────────────────────────┐               │
│ │  Agents:                                          │               │
│ │  ┌────────┐  ┌────────┐  ┌────────┐             │               │
│ │  │Coder-1 │  │Coder-2 │  │Coder-3 │  ...        │               │
│ │  └───┬────┘  └───┬────┘  └───┬────┘             │               │
│ │      │           │           │                    │               │
│ │      ▼           ▼           ▼                    │               │
│ │  Parallel Execution with Confidence Scores        │               │
│ └───────────────────────────────────────────────────┘               │
│                           │                                          │
│                           ▼                                          │
│                  Confidence Gate                                     │
│                  Threshold: ≥0.75                                    │
│                           │                                          │
│        ┌──────────────────┴──────────────────┐                      │
│        │                                      │                      │
│    ❌ FAIL                                ✅ PASS                    │
│   (Retry)                            (Proceed to Loop 2)             │
└────────────────────────────┬────────────────────────────────────────┘
                             │ (Confidence ≥0.75)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 2: Consensus Validation                                        │
│                                                                       │
│ ┌───────────────────────────────────────────────────┐               │
│ │  Validators (Byzantine Consensus):                │               │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │               │
│ │  │Reviewer  │  │Security  │  │ Tester   │       │               │
│ │  └────┬─────┘  └────┬─────┘  └────┬─────┘       │               │
│ │       │             │              │              │               │
│ │       ▼             ▼              ▼              │               │
│ │  Byzantine Consensus Algorithm (PBFT)            │               │
│ │  • 4 validators                                   │               │
│ │  • Quorum: Math.ceil(4 * 2/3) = 3                │               │
│ │  • Malicious agent detection                      │               │
│ │  • Signature verification                         │               │
│ └───────────────────────────────────────────────────┘               │
│                           │                                          │
│                           ▼                                          │
│                  Consensus Score                                     │
│                  Threshold: ≥0.90                                    │
│                           │                                          │
│        ┌──────────────────┴──────────────────┐                      │
│        │                                      │                      │
│    ❌ FAIL                                ✅ PASS                    │
│ (Inject feedback,                    (Proceed to Loop 4)             │
│  retry Loop 3)                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ (Consensus ≥0.90)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LOOP 4: Product Owner Decision Gate ✅ NEW                          │
│                                                                       │
│ ┌───────────────────────────────────────────────────┐               │
│ │  Product Owner Agent (GOAP Authority)             │               │
│ │                                                    │               │
│ │  Input:                                            │               │
│ │  • Loop 2 consensus results                        │               │
│ │  • Loop 3 implementation summary                   │               │
│ │  • Validator recommendations                       │               │
│ │                                                    │               │
│ │  Decision Criteria:                                │               │
│ │  • PROCEED: Consensus ≥0.90, criteria met         │               │
│ │  • LOOP: Consensus <0.90, fixable issues          │               │
│ │  • DEFER: Out-of-scope, add to backlog            │               │
│ │  • ESCALATE: Ambiguous, human review required     │               │
│ └───────────────────────────────────────────────────┘               │
│                           │                                          │
│                           ▼                                          │
│                  Autonomous Decision                                 │
│                           │                                          │
│    ┌────────┬──────────┬──────────┬──────────┐                      │
│    │        │          │          │          │                      │
│  PROCEED   LOOP      DEFER    ESCALATE                             │
│ (Advance) (Retry)  (Backlog)  (Human)                              │
│                                                                       │
│ • Backlog stored in SwarmMemory                                      │
│ • namespace: 'backlog'                                               │
│ • key: backlog/{phaseId}/{timestamp}                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
    ┌──────┬──────────┬──────────┬──────────┐
    │      │          │          │          │
    ▼      ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Next   │ │ Retry  │ │Backlog │ │ Human  │
│ Phase  │ │Loop 3  │ │Created │ │ Review │
└────────┘ └────────┘ └────────┘ └────────┘
```

## Decision Flow Details

### Loop 4 Product Owner Decision Logic

```
┌────────────────────────────────────┐
│ Product Owner receives:            │
│ • Consensus score                  │
│ • Validator feedback               │
│ • Implementation confidence        │
│ • Iteration count                  │
└────────────┬───────────────────────┘
             │
             ▼
      ┌─────────────┐
      │GOAP Analysis│
      │ (A* Search) │
      └──────┬──────┘
             │
    ┌────────┴────────┐
    │  Decision Tree  │
    └────────┬────────┘
             │
    ┌────────┴────────────────────────┐
    │                                  │
    ▼                                  ▼
Consensus ≥ 0.90?               Consensus < 0.90?
    │                                  │
    ├─ Yes ─┐                    ┌────┴────┐
    │       │                    │         │
    │       ▼                    ▼         ▼
    │  All criteria         Fixable?   Critical?
    │  met?                     │         │
    │    │                   ┌──┴──┐     │
    │    ▼                   │     │     │
    │  ┌──┴──┐              Yes   No     │
    │  │     │               │     │     │
    │  Yes   No              ▼     ▼     ▼
    │  │     │             LOOP  DEFER ESCALATE
    │  │     ▼            (Retry)(Backlog)(Human)
    │  │  Out-of-scope?
    │  │     │
    │  │  ┌──┴──┐
    │  │  Yes   No
    │  │  │     │
    │  ▼  ▼     ▼
    │ DEFER   ESCALATE
    ▼
 PROCEED
(Advance)
```

## Memory Flow

```
Loop 3 Agents
    │
    ├──▶ Agent Confidence Scores
    │    • Stored in memory
    │    • Used for gate validation
    │
    ▼
Loop 2 Validators
    │
    ├──▶ Consensus Feedback
    │    • Stored: cfn-loop/{phaseId}/validator-feedback
    │    • Used for retry iterations
    │
    ▼
Loop 4 Product Owner
    │
    ├──▶ Decision (PROCEED/LOOP/DEFER/ESCALATE)
    │    • Stored in PhaseResult
    │    • Includes iteration count, max iterations
    │
    └──▶ Backlog Items (if DEFER)
         • Stored: backlog/{phaseId}/{timestamp}
         • Namespace: 'backlog'
         • Metadata: { type: 'deferred-work', priority, reason }
```

## Iteration Limits

| Loop | Max Iterations | Scope | Escalation |
|------|----------------|-------|------------|
| Loop 0 | Unlimited | Epic/Sprint | Never |
| Loop 1 | Unlimited | Phase | Never |
| Loop 2 | 10 | Phase | Retry prompt with extension option |
| Loop 3 | 10 | Subtask | Return to Loop 2 |

## Confidence/Consensus Thresholds

| Gate | Threshold | Type | Purpose |
|------|-----------|------|---------|
| Loop 3 Gate | ≥0.75 | Individual | Each agent must meet threshold |
| Loop 2 Consensus | ≥0.90 | Aggregate | Validator team agreement |
| Loop 4 Decision | N/A | Autonomous | GOAP decision authority |

## Success Paths

### Full Success Path
```
Loop 3 (≥0.75) → Loop 2 (≥0.90) → Loop 4 (PROCEED) → Next Phase
```

### Retry Implementation Path
```
Loop 3 (≥0.75) → Loop 2 (<0.90) → Loop 4 (LOOP) → Retry Loop 3 (max iterations check)
```

### Deferred Work Path
```
Loop 3 (≥0.75) → Loop 2 (≥0.90, minor issues) → Loop 4 (DEFER) → Backlog + Next Phase
```

### Escalation Paths
```
1. Loop 3 (<0.75, 10 iterations) → Escalate
2. Loop 4 (LOOP, max iterations reached) → Escalate
3. Loop 4 (ESCALATE decision) → Human Review
```

## Complete Implementation Status

| Component | Status | Details |
|-----------|--------|---------|
| Loop 0 | ✅ Complete | Epic/Sprint orchestration |
| Loop 1 | ✅ Complete | Phase execution |
| Loop 2 | ✅ Complete | Consensus validation with Byzantine |
| Loop 3 | ✅ Complete | Primary swarm with confidence gate |
| **Loop 4** | **✅ NEW** | **Product Owner decision gate** |
| Feedback Injection | ✅ Complete | Retry mechanism |
| Circuit Breaker | ✅ Complete | Timeout protection |
| Memory Integration | ✅ Complete | SwarmMemory storage |
| Byzantine Consensus | ✅ Complete | PBFT validation |

## Files Implementing CFN Loop

1. `/src/cfn-loop/cfn-loop-orchestrator.ts` - Main orchestrator (Loop 2/3/4)
2. `/src/cfn-loop/types.ts` - Type definitions
3. `/src/cfn-loop/byzantine-consensus-adapter.ts` - Loop 2 Byzantine
4. `/src/cfn-loop/feedback-injection-system.ts` - Retry feedback
5. `/src/cfn-loop/circuit-breaker.ts` - Timeout protection
6. `/src/coordination/confidence-score-system.ts` - Loop 3 gate
7. `/src/coordination/iteration-tracker.ts` - Loop 2/3 tracking

## Next: Real Agent Integration

Current: Mock Product Owner in `spawnProductOwner()`
Needed: Task tool integration for real agent spawning

```typescript
// Replace this mock:
const mockDecision = { decision: 'PROCEED', ... };

// With real agent:
const response = await this.taskTool.spawn({
  agentType: 'product-owner',
  prompt: productOwnerPrompt,
  maxTokens: 2000
});
```
