#!/bin/bash
# Revert script for src/cli/agent-spawn.ts
set -euo pipefail

echo "Reverting file: src/cli/agent-spawn.ts"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763011250_22066f1ace7ef6d209f6727377c107c0/original" "src/cli/agent-spawn.ts"
echo "✅ File reverted successfully"
