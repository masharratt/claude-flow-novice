#!/bin/bash
# Revert script for .claude/skills/cfn-agent-spawning/get-agent-provider-env.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-agent-spawning/get-agent-provider-env.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762795954_5d0d22ec344c7ba809dbe620511a2206/original" ".claude/skills/cfn-agent-spawning/get-agent-provider-env.sh"
echo "✅ File reverted successfully"
