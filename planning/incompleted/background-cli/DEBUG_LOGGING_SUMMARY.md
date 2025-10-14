# Debug Logging Summary - Message Flow Tracing

## Objective
Trace message flow from Redis pub/sub to handler execution to identify where messages are getting dropped in the processing pipeline.

## Files Modified

### 1. `tests/hello-world/lib/dormant-coordinator-base.js`

#### Handler Registration (Constructor)
- **Line 78-85**: Log when base message handlers are registered
- Outputs: List of registered handlers (`request`, `response`, `error`, `heartbeat`)

#### Redis Subscriptions (initialize method)
- **Line 106-164**: Comprehensive logging for Redis subscription setup
- Logs:
  - Raw Redis messages received (channel, message length, preview)
  - Successful JSON parsing
  - Failed parsing with error details
  - Confirmation of each channel subscription

#### Message Reception (handleIncomingMessage)
- **Line 187-195**: Log all incoming Redis messages
- Details logged:
  - `from`, `to`, `type`, `task`
  - Presence of `signature` and `correlationId`
  - Timestamp

#### Handler Lookup
- **Line 203-223**: Log handler lookup process
- Shows:
  - Task name and message type being looked up
  - List of all available handlers
  - Whether handler was found
  - Handler type (function/undefined)
  - Routing method used (type or task)

#### Handler Execution
- **Line 225-243**: Log handler execution lifecycle
- Tracks:
  - Start of execution
  - Successful completion
  - Errors with stack traces

#### Response Handler (handleResponse)
- **Line 395-442**: Detailed response handling logging
- Tracks:
  - Response received notification
  - Correlation ID lookup
  - Pending request count
  - Current state
  - Request found/not found
  - Response data storage
  - State transitions (paused → active)

### 2. `tests/hello-world/coordinators/impl-coordinator.js`

#### Handler Registration (setupImplHandlers)
- **Line 46-54**: Log implementation-specific handler setup
- Shows handlers before and after registration

#### Generate Request Handler (handleGenerateRequest)
- **Line 141-174**: Comprehensive request handling logging
- Logs:
  - Handler invocation
  - Message details (id, type, task, correlationId, from, data)
  - Queue size before/after adding request
  - Total requests queued

#### Review Response Handler (handleReviewResponse)
- **Line 179-195**: Log review response routing
- Shows:
  - Response received notification
  - Message details
  - Delegation to base response handler

#### Request Processing (processRequest)
- **Line 201-215**: Log request processing lifecycle
- Tracks:
  - Request details (id, task, correlationId, from, state)
  - Task filtering
  - Processing start

#### File Generation and Review Flow
- **Line 226-255**: Log review request/response cycle
- Tracks:
  - Files generated notification
  - Review request preparation
  - Correlation ID assignment
  - Entering pauseAndWait
  - Review response received
  - Error file counts

## Debug Output Format

All debug logs follow this format:
```
[CoordinatorID] [DEBUG] Context: { key: value, ... }
```

## Key Debugging Points

1. **Message Reception**: Verify messages arrive on Redis channels
2. **Message Parsing**: Confirm JSON parsing succeeds
3. **Handler Lookup**: Check if handlers are found for message type/task
4. **Handler Execution**: Verify handlers are actually invoked
5. **Response Correlation**: Ensure responses match pending requests
6. **State Transitions**: Track coordinator state changes during pause/resume

## Usage

Run the hello-world test with these logs enabled to trace the complete message flow:
```bash
node tests/hello-world/src/main.js
```

All debug logs will be prefixed with `[DEBUG]` and can be filtered with:
```bash
node tests/hello-world/src/main.js 2>&1 | grep DEBUG
```

## Expected Log Sequence

For a successful request/response cycle:

1. **Orchestrator sends request**
2. **ImplCoordinator receives message** → `[DEBUG] Raw Redis message received`
3. **Message parsed** → `[DEBUG] Parsed message successfully`
4. **Handler lookup** → `[DEBUG] Handler found`
5. **Handler execution** → `[DEBUG] Executing handler for task: generate`
6. **Request queued** → `[DEBUG] Request queued`
7. **Request processed** → `[DEBUG] processRequest called`
8. **Review request sent** → `[DEBUG] Sending review request`
9. **Pause and wait** → `[DEBUG] Entering pauseAndWait`
10. **Review response received** → `[DEBUG] handleResponse called`
11. **State transition** → `[DEBUG] Transitioning from paused to active`
12. **Processing complete** → `[DEBUG] Review response received`

## Troubleshooting

If messages are dropped, check for:
- Missing handler registration logs
- Handler lookup showing no available handlers
- Message type/task mismatch
- Correlation ID not found in pending requests
- State not transitioning properly (stuck in paused)
