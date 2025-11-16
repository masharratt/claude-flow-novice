#!/bin/bash
# Revert script for src/db/skills-query.ts
set -euo pipefail

echo "Reverting file: src/db/skills-query.ts"
cp "/home/user/claude-flow-novice/.backups/unknown/1763247170_af7449d7963678b2d8fb4a4407c0a3ba/original" "src/db/skills-query.ts"
echo "✅ File reverted successfully"
