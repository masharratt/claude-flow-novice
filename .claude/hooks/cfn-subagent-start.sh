#!/bin/bash
# SubagentStart Hook - Claude Code v2.0.43+
# Automatically invoked when Main Chat spawns a Task() agent
#
# High-value features:
# 1. Automatic SQLite lifecycle tracking
# 2. Protocol dependency validation (prevents "consensus on vapor")

set -euo pipefail

# Hook input (provided by Claude Code)
AGENT_ID="${AGENT_ID:-unknown}"
AGENT_TYPE="${AGENT_TYPE:-unknown}"
TASK_ID="${TASK_ID:-unknown}"
SPAWNED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Project paths. Lifecycle DB follows the AGENT_LIFECYCLE_DB convention from
# .claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh.
# cfn-redis-coordination is deprecated; the skill dir no longer exists.
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${AGENT_LIFECYCLE_DB:-${PROJECT_ROOT}/data/agent-lifecycle.db}"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/subagent-lifecycle.log"

# Ensure directories exist
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$(dirname "$LOG_PATH")"

# ============================================================================
# Feature 1: Automatic SQLite Lifecycle Tracking
# ============================================================================

# Initialize database schema if needed
sqlite3 "$DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);
EOF

# Insert spawn record
sqlite3 "$DB_PATH" <<EOF
INSERT OR REPLACE INTO agents (id, type, status, spawned_at, metadata)
VALUES (
    '$AGENT_ID',
    '$AGENT_TYPE',
    'spawned',
    '$SPAWNED_AT',
    '{"source": "subagent_start_hook", "task_id": "$TASK_ID"}'
);
EOF

echo "[SubagentStart] Lifecycle tracking: $AGENT_ID ($AGENT_TYPE) spawned at $SPAWNED_AT" | tee -a "$LOG_PATH"

# ============================================================================
# Feature 2: Protocol Dependency Validation
# ============================================================================

# Extract phase from agent type (e.g., "loop2-validator" -> "loop2")
if [[ "$AGENT_TYPE" =~ ^loop([0-9]+)- ]]; then
    PHASE="${BASH_REMATCH[1]}"

    # Loop 2 validators must wait for Loop 3 completion
    if [ "$PHASE" = "2" ] && [ "$TASK_ID" != "unknown" ]; then
        LOOP3_COMPLETED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE metadata LIKE '%\"task_id\": \"$TASK_ID\"%' AND type LIKE 'loop3-%' AND status='completed';")

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
        LOOP2_COMPLETED=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agents WHERE metadata LIKE '%\"task_id\": \"$TASK_ID\"%' AND type LIKE 'loop2-%' AND status='completed';")

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
