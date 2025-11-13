#!/bin/bash
# Revert script for Dockerfile.agent
set -euo pipefail

echo "Reverting file: Dockerfile.agent"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762835689_a833c579cc4432eae94c1495436c71a8/original" "Dockerfile.agent"
echo "✅ File reverted successfully"
