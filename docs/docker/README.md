# Docker Agent Behavior Logs

This directory contains logs and analysis from testing Docker-based agent execution for the B10 TypeScript error fix batch.

## Files

### `agent-behavior-analysis.md`
Comprehensive analysis of agent behavior showing iteration-by-iteration breakdown of what the agent did vs what it was instructed to do.

**Key Finding**: Agent spent all 10 iterations exploring project structure with Bash commands instead of reading/editing the target file, despite explicit instructions to ONLY read and edit the specified file.

### `single-agent-test-v3-focused.log`
Complete log output from single agent test showing:
- Agent initialization and configuration
- All 10 iterations with tool calls and commands
- Exit code and completion status
- File hash verification (unchanged - no modifications made)

### `single-agent-output.log`
Raw agent execution output without test harness wrapper.

### `test-single-b10-agent.sh`
Test script used to run single agent in Docker container with:
- File hash capture before/after
- Focused prompt with explicit DO/DO NOT instructions
- Log output capture

## Summary

**Test Configuration:**
- Target: `src/services/notifications/permissionNotifications.ts` (13 errors)
- Agent: typescript-specialist
- Result: ❌ FAILED - File not modified

**Root Cause:**
Agent templates have built-in exploration behavior patterns that override explicit prompt instructions. The typescript-specialist agent is designed for comprehensive analysis, not focused file fixing.

**Evidence:**
```
Iteration 1-4: Bash exploration (find files, ls, pwd)
Iteration 5: Read tsconfig.json (WRONG file)
Iteration 6-10: More Bash exploration (npm scripts, tsc commands)
```

Agent never read or edited `/workspace/src/services/notifications/permissionNotifications.ts` despite prompt explicitly stating:
- "Start NOW by reading /workspace/$TEST_FILE"
- "DO NOT: Read tsconfig.json" (agent did anyway)
- "DO NOT: Explore project structure" (agent did anyway)

## Proposed Solutions

See `agent-behavior-analysis.md` for detailed solution options. Most promising:

**Option B: Embed File Content in Prompt**
- Provide file content directly in prompt
- Eliminates agent's need to explore
- Forces immediate action on provided content
- Fast to implement (modify worker script only)

## Next Steps

1. Verify B10 file sizes (ensure they fit in prompts)
2. Modify `tests/docker/b10-typescript-fix/agent-worker.sh` to embed content
3. Test single agent with embedded content
4. Run full B10 test with 32 parallel agents if successful
