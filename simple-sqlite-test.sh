#!/bin/bash
echo "🧪 SQLite Lifecycle Hook Test"
echo "=============================="

# Create results directory
mkdir -p /tmp/sqlite-test
RESULTS="/tmp/sqlite-test"

# Test a single agent first
echo "Testing docker-specialist agent with SQLite lifecycle hooks..."
echo "Start time: $(date)"

# Monitor memory before
echo "Memory before:"
free -h

echo ""
echo "🚀 Launching agent..."
timeout 30s npx claude-flow-novice agent-spawn docker-specialist \
    --task-id "sqlite-test-1" \
    --prompt "Read the LICENSE file and return its first 3 words. Then stop." \
    > "$RESULTS/output.log" 2> "$RESULTS/error.log" &

AGENT_PID=$!
echo "Agent PID: $AGENT_PID"

# Monitor during execution
for i in {1..10}; do
    echo "Check $i: $(date '+%H:%M:%S') - Memory: $(free -h | grep '^Mem:' | awk '{print $3}')"
    if ! kill -0 $AGENT_PID 2>/dev/null; then
        echo "Agent finished at check $i"
        break
    fi
    sleep 3
done

# Wait for completion
wait $AGENT_PID 2>/dev/null || echo "Agent timed out or failed"

echo ""
echo "Memory after:"
free -h

echo ""
echo "Results:"
if [[ -f "$RESULTS/output.log" ]]; then
    echo "✅ Output captured ($(wc -l < "$RESULTS/output.log") lines)"
    head -3 "$RESULTS/output.log"
else
    echo "❌ No output file"
fi

if [[ -f "$RESULTS/error.log" ]] && [[ -s "$RESULTS/error.log" ]]; then
    echo "❌ Errors found:"
    head -5 "$RESULTS/error.log"
fi

echo ""
echo "Checking for hanging processes..."
ps aux | grep -E '(npx claude-flow-novice|sqlite-cli)' | grep -v grep || echo "No hanging processes found"

echo ""
echo "Test completed at: $(date)"