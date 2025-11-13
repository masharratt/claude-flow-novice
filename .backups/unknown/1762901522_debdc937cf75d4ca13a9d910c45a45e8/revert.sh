#!/bin/bash
# Revert script for tests/docker/docker-hello-world-parity-tests.sh
set -euo pipefail

echo "Reverting file: tests/docker/docker-hello-world-parity-tests.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762901522_debdc937cf75d4ca13a9d910c45a45e8/original" "tests/docker/docker-hello-world-parity-tests.sh"
echo "✅ File reverted successfully"
