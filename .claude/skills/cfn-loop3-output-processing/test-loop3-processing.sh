#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASSED=0
FAILED=0

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================"
echo "Loop 3 Output Processing Tests"
echo "================================"

# Test 1: Parse explicit confidence
echo -e "\n${YELLOW}Test 1: Parse Explicit Confidence${NC}"
OUTPUT="Implementation complete. Confidence: 0.85"
RESULT=$("$SCRIPT_DIR/parse-confidence.sh" "$OUTPUT")
if [ "$RESULT" = "0.85" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Extracted: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.85, got: $RESULT"
  ((FAILED++))
fi

# Test 2: Parse percentage format
echo -e "\n${YELLOW}Test 2: Parse Percentage Format${NC}"
OUTPUT="I'm 92% confident in this implementation"
RESULT=$("$SCRIPT_DIR/parse-confidence.sh" "$OUTPUT")
if [ "$RESULT" = ".92" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Extracted: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected .92, got: $RESULT"
  ((FAILED++))
fi

# Test 3: Parse natural language with score
echo -e "\n${YELLOW}Test 3: Parse Natural Language with Score${NC}"
OUTPUT="Very confident about this (0.90)"
RESULT=$("$SCRIPT_DIR/parse-confidence.sh" "$OUTPUT")
if [ "$RESULT" = "0.90" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Extracted: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.90, got: $RESULT"
  ((FAILED++))
fi

# Test 4: No confidence found (fallback)
echo -e "\n${YELLOW}Test 4: No Confidence Found (Fallback)${NC}"
OUTPUT="I implemented the feature and it works great!"
RESULT=$("$SCRIPT_DIR/parse-confidence.sh" "$OUTPUT")
if [ "$RESULT" = "0.0" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Fallback: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.0, got: $RESULT"
  ((FAILED++))
fi

# Test 5: Verify deliverables - no changes
echo -e "\n${YELLOW}Test 5: Verify Deliverables - No Changes${NC}"
BEFORE="M  package.json"
AFTER="M  package.json"
RESULT=$("$SCRIPT_DIR/verify-deliverables.sh" --before "$BEFORE" --after "$AFTER")
FILES_CHANGED=$(echo "$RESULT" | jq -r '.files_changed')
if [ "$FILES_CHANGED" = "0" ]; then
  echo -e "${GREEN}✓ PASS${NC} - No new files: $FILES_CHANGED"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0, got: $FILES_CHANGED"
  ((FAILED++))
fi

# Test 6: Verify deliverables - new files
echo -e "\n${YELLOW}Test 6: Verify Deliverables - New Files${NC}"
BEFORE="M  package.json"
AFTER="M  package.json
A  src/auth/login.ts
A  tests/auth.test.ts"
RESULT=$("$SCRIPT_DIR/verify-deliverables.sh" --before "$BEFORE" --after "$AFTER")
FILES_CHANGED=$(echo "$RESULT" | jq -r '.files_changed')
if [ "$FILES_CHANGED" = "2" ]; then
  echo -e "${GREEN}✓ PASS${NC} - New files detected: $FILES_CHANGED"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 2, got: $FILES_CHANGED"
  ((FAILED++))
fi

# Test 7: Calculate confidence - no files
echo -e "\n${YELLOW}Test 7: Calculate Confidence - No Files${NC}"
RESULT=$("$SCRIPT_DIR/calculate-confidence.sh" --files-changed 0 --deliverables "[]")
if [ "$RESULT" = "0.0" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Calculated: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.0, got: $RESULT"
  ((FAILED++))
fi

# Test 8: Calculate confidence - minimal changes
echo -e "\n${YELLOW}Test 8: Calculate Confidence - Minimal Changes${NC}"
RESULT=$("$SCRIPT_DIR/calculate-confidence.sh" --files-changed 2 --deliverables '["file1", "file2"]')
if [ "$RESULT" = "0.50" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Calculated: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.50, got: $RESULT"
  ((FAILED++))
fi

# Test 9: Calculate confidence - moderate changes
echo -e "\n${YELLOW}Test 9: Calculate Confidence - Moderate Changes${NC}"
RESULT=$("$SCRIPT_DIR/calculate-confidence.sh" --files-changed 4 --deliverables '["f1","f2","f3","f4"]')
if [ "$RESULT" = "0.75" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Calculated: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.75, got: $RESULT"
  ((FAILED++))
fi

# Test 10: Calculate confidence - significant changes
echo -e "\n${YELLOW}Test 10: Calculate Confidence - Significant Changes${NC}"
RESULT=$("$SCRIPT_DIR/calculate-confidence.sh" --files-changed 8 --deliverables '["f1","f2","f3","f4","f5","f6","f7","f8"]')
if [ "$RESULT" = "0.85" ]; then
  echo -e "${GREEN}✓ PASS${NC} - Calculated: $RESULT"
  ((PASSED++))
else
  echo -e "${RED}✗ FAIL${NC} - Expected 0.85, got: $RESULT"
  ((FAILED++))
fi

# Summary
echo ""
echo "================================"
echo "Test Results"
echo "================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
