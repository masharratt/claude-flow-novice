#!/usr/bin/env bash
# tests/docker/north-star/run-all-tests.sh
# Comprehensive CFN Loop North Star test runner

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test runner configuration
COVERAGE=false
PERFORMANCE=false
VERBOSE=false
FAIL_FAST=false
CATEGORIES=("01-agent-spawning" "02-file-operations" "03-redis-coordination" "04-prompt-injection" "05-handoff-points" "06-integration" "07-performance" "08-error-recovery")

# Results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

cleanup() {
  log_step "Cleanup: Test runner artifacts"
  rm -f /tmp/north-star-runner-*.log || true
}
trap cleanup EXIT

print_usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "OPTIONS:"
  echo "  --coverage    Generate coverage reports"
  echo "  --performance Run performance profiling"
  echo "  --verbose     Enable verbose output"
  echo "  --fail-fast   Stop on first failure"
  echo "  --category N  Run specific test category (01-08)"
  echo "  --help        Show this help message"
  echo ""
  echo "EXAMPLES:"
  echo "  $0                    # Run all tests"
  echo "  $0 --category 01      # Run only agent spawning tests"
  echo "  $0 --coverage         # Run all tests with coverage"
  echo "  $0 --fail-fast        # Stop on first failure"
}

parse_arguments() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --coverage)
        COVERAGE=true
        shift
        ;;
      --performance)
        PERFORMANCE=true
        shift
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      --fail-fast)
        FAIL_FAST=true
        shift
        ;;
      --category)
        if [[ $# -gt 1 && $2 =~ ^[0-8]{2}$ ]]; then
          CATEGORIES=("$2")
          shift 2
        else
          log_error "Invalid category. Use 01-08."
          exit 1
        fi
        ;;
      --help)
        print_usage
        exit 0
        ;;
      *)
        log_error "Unknown argument: $1"
        print_usage
        exit 1
        ;;
    esac
  done
}

validate_environment() {
  log_step "Validating test environment"

  # Check dependencies
  local dependencies=("docker" "redis-cli" "node" "npm")
  for dep in "${dependencies[@]}"; do
    if ! command -v "$dep" &> /dev/null; then
      log_error "Dependency not found: $dep"
      exit 1
    fi
  done

  # Check Claude Flow Novice CLI
  if [ ! -f "$PROJECT_ROOT/.claude/commands/cfn/cfn-loop-cli" ]; then
    log_error "CFN Loop CLI not found"
    exit 1
  fi

  # Check Redis connectivity
  if ! redis-cli ping > /dev/null 2>&1; then
    log_error "Redis not available"
    exit 1
  fi

  log_info "✅ Environment validation passed"
}

run_category_tests() {
  local category="$1"
  local category_path="$PROJECT_ROOT/tests/docker/north-star/$category"

  if [ ! -d "$category_path" ]; then
    log_warn "Category directory not found: $category"
    return 0
  fi

  log_info "Running $category tests..."

  # Find all test scripts in category
  local test_scripts=$(find "$category_path" -name "test-*.sh" -type f | sort)

  if [ -z "$test_scripts" ]; then
    log_warn "No test scripts found in $category"
    return 0
  fi

  while IFS= read -r test_script; do
    if [ -f "$test_script" ] && [ -x "$test_script" ]; then
      run_single_test "$test_script"
    fi
  done <<< "$test_scripts"
}

run_single_test() {
  local test_script="$1"
  local test_name=$(basename "$test_script" .sh)
  local category=$(basename "$(dirname "$test_script")")
  local log_file="/tmp/north-star-runner-${category}-${test_name}.log"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  log_info "Running: $category/$test_name"

  local start_time=$(date +%s)

  # Execute test with timeout and output capture
  local test_output
  local test_exit_code

  if [ "$VERBOSE" = true ]; then
    # Verbose mode - show output in real-time
    timeout 300 "$test_script" 2>&1 | tee "$log_file"
    test_exit_code=${PIPESTATUS[0]}
  else
    # Normal mode - capture output for summary
    test_output=$(timeout 300 "$test_script" 2>&1 || true)
    test_exit_code=$?
    echo "$test_output" > "$log_file"
  fi

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  # Evaluate test result
  if [ $test_exit_code -eq 0 ]; then
    PASSED_TESTS=$((PASSED_TESTS + 1))
    log_success "✅ PASSED ($category/$test_name) (${duration}s)"
  elif [ $test_exit_code -eq 124 ]; then
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log_error "❌ TIMEOUT ($category/$test_name) (300s limit)"
  else
    FAILED_TESTS=$((FAILED_TESTS + 1))
    log_error "❌ FAILED ($category/$test_name) (${duration}s) - Exit code: $test_exit_code"

    # Show error details
    if [ -f "$log_file" ]; then
      log_error "Error details (last 10 lines):"
      tail -10 "$log_file" | sed 's/^/  /'
    fi
  fi

  # Fail fast if requested
  if [ "$FAIL_FAST" = true ] && [ $FAILED_TESTS -gt 0 ]; then
    log_error "Stopping execution due to failure (fail-fast mode)"
    exit 1
  fi

  echo "---"
}

generate_coverage_report() {
  if [ "$COVERAGE" = true ]; then
    log_step "Generating coverage report"

    local coverage_dir="$PROJECT_ROOT/.artifacts/coverage/north-star"
    mkdir -p "$coverage_dir"

    # Generate summary report
    cat > "$coverage_dir/summary.txt" << EOF
CFN Loop North Star Test Coverage Report
Generated: $(date)

Test Categories: ${#CATEGORIES[@]}
Total Tests: $TOTAL_TESTS
Passed: $PASSED_TESTS
Failed: $FAILED_TESTS
Skipped: $SKIPPED_TESTS

Success Rate: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%
EOF

    log_info "Coverage report generated: $coverage_dir/summary.txt"
  fi
}

generate_performance_report() {
  if [ "$PERFORMANCE" = true ]; then
    log_step "Generating performance report"

    local perf_dir="$PROJECT_ROOT/.artifacts/performance/north-star"
    mkdir -p "$perf_dir"

    # Analyze test performance from logs
    echo "CFN Loop North Star Performance Report" > "$perf_dir/report.txt"
    echo "Generated: $(date)" >> "$perf_dir/report.txt"
    echo "" >> "$perf_dir/report.txt"

    # Extract timing information from test logs
    for log_file in /tmp/north-star-runner-*.log; do
      if [ -f "$log_file" ]; then
        local test_name=$(basename "$log_file" .log)
        local duration=$(grep "execution time" "$log_file" | grep -o "[0-9]*s" | head -1 || echo "N/A")
        echo "$test_name: $duration" >> "$perf_dir/report.txt"
      fi
    done

    log_info "Performance report generated: $perf_dir/report.txt"
  fi
}

print_summary() {
  log_step "Test Summary"

  echo "================================"
  echo "CFN Loop North Star Test Results"
  echo "================================"
  echo "Categories tested: ${#CATEGORIES[@]}"
  echo "Total tests: $TOTAL_TESTS"
  echo "Passed: $PASSED_TESTS"
  echo "Failed: $FAILED_TESTS"
  echo "Skipped: $SKIPPED_TESTS"
  echo ""

  if [ $TOTAL_TESTS -gt 0 ]; then
    local success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "Success rate: ${success_rate}%"

    if [ $FAILED_TESTS -eq 0 ]; then
      log_success "🎉 All tests passed!"
    else
      log_error "💥 $FAILED_TESTS test(s) failed"
    fi
  fi

  echo ""
  echo "Test logs available in /tmp/north-star-runner-*.log"
  echo "Artifacts directory: $PROJECT_ROOT/.artifacts/"
}

# Main execution
main() {
  annotate "CFN Loop North Star Test Runner" \
    "Comprehensive test suite for CFN Loop components and integration"

  parse_arguments "$@"
  validate_environment

  log_info "Starting CFN Loop North Star test suite..."
  log_info "Categories: ${CATEGORIES[*]}"
  log_info "Coverage: $COVERAGE"
  log_info "Performance: $PERFORMANCE"
  log_info "Verbose: $VERBOSE"
  log_info "Fail Fast: $FAIL_FAST"

  # Run test categories
  for category in "${CATEGORIES[@]}"; do
    run_category_tests "$category"
  done

  # Generate reports
  generate_coverage_report
  generate_performance_report
  print_summary

  # Exit with appropriate code
  if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
}

# Execute test runner
main "$@"