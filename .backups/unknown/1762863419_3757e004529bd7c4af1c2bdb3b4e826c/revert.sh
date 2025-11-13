#!/bin/bash
# Revert script for scripts/docker-agent-init.sh
set -euo pipefail

echo "Reverting file: scripts/docker-agent-init.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762863419_3757e004529bd7c4af1c2bdb3b4e826c/original" "scripts/docker-agent-init.sh"
echo "✅ File reverted successfully"
