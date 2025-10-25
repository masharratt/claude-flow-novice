#!/bin/bash
# Mesh Pattern: Many:1 Aggregation Coordination
# Use Case: Multiple agents complete independently, one agent waits for ALL
# Pattern: Hybrid LPUSH (first waiter) + SET (additional readers)

set -e

TASK_ID="demo:mesh"
TIMEOUT=300  # 5 minutes

echo "=== Mesh Pattern Demo (Many:1 Aggregation) ==="
echo "Scenario: [Coder, Tester, Reviewer] → Validator"
echo ""

# Cleanup previous demo data
echo "Cleaning up previous demo data..."
redis-cli del "${TASK_ID}:coder:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coder:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:tester:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:tester:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:reviewer:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:reviewer:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:validator:result" > /dev/null 2>&1 || true

# Simulate Coder Agent (runs in background)
(
  echo "[Coder] Implementing authentication feature..."
  sleep 2

  RESULT='{
    "agent": "coder",
    "confidence": 0.86,
    "filesModified": ["auth.js", "auth.test.js"],
    "linesAdded": 245,
    "status": "complete"
  }'

  # Hybrid pattern: LPUSH for first waiter, SET for additional readers
  redis-cli lpush "${TASK_ID}:coder:done" "$RESULT" > /dev/null
  redis-cli set "${TASK_ID}:coder:result" "$RESULT" > /dev/null
  redis-cli expire "${TASK_ID}:coder:result" 3600 > /dev/null  # 1 hour TTL

  echo "[Coder] Implementation complete, published results"
) &

# Simulate Tester Agent (runs in background)
(
  echo "[Tester] Running test suite..."
  sleep 3

  RESULT='{
    "agent": "tester",
    "confidence": 0.92,
    "testsRun": 45,
    "testsPassed": 45,
    "coverage": 0.94,
    "status": "complete"
  }'

  # Hybrid pattern: LPUSH + SET
  redis-cli lpush "${TASK_ID}:tester:done" "$RESULT" > /dev/null
  redis-cli set "${TASK_ID}:tester:result" "$RESULT" > /dev/null
  redis-cli expire "${TASK_ID}:tester:result" 3600 > /dev/null

  echo "[Tester] Tests complete (45/45 passed, 94% coverage)"
) &

# Simulate Reviewer Agent (runs in background)
(
  echo "[Reviewer] Reviewing code quality..."
  sleep 2.5

  RESULT='{
    "agent": "reviewer",
    "confidence": 0.88,
    "issuesFound": 2,
    "severity": "low",
    "recommendations": ["Add input validation", "Improve error messages"],
    "status": "complete"
  }'

  # Hybrid pattern: LPUSH + SET
  redis-cli lpush "${TASK_ID}:reviewer:done" "$RESULT" > /dev/null
  redis-cli set "${TASK_ID}:reviewer:result" "$RESULT" > /dev/null
  redis-cli expire "${TASK_ID}:reviewer:result" 3600 > /dev/null

  echo "[Reviewer] Review complete (2 low-severity issues)"
) &

# Validator: Wait for ALL three agents (first uses BLPOP, rest use GET)
echo "[Validator] Waiting for coder, tester, and reviewer to complete..."

# First agent: Use BLPOP (blocking wait)
CODER_DATA=$(timeout $TIMEOUT redis-cli --csv blpop "${TASK_ID}:coder:done" 0 2>/dev/null || echo "")
if [ -z "$CODER_DATA" ]; then
  echo "[Validator] ERROR: Coder timeout after ${TIMEOUT}s"
  exit 1
fi
echo "[Validator] ✓ Coder complete"

# Second agent: Use GET (non-blocking, from persistent SET)
TESTER_DATA=""
for i in {1..60}; do
  TESTER_DATA=$(redis-cli get "${TASK_ID}:tester:result" 2>/dev/null || echo "")
  if [ -n "$TESTER_DATA" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TESTER_DATA" ]; then
  echo "[Validator] ERROR: Tester timeout after 60s"
  exit 1
fi
echo "[Validator] ✓ Tester complete"

# Third agent: Use GET (non-blocking, from persistent SET)
REVIEWER_DATA=""
for i in {1..60}; do
  REVIEWER_DATA=$(redis-cli get "${TASK_ID}:reviewer:result" 2>/dev/null || echo "")
  if [ -n "$REVIEWER_DATA" ]; then
    break
  fi
  sleep 1
done

if [ -z "$REVIEWER_DATA" ]; then
  echo "[Validator] ERROR: Reviewer timeout after 60s"
  exit 1
fi
echo "[Validator] ✓ Reviewer complete"

# Wait for all background jobs to complete
wait

echo ""
echo "[Validator] All agents complete, aggregating results..."

# Calculate aggregate confidence (simple average)
echo "[Validator] Aggregate confidence: ~0.89 (coder: 0.86, tester: 0.92, reviewer: 0.88)"

VALIDATION_RESULT='{
  "agent": "validator",
  "status": "validated",
  "aggregateConfidence": 0.89,
  "summary": "All components validated successfully"
}'

redis-cli set "${TASK_ID}:validator:result" "$VALIDATION_RESULT" > /dev/null
redis-cli expire "${TASK_ID}:validator:result" 3600 > /dev/null

echo ""
echo "=== Mesh Pattern Complete ==="
echo "✅ Three agents completed independently in parallel"
echo "✅ Validator successfully aggregated all results"
echo "✅ Hybrid LPUSH+SET pattern prevented BLPOP message loss"
echo ""
echo "Key Pattern:"
echo "  1. Each agent: LPUSH (for first waiter) + SET (for additional readers)"
echo "  2. Validator: BLPOP for first agent, GET for remaining agents"
echo "  3. SET keys have 1-hour expiry for cleanup"
echo ""

# Cleanup
redis-cli del "${TASK_ID}:coder:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:coder:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:tester:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:tester:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:reviewer:done" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:reviewer:result" > /dev/null 2>&1 || true
redis-cli del "${TASK_ID}:validator:result" > /dev/null 2>&1 || true
