#!/usr/bin/env bash

###############################################################################
# Health Check Script for Integration Standardization System
#
# This script performs comprehensive health checks across all integration points.
# Exit codes:
#   0 = Healthy (all checks passed)
#   1 = Warning (some non-critical checks failed)
#   2 = Critical (system degradation detected)
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Defaults
VALIDATE_ALL=${VALIDATE_ALL:-false}
STRESS_TEST=${STRESS_TEST:-false}
FULL_SUITE=${FULL_SUITE:-false}
CONTINUOUS=${CONTINUOUS:-false}
INTERVAL=${INTERVAL:-30}
VERBOSE=${VERBOSE:-false}

# Threshold values
ERROR_RATE_CRITICAL=0.01
ERROR_RATE_WARNING=0.001
LATENCY_P99_CRITICAL=7500  # ms
LATENCY_P95_CRITICAL=3000  # ms
CPU_WARNING=75
CPU_CRITICAL=90
MEMORY_WARNING=80
MEMORY_CRITICAL=90
DISK_WARNING=70
DISK_CRITICAL=85

# Result tracking
HEALTH_STATUS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

###############################################################################
# Utility Functions
###############################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log_pass() {
    echo "✓ $*"
    ((PASSED_CHECKS++))
}

log_warn() {
    echo "⚠ $*"
    ((WARNING_CHECKS++))
    [[ $HEALTH_STATUS -lt 1 ]] && HEALTH_STATUS=1
}

log_fail() {
    echo "✗ $*"
    ((FAILED_CHECKS++))
    HEALTH_STATUS=2
}

###############################################################################
# Database Checks
###############################################################################

check_database_connectivity() {
    log "Checking database connectivity..."

    if pg_isready -h db.internal -p 5432 -U admin > /dev/null 2>&1; then
        log_pass "Database connectivity: OK"
        return 0
    else
        log_fail "Database connectivity: FAILED"
        return 1
    fi
}

check_database_pool() {
    log "Checking database connection pool..."

    ACTIVE_CONNS=$(psql -h db.internal -U admin -d cfn -t -c \
        "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || echo "0")
    MAX_CONNS=$(psql -h db.internal -U admin -d cfn -t -c \
        "SHOW max_connections;" 2>/dev/null | xargs || echo "100")

    POOL_USAGE=$(echo "scale=2; ($ACTIVE_CONNS / $MAX_CONNS) * 100" | bc 2>/dev/null || echo "0")

    if (( $(echo "$POOL_USAGE < 85" | bc -l) )); then
        log_pass "Database pool usage: ${POOL_USAGE}% (${ACTIVE_CONNS}/${MAX_CONNS})"
        return 0
    elif (( $(echo "$POOL_USAGE < 95" | bc -l) )); then
        log_warn "Database pool usage: ${POOL_USAGE}% (${ACTIVE_CONNS}/${MAX_CONNS}) - approaching limit"
        return 1
    else
        log_fail "Database pool usage: ${POOL_USAGE}% (${ACTIVE_CONNS}/${MAX_CONNS}) - CRITICAL"
        return 2
    fi
}

check_database_replication() {
    log "Checking database replication..."

    REP_LAG=$(psql -h db.internal -U admin -d cfn -t -c \
        "SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_wal_receive_lsn() < pg_current_wal_lsn()));" \
        2>/dev/null || echo "0")

    if (( $(echo "$REP_LAG < 30" | bc -l) )); then
        log_pass "Database replication lag: ${REP_LAG}s"
        return 0
    else
        log_warn "Database replication lag: ${REP_LAG}s"
        return 1
    fi
}

check_database_queries() {
    log "Checking database query performance..."

    # Test a simple query latency
    START=$(date +%s%N)
    psql -h db.internal -U admin -d cfn -t -c "SELECT 1;" > /dev/null 2>&1
    END=$(date +%s%N)
    QUERY_TIME=$(( (END - START) / 1000000 ))  # Convert to ms

    if [[ $QUERY_TIME -lt 100 ]]; then
        log_pass "Database query latency: ${QUERY_TIME}ms"
        return 0
    elif [[ $QUERY_TIME -lt 500 ]]; then
        log_warn "Database query latency: ${QUERY_TIME}ms"
        return 1
    else
        log_fail "Database query latency: ${QUERY_TIME}ms - CRITICAL"
        return 2
    fi
}

###############################################################################
# Redis/Coordination Checks
###############################################################################

check_redis_connectivity() {
    log "Checking Redis connectivity..."

    if redis-cli -h redis.internal PING > /dev/null 2>&1; then
        log_pass "Redis connectivity: OK"
        return 0
    else
        log_fail "Redis connectivity: FAILED"
        return 2
    fi
}

check_redis_memory() {
    log "Checking Redis memory usage..."

    MEMORY_USED=$(redis-cli -h redis.internal INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    MEMORY_PERCENT=$(redis-cli -h redis.internal INFO memory | grep used_memory_rss_human | cut -d: -f2 | tr -d '\r')

    log_pass "Redis memory: ${MEMORY_USED}"
    return 0
}

check_queue_depth() {
    log "Checking message queue depth..."

    QUEUE_SIZE=$(redis-cli -h redis.internal LLEN "coordination:queue" 2>/dev/null || echo "0")

    if [[ $QUEUE_SIZE -lt 500 ]]; then
        log_pass "Queue depth: $QUEUE_SIZE messages"
        return 0
    elif [[ $QUEUE_SIZE -lt 1000 ]]; then
        log_warn "Queue depth: $QUEUE_SIZE messages - elevated"
        return 1
    else
        log_fail "Queue depth: $QUEUE_SIZE messages - CRITICAL backlog"
        return 2
    fi
}

check_coordination_health() {
    log "Checking coordination protocol health..."

    # Test coordination latency
    START=$(date +%s%N)
    redis-cli -h redis.internal PING > /dev/null 2>&1
    END=$(date +%s%N)
    LATENCY=$(( (END - START) / 1000000 ))

    if [[ $LATENCY -lt 100 ]]; then
        log_pass "Coordination latency: ${LATENCY}ms"
        return 0
    elif [[ $LATENCY -lt 500 ]]; then
        log_warn "Coordination latency: ${LATENCY}ms"
        return 1
    else
        log_fail "Coordination latency: ${LATENCY}ms - CRITICAL"
        return 2
    fi
}

###############################################################################
# API/Integration Checks
###############################################################################

check_api_endpoints() {
    log "Checking API endpoint health..."

    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" http://api.internal:8080/health 2>/dev/null || echo "000")

    if [[ "$status_code" == "200" ]]; then
        log_pass "API health endpoint: OK (HTTP $status_code)"
        return 0
    else
        log_fail "API health endpoint: FAILED (HTTP $status_code)"
        return 2
    fi
}

check_integration_points() {
    log "Checking integration points..."

    declare -a POINTS=(
        "database_service"
        "coordination_protocol"
        "artifact_storage"
        "metrics_collection"
    )

    local failed=0
    for point in "${POINTS[@]}"; do
        if curl -s http://api.internal:8080/integrations/$point/status 2>/dev/null | grep -q "healthy"; then
            log_pass "Integration point '$point': OK"
        else
            log_fail "Integration point '$point': UNHEALTHY"
            ((failed++))
        fi
    done

    return $([[ $failed -eq 0 ]] && echo 0 || echo 2)
}

###############################################################################
# Resource Checks
###############################################################################

check_cpu_usage() {
    log "Checking CPU usage..."

    CPU_PERCENT=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}' || echo "0")
    CPU_INT=${CPU_PERCENT%.*}

    if [[ $CPU_INT -lt $CPU_WARNING ]]; then
        log_pass "CPU usage: ${CPU_INT}%"
        return 0
    elif [[ $CPU_INT -lt $CPU_CRITICAL ]]; then
        log_warn "CPU usage: ${CPU_INT}% - elevated"
        return 1
    else
        log_fail "CPU usage: ${CPU_INT}% - CRITICAL"
        return 2
    fi
}

check_memory_usage() {
    log "Checking memory usage..."

    MEM_USED=$(free | grep Mem | awk '{print int(($3/$2) * 100)}')

    if [[ $MEM_USED -lt $MEMORY_WARNING ]]; then
        log_pass "Memory usage: ${MEM_USED}%"
        return 0
    elif [[ $MEM_USED -lt $MEMORY_CRITICAL ]]; then
        log_warn "Memory usage: ${MEM_USED}% - elevated"
        return 1
    else
        log_fail "Memory usage: ${MEM_USED}% - CRITICAL"
        return 2
    fi
}

check_disk_usage() {
    log "Checking disk usage..."

    DISK_USED=$(df -h / | tail -1 | awk '{print int($5)}')

    if [[ $DISK_USED -lt $DISK_WARNING ]]; then
        log_pass "Disk usage: ${DISK_USED}%"
        return 0
    elif [[ $DISK_USED -lt $DISK_CRITICAL ]]; then
        log_warn "Disk usage: ${DISK_USED}% - elevated"
        return 1
    else
        log_fail "Disk usage: ${DISK_USED}% - CRITICAL"
        return 2
    fi
}

###############################################################################
# Kubernetes Checks
###############################################################################

check_kubernetes_deployment() {
    log "Checking Kubernetes deployment status..."

    if ! command -v kubectl &> /dev/null; then
        log_warn "kubectl not found - skipping K8s checks"
        return 1
    fi

    READY=$(kubectl get deployment integration-standardized -n production -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED=$(kubectl get deployment integration-standardized -n production -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")

    if [[ "$READY" == "$DESIRED" ]] && [[ "$DESIRED" -gt 0 ]]; then
        log_pass "Deployment status: $READY/$DESIRED replicas ready"
        return 0
    else
        log_fail "Deployment status: $READY/$DESIRED replicas ready"
        return 2
    fi
}

###############################################################################
# Data Consistency Checks
###############################################################################

check_data_consistency() {
    log "Checking data consistency..."

    ORPHANED=$(psql -h db.internal -U admin -d cfn -t -c \
        "SELECT count(*) FROM integration_tasks WHERE parent_id NOT IN (SELECT id FROM jobs);" \
        2>/dev/null || echo "0")

    if [[ $ORPHANED -eq 0 ]]; then
        log_pass "Data consistency: OK (no orphaned records)"
        return 0
    else
        log_fail "Data consistency: $ORPHANED orphaned records found"
        return 2
    fi
}

###############################################################################
# Feature Flag Checks
###############################################################################

check_feature_flags() {
    log "Checking feature flag status..."

    if curl -s http://feature-flag-service:8080/api/v1/flags/status 2>/dev/null | grep -q "enabled"; then
        log_pass "Feature flag service: OK"
        return 0
    else
        log_warn "Feature flag service: unavailable or all flags disabled"
        return 1
    fi
}

###############################################################################
# Main Execution
###############################################################################

print_header() {
    echo ""
    echo "==============================================================================="
    echo "Integration Standardization Health Check"
    echo "==============================================================================="
    echo "Time: $(date)"
    echo ""
}

print_summary() {
    echo ""
    echo "==============================================================================="
    echo "Summary"
    echo "==============================================================================="
    echo "Passed:  $PASSED_CHECKS"
    echo "Warnings: $WARNING_CHECKS"
    echo "Failed:  $FAILED_CHECKS"
    echo ""

    case $HEALTH_STATUS in
        0)
            echo "Status: ✓ HEALTHY"
            ;;
        1)
            echo "Status: ⚠ WARNING - Some checks failed but system operational"
            ;;
        2)
            echo "Status: ✗ CRITICAL - System degradation detected"
            ;;
    esac
    echo "==============================================================================="
    echo ""
}

run_all_checks() {
    check_database_connectivity || true
    check_database_pool || true
    check_database_replication || true
    check_database_queries || true

    check_redis_connectivity || true
    check_redis_memory || true
    check_queue_depth || true
    check_coordination_health || true

    check_api_endpoints || true
    check_integration_points || true

    check_cpu_usage || true
    check_memory_usage || true
    check_disk_usage || true

    check_kubernetes_deployment || true
    check_data_consistency || true
    check_feature_flags || true
}

main() {
    print_header

    if [[ "$CONTINUOUS" == "true" ]]; then
        while true; do
            run_all_checks
            print_summary
            log "Waiting ${INTERVAL}s before next check..."
            sleep "$INTERVAL"
        done
    else
        run_all_checks
        print_summary
    fi

    return $HEALTH_STATUS
}

# Run main function
main "$@"
