#!/usr/bin/env bash
cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/b12e986fbf40baa4ab6e7d67a62bc26e28e460bda79c231265f4100ae030e4d0

echo "=== Showing git status for target files ==="
git status .claude/agents/custom/trigger-dev-expert.md docker/trigger-dev/CLAUDE.md 2>&1 | head -20

echo ""
echo "=== Attempting to show file content ==="
git show HEAD:.claude/agents/custom/trigger-dev-expert.md 2>&1 | head -50 || echo "Not in HEAD"
echo ""
git show HEAD:docker/trigger-dev/CLAUDE.md 2>&1 | head -50 || echo "Not in HEAD"

echo ""
echo "=== Direct file read attempt ==="
if [ -f .claude/agents/custom/trigger-dev-expert.md ]; then
  echo "File exists at: .claude/agents/custom/trigger-dev-expert.md"
  wc -l .claude/agents/custom/trigger-dev-expert.md
  head -20 .claude/agents/custom/trigger-dev-expert.md
else
  echo "File does NOT exist"
fi
