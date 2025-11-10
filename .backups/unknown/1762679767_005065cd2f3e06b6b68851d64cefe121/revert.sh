#!/bin/bash
# Revert script for /tmp/test-hooks-final.txt
set -euo pipefail

echo "Reverting file: /tmp/test-hooks-final.txt"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762679767_005065cd2f3e06b6b68851d64cefe121/original" "/tmp/test-hooks-final.txt"
echo "✅ File reverted successfully"
