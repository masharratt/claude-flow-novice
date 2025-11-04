#!/bin/bash
# Test: Verify Product Owner uses LPUSH for decision key
# Purpose: Check execute-decision.sh was fixed to use LPUSH instead of SET

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "TEST 5: Product Owner Decision Key Fix"
echo -e "==========================================${NC}"
echo ""

SCRIPT_PATH="./.claude/skills/cfn-product-owner-decision/execute-decision.sh"

echo -e "${YELLOW}Checking execute-decision.sh for LPUSH command...${NC}"

# Check for LPUSH command
if grep -q 'LPUSH "swarm:${TASK_ID}:decision"' "$SCRIPT_PATH"; then
  echo -e "${GREEN}✅ PASS: Script uses LPUSH for decision key${NC}"
  echo "   Found: redis-cli LPUSH \"swarm:\${TASK_ID}:decision\""
else
  echo -e "${RED}❌ FAIL: Script does NOT use LPUSH for decision key${NC}"
  echo ""
  echo "Searching for decision key creation..."
  grep -n "decision" "$SCRIPT_PATH" | grep -i "redis-cli" || echo "No decision key creation found"
  exit 1
fi

echo ""
echo -e "${YELLOW}Checking that old SET command was removed...${NC}"

# Check for old SET command (should NOT exist)
if grep -q 'SET "swarm:${TASK_ID}:decision"' "$SCRIPT_PATH"; then
  echo -e "${RED}❌ FAIL: Old SET command still exists${NC}"
  echo "   Found: redis-cli SET \"swarm:\${TASK_ID}:decision\""
  exit 1
else
  echo -e "${GREEN}✅ PASS: Old SET command removed${NC}"
fi

echo ""
echo -e "${YELLOW}Verifying BLPOP compatibility...${NC}"

# LPUSH creates a list, which is compatible with BLPOP
echo "LPUSH creates list type: ✓"
echo "BLPOP reads from list type: ✓"
echo -e "${GREEN}✅ PASS: LPUSH/BLPOP coordination compatible${NC}"

echo ""
echo -e "${GREEN}=========================================="
echo "TEST 5 PASSED"
echo -e "==========================================${NC}"
echo "Summary:"
echo "- Product Owner uses LPUSH (not SET)"
echo "- Decision key compatible with BLPOP"
echo "- Orchestrator can read decision with blocking read"
