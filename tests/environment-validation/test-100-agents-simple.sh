#!/bin/bash

# Simplified 100-Agent CLI Coordination Performance Test
# Sequential processing to avoid WSL memory issues

set -euo pipefail

# Configuration
AGENT_COUNT=${AGENT_COUNT:-100}
MESSAGE_DIR="/dev/shm/cli-coord-test-$$"
RESULTS_FILE="/tmp/100-agent-test-results.txt"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "CLI Coordination 100-Agent Performance Test"
echo "========================================="
echo "Agent Count: $AGENT_COUNT"
echo "Message Directory: $MESSAGE_DIR"
echo ""

# Cleanup function
cleanup() {
  rm -rf "$MESSAGE_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# Create message directory structure
mkdir -p "$MESSAGE_DIR/inbox"
mkdir -p "$MESSAGE_DIR/outbox"

# Initialize results
cat > "$RESULTS_FILE" <<EOF
100-Agent Coordination Performance Test Results
Timestamp: $(date -Iseconds)
Agent Count: $AGENT_COUNT
Environment: $(uname -s) $(uname -r)
/dev/shm Size: $(df -h /dev/shm | tail -1 | awk '{print $2}')

PERFORMANCE METRICS:
EOF

# Phase 1: Create agent inboxes
echo -n "Creating agent inboxes... "
SETUP_START=$(date +%s%N)
for i in $(seq 1 $AGENT_COUNT); do
  mkdir -p "$MESSAGE_DIR/inbox/agent-$i"
done
SETUP_END=$(date +%s%N)
SETUP_DURATION_MS=$(( (SETUP_END - SETUP_START) / 1000000 ))
echo -e "${GREEN}DONE${NC} (${SETUP_DURATION_MS}ms)"

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

# Phase 3: Simulate agent processing (sequential)
echo -n "Processing agent responses... "
PROCESS_START=$(date +%s%N)
COMPLETED=0
FAILED=0

for i in $(seq 1 $AGENT_COUNT); do
  inbox="$MESSAGE_DIR/inbox/agent-$i/coordinate.msg"
  outbox="$MESSAGE_DIR/outbox/agent-$i"

  if [ -f "$inbox" ]; then
    # Simulate agent work (read + process + respond)
    msg=$(cat "$inbox" 2>/dev/null || echo "error")
    if [ "$msg" != "error" ]; then
      echo "{\"agent_id\":$i,\"status\":\"completed\",\"timestamp\":\"$(date -Iseconds)\"}" > "$outbox"
      ((COMPLETED++))
    else
      echo "{\"agent_id\":$i,\"status\":\"failed\",\"timestamp\":\"$(date -Iseconds)\"}" > "$outbox"
      ((FAILED++))
    fi
  else
    ((FAILED++))
  fi
done

PROCESS_END=$(date +%s%N)
PROCESS_DURATION_MS=$(( (PROCESS_END - PROCESS_START) / 1000000 ))
echo -e "${GREEN}DONE${NC} (${PROCESS_DURATION_MS}ms)"

# Phase 4: Calculate total coordination time
TOTAL_DURATION_MS=$(( (PROCESS_END - SETUP_START) / 1000000 ))
DELIVERY_RATE=$(awk "BEGIN {printf \"%.2f\", ($COMPLETED / $AGENT_COUNT) * 100}")

# Write results
cat >> "$RESULTS_FILE" <<EOF
  Setup Time:      ${SETUP_DURATION_MS}ms
  Broadcast Time:  ${BROADCAST_DURATION_MS}ms
  Processing Time: ${PROCESS_DURATION_MS}ms
  Total Time:      ${TOTAL_DURATION_MS}ms

AGENT STATISTICS:
  Completed:  $COMPLETED / $AGENT_COUNT
  Failed:     $FAILED
  Delivery Rate: ${DELIVERY_RATE}%

ACCEPTANCE CRITERIA:
EOF

# Display results
echo ""
echo "========================================="
echo "PERFORMANCE RESULTS"
echo "========================================="
echo "Setup Time:      ${SETUP_DURATION_MS}ms"
echo "Broadcast Time:  ${BROADCAST_DURATION_MS}ms"
echo "Processing Time: ${PROCESS_DURATION_MS}ms"
echo "Total Time:      ${TOTAL_DURATION_MS}ms"
echo ""
echo "Agents Completed: $COMPLETED / $AGENT_COUNT"
echo "Agents Failed:    $FAILED"
echo "Delivery Rate:    ${DELIVERY_RATE}%"
echo ""

# Acceptance criteria evaluation
PASS=true

# Criterion 1: Coordination time <10s for 100 agents
echo -n "  "
if [ "$TOTAL_DURATION_MS" -lt 10000 ]; then
  echo -e "${GREEN}✓${NC} Coordination time <10s: PASS (${TOTAL_DURATION_MS}ms)"
  echo "  [PASS] Coordination time <10s (${TOTAL_DURATION_MS}ms)" >> "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Coordination time <10s: FAIL (${TOTAL_DURATION_MS}ms)"
  echo "  [FAIL] Coordination time <10s (${TOTAL_DURATION_MS}ms)" >> "$RESULTS_FILE"
  PASS=false
fi

# Criterion 2: Delivery rate ≥90%
echo -n "  "
if (( $(awk "BEGIN {print ($DELIVERY_RATE >= 90)}") )); then
  echo -e "${GREEN}✓${NC} Delivery rate ≥90%: PASS (${DELIVERY_RATE}%)"
  echo "  [PASS] Delivery rate ≥90% (${DELIVERY_RATE}%)" >> "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Delivery rate ≥90%: FAIL (${DELIVERY_RATE}%)"
  echo "  [FAIL] Delivery rate ≥90% (${DELIVERY_RATE}%)" >> "$RESULTS_FILE"
  PASS=false
fi

# Criterion 3: Zero critical errors
echo -n "  "
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Zero critical errors: PASS"
  echo "  [PASS] Zero critical errors" >> "$RESULTS_FILE"
else
  echo -e "${RED}✗${NC} Zero critical errors: FAIL ($FAILED errors)"
  echo "  [FAIL] Zero critical errors ($FAILED errors)" >> "$RESULTS_FILE"
  PASS=false
fi

echo ""
echo "Results saved to: $RESULTS_FILE"
echo ""

if [ "$PASS" = true ]; then
  echo -e "${GREEN}=========================================${NC}"
  echo -e "${GREEN}ALL ACCEPTANCE CRITERIA PASSED${NC}"
  echo -e "${GREEN}=========================================${NC}"
  echo "" >> "$RESULTS_FILE"
  echo "OVERALL STATUS: PASS" >> "$RESULTS_FILE"
  exit 0
else
  echo -e "${RED}=========================================${NC}"
  echo -e "${RED}SOME ACCEPTANCE CRITERIA FAILED${NC}"
  echo -e "${RED}=========================================${NC}"
  echo "" >> "$RESULTS_FILE"
  echo "OVERALL STATUS: FAIL" >> "$RESULTS_FILE"
  exit 1
fi
