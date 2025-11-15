#!/bin/bash

# Simple Agent Audit Trail Script
# Usage: ./simple-audit.sh <agent_id> <agent_type> <confidence> <status>

AGENT_ID="$1"
AGENT_TYPE="$2"
CONFIDENCE="${3:-0.0}"
STATUS="${4:-spawned}"

DB_PATH="./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db"

if [[ -z "$AGENT_ID" || -z "$AGENT_TYPE" ]]; then
    echo "Usage: $0 <agent_id> <agent_type> [confidence] [status]"
    exit 1
fi

# Create agents table if not exists
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, type TEXT, status TEXT, confidence REAL, spawned_at TEXT, completed_at TEXT, metadata TEXT);" 2>/dev/null

# Record agent activity
case "$STATUS" in
    "spawned")
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata) VALUES ('$AGENT_ID', '$AGENT_TYPE', 'spawned', datetime('now'), '{\"source\": \"task_mode\"}');"
        ;;
    "completed")
        sqlite3 "$DB_PATH" "UPDATE agents SET status = 'completed', confidence = $CONFIDENCE, completed_at = datetime('now') WHERE id = '$AGENT_ID';"
        ;;
esac

echo "✅ Agent $AGENT_ID ($AGENT_TYPE) audit recorded: $STATUS"