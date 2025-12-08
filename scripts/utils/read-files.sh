#!/bin/bash
set -euo pipefail

cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/b12e986fbf40baa4ab6e7d67a62bc26e28e460bda79c231265f4100ae030e4d0

echo "=== Checking file existence ==="
ls -la .claude/agents/custom/trigger-dev-expert.md 2>&1 | head -20
ls -la docker/trigger-dev/CLAUDE.md 2>&1 | head -20

echo ""
echo "=== Reading trigger-dev-expert.md ==="
head -100 .claude/agents/custom/trigger-dev-expert.md 2>&1 || echo "File not found or unreadable"

echo ""
echo "=== Reading docker/trigger-dev/CLAUDE.md ==="
head -100 docker/trigger-dev/CLAUDE.md 2>&1 || echo "File not found or unreadable"
