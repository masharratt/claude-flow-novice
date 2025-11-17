#!/bin/bash
# Revert script for /home/user/claude-flow-novice/src/workflow_codification/redis/circuit_breaker.py
set -euo pipefail

echo "Reverting file: /home/user/claude-flow-novice/src/workflow_codification/redis/circuit_breaker.py"
cp "/home/user/claude-flow-novice/.backups/unknown/1763275698_81e31173a722fd4c3f41e99fb409c641/original" "/home/user/claude-flow-novice/src/workflow_codification/redis/circuit_breaker.py"
echo "✅ File reverted successfully"
