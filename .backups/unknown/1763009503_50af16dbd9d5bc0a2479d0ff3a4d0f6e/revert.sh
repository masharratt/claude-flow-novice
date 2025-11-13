#!/bin/bash
# Revert script for planning/docker/README.md
set -euo pipefail

echo "Reverting file: planning/docker/README.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763009503_50af16dbd9d5bc0a2479d0ff3a4d0f6e/original" "planning/docker/README.md"
echo "✅ File reverted successfully"
