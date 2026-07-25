# BUG #11: Product Owner Agent Cannot Execute Decision Protocol

**Discovery Date:** 2025-10-20 (Sprint 8 CFN Self-Testing)
**Severity:** CRITICAL
**Status:** ROOT CAUSE IDENTIFIED - Alternative Architecture Required

---

## Summary

Product Owner agent documents bash commands in markdown instead of executing them with the Bash tool, despite explicit instructions to execute. This prevents autonomous CFN loop progression since the orchestrator blocks waiting for Redis decision push that never arrives.

---

## Symptoms

### Observed Behavior
```
[cfn-spawn] Spawning agent: product-owner
[Product Owner Agent] I need to execute the Product Owner decision protocol immediately

bash ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
  --task-id cfn-create-simple-test-file-in-tes-1761018803 \
  --agent-id product-owner-1

[cfn-spawn] Agent product-owner completed successfully
```

**Expected:** Bash tool invocation → script executes → decision pushed to Redis
**Actual:** Markdown code block output → no execution → orchestrator blocks indefinitely

### Orchestrator Blockage
```bash
# Orchestrator waits for decision that never arrives
[Product Owner] Waiting for decision from product-owner-1...
BLPOP swarm:cfn-...:product-owner-1:decision 3600  # Blocks for 1 hour
```

---

## Root Cause

**Agent templates cannot force tool usage through instructions.**

### Fundamental Limitation
Agents interpret instructions and make autonomous decisions about tool usage. Even with explicit directives like:
- "⚠️ MANDATORY: Use Bash tool"
- "DO NOT explain the protocol in markdown"
- "DO: Use the Bash tool immediately"
- "YOUR TASK: Use the Bash tool RIGHT NOW"

Agents treat bash commands in markdown code blocks as **documentation** rather than **executable commands**.

### Why Templates Can't Force Execution

1. **Agent Autonomy:** Agents decide whether instructions require tool usage
2. **Markdown Interpretation:** Code blocks are interpreted as examples/documentation
3. **Instruction Ambiguity:** Even "use Bash tool" can be seen as "show how to use Bash tool"
4. **No Direct Control:** Templates provide context, not execution mandates

---

## Fix Attempts (All Failed)

### Attempt 1: Explicit Instructions in Template
```markdown
## ⚠️ MANDATORY: Decision Execution Protocol

**You MUST use the Bash tool to execute these commands:**

1. Query Loop 2 consensus:
   ```bash
   CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 | jq -r '.consensus')
   ```
```

**Result:** Agent documented the commands in markdown → NO EXECUTION

### Attempt 2: Standalone Script + Simplified Instructions
Created: `.claude/skills/redis-coordination/execute-product-owner-decision.sh`

Template simplified to:
```markdown
**YOUR TASK:** Use the Bash tool RIGHT NOW to run the decision execution script.

**ACTION REQUIRED:**
1. Identify your TASK_ID and AGENT_ID
2. Use the Bash tool to execute:

bash ./.claude/skills/redis-coordination/execute-product-owner-decision.sh \
  --task-id YOUR_TASK_ID \
  --agent-id YOUR_AGENT_ID
```

**Result:** Agent recognized need to execute but still output as markdown → NO EXECUTION

### Attempt 3: Explicit DO/DO NOT Lists
```markdown
**DO NOT:**
- Explain the protocol in markdown
- Document what you would do
- Describe the steps
- Show example code blocks

**DO:**
- Use the Bash tool immediately
- Execute the script with real TASK_ID and AGENT_ID values
```

**Result:** Agent still documented → NO EXECUTION

---

## Alternative Architecture Options

Since forcing tool usage from templates is impossible, we need architectural changes:

### Option 1: Orchestrator-Parsed Output (RECOMMENDED)
**Concept:** Orchestrator parses Product Owner's text output for decision keywords instead of waiting for Redis push

**Implementation:**
```bash
# Orchestrator captures Product Owner stdout
PO_OUTPUT=$(npx claude-flow-novice agent product-owner --task-id "$TASK_ID" 2>&1)

# Parse decision from output
DECISION=$(echo "$PO_OUTPUT" | grep -oE "(PROCEED|ITERATE|ABORT)" | head -1)

# Orchestrator pushes decision to Redis (not agent)
DECISION_JSON=$(jq -n --arg decision "$DECISION" \
  '{decision: $decision, reasoning: "parsed_from_output", confidence: 0.90}')
echo "$DECISION_JSON" | redis-cli -x LPUSH "swarm:${TASK_ID}:product-owner-1:decision"
```

**Pros:**
- ✅ Works with agent's natural documentation behavior
- ✅ No template changes required
- ✅ Orchestrator maintains control of Redis coordination
- ✅ Simple to implement

**Cons:**
- ⚠️ Brittle keyword parsing (what if agent says "I recommend we PROCEED"?)
- ⚠️ Loses structured decision reasoning from agent

### Option 2: Wrapper Monitoring Script
**Concept:** Run Product Owner agent through wrapper that monitors output and pushes decision to Redis

**Implementation:**
```bash
# Wrapper: monitor-product-owner.sh
PO_OUTPUT=$(npx claude-flow-novice agent product-owner --task-id "$TASK_ID" 2>&1 | tee /dev/tty)

# Extract decision
DECISION=$(echo "$PO_OUTPUT" | grep -oE "(PROCEED|ITERATE|ABORT)" | head -1)

# Push to Redis
redis-cli LPUSH "swarm:${TASK_ID}:product-owner-1:decision" \
  "{\"decision\": \"$DECISION\", \"source\": \"wrapper\"}"
```

**Pros:**
- ✅ Separates agent behavior from coordination
- ✅ Product Owner agent stays simple
- ✅ Wrapper handles Redis complexity

**Cons:**
- ⚠️ Additional coordination script
- ⚠️ Still relies on keyword parsing

### Option 3: Simplified JSON Response Format
**Concept:** Make Product Owner return structured JSON that orchestrator processes

**Template Change:**
```markdown
## Decision Protocol

Return your decision in this exact format:

```json
{
  "decision": "PROCEED|ITERATE|ABORT",
  "reasoning": "explanation",
  "confidence": 0.90
}
```

**DO NOT include any other text.**
```

**Orchestrator Change:**
```bash
PO_OUTPUT=$(npx claude-flow-novice agent product-owner --task-id "$TASK_ID")
DECISION_JSON=$(echo "$PO_OUTPUT" | jq -r '.decision // empty')

if [ -n "$DECISION_JSON" ]; then
  echo "$PO_OUTPUT" | redis-cli -x LPUSH "swarm:${TASK_ID}:product-owner-1:decision"
fi
```

**Pros:**
- ✅ Structured data (no keyword parsing)
- ✅ Agent provides reasoning and confidence
- ✅ Easy to validate with jq

**Cons:**
- ⚠️ Still relies on agent following format exactly
- ⚠️ Agent might add explanatory text before/after JSON

### Option 4: Direct Redis Integration in System Prompt
**Concept:** Make Redis push part of agent's core protocol (not template instructions)

**Would require:** Changes to agent spawning system to embed Redis commands as mandatory post-completion steps

**Pros:**
- ✅ Guaranteed execution (system-level enforcement)
- ✅ Agent can't override

**Cons:**
- ⚠️ Major architectural change
- ⚠️ Breaks agent autonomy model

---

## Recommended Solution

**Option 1: Orchestrator-Parsed Output** (with improvements)

### Enhanced Implementation
```bash
# 1. Capture Product Owner output
PO_OUTPUT=$(npx claude-flow-novice agent product-owner \
  --task-id "$TASK_ID" \
  --agent-id "product-owner-1" 2>&1)

# 2. Extract decision with multiple fallback patterns
DECISION=$(echo "$PO_OUTPUT" | grep -oiE "Decision:\s*(PROCEED|ITERATE|ABORT)" | \
  grep -oE "(PROCEED|ITERATE|ABORT)" | head -1)

if [ -z "$DECISION" ]; then
  # Fallback: Look for standalone keywords
  DECISION=$(echo "$PO_OUTPUT" | grep -oE "(PROCEED|ITERATE|ABORT)" | head -1)
fi

# 3. Extract reasoning (text after decision keyword)
REASONING=$(echo "$PO_OUTPUT" | grep -A5 "Decision:" | tail -4 | tr '\n' ' ')

# 4. Build decision JSON
DECISION_JSON=$(jq -n \
  --arg decision "${DECISION:-ABORT}" \
  --arg reasoning "${REASONING:-No decision detected}" \
  --arg confidence "0.85" \
  '{decision: $decision, reasoning: $reasoning, confidence: ($confidence | tonumber)}')

# 5. Push to Redis
echo "$DECISION_JSON" | redis-cli -x LPUSH "swarm:${TASK_ID}:product-owner-1:decision"

# 6. Signal completion (orchestrator's responsibility now)
redis-cli LPUSH "swarm:${TASK_ID}:product-owner-1:done" "complete"
```

### Template Simplification
Product Owner template becomes documentation-focused:
```markdown
## Decision Framework

After analyzing Loop 2 consensus, make a strategic decision:

- **PROCEED:** Consensus ≥ 0.90, deliverables verified
- **ITERATE:** Consensus < 0.90, iteration < max
- **ABORT:** Max iterations reached without consensus

Output your decision clearly with reasoning.
```

### Benefits of This Approach
1. ✅ Works with agent's natural behavior
2. ✅ No forced tool usage
3. ✅ Orchestrator maintains Redis coordination control
4. ✅ Multiple fallback parsing patterns (robust)
5. ✅ Simple template (no complex instructions agent ignores)

---

## Implementation Plan

1. **Update Orchestrator** (`.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`)
   - Replace Product Owner BLPOP wait with output capture
   - Add decision parsing logic
   - Push decision to Redis from orchestrator

2. **Simplify Product Owner Template** (`.claude/agents/cfn-loop/product-owner.md`)
   - Remove "Decision Execution Protocol" section
   - Keep GOAP framework and decision criteria
   - Focus on clear decision output format

3. **Delete Unused Script** (`.claude/skills/redis-coordination/execute-product-owner-decision.sh`)
   - No longer needed since orchestrator handles Redis push

4. **Test CFN Loop**
   - Verify decision parsing works
   - Confirm PROCEED/ITERATE/ABORT all detected correctly
   - Validate orchestrator progression

---

## Testing Criteria

**Success Metrics:**
- ✅ Product Owner decision parsed correctly (PROCEED/ITERATE/ABORT)
- ✅ Orchestrator receives decision without blocking
- ✅ CFN loop progresses through iterations autonomously
- ✅ No manual Redis injection required

**Test Scenarios:**
1. High consensus (≥0.90) → PROCEED detected
2. Low consensus (<0.90), iteration < max → ITERATE detected
3. Max iterations reached → ABORT detected
4. Agent output variations (different wording) → Decision still extracted

---

## Related Bugs

- **BUG #9:** Product Owner Decision Execution (initial discovery)
- **BUG #10:** Confidence Collection Race Condition (FIXED)

---

## Lessons Learned

### ANTI-PATTERN: Template-Forced Tool Usage
**What Doesn't Work:** Adding explicit instructions to force agents to use specific tools

**Why:** Agents interpret instructions autonomously and make their own decisions about tool usage

**Better Approach:** Design architecture around agent's natural behavior (output parsing) rather than trying to force specific execution patterns

### PATTERN: Orchestrator Control
**Principle:** Coordination logic belongs in orchestrators, not agent templates

**Rationale:**
- Orchestrators control timing and dependencies
- Agents focus on decision-making and analysis
- Clean separation of concerns

---

**Next Steps:** Implement Option 1 (Orchestrator-Parsed Output) with enhanced parsing robustness
