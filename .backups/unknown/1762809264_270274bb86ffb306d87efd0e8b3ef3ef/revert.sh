#!/bin/bash
# Revert script for .claude/skills/cfn-loop-orchestration/orchestrate.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-loop-orchestration/orchestrate.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762809264_270274bb86ffb306d87efd0e8b3ef3ef/original" ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
echo "✅ File reverted successfully"
