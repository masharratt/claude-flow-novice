#!/bin/bash
# Test Script: Live Restore Functionality
# Verifies that agents can restore state from checkpoint during runtime without restart

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORDINATOR="$SCRIPT_DIR/mvp-coordinator.sh"

# Test functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $*"
}

# Test Case: Live Restore During Runtime
test_live_restore() {
    log_test "Starting Live Restore Test..."
    echo ""

    # Step 1: Initialize coordinator
    log_info "Step 1: Initialize coordinator"
    "$COORDINATOR" init
    echo ""

    # Step 2: Spawn agent
    log_info "Step 2: Spawn agent-1"
    "$COORDINATOR" spawn agent-1 coder "Test live restore"
    sleep 2
    echo ""

    # Step 3: Check initial status
    log_info "Step 3: Check initial status"
    "$COORDINATOR" status
    echo ""

    # Step 4: Wait for agent to progress through phases
    log_info "Step 4: Waiting for agent to reach implementation phase..."
    sleep 5

    # Step 5: Trigger checkpoint
    log_info "Step 5: Trigger checkpoint (save current state)"
    "$COORDINATOR" checkpoint agent-1
    sleep 1
    echo ""

    # Step 6: List checkpoints
    log_info "Step 6: List available checkpoints"
    "$COORDINATOR" list-checkpoints agent-1
    echo ""

    # Step 7: Let agent progress further
    log_info "Step 7: Let agent continue working (5 more seconds)"
    sleep 5

    # Step 8: Check status before restore
    log_info "Step 8: Agent status BEFORE restore"
    "$COORDINATOR" status
    echo ""

    # Step 9: Restore to earlier checkpoint (LIVE RESTORE - no restart)
    log_info "Step 9: Perform LIVE RESTORE to earlier checkpoint"
    "$COORDINATOR" restore agent-1
    sleep 2
    echo ""

    # Step 10: Check status after restore
    log_info "Step 10: Agent status AFTER live restore"
    "$COORDINATOR" status
    echo ""

    # Step 11: Verify agent log
    log_info "Step 11: Check agent log for restore event"
    if grep -q "Received RESTORE command" /dev/shm/cfn-mvp/logs/agent-1.log; then
        log_pass "RESTORE command detected in agent log"
    else
        log_fail "RESTORE command NOT found in agent log"
        return 1
    fi

    if grep -q "State restored successfully" /dev/shm/cfn-mvp/logs/agent-1.log; then
        log_pass "State restoration confirmed in agent log"
    else
        log_fail "State restoration NOT confirmed in agent log"
        return 1
    fi
    echo ""

    # Step 12: Let agent continue after restore
    log_info "Step 12: Agent continues from restored state (5 seconds)"
    sleep 5

    # Step 13: Final status check
    log_info "Step 13: Final agent status"
    "$COORDINATOR" status
    echo ""

    # Step 14: Cleanup
    log_info "Step 14: Shutdown and cleanup"
    "$COORDINATOR" shutdown
    echo ""

    log_pass "Live Restore Test COMPLETED SUCCESSFULLY"
}

# Run test
main() {
    echo "========================================="
    echo "  LIVE RESTORE FUNCTIONALITY TEST"
    echo "========================================="
    echo ""

    test_live_restore

    echo ""
    echo "========================================="
    echo "  ALL TESTS PASSED"
    echo "========================================="
}

main "$@"
