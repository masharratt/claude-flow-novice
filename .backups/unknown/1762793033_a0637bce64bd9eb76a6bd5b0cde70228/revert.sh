#!/bin/bash
# Revert script for scripts/switch-api.sh
set -euo pipefail

echo "Reverting file: scripts/switch-api.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793033_a0637bce64bd9eb76a6bd5b0cde70228/original" "scripts/switch-api.sh"
echo "✅ File reverted successfully"
