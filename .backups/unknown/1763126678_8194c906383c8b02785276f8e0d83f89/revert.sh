#!/bin/bash
# Revert script for tests/docker/core/test-wave-orchestration.sh
set -euo pipefail

echo "Reverting file: tests/docker/core/test-wave-orchestration.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763126678_8194c906383c8b02785276f8e0d83f89/original" "tests/docker/core/test-wave-orchestration.sh"
echo "✅ File reverted successfully"
