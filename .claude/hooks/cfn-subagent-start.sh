#!/bin/bash
# SubagentStart Hook - Claude Code v2.0.43+
# Automatically invoked when Main Chat spawns a Task() agent
#
# High-value features:
# 1. Automatic SQLite lifecycle tracking
# 2. Protocol dependency validation (prevents "consensus on vapor")

set -uo pipefail

# ---------------------------------------------------------------------------
# Hook input.
#
# Claude Code delivers the SubagentStart payload as JSON on stdin:
#   {session_id, transcript_path, cwd, hook_event_name, agent_id, agent_type}
# It does NOT export AGENT_ID/AGENT_TYPE as environment variables. Env vars are
# honoured first purely so the hook stays invokable by hand and from tests.
# ---------------------------------------------------------------------------
HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT=$(cat 2>/dev/null) || HOOK_INPUT=""
fi

json_field() {
    [ -n "$HOOK_INPUT" ] || return 0
    command -v jq >/dev/null 2>&1 || return 0
    printf '%s' "$HOOK_INPUT" | jq -r --arg k "$1" '.[$k] // empty' 2>/dev/null || true
}

AGENT_ID="${AGENT_ID:-$(json_field agent_id)}"
AGENT_TYPE="${AGENT_TYPE:-$(json_field agent_type)}"
# The payload carries no task_id; session_id is the only correlation id
# Claude Code supplies for a spawn.
TASK_ID="${TASK_ID:-$(json_field session_id)}"

AGENT_ID="${AGENT_ID:-unknown}"
AGENT_TYPE="${AGENT_TYPE:-unknown}"
TASK_ID="${TASK_ID:-unknown}"
# The agents table has no separate display name from Claude Code, so mirror the
# canonical spawn_agent() behaviour: name defaults to the agent id.
AGENT_NAME="$AGENT_ID"
SPAWNED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape single quotes for SQL string literals.
sql_escape() { printf '%s' "${1//\'/\'\'}"; }

# Project paths. Lifecycle DB follows the AGENT_LIFECYCLE_DB convention from
# .claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh.
# cfn-redis-coordination is deprecated; the skill dir no longer exists.
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${AGENT_LIFECYCLE_DB:-${PROJECT_ROOT}/data/agent-lifecycle.db}"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/subagent-lifecycle.log"

# Canonical schema. Resolved relative to this script first: hooks/ and skills/
# are siblings in the same .claude tree, so this holds whether the hook is
# invoked via the project copy or the ~/.claude reverse symlink. PROJECT_ROOT
# is per-caller and cannot be used here.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_SQL="$HOOK_DIR/../skills/cfn-agent-lifecycle/lib/audit/schema.sql"
[ -f "$SCHEMA_SQL" ] || SCHEMA_SQL="$HOME/.claude/skills/cfn-agent-lifecycle/lib/audit/schema.sql"

# Ensure directories exist
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$(dirname "$LOG_PATH")"

# ============================================================================
# Feature 1: Automatic SQLite Lifecycle Tracking
# ============================================================================

# Apply the canonical schema. Idempotent, and a no-op against an existing DB.
# This file is the single source of truth shared with the cfn-agent-lifecycle
# skill -- never re-declare the agents table here.
if [ -f "$SCHEMA_SQL" ]; then
    sqlite3 "$DB_PATH" < "$SCHEMA_SQL" 2>>"$LOG_PATH" || \
        echo "[SubagentStart] Warning: schema init failed for $DB_PATH" | tee -a "$LOG_PATH"
else
    echo "[SubagentStart] Warning: canonical schema not found at $SCHEMA_SQL" | tee -a "$LOG_PATH"
fi

# Insert spawn record. Every NOT NULL column (id, name, type, status,
# spawned_at, updated_at) must be supplied or the INSERT aborts with
# "NOT NULL constraint failed: agents.name".
METADATA="{\"source\": \"subagent_start_hook\", \"task_id\": \"$(sql_escape "$TASK_ID")\"}"

if sqlite3 "$DB_PATH" <<EOF 2>>"$LOG_PATH"
INSERT OR REPLACE INTO agents (id, name, type, status, spawned_at, updated_at, metadata)
VALUES (
    '$(sql_escape "$AGENT_ID")',
    '$(sql_escape "$AGENT_NAME")',
    '$(sql_escape "$AGENT_TYPE")',
    'spawned',
    '$SPAWNED_AT',
    '$SPAWNED_AT',
    '$(sql_escape "$METADATA")'
);
EOF
then
    echo "[SubagentStart] Lifecycle tracking: $AGENT_ID ($AGENT_TYPE) spawned at $SPAWNED_AT" | tee -a "$LOG_PATH"
else
    # Never block a spawn on a bookkeeping failure.
    echo "[SubagentStart] Warning: lifecycle insert failed for $AGENT_ID" | tee -a "$LOG_PATH"
fi

# ============================================================================
# Feature 2: Protocol Dependency Validation
# ============================================================================

# Extract phase from agent type (e.g., "loop2-validator" -> "loop2")
if [[ "$AGENT_TYPE" =~ ^loop([0-9]+)- ]]; then
    PHASE="${BASH_REMATCH[1]}"

    # Loop 2 validators must wait for Loop 3 completion
    if [ "$PHASE" = "2" ] && [ "$TASK_ID" != "unknown" ]; then
        LOOP3_COMPLETED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE metadata LIKE '%\"task_id\": \"$(sql_escape "$TASK_ID")\"%' AND type LIKE 'loop3-%' AND status='completed';" 2>>"$LOG_PATH")
        LOOP3_COMPLETED="${LOOP3_COMPLETED:-0}"

        if [ "$LOOP3_COMPLETED" -eq 0 ]; then
            echo "[SubagentStart] ERROR: Loop 2 agent spawned before Loop 3 completion (task: $TASK_ID)" | tee -a "$LOG_PATH"
            echo "WARN: Protocol violation detected - Loop 2 validator spawning before Loop 3 implementers complete"
            echo "This may indicate 'consensus on vapor' anti-pattern"
            # Don't exit 1 - allow spawn but log warning for debugging
        else
            echo "[SubagentStart] Protocol check passed: Loop 3 completed ($LOOP3_COMPLETED agents) before Loop 2 spawn" | tee -a "$LOG_PATH"
        fi
    fi

    # Product Owner must wait for Loop 2 completion
    if [[ "$AGENT_TYPE" =~ product-owner ]] && [ "$TASK_ID" != "unknown" ]; then
        LOOP2_COMPLETED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE metadata LIKE '%\"task_id\": \"$(sql_escape "$TASK_ID")\"%' AND type LIKE 'loop2-%' AND status='completed';" 2>>"$LOG_PATH")
        LOOP2_COMPLETED="${LOOP2_COMPLETED:-0}"

        if [ "$LOOP2_COMPLETED" -eq 0 ]; then
            echo "[SubagentStart] ERROR: Product Owner spawned before Loop 2 completion (task: $TASK_ID)" | tee -a "$LOG_PATH"
            echo "WARN: Protocol violation - Product Owner making decisions before validator review"
            # Don't exit 1 - allow spawn but log warning
        else
            echo "[SubagentStart] Protocol check passed: Loop 2 completed ($LOOP2_COMPLETED agents) before Product Owner spawn" | tee -a "$LOG_PATH"
        fi
    fi
fi

# ============================================================================
# Success Exit
# ============================================================================

echo "[SubagentStart] Hook completed successfully for $AGENT_ID" | tee -a "$LOG_PATH"
exit 0
