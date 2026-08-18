#!/usr/bin/env bash
#
# Fleet Manager - Performance Metrics CLI Wrapper
#
# Usage:
#   ./invoke-fleet-metrics.sh --agent-id <id> [--detailed] [--all]
#
# Examples:
#   # Get metrics for specific agent
#   ./invoke-fleet-metrics.sh --agent-id backend-dev-1
#
#   # Get detailed metrics
#   ./invoke-fleet-metrics.sh --agent-id backend-dev-1 --detailed
#
#   # Get fleet-wide metrics
#   ./invoke-fleet-metrics.sh --all

set -euo pipefail

# Parse arguments
AGENT_ID=""
DETAILED=false
ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --detailed)
            DETAILED=true
            shift
            ;;
        --all)
            ALL=true
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Function to generate mock metrics for an agent
generate_metrics() {
    local agent_id="$1"
    local allocation_key="fleet:agent:${agent_id}:allocation"
    local registration_key="fleet:agent:${agent_id}:registration"

    # Get allocated resources
    local allocation=$(redis-cli GET "$allocation_key")
    local registration=$(redis-cli GET "$registration_key")

    if [ -z "$allocation" ] || [ "$allocation" = "(nil)" ]; then
        # Use registration resources if no allocation
        if [ -z "$registration" ] || [ "$registration" = "(nil)" ]; then
            echo "Error: Agent $agent_id not found"
            return 1
        fi
        allocation="$registration"
    fi

    local cpu_allocated=$(echo "$allocation" | jq -r '.cpu')
    local memory_allocated=$(echo "$allocation" | jq -r '.memory')

    # Generate realistic metrics (mock data)
    local cpu_usage=$(echo "$cpu_allocated * 0.8" | bc)
    local cpu_utilization="0.80"
    local memory_usage=$(echo "$memory_allocated * 0.88" | bc | cut -d'.' -f1)
    local memory_utilization="0.88"
    local task_completion_rate="0.95"
    local avg_response_time="120"

    # Determine health status based on utilization
    local health="healthy"
    if (( $(echo "$cpu_utilization > 0.90" | bc -l) )) || (( $(echo "$memory_utilization > 0.90" | bc -l) )); then
        health="degraded"
    fi

    local timestamp=$(date +%s)

    # Build metrics JSON
    if [ "$DETAILED" = true ]; then
        METRICS=$(jq -n \
            --arg agent_id "$agent_id" \
            --arg cpu_usage "$cpu_usage" \
            --arg cpu_util "$cpu_utilization" \
            --arg memory_usage "$memory_usage" \
            --arg memory_util "$memory_utilization" \
            --arg task_rate "$task_completion_rate" \
            --arg response_time "$avg_response_time" \
            --arg health "$health" \
            --arg ts "$timestamp" \
            '{
                agentId: $agent_id,
                metrics: {
                    cpuUsage: ($cpu_usage | tonumber),
                    cpuUtilization: ($cpu_util | tonumber),
                    memoryUsage: ($memory_usage | tonumber),
                    memoryUtilization: ($memory_util | tonumber),
                    taskCompletionRate: ($task_rate | tonumber),
                    averageResponseTime: ($response_time | tonumber),
                    detailed: {
                        threadsActive: 8,
                        diskIOPS: 450,
                        networkThroughput: 250
                    }
                },
                health: $health,
                timestamp: ($ts | tonumber)
            }')
    else
        METRICS=$(jq -n \
            --arg agent_id "$agent_id" \
            --arg cpu_usage "$cpu_usage" \
            --arg cpu_util "$cpu_utilization" \
            --arg memory_usage "$memory_usage" \
            --arg memory_util "$memory_utilization" \
            --arg task_rate "$task_completion_rate" \
            --arg response_time "$avg_response_time" \
            --arg health "$health" \
            --arg ts "$timestamp" \
            '{
                agentId: $agent_id,
                metrics: {
                    cpuUsage: ($cpu_usage | tonumber),
                    cpuUtilization: ($cpu_util | tonumber),
                    memoryUsage: ($memory_usage | tonumber),
                    memoryUtilization: ($memory_util | tonumber),
                    taskCompletionRate: ($task_rate | tonumber),
                    averageResponseTime: ($response_time | tonumber)
                },
                health: $health,
                timestamp: ($ts | tonumber)
            }')
    fi

    # Store metrics in Redis
    local metrics_key="fleet:agent:${agent_id}:metrics"
    echo "$METRICS" | redis-cli -x SET "$metrics_key" >/dev/null

    echo "$METRICS"
}

# Main logic
if [ "$ALL" = true ]; then
    # Get all registered agents
    POOL_KEY="fleet:pool:allocated"
    AGENT_IDS=$(redis-cli HKEYS "$POOL_KEY" | grep ':cpu$' | sed 's/:cpu$//' | sort -u)

    if [ -z "$AGENT_IDS" ]; then
        echo "No agents registered"
        exit 0
    fi

    echo "{"
    echo "  \"fleetMetrics\": ["

    FIRST=true
    for aid in $AGENT_IDS; do
        if [ "$FIRST" = false ]; then
            echo ","
        fi
        FIRST=false

        AGENT_METRICS=$(generate_metrics "$aid" 2>/dev/null || echo "{}")
        echo "$AGENT_METRICS" | jq -c '.'
    done

    echo "  ],"
    echo "  \"summary\": {"
    echo "    \"totalAgents\": $(echo "$AGENT_IDS" | wc -l),"
    echo "    \"timestamp\": $(date +%s)"
    echo "  }"
    echo "}"

elif [ -n "$AGENT_ID" ]; then
    # Get metrics for specific agent
    generate_metrics "$AGENT_ID"

else
    echo "Error: Must specify --agent-id or --all"
    echo ""
    echo "Usage: $0 --agent-id <id> [--detailed] [--all]"
    echo ""
    echo "Examples:"
    echo "  $0 --agent-id backend-dev-1"
    echo "  $0 --agent-id backend-dev-1 --detailed"
    echo "  $0 --all"
    exit 1
fi
