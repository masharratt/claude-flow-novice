#!/bin/bash
# Revert script for /tmp/test-file.txt
set -euo pipefail

echo "Reverting file: /tmp/test-file.txt"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762694962_d6eb32081c822ed572b70567826d9d9d/original" "/tmp/test-file.txt"
echo "✅ File reverted successfully"
