#!/bin/bash
# Revert script for .claude/commands/switch-api.md
set -euo pipefail

echo "Reverting file: .claude/commands/switch-api.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762800938_60005213c30ae4cc200a0ad51b9c47ad/original" ".claude/commands/switch-api.md"
echo "✅ File reverted successfully"
