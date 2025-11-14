#!/bin/bash
# Revert script for tests/docker/core/agent-lifecycle-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/core/agent-lifecycle-tests.sh"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/07aeb8858acfc14cd70e5e5d575647f39b02ab16b12b9d5bf41d95931ba267b3/.backups/unknown/1763158850_374a00a493da1784e2c641e6daf63f1e/original" "tests/docker/core/agent-lifecycle-tests.sh"
echo "✅ File reverted successfully"
