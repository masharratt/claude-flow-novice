#!/bin/bash
# Revert script for tests/docker/validate-bug6-redis-vars.sh
set -euo pipefail

echo "Reverting file: tests/docker/validate-bug6-redis-vars.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763034159_faff7330bdd690dd7a5438c2ba27c2b6/original" "tests/docker/validate-bug6-redis-vars.sh"
echo "✅ File reverted successfully"
