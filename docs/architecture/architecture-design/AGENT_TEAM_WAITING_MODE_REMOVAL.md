# Agent Team: Waiting Mode Removal Task

**Date:** 2025-10-21
**Priority:** Medium
**Scope:** 46 agent files
**Effort:** 1-2 hours (bulk edit)
**Status:** Ready for execution

---

## Background

The CFN Loop currently uses a "waiting mode" pattern where agents:
1. Complete work
2. Report confidence
3. **Enter waiting mode** (blocking)
4. Wait for orchestrator to wake them

**Problem:** This blocks the orchestrator, creates process zombies, and prevents adaptive agent specialization (PATTERN-022).

**Solution:** Remove waiting mode. Agents should exit cleanly after reporting confidence.

---

## What Changed (Orchestrator Side)

The orchestrator has been updated to:
- ✅ Remove all `invoke-waiting-mode.sh wake` calls (7 locations)
- ✅ Remove all `invoke-waiting-mode.sh collect` calls (2 locations)
- ✅ Let agents exit naturally, use standard `wait $PID`
- ✅ Spawn fresh agents for each iteration (adaptive specialization)

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

---

## What Needs Updating (Agent Side)

### Affected Files

**46 agent files** contain the old CFN Loop protocol with "Step 4: Enter Waiting Mode":

```bash
$ grep -r "invoke-waiting-mode" .claude/agents --include="*.md" | wc -l
92 references across 46 files
```

### Files List

<details>
<summary>Click to expand full list of 46 files</summary>

```
.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md
.claude/agents/cfn-loop/product-owner.md
.claude/agents/product-owner.md
.claude/agents/core-agents/code-quality-validator.md
.claude/agents/core-agents/reviewer.md
.claude/agents/specialized/mobile/mobile-dev.md
.claude/agents/core-agents/tester.md
.claude/agents/core-agents/security-manager.md
.claude/agents/sparc/architecture.md
.claude/agents/core-agents/planner.md
.claude/agents/testing/unit/tdd-london-swarm.md
.claude/agents/testing/validation/production-validator.md
.claude/agents/core-agents/performance-benchmarker.md
.claude/agents/security/security-specialist.md
.claude/agents/security/security-specialist-existing.md
.claude/agents/testing/tdd-london-swarm.md
.claude/agents/consensus/consensus-builder.md
.claude/agents/core-agents/coder.md
.claude/agents/testing/production-validator.md
.claude/agents/product-owner-team/product-owner-agent.md
.claude/agents/code-booster.md
.claude/agents/testing/interaction-tester.md
.claude/agents/product-owner-team/power-user-persona.md
.claude/agents/testing/e2e/playwright-agent.md
.claude/agents/core-agents/base-template-generator.md
.claude/agents/specialized/rust-mvp-developer.md
.claude/agents/architecture/system-architect.md
.claude/agents/product-owner-team/cto-agent.md
.claude/agents/core-agents/architect.md
.claude/agents/analysis/perf-analyzer.md
.claude/agents/specialized/rust-enterprise-developer.md
.claude/agents/product-owner-team/accessibility-advocate-persona.md
.claude/agents/analysis/code-review/analyze-code-quality.md
.claude/agents/core-agents/analyst.md
.claude/agents/specialized/rust-developer.md
.claude/agents/analysis/code-quality-validator.md
.claude/agents/planning-team/system-architect-persona.md
.claude/agents/context/context-reflector.md
.claude/agents/specialized/mobile/spec-mobile-react-native.md
.claude/agents/analysis/code-analyzer.md
.claude/agents/context/context-curator.md
.claude/agents/development/backend/dev-backend-api.md
.claude/agents/context-reflector.md
.claude/agents/specialized/devops-engineer.md
.claude/agents/development/backend-dev.md
.claude/agents/planning-team/security-architect-persona.md
```
</details>

---

## Required Changes

### Old Protocol (Remove)

```markdown
## CFN Loop Redis Completion Protocol

### Step 1: Complete Work
Execute assigned task

### Step 2: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 3: Report Confidence Score
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

### Step 4: Enter Waiting Mode (for potential iteration)  ❌ REMOVE THIS
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --max-wait 3600
```

Agent will be woken if another iteration is needed.
```

### New Protocol (Replace With)

```markdown
## CFN Loop Redis Completion Protocol

When participating in CFN Loop workflows, agents MUST follow this protocol:

### Step 1: Complete Work
Execute assigned task (code implementation, validation, review, etc.)

### Step 2: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 3: Report Confidence Score
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

### Step 4: Exit Cleanly
Agent work is complete. Exit cleanly to allow orchestrator to proceed.

**Note:** If another iteration is needed, orchestrator will spawn a fresh agent
(possibly a different specialist based on feedback). This enables adaptive
agent specialization per PATTERN-022.
```

---

## Bulk Update Script

### Option 1: Automated Bulk Edit

```bash
#!/bin/bash
# File: scripts/remove-waiting-mode-from-agents.sh

set -e

echo "Removing 'Step 4: Enter Waiting Mode' from all agent files..."

# Find all agent markdown files
AGENT_FILES=$(find .claude/agents -name "*.md" -type f)

for FILE in $AGENT_FILES; do
  # Check if file contains waiting mode protocol
  if grep -q "Step 4: Enter Waiting Mode" "$FILE"; then
    echo "Updating: $FILE"

    # Create backup
    cp "$FILE" "${FILE}.backup"

    # Remove Step 4 section (from "### Step 4" to next "###" or end of section)
    # Replace with new Step 4
    sed -i '/### Step 4: Enter Waiting Mode/,/^Agent will be woken/c\
### Step 4: Exit Cleanly\
Agent work is complete. Exit cleanly to allow orchestrator to proceed.\
\
**Note:** If another iteration is needed, orchestrator will spawn a fresh agent \
(possibly a different specialist based on feedback). This enables adaptive \
agent specialization per PATTERN-022.' "$FILE"

    echo "  ✅ Updated"
  else
    echo "Skipping: $FILE (no waiting mode found)"
  fi
done

echo ""
echo "✅ Bulk update complete!"
echo "📦 Backups created with .backup extension"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff .claude/agents"
echo "2. Test with sample CFN Loop: /cfn-loop 'test task'"
echo "3. Commit if successful: git add .claude/agents && git commit -m 'Remove waiting mode from agents'"
echo "4. Remove backups: find .claude/agents -name '*.backup' -delete"
```

**Usage:**
```bash
chmod +x scripts/remove-waiting-mode-from-agents.sh
./scripts/remove-waiting-mode-from-agents.sh
```

### Option 2: Manual Update Checklist

For each of the 46 agent files:

1. **Find CFN Loop Protocol section**
   - Search for "CFN Loop Redis Completion Protocol"
   - Or search for "invoke-waiting-mode"

2. **Locate Step 4**
   - Find "### Step 4: Enter Waiting Mode"

3. **Delete old Step 4**
   - Remove from "### Step 4" line
   - Through "Agent will be woken if another iteration is needed."

4. **Add new Step 4**
   ```markdown
   ### Step 4: Exit Cleanly
   Agent work is complete. Exit cleanly to allow orchestrator to proceed.

   **Note:** If another iteration is needed, orchestrator will spawn a fresh agent
   (possibly a different specialist based on feedback). This enables adaptive
   agent specialization per PATTERN-022.
   ```

5. **Verify and save**

---

## Testing After Update

### Test 1: Simple CFN Loop
```bash
/cfn-loop "Create /tmp/test-waiting-mode-removal.txt with 'Agent exit working'"
```

**Expected:**
- ✅ Loop 3 agent spawns, completes, exits
- ✅ Orchestrator proceeds to Loop 2 without hanging
- ✅ Loop 2 agent spawns, completes, exits
- ✅ Product Owner makes decision
- ✅ File created successfully

**If agents still block:** Check agent file wasn't updated properly.

### Test 2: Multi-Iteration CFN Loop
```bash
/cfn-loop "Create /tmp/iteration-test.txt but ensure it fails first iteration"
```

**Expected:**
- ✅ Iteration 1: Agent spawns, fails (low confidence), exits
- ✅ Orchestrator spawns NEW agent for iteration 2 (adaptive)
- ✅ Iteration 2: Different agent completes task, exits
- ✅ No hanging or blocking

### Test 3: Verify SQLite Logging
```bash
# After CFN Loop completes
sqlite3 .claude/data/cfn-loop.db \
  "SELECT event_type, COUNT(*) FROM cfn_loop_logs GROUP BY event_type;"
```

**Expected events:**
- swarm_init (1)
- agent_spawn (≥2)
- agent_complete (≥2)
- gate_check (≥1)
- po_decision (1)

---

## Benefits

### Before (With Waiting Mode)
```
Loop 3 Agent → complete → report → BLOCK (waiting mode) → wait for wake
Orchestrator → must wake agent → agent continues → agent blocks again
                ↓
         COMPLEX + SLOW
```

### After (Without Waiting Mode)
```
Loop 3 Agent → complete → report → EXIT ✅
Orchestrator → spawn fresh specialist → agent completes → EXIT ✅
                ↓
         SIMPLE + ADAPTIVE
```

**Improvements:**
- ✅ No process zombies
- ✅ Simpler orchestrator logic (no wake calls)
- ✅ Adaptive specialization (different agent per iteration)
- ✅ Faster iterations (no waiting overhead)
- ✅ PATTERN-022 compliant

---

## Rollback Plan

If issues arise after bulk update:

```bash
# Restore all backups
find .claude/agents -name "*.backup" -exec bash -c 'mv "$1" "${1%.backup}"' _ {} \;

# Or restore from git
git checkout .claude/agents/
```

---

## Timeline

**Estimated Effort:** 1-2 hours

- Script execution: 5 minutes
- Review changes: 15-30 minutes
- Testing: 30-45 minutes
- Commit + cleanup: 15 minutes

---

## Questions?

**Q: Will old agents in waiting mode break?**
A: Yes, if they're still running when orchestrator updates. Kill them: `pkill -f "invoke-waiting-mode"` or let them timeout.

**Q: What if some agents don't have waiting mode?**
A: Script checks before updating. Safe to run on all agents.

**Q: Can I update agents incrementally?**
A: Yes, but orchestrator already updated. Agents without Step 4 will work fine, agents with Step 4 may block (they'll exit after timeout).

**Q: Why not keep waiting mode as optional?**
A: Removes complexity, prevents mistakes, enforces best practice (PATTERN-022).

---

## Completion Checklist

- [ ] Run bulk update script OR manually update all 46 files
- [ ] Review changes: `git diff .claude/agents`
- [ ] Test simple CFN Loop
- [ ] Test multi-iteration CFN Loop
- [ ] Verify SQLite logging works
- [ ] Commit changes
- [ ] Remove backup files
- [ ] Update team documentation
- [ ] Mark task complete

---

**Status:** Ready for execution
**Owner:** Agent Profile Team
**Orchestrator Changes:** ✅ Complete (by Main Team)
**Agent Changes:** ⏳ Pending (by Agent Team)
