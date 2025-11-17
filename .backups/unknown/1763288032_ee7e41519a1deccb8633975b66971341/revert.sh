#!/bin/bash
# Revert script for /home/user/claude-flow-novice/src/cli/skill-cli.ts
set -euo pipefail

echo "Reverting file: /home/user/claude-flow-novice/src/cli/skill-cli.ts"
cp "/home/user/claude-flow-novice/.backups/unknown/1763288032_ee7e41519a1deccb8633975b66971341/original" "/home/user/claude-flow-novice/src/cli/skill-cli.ts"
echo "✅ File reverted successfully"
