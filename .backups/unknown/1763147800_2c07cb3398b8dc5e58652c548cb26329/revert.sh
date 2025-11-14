#!/bin/bash
# Revert script for CLAUDE.md
set -euo pipefail

echo "Reverting file: CLAUDE.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763147800_2c07cb3398b8dc5e58652c548cb26329/original" "CLAUDE.md"
echo "✅ File reverted successfully"
