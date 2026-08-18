#!/usr/bin/env bash
# tests/deployment/test-production-readiness.sh
# Phase 1.3 :: Deployment automation validation tests
# Reference: Phase 1.3 Production Deployment - Requirement 4 (Deployment Validation Tests)

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOYMENT_SCRIPTS="$PROJECT_ROOT/scripts/deployment"
COMPOSE_DIR="$PROJECT_ROOT/docker/trigger-dev"

# Test configuration
TEST_ENVIRONMENT="dev"
WORKER_CONTAINER="trigger-dev-worker"
STATE_DIR="$PROJECT_ROOT/.artifacts/deployment-state"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_LOG="/tmp/deployment-test-$(date +%s).log"

# ==============================================================================
# Test Utilities
# ==============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$TEST_LOG"
}

log_test() {
    echo ""
    echo "========================================="
    echo "TEST: $*"
    echo "========================================="
    log "TEST: $*"
}

assert_success() {
    local description="$1"
    local command="$2"

    log "Asserting: $description"

    if eval "$command" >> "$TEST_LOG" 2>&1; then
        log "✅ PASS: $description"
        ((TESTS_PASSED++))
        return 0
    else
        log "❌ FAIL: $description"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_file_exists() {
    local file="$1"
    assert_success "File exists: $file" "[[ -f '$file' ]]"
}

assert_container_running() {
    local container="$1"
    assert_success "Container running: $container" "docker ps --filter 'name=$container' --format '{{.Names}}' | grep -q '$container'"
}

assert_container_not_running() {
    local container="$1"
    assert_success "Container not running: $container" "! docker ps --filter 'name=$container' --format '{{.Names}}' | grep -q '$container'"
}

cleanup_test_environment() {
    log "Cleaning up test environment"

    # Stop and remove worker containers
    docker rm -f "$WORKER_CONTAINER" trigger-dev-worker-green trigger-dev-worker-blue 2>/dev/null || true

    # Clean state directory
    rm -rf "$STATE_DIR/dev-"* 2>/dev/null || true
    rm -f "$STATE_DIR/latest-dev" 2>/dev/null || true

    log "Test environment cleaned"
}

# ==============================================================================
# Test Suite 1: Script Validation
# ==============================================================================

test_scripts_exist() {
    log_test "Scripts exist and are executable"

    assert_file_exists "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh"
    assert_file_exists "$DEPLOYMENT_SCRIPTS/rollback-trigger-worker.sh"
    assert_file_exists "$DEPLOYMENT_SCRIPTS/health-checks.sh"

    assert_success "deploy-trigger-worker.sh is executable" "[[ -x '$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh' ]]"
    assert_success "rollback-trigger-worker.sh is executable" "[[ -x '$DEPLOYMENT_SCRIPTS/rollback-trigger-worker.sh' ]]"
    assert_success "health-checks.sh is executable" "[[ -x '$DEPLOYMENT_SCRIPTS/health-checks.sh' ]]"
}

# ==============================================================================
# Test Suite 2: Health Checks Validation
# ==============================================================================

test_health_checks_catch_failures() {
    log_test "Health checks detect failures correctly"

    # Start dependencies
    cd "$COMPOSE_DIR"
    docker-compose up -d postgres redis socket-proxy trigger-webapp >> "$TEST_LOG" 2>&1

    # Wait for dependencies
    sleep 10

    # Start worker
    docker-compose up -d trigger-worker >> "$TEST_LOG" 2>&1
    sleep 30

    # Health checks should pass
    assert_success "Health checks pass for running worker" "$DEPLOYMENT_SCRIPTS/health-checks.sh"

    # Stop worker
    docker stop "$WORKER_CONTAINER" >> "$TEST_LOG" 2>&1

    # Health checks should fail
    assert_success "Health checks fail for stopped worker" "! $DEPLOYMENT_SCRIPTS/health-checks.sh"

    # Restart worker
    docker start "$WORKER_CONTAINER" >> "$TEST_LOG" 2>&1
    sleep 20
}

# ==============================================================================
# Test Suite 3: Deployment Script Validation
# ==============================================================================

test_deployment_script() {
    log_test "Deployment script completes successfully"

    cleanup_test_environment

    # Start dependencies
    cd "$COMPOSE_DIR"
    docker-compose up -d postgres redis socket-proxy trigger-webapp >> "$TEST_LOG" 2>&1
    sleep 10

    # Create mock secrets (if they don't exist)
    for secret in zai_api_key kimi_api_key openrouter_api_key anthropic_api_key trigger_secret_key auth_secret encryption_key magic_link_secret jwt_secret postgres_password; do
        if ! docker secret inspect "$secret" &>/dev/null; then
            echo "mock-secret-value" | docker secret create "$secret" - >> "$TEST_LOG" 2>&1 || true
        fi
    done

    # Run deployment
    local deploy_start=$(date +%s)

    if "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1; then
        local deploy_end=$(date +%s)
        local deploy_duration=$((deploy_end - deploy_start))

        log "✅ Deployment completed in ${deploy_duration}s"
        ((TESTS_PASSED++))

        # Verify deployment duration
        if [[ $deploy_duration -lt 600 ]]; then
            log "✅ Deployment duration under 10 minutes"
            ((TESTS_PASSED++))
        else
            log "❌ Deployment duration exceeded 10 minutes"
            ((TESTS_FAILED++))
        fi
    else
        log "❌ Deployment failed"
        ((TESTS_FAILED++))
        return 1
    fi

    # Verify worker is running
    assert_container_running "$WORKER_CONTAINER"

    # Verify state was preserved
    assert_file_exists "$STATE_DIR/latest-$TEST_ENVIRONMENT"
}

# ==============================================================================
# Test Suite 4: Idempotency Validation
# ==============================================================================

test_deployment_idempotency() {
    log_test "Deployment script is idempotent (safe to re-run)"

    # Run deployment first time
    log "First deployment run"
    "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1

    local first_state=$(cat "$STATE_DIR/latest-$TEST_ENVIRONMENT")
    sleep 5

    # Run deployment second time
    log "Second deployment run (idempotency test)"
    "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1

    # Verify worker is still running
    assert_container_running "$WORKER_CONTAINER"

    # Verify state was updated
    assert_file_exists "$STATE_DIR/latest-$TEST_ENVIRONMENT"

    local second_state=$(cat "$STATE_DIR/latest-$TEST_ENVIRONMENT")

    if [[ "$first_state" != "$second_state" ]]; then
        log "✅ State updated on second deployment (idempotent)"
        ((TESTS_PASSED++))
    else
        log "⚠️  State not updated (may be cached)"
    fi
}

# ==============================================================================
# Test Suite 5: Rollback Script Validation
# ==============================================================================

test_rollback_script() {
    log_test "Rollback script preserves state and completes quickly"

    # Ensure we have a deployment to rollback from
    "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1
    sleep 10

    # Verify state backup exists
    assert_file_exists "$STATE_DIR/latest-$TEST_ENVIRONMENT"

    # Run rollback
    local rollback_start=$(date +%s)

    if "$DEPLOYMENT_SCRIPTS/rollback-trigger-worker.sh" "$TEST_ENVIRONMENT" "Test rollback" >> "$TEST_LOG" 2>&1; then
        local rollback_end=$(date +%s)
        local rollback_duration=$((rollback_end - rollback_start))

        log "✅ Rollback completed in ${rollback_duration}s"
        ((TESTS_PASSED++))

        # Verify RTO (≤5 minutes)
        if [[ $rollback_duration -le 300 ]]; then
            log "✅ Rollback RTO met (${rollback_duration}s ≤ 300s)"
            ((TESTS_PASSED++))
        else
            log "❌ Rollback RTO exceeded (${rollback_duration}s > 300s)"
            ((TESTS_FAILED++))
        fi
    else
        log "❌ Rollback failed"
        ((TESTS_FAILED++))
        return 1
    fi

    # Verify worker is running after rollback
    assert_container_running "$WORKER_CONTAINER"

    # Verify rollback state was preserved
    local rollback_states=$(find "$STATE_DIR" -name "rollback-$TEST_ENVIRONMENT-*" -type d | wc -l)
    if [[ $rollback_states -gt 0 ]]; then
        log "✅ Rollback state preserved ($rollback_states backups found)"
        ((TESTS_PASSED++))
    else
        log "❌ No rollback state preserved"
        ((TESTS_FAILED++))
    fi
}

# ==============================================================================
# Test Suite 6: Partial Failure Recovery
# ==============================================================================

test_partial_failure_recovery() {
    log_test "Deployment handles partial failures gracefully"

    cleanup_test_environment

    # Start only some dependencies (simulate partial environment)
    cd "$COMPOSE_DIR"
    docker-compose up -d postgres redis >> "$TEST_LOG" 2>&1
    sleep 5

    # Deployment should fail validation
    if ! "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1; then
        log "✅ Deployment correctly failed with missing dependencies"
        ((TESTS_PASSED++))
    else
        log "❌ Deployment should have failed with missing dependencies"
        ((TESTS_FAILED++))
    fi

    # Start remaining dependencies
    docker-compose up -d socket-proxy trigger-webapp >> "$TEST_LOG" 2>&1
    sleep 10

    # Deployment should now succeed
    if "$DEPLOYMENT_SCRIPTS/deploy-trigger-worker.sh" "$TEST_ENVIRONMENT" >> "$TEST_LOG" 2>&1; then
        log "✅ Deployment recovered after dependencies started"
        ((TESTS_PASSED++))
    else
        log "❌ Deployment failed even with all dependencies"
        ((TESTS_FAILED++))
    fi
}

# ==============================================================================
# Test Results Summary
# ==============================================================================

print_test_summary() {
    local total_tests=$((TESTS_PASSED + TESTS_FAILED))
    local pass_rate=0

    if [[ $total_tests -gt 0 ]]; then
        pass_rate=$(awk "BEGIN {printf \"%.2f\", ($TESTS_PASSED / $total_tests) * 100}")
    fi

    echo ""
    echo "========================================="
    echo "Test Results Summary"
    echo "========================================="
    echo "Total tests: $total_tests"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"
    echo "Pass rate: ${pass_rate}%"
    echo "Log file: $TEST_LOG"
    echo ""

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo "✅ All tests passed"
        return 0
    else
        echo "❌ Some tests failed"
        return 1
    fi
}

# ==============================================================================
# Main Test Execution
# ==============================================================================

main() {
    log "========================================="
    log "Deployment Production Readiness Tests"
    log "========================================="
    log "Project root: $PROJECT_ROOT"
    log "Test log: $TEST_LOG"
    log ""

    # Run test suites
    test_scripts_exist
    test_health_checks_catch_failures
    test_deployment_script
    test_deployment_idempotency
    test_rollback_script
    test_partial_failure_recovery

    # Cleanup
    cleanup_test_environment

    # Print summary
    print_test_summary
}

# Trap cleanup on exit
trap cleanup_test_environment EXIT

# Run tests
main "$@"
