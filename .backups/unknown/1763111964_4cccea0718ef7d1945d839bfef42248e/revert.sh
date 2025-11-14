#!/bin/bash
# Revert script for docker/runtime/cfn-runtime.contract.yml
set -euo pipefail

echo "Reverting file: docker/runtime/cfn-runtime.contract.yml"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763111964_4cccea0718ef7d1945d839bfef42248e/original" "docker/runtime/cfn-runtime.contract.yml"
echo "✅ File reverted successfully"
