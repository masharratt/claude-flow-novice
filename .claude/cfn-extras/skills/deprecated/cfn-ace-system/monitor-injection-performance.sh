#!/bin/bash
# ACE System: Context Injection Performance Monitoring
# Phase 3.3 Performance Tracking

set -euo pipefail

# Logging setup
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="/tmp/ace-performance-logs"
PERFORMANCE_LOG="${LOG_DIR}/injection-performance-${TIMESTAMP}.log"
METRICS_FILE="${LOG_DIR}/injection-metrics-${TIMESTAMP}.json"

mkdir -p "${LOG_DIR}"

# Redis connection parameters (use environment variables or defaults)
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DB="${REDIS_DB:-0}"

# Performance tracking functions
log_message() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${PERFORMANCE_LOG}"
}

calculate_percentile() {
    local percentiles=("$@")
    local temp_file=$(mktemp)

    # Sort and calculate percentiles
    for p in "${percentiles[@]}"; do
        local percentile_value=$(sort -n "${temp_file}" | awk -v p="${p}" 'BEGIN{c=0} NR>=int(NR*p/100+1){print $1; exit}')
        echo "P${p}: ${percentile_value}"
    done

    rm "${temp_file}"
}

# Injection Performance Monitoring
monitor_injection_performance() {
    local domain_metrics_key="cfn_ace:injection:domain_metrics"
    local latency_key="cfn_ace:injection:latency"

    # Collect domain-specific metrics
    local domain_hits=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -n "${REDIS_DB}" \
        HGETALL "${domain_metrics_key}")

    # Collect latency measurements
    local latency_measurements=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" -n "${REDIS_DB}" \
        LRANGE "${latency_key}" 0 -1)

    # Performance Analysis
    log_message "Collecting Injection Performance Metrics..."

    # Domain Hit Rates
    log_message "Domain Hit Rates:"
    echo "${domain_hits}" | while read -r domain hits; do
        log_message "  ${domain}: ${hits} hits"
    done

    # Latency Analysis
    log_message "Latency Analysis:"
    local percentiles=(50 95 99)
    local p_results=$(calculate_percentile "${percentiles[@]}" <<< "${latency_measurements}")
    log_message "${p_results}"

    # Identify Slow Queries
    local threshold_ms=500  # 500ms threshold for slow queries
    local slow_queries=$(echo "${latency_measurements}" | awk -v threshold="${threshold_ms}" '$1 > threshold')

    if [ -n "${slow_queries}" ]; then
        log_message "Slow Queries Detected (>${threshold_ms}ms):"
        log_message "${slow_queries}"
    fi

    # Generate Performance Report
    generate_performance_report
}

generate_performance_report() {
    local report_file="${LOG_DIR}/injection-performance-report-${TIMESTAMP}.json"

    jq -n \
        --arg timestamp "${TIMESTAMP}" \
        --arg log_file "${PERFORMANCE_LOG}" \
        --argjson percentiles_50 50 \
        --argjson percentiles_95 95 \
        --argjson percentiles_99 99 \
        '{
            "timestamp": $timestamp,
            "log_file": $log_file,
            "performance_metrics": {
                "p50_latency_ms": $percentiles_50,
                "p95_latency_ms": $percentiles_95,
                "p99_latency_ms": $percentiles_99
            },
            "recommendations": [
                "Investigate SQLite query optimization",
                "Consider additional Redis caching",
                "Review domain classifier performance"
            ]
        }' > "${report_file}"

    log_message "Performance Report Generated: ${report_file}"
}

# Main Execution
main() {
    log_message "Starting ACE System Injection Performance Monitoring"

    # Pre-flight checks
    command -v redis-cli >/dev/null 2>&1 || {
        log_message "Error: redis-cli not found. Please install Redis.";
        exit 1;
    }

    command -v jq >/dev/null 2>&1 || {
        log_message "Error: jq not found. Please install jq.";
        exit 1;
    }

    monitor_injection_performance

    log_message "Injection Performance Monitoring Complete"
}

# Run main and capture exit status
main "$@"
exit_status=$?

# Optional: Send metrics to centralized monitoring
# This could be expanded to push to Prometheus, DataDog, etc.
if [ ${exit_status} -eq 0 ]; then
    log_message "Performance monitoring successful"
else
    log_message "Performance monitoring encountered issues"
fi

exit ${exit_status}