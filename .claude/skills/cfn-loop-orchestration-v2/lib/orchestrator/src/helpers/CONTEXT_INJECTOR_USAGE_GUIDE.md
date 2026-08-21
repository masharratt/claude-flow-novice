# Context Injector Usage Guide

**Quick Reference for Broadcast Message Construction in CFN Loop**

## Quick Start

### Basic Usage - Single Agent Context

```typescript
import {
  buildBroadcastContext,
  ExecutionMode,
  LoopPhase
} from './context-injector';

// Build context for an agent
const result = buildBroadcastContext({
  taskId: 'task-abc-123',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
});

// JSON ready for Redis broadcast
console.log(result.json);
// {
//   "taskId": "task-abc-123",
//   "iteration": 1,
//   "phase": "loop3",
//   "mode": "standard",
//   "timestamp": "2025-11-20T14:05:48.000Z",
//   "contextVersion": "3.0"
// }
```

### Building Context with Agents

```typescript
const result = buildBroadcastContext({
  taskId: 'task-abc-123',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['backend-dev-1', 'frontend-dev-1', 'devops-1']
});

console.log(result.messageCount); // 3
// Broadcast to all agents:
// redis.publish('swarm:task-abc-123:context', result.json)
```

### Adding Success Criteria

```typescript
const result = buildBroadcastContext({
  taskId: 'task-auth',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  successCriteria: {
    criteria: [
      'JWT authentication implemented',
      'All unit tests passing (95%+ coverage)',
      'API endpoints secured',
      'Documentation complete'
    ],
    testPassRate: 0.95,    // Loop 3 gate threshold
    consensusThreshold: 0.9 // Loop 2 consensus threshold
  }
});
```

## Common Patterns

### Pattern 1: Single-Agent Task (Backend Engineer)

```typescript
const backendContext = buildBroadcastContext({
  taskId: 'task-api-refactor',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['backend-engineer-1'],
  taskDescription: 'Refactor REST API for better performance',
  successCriteria: {
    criteria: [
      'API response time < 100ms',
      'Database queries optimized',
      'No N+1 queries',
      'Load tests passing'
    ],
    testPassRate: 0.98,
    consensusThreshold: 0.95
  }
});
```

### Pattern 2: Multi-Agent Wave (All Implementers)

```typescript
const waveContext = buildBroadcastContext({
  taskId: 'task-payment-system',
  iteration: 1,
  phase: 'loop3',
  mode: 'enterprise',
  agentIds: [
    'backend-engineer-1',
    'frontend-engineer-1',
    'security-specialist-1',
    'database-architect-1',
    'devops-engineer-1'
  ],
  taskDescription: 'Build secure payment processing system',
  successCriteria: {
    criteria: [
      'Payment API implemented and tested',
      'Frontend integration complete',
      'Security audit passed',
      'Database schema optimized',
      'Docker deployment ready'
    ],
    testPassRate: 0.95,
    consensusThreshold: 0.90
  }
});

// Broadcast context
const contextJson = waveContext.json;
// redis.publish('swarm:task-payment-system:context', contextJson)

// Message count tells us how many agents received context
console.log(`Context broadcasted to ${waveContext.messageCount} agents`);
```

### Pattern 3: Multiple Agent Contexts (Per-Agent Customization)

```typescript
const messages = buildBroadcastMessages(
  {
    taskId: 'task-auth-system',
    iteration: 1,
    phase: 'loop3',
    mode: 'standard',
    successCriteria: {
      criteria: ['Auth system complete', 'Security tests passing'],
      testPassRate: 0.95,
      consensusThreshold: 0.9
    }
  },
  [
    { agentId: 'backend-dev-1', agentType: 'backend-engineer' },
    { agentId: 'frontend-dev-1', agentType: 'react-frontend-engineer' },
    { agentId: 'tester-1', agentType: 'tester' }
  ]
);

// Send individual messages to each agent
messages.forEach(msg => {
  redis.publish(`agent:${msg.agentIds[0]}:context`, JSON.stringify(msg));
});
```

### Pattern 4: Iteration Wake-Up with Feedback

```typescript
// First iteration fails, need to retry
const iterationContext = buildIterationContext(
  'task-auth',
  2,  // iteration 2
  'standard',
  {
    feedback: 'Tests failed in loop 3, retrying iteration',
    failureReason: 'JWT validation not implemented',
    priority: 'critical',
    timeoutIncrease: 300  // seconds
  }
);

// Wake all agents for next iteration
redis.publish('swarm:task-auth:iterate', JSON.stringify(iterationContext));
```

### Pattern 5: Validator Wave (Loop 2)

```typescript
const validatorContext = buildBroadcastContext({
  taskId: 'task-api',
  iteration: 1,
  phase: 'loop2',
  mode: 'standard',
  agentIds: ['validator-1', 'validator-2', 'validator-3'],
  taskDescription: 'Review and validate API implementation from Loop 3',
  successCriteria: {
    criteria: [
      'Code follows architectural patterns',
      'Tests are comprehensive',
      'Performance meets SLAs',
      'Security requirements met'
    ],
    testPassRate: 0.90,
    consensusThreshold: 0.90
  }
});

// Validators receive same success criteria as implementers
console.log(validatorContext.context.successCriteria);
```

## Advanced Usage

### Merging Multiple Contexts

Combine agent contexts when scaling across phases:

```typescript
const ctx1 = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['agent-1', 'agent-2']
});

const ctx2 = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['agent-3', 'agent-4']
});

const merged = mergeBroadcastContexts([ctx1, ctx2]);
// merged.agentIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4']
```

### Parsing Received Context

When agents receive context from Redis:

```typescript
// Received from Redis pub/sub
const receivedJson = await redis.get('agent:agent-1:context');

// Parse and validate
const context = parseBroadcastContext(receivedJson);

// Safe to use with type checking
console.log(`Task: ${context.taskId}`);
console.log(`Phase: ${context.phase}`);
console.log(`Success criteria: ${context.successCriteria?.criteria}`);
```

### Formatting Context for Logging

```typescript
const context = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard'
});

// Pretty format for logs
const prettyJson = formatContextJson(context.context, false);
console.log('Broadcasting:\n' + prettyJson);

// Compact format for storage
const compactJson = formatContextJson(context.context, true);
redis.set(`context:${context.context.taskId}`, compactJson);
```

## Error Handling

### Validation Errors

```typescript
try {
  buildBroadcastContext({
    taskId: 'task-1',
    iteration: 0,  // ERROR: must be >= 1
    phase: 'loop3',
    mode: 'standard'
  });
} catch (error) {
  console.error('Context validation failed:', error.message);
  // "iteration must be a positive number"
}
```

### Invalid Success Criteria

```typescript
try {
  buildBroadcastContext({
    taskId: 'task-1',
    iteration: 1,
    phase: 'loop3',
    mode: 'standard',
    successCriteria: {
      criteria: [],  // ERROR: must have at least one
      testPassRate: 0.95,
      consensusThreshold: 0.9
    }
  });
} catch (error) {
  console.error(error.message);
  // "successCriteria.criteria must be a non-empty array"
}
```

### JSON Parsing Errors

```typescript
try {
  parseBroadcastContext('not valid json {');
} catch (error) {
  console.error('Parse error:', error.message);
  // "Invalid JSON for broadcast context: SyntaxError..."
}

try {
  parseBroadcastContext('{}');
} catch (error) {
  console.error('Missing fields:', error.message);
  // "taskId must be a non-empty string"
}
```

## Integration with Redis Coordination

### Publishing Broadcast Context

```typescript
import { buildBroadcastContext } from './context-injector';

async function broadcastToLoop3Agents(taskId, agentIds) {
  const context = buildBroadcastContext({
    taskId,
    iteration: 1,
    phase: 'loop3',
    mode: 'standard',
    agentIds,
    successCriteria: {
      criteria: ['Implementation complete', 'Tests passing'],
      testPassRate: 0.95,
      consensusThreshold: 0.9
    }
  });

  // Publish to all agents
  const message = context.json;
  const subscribers = await redis.publish(
    `swarm:${taskId}:context`,
    message
  );

  console.log(`Context sent to ${subscribers} subscribers`);
  return context;
}
```

### Listening for Context in Agent

```typescript
import { parseBroadcastContext } from './context-injector';

redis.subscribe(`agent:${agentId}:context`, (err, count) => {
  if (err) throw err;
  console.log(`Subscribed to ${count} channels`);
});

redis.on('message', (channel, message) => {
  try {
    const context = parseBroadcastContext(message);
    console.log(`Received context for task: ${context.taskId}`);
    console.log(`Iteration: ${context.iteration}`);
    console.log(`Phase: ${context.phase}`);

    // Execute work based on context
    executeAgentWork(context);
  } catch (error) {
    console.error('Failed to parse context:', error.message);
  }
});
```

## Execution Mode Thresholds

When setting success criteria, consider the execution mode:

```typescript
// MVP Mode: Lower thresholds for quick validation
const mvpContext = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'mvp',
  successCriteria: {
    criteria: ['Basic functionality works'],
    testPassRate: 0.70,        // MVP threshold
    consensusThreshold: 0.80   // MVP threshold
  }
});

// Standard Mode: Balanced approach (most common)
const stdContext = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  successCriteria: {
    criteria: ['Feature complete', 'Tests passing', 'Docs complete'],
    testPassRate: 0.95,        // Standard threshold
    consensusThreshold: 0.90   // Standard threshold
  }
});

// Enterprise Mode: Strict validation
const entContext = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'enterprise',
  successCriteria: {
    criteria: [
      'Feature complete',
      'Tests passing (95%+ coverage)',
      'Performance benchmarks',
      'Security audit passed',
      'Docs and examples'
    ],
    testPassRate: 0.98,        // Enterprise threshold
    consensusThreshold: 0.95   // Enterprise threshold
  }
});
```

## Performance Considerations

1. **Context Size:** Keep context < 1KB for efficient Redis messaging
2. **Agent Count:** Optimal range is 2-5 agents per wave
3. **Serialization:** JSON serialization is O(m) where m is context size
4. **Merging:** Avoid merging more than 10 contexts at once

## Debugging Tips

```typescript
// Enable detailed logging
function debugContext(context) {
  console.log('=== CONTEXT DEBUG ===');
  console.log(`Task: ${context.taskId}`);
  console.log(`Iteration: ${context.iteration}`);
  console.log(`Phase: ${context.phase}`);
  console.log(`Mode: ${context.mode}`);
  console.log(`Agents: ${context.agentIds?.join(', ') || 'none'}`);
  console.log(`Timestamp: ${context.timestamp}`);

  if (context.successCriteria) {
    console.log('Success Criteria:');
    context.successCriteria.criteria.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c}`);
    });
    console.log(
      `  Pass Rate: ${(context.successCriteria.testPassRate * 100).toFixed(0)}%`
    );
    console.log(
      `  Consensus: ${(context.successCriteria.consensusThreshold * 100).toFixed(0)}%`
    );
  }

  if (context.taskDescription) {
    console.log(`Description: ${context.taskDescription}`);
  }
  console.log('====================');
}

const ctx = buildBroadcastContext({ /* ... */ });
debugContext(ctx.context);
```

## Testing Context Injection

Use the context injector in your tests:

```typescript
import { buildBroadcastContext, parseBroadcastContext } from './context-injector';

describe('My Agent', () => {
  it('should handle broadcast context correctly', () => {
    const ctx = buildBroadcastContext({
      taskId: 'test-task',
      iteration: 1,
      phase: 'loop3',
      mode: 'standard'
    });

    const parsed = parseBroadcastContext(ctx.json);
    expect(parsed.taskId).toBe('test-task');
    expect(parsed.iteration).toBe(1);
  });
});
```

## Reference

- **Module:** `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/helpers/context-injector.ts`
- **Tests:** `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/tests/context-injector.test.ts`
- **Docs:** `CONTEXT_INJECTOR_IMPLEMENTATION.md`
