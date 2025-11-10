#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/commands/cfn-loop-cli.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/commands/cfn-loop-cli.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762728904_d47b14874e0bb581487e457b57b38a2a/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/commands/cfn-loop-cli.md"
echo "✅ File reverted successfully"
