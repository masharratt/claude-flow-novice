#!/bin/bash
# Revert script for tests/test-environment-sanitization.sh
set -euo pipefail

echo "Reverting file: tests/test-environment-sanitization.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762740068_21aa967a1c3acddabbd00aa7b81427fc/original" "tests/test-environment-sanitization.sh"
echo "✅ File reverted successfully"
