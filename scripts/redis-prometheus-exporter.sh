#!/bin/bash
# Prometheus Metric Exporter for Z.ai Team Costs

set -euo pipefail

# Ensure output directory exists
mkdir -p /tmp

# Configuration
REDIS_KEY_PREFIX="zai_team_costs"
COST_PER_MILLION=0.50

# Generate Prometheus-compatible metrics
generate_metrics() {
    local timestamp=$(date +%s)

    # Output metric metadata
    echo "# HELP zai_team_total_cost Z.ai cost per team in USD"
    echo "# TYPE zai_team_total_cost gauge"

    # Iterate through teams and export costs
    for team in $(redis-cli HKEYS "$REDIS_KEY_PREFIX"); do
        local cost=$(redis-cli HGET "$REDIS_KEY_PREFIX" "$team")
        echo "zai_team_total_cost{team=\"$team\"} $cost $timestamp"
    done
}

# Run in continuous mode with 15s interval
while true; do
    # Generate and write metrics
    generate_metrics > /tmp/zai_costs_metrics.prom
    sleep 15
done
