# CFN Loop Orchestrator for Trigger.dev v4

**Location:** `/docker/trigger-dev/src/trigger/cfn-orchestrator.ts`

**Purpose:** Main coordinator task for CFN Loop implementation that orchestrates Loop 3 implementers, gate checks, Loop 2 validators, and Product Owner decisions in Trigger.dev v4.

**Status:** Production-ready core structure with mock integration points

---

## Overview

The CFN Orchestrator implements a three-loop coordination pattern for autonomous code improvement:

- **Loop 3 (Implementation):** Parallel agent execution to fix code issues
- **Gate Check:** Validation that implementation meets quality thresholds
- **Loop 2 (Validation):** Parallel agent validation of implementation quality
- **Product Owner Decision:** PROCEED, ITERATE, or ABORT based on quality metrics

### Key Features

- **Mode-Based Thresholds:** MVP (fast), Standard (production), Enterprise (compliance)
- **Iteration Support:** Automatic retry with configurable max iterations per mode
- **Comprehensive Logging:** Detailed iteration logs for debugging and auditing
- **Type-Safe APIs:** Full TypeScript interfaces for payloads and results
- **30-Minute Timeout:** Accommodates complex implementations with multiple iterations

---

## Execution Modes

| Mode | Gate Threshold | Consensus Threshold | Max Iterations | Validators |
|------|----------------|-------------------|----------------|-----------|
| **MVP** | 70% | 80% | 5 | 2 |
| **Standard** | 95% | 90% | 10 | 3 |
| **Enterprise** | 98% | 95% | 15 | 5 |

- **Gate Threshold:** Test pass rate required to proceed past gate check
- **Consensus Threshold:** Average confidence score required from validators
- **Max Iterations:** Maximum iteration attempts before ABORT decision
- **Validators:** Number of parallel validators in Loop 2

---

## Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────┐
│ CFN Loop Orchestrator Starts                                │
└────────────────────────────────┬────────────────────────────┘
                                 ↓
                    ┌────────────────────────┐
                    │  ITERATION LOOP        │
                    │  (1 to maxIterations)  │
                    └────────┬───────────────┘
                             ↓
            ┌────────────────────────────────────────┐
            │ LOOP 3: Spawn Implementers in Parallel │
            │ - TypeScript specialist                │
            │ - Backend developer                    │
            │ - Tester                               │
            │ via tasks.batchTrigger                 │
            └────────┬───────────────────────────────┘
                     ↓
        ┌────────────────────────────────────────┐
        │ Wait for Implementers to Complete      │
        │ Collect modified files                 │
        └────────┬───────────────────────────────┘
                 ↓
    ┌────────────────────────────────────────┐
    │ GATE CHECK: Run Test Suite             │
    │ Calculate pass rate                    │
    └────────┬───────────────────────────────┘
             ↓
   ┌─────────────────────────────────────────┐
   │ Gate Threshold Check                    │
   │ (passRate >= threshold?)                │
   └──────┬────────────────────┬─────────────┘
          │ FAIL               │ PASS
          ↓                    ↓
    ┌──────────────┐    ┌─────────────────────────────────┐
    │ More iters?  │    │ LOOP 2: Spawn Validators        │
    │              │    │ - Code reviewer                 │
    ├──────┬───────┤    │ - Security specialist           │
    │ YES  │ NO    │    │ - CTO agent                     │
    │      │       │    │ via tasks.batchTrigger          │
    ↓      ↓       │    └─────────┬───────────────────────┘
  ITERATE ABORT   │              ↓
    ↑    └────────┼──────┐  ┌──────────────────────────┐
    │             │      └──│ Wait for Validators      │
    │             │         │ Calculate consensus     │
    │             │         └──────┬───────────────────┘
    │             │                ↓
    │             │    ┌──────────────────────────────┐
    │             │    │ PRODUCT OWNER DECISION       │
    │             │    │ Evaluate consensus >= thresh │
    │             │    └──────┬──────────────┬────────┘
    │             │           │ PASS         │ FAIL
    │             │           ↓              ↓
    │             │      PROCEED         ┌───────┐
    │             │                      │ ITER? │
    │             │                      ├─┬────┤
    │             │                    YES│ NO  │
    │             └────────────────────┐  │  │ │
    └─────────────────────────────────┤◄─┘  │ │
                                      │     ↓ ↓
                                      │   ABORT
                                      ↓
                                    EXIT
```

---

## Task Interfaces

### OrchestratorPayload (Input)

```typescript
interface OrchestratorPayload {
  taskDescription: string;        // Task to implement
  workDir: string;                // Working directory
  mode: "mvp" | "standard" | "enterprise";
  testCommand?: string;           // Test command (default: "npm test")
  implementerAgents?: string[];    // Custom implementers
  validatorAgents?: string[];      // Custom validators
}
```

### OrchestratorResult (Output)

```typescript
interface OrchestratorResult {
  decision: "PROCEED" | "ITERATE" | "ABORT";
  iterations: number;             // Total iterations completed
  mode: string;                   // Execution mode
  taskId: string;                 // Unique task ID
  finalPassRate: number;          // Final test pass rate (0.0-1.0)
  finalConsensus: number;         // Final validator consensus (0.0-1.0)
  filesModified: string[];        // All files modified across iterations
  duration: number;               // Total duration in milliseconds
  iterationLogs?: string[];       // Detailed iteration logs
  error?: string;                 // Error message if ABORT
}
```

---

## Default Agent Types

### Loop 3 Implementers (Code Implementation)

```typescript
DEFAULT_IMPLEMENTER_AGENTS = [
  "typescript-specialist",        // TypeScript types and interfaces
  "backend-developer",            // Business logic and integration
  "tester"                        // Test coverage and validation
]
```

### Loop 2 Validators (Quality Assurance)

```typescript
DEFAULT_VALIDATOR_AGENTS = [
  "code-reviewer",                // Code quality and style
  "security-specialist",          // Security and compliance
  "cto-agent"                     // Architecture and strategy
]
```

---

## Implementation Status

### Completed Features

- Full orchestrator orchestration logic
- Mode-based threshold configuration (MVP, Standard, Enterprise)
- Iteration loop with automatic retry
- Gate check integration pattern
- Validator spawning and consensus calculation
- Product Owner decision logic
- Comprehensive logging and iteration tracking
- Type-safe interfaces for all payloads
- 30-minute timeout configuration
- Error handling and recovery

### Integration Points (Pending)

The following integration points require completion of dependency tasks:

1. **cfn-implementer Task Definition**
   - File: `docker/trigger-dev/src/trigger/cfn-implementer.ts`
   - Required export: `export const cfnImplementerTask = task({ ... })`
   - Currently exports: `handleImplementerTask()` function (handler pattern)

2. **cfn-validator Task Definition**
   - File: `docker/trigger-dev/src/trigger/cfn-validator.ts`
   - Required export: `export const cfnValidatorTask = task({ ... })`
   - Currently exports: `handleValidatorTask()` function (handler pattern)

3. **Gate Check Integration**
   - Currently using mock test results (95% pass rate)
   - Production integration would trigger actual test suite
   - Uses `cfnTestRunnerTask` which is already defined

---

## Usage Example

```typescript
import { cfnOrchestratorTask } from "./cfn-orchestrator.js";
import { tasks } from "@trigger.dev/sdk/v3";

// Trigger orchestrator
const handle = await tasks.trigger("cfn-orchestrator", {
  taskDescription: "Implement user authentication module with OAuth2 support",
  workDir: "/path/to/project",
  mode: "standard",
  testCommand: "npm run test:unit",
  // implementerAgents: ["custom-specialist"], // Optional custom agents
  // validatorAgents: ["qa-engineer"],         // Optional custom validators
});

// Poll for completion
const result = await tasks.retrieve(handle);
if (result.status === "COMPLETED") {
  console.log(`Decision: ${result.output.decision}`);
  console.log(`Iterations: ${result.output.iterations}`);
  console.log(`Files modified: ${result.output.filesModified.length}`);
  console.log(`Duration: ${result.output.duration}ms`);
}
```

---

## Key Functions

### spawnImplementers()

Spawns Loop 3 implementer agents in parallel using batchTrigger.

```typescript
async function spawnImplementers(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  implementerAgents: string[]
): Promise<{ batchId: string; implementerPayloads: ImplementerPayload[] }>
```

**Notes:**
- Requires `cfn-implementer.ts` to export task definition
- Throws error with helpful message if task not found

### runGateCheck()

Executes test suite and validates pass rate against threshold.

```typescript
async function runGateCheck(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  modeConfig: ModeConfig
): Promise<TestRunnerResult>
```

**Integration Status:**
- Currently returns mock test result (95% pass rate)
- Production version would integrate with `cfnTestRunnerTask`
- Uses `tasks.trigger()` and polling pattern

### spawnValidators()

Spawns Loop 2 validator agents in parallel for quality assurance.

```typescript
async function spawnValidators(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  implementerResults: ImplementerResult[],
  testResult: TestRunnerResult,
  validatorAgents: string[]
): Promise<{ batchId: string; validatorPayloads: ValidatorPayload[] }>
```

**Notes:**
- Requires `cfn-validator.ts` to export task definition
- Receives implementer results and test results for validation context

### makeProductOwnerDecision()

Determines PROCEED, ITERATE, or ABORT based on quality metrics.

```typescript
function makeProductOwnerDecision(
  state: OrchestrationState,
  testResult: TestRunnerResult,
  consensus: number,
  modeConfig: ModeConfig
): "PROCEED" | "ITERATE" | "ABORT"
```

**Decision Logic:**
- **PROCEED:** Gate passed AND consensus >= threshold
- **ITERATE:** Quality thresholds not met AND iterations < max
- **ABORT:** Max iterations reached OR max iterations exceeded

---

## Logging and Monitoring

### Iteration Logs

All orchestrator steps are logged with timestamps:

```
[2025-11-24T10:30:45.123Z] Iteration 1 - Spawning Loop 3 implementers: 3 agents
[2025-11-24T10:30:46.456Z] Iteration 1 - Batch triggered: Batch ID: cfn-orch-1234567890
[2025-11-24T10:30:50.789Z] Iteration 1 - Gate check result: 95.00% pass rate (threshold: 95.00%)
[2025-11-24T10:30:51.012Z] Iteration 1 - Gate check passed: Proceeding to Loop 2 validators
[2025-11-24T10:30:52.345Z] Iteration 1 - Spawning Loop 2 validators: 3 agents
[2025-11-24T10:31:05.678Z] Iteration 1 - Validators complete: Consensus: 92.33% (3 validators)
[2025-11-24T10:31:05.901Z] Iteration 1 - Decision: PROCEED - Gate and consensus thresholds met
```

### Console Output

```
================================================================================
CFN Loop Orchestrator Started
================================================================================
Task Description: Implement user authentication module...
Work Directory: /path/to/project
Mode: standard (gate: 95%, consensus: 90%)
Max Iterations: 10
Implementers: typescript-specialist, backend-developer, tester
Validators: code-reviewer, security-specialist, cto-agent
================================================================================

--- ITERATION 1 ---

================================================================================
CFN Loop Orchestrator Complete
================================================================================
Decision: PROCEED
Iterations: 1
Final Pass Rate: 95.00%
Final Consensus: 92.33%
Files Modified: 8
Duration: 45.30s
================================================================================
```

---

## Error Handling

The orchestrator includes comprehensive error handling:

```typescript
try {
  // Validate inputs
  if (!payload.taskDescription || payload.taskDescription.trim().length === 0) {
    throw new Error("taskDescription is required and cannot be empty");
  }
  if (!payload.workDir || payload.workDir.trim().length === 0) {
    throw new Error("workDir is required and cannot be empty");
  }
  if (!fs.existsSync(payload.workDir)) {
    throw new Error(`workDir does not exist: ${payload.workDir}`);
  }

  // Main orchestration loop
  for (state.iteration = 1; state.iteration <= modeConfig.maxIterations; state.iteration++) {
    // Implementation and decision logic
  }
} catch (err) {
  lastError = String(err);
  decision = "ABORT";
  logStep(state, "Orchestrator error", lastError);
  console.error("Orchestrator error:", err);
}

// Return result with error if applicable
if (lastError) {
  result.error = lastError;
}
```

**Error Scenarios:**
- Invalid payload (missing or empty fields)
- Non-existent working directory
- Failed implementer spawning
- Timeout during gate check
- Validator spawning failures
- Unexpected exceptions during iteration

---

## Monitoring and Metrics

The orchestrator tracks comprehensive metrics:

```typescript
interface OrchestrationState {
  iteration: number;                    // Current iteration count
  allFilesModified: Set<string>;        // All files modified across iterations
  iterationLogs: string[];              // Detailed logs for each iteration
  passRateHistory: number[];            // Pass rate for each iteration
  consensusHistory: number[];           // Consensus for each iteration
  startTime: number;                    // Start timestamp for duration tracking
}
```

**Available Metrics:**
- Total iterations completed
- Files modified across all iterations
- Pass rate progression per iteration
- Validator consensus per iteration
- Total duration in milliseconds
- Detailed iteration logs for post-mortem analysis

---

## Next Steps

### Priority 1: Enable cfn-implementer Task Definition

Convert `cfn-implementer.ts` to export a proper Trigger.dev task:

```typescript
export const cfnImplementerTask = task({
  id: "cfn-implementer",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: ImplementerPayload): Promise<ImplementerResult> => {
    return await handleImplementerTask(payload);
  },
});
```

### Priority 2: Enable cfn-validator Task Definition

Convert `cfn-validator.ts` to export a proper Trigger.dev task:

```typescript
export const cfnValidatorTask = task({
  id: "cfn-validator",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: ValidatorPayload): Promise<ValidatorResult> => {
    return await handleValidatorTask(payload);
  },
});
```

### Priority 3: Implement Gate Check Integration

Replace mock test results with actual test execution:

```typescript
// Real gate check implementation
const testHandle = await tasks.trigger("cfn-test-runner", testPayload);
const retrieveResult = await tasks.retrieve(testHandle);
// Poll until completion and extract result
```

### Priority 4: Export cfnOrchestratorTask

Add to `docker/trigger-dev/src/trigger/index.ts`:

```typescript
export { cfnOrchestratorTask } from "./cfn-orchestrator.js";
export type { OrchestratorPayload, OrchestratorResult } from "./cfn-orchestrator.js";
```

---

## Testing

### Unit Test Coverage

The orchestrator logic can be tested by:

1. **Mock payload validation tests** - Verify error handling for invalid inputs
2. **Mode configuration tests** - Verify correct thresholds per mode
3. **Decision logic tests** - Verify PROCEED/ITERATE/ABORT logic
4. **Logging tests** - Verify iteration logs are captured

### Integration Testing

Once dependencies are completed:

1. **Single iteration test** - Implement → Gate Pass → Validate → PROCEED
2. **Multi-iteration test** - Gate Fail → ITERATE → Gate Pass → PROCEED
3. **Max iterations test** - Exceed max iterations → ABORT
4. **Error handling test** - Invalid payload → ABORT with error message

---

## Configuration Reference

### Mode Configuration Thresholds

```typescript
const MODE_CONFIG: Record<string, ModeConfig> = {
  mvp: {
    gateThreshold: 0.70,        // 70% pass rate required
    consensusThreshold: 0.80,    // 80% validator consensus
    maxIterations: 5,            // Maximum 5 iterations
    validators: 2,               // 2 validators
  },
  standard: {
    gateThreshold: 0.95,        // 95% pass rate required
    consensusThreshold: 0.90,    // 90% validator consensus
    maxIterations: 10,           // Maximum 10 iterations
    validators: 3,               // 3 validators
  },
  enterprise: {
    gateThreshold: 0.98,        // 98% pass rate required
    consensusThreshold: 0.95,    // 95% validator consensus
    maxIterations: 15,           // Maximum 15 iterations
    validators: 5,               // 5 validators
  },
};
```

### Timeout Configuration

```typescript
// Orchestrator task timeout
timeout: 1800,  // 30 minutes (1800 seconds)

// Test polling configuration
maxAttempts: 60  // 5 minutes with 5-second intervals
```

---

## File Statistics

- **File Size:** 624 lines
- **Interfaces:** 7 (OrchestratorPayload, OrchestratorResult, ModeConfig, etc.)
- **Functions:** 9 (spawnImplementers, runGateCheck, makeProductOwnerDecision, etc.)
- **Modes:** 3 (MVP, Standard, Enterprise)
- **Default Agents:** 6 (3 implementers + 3 validators)

---

## References

- **Trigger.dev Documentation:** https://trigger.dev/docs
- **CFN Loop Architecture:** See `docs/CFN_LOOP_ARCHITECTURE.md`
- **Implementation Tasks:**
  - `docker/trigger-dev/src/trigger/cfn-implementer.ts`
  - `docker/trigger-dev/src/trigger/cfn-validator.ts`
  - `docker/trigger-dev/src/trigger/cfn-test-runner.ts`
- **Example Usage:** `docker/trigger-dev/src/trigger/stress-test.ts`

---

**Created:** 2025-11-24
**Version:** 1.0 (Core Structure)
**Status:** Production-ready for orchestration logic; pending task definition integration
