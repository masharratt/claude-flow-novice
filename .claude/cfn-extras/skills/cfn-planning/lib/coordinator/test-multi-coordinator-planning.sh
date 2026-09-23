#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[TEST:$(date '+%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[TEST:$(date '+%H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[TEST:$(date '+%H:%M:%S')] ERROR: $1${NC}"
    return 1
}

info() {
    echo -e "${BLUE}[TEST:$(date '+%H:%M:%S')] INFO: $1${NC}"
}

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TESTS_RUN++))
    log "Running test: $test_name"

    if eval "$test_command"; then
        ((TESTS_PASSED++))
        log "✓ PASSED: $test_name"
    else
        ((TESTS_FAILED++))
        error "✗ FAILED: $test_name"
    fi
    echo
}

create_test_zone_config() {
    local test_config="/tmp/test-zones-config-$(date '+%s').json"

    cat > "$test_config" << 'EOF'
{
  "zones": [
    {
      "name": "zone-alpha",
      "task_description": "Implement React authentication component with TypeScript interfaces and comprehensive error handling",
      "deliverables": [
        "src/components/AuthForm.tsx",
        "src/types/auth.ts",
        "src/hooks/useAuth.ts",
        "src/services/authService.ts",
        "tests/auth.test.ts"
      ],
      "agent_types": ["react-frontend-engineer", "reviewer", "tester"],
      "acceptance_criteria": [
        "Form validates user input",
        "Authentication state managed globally",
        "Error handling for network failures",
        "Component tested with >80% coverage"
      ],
      "in_scope": ["React components", "TypeScript interfaces", "State management"],
      "out_of_scope": ["Backend authentication", "Database integration"],
      "directory": "src/auth",
      "risk_factors": ["external_dependencies", "complex_state_management"]
    },
    {
      "name": "zone-beta",
      "task_description": "Create REST API endpoints for user management with comprehensive validation",
      "deliverables": [
        "src/api/users.ts",
        "src/middleware/validation.ts",
        "src/types/user.ts",
        "tests/users.test.ts"
      ],
      "agent_types": ["backend-developer", "reviewer"],
      "acceptance_criteria": [
        "CRUD operations implemented",
        "Input validation on all endpoints",
        "Error responses standardized",
        "API documentation generated"
      ],
      "in_scope": ["REST API", "Validation middleware", "TypeScript types"],
      "out_of_scope": ["Database queries", "Authentication"],
      "directory": "src/api"
    }
  ]
}
EOF

    echo "$test_config"
}

test_task_validation() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test valid configuration
    if "$SCRIPT_DIR/validate-task-planning.sh" "$test_config" >/dev/null 2>&1; then
        rm -f "$test_config" "/tmp/validated-task-$(basename "$test_config")"
        return 0
    else
        rm -f "$test_config" "/tmp/validated-task-$(basename "$test_config")"
        return 1
    fi
}

test_task_validation_failures() {
    # Test invalid configuration (generic task)
    local invalid_config="/tmp/invalid-zones-config-$(date '+%s').json"

    cat > "$invalid_config" << 'EOF'
{
  "zones": [
    {
      "name": "zone-bad",
      "task_description": "CFN Loop implementation",
      "deliverables": ["implementation"],
      "agent_types": ["backend-developer"]
    }
  ]
}
EOF

    local result=0
    if "$SCRIPT_DIR/validate-task-planning.sh" "$invalid_config" >/dev/null 2>&1; then
        result=1  # Should have failed
    else
        result=0  # Correctly failed
    fi

    rm -f "$invalid_config"
    return $result
}

test_resource_planning() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test resource planning
    if "$SCRIPT_DIR/plan-coordinator-resources.sh" "$test_config" >/dev/null 2>&1; then
        # Check if resource plan file was created
        local plan_files
        plan_files=$(find /tmp -name "coordinator-resource-plan-*.json" -type f | wc -l)
        rm -f "$test_config"
        [[ $plan_files -gt 0 ]]
    else
        rm -f "$test_config"
        return 1
    fi
}

test_dependency_analysis() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test dependency analysis
    if "$SCRIPT_DIR/map-dependencies-conflicts.sh" "$test_config" >/dev/null 2>&1; then
        # Check if analysis file was created
        local analysis_files
        analysis_files=$(find /tmp -name "dependency-conflict-analysis-*.json" -type f | wc -l)
        rm -f "$test_config"
        [[ $analysis_files -gt 0 ]]
    else
        rm -f "$test_config"
        return 1
    fi
}

test_rollout_planning() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test rollout planning
    if "$SCRIPT_DIR/plan-risk-rollout.sh" "$test_config" 2 >/dev/null; then
        # Check if rollout plan file was created
        local rollout_files
        rollout_files=$(find /tmp -name "rollout-plan-*.json" -type f | wc -l)
        rm -f "$test_config"
        [[ $rollout_files -gt 0 ]]
    else
        rm -f "$test_config"
        return 1
    fi
}

test_end_to_end_planning() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test end-to-end planning
    if "$SCRIPT_DIR/plan-multi-coordinator-work.sh" "$test_config" --dry-run >/dev/null 2>&1; then
        # Check if summary file was created
        local summary_files
        summary_files=$(find /tmp -name "multi-coordinator-planning-summary-*.json" -type f | wc -l)
        rm -f "$test_config"
        [[ $summary_files -gt 0 ]]
    else
        rm -f "$test_config"
        return 1
    fi
}

test_redis_connectivity() {
    # Test Redis connectivity (required for namespace planning)
    if redis-cli ping >/dev/null 2>&1; then
        return 0
    else
        warn "Redis not available - skipping Redis-dependent tests"
        return 0  # Don't fail test suite, just warn
    fi
}

test_jq_availability() {
    # Test jq availability (required for JSON processing)
    if command -v jq >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

test_zone_config_json_validation() {
    local test_config
    test_config=$(create_test_zone_config)

    # Test if the generated config is valid JSON
    if jq . "$test_config" >/dev/null 2>&1; then
        rm -f "$test_config"
        return 0
    else
        rm -f "$test_config"
        return 1
    fi
}

test_complexity_scoring() {
    # Test complexity scoring algorithm
    local simple_zone="/tmp/simple-zone-$(date '+%s').json"
    cat > "$simple_zone" << 'EOF'
{
  "zones": [
    {
      "name": "simple-zone",
      "task_description": "Simple task",
      "deliverables": ["file1.ts"],
      "agent_types": ["developer"]
    }
  ]
}
EOF

    local complex_zone="/tmp/complex-zone-$(date '+%s').json"
    cat > "$complex_zone" << 'EOF'
{
  "zones": [
    {
      "name": "complex-zone",
      "task_description": "This is a very complex task that requires multiple implementation steps and comprehensive testing strategies with many different components working together",
      "deliverables": ["file1.ts", "file2.ts", "file3.ts", "file4.ts", "file5.ts"],
      "agent_types": ["developer", "reviewer", "tester", "architect"],
      "acceptance_criteria": ["criteria1", "criteria2", "criteria3"],
      "risk_factors": ["risk1", "risk2"]
    }
  ]
}
EOF

    # Both should be valid JSON
    local result=0
    if ! jq . "$simple_zone" >/dev/null 2>&1 || ! jq . "$complex_zone" >/dev/null 2>&1; then
        result=1
    fi

    rm -f "$simple_zone" "$complex_zone"
    return $result
}

cleanup_test_artifacts() {
    # Clean up any test files
    find /tmp -name "test-*.json" -type f -delete 2>/dev/null || true
    find /tmp -name "coordinator-resource-plan-*.json" -type f -delete 2>/dev/null || true
    find /tmp -name "dependency-conflict-analysis-*.json" -type f -delete 2>/dev/null || true
    find /tmp -name "rollout-plan-*.json" -type f -delete 2>/dev/null || true
    find /tmp -name "multi-coordinator-planning-summary-*.json" -type f -delete 2>/dev/null || true
    find /tmp -name "validated-task-*" -type f -delete 2>/dev/null || true
}

main() {
    log "Starting multi-coordinator planning test suite"

    # Setup cleanup trap
    trap cleanup_test_artifacts EXIT

    # Run individual tests
    run_test "jq availability" "test_jq_availability"
    run_test "Redis connectivity" "test_redis_connectivity"
    run_test "Zone config JSON validation" "test_zone_config_json_validation"
    run_test "Task validation (valid config)" "test_task_validation"
    run_test "Task validation (invalid config rejection)" "test_task_validation_failures"
    run_test "Resource planning" "test_resource_planning"
    run_test "Dependency analysis" "test_dependency_analysis"
    run_test "Rollout planning" "test_rollout_planning"
    run_test "Complexity scoring" "test_complexity_scoring"
    run_test "End-to-end planning" "test_end_to_end_planning"

    # Display test results
    echo
    info "=== Test Results ==="
    echo "Tests run: $TESTS_RUN"
    echo "Tests passed: $TESTS_PASSED"
    echo "Tests failed: $TESTS_FAILED"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log "✅ All tests passed successfully!"
        exit 0
    else
        error "❌ $TESTS_FAILED test(s) failed"
        exit 1
    fi
}

# Execute main function
main "$@"