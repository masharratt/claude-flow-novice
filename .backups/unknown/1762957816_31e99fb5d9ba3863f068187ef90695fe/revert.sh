#!/bin/bash
# Revert script for .mcp.json
set -euo pipefail

echo "Reverting file: .mcp.json"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762957816_31e99fb5d9ba3863f068187ef90695fe/original" ".mcp.json"
echo "✅ File reverted successfully"
