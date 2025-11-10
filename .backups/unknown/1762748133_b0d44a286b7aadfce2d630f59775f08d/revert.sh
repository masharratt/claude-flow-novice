#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/commands/CFN_COORDINATOR_PARAMETERS.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/commands/CFN_COORDINATOR_PARAMETERS.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762748133_b0d44a286b7aadfce2d630f59775f08d/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/commands/CFN_COORDINATOR_PARAMETERS.md"
echo "✅ File reverted successfully"
