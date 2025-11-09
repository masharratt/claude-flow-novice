# CFN Loop CLI Mode - OurStories Team Feedback Response

**Date:** 2025-11-09
**Version:** 3.1.0
**Feedback Source:** OurStories Team Production Testing

---

## Executive Summary

The OurStories team has identified three critical issues with CFN Loop CLI mode execution:

1. **Auto-Execution Gap:** SlashCommand returns instructions but doesn't auto-execute coordinator
2. **Resource Exhaustion:** Fork failures due to WSL2 process limit exhaustion
3. **Task Context Loss:** Task description not passed to coordinator properly

**Status:** All issues confirmed. Fixes outlined below with implementation priority.

---

## Issue #1: Auto-Execution Gap (HIGH PRIORITY)

### Problem Statement

**Current Behavior:**
```
User: /cfn-loop-cli "Fix TypeScript errors"
↓
SlashCommand tool processes command
↓
Returns execution instructions to Main Chat
↓
⚠️ STOPS HERE - Main Chat doesn't auto-execute
```

**Expected Behavior:**
```
User: /cfn-loop-cli "Fix TypeScript errors"
↓
SlashCommand tool processes command
↓
Main Chat automatically executes returned bash command
↓
Coordinator spawns with proper context
```

### Root Cause

**Documentation states (line 370-376):**
```bash
# Main Chat should execute this command after processing slash command
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}" \
  --context "TASK_DESCRIPTION='...' MODE='standard' MAX_ITERATIONS=10" \
  --timeout 300 \
  --background=true
```

**Problem:** "should execute" is ambiguous - Main Chat doesn't know whether to:
- Automatically execute the command
- Wait for user to manually execute
- Expect SlashCommand to auto-execute

### Solution

**Option A: Auto-Execution Pattern (RECOMMENDED)**

Update `.claude/commands/cfn-loop-cli.md` to include explicit auto-execution instructions:

```markdown
## 🚨 EXECUTION INSTRUCTIONS (Internal Use)

**IMPORTANT: Main Chat MUST auto-execute coordinator spawn after SlashCommand returns.**

**Step 1: SlashCommand Processing**
The SlashCommand tool processes `/cfn-loop-cli` and extracts parameters.

**Step 2: Automatic Coordinator Spawn (REQUIRED)**
Main Chat MUST immediately execute the following Bash command with background=true:

```bash
# Auto-execute this command (DO NOT wait for user confirmation)
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
TASK_DESCRIPTION="$ARGUMENTS"
MODE="${mode:-standard}"
MAX_ITERATIONS="${maxIterations:-10}"

npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS" \
  --timeout 300 \
  --background=true
```

**Step 3: Monitor Progress**
After spawning coordinator, Main Chat should inform user:
```
✅ CFN Loop coordinator spawned with task ID: $TASK_ID
📊 Monitor progress: redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"
🌐 Web dashboard: http://localhost:3000
```
```

**Implementation Changes Required:**

1. **Update command documentation (cfn-loop-cli.md:342-457):**
   - Add explicit "MUST auto-execute" language
   - Remove ambiguous "should execute" wording
   - Add step-by-step execution pattern

2. **Update CLAUDE.md delegation guidance:**
   - Add auto-execution requirement for CLI commands
   - Clarify SlashCommand → Bash tool pattern

3. **Add validation check:**
   - Main Chat should verify coordinator spawn succeeded
   - Report task ID to user for monitoring

**Alternative Option B: User Manual Execution (NOT RECOMMENDED)**

Require user to manually execute coordinator spawn command:

```
User: /cfn-loop-cli "Fix TypeScript errors"
Main Chat: "Please execute this command to start CFN Loop:"
[Bash command displayed to user]
User: [Manually copies and executes]
```

**Why Not Recommended:**
- Poor user experience (extra manual step)
- Breaks automation workflow
- Inconsistent with other slash commands
- Defeats purpose of slash command abstraction

---

## Issue #2: Resource Exhaustion (CRITICAL)

### Problem Statement

```bash
fork: Resource temporarily unavailable
```

**Impact:**
- Cannot spawn new bash processes
- Orchestrator fails to spawn Loop 3 agents
- CFN Loop execution halts completely
- WSL2 environment unusable

### Root Cause Analysis

**WSL2 Default Limits:**
```bash
# WSL2 default process limit (varies by system)
ulimit -u  # User process limit: typically 7164-15644

# Current session
ps aux | wc -l  # Active processes during failure: likely >7000
```

**Contributing Factors:**

1. **Background Process Accumulation:**
   - CLI mode spawns agents with `--background=true`
   - Background processes not cleaned up properly
   - Redis pub/sub listeners remain active
   - Orphaned node processes from failed iterations

2. **Orchestrator Spawning Pattern:**
   ```bash
   # Each Loop 3 agent spawned as background process
   for agent in $LOOP3_AGENTS; do
     npx claude-flow-novice agent "$agent" \
       --task-id "$TASK_ID" \
       --background=true &  # Creates new process
   done

   # Each Loop 2 validator spawned as background process
   for validator in $LOOP2_AGENTS; do
     npx claude-flow-novice agent "$validator" \
       --task-id "$TASK_ID" \
       --background=true &  # Creates another process
   done

   # Product Owner spawned as background process
   npx claude-flow-novice agent product-owner \
     --task-id "$TASK_ID" \
     --background=true &  # Yet another process
   ```

3. **Multiple Iterations:**
   - Standard mode: up to 10 iterations
   - Each iteration spawns 5-8 agents
   - 10 iterations × 7 agents = 70 background processes
   - Plus Redis listeners, monitoring processes, etc.

4. **No Process Cleanup:**
   - Completed agents don't terminate properly
   - `--background=true` processes remain in process table
   - No explicit cleanup in orchestrate.sh

### Solution: Comprehensive Process Management

**Immediate Fix (CRITICAL - Deploy Today):**

Create `.claude/skills/cfn-loop-orchestration/cleanup-background-processes.sh`:

```bash
#!/bin/bash
# Cleanup background processes for a specific task

set -euo pipefail

TASK_ID="${1:-}"
if [[ -z "$TASK_ID" ]]; then
    echo "Usage: cleanup-background-processes.sh TASK_ID"
    exit 1
fi

# Kill all background agent processes for this task
pkill -f "claude-flow-novice agent.*--task-id $TASK_ID" || true

# Wait for processes to terminate
sleep 2

# Force kill any remaining processes
pkill -9 -f "claude-flow-novice agent.*--task-id $TASK_ID" || true

# Clean up orphaned node processes
pgrep -f "node.*claude-flow-novice" | while read pid; do
    # Check if process is orphaned (parent PID = 1)
    if ps -o ppid= -p "$pid" | grep -q "^ *1$"; then
        kill -9 "$pid" 2>/dev/null || true
    fi
done

echo "✅ Background processes cleaned up for task: $TASK_ID"
```

**Update orchestrate.sh to cleanup after each iteration:**

```bash
# Add at end of orchestrate.sh iteration loop
cleanup_iteration() {
    local iteration=$1

    # Kill completed agents
    for agent_id in $(redis-cli LRANGE "swarm:${TASK_ID}:completed" 0 -1); do
        pkill -f "claude-flow-novice agent.*--agent-id $agent_id" || true
    done

    # Remove completed agents from process table
    echo "✅ Iteration $iteration cleanup complete"
}

# Call after each iteration
cleanup_iteration "$iteration"
```

**Long-Term Fix (Target: v3.2.0):**

1. **Process Pool Management:**
   - Limit concurrent background processes (max 10)
   - Queue additional agents for sequential execution
   - Reuse process slots from completed agents

2. **Explicit Process Lifecycle:**
   ```bash
   # Spawn with trap for cleanup
   (
       trap 'cleanup_agent "$AGENT_ID"' EXIT
       npx claude-flow-novice agent "$agent_type" \
         --task-id "$TASK_ID" \
         --agent-id "$AGENT_ID"
   ) &
   ```

3. **WSL2 Resource Limits:**
   - Document required ulimit settings
   - Add pre-flight resource checks
   - Fail fast if insufficient resources

4. **Monitoring Dashboard:**
   - Show active process count
   - Alert when approaching limits
   - Auto-cleanup on threshold

**Workaround for OurStories Team (Immediate):**

```bash
# Before running CFN Loop, increase process limits
ulimit -u 15000

# After each CFN Loop execution, cleanup
pkill -f "claude-flow-novice agent" || true

# Monitor process count
watch -n 5 'ps aux | grep node | wc -l'
```

---

## Issue #3: Task Context Loss (HIGH PRIORITY)

### Problem Statement

**Expected:**
```bash
# Coordinator receives task description
TASK_DESCRIPTION="Fix TypeScript errors in auth module"
```

**Actual:**
```bash
# Coordinator receives empty or default values
TASK_DESCRIPTION=""  # or generic fallback
```

**Impact:**
- Wrong agents spawned for task
- Generic implementation instead of task-specific
- Validation failures due to scope mismatch
- Wasted iterations and API costs

### Root Cause

**SlashCommand Processing (cfn-loop-cli.md:354-365):**
```bash
# Extract task description and mode from slash command
TASK_DESCRIPTION="$ARGUMENTS"  # ⚠️ $ARGUMENTS not passed to coordinator
MODE="${mode:-standard}"
MAX_ITERATIONS="${maxIterations:-10}"

# Spawn coordinator via CLI (background execution)
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS" \
  --timeout 300 \
  --background=true
```

**Problem:** `$ARGUMENTS` variable not available in Main Chat context after SlashCommand returns.

### Solution

**Fix 1: Explicit Task Description Passing**

Update cfn-loop-cli.md execution instructions:

```bash
## 🚨 EXECUTION INSTRUCTIONS (Internal Use)

**Main Chat MUST extract task description from slash command arguments:**

```bash
# Step 1: Extract arguments from slash command
# When user runs: /cfn-loop-cli "Fix TypeScript errors" --mode=standard
# $ARGUMENTS contains: "Fix TypeScript errors"

# Step 2: Parse arguments
TASK_DESCRIPTION="Fix TypeScript errors"  # Extract from $ARGUMENTS
MODE="standard"                            # Extract from --mode flag
MAX_ITERATIONS="10"                        # Extract from --max-iterations or default

# Step 3: Generate task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"

# Step 4: Spawn coordinator with explicit context
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS" \
  --timeout 300 \
  --background=true

# Step 5: Verify context was stored
redis-cli HGET "cfn_loop:task:$TASK_ID:context" "TASK_DESCRIPTION"
# Expected output: "Fix TypeScript errors"
```
```

**Fix 2: Add Context Validation**

Coordinator should validate context on startup:

```bash
# In cfn-v3-coordinator agent
validate_context() {
    local task_id="$1"

    # Check if context exists
    if ! redis-cli EXISTS "cfn_loop:task:$task_id:context" >/dev/null; then
        echo "❌ ERROR: No context found for task $task_id"
        exit 1
    fi

    # Check if TASK_DESCRIPTION is set
    local desc=$(redis-cli HGET "cfn_loop:task:$task_id:context" "TASK_DESCRIPTION")
    if [[ -z "$desc" || "$desc" == "null" ]]; then
        echo "❌ ERROR: TASK_DESCRIPTION is empty"
        echo "Context must include task description for proper agent selection"
        exit 1
    fi

    echo "✅ Context validated: $desc"
}

# Call at coordinator startup
validate_context "$TASK_ID"
```

**Fix 3: Enhanced Error Messaging**

When context is missing, provide actionable guidance:

```bash
if [[ -z "$TASK_DESCRIPTION" ]]; then
    cat <<EOF
❌ ERROR: Task description not found

This usually happens when:
1. SlashCommand didn't pass task description to coordinator
2. Context not stored in Redis before spawning
3. Task ID mismatch between spawn and context

DEBUG STEPS:
1. Check Redis context: redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"
2. Verify task ID matches spawn command
3. Re-run with explicit context: --context "TASK_DESCRIPTION='your task here'"

MANUAL FIX:
redis-cli HSET "cfn_loop:task:$TASK_ID:context" TASK_DESCRIPTION "Fix TypeScript errors"
EOF
    exit 1
fi
```

---

## Implementation Priority

### Immediate (Deploy Today)

1. **Resource Exhaustion Fix:**
   - Create cleanup-background-processes.sh script
   - Document WSL2 ulimit workaround
   - Add to troubleshooting guide

2. **Task Context Validation:**
   - Add context validation to coordinator startup
   - Enhanced error messaging with debug steps

### High Priority (This Week)

1. **Auto-Execution Pattern:**
   - Update cfn-loop-cli.md with explicit auto-execute instructions
   - Remove ambiguous "should execute" language
   - Add step-by-step execution guide

2. **Task Context Passing:**
   - Fix argument extraction in slash command
   - Add Redis context verification step
   - Update coordinator to validate context on startup

### Medium Priority (Next Sprint)

1. **Process Pool Management:**
   - Limit concurrent background processes
   - Implement cleanup after each iteration
   - Add resource monitoring to web portal

2. **Documentation Updates:**
   - Clarify auto-execution pattern in CLAUDE.md
   - Add troubleshooting guide for resource exhaustion
   - Document WSL2 configuration requirements

---

## Testing Recommendations

### Test Case 1: Auto-Execution Verification

```bash
# Run slash command
/cfn-loop-cli "Simple test task" --mode=mvp

# Expected: Coordinator spawns automatically within 5 seconds
# Verify: pgrep -f "cfn-v3-coordinator" returns PID
# Verify: redis-cli HGET "cfn_loop:task:$TASK_ID:context" "TASK_DESCRIPTION" returns task
```

### Test Case 2: Resource Exhaustion Prevention

```bash
# Before: Check process count
ps aux | grep node | wc -l

# Run long task with multiple iterations
/cfn-loop-cli "Complex task requiring 10 iterations" --mode=standard

# During: Monitor process count (should not exceed 20)
watch -n 5 'ps aux | grep node | wc -l'

# After: Verify cleanup
# Expected: Process count returns to baseline
```

### Test Case 3: Task Context Preservation

```bash
# Run with specific task description
/cfn-loop-cli "Fix authentication bug in user-service.ts" --mode=standard

# Verify context in Redis
TASK_ID=$(redis-cli KEYS "cfn_loop:task:*:context" | head -1 | cut -d: -f3)
redis-cli HGET "cfn_loop:task:$TASK_ID:context" "TASK_DESCRIPTION"

# Expected: "Fix authentication bug in user-service.ts"
```

---

## Rollout Plan

### Phase 1: Immediate Fixes (Today)

- [ ] Create cleanup-background-processes.sh
- [ ] Update orchestrate.sh with iteration cleanup
- [ ] Document WSL2 ulimit workaround
- [ ] Add context validation to coordinator

### Phase 2: Documentation (This Week)

- [ ] Update cfn-loop-cli.md with auto-execute pattern
- [ ] Update CLAUDE.md with slash command execution guidance
- [ ] Add troubleshooting section for resource issues
- [ ] Create quick reference guide for OurStories team

### Phase 3: Long-Term Improvements (Next Sprint)

- [ ] Process pool management implementation
- [ ] Resource monitoring in web portal
- [ ] Automatic cleanup on process threshold
- [ ] Enhanced error recovery patterns

---

## Contact & Feedback

**CFN Team Lead:** [Your Name]
**Slack Channel:** #cfn-loop-support
**Documentation:** `.claude/commands/cfn-loop-cli.md`

**For OurStories Team:**
- Report issues: GitHub Issues with `cfn-loop-cli` label
- Questions: Slack #cfn-loop-support
- Emergency: Page on-call via PagerDuty

---

**Last Updated:** 2025-11-09
**Next Review:** 2025-11-16 (Post-implementation validation)
