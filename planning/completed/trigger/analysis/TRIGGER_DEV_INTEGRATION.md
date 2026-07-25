# Trigger.dev Integration Adapters for CFN Loop

**Created:** 2025-11-21
**Type:** TypeScript Integration Module
**Status:** Type-safe implementation complete, runtime testing required

## Files Created

### 1. Type Definitions
**File:** `/home/user/claude-flow-novice/src/types/trigger-dev-events.d.ts`

Core type system for trigger.dev and CFN Loop integration:
- `RunStatusType`: Enum-like literal union for run statuses
- `RunStatusResponse`: Trigger.dev run status API response
- `AgentCompletePayload`: Agent completion event
- `GateResultPayload`: Loop 3 gate check result
- `ConsensusResultPayload`: Loop 2 consensus result
- `PODecisionPayload`: Product Owner decision event
- `CFNLoopPayload`: CFN Loop trigger request
- `Run`: Trigger.dev run object
- `TaskModeEvent`: In-memory event representation
- `TaskModeSpawnRequest`: Agent spawn request
- `TaskModeAgentResult`: Agent execution result

### 2. TriggerDevClient
**File:** `/home/user/claude-flow-novice/src/integration/trigger-dev-client.ts`

Type-safe wrapper for trigger.dev SDK with:

**Classes:**
- `TriggerDevClient`: Main integration class
- `TriggerDevError`: Typed error class

**Methods:**
- `triggerCFNLoop(payload)`: Trigger CFN Loop run → returns run ID
- `getRunStatus(runId)`: Get run status and output
- `cancelRun(runId)`: Cancel running task
- `listRuns(filters)`: Query runs with optional filtering

**Features:**
- Environment variable configuration (TRIGGER_API_URL, TRIGGER_API_KEY, TRIGGER_ENVIRONMENT_ID)
- Exponential backoff retry logic (3 attempts by default)
- 30-second timeout by default
- Comprehensive error handling with typed error details
- Request validation (run ID, payload format)
- Type-safe API contract

**Runtime Testing Needed:**
- `// TODO: RUNTIME_TEST: Verify webhook signature validation in trigger.dev`
- `// TODO: RUNTIME_TEST: Test retry logic with transient API failures`
- `// TODO: RUNTIME_TEST: Verify polling behavior matches trigger.dev API`
- `// TODO: RUNTIME_TEST: Verify cancellation propagates to agent processes`
- `// TODO: RUNTIME_TEST: Test pagination with large result sets`

### 3. TriggerDevWebhooks
**File:** `/home/user/claude-flow-novice/src/integration/trigger-dev-webhooks.ts`

Express router for secure webhook handling:

**Classes:**
- `TriggerDevWebhooks`: Main webhook router
- `WebhookValidationError`: Webhook validation error

**Endpoints:**
- `POST /webhooks/agent-complete`: Agent completion handler
- `POST /webhooks/gate-result`: Gate check result handler
- `POST /webhooks/consensus-result`: Consensus result handler
- `POST /webhooks/po-decision`: Product Owner decision handler

**Features:**
- HMAC-SHA256/SHA512 signature verification
- Timing-safe comparison to prevent timing attacks
- Request validation (required fields, enum values)
- Middleware-based verification pipeline
- Error handling with proper HTTP status codes
- Handler registration via fluent API
- Type-safe webhook context

**Security:**
- Signature verification by default (can be disabled)
- Environment variable secrets (WEBHOOK_SECRET, WEBHOOK_ALGORITHM)
- Timing-safe HMAC comparison

**Runtime Testing Needed:**
- `// TODO: RUNTIME_TEST: Verify HMAC signature validation with valid/invalid keys`

### 4. TaskModeAdapter
**File:** `/home/user/claude-flow-novice/src/integration/task-mode-adapter.ts`

In-memory and hybrid coordination for task mode:

**Classes:**
- `TaskModeCoordinator`: Main coordinator for task mode
- `TaskModeEventQueue`: FIFO event queue

**Methods (Coordinator):**
- `spawnAgent(agentType, taskId, payload, timeoutMs)`: Spawn agent and wait for completion
- `registerAgentComplete(payload)`: Register agent completion event
- `registerGateResult(payload)`: Register gate result
- `registerConsensusResult(payload)`: Register consensus result
- `registerPODecision(payload)`: Register PO decision
- `getEventQueue()`: Get event queue for inspection
- `getTaskEvents(taskId)`: Get all events for task
- `isMemoryMode()`: Check if using memory mode

**Methods (EventQueue):**
- `enqueue(event)`: Add event to queue
- `dequeue()`: Remove and return oldest event
- `getByType(type)`: Get events by type
- `getByTaskId(taskId)`: Get events for task
- `clear()`: Clear all events
- `size()`: Get queue size
- `on(event, listener)`: Subscribe to events
- `off(event, listener)`: Unsubscribe from events

**Features:**
- Memory-mode fallback when trigger.dev unavailable
- Hybrid mode using trigger.dev for spawning
- In-memory event queue for synchronous coordination
- Auto-detection: Uses memory mode if TRIGGER_API_URL not set
- Configurable via TASK_MODE_USE_MEMORY and TASK_MODE_TIMEOUT_MS
- Timeout handling with 30-second default
- Promise-based completion waiting
- Singleton pattern support

**Runtime Testing Needed:**
- `// TODO: RUNTIME_TEST: Verify agent spawning works in memory mode`
- `// TODO: RUNTIME_TEST: Test timeout behavior with slow agents`
- `// TODO: RUNTIME_TEST: Verify trigger.dev API call succeeds`
- `// TODO: RUNTIME_TEST: Verify EventEmitter imports work in Node.js environment`

### 5. Module Index
**File:** `/home/user/claude-flow-novice/src/integration/index.ts`

Barrel export for clean module interface:

**Exports:**
```typescript
// Classes
TriggerDevClient
TriggerDevError
TriggerDevWebhooks
WebhookValidationError
TaskModeCoordinator
TaskModeEventQueue

// Factory Functions
createTriggerDevClient()
createWebhookRouter()
createTaskModeCoordinator()
getTaskModeCoordinator()

// Types
RunStatusType
RunStatusResponse
AgentType
AgentCompletePayload
GateResultPayload
ConsensusResultPayload
PODecisionPayload
CFNLoopPayload
Run
WebhookVerificationOptions
WebhookContext
WebhookHandlerResult
TaskModeEvent
TaskModeSpawnRequest
TaskModeAgentResult
TriggerDevConfig
RunFilterOptions
WebhookConfig
WebhookHandler
TaskModeCoordinationResult
```

## Usage Examples

### TriggerDevClient
```typescript
import { TriggerDevClient } from '@/integration';

const client = new TriggerDevClient({
  apiUrl: 'https://api.trigger.dev',
  apiKey: 'your-api-key',
  environmentId: 'prod',
});

// Trigger CFN Loop
const runId = await client.triggerCFNLoop({
  taskId: 'task-123',
  description: 'Implement feature X',
  mode: 'standard',
  successCriteria: {
    gate: 'test-pass-rate >= 0.95',
    consensusThreshold: 0.9,
    testPassRateThreshold: 0.95,
  },
});

// Get run status
const status = await client.getRunStatus(runId);
console.log(status.status); // 'RUNNING' | 'SUCCESS' | 'FAILURE' | ...

// Cancel run
await client.cancelRun(runId);

// List runs
const runs = await client.listRuns({
  taskId: 'task-123',
  status: 'SUCCESS',
  limit: 10,
});
```

### TriggerDevWebhooks
```typescript
import express from 'express';
import { TriggerDevWebhooks } from '@/integration';

const app = express();
app.use(express.json());

const webhooks = new TriggerDevWebhooks({
  secret: process.env.WEBHOOK_SECRET,
  algorithm: 'sha256',
});

// Register handlers
webhooks.onAgentComplete(async (context) => {
  console.log('Agent completed:', context.payload.agentId);
  return { success: true, message: 'Processed' };
});

webhooks.onGateResult(async (context) => {
  console.log('Gate result:', context.payload.passed);
  return { success: true, message: 'Processed' };
});

// Mount webhook routes
app.use('/webhooks', webhooks.getRouter());

app.listen(3000);
```

### TaskModeAdapter
```typescript
import { getTaskModeCoordinator } from '@/integration';

const coordinator = getTaskModeCoordinator();

// Spawn agent (memory mode fallback)
const result = await coordinator.spawnAgent(
  'loop3-implementer',
  'task-123',
  { description: 'Implement feature' },
  30000 // 30-second timeout
);

if (result.success) {
  console.log('Agent output:', result.output);
  console.log('Confidence:', result.confidenceScore);
}

// Register completion (called by webhook handlers)
coordinator.registerAgentComplete({
  agentId: 'agent-456',
  agentType: 'loop3-implementer',
  taskId: 'task-123',
  status: 'success',
  output: 'Feature implemented',
  confidenceScore: 0.92,
  executionTimeMs: 15000,
});

// Get all events for task
const events = coordinator.getTaskEvents('task-123');
console.log('Event count:', events.length);
```

## Configuration

### TriggerDevClient
Environment variables:
- `TRIGGER_API_URL`: Base URL for trigger.dev API
- `TRIGGER_API_KEY`: Authentication token
- `TRIGGER_ENVIRONMENT_ID`: Environment ID

### TriggerDevWebhooks
Environment variables:
- `WEBHOOK_SECRET`: Shared secret for HMAC verification
- `WEBHOOK_ALGORITHM`: Hash algorithm (default: sha256)

### TaskModeAdapter
Environment variables:
- `TASK_MODE_USE_MEMORY`: Force memory mode (default: auto-detect)
- `TASK_MODE_TIMEOUT_MS`: Default timeout for completions
- `TRIGGER_API_URL`: Auto-enables trigger.dev if set

## Type Safety

All classes use strict TypeScript with:
- Generic type parameters for extensibility
- Discriminated unions for type-safe events
- Branded types for secure values
- Proper error typing with TriggerDevError
- Interface contracts for all public methods
- Type guards for validation

## Error Handling

**TriggerDevClient** throws `TriggerDevError` with:
- Descriptive message
- Error code (CONFIGURATION_ERROR, HTTP_ERROR, etc.)
- Optional HTTP status code
- Error details object

**TriggerDevWebhooks** returns HTTP errors:
- 400: Missing/invalid request fields
- 401: Invalid signature
- 500: Processing errors

**TaskModeCoordinator** throws `Error` with:
- Timeout messages
- Spawn failure details

## Testing Recommendations

### Unit Tests
- Validate error handling for each method
- Test timeout behavior
- Verify type safety with invalid inputs
- Test retry logic with mocked API

### Integration Tests
- Verify webhook signature validation
- Test agent spawning in memory mode
- Validate event queue FIFO ordering
- Test timeout and cancellation

### Runtime Tests (Marked with TODO:RUNTIME_TEST)
See marked locations in source code for specific scenarios requiring live environment:
1. Webhook signature validation with real payloads
2. Retry logic with transient API failures
3. Polling behavior with real trigger.dev API
4. Cancellation propagation
5. Agent spawning in Node.js environment
6. Timeout behavior with slow agents

## Architecture Notes

### Hybrid Coordination
- **Memory Mode**: When TRIGGER_API_URL not set, uses EventEmitter + Map
- **Trigger.dev Mode**: Spawns runs via API, waits for webhooks
- **Fallback**: Automatically reverts to memory if API fails

### Event Flow
```
Agent Spawn Request
  ↓
├─ Trigger.dev API (if available)
│  └─ Webhook → registerAgentComplete()
└─ Memory Mode (fallback)
  └─ Direct event registration
  ↓
Event Queue Storage
  ↓
Promise Resolution
```

### Type System Design
- Use `RunStatusType` for literal union types
- Discriminated unions for event payloads
- Generic webhook handlers for extensibility
- Optional fields for API responses

## Dependencies

**Required:**
- express (for webhooks)
- node:events (for EventEmitter)
- node:crypto (for HMAC)
- @types/node (recommended for TypeScript)

**Optional:**
- @trigger.dev/sdk (for enhanced integration)

## Next Steps

1. **Runtime Testing**: Execute all marked RUNTIME_TEST scenarios
2. **Integration**: Mount webhooks in API server
3. **Documentation**: Add to API documentation
4. **Monitoring**: Add logging for webhook events
5. **Metrics**: Track run status distribution
6. **Error Tracking**: Integrate with error reporting service

## Notes

- All code includes JSDoc comments for API documentation
- TODO markers indicate runtime testing requirements
- Singleton pattern available for coordinator instance management
- No external trigger.dev SDK dependency required
- Compatible with existing CFN Loop coordination system
