#!/bin/bash
# Revert script for /tmp/test-backup-file.txt
set -euo pipefail

echo "Reverting file: /tmp/test-backup-file.txt"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/test-agent-67890/1762722090_0fe857fde4f2bfbad1f439b588720ea1/original" "/tmp/test-backup-file.txt"
echo "✅ File reverted successfully"
