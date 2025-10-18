#!/bin/bash
# Manual Test: Live Restore Functionality
# Step-by-step verification that agents can restore state during runtime

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORDINATOR="$SCRIPT_DIR/mvp-coordinator.sh"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  MANUAL LIVE RESTORE TEST${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Initialize
echo -e "${YELLOW}Step 1: Initialize coordinator${NC}"
"$COORDINATOR" init
echo ""

# Spawn agent
echo -e "${YELLOW}Step 2: Spawn long-running agent${NC}"
"$COORDINATOR" spawn agent-test coder "Long running task for restore testing"
sleep 2
echo ""

# Show status
echo -e "${YELLOW}Step 3: Initial status${NC}"
"$COORDINATOR" status
echo ""

# Wait and checkpoint
echo -e "${YELLOW}Step 4: Wait 3 seconds, then create checkpoint${NC}"
sleep 3
"$COORDINATOR" checkpoint agent-test
sleep 1
echo ""

# List checkpoints
echo -e "${YELLOW}Step 5: List checkpoints${NC}"
"$COORDINATOR" list-checkpoints agent-test
echo ""

# Wait longer
echo -e "${YELLOW}Step 6: Agent continues working (5 seconds)...${NC}"
sleep 5
"$COORDINATOR" status
echo ""

# Live restore
echo -e "${YELLOW}Step 7: LIVE RESTORE - restore to earlier checkpoint${NC}"
echo -e "${BLUE}This should trigger restoration WITHOUT restarting the agent${NC}"
"$COORDINATOR" restore agent-test
sleep 2
echo ""

# Check log
echo -e "${YELLOW}Step 8: Check agent log for restore events${NC}"
echo -e "${BLUE}Looking for 'Received RESTORE command' and 'State restored successfully'${NC}"
echo ""
grep -E "RESTORE|restored" /dev/shm/cfn-mvp/logs/agent-test.log || echo -e "${YELLOW}No restore events found yet${NC}"
echo ""

# Final status
echo -e "${YELLOW}Step 9: Final status after restore${NC}"
"$COORDINATOR" status
echo ""

# Show full log
echo -e "${YELLOW}Step 10: Full agent log (last 30 lines)${NC}"
tail -30 /dev/shm/cfn-mvp/logs/agent-test.log
echo ""

# Cleanup
echo -e "${YELLOW}Step 11: Cleanup${NC}"
"$COORDINATOR" shutdown
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  TEST COMPLETE${NC}"
echo -e "${GREEN}=========================================${NC}"
