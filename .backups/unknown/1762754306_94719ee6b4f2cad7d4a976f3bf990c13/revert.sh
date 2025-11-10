#!/bin/bash
# Revert script for .claude/settings.json
set -euo pipefail

echo "Reverting file: .claude/settings.json"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762754306_94719ee6b4f2cad7d4a976f3bf990c13/original" ".claude/settings.json"
echo "✅ File reverted successfully"
