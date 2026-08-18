#!/usr/bin/env bash

# Simple Agent Audit Trail Script
# Usage: ./simple-audit.sh <agent_id> <agent_type> <confidence> <status>

# Source parameterized query library for SQL injection prevention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../bootstrap/sqlite-params.sh"

AGENT_ID="$1"
AGENT_TYPE="$2"
CONFIDENCE="${3:-0.0}"
STATUS="${4:-spawned}"

# Lifecycle DB follows the AGENT_LIFECYCLE_DB convention. Default matches
# execute-lifecycle-hook.sh: <repo-root>/data/agent-lifecycle.db.
# cfn-redis-coordination is deprecated.
DB_PATH="${AGENT_LIFECYCLE_DB:-${SCRIPT_DIR}/../../../../../data/agent-lifecycle.db}"

if [[ -z "$AGENT_ID" || -z "$AGENT_TYPE" ]]; then
    echo "Usage: $0 <agent_id> <agent_type> [confidence] [status]"
    exit 1
fi

# Ensure database directory exists
mkdir -p "$(dirname "$DB_PATH")"

# ---------------------------------------------------------------------------
# Schema: apply the canonical schema.sql, never a local DDL copy.
#
# WHY THIS MATTERS (schema poisoning):
# This script used to run its own
#   CREATE TABLE IF NOT EXISTS agents (id, type, status, confidence,
#                                      spawned_at, completed_at, metadata)
# which is a LEGACY 7-column shape missing the NOT NULL `name` and
# `updated_at` columns the canonical schema declares. Because every writer
# uses CREATE TABLE **IF NOT EXISTS**, whichever writer touches a fresh DB
# first wins permanently. If this script won the race, the canonical
# schema.sql applied afterwards became a silent no-op, and every subsequent
# canonical INSERT died with:
#   "table agents has no column named name"
# The failure surfaces far away from the cause, in the hooks, hours later.
# One table definition, one file. Do not re-declare `agents` here.
# ---------------------------------------------------------------------------
SCHEMA_SQL="${SCRIPT_DIR}/schema.sql"
if [[ ! -f "$SCHEMA_SQL" ]]; then
    echo "❌ Canonical schema not found at $SCHEMA_SQL" >&2
    exit 1
fi

sqlite3 "$DB_PATH" < "$SCHEMA_SQL" || {
    echo "❌ Failed to initialize database at $DB_PATH" >&2
    exit 1
}

# Validate confidence (must be numeric)
if [[ ! "$CONFIDENCE" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    echo "❌ Invalid confidence value: $CONFIDENCE (must be numeric 0.0-1.0)" >&2
    exit 1
fi

# Record agent activity using parameterized queries.
#
# Every NOT NULL column in the canonical schema (id, name, type, status,
# spawned_at, updated_at) MUST be supplied or the INSERT aborts with
# "NOT NULL constraint failed: agents.name". `name` mirrors the agent id,
# matching cfn-subagent-start.sh and canonical spawn_agent(). `updated_at`
# moves on every write to the row, on insert and on update alike.
# Timestamps use the same ISO-8601 Z format the hooks write.
NOW_EXPR="strftime('%Y-%m-%dT%H:%M:%SZ','now')"

case "$STATUS" in
    "spawned")
        sqlite_upsert "$DB_PATH" \
            "INSERT OR REPLACE INTO agents (id, name, type, status, spawned_at, updated_at, metadata) VALUES (?1, ?1, ?2, 'spawned', ${NOW_EXPR}, ${NOW_EXPR}, '{\"source\": \"task_mode\"}')" \
            "$AGENT_ID" "$AGENT_TYPE" || {
            echo "❌ Failed to record agent spawn" >&2
            exit 1
        }
        ;;
    "completed")
        sqlite_update "$DB_PATH" \
            "UPDATE agents SET status = 'completed', confidence = ?1, completed_at = ${NOW_EXPR}, updated_at = ${NOW_EXPR} WHERE id = ?2" \
            "$CONFIDENCE" "$AGENT_ID" || {
            echo "❌ Failed to record agent completion" >&2
            exit 1
        }
        ;;
esac

echo "✅ Agent $AGENT_ID ($AGENT_TYPE) audit recorded: $STATUS"