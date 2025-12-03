# Context Injector Implementation

**TypeScript Module for Broadcast Message Builder**

Location: `.claude/skills/cfn-loop-orchestration/src/helpers/context-injector.ts`
Test Suite: `.claude/skills/cfn-loop-orchestration/tests/context-injector.test.ts`

## Overview

The Context Injector module constructs broadcast context messages for agent execution in the CFN Loop orchestration system. It provides type-safe APIs for building, serializing, and parsing agent execution contexts with support for iteration tracking, phase awareness, and success criteria injection.

**Metrics:**
- Implementation: 342 LOC (target: 95 LOC → comprehensive feature set)
- Test coverage: 34 tests, 100% pass rate
- Complexity: High (multi-function architecture with validation)
- Functions exported: 7 core functions + type definitions

## Core API

### buildBroadcastContext(params)

Constructs a broadcast context message for agent execution.

```typescript
const result = buildBroadcastContext({
  taskId: 'task-123',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['agent-1', 'agent-2'],
  successCriteria: {
    criteria: ['Feature implemented', 'Tests passing'],
    testPassRate: 0.95,
    consensusThreshold: 0.9
  },
  taskDescription: 'Implement JWT authentication'
});

console.log(result.json); // JSON for Redis broadcast
console.log(result.messageCount); // Number of agents
```

**Parameters:**
- `taskId` (string, required): Unique task identifier
- `iteration` (number, required): Current iteration number (≥1)
- `phase` (LoopPhase, required): Execution phase (loop3 | loop2 | product-owner | iteration-prep)
- `mode` (ExecutionMode, required): Execution mode (mvp | standard | enterprise)
- `agentIds` (string[], optional): Array of agent IDs for context
- `successCriteria` (SuccessCriteria, optional): Success criteria for execution
- `taskDescription` (string, optional): Task description or feedback

**Returns:**
```typescript
{
  context: BroadcastContext;     // Structured context object
  json: string;                   // JSON-formatted message
  messageCount: number;           // Number of agents in context
}
```

**Error Handling:**
- Throws if `taskId` is empty
- Throws if `iteration` < 1
- Throws if `phase` is invalid
- Throws if `mode` is invalid
- Throws if success criteria are malformed

### buildBroadcastMessages(baseContext, agentContexts)

Builds separate broadcast contexts for multiple agents with per-agent customization.

```typescript
const messages = buildBroadcastMessages(
  {
    taskId: 'task-1',
    iteration: 1,
    phase: 'loop3',
    mode: 'standard',
    successCriteria: { /* ... */ }
  },
  [
    { agentId: 'loop3-backend-1', agentType: 'backend-engineer' },
    { agentId: 'loop3-frontend-1', agentType: 'react-frontend-engineer' }
  ]
);

messages.forEach(msg => {
  // Each message has a single agentId
  redis.publish(`agent:${msg.agentIds[0]}`, JSON.stringify(msg));
});
```

**Returns:** Array of BroadcastContext objects (one per agent)

### buildIterationContext(taskId, iteration, mode, feedback?)

Specialized function for building iteration-prep context for agent wake operations.

```typescript
const ctx = buildIterationContext('task-1', 2, 'standard', {
  issues: 'Need more tests',
  priority: 'high'
});
// phase is automatically set to 'iteration-prep'
```

### formatContextJson(context, compact?)

Formats broadcast context as JSON (with or without whitespace).

```typescript
const formatted = formatContextJson(context, false); // Pretty-printed
const compact = formatContextJson(context, true);    // Minified
```

### parseBroadcastContext(json)

Parses JSON string back to BroadcastContext object with validation.

```typescript
const context = parseBroadcastContext(jsonString);
// Validates all required fields
// Throws on invalid JSON or missing fields
```

### mergeBroadcastContexts(contexts)

Merges multiple broadcast contexts, combining agent IDs and validating consistency.

```typescript
const merged = mergeBroadcastContexts([
  { taskId: 'task-1', iteration: 1, agentIds: ['agent-1', 'agent-2'], /* ... */ },
  { taskId: 'task-1', iteration: 1, agentIds: ['agent-3'], /* ... */ }
]);
// merged.agentIds = ['agent-1', 'agent-2', 'agent-3']
```

## Type Definitions

### BroadcastContext

```typescript
interface BroadcastContext {
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
interface SuccessCriteria {
  criteria: string[];           // List of success criteria
  testPassRate: number;         // 0.0-1.0
  consensusThreshold: number;   // 0.0-1.0
}
```

### LoopPhase

```typescript
type LoopPhase = 'loop3' | 'loop2' | 'product-owner' | 'iteration-prep';
```

### ExecutionMode

```typescript
type ExecutionMode = 'mvp' | 'standard' | 'enterprise';
```

## Validation Rules

### Required Field Validation
- `taskId`: Non-empty string
- `iteration`: Positive integer (≥1)
- `phase`: One of valid LoopPhase values
- `mode`: One of valid ExecutionMode values

### Success Criteria Validation
- `criteria`: Non-empty array of strings
- `testPassRate`: Number between 0.0 and 1.0
- `consensusThreshold`: Number between 0.0 and 1.0

### JSON Validation
- Valid JSON format
- Must be object type
- All required fields present with correct types

## Integration Examples

### Broadcasting to Loop 3 Agents

```typescript
const result = buildBroadcastContext({
  taskId: 'task-abc',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['loop3-backend', 'loop3-frontend', 'loop3-devops'],
  successCriteria: {
    criteria: ['Implementation complete', 'Tests passing', 'Documentation'],
    testPassRate: 0.95,
    consensusThreshold: 0.9
  },
  taskDescription: 'Build user authentication system'
});

// Broadcast via Redis
await redis.publish('swarm:task-abc:broadcast', result.json);

// Or send individual messages
for (const agentId of result.context.agentIds) {
  await redis.publish(`agent:${agentId}:context`, result.json);
}
```

### Handling Iteration Wake-Ups

```typescript
const iterationCtx = buildIterationContext(
  'task-abc',
  2,
  'standard',
  { feedback: 'Tests failed in first iteration', priority: 'critical' }
);

// Wake agents for next iteration
await redis.publish('swarm:task-abc:iterate', JSON.stringify(iterationCtx));
```

### Multi-Phase Execution

```typescript
// Build Loop 3 context
const loop3Result = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop3',
  mode: 'standard',
  agentIds: ['implementer-1', 'implementer-2']
});

// Build Loop 2 context with success criteria
const loop2Result = buildBroadcastContext({
  taskId: 'task-1',
  iteration: 1,
  phase: 'loop2',
  mode: 'standard',
  agentIds: ['validator-1', 'validator-2', 'validator-3'],
  successCriteria: loop3Result.context.successCriteria
});

// Gate passed - broadcast to validators
await redis.publish('swarm:task-1:gate-passed', loop2Result.json);
```

## Test Coverage

**Test Suite:** `tests/context-injector.test.ts` (34 tests)

### Coverage Areas

1. **Basic Functionality (5 tests)**
   - Build context with required fields only
   - Timestamp inclusion and format
   - Optional fields inclusion
   - Loop phase support
   - Execution mode support

2. **JSON Formatting (3 tests)**
   - Valid JSON output
   - Proper indentation
   - Compact JSON formatting

3. **Error Handling - Missing Fields (6 tests)**
   - Missing taskId
   - Invalid iteration values
   - Missing/invalid phase
   - Missing/invalid mode

4. **Error Handling - Invalid Criteria (3 tests)**
   - Empty criteria array
   - Invalid testPassRate
   - Invalid consensusThreshold

5. **JSON Parsing (5 tests)**
   - Parse valid context
   - Invalid JSON handling
   - Non-object context handling
   - Missing required fields
   - Optional field preservation

6. **Multi-Agent Contexts (3 tests)**
   - Separate context per agent
   - Empty agent list handling
   - Success criteria preservation

7. **Iteration Context (2 tests)**
   - With feedback
   - Without feedback

8. **Merge Operations (5 tests)**
   - Combine agent IDs
   - Remove duplicates
   - TaskId mismatch detection
   - Iteration mismatch detection
   - Empty contexts array handling

9. **Integration Tests (2 tests)**
   - Build-format-parse cycle integrity
   - Context version inclusion

### Running Tests

```bash
# Run all context injector tests
npm test -- ./.claude/skills/cfn-loop-orchestration/tests/context-injector.test.ts

# Run specific test suite
npm test -- --testNamePattern="buildBroadcastContext" \
  ./.claude/skills/cfn-loop-orchestration/tests/context-injector.test.ts

# Run with coverage
npm test -- --coverage ./.claude/skills/cfn-loop-orchestration/tests/context-injector.test.ts
```

## Performance Characteristics

- **Context Construction:** O(1) for basic context, O(n) for multi-agent with n agents
- **JSON Serialization:** O(m) where m is context size (typically <1KB)
- **JSON Parsing:** O(m) with full validation
- **Context Merging:** O(n + m) where n, m are agent counts in contexts

## Backward Compatibility

**Reference Shell Implementation:** `helpers/context-injection.sh` (142 LOC)

The TypeScript module provides feature parity with the shell predecessor while adding:
- Full type safety with TypeScript interfaces
- Comprehensive error handling and validation
- Multi-phase execution support
- Iteration context specialization
- Context merging capabilities
- Complete test coverage

## Usage Notes

1. **Task ID Generation:** Ensure task IDs are unique and sanitized (no special chars)
2. **Iteration Numbers:** Always increment from 1, no skipping allowed
3. **Success Criteria:** Define clear, measurable criteria for validation
4. **Agent IDs:** Keep consistent with spawned agent naming conventions
5. **Feedback Content:** Keep feedback JSON-serializable
6. **Phase Sequencing:** Follow canonical phase order (loop3 → loop2 → product-owner)

## Related Modules

- `redis-coordinator.ts` - Redis message broadcasting
- `orchestrator.ts` - Main orchestration engine
- `iteration-manager.ts` - Iteration lifecycle management
- `agent-spawner.ts` - Agent execution and monitoring

## Future Enhancements

1. Context caching to reduce serialization overhead
2. Differential context updates for multi-iteration workflows
3. Context versioning with backward compatibility
4. Metrics collection on broadcast operations
5. Integration with context ACE system for historical context
