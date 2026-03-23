#!/bin/bash
# CFN Test Memory Guard Hook
# Blocks npm/npx test runs that don't include memory limits
# to prevent memory leaks from killing the system

# Removed -e flag to prevent hook failures on expected errors
set -uo pipefail

# Read command from stdin (passed as JSON) with safe error handling
INPUT=$(timeout 1 cat 2>/dev/null || echo "{}")
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")

# Log for debugging - don't fail if log write fails
log() {
    echo "[$(date '+%H:%M:%S')] TestMemoryGuard: $*" >> /tmp/test-memory-guard.log 2>/dev/null || true
}

# Exit early if CMD parsing failed
if [ -z "$CMD" ]; then
    log "Hook: failed to parse command from input"
    exit 0
fi

log "Checking command: $CMD"

# Exit early if not a test command
# Only match commands that START with test runners, not file paths containing "test"
if ! echo "$CMD" | grep -qE "^(npm\s+(run\s+)?test|npx\s+(vitest|jest|mocha|ava|playwright)|vitest\s|jest\s|mocha\s|ava\s|playwright\s|node\s+.*--test)"; then
    log "Not a test command, allowing"
    exit 0
fi

# Check if command already has memory limit wrapper
# Accept: .claude/cfn-scripts/run-with-memory-limit.sh
# Accept: node --max-old-space-size=
# Accept: NODE_OPTIONS=--max-old-space-size
# Accept: npm run test:unit|test:integration|test:e2e (configured with limits in package.json)
if echo "$CMD" | grep -qE "run-with-memory-limit\.sh|--max-old-space-size=|NODE_OPTIONS.*max-old-space-size|npm\s+run\s+test:(unit|integration|e2e|cfn-v3)"; then
    log "Memory limit found, allowing"
    exit 0
fi

# Block the command
log "BLOCKED: Test command without memory limit"
cat >&2 <<EOF
🔴 BLOCKED: Test commands must include memory limits

Your command:
  $CMD

Memory leaks in test runners can crash WSL. Use one of these patterns:

1. Use the CFN memory-limited wrapper:
   .claude/cfn-scripts/run-with-memory-limit.sh 2G npm test

2. Use NODE_OPTIONS:
   NODE_OPTIONS="--max-old-space-size=2048" npm test

3. Use package.json scripts (already configured):
   npm run test:unit    (2G limit)
   npm run test:integration (4G limit)
   npm run test:e2e (6G limit)

Why this matters:
- WSL Memory Monitor kills processes >10% memory
- Prevents system crashes from memory leaks
- Ensures consistent test behavior

EOF

exit 2
