#!/bin/bash
# Revert script for .claude/skills/cfn-process-instrumentation/instrument-process.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-process-instrumentation/instrument-process.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762734250_5f54ebde8a2923998abb98caa00134f6/original" ".claude/skills/cfn-process-instrumentation/instrument-process.sh"
echo "✅ File reverted successfully"
