#!/usr/bin/env bash
# Verify CFN Stabilization Integration
set -euo pipefail

echo "=== CFN Stabilization Integration Verification ==="
echo "Date: $(date)"
echo

# Test 1: Verify orchestrate.sh has PROJECT_ROOT set correctly
echo "1. Testing orchestrate.sh PROJECT_ROOT setup..."
if grep -n "PROJECT_ROOT.*cd" .claude/skills/cfn-loop-orchestration/orchestrate.sh | head -1; then
    echo "✅ PROJECT_ROOT is set before script usage"
else
    echo "❌ PROJECT_ROOT not properly set"
fi

# Test 2: Verify actual sanitization script exists and is referenced
echo
echo "2. Testing environment sanitization integration..."
if grep -n "task-mode-env-sanitizer.sh" .claude/skills/cfn-loop-orchestration/orchestrate.sh; then
    echo "✅ Environment sanitization script is referenced"
else
    echo "❌ Environment sanitization not integrated"
fi

# Test 3: Verify instrumentation script is referenced
echo
echo "3. Testing process instrumentation integration..."
if grep -n "wrapped-executor.sh" .claude/skills/cfn-loop-orchestration/orchestrate.sh; then
    echo "✅ Process instrumentation script is referenced"
else
    echo "❌ Process instrumentation not integrated"
fi

# Test 4: Verify mode detection works correctly
echo
echo "4. Testing mode detection..."
unset TASK_ID AGENT_ID CFN_MODE
source .claude/skills/cfn-task-mode-safety/mode-detection.sh
mode=$(detect_execution_mode 2>/dev/null)
if [[ "$mode" == "task" ]]; then
    echo "✅ Mode detection returns 'task' for empty environment"
else
    echo "❌ Mode detection failed: got '$mode'"
fi

# Test 5: Verify environment sanitization function exists
echo
echo "5. Testing environment sanitization functions..."
if [[ -f ".claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh" ]]; then
    if source .claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh 2>/dev/null; then
        echo "✅ Environment sanitization script loads successfully"
    else
        echo "❌ Environment sanitization script fails to load"
    fi
else
    echo "❌ Environment sanitization script not found"
fi

# Test 6: Verify process instrumentation exists
echo
echo "6. Testing process instrumentation..."
if [[ -f ".claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh" ]]; then
    echo "✅ Process instrumentation script exists"
else
    echo "❌ Process instrumentation script not found"
fi

echo
echo "=== Integration Verification Complete ==="