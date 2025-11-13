#!/bin/bash
# Revert script for /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md
set -euo pipefail

echo "Reverting file: /mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md"
cp "/mnt/c/Users/masha/Documents/claude-flow-novice/.backups/unknown/1762945239_ad69f2468c4575a35409c542cb700edb/original" "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md"
echo "✅ File reverted successfully"
