#!/bin/bash

# Simple Agent Audit Trail Script
# Usage: ./simple-audit.sh <agent_id> <agent_type> <confidence> <status>

AGENT_ID="$1"
AGENT_TYPE="$2"
CONFIDENCE="${3:-0.0}"
STATUS="${4:-spawned}"

# Resolve database path relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${SCRIPT_DIR}/../../../claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db"

if [[ -z "$AGENT_ID" || -z "$AGENT_TYPE" ]]; then
    echo "Usage: $0 <agent_id> <agent_type> [confidence] [status]"
    exit 1
fi

# Ensure database directory exists
mkdir -p "$(dirname "$DB_PATH")"

# Create agents table if not exists
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, type TEXT, status TEXT, confidence REAL, spawned_at TEXT, completed_at TEXT, metadata TEXT);" || {
    echo "❌ Failed to initialize database at $DB_PATH" >&2
    exit 1
}

# Escape single quotes for SQL safety
SAFE_AGENT_ID="${AGENT_ID//'/''}"
SAFE_AGENT_TYPE="${AGENT_TYPE//'/''}"

# Record agent activity
case "$STATUS" in
    "spawned")
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata) VALUES ('$SAFE_AGENT_ID', '$SAFE_AGENT_TYPE', 'spawned', datetime('now'), '{\"source\": \"task_mode\"}');" || {
            echo "❌ Failed to record agent spawn" >&2
            exit 1
        }
        ;;
    "completed")
        sqlite3 "$DB_PATH" "UPDATE agents SET status = 'completed', confidence = $CONFIDENCE, completed_at = datetime('now') WHERE id = '$SAFE_AGENT_ID';" || {
            echo "❌ Failed to record agent completion" >&2
            exit 1
        }
        ;;
esac

echo "✅ Agent $AGENT_ID ($AGENT_TYPE) audit recorded: $STATUS"