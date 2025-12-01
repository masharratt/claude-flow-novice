#!/bin/bash
# tests/test-multi-worktree-docker-coordination.sh
# Comprehensive test suite for Docker Multi-Worktree Wrapper functionality
# Tests port isolation, container isolation, volume isolation, and coordination patterns

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

# Test specific configuration
export TEST_TIMEOUT="${TEST_TIMEOUT:-60}"
export DOCKER_COMPOSE_FILE="${DOCKER_COMPOSE_FILE:-docker-compose.yml}"
export TEST_DIR
TEST_DIR="$(create_temp_dir)"

# Branches for testing (simulated worktrees)
MAIN_BRANCH="main"
FEATURE_BRANCH="feature-auth"
BUGFIX_BRANCH="bugfix-validation"

# Port ranges that should be used
MAIN_REDIS_PORT=6379
MAIN_POSTGRES_PORT=5432
MAIN_ORCHESTRATOR_PORT=3001

# ============================================================================
# TEST SETUP AND TEARDOWN
# ============================================================================

setup_multi_worktree_test() {
    setup_test "multi-worktree-docker-coordination"
    
    log_step "Setting up multi-worktree test environment"
    
    # Ensure Docker is available
    if ! command -v docker &>/dev/null; then
        log_error "Docker not available"
        return 1
    fi
    
    # Ensure docker-compose is available
    if ! command -v docker-compose &>/dev/null; then
        log_error "docker-compose not available"
        return 1
    fi
    
    # Clean up any existing containers from previous tests
    cleanup_all_test_containers
    
    # Create test worktree directories (simulated)
    mkdir -p "$TEST_DIR/worktrees/$MAIN_BRANCH"
    mkdir -p "$TEST_DIR/worktrees/$FEATURE_BRANCH"
    mkdir -p "$TEST_DIR/worktrees/$BUGFIX_BRANCH"
    
    log_success "Test environment setup complete"
}

teardown_multi_worktree_test() {
    log_step "Cleaning up test environment"
    
    # Clean up all test containers
    cleanup_all_test_containers
    
    # Clean up test directories
    cleanup_temp_dir "$TEST_DIR"
    
    print_test_summary
}

cleanup_all_test_containers() {
    log_info "Cleaning up test containers"
    
    # Stop and remove containers for all test branches
    for branch in "$MAIN_BRANCH" "$FEATURE_BRANCH" "$BUGFIX_BRANCH"; do
        local project_name="cfn-$branch"
        
        # Stop containers
        docker-compose -p "$project_name" down -v >/dev/null 2>&1 || true
        
        # Remove any orphaned containers
        docker ps -a --filter "name=$project_name" -q | xargs -r docker rm -f >/dev/null 2>&1 || true
    done
    
    # Clean up test networks
    docker network ls --filter "name=cfn-" -q | xargs -r docker network rm >/dev/null 2>&1 || true
    
    log_success "Container cleanup complete"
}

# ============================================================================
# CORE FUNCTIONALITY TESTS
# ============================================================================

test_run_in_worktree_script_exists() {
    log_step "Testing run-in-worktree.sh script exists and is executable"
    
    local script_path="./scripts/docker/run-in-worktree.sh"
    
    assert_file_exists "$script_path" "run-in-worktree.sh script exists"
    assert_success "Script is executable" test -x "$script_path"
}

test_branch_detection() {
    log_step "Testing branch detection functionality"
    
    # Test current branch detection
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
    assert_not_empty "$current_branch" "Current branch detection"
    
    log_info "Current branch: $current_branch"
}

test_port_offset_calculation() {
    log_step "Testing port offset calculation"
    
    # Test main branch gets offset 0
    local main_offset
    main_offset=$(bash -c '
        # Source functions from the script
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        calculate_port_offset "main"
    ' 2>/dev/null)
    assert_equals "0" "$main_offset" "Main branch port offset"
    
    # Test master branch gets offset 0
    local master_offset
    master_offset=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        calculate_port_offset "master"
    ' 2>/dev/null)
    assert_equals "0" "$master_offset" "Master branch port offset"
    
    # Test feature branch gets non-zero offset
    local feature_offset
    feature_offset=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        calculate_port_offset "feature-auth"
    ' 2>/dev/null)
    assert_not_empty "$feature_offset" "Feature branch port offset"
    
    # Ensure feature offset is not 0
    if [[ "$feature_offset" == "0" ]]; then
        log_error "Feature branch should not get port offset 0"
        return 1
    fi
    
    log_info "Port offsets - Main: $main_offset, Feature: $feature_offset"
}

test_project_name_sanitization() {
    log_step "Testing project name sanitization"
    
    # Test basic sanitization
    local sanitized
    sanitized=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        sanitize_branch_name "feature-auth"
    ' 2>/dev/null)
    assert_equals "feature-auth" "$sanitized" "Basic branch name sanitization"
    
    # Test special characters
    local sanitized_special
    sanitized_special=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        sanitize_branch_name "feature/bugfix#123"
    ' 2>/dev/null)
    assert_contains "$sanitized_special" "feature-bugfix-123" "Special character sanitization"
    
    # Test leading/trailing dashes
    local sanitized_dashes
    sanitized_dashes=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        sanitize_branch_name "--test--"
    ' 2>/dev/null)
    assert_equals "test" "$sanitized_dashes" "Leading/trailing dash removal"
}

test_environment_variable_export() {
    log_step "Testing environment variable export"
    
    # Test environment export function
    local export_output
    export_output=$(bash -c '
        SCRIPT_DIR="$(cd "$(dirname "./scripts/docker/run-in-worktree.sh")" && pwd)"
        source "./scripts/docker/run-in-worktree.sh"
        export_docker_env "test-project" "100"
        env | grep CFN_
    ' 2>/dev/null)
    
    assert_contains "$export_output" "COMPOSE_PROJECT_NAME=test-project" "Project name export"
    assert_contains "$export_output" "CFN_REDIS_PORT=6479" "Redis port export (6379 + 100)"
    assert_contains "$export_output" "CFN_POSTGRES_PORT=5532" "PostgreSQL port export (5432 + 100)"
    assert_contains "$export_output" "CFN_ORCHESTRATOR_PORT=3101" "Orchestrator port export (3001 + 100)"
}

# ============================================================================
# DOCKER INTEGRATION TESTS
# ============================================================================

test_dry_run_functionality() {
    log_step "Testing dry-run mode"
    
    # Test dry run doesn't execute docker-compose
    local dry_run_output
    dry_run_output=$(./scripts/docker/run-in-worktree.sh --dry-run --verbose up -d 2>&1 || true)
    
    assert_contains "$dry_run_output" "Dry-run mode" "Dry-run mode indication"
    assert_contains "$dry_run_output" "would execute" "Would execute indication"
    assert_not_contains "$dry_run_output" "docker-compose" "No actual docker-compose execution"
}

test_help_functionality() {
    log_step "Testing help functionality"
    
    # Test help output
    local help_output
    help_output=$(./scripts/docker/run-in-worktree.sh --help 2>&1 || true)
    
    assert_contains "$help_output" "Usage:" "Help usage section"
    assert_contains "$help_output" "OPTIONS:" "Help options section"
    assert_contains "$help_output" "EXAMPLES:" "Help examples section"
}

test_verbose_mode() {
    log_step "Testing verbose mode"
    
    # Test verbose output
    local verbose_output
    verbose_output=$(./scripts/docker/run-in-worktree.sh --verbose --dry-run up 2>&1 || true)
    
    assert_contains "$verbose_output" "Docker Multi-Worktree Configuration" "Configuration header"
    assert_contains "$verbose_output" "Port Mappings:" "Port mappings section"
}

test_custom_project_name() {
    log_step "Testing custom project name override"
    
    # Test custom project name
    local custom_output
    custom_output=$(./scripts/docker/run-in-worktree.sh --project-name "my-custom-project" --dry-run up 2>&1 || true)
    
    assert_contains "$custom_output" "my-custom-project" "Custom project name"
}

test_custom_port_offset() {
    log_step "Testing custom port offset override"
    
    # Test custom port offset
    local custom_offset_output
    custom_offset_output=$(./scripts/docker/run-in-worktree.sh --port-offset "500" --dry-run --verbose up 2>&1 || true)
    
    assert_contains "$custom_offset_output" "6879" "Custom Redis port (6379 + 500)"
    assert_contains "$custom_offset_output" "5932" "Custom PostgreSQL port (5432 + 500)"
}

# ============================================================================
# ISOLATION TESTS
# ============================================================================

test_port_isolation_calculation() {
    log_step "Testing port isolation calculations"
    
    # Calculate expected ports for different branches
    local feature_offset
    feature_offset=$(bash -c 'source ./scripts/docker/run-in-worktree.sh; calculate_port_offset "feature-auth"')
    
    local bugfix_offset
    bugfix_offset=$(bash -c 'source ./scripts/docker/run-in-worktree.sh; calculate_port_offset "bugfix-validation"')
    
    # Ensure offsets are different
    if [[ "$feature_offset" == "$bugfix_offset" ]]; then
        log_error "Different branches should get different port offsets"
        return 1
    fi
    
    # Calculate expected ports
    local feature_redis=$((DEFAULT_REDIS_PORT + feature_offset))
    local bugfix_redis=$((DEFAULT_REDIS_PORT + bugfix_offset))
    
    # Ensure ports are different
    if [[ "$feature_redis" == "$bugfix_redis" ]]; then
        log_error "Different branches should use different Redis ports"
        return 1
    fi
    
    log_success "Port isolation verified - Feature: $feature_redis, Bugfix: $bugfix_redis"
}

test_project_name_isolation() {
    log_step "Testing project name isolation"
    
    # Test project name generation for different branches
    local main_project
    main_project=$(bash -c '
        source ./scripts/docker/run-in-worktree.sh
        SANITIZED_BRANCH=$(sanitize_branch_name "main")
        echo "cfn-${SANITIZED_BRANCH}"
    ')
    
    local feature_project
    feature_project=$(bash -c '
        source ./scripts/docker/run-in-worktree.sh
        SANITIZED_BRANCH=$(sanitize_branch_name "feature-auth")
        echo "cfn-${SANITIZED_BRANCH}"
    ')
    
    assert_equals "cfn-main" "$main_project" "Main branch project name"
    assert_equals "cfn-feature-auth" "$feature_project" "Feature branch project name"
    
    # Ensure project names are different
    if [[ "$main_project" == "$feature_project" ]]; then
        log_error "Different branches should have different project names"
        return 1
    fi
    
    log_success "Project name isolation verified"
}

# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

test_invalid_port_offset() {
    log_step "Testing invalid port offset handling"
    
    # Test non-numeric port offset
    assert_failure "Invalid port offset rejection" ./scripts/docker/run-in-worktree.sh --port-offset "invalid" --dry-run up
    
    # Test negative port offset (should be rejected)
    assert_failure "Negative port offset rejection" ./scripts/docker/run-in-worktree.sh --port-offset "-100" --dry-run up
}

test_missing_docker_compose() {
    log_step "Testing missing docker-compose handling"
    
    # Temporarily rename docker-compose to simulate missing command
    local temp_path
    temp_path=$(mktemp)
    
    # This test would require mocking the docker-compose command
    # For now, just test the validation logic exists
    local validation_check
    validation_check=$(grep -n "docker-compose command not found" ./scripts/docker/run-in-worktree.sh || true)
    
    assert_not_empty "$validation_check" "docker-compose validation check exists"
    
    rm -f "$temp_path"
}

# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

test_script_performance() {
    log_step "Testing script performance"
    
    # Test script execution time
    local start_time
    start_time=$(date +%s.%N)
    
    ./scripts/docker/run-in-worktree.sh --dry-run up >/dev/null 2>&1
    
    local end_time
    end_time=$(date +%s.%N)
    
    local duration
    duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "1")
    
    log_info "Script execution time: ${duration}s"
    
    # Script should complete in under 2 seconds
    if (( $(echo "$duration > 2" | bc -l 2>/dev/null || echo "1") )); then
        log_warn "Script execution took longer than expected: ${duration}s"
    else
        log_success "Script performance acceptable"
    fi
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
    # Setup test environment
    setup_multi_worktree_test
    
    # Run all test suites
    log_step "Running multi-worktree Docker coordination tests"
    
    # Core functionality tests
    test_run_in_worktree_script_exists
    test_branch_detection
    test_port_offset_calculation
    test_project_name_sanitization
    test_environment_variable_export
    
    # Docker integration tests
    test_dry_run_functionality
    test_help_functionality
    test_verbose_mode
    test_custom_project_name
    test_custom_port_offset
    
    # Isolation tests
    test_port_isolation_calculation
    test_project_name_isolation
    
    # Error handling tests
    test_invalid_port_offset
    test_missing_docker_compose
    
    # Performance tests
    test_script_performance
    
    # Cleanup
    teardown_multi_worktree_test
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi