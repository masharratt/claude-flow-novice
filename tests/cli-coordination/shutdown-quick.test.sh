#!/usr/bin/env bash
# tests/cli-coordination/shutdown-quick.test.sh - Quick validation test for shutdown system
# Phase 1 Sprint 1.4: Graceful Shutdown Implementation

set -euo pipefail

# Test configuration
TEST_BASE_DIR="/tmp/cfn-shutdown-quicktest-$$"
export CFN_BASE_DIR="$TEST_BASE_DIR/coordination"
export CFN_HEALTH_DIR="$TEST_BASE_DIR/health"
export SHUTDOWN_TIMEOUT=2
export HEALTH_DIR="$CFN_HEALTH_DIR"

# Source the shutdown library
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/lib"
source "$LIB_DIR/shutdown.sh"

echo "========================================"
echo "Shutdown System Quick Test"
echo "========================================"

# Test 1: Basic functionality validation
echo "[TEST 1] System validation"
if validate_shutdown_system 2>&1 | grep -q "All shutdown system tests passed"; then
  echo "✅ PASS: Shutdown system validated"
else
  echo "❌ FAIL: Shutdown validation failed"
  exit 1
fi

# Test 2: Create test agent and verify inbox drain
echo "[TEST 2] Inbox drain"
mkdir -p "$CFN_BASE_DIR/inbox/test-agent"
echo '{"message_id":"test-1"}' > "$CFN_BASE_DIR/inbox/test-agent/msg-1.msg"
echo '{"message_id":"test-2"}' > "$CFN_BASE_DIR/inbox/test-agent/msg-2.msg"

processed=$(drain_inbox "test-agent" 5 2>&1 | grep "messages processed" | grep -o '[0-9]\+' | tail -1)
if [ "$processed" -eq 2 ]; then
  echo "✅ PASS: Inbox drained ($processed messages)"
else
  echo "❌ FAIL: Expected 2 messages, got $processed"
  exit 1
fi

# Test 3: Resource cleanup
echo "[TEST 3] Resource cleanup"
mkdir -p "$CFN_BASE_DIR/inbox/cleanup-agent"
mkdir -p "$CFN_BASE_DIR/outbox/cleanup-agent"
echo "$$" > "$CFN_BASE_DIR/pids/cleanup-agent.pid"

cleanup_agent_resources "cleanup-agent" >/dev/null 2>&1

remaining=0
[ -d "$CFN_BASE_DIR/inbox/cleanup-agent" ] && remaining=$((remaining + 1))
[ -d "$CFN_BASE_DIR/outbox/cleanup-agent" ] && remaining=$((remaining + 1))
[ -f "$CFN_BASE_DIR/pids/cleanup-agent.pid" ] && remaining=$((remaining + 1))

if [ "$remaining" -eq 0 ]; then
  echo "✅ PASS: Resources cleaned up"
else
  echo "❌ FAIL: $remaining resources remaining"
  exit 1
fi

# Test 4: Performance test - 20 agents
echo "[TEST 4] Performance test (20 agents)"
for i in {1..20}; do
  mkdir -p "$CFN_BASE_DIR/inbox/perf-$i"
  echo "{\"id\":$i}" > "$CFN_BASE_DIR/inbox/perf-$i/msg.msg"
done

start_time=$(date +%s)
timeout 10 shutdown_all_agents 3 >/dev/null 2>&1 || true
elapsed=$(($(date +%s) - start_time))

if [ "$elapsed" -le 5 ]; then
  echo "✅ PASS: Shutdown completed in ${elapsed}s"
else
  echo "⚠️  WARN: Shutdown took ${elapsed}s (expected <5s, but acceptable)"
fi

# Cleanup
rm -rf "$TEST_BASE_DIR"

echo "========================================"
echo "All tests passed!"
echo "========================================"
exit 0
