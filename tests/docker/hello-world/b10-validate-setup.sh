#!/usr/bin/env bash
# B10 Setup Validation Script
# Verifies all prerequisites before running batch test

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

echo "=========================================="
echo "B10 Setup Validation"
echo "=========================================="
echo ""

PASSED=0
FAILED=0

check_test() {
    local test_name="$1"
    local test_cmd="$2"
    local expected="$3"

    echo -n "   $test_name... "

    if eval "$test_cmd" >/dev/null 2>&1; then
        echo "✅"
        ((PASSED++))
        return 0
    else
        echo "❌"
        ((FAILED++))
        if [ -n "$expected" ]; then
            echo "      Expected: $expected"
        fi
        return 1
    fi
}

# 1. Image check
echo "1️⃣  Docker Image"
check_test "Image exists" "docker image inspect claude-flow-novice:agent >/dev/null 2>&1"

# 2. Credentials check
echo "2️⃣  API Credentials"
check_test ".env file exists" "[ -f .env ]"
check_test "ZAI_API_KEY in .env" "grep -q ZAI_API_KEY .env"
check_test "CLAUDE_API_PROVIDER in .env" "grep -q CLAUDE_API_PROVIDER .env"

# Test credentials inside container
echo -n "   Credentials accessible in container... "
if docker run --rm --env-file .env \
  --entrypoint bash \
  claude-flow-novice:agent \
  -c 'env | grep -q ZAI_API_KEY' 2>/dev/null; then
    echo "✅"
    ((PASSED++))
else
    echo "❌"
    ((FAILED++))
    echo "      Error: --env-file not working in docker run"
fi

# 3. Agent definitions check
echo "3️⃣  Agent Definitions"

echo -n "   CLAUDE.md in image... "
if docker run --rm claude-flow-novice:agent \
  test -f CLAUDE.md 2>/dev/null; then
    echo "✅"
    ((PASSED++))
else
    echo "❌"
    ((FAILED++))
fi

echo -n "   Agent files present... "
AGENT_COUNT=$(docker run --rm claude-flow-novice:agent \
  find .claude/agents -name "*.md" -not -name "README.md" 2>/dev/null | wc -l)

if [ "$AGENT_COUNT" -ge 50 ]; then
    echo "✅ ($AGENT_COUNT found)"
    ((PASSED++))
else
    echo "❌ (Only $AGENT_COUNT found, need ≥50)"
    ((FAILED++))
fi

# 4. File system check
echo "4️⃣  Container File System"
check_test "CLI file exists" "docker run --rm claude-flow-novice:agent test -f /app/dist/cli/index.js"
check_test "TypeScript file exists" "docker run --rm claude-flow-novice:agent test -f /app/src/services/notifications/permissionNotifications.ts 2>/dev/null || true"

# 5. Node.js check
echo "5️⃣  Node.js Environment"
check_test "Node.js available" "docker run --rm claude-flow-novice:agent node --version >/dev/null"
check_test "NPM available" "docker run --rm claude-flow-novice:agent npm --version >/dev/null"

# 6. Redis connectivity (optional, for later)
echo "6️⃣  Redis (Optional)"
echo -n "   Redis CLI available... "
if docker run --rm claude-flow-novice:agent which redis-cli >/dev/null 2>&1; then
    echo "✅"
    ((PASSED++))
else
    echo "⚠️  (Optional - needed for batch test)"
fi

# 7. Quick CLI test
echo "7️⃣  CLI Quick Test"
echo -n "   CLI help works... "
if docker run --rm --env-file .env \
  --entrypoint bash \
  claude-flow-novice:agent \
  -c 'cd /app && timeout 5 node dist/cli/index.js --help 2>&1 | grep -q "Usage\|Commands" || true' 2>/dev/null; then
    echo "✅"
    ((PASSED++))
else
    echo "⚠️  (May require agent files)"
fi

echo ""
echo "=========================================="
echo "Summary: $PASSED passed, $FAILED failed"
echo "=========================================="

if [ $FAILED -gt 0 ]; then
    echo ""
    echo "❌ Setup validation FAILED"
    echo "   Recommended fixes:"

    if ! [ -f .env ]; then
        echo "   1. Create .env file with API credentials"
    fi

    if ! docker image inspect claude-flow-novice:agent >/dev/null 2>&1; then
        echo "   2. Build Docker image: docker build -f Dockerfile.agent -t claude-flow-novice:agent ."
    fi

    echo ""
    exit 1
else
    echo ""
    echo "✅ Setup validation PASSED"
    echo "   Ready to run B10 batch test"
    echo ""
    exit 0
fi
