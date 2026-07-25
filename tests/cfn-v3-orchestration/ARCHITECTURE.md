# CFN v3 Orchestration Test Architecture

## Overview

The CFN v3 orchestration test suite validates the complete lifecycle of CFN coordination, from coordinator initialization through worker connections, task distribution, handoff coordination, and graceful shutdown.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CFN v3 Test Harness                         │
│                  (CfnTestHarness Class)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Connection  │  │   Handoff    │  │   Metrics    │         │
│  │   Tracker    │  │   Tracker    │  │  Collector   │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Process Management                          │  │
│  │  • Spawn Coordinator                                     │  │
│  │  • Spawn Workers                                         │  │
│  │  • Spawn Reviewers                                       │  │
│  │  • Track PIDs                                            │  │
│  │  • Graceful Shutdown                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              State Coordination                          │  │
│  │  • Redis Client                                          │  │
│  │  • Key Management                                        │  │
│  │  • Pub/Sub                                               │  │
│  │  • Cleanup                                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├─────────────┬─────────────┬──────────────┐
                              │             │             │              │
                        ┌──────▼──────┐  ┌──▼──┐   ┌────▼────┐  ┌─────▼─────┐
                        │ Coordinator │  │Worker│...│Reviewer │  │  Redis    │
                        │   Process   │  │      │   │         │  │  Server   │
                        └─────────────┘  └──────┘   └─────────┘  └───────────┘
```

## Component Architecture

### 1. Test Harness (`CfnTestHarness`)

**Responsibilities:**
- Process lifecycle management (spawn, monitor, shutdown)
- Connection tracking and validation
- Handoff coordination and tracking
- Metrics collection and aggregation
- Redis coordination
- State validation

**Key Methods:**
```javascript
class CfnTestHarness {
  // Initialization
  async init()

  // Process management
  async spawnCoordinator(coordinatorId, options)
  async spawnWorker(workerId, coordinatorId, options)
  async shutdown()
  async shutdownProcess(processId, metadata)

  // Tracking
  async trackHandoff(taskId, workerId, reviewerId, options)

  // Validation
  validateConnections(expected)
  validateHandoffs(expected)
  validateCleanShutdown()

  // Metrics
  getMetrics()

  // Utilities
  async waitForRedisKey(key, timeout)
  async cleanupRedis()
  async checkOrphanedProcesses()
}
```

### 2. Connection Tracker

**Tracks:**
- `cfnConnectionCount` - Total connections established
- `cfnWorkerSpawnCount` - Number of worker processes spawned
- `cfnCoordinatorConnections` - Active coordinator connections

**Data Structure:**
```javascript
connections: Map<workerId, {
  workerId: string,
  coordinatorId: string,
  connectedAt: number,
  connectionTime: number
}>
```

### 3. Handoff Tracker

**Tracks:**
- `cfnHandoffCount` - Total handoffs executed
- `cfnReviewerAssignments` - Number of reviewer assignments
- `cfnHandoffFailures` - Failed handoff attempts

**Data Structure:**
```javascript
handoffs: Map<taskId, {
  taskId: string,
  workerId: string,
  reviewerId: string,
  handoffTime: number,
  completedAt: number
}>
```

### 4. Metrics Collector

**Aggregates:**
```javascript
{
  // Connection metrics
  cfnConnectionCount: number,
  cfnWorkerSpawnCount: number,
  cfnCoordinatorConnections: number,

  // Handoff metrics
  cfnHandoffCount: number,
  cfnReviewerAssignments: number,
  cfnHandoffFailures: number,

  // Lifecycle metrics
  cfnStartupTime: number,
  cfnShutdownTime: number,
  cfnOrphanedProcesses: number,

  // Detailed data
  connections: Array<ConnectionMetadata>,
  handoffs: Array<HandoffMetadata>,
  processes: Array<ProcessMetadata>
}
```

## Test Flow Architecture

### Test 02: Worker Connections

```
┌──────────────┐
│ Init Harness │
└──────┬───────┘
       │
       ├─────► Connect to Redis
       │
┌──────▼────────┐
│Spawn Coordinator│
└──────┬────────┘
       │
       ├─────► Wait for coordinator:status in Redis
       │
┌──────▼────────┐
│ Spawn Workers │
│   (Loop)      │
└──────┬────────┘
       │
       ├─────► For each worker:
       │         1. Spawn process
       │         2. Wait for worker:status
       │         3. Record connection time
       │         4. Track in connections Map
       │         5. Increment cfnConnectionCount
       │
┌──────▼────────┐
│  Validation   │
└──────┬────────┘
       │
       ├─────► Validate connection count
       ├─────► Check Redis registrations
       ├─────► Verify connection times
       ├─────► Check for duplicates
       │
┌──────▼────────┐
│   Shutdown    │
└──────┬────────┘
       │
       ├─────► SIGTERM all processes
       ├─────► Wait for exit
       ├─────► Force kill if needed
       ├─────► Check for orphans
       ├─────► Clean Redis
       │
┌──────▼────────┐
│  Report       │
└───────────────┘
```

### Test 04: Handoff Coordination

```
┌──────────────┐
│ Init Harness │
└──────┬───────┘
       │
┌──────▼────────┐
│Spawn Coordinator│
└──────┬────────┘
       │
┌──────▼────────┐
│ Spawn Workers │
└──────┬────────┘
       │
┌──────▼─────────┐
│Spawn Reviewers │
└──────┬────────┘
       │
┌──────▼────────┐
│Execute Handoffs│
│    (Loop)     │
└──────┬────────┘
       │
       ├─────► For each task:
       │         1. Select worker (round-robin)
       │         2. Select reviewer (round-robin)
       │         3. Record in Redis: handoff:taskId
       │         4. Wait for handoff:taskId:status
       │         5. Record handoff time
       │         6. Track in handoffs Map
       │         7. Increment cfnHandoffCount
       │
┌──────▼────────┐
│  Validation   │
└──────┬────────┘
       │
       ├─────► Validate handoff count
       ├─────► Check success rate
       ├─────► Verify no failures
       ├─────► Check handoff times
       ├─────► Validate load distribution
       ├─────► Verify Redis persistence
       │
┌──────▼────────┐
│   Shutdown    │
└──────┬────────┘
       │
┌──────▼────────┐
│  Report       │
└───────────────┘
```

### Test 06: Graceful Shutdown

```
┌──────────────┐
│ Init Harness │
└──────┬───────┘
       │
┌──────▼────────┐
│Spawn Coordinator│
└──────┬────────┘
       │
┌──────▼────────┐
│ Spawn Workers │
└──────┬────────┘
       │
┌──────▼────────┐
│Let Processes  │
│   Run (2s)    │
└──────┬────────┘
       │
┌──────▼────────┐
│   Shutdown    │
│   (Timed)     │
└──────┬────────┘
       │
       ├─────► For each process:
       │         1. Send SIGTERM
       │         2. Wait up to 5s
       │         3. Send SIGKILL if needed
       │         4. Verify exit
       │
┌──────▼────────┐
│  Validation   │
└──────┬────────┘
       │
       ├─────► Check shutdown time
       ├─────► Verify no orphans
       ├─────► Confirm all terminated
       ├─────► Validate Redis cleanup
       ├─────► Check metrics recorded
       │
┌──────▼────────┐
│  Report       │
└───────────────┘
```

## Data Flow

### Connection Establishment Flow

```
Coordinator                 Redis                    Worker
    │                         │                        │
    ├─ SET coordinator:id ───►│                        │
    │     :status=ready        │                        │
    │                          │                        │
    │                          │◄─── SPAWN ─────────────┤
    │                          │                        │
    │                          │◄─ SET worker:id ───────┤
    │                          │     :status=ready      │
    │                          │                        │
    │◄─ GET worker:id:status ─┤                        │
    │                          │                        │
    ├─ INCR connection_count ─►│                        │
    │                          │                        │
    └─ Record connection ──────┴────────────────────────┘
       metadata
```

### Handoff Flow

```
Worker              Redis               Reviewer          Harness
  │                   │                    │                │
  ├─ HSET handoff ───►│                    │                │
  │   :taskId         │                    │                │
  │   workerId        │                    │                │
  │   reviewerId      │                    │                │
  │   status=pending  │                    │                │
  │                   │                    │                │
  │                   │◄─ BLPOP review ────┤                │
  │                   │     :queue         │                │
  │                   │                    │                │
  │                   ├─ HSET handoff ────►│                │
  │                   │   :status=active   │                │
  │                   │                    │                │
  │                   │                    ├─ Process ──────┤
  │                   │                    │   review       │
  │                   │                    │                │
  │                   │◄─ HSET handoff ────┤                │
  │                   │   :status=complete │                │
  │                   │                    │                │
  │                   ├─ Notify ───────────┴────────────────►│
  │                   │   handoff complete                   │
  │                   │                                      │
  │                   │                    Track handoff ◄───┤
  │                   │                    Increment count   │
  └───────────────────┴──────────────────────────────────────┘
```

## Redis Key Schema

### Coordinator Keys
```
coordinator:{coordinatorId}:status        → "ready" | "running" | "shutdown"
coordinator:{coordinatorId}:workers       → Set of worker IDs
coordinator:{coordinatorId}:started_at    → Timestamp
```

### Worker Keys
```
worker:{workerId}:status                  → "ready" | "working" | "idle" | "shutdown"
worker:{workerId}:coordinator             → Coordinator ID
worker:{workerId}:connected_at            → Timestamp
worker:{workerId}:tasks                   → Set of assigned task IDs
```

### Handoff Keys
```
handoff:{taskId}                          → Hash of handoff metadata
handoff:{taskId}:worker_id                → Worker ID
handoff:{taskId}:reviewer_id              → Reviewer ID
handoff:{taskId}:status                   → "pending" | "active" | "complete"
handoff:{taskId}:timestamp                → Handoff timestamp
```

### Queue Keys
```
review:queue                              → List (FIFO) of tasks awaiting review
review:assignments:{reviewerId}           → Set of assigned tasks
```

## Metrics Collection Points

### Startup Phase
- `cfnStartupTime` = Time from harness init to first worker connected
- Record at: First worker connection

### Connection Phase
- `cfnConnectionCount++` = Each successful worker connection
- `cfnWorkerSpawnCount++` = Each worker process spawn
- `cfnCoordinatorConnections++` = Each coordinator spawn
- Record at: Each spawn/connection event

### Handoff Phase
- `cfnHandoffCount++` = Each successful handoff
- `cfnReviewerAssignments` = Unique reviewers assigned
- `cfnHandoffFailures++` = Each failed handoff
- Record at: Each handoff attempt completion

### Shutdown Phase
- `cfnShutdownTime` = Time from shutdown start to all processes terminated
- `cfnOrphanedProcesses` = Processes still running after shutdown
- Record at: Shutdown completion

## Error Handling

### Connection Failures
```javascript
try {
  await spawnWorker(workerId, coordinatorId);
} catch (error) {
  // Log error
  // Do NOT increment cfnConnectionCount
  // Retry logic (optional)
  // Continue with remaining workers
}
```

### Handoff Failures
```javascript
try {
  await trackHandoff(taskId, workerId, reviewerId);
} catch (error) {
  // Log error
  // Increment cfnHandoffFailures
  // Record failure metadata
  // Continue with remaining handoffs
}
```

### Shutdown Failures
```javascript
// Graceful shutdown with timeout
const timeout = setTimeout(() => {
  // Force kill
  process.kill('SIGKILL');
  cfnOrphanedProcesses++;
}, SHUTDOWN_TIMEOUT);

process.on('exit', () => {
  clearTimeout(timeout);
});
```

## Validation Criteria

### Connection Validation
```javascript
{
  passed: cfnConnectionCount === expectedWorkers,
  actual: cfnConnectionCount,
  expected: expectedWorkers,
  connectionTimes: [/* array of times */],
  avgConnectionTime: /* average */,
  maxConnectionTime: /* max */
}
```

### Handoff Validation
```javascript
{
  passed: cfnHandoffCount === expectedTasks && cfnHandoffFailures === 0,
  actual: cfnHandoffCount,
  expected: expectedTasks,
  failures: cfnHandoffFailures,
  successRate: (cfnHandoffCount / expectedTasks) * 100,
  handoffTimes: [/* array of times */],
  reviewerDistribution: {/* reviewer -> count map */}
}
```

### Shutdown Validation
```javascript
{
  passed: cfnOrphanedProcesses === 0 && cfnShutdownTime < threshold,
  orphanedProcesses: cfnOrphanedProcesses,
  shutdownTime: cfnShutdownTime,
  threshold: SHUTDOWN_TIME_THRESHOLD,
  redisKeysRemaining: /* count */,
  processesTerminated: /* count */
}
```

## Performance Thresholds

```javascript
const THRESHOLDS = {
  connectionTime: {
    max: 2000,        // 2 seconds per connection
    avg: 1000         // 1 second average
  },
  handoffTime: {
    max: 1000,        // 1 second per handoff
    avg: 500          // 500ms average
  },
  shutdownTime: {
    max: 5000,        // 5 seconds total
    target: 3000      // 3 seconds target
  },
  successRates: {
    connections: 1.0, // 100% success
    handoffs: 1.0,    // 100% success
    cleanup: 1.0      // 100% cleanup
  }
};
```

## Extension Points

### Adding New Metrics

1. Add metric to `CfnTestHarness.metrics` object
2. Increment/update at appropriate lifecycle point
3. Include in `getMetrics()` return value
4. Add validation method (optional)
5. Update documentation

### Adding New Tests

1. Create test file: `tests/NN-test-name.test.js`
2. Import and instantiate `CfnTestHarness`
3. Execute test logic using harness methods
4. Validate results using harness validators
5. Report metrics using harness.getMetrics()
6. Add to `run-full-suite.sh` TESTS array
7. Update README.md

### Adding New Trackers

1. Create tracker module: `lib/cfn-{feature}-tracker.js`
2. Implement tracking data structure (Map/Set/Array)
3. Add tracking methods to `CfnTestHarness`
4. Emit events for tracking points
5. Include in metrics aggregation
6. Add validation methods

## Integration Points

### Redis Integration
- Connection: `harness.redis`
- Key management: `harness.waitForRedisKey()`, `harness.cleanupRedis()`
- Used by: All tests requiring state coordination

### Process Management
- Spawning: `harness.spawnCoordinator()`, `harness.spawnWorker()`
- Shutdown: `harness.shutdown()`, `harness.shutdownProcess()`
- Monitoring: `harness.processes` Map
- Used by: All tests

### Event System
- Event emitter: `harness.on('event', handler)`
- Events: `coordinator-exit`, `worker-connected`, `worker-exit`, `handoff-completed`, `handoff-failed`, `shutdown-completed`
- Used by: Advanced test scenarios, custom trackers

## Testing the Tests

### Unit Testing Harness Components

```bash
# Test connection tracking
npm test -- tests/cfn-v3-orchestration/lib/cfn-connection-tracker.test.js

# Test handoff tracking
npm test -- tests/cfn-v3-orchestration/lib/cfn-handoff-tracker.test.js

# Test metrics collector
npm test -- tests/cfn-v3-orchestration/lib/cfn-metrics-collector.test.js
```

### Integration Testing

```bash
# Test with minimal resources
CFN_TEST_WORKERS=2 CFN_TEST_TASKS=5 ./run-full-suite.sh

# Test with high load
CFN_TEST_WORKERS=20 CFN_TEST_TASKS=100 ./run-full-suite.sh

# Test with debugging
./run-full-suite.sh --verbose --debug --no-cleanup
```
