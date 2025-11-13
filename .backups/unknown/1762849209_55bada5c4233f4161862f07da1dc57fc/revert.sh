#!/bin/bash
# Revert script for tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762849209_55bada5c4233f4161862f07da1dc57fc/original" "tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
