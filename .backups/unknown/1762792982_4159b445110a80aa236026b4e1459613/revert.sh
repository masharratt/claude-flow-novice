#!/bin/bash
# Revert script for .claude/commands/switch-api.md
set -euo pipefail

echo "Reverting file: .claude/commands/switch-api.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762792982_4159b445110a80aa236026b4e1459613/original" ".claude/commands/switch-api.md"
echo "✅ File reverted successfully"
