#!/bin/bash
# Revert script for Dockerfile.agent
set -euo pipefail

echo "Reverting file: Dockerfile.agent"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762857942_abf5315f0ba2d4407a515450588594b8/original" "Dockerfile.agent"
echo "✅ File reverted successfully"
