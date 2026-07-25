# P5-P7 Implementation Plan - Ready for Execution

**Date:** 2025-10-21
**Status:** 📋 PLANNING COMPLETE - READY FOR IMPLEMENTATION
**Files Verified:** ✅ All target files exist
**Estimated Effort:** 3-3.5 days

---

## File Verification

✅ **Coordinator:** `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md` (688 lines)
✅ **Loop 3 Processing:** `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/loop3-output-processing/`
✅ **Loop 2 Processing:** `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/loop2-output-processing/`
✅ **Redis Scripts:** `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/redis-coordination/`

---

## P5: Coordinator Simplification (688 → ~200 lines)

### Current State Analysis

**File:** `cost-savings-cfn-loop-coordinator.md`
**Current Size:** 688 lines
**Target Size:** 200 lines (71% reduction)

### Responsibilities to Remove

Based on handoff document analysis:

1. **Context Extraction (Lines ~23-200)**
   - Epic goal extraction
   - Deliverables parsing
   - In-scope/out-of-scope categorization
   - Acceptance criteria extraction
   - Phase name extraction
   - JSON conversion logic

   **Action:** Delete entire Step 1 section
   **Reason:** Orchestrator can extract context directly from task description parameter

2. **Agent Selection Logic (Lines ~201-350)**
   - Language detection
   - Framework detection
   - Agent type selection
   - Specialist routing

   **Action:** Delete Step 2 section
   **Reason:** Orchestrator has built-in agent selection (Loop 3/2 agents passed as parameters)

### New Coordinator Responsibilities (Keep)

1. **Task Reception** - Receive task description from slash command
2. **Orchestrator Invocation** - Launch orchestrator in background with full task description
3. **Status Monitoring** - Check Redis status every 30-60 seconds (P1 implementation)
4. **Completion Reporting** - Report final results to user

### Implementation Steps

#### Step 1: Create Backup
```bash
cp cost-savings-cfn-loop-coordinator.md cost-savings-cfn-loop-coordinator.md.backup-p5
```

#### Step 2: Simplify to Core Pattern
New coordinator structure (~200 lines):

```markdown
---
name: "cost-savings-cfn-loop-coordinator"
description: "Simplified CFN Loop Coordinator - monitoring only"
tools: Bash
---

# Cost-Savings CFN Loop Coordinator

## Role
Monitor CFN Loop orchestrator execution and report results.

## Execution Pattern

### Message 1: Launch Orchestrator

**CRITICAL: Background execution required**

```tool_calls
<Bash
  command="
    TASK_ID=\"cfn-$(date +%s)\"

    # Launch orchestrator with FULL task description
    /path/to/orchestrate-cfn-loop.sh \
      --task-id \"$TASK_ID\" \
      --task-description \"$TASK_DESCRIPTION\" \
      --mode standard \
      --loop3-agents coder \
      --loop2-agents reviewer \
      --product-owner product-owner \
      --max-iterations 10 &

    echo \"Orchestrator launched: $TASK_ID\"
    echo \"$TASK_ID\" > /tmp/current-task-id.txt
  "
  run_in_background="true"
  description="Launch CFN Loop orchestrator"
/>
</tool_calls>

### Messages 2-N: Monitor Status (Every 30-60s)

**CRITICAL: 3 tool calls per message**

```tool_calls
<Bash command="redis-cli GET 'swarm:${TASK_ID}:status'" description="Check status" />
<Bash command="redis-cli LLEN 'swarm:${TASK_ID}:metrics:iteration_start'" description="Get iteration" />
<Bash command="sleep 30" description="Wait before next check" />
</tool_calls>

Continue until status = "complete" or "failed"

### Final Message: Report Results

Query final metrics and report to user.
```

#### Step 3: Update Orchestrator to Accept --task-description

**File:** `orchestrate-cfn-loop.sh`
**Change:** Add parameter parsing for `--task-description`

```bash
# Add to parameter parsing section
--task-description)
  TASK_DESCRIPTION="$2"
  shift 2
  ;;
```

**Add context extraction function** (moved from coordinator):

```bash
extract_context_from_task() {
  local TASK_DESC="$1"

  # Extract epic goal
  EPIC_GOAL=$(echo "$TASK_DESC" | head -1)

  # Extract deliverables
  DELIVERABLES=$(echo "$TASK_DESC" | grep -E '\.(md|sh|ts|tsx|js|rs|py)')

  # Build JSON contexts
  EPIC_CONTEXT=$(jq -nc --arg goal "$EPIC_GOAL" '{epicGoal: $goal, inScope: [], outOfScope: []}')

  # Store in Redis
  echo "$EPIC_CONTEXT" | redis-cli -x SET "swarm:${TASK_ID}:epic-context"
}

# Call before spawning agents
if [ -n "$TASK_DESCRIPTION" ]; then
  extract_context_from_task "$TASK_DESCRIPTION"
fi
```

### Testing P5

```bash
# Test simplified coordinator
/cfn-loop "Create /tmp/p5-test.txt with 'P5 works'"

# Verify:
# 1. Coordinator launches orchestrator in background
# 2. Coordinator monitors via Redis (3 tool calls every 30-60s)
# 3. Orchestrator extracts context from task description
# 4. Final result reported
```

### Expected Results

- **Coordinator:** 688 → ~200 lines (71% reduction)
- **Orchestrator:** +50 lines (context extraction function)
- **Net reduction:** ~440 lines
- **Simpler maintenance:** Context extraction in one place (orchestrator)

---

## P6: Unified Agent Spawning (~1 day)

### Current State

**3 Different Spawning Patterns:**

1. **Loop 3 Processing:** `loop3-output-processing/skill-based-v2.sh`
2. **Loop 2 Processing:** `loop2-output-processing/parallel-validation.sh`
3. **Direct spawning:** In orchestrator (Product Owner)

### Target State

**1 Unified Function** in orchestrator:

```bash
spawn_and_parse_agent() {
  local AGENT_TYPE=$1
  local TASK_ID=$2
  local AGENT_ID=$3
  local CONTEXT=$4
  local TIMEOUT=$5

  echo "[Spawn] ${AGENT_ID} (timeout: ${TIMEOUT}s)"

  # Spawn agent
  timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --context "$CONTEXT" 2>&1 || true

  EXIT_CODE=$?

  # Parse results from Redis
  CONFIDENCE=$(redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:confidence")
  DONE_SIGNAL=$(redis-cli lpop "swarm:${TASK_ID}:${AGENT_ID}:done")

  # Return status
  if [ "$EXIT_CODE" -eq 0 ] && [ "$DONE_SIGNAL" = "complete" ]; then
    echo "✅ ${AGENT_ID} complete (confidence: ${CONFIDENCE})"
    return 0
  else
    echo "❌ ${AGENT_ID} failed (exit: ${EXIT_CODE})"
    return 1
  fi
}
```

### Implementation Steps

#### Step 1: Add Function to Orchestrator

Insert `spawn_and_parse_agent()` function after initialization section (~line 100)

#### Step 2: Replace Loop 3 Skill Calls

**Before:**
```bash
./.claude/skills/loop3-output-processing/skill-based-v2.sh \
  --task-id "$TASK_ID" \
  --agents "$LOOP3_AGENTS" \
  --iteration "$ITERATION"
```

**After:**
```bash
IFS=',' read -ra AGENT_ARRAY <<< "$LOOP3_AGENTS"
for AGENT in "${AGENT_ARRAY[@]}"; do
  AGENT_ID="${AGENT}-${ITERATION}"
  spawn_and_parse_agent "$AGENT" "$TASK_ID" "$AGENT_ID" "$CONTEXT" 3600 &
done
wait
```

#### Step 3: Replace Loop 2 Skill Calls

Similar replacement for Loop 2 validators

#### Step 4: Delete Wrapper Directories

```bash
rm -rf .claude/skills/loop3-output-processing
rm -rf .claude/skills/loop2-output-processing
```

### Testing P6

```bash
# After changes, test full CFN Loop
/cfn-loop "Create /tmp/p6-test.txt with 'P6 unified spawning works'"

# Verify:
# 1. Loop 3 agents spawn via unified function
# 2. Loop 2 agents spawn via unified function
# 3. No errors from missing skill directories
# 4. Results parsed correctly
```

### Expected Results

- **Directories deleted:** 2 (loop3-output-processing, loop2-output-processing)
- **Orchestrator:** +30 lines (spawn function)
- **Skill wrappers removed:** ~200 lines
- **Net reduction:** ~170 lines
- **Consistency:** All agents spawned the same way

---

## P7: Redis Script Organization (~0.5 days)

### Current State

**Location:** `.claude/skills/redis-coordination/`

**Script Categories:**
1. **Production Scripts:** 8-10 core scripts
2. **Test Scripts:** ~20 `test-*.sh` files
3. **Demo/Pattern Scripts:** ~19 `*-pattern.sh` files
4. **Documentation:** `LOGGING.md`, etc.

### Target Structure

```
.claude/skills/redis-coordination/
├── README.md                     # Overview
├── LOGGING.md                    # P2 documentation
├── orchestrate-cfn-loop.sh       # Main orchestrator
├── execute-product-owner-decision.sh  # P4 implementation
├── log-event.sh                  # P2 implementation
├── query-logs.sh                 # P2 implementation
├── invoke-waiting-mode.sh        # Deprecated but kept for backward compat
├── complete-swarm.sh             # Production
└── __tests__/                    # NEW
    ├── README.md
    ├── test-*.sh                 # Moved from parent
    └── *-pattern.sh              # Moved from parent
```

### Implementation Steps

#### Step 1: Create __tests__ Directory

```bash
cd .claude/skills/redis-coordination
mkdir -p __tests__
```

#### Step 2: Move Test Scripts

```bash
# Move test-*.sh files
mv test-*.sh __tests__/ 2>/dev/null || true

# Move pattern demo files
mv *-pattern.sh __tests__/ 2>/dev/null || true
```

#### Step 3: Create Test README

```bash
cat > __tests__/README.md << 'EOF'
# Redis Coordination Tests

This directory contains test scripts and pattern demonstrations.

## Test Scripts

- `test-*.sh` - Unit tests for individual Redis operations
- `*-pattern.sh` - Design pattern demonstrations

## Running Tests

```bash
# Run all tests
for test in test-*.sh; do
  bash "$test"
done
```

## Production Scripts

Production scripts are in parent directory (`../`).
EOF
```

#### Step 4: Update Main README

Document the new structure and which scripts are production vs test.

### Testing P7

```bash
# Verify production scripts still work
./.claude/skills/redis-coordination/log-event.sh \
  --task-id "p7-test" \
  --event-type "test" \
  --level "INFO"

# Verify tests moved
ls ./.claude/skills/redis-coordination/__tests__/
```

### Expected Results

- **Directories created:** 1 (`__tests__/`)
- **Scripts moved:** ~40 (tests + patterns)
- **Documentation added:** 2 READMEs
- **Easier navigation:** Production scripts immediately visible
- **No code changes:** Pure reorganization

---

## Execution Order

### Recommended Sequence

1. **P7 First** (30 minutes, no dependencies)
   - Pure file organization
   - No code changes
   - Safe to execute immediately

2. **P5 Second** (2 days, modifies coordinator + orchestrator)
   - Major refactoring
   - Backup critical
   - Test thoroughly

3. **P6 Third** (1 day, depends on P5's orchestrator changes)
   - Uses P5's simplified orchestrator
   - Deletes wrapper directories
   - Final consolidation

### Alternative: Parallel P7 + Sequential P5→P6

- Start P7 (30 min)
- While P7 completes, begin P5 (2 days)
- Then P6 (1 day)
- **Total time:** ~3 days (vs 3.5 days sequential)

---

## Risk Assessment

### P5 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Coordinator breaks | HIGH | Create backup, test incrementally |
| Context extraction fails | MEDIUM | Keep old logic available for rollback |
| Orchestrator param parsing errors | LOW | Validate with simple test |

### P6 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Spawn function bugs | HIGH | Test each agent type individually |
| Missing Redis keys | MEDIUM | Validate key patterns match |
| Parallel execution issues | LOW | Use same `wait` pattern as before |

### P7 Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Broken import paths | LOW | All scripts are standalone |
| Lost test scripts | VERY LOW | Git tracks all moves |

---

## Testing Strategy

### P5 Testing

```bash
# Test 1: Simple task
/cfn-loop "Create /tmp/p5-simple.txt"

# Test 2: Complex task with deliverables
/cfn-loop "Create user authentication module:
- auth.ts
- auth.test.ts
In packages/backend/src/"

# Test 3: Verify context extraction
redis-cli GET "swarm:cfn-<task-id>:epic-context"
```

### P6 Testing

```bash
# Test 1: Loop 3 spawning
# (Happens automatically in P5 test)

# Test 2: Loop 2 spawning
# (Happens automatically if P5 test reaches Loop 2)

# Test 3: Verify no skill directory errors
grep -r "loop3-output-processing" logs/
grep -r "loop2-output-processing" logs/
# Should return no results
```

### P7 Testing

```bash
# Test 1: Production scripts work
./.claude/skills/redis-coordination/log-event.sh --help

# Test 2: Tests moved correctly
ls ./.claude/skills/redis-coordination/__tests__/ | wc -l
# Should show ~40 files

# Test 3: No broken references
grep -r "test-" .claude/agents/ | grep -v "__tests__"
# Should return no results (or only documentation)
```

---

## Rollback Plan

### P5 Rollback

```bash
# If coordinator breaks:
cp cost-savings-cfn-loop-coordinator.md.backup-p5 cost-savings-cfn-loop-coordinator.md

# If orchestrator breaks:
git checkout orchestrate-cfn-loop.sh
```

### P6 Rollback

```bash
# Restore wrapper directories from git
git checkout .claude/skills/loop3-output-processing
git checkout .claude/skills/loop2-output-processing

# Revert orchestrator changes
git diff orchestrate-cfn-loop.sh  # Review changes
git checkout orchestrate-cfn-loop.sh  # If needed
```

### P7 Rollback

```bash
# Move scripts back
mv __tests__/*.sh ./

# Delete __tests__ directory
rm -rf __tests__
```

---

## Success Criteria

### P5 Success

✅ Coordinator reduced from 688 → ~200 lines
✅ Orchestrator accepts `--task-description` parameter
✅ Context extraction works from task description
✅ CFN Loop executes end-to-end successfully
✅ No broken Redis key references

### P6 Success

✅ Unified `spawn_and_parse_agent()` function created
✅ Loop 3 agents spawn via unified function
✅ Loop 2 agents spawn via unified function
✅ Wrapper directories deleted
✅ No skill directory errors in logs

### P7 Success

✅ `__tests__/` directory created
✅ ~40 test/pattern scripts moved
✅ Production scripts remain in parent directory
✅ READMEs document new structure
✅ All production scripts still work

---

## Estimated Timeline

| Task | Estimated | With Testing | Total |
|------|-----------|--------------|-------|
| P7 | 0.5 hours | 0.5 hours | 1 hour |
| P5 | 1.5 days | 0.5 days | 2 days |
| P6 | 0.5 days | 0.5 days | 1 day |
| **Total** | **2.5 days** | **1.5 days** | **4 days** |

**With parallelization (P7 + P5):** ~3.5 days

---

## Next Steps

1. **Review this plan** - Confirm approach before execution
2. **Execute P7** - Quick win, safe to do immediately
3. **Execute P5** - Major refactoring, needs careful testing
4. **Execute P6** - Final consolidation
5. **Document results** - Create P5-P7 completion summary

---

**Document Version:** 1.0
**Status:** READY FOR EXECUTION
**Prerequisites:** P1-P4 complete (✅ Done)
**Blocking Issues:** None

