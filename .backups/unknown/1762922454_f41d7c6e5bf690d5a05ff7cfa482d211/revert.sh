#!/bin/bash
# Revert script for tests/docker/50-agent-parallel-test.sh
set -euo pipefail

echo "Reverting file: tests/docker/50-agent-parallel-test.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762922454_f41d7c6e5bf690d5a05ff7cfa482d211/original" "tests/docker/50-agent-parallel-test.sh"
echo "✅ File reverted successfully"
