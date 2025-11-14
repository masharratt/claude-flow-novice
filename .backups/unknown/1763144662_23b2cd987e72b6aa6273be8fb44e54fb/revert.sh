#!/bin/bash
# Revert script for claude-assets/commands/switch-api.md
set -euo pipefail

echo "Reverting file: claude-assets/commands/switch-api.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763144662_23b2cd987e72b6aa6273be8fb44e54fb/original" "claude-assets/commands/switch-api.md"
echo "✅ File reverted successfully"
