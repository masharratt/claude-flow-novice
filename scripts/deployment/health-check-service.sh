#!/bin/bash
# Health Check Service Implementation
# Implements comprehensive dependency health checks and monitoring
# Part of: DEPLOYMENT_PIPELINE_STANDARDS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Health check configuration
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
DB_PATH="${CFN_SKILLS_DB_PATH:-./config/skills.db}"
CONFIG_PATH="${CFN_CONFIG_PATH:-./config}"

# Thresholds
LATENCY_THRESHOLD_MS=50
MIN_DISK_SPACE_GB=1
CRITICAL_DISK_SPACE_GB=0.1
MAX_MEMORY_PERCENT=90

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Health status tracking
declare -A COMPONENT_STATUS
declare -A COMPONENT_DETAILS

# ============================================================================
# Individual Component Health Checks
# ============================================================================

check_redis_health() {
    local COMPONENT="redis"
    echo -n "[CHECK] Redis ($REDIS_HOST:$REDIS_PORT)... "

    local START_TIME=$(date +%s%N)

    # Try to connect
    if ! timeout 5 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        echo -e "${RED}✗ UNHEALTHY${NC}"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="Connection failed"
        return 1
    fi

    local END_TIME=$(date +%s%N)
    local LATENCY_MS=$(( (END_TIME - START_TIME) / 1000000 ))

    if [[ $LATENCY_MS -gt $LATENCY_THRESHOLD_MS ]]; then
        echo -e "${YELLOW}⚠ DEGRADED${NC} (latency: ${LATENCY_MS}ms)"
        COMPONENT_STATUS["$COMPONENT"]="degraded"
        COMPONENT_DETAILS["$COMPONENT"]="High latency: ${LATENCY_MS}ms"
        return 1
    fi

    echo -e "${GREEN}✓ HEALTHY${NC} (latency: ${LATENCY_MS}ms)"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="Latency: ${LATENCY_MS}ms"
    return 0
}

check_database_health() {
    local COMPONENT="database"
    echo -n "[CHECK] Skills Database ($DB_PATH)... "

    if [[ ! -f "$DB_PATH" ]]; then
        echo -e "${RED}✗ UNHEALTHY${NC}"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="Database file not found"
        return 1
    fi

    # Check if database is accessible
    if ! sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master;" > /dev/null 2>&1; then
        echo -e "${RED}✗ UNHEALTHY${NC}"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="Database is corrupted or inaccessible"
        return 1
    fi

    # Get database size
    local DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo 0)
    local DB_SIZE_MB=$((DB_SIZE / 1024 / 1024))

    echo -e "${GREEN}✓ HEALTHY${NC} (size: ${DB_SIZE_MB}MB)"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="Size: ${DB_SIZE_MB}MB"
    return 0
}

check_file_system_health() {
    local COMPONENT="file_system"
    echo -n "[CHECK] File System ($CONFIG_PATH)... "

    if [[ ! -d "$CONFIG_PATH" ]]; then
        echo -e "${RED}✗ UNHEALTHY${NC}"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="Configuration directory not found"
        return 1
    fi

    # Check write permission
    if ! touch "${CONFIG_PATH}/.healthcheck" 2>/dev/null; then
        echo -e "${RED}✗ UNHEALTHY${NC}"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="No write permission"
        return 1
    fi
    rm -f "${CONFIG_PATH}/.healthcheck"

    echo -e "${GREEN}✓ HEALTHY${NC}"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="Read/write accessible"
    return 0
}

check_disk_space() {
    local COMPONENT="disk_space"
    echo -n "[CHECK] Disk Space... "

    local AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')  # in 1K blocks
    local AVAILABLE_GB=$((AVAILABLE_SPACE / 1024 / 1024))

    if [[ $AVAILABLE_GB -lt $CRITICAL_DISK_SPACE_GB ]]; then
        echo -e "${RED}✗ UNHEALTHY${NC} (${AVAILABLE_GB}GB)"
        COMPONENT_STATUS["$COMPONENT"]="unhealthy"
        COMPONENT_DETAILS["$COMPONENT"]="Critical: Only ${AVAILABLE_GB}GB available"
        return 1
    fi

    if [[ $AVAILABLE_GB -lt $MIN_DISK_SPACE_GB ]]; then
        echo -e "${YELLOW}⚠ DEGRADED${NC} (${AVAILABLE_GB}GB)"
        COMPONENT_STATUS["$COMPONENT"]="degraded"
        COMPONENT_DETAILS["$COMPONENT"]="Low: ${AVAILABLE_GB}GB available"
        return 1
    fi

    echo -e "${GREEN}✓ HEALTHY${NC} (${AVAILABLE_GB}GB available)"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="Available: ${AVAILABLE_GB}GB"
    return 0
}

check_memory_usage() {
    local COMPONENT="memory"
    echo -n "[CHECK] Memory Usage... "

    local MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100)}')

    if [[ $MEMORY_USAGE -gt $MAX_MEMORY_PERCENT ]]; then
        echo -e "${YELLOW}⚠ DEGRADED${NC} (${MEMORY_USAGE}%)"
        COMPONENT_STATUS["$COMPONENT"]="degraded"
        COMPONENT_DETAILS["$COMPONENT"]="Usage: ${MEMORY_USAGE}%"
        return 1
    fi

    echo -e "${GREEN}✓ HEALTHY${NC} (${MEMORY_USAGE}% used)"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="Usage: ${MEMORY_USAGE}%"
    return 0
}

check_critical_processes() {
    local COMPONENT="processes"
    echo -n "[CHECK] Critical Processes... "

    local MISSING_PROCESSES=()
    local CRITICAL_PROCESSES=()

    # Only check for running processes if in Docker/container
    if [[ -f /.dockerenv ]] || [[ -f /run/.containerenv ]]; then
        CRITICAL_PROCESSES=("node")
    else
        CRITICAL_PROCESSES=()  # Don't check in non-container environments
    fi

    for PROCESS in "${CRITICAL_PROCESSES[@]}"; do
        if ! pgrep -x "$PROCESS" > /dev/null; then
            MISSING_PROCESSES+=("$PROCESS")
        fi
    done

    if [[ ${#MISSING_PROCESSES[@]} -gt 0 ]]; then
        echo -e "${YELLOW}⚠ DEGRADED${NC} (missing: ${MISSING_PROCESSES[*]})"
        COMPONENT_STATUS["$COMPONENT"]="degraded"
        COMPONENT_DETAILS["$COMPONENT"]="Missing: ${MISSING_PROCESSES[*]}"
        return 1
    fi

    echo -e "${GREEN}✓ HEALTHY${NC}"
    COMPONENT_STATUS["$COMPONENT"]="healthy"
    COMPONENT_DETAILS["$COMPONENT"]="All critical processes running"
    return 0
}

# ============================================================================
# Aggregate Health Check
# ============================================================================

run_full_health_check() {
    echo ""
    echo "======================================================================"
    echo "FULL SYSTEM HEALTH CHECK"
    echo "Timestamp: $TIMESTAMP"
    echo "======================================================================"
    echo ""

    local FAILED=0

    # Run all checks
    check_redis_health || ((FAILED++))
    check_database_health || ((FAILED++))
    check_file_system_health || ((FAILED++))
    check_disk_space || ((FAILED++))
    check_memory_usage || ((FAILED++))
    check_critical_processes || ((FAILED++))

    echo ""
    return $FAILED
}

# ============================================================================
# Health Report Generation
# ============================================================================

generate_health_report() {
    local REPORT_FILE="${1:--}"

    local UNHEALTHY_COUNT=0
    local DEGRADED_COUNT=0
    local HEALTHY_COUNT=0

    for STATUS in "${COMPONENT_STATUS[@]}"; do
        case "$STATUS" in
            unhealthy) ((UNHEALTHY_COUNT++)) ;;
            degraded) ((DEGRADED_COUNT++)) ;;
            healthy) ((HEALTHY_COUNT++)) ;;
        esac
    done

    local OVERALL_STATUS="healthy"
    [[ $UNHEALTHY_COUNT -gt 0 ]] && OVERALL_STATUS="unhealthy"
    [[ $UNHEALTHY_COUNT -eq 0 && $DEGRADED_COUNT -gt 0 ]] && OVERALL_STATUS="degraded"

    local REPORT=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "overall_status": "$OVERALL_STATUS",
  "summary": {
    "healthy": $HEALTHY_COUNT,
    "degraded": $DEGRADED_COUNT,
    "unhealthy": $UNHEALTHY_COUNT,
    "total": $((HEALTHY_COUNT + DEGRADED_COUNT + UNHEALTHY_COUNT))
  },
  "components": {
EOF
)

    local FIRST=1
    for COMPONENT in "${!COMPONENT_STATUS[@]}"; do
        [[ $FIRST -eq 0 ]] && REPORT+=","
        REPORT+=$(printf '\n    "%s": {\n' "$COMPONENT")
        REPORT+=$(printf '      "status": "%s",\n' "${COMPONENT_STATUS[$COMPONENT]}")
        REPORT+=$(printf '      "details": "%s"\n' "${COMPONENT_DETAILS[$COMPONENT]}")
        REPORT+="    }"
        FIRST=0
    done

    REPORT+=$(cat <<EOF

  },
  "uptime_seconds": $(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")
}
EOF
)

    if [[ "$REPORT_FILE" == "-" ]]; then
        echo "$REPORT"
    else
        echo "$REPORT" > "$REPORT_FILE"
        echo "Report saved to: $REPORT_FILE"
    fi
}

# ============================================================================
# Continuous Monitoring
# ============================================================================

monitor_health_continuous() {
    local INTERVAL="${1:-60}"  # Default 60 second interval
    local MAX_ITERATIONS="${2:-0}"  # 0 = infinite

    local ITERATION=0

    echo "Starting continuous health monitoring (interval: ${INTERVAL}s)"
    echo "Press Ctrl+C to stop"
    echo ""

    while true; do
        # Clear screen (optional)
        # clear

        echo "[$(date +'%Y-%m-%d %H:%M:%S')] Health Check Iteration $((ITERATION + 1))"
        echo "========================================"

        run_full_health_check || true

        echo ""
        echo "Next check in ${INTERVAL}s (Ctrl+C to stop)"
        echo ""

        sleep "$INTERVAL"

        ((ITERATION++))
        if [[ $MAX_ITERATIONS -gt 0 && $ITERATION -ge $MAX_ITERATIONS ]]; then
            echo "Max iterations reached, stopping monitoring"
            break
        fi
    done
}

# ============================================================================
# API Health Endpoint (for container/service)
# ============================================================================

health_json_endpoint() {
    local UPTIME=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo "0")

    local UNHEALTHY_COUNT=0
    local DEGRADED_COUNT=0
    local HEALTHY_COUNT=0

    for STATUS in "${COMPONENT_STATUS[@]}"; do
        case "$STATUS" in
            unhealthy) ((UNHEALTHY_COUNT++)) ;;
            degraded) ((DEGRADED_COUNT++)) ;;
            healthy) ((HEALTHY_COUNT++)) ;;
        esac
    done

    local OVERALL_STATUS="healthy"
    [[ $UNHEALTHY_COUNT -gt 0 ]] && OVERALL_STATUS="unhealthy"
    [[ $UNHEALTHY_COUNT -eq 0 && $DEGRADED_COUNT -gt 0 ]] && OVERALL_STATUS="degraded"

    cat <<EOF
{
  "status": "$OVERALL_STATUS",
  "timestamp": "$TIMESTAMP",
  "components": {
EOF

    local FIRST=1
    for COMPONENT in "${!COMPONENT_STATUS[@]}"; do
        [[ $FIRST -eq 0 ]] && echo ","
        cat <<EOF2
    "$COMPONENT": {
      "status": "${COMPONENT_STATUS[$COMPONENT]}",
      "details": "${COMPONENT_DETAILS[$COMPONENT]}"
    }
EOF2
        FIRST=0
    done

    cat <<EOF
  },
  "version": "1.0",
  "uptime_seconds": $UPTIME
}
EOF
}

# ============================================================================
# CLI Interface
# ============================================================================

usage() {
    cat << 'EOF'
Health Check Service

Usage: health-check-service.sh <command> [options]

Commands:
  check-all               Run all health checks
  check-redis             Check Redis connectivity and latency
  check-database          Check Skills database
  check-filesystem        Check file system health
  check-disk              Check disk space
  check-memory            Check memory usage
  check-processes         Check critical processes

  report [file]           Generate health report (JSON)
  report-json             Output JSON health report to stdout

  monitor [interval] [max-iterations]  Start continuous monitoring
                          Default interval: 60 seconds
                          Default max iterations: infinite (0)

  help                    Show this help message

Examples:
  health-check-service.sh check-all
  health-check-service.sh report /tmp/health-report.json
  health-check-service.sh monitor 30
  health-check-service.sh monitor 30 10

EOF
}

# ============================================================================
# Main
# ============================================================================

COMMAND="${1:-help}"

case "$COMMAND" in
    check-all)
        run_full_health_check
        ;;
    check-redis)
        check_redis_health
        ;;
    check-database)
        check_database_health
        ;;
    check-filesystem)
        check_file_system_health
        ;;
    check-disk)
        check_disk_space
        ;;
    check-memory)
        check_memory_usage
        ;;
    check-processes)
        check_critical_processes
        ;;
    report)
        run_full_health_check || true
        generate_health_report "${2:--}"
        ;;
    report-json)
        run_full_health_check || true
        health_json_endpoint
        ;;
    monitor)
        run_full_health_check || true
        monitor_health_continuous "${2:-60}" "${3:-0}"
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        echo "Unknown command: $COMMAND" >&2
        usage
        exit 1
        ;;
esac

exit $?
