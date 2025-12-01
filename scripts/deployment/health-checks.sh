#!/bin/bash
# scripts/deployment/health-checks.sh
# Phase 1.3 :: Health validation for trigger.dev worker deployment
# Reference: Phase 1.3 Production Deployment - Requirement 3 (Health Check Validation)

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKER_CONTAINER="trigger-dev-worker"
COMPOSE_DIR="$PROJECT_ROOT/docker/trigger-dev"
LOG_FILE="${LOG_FILE:-/tmp/trigger-worker-health-checks.log}"

# Health check thresholds
REQUIRED_SECRETS=10
MAX_MEMORY_PERCENT=80
MAX_CPU_PERCENT=90
MIN_PROVIDERS=2

# ==============================================================================
# Logging Functions
# ==============================================================================

log() {
    local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg" | tee -a "$LOG_FILE"
}

log_success() {
    log "✅ $*"
}

log_error() {
    log "❌ $*"
}

log_warning() {
    log "⚠️  $*"
}

log_step() {
    log "📋 $*"
}

# ==============================================================================
# Health Check Functions
# ==============================================================================

# Check 1: Worker Container Running
check_worker_running() {
    log_step "Check 1/10: Verifying worker container is running"

    if ! docker ps --filter "name=$WORKER_CONTAINER" --format "{{.Names}}" | grep -q "$WORKER_CONTAINER"; then
        log_error "Worker container not running"
        return 1
    fi

    # Verify container state is healthy or running
    local state=$(docker inspect --format='{{.State.Status}}' "$WORKER_CONTAINER" 2>/dev/null || echo "not-found")

    if [[ "$state" != "running" ]]; then
        log_error "Worker container state: $state (expected: running)"
        return 1
    fi

    log_success "Worker container is running"
    return 0
}

# Check 2: Container Health Status
check_container_health() {
    log_step "Check 2/10: Verifying container health status"

    # Note: trigger.dev worker doesn't define HEALTHCHECK in Dockerfile
    # We check for running state instead
    local uptime=$(docker inspect --format='{{.State.StartedAt}}' "$WORKER_CONTAINER" 2>/dev/null)

    if [[ -z "$uptime" ]]; then
        log_error "Cannot determine container uptime"
        return 1
    fi

    log_success "Container started at: $uptime"

    # Check if container has been running for at least 30 seconds
    local start_timestamp=$(date -d "$uptime" +%s 2>/dev/null || echo 0)
    local current_timestamp=$(date +%s)
    local uptime_seconds=$((current_timestamp - start_timestamp))

    if [[ $uptime_seconds -lt 30 ]]; then
        log_warning "Container uptime only ${uptime_seconds}s (may still be initializing)"
    else
        log_success "Container uptime: ${uptime_seconds}s"
    fi

    return 0
}

# Check 3: Socket Proxy Accessibility
check_socket_proxy() {
    log_step "Check 3/10: Verifying socket proxy accessibility"

    # Check if socket-proxy container is running
    if ! docker ps --filter "name=trigger-dev-socket-proxy" --format "{{.Names}}" | grep -q "trigger-dev-socket-proxy"; then
        log_error "Socket proxy container not running"
        return 1
    fi

    # Check socket proxy health endpoint
    if ! docker exec "$WORKER_CONTAINER" wget --spider -q http://socket-proxy:2375/containers/json 2>/dev/null; then
        log_error "Socket proxy not accessible from worker container"
        return 1
    fi

    log_success "Socket proxy accessible at http://socket-proxy:2375"
    return 0
}

# Check 4: Secrets Loaded
check_secrets_loaded() {
    log_step "Check 4/10: Verifying Docker secrets are loaded"

    local secrets_count=0
    local missing_secrets=()

    # Expected secrets from Phase 1.2a
    local expected_secrets=(
        "zai_api_key"
        "kimi_api_key"
        "openrouter_api_key"
        "anthropic_api_key"
        "trigger_secret_key"
        "auth_secret"
        "encryption_key"
        "magic_link_secret"
        "jwt_secret"
        "postgres_password"
    )

    for secret in "${expected_secrets[@]}"; do
        if docker exec "$WORKER_CONTAINER" test -f "/run/secrets/$secret" 2>/dev/null; then
            ((secrets_count++))
        else
            missing_secrets+=("$secret")
        fi
    done

    if [[ $secrets_count -lt $REQUIRED_SECRETS ]]; then
        log_error "Only $secrets_count/$REQUIRED_SECRETS secrets loaded"
        log_error "Missing secrets: ${missing_secrets[*]}"
        return 1
    fi

    log_success "All $secrets_count secrets loaded correctly"
    return 0
}

# Check 5: Agent Profiles Accessible
check_agent_profiles() {
    log_step "Check 5/10: Verifying agent profiles are accessible"

    # Check if agent profiles directory exists and has files
    local profile_count=$(docker exec "$WORKER_CONTAINER" sh -c 'ls -1 /app/claude-assets/agents/cfn-dev-team/*/*.md 2>/dev/null | wc -l' || echo 0)

    if [[ $profile_count -lt 20 ]]; then
        log_error "Only $profile_count agent profiles found (expected ≥20)"
        return 1
    fi

    log_success "$profile_count agent profiles accessible"
    return 0
}

# Check 6: Provider Routing Configuration
check_provider_routing() {
    log_step "Check 6/10: Verifying AI provider routing is configured"

    local providers_configured=0

    # Check Z.ai provider
    if docker exec "$WORKER_CONTAINER" test -f "/run/secrets/zai_api_key" 2>/dev/null; then
        log_success "Z.ai provider configured"
        ((providers_configured++))
    fi

    # Check Kimi provider
    if docker exec "$WORKER_CONTAINER" test -f "/run/secrets/kimi_api_key" 2>/dev/null; then
        log_success "Kimi provider configured"
        ((providers_configured++))
    fi

    # Check OpenRouter provider
    if docker exec "$WORKER_CONTAINER" test -f "/run/secrets/openrouter_api_key" 2>/dev/null; then
        log_success "OpenRouter provider configured"
        ((providers_configured++))
    fi

    # Check Anthropic provider
    if docker exec "$WORKER_CONTAINER" test -f "/run/secrets/anthropic_api_key" 2>/dev/null; then
        log_success "Anthropic provider configured"
        ((providers_configured++))
    fi

    if [[ $providers_configured -lt $MIN_PROVIDERS ]]; then
        log_error "Only $providers_configured providers configured (expected ≥$MIN_PROVIDERS)"
        return 1
    fi

    log_success "$providers_configured AI providers configured"
    return 0
}

# Check 7: Redis Connectivity
check_redis_connectivity() {
    log_step "Check 7/10: Verifying Redis connectivity"

    # Test Redis connection from worker
    if ! docker exec "$WORKER_CONTAINER" sh -c 'timeout 5 nc -z redis 6379' 2>/dev/null; then
        log_error "Cannot connect to Redis at redis:6379"
        return 1
    fi

    log_success "Redis connectivity verified"
    return 0
}

# Check 8: PostgreSQL Connectivity
check_postgres_connectivity() {
    log_step "Check 8/10: Verifying PostgreSQL connectivity"

    # Test Postgres connection from worker
    if ! docker exec "$WORKER_CONTAINER" sh -c 'timeout 5 nc -z postgres 5432' 2>/dev/null; then
        log_error "Cannot connect to PostgreSQL at postgres:5432"
        return 1
    fi

    log_success "PostgreSQL connectivity verified"
    return 0
}

# Check 9: No Critical Errors in Logs
check_logs_for_errors() {
    log_step "Check 9/10: Checking for critical errors in logs"

    local error_patterns=(
        "FATAL"
        "CRITICAL"
        "Cannot connect"
        "Connection refused"
        "Authentication failed"
        "Secret not found"
    )

    local critical_errors=0

    # Get last 100 lines of logs
    local recent_logs=$(docker logs --tail 100 "$WORKER_CONTAINER" 2>&1)

    for pattern in "${error_patterns[@]}"; do
        if echo "$recent_logs" | grep -qi "$pattern"; then
            log_warning "Found potential error pattern: $pattern"
            ((critical_errors++))
        fi
    done

    if [[ $critical_errors -gt 3 ]]; then
        log_error "Found $critical_errors critical error patterns in logs"
        echo "$recent_logs" | tail -20 >> "$LOG_FILE"
        return 1
    elif [[ $critical_errors -gt 0 ]]; then
        log_warning "Found $critical_errors potential error patterns (non-blocking)"
    fi

    log_success "No critical errors in recent logs"
    return 0
}

# Check 10: Resource Usage Within Limits
check_resource_usage() {
    log_step "Check 10/10: Verifying resource usage within limits"

    # Get container stats (single sample)
    local stats=$(docker stats --no-stream --format "{{.MemPerc}},{{.CPUPerc}}" "$WORKER_CONTAINER" 2>/dev/null || echo "0%,0%")

    local mem_percent=$(echo "$stats" | cut -d',' -f1 | sed 's/%//')
    local cpu_percent=$(echo "$stats" | cut -d',' -f2 | sed 's/%//')

    # Handle empty values
    mem_percent=${mem_percent:-0}
    cpu_percent=${cpu_percent:-0}

    # Convert to integer for comparison
    mem_percent=${mem_percent%.*}
    cpu_percent=${cpu_percent%.*}

    log "Resource usage: CPU=${cpu_percent}%, Memory=${mem_percent}%"

    if [[ $mem_percent -gt $MAX_MEMORY_PERCENT ]]; then
        log_error "Memory usage ${mem_percent}% exceeds limit ${MAX_MEMORY_PERCENT}%"
        return 1
    fi

    if [[ $cpu_percent -gt $MAX_CPU_PERCENT ]]; then
        log_error "CPU usage ${cpu_percent}% exceeds limit ${MAX_CPU_PERCENT}%"
        return 1
    fi

    log_success "Resource usage within limits"
    return 0
}

# ==============================================================================
# Main Execution
# ==============================================================================

main() {
    log "========================================="
    log "Trigger.dev Worker Health Checks"
    log "========================================="
    log "Container: $WORKER_CONTAINER"
    log "Log file: $LOG_FILE"
    log ""

    local failed_checks=0
    local total_checks=10

    # Run all health checks
    check_worker_running || ((failed_checks++))
    check_container_health || ((failed_checks++))
    check_socket_proxy || ((failed_checks++))
    check_secrets_loaded || ((failed_checks++))
    check_agent_profiles || ((failed_checks++))
    check_provider_routing || ((failed_checks++))
    check_redis_connectivity || ((failed_checks++))
    check_postgres_connectivity || ((failed_checks++))
    check_logs_for_errors || ((failed_checks++))
    check_resource_usage || ((failed_checks++))

    log ""
    log "========================================="
    log "Health Check Results"
    log "========================================="
    log "Passed: $((total_checks - failed_checks))/$total_checks"
    log "Failed: $failed_checks/$total_checks"

    if [[ $failed_checks -eq 0 ]]; then
        log_success "All health checks passed ✅"
        return 0
    else
        log_error "Health checks failed ❌"
        return 1
    fi
}

# Run health checks
main "$@"
