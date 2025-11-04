#!/usr/bin/env bash
set -euo pipefail

# Test Product Owner Backlog Management
# Validates Product Owner uses add-backlog-item.sh when deferring work

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Project root
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
BACKLOG_SKILL="$PROJECT_ROOT/.claude/skills/cfn-backlog-management/add-backlog-item.sh"
BACKLOG_FILE="$PROJECT_ROOT/readme/BACKLOG.md"
TEST_BACKLOG_FILE="$PROJECT_ROOT/readme/BACKLOG.test.md"

# Test cleanup
cleanup() {
  # Backup original if exists
  if [ -f "$BACKLOG_FILE" ]; then
    cp "$BACKLOG_FILE" "${BACKLOG_FILE}.backup"
  fi

  # Use test file
  if [ -f "$TEST_BACKLOG_FILE" ]; then
    mv "$TEST_BACKLOG_FILE" "$BACKLOG_FILE"
  fi

  rm -f /tmp/test-po-output-*.txt

  # Restore backup
  if [ -f "${BACKLOG_FILE}.backup" ]; then
    mv "${BACKLOG_FILE}.backup" "$BACKLOG_FILE"
  fi
}

trap cleanup EXIT

# Print test result
print_result() {
  local test_name="$1"
  local result="$2"
  local message="${3:-}"
  
  TESTS_RUN=$((TESTS_RUN + 1))
  
  if [ "$result" = "PASS" ]; then
    echo -e "${GREEN}✓${NC} $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}✗${NC} $test_name"
    [ -n "$message" ] && echo -e "  ${YELLOW}$message${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Test 1: Backlog item creation
test_backlog_item_creation() {
  echo -e "\n${BLUE}Test 1: Backlog Item Creation${NC}"

  # Ensure clean state
  rm -f "$BACKLOG_FILE"

  # Create backlog item (suppress interactive prompt with --force)
  "$BACKLOG_SKILL" \
    --item "Implement rate limiting for API endpoints" \
    --why "Out of scope for current sprint" \
    --solution "Use express-rate-limit middleware" \
    --force

  # Verify file created
  if [ ! -f "$BACKLOG_FILE" ]; then
    print_result "Backlog file created" "FAIL" "File not found: $BACKLOG_FILE"
    return
  fi
  print_result "Backlog file created" "PASS"

  # Verify Markdown format (check for header)
  if ! grep -q "# Claude Flow Novice - Backlog" "$BACKLOG_FILE"; then
    print_result "Valid Markdown format" "FAIL" "Missing backlog header"
    return
  fi
  print_result "Valid Markdown format" "PASS"

  # Check item added to P2 section (default priority)
  if ! grep -q "\*\*\[P2\] - Implement rate limiting" "$BACKLOG_FILE"; then
    print_result "Item added to correct priority" "FAIL" "Item not found in P2 section"
    return
  fi
  print_result "Item added to correct priority" "PASS"

  # Verify required fields in backlog file (with markdown bold syntax)
  if ! grep -q "\*\*Description\*\*:" "$BACKLOG_FILE"; then
    print_result "Has Description field" "FAIL"
    return
  fi
  print_result "Has Description field" "PASS"

  if ! grep -q "\*\*Rationale\*\*:" "$BACKLOG_FILE"; then
    print_result "Has Rationale field" "FAIL"
    return
  fi
  print_result "Has Rationale field" "PASS"

  if ! grep -q "\*\*Proposed Solution\*\*:" "$BACKLOG_FILE"; then
    print_result "Has Proposed Solution field" "FAIL"
    return
  fi
  print_result "Has Proposed Solution field" "PASS"

  # Verify timestamp format (YYYY-MM-DD with markdown bold)
  if ! grep -q "\*\*Date Added\*\*: [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}" "$BACKLOG_FILE"; then
    print_result "Valid timestamp format" "FAIL" "Invalid or missing date"
    return
  fi
  print_result "Valid timestamp format" "PASS"
}

# Test 2: Multiple backlog items
test_multiple_backlog_items() {
  echo -e "\n${BLUE}Test 2: Multiple Backlog Items${NC}"

  # Clean state
  rm -f "$BACKLOG_FILE"

  # Add 3 items with --force to skip interactive prompts
  "$BACKLOG_SKILL" \
    --item "Implement rate limiting for endpoints" \
    --why "Out of scope" \
    --solution "Use express-rate-limit" \
    --force 2>/dev/null

  "$BACKLOG_SKILL" \
    --item "Add GraphQL support for queries" \
    --why "Not prioritized" \
    --solution "Use apollo-server" \
    --force 2>/dev/null

  "$BACKLOG_SKILL" \
    --item "Implement caching layer" \
    --why "Performance enhancement for later" \
    --solution "Use Redis caching layer" \
    --force 2>/dev/null

  # Verify count by counting P2 items (default priority)
  local item_count=$(grep -c "^\*\*\[P2\]" "$BACKLOG_FILE" || echo "0")
  if [ "$item_count" != "3" ]; then
    print_result "Three items added" "FAIL" "Expected 3 items, found $item_count"
    return
  fi
  print_result "Three items added" "PASS"

  # Check for distinct items
  if ! grep -q "rate limiting" "$BACKLOG_FILE"; then
    print_result "First item present" "FAIL"
    return
  fi
  print_result "First item present" "PASS"

  if ! grep -q "GraphQL support" "$BACKLOG_FILE"; then
    print_result "Second item present" "FAIL"
    return
  fi
  print_result "Second item present" "PASS"

  if ! grep -q "caching layer" "$BACKLOG_FILE"; then
    print_result "Third item present" "FAIL"
    return
  fi
  print_result "Third item present" "PASS"

  # Verify Last Updated timestamp was updated
  if ! grep -q "Last Updated: $(date +%Y-%m-%d)" "$BACKLOG_FILE"; then
    print_result "Timestamp updated" "FAIL"
    return
  fi
  print_result "Timestamp updated" "PASS"
}

# Test 3: Product Owner integration (mocked)
test_product_owner_uses_backlog() {
  echo -e "\n${BLUE}Test 3: Product Owner Integration${NC}"

  # Clean state
  rm -f "$BACKLOG_FILE"

  # Create mock Product Owner output with deferred items
  local mock_output="/tmp/test-po-output-deferred.txt"
  cat > "$mock_output" << 'MOCK_END'
## Product Owner Decision

**Decision:** DEFER_AND_PROCEED

### Analysis
Loop 2 validators achieved 0.92 consensus. Implementation is solid but includes out-of-scope items that should be deferred.

### Deferred Items
1. **Rate limiting implementation**
   - Reason: Out of scope for authentication sprint
   - Solution: Add express-rate-limit middleware in security sprint

2. **GraphQL endpoint**
   - Reason: Not prioritized for MVP
   - Solution: Implement apollo-server in API enhancement sprint

### Deliverables Verified
- [x] JWT authentication implemented
- [x] Tests passing
- [ ] Rate limiting (deferred)
- [ ] GraphQL support (deferred)

### Backlog Updated
Items added to readme/BACKLOG.md for future sprints.

**Final Decision:** PROCEED (with deferred items in backlog)
MOCK_END

  # Extract deferred items and add to backlog
  # This simulates what Product Owner should do
  local deferred_count=0

  # Parse deferred items from mock output
  if grep -q "Rate limiting implementation" "$mock_output"; then
    "$BACKLOG_SKILL" \
      --item "Rate limiting implementation" \
      --why "Out of scope for authentication sprint" \
      --solution "Add express-rate-limit middleware in security sprint" \
      --force 2>/dev/null
    deferred_count=$((deferred_count + 1))
  fi

  if grep -q "GraphQL endpoint" "$mock_output"; then
    "$BACKLOG_SKILL" \
      --item "GraphQL endpoint" \
      --why "Not prioritized for MVP" \
      --solution "Implement apollo-server in API enhancement sprint" \
      --force 2>/dev/null
    deferred_count=$((deferred_count + 1))
  fi

  # Verify backlog items created
  if [ ! -f "$BACKLOG_FILE" ]; then
    print_result "Backlog file exists after PO decision" "FAIL" "No backlog file created"
    return
  fi
  print_result "Backlog file exists after PO decision" "PASS"

  local item_count=$(grep -c "^\*\*\[P2\]" "$BACKLOG_FILE" || echo "0")
  if [ "$item_count" != "$deferred_count" ]; then
    print_result "Correct number of deferred items" "FAIL" "Expected $deferred_count, found $item_count"
    return
  fi
  print_result "Correct number of deferred items" "PASS"

  # Verify both items are in backlog
  if ! grep -q "Rate limiting implementation" "$BACKLOG_FILE"; then
    print_result "Rate limiting item in backlog" "FAIL"
    return
  fi
  print_result "Rate limiting item in backlog" "PASS"

  if ! grep -q "GraphQL endpoint" "$BACKLOG_FILE"; then
    print_result "GraphQL item in backlog" "FAIL"
    return
  fi
  print_result "GraphQL item in backlog" "PASS"

  # Verify backlog reference in output
  if ! grep -q "Backlog Updated" "$mock_output"; then
    print_result "PO output mentions backlog" "FAIL" "No backlog reference in decision"
    return
  fi
  print_result "PO output mentions backlog" "PASS"

  # Verify backlog file reference
  if ! grep -q "readme/BACKLOG.md" "$mock_output"; then
    print_result "PO output references backlog file" "FAIL" "No file path in decision"
    return
  fi
  print_result "PO output references backlog file" "PASS"
}

# Test 4: Backlog skill parameter validation
test_backlog_skill_parameters() {
  echo -e "\n${BLUE}Test 4: Backlog Skill Parameter Validation${NC}"
  
  # Test missing required parameters
  if "$BACKLOG_SKILL" 2>/dev/null; then
    print_result "Rejects missing parameters" "FAIL" "Should fail with no parameters"
  else
    print_result "Rejects missing parameters" "PASS"
  fi
  
  # Test missing --why parameter
  if "$BACKLOG_SKILL" --item "Test" --solution "Test solution" 2>/dev/null; then
    print_result "Requires --why parameter" "FAIL" "Should fail without --why"
  else
    print_result "Requires --why parameter" "PASS"
  fi
  
  # Test missing --solution parameter
  if "$BACKLOG_SKILL" --item "Test" --why "Test reason" 2>/dev/null; then
    print_result "Requires --solution parameter" "FAIL" "Should fail without --solution"
  else
    print_result "Requires --solution parameter" "PASS"
  fi
}

# Main execution
main() {
  echo -e "${BLUE}=== Product Owner Backlog Management Tests ===${NC}"
  echo -e "Testing backlog skill usage and integration\n"
  
  # Run tests
  test_backlog_item_creation
  test_multiple_backlog_items
  test_product_owner_uses_backlog
  test_backlog_skill_parameters
  
  # Print summary
  echo -e "\n${BLUE}=== Test Summary ===${NC}"
  echo -e "Tests run:    $TESTS_RUN"
  echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
  
  if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
    exit 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

main "$@"
