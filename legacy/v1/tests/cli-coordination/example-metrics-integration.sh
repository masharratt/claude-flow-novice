#!/bin/bash
# Metrics Integration Example - Sprint 1.1
# Demonstrates metrics emission in a realistic coordination scenario

set -euo pipefail

# Source libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../../lib" && pwd)"
source "$LIB_DIR/metrics.sh"
source "$SCRIPT_DIR/message-bus.sh"

# Configuration
MESSAGE_BASE_DIR="/dev/shm/cfn-metrics-demo/messages"
METRICS_FILE="/dev/shm/cfn-metrics-demo/metrics.jsonl"

echo "========================================"
echo "   Metrics Integration Demo"
echo "   Sprint 1.1 - Phase 1"
echo "========================================"
echo ""

# Cleanup previous run
rm -rf /dev/shm/cfn-metrics-demo
mkdir -p /dev/shm/cfn-metrics-demo

# Initialize message bus
init_message_bus_system

# Scenario: 3-agent coordination with metrics
echo "Scenario: 3-agent coordination with metrics emission"
echo ""

# Initialize agents
agent1="coder-1"
agent2="tester-1"
agent3="reviewer-1"

init_message_bus "$agent1"
init_message_bus "$agent2"
init_message_bus "$agent3"

# Emit agent count metric
emit_agent_count 3 "active"
echo "✓ Emitted agent count: 3 active agents"

# Measure coordination time
start_time=$(date +%s%N)

# Agent 1 sends task to Agent 2
send_message "$agent1" "$agent2" "task-delegation" '{"task":"implement_feature","priority":5}' >/dev/null 2>&1
emit_message_count 1 "sent" "$agent1"
echo "✓ Agent-1 → Agent-2: task-delegation"

# Agent 2 processes and responds
sleep 0.1
send_message "$agent2" "$agent1" "task-result" '{"status":"completed","tests_passed":15}' >/dev/null 2>&1
emit_message_count 1 "sent" "$agent2"
echo "✓ Agent-2 → Agent-1: task-result"

# Agent 1 sends to Agent 3 for review
send_message "$agent1" "$agent3" "review-request" '{"code":"src/feature.js","urgency":"high"}' >/dev/null 2>&1
emit_message_count 1 "sent" "$agent1"
echo "✓ Agent-1 → Agent-3: review-request"

# Agent 3 responds
sleep 0.1
send_message "$agent3" "$agent1" "review-result" '{"approved":true,"comments":2}' >/dev/null 2>&1
emit_message_count 1 "sent" "$agent3"
echo "✓ Agent-3 → Agent-1: review-result"

end_time=$(date +%s%N)
coordination_time_ms=$(( (end_time - start_time) / 1000000 ))

# Emit coordination time metric
emit_coordination_time "$coordination_time_ms" 3 "coordination"
echo "✓ Coordination time: ${coordination_time_ms}ms"
echo ""

# Calculate delivery rate
total_messages=4
delivered_messages=$(message_count "$agent1" "inbox")
delivered_messages=$((delivered_messages + $(message_count "$agent2" "inbox")))
delivered_messages=$((delivered_messages + $(message_count "$agent3" "inbox")))

delivery_rate=$(echo "scale=2; ($delivered_messages / $total_messages) * 100" | bc)
emit_delivery_rate "$delivery_rate" "$total_messages" "$delivered_messages"
echo "✓ Delivery rate: ${delivery_rate}% ($delivered_messages/$total_messages)"
echo ""

# Emit confidence scores for each agent
emit_confidence_score 85 "$agent1" 1
emit_confidence_score 92 "$agent2" 1
emit_confidence_score 88 "$agent3" 1
echo "✓ Confidence scores emitted:"
echo "  - Agent-1: 85%"
echo "  - Agent-2: 92%"
echo "  - Agent-3: 88%"
echo ""

# Emit consensus score (simulated validation)
emit_consensus_score 93 3 "validation"
echo "✓ Consensus score: 93% (3 validators)"
echo ""

# Display metrics summary
echo "========================================"
echo "   METRICS SUMMARY"
echo "========================================"
echo "Metrics file: $METRICS_FILE"
echo "Total entries: $(wc -l < "$METRICS_FILE")"
echo ""

# Analyze metrics (if jq available)
if command -v jq >/dev/null 2>&1; then
    echo "Metrics breakdown:"
    jq -s 'group_by(.metric) | map({metric: .[0].metric, count: length})' "$METRICS_FILE" | jq -r '.[] | "  \(.metric): \(.count) entries"'
    echo ""
fi

# Run analysis tool
echo "Running metrics analysis..."
echo ""
bash "$LIB_DIR/analyze-metrics.sh"

# Run alerting monitor
echo ""
echo "Running alerting monitor..."
echo ""
bash "$LIB_DIR/alerting.sh" monitor

echo ""
echo "========================================"
echo "   Demo Complete"
echo "========================================"
echo "Metrics saved to: $METRICS_FILE"
echo ""
echo "To view metrics:"
echo "  cat $METRICS_FILE | jq ."
echo ""
echo "To analyze metrics:"
echo "  bash $LIB_DIR/analyze-metrics.sh"
echo ""
echo "To monitor alerts:"
echo "  bash $LIB_DIR/alerting.sh monitor"
