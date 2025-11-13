#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-features.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-features.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762764071_3efc49108bf4d83384de54592ab468b4/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/readme/logs-features.md"
echo "✅ File reverted successfully"
