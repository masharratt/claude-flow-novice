#!/bin/bash

# 100-Agent CLI Coordination Performance Test
# Tests coordination using /dev/shm for message passing

set -euo pipefail

# Configuration
AGENT_COUNT=${AGENT_COUNT:-100}
MESSAGE_DIR="/dev/shm/cli-coord-test-$$"
RESULTS_FILE="/tmp/100-agent-test-results.json"
TIMEOUT_SECONDS=30

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================="
echo "CLI Coordination 100-Agent Performance Test"
echo "========================================="
echo "Agent Count: $AGENT_COUNT"
echo "Message Directory: $MESSAGE_DIR"
echo "Timeout: ${TIMEOUT_SECONDS}s"
echo ""

# Cleanup function
cleanup() {
  echo "Cleaning up..."
  rm -rf "$MESSAGE_DIR"
  # Kill any background processes
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT

# Create message directory
mkdir -p "$MESSAGE_DIR/inbox"
mkdir -p "$MESSAGE_DIR/outbox"

# Initialize results
cat > "$RESULTS_FILE" <<EOF
{
  "test_name": "100-agent-coordination",
  "agent_count": $AGENT_COUNT,
  "timestamp": "$(date -Iseconds)",
  "environment": {
    "shm_size": "$(df -h /dev/shm | tail -1 | awk '{print $2}')",
    "platform": "$(uname -s)",
    "kernel": "$(uname -r)"
  }
}
EOF

# Simulated agent worker function
agent_worker() {
  local agent_id=$1
  local inbox="$MESSAGE_DIR/inbox/agent-$agent_id"
  local outbox="$MESSAGE_DIR/outbox/agent-$agent_id"

  # Create agent inbox
  mkdir -p "$inbox"

  # Agent lifecycle: receive message, process, respond
  local start_time=$(date +%s%N)

  # Wait for coordination message
  local timeout_ns=$((TIMEOUT_SECONDS * 1000000000))
  local elapsed=0
  while [ ! -f "$inbox/coordinate.msg" ] && [ $elapsed -lt $timeout_ns ]; do
    sleep 0.001  # 1ms poll interval
    elapsed=$(( $(date +%s%N) - start_time ))
  done

  if [ -f "$inbox/coordinate.msg" ]; then
    # Process message (simulate work)
    local msg=$(cat "$inbox/coordinate.msg")

    # Respond with acknowledgment
    echo "{\"agent_id\":$agent_id,\"status\":\"completed\",\"received\":\"$msg\",\"timestamp\":\"$(date -Iseconds)\"}" > "$outbox"

    # Calculate response time
    local end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))

    exit 0
  else
    # Timeout
    echo "{\"agent_id\":$agent_id,\"status\":\"timeout\",\"timestamp\":\"$(date -Iseconds)\"}" > "$outbox"
    exit 1
  fi
}

export -f agent_worker
export MESSAGE_DIR TIMEOUT_SECONDS

# Phase 1: Spawn agents
echo -n "Spawning $AGENT_COUNT agents... "
SPAWN_START=$(date +%s%N)

for i in $(seq 1 $AGENT_COUNT); do
  agent_worker $i &
done

SPAWN_END=$(date +%s%N)
SPAWN_DURATION_MS=$(( (SPAWN_END - SPAWN_START) / 1000000 ))
echo -e "${GREEN}DONE${NC} (${SPAWN_DURATION_MS}ms)"

# Phase 2: Broadcast coordination message
echo -n "Broadcasting coordination message... "
BROADCAST_START=$(date +%s%N)

COORD_MSG='{"type":"coordinate","task":"test","priority":"high"}'
for i in $(seq 1 $AGENT_COUNT); do
  echo "$COORD_MSG" > "$MESSAGE_DIR/inbox/agent-$i/coordinate.msg"
done

BROADCAST_END=$(date +%s%N)
BROADCAST_DURATION_MS=$(( (BROADCAST_END - BROADCAST_START) / 1000000 ))
echo -e "${GREEN}DONE${NC} (${BROADCAST_DURATION_MS}ms)"

# Phase 3: Wait for responses
echo -n "Waiting for agent responses... "
RESPONSE_START=$(date +%s%N)

# Wait for all agents to respond or timeout
wait

RESPONSE_END=$(date +%s%N)
RESPONSE_DURATION_MS=$(( (RESPONSE_END - RESPONSE_START) / 1000000 ))
echo -e "${GREEN}DONE${NC} (${RESPONSE_DURATION_MS}ms)"

# Phase 4: Collect results
echo "Collecting results..."
COMPLETED=0
TIMEOUT_COUNT=0
FAILED=0

for i in $(seq 1 $AGENT_COUNT); do
  outbox="$MESSAGE_DIR/outbox/agent-$i"
  if [ -f "$outbox" ]; then
    status=$(jq -r '.status' "$outbox" 2>/dev/null || echo "unknown")
    case "$status" in
      completed)
        ((COMPLETED++))
        ;;
      timeout)
        ((TIMEOUT_COUNT++))
        ;;
      *)
        ((FAILED++))
        ;;
    esac
  else
    ((FAILED++))
  fi
done

# Calculate metrics
TOTAL_DURATION_MS=$(( (RESPONSE_END - SPAWN_START) / 1000000 ))
DELIVERY_RATE=$(awk "BEGIN {printf \"%.2f\", ($COMPLETED / $AGENT_COUNT) * 100}")

# Update results file
jq --arg spawn "$SPAWN_DURATION_MS" \
   --arg broadcast "$BROADCAST_DURATION_MS" \
   --arg response "$RESPONSE_DURATION_MS" \
   --arg total "$TOTAL_DURATION_MS" \
   --arg completed "$COMPLETED" \
   --arg timeout "$TIMEOUT_COUNT" \
   --arg failed "$FAILED" \
   --arg delivery "$DELIVERY_RATE" \
   '.results = {
      spawn_duration_ms: ($spawn|tonumber),
      broadcast_duration_ms: ($broadcast|tonumber),
      response_duration_ms: ($response|tonumber),
      total_duration_ms: ($total|tonumber),
      agents_completed: ($completed|tonumber),
      agents_timeout: ($timeout|tonumber),
      agents_failed: ($failed|tonumber),
      delivery_rate_percent: ($delivery|tonumber)
    }' \
   "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"

# Display results
echo ""
echo "========================================="
echo "PERFORMANCE RESULTS"
echo "========================================="
echo "Spawn Time:      ${SPAWN_DURATION_MS}ms"
echo "Broadcast Time:  ${BROADCAST_DURATION_MS}ms"
echo "Response Time:   ${RESPONSE_DURATION_MS}ms"
echo "Total Time:      ${TOTAL_DURATION_MS}ms"
echo ""
echo "Agents Completed: $COMPLETED / $AGENT_COUNT"
echo "Agents Timeout:   $TIMEOUT_COUNT"
echo "Agents Failed:    $FAILED"
echo "Delivery Rate:    ${DELIVERY_RATE}%"
echo ""

# Acceptance criteria evaluation
PASS=true

# Criterion 1: Coordination time <10s for 100 agents
if [ "$TOTAL_DURATION_MS" -lt 10000 ]; then
  echo -e "${GREEN}✓${NC} Coordination time <10s: PASS (${TOTAL_DURATION_MS}ms)"
  jq '.acceptance_criteria.coordination_time = "PASS"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Coordination time <10s: FAIL (${TOTAL_DURATION_MS}ms)"
  jq '.acceptance_criteria.coordination_time = "FAIL"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  PASS=false
fi

# Criterion 2: Delivery rate ≥90%
if (( $(awk "BEGIN {print ($DELIVERY_RATE >= 90)}") )); then
  echo -e "${GREEN}✓${NC} Delivery rate ≥90%: PASS (${DELIVERY_RATE}%)"
  jq '.acceptance_criteria.delivery_rate = "PASS"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Delivery rate ≥90%: FAIL (${DELIVERY_RATE}%)"
  jq '.acceptance_criteria.delivery_rate = "FAIL"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  PASS=false
fi

# Criterion 3: Zero critical errors
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Zero critical errors: PASS"
  jq '.acceptance_criteria.zero_errors = "PASS"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Zero critical errors: FAIL ($FAILED errors)"
  jq '.acceptance_criteria.zero_errors = "FAIL"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  PASS=false
fi

echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""

if [ "$PASS" = true ]; then
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}ALL ACCEPTANCE CRITERIA PASSED${NC}"
  echo -e "${GREEN}=========================================${NC}"
  jq '.overall_status = "PASS"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  exit 0
else
  echo -e "${RED}=========================================${NC}"
  echo -e "${RED}SOME ACCEPTANCE CRITERIA FAILED${NC}"
  echo -e "${RED}=========================================${NC}"
  jq '.overall_status = "FAIL"' "$RESULTS_FILE" > "$RESULTS_FILE.tmp" && mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
  exit 1
fi
