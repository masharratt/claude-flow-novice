#!/bin/bash

# cost-allocation-tracker.sh - Container cost tracking and allocation
#
# Purpose: Track costs across Docker containers by team, project, and agent type
# Usage: ./cost-allocation-tracker.sh [command] [options]
#
# Commands:
#   daily-report <date>          Generate daily cost report
#   by-team <team>               Show costs for specific team
#   by-project <project>         Show costs for specific project
#   by-agent <agent-type>        Show costs by agent type
#   anomalies                    Find high-cost containers
#   forecast <days>              Project costs for next N days
#   export-csv <output-file>     Export to CSV for billing
#   quota-check                  Verify team quotas

set -euo pipefail

# Source validation framework for safe arithmetic
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/validation.sh"

# Configuration
COST_CPU_PER_HOUR=0.05          # $0.05 per CPU core per hour
COST_MEMORY_PER_GB_HOUR=0.10    # $0.10 per GB per hour
COST_DISK_PER_GB=0.01          # $0.01 per GB disk
COST_API_TOKEN_MULTIPLIER=0.50  # $0.50 per 1M tokens

# Provider costs (per 1M tokens)
COST_ZAI=0.50
COST_KIMI=2.00
COST_OPENROUTER=1.00
COST_ANTHROPIC=15.00

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*"
}

# Calculate container cost
calculate_container_cost() {
  local container_id=$1
  local cpu_percent=$2
  local memory_mb=$3
  local runtime_seconds=${4:-3600}  # Default to 1 hour
  local provider=${5:-zai}

  # Validate inputs
  if ! validate_numeric "$cpu_percent" 0 ; then
    log_error "Invalid CPU percent: $cpu_percent"
    echo "0"
    return 1
  fi

  if ! validate_numeric "$memory_mb" 0 ; then
    log_error "Invalid memory MB: $memory_mb"
    echo "0"
    return 1
  fi

  if ! validate_numeric "$runtime_seconds" 1 ; then
    log_error "Invalid runtime seconds: $runtime_seconds"
    echo "0"
    return 1
  fi

  # Assume CPU_PERCENT is for 1 hour execution
  # Convert to actual CPU-hours (safe division)
  local cpu_hours
  cpu_hours=$(safe_divide "$cpu_percent" "100" 4) || return 1
  cpu_hours=$(safe_arithmetic "$cpu_hours * ($runtime_seconds / 3600)") || return 1

  local memory_gb
  memory_gb=$(safe_divide "$memory_mb" "1024" 4) || return 1

  local memory_hours
  memory_hours=$(safe_arithmetic "$memory_gb * ($runtime_seconds / 3600)") || return 1

  # Calculate infrastructure costs
  local cpu_cost
  cpu_cost=$(safe_arithmetic "$cpu_hours * $COST_CPU_PER_HOUR") || return 1

  local memory_cost
  memory_cost=$(safe_arithmetic "$memory_hours * $COST_MEMORY_PER_GB_HOUR") || return 1

  local total_cost
  total_cost=$(safe_arithmetic "$cpu_cost + $memory_cost") || return 1

  echo "$total_cost"
}

# Get API token cost for provider
get_api_cost() {
  local provider=$1
  local tokens=${2:-0}

  # Validate token count
  if ! validate_numeric "$tokens" 0 ; then
    log_error "Invalid token count: $tokens"
    echo "0"
    return 1
  fi

  if [ "$tokens" -eq 0 ]; then
    echo "0"
    return 0
  fi

  local cost=0
  case "$provider" in
    zai)
      cost=$(safe_divide "$COST_ZAI" "1000000" 6) || return 1
      cost=$(safe_arithmetic "$tokens * $cost") || return 1
      ;;
    kimi)
      cost=$(safe_divide "$COST_KIMI" "1000000" 6) || return 1
      cost=$(safe_arithmetic "$tokens * $cost") || return 1
      ;;
    openrouter)
      cost=$(safe_divide "$COST_OPENROUTER" "1000000" 6) || return 1
      cost=$(safe_arithmetic "$tokens * $cost") || return 1
      ;;
    anthropic)
      cost=$(safe_divide "$COST_ANTHROPIC" "1000000" 6) || return 1
      cost=$(safe_arithmetic "$tokens * $cost") || return 1
      ;;
    *)
      cost=0
      ;;
  esac

  echo "$cost"
}

# Extract label from container
get_container_label() {
  local container_id=$1
  local label=$2
  docker inspect "$container_id" --format="{{index .Config.Labels \"$label\" }}" 2>/dev/null || echo ""
}

# Get running container stats
get_running_container_stats() {
  docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | tail -n +2 || true
}

# Get exited container stats (from docker history)
get_exited_container_stats() {
  docker ps -a --filter "status=exited" --format "table {{.ID}}\t{{.Label \"team\"}}\t{{.Label \"project\"}}" 2>/dev/null | tail -n +2 || true
}

# Daily cost report
daily_report() {
  local date=${1:-$(date +%Y-%m-%d)}

  log_info "Generating daily cost report for: $date"

  echo ""
  echo "=========================================="
  echo "Daily Cost Report: $date"
  echo "=========================================="
  echo ""

  # Get all containers (running and exited)
  local total_cost=0
  local total_containers=0

  # Process running containers
  echo "Running Containers:"
  echo "---"

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    # Clean up CPU and memory values
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local team=$(get_container_label "$container_id" "team")
    local project=$(get_container_label "$container_id" "project")
    local agent_type=$(get_container_label "$container_id" "agent-type")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")

    if [ -z "$team" ]; then
      continue
    fi

    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    printf "%-12s %-30s %-20s CPU:%-6s MEM:%-8s Cost: \$%.4f\n" \
      "$team" "$project" "$agent_type" "$cpu%" "$mem" "$cost"

    total_cost=$(echo "scale=6; $total_cost + $cost" | bc)
    total_containers=$((total_containers + 1))
  done

  echo ""
  echo "Summary:"
  echo "--------"
  echo "Total containers: $total_containers"
  echo "Total cost: \$$(printf '%.2f' "$total_cost")"
  echo ""
}

# Costs by team
by_team() {
  local team=${1:-all}

  log_info "Generating cost report by team"
  echo ""

  declare -A team_costs
  declare -A team_counts

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local container_team=$(get_container_label "$container_id" "team")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")

    if [ -z "$container_team" ]; then
      continue
    fi

    if [ "$team" != "all" ] && [ "$container_team" != "$team" ]; then
      continue
    fi

    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    team_costs["$container_team"]=$(echo "scale=6; ${team_costs[$container_team]:-0} + $cost" | bc)
    team_counts["$container_team"]=$((${team_counts[$container_team]:-0} + 1))
  done

  echo "Team Cost Summary:"
  echo "==================="
  for t in "${!team_costs[@]}"; do
    printf "%-20s: Count: %-3d  Cost: \$%.2f\n" \
      "$t" "${team_counts[$t]}" "${team_costs[$t]}"
  done | sort -k4 -rn

  echo ""
}

# Costs by project
by_project() {
  local project=${1}

  if [ -z "$project" ]; then
    log_error "Project name required"
    exit 1
  fi

  log_info "Generating cost report for project: $project"
  echo ""

  local total_cost=0
  local count=0

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local container_project=$(get_container_label "$container_id" "project")
    local team=$(get_container_label "$container_id" "team")
    local agent_type=$(get_container_label "$container_id" "agent-type")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")

    if [ "$container_project" != "$project" ]; then
      continue
    fi

    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    printf "%-15s %-20s %-12s CPU:%-6s Cost: \$%.4f\n" \
      "$team" "$agent_type" "$container_id" "$cpu%" "$cost"

    total_cost=$(echo "scale=6; $total_cost + $cost" | bc)
    count=$((count + 1))
  done

  echo ""
  echo "Project Summary: $project"
  echo "Containers: $count"
  echo "Total cost: \$$(printf '%.2f' "$total_cost")"
  echo ""
}

# Costs by agent type
by_agent() {
  local agent_type=${1}

  if [ -z "$agent_type" ]; then
    log_error "Agent type required"
    exit 1
  fi

  log_info "Generating cost report for agent: $agent_type"
  echo ""

  local total_cost=0
  local count=0

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local container_agent=$(get_container_label "$container_id" "agent-type")
    local team=$(get_container_label "$container_id" "team")
    local project=$(get_container_label "$container_id" "project")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")

    if [ "$container_agent" != "$agent_type" ]; then
      continue
    fi

    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    printf "%-15s %-30s CPU:%-6s Cost: \$%.4f\n" \
      "$team" "$project" "$cpu%" "$cost"

    total_cost=$(echo "scale=6; $total_cost + $cost" | bc)
    count=$((count + 1))
  done

  echo ""
  echo "Agent Type Summary: $agent_type"
  echo "Containers: $count"
  echo "Total cost: \$$(printf '%.2f' "$total_cost")"
  echo ""
}

# Find cost anomalies
anomalies() {
  log_info "Finding high-cost containers"
  echo ""

  echo "Containers with cost > \$1.00:"
  echo "=============================="

  local found=0

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local team=$(get_container_label "$container_id" "team")
    local project=$(get_container_label "$container_id" "project")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")

    if [ -z "$team" ]; then
      continue
    fi

    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    # Convert cost to number for comparison
    if (( $(echo "$cost > 1.00" | bc -l) )); then
      printf "\$%.2f %-15s %-30s (CPU: %s%%, MEM: %s MB)\n" \
        "$cost" "$team" "$project" "$cpu" "$mem"
      found=$((found + 1))
    fi
  done | sort -rn -k1

  echo ""
  if [ $found -eq 0 ]; then
    log_success "No anomalies found (all costs < \$1.00)"
  else
    log_warn "Found $found containers with high costs"
  fi
  echo ""
}

# Cost forecast
forecast() {
  local days=${1:-7}

  log_info "Forecasting costs for next $days days"
  echo ""

  # Calculate average daily cost
  local total_cost=0
  local count=0

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local provider=$(get_container_label "$container_id" "provider" || echo "zai")
    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    total_cost=$(echo "scale=6; $total_cost + $cost" | bc)
    count=$((count + 1))
  done

  if [ $count -eq 0 ]; then
    log_warn "No running containers to forecast"
    return
  fi

  local avg_daily_cost=$total_cost
  local forecast_cost=$(echo "scale=2; $avg_daily_cost * $days" | bc)

  echo "Cost Forecast:"
  echo "=============="
  echo "Current running containers: $count"
  echo "Average daily cost: \$$(printf '%.2f' "$avg_daily_cost")"
  echo "Forecasted ${days}-day cost: \$$(printf '%.2f' "$forecast_cost")"
  echo ""
}

# Export to CSV
export_csv() {
  local output_file=${1:-costs-$(date +%Y-%m-%d).csv}

  log_info "Exporting costs to CSV: $output_file"

  # CSV header
  cat > "$output_file" <<EOF
Container ID,Team,Cost Center,Project,Agent Type,CPU %,Memory MB,Provider,Cost,Timestamp
EOF

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local team=$(get_container_label "$container_id" "team" || echo "unknown")
    local cost_center=$(get_container_label "$container_id" "cost-center" || echo "unknown")
    local project=$(get_container_label "$container_id" "project" || echo "unknown")
    local agent_type=$(get_container_label "$container_id" "agent-type" || echo "unknown")
    local provider=$(get_container_label "$container_id" "provider" || echo "zai")
    local cost=$(calculate_container_cost "$container_id" "$cpu" "$mem" 3600 "$provider")

    printf "%s,%s,%s,%s,%s,%.1f,%.0f,%s,%.6f,%s\n" \
      "$container_id" "$team" "$cost_center" "$project" "$agent_type" \
      "$cpu" "$mem" "$provider" "$cost" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$output_file"
  done

  log_success "Costs exported to: $output_file"
  log_info "Total rows: $(tail -n +2 "$output_file" | wc -l)"
}

# Check quotas
quota_check() {
  log_info "Checking team quotas"
  echo ""

  # Define team quotas
  declare -A team_daily_budgets=(
    [engineering]=500
    [marketing]=200
    [data]=1000
  )

  declare -A team_max_cpu=(
    [engineering]=4
    [marketing]=2
    [data]=8
  )

  declare -A team_max_memory=(
    [engineering]=16
    [marketing]=8
    [data]=32
  )

  echo "Quota Status:"
  echo "============="

  local overall_ok=true

  get_running_container_stats | while IFS=$'\t' read -r container_id cpu mem; do
    cpu=$(echo "$cpu" | sed 's/%$//')
    mem=$(echo "$mem" | sed 's/MiB$//' | sed 's/GiB$//')

    local team=$(get_container_label "$container_id" "team")

    if [ -z "$team" ]; then
      continue
    fi

    # Check per-container limits (assume quotas are per-container max)
    local max_cpu=${team_max_cpu[$team]:-4}
    local max_mem=${team_max_memory[$team]:-16}

    if (( $(echo "$cpu > $max_cpu" | bc -l) )); then
      log_warn "Team $team exceeded CPU quota: $cpu% > $max_cpu%"
      overall_ok=false
    fi

    if (( $(echo "${mem%.*} > $max_mem" | bc -l) )); then
      log_warn "Team $team exceeded memory quota: ${mem}GB > ${max_mem}GB"
      overall_ok=false
    fi
  done

  if [ "$overall_ok" = true ]; then
    log_success "All teams within quotas"
  else
    log_warn "Some teams exceeding quotas - review above"
  fi
  echo ""
}

# Main command dispatcher
main() {
  local command=${1:-help}

  case "$command" in
    daily-report)
      daily_report "${2:-}"
      ;;
    by-team)
      by_team "${2:-all}"
      ;;
    by-project)
      by_project "${2:-}"
      ;;
    by-agent)
      by_agent "${2:-}"
      ;;
    anomalies)
      anomalies
      ;;
    forecast)
      forecast "${2:-7}"
      ;;
    export-csv)
      export_csv "${2:-}"
      ;;
    quota-check)
      quota_check
      ;;
    help|--help|-h)
      cat <<EOF
Cost Allocation and Tracking Tool

Usage: $(basename "$0") [command] [options]

Commands:
  daily-report [date]          Generate daily cost report
                               date: YYYY-MM-DD (default: today)

  by-team [team]               Show costs by team
                               team: team name or 'all' (default: all)

  by-project <project>         Show costs for specific project
                               project: project name (required)

  by-agent <agent-type>        Show costs by agent type
                               agent-type: agent type (required)

  anomalies                    Find high-cost containers (> \$1.00/hour)

  forecast [days]              Project future costs
                               days: number of days to forecast (default: 7)

  export-csv [file]            Export costs to CSV file
                               file: output file (default: costs-YYYY-MM-DD.csv)

  quota-check                  Verify team resource quotas

  help                         Show this help message

Pricing Configuration:
  CPU:        \$$COST_CPU_PER_HOUR per core per hour
  Memory:     \$$COST_MEMORY_PER_GB_HOUR per GB per hour
  API (Z.ai): \$$COST_ZAI per 1M tokens

Examples:
  # Daily report for today
  $(basename "$0") daily-report

  # Show costs for engineering team
  $(basename "$0") by-team engineering

  # Find expensive containers
  $(basename "$0") anomalies

  # Export all costs to CSV
  $(basename "$0") export-csv costs.csv

EOF
      ;;
    *)
      log_error "Unknown command: $command"
      echo "Run '$(basename "$0") help' for usage"
      exit 1
      ;;
  esac
}

main "$@"
