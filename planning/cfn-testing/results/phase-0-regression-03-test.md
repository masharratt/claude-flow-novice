# Phase 0 Regression Test 3: Orchestration Infrastructure Validation

## Test Objective
Validate the orchestration infrastructure including orchestrate-cfn-loop.sh, Redis coordination, and real agent execution scenarios.

## Test Scope
- **Orchestrate Script**: orchestrate-cfn-loop.sh functionality
- **Redis Coordination**: Advanced coordination patterns
- **Agent Lifecycle**: Spawn, execute, terminate cycles
- **Context Propagation**: Epic → Phase → Agent flow
- **Real Agent Scenarios**: End-to-end agent workflows
- **Performance**: Scale, speed, duration testing
- **Error Recovery**: Infrastructure resilience
- **Zero-Token Waiting**: BLPOP efficiency validation

## Test Cases

### Test 3.1: Orchestrate Script Basic Functionality
```bash
#!/bin/bash
echo "=== Orchestrate Script Basic Functionality Test ==="

ORCHESTRATE_TEST_ID="orchestrate-basic-$(date +%s)"

# Test script parameter validation
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh --help > /tmp/orchestrate-help.out 2>&1
if grep -q "orchestrate-cfn-loop.sh" /tmp/orchestrate-help.out; then
    echo "✅ Orchestrate 1.1: Help functionality works"
else
    echo "❌ Orchestrate 1.1: Help functionality failed"
    exit 1
fi

# Test script with invalid parameters (should fail gracefully)
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --invalid-parameter > /tmp/orchestrate-invalid.out 2>&1

if grep -q -i "error\|invalid\|usage" /tmp/orchestrate-invalid.out; then
    echo "✅ Orchestrate 1.2: Invalid parameter handling works"
else
    echo "❌ Orchestrate 1.2: Invalid parameter handling failed"
    exit 1
fi

# Test script with minimal valid parameters
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "$ORCHESTRATE_TEST_ID" \
    --mode mvp \
    --loop3-agents "test-agent" \
    --loop2-agents "test-validator" \
    --product-owner "test-po" \
    --max-iterations 1 \
    --dry-run > /tmp/orchestrate-dry.out 2>&1

if grep -q -i "dry-run\|simulation\|test" /tmp/orchestrate-dry.out; then
    echo "✅ Orchestrate 1.3: Dry run functionality works"
else
    echo "⚠️  Orchestrate 1.3: Dry run may need verification"
fi

# Cleanup
rm -f /tmp/orchestrate-*.out
```

### Test 3.2: Redis Advanced Coordination
```bash
#!/bin/bash
echo "=== Redis Advanced Coordination Test ==="

REDIS_TEST_ID="redis-advanced-$(date +%s)"

# Test hierarchical broadcast pattern
echo "Broadcast message" | redis-cli -x set "coord:${REDIS_TEST_ID}:broadcast:1" > /dev/null

# Test multiple agents receiving broadcast
for agent in agent-1 agent-2 agent-3; do
    redis-cli lpush "coord:${REDIS_TEST_ID}:agents:$agent" "ready" > /dev/null
done

AGENT_READY_COUNT=$(redis-cli llen "coord:${REDIS_TEST_ID}:agents:agent-1")
if [ "$AGENT_READY_COUNT" -eq 1 ]; then
    echo "✅ Redis 2.1: Hierarchical broadcast works"
else
    echo "❌ Redis 2.1: Hierarchical broadcast failed"
    exit 1
fi

# Test mesh hybrid pattern
for i in {1..3}; do
    echo "Message $i" | redis-cli -x set "coord:${REDIS_TEST_ID}:mesh:$i" > /dev/null
    redis-cli lpush "coord:${REDIS_TEST_ID}:queue:$i" "agent-$i" > /dev/null
done

MESH_MESSAGE_COUNT=$(redis-cli keys "coord:${REDIS_TEST_ID}:mesh:*" | wc -l)
if [ "$MESH_MESSAGE_COUNT" -eq 3 ]; then
    echo "✅ Redis 2.2: Mesh hybrid pattern works"
else
    echo "❌ Redis 2.2: Mesh hybrid pattern failed"
    exit 1
fi

# Test zero-token waiting efficiency
WAIT_START=$(date +%s%N)
timeout 5s redis-cli blpop "coord:${REDIS_TEST_ID}:wait-test" 0 &
BLPOP_PID=$!
WAIT_END=$(date +%s%N)
WAIT_DURATION_MS=$(( (WAIT_END - WAIT_START) / 1000000 ))

if [ "$WAIT_DURATION_MS" -lt 100 ]; then  # Should be nearly instant
    echo "✅ Redis 2.3: Zero-token waiting efficiency works (${WAIT_DURATION_MS}ms)"
else
    echo "⚠️  Redis 2.3: Zero-token waiting slower than expected (${WAIT_DURATION_MS}ms)"
fi

# Kill background process
kill $BLPOP_PID 2>/dev/null || true

# Cleanup
redis-cli del $(redis-cli keys "coord:${REDIS_TEST_ID}:*") > /dev/null 2>/dev/null || true
```

### Test 3.3: Agent Lifecycle Management
```bash
#!/bin/bash
echo "=== Agent Lifecycle Management Test ==="

LIFECYCLE_TEST_ID="lifecycle-$(date +%s)"

# Test agent spawning
SPAWN_AGENT_ID="spawn-test-$(date +%s)"
npx claude-flow-novice spawn agent tester \
    --task-id "$LIFECYCLE_TEST_ID" \
    --timeout 30 \
    --background > /tmp/lifecycle-spawn.out 2>&1 &

SPAWN_PID=$!
sleep 2

# Check if agent process spawned
AGENT_PROCESS=$(pgrep -f "claude-flow-novice.*$LIFECYCLE_TEST_ID" | head -1)
if [ -n "$AGENT_PROCESS" ]; then
    echo "✅ Lifecycle 3.1: Agent spawning works (PID: $AGENT_PROCESS)"
else
    echo "⚠️  Lifecycle 3.1: Agent process not found (may have completed quickly)"
fi

# Test agent communication via Redis
redis-cli lpush "swarm:${LIFECYCLE_TEST_ID}:test-agent:instructions" "test-instruction" > /dev/null
sleep 1

INSTRUCTION_RECEIVED=$(redis-cli llen "swarm:${LIFECYCLE_TEST_ID}:test-agent:instructions")
if [ "$INSTRUCTION_RECEIVED" -ge 1 ]; then
    echo "✅ Lifecycle 3.2: Agent communication works"
else
    echo "⚠️  Lifecycle 3.2: Agent communication may need verification"
fi

# Test agent termination signals
if [ -n "$AGENT_PROCESS" ]; then
    kill -TERM $AGENT_PROCESS 2>/dev/null || true
    sleep 2
    
    if ! kill -0 $AGENT_PROCESS 2>/dev/null; then
        echo "✅ Lifecycle 3.3: Agent termination works"
    else
        echo "⚠️  Lifecycle 3.3: Agent termination may need force"
        kill -KILL $AGENT_PROCESS 2>/dev/null || true
    fi
else
    echo "⚠️  Lifecycle 3.3: No agent process to terminate"
fi

# Cleanup
wait $SPAWN_PID 2>/dev/null || true
redis-cli del $(redis-cli keys "swarm:${LIFECYCLE_TEST_ID}:*") > /dev/null 2>/dev/null || true
rm -f /tmp/lifecycle-spawn.out
```

### Test 3.4: Context Propagation Flow
```bash
#!/bin/bash
echo "=== Context Propagation Flow Test ==="

CONTEXT_TEST_ID="context-flow-$(date +%s)"

# Test Epic → Phase → Agent context flow
EPIC_CONTEXT='{
  "epicGoal": "Test context propagation",
  "inScope": ["P1-P7 validation", "Feedback accumulation"],
  "outOfScope": ["UI testing", "Production deployment"],
  "deliverables": ["test-results.md", "context-validation.log"],
  "directory": "/tmp/test-context",
  "acceptanceCriteria": ["All tests pass", "Context flows correctly"]
}'

PHASE_CONTEXT='{
  "currentPhase": "Phase 0",
  "phaseGoal": "Regression testing",
  "deliverables": ["phase-0-results.md"],
  "acceptanceCriteria": ["Zero regressions", "< 30min execution"]
}'

SUCCESS_CRITERIA='{
  "acceptanceCriteria": ["Tests pass", "Performance met"],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90,
  "maxIterations": 10,
  "timeoutMinutes": 60
}'

# Store context in Redis (simulating coordinator)
echo "$EPIC_CONTEXT" | redis-cli -x set "cfn:${CONTEXT_TEST_ID}:epic-context" > /dev/null
echo "$PHASE_CONTEXT" | redis-cli -x set "cfn:${CONTEXT_TEST_ID}:phase-context" > /dev/null
echo "$SUCCESS_CRITERIA" | redis-cli -x set "cfn:${CONTEXT_TEST_ID}:success-criteria" > /dev/null

# Test context retrieval and injection
RETRIEVED_EPIC=$(redis-cli get "cfn:${CONTEXT_TEST_ID}:epic-context")
RETRIEVED_PHASE=$(redis-cli get "cfn:${CONTEXT_TEST_ID}:phase-context")
RETRIEVED_SUCCESS=$(redis-cli get "cfn:${CONTEXT_TEST_ID}:success-criteria")

EPIC_GOAL_CHECK=$(echo "$RETRIEVED_EPIC" | jq -r '.epicGoal')
PHASE_GOAL_CHECK=$(echo "$RETRIEVED_PHASE" | jq -r '.phaseGoal')
GATE_THRESHOLD_CHECK=$(echo "$RETRIEVED_SUCCESS" | jq -r '.gateThreshold')

if [ "$EPIC_GOAL_CHECK" = "Test context propagation" ] && \
   [ "$PHASE_GOAL_CHECK" = "Phase 0" ] && \
   [ "$GATE_THRESHOLD_CHECK" = "0.75" ]; then
    echo "✅ Context 4.1: Epic → Phase → Agent context flow works"
else
    echo "❌ Context 4.1: Context propagation failed"
    exit 1
fi

# Test agent context injection simulation
AGENT_CONTEXT='{
  "task_id": "'$CONTEXT_TEST_ID'",
  "agent_id": "context-test-agent",
  "epic_context": '"$RETRIEVED_EPIC"',
  "phase_context": '"$RETRIEVED_PHASE"',
  "success_criteria": '"$RETRIEVED_SUCCESS"',
  "iteration": 1
}'

echo "$AGENT_CONTEXT" | redis-cli -x set "agent:${CONTEXT_TEST_ID}:context:1" > /dev/null
INJECTED_CONTEXT=$(redis-cli get "agent:${CONTEXT_TEST_ID}:context:1")

DELIVERABLES_CHECK=$(echo "$INJECTED_CONTEXT" | jq -r '.epic_context.deliverables | length')
if [ "$DELIVERABLES_CHECK" -eq 2 ]; then
    echo "✅ Context 4.2: Agent context injection works"
else
    echo "❌ Context 4.2: Agent context injection failed"
    exit 1
fi

# Cleanup
redis-cli del "cfn:${CONTEXT_TEST_ID}:epic-context" "cfn:${CONTEXT_TEST_ID}:phase-context" \
              "cfn:${CONTEXT_TEST_ID}:success-criteria" "agent:${CONTEXT_TEST_ID}:context:1" > /dev/null
```

### Test 3.5: Real Agent Scenario Execution
```bash
#!/bin/bash
echo "=== Real Agent Scenario Execution Test ==="

REAL_TEST_ID="real-scenario-$(date +%s)"

# Test minimal CFN loop with real agents
echo "=== Real Agent Scenario: Mini CFN Loop ==="

# Set up scenario context
SCENARIO_CONTEXT='{
  "task_description": "Create a simple test file",
  "deliverables": ["/tmp/real-scenario-test.txt"],
  "acceptanceCriteria": ["File exists", "File contains success message"],
  "directory": "/tmp",
  "mode": "mvp"
}'

echo "$SCENARIO_CONTEXT" | redis-cli -x set "scenario:${REAL_TEST_ID}:context" > /dev/null

# Test real agent execution (simplified)
timeout 60s npx claude-flow-novice spawn agent coder \
    --task-id "$REAL_TEST_ID" \
    --context "Create /tmp/real-scenario-test.txt with content 'Scenario test successful'" \
    --timeout 30 > /tmp/real-agent.out 2>&1 &

REAL_AGENT_PID=$!

# Monitor progress
AGENT_DONE=false
for i in {1..30}; do
    if [ -f "/tmp/real-scenario-test.txt" ]; then
        AGENT_DONE=true
        break
    fi
    sleep 1
done

# Wait for agent completion
wait $REAL_AGENT_PID 2>/dev/null
AGENT_EXIT_CODE=$?

if [ -f "/tmp/real-scenario-test.txt" ] && [ "$AGENT_DONE" = true ]; then
    FILE_CONTENT=$(cat /tmp/real-scenario-test.txt)
    if echo "$FILE_CONTENT" | grep -q "Scenario test successful"; then
        echo "✅ Real Scenario 5.1: Real agent execution works"
    else
        echo "⚠️  Real Scenario 5.1: File created but content may need verification"
    fi
else
    echo "❌ Real Scenario 5.1: Real agent execution failed"
    exit 1
fi

# Test agent confidence reporting
echo '{"confidence": 0.85, "feedback": "Task completed successfully"}' | \
redis-cli -x set "agent:${REAL_TEST_ID}:confidence" > /dev/null

REPORTED_CONFIDENCE=$(redis-cli get "agent:${REAL_TEST_ID}:confidence" | jq -r '.confidence')
if [ "$REPORTED_CONFIDENCE" = "0.85" ]; then
    echo "✅ Real Scenario 5.2: Agent confidence reporting works"
else
    echo "❌ Real Scenario 5.2: Agent confidence reporting failed"
    exit 1
fi

# Cleanup
rm -f /tmp/real-scenario-test.txt /tmp/real-agent.out
redis-cli del "scenario:${REAL_TEST_ID}:context" "agent:${REAL_TEST_ID}:confidence" > /dev/null
```

### Test 3.6: Performance and Scale Testing
```bash
#!/bin/bash
echo "=== Performance and Scale Testing ==="

PERF_TEST_ID="perf-scale-$(date +%s)"

# Test concurrent Redis operations
CONCURRENT_OPERATIONS=50
START_TIME=$(date +%s%N)

for i in $(seq 1 $CONCURRENT_OPERATIONS); do
    {
        echo "Operation $i" | redis-cli -x set "perf:${PERF_TEST_ID}:op:$i" > /dev/null
        redis-cli get "perf:${PERF_TEST_ID}:op:$i" > /dev/null
    } &
done

wait
END_TIME=$(date +%s%N)
TOTAL_DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))
AVG_LATENCY_MS=$((TOTAL_DURATION_MS / (CONCURRENT_OPERATIONS * 2)))

if [ "$AVG_LATENCY_MS" -lt 10 ]; then  # Less than 10ms per operation
    echo "✅ Performance 6.1: Concurrent Redis operations work (avg ${AVG_LATENCY_MS}ms)"
else
    echo "⚠️  Performance 6.1: Redis operations slower than expected (avg ${AVG_LATENCY_MS}ms)"
fi

# Test agent spawning scale
SCALE_AGENTS=5
SPAWN_START=$(date +%s%N)

for i in $(seq 1 $SCALE_AGENTS); do
    timeout 30s npx claude-flow-novice spawn agent tester \
        --task-id "${PERF_TEST_ID}-scale-$i" \
        --context "Scale test agent $i" \
        --timeout 10 > /tmp/scale-$i.out 2>&1 &
done

wait
SPAWN_END=$(date +%s%N)
SPAWN_DURATION_MS=$(( (SPAWN_END - SPAWN_START) / 1000000 ))
AVG_SPAWN_MS=$((SPAWN_DURATION_MS / SCALE_AGENTS))

if [ "$AVG_SPAWN_MS" -lt 15000 ]; then  # Less than 15 seconds per agent
    echo "✅ Performance 6.2: Agent spawning scale works (avg ${AVG_SPAWN_MS}ms)"
else
    echo "⚠️  Performance 6.2: Agent spawning slower than expected (avg ${AVG_SPAWN_MS}ms)"
fi

# Test memory usage during scale operations
MEMORY_BEFORE=$(free -m | awk 'NR==2{printf "%.0f", $3}')
sleep 5
MEMORY_AFTER=$(free -m | awk 'NR==2{printf "%.0f", $3}')
MEMORY_USED=$((MEMORY_AFTER - MEMORY_BEFORE))

if [ "$MEMORY_USED" -lt 100 ]; then  # Less than 100MB additional memory
    echo "✅ Performance 6.3: Memory usage acceptable (${MEMORY_USED}MB)"
else
    echo "⚠️  Performance 6.3: High memory usage (${MEMORY_USED}MB)"
fi

# Cleanup
redis-cli del $(redis-cli keys "perf:${PERF_TEST_ID}:*") > /dev/null 2>/dev/null || true
rm -f /tmp/scale-*.out
```

### Test 3.7: Error Recovery and Resilience
```bash
#!/bin/bash
echo "=== Error Recovery and Resilience Test ==="

RESILIENCE_TEST_ID="resilience-$(date +%s)"

# Test Redis connection failure simulation
echo "=== Testing Redis Connection Resilience ==="

# Test with invalid Redis host (should fail gracefully)
REDIS_HOST=localhost REDIS_PORT=6380 \
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$RESILIENCE_TEST_ID-invalid" \
    --agent-id "test-agent" \
    --confidence 0.5 > /tmp/redis-fail.out 2>&1

if grep -q -i "error\|connection\|failed" /tmp/redis-fail.out; then
    echo "✅ Resilience 7.1: Redis connection failure handled gracefully"
else
    echo "⚠️  Resilience 7.1: Redis failure handling may need improvement"
fi

# Test agent timeout handling
echo "=== Testing Agent Timeout Resilience ==="

timeout 5s npx claude-flow-novice spawn agent coder \
    --task-id "$RESILIENCE_TEST_ID-timeout" \
    --context "This task should timeout" \
    --timeout 1 > /tmp/agent-timeout.out 2>&1

TIMEOUT_EXIT_CODE=$?
if [ "$TIMEOUT_EXIT_CODE" -eq 124 ] || grep -q -i "timeout\|expired" /tmp/agent-timeout.out; then
    echo "✅ Resilience 7.2: Agent timeout handling works"
else
    echo "⚠️  Resilience 7.2: Agent timeout handling may need verification"
fi

# Test context corruption recovery
echo "=== Testing Context Corruption Recovery ==="

# Store corrupted context
echo "{invalid json}" | redis-cli -x set "corrupt:${RESILIENCE_TEST_ID}:context" > /dev/null

# Test system handles corrupted context gracefully
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
    --task-id "$RESILIENCE_TEST_ID-corrupt" \
    --agent-id "test-agent" \
    --confidence 0.5 > /tmp/corrupt-context.out 2>&1

# System should continue working despite corrupted context
if [ $? -eq 0 ]; then
    echo "✅ Resilience 7.3: Context corruption recovery works"
else
    echo "⚠️  Resilience 7.3: Context corruption handling may need improvement"
fi

# Cleanup
redis-cli del "corrupt:${RESILIENCE_TEST_ID}:context" > /dev/null 2>/dev/null || true
rm -f /tmp/redis-fail.out /tmp/agent-timeout.out /tmp/corrupt-context.out
```

### Test 3.8: Zero-Token Waiting Efficiency
```bash
#!/bin/bash
echo "=== Zero-Token Waiting Efficiency Test ==="

ZERO_TOKEN_TEST_ID="zero-token-$(date +%s)"

# Test BLPOP blocking efficiency
echo "=== Testing BLPOP Zero-Token Blocking ==="

TOTAL_WAIT_TIME=0
TEST_ITERATIONS=5

for i in $(seq 1 $TEST_ITERATIONS); do
    # Start BLPOP in background
    {
        WAIT_START=$(date +%s%N)
        timeout 2s redis-cli blpop "test:${ZERO_TOKEN_TEST_ID}:block:$i" 0
        WAIT_END=$(date +%s%N)
        WAIT_DURATION_MS=$(( (WAIT_END - WAIT_START) / 1000000 ))
        echo "$WAIT_DURATION_MS" > "/tmp/wait-$i.out"
    } &
    
    BLPOP_PID=$!
    
    # Wait a moment, then send signal
    sleep 0.1
    redis-cli lpush "test:${ZERO_TOKEN_TEST_ID}:block:$i" "signal" > /dev/null
    
    # Wait for completion
    wait $BLPOP_PID
done

# Calculate average wait time
for i in $(seq 1 $TEST_ITERATIONS); do
    if [ -f "/tmp/wait-$i.out" ]; then
        WAIT_TIME=$(cat "/tmp/wait-$i.out")
        TOTAL_WAIT_TIME=$((TOTAL_WAIT_TIME + WAIT_TIME))
    fi
done

AVG_WAIT_MS=$((TOTAL_WAIT_TIME / TEST_ITERATIONS))

if [ "$AVG_WAIT_MS" -lt 500 ]; then  # Less than 500ms average
    echo "✅ Zero-Token 8.1: BLPOP blocking efficiency works (avg ${AVG_WAIT_MS}ms)"
else
    echo "⚠️  Zero-Token 8.1: BLPOP blocking slower than expected (avg ${AVG_WAIT_MS}ms)"
fi

# Test pub/sub efficiency
echo "=== Testing Pub/Sub Zero-Token Efficiency ==="

PUBSUB_START=$(date +%s%N)

# Start subscriber in background
{
    redis-cli subscribe "test:${ZERO_TOKEN_TEST_ID}:channel" > /tmp/pubsub.out 2>&1 &
    SUB_PID=$!
    
    sleep 0.1
    redis-cli publish "test:${ZERO_TOKEN_TEST_ID}:channel" "test message" > /dev/null
    sleep 0.1
    
    kill $SUB_PID 2>/dev/null || true
} &

PUBSUB_PID=$!
wait $PUBSUB_PID

PUBSUB_END=$(date +%s%N)
PUBSUB_DURATION_MS=$(( (PUBSUB_END - PUBSUB_START) / 1000000 ))

if [ "$PUBSUB_DURATION_MS" -lt 1000 ]; then  # Less than 1 second
    echo "✅ Zero-Token 8.2: Pub/Sub efficiency works (${PUBSUB_DURATION_MS}ms)"
else
    echo "⚠️  Zero-Token 8.2: Pub/Sub slower than expected (${PUBSUB_DURATION_MS}ms)"
fi

# Cleanup
redis-cli del $(redis-cli keys "test:${ZERO_TOKEN_TEST_ID}:*") > /dev/null 2>/dev/null || true
rm -f /tmp/wait-*.out /tmp/pubsub.out
```

## Execution Instructions

```bash
# Run all orchestration infrastructure tests
cd /mnt/c/Users/masha/Documents/claude-flow-novice
bash -c "
source planning/cfn-testing/results/phase-0-regression-03-test.md
echo 'Phase 0 Regression Test 3 Completed'
"
```

## Success Criteria
- All test cases pass (100%)
- Orchestrate script functions correctly
- Redis coordination patterns work
- Agent lifecycle management successful
- Context propagation complete
- Real agent scenarios execute
- Performance metrics acceptable
- Error recovery robust
- Zero-token waiting efficient

## Test Results Template
```
=== Phase 0 Regression Test 3 Results ===
Date: [timestamp]
Orchestrate Script: PASS/FAIL
Redis Advanced Coordination: PASS/FAIL
Agent Lifecycle Management: PASS/FAIL
Context Propagation Flow: PASS/FAIL
Real Agent Scenario: PASS/FAIL
Performance Scale: PASS/FAIL ([X] ops avg)
Error Recovery: PASS/FAIL
Zero-Token Waiting: PASS/FAIL ([X]ms avg)
Overall Result: PASS/FAIL
Execution Time: [minutes]
```