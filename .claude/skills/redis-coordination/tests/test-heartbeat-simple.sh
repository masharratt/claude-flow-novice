#!/usr/bin/env bash

##############################################################################
# Simple Heartbeat Monitoring Test
# Validates core heartbeat detection functionality
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDIS_COORDINATION_DIR="$(dirname "$SCRIPT_DIR")"

# Test configuration
TASK_ID="test-hb-$(date +%s)"

# Source functions
source "$REDIS_COORDINATION_DIR/heartbeat-functions.sh"

echo "=========================================="
echo "Simple Heartbeat Test"
echo "Task ID: $TASK_ID"
echo "=========================================="

##############################################################################
# Test 1: Active heartbeat detected
##############################################################################
echo ""
echo "Test 1: Active heartbeat detection"
AGENT1="agent-alive"
HB_KEY="swarm:${TASK_ID}:${AGENT1}:heartbeat"

redis-cli SET "$HB_KEY" '{"timestamp": 1234567890, "status": "working"}' >/dev/null
redis-cli EXPIRE "$HB_KEY" 60 >/dev/null

if check_agent_heartbeat "$AGENT1" "$TASK_ID"; then
  echo "✓ PASS: Active heartbeat detected"
else
  echo "✗ FAIL: Active heartbeat not detected"
fi

##############################################################################
# Test 2: Missing heartbeat detected
##############################################################################
echo ""
echo "Test 2: Missing heartbeat detection"
AGENT2="agent-dead"

if ! check_agent_heartbeat "$AGENT2" "$TASK_ID"; then
  echo "✓ PASS: Missing heartbeat detected"
else
  echo "✗ FAIL: Missing heartbeat should have been detected"
fi

##############################################################################
# Test 3: Counter increments
##############################################################################
echo ""
echo "Test 3: Missed heartbeat counter"
AGENT3="agent-flaky"

# Initialize required variables
LOOP3_FAILED_AGENTS=()
LOOP2_FAILED_AGENTS=()
LOOP3_COMPLETED_AGENTS=()
LOOP2_COMPLETED_AGENTS=()
MIN_QUORUM_LOOP3=1
MIN_QUORUM_LOOP2=1
LOOP3_TOTAL=1
LOOP2_TOTAL=1
LOOP3_AGENTS="$AGENT3"
LOOP2_AGENTS=""

# Check twice (agent has no heartbeat)
check_heartbeats_loop "$TASK_ID" "test" "$AGENT3" 2>/dev/null || true
check_heartbeats_loop "$TASK_ID" "test" "$AGENT3" 2>/dev/null || true

if [ "${MISSED_HEARTBEATS[$AGENT3]:-0}" -eq 2 ]; then
  echo "✓ PASS: Counter incremented correctly to 2"
else
  echo "✗ FAIL: Counter should be 2, got ${MISSED_HEARTBEATS[$AGENT3]:-0}"
fi

##############################################################################
# Test 4: Counter resets on recovery
##############################################################################
echo ""
echo "Test 4: Counter reset on recovery"
AGENT4="agent-recover"

# Initialize
LOOP3_AGENTS="$AGENT4"

# Miss twice
check_heartbeats_loop "$TASK_ID" "test" "$AGENT4" 2>/dev/null || true
check_heartbeats_loop "$TASK_ID" "test" "$AGENT4" 2>/dev/null || true

BEFORE="${MISSED_HEARTBEATS[$AGENT4]:-0}"

# Set heartbeat
HB_KEY4="swarm:${TASK_ID}:${AGENT4}:heartbeat"
redis-cli SET "$HB_KEY4" '{"timestamp": 1234567890, "status": "recovered"}' >/dev/null

# Check again
check_heartbeats_loop "$TASK_ID" "test" "$AGENT4" 2>/dev/null || true

AFTER="${MISSED_HEARTBEATS[$AGENT4]:-0}"

if [ "$BEFORE" -eq 2 ] && [ "$AFTER" -eq 0 ]; then
  echo "✓ PASS: Counter reset from 2 to 0 on recovery"
else
  echo "✗ FAIL: Counter should reset (before=$BEFORE, after=$AFTER)"
fi

##############################################################################
# Cleanup
##############################################################################
echo ""
echo "Cleaning up..."
redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true

echo ""
echo "=========================================="
echo "Tests complete"
echo "=========================================="
