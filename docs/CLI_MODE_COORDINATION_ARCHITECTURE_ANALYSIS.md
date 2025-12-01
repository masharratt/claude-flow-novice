# CLI Mode Coordination Architecture Analysis

**Date:** 2025-11-24
**Purpose:** Investigation for 3/4 completion threshold and Redis bidirectional communication features
**Status:** Architecture analysis complete, feasibility assessment provided

---

## Executive Summary

**Current Architecture:** Main Chat spawns CLI agents directly and waits for completion via Redis BLPOP (2-layer coordination)

**Waiting Pattern:** Sequential BLPOP on `cfn-completion:{taskId}` key (one agent at a time)

**Feasibility Assessment:**
- ✅ **3/4 Completion Threshold**: FEASIBLE - Requires parallel BLPOP tracking
- ✅ **Redis Bidirectional Communication**: FEASIBLE - Agents already have Redis client, need message processing loop

---

## Part 1: Current Coordination Architecture

### 1.1 Message Flow: Main Chat → Agents → Main Chat

```
┌─────────────────────────────────────────────────────────────────┐
│                         MAIN CHAT                               │
│                                                                 │
│  1. Parse /cfn-loop-cli command                                │
│  2. Spawn CLI agents via spawn-agent-cli.ts                   │
│  3. Wait for completion: redis-cli BLPOP cfn-completion:{tid}  │
│  4. Process completion signals sequentially                     │
│  5. Decide: spawn more agents or conclude                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────────┐
                    │   REDIS (localhost)  │
                    │                      │
                    │  Key Patterns:       │
                    │  cfn-completion:{tid}│
                    │  swarm:{tid}:{aid}   │
                    └─────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      CLI AGENTS (4x)                            │
│                                                                 │
│  Agent 1 (backend-dev):                                        │
│    - Executes task                                             │
│    - Signals: LPUSH cfn-completion:{tid} {metadata}           │
│    - Exits cleanly                                             │
│                                                                 │
│  Agent 2 (frontend-dev):                                       │
│    - Executes task                                             │
│    - Signals: LPUSH cfn-completion:{tid} {metadata}           │
│    - Exits cleanly                                             │
│                                                                 │
│  Agent 3 (tester):                                             │
│    - Executes task                                             │
│    - Signals: LPUSH cfn-completion:{tid} {metadata}           │
│    - Exits cleanly                                             │
│                                                                 │
│  Agent 4 (reviewer):                                           │
│    - Executes task                                             │
│    - Signals: LPUSH cfn-completion:{tid} {metadata}           │
│    - Exits cleanly                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Files and Line Numbers

**Main Chat Coordination:**
- `.claude/commands/cfn-loop-cli.md:95-120` - BLPOP waiting logic
  - Key: `cfn-completion:{taskId}`
  - Timeout: 120 seconds
  - Sequential processing (one agent at a time)

**Agent Spawning:**
- `src/cli/spawn-agent-cli.ts:146-250` - CLI entry point
  - Parses arguments (agent-type, task-id, provider, mode)
  - Generates task ID with "cli:" prefix (Phase 1 collision mitigation)
  - Spawns agent via AgentSpawner

- `src/cli/agent-spawner.ts:1-651` - Spawning orchestration
  - `spawnAgent()` (L87-161): High-level spawning API
  - `buildEnvironment()` (L315-345): Injects CFN_REDIS_HOST, TASK_ID, PROVIDER, etc.
  - `spawnProcess()` (L457-487): Actual process spawn with tsx

**Agent Completion Signaling:**
- `src/cli/agent-executor.ts:150-250` - CFN Protocol execution
  - `executeCFNProtocol()` function
  - Line 175: `orchestratorKey = swarm:{taskId}:{agentId}:done`
  - Line 179: `await redisClient.lPush(orchestratorKey, 'complete')`
  - Line 185: `mainChatKey = cfn-completion:{taskId}`
  - Line 195: `await redisClient.lPush(mainChatKey, agentMetadata)`
  - Metadata: `{agentId, taskId, status, iteration, confidence}`

**Redis Client:**
- `src/cli/agent-executor.ts:50-100` - Redis connection
  - `createRedisClient()` function
  - Uses `CFN_REDIS_HOST` and `CFN_REDIS_PORT` from environment
  - Connection pooling not implemented (new client per agent)

### 1.3 Current Waiting Pattern (Sequential)

```typescript
// Main Chat waiting logic (bash)
// FILE: .claude/commands/cfn-loop-cli.md:105-120

SIGNAL_KEY="cfn-completion:$TASK_ID"
TIMEOUT_SECONDS=120

# Wait for ONE agent completion at a time
COMPLETION_SIGNAL=$(timeout $TIMEOUT_SECONDS redis-cli BLPOP "$SIGNAL_KEY" $((TIMEOUT_SECONDS + 10)))

if [ $? -eq 0 ] && [ -n "$COMPLETION_SIGNAL" ]; then
  echo "✅ CLI agent completed successfully"
  SIGNAL_DATA=$(echo "$COMPLETION_SIGNAL" | tail -n 1)
  echo "🔍 Agent signal: $SIGNAL_DATA"

  # Process this signal, then potentially loop to wait for next agent
fi
```

**Limitation:**
- ❌ Sequential waiting (one agent at a time)
- ❌ No parallel completion tracking
- ❌ No partial completion threshold (3/4 agents)

---

## Part 2: Feasibility Assessment for New Features

### 2.1 Feature 1: 3/4 Agent Completion Threshold

**Goal:** Main Chat should exit waiting when 3 out of 4 spawned agents complete (or timeout).

**Current Limitation:**
Main Chat uses sequential BLPOP, which only detects one agent at a time. No tracking of total agents spawned or completion count.

**Feasibility:** ✅ **FEASIBLE** with moderate implementation effort

**Implementation Approach:**

**Option A: Parallel BLPOP with Completion Tracking (RECOMMENDED)**

```typescript
// FILE: src/cli/coordination/wait-for-threshold.ts (NEW)

import { createClient } from 'redis';

interface ThresholdWaitConfig {
  taskId: string;
  totalAgents: number;
  threshold: number; // 0.75 for 3/4
  timeoutSeconds: number;
}

async function waitForCompletionThreshold(config: ThresholdWaitConfig): Promise<{
  completed: string[];
  remaining: string[];
  timedOut: boolean;
}> {
  const redis = await createClient({ url: 'redis://localhost:6379' }).connect();
  const signalKey = `cfn-completion:${config.taskId}`;
  const completedAgents: string[] = [];
  const requiredCount = Math.ceil(config.totalAgents * config.threshold);

  const startTime = Date.now();
  const timeoutMs = config.timeoutSeconds * 1000;

  while (completedAgents.length < requiredCount) {
    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;

    if (remaining <= 0) {
      // Timeout reached, return partial results
      return {
        completed: completedAgents,
        remaining: [], // TODO: Track spawned agent IDs
        timedOut: true
      };
    }

    // BLPOP with remaining timeout
    const timeoutSec = Math.ceil(remaining / 1000);
    const signal = await redis.blPop(signalKey, timeoutSec);

    if (signal) {
      const metadata = JSON.parse(signal.value);
      completedAgents.push(metadata.agentId);
      console.log(`✅ Agent ${metadata.agentId} completed (${completedAgents.length}/${requiredCount})`);

      // Check if threshold reached
      if (completedAgents.length >= requiredCount) {
        console.log(`🎯 Threshold reached (${completedAgents.length}/${config.totalAgents})`);
        break;
      }
    }
  }

  await redis.disconnect();

  return {
    completed: completedAgents,
    remaining: [], // TODO: Calculate from spawned list
    timedOut: false
  };
}
```

**Integration Points:**
1. Update `.claude/commands/cfn-loop-cli.md:105-120` to use TypeScript threshold waiter
2. Track spawned agent IDs in Main Chat coordination state
3. Pass `totalAgents` and `threshold` parameters to wait function

**Estimated Effort:** 4-6 hours
- 2h: Implement `wait-for-threshold.ts`
- 2h: Update Main Chat coordination logic
- 1h: Testing with 4 parallel agents
- 1h: Documentation and edge case handling

**Edge Cases:**
- What if 4th agent never spawns? (Track spawn failures)
- What if 3 agents complete instantly? (Threshold met early, 4th still running)
- What if all 4 timeout? (Return partial results, log warning)

**Option B: Redis Counter-Based Tracking**

```bash
# Main Chat tracking (bash alternative)
TASK_ID="cfn-cli-123"
TOTAL_AGENTS=4
THRESHOLD=3

# Initialize counter
redis-cli SET "cfn:task:$TASK_ID:total" $TOTAL_AGENTS
redis-cli SET "cfn:task:$TASK_ID:completed" 0

# Wait for threshold
while true; do
  COMPLETED=$(redis-cli GET "cfn:task:$TASK_ID:completed")

  if [ "$COMPLETED" -ge "$THRESHOLD" ]; then
    echo "✅ Threshold reached ($COMPLETED/$TOTAL_AGENTS)"
    break
  fi

  # Wait for next completion signal
  timeout 120 redis-cli BLPOP "cfn-completion:$TASK_ID" 120

  if [ $? -eq 0 ]; then
    redis-cli INCR "cfn:task:$TASK_ID:completed"
  fi
done
```

**Agent Changes:**
```typescript
// FILE: src/cli/agent-executor.ts:195
// After LPUSH to cfn-completion, also increment counter
await redisClient.lPush(mainChatKey, agentMetadata);
await redisClient.incr(`cfn:task:${taskId}:completed`); // NEW
```

**Estimated Effort:** 2-3 hours (simpler, bash-based)

---

### 2.2 Feature 2: Redis Bidirectional Communication

**Goal:** Main Chat should be able to send messages to running subagents (e.g., status requests, redirections). Subagents need to digest/process these messages.

**Current Limitation:**
- Agents only send signals (one-way: Agent → Main Chat)
- No message processing loop in agents
- No subscription to Main Chat command channel

**Feasibility:** ✅ **FEASIBLE** with significant implementation effort

**Implementation Approach:**

**Phase 1: Main Chat → Agent Command Channel**

```typescript
// FILE: src/cli/coordination/send-command.ts (NEW)

import { createClient } from 'redis';

interface AgentCommand {
  commandId: string;
  agentId: string;
  taskId: string;
  command: 'status' | 'redirect' | 'abort' | 'pause';
  payload?: Record<string, unknown>;
  timestamp: string;
}

async function sendCommandToAgent(agentId: string, taskId: string, command: AgentCommand): Promise<void> {
  const redis = await createClient({ url: 'redis://localhost:6379' }).connect();
  const commandKey = `cfn:agent:${taskId}:${agentId}:commands`;

  await redis.lPush(commandKey, JSON.stringify(command));
  console.log(`📨 Command sent to ${agentId}: ${command.command}`);

  await redis.disconnect();
}
```

**Main Chat Usage:**
```bash
# Send status request to agent
node src/cli/coordination/send-command.ts \
  --agent-id "agent-backend-dev-123" \
  --task-id "cfn-cli-456" \
  --command "status"

# Send redirect to agent
node src/cli/coordination/send-command.ts \
  --agent-id "agent-backend-dev-123" \
  --task-id "cfn-cli-456" \
  --command "redirect" \
  --payload '{"newTask":"implement feature B"}'
```

**Phase 2: Agent Message Processing Loop**

```typescript
// FILE: src/cli/agent-executor.ts:300-400 (NEW SECTION)

interface CommandProcessor {
  processCommands(agentId: string, taskId: string): Promise<void>;
}

class AgentCommandProcessor implements CommandProcessor {
  private redisClient: RedisClientType;
  private running: boolean = true;

  async processCommands(agentId: string, taskId: string): Promise<void> {
    this.redisClient = await createRedisClient();
    const commandKey = `cfn:agent:${taskId}:${agentId}:commands`;

    console.log(`📡 Agent ${agentId} listening for commands on ${commandKey}`);

    while (this.running) {
      try {
        // BLPOP with 5 second timeout (non-blocking)
        const command = await this.redisClient.blPop(commandKey, 5);

        if (command) {
          const cmd = JSON.parse(command.value) as AgentCommand;
          console.log(`📨 Received command: ${cmd.command}`);

          await this.handleCommand(cmd);
        }
      } catch (error) {
        console.error('Command processing error:', error);
      }
    }
  }

  private async handleCommand(cmd: AgentCommand): Promise<void> {
    switch (cmd.command) {
      case 'status':
        await this.sendStatusResponse(cmd);
        break;

      case 'redirect':
        await this.handleRedirect(cmd);
        break;

      case 'abort':
        console.log('⚠️  Abort command received, exiting...');
        this.running = false;
        process.exit(1);
        break;

      case 'pause':
        await this.handlePause(cmd);
        break;

      default:
        console.warn(`Unknown command: ${cmd.command}`);
    }
  }

  private async sendStatusResponse(cmd: AgentCommand): Promise<void> {
    const status = {
      agentId: cmd.agentId,
      taskId: cmd.taskId,
      status: 'running',
      progress: 0.65, // Example: 65% complete
      timestamp: new Date().toISOString()
    };

    const responseKey = `cfn:agent:${cmd.taskId}:${cmd.agentId}:status`;
    await this.redisClient.set(responseKey, JSON.stringify(status), { EX: 60 });
    console.log('✅ Status response sent');
  }

  private async handleRedirect(cmd: AgentCommand): Promise<void> {
    console.log('🔀 Redirect command received');
    const newTask = cmd.payload?.newTask as string;

    if (newTask) {
      console.log(`📝 New task: ${newTask}`);
      // TODO: Update agent context, re-run with new task
    }
  }

  private async handlePause(cmd: AgentCommand): Promise<void> {
    console.log('⏸️  Pause command received');
    const duration = (cmd.payload?.durationSeconds as number) || 30;

    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    console.log('▶️  Resuming after pause');
  }
}
```

**Integration into Agent Lifecycle:**

```typescript
// FILE: src/cli/agent-executor.ts:250-300 (MODIFY)

async function runAgent(agentType: string): Promise<void> {
  const agentId = process.env.AGENT_ID!;
  const taskId = process.env.TASK_ID!;

  // Start command processor in background
  const commandProcessor = new AgentCommandProcessor();
  const commandProcessorPromise = commandProcessor.processCommands(agentId, taskId);

  try {
    // Execute main agent work
    const output = await executeAgentWork(agentType);

    // Signal completion
    await executeCFNProtocol(taskId, agentId, output, iteration);
  } finally {
    // Stop command processor
    commandProcessor.stop();
    await commandProcessorPromise;
  }
}
```

**Estimated Effort:** 12-16 hours
- 3h: Implement `send-command.ts` (Main Chat side)
- 5h: Implement `AgentCommandProcessor` class
- 2h: Integrate command processor into agent lifecycle
- 2h: Command handlers (status, redirect, abort, pause)
- 2h: Testing bidirectional flow
- 2h: Documentation and error handling

**Edge Cases:**
- What if agent exits before processing command? (Command lost)
- What if Redis down? (Command processor fails gracefully)
- What if multiple Main Chats send commands to same agent? (Race condition)

---

## Part 3: Recommended Implementation Approach

### 3.1 Priority Order

**Phase 1: 3/4 Completion Threshold (Priority 1)**
- Lower complexity (4-6 hours)
- Immediate value for parallel agent coordination
- No agent code changes required (if using Option B counter-based)

**Phase 2: Redis Bidirectional Communication (Priority 2)**
- Higher complexity (12-16 hours)
- Requires agent lifecycle modifications
- Provides advanced control capabilities

### 3.2 Implementation Sequence

**Week 1: Completion Threshold**
1. Implement `wait-for-threshold.ts` or counter-based bash alternative
2. Update `.claude/commands/cfn-loop-cli.md` coordination logic
3. Add agent tracking (spawned vs completed)
4. Test with 4 parallel agents (various completion scenarios)
5. Document usage in CLI_MODE_ARCHITECTURE.md

**Week 2: Bidirectional Communication**
1. Implement `send-command.ts` (Main Chat command sender)
2. Implement `AgentCommandProcessor` class
3. Integrate processor into agent executor lifecycle
4. Add command handlers (status, redirect, abort, pause)
5. Test message flow: Main Chat → Redis → Agent → Response → Main Chat
6. Document Redis key patterns and command protocol

### 3.3 Testing Strategy

**Completion Threshold Tests:**
```bash
# Test: 3/4 agents complete within timeout
# Expected: Main Chat exits after 3rd agent, 4th still running

# Test: All 4 agents complete
# Expected: Main Chat exits after 4th agent

# Test: Only 2/4 agents complete, timeout
# Expected: Main Chat returns partial results after timeout

# Test: 3/4 agents complete instantly (race condition)
# Expected: Main Chat exits immediately, no waiting
```

**Bidirectional Communication Tests:**
```bash
# Test: Send status request to agent
# Expected: Agent responds with current progress

# Test: Send abort command to agent
# Expected: Agent exits cleanly with abort status

# Test: Send redirect command mid-execution
# Expected: Agent updates task context, continues with new task

# Test: Send command to non-existent agent
# Expected: Timeout, no response
```

---

## Part 4: Key Design Decisions

### 4.1 Completion Threshold Design

**Decision: Use TypeScript + Redis BLPOP (Option A)**
- Pro: Type-safe, better error handling, easier testing
- Pro: No agent code changes required
- Pro: Accurate completion tracking with metadata
- Con: More code than bash counter approach

**Alternative: Bash + Redis counters (Option B)**
- Pro: Simpler, fewer files
- Pro: No TypeScript compilation step
- Con: Requires agent changes (INCR call)
- Con: Less visibility into which agents completed

**Recommendation:** Option A (TypeScript) for better maintainability

### 4.2 Bidirectional Communication Design

**Decision: BLPOP-based command queue**
- Pro: Non-blocking for agents (5s timeout)
- Pro: No polling overhead
- Pro: Redis guarantees message ordering
- Con: Agent must check queue periodically

**Alternative: Redis Pub/Sub**
- Pro: Real-time message delivery
- Pro: No polling required
- Con: Messages lost if agent not subscribed when sent
- Con: More complex error handling

**Recommendation:** BLPOP queue for reliability over Pub/Sub

### 4.3 Command Response Pattern

**Decision: Use dedicated response keys**
- Pattern: `cfn:agent:{taskId}:{agentId}:status`
- TTL: 60 seconds (auto-cleanup)
- Main Chat polls response key after sending command

**Alternative: Response sent back to Main Chat queue**
- Pattern: `cfn:mainchat:responses:{taskId}`
- Pro: Centralized response handling
- Con: Harder to correlate requests/responses

**Recommendation:** Dedicated response keys for clarity

---

## Part 5: Collision Risk Assessment

### 5.1 Redis Key Namespace Isolation (Phase 1 Status)

**Current Status:** ⚠️ **PARTIALLY IMPLEMENTED**

```typescript
// FILE: src/cli/spawn-agent-cli.ts:146
// ✅ Task ID validation accepts mode prefixes
const taskIdPattern = /^([a-z]+:)?[a-zA-Z0-9_.-]{1,64}$/;

// ✅ generateTaskId() adds "cli:" prefix
function generateTaskId(rawTaskId: string, mode: 'cli' | 'trigger'): string {
  if (/^[a-z]+:/.test(rawTaskId)) {
    return rawTaskId; // Already has prefix
  }
  return `${mode}:${rawTaskId}`;
}

// ❌ Redis keys DON'T include mode prefix yet
// Current: cfn:task:{taskId}:status
// Should be: cfn:task:cli:{taskId}:status (CLI mode)
//           cfn:task:trigger:{taskId}:status (Trigger.dev mode)
```

**Impact on New Features:**
- ⚠️ Completion threshold keys need mode-aware namespacing
- ⚠️ Bidirectional command keys need mode-aware namespacing
- ⚠️ Without prefixes, CLI and Trigger.dev will interfere

**Required Fix (Phase 1 Complete):**
```typescript
// FILE: src/cli/agent-executor.ts:185
// Current (COLLISION RISK):
const mainChatKey = `cfn-completion:${taskId}`;

// Fixed (Mode-aware):
const mainChatKey = `cfn-completion:${taskId}`; // Already includes "cli:" prefix

// Verify taskId format:
// CLI mode: taskId = "cli:task-123"
// Result: cfn-completion:cli:task-123 ✅
```

**Action Required:**
- Verify all Redis key patterns use full taskId (with prefix)
- Test CLI and Trigger.dev modes in parallel
- Document key patterns in CLI_MODE_ARCHITECTURE.md

### 5.2 Service Name Consistency (Phase 2 Status)

**Current Status:** 🔴 **NOT ADDRESSED**

Different service names between CLI and Trigger.dev modes:
- CLI: `CFN_REDIS_HOST=cfn-redis` (mcp-network)
- Trigger: `CFN_REDIS_HOST=redis` (trigger-cfn-network)

**Impact on New Features:**
- Command sender must use correct service name per mode
- Agent command processor must connect to correct Redis instance

**Recommended Fix:**
```yaml
# FILE: docker/trigger-dev/docker-compose.yml:36
redis:
  container_name: trigger-dev-redis
  networks:
    trigger-cfn-network:
      aliases:
        - redis          # Original name
        - cfn-redis      # CLI compatibility alias
```

---

## Part 6: Implementation Files Checklist

### 6.1 New Files Required

**Completion Threshold Feature:**
- [ ] `src/cli/coordination/wait-for-threshold.ts` - TypeScript threshold waiter
- [ ] `tests/cli-mode/test-completion-threshold.ts` - Test suite
- [ ] `docs/CLI_MODE_COMPLETION_THRESHOLD.md` - Usage guide

**Bidirectional Communication Feature:**
- [ ] `src/cli/coordination/send-command.ts` - Command sender
- [ ] `src/cli/coordination/agent-command-processor.ts` - Command processor
- [ ] `tests/cli-mode/test-bidirectional-communication.ts` - Test suite
- [ ] `docs/CLI_MODE_BIDIRECTIONAL_COMMUNICATION.md` - Command protocol guide

### 6.2 Files to Modify

**Completion Threshold:**
- [ ] `.claude/commands/cfn-loop-cli.md:105-120` - Replace BLPOP with threshold waiter
- [ ] `readme/CLI_MODE_ARCHITECTURE.md` - Document new waiting pattern
- [ ] `src/cli/spawn-agent-cli.ts` - Track spawned agent IDs

**Bidirectional Communication:**
- [ ] `src/cli/agent-executor.ts:250-300` - Integrate command processor
- [ ] `readme/CLI_MODE_ARCHITECTURE.md` - Document command patterns
- [ ] `.claude/agents/cfn-dev-team/*/` - Update agent profiles with command awareness

### 6.3 Testing Files Required

**Completion Threshold Tests:**
- [ ] `tests/cli-mode/test-3-of-4-completion.ts` - Threshold reached
- [ ] `tests/cli-mode/test-all-complete.ts` - All agents complete
- [ ] `tests/cli-mode/test-timeout-partial.ts` - Timeout with 2/4 complete
- [ ] `tests/cli-mode/test-instant-completion.ts` - Race condition (3 instant)

**Bidirectional Tests:**
- [ ] `tests/cli-mode/test-status-request.ts` - Main Chat → Agent status
- [ ] `tests/cli-mode/test-abort-command.ts` - Main Chat → Agent abort
- [ ] `tests/cli-mode/test-redirect-command.ts` - Main Chat → Agent redirect
- [ ] `tests/cli-mode/test-command-timeout.ts` - Command to non-existent agent

---

## Part 7: Open Questions

### 7.1 Completion Threshold

**Q1: Should threshold be configurable per task?**
- Option A: Hardcode 3/4 (75%)
- Option B: Pass `--threshold 0.75` flag to /cfn-loop-cli
- Recommendation: Option B for flexibility

**Q2: What happens to 4th agent after threshold met?**
- Option A: Let it complete (orphaned work)
- Option B: Send abort command (requires bidirectional)
- Recommendation: Option A initially, Option B after bidirectional implemented

**Q3: Should Main Chat report which agents completed?**
- Option A: Log agent IDs only
- Option B: Show full completion metadata
- Recommendation: Option B for debugging visibility

### 7.2 Bidirectional Communication

**Q4: Should agents ACK commands?**
- Option A: Fire-and-forget (Main Chat assumes received)
- Option B: Agent sends ACK, Main Chat waits
- Recommendation: Option B for reliability

**Q5: Should commands have priority levels?**
- Option A: FIFO queue (all equal priority)
- Option B: Priority queue (abort > status)
- Recommendation: Option A initially, Option B if needed

**Q6: How to handle command timeouts?**
- Option A: Main Chat logs warning, continues
- Option B: Main Chat retries command
- Recommendation: Option A with configurable timeout

---

## Appendix A: Redis Key Patterns Summary

### Current Patterns (v3.2.0)

```
# Agent completion signals
cfn-completion:{taskId}                    # Main Chat waits here (BLPOP)

# Orchestrator signals
swarm:{taskId}:{agentId}:done             # Orchestrator coordination

# Task metadata
cfn:task:{taskId}:status                  # Task status tracking
cfn:task:{taskId}:completed               # Completion flag
cfn:task:{taskId}:result                  # Task result data
```

### New Patterns (Proposed)

```
# Completion threshold tracking
cfn:task:{taskId}:total                   # Total agents spawned
cfn:task:{taskId}:completed:count         # Completed agent count

# Agent command channels (bidirectional)
cfn:agent:{taskId}:{agentId}:commands     # Main Chat → Agent
cfn:agent:{taskId}:{agentId}:status       # Agent → Main Chat (status response)
cfn:agent:{taskId}:{agentId}:ack          # Agent → Main Chat (command ACK)

# Command response pattern
cfn:mainchat:responses:{taskId}           # Centralized response queue (alternative)
```

---

## Appendix B: Implementation Timeline

### Week 1: Completion Threshold (20 hours)

**Day 1-2 (8h):** Implementation
- Implement `wait-for-threshold.ts` (4h)
- Update `.claude/commands/cfn-loop-cli.md` (2h)
- Add agent tracking to spawn-agent-cli.ts (2h)

**Day 3 (4h):** Testing
- Test 3/4 completion scenarios (2h)
- Test timeout handling (1h)
- Test race conditions (1h)

**Day 4 (4h):** Documentation
- Update CLI_MODE_ARCHITECTURE.md (2h)
- Write usage guide (1h)
- Add examples to README (1h)

**Day 5 (4h):** Code review and refinement
- Address review feedback (2h)
- Performance testing (1h)
- Final validation (1h)

### Week 2: Bidirectional Communication (32 hours)

**Day 1-2 (12h):** Core Implementation
- Implement send-command.ts (3h)
- Implement AgentCommandProcessor (5h)
- Integrate into agent lifecycle (4h)

**Day 3 (8h):** Command Handlers
- Status handler (2h)
- Redirect handler (2h)
- Abort handler (1h)
- Pause handler (1h)
- Error handling (2h)

**Day 4 (6h):** Testing
- Test status request/response (2h)
- Test abort command (1h)
- Test redirect command (2h)
- Test command timeouts (1h)

**Day 5 (6h):** Documentation and Polish
- Update CLI_MODE_ARCHITECTURE.md (2h)
- Write command protocol guide (2h)
- Add examples to README (1h)
- Code review refinement (1h)

**Total Estimated Effort:** 52 hours (6.5 days)

---

## Conclusion

Both features are feasible with moderate to significant implementation effort:

1. **3/4 Completion Threshold**: 20 hours (straightforward, high value)
2. **Redis Bidirectional Communication**: 32 hours (complex, advanced capability)

Recommended approach:
- Implement completion threshold first (Week 1)
- Validate with production workloads
- Implement bidirectional communication (Week 2)
- Requires agent lifecycle changes (more invasive)

Key risks:
- Redis key namespace collisions (Phase 1 incomplete)
- Service name inconsistencies (Phase 2 not addressed)
- Agent command processor integration complexity
- Testing coverage for edge cases (timeouts, race conditions)

All technical blockers have been identified and mitigation strategies provided.
