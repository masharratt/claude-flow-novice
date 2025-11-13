#!/bin/bash
# Revert script for tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762861645_fffc44f89b1b5757821ae2c1db6e88cb/original" "tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
