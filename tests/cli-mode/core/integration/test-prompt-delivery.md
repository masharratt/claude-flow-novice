# CLI Mode Prompt Delivery Integration Test

## Test File
`tests/cli-mode/core/integration/test-prompt-delivery.sh`

## Purpose
Validates the CLI mode agent completion signaling protocol through Redis coordination.

## Test Category
**Integration Test** - Validates component interaction (agent → Redis → coordinator)

## Test Coverage

### 1. Coordination Infrastructure Validation
- Redis CLI availability check
- Redis server connectivity test
- Mock agent process creation
- Background agent simulation

### 2. Completion Signal Reception
- BLPOP blocking on completion key: `cfn-completion:${TASK_ID}`
- Timeout handling (10 seconds)
- Signal reception confirmation
- Multi-line output parsing

### 3. Signal Format Validation
- JSON structure validation
- Required field presence:
  - `agentId` - Agent identifier
  - `taskId` - Task identifier (must match expected)
  - `status` - Completion status
  - `confidence` - Numeric confidence score (0.0-1.0)
  - `timestamp` - ISO 8601 timestamp
  - `metadata` - Optional metadata object
- Field type validation
- TaskId matching verification

### 4. Timeout Handling
- Validates timeout behavior for non-existent completion signals
- Expected timeout: 2-5 seconds (tested with 3s timeout)
- Confirms BLPOP timeout mechanism works correctly

## Mock Agent Protocol

The test uses a mock agent that simulates real agent behavior:

```bash
# Mock agent sends completion signal after 3 seconds
{
  "agentId": "mock-agent-$$",
  "taskId": "$TASK_ID",
  "status": "completed",
  "confidence": 0.95,
  "timestamp": "2025-11-24T05:58:54Z",
  "metadata": {
    "testCase": "prompt-delivery",
    "duration": 3
  }
}
```

## Prerequisites
- Redis server running on port 6379 (configurable via `CFN_REDIS_PORT`)
- `redis-cli` command available
- `jq` command available (for JSON parsing)

## Execution

### Direct Execution
```bash
./tests/cli-mode/core/integration/test-prompt-delivery.sh
```

### Via Test Runner
```bash
# Run all integration tests
./tests/cli-mode/run-all-tests.sh --integration

# Run all tests
./tests/cli-mode/run-all-tests.sh --full
```

## Expected Output

```
Starting CLI Mode Completion Signaling Protocol Test
Task ID: test-prompt-delivery-12345-1763963772
Redis Port: 6379
Timeout: 10s

▶ GIVEN CLI coordination infrastructure is available
ℹ ✓ redis-cli available
ℹ ✓ Redis server accessible

▶ WHEN creating mock agent that sends completion signal
▶ THEN mock agent process starts successfully
ℹ ✓ Mock agent running (PID: 12345)

▶ GIVEN agent is running with task
▶ WHEN waiting for completion signal on Redis key: cfn-completion:test-prompt-delivery-12345-1763963772
▶ THEN completion signal is received within timeout
ℹ ✓ Completion signal received

▶ GIVEN completion signal was received
▶ WHEN parsing signal metadata
▶ THEN signal contains valid JSON with required fields
ℹ ✓ Signal is valid JSON
ℹ ✓ agentId present: mock-agent-12345
ℹ ✓ taskId matches: test-prompt-delivery-12345-1763963772
ℹ ✓ status present: completed
ℹ ✓ confidence valid: 0.95
ℹ ✓ All required metadata fields validated

▶ GIVEN a new task with very short timeout
▶ WHEN waiting on non-existent completion signal with 3s timeout
▶ THEN timeout occurs within expected range (2-5 seconds)
ℹ ✓ Timeout handling works correctly (3s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ ALL TESTS PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test Summary:
  - Coordination infrastructure: ✓
  - Completion signal reception: ✓
  - Signal format validation: ✓
  - Timeout handling: ✓
```

## Success Criteria

All test cases must pass:
1. ✅ Redis infrastructure available and accessible
2. ✅ Mock agent spawns successfully
3. ✅ Completion signal received within 10 seconds
4. ✅ Signal contains valid JSON with all required fields
5. ✅ TaskId in signal matches expected value
6. ✅ Timeout mechanism works correctly

## Runtime
- **Expected:** 10-15 seconds
- **Mock agent delay:** 3 seconds
- **Timeout test:** 3 seconds
- **Cleanup:** 1-2 seconds

## Cleanup
- Kills mock agent process if still running
- Removes Redis keys: `cfn-completion:${TASK_ID}`
- Runs automatically via `trap cleanup EXIT`

## Integration with Test Suite

Automatically discovered by `run-all-tests.sh`:
- Pattern: `tests/cli-mode/core/integration/test-*.sh`
- Execution mode: `--integration` or `--full`
- Test runner: Bash-based with structured output

## Why This Test Matters

### Production Code Coverage
This test validates the core coordination protocol used by ALL CLI mode agents:
- Agent completion signaling
- Redis-based coordination
- JSON message format
- Blocking wait mechanism (BLPOP)

### Anti-Pattern Prevention
Prevents "consensus on vapor" scenarios by:
- Validating signal format before processing
- Ensuring taskId matching
- Testing timeout behavior
- Confirming cleanup on exit

### Complements Existing Tests
- **test-redis-coordination.sh**: Tests basic Redis operations
- **test-coordinator-spawning.sh**: Tests coordinator spawning
- **test-orchestrator-workflow.sh**: Tests orchestrator logic
- **This test**: Tests agent → Redis → coordinator signaling

## Related Documentation
- `tests/cli-mode/core/CLAUDE.md` - Core test standards
- `tests/CLAUDE.md` - Global test authoring standards
- `.claude/skills/cfn-coordination/SKILL.md` - Coordination protocol
- `docs/CFN_LOOP_ARCHITECTURE.md` - CFN Loop architecture

## Maintenance
- Test uses mock agent (no real agent spawning required)
- Minimal dependencies (Redis, jq)
- Fast execution (<15 seconds)
- Idempotent (can run multiple times)
- Clean cleanup (no artifacts left behind)
