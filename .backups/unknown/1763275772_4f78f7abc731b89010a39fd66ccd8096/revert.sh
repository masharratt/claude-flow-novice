#!/bin/bash
# Revert script for /home/user/claude-flow-novice/tests/workflow-codification/self-healing/test_retry_wrapper.py
set -euo pipefail

echo "Reverting file: /home/user/claude-flow-novice/tests/workflow-codification/self-healing/test_retry_wrapper.py"
cp "/home/user/claude-flow-novice/.backups/unknown/1763275772_4f78f7abc731b89010a39fd66ccd8096/original" "/home/user/claude-flow-novice/tests/workflow-codification/self-healing/test_retry_wrapper.py"
echo "✅ File reverted successfully"
