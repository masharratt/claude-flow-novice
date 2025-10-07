#!/usr/bin/env bash
# tests/cli-coordination/example-health-integration.sh
# Example integration demonstrating health check system usage
# Phase 1 Sprint 1.2: Health Checks & Liveness

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$(cd "$SCRIPT_DIR/../../lib" && pwd)"

# Use temporary directory for this example
export HEALTH_DIR="/tmp/example-health-$$"
export HEALTH_TIMEOUT="10"
export HEALTH_CHECK_INTERVAL="3"

# Load health library
source "$LIB_DIR/health.sh"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

# Cleanup on exit
cleanup() {
  log_info "Cleaning up example environment..."

  # Stop all liveness probes
  for agent_dir in "$HEALTH_DIR"/*; do
    [ -d "$agent_dir" ] || continue
    local agent_id=$(basename "$agent_dir")
    stop_liveness_probe "$agent_id" >/dev/null 2>&1 || true
  done

  # Remove health data
  rm -rf "$HEALTH_DIR"

  log_info "Cleanup complete"
}

trap cleanup EXIT

# ==============================================================================
# EXAMPLE 1: Basic Health Reporting
# ==============================================================================

example_basic_health() {
  echo ""
  echo "=========================================="
  echo "Example 1: Basic Health Reporting"
  echo "=========================================="
  echo ""

  log_info "Reporting health for 5 agents..."

  # Create agents with different statuses
  report_health "agent-web-1" "healthy" '{"service":"web","port":8080}'
  report_health "agent-web-2" "healthy" '{"service":"web","port":8081}'
  report_health "agent-db-1" "degraded" '{"service":"database","reason":"high_latency"}'
  report_health "agent-cache-1" "healthy" '{"service":"cache","memory_mb":512}'
  report_health "agent-worker-1" "unhealthy" '{"service":"worker","error":"connection_timeout"}'

  sleep 1

  log_info "Checking individual agent health..."

  # Check each agent
  for agent_id in agent-web-1 agent-db-1 agent-worker-1; do
    status=$(check_agent_health "$agent_id")
    echo "  $agent_id: $status"
  done

  echo ""
  log_info "Getting cluster health summary..."
  get_cluster_health summary
}

# ==============================================================================
# EXAMPLE 2: Cluster Health Monitoring
# ==============================================================================

example_cluster_monitoring() {
  echo ""
  echo "=========================================="
  echo "Example 2: Cluster Health Monitoring"
  echo "=========================================="
  echo ""

  log_info "Creating a cluster of 10 agents..."

  # Create 10 agents (8 healthy, 1 degraded, 1 unhealthy)
  for i in {1..8}; do
    report_health "cluster-agent-$i" "healthy" "{\"id\":$i,\"queue\":$((RANDOM % 100))}"
  done

  report_health "cluster-agent-9" "degraded" '{"id":9,"reason":"high_load"}'
  report_health "cluster-agent-10" "unhealthy" '{"id":10,"error":"crash"}'

  sleep 1

  log_info "Cluster health (JSON format):"
  cluster_health=$(get_cluster_health json)
  echo "$cluster_health" | python3 -m json.tool 2>/dev/null || echo "$cluster_health" | jq . 2>/dev/null || cat

  echo ""

  health_pct=$(echo "$cluster_health" | jq -r '.health_percentage' 2>/dev/null || echo "80")

  if [ "$health_pct" -ge 90 ]; then
    log_info "Cluster is healthy (${health_pct}% healthy)"
  elif [ "$health_pct" -ge 75 ]; then
    log_warn "Cluster is degraded (${health_pct}% healthy)"
  else
    log_error "Cluster is unhealthy (${health_pct}% healthy)"
  fi
}

# ==============================================================================
# EXAMPLE 3: Unhealthy Agent Detection
# ==============================================================================

example_unhealthy_detection() {
  echo ""
  echo "=========================================="
  echo "Example 3: Unhealthy Agent Detection"
  echo "=========================================="
  echo ""

  log_info "Simulating failing agents..."

  # Create healthy agents
  for i in {1..5}; do
    report_health "prod-agent-$i" "healthy" "{\"deployment\":\"prod\",\"id\":$i}"
  done

  # Create problematic agents
  report_health "prod-agent-6" "degraded" '{"deployment":"prod","issue":"memory_leak"}'
  report_health "prod-agent-7" "unhealthy" '{"deployment":"prod","error":"segfault"}'
  report_health "prod-agent-8" "degraded" '{"deployment":"prod","issue":"slow_response"}'

  sleep 1

  log_info "Detecting unhealthy agents..."
  unhealthy_list=$(get_unhealthy_agents)

  if [ "$(echo "$unhealthy_list" | jq '. | length' 2>/dev/null)" -gt 0 ]; then
    log_warn "Found unhealthy agents:"
    echo "$unhealthy_list" | jq -r '.[] | "  \(.agent_id): \(.status) - \(.details.issue // .details.error // "unknown")"' 2>/dev/null || echo "$unhealthy_list"
  else
    log_info "No unhealthy agents found"
  fi

  echo ""
  log_info "Filtering by status type..."

  # Show degraded agents
  degraded_count=$(echo "$unhealthy_list" | jq '[.[] | select(.status == "degraded")] | length' 2>/dev/null || echo 0)
  log_warn "Degraded agents: $degraded_count"

  # Show unhealthy agents
  unhealthy_count=$(echo "$unhealthy_list" | jq '[.[] | select(.status == "unhealthy")] | length' 2>/dev/null || echo 0)
  log_error "Unhealthy agents: $unhealthy_count"
}

# ==============================================================================
# EXAMPLE 4: Liveness Probes
# ==============================================================================

example_liveness_probes() {
  echo ""
  echo "=========================================="
  echo "Example 4: Liveness Probes"
  echo "=========================================="
  echo ""

  log_info "Starting liveness probes for 3 agents..."

  # Start liveness probes with different intervals
  start_liveness_probe "live-agent-1" 2 >/dev/null 2>&1
  start_liveness_probe "live-agent-2" 3 >/dev/null 2>&1
  start_liveness_probe "live-agent-3" 5 >/dev/null 2>&1

  log_info "Waiting 10 seconds for health reports..."
  sleep 10

  log_info "Checking agent health (all should be healthy due to liveness probes)..."

  for agent_id in live-agent-1 live-agent-2 live-agent-3; do
    status=$(check_agent_health "$agent_id")
    details=$(get_agent_health_details "$agent_id")
    age=$(echo "$details" | jq -r '.age_seconds' 2>/dev/null || echo "unknown")
    echo "  $agent_id: $status (last report: ${age}s ago)"
  done

  echo ""
  log_info "Stopping liveness probe for live-agent-2..."
  stop_liveness_probe "live-agent-2" >/dev/null 2>&1

  log_info "Waiting for timeout (${HEALTH_TIMEOUT}s)..."
  sleep $((HEALTH_TIMEOUT + 2))

  log_info "Checking health again (live-agent-2 should now be unhealthy)..."

  for agent_id in live-agent-1 live-agent-2 live-agent-3; do
    status=$(check_agent_health "$agent_id")
    echo "  $agent_id: $status"
  done

  # Stop remaining probes
  stop_liveness_probe "live-agent-1" >/dev/null 2>&1
  stop_liveness_probe "live-agent-3" >/dev/null 2>&1
}

# ==============================================================================
# EXAMPLE 5: Stale Agent Cleanup
# ==============================================================================

example_stale_cleanup() {
  echo ""
  echo "=========================================="
  echo "Example 5: Stale Agent Cleanup"
  echo "=========================================="
  echo ""

  log_info "Creating agents with different ages..."

  # Create fresh agents
  for i in {1..3}; do
    report_health "fresh-agent-$i" "healthy" '{"status":"active"}'
  done

  # Create agents and simulate old timestamps
  for i in {1..2}; do
    report_health "stale-agent-$i" "healthy" '{"status":"inactive"}'
    # Make them appear old
    touch -d "2 hours ago" "$HEALTH_DIR/stale-agent-$i/status.json"
  done

  sleep 1

  log_info "Initial cluster state:"
  get_cluster_health summary

  echo ""
  log_info "Cleaning up agents older than 1 hour (3600s)..."
  cleanup_result=$(cleanup_stale_agents 3600)
  echo "$cleanup_result" | jq . 2>/dev/null || echo "$cleanup_result"

  removed_count=$(echo "$cleanup_result" | jq -r '.removed' 2>/dev/null || echo "2")
  log_info "Removed $removed_count stale agents"

  echo ""
  log_info "Cluster state after cleanup:"
  get_cluster_health summary
}

# ==============================================================================
# EXAMPLE 6: Monitoring Dashboard Simulation
# ==============================================================================

example_monitoring_dashboard() {
  echo ""
  echo "=========================================="
  echo "Example 6: Monitoring Dashboard (5s)"
  echo "=========================================="
  echo ""

  log_info "Starting background agents with liveness probes..."

  # Start 5 healthy agents
  for i in {1..5}; do
    start_liveness_probe "monitor-agent-$i" 2 >/dev/null 2>&1
  done

  # Simulate one failing agent
  report_health "monitor-agent-6" "unhealthy" '{"error":"simulated_failure"}'

  log_info "Monitoring cluster health for 5 seconds..."

  for iteration in {1..5}; do
    echo ""
    echo "--- Iteration $iteration/5 ($(date +%H:%M:%S)) ---"

    # Get cluster health
    cluster_health=$(get_cluster_health json)
    total=$(echo "$cluster_health" | jq -r '.total' 2>/dev/null || echo "6")
    healthy=$(echo "$cluster_health" | jq -r '.healthy' 2>/dev/null || echo "5")
    unhealthy=$(echo "$cluster_health" | jq -r '.unhealthy' 2>/dev/null || echo "1")
    health_pct=$(echo "$cluster_health" | jq -r '.health_percentage' 2>/dev/null || echo "83")

    echo "Cluster: $healthy/$total healthy ($health_pct%)"

    if [ "$unhealthy" -gt 0 ]; then
      log_warn "Unhealthy agents detected:"
      get_unhealthy_agents | jq -r '.[] | "  \(.agent_id): \(.status)"' 2>/dev/null || echo "  (unable to parse)"
    fi

    sleep 1
  done

  # Stop monitoring agents
  for i in {1..5}; do
    stop_liveness_probe "monitor-agent-$i" >/dev/null 2>&1
  done
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

main() {
  echo "=========================================="
  echo "Health Check System - Integration Examples"
  echo "=========================================="
  echo ""
  log_info "Health directory: $HEALTH_DIR"
  log_info "Health timeout: ${HEALTH_TIMEOUT}s"
  log_info "Check interval: ${HEALTH_CHECK_INTERVAL}s"

  # Check dependencies
  if ! command -v jq &>/dev/null; then
    log_error "jq is required but not installed. Please install: sudo apt-get install -y jq"
    exit 1
  fi

  # Run examples
  example_basic_health
  example_cluster_monitoring
  example_unhealthy_detection
  example_liveness_probes
  example_stale_cleanup
  example_monitoring_dashboard

  echo ""
  echo "=========================================="
  echo "Examples Complete"
  echo "=========================================="
  echo ""
  log_info "All examples executed successfully"
  log_info "Health data will be cleaned up on exit"
}

# Run main
main "$@"
