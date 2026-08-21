# Context Injector - Quick Reference Card

## Import

```typescript
import {
  buildBroadcastContext,
  buildBroadcastMessages,
  buildIterationContext,
  formatContextJson,
  parseBroadcastContext,
  mergeBroadcastContexts,
  type BroadcastContext,
  type SuccessCriteria,
  type LoopPhase,
  type ExecutionMode,
  type BroadcastResult
} from './context-injector';
```

## Core Functions

### buildBroadcastContext(params)
Build single broadcast context for agents

```typescript
const result = buildBroadcastContext({
  taskId: string,              // required
  iteration: number,           // required (≥1)
  phase: LoopPhase,           // required (loop3|loop2|product-owner|iteration-prep)
  mode: ExecutionMode,        // required (mvp|standard|enterprise)
  agentIds?: string[],        // optional
  successCriteria?: {         // optional
    criteria: string[],
    testPassRate: number,     // 0.0-1.0
    consensusThreshold: number // 0.0-1.0
  },
  taskDescription?: string    // optional
});
// Returns: { context, json, messageCount }
```

### buildBroadcastMessages(baseContext, agentContexts)
Build per-agent contexts

```typescript
const messages = buildBroadcastMessages(
  {
    taskId: string,
    iteration: number,
    phase: LoopPhase,
    mode: ExecutionMode,
    successCriteria?: SuccessCriteria,
    taskDescription?: string
  },
  [
    { agentId: string, agentType: string },
    // ... more agents
  ]
);
// Returns: BroadcastContext[]
```

### buildIterationContext(taskId, iteration, mode, feedback?)
Build iteration-prep context

```typescript
const ctx = buildIterationContext(
  'task-1',
  2,           // iteration number
  'standard',  // mode
  { /* feedback object */ } // optional
);
// Returns: BroadcastContext with phase='iteration-prep'
```

### formatContextJson(context, compact?)
Format context as JSON

```typescript
const pretty = formatContextJson(context);     // with whitespace
const compact = formatContextJson(context, true); // minified
// Returns: string
```

### parseBroadcastContext(json)
Parse JSON to context

```typescript
const context = parseBroadcastContext(jsonString);
// Returns: BroadcastContext (with validation)
// Throws: Error if invalid
```

### mergeBroadcastContexts(contexts)
Merge multiple contexts

```typescript
const merged = mergeBroadcastContexts([
  context1,
  context2,
  // ... more contexts
]);
// Returns: BroadcastContext with combined agentIds
// Throws: Error if taskId or iteration don't match
```

## Type Definitions

### BroadcastContext
```typescript
{
  taskId: string;
  iteration: number;
  phase: LoopPhase;
  mode: ExecutionMode;
  timestamp: string;
  contextVersion: string;
  agentIds?: string[];
  successCriteria?: SuccessCriteria;
  taskDescription?: string;
}
```

### SuccessCriteria
```typescript
{
  criteria: string[];           // non-empty array
  testPassRate: number;         // 0.0-1.0
  consensusThreshold: number;   // 0.0-1.0
}
```

### LoopPhase
```typescript
'loop3' | 'loop2' | 'product-owner' | 'iteration-prep'
```

### ExecutionMode
```typescript
'mvp' | 'standard' | 'enterprise'
```

## Quick Examples

### Loop 3 Broadcast
```typescript
const result = buildBroadcastContext({
  taskId: 'task-123',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['impl-1', 'impl-2'],
  successCriteria: {
    criteria: ['Feature done', 'Tests pass'],
    testPassRate: 0.95,
    consensusThreshold: 0.9
  }
});
redis.publish('swarm:task-123:context', result.json);
```

### Multi-Agent Wave
```typescript
const messages = buildBroadcastMessages(
  { taskId: 'task-1', iteration: 1, phase: 'loop3', mode: 'standard' },
  [
    { agentId: 'backend-1', agentType: 'backend-engineer' },
    { agentId: 'frontend-1', agentType: 'react-frontend-engineer' }
  ]
);
messages.forEach(msg => {
  redis.publish(`agent:${msg.agentIds[0]}:context`, JSON.stringify(msg));
});
```

### Iteration Wake-Up
```typescript
const ctx = buildIterationContext('task-1', 2, 'standard', {
  feedback: 'Tests failed, retrying',
  priority: 'high'
});
redis.publish('swarm:task-1:iterate', JSON.stringify(ctx));
```

### Parse Received Context
```typescript
const received = await redis.get('agent:agent-1:context');
const context = parseBroadcastContext(received);
console.log(`Task: ${context.taskId}, Phase: ${context.phase}`);
```

## Validation Rules

| Field | Required | Type | Constraints |
|-------|----------|------|-------------|
| taskId | Yes | string | non-empty |
| iteration | Yes | number | ≥1 |
| phase | Yes | LoopPhase | loop3\|loop2\|product-owner\|iteration-prep |
| mode | Yes | ExecutionMode | mvp\|standard\|enterprise |
| agentIds | No | string[] | any length |
| successCriteria | No | object | see SuccessCriteria |
| taskDescription | No | string | any length |

**SuccessCriteria Constraints:**
- `criteria`: array with ≥1 items
- `testPassRate`: 0.0 ≤ value ≤ 1.0
- `consensusThreshold`: 0.0 ≤ value ≤ 1.0

## Error Handling

```typescript
try {
  buildBroadcastContext({...});
} catch (error) {
  // Error cases:
  // - "taskId is required"
  // - "iteration must be a positive number"
  // - "Invalid phase: unknown"
  // - "successCriteria.testPassRate must be between 0 and 1"
  // - (14 total validation scenarios)
}

try {
  parseBroadcastContext(json);
} catch (error) {
  // Error cases:
  // - "Invalid JSON for broadcast context"
  // - "taskId must be a non-empty string"
  // - (field presence/type errors)
}
```

## Success Criteria Thresholds by Mode

| Mode | Test Pass Rate | Consensus Threshold | Max Iterations |
|------|---|---|---|
| MVP | 0.70 (70%) | 0.80 (80%) | 5 |
| Standard | 0.95 (95%) | 0.90 (90%) | 10 |
| Enterprise | 0.98 (98%) | 0.95 (95%) | 15 |

## Performance

| Operation | Complexity | Typical Time |
|-----------|-----------|---|
| buildBroadcastContext (single) | O(1) | <1ms |
| buildBroadcastContext (n agents) | O(n) | <1ms |
| formatContextJson | O(m) | <1ms |
| parseBroadcastContext | O(m) | <1ms |
| mergeBroadcastContexts (n contexts) | O(n) | <1ms |

(m = context size in bytes, typically <1KB)

## Integration Points

### With Redis Coordinator
```typescript
const ctx = buildBroadcastContext({...});
coordinator.broadcastSignal('context', ctx.json);
```

### With Orchestrator
```typescript
const ctxMsg = buildBroadcastContext({
  taskId, iteration, phase: 'loop3', mode,
  agentIds: loop3Agents,
  successCriteria: getModeConfig(mode)
});
```

### With Agent Spawner
```typescript
const messages = buildBroadcastMessages(baseCtx, agents);
agents.forEach((agent, i) => {
  spawnAgent(agent.agentId, messages[i].json);
});
```

## Files

| File | Purpose | Size |
|------|---------|------|
| context-injector.ts | Implementation | 341 LOC |
| context-injector.test.ts | Tests (34 tests) | 561 LOC |
| CONTEXT_INJECTOR_IMPLEMENTATION.md | Full docs | 375 LOC |
| CONTEXT_INJECTOR_USAGE_GUIDE.md | Usage patterns | 508 LOC |

## Test Command

```bash
npm test -- "$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/tests/context-injector.test.ts"
```

Expected output: `Tests: 34 passed, 34 total`

## Common Mistakes to Avoid

❌ **Iteration < 1**
```typescript
// WRONG
buildBroadcastContext({ ..., iteration: 0 });
// Throws: "iteration must be a positive number"
```

✅ **Iteration ≥ 1**
```typescript
// CORRECT
buildBroadcastContext({ ..., iteration: 1 });
```

---

❌ **Empty criteria array**
```typescript
// WRONG
successCriteria: { criteria: [], testPassRate: 0.95, ... }
// Throws: "successCriteria.criteria must be a non-empty array"
```

✅ **Non-empty criteria**
```typescript
// CORRECT
successCriteria: { criteria: ['Test 1', 'Test 2'], testPassRate: 0.95, ... }
```

---

❌ **Threshold out of range**
```typescript
// WRONG
successCriteria: { ..., testPassRate: 1.5 }
// Throws: "testPassRate must be between 0 and 1"
```

✅ **Valid threshold**
```typescript
// CORRECT
successCriteria: { ..., testPassRate: 0.95 }
```

---

❌ **Invalid JSON parsing**
```typescript
// WRONG
parseBroadcastContext('not json');
// Throws: "Invalid JSON for broadcast context"
```

✅ **Valid JSON**
```typescript
// CORRECT
const ctx = buildBroadcastContext({...});
parseBroadcastContext(ctx.json);
```

## See Also

- **Full Implementation:** CONTEXT_INJECTOR_IMPLEMENTATION.md
- **Usage Guide:** CONTEXT_INJECTOR_USAGE_GUIDE.md
- **Test Suite:** tests/context-injector.test.ts
- **Source Code:** src/helpers/context-injector.ts
