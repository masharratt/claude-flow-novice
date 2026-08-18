#!/usr/bin/env bash
set -euo pipefail

# Docker Agent Permission Validation Test
# Tests that the rebuilt agent image resolves npm permission errors

echo "🧪 Docker Agent Permission Test"
echo "================================"

# Test 1: Home directory exists and is writable
echo ""
echo "Test 1: Home directory permissions"
docker run --rm claude-flow-novice:agent sh -c "ls -la /home/cfnagent && touch /home/cfnagent/test.txt && rm /home/cfnagent/test.txt" || { # portability-ok: path inside the agent container image, not the host
  echo "❌ FAILED: Home directory not writable"
  exit 1
}
echo "✅ Home directory exists and is writable"

# Test 2: npm cache directory exists and is writable
echo ""
echo "Test 2: npm cache directory permissions"
docker run --rm claude-flow-novice:agent sh -c "ls -la /app/.npm-cache && touch /app/.npm-cache/test.txt && rm /app/.npm-cache/test.txt" || {
  echo "❌ FAILED: npm cache directory not writable"
  exit 1
}
echo "✅ npm cache directory exists and is writable"

# Test 3: npm_config_cache environment variable is set
echo ""
echo "Test 3: npm configuration"
NPM_CACHE=$(docker run --rm claude-flow-novice:agent sh -c "echo \$npm_config_cache")
if [[ "$NPM_CACHE" != "/app/.npm-cache" ]]; then
  echo "❌ FAILED: npm_config_cache not set correctly (got: $NPM_CACHE)"
  exit 1
fi
echo "✅ npm_config_cache set to /app/.npm-cache"

# Test 4: npm can execute without permission errors
echo ""
echo "Test 4: npm execution"
docker run --rm claude-flow-novice:agent sh -c "npm --version" >/dev/null || {
  echo "❌ FAILED: npm cannot execute"
  exit 1
}
echo "✅ npm executes successfully"

# Test 5: Agent spawn command works (should fail gracefully, not with EACCES)
echo ""
echo "Test 5: Agent spawn command (expect graceful failure, not permission error)"
OUTPUT=$(docker run --rm claude-flow-novice:agent sh -c "node dist/cli/spawn.js --help" 2>&1)
if echo "$OUTPUT" | grep -q "EACCES"; then
  echo "❌ FAILED: Permission error detected"
  echo "$OUTPUT"
  exit 1
fi
if echo "$OUTPUT" | grep -q "cfn-spawn"; then
  echo "✅ Agent spawn command works (no permission errors)"
else
  echo "❌ FAILED: Unexpected output"
  echo "$OUTPUT"
  exit 1
fi

# Test 6: User and ownership
echo ""
echo "Test 6: User and ownership"
USER_INFO=$(docker run --rm claude-flow-novice:agent sh -c "whoami && id")
if ! echo "$USER_INFO" | grep -q "cfnagent"; then
  echo "❌ FAILED: Container not running as cfnagent user"
  echo "$USER_INFO"
  exit 1
fi
echo "✅ Container runs as cfnagent user"

echo ""
echo "================================"
echo "🎉 All tests passed!"
echo ""
echo "Summary:"
echo "  - Home directory: /home/cfnagent (writable)"
echo "  - npm cache: /app/.npm-cache (writable)"
echo "  - User: cfnagent (uid=1001)"
echo "  - npm version: $(docker run --rm claude-flow-novice:agent sh -c 'npm --version')"
echo ""
echo "The Docker permission errors are FIXED."
echo "Agent spawning via orchestrate.sh should now work correctly."
