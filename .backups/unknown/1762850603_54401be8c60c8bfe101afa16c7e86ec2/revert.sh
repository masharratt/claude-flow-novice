#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762850603_54401be8c60c8bfe101afa16c7e86ec2/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
