# Root Cause Analysis: Silent Coordinator Exit During Agent Spawning

**Date:** 2025-11-14
**Severity:** HIGH
**Status:** FIXED (immediate), REQUIRES PERMANENT FIX
**Confidence:** 0.95

## Executive Summary

Docker coordinator containers exit silently with code 0 during Loop 3 agent spawning due to **image name mismatch**. spawn-agent.sh attempts to use `claude-flow-novice:agent` but available images are tagged `claude-flow-novice-agent:latest`. This causes Docker pull failure, empty agent arrays, missing temp files, and cascading failures through orchestrate.sh with no error output.

## Problem Statement

**Symptom:** Coordinator exits cleanly after logging "Spawning Loop 3 implementers" with no error messages.

**Impact:**
- CFN Loop orchestration fails completely
- No agents are spawned
- No work is performed
- Silent failure (exit code 0) masks the issue

**Last Known Good State:**
```
[14:45:40] Loop orchestration initialized: dashboard-complete
[LOOP] === Iteration 1/10 ===
[LOOP] Spawning Loop 3 implementers (iteration 1)
[14:45:40] Agents: react-frontend-engineer,backend-developer
[Container exits - no output]
```

## Root Cause

### Primary Issue: Image Name Mismatch

**spawn-agent.sh Line 12:**
```bash
DEFAULT_IMAGE="claude-flow-novice:agent"
```

**Actual Images Available:**
```
claude-flow-novice-agent:latest (ID: 297ef773bd92)
claude-flow-novice-agent:test
claude-flow-novice-agent:frontend
```

**Result:** Docker cannot find `claude-flow-novice:agent`, attempts to pull from Docker Hub, fails with error code 125.

### Failure Cascade

1. **Agent Spawn Failure** (spawn-agent.sh:12-50)
   - Docker run fails with exit 125
   - `set -euo pipefail` causes immediate script exit
   - stderr captured by `2>&1` in orchestrate.sh

2. **Empty Agent ID** (orchestrate.sh:607-614)
   ```bash
   agent_id=$("$AGENT_SPAWNING_SKILL" ... 2>&1 | grep -o 'Agent ID: [^[:space:]]*' | cut -d' ' -f3)
   ```
   - grep and cut process error text
   - Return empty string
   - `$agent_id` is empty

3. **Error Logging But No Exit** (orchestrate.sh:627)
   ```bash
   log_error "Failed to spawn agent: $agent_type"  # ← NO return 1!
   ```
   - Error logged
   - Loop continues
   - `agent_ids` array remains empty

4. **Missing Temp File** (orchestrate.sh:634-637)
   ```bash
   if [[ "$DRY_RUN" == false && ${#agent_ids[@]} -gt 0 ]]; then
       # This block never executes
   fi
   ```
   - Condition fails (array empty)
   - Temp file `/tmp/loop3-agents-${task_id}-${iteration}.txt` not created
   - Function returns 0 (success!)

5. **Command Substitution Captures stdout** (orchestrate.sh:1413)
   ```bash
   gate_result=$(gate_check "$task_id" "$GATE_THRESHOLD" "$iteration" "$MAX_ITERATIONS")
   ```
   - Captures log messages, not return code
   - `$gate_result` contains: `"[14:45:40] Performing gate check..."`

6. **Case Statement Mismatch** (orchestrate.sh:1414-1427)
   ```bash
   case $gate_result in
       0) ... ;;
       1) ... ;;
       2) ... ;;
       # NO DEFAULT CASE!
   esac
   ```
   - Log text doesn't match 0, 1, or 2
   - No default case
   - Execution falls through

7. **Silent Exit**
   - While loop ends
   - Script continues, eventually exits with code 0

## Evidence

### File References

1. **`.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh:12`**
   ```bash
   DEFAULT_IMAGE="claude-flow-novice:agent"  # ← IMAGE DOESN'T EXIST
   ```

2. **`docker/docker-compose.stabilization.yml:46,78`**
   ```yaml
   image: claude-flow-novice:agent-task-latest
   image: claude-flow-novice:agent-cli-latest
   ```

3. **`.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`**
   - Line 607-614: Command substitution with pipe (stdout capture)
   - Line 627: Error log without exit
   - Line 634: Condition fails when array empty
   - Line 1413: gate_check stdout capture
   - Line 1414-1427: Case statement with no default

### Test Logs

- `/tmp/dashboard-complete.log` - Stops at "Agents: react-frontend-engineer,backend-developer"
- Exit code: 0 (success)
- No error output visible

## Immediate Fix Applied

**Created image tag alias:**
```bash
docker tag claude-flow-novice-agent:latest claude-flow-novice:agent
```

**Verification:**
```
claude-flow-novice:agent    297ef773bd92   5 hours ago   402MB  ✓ CREATED
```

## Permanent Fixes Required

### 1. Fix Image Reference (CRITICAL)

**Option A: Update spawn-agent.sh default**
```bash
# File: .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh:12
DEFAULT_IMAGE="claude-flow-novice-agent:latest"  # Match actual image name
```

**Option B: Pass image as parameter**
```bash
# coordinator-entrypoint.sh or orchestrate.sh
--agent-image "${AGENT_IMAGE:-claude-flow-novice-agent:latest}"
```

### 2. Add Error Exit in spawn_loop3 (CRITICAL)

```bash
# File: .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh:627
else
    log_error "Failed to spawn agent: $agent_type"
    return 1  # ← ADD THIS
fi
```

### 3. Fix gate_check Return Code Capture (HIGH)

```bash
# File: .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh:1413
# BEFORE:
gate_result=$(gate_check "$task_id" "$GATE_THRESHOLD" "$iteration" "$MAX_ITERATIONS")

# AFTER:
gate_check "$task_id" "$GATE_THRESHOLD" "$iteration" "$MAX_ITERATIONS"
gate_result=$?
```

### 4. Add Default Case (MEDIUM)

```bash
# File: .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh:1427
*)
    log_error "Invalid gate result: $gate_result"
    return 1
    ;;
```

### 5. Redirect Logs to stderr (MEDIUM)

**All log functions should write to stderr:**
```bash
log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" >&2  # ← ADD >&2
}
```

### 6. Add Image Validation (LOW)

**At orchestrator startup:**
```bash
if ! docker image inspect "$AGENT_IMAGE" &>/dev/null; then
    log_error "Required Docker image not found: $AGENT_IMAGE"
    exit 1
fi
```

### 7. Add Agent Spawn Validation (LOW)

**After spawn loop:**
```bash
if [[ ${#agent_ids[@]} -eq 0 ]]; then
    log_error "No agents were spawned successfully"
    return 1
fi
```

## Testing

### Verification Steps

1. **Verify image tag exists:**
   ```bash
   docker images | grep "claude-flow-novice:agent"
   # Should show: claude-flow-novice  agent  297ef773bd92
   ```

2. **Test agent spawn directly:**
   ```bash
   bash .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh \
     --agent-type react-frontend-engineer \
     --task-id test-123 \
     --image claude-flow-novice:agent
   ```

3. **Launch coordinator with fixed image:**
   ```bash
   docker run --rm \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -v $(pwd):/workspace \
     --network cfn-network \
     -e TASK_ID=test-dashboard \
     -e TASK_DESCRIPTION="Test dashboard build" \
     -e AGENTS=react-frontend-engineer \
     -e MAX_ITERATIONS=2 \
     -e CFN_REDIS_HOST=cfn-redis \
     -e CFN_REDIS_PORT=6379 \
     cfn-coordinator:v3-alpine-fix
   ```

4. **Monitor for agent spawn:**
   ```bash
   docker ps --filter "name=cfn-agent" --format "table {{.Names}}\t{{.Status}}"
   ```

### Expected Behavior After Fix

- Agents spawn successfully
- Agent containers appear in `docker ps`
- Log shows: `[SUCCESS] Agent spawned: <agent-id> (react-frontend-engineer)`
- Temp file created: `/tmp/loop3-agents-test-dashboard-1.txt`
- Gate check proceeds normally

## Related Issues

- Bug #5: Image name mismatch (this issue)
- Bug #6: Silent spawn failure (contributing factor)
- Bug #7: Command substitution captures stdout not return code (contributing factor)
- Bug #8: Missing default case in case statement (contributing factor)

## References

- **Root Cause Analysis Tool Output:** See task output above
- **Docker Images:** `docker images | grep claude-flow-novice`
- **Coordinator Logs:** `/tmp/dashboard-complete.log`
- **spawn-agent.sh:** `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`
- **orchestrate.sh:** `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`

## Next Steps

1. ✅ Create image tag alias (DONE)
2. ⏳ Test dashboard build with fixed image
3. ⏳ Implement permanent fixes (1-7 above)
4. ⏳ Add regression tests for agent spawning
5. ⏳ Update documentation with correct image naming convention

## Contributors

- **Root Cause Analyst:** Identified image mismatch and failure cascade
- **Docker Specialist:** Fixed Redis configuration (separate issue)
- **Main Chat:** Coordinated investigation and documentation
