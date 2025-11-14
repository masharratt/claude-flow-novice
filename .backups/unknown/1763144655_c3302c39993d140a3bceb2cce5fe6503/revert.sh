#!/bin/bash
# Revert script for .claude/skills/cfn-docker-redis-coordination/coordinate.sh
set -euo pipefail

echo "Reverting file: .claude/skills/cfn-docker-redis-coordination/coordinate.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763144655_c3302c39993d140a3bceb2cce5fe6503/original" ".claude/skills/cfn-docker-redis-coordination/coordinate.sh"
echo "✅ File reverted successfully"
