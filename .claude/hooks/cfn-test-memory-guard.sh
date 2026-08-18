#!/usr/bin/env bash
# CFN Test Memory Guard Hook
# Blocks npm/npx test runs that don't include memory limits
# to prevent memory leaks from killing the system
#
# DEREGISTERED 2026-07-25 from all 16 projects that had it wired as a
# PreToolUse "Bash" hook. It was not deleted, only unregistered.
#
# Why it was deregistered: it gated on the literal command string the user
# typed and never resolved package.json, so it could not see what a script
# actually runs.
#   - False positives: it blocked `npm test` in every project sampled (16/16),
#     including daily-seo whose test script is already
#     NODE_OPTIONS='--max-old-space-size=2048 --expose-gc' vitest. The limit
#     was set correctly; the guard just never looked past the word "test".
#   - Blocked no-op invocations: `npx jest --version` runs zero tests and was
#     still refused.
#   - Trivially evadable: `pnpm test`, `yarn test`, and `turbo run test` were
#     not in the regex and sailed through, so the guard was strictest with the
#     people already doing the right thing and absent for everyone else.
# Superseded by ~/.local/bin/wsl-memory-monitor.sh, which enforces the same
# intent process-side: it watches actual RSS of the same runner set
# (vitest/jest/mocha/ava/tap/playwright/cypress) and kills at 10%. That is
# unevadable by command spelling and produces no false positives, because it
# measures memory instead of guessing at it from a string.
#
# cfn-selftest: not-a-hook superseded by wsl-memory-monitor.sh (RSS-based, unevadable, no false positives)

# Removed -e flag to prevent hook failures on expected errors
set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

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
