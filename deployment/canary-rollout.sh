#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Canary Rollout Script
# Progressive deployment: 10% → 50% → 100%
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-production}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

check_error_rate() {
    # Query Prometheus for error rate
    local error_rate=$(curl -s 'http://prometheus:9090/api/v1/query?query=rate(workflow_codification_executions_total{status="failed"}[5m])' 2>/dev/null | grep -o '[0-9.]*' | head -1 || echo "0")
    echo "$error_rate"
}

check_latency() {
    # Query Prometheus for P95 latency
    local latency=$(curl -s 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95,rate(workflow_codification_duration_seconds_bucket[5m]))' 2>/dev/null | grep -o '[0-9.]*' | head -1 || echo "0")
    echo "$latency"
}

stage_deployment() {
    local stage=$1
    local percent=$2
    local monitoring_duration=$3

    log_info "=== Stage $stage: ${percent}% Canary Deployment ==="

    # Execute deployment
    if ! bash "$SCRIPT_DIR/deploy.sh" "$ENVIRONMENT" "$percent" "true"; then
        log_error "Deployment failed at stage $stage"
        return 1
    fi

    log_info "Monitoring for ${monitoring_duration} seconds"
    sleep "$monitoring_duration"

    # Check error rate
    local error_rate=$(check_error_rate)
    log_info "Error rate: $error_rate"

    if (( $(echo "$error_rate > 0.005" | bc -l 2>/dev/null || echo "0") )); then
        log_error "Error rate too high ($error_rate), initiating rollback"
        if ! bash "$SCRIPT_DIR/rollback.sh" "$ENVIRONMENT"; then
            log_error "Rollback failed!"
            return 1
        fi
        return 1
    fi

    # Check latency (only for 50% and 100%)
    if [ "$percent" -gt 10 ]; then
        local latency=$(check_latency)
        log_info "P95 latency: ${latency}s"

        if (( $(echo "$latency > 1.0" | bc -l 2>/dev/null || echo "0") )); then
            log_error "Latency too high ($latency), initiating rollback"
            if ! bash "$SCRIPT_DIR/rollback.sh" "$ENVIRONMENT"; then
                log_error "Rollback failed!"
                return 1
            fi
            return 1
        fi
    fi

    log_success "Stage $stage passed"
    return 0
}

main() {
    log_info "Starting canary rollout to $ENVIRONMENT"
    log_info ""

    # Stage 1: 10% traffic
    if ! stage_deployment "1" "10" "1800"; then
        log_error "Canary rollout failed at stage 1"
        exit 1
    fi

    echo ""
    log_success "Stage 1 (10%) passed, proceeding to Stage 2"
    echo ""

    # Stage 2: 50% traffic
    if ! stage_deployment "2" "50" "1800"; then
        log_error "Canary rollout failed at stage 2"
        exit 1
    fi

    echo ""
    log_success "Stage 2 (50%) passed, proceeding to Stage 3"
    echo ""

    # Stage 3: 100% traffic
    if ! stage_deployment "3" "100" "600"; then
        log_error "Canary rollout failed at stage 3"
        exit 1
    fi

    echo ""
    log_success "Canary rollout completed successfully"
    log_success "All traffic migrated to new version"
    log_info "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
}

main "$@"
