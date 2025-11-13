#!/bin/bash
# Revert script for CLAUDE.md
set -euo pipefail

echo "Reverting file: CLAUDE.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793514_fc26b71356a74239086908c9cb20f19d/original" "CLAUDE.md"
echo "✅ File reverted successfully"
