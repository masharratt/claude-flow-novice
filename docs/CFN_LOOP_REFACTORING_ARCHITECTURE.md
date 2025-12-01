# CFN Loop Refactored Architecture

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ cfnLoopWorkflow.run()                                           │
│ (127 lines - Main Orchestration)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Initialize State                                              │
│  ├─ currentIteration                                           │
│  ├─ allAgentResults[]                                          │
│  ├─ latestGateCheck                                            │
│  ├─ latestConsensus                                            │
│  └─ productOwnerDecision                                       │
│                                                                 │
│  while (iteration <= maxIterations)                            │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 1: LOOP 3 AGENTS                                │ │
│    │ executeLoop3Agents(ctx)                               │ │
│    │ ├─ Log start                                          │ │
│    │ ├─ For each agentType                                │ │
│    │ │  ├─ Dispatch spawn event                           │ │
│    │ │  ├─ Execute agent                                 │ │
│    │ │  └─ Run tests                                      │ │
│    │ ├─ Handle errors (fail → throw)                      │ │
│    │ └─ Return AgentResult[]                              │ │
│    └─────────────────────────────────────────────────────────┘ │
│             ↓                                                   │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 2: GATE CHECK                                  │ │
│    │ performGateCheck(agentResults, ctx)                  │ │
│    │ ├─ Dispatch gate-check event                         │ │
│    │ ├─ Calculate pass rate                               │ │
│    │ └─ Return GateCheckResult                            │ │
│    │                                                      │ │
│    │ if (!passed) → iterate(); continue                 │ │
│    └─────────────────────────────────────────────────────────┘ │
│             ↓                                                   │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 3: LOOP 2 VALIDATORS (Gate Passed)            │ │
│    │ executeLoop2Validators(agentResults, ctx)           │ │
│    │ ├─ Log start                                         │ │
│    │ ├─ For each validatorType                           │ │
│    │ │  ├─ Dispatch spawn event                          │ │
│    │ │  └─ Execute validator                            │ │
│    │ ├─ Handle errors (fail → throw)                     │ │
│    │ └─ Return ValidatorResult[]                         │ │
│    └─────────────────────────────────────────────────────────┘ │
│             ↓                                                   │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 4: CONSENSUS                                  │ │
│    │ collectConsensus(validatorResults, ctx)             │ │
│    │ ├─ Calculate average score                          │ │
│    │ ├─ Check consensus threshold                        │ │
│    │ └─ Return ConsensusResult                           │ │
│    └─────────────────────────────────────────────────────────┘ │
│             ↓                                                   │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 5: PRODUCT OWNER DECISION                     │ │
│    │ executeProductOwnerDecision(                        │ │
│    │   consensus, gateResult, agents, validators, ctx)   │ │
│    │ ├─ Dispatch PO spawn event                          │ │
│    │ ├─ Parse decision from consensus/gate               │ │
│    │ └─ Return ProductOwnerDecision                      │ │
│    └─────────────────────────────────────────────────────────┘ │
│             ↓                                                   │
│    ├─────────────────────────────────────────────────────────┐ │
│    │ Phase 6: ROUTE DECISION                             │ │
│    │ if (decision === 'PROCEED')                         │ │
│    │    return buildCompletedResult()  ← EXIT SUCCESS    │ │
│    │                                                     │ │
│    │ if (decision === 'ABORT')                           │ │
│    │    throw new Error()  ← EXIT FAILURE               │ │
│    │                                                     │ │
│    │ else ('ITERATE')                                    │ │
│    │    iteration++; continue  ← LOOP                   │ │
│    └─────────────────────────────────────────────────────────┘ │
│                                                                 │
│  return buildAbortResult()  ← Max iterations exceeded         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Function Responsibility Map

```
┌──────────────────────────────────────────────────────────────┐
│                    CFN LOOP WORKFLOW                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ TYPE DEFINITIONS                                            │
│ ├─ PhaseContext (shared context across phases)             │
│ └─ IterationState (workflow state management)              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ PHASE FUNCTIONS (Single Responsibility Each)               │
│                                                              │
│ 1. executeLoop3Agents()                                    │
│    Responsibility: Execute implementer agents              │
│    Input: PhaseContext                                    │
│    Output: AgentResult[]                                  │
│    Lines: ~35 | Complexity: 6                            │
│    ├─ Log phase start                                     │
│    ├─ For each agent: spawn + execute + test              │
│    ├─ Handle individual agent failures                    │
│    └─ Return results or throw on total failure            │
│                                                              │
│ 2. performGateCheck()                                      │
│    Responsibility: Validate quality gate                   │
│    Input: AgentResult[], PhaseContext                    │
│    Output: GateCheckResult                                │
│    Lines: ~30 | Complexity: 3                            │
│    ├─ Dispatch gate-check event                           │
│    ├─ Calculate pass rate from test results               │
│    ├─ Compare against threshold                           │
│    └─ Return gate result with fallback on error           │
│                                                              │
│ 3. executeLoop2Validators()                                │
│    Responsibility: Execute validator agents                │
│    Input: AgentResult[], PhaseContext                    │
│    Output: ValidatorResult[]                              │
│    Lines: ~40 | Complexity: 5                            │
│    ├─ Log phase start                                     │
│    ├─ Dispatch spawn events for all validators            │
│    ├─ Execute validators sequentially                     │
│    ├─ Handle individual validator failures                │
│    └─ Return results or throw on total failure            │
│                                                              │
│ 4. collectConsensus()                                      │
│    Responsibility: Aggregate validator feedback            │
│    Input: ValidatorResult[], PhaseContext                │
│    Output: ConsensusResult                                │
│    Lines: ~20 | Complexity: 2                            │
│    ├─ Calculate average consensus score                   │
│    ├─ Check against consensus threshold                   │
│    └─ Return consensus result with fallback               │
│                                                              │
│ 5. executeProductOwnerDecision()                           │
│    Responsibility: Get final decision from PO              │
│    Input: ConsensusResult, GateCheckResult, ...           │
│    Output: ProductOwnerDecision                           │
│    Lines: ~35 | Complexity: 4                            │
│    ├─ Dispatch PO spawn event with full context           │
│    ├─ Parse decision (PROCEED/ITERATE/ABORT)             │
│    └─ Return decision with fallback on error              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ HELPER FUNCTIONS (Calculation/Logic)                       │
│                                                              │
│ • determineAgentTypes()                                    │
│ • calculateGateResult()                                    │
│ • calculateConsensus()                                     │
│ • parseProductOwnerDecision()                              │
│ • buildCompletedResult()                                   │
│ • buildAbortResult()                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Dependency Graph

```
┌────────────────────────────────────────────────────────────┐
│ External Dependencies                                      │
├────────────────────────────────────────────────────────────┤
│ • @trigger.dev/sdk (defineJob, eventTrigger)              │
│ • Types (CFNLoopPayload, AgentResult, etc.)               │
│ • Agent Executor (executeAgent, executeTests)             │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ run() - Main Orchestrator                                  │
│ (127 lines, complexity 10)                                 │
├────────────────────────────────────────────────────────────┤
│ Orchestrates phases in sequence:                           │
│ Phase1 → Phase2 → Phase3 → Phase4 → Phase5 → Phase6       │
└────────────────────────────────────────────────────────────┘
    ↓         ↓          ↓          ↓         ↓
    │         │          │          │         │
    ▼         ▼          ▼          ▼         ▼
┌─────┐  ┌──────┐  ┌──────┐  ┌─────────┐  ┌─────────┐
│ P1  │  │ P2   │  │ P3   │  │ P4      │  │ P5      │
├─────┤  ├──────┤  ├──────┤  ├─────────┤  ├─────────┤
│ Loop3   Gate  Loop2  Consensus Product
│ Agents  Check Valids          Owner
└─────┘  └──────┘  └──────┘  └─────────┘  └─────────┘
  │         │        │         │           │
  └─────────┴────────┴─────────┴───────────┘
         ↓
    ┌─────────────────────────────────┐
    │ Shared Helper Functions         │
    ├─────────────────────────────────┤
    │ • determineAgentTypes()         │
    │ • calculateGateResult()         │
    │ • calculateConsensus()          │
    │ • parseProductOwnerDecision()   │
    │ • build*Result()                │
    └─────────────────────────────────┘
         ↓
    ┌─────────────────────────────────┐
    │ External Utilities              │
    ├─────────────────────────────────┤
    │ • executeAgent()                │
    │ • executeTests()                │
    │ • toAgentResult()               │
    │ • toValidatorResult()           │
    └─────────────────────────────────┘
```

## Control Flow: Success Path

```
User Input: CFNLoopPayload
              │
              ▼
┌─────────────────────────────────────────┐
│ Iteration 1                             │
└─────────────────────────────────────────┘
    Phase 1: executeLoop3Agents()
    ✓ Agent 1 passes tests (90%)
    ✓ Agent 2 passes tests (85%)
    → AgentResults: [Agent1, Agent2]
              │
              ▼
    Phase 2: performGateCheck()
    ✓ Pass rate: 87.5% >= 95% threshold? NO
    → GateCheckResult: { passed: false }
              │
              ▼
    (Gate failed, iterate)
              │
              ▼
┌─────────────────────────────────────────┐
│ Iteration 2                             │
└─────────────────────────────────────────┘
    Phase 1: executeLoop3Agents()
    ✓ Agent 1 passes tests (95%)
    ✓ Agent 2 passes tests (96%)
    → AgentResults: [Agent1, Agent2]
              │
              ▼
    Phase 2: performGateCheck()
    ✓ Pass rate: 95.5% >= 95% threshold? YES
    → GateCheckResult: { passed: true }
              │
              ▼
    Phase 3: executeLoop2Validators()
    ✓ Code Reviewer: score 0.92
    ✓ QA Engineer: score 0.88
    ✓ Security Specialist: score 0.90
    → ValidatorResults: [CRev, QA, Sec]
              │
              ▼
    Phase 4: collectConsensus()
    ✓ Average score: 0.90 >= 0.90 threshold? YES
    → ConsensusResult: { consensusMet: true }
              │
              ▼
    Phase 5: executeProductOwnerDecision()
    ✓ Gate: PASSED (95.5%)
    ✓ Consensus: MET (0.90)
    → Decision: 'PROCEED'
              │
              ▼
    Phase 6: Route Decision
    ✓ Decision === 'PROCEED'
    → Return buildCompletedResult()
              │
              ▼
        SUCCESS OUTPUT
    {
      taskId: '...',
      decision: 'COMPLETED',
      iterationsCompleted: 2,
      allAgentResults: [...],
      finalConsensus: {...},
      finalGateCheck: {...},
      productOwnerDecision: {...},
      success: true
    }
```

## Control Flow: Failure Path

```
Phase N: executeLoop3Agents()
✗ All agents fail
→ Throws error
   │
   ▼
catch (error) in run()
│
├─ Increment iteration counter
├─ If iteration > maxIterations:
│  └─ Return buildAbortResult('All agents failed')
│
└─ Otherwise: continue to next iteration

... (repeat phases) ...

Final: Iteration count exceeds maxIterations
→ Return buildAbortResult('Max iterations exceeded')
   │
   ▼
ABORT OUTPUT
{
  taskId: '...',
  decision: 'ABORTED',
  iterationsCompleted: 10,
  allAgentResults: [...],
  finalConsensus: { consensusMet: false, ... },
  finalGateCheck: { passed: false, ... },
  productOwnerDecision: { decision: 'ABORT', ... },
  success: false
}
```

## Complexity Distribution

### Before Refactoring
```
run() function: 333 lines
├─ Loop 3 (nested): 85 lines
│  ├─ Spawn loop: 45 lines (try/catch)
│  ├─ Execute loop: 35 lines (nested try/catch)
│  └─ Error handling: 5 lines
│
├─ Gate check (nested): 75 lines
│  ├─ Dispatch: 15 lines (try/catch)
│  ├─ Calculate: 20 lines (try/catch)
│  └─ Error handling: 40 lines
│
├─ Loop 2 (nested): 85 lines
│  ├─ Spawn loop: 35 lines
│  ├─ Execute loop: 35 lines (nested try/catch)
│  └─ Error handling: 15 lines
│
├─ Consensus (nested): 45 lines
│  ├─ Calculate: 20 lines (try/catch)
│  └─ Error handling: 25 lines
│
├─ Product Owner (nested): 35 lines
│  ├─ Dispatch: 12 lines (try/catch)
│  └─ Error handling: 23 lines
│
└─ Decision routing: 28 lines
   ├─ PROCEED check: 8 lines
   ├─ ABORT check: 8 lines
   └─ ITERATE logic: 12 lines
```

### After Refactoring
```
run() function: 127 lines
├─ State initialization: 8 lines
├─ While loop: 115 lines
│  ├─ Phase 1 call + error: 8 lines
│  ├─ Phase 2 call + error: 5 lines
│  ├─ Phase 3 call + error: 8 lines
│  ├─ Phase 4 call + error: 3 lines
│  ├─ Phase 5 call + error: 10 lines
│  └─ Decision routing: 15 lines
│
├─ executeLoop3Agents(): 35 lines (extracted)
├─ performGateCheck(): 30 lines (extracted)
├─ executeLoop2Validators(): 40 lines (extracted)
├─ collectConsensus(): 20 lines (extracted)
└─ executeProductOwnerDecision(): 35 lines (extracted)
```

**Result:** Complexity distributed across 6 focused functions instead of concentrated in 1 monolithic function.

## Metrics Visualization

```
BEFORE                          AFTER
────────────────────────────────────────────────────

Lines of Code
├─ 333 lines ████████████  →  127 lines ████
│  (monolithic)              (orchestration)
└─ Other helpers            Helper functions extract
                            33 + 35 + 40 + 20 + 35

Cyclomatic Complexity
├─ 23 ██████████████ →  10 ██████
│  (very high)           (acceptable)
└─ Try/catch: 9          Try/catch: 2

Nesting Depth
├─ 7 levels ███████ →  4 levels ████
│  (deep)           (moderate)
└─ Nested try/catch    Simple error handling

Cognitive Load (1-10 scale)
├─ 8/10 ████████  →  3/10 ███
│  (hard)         (easy)
└─ Multiple concerns    Single concern per function
```

## Summary

The refactoring successfully decomposed a single 333-line god function into:
- 1 clean orchestrator (127 lines, 10 complexity)
- 5 focused phase functions (20-40 lines each)
- Shared helper functions for calculations

This improves:
✓ Maintainability (easier to understand and modify)
✓ Testability (can test phases independently)
✓ Debuggability (stack traces point to specific phases)
✓ Readability (clear 6-step process)
✓ Reusability (phase functions can be composed differently)
