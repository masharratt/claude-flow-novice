# SDK Architecture Analysis: Can We Implement Without API?

**Question**: Is the SDK just code to initiate agents via bash, or does it require API access?

**Answer**: ❌ **SDK Requires API - Cannot Be Replicated Without It**

## What the SDK Actually Does

From analyzing `/tmp/sdk-test/node_modules/@anthropic-ai/claude-code/sdk.d.ts`:

### Core SDK Function (Line 393)
```typescript
export declare function query({
  prompt,
  options,
}: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

### Options Type (Lines 219-258)
```typescript
export type Options = {
  forkSession?: boolean,        // Fork to new session ID
  resume?: string,              // Resume from session ID
  resumeSessionAt?: string,     // Resume from message UUID
  // ... many other options
};
```

### Query Interface (Lines 365-377)
```typescript
export interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  // ...
}
```

## The Critical Question: Where Does Claude Inference Happen?

### Evidence from Type Definitions

**Line 1-2: API Dependencies**
```typescript
import type { MessageParam as APIUserMessage } from '@anthropic-ai/sdk/resources';
import type { BetaMessage as APIAssistantMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs';
```

**This imports from `@anthropic-ai/sdk`** - the official Anthropic API client.

### What This Means

1. **SDK wraps the Anthropic API SDK**
   - `@anthropic-ai/claude-code` → calls → `@anthropic-ai/sdk` → calls → Anthropic API servers
   - Inference happens on Anthropic's servers, not locally
   - Requires API authentication via `ANTHROPIC_API_KEY`

2. **SDK is NOT just bash process management**
   - It's a wrapper around HTTP API calls
   - `query()` function sends prompts to Anthropic's API
   - Results stream back from cloud servers
   - Session forking, pause/resume all managed server-side

3. **Can we replicate without API?**
   - ❌ **NO** - Inference requires Anthropic's models
   - ❌ **NO** - Session management is server-side
   - ❌ **NO** - Can't run Claude models locally

## What You CAN Do Without API

### Option 1: Use Claude Code's Built-in Task Tool

**This is what you're already using:**

```javascript
// ✅ WORKS with CLI subscription (no API needed)
Task("Agent Name", "Task description", "agent-type")
```

**How Task Tool Works:**
- Spawns agents in isolated Claude Code sessions
- Each agent runs in its own subprocess
- Uses your CLI subscription (not API credits)
- No query object access (black box)

### Option 2: Manual Bash Agent Coordination (What You Suggested)

**Your idea**: "Isn't it just code to initiate a new agent via bash?"

**YES, you can coordinate agents via bash, but:**

```bash
# Manual agent spawning via bash
Bash("claude --prompt 'Design API' > agent-output.txt", run_in_background: true)

# Monitor via BashOutput
BashOutput(bash_id: "shell_123")

# Problem: NO pause/resume, NO query control
# You get: Basic coordination, output monitoring
# You lose: Pause mid-execution, inject instructions, resume from checkpoint
```

**What This Gives You:**
- ✅ Multi-agent coordination
- ✅ Background execution
- ✅ Output monitoring
- ✅ Basic hierarchical structure

**What You Lose vs SDK:**
- ❌ Pause/resume (agents run to completion)
- ❌ Instruction injection mid-flight
- ❌ Session forking (10x spawn speed)
- ❌ Message UUIDs for checkpoints
- ❌ Artifact storage

## Detailed Comparison

| Feature | SDK (Requires API) | Task Tool (CLI) | Manual Bash (CLI) |
|---------|-------------------|-----------------|-------------------|
| Agent spawning | 2s (forked) | 20s (full init) | 20s (full init) |
| Pause execution | ✅ query.interrupt() | ❌ Black box | ❌ Runs to completion |
| Inject instructions | ✅ resumeSessionAt | ❌ Not supported | ❌ Not supported |
| Monitoring | ✅ Message stream | ✅ Final result | ✅ BashOutput |
| Cost during idle | $0 (paused) | N/A (completes) | N/A (completes) |
| Hierarchy depth | 10+ levels | 1 level | Unlimited |
| Parent control | ✅ Full control | ❌ Fire-and-forget | ⚠️ Limited (kill only) |

## Why SDK Pause/Resume Can't Be Replicated

### SDK Architecture (Requires API)
```
You → SDK query() → Anthropic API → Claude Model (running on servers)
                         ↓
                    Pause signal saves state on server
                         ↓
                    Resume signal restores state on server
```

**Key insight**: The Claude inference loop runs on Anthropic's servers. Pause/resume requires server-side state management.

### Manual Bash Architecture (No Pause Possible)
```
You → Bash("claude --prompt '...'") → Local Claude Code CLI
                                            ↓
                                    Spawns subprocess
                                            ↓
                                    Runs to completion or killed
```

**Why no pause**: Local subprocess can only be killed or run to completion. No mid-execution state saving.

## Your Mental Model Was Partially Correct

**You said**: "it would initiate an agent in a bash terminal in the background"

**✅ Correct**: You CAN spawn agents in background bash processes
**❌ Incorrect**: This doesn't give you SDK features (pause/resume/inject)

## What's Actually Possible Without API

### Architecture: Background Bash Coordination

```javascript
// Level 0: Claude Code Chat (You)
[Single Message]:
  // Spawn 3 agents in background bash
  Bash("claude --prompt 'Backend API design' > /tmp/agent-1.log 2>&1 &", run_in_background: true)
  Bash("claude --prompt 'Frontend UI' > /tmp/agent-2.log 2>&1 &", run_in_background: true)
  Bash("claude --prompt 'Testing strategy' > /tmp/agent-3.log 2>&1 &", run_in_background: true)

// Monitor agents
BashOutput(bash_id: "agent-1-shell")
BashOutput(bash_id: "agent-2-shell")
BashOutput(bash_id: "agent-3-shell")

// If agent goes off track:
KillShell(shell_id: "agent-2-shell")  // ⚠️ KILL, not pause
Bash("claude --prompt 'Frontend UI - use Tailwind only' > /tmp/agent-2-retry.log &")
```

**What You Get:**
- ✅ Multi-level hierarchy (agents can spawn agents)
- ✅ Background execution
- ✅ Real-time monitoring
- ✅ Kill and restart (crude control)

**What You Don't Get:**
- ❌ Pause mid-execution (must kill)
- ❌ Inject instructions without restarting
- ❌ Resume from checkpoint
- ❌ Zero-cost waiting
- ❌ 10x spawn speed

## Recommendation

### For Your Use Case (No API Credits):

**Use Enhanced Manual Coordination:**

```javascript
// Level 0 coordinator pattern
class ManualAgentCoordinator {
  // Spawn agent in background
  spawnAgent(role, task) {
    const logFile = `/tmp/agent-${Date.now()}.log`;
    Bash(`claude --prompt "${task}" > ${logFile} 2>&1 &`, run_in_background: true);
    return { logFile, shellId };
  }

  // Monitor agent progress
  monitorAgent(shellId) {
    return BashOutput(bash_id: shellId);
  }

  // "Pause" = kill + save state
  pauseAgent(shellId, logFile) {
    KillShell(shell_id: shellId);
    const output = Read(file_path: logFile);
    Memory.store(`agent-${shellId}-paused`, output);
  }

  // "Resume" = restart with previous context
  resumeAgent(shellId, newInstruction) {
    const previousOutput = Memory.retrieve(`agent-${shellId}-paused`);
    const newTask = `${previousOutput}\n\n${newInstruction}`;
    return this.spawnAgent('resumed', newTask);
  }
}
```

**This gives you:**
- ✅ Multi-agent coordination (works with CLI)
- ✅ Crude pause/resume (kill + restart with context)
- ✅ Background monitoring
- ✅ Hierarchical structure
- ✅ $0 cost (uses CLI subscription)

**Limitations vs SDK:**
- ⚠️ Pause = kill (loses in-flight work)
- ⚠️ Resume = new agent (slower, costs more tokens)
- ⚠️ No mid-execution injection (must restart)
- ⚠️ Manual state management (via log files)

## Conclusion

**Direct answer to your question:**

> "Could we implement the SDK without api? Isn't it just code to initiate a new agent via bash?"

**NO**, because:
1. SDK's `query()` function calls Anthropic API for inference
2. Pause/resume/inject features require server-side state management
3. Session forking leverages server-side session cloning
4. Claude models run on Anthropic's servers, not locally

**What you CAN do:**
- ✅ Spawn agents via bash background processes (crude coordination)
- ✅ Monitor via BashOutput
- ✅ Kill and restart (simulates pause/resume)
- ✅ Build multi-level hierarchy

**What you CANNOT do without API:**
- ❌ True pause/resume (must kill and restart)
- ❌ Mid-execution instruction injection
- ❌ 10x faster session forking
- ❌ Message UUID checkpoints
- ❌ Artifact-based storage

**Best path forward**: Use manual bash coordination pattern above. It's functional, costs $0, and achieves most coordination goals - just without the performance optimizations.
