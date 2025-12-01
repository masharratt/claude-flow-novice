# State Persistence Model

**Task:** Integration Standardization Plan - Task 4.5
**Version:** 1.0.0
**Last Updated:** 2025-11-16

## Overview

The Claude Flow Novice system uses a dual persistence model to balance runtime performance with data durability. This document clarifies the boundaries between ephemeral (Redis) and persistent (SQLite) storage, defines checkpoint timing rules, and provides recovery procedures.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Persistence Boundaries](#persistence-boundaries)
- [Checkpoint Manager](#checkpoint-manager)
- [Checkpoint Timing Rules](#checkpoint-timing-rules)
- [Recovery Procedures](#recovery-procedures)
- [Best Practices](#best-practices)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Dual Persistence Model

The system uses two complementary storage layers:

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│                   (CFN Agents & Services)                   │
└──────────────────┬─────────────────┬────────────────────────┘
                   │                 │
      ┌────────────▼──────────┐  ┌──▼─────────────────┐
      │   Redis (Runtime)     │  │  SQLite (Durable)  │
      │   - Ephemeral         │  │  - Persistent      │
      │   - Fast reads/writes │  │  - ACID guarantees │
      │   - TTL-based cleanup │  │  - Long-term audit │
      └───────────────────────┘  └────────────────────┘
```

### Why Dual Persistence?

**Redis (Runtime State)**
- **Speed**: Sub-millisecond read/write operations
- **Coordination**: Built-in pub/sub and atomic operations
- **Ephemeral**: Automatic cleanup via TTL expiration
- **Use Case**: Active agent coordination, temporary locks, queues

**SQLite (Durable State)**
- **Durability**: ACID transactions and disk persistence
- **Querying**: Rich SQL querying capabilities
- **Audit**: Complete historical record
- **Use Case**: Completed tasks, metrics, audit trail

### Data Flow

```
Agent Execution:
1. Agent spawns → Create runtime state in Redis
2. Agent works → Update Redis state
3. Agent completes → Checkpoint to SQLite
4. Redis state expires → SQLite retains history

Recovery:
1. System restart → Check SQLite for last checkpoint
2. Load checkpoint → Restore Redis state
3. Resume execution → Agents continue from checkpoint
```

---

## Persistence Boundaries

### Redis: Runtime State (Ephemeral)

**What Goes in Redis:**

1. **Agent Execution State**
   - Current agent status (spawned, in_progress, completed)
   - Active agent metadata (confidence scores, timestamps)
   - Temporary execution context
   - TTL: Task completion + 1 hour

2. **Coordination Signals**
   - Inter-agent communication (`swarm:*` keys)
   - Gate completion signals
   - Broadcast messages
   - TTL: 5-60 minutes

3. **Temporary Queue Data**
   - Pending agent tasks
   - Priority queues
   - Work distribution
   - TTL: 30 minutes or task completion

4. **Active Locks**
   - Distributed locks for file operations
   - Resource locks (database connections)
   - Deadlock prevention tokens
   - TTL: 30 seconds to 5 minutes

**Example Redis Keys:**
```
agent:task-123:agent-456          # Agent execution state
swarm:task-123:gate-passed        # Coordination signal
queue:task-123:pending-work       # Queue data
lock:task-123:file-xyz            # Active lock
```

**Automatic Cleanup:**
All Redis keys use TTL-based expiration. No manual cleanup required.

### SQLite: Durable State (Persistent)

**What Goes in SQLite:**

1. **Completed Task Results**
   - Final task outcomes (PROCEED/ITERATE/ABORT)
   - Deliverables and artifacts
   - Success/failure status
   - Retention: Indefinite (prunable via admin)

2. **Agent Execution Metrics**
   - Execution time per agent
   - Confidence scores
   - Token usage and costs
   - Success/failure rates
   - Retention: 90 days (configurable)

3. **Audit Trail**
   - All state changes and decisions
   - Agent spawn/completion events
   - Checkpoint creation/recovery
   - Security events
   - Retention: 1 year (compliance-driven)

4. **Skill Metadata**
   - Skill execution statistics
   - Performance baselines
   - Version history
   - Retention: Indefinite

**Example SQLite Tables:**
```sql
-- Task results
CREATE TABLE task_results (
  task_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,  -- completed, failed, aborted
  result TEXT,
  confidence REAL,
  iterations INTEGER,
  started_at TEXT,
  completed_at TEXT,
  metadata TEXT
);

-- Agent metrics
CREATE TABLE agent_metrics (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  agent_type TEXT,
  execution_time INTEGER,
  confidence REAL,
  tokens_used INTEGER,
  cost REAL,
  timestamp TEXT,
  metadata TEXT
);

-- Audit trail
CREATE TABLE audit_trail (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  action TEXT,
  details TEXT,
  timestamp TEXT
);

-- Skill metadata
CREATE TABLE skill_metadata (
  skill_name TEXT PRIMARY KEY,
  version TEXT,
  execution_count INTEGER,
  success_rate REAL,
  avg_execution_time REAL,
  last_executed_at TEXT
);
```

### Data Transformation

The system uses `SchemaTransformService` to convert between Redis and SQLite formats:

```typescript
import { SchemaTransformService } from '../lib/schema-transform';

const transformer = new SchemaTransformService();

// Redis → SQLite (for checkpoint)
const sqliteData = transformer.transform(
  redisData,
  'agent_executions',
  'redis-to-sqlite'
);

// SQLite → Redis (for recovery)
const redisData = transformer.transform(
  sqliteData,
  'agent_executions',
  'sqlite-to-redis'
);
```

---

## Checkpoint Manager

### Overview

The `CheckpointManager` coordinates the dual persistence model by creating atomic snapshots of both Redis and SQLite state at defined trigger points.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Checkpoint Manager                          │
├──────────────────────────────────────────────────────────┤
│  Triggers:                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐    │
│  │  Task       │  │  Iteration   │  │  Periodic   │    │
│  │  Completion │  │  Boundary    │  │  (5 min)    │    │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘    │
│         │                │                  │            │
│         └────────────────┼──────────────────┘            │
│                          ▼                               │
│         ┌────────────────────────────┐                   │
│         │   Capture State            │                   │
│         │   - Redis runtime          │                   │
│         │   - SQLite durable         │                   │
│         └────────────┬───────────────┘                   │
│                      ▼                                    │
│         ┌────────────────────────────┐                   │
│         │   Idempotency Check        │                   │
│         │   (hash-based)             │                   │
│         └────────────┬───────────────┘                   │
│                      ▼                                    │
│         ┌────────────────────────────┐                   │
│         │   Validate State           │                   │
│         │   (consistency checks)     │                   │
│         └────────────┬───────────────┘                   │
│                      ▼                                    │
│         ┌────────────────────────────┐                   │
│         │   Store Checkpoint         │                   │
│         │   (atomic transaction)     │                   │
│         └────────────────────────────┘                   │
└──────────────────────────────────────────────────────────┘
```

### Key Features

1. **Idempotent Checkpointing**
   - Same state → Same checkpoint hash
   - Prevents duplicate checkpoints
   - Hash-based deduplication

2. **Atomic Operations**
   - All-or-nothing checkpoint creation
   - Transaction-based storage
   - Rollback on failure

3. **State Validation**
   - Pre-checkpoint validation
   - Consistency checks
   - Error detection

4. **Automatic Recovery**
   - Load latest valid checkpoint
   - Restore Redis state
   - Resume execution

### Usage

```typescript
import { CheckpointManager, CheckpointTrigger } from '../lib/checkpoint-manager';
import { DatabaseService } from '../lib/database-service';

// Initialize
const dbService = new DatabaseService({ redis: {...}, sqlite: {...} });
const checkpointMgr = new CheckpointManager(dbService, {
  enablePeriodicCheckpoints: true,
  periodicInterval: 300000,  // 5 minutes
  retentionPeriod: 7 * 24 * 60 * 60 * 1000,  // 7 days
});

await checkpointMgr.initialize();

// Create checkpoint on task completion
const checkpoint = await checkpointMgr.createCheckpoint(
  'task-123',
  CheckpointTrigger.TASK_COMPLETION
);

// Recover from checkpoint
const recovery = await checkpointMgr.recoverFromCheckpoint('task-123');

// List checkpoints
const checkpoints = await checkpointMgr.listCheckpoints('task-123');

// Cleanup old checkpoints
const deletedCount = await checkpointMgr.cleanupOldCheckpoints();
```

---

## Checkpoint Timing Rules

### Trigger Types

```typescript
enum CheckpointTrigger {
  TASK_COMPLETION = 'task_completion',      // Highest priority
  ITERATION_BOUNDARY = 'iteration_boundary', // High priority
  PERIODIC = 'periodic',                     // Low priority
  MANUAL = 'manual',                         // User-initiated
}
```

### Timing Rules

| Trigger | When | Purpose | Frequency |
|---------|------|---------|-----------|
| **Task Completion** | Agent task finishes (PROCEED/ITERATE/ABORT) | Capture final state | Per task |
| **Iteration Boundary** | CFN Loop iteration ends | Enable iteration recovery | Per iteration |
| **Periodic** | Every 5 minutes | Prevent data loss | 5 min intervals |
| **Manual** | User-initiated | Debugging, testing | On demand |

### Priority System

Checkpoints are deduplicated by state hash. Priority determines which trigger's metadata is retained when multiple triggers create identical checkpoints.

**Priority Order:**
1. TASK_COMPLETION (highest)
2. ITERATION_BOUNDARY
3. MANUAL
4. PERIODIC (lowest)

### Example Timeline

```
Time  Action                       Checkpoint Created
----  -------------------------    ------------------
0:00  Task starts                  -
0:03  Agent 1 completes            -
0:05  5-minute timer fires         Periodic (checkpoint-1)
0:07  Loop 3 iteration ends        Iteration boundary (checkpoint-2)
0:09  Agent 2 completes            -
0:10  5-minute timer fires         Periodic (skipped - same state as checkpoint-2)
0:12  Task completes               Task completion (checkpoint-3)
```

### Idempotency Example

```typescript
// First checkpoint
const checkpoint1 = await checkpointMgr.createCheckpoint(
  'task-123',
  CheckpointTrigger.PERIODIC
);
// checkpoint-1 created, hash: abc123

// State unchanged - second checkpoint skipped
const checkpoint2 = await checkpointMgr.createCheckpoint(
  'task-123',
  CheckpointTrigger.PERIODIC
);
// Returns checkpoint-1 (same hash: abc123)

// State changed - new checkpoint created
// (agent completes, confidence updated)
const checkpoint3 = await checkpointMgr.createCheckpoint(
  'task-123',
  CheckpointTrigger.TASK_COMPLETION
);
// checkpoint-3 created, hash: def456
```

---

## Recovery Procedures

### Automatic Recovery

The system automatically recovers from the latest checkpoint on startup:

```typescript
// System startup
await checkpointMgr.initialize();

// Automatic recovery for active tasks
const activeTasks = await dbService.getActiveTasks();

for (const task of activeTasks) {
  const recovery = await checkpointMgr.recoverFromCheckpoint(task.taskId);

  if (recovery.success) {
    logger.info('Task recovered', { taskId: task.taskId });
  } else {
    logger.error('Recovery failed', { taskId: task.taskId, errors: recovery.errors });
  }
}
```

### Manual Recovery

For manual recovery or debugging:

```bash
#!/bin/bash
# Recover specific task from checkpoint

TASK_ID="task-123"

# 1. List available checkpoints
npx ts-node scripts/list-checkpoints.ts "$TASK_ID"

# 2. Recover from latest checkpoint
npx ts-node scripts/recover-checkpoint.ts "$TASK_ID"

# 3. Verify recovery
redis-cli KEYS "agent:${TASK_ID}:*"
sqlite3 data/cfn.db "SELECT * FROM task_results WHERE task_id = '$TASK_ID'"
```

### Recovery Scenarios

#### Scenario 1: System Crash During Task Execution

```
Problem: System crashes mid-task, Redis state lost
Solution: Recover from latest checkpoint

Steps:
1. System restarts
2. CheckpointManager.initialize() runs
3. Finds incomplete task (task_results.status != 'completed')
4. Loads latest checkpoint
5. Restores Redis state
6. Resumes task execution from last checkpoint
```

#### Scenario 2: Redis Data Loss

```
Problem: Redis instance crashes, all runtime state lost
Solution: Rebuild from SQLite checkpoints

Steps:
1. Detect Redis connection failure
2. Query SQLite for all incomplete tasks
3. For each task:
   a. Load latest checkpoint
   b. Restore Redis runtime state
   c. Resume execution
4. Clean up expired checkpoints
```

#### Scenario 3: Partial Checkpoint Corruption

```
Problem: Checkpoint data corrupted or incomplete
Solution: Fall back to previous valid checkpoint

Steps:
1. Attempt recovery from latest checkpoint
2. Validation fails (checkpointData invalid)
3. Try next-latest checkpoint
4. Continue until valid checkpoint found
5. Log corruption event to audit trail
```

### Recovery Validation

After recovery, the system validates consistency:

```typescript
async function validateRecovery(taskId: string): Promise<boolean> {
  // 1. Check Redis state restored
  const agentKeys = await redis.keys(`agent:${taskId}:*`);
  if (agentKeys.length === 0) {
    logger.error('No agents restored to Redis', { taskId });
    return false;
  }

  // 2. Check SQLite consistency
  const taskResult = await sqlite.get(`task_results`, { task_id: taskId });
  if (!taskResult) {
    logger.error('Task result missing from SQLite', { taskId });
    return false;
  }

  // 3. Verify checkpoint metadata
  const checkpoint = await checkpointMgr.findLatestCheckpoint(taskId);
  if (checkpoint.status !== 'recovered') {
    logger.error('Checkpoint not marked as recovered', { taskId });
    return false;
  }

  return true;
}
```

---

## Best Practices

### For Developers

1. **Use Checkpoints at Task Boundaries**
   ```typescript
   // Good: Checkpoint after major state change
   await agent.completeTask();
   await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);
   ```

2. **Don't Checkpoint Too Frequently**
   ```typescript
   // Bad: Checkpoint on every minor update
   for (const item of items) {
     await processItem(item);
     await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.MANUAL); // ❌
   }

   // Good: Checkpoint after batch
   for (const item of items) {
     await processItem(item);
   }
   await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION); // ✅
   ```

3. **Trust Idempotency**
   ```typescript
   // Checkpoint manager handles deduplication
   // Safe to call multiple times with same state
   await checkpointMgr.createCheckpoint(taskId, trigger);
   ```

4. **Use Appropriate Triggers**
   ```typescript
   // Task completion
   await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.TASK_COMPLETION);

   // Loop iteration
   await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.ITERATION_BOUNDARY);

   // Debug/testing
   await checkpointMgr.createCheckpoint(taskId, CheckpointTrigger.MANUAL);
   ```

5. **Handle Recovery Errors**
   ```typescript
   const recovery = await checkpointMgr.recoverFromCheckpoint(taskId);

   if (!recovery.success) {
     logger.error('Recovery failed', recovery.errors);
     // Fall back to clean restart
     await cleanRestartTask(taskId);
   }
   ```

### For Operations

1. **Monitor Checkpoint Storage**
   - Check disk usage for SQLite database
   - Monitor Redis memory for runtime state
   - Set up alerts for storage thresholds

2. **Regular Cleanup**
   ```bash
   # Daily cron job
   0 2 * * * /scripts/cleanup-old-checkpoints.sh
   ```

3. **Backup SQLite Database**
   ```bash
   # Backup before major operations
   cp data/cfn.db data/cfn.db.backup.$(date +%s)
   ```

4. **Test Recovery Procedures**
   ```bash
   # Quarterly disaster recovery drill
   ./scripts/test-recovery.sh
   ```

5. **Monitor Checkpoint Health**
   ```sql
   -- Check checkpoint creation rate
   SELECT DATE(created_at), COUNT(*)
   FROM checkpoints
   GROUP BY DATE(created_at);

   -- Check failed checkpoints
   SELECT * FROM checkpoints WHERE status = 'failed';
   ```

---

## API Reference

### CheckpointManager Class

#### Constructor

```typescript
constructor(
  dbService: DatabaseService,
  config?: CheckpointManagerConfig
)
```

**Parameters:**
- `dbService`: Database service instance (must have Redis and SQLite adapters)
- `config`: Optional configuration

**Configuration Options:**
```typescript
interface CheckpointManagerConfig {
  enablePeriodicCheckpoints?: boolean;  // Default: true
  periodicInterval?: number;            // Default: 300000 (5 min)
  retentionPeriod?: number;             // Default: 7 days
  enableAutoCleanup?: boolean;          // Default: true
  validationTimeout?: number;           // Default: 5000 (5 sec)
}
```

#### Methods

##### initialize()
```typescript
async initialize(): Promise<void>
```
Initialize checkpoint manager and start periodic checkpoints.

**Throws:** `StandardError` if initialization fails

---

##### createCheckpoint()
```typescript
async createCheckpoint(
  taskId: string,
  trigger: CheckpointTrigger,
  metadata?: Record<string, any>
): Promise<CheckpointMetadata>
```
Create a checkpoint for the given task.

**Parameters:**
- `taskId`: Task identifier
- `trigger`: Checkpoint trigger type
- `metadata`: Optional metadata

**Returns:** Checkpoint metadata

**Throws:** `StandardError` if checkpoint creation fails

**Idempotency:** Safe to call multiple times with same state

---

##### recoverFromCheckpoint()
```typescript
async recoverFromCheckpoint(taskId: string): Promise<RecoveryResult>
```
Recover from the latest checkpoint for the given task.

**Parameters:**
- `taskId`: Task identifier

**Returns:** Recovery result with success status

**Errors:** Returns `success: false` with error details (does not throw)

---

##### listCheckpoints()
```typescript
async listCheckpoints(taskId: string): Promise<CheckpointMetadata[]>
```
List all checkpoints for a task (newest first).

**Parameters:**
- `taskId`: Task identifier

**Returns:** Array of checkpoint metadata

**Throws:** `StandardError` if query fails

---

##### cleanupOldCheckpoints()
```typescript
async cleanupOldCheckpoints(): Promise<number>
```
Delete checkpoints older than retention period.

**Returns:** Number of checkpoints deleted

**Throws:** `StandardError` if cleanup fails

---

##### shutdown()
```typescript
async shutdown(): Promise<void>
```
Shutdown checkpoint manager and cleanup resources.

---

### Types

#### CheckpointTrigger
```typescript
enum CheckpointTrigger {
  TASK_COMPLETION = 'task_completion',
  ITERATION_BOUNDARY = 'iteration_boundary',
  PERIODIC = 'periodic',
  MANUAL = 'manual',
}
```

#### CheckpointStatus
```typescript
enum CheckpointStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RECOVERED = 'recovered',
}
```

#### CheckpointMetadata
```typescript
interface CheckpointMetadata {
  checkpointId: string;
  taskId: string;
  trigger: CheckpointTrigger;
  status: CheckpointStatus;
  runtimeStateHash: string;
  durableStateHash: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}
```

#### RecoveryResult
```typescript
interface RecoveryResult {
  success: boolean;
  checkpointId: string;
  taskId: string;
  runtimeStateRestored: boolean;
  durableStateRestored: boolean;
  timestamp: Date;
  errors?: string[];
}
```

---

## Troubleshooting

### Common Issues

#### Issue: Checkpoint Creation Fails

**Symptoms:**
- `StandardError: Failed to create checkpoint`
- Checkpoint status = `failed` in database

**Causes:**
1. Redis connection lost
2. SQLite database locked
3. Invalid state data

**Solutions:**
```bash
# Check Redis connection
redis-cli PING

# Check SQLite locks
lsof data/cfn.db

# Verify state data
npx ts-node scripts/validate-state.ts task-123
```

---

#### Issue: Recovery Fails

**Symptoms:**
- `RecoveryResult.success = false`
- Missing Redis state after recovery

**Causes:**
1. Checkpoint data corrupted
2. No valid checkpoints found
3. State validation failure

**Solutions:**
```bash
# List available checkpoints
npx ts-node scripts/list-checkpoints.ts task-123

# Try manual recovery from specific checkpoint
npx ts-node scripts/recover-checkpoint.ts task-123 checkpoint-xyz

# Validate checkpoint data
sqlite3 data/cfn.db "SELECT * FROM checkpoints WHERE task_id = 'task-123'"
```

---

#### Issue: Too Many Checkpoints

**Symptoms:**
- SQLite database growing rapidly
- Slow checkpoint queries

**Causes:**
1. Retention period too long
2. Auto-cleanup disabled
3. High checkpoint frequency

**Solutions:**
```typescript
// Reduce retention period
const checkpointMgr = new CheckpointManager(dbService, {
  retentionPeriod: 3 * 24 * 60 * 60 * 1000, // 3 days (was 7)
});

// Manual cleanup
await checkpointMgr.cleanupOldCheckpoints();

// Check checkpoint frequency
const checkpoints = await checkpointMgr.listCheckpoints(taskId);
console.log('Checkpoints per hour:', checkpoints.length / 24);
```

---

#### Issue: Idempotency Not Working

**Symptoms:**
- Duplicate checkpoints with same state
- Unexpected checkpoint creation

**Causes:**
1. State includes timestamps (changes every time)
2. Non-deterministic state serialization
3. Hash collision (extremely rare)

**Solutions:**
```typescript
// Exclude timestamps from state hash
const stableState = {
  ...runtimeState,
  capturedAt: undefined, // Exclude timestamp
};

// Use deterministic serialization
const stateJson = JSON.stringify(stableState, Object.keys(stableState).sort());
```

---

## Appendix

### Related Documentation

- **Database Service**: `/home/user/claude-flow-novice/src/lib/database-service/README.md`
- **Schema Transform**: `/home/user/claude-flow-novice/docs/SCHEMA_TRANSFORM.md`
- **CFN Loop**: `/home/user/claude-flow-novice/.claude/commands/CFN_LOOP_TASK_MODE.md`

### Code Examples

Complete working examples available in:
- `/home/user/claude-flow-novice/tests/checkpoint-manager.test.ts`
- `/home/user/claude-flow-novice/examples/checkpoint-usage.ts`

### Performance Benchmarks

| Operation | Time | Notes |
|-----------|------|-------|
| Create checkpoint | 50-100ms | Depends on state size |
| Recover checkpoint | 100-200ms | Includes Redis writes |
| List checkpoints | 5-10ms | Indexed query |
| Cleanup old checkpoints | 10-50ms | Batch delete |

### Version History

- **1.0.0** (2025-11-16): Initial implementation
  - Dual persistence model
  - Idempotent checkpointing
  - Atomic operations
  - Recovery procedures
