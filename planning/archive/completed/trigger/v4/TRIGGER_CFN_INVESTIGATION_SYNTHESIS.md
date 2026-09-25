# Trigger.dev CFN Loop Investigation Synthesis

**Date**: 2025-11-26
**Status**: Investigation Complete | Implementation Ready
**Investigators**: CLI Expert, Trigger Expert, Root Cause Analyst

---

## Executive Summary

Three parallel investigations confirmed the blocking issues preventing full CFN loop execution within Trigger.dev v4. The primary issue is **NOT a coordination conflict** between Trigger.dev and Redis (as previously suspected). Instead, the blockers are:

1. **Gate check uses mock data** (hardcoded 95% pass rate)
2. **CLI execution never validated** through Trigger.dev infrastructure
3. **API key propagation unverified** to subprocess

The Trigger.dev v4 API implementation is correct. All tasks are registered. The path to success is clear.

---

## Key Finding: No Redis Coordination Conflict

All three investigations independently confirmed:

- **Trigger.dev mode does NOT use Redis coordination**
- The `cfn-implementer` spawns Claude Code CLI via `execa` (subprocess)
- Completion is tracked via Trigger.dev SDK (`batch.retrieve` + `runs.poll`)
- The Redis BLPOP coordination is ONLY used in CLI mode (`/cfn-loop-cli`)
- **There is NO deadlock scenario** between the two systems

This eliminates the suspected root cause from the previous team's analysis.

---

## True Blocking Issues

### P0 CRITICAL: Gate Check Uses Mock Data

**File**: `docker/trigger-dev/src/trigger/cfn-orchestrator.ts:357-385`

```typescript
// CURRENT (MOCK):
const mockTestResult: TestRunnerResult = {
  success: true,
  passRate: 0.95,  // ← ALWAYS returns 95%
  totalTests: 20,
  passedTests: 19,
  failedTests: 1,
  output: "Mock test output - integration pending",
};
```

**Impact**:
- Gate check ALWAYS passes (95% > 70% MVP threshold)
- Real test failures are never detected
- Multi-iteration improvement logic never triggered

**Solution**: Integrate `cfn-test-runner` task that already exists:

```typescript
// REQUIRED FIX:
const testHandle = await tasks.trigger("cfn-test-runner", {
  workDir: payload.workDir,
  command: payload.testCommand || "npm test",
});
const result = await runs.poll(testHandle.id, { pollIntervalMs: 5000 });
return result.output as TestRunnerResult;
```

### P0 CRITICAL: CLI Execution Never Validated

**Evidence**: From `TRIGGER_V4_INTEGRATION_HANDOFF.md`:
> "Key Finding: Previous 'successful' 100-agent test bypassed Trigger.dev entirely using direct Docker spawning."

**Status of validation**:
- Stub tests (file creation without AI): PASSED
- Real AI single agent (`test-zai-agent`): READY but NEVER EXECUTED
- Real AI 100 agents: PENDING (blocked on single agent)
- Full CFN loop: NEVER TESTED

**Required validation**:
1. Trigger `test-zai-agent` via UI at http://localhost:8030
2. Confirm Claude Code CLI executes
3. Confirm file is created at expected path
4. Check for API key errors in logs

### P1 HIGH: API Key Propagation Unverified

**File**: `docker/trigger-dev/src/trigger/cfn-implementer.ts:69-119`

The `buildCliEnvironment()` function builds env vars for the subprocess:
```typescript
// Priority: payload._env > process.env[providerKey] > fallback
let apiKey = payload._env?.ANTHROPIC_API_KEY || payload._env?.ZAI_API_KEY;
if (!apiKey) apiKey = process.env[config.apiKeyEnv];  // e.g., ZAI_API_KEY
```

**Uncertainty**:
- Does `process.env.ZAI_API_KEY` exist in Trigger.dev worker context?
- Do env vars from `.env` propagate through dev server?
- Does execa subprocess inherit the configured env?

**Validation needed**: Add debug logging or test single implementer with explicit `_env` override.

---

## Architecture Status

### Trigger.dev v4 Infrastructure: RUNNING
- 9 containers active
- Webapp: http://localhost:8030
- Dev server: Active (worker version 20251125.31)
- Project: `proj_uuvpcrkpfruhlpbpzlov`

### Task Registration: COMPLETE
All CFN Loop tasks are exported in `docker/trigger-dev/src/trigger/index.ts`:

| Task ID | Status |
|---------|--------|
| `cfn-orchestrator` | Registered |
| `cfn-implementer` | Registered |
| `cfn-validator` | Registered |
| `cfn-test-runner` | Registered |
| `test-zai-agent` | Registered |
| `claude-agent` | Registered |

### V4 API Pattern: CORRECT
The orchestrator correctly uses:
```
tasks.batchTrigger() → batch.retrieve() → runs.poll()
```

This pattern was verified by the Trigger.dev expert investigation.

---

## Path to Success

### Step 1: Validate Single Agent (5 minutes)

1. Open http://localhost:8030 in browser
2. Navigate to "CFN Stress Test" project → Tasks
3. Find `test-zai-agent` task
4. Click "Test" button
5. Enter payload:
   ```json
   {
     "testId": "single-test",
     "outputDir": "/tmp/trigger-single-test"
   }
   ```
6. Monitor execution in UI and dev server logs
7. Verify file creation: `ls -la /tmp/trigger-single-test/`

**Expected**: File `zai-test-single-test.ts` created with valid TypeScript

### Step 2: Integrate Real Test Runner (20 minutes)

Replace mock gate check in `cfn-orchestrator.ts:357-385`:

```typescript
async function runGateCheck(
  payload: OrchestratorPayload,
  state: OrchestrationState,
  modeConfig: ModeConfig
): Promise<TestRunnerResult> {
  logStep(state, "Running gate check", "Executing test suite");

  const testCommand = payload.testCommand || "npm test";

  // Trigger real test runner task
  const testHandle = await tasks.trigger("cfn-test-runner", {
    workDir: payload.workDir,
    command: testCommand,
  });

  logStep(state, "Test runner triggered", `Run ID: ${testHandle.id}`);

  // Wait for completion
  const result = await runs.poll(testHandle.id, {
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  if (result.status !== "COMPLETED" || !result.output) {
    throw new Error(`Test runner failed: ${result.status}`);
  }

  const testResult = result.output as TestRunnerResult;
  state.passRateHistory.push(testResult.passRate ?? 0);

  logStep(
    state,
    "Gate check result",
    `${(testResult.passRate * 100).toFixed(2)}% pass rate (threshold: ${(modeConfig.gateThreshold * 100).toFixed(2)}%)`
  );

  return testResult;
}
```

### Step 3: Run End-to-End Test (15 minutes)

1. Trigger `cfn-orchestrator` via UI with:
   ```json
   {
     "taskDescription": "Create a simple hello.ts file with console.log('Hello CFN')",
     "workDir": "/tmp/cfn-e2e-test",
     "mode": "mvp",
     "testCommand": "echo 'tests pass' && exit 0"
   }
   ```
2. Watch execution in UI
3. Verify:
   - Loop 3 implementers spawn and complete
   - Gate check runs and passes
   - Loop 2 validators spawn and complete
   - Product Owner decision is PROCEED

---

## What Was NOT the Problem

Previous investigations focused on:

1. ❌ **Timeout issues** - The orchestrator timeout/polling is configured correctly
2. ❌ **Redis coordination conflicts** - Trigger.dev mode doesn't use Redis at all
3. ❌ **V4 API breaking changes** - Already fixed (`batchHandle.runs ?? []`)
4. ❌ **Task registration** - All tasks are properly exported
5. ❌ **Infrastructure issues** - All 9 containers running healthy

---

## Required Changes Summary

| Change | File | Lines | Effort |
|--------|------|-------|--------|
| Integrate real test runner | cfn-orchestrator.ts | 357-385 | 20 min |
| Add debug logging for API key | cfn-implementer.ts | 113-117 | 5 min |
| Validate via UI test | N/A | N/A | 10 min |

**Total effort**: ~35 minutes of focused work after validation

---

## Next Actions

1. **Immediate**: Execute Step 1 (single agent validation via UI)
2. **If Step 1 fails**: Debug API key propagation
3. **If Step 1 succeeds**: Execute Step 2 (integrate test runner)
4. **Finally**: Execute Step 3 (end-to-end test)

---

## Investigation Team

- **CLI Expert**: Analyzed cfn-implementer CLI spawning and Redis coordination paths
- **Trigger Expert**: Verified v4 API usage and task registration
- **Root Cause Analyst**: Traced execution path and identified true blockers

All three investigations reached consistent conclusions independently.
