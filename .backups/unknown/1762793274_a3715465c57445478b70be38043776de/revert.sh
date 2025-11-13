#!/bin/bash
# Revert script for .claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793274_a3715465c57445478b70be38043776de/original" ".claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh"
echo "✅ File reverted successfully"
