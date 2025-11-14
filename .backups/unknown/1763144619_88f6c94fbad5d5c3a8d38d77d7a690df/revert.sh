#!/bin/bash
# Revert script for .claude/commands/switch-api.md
set -euo pipefail

echo "Reverting file: .claude/commands/switch-api.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763144619_88f6c94fbad5d5c3a8d38d77d7a690df/original" ".claude/commands/switch-api.md"
echo "✅ File reverted successfully"
