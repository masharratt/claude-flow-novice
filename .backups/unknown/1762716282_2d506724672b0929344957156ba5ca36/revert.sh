#!/bin/bash
# Revert script for docker-compose.production.yml
set -euo pipefail

echo "Reverting file: docker-compose.production.yml"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762716282_2d506724672b0929344957156ba5ca36/original" "docker-compose.production.yml"
echo "✅ File reverted successfully"
