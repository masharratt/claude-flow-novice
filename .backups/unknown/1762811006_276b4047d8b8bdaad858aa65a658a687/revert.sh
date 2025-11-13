#!/bin/bash
# Revert script for claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md
set -euo pipefail

echo "Reverting file: claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762811006_276b4047d8b8bdaad858aa65a658a687/original" "claude-assets/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
echo "✅ File reverted successfully"
