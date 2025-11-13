#!/bin/bash
# Revert script for .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793313_8eb4c113f241d087f3ad95168ebd50ab/original" ".claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
echo "✅ File reverted successfully"
