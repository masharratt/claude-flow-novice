#!/bin/bash
#
# DEPRECATION NOTICE
# ==================
# This shell script is DEPRECATED and should no longer be used.
# Please use the TypeScript implementation instead:
#
#   src/docker/build/   - TypeScript build modules
#   src/docker/scripts/ - TypeScript script modules
#
# The TypeScript versions provide:
#   - Full type safety with TypeScript
#   - Better error handling and validation
#   - Unit test coverage
#   - Consistent environment variable contracts
#
# Migration guide: See docs/SHELL_TO_TYPESCRIPT_MIGRATION.md
#
#!/bin/bash
# Memory Monitoring Wrapper for Docker Agent Containers
# Integrates memory monitoring with Redis coordination

set -euo pipefail

# Configuration
MEMORY_REPORT_INTERVAL=${MEMORY_REPORT_INTERVAL:-30}
MEMORY_ALERT_THRESHOLD=${MEMORY_ALERT_THRESHOLD:-80}
REDIS_HOST=${REDIS_HOST:-host.docker.internal}
REDIS_PORT=${REDIS_PORT:-6379}
AGENT_ID=${AGENT_ID:-unknown}
CONTAINER_NAME=${CONTAINER_NAME:-$(hostname)}

# Memory monitoring function
report_memory() {
    local timestamp=$(date +%s)
    local memory_usage
    local memory_mb
    local memory_limit_mb=${MEMORY_LIMIT:-2048}

    # Get memory usage with fallback
    if command -v free >/dev/null 2>&1; then
        memory_usage=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2}' 2>/dev/null || echo "0")
        memory_mb=$(free -m | awk 'NR==2{print $3}' 2>/dev/null || echo "0")
    elif command -v cat >/dev/null 2>&1; then
        # Fallback for containers without free command
        memory_usage=$(awk '/MemTotal/ {total=$2} /MemAvailable/ {avail=$2; printf "%.2f", ((total-avail)/total)*100}' /proc/meminfo 2>/dev/null || echo "0")
        memory_mb=$(awk '/MemTotal/ {total=$2} /MemAvailable/ {avail=$2; printf "%.0f", (total-avail)/1024}' /proc/meminfo 2>/dev/null || echo "0")
    else
        memory_usage="0"
        memory_mb="0"
    fi

    # Report to Redis
    if command -v redis-cli >/dev/null 2>&1; then
        # Store memory metrics
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            hset "cfn_memory:${AGENT_ID}:${timestamp}" \
            container_name "$CONTAINER_NAME" \
            memory_usage "$memory_usage" \
            memory_mb "$memory_mb" \
            memory_limit_mb "$memory_limit_mb" \
            timestamp "$timestamp" \
            agent_id "$AGENT_ID" >/dev/null 2>&1 || true

        # Set TTL for 24 hours
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            expire "cfn_memory:${AGENT_ID}:${timestamp}" 86400 >/dev/null 2>&1 || true

        # Alert if threshold exceeded
        if command -v bc >/dev/null 2>&1; then
            if (( $(echo "$memory_usage > $MEMORY_ALERT_THRESHOLD" | bc -l) )); then
                redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
                    lpush "cfn_memory_alerts" \
                    "{\"agent_id\":\"$AGENT_ID\",\"memory_usage\":\"$memory_usage\",\"timestamp\":$timestamp,\"container\":\"$CONTAINER_NAME\"}" >/dev/null 2>&1 || true
            fi
        fi

        # Update latest status
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            hset "cfn_memory_status:${AGENT_ID}" \
            latest_usage "$memory_usage" \
            latest_mb "$memory_mb" \
            latest_timestamp "$timestamp" \
            container_name "$CONTAINER_NAME" >/dev/null 2>&1 || true

        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            expire "cfn_memory_status:${AGENT_ID}" 3600 >/dev/null 2>&1 || true
    fi

    # Log locally
    mkdir -p /app/logs
    echo "[$timestamp] Memory: ${memory_usage}% (${memory_mb}MB/${memory_limit_mb}MB) - $CONTAINER_NAME" >> /app/logs/memory.log
}

# Health check with memory monitoring
health_check() {
    # Basic application health
    if ! node -e "console.log('healthy')" 2>/dev/null; then
        echo "Application health check failed"
        exit 1
    fi

    # Memory check
    local memory_usage
    if command -v free >/dev/null 2>&1; then
        memory_usage=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2}' 2>/dev/null || echo "0")
    elif command -v cat >/dev/null 2>&1; then
        memory_usage=$(awk '/MemTotal/ {total=$2} /MemAvailable/ {avail=$2; printf "%.2f", ((total-avail)/total)*100}' /proc/meminfo 2>/dev/null || echo "0")
    else
        memory_usage="0"
    fi

    if command -v bc >/dev/null 2>&1; then
        if (( $(echo "$memory_usage > 95" | bc -l) )); then
            echo "Critical memory usage: ${memory_usage}%"
            exit 1
        fi
    fi

    echo "Health check passed - Memory: ${memory_usage}%"
}

# Start memory monitoring daemon
start_monitoring() {
    echo "Starting memory monitoring (interval: ${MEMORY_REPORT_INTERVAL}s)..."

    while true; do
        report_memory
        sleep "$MEMORY_REPORT_INTERVAL"
    done &
    MONITOR_PID=$!
    echo $MONITOR_PID > /tmp/memory-monitor.pid
    echo "Memory monitoring started (PID: $MONITOR_PID)"
}

# Stop monitoring
stop_monitoring() {
    if [ -f /tmp/memory-monitor.pid ]; then
        local pid=$(cat /tmp/memory-monitor.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            echo "Memory monitoring stopped (PID: $pid)"
        fi
        rm -f /tmp/memory-monitor.pid
    fi
}

# Cleanup on exit
cleanup() {
    echo "Cleaning up..."
    stop_monitoring

    # Final memory report
    report_memory

    # Report container exit to Redis
    if command -v redis-cli >/dev/null 2>&1; then
        local timestamp=$(date +%s)
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            lpush "cfn_container_events" \
            "{\"agent_id\":\"$AGENT_ID\",\"event\":\"exit\",\"timestamp\":$timestamp,\"container\":\"$CONTAINER_NAME\"}" >/dev/null 2>&1 || true
    fi

    echo "Cleanup complete"
    exit 0
}

trap cleanup TERM INT

# Main execution
case "${1:-}" in
    "start-agent")
        echo "Starting agent with memory monitoring..."
        echo "Agent ID: $AGENT_ID"
        echo "Container: $CONTAINER_NAME"
        echo "Memory Limit: ${MEMORY_LIMIT:-2048}MB"
        echo "Alert Threshold: ${MEMORY_ALERT_THRESHOLD}%"

        # Report container start to Redis
        if command -v redis-cli >/dev/null 2>&1; then
            local timestamp=$(date +%s)
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
                lpush "cfn_container_events" \
                "{\"agent_id\":\"$AGENT_ID\",\"event\":\"start\",\"timestamp\":$timestamp,\"container\":\"$CONTAINER_NAME\"}" >/dev/null 2>&1 || true
        fi

        start_monitoring

        # Start the actual agent
        shift
        echo "Executing: node dist/cli/index.js $*"
        exec node dist/cli/index.js "$@"
        ;;
    "health-check")
        health_check
        ;;
    "report-memory")
        report_memory
        ;;
    "monitor-only")
        echo "Starting memory monitoring only mode..."
        start_monitoring
        # Keep container alive for monitoring
        while true; do
            sleep 60
        done
        ;;
    *)
        echo "Usage: $0 {start-agent|health-check|report-memory|monitor-only}"
        echo "Environment variables:"
        echo "  AGENT_ID: Agent identifier (default: unknown)"
        echo "  MEMORY_REPORT_INTERVAL: Seconds between reports (default: 30)"
        echo "  MEMORY_ALERT_THRESHOLD: Alert threshold % (default: 80)"
        echo "  MEMORY_LIMIT: Memory limit in MB (default: 2048)"
        echo "  REDIS_HOST: Redis server host (default: host.docker.internal)"
        echo "  REDIS_PORT: Redis server port (default: 6379)"
        echo "  CONTAINER_NAME: Container name (default: hostname)"
        exit 1
        ;;
esac