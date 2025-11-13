#!/bin/bash
set -euo pipefail

echo "🧪 SINGLE B10 AGENT TEST WITH LOGGING"
echo "======================================"

# Test file info from B10 batch
TEST_FILE="src/services/notifications/permissionNotifications.ts"
EXPECTED_ERRORS=13

echo ""
echo "Target: $TEST_FILE ($EXPECTED_ERRORS errors)"
echo ""

# Create prompt with direct, focused instructions
FIX_PROMPT="YOUR ONLY JOB: Fix TypeScript errors in ONE FILE.

FILE TO FIX: /workspace/$TEST_FILE
EXPECTED ERRORS: Approximately $EXPECTED_ERRORS

STEP 1: Read(/workspace/$TEST_FILE)
STEP 2: For each TypeScript error you find, use Edit() to fix it immediately
STEP 3: After fixing all errors, respond with 'COMPLETE'

DO NOT:
- Read tsconfig.json
- Explore project structure
- Check other files
- Use Bash to find files
- Read any file except /workspace/$TEST_FILE

ONLY:
- Read /workspace/$TEST_FILE
- Edit /workspace/$TEST_FILE to fix TypeScript errors
- Nothing else

Start NOW by reading /workspace/$TEST_FILE"

# Capture file hash before
BEFORE_HASH=$(md5sum "/mnt/c/Users/masha/Documents/ourstories-v2/frontend/$TEST_FILE" | awk '{print $1}')

echo "📊 File state BEFORE:"
echo "   Hash: $BEFORE_HASH"
echo ""

# Run agent in Docker
echo "🚀 Running agent in Docker..."
docker run --rm \
    --env-file /mnt/c/Users/masha/Documents/claude-flow-novice/.env \
    -v "/mnt/c/Users/masha/Documents/ourstories-v2/frontend:/workspace:rw" \
    claude-flow-novice:agent \
    bash -c "
        cd /workspace
        echo '=== CLI Execution ==='
        node /app/dist/cli/index.js agent typescript-specialist \"$FIX_PROMPT\" 2>&1
        EXIT_CODE=\$?
        echo ''
        echo '=== Exit Code: '\$EXIT_CODE' ==='
    " | tee /tmp/single-agent-output.log

echo ""
echo "📊 File state AFTER:"
AFTER_HASH=$(md5sum "/mnt/c/Users/masha/Documents/ourstories-v2/frontend/$TEST_FILE" | awk '{print $1}')
echo "   Hash: $AFTER_HASH"

if [ "$BEFORE_HASH" != "$AFTER_HASH" ]; then
    echo "   ✅ FILE WAS MODIFIED!"
else
    echo "   ❌ FILE WAS NOT MODIFIED"
fi

echo ""
echo "Full output saved to: /tmp/single-agent-output.log"
