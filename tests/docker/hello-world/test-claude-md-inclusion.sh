#!/bin/bash
# Test script to verify CLAUDE.md inclusion in Docker image
# Expected: CLAUDE.md, agent/*.md (76), skill/*.md (72), README.md included

set -euo pipefail

IMAGE_NAME="cfn-agent-test-$(date +%s)"
BUILD_CONTEXT="/mnt/c/Users/masha/Documents/claude-flow-novice"

echo "=========================================="
echo "Docker CLAUDE.md Inclusion Test"
echo "=========================================="
echo ""

# Build the image
echo "1. Building Docker image..."
docker build -t "$IMAGE_NAME" -f "$BUILD_CONTEXT/Dockerfile.agent" "$BUILD_CONTEXT"

if [ $? -ne 0 ]; then
    echo "❌ FAIL: Docker build failed"
    exit 1
fi

echo "✅ Docker build completed"
echo ""

# Test 1: CLAUDE.md exists at /app/CLAUDE.md
echo "2. Testing CLAUDE.md inclusion..."
if docker run --rm "$IMAGE_NAME" test -f /app/CLAUDE.md; then
    CLAUDE_SIZE=$(docker run --rm "$IMAGE_NAME" stat -f %z /app/CLAUDE.md 2>/dev/null || docker run --rm "$IMAGE_NAME" stat -c %s /app/CLAUDE.md)
    echo "✅ PASS: CLAUDE.md exists (${CLAUDE_SIZE} bytes)"
else
    echo "❌ FAIL: CLAUDE.md not found in image"
    docker rmi "$IMAGE_NAME"
    exit 1
fi

# Test 2: Agent markdown files (expected: 76)
echo ""
echo "3. Testing agent markdown files..."
AGENT_COUNT=$(docker run --rm "$IMAGE_NAME" find /app/.claude/agents -name "*.md" -type f | wc -l)
echo "   Found ${AGENT_COUNT} agent markdown files (expected: 76)"
if [ "$AGENT_COUNT" -ge 70 ]; then
    echo "✅ PASS: Agent files included"
else
    echo "❌ FAIL: Insufficient agent files"
    docker rmi "$IMAGE_NAME"
    exit 1
fi

# Test 3: Skill markdown files (expected: 72)
echo ""
echo "4. Testing skill markdown files..."
SKILL_COUNT=$(docker run --rm "$IMAGE_NAME" find /app/.claude/skills -name "*.md" -type f | wc -l)
echo "   Found ${SKILL_COUNT} skill markdown files (expected: 72)"
if [ "$SKILL_COUNT" -ge 60 ]; then
    echo "✅ PASS: Skill files included"
else
    echo "❌ FAIL: Insufficient skill files"
    docker rmi "$IMAGE_NAME"
    exit 1
fi

# Test 4: README.md exists
echo ""
echo "5. Testing README.md inclusion..."
if docker run --rm "$IMAGE_NAME" test -f /app/README.md; then
    echo "✅ PASS: README.md exists"
else
    echo "❌ FAIL: README.md not found"
    docker rmi "$IMAGE_NAME"
    exit 1
fi

# Test 5: docs/ directory excluded
echo ""
echo "6. Testing docs/ exclusion..."
if docker run --rm "$IMAGE_NAME" test -d /app/docs; then
    echo "❌ FAIL: docs/ directory should be excluded"
    docker rmi "$IMAGE_NAME"
    exit 1
else
    echo "✅ PASS: docs/ directory correctly excluded"
fi

# Test 6: Verify CLAUDE.md content (not empty)
echo ""
echo "7. Testing CLAUDE.md content..."
CLAUDE_FIRST_LINE=$(docker run --rm "$IMAGE_NAME" head -1 /app/CLAUDE.md)
if [[ "$CLAUDE_FIRST_LINE" =~ "Claude Flow Novice" ]]; then
    echo "✅ PASS: CLAUDE.md has valid content"
else
    echo "❌ FAIL: CLAUDE.md content invalid"
    echo "   First line: $CLAUDE_FIRST_LINE"
    docker rmi "$IMAGE_NAME"
    exit 1
fi

# Cleanup
echo ""
echo "8. Cleanup..."
docker rmi "$IMAGE_NAME"

echo ""
echo "=========================================="
echo "✅ ALL TESTS PASSED"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - CLAUDE.md: included and valid"
echo "  - Agent files: ${AGENT_COUNT} files"
echo "  - Skill files: ${SKILL_COUNT} files"
echo "  - README.md: included"
echo "  - docs/: excluded"
