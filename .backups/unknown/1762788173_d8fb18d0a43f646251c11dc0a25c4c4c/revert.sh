#!/bin/bash
# Revert script for .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762788173_d8fb18d0a43f646251c11dc0a25c4c4c/original" ".claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
echo "✅ File reverted successfully"
