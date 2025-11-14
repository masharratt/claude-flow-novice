#!/bin/bash
# Revert script for .claude/agents/cfn-dev-team/testers/interaction-tester.md
set -euo pipefail

echo "Reverting file: .claude/agents/cfn-dev-team/testers/interaction-tester.md"
cp "/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/d84b83aef407ff8c00126a433a9de4061a5626c404f2ac3c7ad34fb9fc95a990/.backups/unknown/1763145044_4ce725ceaa4303b46d4e6ec648f701ef/original" ".claude/agents/cfn-dev-team/testers/interaction-tester.md"
echo "✅ File reverted successfully"
