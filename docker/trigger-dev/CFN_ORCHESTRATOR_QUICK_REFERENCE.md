# CFN Orchestrator Quick Reference

**File:** `src/trigger/cfn-orchestrator.ts`
**Size:** 624 lines
**Status:** Production-ready orchestration logic

---

## Exported Types

```typescript
// Input payload
export interface OrchestratorPayload {
  taskDescription: string;
  workDir: string;
  mode: "mvp" | "standard" | "enterprise";
  testCommand?: string;
  implementerAgents?: string[];
  validatorAgents?: string[];
}

// Output result
export interface OrchestratorResult {
  decision: "PROCEED" | "ITERATE" | "ABORT";
  iterations: number;
  mode: string;
  taskId: string;
  finalPassRate: number;          // 0.0-1.0
  finalConsensus: number;         // 0.0-1.0
  filesModified: string[];
  duration: number;               // milliseconds
  iterationLogs?: string[];
  error?: string;
}

// Main task export
export const cfnOrchestratorTask = task({
  id: "cfn-orchestrator",
  retry: { maxAttempts: 1 },
  run: async (payload: OrchestratorPayload): Promise<OrchestratorResult> => {
    // 30-minute timeout orchestration
  }
});
```

---

## Mode Thresholds

| Mode | Gate | Consensus | Iterations | Validators |
|------|------|-----------|------------|-----------|
| mvp | 70% | 80% | 5 | 2 |
| standard | 95% | 90% | 10 | 3 |
| enterprise | 98% | 95% | 15 | 5 |

---

## Default Agents

**Loop 3 (Implementation):**
- typescript-specialist
- backend-developer
- tester

**Loop 2 (Validation):**
- code-reviewer
- security-specialist
- cto-agent

---

## Orchestration Steps

1. **Spawn Implementers** → `spawnImplementers()` via `tasks.batchTrigger()`
2. **Wait for Completion** → `waitForImplementers()` with polling
3. **Gate Check** → `runGateCheck()` (mock: 95% pass rate)
4. **Decision:** Gate passed? → Continue : Iterate/Abort
5. **Spawn Validators** → `spawnValidators()` via `tasks.batchTrigger()`
6. **Calculate Consensus** → `waitForValidators()` from confidence scores
7. **Product Owner Decision** → `makeProductOwnerDecision()` logic:
   - Max iterations + gate failed = **ABORT**
   - Gate passed + consensus met = **PROCEED**
   - Otherwise = **ITERATE** or **ABORT**

---

## Key Functions

```typescript
// Spawn Loop 3 implementers in parallel
async function spawnImplementers(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  implementerAgents: string[]
): Promise<{ batchId: string; implementerPayloads: ImplementerPayload[] }>

// Run test suite gate check
async function runGateCheck(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  modeConfig: ModeConfig
): Promise<TestRunnerResult>

// Spawn Loop 2 validators in parallel
async function spawnValidators(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  implementerResults: ImplementerResult[],
  testResult: TestRunnerResult,
  validatorAgents: string[]
): Promise<{ batchId: string; validatorPayloads: ValidatorPayload[] }>

// Make Product Owner decision
function makeProductOwnerDecision(
  state: OrchestrationState,
  testResult: TestRunnerResult,
  consensus: number,
  modeConfig: ModeConfig
): "PROCEED" | "ITERATE" | "ABORT"
```

---

## Usage

```typescript
import { cfnOrchestratorTask } from "./cfn-orchestrator.js";
import { tasks } from "@trigger.dev/sdk/v3";

// Trigger
const handle = await tasks.trigger("cfn-orchestrator", {
  taskDescription: "Implement authentication module",
  workDir: "/path/to/project",
  mode: "standard",
});

// Retrieve result
const result = await tasks.retrieve(handle);
console.log(result.output.decision);      // PROCEED, ITERATE, or ABORT
console.log(result.output.iterations);    // Total iterations
console.log(result.output.finalPassRate); // 0.95
console.log(result.output.finalConsensus); // 0.92
```

---

## Logging

Each iteration logs with timestamps:
```
[ISO-timestamp] Iteration N - Step: Details
```

Console output includes:
- Mode and thresholds
- Agent assignments
- Progress updates per iteration
- Final decision and metrics

---

## Integration Points

**Pending:**
- [ ] cfn-implementer task definition (currently: function handler)
- [ ] cfn-validator task definition (currently: function handler)
- [ ] Real gate check (currently: mock 95% pass rate)
- [ ] Export to index.ts

**To Enable cfn-implementer Task:**
```typescript
export const cfnImplementerTask = task({
  id: "cfn-implementer",
  run: async (payload: ImplementerPayload) => handleImplementerTask(payload),
});
```

**To Enable cfn-validator Task:**
```typescript
export const cfnValidatorTask = task({
  id: "cfn-validator",
  run: async (payload: ValidatorPayload) => handleValidatorTask(payload),
});
```

---

## Error Handling

- Invalid payload → throws with clear message
- Directory not found → throws with path
- Agent spawning fails → throws with integration hint
- Iteration errors → logs and continues or aborts
- Timeout → handled by Trigger.dev (30-minute window)

---

## Metrics Tracked

- Pass rate per iteration (`passRateHistory`)
- Consensus per iteration (`consensusHistory`)
- All files modified (`allFilesModified` Set)
- Iteration count and total duration
- Detailed iteration logs with timestamps

---

## Configuration

**Mode thresholds:** Defined in `MODE_CONFIG` record
**Timeouts:** 30 minutes for task, 5 minutes for test polling
**Max concurrent agents:** Determined by agent type (implementers: 3, validators: configurable)
**Iteration control:** Via `maxIterations` per mode

---

## Full Documentation

See `/docs/CFN_ORCHESTRATOR_TRIGGER_DEV.md` for:
- Complete flow diagram
- Detailed function documentation
- All interface definitions
- Testing strategies
- Configuration reference
- Next steps and roadmap

---

**Version:** 1.0 | **Created:** 2025-11-24 | **Ready for:** Core logic validation
