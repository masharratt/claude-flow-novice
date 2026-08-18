#!/usr/bin/env bash
set -euo pipefail

cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/b12e986fbf40baa4ab6e7d67a62bc26e28e460bda79c231265f4100ae030e4d0

echo "=== FILE 1: .claude/agents/custom/trigger-dev-expert.md ==="
cat .claude/agents/custom/trigger-dev-expert.md 2>/dev/null || echo "[FILE NOT FOUND OR EMPTY]"

echo ""
echo "=== FILE 2: docker/trigger-dev/CLAUDE.md ==="
cat docker/trigger-dev/CLAUDE.md 2>/dev/null || echo "[FILE NOT FOUND OR EMPTY]"
