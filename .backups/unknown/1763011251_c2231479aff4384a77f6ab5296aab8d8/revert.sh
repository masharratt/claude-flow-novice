#!/bin/bash
# Revert script for src/cli/conversation-fork.ts
set -euo pipefail

echo "Reverting file: src/cli/conversation-fork.ts"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763011251_c2231479aff4384a77f6ab5296aab8d8/original" "src/cli/conversation-fork.ts"
echo "✅ File reverted successfully"
