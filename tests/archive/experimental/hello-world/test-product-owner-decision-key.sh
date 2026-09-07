#!/bin/bash
# Test: Product Owner Decision Key Creation
# Version: 1.0.0
# Purpose: Verify execute-decision.sh creates decision key for BLPOP coordination

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================="
echo "TEST 5: Product Owner Decision Key"
echo -e "==========================================${NC}"

TASK_ID="test-po-decision-$(date +%s)"
AGENT_ID="product-owner-test"

# Setup: Clear any existing keys
redis-cli DEL "swarm:${TASK_ID}:decision" > /dev/null 2>&1 || true

# Mock Loop 2 context
redis-cli HSET "swarm:${TASK_ID}:loop2:consensus" "feedback" "Test feedback" > /dev/null
redis-cli HSET "swarm:${TASK_ID}:context" "task" "Test task" > /dev/null

echo ""
echo -e "${YELLOW}Step 1: Execute Product Owner decision...${NC}"

# Execute Product Owner decision
PO_OUTPUT=$(./.claude/skills/cfn-product-owner-decision/execute-decision.sh \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --consensus 0.90 \
  --threshold 0.85 \
  --iteration 1 \
  --max-iterations 10 \
  --success-criteria "Test criteria" 2>&1)

echo "Product Owner execution complete"

echo ""
echo -e "${YELLOW}Step 2: Verify decision key creation...${NC}"

# Check if decision key exists
DECISION_KEY="swarm:${TASK_ID}:decision"
KEY_EXISTS=$(redis-cli EXISTS "$DECISION_KEY")

if [ "$KEY_EXISTS" -eq 1 ]; then
  echo -e "${GREEN}✅ Decision key exists${NC}"

  # Retrieve decision value
  DECISION=$(redis-cli LPOP "$DECISION_KEY")
  echo -e "${GREEN}✅ Decision value: $DECISION${NC}"

  # Verify it's one of the valid decisions
  if [[ "$DECISION" =~ ^(PROCEED|ITERATE|ABORT)$ ]]; then
    echo -e "${GREEN}✅ Valid decision format${NC}"
  else
    echo -e "${RED}❌ Invalid decision format: $DECISION${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Decision key NOT created${NC}"
  echo ""
  echo "Expected key: $DECISION_KEY"
  echo "Product Owner output:"
  echo "$PO_OUTPUT"
  exit 1
fi

echo ""
echo -e "${YELLOW}Step 3: Verify orchestrator can read decision...${NC}"

# Re-create decision for BLPOP test
redis-cli LPUSH "$DECISION_KEY" "$DECISION" > /dev/null

# Simulate orchestrator reading decision with BLPOP (timeout 5s)
BLPOP_RESULT=$(timeout 5 redis-cli BLPOP "$DECISION_KEY" 5 2>&1 || echo "timeout")

if [[ "$BLPOP_RESULT" == "timeout" ]]; then
  echo -e "${RED}❌ BLPOP timeout (key not in list format)${NC}"
  exit 1
else
  echo -e "${GREEN}✅ BLPOP successful${NC}"
  echo "Read value: $BLPOP_RESULT"
fi

# Cleanup
redis-cli DEL "swarm:${TASK_ID}:decision" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:loop2:consensus" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:context" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:done" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:result" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}:confidence" > /dev/null 2>&1 || true
redis-cli DEL "swarm:${TASK_ID}:metrics:product_owner_decisions" > /dev/null 2>&1 || true

echo ""
echo -e "${GREEN}=========================================="
echo "TEST 5 PASSED"
echo -e "==========================================${NC}"
echo "Product Owner creates decision key correctly"
echo "Orchestrator can read decision via BLPOP"
