# BUG #24: Context Parameter Not Injected as Environment Variables

**Status:** CRITICAL
**Priority:** P0
**Found:** 2025-11-18
**Phase:** Integration Testing (BUG #23 validation)

## Summary

CLI mode coordinator spawned via `npx claude-flow-novice agent` with `--context` parameter does NOT receive environment variables inside agent execution. This causes `TASK_ID`, `MODE`, and other critical parameters to be empty/undefined during orchestrator invocation.

## Root Cause

**Expected Behavior:**
```bash
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='...' MODE='mvp' TASK_ID='$TASK_ID'"
```

Should inject environment variables into agent's Bash tool execution:
- `$TASK_DESCRIPTION` = "Create a hello world function..."
- `$MODE` = "mvp"
- `$TASK_ID` = "cfn-e2e-test-1763530743-86766"

**Actual Behavior:**
All context variables are **empty/undefined** inside coordinator agent Bash tool calls:
```bash
🔍 Environment variables:
SDK_INTEGRATION_MODE=full
✅ Variable validation:
   TASK_ID: 'MISSING'    # ❌ Should be 'cfn-e2e-test-1763530743-86766'
   MODE: 'MISSING'       # ❌ Should be 'mvp'
   MAX_ITERATIONS: 'MISSING'  # ❌ Should be '5'
```

## Impact

### Severity: CRITICAL

1. **Orchestrator cannot be invoked** - Empty `TASK_ID` fails validation
2. **BUG #23 fix cannot be tested** - Redis storage works, but empty parameters prevent testing
3. **All CLI mode E2E tests fail** - Cannot validate coordinator → orchestrator → agent workflow
4. **Production CLI mode is broken** - `/cfn-loop-cli` command cannot execute

### Affected Components

- CLI agent command builder (`src/cli/agent-command.ts`)
- CLI agent executor (`src/cli/agent-executor.ts`)
- cfn-v3-coordinator agent profile
- All E2E tests using `--context` parameter

## Evidence

### Test Execution Log

```
[agent-executor] Executing agent via API: cfn-v3-coordinator
[agent-executor] Agent ID: cfn-v3-coordinator-1
[agent-executor] Model: sonnet

[Tool: Bash] 🔧 Setting mode from task environment: MODE='mvp'
🔍 Environment variables:
SDK_INTEGRATION_MODE=full
✅ Variable validation:
   TASK_ID: 'MISSING'
   MODE: 'mvp'          # Set INSIDE bash, not from context
   MAX_ITERATIONS: 'MISSING'
🎯 Orchestrator path: /mnt/c/.../orchestrate.sh
❌ Cannot execute orchestrator - missing prerequisites
```

### Redis Verification

Success criteria WAS stored (proving Redis connectivity works):
```bash
$ redis-cli HGETALL "swarm::context"
task_description
                          # Empty because TASK_ID is empty
max_iterations
                          # Empty
mode
mvp
success-criteria
{...}                     # JSON stored correctly
```

Key pattern: `swarm::context` instead of `swarm:cfn-e2e-test-1763530743-86766:context`
- Proves `TASK_ID` was empty when Redis keys were created

## BUG #22 & #23 Status

### BUG #22: ✅ FIXED
- **Issue:** `shell=/bin/bash` not set in agent profiles
- **Fix:** Updated agent profiles to use `/bin/bash`
- **Evidence:** No `[[: not found` errors in logs

### BUG #23: ✅ FIXED (but cannot test)
- **Issue:** Parameters not persistent across Bash tool calls
- **Fix:** Redis-first storage in coordinator Steps 1, 2, 2.5, 3
- **Evidence:** Redis storage commands executed successfully
- **Blocker:** Cannot validate full workflow due to BUG #24

## Investigation Path

### Check CLI Agent Command Builder

File: `src/cli/agent-command.ts`

Need to verify:
1. How `--context` parameter is parsed
2. How context variables are injected into agent environment
3. Whether Bash tool receives environment from `--context`

### Check CLI Agent Executor

File: `src/cli/agent-executor.ts`

Need to verify:
1. How agent system prompt is built (includes context?)
2. How Bash tool execution environment is set up
3. Whether `--context` variables are passed to tool execution

### Check Agent Prompt Builder

File: `src/cli/agent-prompt-builder.ts`

Need to verify:
1. Whether context is included in system prompt
2. Whether context variables are documented for agent
3. Whether agent knows how to access context variables

## Reproduction Steps

1. Run E2E test:
   ```bash
   bash tests/cli-mode/core/e2e/test-full-loop3-agent-spawning.sh
   ```

2. Check coordinator log:
   ```bash
   cat /tmp/cfn-e2e-test-coordinator.log | grep "TASK_ID"
   ```

3. Verify Redis keys:
   ```bash
   redis-cli KEYS "swarm:*"
   # Should show: swarm::context (WRONG - empty TASK_ID)
   # Expected: swarm:cfn-e2e-test-1763530743-86766:context
   ```

## Fix Requirements

### Phase 1: Diagnose Context Injection
- [ ] Read `src/cli/agent-command.ts` - parse `--context` parameter
- [ ] Read `src/cli/agent-executor.ts` - environment injection
- [ ] Read `src/cli/agent-prompt-builder.ts` - context in system prompt
- [ ] Identify WHERE context variables should be injected

### Phase 2: Implement Fix
- [ ] Inject `--context` variables as environment for Bash tool
- [ ] OR document context variables in system prompt for agent to parse
- [ ] OR pass context via alternative mechanism (Redis? File?)
- [ ] Add context validation to CLI agent spawning

### Phase 3: Validate Fix
- [ ] Run E2E test - coordinator receives `TASK_ID`
- [ ] Check Redis keys use correct task ID
- [ ] Verify orchestrator invocation succeeds
- [ ] Confirm Loop 3 agent spawning works

## Workaround (Temporary)

For testing BUG #23 fix without fixing BUG #24:

**Option A: Use environment variables instead of `--context`**
```bash
export TASK_ID="cfn-e2e-test-$(date +%s)-$$"
export MODE="mvp"
export MAX_ITERATIONS=5
export TASK_DESCRIPTION="Create a hello world function"

npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --timeout 300
```

**Option B: Modify coordinator to read from Redis-only**
- Remove reliance on environment variables
- Read ALL parameters from Redis at startup
- Requires test to pre-populate Redis before spawning coordinator

## Related Issues

- **BUG #22:** Shell parameter fixes (✅ FIXED)
- **BUG #23:** Redis-first parameter storage (✅ FIXED, blocked by #24)
- **BUG #21:** Production testing requirements (led to discovery of #22, #23, #24)

## Next Steps

1. **IMMEDIATE:** Investigate context injection mechanism in CLI agent execution
2. **URGENT:** Implement fix for context environment variable injection
3. **VALIDATE:** Re-run E2E test to confirm BUG #23 fix works end-to-end
4. **DOCUMENT:** Update CLI mode documentation with context parameter usage

## Test Coverage Gap

**Current:** E2E test validates coordinator spawning, but cannot validate orchestrator invocation due to missing context.

**Required:** E2E test that validates FULL workflow:
1. Coordinator spawns with context variables
2. Coordinator receives `TASK_ID`, `MODE`, etc.
3. Coordinator invokes orchestrator with parameters
4. Orchestrator spawns Loop 3 agents
5. Agents complete work

**Blocked by:** BUG #24 context injection failure

---

**Confidence:** 0.95 (issue clearly identified, root cause isolated, fix requirements documented)
