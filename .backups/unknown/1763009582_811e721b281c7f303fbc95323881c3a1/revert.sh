#!/bin/bash
# Revert script for readme/logs-features.md
set -euo pipefail

echo "Reverting file: readme/logs-features.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763009582_811e721b281c7f303fbc95323881c3a1/original" "readme/logs-features.md"
echo "✅ File reverted successfully"
