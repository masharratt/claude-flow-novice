#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/run-cleanup-validation.sh
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/run-cleanup-validation.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762722056_f42ebaf6931ad6ae6fb9f301df76acda/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/tests/hello-world-docker/run-cleanup-validation.sh"
echo "✅ File reverted successfully"
