#!/bin/bash
# Revert script for .claude/skills/cfn-redis-coordination/complete-swarm.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-redis-coordination/complete-swarm.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763003537_7d8a4043dd6dcb498d2737f30aef6b33/original" ".claude/skills/cfn-redis-coordination/complete-swarm.sh"
echo "✅ File reverted successfully"
