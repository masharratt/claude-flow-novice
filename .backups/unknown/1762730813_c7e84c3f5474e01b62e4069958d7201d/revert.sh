#!/bin/bash
# Revert script for tests/hello-world/layer8-ulimit-sanitizer-validation.sh
set -euo pipefail

echo "Reverting file: tests/hello-world/layer8-ulimit-sanitizer-validation.sh"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762730813_c7e84c3f5474e01b62e4069958d7201d/original" "tests/hello-world/layer8-ulimit-sanitizer-validation.sh"
echo "✅ File reverted successfully"
