#!/bin/bash
# Revert script for tests/docker/core/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/core/docker-hello-world-parity-tests.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/07aeb8858acfc14cd70e5e5d575647f39b02ab16b12b9d5bf41d95931ba267b3/.backups/unknown/1763152742_f204bea534757579fb314e1a9e93d9c5/original" "tests/docker/core/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
