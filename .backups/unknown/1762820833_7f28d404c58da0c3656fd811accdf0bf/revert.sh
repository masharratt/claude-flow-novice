#!/bin/bash
# Revert script for Dockerfile.agent
set -euo pipefail

echo "Reverting file: Dockerfile.agent"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762820833_7f28d404c58da0c3656fd811accdf0bf/original" "Dockerfile.agent"
echo "✅ File reverted successfully"
