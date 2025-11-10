#!/bin/bash
# Revert script for /home/masharratt/.claude.json
set -euo pipefail

echo "Reverting file: /home/masharratt/.claude.json"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762754508_c208a5d595d413530031f41142b44e83/original" "/home/masharratt/.claude.json"
echo "✅ File reverted successfully"
