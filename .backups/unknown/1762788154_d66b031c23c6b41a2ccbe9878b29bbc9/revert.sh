#!/bin/bash
# Revert script for .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762788154_d66b031c23c6b41a2ccbe9878b29bbc9/original" ".claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
echo "✅ File reverted successfully"
