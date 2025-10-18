#!/bin/bash
# Manual test for race condition fix (SEC-002)
# Tests that concurrent completion attempts are handled atomically

set -e

CLI="node .claude-flow-novice/dist/src/cli/main.js"
TEST_DB="./test-race-sec002.db"
AGENT_ID="race-test-$(date +%s)"

export AGENT_LIFECYCLE_DB="$TEST_DB"

# Clean up
rm -f "$TEST_DB"

echo "🧪 SEC-002: Race Condition Fix Test"
echo "===================================="
echo ""

# Spawn agent
echo "1. Spawning agent: $AGENT_ID"
$CLI agent-lifecycle spawn --id "$AGENT_ID" --type coder --acl-level 1
echo ""

# Attempt concurrent completions
echo "2. Testing concurrent completion attempts..."
$CLI agent-lifecycle complete --id "$AGENT_ID" --confidence 0.85 --output "First attempt" > /tmp/complete1.log 2>&1 &
PID1=$!
$CLI agent-lifecycle complete --id "$AGENT_ID" --confidence 0.90 --output "Second attempt" > /tmp/complete2.log 2>&1 &
PID2=$!

# Wait for both
wait $PID1
EXIT1=$?
wait $PID2
EXIT2=$?

echo ""
echo "3. Results:"
echo "   Process 1 exit code: $EXIT1"
echo "   Process 2 exit code: $EXIT2"
echo ""

# Check results
if [ $EXIT1 -eq 0 ] && [ $EXIT2 -eq 1 ]; then
  echo "✅ Test PASSED: First succeeded, second failed (as expected)"
  cat /tmp/complete2.log | grep -q "already completed" && echo "   ✓ Correct error message"
  SUCCESS=1
elif [ $EXIT1 -eq 1 ] && [ $EXIT2 -eq 0 ]; then
  echo "✅ Test PASSED: Second succeeded, first failed (as expected)"
  cat /tmp/complete1.log | grep -q "already completed" && echo "   ✓ Correct error message"
  SUCCESS=1
elif [ $EXIT1 -eq 0 ] && [ $EXIT2 -eq 0 ]; then
  echo "❌ Test FAILED: Both completions succeeded (race condition still exists)"
  echo "   Output 1:"
  cat /tmp/complete1.log
  echo "   Output 2:"
  cat /tmp/complete2.log
  SUCCESS=0
else
  echo "❌ Test FAILED: Both completions failed (unexpected)"
  echo "   Output 1:"
  cat /tmp/complete1.log
  echo "   Output 2:"
  cat /tmp/complete2.log
  SUCCESS=0
fi

echo ""
echo "4. Verifying database state..."
LIFECYCLE_STATUS=$($CLI agent-lifecycle status --id "$AGENT_ID" --json)
echo "$LIFECYCLE_STATUS" | jq .
COMPLETE_COUNT=$(echo "$LIFECYCLE_STATUS" | jq '.events | map(select(.event_type == "complete")) | length')
echo "   Complete events: $COMPLETE_COUNT"

if [ "$COMPLETE_COUNT" -eq 1 ]; then
  echo "   ✅ Only one completion event recorded"
else
  echo "   ❌ Multiple completion events recorded (expected 1, got $COMPLETE_COUNT)"
  SUCCESS=0
fi

# Clean up
rm -f "$TEST_DB" /tmp/complete1.log /tmp/complete2.log

echo ""
if [ $SUCCESS -eq 1 ]; then
  echo "🎉 SEC-002 Fix Verified: Race condition resolved!"
  exit 0
else
  echo "❌ SEC-002 Fix Failed: Race condition still present!"
  exit 1
fi
