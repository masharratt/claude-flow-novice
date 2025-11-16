#!/bin/bash
#
# Event Bus Skill - Test Suite
#
# Tests:
#   1. Event Publishing
#   2. Event Subscription (manual verification)
#   3. Lifecycle Tracking (spawn, complete, fail, timeout)
#   4. Event Statistics
#   5. Trace ID Propagation
#   6. Invalid Input Handling
#
# Usage:
#   ./test-event-bus.sh

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test helper functions
run_test() {
    local test_name="$1"
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "\n${YELLOW}[Test $TESTS_RUN]${NC} $test_name"
}

assert_success() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    if [ "$expected" == "$actual" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (expected: $expected, got: $actual)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (expected: $expected, got: $actual)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_contains() {
    local needle="$1"
    local haystack="$2"
    if echo "$haystack" | grep -q "$needle"; then
        echo -e "${GREEN}✓ PASSED${NC} (contains: $needle)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (does not contain: $needle)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo "========================================"
echo "Event Bus Skill - Test Suite"
echo "========================================"

# Test 1: Basic Event Publishing
run_test "Event Publishing - Basic"
RESULT=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:basic" \
    --payload '{"message": "Hello Event Bus", "testId": 1}')

STATUS=$(echo "$RESULT" | jq -r '.status')
TOPIC=$(echo "$RESULT" | jq -r '.topic')
assert_equals "published" "$STATUS"
assert_equals "test:basic" "$TOPIC"

# Test 2: Event Publishing with Trace ID
run_test "Event Publishing - With Trace ID"
RESULT=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:traced" \
    --payload '{"message": "Traced event", "testId": 2}' \
    --trace-id "trace-test-123")

STATUS=$(echo "$RESULT" | jq -r '.status')
TRACE_ID=$(echo "$RESULT" | jq -r '.traceId')
assert_equals "published" "$STATUS"
assert_equals "trace-test-123" "$TRACE_ID"

# Test 3: Lifecycle Tracking - Spawn
run_test "Lifecycle Tracking - Agent Spawn"
RESULT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-1" \
    --event "spawn" \
    --metadata '{"taskId": "test-task", "role": "tester"}')

STATUS=$(echo "$RESULT" | jq -r '.status')
EVENT=$(echo "$RESULT" | jq -r '.event')
assert_equals "tracked" "$STATUS"
assert_equals "spawn" "$EVENT"

# Test 4: Lifecycle Tracking - Complete
run_test "Lifecycle Tracking - Agent Complete"
RESULT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-1" \
    --event "complete" \
    --metadata '{"taskId": "test-task", "confidence": 0.95, "duration": 30000}')

STATUS=$(echo "$RESULT" | jq -r '.status')
EVENT=$(echo "$RESULT" | jq -r '.event')
AGENT_ID=$(echo "$RESULT" | jq -r '.agentId')
assert_equals "tracked" "$STATUS"
assert_equals "complete" "$EVENT"
assert_equals "test-agent-1" "$AGENT_ID"

# Test 5: Lifecycle Tracking - Fail
run_test "Lifecycle Tracking - Agent Fail"
RESULT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-2" \
    --event "fail" \
    --metadata '{"taskId": "test-task", "error": "Test error", "stage": "validation"}')

STATUS=$(echo "$RESULT" | jq -r '.status')
EVENT=$(echo "$RESULT" | jq -r '.event')
assert_equals "tracked" "$STATUS"
assert_equals "fail" "$EVENT"

# Test 6: Lifecycle Tracking - Timeout
run_test "Lifecycle Tracking - Agent Timeout"
RESULT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-3" \
    --event "timeout" \
    --metadata '{"taskId": "test-task", "timeLimit": 60000, "elapsed": 65000}')

STATUS=$(echo "$RESULT" | jq -r '.status')
EVENT=$(echo "$RESULT" | jq -r '.event')
assert_equals "tracked" "$STATUS"
assert_equals "timeout" "$EVENT"

# Test 7: Invalid Event Type
run_test "Lifecycle Tracking - Invalid Event Type"
OUTPUT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-4" \
    --event "invalid-event" \
    --metadata '{"taskId": "test-task"}' 2>&1 || true)

assert_contains "Invalid event type" "$OUTPUT"

# Test 8: Invalid JSON Payload
run_test "Event Publishing - Invalid JSON"
OUTPUT=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:invalid" \
    --payload 'not-valid-json' 2>&1 || true)

assert_contains "Invalid JSON" "$OUTPUT"

# Test 9: Missing Required Arguments - Publish
run_test "Event Publishing - Missing Arguments"
OUTPUT=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:missing" 2>&1 || true)

assert_contains "required" "$OUTPUT"

# Test 10: Missing Required Arguments - Lifecycle
run_test "Lifecycle Tracking - Missing Arguments"
OUTPUT=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-5" \
    --event "spawn" 2>&1 || true)

assert_contains "required" "$OUTPUT"

# Test 11: Event ID Generation
run_test "Event Publishing - Unique Event IDs"
RESULT1=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:id-check" \
    --payload '{"test": 1}')
EVENT_ID1=$(echo "$RESULT1" | jq -r '.eventId')

RESULT2=$("$SCRIPT_DIR/invoke-event-publish.sh" \
    --topic "test:id-check" \
    --payload '{"test": 2}')
EVENT_ID2=$(echo "$RESULT2" | jq -r '.eventId')

if [ "$EVENT_ID1" != "$EVENT_ID2" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (Event IDs are unique)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAILED${NC} (Event IDs are not unique)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 12: Tracking ID Generation
run_test "Lifecycle Tracking - Unique Tracking IDs"
RESULT1=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-6" \
    --event "spawn" \
    --metadata '{"test": 1}')
TRACKING_ID1=$(echo "$RESULT1" | jq -r '.trackingId')

RESULT2=$("$SCRIPT_DIR/invoke-lifecycle-track.sh" \
    --agent-id "test-agent-7" \
    --event "spawn" \
    --metadata '{"test": 2}')
TRACKING_ID2=$(echo "$RESULT2" | jq -r '.trackingId')

if [ "$TRACKING_ID1" != "$TRACKING_ID2" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (Tracking IDs are unique)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAILED${NC} (Tracking IDs are not unique)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test 13: Event Statistics (via Node.js)
run_test "Event Statistics - Verification"
STATS=$(node -e "
const path = require('path');
const { eventBus } = require(path.join('$SCRIPT_DIR', 'eventbus-wrapper.cjs'));

// Emit test events
eventBus.emitEvent('stats:test:1', { data: 'test1' });
eventBus.emitEvent('stats:test:2', { data: 'test2' });
eventBus.emitEvent('stats:test:1', { data: 'test3' });

// Get stats
const stats = eventBus.getEventStats();
const test1Stats = stats.find(s => s.event === 'stats:test:1');

console.log(JSON.stringify({
    count: test1Stats ? test1Stats.count : 0,
    hasLastEmitted: test1Stats && test1Stats.lastEmitted !== null
}));
")

COUNT=$(echo "$STATS" | jq -r '.count')
if [ "$COUNT" -ge 2 ]; then
    echo -e "${GREEN}✓ PASSED${NC} (Event count tracked correctly: $COUNT)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAILED${NC} (Event count incorrect: $COUNT)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Test Summary
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
else
    echo "Failed:       $TESTS_FAILED"
fi
echo "========================================"

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
