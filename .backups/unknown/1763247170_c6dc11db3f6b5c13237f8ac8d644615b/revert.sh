#!/bin/bash
# Revert script for src/cli/skill-cache-validator.ts
set -euo pipefail

echo "Reverting file: src/cli/skill-cache-validator.ts"
cp "/home/user/claude-flow-novice/.backups/unknown/1763247170_c6dc11db3f6b5c13237f8ac8d644615b/original" "src/cli/skill-cache-validator.ts"
echo "✅ File reverted successfully"
