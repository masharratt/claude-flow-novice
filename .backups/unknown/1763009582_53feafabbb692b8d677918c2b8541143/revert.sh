#!/bin/bash
# Revert script for readme/logs-cli-redis.md
set -euo pipefail

echo "Reverting file: readme/logs-cli-redis.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a/.backups/unknown/1763009582_53feafabbb692b8d677918c2b8541143/original" "readme/logs-cli-redis.md"
echo "✅ File reverted successfully"
