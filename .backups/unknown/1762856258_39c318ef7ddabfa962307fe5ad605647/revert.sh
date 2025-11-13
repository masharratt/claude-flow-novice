#!/bin/bash
# Revert script for Dockerfile.agent
set -euo pipefail

echo "Reverting file: Dockerfile.agent"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762856258_39c318ef7ddabfa962307fe5ad605647/original" "Dockerfile.agent"
echo "✅ File reverted successfully"
