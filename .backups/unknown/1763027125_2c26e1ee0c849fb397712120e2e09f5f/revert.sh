#!/bin/bash
# Revert script for docker/coordinator/src/coordinator.js
set -euo pipefail

echo "Reverting file: docker/coordinator/src/coordinator.js"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763027125_2c26e1ee0c849fb397712120e2e09f5f/original" "docker/coordinator/src/coordinator.js"
echo "✅ File reverted successfully"
