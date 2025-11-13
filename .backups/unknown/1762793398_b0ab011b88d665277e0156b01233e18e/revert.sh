#!/bin/bash
# Revert script for tests/test-provider-routing.sh
set -euo pipefail

echo "Reverting file: tests/test-provider-routing.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762793398_b0ab011b88d665277e0156b01233e18e/original" "tests/test-provider-routing.sh"
echo "✅ File reverted successfully"
