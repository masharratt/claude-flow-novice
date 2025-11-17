#!/bin/bash
# ============================================================
# EXECUTION TRACING TEST SUITE
# Sprint 1.3 - TDD Protocol (Tests Written First)
# Coverage Target: 100% of all tracing operations
# ============================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test database config
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-cfn_workflow_test}
DB_USER=${DB_USER:-postgres}

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TRACING_DIR="$PROJECT_ROOT/src/workflow_codification/tracing"

# Python path setup
export PYTHONPATH="$PROJECT_ROOT/src:$PYTHONPATH"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

run_test() {
    ((TESTS_RUN++))
    log_test "$1"
}

# ============================================================
# TEST SETUP & TEARDOWN
# ============================================================

setup_test_env() {
    echo "=================================================="
    echo "EXECUTION TRACING TEST SUITE"
    echo "=================================================="

    # Check Redis is running
    if ! redis-cli ping > /dev/null 2>&1; then
        echo "ERROR: Redis is not running. Start with: redis-server --daemonize yes"
        exit 1
    fi

    # Check PostgreSQL is accessible
    if ! psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo "ERROR: PostgreSQL is not accessible"
        exit 1
    fi

    # Create test database
    psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME" > /dev/null 2>&1
    psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME" > /dev/null 2>&1

    # Run migration
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$PROJECT_ROOT/src/workflow_codification/migrations/006_execution_traces.sql" > /dev/null 2>&1

    # Clear Redis test data
    redis-cli FLUSHDB > /dev/null 2>&1

    echo "Test environment setup complete"
    echo ""
}

cleanup_test_env() {
    echo ""
    echo "Cleaning up test environment..."

    # Drop test database
    psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME" > /dev/null 2>&1

    # Clear Redis test data
    redis-cli FLUSHDB > /dev/null 2>&1

    echo "Cleanup complete"
}

# ============================================================
# TEST 1: TRACE CREATION & CONTEXT MANAGEMENT
# ============================================================

test_trace_creation() {
    run_test "Trace creation with UUID generation"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
import re

tracer = ExecutionTracer()
trace_id = tracer.start_trace("test-skill", execution_id="exec-001")

# Test: trace_id is valid UUID
uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if not re.match(uuid_pattern, trace_id):
    print(f"FAIL: trace_id is not valid UUID: {trace_id}")
    sys.exit(1)

# Test: initial status is 'running'
trace = tracer.get_current_trace()
if trace['status'] != 'running':
    print(f"FAIL: Expected status 'running', got '{trace['status']}'")
    sys.exit(1)

# Test: skill_name is stored correctly
if trace['skill_name'] != 'test-skill':
    print(f"FAIL: Expected skill_name 'test-skill', got '{trace['skill_name']}'")
    sys.exit(1)

# Test: steps array is initialized
if not isinstance(trace['steps'], list):
    print(f"FAIL: steps is not a list")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Trace creation with UUID generation"
    else
        log_fail "Trace creation with UUID generation"
    fi
}

test_execution_correlation() {
    run_test "Execution ID to trace ID correlation in Redis"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer

tracer = ExecutionTracer()
trace_id = tracer.start_trace("test-skill", execution_id="exec-002")

# Test: trace_id stored in Redis
retrieved_trace_id = tracer.get_trace_id(execution_id="exec-002")
if retrieved_trace_id != trace_id:
    print(f"FAIL: Expected trace_id '{trace_id}', got '{retrieved_trace_id}'")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Execution ID to trace ID correlation in Redis"
    else
        log_fail "Execution ID to trace ID correlation in Redis"
    fi
}

test_metadata_storage() {
    run_test "Metadata storage in trace"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer

tracer = ExecutionTracer()
metadata = {"user_id": "user-123", "environment": "test"}
trace_id = tracer.start_trace("test-skill", metadata=metadata)

# Test: metadata stored correctly
trace = tracer.get_current_trace()
if trace['metadata'] != metadata:
    print(f"FAIL: Expected metadata {metadata}, got {trace['metadata']}")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Metadata storage in trace"
    else
        log_fail "Metadata storage in trace"
    fi
}

# ============================================================
# TEST 2: STEP RECORDING
# ============================================================

test_step_timing() {
    run_test "Step recording with timing"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
import time

tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Start and end step
recorder.start_step("validate-input")
time.sleep(0.1)  # Simulate work
step = recorder.end_step("validate-input", status="success")

# Test: duration is approximately 100ms
if step['duration_ms'] < 90 or step['duration_ms'] > 150:
    print(f"FAIL: Expected duration ~100ms, got {step['duration_ms']}ms")
    sys.exit(1)

# Test: step status is success
if step['status'] != 'success':
    print(f"FAIL: Expected status 'success', got '{step['status']}'")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Step recording with timing"
    else
        log_fail "Step recording with timing"
    fi
}

test_step_order() {
    run_test "Steps appended in correct order"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder

tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Record multiple steps
recorder.record_step("step1", 10)
recorder.record_step("step2", 20)
recorder.record_step("step3", 30)

# Test: steps in correct order
trace = tracer.get_current_trace()
step_names = [step['name'] for step in trace['steps']]
if step_names != ['step1', 'step2', 'step3']:
    print(f"FAIL: Expected ['step1', 'step2', 'step3'], got {step_names}")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Steps appended in correct order"
    else
        log_fail "Steps appended in correct order"
    fi
}

test_error_context() {
    run_test "Error context captured in failed steps"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder

tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Record failed step with error
error_msg = "Invalid input format"
recorder.record_step("validate-input", 15, status="failed", error_message=error_msg)

# Test: error message captured
trace = tracer.get_current_trace()
step = trace['steps'][0]
if step.get('error_message') != error_msg:
    print(f"FAIL: Expected error_message '{error_msg}', got '{step.get('error_message')}'")
    sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Error context captured in failed steps"
    else
        log_fail "Error context captured in failed steps"
    fi
}

test_step_validation() {
    run_test "ValueError raised if end_step called without start_step"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder

tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Try to end step without starting it
try:
    recorder.end_step("non-existent-step")
    print("FAIL: Expected ValueError but no exception raised")
    sys.exit(1)
except ValueError as e:
    if "was not started" not in str(e):
        print(f"FAIL: Expected 'was not started' in error, got: {e}")
        sys.exit(1)

print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "ValueError raised if end_step called without start_step"
    else
        log_fail "ValueError raised if end_step called without start_step"
    fi
}

# ============================================================
# TEST 3: TRACE FINALIZATION & STORAGE
# ============================================================

test_trace_finalization() {
    run_test "Trace finalization with duration calculation"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Record steps with known durations
recorder.record_step("step1", 100)
recorder.record_step("step2", 200)
recorder.record_step("step3", 150)

# Finalize trace
storage = TraceStorage(db_config)
trace = tracer.get_current_trace()
result = storage.finalize_trace(trace, "success")

# Test: total duration calculated correctly
expected_duration = 100 + 200 + 150
if result['total_duration_ms'] != expected_duration:
    print(f"FAIL: Expected total_duration {expected_duration}ms, got {result['total_duration_ms']}ms")
    sys.exit(1)

# Test: status updated
if result['status'] != 'success':
    print(f"FAIL: Expected status 'success', got '{result['status']}'")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Trace finalization with duration calculation"
    else
        log_fail "Trace finalization with duration calculation"
    fi
}

test_postgresql_storage() {
    run_test "Trace stored in PostgreSQL"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

tracer = ExecutionTracer()
trace_id = tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)
recorder.record_step("step1", 100)

# Finalize and store
storage = TraceStorage(db_config)
trace = tracer.get_current_trace()
storage.finalize_trace(trace, "success")

# Test: retrieve trace from database
retrieved = storage.get_trace(trace_id)
if not retrieved:
    print(f"FAIL: Trace {trace_id} not found in database")
    sys.exit(1)

# Test: trace_id matches
if retrieved['trace_id'] != trace_id:
    print(f"FAIL: Expected trace_id '{trace_id}', got '{retrieved['trace_id']}'")
    sys.exit(1)

# Test: skill_name matches
if retrieved['skill_name'] != 'test-skill':
    print(f"FAIL: Expected skill_name 'test-skill', got '{retrieved['skill_name']}'")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Trace stored in PostgreSQL"
    else
        log_fail "Trace stored in PostgreSQL"
    fi
}

test_error_extraction() {
    run_test "Error message extracted from failed steps"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

tracer = ExecutionTracer()
trace_id = tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Record failed step
error_msg = "Connection timeout"
recorder.record_step("connect-db", 50, status="failed", error_message=error_msg)

# Finalize
storage = TraceStorage(db_config)
trace = tracer.get_current_trace()
storage.finalize_trace(trace, "failed")

# Test: error message stored
retrieved = storage.get_trace(trace_id)
if retrieved['error_message'] != error_msg:
    print(f"FAIL: Expected error_message '{error_msg}', got '{retrieved['error_message']}'")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Error message extracted from failed steps"
    else
        log_fail "Error message extracted from failed steps"
    fi
}

test_jsonb_steps() {
    run_test "JSONB steps stored and retrieved correctly"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

tracer = ExecutionTracer()
trace_id = tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)

# Record steps
recorder.record_step("step1", 100, status="success")
recorder.record_step("step2", 200, status="success")

# Finalize
storage = TraceStorage(db_config)
trace = tracer.get_current_trace()
storage.finalize_trace(trace, "success")

# Test: steps retrieved correctly
retrieved = storage.get_trace(trace_id)
if len(retrieved['steps']) != 2:
    print(f"FAIL: Expected 2 steps, got {len(retrieved['steps'])}")
    sys.exit(1)

if retrieved['steps'][0]['name'] != 'step1':
    print(f"FAIL: Expected first step 'step1', got '{retrieved['steps'][0]['name']}'")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "JSONB steps stored and retrieved correctly"
    else
        log_fail "JSONB steps stored and retrieved correctly"
    fi
}

# ============================================================
# TEST 4: TRACE QUERY API
# ============================================================

test_query_by_skill() {
    run_test "Query traces by skill_name"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

# Create traces for different skills
storage = TraceStorage(db_config)

for i in range(3):
    tracer = ExecutionTracer()
    tracer.start_trace("skill-A")
    recorder = TraceRecorder(tracer)
    recorder.record_step("step1", 100)
    trace = tracer.get_current_trace()
    storage.finalize_trace(trace, "success")

for i in range(2):
    tracer = ExecutionTracer()
    tracer.start_trace("skill-B")
    recorder = TraceRecorder(tracer)
    recorder.record_step("step1", 100)
    trace = tracer.get_current_trace()
    storage.finalize_trace(trace, "success")

# Query by skill
query = TraceQuery(db_config)
results = query.query_by_skill("skill-A")

# Test: correct number of results
if len(results) != 3:
    print(f"FAIL: Expected 3 results for skill-A, got {len(results)}")
    sys.exit(1)

# Test: all results are skill-A
for result in results:
    if result['skill_name'] != 'skill-A':
        print(f"FAIL: Expected skill-A, got {result['skill_name']}")
        sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Query traces by skill_name"
    else
        log_fail "Query traces by skill_name"
    fi
}

test_query_pagination() {
    run_test "Query pagination limit"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

# Create 10 traces
storage = TraceStorage(db_config)
for i in range(10):
    tracer = ExecutionTracer()
    tracer.start_trace("test-skill")
    recorder = TraceRecorder(tracer)
    recorder.record_step("step1", 100)
    trace = tracer.get_current_trace()
    storage.finalize_trace(trace, "success")

# Query with limit=5
query = TraceQuery(db_config)
results = query.query_by_skill("test-skill", limit=5)

# Test: limit respected
if len(results) != 5:
    print(f"FAIL: Expected 5 results, got {len(results)}")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Query pagination limit"
    else
        log_fail "Query pagination limit"
    fi
}

test_similar_failures() {
    run_test "Find similar failures with Jaccard similarity"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

# Create failed traces with similar errors
storage = TraceStorage(db_config)

error_messages = [
    "Connection timeout to database server",
    "Database server connection timeout error",
    "Network error connecting to API",
    "Timeout waiting for database response"
]

for error_msg in error_messages:
    tracer = ExecutionTracer()
    tracer.start_trace("test-skill")
    recorder = TraceRecorder(tracer)
    recorder.record_step("step1", 100, status="failed", error_message=error_msg)
    trace = tracer.get_current_trace()
    storage.finalize_trace(trace, "failed")

# Find similar failures
query = TraceQuery(db_config)
results = query.find_similar_failures("timeout database connection")

# Test: found similar failures
if len(results) < 2:
    print(f"FAIL: Expected at least 2 similar failures, got {len(results)}")
    sys.exit(1)

# Test: similarity scores exist
for result in results:
    if 'similarity_score' not in result:
        print(f"FAIL: Missing similarity_score in result")
        sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Find similar failures with Jaccard similarity"
    else
        log_fail "Find similar failures with Jaccard similarity"
    fi
}

test_no_matching_failures() {
    run_test "No results for non-matching error patterns"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

# Create failed trace
storage = TraceStorage(db_config)
tracer = ExecutionTracer()
tracer.start_trace("test-skill")
recorder = TraceRecorder(tracer)
recorder.record_step("step1", 100, status="failed", error_message="Memory allocation failed")
trace = tracer.get_current_trace()
storage.finalize_trace(trace, "failed")

# Search for completely different error
query = TraceQuery(db_config)
results = query.find_similar_failures("network socket timeout")

# Test: no or very low similarity results (similarity < 0.3)
for result in results:
    if result.get('similarity_score', 0) >= 0.3:
        print(f"FAIL: Expected no high-similarity results, got score {result['similarity_score']}")
        sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "No results for non-matching error patterns"
    else
        log_fail "No results for non-matching error patterns"
    fi
}

# ============================================================
# TEST 5: INTEGRATION & EDGE CASES
# ============================================================

test_full_workflow() {
    run_test "Full tracing workflow integration"

    python3 <<EOF
import sys
sys.path.insert(0, "$PROJECT_ROOT/src")

from workflow_codification.tracing.tracer import ExecutionTracer
from workflow_codification.tracing.trace_recorder import TraceRecorder
from workflow_codification.tracing.trace_storage import TraceStorage
from workflow_codification.tracing.trace_query import TraceQuery

db_config = {
    'host': '$DB_HOST',
    'port': $DB_PORT,
    'database': '$DB_NAME',
    'user': '$DB_USER'
}

# Step 1: Start trace
tracer = ExecutionTracer()
trace_id = tracer.start_trace("integration-test", execution_id="exec-999", metadata={"env": "test"})

# Step 2: Record steps
recorder = TraceRecorder(tracer)
recorder.record_step("load-config", 50, status="success")
recorder.record_step("validate-input", 75, status="success")
recorder.record_step("process-data", 200, status="success")

# Step 3: Finalize
storage = TraceStorage(db_config)
trace = tracer.get_current_trace()
result = storage.finalize_trace(trace, "success")

# Step 4: Query
query = TraceQuery(db_config)
results = query.query_by_skill("integration-test")

# Test: trace found
if len(results) != 1:
    print(f"FAIL: Expected 1 result, got {len(results)}")
    sys.exit(1)

# Test: trace_id matches
if results[0]['trace_id'] != trace_id:
    print(f"FAIL: trace_id mismatch")
    sys.exit(1)

# Test: total duration is correct
expected_duration = 50 + 75 + 200
if results[0]['total_duration_ms'] != expected_duration:
    print(f"FAIL: Expected duration {expected_duration}, got {results[0]['total_duration_ms']}")
    sys.exit(1)

storage.close()
print("PASS")
EOF

    if [ $? -eq 0 ]; then
        log_pass "Full tracing workflow integration"
    else
        log_fail "Full tracing workflow integration"
    fi
}

# ============================================================
# MAIN TEST EXECUTION
# ============================================================

main() {
    setup_test_env

    echo "Running Test Suite..."
    echo ""

    # Test 1: Trace Creation
    echo "--- Test Group 1: Trace Creation & Context Management ---"
    test_trace_creation
    test_execution_correlation
    test_metadata_storage
    echo ""

    # Test 2: Step Recording
    echo "--- Test Group 2: Step Recording ---"
    test_step_timing
    test_step_order
    test_error_context
    test_step_validation
    echo ""

    # Test 3: Trace Finalization
    echo "--- Test Group 3: Trace Finalization & Storage ---"
    test_trace_finalization
    test_postgresql_storage
    test_error_extraction
    test_jsonb_steps
    echo ""

    # Test 4: Query API
    echo "--- Test Group 4: Trace Query API ---"
    test_query_by_skill
    test_query_pagination
    test_similar_failures
    test_no_matching_failures
    echo ""

    # Test 5: Integration
    echo "--- Test Group 5: Integration & Edge Cases ---"
    test_full_workflow
    echo ""

    # Summary
    echo "=================================================="
    echo "TEST SUMMARY"
    echo "=================================================="
    echo "Total Tests: $TESTS_RUN"
    echo "Passed: $TESTS_PASSED"
    echo "Failed: $TESTS_FAILED"

    # Calculate coverage
    COVERAGE_PERCENT=$((TESTS_PASSED * 100 / TESTS_RUN))
    echo "Coverage: ${COVERAGE_PERCENT}%"
    echo "=================================================="

    cleanup_test_env

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# Run main
main
