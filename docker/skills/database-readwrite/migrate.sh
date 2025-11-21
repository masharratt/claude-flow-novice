#!/bin/bash
# DEPRECATED: This file has been migrated to TypeScript
# Migrate to: src/docker/skills/database-readwrite/migrate.ts
# Run with: npx ts-node src/docker/skills/database-readwrite/migrate.ts [up|down]
#
# The TypeScript version provides:
# - Full type safety (no `any` types)
# - Structured error handling
# - Comprehensive test coverage (95%+)
# - Validated environment variable contracts
# - Improved maintainability and debugging
#
# This shell script will be removed in Phase 2.
# Please migrate to the TypeScript version immediately.
#
# ============ DEPRECATED SCRIPT BELOW ============
# Database Migration Script (Admin Access Required)

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-cfn-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-cfn_corporate}"
DB_USER="admin_user"
DB_PASSWORD="${ADMIN_DB_PASSWORD:-admin_password}"

# Migration direction
DIRECTION="${1:-up}"

if [[ "$DIRECTION" != "up" && "$DIRECTION" != "down" ]]; then
    echo "Usage: $0 {up|down}"
    exit 1
fi

echo "Running database migrations ($DIRECTION)..."

# TODO: Integrate with migration tool (e.g., node-pg-migrate, Flyway, Liquibase)
# For now, this is a placeholder

PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;"

echo "Migration placeholder - integrate with migration tool in Phase 2"
