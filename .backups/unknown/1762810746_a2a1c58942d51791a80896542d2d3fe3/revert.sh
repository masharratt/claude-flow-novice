#!/bin/bash
# Revert script for claude-assets/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md
set -euo pipefail

echo "Reverting file: claude-assets/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762810746_a2a1c58942d51791a80896542d2d3fe3/original" "claude-assets/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md"
echo "✅ File reverted successfully"
