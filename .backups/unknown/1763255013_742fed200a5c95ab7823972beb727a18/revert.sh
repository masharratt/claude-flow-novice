#!/bin/bash
# Revert script for /home/user/claude-flow-novice/tests/agent-workspace.test.ts
set -euo pipefail

echo "Reverting file: /home/user/claude-flow-novice/tests/agent-workspace.test.ts"
cp "/home/user/claude-flow-novice/.backups/unknown/1763255013_742fed200a5c95ab7823972beb727a18/original" "/home/user/claude-flow-novice/tests/agent-workspace.test.ts"
echo "✅ File reverted successfully"
