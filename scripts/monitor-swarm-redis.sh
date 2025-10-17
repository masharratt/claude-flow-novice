#!/bin/bash

##############################################################################
# Redis Swarm Coordination Monitor
#
# Real-time monitoring of Redis channels for agent coordination and feedback
# Phase 5: Validation & Monitoring
##############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DB="${REDIS_DB:-0}"
MONITOR_INTERVAL="${MONITOR_INTERVAL:-2}"
LOG_FILE="${LOG_FILE:-.artifacts/logs/redis-monitor.log}"

# Help text
show_help() {
    cat << EOF
${BLUE}Redis Swarm Coordination Monitor${NC}

Monitor Redis channels and queues for agent coordination and hook feedback

${YELLOW}Usage:${NC}
  $(basename "$0") [options] [mode]

${YELLOW}Modes:${NC}
  feedback       Monitor hook feedback channels (default)
  coordination   Monitor CFN Loop coordination
  queues         Monitor queue lengths and stale messages
  all            Monitor everything
  live           Live stream of all Redis events

${YELLOW}Options:${NC}
  --host HOST    Redis host (default: localhost)
  --port PORT    Redis port (default: 6379)
  --db DB        Redis database (default: 0)
  --interval N   Polling interval in seconds (default: 2)
  --log FILE     Log file path (default: .artifacts/logs/redis-monitor.log)
  --format json  Output as JSON instead of formatted text
  --help, -h     Show this help message

${YELLOW}Examples:${NC}
  # Monitor feedback channels
  $(basename "$0") feedback

  # Monitor CFN Loop coordination
  $(basename "$0") coordination

  # Monitor all with JSON output
  $(basename "$0") all --format json

  # Live stream all events
  $(basename "$0") live

  # Custom Redis connection
  $(basename "$0") --host redis.example.com --port 6380
EOF
}

# Parse arguments
MODE="feedback"
FORMAT="text"

while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            REDIS_HOST="$2"
            shift 2
            ;;
        --port)
            REDIS_PORT="$2"
            shift 2
            ;;
        --db)
            REDIS_DB="$2"
            shift 2
            ;;
        --interval)
            MONITOR_INTERVAL="$2"
            shift 2
            ;;
        --log)
            LOG_FILE="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        feedback|coordination|queues|all|live)
            MODE="$1"
            shift
            ;;
        *)
            echo -e "${RED}Error: Unknown argument $1${NC}" >&2
            show_help
            exit 1
            ;;
    esac
done

# Check Redis connection
check_redis() {
    if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" ping &>/dev/null; then
        echo -e "${RED}❌ Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT${NC}" >&2
        echo -e "${YELLOW}💡 Ensure Redis is running: redis-server${NC}" >&2
        exit 1
    fi
}

# Setup log file
setup_logging() {
    local log_dir=$(dirname "$LOG_FILE")
    mkdir -p "$log_dir"
    touch "$LOG_FILE"
}

# Get timestamp
timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Monitor feedback channels
monitor_feedback() {
    echo -e "${CYAN}📬 Monitoring Hook Feedback Channels${NC}"
    echo -e "${CYAN}═══════════════════════════════════${NC}"
    echo ""

    while true; do
        # Get all agent feedback channels
        local channels=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "agent:*:feedback" "coordinator:*:feedback" 2>/dev/null)

        if [ -z "$channels" ]; then
            echo -e "${YELLOW}⚠️  No feedback channels found${NC}"
        else
            for channel in $channels; do
                local queue_len=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" llen "$channel" 2>/dev/null)

                if [ "$queue_len" -gt 0 ]; then
                    echo -e "${GREEN}📨 $channel${NC} (${PURPLE}$queue_len${NC} messages)"

                    # Show recent messages
                    local messages=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" lrange "$channel" 0 2 2>/dev/null)

                    if [ -n "$messages" ]; then
                        echo "$messages" | while IFS= read -r msg; do
                            if [ -n "$msg" ] && [ "$msg" != "OK" ]; then
                                local feedback_type=$(echo "$msg" | jq -r '.type // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
                                local severity=$(echo "$msg" | jq -r '.severity // "info"' 2>/dev/null || echo "info")
                                local file=$(echo "$msg" | jq -r '.file // "N/A"' 2>/dev/null || echo "N/A")

                                case $severity in
                                    error)
                                        echo -e "  ${RED}❌${NC} [$feedback_type] $file"
                                        ;;
                                    warning)
                                        echo -e "  ${YELLOW}⚠️ ${NC} [$feedback_type] $file"
                                        ;;
                                    *)
                                        echo -e "  ${BLUE}ℹ️ ${NC} [$feedback_type] $file"
                                        ;;
                                esac
                            fi
                        done
                    fi
                    echo ""
                fi
            done
        fi

        sleep "$MONITOR_INTERVAL"
        clear
        echo -e "${CYAN}📬 Monitoring Hook Feedback Channels ($(timestamp))${NC}"
        echo -e "${CYAN}═════════════════════════════════════════════════════${NC}"
        echo ""
    done
}

# Monitor CFN Loop coordination
monitor_coordination() {
    echo -e "${PURPLE}🔄 Monitoring CFN Loop Coordination${NC}"
    echo -e "${PURPLE}═══════════════════════════════════${NC}"
    echo ""

    while true; do
        # Get all CFN Loop channels
        local cfn_channels=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "swarm:cfn:*" 2>/dev/null)

        if [ -z "$cfn_channels" ]; then
            echo -e "${YELLOW}⚠️  No CFN Loop channels found${NC}"
        else
            for channel in $cfn_channels; do
                local queue_len=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" llen "$channel" 2>/dev/null)

                if [ "$queue_len" -gt 0 ]; then
                    # Extract mode and phase from channel name
                    local mode=$(echo "$channel" | sed -E 's/^swarm:cfn:([^:]+):.*/\1/')
                    local loop=$(echo "$channel" | grep -oE 'loop[0-9]' | head -1)

                    echo -e "${GREEN}⚙️  $channel${NC}"
                    echo -e "   Mode: ${CYAN}$mode${NC} | Loop: ${YELLOW}$loop${NC} | Queue: ${PURPLE}$queue_len${NC} messages"

                    # Show oldest message (potential bottleneck)
                    local oldest=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" lindex "$channel" -1 2>/dev/null)
                    if [ -n "$oldest" ]; then
                        local msg_time=$(echo "$oldest" | jq -r '.timestamp // "unknown"' 2>/dev/null || echo "unknown")
                        echo -e "   Oldest: ${YELLOW}$msg_time${NC}"
                    fi
                    echo ""
                fi
            done
        fi

        sleep "$MONITOR_INTERVAL"
        clear
        echo -e "${PURPLE}🔄 Monitoring CFN Loop Coordination ($(timestamp))${NC}"
        echo -e "${PURPLE}═══════════════════════════════════════════════════${NC}"
        echo ""
    done
}

# Monitor queue lengths and stale messages
monitor_queues() {
    echo -e "${BLUE}📊 Monitoring Queue Status${NC}"
    echo -e "${BLUE}═══════════════════════════${NC}"
    echo ""

    while true; do
        # Get all list keys
        local all_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "*:feedback" "swarm:cfn:*" 2>/dev/null)

        if [ -z "$all_keys" ]; then
            echo -e "${YELLOW}⚠️  No queues found${NC}"
        else
            local total_queues=0
            local total_messages=0
            local stale_queues=0

            echo -e "${BLUE}Channel                                 Length  Oldest${NC}"
            echo -e "${BLUE}────────────────────────────────────── ──────  ──────${NC}"

            for key in $all_keys; do
                local len=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" llen "$key" 2>/dev/null)

                if [ "$len" -gt 0 ]; then
                    total_queues=$((total_queues + 1))
                    total_messages=$((total_messages + len))

                    # Check oldest message
                    local oldest=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" lindex "$key" -1 2>/dev/null)
                    local age="N/A"

                    if [ -n "$oldest" ]; then
                        local msg_time=$(echo "$oldest" | jq -r '.timestamp // ""' 2>/dev/null)
                        if [ -n "$msg_time" ]; then
                            local msg_epoch=$(date -d "$msg_time" +%s 2>/dev/null || echo 0)
                            local now_epoch=$(date +%s)
                            local age_seconds=$((now_epoch - msg_epoch))

                            if [ "$age_seconds" -gt 300 ]; then
                                stale_queues=$((stale_queues + 1))
                                age="${RED}${age_seconds}s${NC}"
                            else
                                age="${age_seconds}s"
                            fi
                        fi
                    fi

                    printf "%-40s %6s  %s\n" "$key" "$len" "$age"
                fi
            done

            echo ""
            echo -e "${GREEN}Total Queues:${NC} $total_queues | ${PURPLE}Total Messages:${NC} $total_messages | ${RED}Stale:${NC} $stale_queues"
        fi

        sleep "$MONITOR_INTERVAL"
        clear
        echo -e "${BLUE}📊 Monitoring Queue Status ($(timestamp))${NC}"
        echo -e "${BLUE}═════════════════════════════════════════${NC}"
        echo ""
    done
}

# Monitor all
monitor_all() {
    echo -e "${GREEN}🔍 Monitoring All Redis Coordination${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""

    while true; do
        # Feedback summary
        echo -e "${CYAN}📬 Feedback Channels${NC}"
        local feedback_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "agent:*:feedback" "coordinator:*:feedback" | wc -l)
        echo -e "   Active channels: ${PURPLE}$feedback_count${NC}"

        # CFN Loop summary
        echo -e "\n${PURPLE}🔄 CFN Loop Coordination${NC}"
        local cfn_count=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "swarm:cfn:*" | wc -l)
        echo -e "   Active channels: ${PURPLE}$cfn_count${NC}"

        # Queue summary
        echo -e "\n${BLUE}📊 Queue Status${NC}"
        local all_queues=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" keys "*:feedback" "swarm:cfn:*" 2>/dev/null)
        local total_messages=0

        if [ -n "$all_queues" ]; then
            for key in $all_queues; do
                local len=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" llen "$key" 2>/dev/null)
                total_messages=$((total_messages + len))
            done
        fi

        echo -e "   Total messages: ${PURPLE}$total_messages${NC}"

        sleep "$MONITOR_INTERVAL"
        clear
        echo -e "${GREEN}🔍 Monitoring All Redis Coordination ($(timestamp))${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
        echo ""
    done
}

# Live stream all events
monitor_live() {
    echo -e "${GREEN}📡 Live Redis Event Stream${NC}"
    echo -e "${GREEN}═════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""

    # Use Redis MONITOR command (use with caution - performance impact)
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" monitor 2>&1 | while read -r line; do
        # Filter for our channels
        if echo "$line" | grep -qE "(agent:|coordinator:|swarm:cfn:)"; then
            echo -e "${GREEN}$(timestamp)${NC} $line" | tee -a "$LOG_FILE"
        fi
    done
}

# Main execution
main() {
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Redis Swarm Coordination Monitor v1.0.0              ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    check_redis
    setup_logging

    echo -e "${BLUE}Redis:${NC} $REDIS_HOST:$REDIS_PORT (db$REDIS_DB)"
    echo -e "${BLUE}Mode:${NC} $MODE"
    echo -e "${BLUE}Log:${NC} $LOG_FILE"
    echo ""

    case $MODE in
        feedback)
            monitor_feedback
            ;;
        coordination)
            monitor_coordination
            ;;
        queues)
            monitor_queues
            ;;
        all)
            monitor_all
            ;;
        live)
            monitor_live
            ;;
        *)
            echo -e "${RED}Error: Unknown mode $MODE${NC}" >&2
            exit 1
            ;;
    esac
}

# Run
main
