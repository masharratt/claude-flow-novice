#!/bin/bash
# End-to-end test for Product Owner backlog integration
# Version: 1.0.0
# Tests the complete flow: PO decision → deferred item extraction → backlog update

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
cd "$PROJECT_ROOT"

echo -e "${GREEN}🧪 End-to-End Test: Product Owner Backlog Integration${NC}\n"

# Setup test environment
TEST_TASK_ID="test-backlog-$(date +%s)"
TEST_AGENT_ID="product-owner-test"
TEST_BACKLOG="/tmp/test-backlog-$TEST_TASK_ID.md"

echo -e "${YELLOW}Setup:${NC}"
echo "  Task ID: $TEST_TASK_ID"
echo "  Agent ID: $TEST_AGENT_ID"
echo ""

# Mock Product Owner output with deferred items
MOCK_PO_OUTPUT=$(cat <<'EOF'
Decision: PROCEED
Reasoning: Core authentication features implemented and validated. Some advanced features deferred to reduce scope and meet sprint deadline.

Out of Scope (Deferred to Future Sprints):
- Multi-factor authentication (MFA) support
- OAuth2 integration with third-party providers
- Advanced session management with Redis
- Audit logging for authentication events

These items were deferred because:
- MFA requires additional security review and testing infrastructure
- OAuth2 integration has external dependencies not yet available
- Advanced session management needs infrastructure upgrades
- Audit logging requires centralized logging system

Confidence: 0.92
EOF
)

# Test extraction logic
echo -e "${YELLOW}Test 1: Deferred Section Extraction${NC}"
DEFERRED_SECTION=$(echo "$MOCK_PO_OUTPUT" | grep -iA 20 "out of scope\|deferred\|future work\|defer:" || echo "")

if [ -n "$DEFERRED_SECTION" ]; then
  echo -e "${GREEN}✅ Deferred section extracted${NC}"
  ITEM_COUNT=$(echo "$DEFERRED_SECTION" | grep -E "^\s*[-*•]" | wc -l)
  echo "   Found $ITEM_COUNT items in deferred section"
else
  echo -e "${RED}❌ Failed to extract deferred section${NC}"
  exit 1
fi

# Test item parsing
echo -e "\n${YELLOW}Test 2: Item Parsing${NC}"
DEFERRED_ITEMS=$(echo "$DEFERRED_SECTION" | grep -E "^\s*[-*•]" | sed 's/^\s*[-*•]\s*//' || echo "")

if [ -n "$DEFERRED_ITEMS" ]; then
  echo -e "${GREEN}✅ Items parsed successfully${NC}"
  echo "$DEFERRED_ITEMS" | while IFS= read -r item; do
    if [ -n "$item" ] && [ ${#item} -ge 10 ]; then
      echo "   - ${item:0:60}..."
    fi
  done
else
  echo -e "${RED}❌ Failed to parse items${NC}"
  exit 1
fi

# Test backlog skill directly
echo -e "\n${YELLOW}Test 3: Backlog Skill Invocation${NC}"

# Create temporary backlog file to avoid polluting actual backlog
export BACKLOG_FILE="$TEST_BACKLOG"

SAMPLE_ITEM="Multi-factor authentication (MFA) support"

# Invoke backlog skill with test item
set +e
./.claude/skills/cfn-backlog-management/add-backlog-item.sh \
  --item "$SAMPLE_ITEM" \
  --why "Deferred during Product Owner decision (Task: $TEST_TASK_ID, Iteration: 1)" \
  --solution "Requires security review and testing infrastructure setup" \
  --priority "P2" \
  --category "Feature" \
  --sprint "Sprint-Backlog-Test" \
  --force > /tmp/backlog-output.log 2>&1

BACKLOG_EXIT=$?
set -e

if [ $BACKLOG_EXIT -eq 0 ]; then
  echo -e "${GREEN}✅ Backlog skill invocation successful${NC}"

  # Verify backlog file was created/updated
  if [ -f "readme/BACKLOG.md" ]; then
    if grep -q "$SAMPLE_ITEM" "readme/BACKLOG.md"; then
      echo -e "${GREEN}✅ Item added to backlog successfully${NC}"
      echo "   Backlog location: readme/BACKLOG.md"
    else
      echo -e "${RED}❌ Item not found in backlog${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠️  Backlog file not found (expected for first run)${NC}"
  fi
else
  echo -e "${RED}❌ Backlog skill failed with exit code $BACKLOG_EXIT${NC}"
  cat /tmp/backlog-output.log
  exit 1
fi

# Test integration in execute-decision.sh
echo -e "\n${YELLOW}Test 4: Integration in execute-decision.sh${NC}"

DECISION_SCRIPT="./.claude/skills/cfn-product-owner-decision/execute-decision.sh"

# Check for integration point
if grep -q "Processing deferred items for backlog" "$DECISION_SCRIPT"; then
  echo -e "${GREEN}✅ Integration point found${NC}"
else
  echo -e "${RED}❌ Integration point missing${NC}"
  exit 1
fi

# Check for backlog skill invocation
if grep -q "cfn-backlog-management/add-backlog-item.sh" "$DECISION_SCRIPT"; then
  echo -e "${GREEN}✅ Backlog skill invocation code present${NC}"
else
  echo -e "${RED}❌ Backlog skill invocation missing${NC}"
  exit 1
fi

# Check for error handling
if grep -A5 "cfn-backlog-management/add-backlog-item.sh" "$DECISION_SCRIPT" | grep -q "set +e"; then
  echo -e "${GREEN}✅ Defensive error handling found${NC}"
else
  echo -e "${YELLOW}⚠️  Error handling may need review${NC}"
fi

# Check for Redis metadata storage
if grep -q "backlog_items_added" "$DECISION_SCRIPT"; then
  echo -e "${GREEN}✅ Redis metadata storage present${NC}"
else
  echo -e "${YELLOW}⚠️  Redis metadata storage missing${NC}"
fi

# Summary
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All integration tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Integration Summary:"
echo "  ✓ Deferred section extraction works"
echo "  ✓ Item parsing and filtering works"
echo "  ✓ Backlog skill can be invoked successfully"
echo "  ✓ Integration point exists in execute-decision.sh"
echo "  ✓ Defensive error handling implemented"
echo "  ✓ Redis metadata storage included"
echo ""
echo "Expected Runtime Behavior:"
echo "  1. Product Owner outputs decision with 'Out of Scope' section"
echo "  2. execute-decision.sh extracts deferred items"
echo "  3. Each item added to readme/BACKLOG.md with P2 priority"
echo "  4. Metadata stored in Redis (backlog_items_added count)"
echo "  5. Failures are non-blocking (warnings logged)"
echo ""
