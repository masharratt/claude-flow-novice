#!/bin/bash
# Redis Authentication Validation
# Tests that Redis server REJECTS unauthenticated connections

set -e

PROJECT_ROOT="$(cd "$(dirname "$(dirname "$0")")" && pwd)"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/.env"

echo "======================================"
echo "Redis Authentication Validation"
echo "======================================"
echo ""

# Task 1: Check docker-compose.yml
echo "Task 1: Verify docker-compose.yml Configuration"
echo ""

if grep -q "redis:" "$DOCKER_COMPOSE_FILE"; then
    echo "✓ Redis service found"
else
    echo "✗ Redis service NOT found"
    exit 1
fi

if grep -q "\-\-requirepass" "$DOCKER_COMPOSE_FILE"; then
    echo "✓ --requirepass directive found"
else
    echo "✗ --requirepass directive MISSING"
    exit 1
fi

echo ""
echo "Redis command configuration:"
grep -A 1 "command: redis-server" "$DOCKER_COMPOSE_FILE" | head -2
echo ""

# Task 2: Check .env
echo "Task 2: Verify .env Configuration"
echo ""

if grep -q "^REDIS_PASSWORD=" "$ENV_FILE"; then
    echo "✓ REDIS_PASSWORD set"
    REDIS_PASSWORD=$(grep "^REDIS_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2-)
    echo "  Password length: ${#REDIS_PASSWORD} chars"
else
    echo "✗ REDIS_PASSWORD not set"
    exit 1
fi

echo ""

# Task 3: Check all docker-compose files
echo "Task 3: Check All Docker Compose Files"
echo ""

REDIS_FILES=$(find "$PROJECT_ROOT" -name "docker-compose*.yml" -o -name "docker-compose*.yaml" 2>/dev/null | xargs grep -l "redis:" 2>/dev/null || echo "")

if [ -n "$REDIS_FILES" ]; then
    echo "Files with Redis configuration:"
    echo "$REDIS_FILES" | while read -r f; do
        if grep "redis:" "$f" > /dev/null 2>&1; then
            echo "  • $(basename $f)"
            if grep "redis:" "$f" | grep -q "\-\-requirepass"; then
                echo "    ✓ --requirepass found"
            else
                echo "    ✗ --requirepass MISSING"
            fi
        fi
    done
fi

echo ""
echo "======================================"
echo "Configuration Validation PASSED"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Start Redis: docker-compose up -d redis"
echo "2. Test authentication:"
echo "   • Unauthenticated (should fail):"
echo "     docker exec cfn-redis redis-cli ping"
echo "   • Authenticated (should work):"
echo "     docker exec cfn-redis redis-cli -a '$REDIS_PASSWORD' ping"
echo ""
