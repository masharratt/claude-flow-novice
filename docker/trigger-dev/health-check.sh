#!/bin/bash
#
# Health check script for trigger-dev worker container
# Validates dependencies are reachable and responsive
#
# Exit codes:
#   0 = healthy (dependencies accessible)
#   1 = unhealthy (critical dependency unreachable)
#

# Configuration with defaults
REDIS_HOST="${CFN_REDIS_HOST:-redis}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-trigger}"

# Test 1: Redis connectivity (critical for job queue)
if command -v redis-cli &> /dev/null; then
  if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --no-auth-warning ping > /dev/null 2>&1; then
    exit 1
  fi
fi

# Test 2: Database connectivity (critical for data storage)
if command -v pg_isready &> /dev/null; then
  if ! pg_isready -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
    exit 1
  fi
fi

# All critical dependencies are reachable
exit 0
