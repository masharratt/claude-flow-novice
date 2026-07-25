# BUG #23 Remediation: Task Mode Memory Leak Fix

**Implementation Plan**
**Priority:** HIGH
**Estimated Effort:** 2-3 hours

---

## Immediate Action (Stop Current Epic)

### 1. Check Main Chat Memory

```bash
# Get Main Chat PID and memory
ps aux | grep -E "claude.*Tl" | grep -v grep | awk '{print "PID:", $2, "RSS:", $6/1024 "MB", "Command:", $11}'
```

**If RSS > 800 MB:**
1. Stop current epic execution (Ctrl+C in Main Chat)
2. Kill hung agent processes:
   ```bash
   pkill -f "claude.*agent"
   ```
3. Restart Main Chat session (fresh memory)

### 2. Save Current Progress

```bash
# Commit any deliverables created so far
cd /mnt/c/Users/masha/Documents/claude-flow-novice
git add planning/docker/
git status

# Check what was delivered
ls -lh planning/docker/*.md planning/docker/*.json
```

**Expected Phase 1 Deliverables:**
- Sprint 1.1: ACE schema migration scripts
- Sprint 1.2: Docker templates, hybrid routing config
- Sprint 1.3: Validation tests

**If any missing:** Note for recovery, proceed with fresh strategy.

---

## Fix Implementation (Choose Strategy)

### Strategy A: Chunked Epic Execution (RECOMMENDED)

**Best for:** Production epics, large multi-phase projects

**Steps:**

#### 1. Update Epic Command

**File:** `.claude/commands/cfn/cfn-loop-epic.md`

**Add section:**
```markdown
## Memory-Safe Epic Execution

**For epics >3 phases, use chunked execution:**

### Phase-by-Phase Execution

Execute each phase in separate Main Chat session:

**Phase 1:**
\`\`\`bash
/cfn-loop "Execute Phase 1: Infrastructure Templates" --epic-id "cfn-organizational-architecture-hybrid" --phase-id "phase-1"
\`\`\`

**Wait for completion, then start NEW Main Chat session:**

**Phase 2:**
\`\`\`bash
/cfn-loop "Execute Phase 2: Team Deployments" --epic-id "cfn-organizational-architecture-hybrid" --phase-id "phase-2" --previous-phase "planning/docker/PHASE_1_COMPLETE.json"
\`\`\`

**Continue for remaining phases...**

### Benefits
- Main Chat memory resets between phases
- Natural checkpoint boundaries
- Can monitor/validate between phases
- Crash recovery: Resume from last completed phase

### Memory Limits
- Single phase: <400 MB growth (safe)
- Multi-phase in one session: >1 GB (UNSAFE)
```

#### 2. Update Coordinator to Support Phase Checkpointing

**Create:** `.claude/skills/cfn-epic-management/checkpoint-phase.sh`

```bash
#!/usr/bin/env bash
# checkpoint-phase.sh - Save phase completion state for epic recovery

set -euo pipefail

EPIC_ID="${1:?Epic ID required}"
PHASE_ID="${2:?Phase ID required}"
OUTPUT_FILE="${3:-planning/docker/PHASE_${PHASE_ID}_COMPLETE.json}"

# Collect phase results
DELIVERABLES=$(git diff HEAD~1 --name-only | jq -R . | jq -s .)
CONSENSUS=$(redis-cli GET "epic:${EPIC_ID}:${PHASE_ID}:consensus" || echo "0.0")
ITERATIONS=$(redis-cli GET "epic:${EPIC_ID}:${PHASE_ID}:iterations" || echo "0")

# Write checkpoint
cat > "$OUTPUT_FILE" <<EOF
{
  "epicId": "${EPIC_ID}",
  "phaseId": "${PHASE_ID}",
  "status": "complete",
  "completedAt": "$(date -Iseconds)",
  "consensus": ${CONSENSUS},
  "iterations": ${ITERATIONS},
  "deliverables": ${DELIVERABLES}
}
EOF

echo "✅ Phase ${PHASE_ID} checkpoint saved: ${OUTPUT_FILE}"
```

#### 3. Update CFN v3 Coordinator

**File:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

**Add to completion protocol:**
```markdown
## Phase Completion Protocol

After phase execution completes:

1. **Checkpoint Phase State:**
   \`\`\`bash
   ./.claude/skills/cfn-epic-management/checkpoint-phase.sh \
     "$EPIC_ID" "$PHASE_ID" \
     "planning/docker/PHASE_${PHASE_ID}_COMPLETE.json"
   \`\`\`

2. **Commit Deliverables:**
   \`\`\`bash
   git add .
   git commit -m "feat(epic-${EPIC_ID}): Complete Phase ${PHASE_ID}"
   git push origin main
   \`\`\`

3. **Report to User:**
   \`\`\`
   ✅ Phase ${PHASE_ID} complete

   Consensus: ${CONSENSUS}
   Deliverables: ${DELIVERABLE_COUNT} files
   Checkpoint: planning/docker/PHASE_${PHASE_ID}_COMPLETE.json

   NEXT STEPS:
   1. Review deliverables: git show HEAD
   2. Start new Main Chat session
   3. Execute next phase: /cfn-loop "Execute Phase ${NEXT_PHASE_ID}"
   \`\`\`

4. **Exit Cleanly:**
   - Signal completion to Main Chat
   - Do NOT start next phase automatically
   - Allow Main Chat memory to reset
```

#### 4. Test Chunked Execution

**Create:** `tests/memory-leak/test-chunked-epic.sh`

```bash
#!/usr/bin/env bash
# Test chunked epic execution (memory safety)

set -euo pipefail

EPIC_ID="test-chunked-epic-$(date +%s)"
BASE_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice"

echo "Testing chunked epic execution..."

# Record baseline memory
BASELINE_MEM=$(ps aux | grep -E "claude.*Tl" | awk '{print $6}' | head -1)
echo "Baseline memory: ${BASELINE_MEM} KB"

# Execute Phase 1 (simulated)
echo "Executing Phase 1..."
cd "$BASE_DIR"

# Spawn coordinator for Phase 1 only
npx claude-flow-novice agent cfn-v3-coordinator \
  --epic-id "$EPIC_ID" \
  --phase-id "phase-1" \
  --mode "standard" \
  --checkpoint-on-complete &

PHASE1_PID=$!
wait $PHASE1_PID

# Check memory after Phase 1
PHASE1_MEM=$(ps aux | grep -E "claude.*Tl" | awk '{print $6}' | head -1)
PHASE1_GROWTH=$((PHASE1_MEM - BASELINE_MEM))
echo "Phase 1 memory growth: ${PHASE1_GROWTH} KB"

# Verify checkpoint exists
if [[ -f "planning/docker/PHASE_phase-1_COMPLETE.json" ]]; then
  echo "✅ Phase 1 checkpoint created"
else
  echo "❌ Phase 1 checkpoint missing"
  exit 1
fi

# CRITICAL: Kill Main Chat to reset memory (simulated)
# In real usage, user starts new Main Chat session here

# Execute Phase 2 (simulated - would be new session)
echo "Executing Phase 2..."
npx claude-flow-novice agent cfn-v3-coordinator \
  --epic-id "$EPIC_ID" \
  --phase-id "phase-2" \
  --previous-phase "planning/docker/PHASE_phase-1_COMPLETE.json" \
  --checkpoint-on-complete &

PHASE2_PID=$!
wait $PHASE2_PID

# Check memory after Phase 2
PHASE2_MEM=$(ps aux | grep -E "claude.*Tl" | awk '{print $6}' | head -1)
PHASE2_GROWTH=$((PHASE2_MEM - BASELINE_MEM))
echo "Phase 2 memory growth: ${PHASE2_GROWTH} KB"

# Validate memory stayed reasonable
if (( PHASE2_GROWTH < 600000 )); then
  echo "✅ Memory growth acceptable: ${PHASE2_GROWTH} KB"
else
  echo "❌ Memory growth excessive: ${PHASE2_GROWTH} KB"
  exit 1
fi

echo "✅ Chunked epic execution test passed"
```

---

### Strategy B: CLI Mode for All Epics (ALTERNATIVE)

**Best for:** Automated execution, cost optimization priority

**Steps:**

#### 1. Force CLI Mode for Epic Command

**File:** `.claude/commands/cfn/cfn-loop-epic.md`

**Update to enforce CLI:**
```markdown
## Epic Execution Mode

**IMPORTANT:** Epic execution ALWAYS uses CLI Mode (cost + memory optimized).

Task Mode is NOT supported for epics due to memory leak (BUG #23).

### Automatic Mode Selection

\`\`\`bash
/cfn-loop-epic "Epic Description"
# Automatically uses CLI Mode
# --mode=task is FORBIDDEN (will error)
\`\`\`

### Why CLI Mode for Epics

| Aspect | CLI Mode | Task Mode |
|--------|----------|-----------|
| Memory | Constant (~200 MB) | Growing (>1 GB) |
| Cost | 95-98% savings | Expensive |
| Visibility | Redis logs, web portal | Full Main Chat output |
| Recovery | Swarm state persisted | Lost on crash |

**Use Case Summary:**
- Epic (4+ phases): CLI Mode ONLY
- Single sprint debug: Task Mode OK
- Multi-sprint (2-3): CLI Mode recommended
```

#### 2. Add Epic Mode Validation

**Create:** `.claude/skills/cfn-epic-management/validate-epic-mode.sh`

```bash
#!/usr/bin/env bash
# Validate epic execution mode (prevent Task Mode memory leak)

set -euo pipefail

MODE="${1:?Mode required (cli|task)}"
PHASE_COUNT="${2:?Phase count required}"

if [[ "$MODE" == "task" ]] && (( PHASE_COUNT > 2 )); then
  echo "❌ ERROR: Task Mode not supported for epics >2 phases (BUG #23)"
  echo ""
  echo "Memory leak will crash Main Chat. Use CLI Mode instead:"
  echo ""
  echo "  /cfn-loop-epic \"Your Epic\" # Uses CLI Mode automatically"
  echo ""
  echo "See: docs/BUG_23_TASK_MODE_MEMORY_LEAK.md"
  exit 1
fi

if [[ "$MODE" == "task" ]] && (( PHASE_COUNT == 2 )); then
  echo "⚠️  WARNING: Task Mode with 2 phases may cause high memory (>600 MB)"
  echo "Recommend CLI Mode for better memory efficiency"
  echo ""
  read -p "Continue with Task Mode? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✅ Mode validation passed: ${MODE} for ${PHASE_COUNT} phases"
```

#### 3. Update Epic Coordinator

**File:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`

**Add to initialization:**
```markdown
## Epic Mode Initialization

Before starting epic execution:

\`\`\`bash
# Validate mode is appropriate for epic size
PHASE_COUNT=$(jq '.phases | length' "$EPIC_CONFIG")
MODE="${SPAWN_MODE:-cli}" # Default to CLI

./.claude/skills/cfn-epic-management/validate-epic-mode.sh "$MODE" "$PHASE_COUNT"

if [[ $? -ne 0 ]]; then
  echo "❌ Epic mode validation failed"
  exit 1
fi
\`\`\`
```

---

### Strategy C: Agent Output Truncation (MINIMAL CHANGE)

**Best for:** Quick fix, keeping Task Mode option

**Steps:**

#### 1. Update Agent Output Standards

**File:** `docs/AGENT_OUTPUT_STANDARDS.md`

**Add section:**
```markdown
## Task Mode Output Limits (BUG #23 Mitigation)

When spawned via Task() (detected by environment variable):

### Output Size Limits
- **Max output:** 500 bytes per agent
- **Format:** Structured JSON only
- **Details:** Write to files, not console

### Required Output Format

\`\`\`json
{
  "confidence": 0.92,
  "deliverables": ["file1.ts", "file2.ts"],
  "issues": "None"
}
\`\`\`

### Example

**❌ WRONG (causes memory leak):**
\`\`\`
Implemented authentication system.

Created the following files:
- src/auth/jwt.ts (150 lines)
  [... full file contents ...]
- src/auth/middleware.ts (80 lines)
  [... full file contents ...]

... [continues for 50 KB]
\`\`\`

**✅ CORRECT (memory safe):**
\`\`\`
{"confidence":0.92,"deliverables":["src/auth/jwt.ts","src/auth/middleware.ts"],"issues":"None"}
\`\`\`
```

#### 2. Update Agent Templates

**Example:** `.claude/agents/cfn-dev-team/developers/dev-backend-api.md`

**Add to output protocol:**
```markdown
## Output Protocol

### Detect Spawning Mode

\`\`\`bash
if [[ -n "$TASK_MODE" ]]; then
  # Spawned via Task() - use truncated output
  OUTPUT_MODE="minimal"
else
  # Spawned via CLI - full output OK
  OUTPUT_MODE="full"
fi
\`\`\`

### Minimal Output (Task Mode)

\`\`\`bash
if [[ "$OUTPUT_MODE" == "minimal" ]]; then
  cat <<EOF
{"confidence":${CONFIDENCE},"deliverables":[${DELIVERABLES}],"issues":"${ISSUES}"}
EOF
  exit 0
fi
\`\`\`

### Full Output (CLI Mode)

\`\`\`bash
# Standard detailed reporting
echo "Implementation complete:"
echo "Confidence: ${CONFIDENCE}"
echo "Deliverables:"
for file in $DELIVERABLES; do
  echo "  - $file"
done
# ... detailed logs ...
\`\`\`
```

#### 3. Test Output Truncation

**Create:** `tests/memory-leak/test-output-truncation.sh`

```bash
#!/usr/bin/env bash
# Test agent output truncation (memory leak mitigation)

set -euo pipefail

echo "Testing output truncation..."

# Set Task Mode environment
export TASK_MODE="true"

# Spawn agent
OUTPUT=$(npx claude-flow-novice agent backend-dev --task-id "test-truncation")

# Validate output size
OUTPUT_SIZE=$(echo "$OUTPUT" | wc -c)

if (( OUTPUT_SIZE > 500 )); then
  echo "❌ Output too large: ${OUTPUT_SIZE} bytes (max 500)"
  echo "Output: $OUTPUT"
  exit 1
fi

# Validate JSON format
if ! echo "$OUTPUT" | jq . >/dev/null 2>&1; then
  echo "❌ Output not valid JSON"
  exit 1
fi

# Validate required fields
CONFIDENCE=$(echo "$OUTPUT" | jq -r '.confidence')
DELIVERABLES=$(echo "$OUTPUT" | jq -r '.deliverables | length')

if [[ -z "$CONFIDENCE" ]] || (( DELIVERABLES == 0 )); then
  echo "❌ Missing required fields in output"
  exit 1
fi

echo "✅ Output truncation test passed (${OUTPUT_SIZE} bytes)"
```

---

## Recommended Implementation Order

### Phase 1: Immediate (Today)

1. **Stop current epic execution** if memory >800 MB
2. **Document issue** in CFN_LOOP_TASK_MODE.md (warning section)
3. **Switch to CLI Mode** for current epic:
   ```bash
   /cfn-loop-epic "AI Organizational Architecture - Hybrid from Start"
   # Uses CLI automatically
   ```

### Phase 2: Short-term (Tomorrow)

1. **Implement Strategy A** (Chunked Epic Execution)
   - Create checkpoint-phase.sh skill
   - Update coordinator completion protocol
   - Test with 2-phase mini-epic
2. **Update documentation**
   - Add memory limits to epic command docs
   - Update Task Mode guide with warnings

### Phase 3: Long-term (Next Week)

1. **Implement Strategy B** (CLI Mode enforcement)
   - Add validate-epic-mode.sh
   - Update epic coordinator initialization
   - Test mode validation
2. **Optional:** Implement Strategy C (output truncation)
   - Only if Task Mode debugging still needed
   - Update agent templates
   - Test truncation compliance

---

## Validation Checklist

- [ ] Current epic stopped (if memory >800 MB)
- [ ] Progress committed to git
- [ ] Epic restarted in CLI Mode OR chunked execution
- [ ] Memory monitored during execution
- [ ] Main Chat RSS stays <400 MB per phase
- [ ] Checkpoint files created between phases
- [ ] Documentation updated with warnings
- [ ] Test suite validates chunked execution
- [ ] Mode validation prevents Task Mode for large epics

---

## Success Criteria

### Memory Metrics

**Before Fix:**
- Main Chat: 756 MB (growing)
- Epic: 4 phases, 15+ agents
- Status: Memory leak confirmed

**After Fix:**
- Main Chat: <400 MB (constant per phase)
- Epic: Same size, chunked execution
- Status: Memory stable, no leak

### Operational Metrics

- ✅ Epic completes without crash
- ✅ Deliverables committed per phase
- ✅ Checkpoints enable recovery
- ✅ User can monitor progress between phases
- ✅ Documentation prevents future memory leaks

---

## Related Documentation

- **BUG #23 Analysis:** `docs/BUG_23_TASK_MODE_MEMORY_LEAK.md`
- **Task Mode Guide:** `.claude/commands/CFN_LOOP_TASK_MODE.md`
- **Agent Output Standards:** `docs/AGENT_OUTPUT_STANDARDS.md`
- **Epic Execution:** `.claude/commands/cfn/cfn-loop-epic.md`
