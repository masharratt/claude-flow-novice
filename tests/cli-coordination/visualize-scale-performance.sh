#!/bin/bash
# visualize-scale-performance.sh - Generate ASCII chart of performance degradation
set -euo pipefail

echo "CLI Coordination Performance Curve (from test results)"
echo "========================================================================"
echo ""
echo "Delivery Rate vs Agent Count:"
echo ""

# Test data from SCALABILITY_RESULTS.md
declare -A results=(
    [2]=100.0
    [5]=100.0
    [10]=90.0
    [20]=100.0
    [30]=96.6
    [50]=100.0
    [75]=98.6
    [100]=96.0
    [150]=98.0
    [200]=91.0
    [300]=85.3
    [400]=84.0
)

# Generate ASCII bar chart
for count in 2 5 10 20 30 50 75 100 150 200 300 400; do
    rate=${results[$count]}

    # Calculate bar length (0-50 chars for 0-100%)
    bar_length=$(echo "scale=0; ($rate * 50) / 100" | bc)

    # Generate bar
    bar=$(printf '█%.0s' $(seq 1 "$bar_length"))

    # Color coding
    if (( $(echo "$rate >= 95" | bc -l) )); then
        color="\033[0;32m"  # Green
    elif (( $(echo "$rate >= 85" | bc -l) )); then
        color="\033[1;33m"  # Yellow
    else
        color="\033[0;31m"  # Red
    fi

    printf "%4d agents: ${color}%s\033[0m %5.1f%%\n" "$count" "$bar" "$rate"
done

echo ""
echo "Coordination Time vs Agent Count:"
echo ""

# Coordination times from test results
declare -A times=(
    [2]=2
    [5]=1
    [10]=2
    [20]=1
    [30]=1
    [50]=2
    [75]=3
    [100]=3
    [150]=5
    [200]=7
    [300]=11
    [400]=13
)

for count in 2 5 10 20 30 50 75 100 150 200 300 400; do
    time=${times[$count]}

    # Calculate bar length (0-40 chars for 0-20s)
    bar_length=$(echo "scale=0; ($time * 40) / 20" | bc)

    # Generate bar
    bar=$(printf '▓%.0s' $(seq 1 "$bar_length"))

    # Color coding
    if (( time <= 3 )); then
        color="\033[0;32m"  # Green
    elif (( time <= 8 )); then
        color="\033[1;33m"  # Yellow
    else
        color="\033[0;31m"  # Red
    fi

    printf "%4d agents: ${color}%s\033[0m %2ds\n" "$count" "$bar" "$time"
done

echo ""
echo "Legend:"
echo "  \033[0;32m█ Green\033[0m  = Optimal (≥95% delivery, ≤3s coordination)"
echo "  \033[1;33m█ Yellow\033[0m = Acceptable (≥85% delivery, ≤8s coordination)"
echo "  \033[0;31m█ Red\033[0m    = Degraded (<85% delivery or >8s coordination)"
echo ""
echo "========================================================================"
echo ""
echo "Key Observations:"
echo "  • Sweet spot: 20-50 agents (100% delivery, 1-2s coordination)"
echo "  • Recommended max: 100 agents (96% delivery, 3s coordination)"
echo "  • Acceptable limit: 300 agents (85% delivery, 11s coordination)"
echo "  • Breaking point: 400 agents (84% delivery, coordination fails)"
echo ""
echo "Scaling Characteristics:"
echo "  • 2-50 agents:    Linear, excellent performance"
echo "  • 50-100 agents:  Sub-linear, very good performance"
echo "  • 100-200 agents: Sub-linear, acceptable performance"
echo "  • 200-300 agents: Linear, acceptable with degradation"
echo "  • 300+ agents:    Breakdown, requires optimization"
echo ""
