#!/bin/bash
# Comprehensive Audit Trail Test Script
# Tests both Task Mode and CLI Mode audit storage and retrieval functionality
#
# Usage: ./test-audit-trail.sh [--cleanup] [--verbose]
#
# This script validates:
# - Task Mode audit storage (store-task-audit.sh)
# - CLI Mode audit storage (Redis result keys)
# - Audit retrieval (get-audit-data.sh) with different modes and formats
# - Data integrity across both storage systems
# - Error handling and edge cases
# - ANTI-023 memory leak protection

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
STORE_TASK_AUDIT="$PROJECT_ROOT/.claude/skills/cfn-task-audit/store-task-audit.sh"
GET_AUDIT_DATA="$PROJECT_ROOT/.claude/skills/cfn-task-audit/get-audit-data.sh"

# Test variables
TEST_TASK_ID="test-audit-$(date +%s)"
TEST_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DB_PATH="${HOME}/.claude/memory/cfn-loop.db"
VERBOSE=false
CLEANUP_AFTER=true

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Sample test data
TASK_MODE_SAMPLE_OUTPUT='{
  "decision": "PROCEED",
  "reasoning": "Implementation completed successfully with all deliverables created",
  "confidence": 0.92,
  "deliverables": ["src/auth/jwt-handler.js", "tests/auth.test.js", "docs/JWT_AUTH.md"],
  "iteration": 1,
  "agent_type": "backend-developer",
  "timestamp": "'$TEST_TIMESTAMP'",
  "metadata": {
    "execution_mode": "Task",
    "completion_time": "2025-01-15T10:30:00Z"
  }
}'

CLI_MODE_SAMPLE_OUTPUT='{
  "confidence": 0.88,
  "result": {
    "decision": "PROCEED",
    "reasoning": "Code review completed, all quality gates passed",
    "deliverables": ["src/auth/jwt-handler.js", "tests/auth.test.js"]
  },
  "agent_id": "reviewer-001",
  "execution_mode": "CLI",
  "iteration": 1,
  "timestamp": "'$TEST_TIMESTAMP'",
  "metadata": {
    "review_time": "2025-01-15T10:35:00Z",
    "issues_found": 0
  }
}'

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --cleanup)
      CLEANUP_AFTER=true
      shift
      ;;
    --no-cleanup)
      CLEANUP_AFTER=false
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--cleanup|--no-cleanup] [--verbose] [--help]"
      echo ""
      echo "Options:"
      echo "  --cleanup      Clean up test data after completion (default)"
      echo "  --no-cleanup   Leave test data for inspection"
      echo "  --verbose      Show detailed test output"
      echo "  --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

# Helper functions
log_verbose() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1" >&2
    fi
}

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TESTS_RUN++))
    log_info "Running test: $test_name"

    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        if [ "$VERBOSE" = true ]; then
            echo "Command that failed: $test_command" >&2
            eval "$test_command" >&2 || true
        fi
        return 1
    fi
}

# Setup functions
setup_test_environment() {
    log_info "Setting up test environment..."

    # Check if Redis is available
    if ! command -v redis-cli &> /dev/null; then
        log_error "Redis CLI not found. Please install Redis."
        exit 1
    fi

    # Check if Redis is running
    if ! redis-cli ping > /dev/null 2>&1; then
        log_error "Redis server is not running. Please start Redis."
        exit 1
    fi

    # Check if required scripts exist
    if [ ! -f "$STORE_TASK_AUDIT" ]; then
        log_error "store-task-audit.sh not found at: $STORE_TASK_AUDIT"
        exit 1
    fi

    if [ ! -f "$GET_AUDIT_DATA" ]; then
        log_error "get-audit-data.sh not found at: $GET_AUDIT_DATA"
        exit 1
    fi

    # Make scripts executable
    chmod +x "$STORE_TASK_AUDIT"
    chmod +x "$GET_AUDIT_DATA"

    log_info "Test environment setup complete"
}

# Cleanup functions
cleanup_test_data() {
    if [ "$CLEANUP_AFTER" = true ]; then
        log_info "Cleaning up test data..."

        # Clean up Redis keys
        redis-cli --scan --pattern "swarm:${TEST_TASK_ID}:*" | while read -r key; do
            if [ -n "$key" ]; then
                redis-cli del "$key" > /dev/null 2>&1 || true
            fi
        done

        # Clean up SQLite data
        if [ -f "$DB_PATH" ]; then
            sqlite3 "$DB_PATH" "DELETE FROM agent_audit WHERE task_id LIKE 'test-audit-%';" > /dev/null 2>&1 || true
        fi

        # Clean up log files
        rm -f "${HOME}/.claude/logs/task-audit/task-audit-$(date +%Y%m%d).log" > /dev/null 2>&1 || true

        log_info "Test data cleanup complete"
    else
        log_warning "Skipping cleanup. Test data preserved for inspection."
        log_info "Test Task ID: $TEST_TASK_ID"
    fi
}

# Test functions
test_task_mode_storage() {
    log_verbose "Testing Task Mode audit storage..."

    # Store Task Mode audit data
    echo "$TASK_MODE_SAMPLE_OUTPUT" | "$STORE_TASK_AUDIT" \
        --task-id "$TEST_TASK_ID" \
        --agent-type "backend-developer" \
        --output-file -

    # Verify Redis storage
    local redis_key="swarm:${TEST_TASK_ID}:backend-developer:audit"
    local redis_data
    redis_data=$(redis-cli HGET "$redis_key" "decision" 2>/dev/null || echo "")

    if [ "$redis_data" != "PROCEED" ]; then
        return 1
    fi

    # Verify SQLite storage
    local sqlite_count
    sqlite_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_audit WHERE task_id = '$TEST_TASK_ID' AND agent_type = 'backend-developer';" 2>/dev/null || echo "0")

    if [ "$sqlite_count" != "1" ]; then
        return 1
    fi

    return 0
}

test_cli_mode_storage() {
    log_verbose "Testing CLI Mode audit storage..."

    # Store CLI Mode audit data (simulate Redis result key)
    local redis_key="swarm:${TEST_TASK_ID}:reviewer-001:result"

    redis-cli HSET "$redis_key" \
        "confidence" "0.88" \
        "result" "$CLI_MODE_SAMPLE_OUTPUT" \
        "agent_id" "reviewer-001" \
        "execution_mode" "CLI" \
        "timestamp" "$TEST_TIMESTAMP" > /dev/null 2>&1

    redis-cli EXPIRE "$redis_key" 86400 > /dev/null 2>&1

    # Verify Redis storage
    local redis_data
    redis_data=$(redis-cli HGET "$redis_key" "confidence" 2>/dev/null || echo "")

    if [ "$redis_data" != "0.88" ]; then
        return 1
    fi

    return 0
}

test_retrieval_combined_mode() {
    log_verbose "Testing combined audit data retrieval..."

    # Retrieve combined data
    local combined_data
    combined_data=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --mode combined --format json 2>/dev/null)

    if [ -z "$combined_data" ]; then
        return 1
    fi

    # Verify we have data from both modes
    if command -v jq &> /dev/null; then
        local total_agents
        total_agents=$(echo "$combined_data" | jq '. | length')

        if [ "$total_agents" != "2" ]; then
            log_verbose "Expected 2 agents, found $total_agents"
            return 1
        fi

        # Check for Task Mode data
        local task_mode_count
        task_mode_count=$(echo "$combined_data" | jq '[.[] | select(.mode == "Task")] | length')

        if [ "$task_mode_count" != "1" ]; then
            log_verbose "Expected 1 Task Mode agent, found $task_mode_count"
            return 1
        fi
    else
        # Fallback check if jq not available
        if ! echo "$combined_data" | grep -q "backend-developer"; then
            return 1
        fi
        if ! echo "$combined_data" | grep -q "reviewer-001"; then
            return 1
        fi
    fi

    return 0
}

test_retrieval_task_mode_only() {
    log_verbose "Testing Task Mode only retrieval..."

    local task_data
    task_data=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --mode task --format json 2>/dev/null)

    if [ -z "$task_data" ]; then
        return 1
    fi

    # Should only contain Task Mode data
    if command -v jq &> /dev/null; then
        local task_mode_count
        task_mode_count=$(echo "$task_data" | jq '[.[] | select(.mode == "Task")] | length')
        local total_count
        total_count=$(echo "$task_data" | jq '. | length')

        if [ "$task_mode_count" != "$total_count" ] || [ "$total_count" != "1" ]; then
            return 1
        fi
    else
        if echo "$task_data" | grep -q "reviewer-001"; then
            return 1
        fi
    fi

    return 0
}

test_retrieval_cli_mode_only() {
    log_verbose "Testing CLI Mode only retrieval..."

    local cli_data
    cli_data=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --mode cli --format json 2>/dev/null)

    if [ -z "$cli_data" ]; then
        return 1
    fi

    # Should only contain CLI Mode data
    if command -v jq &> /dev/null; then
        local cli_mode_count
        cli_mode_count=$(echo "$cli_data" | jq '[.[] | select(.mode == "CLI")] | length')
        local total_count
        total_count=$(echo "$cli_data" | jq '. | length')

        if [ "$cli_mode_count" != "$total_count" ] || [ "$total_count" != "1" ]; then
            return 1
        fi
    else
        if echo "$cli_data" | grep -q "backend-developer"; then
            return 1
        fi
    fi

    return 0
}

test_table_format() {
    log_verbose "Testing table format output..."

    if ! command -v jq &> /dev/null; then
        log_warning "Skipping table format test (jq not available)"
        return 0
    fi

    local table_output
    table_output=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --format table 2>/dev/null)

    if [ -z "$table_output" ]; then
        return 1
    fi

    # Check for table headers
    if ! echo "$table_output" | grep -q "TASK_ID"; then
        return 1
    fi

    if ! echo "$table_output" | grep -q "AGENT_TYPE"; then
        return 1
    fi

    if ! echo "$table_output" | grep -q "$TEST_TASK_ID"; then
        return 1
    fi

    return 0
}

test_summary_format() {
    log_verbose "Testing summary format output..."

    if ! command -v jq &> /dev/null; then
        log_warning "Skipping summary format test (jq not available)"
        return 0
    fi

    local summary_output
    summary_output=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --format summary 2>/dev/null)

    if [ -z "$summary_output" ]; then
        return 1
    fi

    # Check for summary elements
    if ! echo "$summary_output" | grep -q "AUDIT SUMMARY"; then
        return 1
    fi

    if ! echo "$summary_output" | grep -q "Total Agents: 2"; then
        return 1
    fi

    if ! echo "$summary_output" | grep -q "Task Mode Agents: 1"; then
        return 1
    fi

    if ! echo "$summary_output" | grep -q "CLI Mode Agents: 1"; then
        return 1
    fi

    return 0
}

test_error_handling() {
    log_verbose "Testing error handling..."

    # Test missing task ID
    if "$GET_AUDIT_DATA" --task-id "" 2>/dev/null; then
        return 1
    fi

    # Test invalid mode
    if "$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --mode invalid 2>/dev/null; then
        return 1
    fi

    # Test invalid format
    if "$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --format invalid 2>/dev/null; then
        return 1
    fi

    # Test store audit with missing parameters
    if echo "{}" | "$STORE_TASK_AUDIT" --task-id "" --agent-type "test" 2>/dev/null; then
        return 1
    fi

    return 0
}

test_data_integrity() {
    log_verbose "Testing data integrity..."

    # Retrieve detailed data and verify structure
    local detailed_data
    detailed_data=$("$GET_AUDIT_DATA" --task-id "$TEST_TASK_ID" --mode combined --format json 2>/dev/null)

    if [ -z "$detailed_data" ]; then
        return 1
    fi

    if command -v jq &> /dev/null; then
        # Verify Task Mode data structure
        local task_decision
        task_decision=$(echo "$detailed_data" | jq -r '.[] | select(.agent_type == "backend-developer") | .decision')

        if [ "$task_decision" != "PROCEED" ]; then
            log_verbose "Task Mode decision mismatch: expected PROCEED, got $task_decision"
            return 1
        fi

        local task_confidence
        task_confidence=$(echo "$detailed_data" | jq -r '.[] | select(.agent_type == "backend-developer") | .confidence')

        if [ "$task_confidence" != "0.92" ]; then
            log_verbose "Task Mode confidence mismatch: expected 0.92, got $task_confidence"
            return 1
        fi

        # Verify CLI Mode data structure
        local cli_confidence
        cli_confidence=$(echo "$detailed_data" | jq -r '.[] | select(.agent_id == "reviewer-001") | .confidence')

        if [ "$cli_confidence" != "0.88" ]; then
            log_verbose "CLI Mode confidence mismatch: expected 0.88, got $cli_confidence"
            return 1
        fi
    fi

    return 0
}

test_memory_leak_protection() {
    log_verbose "Testing ANTI-023 memory leak protection..."

    # This test validates that Task Mode agents don't use Redis coordination
    # The protection is maintained by using the audit storage script instead of direct Redis

    # Verify audit data is stored in the correct pattern (not coordination keys)
    local coordination_keys
    coordination_keys=$(redis-cli --scan --pattern "swarm:${TEST_TASK_ID}:*:done" 2>/dev/null || echo "")

    if [ -n "$coordination_keys" ]; then
        log_verbose "Found coordination keys that shouldn't exist for Task Mode agents: $coordination_keys"
        return 1
    fi

    # Verify audit keys exist instead
    local audit_keys
    audit_keys=$(redis-cli --scan --pattern "swarm:${TEST_TASK_ID}:*:audit" 2>/dev/null || echo "")

    if [ -z "$audit_keys" ]; then
        log_verbose "No audit keys found, storage may have failed"
        return 1
    fi

    return 0
}

test_sqlite_persistence() {
    log_verbose "Testing SQLite persistence..."

    # Verify data exists in SQLite
    local sqlite_data
    sqlite_data=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_audit WHERE task_id = '$TEST_TASK_ID';" 2>/dev/null || echo "0")

    if [ "$sqlite_data" != "1" ]; then
        log_verbose "SQLite persistence failed, expected 1 record, found $sqlite_data"
        return 1
    fi

    # Verify data structure
    local task_record
    task_record=$(sqlite3 "$DB_PATH" "SELECT decision, confidence FROM agent_audit WHERE task_id = '$TEST_TASK_ID' AND agent_type = 'backend-developer';" 2>/dev/null || echo "")

    if ! echo "$task_record" | grep -q "PROCEED"; then
        log_verbose "SQLite record doesn't contain expected decision"
        return 1
    fi

    if ! echo "$task_record" | grep -q "0.92"; then
        log_verbose "SQLite record doesn't contain expected confidence"
        return 1
    fi

    return 0
}

# Main test execution
main() {
    echo -e "${CYAN}=== Comprehensive Audit Trail Test Suite ===${NC}"
    echo "Test Task ID: $TEST_TASK_ID"
    echo "Timestamp: $TEST_TIMESTAMP"
    echo ""

    # Setup test environment
    setup_test_environment

    # Run tests
    log_info "Starting audit trail tests..."
    echo ""

    # Core functionality tests
    run_test "Task Mode Storage" test_task_mode_storage
    run_test "CLI Mode Storage" test_cli_mode_storage
    run_test "Combined Mode Retrieval" test_retrieval_combined_mode
    run_test "Task Mode Only Retrieval" test_retrieval_task_mode_only
    run_test "CLI Mode Only Retrieval" test_retrieval_cli_mode_only

    # Format tests
    run_test "Table Format Output" test_table_format
    run_test "Summary Format Output" test_summary_format

    # Data integrity tests
    run_test "Data Integrity Validation" test_data_integrity
    run_test "SQLite Persistence" test_sqlite_persistence

    # Protection tests
    run_test "ANTI-023 Memory Leak Protection" test_memory_leak_protection

    # Error handling tests
    run_test "Error Handling" test_error_handling

    # Display results
    echo ""
    echo -e "${CYAN}=== Test Results ===${NC}"
    echo "Tests Run: $TESTS_RUN"
    echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ All audit trail tests PASSED!${NC}"
        EXIT_CODE=0
    else
        echo ""
        echo -e "${RED}❌ Some audit trail tests FAILED!${NC}"
        EXIT_CODE=1
    fi

    # Cleanup
    cleanup_test_data

    exit $EXIT_CODE
}

# Run main function
main "$@"