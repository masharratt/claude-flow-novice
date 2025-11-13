#!/bin/bash
# Revert script for tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762813289_9d0d9c5256d8b46220a415213afda565/original" "tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
