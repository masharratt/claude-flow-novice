#!/bin/bash
# Revert script for .claude/agents/cfn-dev-team/testers/load-testing-specialist.md
set -euo pipefail

echo "Reverting file: .claude/agents/cfn-dev-team/testers/load-testing-specialist.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763145044_1ac97f8efa9cdc1d96f0897ebc4b7773/original" ".claude/agents/cfn-dev-team/testers/load-testing-specialist.md"
echo "✅ File reverted successfully"
