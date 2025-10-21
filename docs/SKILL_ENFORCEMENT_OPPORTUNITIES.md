# Skill Enforcement Opportunities - AI Consistency Analysis

**Date:** 2025-10-20
**Purpose:** Identify where we're relying on AI consistency that should be skill-enforced

---

## Current Situation

**BUG #11 taught us:** Agent templates cannot force tool usage. Agents interpret instructions autonomously, even with explicit directives.

**Better pattern:** Orchestrator-controlled output parsing with robust fallback patterns.

---

## Areas Still Relying on AI Consistency

### 🔴 HIGH PRIORITY - Critical to CFN Loop Success

#### 1. Loop 3 Implementers - Confidence Reporting

**Current Approach (Template-Based):**
```markdown
# In coder.md, reviewer.md, etc.
4. Report confidence:
   ```bash
   ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
     --task-id "$TASK_ID" \
     --agent-id "$AGENT_ID" \
     --confidence [0.0-1.0] \
     --iteration 1
   ```
```

**Problem:** Same as Product Owner - agents might document instead of execute

**Evidence:** BUG #10 showed confidence was 0.0 until we added polling wait. This suggests agents weren't executing report command on time.

**Recommended Fix:** Loop 3 Output Processing Skill
- Capture agent output
- Parse confidence from text (e.g., "Confidence: 0.85" or "I'm 85% confident")
- Extract file changes from git status
- Calculate confidence if not provided (based on deliverables)
- Orchestrator reports to Redis

**Impact:** ✅ Eliminates race conditions, guarantees confidence scores

---

#### 2. Loop 2 Validators - Confidence + Feedback Reporting

**Current Approach (Template-Based):**
```markdown
# In reviewer.md, code-quality-validator.md, etc.
5. Report consensus:
   ```bash
   ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
     --task-id "$TASK_ID" \
     --agent-id "$AGENT_ID" \
     --confidence [0.0-1.0] \
     --iteration 1
   ```
```

**Problem:** Validators provide feedback in markdown, but we need:
- Structured confidence score
- Categorized feedback (critical/warning/suggestion)
- Specific file/line references

**Recommended Fix:** Validator Output Processing Skill
- Parse confidence from multiple patterns
- Extract feedback categories
- Structure file/line references
- Generate iteration feedback for Loop 3

**Benefits:**
- ✅ Reliable confidence scores
- ✅ Structured feedback (not free-form text)
- ✅ Better iteration targeting

---

#### 3. Deliverable Verification - Bash Execution

**Current Approach (Template-Based):**
```markdown
# In reviewer.md
1. **File Existence Check**
   ```bash
   git status --short | grep -E "^(A|M|\?\?)"
   # If no files changed AND task requires implementation → confidence ≤ 0.50
   ```
```

**Problem:** Reviewer might:
- Document the command instead of running it
- Skip verification and provide opinion-based confidence
- Not actually check git status

**Evidence:** Sprint 8 "consensus on vapor" - validators gave 0.91 consensus with NO files created

**Recommended Fix:** Orchestrator Deliverable Verification
- Orchestrator runs git status (not agent)
- Overrides agent confidence if no deliverables
- Happens BEFORE accepting validator scores

**Impact:** ✅ Prevents "consensus on vapor" at source

---

### 🟡 MEDIUM PRIORITY - Quality & Reliability

#### 4. Agent Completion Protocol - done Signal

**Current Approach (Template-Based):**
```markdown
2. Signal done:
   ```bash
   redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
   ```
```

**Problem:** If agent doesn't execute this, orchestrator blocks forever (BLPOP)

**Recommended Fix:** Timeout + Heartbeat Monitoring
- Agents send heartbeat every 30s (optional, best effort)
- Orchestrator timeout kills unresponsive agents
- **OR**: Orchestrator monitors agent process exit (npx command completion)

**Current Mitigation:** ✅ We have timeout + retry logic (adequate for now)

**Future Enhancement:** Process-based completion detection

---

#### 5. Waiting Mode Entry - Iteration Blocking

**Current Approach (Template-Based):**
```markdown
4. Enter waiting mode:
   ```bash
   ./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
     --task-id "$TASK_ID" \
     --agent-id "$AGENT_ID" \
     --context "iteration-complete"
   ```
```

**Problem:** If agent doesn't enter waiting mode, it exits and can't be woken for iteration

**Recommended Fix:** Orchestrator-Managed Agent Lifecycle
- Agents complete and exit (no waiting mode requirement)
- Orchestrator re-spawns agents for next iteration
- Agent context includes iteration number

**Benefits:**
- ✅ Simpler agent logic (no waiting mode complexity)
- ✅ Clean agent lifecycle (spawn → work → exit)
- ✅ No risk of agents stuck in waiting mode

**Trade-off:** Re-spawning cost (acceptable with cost-savings mode)

---

### 🟢 LOW PRIORITY - Nice to Have

#### 6. Memory Operations - SQLite Writes

**Current Approach (Template-Based):**
```typescript
await sqlite.memoryAdapter.set(
  `agent/${agentId}/data/${taskId}`,
  { confidence: 0.85, results: [...] },
  { aclLevel: 1 }
);
```

**Problem:** Agents might forget to persist important data

**Recommended Fix:** Automatic Persistence Skill
- Orchestrator auto-saves agent output to SQLite
- Agents can optionally write additional context
- Structured schema guarantees consistency

---

#### 7. Error Handling - Graceful Degradation

**Current Approach (Template-Based):**
```markdown
If error occurs:
- Log error details
- Report partial confidence
- Signal completion with error context
```

**Problem:** Agents handle errors differently (or not at all)

**Recommended Fix:** Standardized Error Capture
- Orchestrator catches agent stderr
- Parses error patterns
- Auto-generates error reports
- Decides whether to retry

---

## Recommended Implementation Plan

### Phase 1: Critical Path (BUG #11 Follow-Up)

**Priority:** Immediate (Sprint 9)

1. **Loop 3 Confidence Extraction Skill**
   - Location: `.claude/skills/loop3-output-processing/`
   - Parses implementer output for confidence
   - Validates deliverable existence
   - Guarantees confidence scoring

2. **Loop 2 Feedback Extraction Skill**
   - Location: `.claude/skills/loop2-output-processing/`
   - Parses validator output for confidence + feedback
   - Structures feedback categories
   - Enables targeted iteration

3. **Orchestrator Deliverable Verification**
   - Already implemented (BUG #11 fix)
   - Extend to override validator confidence

**Impact:** 🎯 Eliminates all "consensus on vapor" scenarios

---

### Phase 2: Reliability Improvements

**Priority:** Sprint 10

1. **Agent Lifecycle Simplification**
   - Remove waiting mode requirement
   - Orchestrator re-spawns for iterations
   - Cleaner agent exit paths

2. **Process-Based Completion Detection**
   - Monitor npx command exit codes
   - Auto-signal completion when process ends
   - Reduce reliance on agent bash execution

**Impact:** 🔧 More robust coordination, fewer edge cases

---

### Phase 3: Quality Enhancements

**Priority:** Sprint 11

1. **Automatic Memory Persistence**
   - Orchestrator saves all agent output
   - Structured SQLite schema
   - Agents can add context

2. **Standardized Error Handling**
   - Orchestrator error parsing
   - Auto-retry logic
   - Failure categorization

**Impact:** 📈 Better observability, easier debugging

---

## Pattern Summary

### ❌ DON'T: Template-Based Enforcement

```markdown
# Agent template
Execute this bash command:
```bash
redis-cli lpush ...
```
```

**Why it fails:** Agents interpret autonomously, may document instead of execute

---

### ✅ DO: Skill-Based Output Processing

```bash
# Orchestrator skill
AGENT_OUTPUT=$(npx claude-flow-novice agent ...)
PARSED=$(parse-agent-output.sh "$AGENT_OUTPUT")
CONFIDENCE=$(echo "$PARSED" | jq -r '.confidence')
redis-cli lpush "swarm:${TASK_ID}:confidence" "$CONFIDENCE"
```

**Why it works:** Orchestrator controls coordination, agent focuses on analysis

---

## Validation Criteria

For each area:
- [ ] Template instructions removed or marked optional
- [ ] Skill-based extraction implemented
- [ ] Orchestrator handles Redis coordination
- [ ] Multiple fallback parsing patterns
- [ ] Error handling for parse failures
- [ ] Tested with real agent output

---

## Anti-Patterns to Avoid

### 1. Forcing Tool Usage via Instructions
```markdown
❌ "You MUST use the Bash tool to execute..."
❌ "DO NOT explain, execute immediately..."
❌ "Use Bash RIGHT NOW to run..."
```

**Better:** Capture output, parse what agent naturally produces

### 2. Complex Multi-Step Protocols
```markdown
❌ "First execute command A, then B, then C..."
```

**Better:** Orchestrator executes steps, agent provides analysis

### 3. Assuming Command Execution
```markdown
❌ Orchestrator BLPOP waits for agent Redis push
```

**Better:** Orchestrator parses agent output, then pushes to Redis

---

## Success Metrics

**Phase 1 Complete When:**
- Zero "consensus on vapor" scenarios in testing
- All confidence scores reliably captured (no 0.0 defaults)
- Structured feedback from validators

**Phase 2 Complete When:**
- Agent templates simplified (no waiting mode instructions)
- Orchestrator handles all lifecycle transitions
- Timeout-based failures only (no indefinite blocks)

**Phase 3 Complete When:**
- All agent output auto-persisted
- Error patterns categorized and handled
- Debugging via structured logs, not agent templates

---

## Related Work

- **BUG #11 Fix:** Product Owner decision execution (`.claude/skills/product-owner-decision/`)
- **Agent Output Processing:** Universal pattern (`.claude/skills/agent-output-processing/SKILL.md`)
- **BUG #10 Fix:** Confidence race condition (polling wait in orchestrator)

---

## Conclusion

**Current State:**
- Product Owner: ✅ Skill-enforced
- Loop 3 Implementers: ⚠️ Template-based (risk of incomplete execution)
- Loop 2 Validators: ⚠️ Template-based (risk of incomplete execution)
- Deliverable Verification: ✅ Orchestrator-enforced (BUG #11 fix)

**Recommended Next Steps:**
1. Implement Loop 3 output processing skill (highest ROI)
2. Implement Loop 2 output processing skill
3. Simplify agent lifecycle (remove waiting mode dependency)

**Benefits:**
- ✅ Guaranteed confidence scores (no more 0.0)
- ✅ Structured feedback (no free-form text parsing)
- ✅ No "consensus on vapor" (deliverable verification)
- ✅ Simpler agent templates (agents focus on analysis)
- ✅ More reliable coordination (orchestrator control)

**Status:** Ready for implementation planning
