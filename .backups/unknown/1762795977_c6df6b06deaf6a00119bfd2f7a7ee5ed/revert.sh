#!/bin/bash
# Revert script for docs/CUSTOM_PROVIDER_ROUTING.md
set -euo pipefail

echo "Reverting file: docs/CUSTOM_PROVIDER_ROUTING.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762795977_c6df6b06deaf6a00119bfd2f7a7ee5ed/original" "docs/CUSTOM_PROVIDER_ROUTING.md"
echo "✅ File reverted successfully"
