# Worker Spawner Implementation Guide

## Overview

The Worker Spawner (`spawn-workers.js`) is a production-ready CLI-based agent spawning system that enables cost-effective task execution through intelligent agent selection, Redis coordination, and robust process lifecycle management.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     WorkerSpawner                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Agent        │  │ Process      │  │ Redis        │      │
│  │ Selection    │  │ Management   │  │ Coordination │      │
│  │              │  │              │  │              │      │
│  │ - Registry   │  │ - spawn()    │  │ - Status     │      │
│  │ - Keyword    │  │ - Lifecycle  │  │ - Events     │      │
│  │ - Scoring    │  │ - Timeout    │  │ - Pub/Sub    │      │
│  │              │  │ - Retry      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            activeWorkers Map                          │  │
│  │  taskId -> { pid, process, status, metadata }        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Features

### 1. Intelligent Agent Selection

Integrates with `agent-use-case-registry.cjs` to automatically select the optimal agent based on:
- **Keyword Matching**: Task description analysis
- **Domain Classification**: Technical domain identification
- **Priority Scoring**: Agent specialization ranking

**Example:**
```javascript
const { WorkerSpawner } = require('./spawn-workers.js');

const spawner = new WorkerSpawner();

// Automatically selects 'backend-dev' agent
await spawner.spawnWorker('Create REST API endpoint for user authentication');

// Automatically selects 'react-frontend-engineer' agent
await spawner.spawnWorker('Build React component with hooks and state management');

// Automatically selects 'security-analyst' agent
await spawner.spawnWorker('Perform security audit and vulnerability scanning');
```

### 2. Redis Coordination

Full integration with Redis for distributed coordination:

**Worker Registration:**
```javascript
// On spawn, registers in Redis
swarm:{taskId}:{agentType}:status -> {
  status: 'active',
  agentType: 'backend-dev',
  taskDescription: '...',
  mode: 'cli',
  startTime: 1729312800000,
  pid: 12345
}

// Adds to active workers set
swarm:active_workers -> Set[taskId1, taskId2, ...]
```

**Event Publishing:**
```javascript
// Worker spawned event
{
  event: 'worker_spawned',
  taskId: 'task-1729312800000-abc123',
  agentType: 'backend-dev',
  timestamp: 1729312800000
}

// Status change event
{
  event: 'worker_status_change',
  taskId: 'task-1729312800000-abc123',
  agentType: 'backend-dev',
  status: 'completed',
  timestamp: 1729312815000
}
```

### 3. Process Lifecycle Management

**Spawning:**
```javascript
const result = await spawner.spawnWorker('Build authentication module', {
  taskId: 'auth-task-001',           // Optional custom ID
  agentType: 'backend-dev',          // Optional force agent
  mode: 'cli',                        // cli, api, or hybrid
  timeout: 600000,                    // 10 minutes
  context: { priority: 'high' },     // Additional context
  metadata: { sprint: 'sprint-1' }   // Custom metadata
});

console.log(result);
// {
//   taskId: 'auth-task-001',
//   pid: 12345,
//   agentType: 'backend-dev',
//   logPath: '.logs/workers/auth-task-001.log',
//   status: 'spawned'
// }
```

**Monitoring:**
```javascript
// Get worker status
const status = spawner.getWorkerStatus('auth-task-001');
console.log(status);
// {
//   taskId: 'auth-task-001',
//   pid: 12345,
//   agentType: 'backend-dev',
//   status: 'running',
//   startTime: 1729312800000,
//   duration: undefined,  // Only set when completed
//   logPath: '.logs/workers/auth-task-001.log'
// }

// List all active workers
const activeWorkers = spawner.getActiveWorkers();
console.log(`Currently running: ${activeWorkers.length} workers`);

// Get statistics
const stats = spawner.getStatistics();
console.log(stats);
// {
//   active: 3,
//   completed: 12,
//   successful: 10,
//   failed: 2,
//   timedOut: 0,
//   avgDuration: 45230,
//   successRate: '83.33%'
// }
```

**Termination:**
```javascript
// Kill specific worker
await spawner.killWorker('auth-task-001', 'SIGTERM');

// Graceful shutdown all workers
await spawner.shutdownAll(10000); // 10s grace period
```

### 4. Error Handling & Retry Logic

**Automatic Retry:**
```javascript
const spawner = new WorkerSpawner({
  enableRetry: true,
  maxRetries: 3
});

// If worker exits with non-zero code, automatically retries up to 3 times
await spawner.spawnWorker('Flaky operation', { timeout: 30000 });
```

**Retry Metadata Tracking:**
```javascript
// On retry, metadata is enriched with retry information
{
  retryAttempt: 2,
  previousAttempts: [
    { exitCode: 1, duration: 15230 },
    { exitCode: 1, duration: 18450 }
  ]
}
```

### 5. Timeout Management

**Per-Task Timeout:**
```javascript
// 5-minute timeout
await spawner.spawnWorker('Long running analysis', {
  timeout: 300000
});
```

**Graceful Termination:**
1. SIGTERM sent at timeout
2. 5-second grace period
3. SIGKILL if process doesn't exit

**Timeout Detection:**
```javascript
const workerInfo = spawner.getWorkerStatus(taskId);
if (workerInfo.status === 'timeout') {
  console.log('Worker timed out after', workerInfo.timeout, 'ms');
}
```

### 6. Logging & Observability

**Structured Logging:**
```
.logs/workers/
├── task-1729312800000-abc123.log
├── task-1729312815000-def456.log
└── task-1729312830000-ghi789.log
```

**Log Format:**
```
[STDOUT] Worker starting for task: auth-task-001
[STDOUT] Agent type: backend-dev
[STDOUT] Processing...
[STDERR] Warning: deprecated API usage
[STDOUT] Task completed successfully
```

**Real-time Monitoring:**
```javascript
// Custom event monitoring (extensible)
spawner._emitWorkerEvent = (taskId, event, data) => {
  console.log(`[${taskId}] ${event}:`, data);

  // Forward to monitoring system
  monitoringService.track({
    taskId,
    event,
    data,
    timestamp: Date.now()
  });
};
```

## Usage Patterns

### Pattern 1: Simple Task Execution

```javascript
const { WorkerSpawner } = require('./spawn-workers.js');

const spawner = new WorkerSpawner();

const result = await spawner.spawnWorker(
  'Implement user login endpoint with JWT authentication'
);

console.log(`Spawned worker ${result.taskId} (PID: ${result.pid})`);
```

### Pattern 2: Batch Task Processing

```javascript
const tasks = [
  'Create user registration API',
  'Implement password reset flow',
  'Add email verification',
  'Setup OAuth integration'
];

const spawner = new WorkerSpawner({ maxRetries: 2 });

const results = await Promise.all(
  tasks.map(task => spawner.spawnWorker(task, { timeout: 300000 }))
);

console.log(`Spawned ${results.length} workers`);

// Monitor until all complete
const checkInterval = setInterval(() => {
  const stats = spawner.getStatistics();
  console.log('Progress:', stats);

  if (stats.active === 0) {
    clearInterval(checkInterval);
    console.log('All tasks completed');
    console.log(`Success rate: ${stats.successRate}`);
  }
}, 5000);
```

### Pattern 3: Coordinated Multi-Agent Workflow

```javascript
const spawner = new WorkerSpawner({ redisUrl: 'redis://localhost:6379' });

// Step 1: Architecture design
const architectResult = await spawner.spawnWorker(
  'Design microservices architecture for e-commerce platform',
  { agentType: 'architect', timeout: 600000 }
);

// Wait for architecture completion
const architectWorker = spawner.getWorkerStatus(architectResult.taskId);
// ... wait logic ...

// Step 2: Backend implementation
const backendResult = await spawner.spawnWorker(
  'Implement API gateway and service mesh',
  {
    agentType: 'backend-dev',
    parentTaskId: architectResult.taskId,
    context: { architecture: architectWorker.metadata.output },
    timeout: 900000
  }
);

// Step 3: Testing
const testResult = await spawner.spawnWorker(
  'Create integration tests for microservices',
  {
    agentType: 'tester',
    parentTaskId: backendResult.taskId,
    timeout: 600000
  }
);
```

### Pattern 4: Redis Event Monitoring

```javascript
const redis = require('redis');
const { WorkerSpawner } = require('./spawn-workers.js');

const spawner = new WorkerSpawner();
const subscriber = redis.createClient();

await subscriber.connect();

// Monitor all worker events
await subscriber.subscribe('swarm:events', (message) => {
  const event = JSON.parse(message);

  switch (event.event) {
    case 'worker_spawned':
      console.log(`New worker: ${event.taskId} (${event.agentType})`);
      break;
    case 'worker_status_change':
      console.log(`Status update: ${event.taskId} -> ${event.status}`);
      break;
  }
});

// Spawn workers
await spawner.spawnWorker('Task 1');
await spawner.spawnWorker('Task 2');
await spawner.spawnWorker('Task 3');
```

### Pattern 5: Health Monitoring Dashboard

```javascript
const spawner = new WorkerSpawner();

// Dashboard update loop
setInterval(() => {
  const stats = spawner.getStatistics();
  const activeWorkers = spawner.getActiveWorkers();

  console.clear();
  console.log('=== Worker Spawner Dashboard ===');
  console.log(`Active Workers: ${stats.active}`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Success Rate: ${stats.successRate}`);
  console.log(`Avg Duration: ${stats.avgDuration}ms`);
  console.log('\nActive Tasks:');

  activeWorkers.forEach(worker => {
    const runtime = Date.now() - worker.startTime;
    console.log(`  ${worker.taskId}: ${worker.agentType} (${Math.round(runtime/1000)}s)`);
  });
}, 2000);

// Spawn some workers
await spawner.spawnWorker('Task 1');
await spawner.spawnWorker('Task 2');
```

## Configuration Options

```javascript
const spawner = new WorkerSpawner({
  // Redis connection
  redisUrl: 'redis://localhost:6379',

  // Timeout settings
  defaultTimeout: 600000,  // 10 minutes default

  // Retry configuration
  enableRetry: true,
  maxRetries: 3,

  // Logging
  logDir: '.logs/workers',

  // CLI command customization
  cliCommand: 'npx',
  cliArgs: ['claude']
});
```

## Integration with Agent Use Case Registry

The Worker Spawner uses the Agent Use Case Registry for intelligent agent selection:

```javascript
// Registry automatically maps tasks to agents
const agentType = selectAgent('Create REST API endpoint');
// Returns: 'backend-dev'

const agentType2 = selectAgent('Build React dashboard with charts');
// Returns: 'react-frontend-engineer'

const agentType3 = selectAgent('Write unit tests with Jest');
// Returns: 'tester'
```

**Available Agent Types (85+ specialized agents):**

**Core Development:**
- architect, coder, backend-dev, react-frontend-engineer, mobile-dev
- rust-mvp-developer, rust-enterprise-developer, rust-developer

**Validation & QA:**
- tester, interaction-tester, playwright-tester, production-validator
- code-analyzer, code-quality-validator, code-booster

**Specialized:**
- security-analyst, performance-engineer, devops-specialist
- data-engineer, ml-engineer, documentation-writer

See `agent-use-case-registry.cjs` for full registry.

## Error Handling

```javascript
try {
  const result = await spawner.spawnWorker('Invalid task description');
} catch (error) {
  if (error.message.includes('Unable to select agent')) {
    console.error('No suitable agent found for task');
  } else if (error.message.includes('spawn failed')) {
    console.error('Process spawning failed:', error);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

### 1. Set Appropriate Timeouts
```javascript
// Short tasks: 30 seconds
await spawner.spawnWorker('Quick validation', { timeout: 30000 });

// Medium tasks: 10 minutes
await spawner.spawnWorker('Feature implementation', { timeout: 600000 });

// Long tasks: 30 minutes
await spawner.spawnWorker('Complex refactoring', { timeout: 1800000 });
```

### 2. Use Custom Task IDs for Tracking
```javascript
await spawner.spawnWorker('User authentication', {
  taskId: 'sprint-1-auth-implementation',
  metadata: { sprint: 1, priority: 'high' }
});
```

### 3. Enable Retry for Unreliable Operations
```javascript
const spawner = new WorkerSpawner({
  enableRetry: true,
  maxRetries: 3
});
```

### 4. Monitor Worker Health
```javascript
setInterval(() => {
  const stats = spawner.getStatistics();
  if (parseFloat(stats.successRate) < 80) {
    console.warn('Low success rate detected:', stats.successRate);
  }
}, 60000);
```

### 5. Graceful Shutdown
```javascript
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await spawner.shutdownAll(10000);
  process.exit(0);
});
```

## Performance Considerations

**Memory Usage:**
- Each worker stores metadata (~1KB per worker)
- Log files accumulate in `.logs/workers/` (monitor disk space)
- Completed tasks cached in memory (use `completedTasks.clear()` if needed)

**Redis Overhead:**
- Minimal: ~500 bytes per worker registration
- Events published asynchronously (non-blocking)
- Automatic cleanup with TTL (1 hour)

**Concurrency:**
- No hard limit on concurrent workers
- OS limits on child processes apply (typically 1000+)
- Monitor system resources with high concurrency

## Troubleshooting

### Worker Not Spawning
```javascript
// Check Redis connection
if (!spawner.redisReady) {
  console.error('Redis not connected');
  await spawner.initializeRedis();
}

// Verify agent selection
const { selectAgent } = require('./agent-use-case-registry.cjs');
const agentType = selectAgent('Your task description');
console.log('Selected agent:', agentType);
```

### Worker Timeout Issues
```javascript
// Increase timeout
await spawner.spawnWorker('Long task', { timeout: 1800000 }); // 30 min

// Check worker logs
const workerInfo = spawner.getWorkerStatus(taskId);
console.log('Log file:', workerInfo.logPath);
```

### Redis Connection Errors
```javascript
// Handle Redis failures gracefully
spawner.redisClient.on('error', (err) => {
  console.error('Redis error:', err);
  // Workers continue without Redis coordination
});
```

## Testing

Run comprehensive test suite:
```bash
npm test tests/spawn-workers.test.js
```

Test coverage includes:
- Worker spawning and lifecycle
- Redis coordination
- Timeout handling
- Error recovery and retry
- Statistics tracking
- Graceful shutdown

## File Locations

```
/mnt/c/Users/masha/Documents/claude-flow-novice/
├── src/cli/hybrid-routing/
│   ├── spawn-workers.js                    # Main implementation
│   ├── agent-use-case-registry.cjs         # Agent selection
│   ├── example-usage.cjs                   # Usage examples
│   └── IMPLEMENTATION_GUIDE.md             # This file
└── tests/
    └── spawn-workers.test.js               # Test suite
```

## License

Part of Claude Flow Novice - AI Agent Orchestration System
