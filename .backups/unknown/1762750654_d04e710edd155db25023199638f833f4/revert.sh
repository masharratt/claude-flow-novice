#!/bin/bash
# Revert script for ./src/hello.js
set -euo pipefail

echo "Reverting file: ./src/hello.js"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762750654_d04e710edd155db25023199638f833f4/original" "./src/hello.js"
echo "✅ File reverted successfully"
