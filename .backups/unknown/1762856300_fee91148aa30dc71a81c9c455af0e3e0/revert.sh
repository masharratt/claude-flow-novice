#!/bin/bash
# Revert script for Dockerfile.agent
set -euo pipefail

echo "Reverting file: Dockerfile.agent"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762856300_fee91148aa30dc71a81c9c455af0e3e0/original" "Dockerfile.agent"
echo "✅ File reverted successfully"
