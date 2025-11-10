#!/bin/bash
# Revert script for tests/test-cfn-integration-complete.sh
set -euo pipefail

echo "Reverting file: tests/test-cfn-integration-complete.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762739977_a3a5172dfbfcde56a8cd658f1db11d8d/original" "tests/test-cfn-integration-complete.sh"
echo "✅ File reverted successfully"
