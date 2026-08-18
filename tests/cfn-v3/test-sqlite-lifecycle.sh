#!/usr/bin/env bash

# Experiment: Test 10 agents with SQLite lifecycle hooks in parallel
# Each agent will: start (SQLite), read LICENSE, end (SQLite)

set -e

echo "🧪 Starting SQLite lifecycle hook experiment..."
echo "Launching 10 agents in parallel with SQLite lifecycle hooks"
echo "========================================================"

# Create results directory
mkdir -p /tmp/sqlite-test-results
RESULTS_DIR="/tmp/sqlite-test-results"

# Function to launch a single agent
launch_agent() {
    local agent_id="$1"
    local agent_name="$2"
    local output_file="$RESULTS_DIR/agent_${agent_id}_output.log"
    local error_file="$RESULTS_DIR/agent_${agent_id}_error.log"

    echo "🚀 Launching agent ${agent_id}: ${agent_name}"

    # Launch agent via Task tool with minimal task
    timeout 60s npx claude-flow-novice agent-spawn "${agent_name}" \
        --task-id "sqlite-test-${agent_id}" \
        --prompt "Read the root LICENSE file and report its first line. Then stop." \
        > "$output_file" 2> "$error_file" &

    local pid=$!
    echo "Agent ${agent_id} PID: $pid"
    echo "$pid" > "$RESULTS_DIR/agent_${agent_id}.pid"

    return $pid
}

# Function to monitor memory usage
monitor_memory() {
    local monitor_file="$RESULTS_DIR/memory_monitor.log"
    echo "Starting memory monitoring..."

    while true; do
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        local memory_usage=$(free -h | grep '^Mem:' | awk '{print $3 "/" $2}')
        local load_avg=$(uptime | awk -F'load average:' '{print $2}')
        local process_count=$(ps aux | grep 'npx claude-flow-novice\|sqlite-cli' | grep -v grep | wc -l)

        echo "$timestamp | Memory: $memory_usage | Load: $load_avg | Processes: $process_count" >> "$monitor_file"
        sleep 2
    done &

    local monitor_pid=$!
    echo "$monitor_pid" > "$RESULTS_DIR/monitor.pid"
    echo "Memory monitor PID: $monitor_pid"
}

# List of agents with SQLite lifecycle hooks to test
declare -a agents=(
    "docker-specialist"
    "backend-developer"
    "graphql-specialist"
    "database-architect"
    "api-gateway-specialist"
    "devops-engineer"
    "rust-developer"
    "cto-agent"
    "z-ai-specialist"
    "github-commit-agent"
)

# Start memory monitoring
monitor_memory

# Wait a moment for monitoring to start
sleep 2

echo ""
echo "🎯 Launching 10 agents in parallel..."
echo ""

# Launch all agents in parallel
for i in "${!agents[@]}"; do
    agent_id=$((i + 1))
    agent_name="${agents[$i]}"

    launch_agent "$agent_id" "$agent_name"

    # Small delay between launches to avoid overwhelming
    sleep 0.5
done

echo ""
echo "⏳ Waiting for agents to complete (60 second timeout)..."
echo ""

# Wait for all agents to complete or timeout
for i in "${!agents[@]}"; do
    agent_id=$((i + 1))

    if [[ -f "$RESULTS_DIR/agent_${agent_id}.pid" ]]; then
        pid=$(cat "$RESULTS_DIR/agent_${agent_id}.pid")

        if kill -0 "$pid" 2>/dev/null; then
            echo "⏳ Agent ${agent_id} still running, waiting..."
            wait "$pid" 2>/dev/null || echo "Agent ${agent_id} timed out or failed"
        else
            echo "✅ Agent ${agent_id} completed"
        fi
    fi
done

echo ""
echo "🛑 Stopping memory monitor..."
if [[ -f "$RESULTS_DIR/monitor.pid" ]]; then
    monitor_pid=$(cat "$RESULTS_DIR/monitor.pid")
    kill "$monitor_pid" 2>/dev/null || true
fi

echo ""
echo "📊 Collecting final metrics..."

# Final system state
echo "=== FINAL SYSTEM STATE ===" >> "$RESULTS_DIR/final_state.log"
echo "Timestamp: $(date)" >> "$RESULTS_DIR/final_state.log"
echo "Memory usage:" >> "$RESULTS_DIR/final_state.log"
free -h >> "$RESULTS_DIR/final_state.log"
echo "" >> "$RESULTS_DIR/final_state.log"
echo "Running processes:" >> "$RESULTS_DIR/final_state.log"
ps aux | grep -E '(npx claude-flow-novice|sqlite-cli)' | grep -v grep >> "$RESULTS_DIR/final_state.log" || echo "No matching processes found" >> "$RESULTS_DIR/final_state.log"

echo ""
echo "📋 Results Summary:"
echo "=================="
echo "Results directory: $RESULTS_DIR"
echo "Memory log: $RESULTS_DIR/memory_monitor.log"
echo "Final state: $RESULTS_DIR/final_state.log"
echo ""

# Count completed vs failed agents
completed=0
failed=0

for i in "${!agents[@]}"; do
    agent_id=$((i + 1))
    output_file="$RESULTS_DIR/agent_${agent_id}_output.log"
    error_file="$RESULTS_DIR/agent_${agent_id}_error.log"

    if [[ -f "$output_file" ]] && [[ -s "$output_file" ]]; then
        ((completed++))
        echo "✅ Agent $agent_id: Output captured"
    else
        ((failed++))
        echo "❌ Agent $agent_id: No output"
        if [[ -f "$error_file" ]] && [[ -s "$error_file" ]]; then
            echo "   Error: $(head -1 "$error_file")"
        fi
    fi
done

echo ""
echo "🎯 Experiment Complete!"
echo "Completed: $completed agents"
echo "Failed: $failed agents"
echo ""
echo "Check $RESULTS_DIR for detailed logs"