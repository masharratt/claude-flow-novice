#!/bin/bash
# Revert script for tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762901847_b11a66a5c7a2539964dd5e0eb8c318bd/original" "tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
