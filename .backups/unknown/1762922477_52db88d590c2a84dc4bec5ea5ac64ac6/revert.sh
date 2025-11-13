#!/bin/bash
# Revert script for tests/docker/50-agent-parallel/coordinator.sh
set -euo pipefail

echo "Reverting file: tests/docker/50-agent-parallel/coordinator.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762922477_52db88d590c2a84dc4bec5ea5ac64ac6/original" "tests/docker/50-agent-parallel/coordinator.sh"
echo "✅ File reverted successfully"
