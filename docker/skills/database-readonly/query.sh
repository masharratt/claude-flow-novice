#!/bin/bash
# DEPRECATED: This file has been migrated to TypeScript
# Migrate to: src/docker/skills/database-readonly/query.ts
# Run with: npx ts-node src/docker/skills/database-readonly/query.ts "SELECT ..."
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
# Database Read-Only Query Script

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-cfn-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-cfn_corporate}"
DB_USER="readonly_user"
DB_PASSWORD="${READONLY_DB_PASSWORD:-readonly_password}"

# Query from argument
QUERY="${1:?Query is required}"

# Validate query (ensure it's read-only)
if echo "$QUERY" | grep -iE '(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)' >/dev/null; then
    echo "ERROR: Write operations are not allowed with read-only access" >&2
    echo "Blocked operations: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE" >&2
    exit 1
fi

# Execute query
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "$QUERY"

# Exit with query status
exit $?
