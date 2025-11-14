#!/bin/bash
# Revert script for docker/CLAUDE.md
set -euo pipefail

echo "Reverting file: docker/CLAUDE.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763101402_4e8fd35e716d9a0e634245054a835cd6/original" "docker/CLAUDE.md"
echo "✅ File reverted successfully"
