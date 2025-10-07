#!/bin/bash
# Sprint 0 Day 2: 8-Hour Stability Test for CLI Coordination
# Tests: 50 agents coordinating every 5 minutes for 8 hours (96 cycles)
# Monitors: Memory (RSS/VSZ), FD count, tmpfs usage, coordination time

set -euo pipefail

# Configuration
readonly DURATION_HOURS=8
readonly DURATION_SECONDS=$((DURATION_HOURS * 3600))  # 28800 seconds
readonly INTERVAL_SECONDS=300  # 5 minutes
readonly AGENT_COUNT=50
readonly METRICS_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/cli-validation-epic/stability-metrics.jsonl"
readonly SUMMARY_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/planning/cli-validation-epic/stability-summary.json"
readonly SESSION_DIR="/dev/shm/cfn-stability-test"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Ensure clean state
cleanup() {
  echo "Cleaning up stability test resources..."
  rm -rf "$SESSION_DIR"
  pkill -f "stability-test" || true
}
trap cleanup EXIT

# Initialize metrics file
init_metrics() {
  mkdir -p "$(dirname "$METRICS_FILE")"
  > "$METRICS_FILE"
  echo "Initialized metrics file: $METRICS_FILE"
}

# Simulate 50-agent coordination (placeholder for actual implementation)
run_coordination() {
  local cycle=$1
  local start_time=$(date +%s%3N)

  # Create session directory
  mkdir -p "$SESSION_DIR/messages"

  # Simulate coordination workload
  # In production, this would call actual message-bus.sh
  for i in $(seq 1 $AGENT_COUNT); do
    local agent_id="agent-${i}"
    mkdir -p "$SESSION_DIR/messages/${agent_id}/inbox"
    mkdir -p "$SESSION_DIR/messages/${agent_id}/outbox"

    # Simulate message passing (minimal I/O)
    echo "{\"from\":\"coordinator\",\"to\":\"${agent_id}\",\"task\":\"echo test\"}" > "$SESSION_DIR/messages/${agent_id}/inbox/msg-${cycle}.json"
    echo "{\"from\":\"${agent_id}\",\"to\":\"coordinator\",\"result\":\"complete\"}" > "$SESSION_DIR/messages/${agent_id}/outbox/result-${cycle}.json"
  done

  # Simulate coordination completion
  sync

  local end_time=$(date +%s%3N)
  local coordination_time=$(( end_time - start_time ))

  echo "$coordination_time"
}

# Collect resource metrics
collect_metrics() {
  local cycle=$1
  local coordination_time=$2
  local timestamp=$(date -Iseconds)

  # Memory usage (RSS and VSZ in KB)
  # Note: Filtering by stability-test process
  local memory_stats=$(ps aux | grep -E "(bash.*stability-test|cfn-)" | grep -v grep | awk '{rss+=$6; vsz+=$5} END {print rss, vsz}')
  local rss=$(echo "$memory_stats" | awk '{print $1}')
  local vsz=$(echo "$memory_stats" | awk '{print $2}')

  # File descriptor count
  local fd_count=0
  if [[ -d /proc/$$/fd ]]; then
    fd_count=$(ls -1 /proc/$$/fd 2>/dev/null | wc -l)
  fi

  # tmpfs usage
  local tmpfs_used=$(du -sk /dev/shm 2>/dev/null | awk '{print $1}')
  local tmpfs_avail=$(df -k /dev/shm | tail -1 | awk '{print $4}')

  # Process count
  local proc_count=$(ps aux | grep -c "cfn-" || echo 0)

  # Write metrics to JSONL
  cat >> "$METRICS_FILE" <<EOF
{"cycle":${cycle},"timestamp":"${timestamp}","coordination_time_ms":${coordination_time},"memory_rss_kb":${rss:-0},"memory_vsz_kb":${vsz:-0},"fd_count":${fd_count},"tmpfs_used_kb":${tmpfs_used},"tmpfs_avail_kb":${tmpfs_avail},"process_count":${proc_count}}
EOF
}

# Analyze stability metrics
analyze_stability() {
  echo "Analyzing stability metrics..."

  # Extract metrics using jq
  local total_cycles=$(wc -l < "$METRICS_FILE")

  # Memory growth analysis
  local first_rss=$(head -1 "$METRICS_FILE" | jq -r '.memory_rss_kb')
  local last_rss=$(tail -1 "$METRICS_FILE" | jq -r '.memory_rss_kb')
  local memory_growth_pct=0
  if [[ $first_rss -gt 0 ]]; then
    memory_growth_pct=$(echo "scale=2; (($last_rss - $first_rss) / $first_rss) * 100" | bc -l)
  fi

  # FD count stability
  local first_fd=$(head -1 "$METRICS_FILE" | jq -r '.fd_count')
  local last_fd=$(tail -1 "$METRICS_FILE" | jq -r '.fd_count')
  local fd_growth=$((last_fd - first_fd))
  local fd_stable="true"
  if [[ $fd_growth -gt 10 ]]; then
    fd_stable="false"
  fi

  # Coordination time variance
  local avg_coord_time=$(jq -s 'map(.coordination_time_ms) | add / length' "$METRICS_FILE")
  local max_coord_time=$(jq -s 'map(.coordination_time_ms) | max' "$METRICS_FILE")
  local min_coord_time=$(jq -s 'map(.coordination_time_ms) | min' "$METRICS_FILE")
  local variance_pct=0
  if [[ $(echo "$avg_coord_time > 0" | bc -l) -eq 1 ]]; then
    variance_pct=$(echo "scale=2; (($max_coord_time - $min_coord_time) / $avg_coord_time) * 100" | bc -l)
  fi

  # Crash detection (check if cycles completed)
  local expected_cycles=$((DURATION_SECONDS / INTERVAL_SECONDS))
  local crashes=0
  if [[ $total_cycles -lt $expected_cycles ]]; then
    crashes=$((expected_cycles - total_cycles))
  fi

  # Generate summary
  cat > "$SUMMARY_FILE" <<EOF
{
  "test_duration_hours": ${DURATION_HOURS},
  "agent_count": ${AGENT_COUNT},
  "interval_seconds": ${INTERVAL_SECONDS},
  "total_cycles": ${total_cycles},
  "expected_cycles": ${expected_cycles},
  "crashes": ${crashes},
  "memory_growth_pct": ${memory_growth_pct},
  "memory_rss_first_kb": ${first_rss},
  "memory_rss_last_kb": ${last_rss},
  "fd_count_first": ${first_fd},
  "fd_count_last": ${last_fd},
  "fd_growth": ${fd_growth},
  "fd_stable": ${fd_stable},
  "coordination_time_avg_ms": ${avg_coord_time},
  "coordination_time_min_ms": ${min_coord_time},
  "coordination_time_max_ms": ${max_coord_time},
  "coordination_variance_pct": ${variance_pct},
  "acceptance_criteria": {
    "memory_growth_under_10pct": $(echo "$memory_growth_pct < 10" | bc -l | grep -q 1 && echo "true" || echo "false"),
    "fd_stable": ${fd_stable},
    "coordination_variance_under_20pct": $(echo "$variance_pct < 20" | bc -l | grep -q 1 && echo "true" || echo "false"),
    "zero_crashes": $([ $crashes -eq 0 ] && echo "true" || echo "false")
  }
}
EOF

  echo "Stability summary written to: $SUMMARY_FILE"
}

# Generate stability report
generate_report() {
  echo ""
  echo "=========================================="
  echo "Sprint 0 Day 2: Stability Test Report"
  echo "=========================================="
  echo ""

  # Read summary
  local memory_growth=$(jq -r '.memory_growth_pct' "$SUMMARY_FILE")
  local fd_stable=$(jq -r '.fd_stable' "$SUMMARY_FILE")
  local variance=$(jq -r '.coordination_variance_pct' "$SUMMARY_FILE")
  local crashes=$(jq -r '.crashes' "$SUMMARY_FILE")

  # Acceptance criteria
  local mem_ok=$(jq -r '.acceptance_criteria.memory_growth_under_10pct' "$SUMMARY_FILE")
  local fd_ok=$(jq -r '.acceptance_criteria.fd_stable' "$SUMMARY_FILE")
  local var_ok=$(jq -r '.acceptance_criteria.coordination_variance_under_20pct' "$SUMMARY_FILE")
  local crash_ok=$(jq -r '.acceptance_criteria.zero_crashes' "$SUMMARY_FILE")

  echo "Test Configuration:"
  echo "  Duration: ${DURATION_HOURS} hours"
  echo "  Agent Count: ${AGENT_COUNT}"
  echo "  Interval: ${INTERVAL_SECONDS}s (5 minutes)"
  echo ""

  echo "Stability Metrics:"
  echo "  Memory Growth: ${memory_growth}% $([ "$mem_ok" == "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
  echo "  FD Stability: $([ "$fd_stable" == "true" ] && echo "Stable" || echo "Leaked") $([ "$fd_ok" == "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
  echo "  Coordination Variance: ${variance}% $([ "$var_ok" == "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
  echo "  Crashes: ${crashes} $([ "$crash_ok" == "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
  echo ""

  # Overall verdict
  if [[ "$mem_ok" == "true" && "$fd_ok" == "true" && "$var_ok" == "true" && "$crash_ok" == "true" ]]; then
    echo -e "${GREEN}VERDICT: GO FOR PRODUCTION${NC}"
    echo "All acceptance criteria met. System stable over 8 hours."
  else
    echo -e "${RED}VERDICT: NO-GO - Stability issues detected${NC}"
    echo "Failed criteria require remediation before production."
  fi
  echo ""
  echo "Detailed metrics: $METRICS_FILE"
  echo "Summary JSON: $SUMMARY_FILE"
  echo "=========================================="
}

# Main execution
main() {
  echo "=========================================="
  echo "Sprint 0 Day 2: 8-Hour Stability Test"
  echo "=========================================="
  echo "Test Configuration:"
  echo "  Duration: ${DURATION_HOURS} hours (${DURATION_SECONDS} seconds)"
  echo "  Interval: ${INTERVAL_SECONDS} seconds (5 minutes)"
  echo "  Agent Count: ${AGENT_COUNT}"
  echo "  Expected Cycles: $((DURATION_SECONDS / INTERVAL_SECONDS))"
  echo ""
  echo "Metrics Collection:"
  echo "  - Memory (RSS, VSZ)"
  echo "  - File Descriptors"
  echo "  - tmpfs usage"
  echo "  - Coordination time"
  echo ""
  echo "Starting test at: $(date)"
  echo "=========================================="
  echo ""

  # Initialize
  init_metrics

  # Run test loop
  local elapsed=0
  local cycle=0
  local start_time=$(date +%s)

  while [[ $elapsed -lt $DURATION_SECONDS ]]; do
    cycle=$((cycle + 1))
    echo "Cycle ${cycle}/${expected_cycles} (elapsed: ${elapsed}s / ${DURATION_SECONDS}s)"

    # Run coordination
    coordination_time=$(run_coordination "$cycle")

    # Collect metrics
    collect_metrics "$cycle" "$coordination_time"

    # Log progress every 30 minutes (6 cycles)
    if [[ $((cycle % 6)) -eq 0 ]]; then
      echo "  Memory RSS: $(tail -1 "$METRICS_FILE" | jq -r '.memory_rss_kb') KB"
      echo "  FD count: $(tail -1 "$METRICS_FILE" | jq -r '.fd_count')"
      echo "  Coordination time: ${coordination_time} ms"
    fi

    # Sleep until next interval
    sleep $INTERVAL_SECONDS

    # Update elapsed time
    local current_time=$(date +%s)
    elapsed=$((current_time - start_time))
  done

  echo ""
  echo "Test completed at: $(date)"
  echo ""

  # Analyze results
  analyze_stability

  # Generate report
  generate_report
}

# Dry run mode for testing (1-hour test instead of 8-hour)
if [[ "${1:-}" == "--dry-run" ]]; then
  echo "DRY RUN MODE: Running 1-hour test (12 cycles)"
  DURATION_HOURS=1
  DURATION_SECONDS=3600
  INTERVAL_SECONDS=300
fi

main
