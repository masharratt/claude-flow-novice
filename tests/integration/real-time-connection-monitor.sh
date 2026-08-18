#!/usr/bin/env bash

# Real-time Connection Monitor
# Captures detailed connection behavior during Task() agent spawning

set -euo pipefail

# Configuration
MONITOR_INTERVAL=1
ZAI_API_IP="47.254.4.184"
LOG_FILE="/tmp/real-time-connection-monitor.log"
DETAILED_LOG="/tmp/real-time-connection-detailed.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_detailed() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$DETAILED_LOG"
}

capture_connection_state() {
    local timestamp=$(date +%s)
    local zai_connections=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | wc -l)
    local established_connections=$zai_connections
    local memory_mb=$(free -m | awk 'NR==2{print $3}')
    local claude_processes=$(pgrep -f "claude" | wc -l)

    # Capture connection details if any exist
    local connection_details=""
    if [ "$zai_connections" -gt 0 ]; then
        connection_details=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | head -10 | tr '\n' ';')
    fi

    # Detailed logging
    log_detailed "CONNECTION_STATE:$timestamp:$zai_connections:$established_connections:${memory_mb}:${claude_processes}"

    if [ -n "$connection_details" ]; then
        log_detailed "CONNECTION_DETAILS:$timestamp:$connection_details"
    fi

    # Console output
    printf "%-20s | %-8s | %-12s | %-8s | %-10s\n" \
        "$(date '+%H:%M:%S')" \
        "$zai_connections" \
        "$established_connections" \
        "${memory_mb}MB" \
        "$claude_processes"

    # Alert on concerning patterns
    if [ "$zai_connections" -gt 20 ]; then
        log "${RED}🚨 HIGH CONNECTION COUNT: $zai_connections connections to Z.ai${NC}"
    fi

    if [ "$memory_mb" -gt 10000 ]; then
        log "${RED}🚨 HIGH MEMORY USAGE: ${memory_mb}MB system memory${NC}"
    fi
}

monitor_agent_spawn() {
    local agent_type=$1
    local task_description=$2

    log "${BLUE}=== Starting Agent Spawn Test: $agent_type ===${NC}"
    log "Task: $task_description"

    # Capture baseline
    log "${YELLOW}📊 Capturing baseline...${NC}"
    sleep 2
    local baseline_zai=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | wc -l)
    local baseline_memory=$(free -m | awk 'NR==2{print $3}')

    log "Baseline - Z.ai connections: $baseline_zai, Memory: ${baseline_memory}MB"

    # Start monitoring in background
    log "${GREEN}▶️  Starting agent spawn...${NC}"
    printf "%-20s | %-8s | %-12s | %-8s | %-10s\n" \
        "Time" "Total" "Established" "Memory" "Claude Procs"
    printf "%-20s-+-%-8s-+-%-12s-+-%-8s-+-%-10s\n" \
        "--------------------" "--------" "------------" "--------" "----------"

    # Start the agent with timeout
    timeout 120s claude --dangerously-skip-permissions -r "$task_description" > "/tmp/agent_output_${agent_type}.txt" 2>&1 &
    local agent_pid=$!

    # Monitor during execution
    local max_connections=$baseline_zai
    local max_memory=$baseline_memory
    local connection_spikes=0
    local start_time=$(date +%s)

    while kill -0 "$agent_pid" 2>/dev/null; do
        capture_connection_state

        local current_zai=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | wc -l)
        local current_memory=$(free -m | awk 'NR==2{print $3}')

        if [ "$current_zai" -gt "$max_connections" ]; then
            max_connections=$current_zai
        fi
        if [ "$current_memory" -gt "$max_memory" ]; then
            max_memory=$current_memory
        fi

        # Detect connection spikes
        if [ "$current_zai" -gt $((baseline_zai + 5)) ]; then
            connection_spikes=$((connection_spikes + 1))
            log_detailed "CONNECTION_SPIKE:$(date +%s):$current_zai:$baseline_zai"
        fi

        sleep "$MONITOR_INTERVAL"

        # Safety timeout
        local elapsed=$(($(date +%s) - start_time))
        if [ "$elapsed" -gt 300 ]; then
            log "${RED}⚠️  Agent taking too long, terminating...${NC}"
            kill "$agent_pid" 2>/dev/null || true
            break
        fi
    done

    # Wait for completion
    wait "$agent_pid" 2>/dev/null || true

    printf "%-20s-+-%-8s-+-%-12s-+-%-8s-+-%-10s\n" \
        "--------------------" "--------" "------------" "--------" "----------"

    # Post-execution monitoring (watch connection cleanup)
    log "${YELLOW}🔍 Monitoring connection cleanup...${NC}"
    for i in {1..30}; do
        capture_connection_state
        sleep 2

        local current_zai=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | wc -l)
        if [ "$current_zai" -le $((baseline_zai + 2)) ]; then
            log "${GREEN}✅ Connections returned to baseline level${NC}"
            break
        fi
    done

    # Final analysis
    local final_zai=$(ss -tn state established "( dport = :443 or sport = :443 )" dst "$ZAI_API_IP" 2>/dev/null | wc -l)
    local final_memory=$(free -m | awk 'NR==2{print $3}')

    local zai_growth=$((final_zai - baseline_zai))
    local memory_growth=$((final_memory - baseline_memory))

    log "${BLUE}📋 Test Results for $agent_type:${NC}"
    echo "  Connection growth: $baseline_zai → $final_zai (Δ$zai_growth)"
    echo "  Memory growth: ${baseline_memory}MB → ${final_memory}MB (Δ${memory_growth}MB)"
    echo "  Max connections observed: $max_connections"
    echo "  Connection spikes: $connection_spikes"

    # Determine leak status
    local leak_detected=false
    if [ "$zai_growth" -gt 5 ]; then
        log "${RED}❌ CONNECTION LEAK DETECTED: +$zai_growth connections${NC}"
        leak_detected=true
    fi

    if [ "$memory_growth" -gt 500 ]; then
        log "${RED}❌ MEMORY GROWTH DETECTED: +${memory_growth}MB${NC}"
        leak_detected=true
    fi

    if [ "$leak_detected" = "false" ]; then
        log "${GREEN}✅ No significant leaks detected${NC}"
    fi

    log "Agent output saved to: /tmp/agent_output_${agent_type}.txt"
    echo ""
}

analyze_connection_patterns() {
    log "${BLUE}🔬 Analyzing connection patterns...${NC}"

    if [ ! -f "$DETAILED_LOG" ]; then
        log "${RED}❌ No detailed log found${NC}"
        return 1
    fi

    echo "Connection State Analysis:"
    echo "========================"

    # Extract connection states
    grep "CONNECTION_STATE:" "$DETAILED_LOG" | while IFS=':' read -r timestamp _ total established memory processes; do
        echo "$timestamp,$total,$established,$memory,$processes"
    done > /tmp/connection_states.csv

    # Find patterns
    log "Analyzing connection cleanup patterns..."

    # Look for connections that don't close
    local max_connections=$(awk -F',' '{print $2}' /tmp/connection_states.csv | sort -n | tail -1)
    local final_connections=$(tail -1 /tmp/connection_states.csv | awk -F',' '{print $2}')

    log "Maximum concurrent connections: $max_connections"
    log "Final connection count: $final_connections"

    if [ "$final_connections" -gt 5 ]; then
        log "${RED}⚠️  Unclosed connections detected${NC}"
    fi

    # Analyze connection details
    log "Analyzing connection port usage patterns..."
    grep "CONNECTION_DETAILS:" "$DETAILED_LOG" | head -20
}

# Test scenarios
test_scenario_1() {
    monitor_agent_spawn "simple_math" "What is 2+2? Return only the number 4."
}

test_scenario_2() {
    monitor_agent_spawn "text_processing" "Analyze this sentence: 'The quick brown fox jumps over the lazy dog.' Return a word count."
}

test_scenario_3() {
    monitor_agent_spawn "api_pattern" "Make a simple calculation: 15*23. Show your work step by step, then give the final answer."
}

test_scenario_4() {
    monitor_agent_spawn "memory_intensive" "List the first 100 prime numbers. Format them as a comma-separated list."
}

main() {
    log "${BLUE}🔍 Starting Real-Time Connection Monitor${NC}"
    log "Log file: $LOG_FILE"
    log "Detailed log: $DETAILED_LOG"

    # Clear previous logs
    > "$LOG_FILE"
    > "$DETAILED_LOG"

    # Check prerequisites
    if ! command -v ss >/dev/null 2>&1; then
        log "${RED}❌ ss command not available${NC}"
        exit 1
    fi

    # Run test scenarios
    log "Starting test scenarios..."

    test_scenario_1
    sleep 10

    test_scenario_2
    sleep 10

    test_scenario_3
    sleep 10

    test_scenario_4

    # Analyze patterns
    analyze_connection_patterns

    log "${GREEN}🎉 Real-time monitoring complete${NC}"
    log "Review logs:"
    log "  Main log: $LOG_FILE"
    log "  Detailed log: $DETAILED_LOG"
}

# Run main function
main "$@"