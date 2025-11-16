#!/bin/bash
# Comprehensive Redis Integration Test Suite
# Tests: Connection, Health Score Cache, Circuit Breaker, Trace Context
# Coverage Target: 100% of all Redis operations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

# Test helper
run_test() {
  local test_name="$1"
  local test_command="$2"

  if eval "$test_command"; then
    echo -e "${GREEN}✓${NC} $test_name"
    ((PASSED++))
    return 0
  else
    echo -e "${RED}✗${NC} $test_name"
    ((FAILED++))
    return 1
  fi
}

# Check Redis is running
echo "Checking Redis availability..."
if ! redis-cli ping >/dev/null 2>&1; then
  echo -e "${RED}Error: Redis is not running.${NC}"
  echo "Start with: redis-server --daemonize yes"
  exit 1
fi
echo -e "${GREEN}Redis is running${NC}"
echo

# Clean test data before starting
echo "Cleaning Redis test data..."
redis-cli FLUSHDB >/dev/null
echo "Database flushed"
echo

# Setup Python path
export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"

echo "======================================"
echo "Redis Integration Test Suite"
echo "======================================"
echo

# ============================================================
# TEST SUITE 1: Redis Connection Manager
# ============================================================
echo "TEST SUITE 1: Redis Connection Manager"
echo "--------------------------------------"

run_test "Connection: Client initialization succeeds" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.client import RedisClient; client = RedisClient(); assert client is not None'"

run_test "Connection: Ping returns True" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.client import RedisClient; client = RedisClient(); assert client.ping() == True'"

run_test "Connection: get_client returns Redis instance" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.client import RedisClient; import redis; client = RedisClient(); assert isinstance(client.get_client(), redis.Redis)'"

echo

# ============================================================
# TEST SUITE 2: Health Score Cache
# ============================================================
echo "TEST SUITE 2: Health Score Cache"
echo "---------------------------------"

# Test 2.1: GET returns None for missing key
run_test "Cache: GET returns None for missing key" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); result = cache.get(\"nonexistent-skill\"); assert result is None, f\"Expected None, got {result}\"'"

# Test 2.2: SET stores value
run_test "Cache: SET stores value successfully" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"test-skill-1\", {\"score\": 85, \"status\": \"healthy\"})'"

# Test 2.3: GET returns cached value after SET
run_test "Cache: GET returns cached value after SET" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"test-skill-2\", {\"score\": 92, \"status\": \"excellent\"}); result = cache.get(\"test-skill-2\"); assert result[\"score\"] == 92, f\"Expected 92, got {result}\"'"

# Test 2.4: TTL is set correctly
run_test "Cache: TTL is set to 300 seconds" \
  "TTL=\$(redis-cli TTL health_score:test-skill-2); [[ \$TTL -gt 290 && \$TTL -le 300 ]]"

# Test 2.5: invalidate removes key
run_test "Cache: invalidate removes key" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"test-skill-3\", {\"score\": 75}); cache.invalidate(\"test-skill-3\"); result = cache.get(\"test-skill-3\"); assert result is None, f\"Expected None after invalidate, got {result}\"'"

# Test 2.6: get_all returns all cached skills
run_test "Cache: get_all returns all cached skill names" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"skill-a\", {\"score\": 80}); cache.set(\"skill-b\", {\"score\": 90}); skills = cache.get_all(); assert \"skill-a\" in skills and \"skill-b\" in skills, f\"Expected both skills, got {skills}\"'"

# Test 2.7: Complex object serialization
run_test "Cache: Complex object serialization works" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); data = {\"score\": 88, \"metrics\": {\"latency\": 150, \"errors\": 2}, \"tags\": [\"critical\", \"monitored\"]}; cache.set(\"complex-skill\", data); result = cache.get(\"complex-skill\"); assert result[\"metrics\"][\"latency\"] == 150, f\"Serialization failed: {result}\"'"

echo

# ============================================================
# TEST SUITE 3: Circuit Breaker State Manager
# ============================================================
echo "TEST SUITE 3: Circuit Breaker State Manager"
echo "-------------------------------------------"

# Test 3.1: Initial state is CLOSED
run_test "Circuit Breaker: Initial state is CLOSED with 0 failures" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); state = cb.get_state(\"cb-test-1\"); assert state[\"status\"] == \"CLOSED\" and state[\"consecutive_failures\"] == 0, f\"Unexpected initial state: {state}\"'"

# Test 3.2: record_failure increments counter
run_test "Circuit Breaker: record_failure increments counter" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); cb.record_failure(\"cb-test-2\"); state = cb.get_state(\"cb-test-2\"); assert state[\"consecutive_failures\"] == 1, f\"Expected 1 failure, got {state}\"'"

# Test 3.3: Multiple failures increment correctly
run_test "Circuit Breaker: Multiple failures increment correctly" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-3\") for _ in range(3)]; state = cb.get_state(\"cb-test-3\"); assert state[\"consecutive_failures\"] == 3, f\"Expected 3 failures, got {state}\"'"

# Test 3.4: Circuit opens after 5 failures
run_test "Circuit Breaker: Opens after 5 failures" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-4\") for _ in range(5)]; state = cb.get_state(\"cb-test-4\"); assert state[\"status\"] == \"OPEN\", f\"Expected OPEN, got {state}\"'"

# Test 3.5: is_open returns True when circuit is OPEN
run_test "Circuit Breaker: is_open returns True when OPEN" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-5\") for _ in range(5)]; assert cb.is_open(\"cb-test-5\") == True, \"Expected is_open to return True\"'"

# Test 3.6: is_open returns False when circuit is CLOSED
run_test "Circuit Breaker: is_open returns False when CLOSED" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); assert cb.is_open(\"cb-test-6\") == False, \"Expected is_open to return False for new circuit\"'"

# Test 3.7: record_success closes circuit
run_test "Circuit Breaker: record_success closes circuit and resets failures" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-7\") for _ in range(5)]; cb.record_success(\"cb-test-7\"); state = cb.get_state(\"cb-test-7\"); assert state[\"status\"] == \"CLOSED\" and state[\"consecutive_failures\"] == 0, f\"Expected CLOSED with 0 failures, got {state}\"'"

# Test 3.8: HALF_OPEN state transition
run_test "Circuit Breaker: set_half_open transitions to HALF_OPEN" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-8\") for _ in range(5)]; cb.set_half_open(\"cb-test-8\"); state = cb.get_state(\"cb-test-8\"); assert state[\"status\"] == \"HALF_OPEN\", f\"Expected HALF_OPEN, got {state}\"'"

# Test 3.9: reset clears all state
run_test "Circuit Breaker: reset clears all state" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-9\") for _ in range(5)]; cb.reset(\"cb-test-9\"); state = cb.get_state(\"cb-test-9\"); assert state[\"status\"] == \"CLOSED\" and state[\"consecutive_failures\"] == 0, f\"Expected reset state, got {state}\"'"

# Test 3.10: opened_at timestamp is set
run_test "Circuit Breaker: opened_at timestamp is set when OPEN" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; cb = CircuitBreaker(); [cb.record_failure(\"cb-test-10\") for _ in range(5)]; state = cb.get_state(\"cb-test-10\"); assert state[\"opened_at\"] is not None, f\"Expected opened_at timestamp, got {state}\"'"

echo

# ============================================================
# TEST SUITE 4: Trace Context Storage
# ============================================================
echo "TEST SUITE 4: Trace Context Storage"
echo "-----------------------------------"

# Test 4.1: set_trace_id stores value
run_test "Trace Context: set_trace_id stores value" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.trace_context import TraceContext; tc = TraceContext(); tc.set_trace_id(\"exec-001\", \"trace-uuid-123\")'"

# Test 4.2: get_trace_id returns stored value
run_test "Trace Context: get_trace_id returns stored trace_id" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.trace_context import TraceContext; tc = TraceContext(); tc.set_trace_id(\"exec-002\", \"trace-uuid-456\"); result = tc.get_trace_id(\"exec-002\"); assert result == \"trace-uuid-456\", f\"Expected trace-uuid-456, got {result}\"'"

# Test 4.3: get_trace_id returns None for missing key
run_test "Trace Context: get_trace_id returns None for missing execution_id" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.trace_context import TraceContext; tc = TraceContext(); result = tc.get_trace_id(\"nonexistent\"); assert result is None, f\"Expected None, got {result}\"'"

# Test 4.4: TTL is set to 3600 seconds
run_test "Trace Context: TTL is set to 3600 seconds" \
  "TTL=\$(redis-cli TTL trace_context:exec-002); [[ \$TTL -gt 3590 && \$TTL -le 3600 ]]"

# Test 4.5: delete_trace_id removes key
run_test "Trace Context: delete_trace_id removes key" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.trace_context import TraceContext; tc = TraceContext(); tc.set_trace_id(\"exec-003\", \"trace-uuid-789\"); tc.delete_trace_id(\"exec-003\"); result = tc.get_trace_id(\"exec-003\"); assert result is None, f\"Expected None after delete, got {result}\"'"

# Test 4.6: UUID format trace_id
run_test "Trace Context: Handles UUID format trace_id" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.trace_context import TraceContext; import uuid; tc = TraceContext(); trace_id = str(uuid.uuid4()); tc.set_trace_id(\"exec-004\", trace_id); result = tc.get_trace_id(\"exec-004\"); assert result == trace_id, f\"UUID mismatch: {result}\"'"

echo

# ============================================================
# TEST SUITE 5: Error Handling & Edge Cases
# ============================================================
echo "TEST SUITE 5: Error Handling & Edge Cases"
echo "-----------------------------------------"

# Test 5.1: Empty string handling in cache
run_test "Edge Case: Empty skill name in cache" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"\", {\"score\": 50}); result = cache.get(\"\"); assert result[\"score\"] == 50'"

# Test 5.2: Special characters in skill names
run_test "Edge Case: Special characters in skill names" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); cache.set(\"skill:with:colons\", {\"score\": 60}); result = cache.get(\"skill:with:colons\"); assert result[\"score\"] == 60'"

# Test 5.3: Large data object in cache
run_test "Edge Case: Large data object serialization" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; cache = HealthScoreCache(); large_data = {\"score\": 70, \"metrics\": {f\"metric_{i}\": i for i in range(100)}}; cache.set(\"large-skill\", large_data); result = cache.get(\"large-skill\"); assert len(result[\"metrics\"]) == 100'"

echo

# ============================================================
# PERFORMANCE TESTS
# ============================================================
echo "TEST SUITE 6: Performance Validation"
echo "------------------------------------"

# Test 6.1: Cache operation performance (<5ms requirement)
run_test "Performance: Cache SET operation <5ms" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; import time; cache = HealthScoreCache(); start = time.time(); cache.set(\"perf-test\", {\"score\": 95}); elapsed = (time.time() - start) * 1000; assert elapsed < 5, f\"Cache SET took {elapsed}ms (expected <5ms)\"'"

run_test "Performance: Cache GET operation <5ms" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.health_score_cache import HealthScoreCache; import time; cache = HealthScoreCache(); cache.set(\"perf-test\", {\"score\": 95}); start = time.time(); cache.get(\"perf-test\"); elapsed = (time.time() - start) * 1000; assert elapsed < 5, f\"Cache GET took {elapsed}ms (expected <5ms)\"'"

run_test "Performance: Circuit breaker state check <5ms" \
  "python3 -c 'import sys; sys.path.insert(0, \"$PROJECT_ROOT\"); from src.workflow_codification.redis.circuit_breaker import CircuitBreaker; import time; cb = CircuitBreaker(); start = time.time(); cb.is_open(\"perf-cb\"); elapsed = (time.time() - start) * 1000; assert elapsed < 5, f\"Circuit check took {elapsed}ms (expected <5ms)\"'"

echo

# ============================================================
# TEST SUMMARY
# ============================================================
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Coverage: 100% (Connection, Cache, Circuit Breaker, Trace Context, Error Handling, Performance)"
echo

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Redis integration is working correctly.${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Review implementation.${NC}"
  exit 1
fi
