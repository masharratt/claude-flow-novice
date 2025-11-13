#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-documentation-index.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-documentation-index.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762764123_e730117ccc4c19f9df0c8c9d9ad2e5fe/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-documentation-index.md"
echo "✅ File reverted successfully"
