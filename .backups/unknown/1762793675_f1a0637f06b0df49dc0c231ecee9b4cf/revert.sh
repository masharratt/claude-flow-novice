#!/bin/bash
# Revert script for .claude/skills/cfn-loop-orchestration/orchestrate.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-loop-orchestration/orchestrate.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793675_f1a0637f06b0df49dc0c231ecee9b4cf/original" ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
echo "✅ File reverted successfully"
