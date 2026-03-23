#!/bin/bash

# Simple Agent Audit Trail Script
# Usage: ./simple-audit.sh <agent_id> <agent_type> <confidence> <status>

# Source parameterized query library for SQL injection prevention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../bootstrap/sqlite-params.sh"

AGENT_ID="$1"
AGENT_TYPE="$2"
CONFIDENCE="${3:-0.0}"
STATUS="${4:-spawned}"

# Resolve database path relative to script location
DB_PATH="${SCRIPT_DIR}/../../../claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db"

if [[ -z "$AGENT_ID" || -z "$AGENT_TYPE" ]]; then
    echo "Usage: $0 <agent_id> <agent_type> [confidence] [status]"
    exit 1
fi

# Ensure database directory exists
mkdir -p "$(dirname "$DB_PATH")"

# Create agents table if not exists (schema creation - no user input)
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, type TEXT, status TEXT, confidence REAL, spawned_at TEXT, completed_at TEXT, metadata TEXT);" || {
    echo "❌ Failed to initialize database at $DB_PATH" >&2
    exit 1
}

# Validate confidence (must be numeric)
if [[ ! "$CONFIDENCE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "❌ Invalid confidence value: $CONFIDENCE (must be numeric 0.0-1.0)" >&2
    exit 1
fi

# Record agent activity using parameterized queries
case "$STATUS" in
    "spawned")
        sqlite_upsert "$DB_PATH" \
            "INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata) VALUES (?1, ?2, 'spawned', datetime('now'), '{\"source\": \"task_mode\"}')" \
            "$AGENT_ID" "$AGENT_TYPE" || {
            echo "❌ Failed to record agent spawn" >&2
            exit 1
        }
        ;;
    "completed")
        sqlite_update "$DB_PATH" \
            "UPDATE agents SET status = 'completed', confidence = ?1, completed_at = datetime('now') WHERE id = ?2" \
            "$CONFIDENCE" "$AGENT_ID" || {
            echo "❌ Failed to record agent completion" >&2
            exit 1
        }
        ;;
esac

echo "✅ Agent $AGENT_ID ($AGENT_TYPE) audit recorded: $STATUS"