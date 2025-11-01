# BUG: Memory Leak from Task-Spawned Validators

**Date Identified:** 2025-11-01
**Status:** FIXED
**Priority:** Critical (P0)
**Confidence:** 0.95

---

## Executive Summary

Memory leak caused by Task-spawned validators attempting to execute slash commands via Bash and spawning nested CFN Loops. Validators hung indefinitely on failed commands, creating blocked processes that accumulated until system killed.

**Root Cause:** Conflated CLI-mode and Task-mode completion protocols in agent documentation after "stateless architecture" changes (Oct 23, 2025).

**Impact:** Production system killed by OS, user work interrupted.

**Fix:** Mode-specific completion protocols + explicit scope boundaries preventing nested CFN Loop spawning.

---

## Incident Details

### What Happened

User spawned 5 validators via Task() for Q2 content validation:
```
Task("reviewer", "Review Q2 content systems")
Task("tester", "Test Q2 content generation")
Task("system-architect", "Validate Q2 architecture")
Task("security-specialist", "Security audit Q2 systems")
Task("code-analyzer", "Static analysis Q2 code")
```

**Validator Behavior (Observed):**
1. **reviewer**: `npx claude-flow-novice /cfn-loop-cli` ❌
2. **tester**: `find` command (legitimate but blocked)
3. **system-architect**: `mkdir` (harmless)
4. **security-specialist**: `/cfn-loop-task` as bash command ❌
5. **code-analyzer**: TypeScript compilation (legitimate)

**Errors:**
```bash
Error: Unknown command: /cfn-loop-cli
Error: /bin/bash: line 1: /cfn-loop-task: No such file or directory
```

**Result:** Processes hung waiting for non-existent commands → memory leak → system killed process.

---

## Root Cause Analysis

### Timeline of Bug Introduction

**Oct 23, 2025 (Commit 2269a2be):**
"Stateless architecture" docs update removed waiting mode and added completion protocol:

```bash
# 1. Complete work
# 2. Signal done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 3. Report confidence and exit
./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1
```

**Problem:** This protocol is **CLI-mode only** but was documented as universal "Agent Completion Protocol".

### Why Validators Got Confused

**Task-spawned validators read agent docs and saw:**
- "MUST signal completion"
- "MUST report confidence"
- CLI-mode Redis coordination examples

**Validators attempted to comply but didn't understand HOW in Task mode:**
- Tried slash commands via Bash: `/cfn-loop-cli` ❌
- Attempted nested CFN Loop spawning ❌
- No understanding of mode differences

**Correct behavior (Task mode):**
- Simply return structured output
- Main Chat receives it automatically
- No Redis signals needed

---

## The Fix

### 1. CLAUDE.md - Mode-Specific Completion Protocol

**Location:** `CLAUDE.md:333-357`

**Before:**
```bash
**Agent Completion Protocol:**
Each agent MUST signal completion and report confidence, then exit:
[Redis commands...]
```

**After:**
```bash
**Agent Completion Protocol (Mode-Specific):**

**CLI Mode** (spawned via `npx claude-flow-novice agent-spawn`):
[Redis commands...]

**Task Mode** (spawned via Task() tool in Main Chat):
# Simply complete work and return output
# Main Chat receives output automatically
# NO Redis signals required
# NO explicit completion protocol needed
```

### 2. Validator Agents - Scope Boundaries + Mode-Aware Protocols

**Updated Files:**
- `.claude/agents/cfn-dev-team/reviewers/reviewer.md:200-258`
- `.claude/agents/cfn-dev-team/testers/tester.md:160-217`

**Added Section:**
```markdown
## CFN Loop Completion Protocol (Mode-Specific)

### ⚠️ CRITICAL: Validator Scope Boundaries

**YOU ARE A VALIDATOR, NOT A COORDINATOR**

✅ **Your responsibilities:**
- Review code and deliverables
- Assess quality, security, performance
- Provide structured feedback
- Report confidence score

❌ **DO NOT:**
- Spawn nested CFN Loops (`/cfn-loop-cli`, `/cfn-loop-task`)
- Use SlashCommand tool (Main Chat only)
- Coordinate other agents
- Attempt complex orchestration

### Task Mode (Spawned via Task() Tool)
Simply complete validation and return structured output.
No Redis signals required - Main Chat receives output automatically.

### CLI Mode (Spawned via `npx claude-flow-novice agent-spawn`)
[Redis completion protocol...]
```

### 3. Adaptive Context - ANTI-023

**Location:** `CLAUDE.md:550-556`

```markdown
#### ANTI-023: Task-Spawned Validators Without Completion Protocol
- **Context**: Loop 2 Validation (Task Mode)
- **Insight**: Main Chat spawns validators via Task() without clear scope
  boundaries or mode-aware completion protocols. Anti-pattern: Validators see
  CLI-mode completion instructions (Redis signals, `invoke-waiting-mode.sh
  report`) and attempt to comply using wrong tools (slash commands via Bash,
  nested CFN Loop spawning). Result: Agents hang indefinitely trying to
  execute `/cfn-loop-cli` as bash command, memory leak from blocked processes.
- **Tags**: task-spawning, validation, completion-protocol, scope-boundaries,
  memory-leak
- **Confidence**: 0.95
- **Priority**: 10/10
- **Fix**: Mode-specific completion protocols in CLAUDE.md:333-357 and
  validator agents (reviewer.md:200-258, tester.md:160-217). Explicit scope
  boundaries prevent nested CFN Loop spawning.
```

---

## Why This Matters

### Before Fix

**Validator confusion led to:**
1. Attempted slash command execution via Bash (wrong tool)
2. Nested CFN Loop spawning attempts (wrong scope)
3. Hanging processes waiting for commands that don't exist
4. Memory accumulation → system kill

**User Experience:**
- Production work interrupted
- Lost context from process kill
- Confusion about why validators failed

### After Fix

**Validators now understand:**
1. **Task Mode:** Return output, Main Chat handles rest
2. **CLI Mode:** Use Redis signals + completion protocol
3. **Scope:** Validate only, don't coordinate/spawn
4. **Tools:** No slash commands, they're Main Chat only

**User Experience:**
- Validators complete cleanly
- No hanging processes
- Clear feedback in Task mode
- Proper coordination in CLI mode

---

## Validation

### Test Scenarios

**Task Mode Validation (Expected Behavior):**
```javascript
// Main Chat
Task("reviewer", "Review implementation in src/auth.ts")
// Agent returns:
// {
//   "confidence": 0.85,
//   "status": "APPROVED",
//   "feedback": [...]
// }
// ✅ Clean completion, no Redis signals
```

**CLI Mode Validation (Expected Behavior):**
```bash
# Coordinator spawns validator
npx claude-flow-novice agent-spawn reviewer --task-id task-123

# Validator:
# 1. Reviews code
# 2. Signals: redis-cli lpush "swarm:task-123:reviewer:done" "complete"
# 3. Reports: invoke-waiting-mode.sh report --confidence 0.85
# 4. Exits cleanly
# ✅ Coordinator collects confidence from Redis
```

### Prevention

**Pre-Deployment Checks:**
1. Agent docs explicitly state mode-specific protocols
2. Scope boundaries prevent nested CFN Loop spawning
3. Slash commands documented as "Main Chat only"
4. Adaptive context captures anti-pattern

**Monitoring:**
- No hanging validator processes
- Clean exits after Task() completion
- No Bash errors for slash commands

---

## Related Issues

- **BUG #30**: CLI-spawned Loop 2 validators crashing (different root cause - context injection)
- **Commit 2269a2be**: Stateless architecture changes that introduced confusion
- **Oct 23, 2025**: Waiting mode deprecation and protocol unification attempt

---

## Lessons Learned

### What Worked

1. **User observation:** Team correctly identified slash command attempts
2. **Mode awareness:** User questioned why Task mode needs Redis signals
3. **Root cause analysis:** Traced back to Oct 23 architecture changes

### What Didn't Work

1. **Universal protocol assumption:** Thought CLI + Task could share protocol
2. **Implicit mode detection:** Agents couldn't infer mode from context
3. **Scope ambiguity:** Validators didn't know they shouldn't spawn loops

### Improvements

1. **Explicit mode documentation:** Always specify CLI vs Task behavior
2. **Scope boundaries:** Tell agents what NOT to do, not just what to do
3. **Tool restrictions:** Document slash commands as Main Chat exclusive
4. **Anti-pattern capture:** ANTI-023 prevents recurrence

---

## Recommendations

### For Users

**When spawning validators via Task():**
- They'll return structured output automatically
- No completion protocol needed
- If validators try to spawn loops, report as bug

**When using CFN Loop (CLI mode):**
- Use `/cfn-loop-cli` or `/cfn-loop-task` slash commands
- Coordinator handles validator spawning internally
- Validators use Redis completion protocol automatically

### For Future Development

1. **Mode detection helper:** Agents can check if spawned via Task() vs CLI
2. **Validation layer:** Prevent validators from accessing SlashCommand tool
3. **Scope enforcement:** Technical barriers preventing nested loop spawning
4. **Testing:** Simulate Task-spawned validators with mode-ambiguous docs

---

## Status

**FIXED** ✅

**Verification:**
- [x] CLAUDE.md updated with mode-specific protocols (lines 333-357)
- [x] reviewer.md updated with scope boundaries (lines 200-258)
- [x] tester.md updated with scope boundaries (lines 160-217)
- [x] ANTI-023 documented in adaptive context (lines 550-556)
- [x] Post-edit validation passed (all files)

**Next Steps:**
- Monitor for recurrence with Task-spawned validators
- Consider updating other validator agents (security-specialist, code-analyzer, etc.)
- Add mode detection helper for agents

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-01
**Author:** Main Chat (Memory Leak Investigation Team)
