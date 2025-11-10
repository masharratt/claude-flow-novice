#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762743752_9b1b7790e4c4d8ad2dccb9632e1254d4/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
echo "✅ File reverted successfully"
