# Task Tool vs CLI Coordinator Comparison Test

## Test Objective

Compare functional outcomes and insights between:
1. **Task Tool Pattern**: Main Chat → Task(coordinator) → coordinator output returned to Main Chat
2. **CLI Pattern**: Main Chat → CLI coordinator (background) → coordinator writes to Redis/files

## Key Hypothesis

CLI coordinator running in background allows Main Chat to continue working while coordination happens asynchronously. Task tool coordinator blocks Main Chat until completion but provides direct output.

## Test Design

### Test 1: Simple Task Coordination
**Identical Task**: Create 3 test files via 3 agents

**Task Tool Pattern**:
```javascript
// Main Chat blocks until coordinator completes
result = Task("cfn-v3-coordinator", "Create 3 test files...")
// result contains coordinator output directly
```

**CLI Pattern**:
```bash
# Main Chat spawns coordinator in background
npx claude-flow-novice agent cfn-v3-coordinator --task-id test-123 --context "..." &
# Main Chat can continue other work
# Poll Redis for completion: redis-cli GET "swarm:test-123:coordinator-done"
```

### Test 2: Multi-Phase Workflow
**Task**: Implementation → Review (2 phases)

**Metrics to Compare**:
1. **Main Chat availability**: Can Main Chat handle other requests while coordinator runs?
2. **Insight quality**: Do both patterns provide same level of detail?
3. **Error handling**: How do errors surface in each pattern?
4. **Duration**: Total time including Main Chat blocking
5. **Redis footprint**: Number of keys created
6. **Output format**: Structured JSON vs text output

### Test 3: Long-Running Task (CFN Loop with Multiple Iterations)
**Task**: Implement feature requiring 2-3 iterations

**Additional Metrics**:
1. **Main Chat responsiveness**: Can user ask questions while task runs?
2. **Progress visibility**: Can Main Chat query progress mid-execution?
3. **Cancellation**: Can task be cancelled mid-flight?
4. **Resource usage**: Memory/CPU while coordinator runs

## Expected Differences

### Task Tool Pattern
**Pros**:
- Direct output to Main Chat (no Redis parsing needed)
- Automatic error surfacing to user
- Simpler mental model for user

**Cons**:
- Main Chat blocked until completion
- No parallel work possible
- Limited to 10-minute timeout

### CLI Pattern
**Pros**:
- Main Chat available during execution
- No timeout limits (can run hours)
- Parallel task execution possible
- Background monitoring via Redis

**Cons**:
- Requires Redis polling for status
- Errors may be buried in logs
- More complex coordination protocol

## Success Criteria

Test passes if:
1. Both patterns produce identical deliverables
2. CLI pattern allows Main Chat to continue working
3. Task pattern provides direct insights without Redis querying
4. We document clear use-case recommendations for each pattern

## Implementation

See `tests/hello-world/test-task-vs-cli.sh` for test execution script.
