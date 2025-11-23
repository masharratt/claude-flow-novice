#!/bin/bash
# Monitor load test progress

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
LOAD_TEST_ID=${1:-"load-test-$(date +%s)"}

echo "📊 Monitoring Load Test: $LOAD_TEST_ID"
echo "================================"

# Check Redis for load test metrics
if command -v redis-cli &> /dev/null; then
    echo "🔗 Redis Load Test Metrics:"
    redis-cli --scan --pattern "loadtest:*" | head -20 | while read -r key; do
        if [[ "$key" == *"metrics"* ]]; then
            local value=$(redis-cli LRANGE "$key" -5 -1 2>/dev/null | tail -1 || echo "N/A")
            echo "  📈 Latest metrics: $value"
        elif [[ "$key" == *"loop:"* ]]; then
            local loop_num=$(echo "$key" | cut -d: -f3)
            local status=$(redis-cli GET "$key:status" 2>/dev/null || echo "unknown")
            echo "  🔄 Loop $loop_num: $status"
        fi
    done
fi

echo ""
echo "💻 System Metrics:"
echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')"
echo "  Memory: $(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')%"
echo "  Redis Memory: $(redis-cli info memory | grep "used_memory_human:" | cut -d: -f2)"
echo "  Claude Processes: $(pgrep -f "claude-flow-novice" | wc -l)"
echo "  Node Processes: $(pgrep -f "node" | wc -l)"

echo ""
echo "📁 Deliverables Created:"
find /tmp/trigger-dev-deliverables -name "load-test-loop-*" -type d 2>/dev/null | wc -l