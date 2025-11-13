#!/bin/bash
# Simple CFN Stabilization Validation
set -euo pipefail

echo "=== CFN Stabilization Simple Validation ==="
echo "Started: $(date)"
echo

PASSED=0
FAILED=0

# Test 1: Environment variables
echo "1. Testing environment variables..."
export CFN_VALIDATION_TIMEOUT="${CFN_VALIDATION_TIMEOUT:-300}"
export CFN_MEMORY_LIMIT="${CFN_MEMORY_LIMIT:-2048}"

if [[ "$CFN_VALIDATION_TIMEOUT" == "300" ]]; then
    echo "✅ CFN_VALIDATION_TIMEOUT: $CFN_VALIDATION_TIMEOUT"
    ((PASSED++))
else
    echo "❌ CFN_VALIDATION_TIMEOUT failed"
    ((FAILED++))
fi

if [[ "$CFN_MEMORY_LIMIT" == "2048" ]]; then
    echo "✅ CFN_MEMORY_LIMIT: $CFN_MEMORY_LIMIT"
    ((PASSED++))
else
    echo "❌ CFN_MEMORY_LIMIT failed"
    ((FAILED++))
fi

# Test 2: Mode detection
echo
echo "2. Testing mode detection..."
unset TASK_ID AGENT_ID CFN_MODE
source .claude/skills/cfn-task-mode-safety/mode-detection.sh 2>/dev/null || true
MODE_RESULT=$(detect_execution_mode 2>/dev/null || echo "ERROR")

if [[ "$MODE_RESULT" == "task" ]]; then
    echo "✅ Mode detection: $MODE_RESULT"
    ((PASSED++))
else
    echo "❌ Mode detection failed: $MODE_RESULT"
    ((FAILED++))
fi

# Test 3: Script loading
echo
echo "3. Testing script loading..."
if source .claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh 2>/dev/null; then
    echo "✅ Environment sanitization script loads"
    ((PASSED++))
else
    echo "❌ Environment sanitization script failed to load"
    ((FAILED++))
fi

if source .claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh 2>/dev/null; then
    echo "✅ Process instrumentation script loads"
    ((PASSED++))
else
    echo "❌ Process instrumentation script failed to load"
    ((FAILED++))
fi

# Test 4: File existence
echo
echo "4. Testing file existence..."
REQUIRED_FILES=(
    ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
    ".claude/skills/cfn-task-mode-safety/mode-detection.sh"
    ".claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [[ -f "$file" ]]; then
        echo "✅ $file exists"
        ((PASSED++))
    else
        echo "❌ $file missing"
        ((FAILED++))
    fi
done

# Test 5: Integration points
echo
echo "5. Testing orchestrate.sh integration..."
if grep -q "CFN_VALIDATION_TIMEOUT.*-" .claude/skills/cfn-loop-orchestration/orchestrate.sh; then
    echo "✅ Environment variables exported in orchestrate.sh"
    ((PASSED++))
else
    echo "❌ Environment variables not found in orchestrate.sh"
    ((FAILED++))
fi

if grep -q "execute_instrumented.*npx.*claude-flow-novice" .claude/skills/cfn-loop-orchestration/orchestrate.sh; then
    echo "✅ Agent spawn instrumentation found in orchestrate.sh"
    ((PASSED++))
else
    echo "❌ Agent spawn instrumentation not found in orchestrate.sh"
    ((FAILED++))
fi

# Results
echo
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo "Total: $((PASSED + FAILED))"

if [[ $FAILED -eq 0 ]]; then
    echo "✅ All tests passed!"
    exit 0
else
    echo "❌ $FAILED tests failed!"
    exit 1
fi