#!/bin/bash
# Revert script for src/cli/agent-executor.ts
set -euo pipefail

echo "Reverting file: src/cli/agent-executor.ts"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763003539_323ddc47f9d1db5f95533c4418310dcd/original" "src/cli/agent-executor.ts"
echo "✅ File reverted successfully"
