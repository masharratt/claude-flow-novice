#!/bin/bash
# Revert script for src/cli/skill-loader.ts
set -euo pipefail

echo "Reverting file: src/cli/skill-loader.ts"
cp "/home/user/claude-flow-novice/.backups/unknown/1763247170_7451157d71bfd4e844d9e8e802155dd9/original" "src/cli/skill-loader.ts"
echo "✅ File reverted successfully"
