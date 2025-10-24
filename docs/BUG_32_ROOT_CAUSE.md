# BUG #32: Orchestrator Silent Exit - ROOT CAUSE ANALYSIS

**Status:** Root Cause Identified
**Severity:** Critical (Breaks CFN Loop)
**Confidence:** 0.95

---

## Root Cause

The `cfn-v3-coordinator` agent references a **non-existent orchestration script**:

**Wrong (Current):**
```bash
orchestrate-cfn-loop.sh  # Does not exist in project
```

**Correct:**
```bash
./.claude/skills/cfn-loop-orchestration/orchestrate.sh  # Actual script location
```

---

## How This Bug Manifests

### Expected Flow (CORRECT)
1. Main Chat spawns `cfn-v3-coordinator`
2. Coordinator analyzes task and generates configuration
3. **Coordinator invokes `.claude/skills/cfn-loop-orchestration/orchestrate.sh`**
4. Orchestrator spawns Loop 3 agents via CLI
5. Orchestrator runs gate-check (validates Loop 3 self-assessment)
6. Orchestrator spawns Loop 2 validators (blocked on gate-pass signal)
7. Orchestrator collects Loop 2 consensus
8. Orchestrator spawns Product Owner for final decision
9. Product Owner returns PROCEED/ITERATE/ABORT
10. Orchestrator executes decision

### Actual Flow (BROKEN)
1. Main Chat spawns `cfn-v3-coordinator`
2. Coordinator analyzes task and generates configuration
3. **Coordinator attempts to invoke `orchestrate-cfn-loop.sh` (doesn't exist)**
4. **Bash fails silently (script not found)**
5. **Coordinator falls back to direct agent spawning:**
   - Spawns Loop 3 agents directly via CLI
   - Loop 3 agents complete work
   - **Coordinator exits without running orchestrator**
6. **No gate-check executed**
7. **No Loop 2 spawned**
8. **No Product Owner decision**
9. **CFN Loop incomplete**

---

## Evidence

### 1. Script Does Not Exist
```bash
$ ls orchestrate-cfn-loop.sh
ls: cannot access 'orchestrate-cfn-loop.sh': No such file or directory
```

### 2. Correct Script Location
```bash
$ find .claude/skills -name "orchestrate.sh"
.claude/skills/cfn-loop-orchestration/orchestrate.sh  # ✅ This is the correct script
```

### 3. Coordinator Documentation References Wrong Script
**File:** `.claude/agents/coordinators/cfn-v3-coordinator.md`

**Line 267 (CLI Mode):**
```markdown
8. Call orchestrate-cfn-loop.sh with generated config
```

**Should be:**
```markdown
8. Call .claude/skills/cfn-loop-orchestration/orchestrate.sh with generated config
```

### 4. Redis Evidence (Task: cfn-v3-final-1761324119)
```bash
$ redis-cli keys "*cfn-v3-final-1761324119*"
swarm:cfn-v3-final-1761324119:backend-dev-1-1:pid
swarm:cfn-v3-final-1761324119:interaction-tester-1-1:pid
swarm:cfn-v3-final-1761324119:backend-dev-1-1:messages
... +7 lines (only Loop 3 keys, no Loop 2, no Product Owner)
```

**Missing Keys (Proof Orchestrator Never Ran):**
- `swarm:cfn-v3-final-1761324119:gate-passed` (gate-check never executed)
- `swarm:cfn-v3-final-1761324119:reviewer-*` (Loop 2 never spawned)
- `swarm:cfn-v3-final-1761324119:product-owner-*` (Product Owner never spawned)

---

## Why Previous Investigation Was Wrong

**Previous Hypothesis (BUG #32 Timeout Theory):**
> The orchestrator times out after 2 minutes due to Bash timeout limits.

**Why This Was Incorrect:**
1. Background processes (`run_in_background: true`) have **no timeout**
2. Orchestrator runs in background mode (verified in coordinator code)
3. Orchestrator never ran at all (no Redis keys, no signals)

**User Correction:**
> "When we run processes with background = true, they can run indefinitely"

This insight led to discovering the orchestrator was **never invoked**, not that it timed out.

---

## Impact Assessment

**Severity:** Critical
**Scope:** All CFN Loop executions using `cfn-v3-coordinator`

**Broken Workflows:**
- `/cfn-loop` (single task)
- `/cfn-loop-epic` (multi-phase)
- `/cfn-loop-single` (quick task)
- Direct coordinator spawning

**Affected Agent Files (4 total):**
```
.claude/agents/coordinators/cfn-v3-coordinator.md
.claude/agents/developers/README.md
.claude/agents/testers/README.md
.claude/agents/reviewers/README.md
```

---

## Fix Plan

### Phase 1: Update Coordinator (Priority 1)
**File:** `.claude/agents/coordinators/cfn-v3-coordinator.md`

**Change:**
```diff
- 8. Call orchestrate-cfn-loop.sh with generated config
+ 8. Call ./.claude/skills/cfn-loop-orchestration/orchestrate.sh with generated config
```

**Full Invocation Pattern:**
```bash
# Coordinator should invoke:
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "$(echo $LOOP3_AGENTS | jq -c .)" \
  --loop2-agents "$(echo $LOOP2_AGENTS | jq -c .)" \
  --product-owner "product-owner" \
  --max-iterations 10 \
  --gate-threshold 0.75 \
  --consensus-threshold 0.90
```

### Phase 2: Update Documentation (Priority 2)
**Files to Update:**
- `.claude/agents/developers/README.md`
- `.claude/agents/testers/README.md`
- `.claude/agents/reviewers/README.md`
- `CLAUDE.md` (if applicable)

**Search/Replace:**
```bash
find .claude/agents -type f -name "*.md" -exec sed -i \
  's|orchestrate-cfn-loop\.sh|./.claude/skills/cfn-loop-orchestration/orchestrate.sh|g' {} \;
```

### Phase 3: Validation (Priority 1)
**Test Script:** `tests/cfn-v3/test-orchestration-fix.sh`

**Test Cases:**
1. ✅ Coordinator invokes orchestrator successfully
2. ✅ Loop 3 agents complete work
3. ✅ Gate-check executes (signal: `gate-passed`)
4. ✅ Loop 2 validators spawn and review
5. ✅ Product Owner makes decision (PROCEED/ITERATE)
6. ✅ Full CFN Loop completes

**Expected Redis Keys After Fix:**
```bash
swarm:${TASK_ID}:backend-dev-1-1:done
swarm:${TASK_ID}:backend-dev-1-1:confidence
swarm:${TASK_ID}:gate-passed           # NEW
swarm:${TASK_ID}:reviewer-1-1:done     # NEW
swarm:${TASK_ID}:reviewer-1-1:consensus # NEW
swarm:${TASK_ID}:product-owner-1-1:decision # NEW
```

---

## Lessons Learned

### ANTI-023: Silent Failure Anti-Pattern
- **Confidence:** 0.95
- **Priority:** 10/10
- **Insight:** Always validate script paths before execution. Bash's silent failure on missing scripts (`script.sh: command not found` returns exit code 127 but may be ignored) can cause cascading failures. Use explicit path validation:
  ```bash
  if [ ! -f "$SCRIPT_PATH" ]; then
    echo "ERROR: Script not found: $SCRIPT_PATH"
    exit 1
  fi
  ```
- **Tags:** error-handling, validation, bash, silent-failure

### STRAT-029: Path Reference Validation
- **Confidence:** 0.92
- **Priority:** 9/10
- **Insight:** When updating script locations, use automated search to find all references across codebase. Pattern: `grep -r "old-script-name" .claude/` to identify documentation updates needed alongside code changes.
- **Tags:** refactoring, documentation, search-and-replace, validation

### PATTERN-025: Investigation Depth Pattern
- **Confidence:** 0.90
- **Priority:** 8/10
- **Insight:** When debugging "silent exit" issues, validate basic assumptions first (script exists, path is correct, permissions are valid) before investigating complex timeout/concurrency theories. Simple bugs masquerade as complex failures.
- **Tags:** debugging, root-cause-analysis, occams-razor, validation

---

## Related Issues

**BUG #18:** Agent Lifecycle - Exit vs Waiting Mode
**BUG #20:** Context Injection Missing Deliverables
**BUG #29:** Orchestrator Silent Exit (duplicate of #32)

---

## Next Steps

1. ✅ Document root cause (this file)
2. ⏳ Apply fix to coordinator
3. ⏳ Update all documentation references
4. ⏳ Create validation test suite
5. ⏳ Execute test and verify 0.85+ confidence

**Estimated Fix Time:** 30 minutes
**Validation Time:** 15 minutes
**Total:** 45 minutes

---

**Diagnosed by:** Root Cause Debugger
**Date:** 2025-10-24
**Confidence:** 0.95
**Status:** Ready for Implementation
