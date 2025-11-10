#!/bin/bash
# Revert script for tests/hello-world/layer8-ulimit-sanitizer-validation.sh
set -euo pipefail

echo "Reverting file: tests/hello-world/layer8-ulimit-sanitizer-validation.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762730853_94d7d13f9486106f9af65eaa1811a3d1/original" "tests/hello-world/layer8-ulimit-sanitizer-validation.sh"
echo "✅ File reverted successfully"
