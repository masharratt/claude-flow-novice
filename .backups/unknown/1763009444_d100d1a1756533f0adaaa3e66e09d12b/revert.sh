#!/bin/bash
# Revert script for package.json
set -euo pipefail

echo "Reverting file: package.json"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763009444_d100d1a1756533f0adaaa3e66e09d12b/original" "package.json"
echo "✅ File reverted successfully"
