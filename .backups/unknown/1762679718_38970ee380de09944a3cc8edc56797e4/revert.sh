#!/bin/bash
# Revert script for /tmp/test-complete-hooks-final.txt
set -euo pipefail

echo "Reverting file: /tmp/test-complete-hooks-final.txt"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762679718_38970ee380de09944a3cc8edc56797e4/original" "/tmp/test-complete-hooks-final.txt"
echo "✅ File reverted successfully"
