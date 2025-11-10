#!/bin/bash
# Revert script for .claude/skills/cfn-loop-orchestration/orchestrate.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-loop-orchestration/orchestrate.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762714199_14dae01aeca134f6e07910d009e7a2b2/original" ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
echo "✅ File reverted successfully"
