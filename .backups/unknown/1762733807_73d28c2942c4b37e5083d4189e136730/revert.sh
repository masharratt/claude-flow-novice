#!/bin/bash
# Revert script for .claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762733807_73d28c2942c4b37e5083d4189e136730/original" ".claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
echo "✅ File reverted successfully"
