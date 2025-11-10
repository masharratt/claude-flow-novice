#!/bin/bash
# Revert script for /home/masharratt/.claude.json
set -euo pipefail

echo "Reverting file: /home/masharratt/.claude.json"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762753836_7e24b9cc2d66d08c1de69db7304473c7/original" "/home/masharratt/.claude.json"
echo "✅ File reverted successfully"
