#!/usr/bin/env bash
cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/b12e986fbf40baa4ab6e7d67a62bc26e28e460bda79c231265f4100ae030e4d0

echo "=== trigger-dev-expert.md ==="
cat .claude/agents/custom/trigger-dev-expert.md 2>/dev/null || echo "File not found"

echo ""
echo "=== docker/trigger-dev/CLAUDE.md ==="
cat docker/trigger-dev/CLAUDE.md 2>/dev/null || echo "File not found"
