#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762722536_30a8b41355b0335dea8ed3e1d504c2c6/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md"
echo "✅ File reverted successfully"
