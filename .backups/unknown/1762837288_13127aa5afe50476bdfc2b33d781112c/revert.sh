#!/bin/bash
# Revert script for .dockerignore
set -euo pipefail

echo "Reverting file: .dockerignore"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762837288_13127aa5afe50476bdfc2b33d781112c/original" ".dockerignore"
echo "✅ File reverted successfully"
