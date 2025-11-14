#!/bin/bash
# Revert script for docker/Dockerfile.agent
set -euo pipefail

echo "Reverting file: docker/Dockerfile.agent"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763147723_d0d3db4244b6a9963845cae3a75a6384/original" "docker/Dockerfile.agent"
echo "✅ File reverted successfully"
