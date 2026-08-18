#!/usr/bin/env bash
# B10 Single Agent Debug Test
# Runs ONE agent interactively to capture actual CLI errors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "B10 Single Agent Debug Test"
echo "=========================================="
echo ""

# Verify image exists
if ! docker image inspect claude-flow-novice:agent >/dev/null 2>&1; then
    echo "❌ Error: Docker image 'claude-flow-novice:agent' not found"
    echo "   Run: docker build -f Dockerfile.agent -t claude-flow-novice:agent ."
    exit 1
fi

echo "🐳 Starting single agent in debug mode..."
echo ""
echo "Test file: src/test.ts"
echo "Prompt: Fix all TypeScript errors"
echo ""

# Run single agent with full output capture
TEST_OUTPUT="/tmp/b10-debug-output.txt"
echo "Capturing output to: $TEST_OUTPUT"
echo ""

docker run --rm \
    --env-file .env \
    --entrypoint bash \
    claude-flow-novice:agent \
    -c '
        set -x  # Enable debug output
        echo "=== Environment ==="
        env | grep -i "ZAI\|CLAUDE\|NODE" | head -10
        echo ""

        echo "=== Working Directory ==="
        pwd
        ls -la dist/cli/index.js 2>/dev/null || echo "CLI not found"
        echo ""

        echo "=== Agent Definitions ==="
        ls .claude/agents/cfn-dev-team/developers/ | head -5
        echo ""

        echo "=== CLI Execution ==="
        cd /app
        node dist/cli/index.js agent typescript-specialist "Fix all TypeScript errors in src/test.ts. Focus on:
- Type annotations
- Missing imports
- Type safety issues
Maintain code functionality." 2>&1
    ' 2>&1 | tee "$TEST_OUTPUT"

EXIT_CODE=$?

echo ""
echo "=========================================="
echo "Debug Test Complete"
echo "=========================================="
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ CLI executed successfully (exit code 0)"
    echo "   Check output above for agent work"
else
    echo "❌ CLI failed with exit code $EXIT_CODE"
    echo "   Error details:"
    tail -20 "$TEST_OUTPUT"
fi

echo ""
echo "Full output saved to: $TEST_OUTPUT"
echo ""

exit $EXIT_CODE
