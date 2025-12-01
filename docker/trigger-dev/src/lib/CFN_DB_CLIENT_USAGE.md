# CFN Database Client Library - Usage Guide

## Overview

Comprehensive TypeScript client library for CFN database operations with Postgres connection pooling.

## Connection Configuration

The client uses environment variables from `.env`:

```bash
CFN_POSTGRES_HOST=localhost
CFN_POSTGRES_PORT=5435
CFN_POSTGRES_DB=cfn_loop
CFN_POSTGRES_USER=cfn
CFN_POSTGRES_PASSWORD=cfn_dev_password
```

## Installation

```bash
npm install pg
npm install -D @types/pg
```

## Import

```typescript
import * as db from './src/lib/cfn-db';
```

## Task Operations

### Create Task

```typescript
const task = await db.createTask({
  id: 'task-123',
  description: 'Implement feature X',
  mode: 'standard',
  maxIterations: 10,
  provider: 'zai',
  workDir: '/workspace',
  triggerRunId: 'trigger-run-456',
});
```

### Update Task Status

```typescript
// Simple status update
await db.updateTaskStatus('task-123', 'running');

// With additional fields
await db.updateTaskStatus('task-123', 'completed', {
  currentIteration: 3,
  finalDecision: 'PROCEED',
  finalPassRate: 0.95,
  finalConsensus: 0.88,
});
```

## Iteration Operations

### Create Iteration

```typescript
const iteration = await db.createIteration({
  taskId: 'task-123',
  iterationNumber: 1,
  coordinatorManifest: {
    phases: ['implementation', 'testing', 'validation'],
    totalAgents: 5,
  },
});
```

### Update Iteration

```typescript
await db.updateIteration(iteration.id, {
  status: 'completed',
  gatePassRate: 0.95,
  gatePassed: true,
  consensusScore: 0.88,
  consensusPassed: true,
  decision: 'PROCEED',
});
```

## Agent Operations

### Create Agent

```typescript
const agent = await db.createAgent({
  id: 'agent-456',
  taskId: 'task-123',
  iterationId: iteration.id,
  phaseId: 1,
  agentType: 'typescript-specialist',
  role: 'implementer',
  assignedFiles: ['src/app.ts', 'src/utils.ts'],
  assignedTests: ['src/app.test.ts'],
  taskDescription: 'Fix TypeScript errors',
  triggerRunId: 'trigger-agent-789',
});
```

### Update Agent Status

```typescript
// Mark as running
await db.updateAgentStatus('agent-456', 'running');

// Complete with results
await db.updateAgentStatus('agent-456', 'completed', {
  success: true,
  testsPassed: true,
  confidence: 0.90,
  filesModified: ['src/app.ts', 'src/utils.ts'],
  durationMs: 5000,
  output: { linesChanged: 25, errorsFixed: 3 },
});

// Mark as failed
await db.updateAgentStatus('agent-456', 'failed', {
  errorMessage: 'Compilation failed',
  durationMs: 2000,
});
```

## Logging

### Direct Logging

```typescript
await db.log({
  taskId: 'task-123',
  agentId: 'agent-456',
  component: 'orchestrator',
  level: 'info',
  message: 'Starting coordination',
  data: { phase: 1, agentCount: 5 },
});
```

### Logger Object

```typescript
// Info
await db.logger.info('orchestrator', 'Phase completed', {
  taskId: 'task-123',
  data: { phase: 1, duration: 5000 },
});

// Debug
await db.logger.debug('coordinator', 'Analyzing dependencies', {
  taskId: 'task-123',
  data: { fileCount: 15 },
});

// Warning
await db.logger.warn('implementer', 'High memory usage', {
  agentId: 'agent-456',
  data: { memoryMB: 950 },
});

// Error with exception
try {
  throw new Error('Connection timeout');
} catch (error) {
  await db.logger.error('test-runner', 'Test execution failed', error, {
    taskId: 'task-123',
    data: { testFile: 'app.test.ts' },
  });
}
```

## Test Results

### Record Test Run

```typescript
await db.recordTestRun({
  taskId: 'task-123',
  iterationId: iteration.id,
  agentId: 'agent-456',
  testCommand: 'npm test',
  workDir: '/workspace',
  exitCode: 0,
  durationMs: 3500,
  totalTests: 25,
  passedTests: 23,
  failedTests: 2,
  skippedTests: 0,
  stdout: 'Test output...',
  stderr: '',
  failedTestNames: ['should handle edge case', 'should validate input'],
});
```

The pass rate is calculated automatically: `passedTests / totalTests`

## Query Helpers

### Get Task with Full Details

```typescript
const details = await db.getTaskWithDetails('task-123');

console.log(details.task);        // Task summary from v_task_summary view
console.log(details.iterations);  // All iterations ordered by number
console.log(details.agents);      // All agents ordered by creation
console.log(details.recentLogs);  // Last 100 log entries
```

### Get Recent Errors

```typescript
const errors = await db.getRecentErrors(50);

errors.forEach(error => {
  console.log(`${error.level}: ${error.message}`);
  console.log(`Component: ${error.component}`);
  console.log(`Task: ${error.task_id}`);
});
```

## Connection Management

### Close Pool

```typescript
// Always close the pool when shutting down
await db.close();
```

## Type Safety

All functions are fully typed with TypeScript interfaces:

- `LogLevel`: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
- Agent roles: 'implementer' | 'validator' | 'coordinator'
- Status values: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
- Modes: 'mvp' | 'standard' | 'enterprise'

## Error Handling

All database operations can throw errors. Use try-catch:

```typescript
try {
  await db.createTask({ ... });
} catch (error) {
  console.error('Database operation failed:', error);
  await db.logger.error('app', 'Task creation failed', error);
}
```

## Connection Pooling

The library uses pg's connection pooling automatically:
- Reuses connections across operations
- Handles connection lifecycle
- Thread-safe for concurrent operations
- Call `db.close()` on application shutdown

## Test Coverage

Run the test suite:

```bash
npx tsx test-db-client.ts
```

Test coverage:
- Connection establishment
- Task CRUD operations
- Iteration CRUD operations
- Agent CRUD operations
- Logging (all levels)
- Test result recording
- Query helpers
- Cleanup and connection management

## Database Schema

The client works with these tables:
- `cfn_tasks` - Task metadata and status
- `cfn_iterations` - Iteration tracking
- `cfn_agents` - Agent execution records
- `cfn_logs` - Structured logging
- `cfn_test_runs` - Test execution results
- `cfn_phases` - Phase definitions

And views:
- `v_task_summary` - Task with computed fields
- `v_recent_errors` - Recent error logs

## Integration with Trigger.dev

Use in Trigger.dev tasks:

```typescript
import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db";

export const myTask = task({
  id: "my-task",
  run: async (payload) => {
    const taskId = `trigger:${Date.now()}`;

    await db.createTask({
      id: taskId,
      description: payload.description,
      mode: 'standard',
      maxIterations: 10,
      triggerRunId: payload.runId,
    });

    try {
      // Execute work...
      await db.updateTaskStatus(taskId, 'completed');
    } catch (error) {
      await db.logger.error('task', 'Execution failed', error, { taskId });
      await db.updateTaskStatus(taskId, 'failed', {
        errorMessage: error.message,
      });
      throw error;
    }
  },
});
```

## Performance Notes

- Connection pooling provides ~10x faster operations vs new connections
- Use batch operations where possible
- Index usage: queries on task_id, status, created_at are optimized
- Log retention: consider archiving old logs for long-running tasks

## Version

- Phase 2.1 of Trigger.dev CFN Implementation
- Compatible with CFN Postgres schema v1.0
- Requires pg@8.x or higher
