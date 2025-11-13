#!/bin/bash
# Quick test to verify CLAUDE.md inclusion fix

set -e

echo "Building Docker image..."
docker build -t cfn-quick-test -f Dockerfile.agent . >/dev/null 2>&1

echo "Testing CLAUDE.md inclusion..."
if docker run --rm cfn-quick-test test -f /app/CLAUDE.md; then
    SIZE=$(docker run --rm cfn-quick-test stat -c %s /app/CLAUDE.md 2>/dev/null || docker run --rm cfn-quick-test wc -c < /app/CLAUDE.md)
    FIRST_LINE=$(docker run --rm cfn-quick-test head -1 /app/CLAUDE.md)
    echo "✅ SUCCESS: CLAUDE.md found (${SIZE} bytes)"
    echo "   First line: ${FIRST_LINE}"

    # Quick count of markdown files
    AGENT_MD=$(docker run --rm cfn-quick-test find /app/.claude/agents -name "*.md" | wc -l)
    SKILL_MD=$(docker run --rm cfn-quick-test find /app/.claude/skills -name "*.md" | wc -l)
    echo "   Agent .md files: ${AGENT_MD}"
    echo "   Skill .md files: ${SKILL_MD}"

    docker rmi cfn-quick-test >/dev/null 2>&1
    exit 0
else
    echo "❌ FAIL: CLAUDE.md not found in Docker image"
    docker rmi cfn-quick-test >/dev/null 2>&1
    exit 1
fi
