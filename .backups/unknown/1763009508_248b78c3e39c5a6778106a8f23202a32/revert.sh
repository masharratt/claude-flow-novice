#!/bin/bash
# Revert script for planning/docker/intelligent-coordinator-architecture.md
set -euo pipefail

echo "Reverting file: planning/docker/intelligent-coordinator-architecture.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763009508_248b78c3e39c5a6778106a8f23202a32/original" "planning/docker/intelligent-coordinator-architecture.md"
echo "✅ File reverted successfully"
