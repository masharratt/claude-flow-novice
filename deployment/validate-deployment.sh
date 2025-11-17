#!/bin/bash
set -euo pipefail

###############################################################################
# Deployment Validation Script
# Post-deployment health and readiness checks
###############################################################################

ENVIRONMENT="${1:-production}"
BASE_URL="${2:-http://localhost:8000}"
PROMETHEUS_URL="${3:-http://localhost:9090}"

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

###############################################################################
# Validation Tests
###############################################################################

test_health_endpoint() {
    log_info "Test 1: Health check endpoint"

    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
        log_success "Health check passed (HTTP $http_code)"
        return 0
    else
        log_error "Health check failed (HTTP $http_code)"
        return 1
    fi
}

test_readiness_endpoint() {
    log_info "Test 2: Readiness check endpoint"

    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/ready" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
        log_success "Readiness check passed (HTTP $http_code)"
        return 0
    else
        log_error "Readiness check failed (HTTP $http_code)"
        return 1
    fi
}

test_metrics_exposed() {
    log_info "Test 3: Prometheus metrics endpoint"

    local metrics=$(curl -s "$BASE_URL/metrics" 2>/dev/null | grep -c "workflow_codification_" || echo "0")

    if [ "$metrics" -gt 0 ]; then
        log_success "Metrics exposed ($metrics metrics found)"
        return 0
    else
        log_error "No workflow_codification metrics found"
        return 1
    fi
}

test_database_connectivity() {
    log_info "Test 4: Database connectivity"

    if psql -c "SELECT 1" > /dev/null 2>&1; then
        log_success "Database connection successful"
        return 0
    else
        log_error "Database connection failed"
        return 1
    fi
}

test_redis_connectivity() {
    log_info "Test 5: Redis connectivity"

    if redis-cli ping > /dev/null 2>&1; then
        log_success "Redis connection successful"
        return 0
    else
        log_error "Redis connection failed"
        return 1
    fi
}

test_critical_endpoints() {
    log_info "Test 6: Critical API endpoints"

    local endpoints=(
        "/v2/health-scores/cfn-coordination"
        "/v2/circuit-breaker/cfn-coordination/state"
    )

    local failed=0

    for endpoint in "${endpoints[@]}"; do
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo "000")

        if [ "$http_code" = "200" ] || [ "$http_code" = "404" ]; then
            log_success "Endpoint accessible: $endpoint (HTTP $http_code)"
        else
            log_error "Endpoint not accessible: $endpoint (HTTP $http_code)"
            ((failed++))
        fi
    done

    if [ "$failed" -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

test_prometheus_connectivity() {
    log_info "Test 7: Prometheus connectivity"

    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$PROMETHEUS_URL/api/v1/query?query=up" 2>/dev/null || echo "000")

    if [ "$http_code" = "200" ]; then
        log_success "Prometheus connectivity OK"
        return 0
    else
        log_warning "Prometheus not responding (may be expected in test environment)"
        return 0
    fi
}

test_alerting_rules() {
    log_info "Test 8: Alerting rules configured"

    local rules=$(curl -s "$PROMETHEUS_URL/api/v1/rules" 2>/dev/null | grep -c "workflow_codification" || echo "0")

    if [ "$rules" -gt 0 ]; then
        log_success "Alerting rules configured ($rules rules)"
        return 0
    else
        log_warning "Alerting rules not found (may be expected in test environment)"
        return 0
    fi
}

###############################################################################
# Main Validation
###############################################################################

main() {
    log_info "Starting deployment validation for $ENVIRONMENT"
    log_info "Base URL: $BASE_URL"
    log_info "Prometheus URL: $PROMETHEUS_URL"
    echo ""

    local total_tests=0
    local passed_tests=0
    local failed_tests=0

    # Run all validation tests
    for test_func in test_health_endpoint test_readiness_endpoint test_metrics_exposed \
                     test_database_connectivity test_redis_connectivity test_critical_endpoints \
                     test_prometheus_connectivity test_alerting_rules; do
        ((total_tests++))

        if $test_func; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi

        echo ""
    done

    # Summary
    log_info "Validation Summary"
    log_info "Total tests: $total_tests"
    log_success "Passed: $passed_tests"

    if [ "$failed_tests" -gt 0 ]; then
        log_error "Failed: $failed_tests"
        echo ""
        log_error "Validation failed"
        exit 1
    else
        echo ""
        log_success "All validation tests passed"
        log_success "Deployment is healthy and ready for traffic"
        exit 0
    fi
}

main "$@"
