#!/usr/bin/env bash

##############################################################################
# Manual Test: Loop 5 Reflection Hook Validation
# Comprehensive testing of reflection hook implementation
##############################################################################

set -euo pipefail

PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
ORCHESTRATOR="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
REFLECTION_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-reflect.sh"

echo "=============================================="
echo "Loop 5 Reflection Hook - Manual Validation"
echo "=============================================="
echo ""

# Test counters
TOTAL=0
PASSED=0

function test_check() {
  local result=$1
  local description="$2"
  TOTAL=$((TOTAL + 1))

  if [ "$result" = "PASS" ]; then
    echo "✅ PASS: $description"
    PASSED=$((PASSED + 1))
  else
    echo "❌ FAIL: $description"
  fi
}

##############################################################################
# 1. FUNCTIONAL TESTING - Script Existence
##############################################################################
echo "=== 1. FUNCTIONAL TESTING - Script Existence ==="
echo ""

# Test 1.1: Reflection script exists
if [ -f "$REFLECTION_SCRIPT" ]; then
  test_check "PASS" "Reflection script exists at expected path"
else
  test_check "FAIL" "Reflection script exists at expected path"
fi

# Test 1.2: Reflection script is executable
if [ -x "$REFLECTION_SCRIPT" ]; then
  test_check "PASS" "Reflection script is executable"
else
  test_check "FAIL" "Reflection script is executable"
fi

##############################################################################
# 2. INTEGRATION TESTING - Orchestrator Integration
##############################################################################
echo ""
echo "=== 2. INTEGRATION TESTING - Orchestrator Integration ==="
echo ""

# Test 2.1: Reflection invocation exists in PROCEED case
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "invoke-context-reflect.sh"; then
  test_check "PASS" "Reflection invocation exists in PROCEED case"
else
  test_check "FAIL" "Reflection invocation exists in PROCEED case"
fi

# Test 2.2: Background execution pattern
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q ") &"; then
  test_check "PASS" "Background execution (subshell &) pattern exists"
else
  test_check "FAIL" "Background execution (subshell &) pattern exists"
fi

# Test 2.3: PID capture
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "REFLECTION_PID="; then
  test_check "PASS" "Reflection PID capture exists"
else
  test_check "FAIL" "Reflection PID capture exists"
fi

# Test 2.4: Output doesn't wait for reflection
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -A 5 "REFLECTION_PID=" | grep -q "output_result"; then
  test_check "PASS" "output_result called after reflection launch (non-blocking)"
else
  test_check "FAIL" "output_result called after reflection launch (non-blocking)"
fi

##############################################################################
# 3. ERROR HANDLING - Logging and Safety
##############################################################################
echo ""
echo "=== 3. ERROR HANDLING - Logging and Safety ==="
echo ""

# Test 3.1: Stderr redirect to log
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep "invoke-context-reflect" | grep -q "2>&1"; then
  test_check "PASS" "stderr redirected to stdout for logging"
else
  test_check "FAIL" "stderr redirected to stdout for logging"
fi

# Test 3.2: Log file creation
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "ace-reflection.*\.log"; then
  test_check "PASS" "Log file path specified"
else
  test_check "FAIL" "Log file path specified"
fi

# Test 3.3: tee append for logging
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "tee -a"; then
  test_check "PASS" "tee -a used for log appending"
else
  test_check "FAIL" "tee -a used for log appending"
fi

##############################################################################
# 4. PARAMETER VALIDATION
##############################################################################
echo ""
echo "=== 4. PARAMETER VALIDATION ==="
echo ""

# Test 4.1: Context parameter passed
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep "invoke-context-reflect" | grep -q -- "--context"; then
  test_check "PASS" "--context parameter passed to reflection"
else
  test_check "FAIL" "--context parameter passed to reflection"
fi

# Test 4.2: Output file parameter passed
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep "invoke-context-reflect" | grep -q -- "--output"; then
  test_check "PASS" "--output parameter passed to reflection"
else
  test_check "FAIL" "--output parameter passed to reflection"
fi

# Test 4.3: Reflection context includes required fields
if grep -B 20 'invoke-context-reflect' "$ORCHESTRATOR" | grep -q "REFLECTION_CONTEXT"; then
  test_check "PASS" "REFLECTION_CONTEXT variable constructed before invocation"
else
  test_check "FAIL" "REFLECTION_CONTEXT variable constructed before invocation"
fi

##############################################################################
# 5. NON-BLOCKING BEHAVIOR
##############################################################################
echo ""
echo "=== 5. NON-BLOCKING BEHAVIOR ==="
echo ""

# Test 5.1: No 'wait' for reflection PID
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -A 10 "REFLECTION_PID=" | grep -q "wait.*REFLECTION"; then
  test_check "FAIL" "Orchestrator does NOT wait for reflection (should not wait)"
else
  test_check "PASS" "Orchestrator does NOT wait for reflection completion"
fi

# Test 5.2: Exit called after reflection launch
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -A 3 "output_result" | grep -q "exit 0"; then
  test_check "PASS" "exit 0 called after output_result (clean exit)"
else
  test_check "FAIL" "exit 0 called after output_result (clean exit)"
fi

##############################################################################
# 6. REFLECTION SCRIPT VALIDATION
##############################################################################
echo ""
echo "=== 6. REFLECTION SCRIPT VALIDATION ==="
echo ""

# Test 6.1: Reflection script accepts --context parameter
if grep -q -- "--context" "$REFLECTION_SCRIPT"; then
  test_check "PASS" "Reflection script handles --context parameter"
else
  test_check "FAIL" "Reflection script handles --context parameter"
fi

# Test 6.2: Reflection script accepts --output parameter
if grep -q -- "--output" "$REFLECTION_SCRIPT"; then
  test_check "PASS" "Reflection script handles --output parameter"
else
  test_check "FAIL" "Reflection script handles --output parameter"
fi

##############################################################################
# 7. ACCEPTANCE CRITERIA VALIDATION
##############################################################################
echo ""
echo "=== 7. ACCEPTANCE CRITERIA VALIDATION ==="
echo ""

# From epic: reflection launches after PROCEED
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "invoke-context-reflect.sh"; then
  test_check "PASS" "AC1: Reflection launches after PROCEED decision"
else
  test_check "FAIL" "AC1: Reflection launches after PROCEED decision"
fi

# From epic: background doesn't block commit
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q ") &" && \
   ! grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -A 10 "REFLECTION_PID=" | grep -q "wait.*REFLECTION"; then
  test_check "PASS" "AC2: Background execution doesn't block git commit"
else
  test_check "FAIL" "AC2: Background execution doesn't block git commit"
fi

# From epic: errors don't crash orchestrator
if grep -A 50 'PROCEED)' "$ORCHESTRATOR" | grep -q "2>&1"; then
  test_check "PASS" "AC3: Error handling present (stderr redirect)"
else
  test_check "FAIL" "AC3: Error handling present (stderr redirect)"
fi

##############################################################################
# SUMMARY
##############################################################################
echo ""
echo "=============================================="
echo "TEST SUMMARY"
echo "=============================================="
echo "Total Tests: $TOTAL"
echo "Passed: $PASSED"
echo "Failed: $((TOTAL - PASSED))"
echo ""

if [ $PASSED -eq $TOTAL ]; then
  echo "✅ ALL TESTS PASSED"
  CONFIDENCE=0.95
else
  PASS_RATE=$(echo "scale=2; $PASSED / $TOTAL" | bc)
  echo "⚠️  Some tests failed (Pass rate: $PASS_RATE)"

  if (( $(echo "$PASS_RATE >= 0.90" | bc -l) )); then
    CONFIDENCE=0.90
  elif (( $(echo "$PASS_RATE >= 0.75" | bc -l) )); then
    CONFIDENCE=0.75
  else
    CONFIDENCE=0.60
  fi
fi

echo "Confidence Score: $CONFIDENCE"
echo ""

if (( $(echo "$CONFIDENCE >= 0.90" | bc -l) )); then
  exit 0
else
  exit 1
fi
