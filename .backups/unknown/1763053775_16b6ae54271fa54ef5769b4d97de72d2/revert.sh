#!/bin/bash
# Revert script for tests/docker/provider-auth-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/provider-auth-tests.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763053775_16b6ae54271fa54ef5769b4d97de72d2/original" "tests/docker/provider-auth-tests.sh"
echo "✅ File reverted successfully"
