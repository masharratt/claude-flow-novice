#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762850902_4ae0d12a902d407c134e1e8e29a5ceb7/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
