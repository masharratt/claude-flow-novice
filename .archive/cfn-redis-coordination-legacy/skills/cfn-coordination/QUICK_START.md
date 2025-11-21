# TypeScript Coordination Wrapper - Quick Start

## Installation & Build

```bash
# Install dependencies (already done)
npm install ioredis

# Build TypeScript
npm run build

# Run tests
npm test -- coordination-wrapper.test.ts
```

## Basic Usage (TypeScript)

### 1. Import and Initialize

```typescript
import { CoordinationWrapper } from './src/coordination/coordination-wrapper';

const coordinator = new CoordinationWrapper({
  taskId: 'task-abc123',
  redisHost: 'localhost',
  redisPort: 6379,
  namespace: 'swarm'  // default
});

await coordinator.connect();
```

### 2. Agent Registration (Phase 3)

```typescript
// Register when agent spawns
await coordinator.registerAgent('agent-loop3-1', 'developer');

// Update status as work progresses
await coordinator.updateAgentStatus('agent-loop3-1', 'running');

// Signal completion with test metrics
await coordinator.signalCompletion('agent-loop3-1', 0.95, {
  testPassRate: 0.98,      // 98% tests passed
  testsRun: 50,
  testsPassed: 49,
  iteration: 1
});
```

### 3. Signal Coordination

```typescript
// Wait for a signal
const result = await coordinator.waitForSignal('gate-passed', 120000);
if (result.received) {
  console.log('Gate passed, proceeding to next phase');
}

// Broadcast signal to waiting agents
await coordinator.broadcastSignal('gate-passed', 'true');
```

### 4. Consensus Collection (Phase 2)

```typescript
// Report consensus score (validator)
await coordinator.reportConsensusScore('validator-1', 0.85, 'Good work');

// Collect scores from all validators
const scores = await coordinator.collectConsensus(['v1', 'v2', 'v3']);
const avgConsensus = coordinator.calculateAverageConsensus(scores);
```

### 5. Task State

```typescript
// Store context for later retrieval
await coordinator.storeTaskContext({
  mode: 'standard',
  iteration: 1,
  parameters: { /* ... */ }
});

// Get full task snapshot
const state = await coordinator.getTaskState();
console.log(`Task: ${state.taskId}, Status: ${state.status}, Agents: ${state.agents.length}`);
```

## CLI Usage

### coordination-signal

```bash
# Build first
npm run build

# Signal gate-passed to validators
./coordination-signal.sh \
  --task-id task-abc123 \
  --channel gate-passed \
  --message 'true'

# Signal iteration restart
./coordination-signal.sh \
  --task-id task-abc123 \
  --channel loop3:iterate \
  --message '{"iteration":2}'
```

### coordination-wait

```bash
# Wait for gate-passed signal (120s default)
./coordination-wait.sh \
  --task-id task-abc123 \
  --channel gate-passed

# Wait with custom timeout
./coordination-wait.sh \
  --task-id task-abc123 \
  --channel loop2:start \
  --timeout 60 \
  --json
```

Exit codes: 0 = signal received, 1 = timeout/error

### agent-completion

```bash
# Simple completion
./agent-completion.sh \
  --task-id task-abc123 \
  --agent-id agent-loop3-1 \
  --confidence 0.92

# With test metrics
./agent-completion.sh \
  --task-id task-abc123 \
  --agent-id agent-loop3-1 \
  --confidence 0.95 \
  --test-pass-rate 0.98 \
  --tests-run 50 \
  --tests-passed 49 \
  --iteration 1
```

## Environment Variables

```bash
# Redis Configuration
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
export CFN_REDIS_DB=0

# All CLIs will use these automatically
```

## Common Patterns

### Pattern 1: Phase 3 Agent Completion

```typescript
// In loop3-developer agent
const taskId = process.env.CFN_TASK_ID;
const agentId = `agent-${taskId}-${Date.now()}`;

const coordinator = new CoordinationWrapper({
  taskId,
  redisHost: process.env.CFN_REDIS_HOST || 'localhost'
});

await coordinator.connect();
await coordinator.registerAgent(agentId, 'loop3-developer');

// Do work...

// Signal completion
await coordinator.signalCompletion(agentId, 0.95, {
  testPassRate: passRate,
  testsRun: totalTests,
  testsPassed: passedTests,
  iteration: currentIteration
});

await coordinator.disconnect();
```

### Pattern 2: Orchestrator Gate Check

```typescript
// In orchestrator
const agents = await coordinator.getAllAgents();

// Calculate gate pass rate
let totalTests = 0;
let totalPassed = 0;

for (const agent of agents) {
  if (agent.testsRun) {
    totalTests += agent.testsRun;
    totalPassed += agent.testsPassed || 0;
  }
}

const passRate = totalTests > 0 ? totalPassed / totalTests : 0;
const gateThreshold = 0.95;  // 95% for standard mode

if (passRate >= gateThreshold) {
  await coordinator.broadcastSignal('gate-passed', 'true');
} else {
  // Wake Phase 3 for iteration
  await coordinator.broadcastSignal('loop3:iterate', JSON.stringify({
    iteration: currentIteration + 1
  }));
}
```

### Pattern 3: Validator Consensus

```typescript
// In loop2-validator agent
const agents = await coordinator.getAllAgents();

// Review each agent's work
for (const agent of agents) {
  const score = evaluateWork(agent);
  await coordinator.reportConsensusScore(
    `validator-${agentId}`,
    score,
    `Feedback: ${feedback}`
  );
}
```

## Troubleshooting

### CLI not found

```bash
# Error: TypeScript CLI not compiled
npm run build
```

### Redis connection fails

```bash
# Check Redis is running
redis-cli ping

# Or use Docker
docker run -d -p 6379:6379 redis:7-alpine

# Set environment variable
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
```

### Signal not received

```bash
# Timeout occurred - check:
# 1. Is sender broadcasting on same channel?
# 2. Is timeout long enough?
# 3. Is Redis connection alive?

coordination-wait --task-id X --channel C --timeout 60 --json
```

## File Locations

**Core Implementation:**
- Wrapper: `/src/coordination/coordination-wrapper.ts`
- CLI Tools: `/src/cli/coordination-{signal,wait}.ts`, `/src/cli/agent-completion.ts`

**Bash Wrappers:**
- `.claude/skills/cfn-coordination/*.sh`

**Tests:**
- `/tests/coordination-wrapper.test.ts`

**Documentation:**
- Complete: `/TYPESCRIPT_COORDINATION_WRAPPER.md`
- Summary: `/IMPLEMENTATION_SUMMARY.md`
- Quick Start: `/QUICK_START.md` (this file)

## Next Steps

1. **Build:** `npm run build`
2. **Test:** `npm test -- coordination-wrapper.test.ts`
3. **Integrate:** Use in orchestrator for Phase 2↔3 signaling
4. **Monitor:** Check Redis keys for task state

## API Reference

Quick lookup for all methods:

| Method | Purpose |
|--------|---------|
| `registerAgent()` | Register spawned agent |
| `updateAgentStatus()` | Change agent status |
| `signalCompletion()` | Signal completion + metrics |
| `getAgentState()` | Get single agent snapshot |
| `getAllAgents()` | Get all agents in task |
| `waitForSignal()` | Block until signal |
| `broadcastSignal()` | Send signal to all |
| `subscribeToSignal()` | Subscribe to signal channel |
| `reportConsensusScore()` | Report validation score |
| `collectConsensus()` | Gather consensus scores |
| `calculateAverageConsensus()` | Compute consensus |
| `storeTaskContext()` | Save task parameters |
| `loadTaskContext()` | Load task parameters |
| `updateTaskStatus()` | Update task progress |
| `getTaskState()` | Get full task snapshot |
| `clearTaskState()` | Clean up all state |

## Support

For detailed documentation, see:
- **API Reference:** `TYPESCRIPT_COORDINATION_WRAPPER.md`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Test Examples:** `/tests/coordination-wrapper.test.ts`
