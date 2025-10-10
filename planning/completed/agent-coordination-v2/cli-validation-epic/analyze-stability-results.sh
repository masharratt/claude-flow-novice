#!/bin/bash
# Stability Test Results Analysis Tool
# Purpose: Extract insights from stability test metrics

set -euo pipefail

readonly METRICS_FILE="${1:-stability-metrics.jsonl}"
readonly SUMMARY_FILE="${2:-stability-summary.json}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check files exist
if [[ ! -f "$METRICS_FILE" ]]; then
  echo -e "${RED}Error: Metrics file not found: $METRICS_FILE${NC}"
  exit 1
fi

if [[ ! -f "$SUMMARY_FILE" ]]; then
  echo -e "${YELLOW}Warning: Summary file not found, generating analysis from metrics only${NC}"
fi

echo "=========================================="
echo "Stability Test Results Analysis"
echo "=========================================="
echo ""

# Basic statistics
echo "Test Overview:"
total_cycles=$(wc -l < "$METRICS_FILE")
echo "  Total Cycles: ${total_cycles}"
first_ts=$(head -1 "$METRICS_FILE" | jq -r '.timestamp')
last_ts=$(tail -1 "$METRICS_FILE" | jq -r '.timestamp')
echo "  Start Time: ${first_ts}"
echo "  End Time: ${last_ts}"
echo ""

# Memory analysis
echo "Memory Analysis:"
first_rss=$(head -1 "$METRICS_FILE" | jq -r '.memory_rss_kb')
last_rss=$(tail -1 "$METRICS_FILE" | jq -r '.memory_rss_kb')
avg_rss=$(jq -s 'map(.memory_rss_kb) | add / length' "$METRICS_FILE")
max_rss=$(jq -s 'map(.memory_rss_kb) | max' "$METRICS_FILE")
min_rss=$(jq -s 'map(.memory_rss_kb) | min' "$METRICS_FILE")

memory_growth=0
if [[ $first_rss -gt 0 ]]; then
  memory_growth=$(echo "scale=2; (($last_rss - $first_rss) / $first_rss) * 100" | bc -l)
fi

echo "  First RSS: ${first_rss} KB"
echo "  Last RSS: ${last_rss} KB"
echo "  Average RSS: ${avg_rss} KB"
echo "  Min RSS: ${min_rss} KB"
echo "  Max RSS: ${max_rss} KB"
echo -e "  Growth: ${memory_growth}% $(echo "$memory_growth < 10" | bc -l | grep -q 1 && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
echo ""

# File descriptor analysis
echo "File Descriptor Analysis:"
first_fd=$(head -1 "$METRICS_FILE" | jq -r '.fd_count')
last_fd=$(tail -1 "$METRICS_FILE" | jq -r '.fd_count')
avg_fd=$(jq -s 'map(.fd_count) | add / length' "$METRICS_FILE")
max_fd=$(jq -s 'map(.fd_count) | max' "$METRICS_FILE")
fd_growth=$((last_fd - first_fd))

echo "  First FD Count: ${first_fd}"
echo "  Last FD Count: ${last_fd}"
echo "  Average FD Count: ${avg_fd}"
echo "  Max FD Count: ${max_fd}"
echo -e "  Growth: ${fd_growth} $([ $fd_growth -le 10 ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
echo ""

# Coordination time analysis
echo "Coordination Time Analysis:"
avg_coord=$(jq -s 'map(.coordination_time_ms) | add / length' "$METRICS_FILE")
min_coord=$(jq -s 'map(.coordination_time_ms) | min' "$METRICS_FILE")
max_coord=$(jq -s 'map(.coordination_time_ms) | max' "$METRICS_FILE")
p50_coord=$(jq -s 'map(.coordination_time_ms) | sort | .[floor(length * 0.50)]' "$METRICS_FILE")
p95_coord=$(jq -s 'map(.coordination_time_ms) | sort | .[floor(length * 0.95)]' "$METRICS_FILE")
p99_coord=$(jq -s 'map(.coordination_time_ms) | sort | .[floor(length * 0.99)]' "$METRICS_FILE")

variance=0
if [[ $(echo "$avg_coord > 0" | bc -l) -eq 1 ]]; then
  variance=$(echo "scale=2; (($max_coord - $min_coord) / $avg_coord) * 100" | bc -l)
fi

echo "  Average: ${avg_coord} ms"
echo "  Min: ${min_coord} ms"
echo "  Max: ${max_coord} ms"
echo "  P50 (median): ${p50_coord} ms"
echo "  P95: ${p95_coord} ms"
echo "  P99: ${p99_coord} ms"
echo -e "  Variance: ${variance}% $(echo "$variance < 20" | bc -l | grep -q 1 && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
echo ""

# tmpfs usage analysis
echo "tmpfs Usage Analysis:"
max_tmpfs=$(jq -s 'map(.tmpfs_used_kb) | max' "$METRICS_FILE")
min_tmpfs=$(jq -s 'map(.tmpfs_used_kb) | min' "$METRICS_FILE")
avg_tmpfs=$(jq -s 'map(.tmpfs_used_kb) | add / length' "$METRICS_FILE")
tmpfs_avail=$(tail -1 "$METRICS_FILE" | jq -r '.tmpfs_avail_kb')

echo "  Min Usage: ${min_tmpfs} KB"
echo "  Max Usage: ${max_tmpfs} KB"
echo "  Average Usage: ${avg_tmpfs} KB"
echo "  Available: ${tmpfs_avail} KB"
echo ""

# Generate CSV exports for plotting
echo "Generating CSV exports for plotting..."
jq -r '[.cycle, .memory_rss_kb] | @csv' "$METRICS_FILE" > memory-trend.csv
jq -r '[.cycle, .fd_count] | @csv' "$METRICS_FILE" > fd-trend.csv
jq -r '[.cycle, .coordination_time_ms] | @csv' "$METRICS_FILE" > coordination-trend.csv
echo "  ✓ memory-trend.csv"
echo "  ✓ fd-trend.csv"
echo "  ✓ coordination-trend.csv"
echo ""

# Overall verdict
echo "=========================================="
echo "Overall Verdict"
echo "=========================================="

mem_ok=$(echo "$memory_growth < 10" | bc -l)
fd_ok=$([ $fd_growth -le 10 ] && echo 1 || echo 0)
var_ok=$(echo "$variance < 20" | bc -l)

if [[ $mem_ok -eq 1 && $fd_ok -eq 1 && $var_ok -eq 1 ]]; then
  echo -e "${GREEN}PASS: All acceptance criteria met${NC}"
  echo "System is stable over test duration."
  echo "Recommendation: GO FOR PRODUCTION"
else
  echo -e "${RED}FAIL: Stability issues detected${NC}"
  echo "Failed criteria:"
  [[ $mem_ok -eq 0 ]] && echo "  - Memory growth >10%"
  [[ $fd_ok -eq 0 ]] && echo "  - FD leak detected (growth >10)"
  [[ $var_ok -eq 0 ]] && echo "  - Coordination variance >20%"
  echo "Recommendation: NO-GO - Remediation required"
fi
echo ""

echo "Detailed metrics: ${METRICS_FILE}"
echo "CSV exports: memory-trend.csv, fd-trend.csv, coordination-trend.csv"
echo "=========================================="
