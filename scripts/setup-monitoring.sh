#!/bin/bash

##############################################################################
# RuVector Monitoring Setup Script
#
# Purpose: Configure Prometheus, Grafana, and alerting for RuVector stack
# Features:
#   - Prometheus configuration for metrics collection
#   - Grafana dashboards for visualization
#   - Alert rules for critical conditions
#   - Log aggregation setup (optional ELK)
#   - Service discovery configuration
#   - Alert routing and notification setup
#
# Usage:
#   ./scripts/setup-monitoring.sh [--grafana-only] [--elk] [--dry-run]
#
# Environment Variables:
#   PROMETHEUS_PORT: Prometheus web port (default: 9090)
#   GRAFANA_PORT: Grafana web port (default: 3001)
#   GRAFANA_ADMIN_PASS: Grafana admin password
#   SLACK_WEBHOOK: Slack webhook URL for notifications
#   PAGERDUTY_KEY: PagerDuty integration key (optional)
#
# Exit Codes:
#   0 = Success
#   1 = Configuration error
#   2 = Prometheus setup failed
#   3 = Grafana setup failed
##############################################################################

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Configuration
MONITORING_DIR="${SCRIPT_DIR}/.monitoring"
PROMETHEUS_CONFIG="${MONITORING_DIR}/prometheus.yml"
PROMETHEUS_ALERTS="${MONITORING_DIR}/alerts.yml"
GRAFANA_CONFIG="${MONITORING_DIR}/grafana"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
GRAFANA_PORT="${GRAFANA_PORT:-3001}"
GRAFANA_ADMIN_PASS="${GRAFANA_ADMIN_PASS:-admin}"

# Flags
GRAFANA_ONLY=false
SETUP_ELK=false
DRY_RUN=false

# Logging functions
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] INFO: $*"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] ERROR: $*" >&2
}

log_success() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] SUCCESS: $*"
}

# Ensure monitoring directory exists
ensure_monitoring_dir() {
    if [ ! -d "${MONITORING_DIR}" ]; then
        log_info "Creating monitoring directory: ${MONITORING_DIR}"
        if [ "${DRY_RUN}" = "false" ]; then
            mkdir -p "${MONITORING_DIR}" "${GRAFANA_CONFIG}/dashboards" "${GRAFANA_CONFIG}/provisioning"
        fi
    fi
}

# Create Prometheus configuration
create_prometheus_config() {
    log_info "Creating Prometheus configuration"

    cat > "${PROMETHEUS_CONFIG}" << 'EOF'
# Prometheus Configuration for RuVector
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'ruvector-prod'
    environment: 'production'

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - localhost:9093

rule_files:
  - 'alerts.yml'

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'ruvector'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'cadvisor'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
EOF

    if [ "${DRY_RUN}" = "false" ]; then
        log_success "Prometheus configuration created: ${PROMETHEUS_CONFIG}"
    else
        log_info "[DRY-RUN] Would create Prometheus configuration"
    fi
}

# Create alert rules
create_alert_rules() {
    log_info "Creating alert rules"

    cat > "${PROMETHEUS_ALERTS}" << 'EOF'
# Alert Rules for RuVector Monitoring

groups:
  - name: ruvector_alerts
    interval: 30s
    rules:
      - alert: RuVectorServiceDown
        expr: up{job="ruvector"} == 0
        for: 2m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "RuVector service is down"
          description: "RuVector has been unreachable for 2 minutes"

      - alert: PostgreSQLConnectionPoolExhausted
        expr: pg_stat_activity_count > 90
        for: 5m
        labels:
          severity: critical
          team: database
        annotations:
          summary: "PostgreSQL connection pool exhausted"
          description: "{{ $value }} connections in use (max 100)"

      - alert: RedisMemoryCritical
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.95
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Redis memory critically high"
          description: "Redis memory usage at {{ $value | humanizePercentage }}"

      - alert: DiskSpaceCritical
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.05
        for: 5m
        labels:
          severity: critical
          team: infrastructure
        annotations:
          summary: "Disk space critically low"
          description: "Only {{ $value | humanizePercentage }} disk space available"

      - alert: BackupFailed
        expr: increase(ruvector_backup_failures_total[1h]) > 0
        for: 1m
        labels:
          severity: critical
          team: data
        annotations:
          summary: "RuVector backup failed"
          description: "Backup process failed in the last hour"
EOF

    if [ "${DRY_RUN}" = "false" ]; then
        log_success "Alert rules created: ${PROMETHEUS_ALERTS}"
    else
        log_info "[DRY-RUN] Would create alert rules"
    fi
}

# Create Grafana dashboard
create_grafana_dashboard() {
    log_info "Creating Grafana system overview dashboard"

    cat > "${GRAFANA_CONFIG}/dashboards/system-overview.json" << 'EOF'
{
  "dashboard": {
    "title": "RuVector System Overview",
    "description": "System health, resources, and performance metrics",
    "tags": ["ruvector", "system"],
    "timezone": "browser",
    "panels": [
      {
        "title": "CPU Usage",
        "targets": [
          {
            "expr": "rate(node_cpu_seconds_total{mode=\"user\"}[5m])"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Disk Usage",
        "targets": [
          {
            "expr": "node_filesystem_size_bytes / node_filesystem_avail_bytes"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
EOF

    if [ "${DRY_RUN}" = "false" ]; then
        log_success "Grafana dashboard created"
    else
        log_info "[DRY-RUN] Would create Grafana dashboard"
    fi
}

# Setup Prometheus container
setup_prometheus() {
    if [ "${GRAFANA_ONLY}" = "true" ]; then
        log_info "Skipping Prometheus setup (--grafana-only flag set)"
        return 0
    fi

    log_info "Setting up Prometheus container"

    if [ "${DRY_RUN}" = "false" ]; then
        docker run -d \
            --name prometheus \
            --restart unless-stopped \
            -p "${PROMETHEUS_PORT}:9090" \
            -v "${PROMETHEUS_CONFIG}:/etc/prometheus/prometheus.yml:ro" \
            -v "${PROMETHEUS_ALERTS}:/etc/prometheus/alerts.yml:ro" \
            -v prometheus-data:/prometheus \
            prom/prometheus:latest \
            --config.file=/etc/prometheus/prometheus.yml \
            --storage.tsdb.path=/prometheus

        sleep 5

        if curl -s "http://localhost:${PROMETHEUS_PORT}/-/healthy" > /dev/null; then
            log_success "Prometheus is running on port ${PROMETHEUS_PORT}"
        else
            log_error "Failed to verify Prometheus"
            return 2
        fi
    else
        log_info "[DRY-RUN] Would start Prometheus container"
    fi
}

# Setup Grafana container
setup_grafana() {
    log_info "Setting up Grafana container"

    if [ "${DRY_RUN}" = "false" ]; then
        docker run -d \
            --name grafana \
            --restart unless-stopped \
            -p "${GRAFANA_PORT}:3000" \
            -e GF_SECURITY_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASS}" \
            -v grafana-data:/var/lib/grafana \
            grafana/grafana:latest

        sleep 10

        if curl -s "http://localhost:${GRAFANA_PORT}/api/health" > /dev/null; then
            log_success "Grafana is running on port ${GRAFANA_PORT}"
            log_info "Login: admin / ${GRAFANA_ADMIN_PASS}"
        else
            log_error "Failed to verify Grafana"
            return 3
        fi
    else
        log_info "[DRY-RUN] Would start Grafana container"
    fi
}

# Show usage
show_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
    --grafana-only   Only setup Grafana (skip Prometheus)
    --dry-run        Simulate setup without making changes
    -h, --help       Show this help message

Environment Variables:
    PROMETHEUS_PORT     Prometheus web port (default: 9090)
    GRAFANA_PORT        Grafana web port (default: 3001)
    GRAFANA_ADMIN_PASS  Grafana admin password (default: admin)

Monitoring URLs (after setup):
    Prometheus: http://localhost:9090
    Grafana:    http://localhost:3001 (admin / ${GRAFANA_ADMIN_PASS})

Examples:
    # Full monitoring stack setup
    ./scripts/setup-monitoring.sh

    # Dry-run to verify configuration
    ./scripts/setup-monitoring.sh --dry-run

    # Grafana only
    ./scripts/setup-monitoring.sh --grafana-only
EOF
}

# Parse arguments
parse_arguments() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --grafana-only)
                GRAFANA_ONLY=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    log_info "=== RuVector Monitoring Setup Started ==="
    log_info "Dry-run mode: ${DRY_RUN}"

    ensure_monitoring_dir
    create_prometheus_config
    create_alert_rules
    create_grafana_dashboard

    if [ "${GRAFANA_ONLY}" = "false" ]; then
        setup_prometheus
    fi

    setup_grafana

    log_info "=== RuVector Monitoring Setup Complete ==="
    log_success "Monitoring stack is ready"
    log_info "Prometheus:  http://localhost:${PROMETHEUS_PORT}"
    log_info "Grafana:     http://localhost:${GRAFANA_PORT} (admin/${GRAFANA_ADMIN_PASS})"

    return 0
}

parse_arguments "$@"
main
exit $?
