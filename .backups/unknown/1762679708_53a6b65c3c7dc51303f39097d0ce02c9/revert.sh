#!/bin/bash
# Revert script for /tmp/test-complete-hooks.txt
set -euo pipefail

echo "Reverting file: /tmp/test-complete-hooks.txt"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762679708_53a6b65c3c7dc51303f39097d0ce02c9/original" "/tmp/test-complete-hooks.txt"
echo "✅ File reverted successfully"
