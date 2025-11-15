#!/bin/bash
# Database Read-Write Query Script

set -euo pipefail

# Configuration
DB_HOST="${POSTGRES_HOST:-cfn-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-cfn_corporate}"
DB_USER="admin_user"
DB_PASSWORD="${ADMIN_DB_PASSWORD:-admin_password}"

# Query from argument
QUERY="${1:?Query is required}"

# Log query for audit (to operational_logs if available)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AGENT_ID="${AGENT_ID:-unknown}"
TEAM_ID="${TEAM_ID:-unknown}"

echo "[$TIMESTAMP] [AUDIT] team=$TEAM_ID agent=$AGENT_ID query_length=${#QUERY}" >&2

# Warn on dangerous operations
if echo "$QUERY" | grep -iE '(DROP|TRUNCATE|DELETE\s+FROM\s+\w+\s*;)' >/dev/null; then
    echo "WARNING: Potentially destructive operation detected" >&2
    echo "Query: $QUERY" >&2
fi

# Execute query with full permissions
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "$QUERY"

# Log result
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "[$TIMESTAMP] [AUDIT] Query succeeded" >&2
else
    echo "[$TIMESTAMP] [AUDIT] Query failed with code $EXIT_CODE" >&2
fi

exit $EXIT_CODE
