#!/bin/bash
# Revert script for tests/docker/50-agent-parallel-test.sh
set -euo pipefail

echo "Reverting file: tests/docker/50-agent-parallel-test.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762922271_26a1b3835b7b195349bd687c915d06bc/original" "tests/docker/50-agent-parallel-test.sh"
echo "✅ File reverted successfully"
