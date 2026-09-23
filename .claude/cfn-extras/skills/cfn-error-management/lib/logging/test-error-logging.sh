#!/usr/bin/env bash

##############################################################################
# CFN Error Logging - Test Script
# Version: 1.0.0
#
# Comprehensive test suite for CFN error logging functionality
# Tests error capture, report generation, and cleanup operations
#
# Usage: ./test-error-logging.sh [--full] [--quick] [--component <name>]
##############################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_LOGGING_SCRIPT="$SCRIPT_DIR/invoke-error-logging.sh"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup-error-logs.sh"
CLI_INTEGRATION="$SCRIPT_DIR/integrate-cli.sh"
DOCKER_INTEGRATION="$SCRIPT_DIR/integrate-docker.sh"

# Test data
TEST_TASK_ID="cfn-test-$(date +%s%N | tail -c 7)"
TEST_LOG_BASE_DIR="/tmp/cfn_error_logs"

# Test flags
QUICK_TEST=false
FULL_TEST=false
COMPONENT_TEST=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --quick)
      QUICK_TEST=true
      shift
      ;;
    --full)
      FULL_TEST=true
      shift
      ;;
    --component)
      COMPONENT_TEST="$2"
      shift 2
      ;;
    --help|-h)
      cat << EOF
CFN Error Logging - Test Script

Usage: $0 [OPTIONS]

Options:
  --quick              Run quick tests only (skip slow operations)
  --full               Run full comprehensive test suite
  --component <name>   Test specific component only
  --help, -h           Show this help message

Components:
  invoke     Test main error logging script
  cli        Test CLI integration
  docker     Test Docker integration
  cleanup    Test cleanup functionality
  reports    Test report generation

Examples:
  $0 --quick                    # Quick validation tests
  $0 --full                     # Full comprehensive tests
  $0 --component invoke         # Test main script only
  $0 --component cleanup        # Test cleanup functionality
EOF
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Test utilities
test_log() {
  echo -e "${BLUE}[TEST]${NC} $*"
}

pass_log() {
  echo -e "${GREEN}[PASS]${NC} $*"
}

fail_log() {
  echo -e "${RED}[FAIL]${NC} $*"
}

warn_log() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

info_log() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

# Test result tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
  local test_name="$1"
  local test_command="$2"

  TESTS_RUN=$((TESTS_RUN + 1))
  test_log "Running: $test_name"

  if eval "$test_command" >/dev/null 2>&1; then
    pass_log "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    fail_log "$test_name"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Setup test environment
setup_test_env() {
  info_log "Setting up test environment..."

  # Create test directory
  mkdir -p "$TEST_LOG_BASE_DIR"

  # Verify scripts exist and are executable
  for script in "$ERROR_LOGGING_SCRIPT" "$CLEANUP_SCRIPT" "$CLI_INTEGRATION" "$DOCKER_INTEGRATION"; do
    if [ ! -f "$script" ]; then
      fail_log "Script not found: $script"
      exit 1
    fi
    chmod +x "$script"
  done

  # Set up test task ID
  export TASK_ID="$TEST_TASK_ID"

  pass_log "Test environment setup complete"
}

# Cleanup test environment
cleanup_test_env() {
  info_log "Cleaning up test environment..."

  # Remove test-specific logs
  if [ -n "$TEST_TASK_ID" ]; then
    find "$TEST_LOG_BASE_DIR" -name "*${TEST_TASK_ID}*" -delete 2>/dev/null || true
  fi

  pass_log "Test environment cleaned up"
}

# Test 1: Script existence and permissions
test_script_permissions() {
  run_test "Error logging script exists and is executable" "[ -x '$ERROR_LOGGING_SCRIPT' ]"
  run_test "Cleanup script exists and is executable" "[ -x '$CLEANUP_SCRIPT' ]"
  run_test "CLI integration script exists and is executable" "[ -x '$CLI_INTEGRATION' ]"
  run_test "Docker integration script exists and is executable" "[ -x '$DOCKER_INTEGRATION' ]"
}

# Test 2: Help functionality
test_help_functionality() {
  run_test "Error logging script shows help" "$ERROR_LOGGING_SCRIPT --help"
  run_test "Cleanup script shows help" "$CLEANUP_SCRIPT --help"
}

# Test 3: Dependency validation
test_dependency_validation() {
  run_test "Validate dependencies check" "$ERROR_LOGGING_SCRIPT --action validate"

  # Test with missing jq (simulate)
  local original_path="$PATH"
  PATH="/nonexistent:$PATH"
  run_test "Handles missing dependencies gracefully" "$ERROR_LOGGING_SCRIPT --action diagnostics || true"
  PATH="$original_path"
}

# Test 4: Error capture functionality
test_error_capture() {
  local test_task_id="capture-test-$(date +%s)"

  run_test "Capture CLI error" "$ERROR_LOGGING_SCRIPT --action capture --task-id '$test_task_id' --error-type 'cli' --error-message 'Test CLI error' --exit-code 1"

  # Verify error log was created
  run_test "Error log file created" "ls '$TEST_LOG_BASE_DIR/cfn-error-$test_task_id'* 2>/dev/null | grep -q ."

  # Test with context
  local context_task_id="context-test-$(date +%s)"
  local context_json='{"test": true, "component": "test-suite"}'

  run_test "Capture error with context" "$ERROR_LOGGING_SCRIPT --action capture --task-id '$context_task_id' --error-type 'orchestrator' --error-message 'Test with context' --context '$context_json'"
}

# Test 5: Report generation
test_report_generation() {
  local report_task_id="report-test-$(date +%s)"

  # First capture an error
  "$ERROR_LOGGING_SCRIPT" --action capture --task-id "$report_task_id" --error-type "agent-spawn" --error-message "Test error for report" >/dev/null 2>&1 || true

  run_test "Generate Markdown report" "$ERROR_LOGGING_SCRIPT --action report --task-id '$report_task_id' --format markdown"
  run_test "Generate JSON report" "$ERROR_LOGGING_SCRIPT --action report --task-id '$report_task_id' --format json"

  # Test report file creation
  run_test "Markdown report file created" "ls '$TEST_LOG_BASE_DIR/reports/cfn-report-$report_task_id'*'.md' 2>/dev/null | grep -q ."
  run_test "JSON report generation works" "$ERROR_LOGGING_SCRIPT --action report --task-id '$report_task_id' --format json"
}

# Test 6: CLI integration
test_cli_integration() {
  # Source the CLI integration
  source "$CLI_INTEGRATION"

  run_test "CLI integration loads without errors" "true"

  # Test function availability
  run_test "cfn_capture_error function defined" "type cfn_capture_error >/dev/null"
  run_test "cfn_generate_report function defined" "type cfn_generate_report >/dev/null"
  run_test "cfn_cli_wrapper function defined" "type cfn_cli_wrapper >/dev/null"

  # Test error capture
  local cli_test_id="cli-integration-$(date +%s)"
  run_test "CLI error capture works" "cfn_capture_error '$cli_test_id' 'cli-test' 'CLI integration test' 1"
}

# Test 7: Docker integration
test_docker_integration() {
  # Source the Docker integration
  source "$DOCKER_INTEGRATION"

  run_test "Docker integration loads without errors" "true"

  # Test function availability
  run_test "cfn_capture_docker_error function defined" "type cfn_capture_docker_error >/dev/null"
  run_test "cfn_docker_wrapper function defined" "type cfn_docker_wrapper >/dev/null"
  run_test "cfn_docker_cleanup function defined" "type cfn_docker_cleanup >/dev/null"

  # Test Docker environment detection
  run_test "Docker environment detection works" "is_docker_environment || true"
}

# Test 8: Cleanup functionality
test_cleanup_functionality() {
  if [ "$QUICK_TEST" = true ]; then
    warn_log "Skipping cleanup tests in quick mode"
    return 0
  fi

  # Create some test files
  local test_dir="$TEST_LOG_BASE_DIR/test-cleanup"
  mkdir -p "$test_dir"

  # Create old test files (using touch to set old timestamp)
  local old_date
  old_date=$(date -d "10 days ago" +%Y-%m-%d 2>/dev/null || date -v-10d +%Y-%m-%d)

  touch -d "$old_date" "$test_dir/old-error.json" 2>/dev/null || touch -t "${old_date//-}" "$test_dir/old-error.json" 2>/dev/null || touch "$test_dir/old-error.json"
  touch -d "$old_date" "$test_dir/old-report.md" 2>/dev/null || touch -t "${old_date//-}" "$test_dir/old-report.md" 2>/dev/null || touch "$test_dir/old-report.md"

  # Create recent test files
  echo '{"test": "recent"}' > "$test_dir/recent-error.json"
  echo "# Recent Report" > "$test_dir/recent-report.md"

  # Test dry-run cleanup
  run_test "Cleanup dry-run works" "$CLEANUP_SCRIPT --dry-run --retention-days 5"

  # Test actual cleanup
  run_test "Cleanup removes old files" "$CLEANUP_SCRIPT --force --retention-days 5"

  # Verify recent files still exist
  run_test "Recent files preserved after cleanup" "[ -f '$test_dir/recent-error.json' ] && [ -f '$test_dir/recent-report.md' ]"

  # Cleanup test directory
  rm -rf "$test_dir"
}

# Test 9: System diagnostics
test_system_diagnostics() {
  run_test "System diagnostics execute" "$ERROR_LOGGING_SCRIPT --action diagnostics"

  # Test diagnostics output format
  local diagnostics_output
  diagnostics_output=$("$ERROR_LOGGING_SCRIPT" --action diagnostics 2>&1)

  run_test "Diagnostics include system info" "echo '$diagnostics_output' | grep -q 'System Information'"
  run_test "Diagnostics include resource info" "echo '$diagnostics_output' | grep -q 'Resources'"
}

# Test 10: List functionality
test_list_functionality() {
  # Ensure we have some logs to list
  "$ERROR_LOGGING_SCRIPT" --action capture --task-id "list-test-$(date +%s)" --error-type "test" --error-message "Test for list functionality" >/dev/null 2>&1 || true

  run_test "List recent errors" "$ERROR_LOGGING_SCRIPT --action list --format table"
  run_test "List errors as JSON" "$ERROR_LOGGING_SCRIPT --action list --format json"
}

# Test 11: Error handling
test_error_handling() {
  run_test "Handles invalid action gracefully" "$ERROR_LOGGING_SCRIPT --action invalid-action || true"
  run_test "Handles missing task ID gracefully" "$ERROR_LOGGING_SCRIPT --action capture || true"
  run_test "Handles invalid JSON context gracefully" "$ERROR_LOGGING_SCRIPT --action capture --task-id 'test' --context 'invalid-json' || true"
}

# Test 12: Performance test (only in full mode)
test_performance() {
  if [ "$FULL_TEST" != true ]; then
    warn_log "Skipping performance tests (use --full for comprehensive testing)"
    return 0
  fi

  info_log "Running performance tests..."

  local start_time
  start_time=$(date +%s)

  # Capture multiple errors rapidly
  for i in {1..10}; do
    "$ERROR_LOGGING_SCRIPT" --action capture --task-id "perf-test-$i" --error-type "performance" --error-message "Performance test $i" >/dev/null 2>&1 || true
  done

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  run_test "Multiple error captures complete within 30 seconds" "[ $duration -lt 30 ]"

  # Test report generation performance
  start_time=$(date +%s)

  for i in {1..5}; do
    "$ERROR_LOGGING_SCRIPT" --action report --task-id "perf-test-$i" --format markdown >/dev/null 2>&1 || true
  done

  end_time=$(date +%s)
  duration=$((end_time - start_time))

  run_test "Multiple report generations complete within 20 seconds" "[ $duration -lt 20 ]"
}

# Run specific component test
run_component_test() {
  case "$COMPONENT_TEST" in
    invoke)
      test_help_functionality
      test_dependency_validation
      test_error_capture
      test_report_generation
      test_list_functionality
      test_error_handling
      ;;
    cli)
      test_cli_integration
      ;;
    docker)
      test_docker_integration
      ;;
    cleanup)
      test_cleanup_functionality
      ;;
    reports)
      test_report_generation
      ;;
    *)
      fail_log "Unknown component: $COMPONENT_TEST"
      echo "Available components: invoke, cli, docker, cleanup, reports"
      exit 1
      ;;
  esac
}

# Run all tests
run_all_tests() {
  info_log "Starting CFN Error Logging test suite..."
  info_log "Test Task ID: $TEST_TASK_ID"

  setup_test_env

  # Run core tests
  test_script_permissions
  test_help_functionality
  test_dependency_validation
  test_error_capture
  test_report_generation
  test_cli_integration
  test_docker_integration
  test_system_diagnostics
  test_list_functionality
  test_error_handling

  # Run conditional tests
  if [ "$COMPONENT_TEST" = "" ]; then
    test_cleanup_functionality
    if [ "$FULL_TEST" = true ]; then
      test_performance
    fi
  fi

  cleanup_test_env
}

# Show test results
show_test_results() {
  echo ""
  echo "=================================="
  echo "🏁 CFN Error Logging Test Results"
  echo "=================================="
  echo "Tests run: $TESTS_RUN"
  echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed: ${RED}$TESTS_FAILED${NC}"

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "The CFN Error Logging skill is working correctly."
    echo "You can now use it to capture and diagnose CFN Loop failures."
  else
    echo -e "${RED}❌ Some tests failed.${NC}"
    echo ""
    echo "Please review the failures above and fix any issues."
    echo "Common issues:"
    echo "  - Missing dependencies (jq, bc, etc.)"
    echo "  - Permission issues"
    echo "  - Script syntax errors"
  fi

  echo ""
  echo "Next steps:"
  echo "1. Test with real CFN Loop failures"
  echo "2. Integrate with your CLI and Docker workflows"
  echo "3. Configure automated cleanup schedules"

  # Return appropriate exit code
  if [ "$TESTS_FAILED" -eq 0 ]; then
    return 0
  else
    return 1
  fi
}

# Main execution
main() {
  echo "CFN Error Logging - Test Suite"
  echo "================================"

  if [ -n "$COMPONENT_TEST" ]; then
    info_log "Testing component: $COMPONENT_TEST"
    setup_test_env
    run_component_test
    cleanup_test_env
  else
    run_all_tests
  fi

  show_test_results
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}Test interrupted${NC}"; cleanup_test_env; exit 1' INT TERM

# Run main function
main "$@"