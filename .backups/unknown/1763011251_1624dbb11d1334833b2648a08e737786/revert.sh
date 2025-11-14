#!/bin/bash
# Revert script for src/cli/iteration-history.ts
set -euo pipefail

echo "Reverting file: src/cli/iteration-history.ts"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763011251_1624dbb11d1334833b2648a08e737786/original" "src/cli/iteration-history.ts"
echo "✅ File reverted successfully"
