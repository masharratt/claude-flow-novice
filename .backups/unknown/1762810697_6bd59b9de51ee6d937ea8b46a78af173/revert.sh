#!/bin/bash
# Revert script for .claude/commands/cfn-loop-cli.md
set -euo pipefail

echo "Reverting file: .claude/commands/cfn-loop-cli.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762810697_6bd59b9de51ee6d937ea8b46a78af173/original" ".claude/commands/cfn-loop-cli.md"
echo "✅ File reverted successfully"
