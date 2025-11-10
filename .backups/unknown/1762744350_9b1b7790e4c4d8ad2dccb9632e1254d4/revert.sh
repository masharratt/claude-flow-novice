#!/bin/bash
# Revert script for .claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md
set -euo pipefail

echo "Reverting file: .claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762744350_9b1b7790e4c4d8ad2dccb9632e1254d4/original" ".claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md"
echo "✅ File reverted successfully"
