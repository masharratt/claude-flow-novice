# Phase 2: Loop 2 Parallel Integration - Implementation Plan

**Date:** 2025-10-21
**Status:** Planning
**Based On:** Phase 1 parallel pattern (proven working)

---

## Summary

Phase 2 integrates Loop 2 validators using the **exact same parallel pattern** as Loop 3, with only minor differences in skill interface and output structure.

---

## Pattern Reusability

### What's Identical (Copy from Phase 1)

**Parallel Execution Pattern:**
```bash
# 1. Spawn all agents in parallel
for agent in validators; do
  (
    RESULT=$(skill-execution)
    echo "$RESULT" > /tmp/output-file
  ) &
  PIDS[$agent]=$!
done

# 2. Wait for completion
for agent in validators; do
  wait ${PIDS[$agent]}
  RESULT=$(cat /tmp/output-file)
  # Extract metrics, store in Redis
done
```

**Benefits (Same as Loop 3):**
- ✅ Parallel execution (fast)
- ✅ Skill-based extraction (guaranteed)
- ✅ No race conditions (temp files)
- ✅ No template enforcement required

---

## What's Different

### 1. Skill Used

**Loop 3:** `.claude/skills/loop3-output-processing/execute-and-extract.sh`
**Loop 2:** `.claude/skills/loop2-output-processing/execute-and-extract.sh`

### 2. Skill Interface (NEEDS UPDATE)

**Current Loop 2 Interface (Positional - OLD):**
```bash
./execute-and-extract.sh "$TASK_ID" "$AGENT_ID" "$ITERATION"
```

**Required Interface (Named Parameters - MATCH LOOP 3):**
```bash
./execute-and-extract.sh \
  --agent-type "$VALIDATOR" \
  --task-id "$TASK_ID" \
  --agent-id "$UNIQUE_AGENT_ID" \
  --context "Loop 2 validation for iteration $ITERATION" \
  --iteration "$ITERATION" \
  --timeout "$AGENT_TIMEOUT"
```

**Action Required:** Update Loop 2 skill to match Loop 3 interface

---

### 3. Output Structure

**Loop 3 Output:**
```json
{
  "agent_id": "coder-1-1",
  "confidence": 0.85,
  "confidence_source": "explicit",
  "files_changed": 3,
  "deliverables": ["src/auth.ts"],
  "iteration": 1,
  "latency_ms": 5000,
  "timestamp": "..."
}
```

**Loop 2 Output (SHOULD BE):**
```json
{
  "agent_id": "reviewer-1-1",
  "confidence": 0.90,
  "confidence_source": "explicit",
  "feedback": {
    "critical": ["Fix security issue in auth.ts:42"],
    "warnings": ["Consider edge case handling"],
    "suggestions": ["Add more test coverage"]
  },
  "iteration": 1,
  "latency_ms": 3000,
  "timestamp": "..."
}
```

**Key Difference:** `feedback` field instead of `files_changed`/`deliverables`

---

## Phase 2 Implementation Steps

### Step 1: Update Loop 2 Skill Interface

**File:** `.claude/skills/loop2-output-processing/execute-and-extract.sh`

**Changes:**
1. Replace positional parameters with named parameters
2. Add timeout support
3. Add context parameter
4. Match Loop 3 interface exactly

**Template:**
```bash
#!/bin/bash
set -euo pipefail

# Parse arguments (SAME AS LOOP 3)
AGENT_TYPE=""
TASK_ID=""
AGENT_ID=""
CONTEXT=""
ITERATION=1
TIMEOUT=900

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "ERROR: Unknown parameter: $1" >&2; exit 1 ;;
  esac
done

# Spawn validator and capture output
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" 2>&1 || true)

# Parse confidence + feedback
CONFIDENCE=$("$SCRIPT_DIR/parse-confidence.sh" "$AGENT_OUTPUT")
FEEDBACK=$("$SCRIPT_DIR/parse-feedback.sh" "$AGENT_OUTPUT")

# Build output JSON
cat <<EOF
{
  "agent_id": "$AGENT_ID",
  "confidence": $CONFIDENCE,
  "confidence_source": "explicit",
  "feedback": $FEEDBACK,
  "iteration": $ITERATION,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
```

---

### Step 2: Update Orchestrator (Loop 2 Section)

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
**Lines:** ~900-1040 (current Loop 2 logic)

**Pattern:** Copy Phase 1 pattern, replace:
- `loop3-output-processing` → `loop2-output-processing`
- `LOOP3_*` variables → `LOOP2_*` variables
- Extract `feedback` instead of `files_changed`

**Pseudo-code:**
```bash
# Step 3a: Spawn all validators in parallel
declare -A VALIDATOR_PIDS
declare -A VALIDATOR_OUTPUT_FILES

for validator in validators; do
  (
    RESULT=$(./.claude/skills/loop2-output-processing/execute-and-extract.sh \
      --agent-type "$VALIDATOR" \
      --task-id "$TASK_ID" \
      --agent-id "$UNIQUE_VALIDATOR_ID" \
      --context "Loop 2 validation" \
      --iteration "$ITERATION" \
      --timeout "$VALIDATOR_TIMEOUT")

    echo "$RESULT" > /tmp/loop2-${TASK_ID}-${UNIQUE_VALIDATOR_ID}.json
  ) &

  VALIDATOR_PIDS["$UNIQUE_VALIDATOR_ID"]=$!
done

# Step 3b: Wait for all validators
for validator in validators; do
  wait ${VALIDATOR_PIDS[$validator]}
  RESULT=$(cat /tmp/loop2-${TASK_ID}-${validator}.json)

  CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
  FEEDBACK=$(echo "$RESULT" | jq -r '.feedback')

  # Store in Redis
  echo "$RESULT" | redis-cli -x LPUSH "swarm:${TASK_ID}:${validator}:result"
done
```

---

## Code Differences Summary

| Aspect | Loop 3 | Loop 2 | Changes Needed |
|--------|--------|--------|----------------|
| **Skill Interface** | Named params | ✅ Update to named | Update skill |
| **Parallel Pattern** | ✅ Working | ✅ Reuse exactly | Copy pattern |
| **Output Structure** | confidence + files | confidence + feedback | Update parsing |
| **Temp Files** | `/tmp/loop3-...` | `/tmp/loop2-...` | Just rename |
| **Redis Keys** | `:loop3:` | `:loop2:` | Just rename |
| **Orchestrator Logic** | Lines 751-884 | Lines ~900-1040 | Copy & adapt |

---

## Estimated Effort

**Step 1 (Skill Update):** 30 minutes
- Update execute-and-extract.sh interface
- Test skill directly
- Verify JSON output structure

**Step 2 (Orchestrator Integration):** 60 minutes
- Copy Loop 3 parallel pattern
- Adapt variable names (LOOP3 → LOOP2)
- Update output extraction (files → feedback)
- Test with single validator
- Test with multiple validators

**Total:** ~90 minutes (vs 3+ hours if designed from scratch)

---

## Testing Plan

### Unit Test (Skill)
```bash
# Test Loop 2 skill with new interface
./.claude/skills/loop2-output-processing/execute-and-extract.sh \
  --agent-type "reviewer" \
  --task-id "test-123" \
  --agent-id "reviewer-1" \
  --context "Review implementation" \
  --iteration 1 \
  --timeout 60
```

**Expected Output:**
```json
{
  "agent_id": "reviewer-1",
  "confidence": 0.XX,
  "feedback": {...},
  "iteration": 1
}
```

### Integration Test (Orchestrator)
```bash
# Test orchestrator with parallel validators
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "test-$(date +%s)" \
  --mode "mvp" \
  --loop3-agents "coder" \
  --loop2-agents "reviewer,tester" \
  --product-owner "product-owner" \
  --max-iterations 1
```

**Expected Behavior:**
- [Loop 2] Using skill-based output processing (parallel execution)
- Spawning reviewer (ID: reviewer-1-1)
- Spawning tester (ID: tester-1-1)
- All agents spawned, waiting for completion...
- ✅ reviewer-1-1 complete (confidence: 0.XX, feedback: N items)
- ✅ tester-1-1 complete (confidence: 0.XX, feedback: N items)

---

## Benefits of Pattern Reuse

**Development Time:**
- ❌ Without reuse: Design new pattern (~3 hours)
- ✅ With reuse: Copy & adapt (~90 minutes)

**Risk Reduction:**
- ✅ Pattern already proven (Phase 1)
- ✅ Same temp file approach (no new bugs)
- ✅ Same parallel execution (tested)
- ✅ Same error handling

**Code Consistency:**
- ✅ Both loops use identical patterns
- ✅ Easy to understand (one pattern to learn)
- ✅ Easy to maintain (fix once, applies to both)

---

## Rollback Strategy

**If Phase 2 fails:**
1. Revert Loop 2 orchestrator changes only
2. Phase 1 (Loop 3) continues working
3. Loop 2 falls back to old polling wait pattern

**No cross-dependency** - phases are independent

---

## Success Criteria

**Phase 2 Complete When:**
- ✅ Loop 2 skill interface matches Loop 3
- ✅ Parallel execution working (2+ validators)
- ✅ Feedback extracted correctly
- ✅ Confidence scores reliable
- ✅ Consensus calculation accurate
- ✅ No race conditions in logs

---

## Phase 1 + Phase 2 Combined Benefits

**Once both phases complete:**

| Metric | Before | After |
|--------|--------|-------|
| **Loop 3 Confidence** | 0.0 if agent fails | Guaranteed extraction |
| **Loop 2 Confidence** | 0.0 if agent fails | Guaranteed extraction |
| **Race Conditions** | Polling mitigates | Eliminated |
| **Execution Mode** | Parallel | ✅ Parallel (both loops) |
| **Template Enforcement** | Required (fails) | ❌ Not needed |
| **Feedback Structure** | Free-form text | ✅ Structured JSON |

---

## Next Steps

1. **Complete Phase 1 validation** (ensure Loop 3 working)
2. **Update Loop 2 skill interface** (30 min)
3. **Copy Phase 1 pattern to Loop 2** (60 min)
4. **Test Phase 2** (30 min)
5. **Document combined benefits** (15 min)

**Total Phase 2 timeline:** ~2-3 hours (vs 1 week if starting from scratch)

---

## Related Documentation

- `docs/PHASE_1_LOOP3_INTEGRATION_COMPLETE.md` - Pattern to copy
- `docs/SKILL_IMPLEMENTATION_COMPLETE.md` - Overall status
- `.claude/skills/loop3-output-processing/execute-and-extract.sh` - Template for Loop 2

---

**Conclusion:** Phase 1 parallel pattern makes Phase 2 **significantly easier**. Just copy, rename variables, and adapt output parsing. Same benefits, same guarantees, proven approach.
