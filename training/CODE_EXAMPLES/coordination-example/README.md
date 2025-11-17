# Coordination Protocols Example

Complete working example demonstrating Redis-based agent coordination with schema validation.

## Overview

This example shows how to:
- Use RedisCoordination for agent communication
- Implement schema-validated message passing
- Manage agent lifecycle
- Handle timeouts and errors
- Test coordination protocols

## Files

- `redis-coordination.ts` - Redis coordination service
- `agent-coordinator.ts` - Agent coordination example
- `schemas/` - Message schemas
- `example.ts` - Usage examples
- `coordination.test.ts` - Integration tests

## Setup

```bash
# Install dependencies
npm install

# Start Redis
docker-compose up -d redis

# Run example
npm run example

# Run tests
npm test
```

## Key Patterns

### 1. Schema-Validated Publishing

```typescript
import { RedisCoordination } from './redis-coordination';
import { AgentCompletionSchema } from './schemas/agent-schema';

const coord = new RedisCoordination({
  host: 'localhost',
  port: 6379
});

// Publish with automatic validation
await coord.publish('agent-complete', {
  taskId: 'task-123',
  agentId: 'backend-dev-1',
  confidence: 0.92,
  iteration: 1,
  result: {
    deliverables: ['file1.ts', 'file2.ts'],
    status: 'complete'
  }
}, AgentCompletionSchema);

// Invalid data throws CoordinationError
```

### 2. Blocking Wait for Signals

```typescript
// Coordinator waits for agent completion
const signal = await coord.wait(
  'swarm:task-123:backend-dev-1:done',
  30000 // 30s timeout
);

if (!signal) {
  // Timeout - agent didn't respond
  throw new StandardError(
    'Agent timeout',
    ErrorCode.COORDINATION_TIMEOUT,
    { agentId: 'backend-dev-1', timeout: 30000 }
  );
}

// Agent completed - get results
const confidence = await coord.hget(
  'swarm:task-123:backend-dev-1:result',
  'confidence'
);
```

### 3. Agent Lifecycle Management

```typescript
// Coordinator spawns agent
const agentId = `backend-dev-${Date.now()}`;
await coord.registerAgent(agentId, {
  type: 'backend-developer',
  taskId: 'task-123',
  status: 'running',
  spawnedAt: new Date()
});

// Agent works...

// Agent reports completion
await coord.reportCompletion({
  taskId: 'task-123',
  agentId,
  confidence: 0.88,
  iteration: 1,
  result: {
    deliverables: ['implementation.ts'],
    status: 'complete'
  }
});

// Coordinator collects results
const agents = await coord.listAgents('task-123');
const confidence = agents.map(a => a.confidence);
const avgConfidence = confidence.reduce((a, b) => a + b) / confidence.length;

if (avgConfidence >= 0.75) {
  // Gate passed - proceed to validation
}
```

### 4. Pub/Sub Pattern

```typescript
// Subscribe to agent completion events
await coord.subscribe(
  'agent-complete',
  AgentCompletionSchema,
  async (message) => {
    console.log('Agent completed:', message.agentId);
    console.log('Confidence:', message.confidence);

    // Process completion
    if (message.confidence >= 0.75) {
      await spawnValidators(message.taskId);
    } else {
      await iterateAgent(message.agentId);
    }
  }
);

// Publish completion from agent
await coord.publish('agent-complete', {
  taskId: 'task-123',
  agentId: 'backend-dev-1',
  confidence: 0.92,
  iteration: 1,
  result: { status: 'complete', deliverables: [] }
}, AgentCompletionSchema);
```

## Message Schemas

### Agent Completion Schema

```typescript
export const AgentCompletionSchema = {
  type: 'object',
  required: ['taskId', 'agentId', 'confidence', 'result'],
  properties: {
    taskId: {
      type: 'string',
      pattern: '^[a-z0-9-]+$',
      description: 'Unique task identifier'
    },
    agentId: {
      type: 'string',
      pattern: '^[a-z0-9-]+$',
      description: 'Unique agent identifier'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Self-assessed quality score'
    },
    iteration: {
      type: 'integer',
      minimum: 1,
      description: 'Current iteration number'
    },
    result: {
      type: 'object',
      required: ['deliverables', 'status'],
      properties: {
        deliverables: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of created/modified files'
        },
        status: {
          type: 'string',
          enum: ['complete', 'failed', 'partial'],
          description: 'Completion status'
        }
      }
    }
  }
};
```

### Consensus Schema

```typescript
export const ConsensusSchema = {
  type: 'object',
  required: ['taskId', 'validatorId', 'consensus', 'feedback'],
  properties: {
    taskId: { type: 'string' },
    validatorId: { type: 'string' },
    consensus: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Validation consensus score'
    },
    feedback: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['info', 'warning', 'error'] },
          message: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' }
        }
      }
    }
  }
};
```

## Complete Workflow Example

```typescript
import { RedisCoordination } from './redis-coordination';
import { AgentCompletionSchema, ConsensusSchema } from './schemas';

const coord = new RedisCoordination({ host: 'localhost', port: 6379 });

// === COORDINATOR: SPAWN LOOP 3 AGENTS ===
const taskId = 'task-123';
const loop3Agents = ['backend-dev', 'researcher', 'devops'];

for (const agentType of loop3Agents) {
  const agentId = `${agentType}-${Date.now()}`;

  await coord.registerAgent(agentId, {
    type: agentType,
    taskId,
    status: 'running',
    spawnedAt: new Date()
  });

  // Spawn agent via CLI (background process)
  spawnAgentCLI(agentId, taskId);
}

// === AGENTS: DO WORK AND REPORT ===
// (Each agent runs independently)
async function agentWork(agentId: string, taskId: string) {
  // Do implementation work
  const deliverables = await implementFeature();

  // Report completion
  await coord.reportCompletion({
    taskId,
    agentId,
    confidence: 0.88,
    iteration: 1,
    result: {
      deliverables,
      status: 'complete'
    }
  });

  // Signal done
  await coord.signal(`swarm:${taskId}:${agentId}:done`, 'complete');
}

// === COORDINATOR: COLLECT RESULTS ===
const confidenceScores = [];

for (const agentType of loop3Agents) {
  const agentId = `${agentType}-${Date.now()}`;

  // Wait for completion signal
  const signal = await coord.wait(
    `swarm:${taskId}:${agentId}:done`,
    60000
  );

  if (!signal) {
    throw new Error(`Agent ${agentId} timeout`);
  }

  // Get confidence score
  const result = await coord.hget(
    `swarm:${taskId}:${agentId}:result`,
    'confidence'
  );

  confidenceScores.push(parseFloat(result));
}

// === GATE CHECK ===
const avgConfidence = confidenceScores.reduce((a, b) => a + b) / confidenceScores.length;

if (avgConfidence >= 0.75) {
  // Gate passed - spawn validators
  const validators = ['reviewer', 'tester', 'architect'];

  for (const validatorType of validators) {
    const validatorId = `${validatorType}-${Date.now()}`;
    spawnValidatorCLI(validatorId, taskId);
  }
} else {
  // Gate failed - iterate
  console.log('Gate failed. Iterating Loop 3...');
}
```

## Error Handling

```typescript
import { CoordinationError, ErrorCode } from '../lib/errors';

try {
  await coord.wait('agent-signal', 30000);
} catch (error) {
  if (error instanceof CoordinationError) {
    switch (error.code) {
      case ErrorCode.COORDINATION_TIMEOUT:
        // Agent didn't respond - retry or abort
        logger.warn('Agent timeout', {
          agentId: error.context.agentId,
          timeout: error.context.timeout
        });
        await retryAgent(error.context.agentId);
        break;

      case ErrorCode.COORDINATION_VALIDATION_FAILED:
        // Invalid message - log and reject
        logger.error('Schema validation failed', {
          schema: error.context.schema,
          errors: error.context.errors
        });
        throw error;

      case ErrorCode.COORDINATION_CONNECTION_FAILED:
        // Redis down - fallback
        logger.error('Redis connection failed');
        await fallbackToLocalCoordination();
        break;
    }
  }
}
```

## Testing

```typescript
// tests/coordination.test.ts
import { RedisCoordination } from '../redis-coordination';
import { AgentCompletionSchema } from '../schemas/agent-schema';

describe('Coordination Protocols', () => {
  let coord: RedisCoordination;

  beforeEach(async () => {
    coord = new RedisCoordination({ host: 'localhost', port: 6379 });
    await coord.flushAll(); // Clean Redis for tests
  });

  afterEach(async () => {
    await coord.close();
  });

  test('publishes and receives schema-validated messages', async () => {
    const received: any[] = [];

    await coord.subscribe(
      'agent-complete',
      AgentCompletionSchema,
      async (message) => {
        received.push(message);
      }
    );

    await coord.publish('agent-complete', {
      taskId: 'task-123',
      agentId: 'agent-456',
      confidence: 0.92,
      iteration: 1,
      result: {
        deliverables: ['file1.ts'],
        status: 'complete'
      }
    }, AgentCompletionSchema);

    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(received).toHaveLength(1);
    expect(received[0].confidence).toBe(0.92);
  });

  test('rejects invalid messages', async () => {
    await expect(
      coord.publish('agent-complete', {
        taskId: 'task-123',
        // Missing required fields
      }, AgentCompletionSchema)
    ).rejects.toThrow(CoordinationError);
  });

  test('handles timeouts correctly', async () => {
    await expect(
      coord.wait('non-existent-signal', 1000)
    ).resolves.toBeNull();
  });

  test('manages agent lifecycle', async () => {
    await coord.registerAgent('agent-123', {
      type: 'backend-developer',
      taskId: 'task-456',
      status: 'running',
      spawnedAt: new Date()
    });

    const agents = await coord.listAgents('task-456');
    expect(agents).toHaveLength(1);
    expect(agents[0].type).toBe('backend-developer');

    await coord.reportCompletion({
      taskId: 'task-456',
      agentId: 'agent-123',
      confidence: 0.88,
      iteration: 1,
      result: { deliverables: [], status: 'complete' }
    });

    const result = await coord.hget('swarm:task-456:agent-123:result', 'confidence');
    expect(parseFloat(result)).toBe(0.88);
  });
});
```

## Best Practices

1. **Always validate messages** - Use schemas for all pub/sub
2. **Set appropriate timeouts** - Don't wait forever
3. **Handle Redis failures** - Implement fallback mechanisms
4. **Clean up resources** - Close connections properly
5. **Monitor agent health** - Track spawn/completion times
6. **Log coordination events** - Aid debugging

## Common Pitfalls

- ❌ Forgetting to set timeouts on wait operations
- ❌ Not validating message schemas
- ❌ Missing error handling for Redis failures
- ❌ Not cleaning up completed agent data
- ❌ Hardcoding channel names

## Next Steps

1. Review the implementation in `redis-coordination.ts`
2. Study the schemas in `schemas/`
3. Run the example and observe Redis keys
4. Experiment with different timeout values
5. Implement coordination in your own agents

## Resources

- Redis Coordination API: `/docs/REDIS_COORDINATION_API.md`
- Agent Lifecycle: `/docs/AGENT_LIFECYCLE.md`
- Schema Validation: `/docs/SCHEMA_VALIDATION.md`
