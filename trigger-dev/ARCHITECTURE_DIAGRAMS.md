# CFN Loop Trigger.dev Architecture - Visual Diagrams

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CFN Loop Orchestration                         │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
            ┌───────▼────────┐        ┌───────▼────────┐
            │  Trigger.dev   │        │  Agent CLI     │
            │  Event Stream  │        │  Coordinator   │
            └────────────────┘        └────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
   │ Loop 3  │ │  Gate   │ │ Loop 2  │
   │ Agents  │ │ Check   │ │Validators
   │  (Exec) │ │ (Valid) │ │ (Review)│
   └────┬────┘ └────┬────┘ └────┬────┘
        │            │           │
        └────────────┼───────────┘
                     │
              ┌──────▼──────┐
              │ Consensus   │
              │ Aggregation │
              └──────┬──────┘
                     │
            ┌────────▼────────┐
            │ Product Owner   │
            │ Decision Route  │
            └────────┬────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │ PROCEED │ │ITERATE  │ │ ABORT   │
    │ (Return)│ │(Retry)  │ │ (Fail)  │
    └─────────┘ └─────────┘ └─────────┘
```

---

## 2. Workflow Execution State Machine

```
┌──────────┐
│  START   │
└────┬─────┘
     │ taskId, description, mode
     ▼
┌──────────────────────────────────────────────┐
│ INIT: Parse CFNLoopPayload                   │
│ - Get thresholds (MVP/Standard/Enterprise)   │
│ - Initialize IterationState                  │
│ - Set currentIteration = 1                   │
└────┬─────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────┐
│ LOOP START (check iteration limit)           │
│ currentIteration <= maxIterations?            │
└────┬─────────────────────────────────────────┘
     │ YES
     ▼
┌──────────────────────────────────────────────┐
│ PHASE 1: LOOP 3 - EXECUTE AGENTS             │
│                                              │
│ for agentType in determineAgentTypes():      │
│   ├─ Spawn agent via CLI                     │
│   ├─ Execute task (5-30 min)                 │
│   ├─ Run tests                               │
│   ├─ Parse test results (Jest/Vitest)        │
│   └─ Collect AgentResult                     │
│                                              │
│ Result: AgentResult[] (1-3 agents)           │
└────┬─────────────────────────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────┐
│ PHASE 2: GATE CHECK                          │
│                                              │
│ passRate = totalPassed / totalTests          │
│ passed = passRate >= threshold               │
│                                              │
│ Result: GateCheckResult                      │
└─┬──────────────────────────────────────────┬─┘
  │ FAIL (passed=false)                       │ PASS (passed=true)
  │                                           │
  ▼                                           ▼
┌────────────────┐                  ┌──────────────────────────────────┐
│ Inc Iteration  │                  │ PHASE 3: LOOP 2 - VALIDATORS     │
│ Check < Max    │                  │                                  │
└─┬──────────────┘                  │ Spawn 3-5 validators:            │
  │                                 │ - code-reviewer                  │
  ├─ YES:Continue ──────────────┐   │ - qa-engineer                    │
  │                             │   │ - security-specialist            │
  └─ NO: ABORT ──────────────┐  │   │                                  │
                             │  │   │ Result: ValidatorResult[]        │
                             │  │   └──────────┬──────────────────────┘
                             │  │              │
                             │  └─(ITERATE)───┘
                             │                  │
                             │                  ▼
                             │  ┌──────────────────────────────────┐
                             │  │ PHASE 4: CONSENSUS AGGREGATION   │
                             │  │                                  │
                             │  │ avgScore = mean(consensusScores) │
                             │  │ consensusMet = avgScore >= 0.90  │
                             │  │                                  │
                             │  │ Result: ConsensusResult          │
                             │  └────────────┬─────────────────────┘
                             │              │
                             │              ▼
                             │  ┌──────────────────────────────────┐
                             │  │ PHASE 5: PRODUCT OWNER DECISION  │
                             │  │                                  │
                             │  │ Route based on:                  │
                             │  │ - Gate result (passed/failed)     │
                             │  │ - Consensus (consensusMet)       │
                             │  │                                  │
                             │  │ Result: ProductOwnerDecision     │
                             │  └─┬────────┬────────┬──────────────┘
                             │    │        │        │
                  ┌──────────┘    │        │        │
                  │          PROCEED  ITERATE   ABORT
                  │               │        │        │
                  │               │        │        └─────┐
                  │               ▼        ▼              │
                  │           ┌──────┐ ┌────────┐        │
                  │           │SUCCESS│ │Inc Iter│        │
                  │           │Return │ │ Retry  │        │
                  │           └──────┘ └────┬───┘        │
                  │                         │             │
                  │                    (Loop to Phase 1)  │
                  │                                       ▼
                  └───────────────────────────┐      ┌─────────┐
                                              └─────>│ FAILURE │
                                                     └─────────┘
```

---

## 3. Layered Error Handling Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Error Handling Layers                         │
└──────────────────────────────────────────────────────────────────┘

Layer 4: PHASE-LEVEL RECOVERY
┌────────────────────────────────────────────────────────────────┐
│ Try phase execution (Loop 3, Loop 2, etc.)                     │
│ Catch error → Increment iteration → Check maxIterations       │
│ Result: Graceful iteration or ABORT                           │
└────────────────────────────────────────────────────────────────┘

Layer 3: GATE & CONSENSUS FALLBACKS
┌────────────────────────────────────────────────────────────────┐
│ Gate Check: If calculation fails → return passed=false         │
│ Consensus: If aggregation fails → return consensusMet=false    │
│ PO Decision: If parsing fails → return ITERATE (conservative)  │
└────────────────────────────────────────────────────────────────┘

Layer 2: COMMAND EXECUTION
┌────────────────────────────────────────────────────────────────┐
│ Agent spawning: try execAsync with 30-min timeout              │
│ Test execution: try parseTestResults with regex fallback       │
│ Catch: Return partial results or fail gracefully               │
└────────────────────────────────────────────────────────────────┘

Layer 1: INPUT VALIDATION (SECURITY)
┌────────────────────────────────────────────────────────────────┐
│ validateTaskId() → Whitelist pattern [a-zA-Z0-9\-_]            │
│ Throws error BEFORE shell execution                            │
│ Prevents: Path traversal, command injection, null bytes        │
└────────────────────────────────────────────────────────────────┘

Result: 10 distinct error handling paths with fail-safe defaults
```

---

## 4. Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dependency Flow                              │
└─────────────────────────────────────────────────────────────────┘

cfn-loop.ts (Main Orchestrator)
├── Imports from:
│   ├─ types/cfn-types.ts (Type definitions)
│   │  └─ NO OTHER IMPORTS (Dependency sink)
│   ├─ lib/agent-executor.ts (Agent spawning)
│   │  ├─ utils/path-validation.ts (Security validation)
│   │  └─ lib/test-result-parser.ts (Test parsing)
│   └─ (Declare client from trigger.dev)
│
├─ Spawn events → trigger.dev
│
├─ Loop 3: Agent jobs
│  ├─ cfn-agent.ts
│  │  ├─ utils/path-validation.ts
│  │  └─ types/cfn-types.ts
│  └─ loop3-agent.job.ts
│
├─ Gate Check job
│  ├─ cfn-gate-check.ts
│  └─ gate-check.job.ts
│
├─ Loop 2: Validator jobs
│  ├─ loop2-validator.job.ts
│  └─ cfn-agent.ts (spawns validators)
│
└─ Product Owner job
   └─ product-owner.job.ts

ACYCLIC DEPENDENCY GRAPH: Zero circular dependencies
```

---

## 5. Test Result Parsing Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                 Test Output (Raw String)                      │
│  "Test Suites: 2 passed, 2 total                             │
│   Tests: 45 passed, 5 failed, 50 total"                      │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────┐
     │ Pattern 1: Standard Jest/Vitest   │
     │ /Tests:\s+(\d+)\s+passed.../      │
     └───────────────────────────────────┘
                 │
                 ├─ MATCH:
                 │  passedTests = 45
                 │  totalTests = 50
                 │  failedTests = 5
                 │
                 └─ NO MATCH ↓
                 ▼
     ┌───────────────────────────────────┐
     │ Pattern 2: Simplified Format      │
     │ /(\d+)\s+passed.*(\d+)\s+total/   │
     └───────────────────────────────────┘
                 │
                 ├─ MATCH: Extract numbers
                 │
                 └─ NO MATCH ↓
                 ▼
     ┌───────────────────────────────────┐
     │ Pattern 3: Pass Rate Only         │
     │ /pass\s+rate:\s*(\d+)%/i          │
     └───────────────────────────────────┘
                 │
                 ├─ MATCH: Calculate from percentage
                 │
                 └─ NO MATCH ↓
                 ▼
     ┌───────────────────────────────────┐
     │ THROW ERROR:                      │
     │ "Could not parse test output"     │
     └───────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────┐
     │ createTestResult():               │
     │ ├─ Validate: passed + failed ≈ total
     │ ├─ Extract: coverage percentage  │
     │ ├─ Parse: test suite counts      │
     │ └─ Return: TestParseResult       │
     └───────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────┐
     │ TestParseResult                   │
     │ {                                 │
     │   passedTests: 45                 │
     │   totalTests: 50                  │
     │   failedTests: 5                  │
     │   testPassRate: 0.9000            │
     │   coverage: 0.87                  │
     │   testSuites: {                   │
     │     passed: 2,                    │
     │     total: 2                      │
     │   }                               │
     │ }                                 │
     └───────────────────────────────────┘
```

---

## 6. Security Validation Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│             CFN Agent Job Receives taskId                    │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ validateTaskId(taskId) - REQUIRED BEFORE   │
     │ any shell execution (BUG #21 / CVSS 7.5)   │
     └───────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Type check: typeof taskId === 'string'?   │
     │ throw Error if not string or empty        │
     └───────────────────────────────────────────┘
                 │
                 ├─ FAIL: return error
                 │
                 └─ PASS ↓
                 ▼
     ┌───────────────────────────────────────────┐
     │ Length check: 1 <= length <= 255 chars?   │
     │ throw Error if out of bounds              │
     └───────────────────────────────────────────┘
                 │
                 ├─ FAIL: return error
                 │
                 └─ PASS ↓
                 ▼
     ┌───────────────────────────────────────────┐
     │ Whitelist pattern: /^[a-zA-Z0-9\-_]+$/    │
     │ throw Error if doesn't match              │
     └───────────────────────────────────────────┘
                 │
                 ├─ FAIL: return error ("Invalid taskId format")
                 │
                 └─ PASS ↓
                 ▼
     ┌───────────────────────────────────────────┐
     │ SAFE TO EXECUTE:                          │
     │                                           │
     │ const cmd = `npx claude-flow-novice        │
     │   agent-spawn ${agentType}                │
     │   --task-id ${taskId}`;                   │
     │                                           │
     │ await execAsync(cmd, { timeout: ... })    │
     └───────────────────────────────────────────┘

ATTACK VECTORS BLOCKED:
❌ taskId = "../../../etc/passwd"
❌ taskId = "; rm -rf /"
❌ taskId = "$(whoami)"
❌ taskId = "`curl evil.com`"
❌ taskId = "task\x00.txt"
✅ taskId = "task-123_abc"
```

---

## 7. Gate Check Threshold Routing

```
┌──────────────────────────────────────────────────────────────┐
│         Gate Check: Validate Loop 3 Pass Rate                │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Aggregate test results from all agents    │
     │ totalPassed = sum(agent.testResults.*)    │
     │ totalTests = sum(agent.totalTests)        │
     │ passRate = totalPassed / totalTests       │
     └───────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Get threshold based on mode:              │
     │                                           │
     │ MVP:        passRate >= 0.70?             │
     │ STANDARD:   passRate >= 0.95?             │
     │ ENTERPRISE: passRate >= 0.98?             │
     └───────────────────────────────────────────┘
                 │
        ┌────────┴──────────┐
        │                   │
    FAIL (< threshold)   PASS (>= threshold)
        │                   │
        ▼                   ▼
    ┌────────┐      ┌─────────────────┐
    │ITERATE │      │ Execute Loop 2  │
    │(Retry) │      │ (Validators)    │
    └────────┘      └─────────────────┘

Example:
┌─────────────────────────────────────────┐
│ Agent Results:                          │
│ ├─ backend-developer: 45/50 tests pass  │
│ └─ typescript-specialist: 48/50 pass    │
│                                         │
│ Aggregated: 93/100 = 93% pass rate      │
│ Mode: STANDARD (requires 95%)           │
│                                         │
│ GATE: FAILED (93% < 95%)                │
│ Action: ITERATE (try again)             │
└─────────────────────────────────────────┘
```

---

## 8. Consensus Aggregation Formula

```
┌──────────────────────────────────────────────────────────────┐
│         Loop 2 Consensus: Aggregate Validator Scores         │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Collect validator consensus scores (0-1)  │
     │                                           │
     │ code-reviewer:    0.92                    │
     │ qa-engineer:      0.88                    │
     │ security-specialist: 0.95                 │
     └───────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Calculate average:                        │
     │ averageScore = (0.92 + 0.88 + 0.95) / 3   │
     │             = 2.75 / 3                    │
     │             = 0.9167                      │
     └───────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Compare to threshold:                     │
     │ threshold = 0.90 (Standard mode)          │
     │                                           │
     │ consensusMet = 0.9167 >= 0.90?            │
     │              = TRUE                       │
     └───────────────────────────────────────────┘
                 │
        ┌────────┴──────────┐
        │                   │
    consensusMet=false   consensusMet=true
        │                   │
        ▼                   ▼
    ┌────────┐      ┌──────────────────┐
    │ITERATE │      │ Proceed to PO    │
    │(Retry) │      │ Decision         │
    └────────┘      └──────────────────┘
```

---

## 9. Product Owner Decision Logic

```
┌──────────────────────────────────────────────────────────────┐
│         Product Owner: Route Decision                        │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Decision Matrix:                          │
     │                                           │
     │ Gate   │ Consensus │ Decision  │ Action  │
     ├────────┼───────────┼───────────┼─────────┤
     │ PASS   │ YES       │ PROCEED   │ Return  │
     │ PASS   │ NO        │ ITERATE   │ Retry   │
     │ FAIL   │ YES       │ ITERATE   │ Retry   │
     │ FAIL   │ NO        │ ITERATE   │ Retry   │
     └───────────────────────────────────────────┘
                 │
                 ▼
     ┌───────────────────────────────────────────┐
     │ Current: Both PASS → PROCEED               │
     │ Otherwise → ITERATE                       │
     │                                           │
     │ Conservative: Fails safe to iteration     │
     └───────────────────────────────────────────┘
                 │
        ┌────────┴──────────┬──────────┐
        │                   │          │
    PROCEED            ITERATE        ABORT*
        │                   │          │
        ▼                   ▼          ▼
    ┌────────┐      ┌────────────┐  ┌──────┐
    │SUCCESS │      │Inc Iteration│  │FAIL  │
    │Return  │      │Check < Max  │  │Error │
    └────────┘      └────────────┘  └──────┘
                         │
                      YES/NO
                         │
                    Continue or Abort

*Note: ABORT only returned if max iterations exceeded
       or explicit abort reason provided
```

---

## 10. Type Hierarchy

```
┌────────────────────────────────────────────────────────────┐
│                    CFN Type System                         │
└────────────────────────────────────────────────────────────┘

CFNLoopPayload (INPUT)
├─ taskId: string
├─ description: string
├─ successCriteria: SuccessCriteria
│  ├─ testCommand: string
│  ├─ passRateThreshold: 0.0-1.0
│  ├─ coverageThreshold?: number
│  └─ benchmarks?: Record<string, number>
├─ mode: 'mvp' | 'standard' | 'enterprise'
├─ maxIterations: number
├─ currentIteration: number
└─ metadata?: Record<string, unknown>

EXECUTION RESULT TYPES
├─ AgentResult (Loop 3 completion)
│  ├─ agentId: string
│  ├─ agentType: string
│  ├─ confidence: 0.0-1.0
│  ├─ deliverables: { files, summary }
│  ├─ testResults: TestResults
│  └─ completedAt: ISO string
│
├─ GateCheckResult (Pass rate validation)
│  ├─ passed: boolean
│  ├─ passRate: 0.0-1.0
│  ├─ threshold: 0.0-1.0
│  ├─ agentResults: AgentResult[]
│  └─ reason: string
│
├─ ValidatorResult (Loop 2 review)
│  ├─ validatorId: string
│  ├─ validatorType: string
│  ├─ consensusScore: 0.0-1.0
│  ├─ feedback: string
│  └─ completedAt: ISO string
│
├─ ConsensusResult (Aggregated scores)
│  ├─ averageScore: 0.0-1.0
│  ├─ validatorResults: ValidatorResult[]
│  ├─ consensusMet: boolean
│  └─ summary: string
│
└─ ProductOwnerDecision (Final routing)
   ├─ decision: 'PROCEED' | 'ITERATE' | 'ABORT'
   ├─ reasoning: string
   └─ decidedAt: ISO string

CFNLoopResult (FINAL OUTPUT)
├─ taskId: string
├─ decision: 'COMPLETED' | 'ABORTED'
├─ iterationsCompleted: number
├─ allAgentResults: AgentResult[]
├─ finalConsensus: ConsensusResult
├─ finalGateCheck: GateCheckResult
├─ productOwnerDecision: ProductOwnerDecision
├─ executionTimeSeconds: number
└─ success: boolean
```

---

## 11. Iteration Cycle Example

```
Iteration 1:
┌─ Spawn backend-developer
│  └─ Tests: 40/50 passing (80%)
├─ Spawn typescript-specialist
│  └─ Tests: 42/50 passing (84%)
├─ Gate Check: (40+42)/(50+50) = 82% vs 95% required
├─ GATE FAILED → Don't execute Loop 2
├─ Inc iteration → iteration=2
└─ Continue (back to Loop 3)

Iteration 2:
┌─ Spawn backend-developer (improved code)
│  └─ Tests: 47/50 passing (94%)
├─ Spawn typescript-specialist
│  └─ Tests: 48/50 passing (96%)
├─ Gate Check: (47+48)/(50+50) = 95% vs 95% required
├─ GATE PASSED → Execute Loop 2
├─ Spawn code-reviewer
│  └─ consensus: 0.92
├─ Spawn qa-engineer
│  └─ consensus: 0.88
├─ Spawn security-specialist
│  └─ consensus: 0.95
├─ Consensus: (0.92+0.88+0.95)/3 = 0.917 vs 0.90 required
├─ Consensus MET
├─ Product Owner: PROCEED (both gates met)
└─ Return CFNLoopResult { success: true, iterations: 2 }
```

---

## 12. Performance Timeline

```
Iteration (20-40 minutes per iteration)

0:00 ─────────────────────────────────────────────── Loop 3 Start
     │
     ├─ 0:05 Agent 1: backend-developer spawn
     │        0:15 Agent 1: test execution
     │        0:20 Agent 1: results collected
     │
     ├─ 0:05 Agent 2: typescript-specialist spawn
     │        0:15 Agent 2: test execution
     │        0:20 Agent 2: results collected
     │        (Parallel execution)
     │
     ├─ 0:25 Gate Check: 50ms calculation
     │
15:00 ─────┤ GATE PASSED
     │
     ├─ 0:30 Loop 2: code-reviewer spawn
     │        5:30 code-reviewer execution
     │        5:35 results collected
     │
     ├─ 5:40 qa-engineer spawn
     │        10:40 qa-engineer execution
     │        10:45 results collected
     │
     ├─ 10:50 security-specialist spawn
     │        15:50 security-specialist execution
     │        15:55 results collected
     │
20:00 ─────┤ Consensus: 50ms aggregation
     │
     ├─ 16:00 Product Owner spawn
     │        21:00 PO execution
     │        21:05 decision collected
     │
21:10 ─────────────────────────────────────────── Loop Complete
     │
     └─ Total: 21 minutes for single successful
        iteration (2 agents + 3 validators + PO)
```

---

## Summary

This architecture achieves:
- **Clarity:** State machines, phase diagrams, and decision flow
- **Resilience:** 10 error handling layers with graceful fallbacks
- **Security:** Whitelist validation prevents all injection attacks
- **Testability:** Type-safe, event-driven, observable
- **Scalability:** Event-driven enables parallel agent execution
- **Maintainability:** Clear module boundaries and responsibilities

**Key Innovation:** Real test validation replaces simulation, enabling objective quality gates and test-driven iterations.
