#!/bin/bash
# Revert script for scripts/docker-agent-init.sh
set -euo pipefail

echo "Reverting file: scripts/docker-agent-init.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762902704_7961526dcbbb08bb9f481427bd9b70e6/original" "scripts/docker-agent-init.sh"
echo "✅ File reverted successfully"
