#!/bin/bash
# Revert script for .claude/agents/cfn-dev-team/developers/backend-developer.md
set -euo pipefail

echo "Reverting file: .claude/agents/cfn-dev-team/developers/backend-developer.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793167_c342e807b344699ec2cc1c8abacfb0c9/original" ".claude/agents/cfn-dev-team/developers/backend-developer.md"
echo "✅ File reverted successfully"
