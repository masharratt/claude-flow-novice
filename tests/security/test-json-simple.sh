#!/bin/bash
# Simple manual test for JSON validation

export AGENT_LIFECYCLE_DB="/tmp/test-json-validation-$$.db"
CLI="node .claude-flow-novice/dist/src/cli/main.js"

echo "Test 1: Valid JSON"
$CLI agent-lifecycle spawn --id test1 --type coder --acl-level 1 --metadata '{"x":"valid"}' --json 2>&1 | grep "success"

echo ""
echo "Test 2: Large JSON (150KB - should fail)"
LARGE='{"x":"'
LARGE+=$(python3 -c "print('a'*150000)")
LARGE+='"}'
$CLI agent-lifecycle spawn --id test2 --type coder --acl-level 1 --metadata "$LARGE" --json 2>&1 | grep -i "too large"

echo ""
echo "Test 3: Deeply nested JSON (11 levels - should fail)"
$CLI agent-lifecycle spawn --id test3 --type coder --acl-level 1 --metadata '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":{"k":"deep"}}}}}}}}}}}' --json 2>&1 | grep -i "deeply nested"

rm -f /tmp/test-json-validation-$$.db
