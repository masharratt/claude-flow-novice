#!/bin/bash
# Revert script for .claude/skills/cfn-loop-orchestration/orchestrate.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-loop-orchestration/orchestrate.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763003538_1351bd275634c215721928f23a8c05cf/original" ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
echo "✅ File reverted successfully"
