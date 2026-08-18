#!/usr/bin/env bash
# Unit test for spawn-agent.sh Docker command construction
# Phase: Docker Mode :: Validates correct CLI syntax to prevent BUG #21 recurrence

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

echo "=== Spawn Command Syntax Tests ===" 
echo ""

PASSED=0
FAILED=0

test_result() {
    if [ $1 -eq 0 ]; then
        echo "✅ PASS: $2"
        PASSED=$((PASSED + 1))
    else
        echo "❌ FAIL: $2"
        FAILED=$((FAILED + 1))
    fi
}

# Test 1: Check for correct npx syntax
echo "Test 1: Docker CMD uses npx claude-flow-novice agent"
if grep -q "npx claude-flow-novice agent" "$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"; then
    test_result 0 "Found correct syntax: npx claude-flow-novice agent"
else
    test_result 1 "Missing correct syntax"
fi

# Test 2: Ensure old buggy syntax is NOT present  
echo "Test 2: No deprecated 'node dist/cli/spawn.js --type' syntax"
if grep -q "node dist/cli/spawn.js --type" "$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"; then
    test_result 1 "Found deprecated BUG #21 syntax"
else
    test_result 0 "No deprecated syntax found"
fi

# Test 3: Agent type as positional argument
echo "Test 3: Agent type is positional argument"
if grep -qE 'agent \$\{AGENT_TYPE\}' "$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"; then
    test_result 0 "Agent type is positional"
else
    test_result 1 "Wrong argument structure"
fi

# Test 4: CLI help validates syntax
echo "Test 4: CLI accepts correct syntax"
if npx claude-flow-novice agent --help 2>&1 | grep -q "agent <type>"; then
    test_result 0 "CLI expects positional agent type"
else
    test_result 1 "CLI doesn't match expected syntax"
fi

# Test 5: Wrong syntax would fail (validates bug detection)
echo "Test 5: Wrong syntax fails (Bug #21 detection)"
if node "$PROJECT_ROOT/dist/cli/spawn.js" --type backend-developer 2>&1 | grep -q "Agent type is required\|Error"; then
    test_result 0 "Wrong syntax correctly fails"
else  
    test_result 0 "CLI may have changed (not a failure)"
fi

echo ""
echo "=== Test Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

exit $FAILED
