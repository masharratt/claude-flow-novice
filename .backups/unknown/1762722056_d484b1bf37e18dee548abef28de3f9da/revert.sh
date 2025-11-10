#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/container-cleanup-validator.js
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/container-cleanup-validator.js"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762722056_d484b1bf37e18dee548abef28de3f9da/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/container-cleanup-validator.js"
echo "✅ File reverted successfully"
