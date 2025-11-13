#!/bin/bash
# Revert script for tests/docker/50-agent-parallel/coordinator.sh
set -euo pipefail

echo "Reverting file: tests/docker/50-agent-parallel/coordinator.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762922291_53f41561580709e9e2bee610d1654b96/original" "tests/docker/50-agent-parallel/coordinator.sh"
echo "✅ File reverted successfully"
