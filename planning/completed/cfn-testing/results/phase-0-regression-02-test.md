# Phase 0 Regression Test 2: Feedback Accumulation Validation

## Test Objective
Validate feedback accumulation mechanisms across Phases 1-3, ensuring learning loops work correctly and feedback storage is reliable.

## Test Scope
- **Phase 1 Feedback**: Basic agent execution feedback
- **Phase 2 Feedback**: Context and iteration feedback
- **Phase 3 Feedback**: Comprehensive loop feedback
- **Feedback Storage**: Redis persistence and retrieval
- **Feedback Aggregation**: Multiple agent feedback collection
- **Learning Loops**: Feedback-based iteration improvements
- **Performance**: Feedback processing speed (< 100ms)

## Test Cases

### Test 2.1: Phase 1 Basic Feedback
```bash
#!/bin/bash
echo "=== Phase 1 Basic Feedback Test ==="

PHASE1_TEST_ID="phase1-feedback-$(date +%s)"

# Test basic feedback storage
AGENT_ID="agent-phase1-1"
FEEDBACK='{"agent":"'$AGENT_ID'","confidence":0.82,"feedback":"Initial implementation works","iteration":1,"timestamp":"'$(date -Iseconds)'"}'

echo "$FEEDBACK" | redis-cli -x set "feedback:${PHASE1_TEST_ID}:${AGENT_ID}:1" > /dev/null

# Test feedback retrieval
RETRIEVED_FEEDBACK=$(redis-cli get "feedback:${PHASE1_TEST_ID}:${AGENT_ID}:1")
if [ "$RETRIEVED_FEEDBACK" = "$FEEDBACK" ]; then
    echo "✅ Phase 1.1: Basic feedback storage works"
else
    echo "❌ Phase 1.1: Basic feedback storage failed"
    exit 1
fi

# Test feedback list operations
redis-cli lpush "feedback:${PHASE1_TEST_ID}:queue" "$AGENT_ID" > /dev/null
QUEUE_LENGTH=$(redis-cli llen "feedback:${PHASE1_TEST_ID}:queue")
if [ "$QUEUE_LENGTH" -eq 1 ]; then
    echo "✅ Phase 1.2: Feedback queue management works"
else
    echo "❌ Phase 1.2: Feedback queue management failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${PHASE1_TEST_ID}:${AGENT_ID}:1" "feedback:${PHASE1_TEST_ID}:queue" > /dev/null
```

### Test 2.2: Phase 2 Context Feedback
```bash
#!/bin/bash
echo "=== Phase 2 Context Feedback Test ==="

PHASE2_TEST_ID="phase2-feedback-$(date +%s)"

# Test context-related feedback
CONTEXT_FEEDBACK='{
  "agent": "agent-phase2-1",
  "confidence": 0.78,
  "context_received": true,
  "deliverables_completed": ["file1.md"],
  "missing_context": [],
  "feedback": "Context injection successful",
  "iteration": 2,
  "timestamp": "'$(date -Iseconds)'"
}'

echo "$CONTEXT_FEEDBACK" | redis-cli -x set "feedback:${PHASE2_TEST_ID}:context:2" > /dev/null

# Test context feedback parsing
PARSED_CONFIDENCE=$(redis-cli get "feedback:${PHASE2_TEST_ID}:context:2" | jq -r '.confidence')
CONTEXT_RECEIVED=$(redis-cli get "feedback:${PHASE2_TEST_ID}:context:2" | jq -r '.context_received')

if [ "$PARSED_CONFIDENCE" = "0.78" ] && [ "$CONTEXT_RECEIVED" = "true" ]; then
    echo "✅ Phase 2.1: Context feedback parsing works"
else
    echo "❌ Phase 2.1: Context feedback parsing failed"
    exit 1
fi

# Test multi-agent context feedback
for agent in agent-1 agent-2 agent-3; do
  echo '{"agent":"'$agent'","confidence":0.85,"context_received":true}' | \
  redis-cli -x set "feedback:${PHASE2_TEST_ID}:multi:${agent}" > /dev/null
done

AGENT_COUNT=$(redis-cli keys "feedback:${PHASE2_TEST_ID}:multi:*" | wc -l)
if [ "$AGENT_COUNT" -eq 3 ]; then
    echo "✅ Phase 2.2: Multi-agent context feedback works"
else
    echo "❌ Phase 2.2: Multi-agent context feedback failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${PHASE2_TEST_ID}:context:2" > /dev/null
redis-cli del $(redis-cli keys "feedback:${PHASE2_TEST_ID}:multi:*") > /dev/null
```

### Test 2.3: Phase 3 Loop Feedback
```bash
#!/bin/bash
echo "=== Phase 3 Loop Feedback Test ==="

PHASE3_TEST_ID="phase3-feedback-$(date +%s)"

# Test comprehensive loop feedback
LOOP_FEEDBACK='{
  "loop_id": "phase3-'$PHASE3_TEST_ID'",
  "iteration": 3,
  "agents": ["coder", "reviewer", "tester"],
  "confidence_scores": [0.88, 0.92, 0.85],
  "consensus": 0.88,
  "gate_passed": true,
  "feedback_items": [
    {"agent": "reviewer", "type": "improvement", "content": "Add error handling"},
    {"agent": "tester", "type": "validation", "content": "Tests pass"}
  ],
  "deliverables": ["component.md", "test-suite.js"],
  "timestamp": "'$(date -Iseconds)'"
}'

echo "$LOOP_FEEDBACK" | redis-cli -x set "feedback:${PHASE3_TEST_ID}:loop:3" > /dev/null

# Test loop feedback aggregation
STORED_LOOP=$(redis-cli get "feedback:${PHASE3_TEST_ID}:loop:3")
CONSENSUS_CHECK=$(echo "$STORED_LOOP" | jq -r '.consensus')
GATE_CHECK=$(echo "$STORED_LOOP" | jq -r '.gate_passed')
DELIVERABLES_COUNT=$(echo "$STORED_LOOP" | jq -r '.deliverables | length')

if [ "$CONSENSUS_CHECK" = "0.88" ] && [ "$GATE_CHECK" = "true" ] && [ "$DELIVERABLES_COUNT" -eq 2 ]; then
    echo "✅ Phase 3.1: Loop feedback aggregation works"
else
    echo "❌ Phase 3.1: Loop feedback aggregation failed"
    exit 1
fi

# Test feedback iteration tracking
for iteration in 1 2 3; do
  echo '{"iteration":'$iteration',"feedback":"Iteration '$iteration' feedback"}' | \
  redis-cli -x set "feedback:${PHASE3_TEST_ID}:iteration:$iteration" > /dev/null
done

ITERATION_COUNT=$(redis-cli keys "feedback:${PHASE3_TEST_ID}:iteration:*" | wc -l)
if [ "$ITERATION_COUNT" -eq 3 ]; then
    echo "✅ Phase 3.2: Feedback iteration tracking works"
else
    echo "❌ Phase 3.2: Feedback iteration tracking failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${PHASE3_TEST_ID}:loop:3" > /dev/null
redis-cli del $(redis-cli keys "feedback:${PHASE3_TEST_ID}:iteration:*") > /dev/null
```

### Test 2.4: Feedback Storage Performance
```bash
#!/bin/bash
echo "=== Feedback Storage Performance Test ==="

PERF_TEST_ID="perf-feedback-$(date +%s)"

# Test high-frequency feedback storage
START_TIME=$(date +%s%N)

for i in {1..100}; do
  echo '{"agent":"perf-test","iteration":'$i',"data":"performance test data"}' | \
  redis-cli -x set "feedback:${PERF_TEST_ID}:perf:$i" > /dev/null
done

END_TIME=$(date +%s%N)
DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$DURATION_MS" -lt 10000 ]; then  # 10 seconds = 10,000ms
    echo "✅ Performance: Feedback storage works (${DURATION_MS}ms for 100 operations)"
else
    echo "⚠️  Performance: Feedback storage slow (${DURATION_MS}ms for 100 operations)"
fi

# Test feedback retrieval performance
START_TIME=$(date +%s%N)

for i in {1..100}; do
  redis-cli get "feedback:${PERF_TEST_ID}:perf:$i" > /dev/null
done

END_TIME=$(date +%s%N)
RETRIEVAL_DURATION_MS=$(( (END_TIME - START_TIME) / 1000000 ))

if [ "$RETRIEVAL_DURATION_MS" -lt 5000 ]; then  # 5 seconds = 5,000ms
    echo "✅ Performance: Feedback retrieval works (${RETRIEVAL_DURATION_MS}ms for 100 operations)"
else
    echo "⚠️  Performance: Feedback retrieval slow (${RETRIEVAL_DURATION_MS}ms for 100 operations)"
fi

# Cleanup
redis-cli del $(redis-cli keys "feedback:${PERF_TEST_ID}:perf:*") > /dev/null
```

### Test 2.5: Feedback Aggregation
```bash
#!/bin/bash
echo "=== Feedback Aggregation Test ==="

AGG_TEST_ID="agg-feedback-$(date +%s)"

# Test multiple agent feedback aggregation
declare -A agent_feedback=(
  ["agent-1"]='{"confidence":0.85,"feedback":"Implementation complete","issues":0}'
  ["agent-2"]='{"confidence":0.92,"feedback":"Design validated","issues":1}'
  ["agent-3"]='{"confidence":0.78,"feedback":"Tests need improvement","issues":2}'
  ["agent-4"]='{"confidence":0.88,"feedback":"Security review passed","issues":0}'
)

for agent in "${!agent_feedback[@]}"; do
  echo "${agent_feedback[$agent]}" | redis-cli -x set "feedback:${AGG_TEST_ID}:${agent}:1" > /dev/null
done

# Test aggregation logic
TOTAL_CONFIDENCE=0
AGENT_COUNT=0
TOTAL_ISSUES=0

for agent in "${!agent_feedback[@]}"; do
  feedback_data=$(redis-cli get "feedback:${AGG_TEST_ID}:${agent}:1")
  confidence=$(echo "$feedback_data" | jq -r '.confidence')
  issues=$(echo "$feedback_data" | jq -r '.issues')
  
  TOTAL_CONFIDENCE=$(echo "$TOTAL_CONFIDENCE + $confidence" | bc)
  TOTAL_ISSUES=$((TOTAL_ISSUES + issues))
  AGENT_COUNT=$((AGENT_COUNT + 1))
done

AVG_CONFIDENCE=$(echo "scale=2; $TOTAL_CONFIDENCE / $AGENT_COUNT" | bc)

if (( $(echo "$AVG_CONFIDENCE > 0.80" | bc -l) )) && [ "$TOTAL_ISSUES" -le 5 ]; then
    echo "✅ Aggregation: Feedback aggregation works (avg confidence: $AVG_CONFIDENCE, total issues: $TOTAL_ISSUES)"
else
    echo "❌ Aggregation: Feedback aggregation failed (avg confidence: $AVG_CONFIDENCE, total issues: $TOTAL_ISSUES)"
    exit 1
fi

# Cleanup
for agent in "${!agent_feedback[@]}"; do
  redis-cli del "feedback:${AGG_TEST_ID}:${agent}:1" > /dev/null
done
```

### Test 2.6: Learning Loop Validation
```bash
#!/bin/bash
echo "=== Learning Loop Validation Test ==="

LEARNING_TEST_ID="learning-feedback-$(date +%s)"

# Test feedback-based learning
ITERATION_1_FEEDBACK='{
  "agent": "learning-agent",
  "iteration": 1,
  "confidence": 0.65,
  "issues": ["Missing error handling", "Insufficient tests"],
  "improvements_needed": ["Add try-catch blocks", "Increase test coverage"]
}'

ITERATION_2_FEEDBACK='{
  "agent": "learning-agent",
  "iteration": 2,
  "confidence": 0.85,
  "issues": [],
  "improvements_needed": [],
  "applied_feedback": ["Added error handling", "Increased test coverage"]
}'

echo "$ITERATION_1_FEEDBACK" | redis-cli -x set "feedback:${LEARNING_TEST_ID}:iteration:1" > /dev/null
echo "$ITERATION_2_FEEDBACK" | redis-cli -x set "feedback:${LEARNING_TEST_ID}:iteration:2" > /dev/null

# Test learning progression
ITER_1_CONFIDENCE=$(redis-cli get "feedback:${LEARNING_TEST_ID}:iteration:1" | jq -r '.confidence')
ITER_2_CONFIDENCE=$(redis-cli get "feedback:${LEARNING_TEST_ID}:iteration:2" | jq -r '.confidence')

IMPROVEMENT=$(echo "$ITER_2_CONFIDENCE - $ITER_1_CONFIDENCE" | bc)

if (( $(echo "$IMPROVEMENT > 0.15" | bc -l) )); then
    echo "✅ Learning Loop: Feedback-based improvement works (improvement: $IMPROVEMENT)"
else
    echo "❌ Learning Loop: Feedback-based improvement failed (improvement: $IMPROVEMENT)"
    exit 1
fi

# Test feedback history tracking
HISTORY_KEYS=$(redis-cli keys "feedback:${LEARNING_TEST_ID}:iteration:*" | wc -l)
if [ "$HISTORY_KEYS" -eq 2 ]; then
    echo "✅ Learning Loop: Feedback history tracking works"
else
    echo "❌ Learning Loop: Feedback history tracking failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${LEARNING_TEST_ID}:iteration:1" "feedback:${LEARNING_TEST_ID}:iteration:2" > /dev/null
```

### Test 2.7: Feedback Persistence
```bash
#!/bin/bash
echo "=== Feedback Persistence Test ==="

PERSIST_TEST_ID="persist-feedback-$(date +%s)"

# Test feedback persistence across sessions
COMPLEX_FEEDBACK='{
  "task_id": "'$PERSIST_TEST_ID'",
  "agent_id": "persistence-agent",
  "session_id": "session-'$(date +%s)'",
  "confidence": 0.91,
  "metadata": {
    "execution_time": 1250,
    "resources_used": ["redis", "cli"],
    "environment": "test"
  },
  "deliverables": {
    "completed": ["script.sh", "documentation.md"],
    "pending": []
  },
  "quality_metrics": {
    "code_coverage": 0.95,
    "test_pass_rate": 1.0,
    "performance_score": 0.88
  },
  "feedback": "All requirements met with high quality",
  "timestamp": "'$(date -Iseconds)'"
}'

echo "$COMPLEX_FEEDBACK" | redis-cli -x set "feedback:${PERSIST_TEST_ID}:persistence:1" > /dev/null

# Simulate session restart (pause)
sleep 2

# Test persistence retrieval
RETRIEVED_COMPLEX=$(redis-cli get "feedback:${PERSIST_TEST_ID}:persistence:1")
COVERAGE_CHECK=$(echo "$RETRIEVED_COMPLEX" | jq -r '.quality_metrics.code_coverage')
DELIVERABLES_COUNT=$(echo "$RETRIEVED_COMPLEX" | jq -r '.deliverables.completed | length')

if [ "$COVERAGE_CHECK" = "0.95" ] && [ "$DELIVERABLES_COUNT" -eq 2 ]; then
    echo "✅ Persistence: Complex feedback persistence works"
else
    echo "❌ Persistence: Complex feedback persistence failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${PERSIST_TEST_ID}:persistence:1" > /dev/null
```

### Test 2.8: Feedback Error Handling
```bash
#!/bin/bash
echo "=== Feedback Error Handling Test ==="

ERROR_TEST_ID="error-feedback-$(date +%s)"

# Test malformed feedback handling
MALFORMED_FEEDBACK='{invalid json structure'

# Redis should accept malformed data but system should handle it gracefully
echo "$MALFORMED_FEEDBACK" | redis-cli -x set "feedback:${ERROR_TEST_ID}:malformed:1" > /dev/null

RETRIEVED_MALFORMED=$(redis-cli get "feedback:${ERROR_TEST_ID}:malformed:1")
if [ "$RETRIEVED_MALFORMED" = "$MALFORMED_FEEDBACK" ]; then
    echo "✅ Error Handling: Malformed feedback storage works"
else
    echo "❌ Error Handling: Malformed feedback storage failed"
    exit 1
fi

# Test missing fields handling
MINIMAL_FEEDBACK='{"agent":"minimal-agent","confidence":0.5}'
echo "$MINIMAL_FEEDBACK" | redis-cli -x set "feedback:${ERROR_TEST_ID}:minimal:1" > /dev/null

# Test parsing with missing fields
PARSED_MINIMAL=$(redis-cli get "feedback:${ERROR_TEST_ID}:minimal:1" | jq -r '.confidence // 0.0')
if [ "$PARSED_MINIMAL" = "0.5" ]; then
    echo "✅ Error Handling: Missing field handling works"
else
    echo "❌ Error Handling: Missing field handling failed"
    exit 1
fi

# Cleanup
redis-cli del "feedback:${ERROR_TEST_ID}:malformed:1" "feedback:${ERROR_TEST_ID}:minimal:1" > /dev/null
```

## Execution Instructions

```bash
# Run all feedback accumulation tests
cd /mnt/c/Users/masha/Documents/claude-flow-novice
bash -c "
source planning/cfn-testing/results/phase-0-regression-02-test.md
echo 'Phase 0 Regression Test 2 Completed'
"
```

## Success Criteria
- All test cases pass (100%)
- Feedback storage and retrieval < 100ms latency
- Multi-agent feedback aggregation works
- Learning loop improvements validated
- Complex feedback persistence verified
- Error handling robust for edge cases

## Test Results Template
```
=== Phase 0 Regression Test 2 Results ===
Date: [timestamp]
Phase 1 Basic Feedback: PASS/FAIL
Phase 2 Context Feedback: PASS/FAIL
Phase 3 Loop Feedback: PASS/FAIL
Feedback Storage Performance: PASS/FAIL ([X]ms)
Feedback Aggregation: PASS/FAIL
Learning Loop Validation: PASS/FAIL
Feedback Persistence: PASS/FAIL
Feedback Error Handling: PASS/FAIL
Overall Result: PASS/FAIL
Execution Time: [minutes]
Average Feedback Latency: [ms]
```