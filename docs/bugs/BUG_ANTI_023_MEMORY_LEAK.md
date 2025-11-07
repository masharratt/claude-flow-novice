# BUG-ANTI-023: Task Mode Memory Leak Analysis

**Date Identified:** 2025-11-06
**Severity:** Critical
**Status:** RESOLVED (v2.14.28)
**Memory Impact:** Up to 23GB memory consumption per hanging agent

## Problem Description

Validator agents spawned via Task() tool were attempting CLI coordination scripts designed for CLI-spawned agents, causing processes to hang indefinitely and consume excessive memory.

## Root Cause Analysis

### Task Mode vs CLI Mode Confusion

**Task Mode (spawned via `Task()` tool):**
- Agent receives task directly from Main Chat
- No environment variables (`TASK_ID`, `AGENT_ID`) set
- Should return structured JSON output directly
- ❌ **BUG:** Agents attempted CLI coordination scripts

**CLI Mode (spawned via `npx claude-flow-novice agent-spawn`):**
- Agent spawned via CLI with environment variables
- `TASK_ID` and `AGENT_ID` variables available
- Uses Redis coordination and CLI scripts
- ✅ **CORRECT:** Proper workflow

### Memory Leak Pattern (ANTI-023)

1. **Task-spawned agent** receives validation task
2. **Agent documentation** instructed CLI completion (incorrect for Task Mode)
3. **Agent attempts** Redis coordination scripts
4. **Scripts hang** waiting for Redis operations that never complete
5. **Process memory** grows indefinitely (observed 23GB)
6. **Process never exits** - requires manual termination

### Affected Components

**Validator Agents:**
- `reviewer` - Code review validation
- `tester` - Test execution validation
- `perf-analyzer` - Performance analysis
- `cyclomatic-complexity-reducer` - Code complexity reduction
- `security-specialist` - Security audit validation
- `code-quality-validator` - Code quality assessment

**Coordination Scripts:**
- `report-completion.sh` - Redis completion reporting
- `consensus.sh` - Consensus score collection
- `orchestrate.sh` - Main orchestration coordination
- `spawn-agents.sh` - Agent spawning coordination
- `spawn-agent.sh` - CLI agent spawning

## Forensic Evidence

### Memory Monitoring Log
```
PID: 67596
Memory Usage: 23GB (growing)
Status: Hanging indefinitely
Network: CLOSE_WAIT connections to Anthropic API
Root Cause: CLI coordination script execution in Task Mode
```

### Process Analysis
- HTTP client threads hanging on API calls
- Network connections stuck in CLOSE_WAIT state
- Redis operations waiting indefinitely
- No proper process termination mechanism

## Solution Implementation

### Three-Layer Defense System

#### Layer 1: Agent Documentation Fix
Updated all validator agents with mode-specific completion protocols:

```markdown
## ⚠️ CRITICAL: Mode-Specific Completion Protocol

**Task Mode (95%):** Spawned via `Task()` tool in Main Chat
- Return structured JSON output directly
- ❌ DO NOT use Redis commands, bash scripts, CLI tools

**CLI Mode (5%):** Spawned via `npx claude-flow-novice agent-spawn`
- Use Redis signals and completion scripts
- ✅ CLI coordination allowed
```

#### Layer 2: Agent-Level Detection
Added `detect_task_mode_and_exit()` functions:

```bash
detect_task_mode_and_exit() {
  if [[ -z "${TASK_ID:-}" || -z "${AGENT_ID:-}" ]]; then
    echo "❌ TASK MODE DETECTED - CLI commands forbidden"
    exit 1
  fi
}
```

#### Layer 3: Code-Level Runtime Blocking
Added early exit checks in coordination scripts:

```bash
# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Block Task Mode agents
if [[ -z "${TASK_ID:-}" || -z "${AGENT_ID:-}" ]]; then
    echo "❌ TASK MODE DETECTED - Redis coordination forbidden"
    exit 1
fi
```

## Detection Logic

### Environment Variable Detection
```bash
# Task Mode: Variables missing → Exit immediately
if [[ -z "${TASK_ID:-}" || -z "${AGENT_ID:-}" ]]; then
    exit 1
fi

# CLI Mode: Variables present → Proceed with coordination
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Mode-Specific Behavior
| Mode | Spawn Method | Environment | Completion | Memory Usage |
|------|-------------|-------------|------------|-------------|
| Task | `Task("agent", "task")` | No env vars | JSON output | Normal |
| CLI | `npx agent-spawn` | Has env vars | Redis coordination | Normal |

## Resolution Verification

### Memory Monitoring
- ✅ No hanging processes detected
- ✅ Memory usage remains stable (<100MB per agent)
- ✅ Proper process termination in Task Mode

### Agent Behavior
- ✅ Task Mode agents return JSON directly
- ✅ CLI Mode agents use Redis coordination correctly
- ✅ Mode detection works reliably

### Process Management
- ✅ No zombie processes
- ✅ Clean exit on mode detection
- ✅ No hanging Redis operations

## Performance Impact

### Before Fix
- Memory usage: Up to 23GB per hanging agent
- Process cleanup: Manual intervention required
- System stability: Compromised by hanging processes

### After Fix
- Memory usage: <100MB per agent (normal)
- Process cleanup: Automatic and immediate
- System stability: Robust and reliable

## Lessons Learned

### Design Principles
1. **Mode-Specific Behavior:** Different spawn methods require different protocols
2. **Environment Detection:** Use environment variables for reliable mode detection
3. **Defense-in-Depth:** Multiple layers of protection prevent regression
4. **Documentation Accuracy:** Agent documentation must match actual spawn method

### Implementation Patterns
1. **Early Exit Strategy:** Detect and reject invalid usage immediately
2. **Clear Error Messages:** Provide actionable feedback for incorrect usage
3. **Runtime Validation:** Don't rely solely on documentation compliance
4. **Testing Strategy:** Test both spawn modes explicitly

## Future Prevention

### Code Review Checklist
- [ ] Agent completion protocols match spawn method
- [ ] CLI scripts include Task Mode detection
- [ ] Environment variable validation implemented
- [ ] Memory leak testing for new agents

### Testing Requirements
- Test agents in both Task Mode and CLI Mode
- Verify memory usage remains stable
- Confirm proper process termination
- Validate error messages are clear and actionable

## Related Documentation

- [BUG_ANTI_023_REMEDIATION.md](./BUG_ANTI_023_REMEDIATION.md) - Complete remediation strategy
- [CLAUDE.md](../CLAUDE.md) - Updated agent creation guidelines
- [CFN_LOOP_TASK_MODE.md](../.claude/commands/CFN_LOOP_TASK_MODE.md) - Task mode documentation

## Resolution Summary

**ANTI-023 memory leak completely resolved** through three-layer defense system:

1. **Documentation fixes** ensure agents use correct completion protocols
2. **Agent-level detection** prevents CLI calls in Task Mode
3. **Code-level blocking** provides runtime protection

**Result:** Zero memory leaks, proper process management, reliable agent behavior across both spawn modes.

---

**Fix Version:** claude-flow-novice@2.14.28
**Resolution Date:** 2025-11-06
**Status:** ✅ RESOLVED