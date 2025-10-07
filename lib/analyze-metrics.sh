#!/usr/bin/env bash
# Metrics Analysis Tool v1.0
# Parse and analyze JSONL metrics for CLI coordination monitoring
set -euo pipefail

# Configuration
METRICS_FILE="${METRICS_FILE:-/dev/shm/cfn-metrics.jsonl}"

# Color codes for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Check if metrics file exists
if [[ ! -f "$METRICS_FILE" ]]; then
    echo -e "${RED}Error: Metrics file not found: $METRICS_FILE${NC}"
    exit 1
fi

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
    echo -e "${RED}Error: jq is required for metrics analysis${NC}"
    echo "Install jq: sudo apt-get install jq (Ubuntu) or brew install jq (macOS)"
    exit 1
fi

# Count total metrics
TOTAL_METRICS=$(wc -l < "$METRICS_FILE")

if [[ $TOTAL_METRICS -eq 0 ]]; then
    echo -e "${YELLOW}No metrics found in $METRICS_FILE${NC}"
    exit 0
fi

# Display analysis banner
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}        CLI COORDINATION METRICS ANALYSIS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Metrics File:${NC} $METRICS_FILE"
echo -e "${BLUE}Total Entries:${NC} $TOTAL_METRICS"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Analyze metrics by type (aggregated statistics)
echo -e "${GREEN}📊 METRICS BY TYPE (Aggregated Statistics)${NC}"
echo ""

jq -s '
  group_by(.metric) |
  map({
    metric: .[0].metric,
    count: length,
    unit: .[0].unit,
    avg: (map(.value) | add / length | . * 100 | round / 100),
    min: (map(.value) | min),
    max: (map(.value) | max),
    p50: (map(.value) | sort | .[length / 2 | floor]),
    p95: (map(.value) | sort | .[length * 0.95 | floor]),
    p99: (map(.value) | sort | .[length * 0.99 | floor])
  }) |
  sort_by(.metric)
' "$METRICS_FILE" | jq -r '
  .[] |
  "\u001b[1;36m\(.metric)\u001b[0m (\(.unit)):",
  "  Count:  \(.count)",
  "  Avg:    \(.avg)",
  "  Min:    \(.min)",
  "  Max:    \(.max)",
  "  P50:    \(.p50)",
  "  P95:    \(.p95)",
  "  P99:    \(.p99)",
  ""
'

# Time series analysis (show trend over time)
echo ""
echo -e "${GREEN}📈 TIME SERIES ANALYSIS (Recent Trends)${NC}"
echo ""

# Get last 10 metrics entries with timestamps
jq -s '
  .[-10:] |
  map({
    time: (.timestamp | split("T")[1] | split(".")[0]),
    metric: .metric,
    value: .value,
    unit: .unit
  })
' "$METRICS_FILE" | jq -r '
  .[] |
  "\u001b[0;34m[\(.time)]\u001b[0m \u001b[1;33m\(.metric)\u001b[0m: \(.value) \(.unit)"
'

# Performance threshold analysis
echo ""
echo -e "${GREEN}⚡ PERFORMANCE THRESHOLD ANALYSIS${NC}"
echo ""

# Coordination time: target <100ms
COORD_TIME_VIOLATIONS=$(jq -s '
  [.[] | select(.metric == "coordination.time" and .value > 100)] | length
' "$METRICS_FILE")

echo -e "${BLUE}Coordination Time (target: <100ms):${NC}"
if [[ $COORD_TIME_VIOLATIONS -eq 0 ]]; then
    echo -e "  ${GREEN}✓${NC} All within threshold"
else
    echo -e "  ${RED}✗${NC} $COORD_TIME_VIOLATIONS violations detected"
fi

# Delivery rate: target ≥90%
DELIVERY_RATE_VIOLATIONS=$(jq -s '
  [.[] | select(.metric == "coordination.delivery_rate" and .value < 90)] | length
' "$METRICS_FILE")

echo -e "${BLUE}Delivery Rate (target: ≥90%):${NC}"
if [[ $DELIVERY_RATE_VIOLATIONS -eq 0 ]]; then
    echo -e "  ${GREEN}✓${NC} All within threshold"
else
    echo -e "  ${RED}✗${NC} $DELIVERY_RATE_VIOLATIONS violations detected"
fi

# Consensus score: target ≥90%
CONSENSUS_VIOLATIONS=$(jq -s '
  [.[] | select(.metric == "consensus.score" and .value < 90)] | length
' "$METRICS_FILE")

echo -e "${BLUE}Consensus Score (target: ≥90%):${NC}"
if [[ $CONSENSUS_VIOLATIONS -eq 0 ]]; then
    echo -e "  ${GREEN}✓${NC} All within threshold"
else
    echo -e "  ${RED}✗${NC} $CONSENSUS_VIOLATIONS violations detected"
fi

# Confidence score: target ≥75%
CONFIDENCE_VIOLATIONS=$(jq -s '
  [.[] | select(.metric == "agent.confidence" and .value < 75)] | length
' "$METRICS_FILE")

echo -e "${BLUE}Agent Confidence (target: ≥75%):${NC}"
if [[ $CONFIDENCE_VIOLATIONS -eq 0 ]]; then
    echo -e "  ${GREEN}✓${NC} All within threshold"
else
    echo -e "  ${RED}✗${NC} $CONFIDENCE_VIOLATIONS violations detected"
fi

# Tag-based analysis (breakdown by tags)
echo ""
echo -e "${GREEN}🏷️  TAG-BASED BREAKDOWN${NC}"
echo ""

# Analyze by phase (if tags.phase exists)
PHASE_BREAKDOWN=$(jq -s '
  [.[] | select(.tags.phase != null)] |
  group_by(.tags.phase) |
  map({
    phase: .[0].tags.phase,
    count: length,
    avg_value: (map(.value) | add / length | . * 100 | round / 100)
  })
' "$METRICS_FILE")

if [[ "$PHASE_BREAKDOWN" != "[]" ]]; then
    echo -e "${BLUE}By Phase:${NC}"
    echo "$PHASE_BREAKDOWN" | jq -r '
      .[] |
      "  \(.phase): \(.count) metrics (avg: \(.avg_value))"
    '
fi

# Analyze by agent (if tags.agent exists)
AGENT_BREAKDOWN=$(jq -s '
  [.[] | select(.tags.agent != null)] |
  group_by(.tags.agent) |
  map({
    agent: .[0].tags.agent,
    count: length,
    avg_confidence: (map(select(.metric == "agent.confidence").value) | if length > 0 then (add / length | . * 100 | round / 100) else 0 end)
  })
' "$METRICS_FILE")

if [[ "$AGENT_BREAKDOWN" != "[]" ]]; then
    echo ""
    echo -e "${BLUE}By Agent:${NC}"
    echo "$AGENT_BREAKDOWN" | jq -r '
      .[] |
      "  \(.agent): \(.count) metrics (avg confidence: \(.avg_confidence)%)"
    '
fi

# Footer
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Analysis complete at $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
