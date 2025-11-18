#!/bin/bash
# Redis Cleanup Verification Script
#
# Quick health check for Redis cleanup mechanisms
# Run this anytime to verify no process leaks or memory issues

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"

# Counters
ISSUES_FOUND=0

echo "======================================"
echo "Redis Cleanup Verification"
echo "======================================"
echo ""
echo "Configuration:"
echo "  Redis: $REDIS_HOST:$REDIS_PORT"
echo "  Date: $(date)"
echo ""

# Test 1: Redis connectivity
echo "1. Checking Redis connectivity..."
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo -e "   ${GREEN}✓${NC} Redis is reachable"
else
    echo -e "   ${RED}✗${NC} Cannot connect to Redis"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Test 2: Process leak detection
echo ""
echo "2. Checking for redis-cli process leaks..."
REDIS_CLI_COUNT=$(pgrep -f "redis-cli" | wc -l || echo "0")
if [ "$REDIS_CLI_COUNT" -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} No redis-cli processes found (expected)"
else
    echo -e "   ${YELLOW}⚠${NC}  Found $REDIS_CLI_COUNT redis-cli processes"
    ps aux | grep "redis-cli" | grep -v grep
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Test 3: Redis memory usage
echo ""
echo "3. Checking Redis memory usage..."
REDIS_MEMORY=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" info memory 2>/dev/null | grep "used_memory_human:" | cut -d: -f2 | tr -d '\r\n' || echo "unknown")
echo "   Memory used: $REDIS_MEMORY"

# Extract numeric value (handle M/K/G suffixes)
MEMORY_NUM=$(echo "$REDIS_MEMORY" | grep -oE '[0-9]+' | head -1)
MEMORY_UNIT=$(echo "$REDIS_MEMORY" | grep -oE '[A-Z]' | head -1)

if [ "$MEMORY_UNIT" = "G" ]; then
    # Over 1 GB is concerning
    echo -e "   ${RED}⚠${NC}  High memory usage (>1 GB)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
elif [ "$MEMORY_UNIT" = "M" ] && [ "$MEMORY_NUM" -gt 500 ]; then
    # Over 500 MB is a warning
    echo -e "   ${YELLOW}⚠${NC}  Elevated memory usage (>500 MB)"
else
    echo -e "   ${GREEN}✓${NC} Memory usage is normal"
fi

# Test 4: Keys without TTL
echo ""
echo "4. Checking for keys without TTL..."
NO_TTL_COUNT=0

# Check message keys
MESSAGE_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:messages" 2>/dev/null | wc -l || echo "0")
if [ "$MESSAGE_KEYS" -gt 0 ]; then
    while read -r key; do
        if [ -z "$key" ]; then continue; fi
        TTL=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ttl "$key" 2>/dev/null || echo "-2")
        if [ "$TTL" -eq -1 ]; then
            echo -e "   ${YELLOW}⚠${NC}  No TTL: $key"
            NO_TTL_COUNT=$((NO_TTL_COUNT + 1))
        fi
    done < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:messages" 2>/dev/null)
fi

# Check fork keys
FORK_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:fork:*:messages" 2>/dev/null | wc -l || echo "0")
if [ "$FORK_KEYS" -gt 0 ]; then
    while read -r key; do
        if [ -z "$key" ]; then continue; fi
        TTL=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ttl "$key" 2>/dev/null || echo "-2")
        if [ "$TTL" -eq -1 ]; then
            echo -e "   ${YELLOW}⚠${NC}  No TTL: $key"
            NO_TTL_COUNT=$((NO_TTL_COUNT + 1))
        fi
    done < <(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:fork:*:messages" 2>/dev/null)
fi

if [ "$NO_TTL_COUNT" -eq 0 ]; then
    echo -e "   ${GREEN}✓${NC} All keys have TTL"
else
    echo -e "   ${RED}✗${NC} $NO_TTL_COUNT keys without TTL"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Test 5: Key count
echo ""
echo "5. Checking key counts..."
TOTAL_MESSAGE_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:messages" 2>/dev/null | wc -l || echo "0")
TOTAL_FORK_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:fork:*" 2>/dev/null | wc -l || echo "0")
TOTAL_RESULT_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" keys "swarm:*:*:result:*" 2>/dev/null | wc -l || echo "0")

echo "   Message keys: $TOTAL_MESSAGE_KEYS"
echo "   Fork keys: $TOTAL_FORK_KEYS"
echo "   Result keys: $TOTAL_RESULT_KEYS"

if [ "$TOTAL_MESSAGE_KEYS" -gt 100 ]; then
    echo -e "   ${YELLOW}⚠${NC}  High message key count (>100)"
fi

# Test 6: Node.js processes
echo ""
echo "6. Checking Node.js processes..."
NODE_COUNT=$(pgrep -f "node" | wc -l || echo "0")
echo "   Node.js processes: $NODE_COUNT"

if [ "$NODE_COUNT" -gt 20 ]; then
    echo -e "   ${YELLOW}⚠${NC}  High Node.js process count (>20)"
    echo "   Top 5 by memory:"
    ps aux | grep -E "node|ts-node" | grep -v grep | sort -k4 -rn | head -5
fi

# Summary
echo ""
echo "======================================"
echo "Summary"
echo "======================================"

if [ "$ISSUES_FOUND" -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed - No issues found${NC}"
    echo ""
    echo "Redis cleanup is working correctly."
    exit 0
else
    echo -e "${RED}✗ Found $ISSUES_FOUND issue(s)${NC}"
    echo ""
    echo "Recommended actions:"

    if [ "$REDIS_CLI_COUNT" -gt 0 ]; then
        echo "  - Kill redis-cli processes: pkill -f redis-cli"
    fi

    if [ "$NO_TTL_COUNT" -gt 0 ]; then
        echo "  - Set TTL on keys without expiration"
        echo "    node -e \"const { setMessageListTTL } = require('./dist/cli/conversation-fork-cleanup.js'); setMessageListTTL('task-id', 'agent-id', 86400);\""
    fi

    if [ "$MEMORY_NUM" -gt 500 ] && [ "$MEMORY_UNIT" = "M" ]; then
        echo "  - Consider emergency cleanup (WARNING: deletes all conversation history)"
        echo "    node -e \"const { emergencyCleanupAll } = require('./dist/cli/conversation-fork-cleanup.js'); emergencyCleanupAll();\""
    fi

    echo ""
    echo "For detailed analysis, run:"
    echo "  ./tests/test-memory-leak-task-mode.sh"

    exit 1
fi
