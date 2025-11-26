#!/bin/bash
#
# File Operations Skill - Test Suite
#
# Tests file locking and atomic write operations.
# Part of Task 4.2: Centralized File Locking & Atomic Operations
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$SCRIPT_DIR/execute.sh"
TEST_DIR="/tmp/cfn-file-ops-test-$$"
LOCK_DIR="/tmp/cfn-locks-test-$$"

export CFN_LOCK_DIR="$LOCK_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

#
# Setup test environment
#
setup() {
  echo "Setting up test environment..."
  mkdir -p "$TEST_DIR"
  mkdir -p "$LOCK_DIR"
}

#
# Cleanup test environment
#
cleanup() {
  echo "Cleaning up test environment..."
  rm -rf "$TEST_DIR"
  rm -rf "$LOCK_DIR"
}

#
# Assert helper
#
assert() {
  local description="$1"
  local command="$2"

  TESTS_RUN=$((TESTS_RUN + 1))
  echo -n "  Test $TESTS_RUN: $description... "

  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

#
# Test: Lock acquisition and release
#
test_lock_acquisition() {
  echo -e "\n${YELLOW}Test Suite: Lock Acquisition${NC}"

  local test_file="$TEST_DIR/lock-test.txt"
  touch "$test_file"

  # Test 1: Acquire lock
  assert "Can acquire lock" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    [ -n \"\$LOCK_INFO\" ]
  "

  # Test 2: Lock file exists
  assert "Lock file created" "
    $SKILL acquire-lock '$test_file' --agent-id test-agent > /tmp/lock-info-$$.txt
    LOCK_INFO=\$(cat /tmp/lock-info-$$.txt)
    LOCK_PATH=\"\${LOCK_INFO#*:}\"
    [ -f \"\$LOCK_PATH\" ]
  "

  # Test 3: Release lock
  assert "Can release lock" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    $SKILL release-lock \"\$LOCK_INFO\"
  "

  # Test 4: Lock file removed after release
  assert "Lock file removed after release" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    LOCK_PATH=\"\${LOCK_INFO#*:}\"
    $SKILL release-lock \"\$LOCK_INFO\"
    [ ! -f \"\$LOCK_PATH\" ]
  "
}

#
# Test: Lock renewal
#
test_lock_renewal() {
  echo -e "\n${YELLOW}Test Suite: Lock Renewal${NC}"

  local test_file="$TEST_DIR/renewal-test.txt"
  touch "$test_file"

  # Test 5: Renew lock
  assert "Can renew lock" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    $SKILL renew-lock \"\$LOCK_INFO\" --extension 60000
    $SKILL release-lock \"\$LOCK_INFO\"
  "

  # Test 6: Renewal count increases
  assert "Renewal count increases" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    LOCK_PATH=\"\${LOCK_INFO#*:}\"
    BEFORE=\$(jq -r '.renewalCount' \"\$LOCK_PATH\")
    $SKILL renew-lock \"\$LOCK_INFO\" --extension 60000
    AFTER=\$(jq -r '.renewalCount' \"\$LOCK_PATH\")
    $SKILL release-lock \"\$LOCK_INFO\"
    [ \"\$AFTER\" -gt \"\$BEFORE\" ]
  "
}

#
# Test: Atomic writes
#
test_atomic_writes() {
  echo -e "\n${YELLOW}Test Suite: Atomic Writes${NC}"

  local test_file="$TEST_DIR/write-test.txt"

  # Test 7: Basic write
  assert "Can write file atomically" "
    $SKILL atomic-write '$test_file' 'Hello World'
    [ -f '$test_file' ]
    [ \"\$(cat '$test_file')\" = 'Hello World' ]
  "

  # Test 8: Write with checksum
  assert "Write with checksum verification" "
    $SKILL atomic-write '$test_file' 'Test content' --checksum
    [ -f '$test_file' ]
  "

  # Test 9: Write with backup
  assert "Write creates backup" "
    echo 'Original' > '$test_file'
    RESULT=\$($SKILL atomic-write '$test_file' 'Updated' --backup)
    BACKUP_PATH=\$(echo \"\$RESULT\" | jq -r '.backupPath')
    [ -f \"\$BACKUP_PATH\" ]
    [ \"\$(cat \"\$BACKUP_PATH\")\" = 'Original' ]
  "
}

#
# Test: Atomic reads
#
test_atomic_reads() {
  echo -e "\n${YELLOW}Test Suite: Atomic Reads${NC}"

  local test_file="$TEST_DIR/read-test.txt"

  # Test 10: Read file
  assert "Can read file atomically" "
    echo 'Test content' > '$test_file'
    RESULT=\$($SKILL atomic-read '$test_file')
    CONTENT=\$(echo \"\$RESULT\" | jq -r '.content')
    [ \"\$CONTENT\" = 'Test content' ]
  "

  # Test 11: Read returns checksum
  assert "Read returns checksum" "
    echo 'Test' > '$test_file'
    RESULT=\$($SKILL atomic-read '$test_file')
    CHECKSUM=\$(echo \"\$RESULT\" | jq -r '.checksum')
    [ -n \"\$CHECKSUM\" ]
    [ \"\${#CHECKSUM}\" -eq 64 ]
  "
}

#
# Test: Checksum verification
#
test_checksum() {
  echo -e "\n${YELLOW}Test Suite: Checksum Verification${NC}"

  local test_file="$TEST_DIR/checksum-test.txt"

  # Test 12: Verify checksum
  assert "Can verify file checksum" "
    echo -n 'Test' > '$test_file'
    EXPECTED=\$(echo -n 'Test' | sha256sum | awk '{print \$1}')
    RESULT=\$($SKILL verify-checksum '$test_file' \"\$EXPECTED\")
    MATCHES=\$(echo \"\$RESULT\" | jq -r '.matches')
    [ \"\$MATCHES\" = \"1\" ]
  "

  # Test 13: Detect checksum mismatch
  assert "Detects checksum mismatch" "
    echo -n 'Test' > '$test_file'
    WRONG='0000000000000000000000000000000000000000000000000000000000000000'
    RESULT=\$($SKILL verify-checksum '$test_file' \"\$WRONG\")
    MATCHES=\$(echo \"\$RESULT\" | jq -r '.matches')
    [ \"\$MATCHES\" = \"0\" ]
  "
}

#
# Test: Concurrent access
#
test_concurrent_access() {
  echo -e "\n${YELLOW}Test Suite: Concurrent Access${NC}"

  local test_file="$TEST_DIR/concurrent-test.txt"
  touch "$test_file"

  # Test 14: Second acquire waits for first release
  assert "Second lock waits for first" "
    # Acquire lock in background, hold for 2 seconds
    (
      LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id agent-1)
      sleep 2
      $SKILL release-lock \"\$LOCK_INFO\"
    ) &

    # Wait a bit for first lock to acquire
    sleep 0.5

    # Try to acquire second lock (should wait)
    START=\$(date +%s)
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id agent-2 --timeout 5000)
    END=\$(date +%s)
    WAIT_TIME=\$((END - START))

    $SKILL release-lock \"\$LOCK_INFO\"

    # Should have waited at least 1 second
    [ \"\$WAIT_TIME\" -ge 1 ]
  "
}

#
# Test: Force release
#
test_force_release() {
  echo -e "\n${YELLOW}Test Suite: Force Release${NC}"

  local test_file="$TEST_DIR/force-test.txt"
  touch "$test_file"

  # Test 15: Force release removes lock
  assert "Force release removes lock" "
    LOCK_INFO=\$($SKILL acquire-lock '$test_file' --agent-id test-agent)
    LOCK_PATH=\"\${LOCK_INFO#*:}\"
    $SKILL force-release \"\$LOCK_PATH\"
    [ ! -f \"\$LOCK_PATH\" ]
  "
}

#
# Test: Metrics
#
test_metrics() {
  echo -e "\n${YELLOW}Test Suite: Metrics${NC}"

  local test_file="$TEST_DIR/metrics-test.txt"
  touch "$test_file"

  # Test 16: Get metrics
  assert "Can retrieve metrics" "
    METRICS=\$($SKILL get-metrics)
    ACTIVE=\$(echo \"\$METRICS\" | jq -r '.activeLocks')
    [ -n \"\$ACTIVE\" ]
  "

  # Test 17: Metrics reflect active locks
  assert "Metrics reflect active locks" "
    # Clean start
    rm -rf '$LOCK_DIR'/*.lock 2>/dev/null || true

    LOCK_INFO_1=\$($SKILL acquire-lock '$test_file.1' --agent-id agent-1)
    LOCK_INFO_2=\$($SKILL acquire-lock '$test_file.2' --agent-id agent-2)

    METRICS=\$($SKILL get-metrics)
    ACTIVE=\$(echo \"\$METRICS\" | jq -r '.activeLocks')

    $SKILL release-lock \"\$LOCK_INFO_1\"
    $SKILL release-lock \"\$LOCK_INFO_2\"

    [ \"\$ACTIVE\" -ge 2 ]
  "
}

#
# Test: Error handling
#
test_error_handling() {
  echo -e "\n${YELLOW}Test Suite: Error Handling${NC}"

  # Test 18: Missing file path
  assert "Rejects missing file path" "
    ! $SKILL acquire-lock '' --agent-id test-agent
  "

  # Test 19: Invalid lock ID
  assert "Rejects invalid lock ID" "
    ! $SKILL release-lock 'invalid-lock-id'
  "

  # Test 20: Timeout handling
  assert "Handles lock timeout" "
    LOCK_INFO=\$($SKILL acquire-lock '$TEST_DIR/timeout-test.txt' --agent-id agent-1)
    ! $SKILL acquire-lock '$TEST_DIR/timeout-test.txt' --agent-id agent-2 --timeout 500
    $SKILL release-lock \"\$LOCK_INFO\"
  "
}

#
# Main test runner
#
main() {
  echo "========================================"
  echo "File Operations Skill - Test Suite"
  echo "========================================"

  setup

  test_lock_acquisition
  test_lock_renewal
  test_atomic_writes
  test_atomic_reads
  test_checksum
  test_concurrent_access
  test_force_release
  test_metrics
  test_error_handling

  cleanup

  echo ""
  echo "========================================"
  echo "Test Results"
  echo "========================================"
  echo "Total tests:  $TESTS_RUN"
  echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
  echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
  echo ""

  if [ "$TESTS_FAILED" -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
  fi
}

# Run tests
main
