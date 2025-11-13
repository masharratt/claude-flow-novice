#!/usr/bin/env bash

set -euo pipefail

SCRIPT_PATH="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh"
TEST_ID="simple-test"

echo "Setting up test data..."
redis-cli SET "cfn_loop:${TEST_ID}:historical_context" '{"results":[{"domain":"backend","insights":[{"type":"strategy","text":"Strategy 1"},{"type":"anti-pattern","text":"Anti-pattern 1"},{"type":"edge-case","text":"Edge case 1"}]}]}' EX 60 > /dev/null

echo "Running context injection..."
result=$("$SCRIPT_PATH" --task-id "$TEST_ID" --agent-type "backend-dev" --original-context '{"task":"test"}' 2>/dev/null)

echo "Result:"
echo "$result" | jq .

echo "Cleaning up..."
redis-cli DEL "cfn_loop:${TEST_ID}:historical_context" > /dev/null

echo "Done!"
