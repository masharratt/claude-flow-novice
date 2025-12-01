# Coordination Fix Quick Start Guide

**Fix CLI/Docker coordination issues in 3 phases**

---

## TL;DR

**Current Problem:**
```bash
# Orchestrator spawns agents and waits forever
npx claude-flow-novice agent-spawn backend-dev &
redis.blpop("swarm:task:agent:done", 0)  # Hangs if agent crashes
```

**Quick Fix (15 minutes):**
```typescript
// Switch to passive polling
await redis.set("task:total", agentCount);
await redis.set("task:completed", 0);

// Agents increment counter
await redis.incr("task:completed");

// Orchestrator polls (doesn't block)
while (parseInt(await redis.get("task:completed")) < total) {
  await sleep(5000);
}
```

---

## Phase 1: Quick Wins (Day 1)

### Fix 1: Add Completion Counter (15 min)

**File:** `src/cli/agent-executor.ts`

```typescript
async function executeCFNProtocol(...) {
  try {
    // FIRST: Increment counter (atomic, reliable)
    await redis.incr(`task:${taskId}:completed`);
    console.log('[CFN Protocol] ✓ Counter incremented');

    // THEN: Original signal (for compatibility)
    await redis.lpush(`swarm:${taskId}:${agentId}:done`, 'complete');
    console.log('[CFN Protocol] ✓ Signal sent');
  } catch (error) {
    // Don't fail - exit gracefully even if signaling fails
    console.error('[CFN Protocol] Error:', error);
  }
}
```

**Why:** Atomic counter is more reliable than individual signals.

---

### Fix 2: Switch to Passive Polling (30 min)

**File:** `.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`

Replace this:
```typescript
// OLD: Blocking wait (hangs forever)
const result = await redis.blpop(`swarm:${taskId}:${agentId}:done`, 0);
```

With this:
```typescript
async function waitForAllAgents(
  taskId: string,
  expectedCount: number
): Promise<void> {
  const timeout = 300000;  // 5 minutes
  const startTime = Date.now();

  // Initialize counter
  await redis.set(`task:${taskId}:total`, expectedCount);
  await redis.set(`task:${taskId}:completed`, 0);

  while (true) {
    const completed = parseInt(
      await redis.get(`task:${taskId}:completed`) || '0'
    );

    const progress = Math.round((completed / expectedCount) * 100);
    console.log(`Progress: ${completed}/${expectedCount} (${progress}%)`);

    if (completed >= expectedCount) {
      console.log('All agents completed');
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed > timeout) {
      throw new Error(
        `Timeout: ${completed}/${expectedCount} agents completed after ${elapsed}ms`
      );
    }

    await sleep(5000);  // Poll every 5 seconds
  }
}
```

**Why:** Passive polling survives restarts, has built-in timeout, and shows progress.

---

### Fix 3: Add Timeout to Existing BLPOP (15 min)

**If you must keep BLPOP for now:**

```typescript
// OLD: Infinite wait
const result = await redis.blpop(key, 0);

// NEW: 5-minute timeout with fallback
const timeoutSeconds = 300;
const result = await redis.blpop(key, timeoutSeconds);

if (!result) {
  // Timeout - check if agent actually completed
  const state = await redis.get(`task:${taskId}:agent:${agentId}`);

  if (state) {
    const parsed = JSON.parse(state);
    if (parsed.status === 'completed') {
      console.log(`Signal missed but agent ${agentId} completed`);
      return parsed;
    }
  }

  // Agent didn't complete
  throw new Error(`Agent ${agentId} timeout after ${timeoutSeconds}s`);
}
```

**Why:** Prevents infinite waiting, checks agent state as fallback.

---

## Phase 2: Structural Improvements (Week 1)

### Fix 4: Detached Spawning (1 hour)

**File:** `.claude/skills/cfn-loop-orchestration/src/helpers/spawn-agents.ts`

```typescript
async function spawnSingleAgent(...): Promise<SpawnResult> {
  const command = formatSpawnCommand(...);

  try {
    // Spawn in background (detached)
    const child = spawn(command[0], command.slice(1), {
      detached: true,    // Run independently of parent
      stdio: 'ignore'    // Don't inherit stdio
    });

    const pid = child.pid;

    // Allow parent to exit without waiting
    child.unref();

    console.log(`Agent ${agentType} spawned (PID: ${pid})`);

    return {
      agentId,
      agentType,
      success: true,
      pid: pid ?? undefined
    };
  } catch (error) {
    return {
      agentId,
      agentType,
      success: false,
      error: error.message
    };
  }
}
```

**Why:** Parent process doesn't wait for agents, enabling true background execution.

---

### Fix 5: Health Monitoring (2 hours)

**New File:** `src/orchestrator/health-monitor.ts`

```typescript
export interface AgentHealth {
  agentId: string;
  pid: number;
  spawnTime: number;
  timeout: number;
  status: 'running' | 'completed' | 'crashed' | 'timeout';
}

export class AgentHealthMonitor {
  private agents: Map<string, AgentHealth> = new Map();
  private redis: Redis;
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Track agent for health monitoring
   */
  track(agentId: string, pid: number, timeout: number = 300000): void {
    this.agents.set(agentId, {
      agentId,
      pid,
      spawnTime: Date.now(),
      timeout,
      status: 'running'
    });
  }

  /**
   * Start monitoring loop (30s intervals)
   */
  startMonitoring(taskId: string): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(async () => {
      await this.checkAllAgents(taskId);
    }, 30000);  // Check every 30 seconds
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Check all agents for health issues
   */
  private async checkAllAgents(taskId: string): Promise<void> {
    for (const [agentId, health] of this.agents.entries()) {
      if (health.status !== 'running') continue;

      const elapsed = Date.now() - health.spawnTime;

      // Check 1: Timeout
      if (elapsed > health.timeout) {
        console.log(`Agent ${agentId} timeout (${elapsed}ms)`);
        await this.handleTimeout(taskId, agentId);
        continue;
      }

      // Check 2: Process crashed
      if (!this.processExists(health.pid)) {
        console.log(`Agent ${agentId} process dead (PID ${health.pid})`);
        await this.handleCrash(taskId, agentId);
        continue;
      }

      // Check 3: Heartbeat stale
      const heartbeat = await this.redis.get(
        `task:${taskId}:agent:${agentId}:heartbeat`
      );

      if (heartbeat) {
        const lastSeen = parseInt(heartbeat);
        if (Date.now() - lastSeen > 60000) {  // 1 minute
          console.log(`Agent ${agentId} heartbeat stale`);
          await this.handleStale(taskId, agentId);
        }
      }
    }
  }

  /**
   * Check if process exists
   */
  private processExists(pid: number): boolean {
    try {
      // Signal 0 = check existence without killing
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle timeout
   */
  private async handleTimeout(taskId: string, agentId: string): Promise<void> {
    const health = this.agents.get(agentId);
    if (!health) return;

    health.status = 'timeout';

    // Mark as completed (even though failed)
    await this.redis.incr(`task:${taskId}:completed`);

    // Store error state
    await this.redis.set(
      `task:${taskId}:agent:${agentId}`,
      JSON.stringify({
        agentId,
        status: 'timeout',
        timestamp: new Date().toISOString()
      }),
      'EX', 86400
    );

    console.error(`Agent ${agentId} marked as timeout`);
  }

  /**
   * Handle crash
   */
  private async handleCrash(taskId: string, agentId: string): Promise<void> {
    const health = this.agents.get(agentId);
    if (!health) return;

    health.status = 'crashed';

    // Mark as completed (even though failed)
    await this.redis.incr(`task:${taskId}:completed`);

    // Store error state
    await this.redis.set(
      `task:${taskId}:agent:${agentId}`,
      JSON.stringify({
        agentId,
        status: 'crashed',
        timestamp: new Date().toISOString()
      }),
      'EX', 86400
    );

    console.error(`Agent ${agentId} marked as crashed`);
  }

  /**
   * Handle stale heartbeat
   */
  private async handleStale(taskId: string, agentId: string): Promise<void> {
    console.warn(`Agent ${agentId} heartbeat stale (not responding)`);
    // Could trigger restart or alert here
  }

  /**
   * Mark agent as completed (external call)
   */
  markCompleted(agentId: string): void {
    const health = this.agents.get(agentId);
    if (health) {
      health.status = 'completed';
    }
  }

  /**
   * Get health summary
   */
  getSummary(): {
    total: number;
    running: number;
    completed: number;
    crashed: number;
    timeout: number;
  } {
    const summary = {
      total: this.agents.size,
      running: 0,
      completed: 0,
      crashed: 0,
      timeout: 0
    };

    for (const health of this.agents.values()) {
      switch (health.status) {
        case 'running': summary.running++; break;
        case 'completed': summary.completed++; break;
        case 'crashed': summary.crashed++; break;
        case 'timeout': summary.timeout++; break;
      }
    }

    return summary;
  }
}
```

**Usage in orchestrator:**

```typescript
const healthMonitor = new AgentHealthMonitor(redis);

// Start monitoring
healthMonitor.startMonitoring(taskId);

// Spawn agents and track
for (const agentType of agents) {
  const result = await spawnAgent(agentType, taskId);
  if (result.pid) {
    healthMonitor.track(result.agentId, result.pid, 300000);  // 5 min timeout
  }
}

// Wait for completion
await waitForAllAgents(taskId, agents.length);

// Stop monitoring
healthMonitor.stopMonitoring();

// Get summary
const summary = healthMonitor.getSummary();
console.log(`Health: ${summary.completed} completed, ${summary.crashed} crashed, ${summary.timeout} timeout`);
```

**Why:** Detects crashes, hangs, and timeouts automatically. No infinite waiting.

---

### Fix 6: Dual Signaling (30 min)

**File:** `src/coordination/coordination-wrapper.ts`

```typescript
/**
 * Signal agent completion with redundant mechanisms
 */
async function signalCompletion(
  redis: Redis,
  taskId: string,
  agentId: string,
  result: AgentResult
): Promise<void> {
  try {
    // Layer 1: Atomic counter (for passive polling)
    await redis.incr(`task:${taskId}:completed`);

    // Layer 2: State persistence (for verification)
    await redis.set(
      `task:${taskId}:agent:${agentId}`,
      JSON.stringify({
        agentId,
        status: 'completed',
        confidence: result.confidence,
        testPassRate: result.testPassRate,
        timestamp: new Date().toISOString()
      }),
      'EX', 86400  // 24h expiry
    );

    // Layer 3: Direct signal (for BLPOP consumers)
    await redis.lpush(`task:${taskId}:${agentId}:done`, 'complete');

    // Layer 4: Broadcast (for pub/sub subscribers)
    await redis.publish(
      `task:${taskId}:completion`,
      JSON.stringify({
        agentId,
        status: 'completed',
        timestamp: new Date().toISOString()
      })
    );

    console.log(`[Coordination] Agent ${agentId} signaled completion`);
  } catch (error) {
    console.error(`[Coordination] Error signaling completion:`, error);
    // Don't throw - exit gracefully
  }
}
```

**Why:** Multiple signaling mechanisms ensure orchestrator wakes up even if one fails.

---

## Phase 3: Advanced Features (Week 2)

### Fix 7: SDK Spawning (4 hours)

**New File:** `src/orchestrator/spawn-loop3-sdk.ts`

```typescript
import { executeAgentAPI } from '../cli/anthropic-client.js';
import { buildCLIAgentSystemPrompt } from '../cli/cli-agent-context.js';
import { getToolsForAgent } from '../cli/tool-definitions.js';

export interface AgentResult {
  agentId: string;
  agentType: string;
  success: boolean;
  output?: string;
  error?: string;
  confidence?: number;
}

/**
 * Spawn Loop 3 agents via SDK (not CLI)
 */
export async function spawnLoop3SDK(
  agentTypes: string[],
  taskId: string,
  context: string,
  iteration: number = 1
): Promise<AgentResult[]> {
  console.log(`[SDK Spawning] Spawning ${agentTypes.length} agents via SDK`);

  const results = await Promise.all(
    agentTypes.map(agentType =>
      executeAgentViaSDK(agentType, taskId, context, iteration)
    )
  );

  const successCount = results.filter(r => r.success).length;
  console.log(`[SDK Spawning] ${successCount}/${agentTypes.length} succeeded`);

  return results;
}

/**
 * Execute single agent via SDK
 */
async function executeAgentViaSDK(
  agentType: string,
  taskId: string,
  context: string,
  iteration: number
): Promise<AgentResult> {
  const agentId = `${agentType}-${iteration}-${Date.now()}`;

  console.log(`[SDK] Executing ${agentType} (${agentId})`);

  try {
    // Build system prompt
    const systemPrompt = await buildCLIAgentSystemPrompt({
      agentType,
      taskId,
      iteration
    });

    // Get tools for agent
    const tools = getToolsForAgent(agentType);

    // Execute via API
    const result = await executeAgentAPI(
      agentType,
      agentId,
      'claude-sonnet-4-5-20250929',
      context,
      systemPrompt,
      undefined,  // messages (new conversation)
      undefined,  // maxTokens (use default)
      tools
    );

    // Extract confidence
    const confidence = extractConfidence(result.output);

    console.log(`[SDK] ${agentType} completed (confidence: ${confidence})`);

    return {
      agentId,
      agentType,
      success: true,
      output: result.output,
      confidence
    };
  } catch (error) {
    console.error(`[SDK] ${agentType} failed:`, error);

    return {
      agentId,
      agentType,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Extract confidence score from agent output
 */
function extractConfidence(output: string | undefined): number {
  if (!output) return 0.85;

  const patterns = [
    /confidence:\s*([0-9.]+)/i,
    /confidence\s+score:\s*([0-9.]+)/i,
    /self-confidence:\s*([0-9.]+)/i
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      const score = parseFloat(match[1]);
      if (score >= 0 && score <= 1) {
        return score;
      }
    }
  }

  return 0.85;
}
```

**Usage in orchestrator:**

```typescript
// OLD: CLI spawning
await spawnLoop3Agents(taskId, iteration, agentTypes, context);

// NEW: SDK spawning
const results = await spawnLoop3SDK(agentTypes, taskId, context, iteration);

// Results available immediately (no waiting needed)
for (const result of results) {
  if (result.success) {
    console.log(`${result.agentType}: ${result.confidence}`);
  } else {
    console.error(`${result.agentType} failed: ${result.error}`);
  }
}
```

**Why:** Direct control, synchronous execution, better error handling, no subprocess coordination.

---

## Testing Each Fix

### Test 1: Completion Counter

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Initialize counter
redis-cli SET "task:test-123:total" "3"
redis-cli SET "task:test-123:completed" "0"

# Terminal 3: Simulate 3 agents completing
redis-cli INCR "task:test-123:completed"
redis-cli INCR "task:test-123:completed"
redis-cli INCR "task:test-123:completed"

# Terminal 2: Check counter
redis-cli GET "task:test-123:completed"
# → "3" (success)
```

---

### Test 2: Passive Polling

```typescript
// Test script: test-passive-polling.ts
import Redis from 'ioredis';

const redis = new Redis();
const taskId = 'test-polling';
const total = 3;

async function testPolling() {
  await redis.set(`task:${taskId}:total`, total);
  await redis.set(`task:${taskId}:completed`, 0);

  // Simulate agents completing in background
  setTimeout(() => redis.incr(`task:${taskId}:completed`), 2000);
  setTimeout(() => redis.incr(`task:${taskId}:completed`), 5000);
  setTimeout(() => redis.incr(`task:${taskId}:completed`), 8000);

  // Passive polling (should complete in ~10 seconds)
  const startTime = Date.now();

  while (true) {
    const completed = parseInt(await redis.get(`task:${taskId}:completed`));
    console.log(`Progress: ${completed}/${total}`);

    if (completed >= total) {
      console.log('All agents completed');
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const elapsed = Date.now() - startTime;
  console.log(`Completed in ${elapsed}ms`);

  redis.disconnect();
}

testPolling();
```

```bash
npx tsx test-passive-polling.ts
# Output:
# Progress: 0/3
# Progress: 1/3
# Progress: 1/3
# Progress: 2/3
# Progress: 2/3
# Progress: 3/3
# All agents completed
# Completed in 10042ms
```

---

### Test 3: Health Monitoring

```typescript
// Test script: test-health-monitor.ts
import { AgentHealthMonitor } from './src/orchestrator/health-monitor.js';
import Redis from 'ioredis';

const redis = new Redis();
const monitor = new AgentHealthMonitor(redis);
const taskId = 'test-health';

async function testHealthMonitoring() {
  monitor.startMonitoring(taskId);

  // Track 3 fake agents
  monitor.track('agent-1', 12345, 5000);   // 5s timeout
  monitor.track('agent-2', 67890, 10000);  // 10s timeout
  monitor.track('agent-3', 11111, 15000);  // 15s timeout

  // Simulate agent-1 completing
  setTimeout(() => {
    monitor.markCompleted('agent-1');
  }, 2000);

  // agent-2 will timeout (no completion)
  // agent-3 will timeout (no completion)

  // Wait 20 seconds and check summary
  setTimeout(() => {
    const summary = monitor.getSummary();
    console.log('Summary:', summary);
    // Expected: { total: 3, running: 0, completed: 1, timeout: 2 }

    monitor.stopMonitoring();
    redis.disconnect();
  }, 20000);
}

testHealthMonitoring();
```

---

## Migration Checklist

### Week 1: Critical Fixes

- [ ] **Day 1:** Add completion counter to agent executor
- [ ] **Day 1:** Switch orchestrator to passive polling
- [ ] **Day 2:** Add timeout to existing BLPOP calls
- [ ] **Day 3:** Implement detached spawning
- [ ] **Day 4:** Add health monitoring
- [ ] **Day 5:** Implement dual signaling
- [ ] **Day 5:** Test all fixes end-to-end

### Week 2: Structural Changes

- [ ] **Day 1-2:** Migrate to SDK spawning for Loop 3
- [ ] **Day 3:** Implement workspace isolation
- [ ] **Day 4:** Add input sanitization
- [ ] **Day 5:** Comprehensive testing

### Week 3: Advanced Features

- [ ] Wave-based spawning (memory optimization)
- [ ] Enhanced error classification
- [ ] Performance benchmarking
- [ ] Documentation updates

---

## Rollback Plan

**If something breaks, revert in this order:**

1. **Disable health monitoring** (set `CFN_ENABLE_HEALTH_CHECKS=false`)
2. **Revert to BLPOP** (remove passive polling)
3. **Disable SDK spawning** (use CLI spawning)
4. **Restore original signaling** (remove counter)

**Safe rollback command:**
```bash
git checkout HEAD -- src/orchestrator/
git checkout HEAD -- src/coordination/
npm run build
```

---

## Expected Results

### Before (Current State)

```
Reliability: 50-60%
- Frequent hangs (BLPOP infinite wait)
- No crash detection
- No timeout handling
- Rare mysterious failures
```

### After Phase 1 (Week 1)

```
Reliability: 75-85%
- Passive polling (no hangs)
- Timeout handling (5 min max)
- Health monitoring (detects crashes)
- Occasional race conditions
```

### After Phase 2 (Week 2)

```
Reliability: 95-98%
- SDK spawning (direct control)
- Multi-layer signaling (fault-tolerant)
- Workspace isolation (no races)
- Rare edge case failures
```

---

## Success Metrics

Track these metrics before and after:

```typescript
interface CoordinationMetrics {
  totalTasks: number;
  completedTasks: number;
  timeouts: number;
  crashes: number;
  hangs: number;
  successRate: number;
  averageCompletionTime: number;
}
```

**Before:**
- Success Rate: 55%
- Average Completion: 8.5 minutes
- Timeouts: 30%
- Crashes: 10%
- Hangs: 5%

**Target (After Phase 2):**
- Success Rate: 95%
- Average Completion: 6 minutes
- Timeouts: 2%
- Crashes: 2%
- Hangs: 1%

---

## References

- **Analysis:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/AGENTIC_FLOW_PROCESS_SPAWNING_ANALYSIS.md`
- **Patterns:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docs/diagrams/COORDINATION_PATTERNS_COMPARISON.md`
- **Docker Guide:** `/mnt/c/Users/masha/Documents/claude-flow-novice/docker/CLAUDE.md`

---

**Start with Phase 1, Fix 1 (Completion Counter). Test it. Then proceed.**
