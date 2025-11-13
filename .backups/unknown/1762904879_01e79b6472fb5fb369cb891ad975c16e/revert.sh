#!/bin/bash
# Revert script for scripts/docker-agent-init.sh
set -euo pipefail

echo "Reverting file: scripts/docker-agent-init.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762904879_01e79b6472fb5fb369cb891ad975c16e/original" "scripts/docker-agent-init.sh"
echo "✅ File reverted successfully"
