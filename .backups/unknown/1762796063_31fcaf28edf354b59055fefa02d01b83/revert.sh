#!/bin/bash
# Revert script for .claude/skills/cfn-agent-spawning/get-agent-provider-env.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-agent-spawning/get-agent-provider-env.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762796063_31fcaf28edf354b59055fefa02d01b83/original" ".claude/skills/cfn-agent-spawning/get-agent-provider-env.sh"
echo "✅ File reverted successfully"
