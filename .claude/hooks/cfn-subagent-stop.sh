#!/bin/bash
# SubagentStop Hook - Claude Code v2.0.43+
# Automatically invoked when Task() agent completes
#
# High-value features:
# 1. Automatic lifecycle completion tracking
# 2. Transcript collection for post-mortem analysis

set -uo pipefail

# ---------------------------------------------------------------------------
# Hook input.
#
# Claude Code delivers the SubagentStop payload as JSON on stdin:
#   {session_id, transcript_path, cwd, hook_event_name, stop_hook_active,
#    agent_id, agent_type, agent_transcript_path, last_assistant_message?}
# It does NOT export AGENT_ID/AGENT_TYPE/AGENT_TRANSCRIPT_PATH as environment
# variables. Env vars are honoured first purely so the hook stays invokable by
# hand and from tests.
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
AGENT_TRANSCRIPT_PATH="${AGENT_TRANSCRIPT_PATH:-$(json_field agent_transcript_path)}"
# The payload carries no task_id; session_id is the only correlation id.
TASK_ID="${TASK_ID:-$(json_field session_id)}"

AGENT_ID="${AGENT_ID:-unknown}"
AGENT_TYPE="${AGENT_TYPE:-unknown}"
TASK_ID="${TASK_ID:-unknown}"
COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Escape single quotes for SQL string literals.
sql_escape() { printf '%s' "${1//\'/\'\'}"; }

# Project paths. Lifecycle DB follows the AGENT_LIFECYCLE_DB convention from
# .claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh.
# cfn-redis-coordination is deprecated; the skill dir no longer exists.
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${AGENT_LIFECYCLE_DB:-${PROJECT_ROOT}/data/agent-lifecycle.db}"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/subagent-lifecycle.log"
TRANSCRIPT_DIR="${PROJECT_ROOT}/.artifacts/transcripts"

# Canonical schema, shared with the cfn-agent-lifecycle skill. Resolved
# relative to this script first: hooks/ and skills/ are siblings in the same
# .claude tree, so this holds whether the hook is invoked via the project copy
# or the ~/.claude reverse symlink.
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_SQL="$HOOK_DIR/../skills/cfn-agent-lifecycle/lib/audit/schema.sql"
[ -f "$SCHEMA_SQL" ] || SCHEMA_SQL="$HOME/.claude/skills/cfn-agent-lifecycle/lib/audit/schema.sql"

# Ensure directories exist
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$(dirname "$LOG_PATH")"
mkdir -p "$TRANSCRIPT_DIR"

# ============================================================================
# Feature 1: Automatic Lifecycle Completion Tracking
# ============================================================================

# Apply the canonical schema so a stop that arrives without a matching start
# (hook registered mid-session, DB rotated) still has tables to write to.
if [ -f "$SCHEMA_SQL" ]; then
    sqlite3 "$DB_PATH" < "$SCHEMA_SQL" 2>>"$LOG_PATH" || \
        echo "[SubagentStop] Warning: schema init failed for $DB_PATH" | tee -a "$LOG_PATH"
fi

ESC_AGENT_ID=$(sql_escape "$AGENT_ID")

# Update completion status in SQLite. updated_at is NOT NULL and must move with
# every write to the row.
if sqlite3 "$DB_PATH" <<EOF 2>>"$LOG_PATH"
UPDATE agents
SET
    status = 'completed',
    completed_at = '$COMPLETED_AT',
    updated_at = '$COMPLETED_AT'
WHERE id = '$ESC_AGENT_ID';
EOF
then
    echo "[SubagentStop] Lifecycle tracking: $AGENT_ID ($AGENT_TYPE) completed at $COMPLETED_AT" | tee -a "$LOG_PATH"
else
    # Never block completion on a bookkeeping failure.
    echo "[SubagentStop] Warning: lifecycle update failed for $AGENT_ID" | tee -a "$LOG_PATH"
fi

# ============================================================================
# Feature 2: Transcript Collection for Post-Mortem Analysis
# ============================================================================

if [ -n "$AGENT_TRANSCRIPT_PATH" ] && [ -f "$AGENT_TRANSCRIPT_PATH" ]; then
    # Determine transcript archive path
    TRANSCRIPT_ARCHIVE="$TRANSCRIPT_DIR/${AGENT_ID}.jsonl"

    # Copy transcript to archive
    cp "$AGENT_TRANSCRIPT_PATH" "$TRANSCRIPT_ARCHIVE"

    # Update metadata with transcript path. COALESCE guards the case where the
    # row was created without metadata -- json_set(NULL, ...) returns NULL and
    # would silently wipe the column.
    sqlite3 "$DB_PATH" <<EOF 2>>"$LOG_PATH" || echo "[SubagentStop] Warning: transcript metadata update failed" | tee -a "$LOG_PATH"
UPDATE agents
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '\$.transcript_path',
    '$(sql_escape "$TRANSCRIPT_ARCHIVE")'
),
    updated_at = '$COMPLETED_AT'
WHERE id = '$ESC_AGENT_ID';
EOF

    # Extract key metrics from transcript (tool usage, confidence scores)
    # JSONL format: one JSON object per line
    TOOL_CALLS=$(grep -c '"type":"tool_use"' "$AGENT_TRANSCRIPT_PATH" 2>/dev/null || echo 0)
    LAST_MESSAGE=$(tail -n 1 "$AGENT_TRANSCRIPT_PATH" 2>/dev/null || echo "{}")

    echo "[SubagentStop] Transcript collected: $TRANSCRIPT_ARCHIVE ($TOOL_CALLS tool calls)" | tee -a "$LOG_PATH"

    # Store metrics
    TOOL_CALLS=$(printf '%s' "$TOOL_CALLS" | tr -dc '0-9')
    TOOL_CALLS="${TOOL_CALLS:-0}"
    sqlite3 "$DB_PATH" <<EOF 2>>"$LOG_PATH" || echo "[SubagentStop] Warning: tool_calls metadata update failed" | tee -a "$LOG_PATH"
UPDATE agents
SET metadata = json_set(
    COALESCE(metadata, '{}'),
    '\$.tool_calls',
    $TOOL_CALLS
),
    updated_at = '$COMPLETED_AT'
WHERE id = '$ESC_AGENT_ID';
EOF

    # ========================================================================
    # Feature 3: CodeSearch Transcript Ingestion
    # ========================================================================

    # Ingest transcript data into CodeSearch for semantic search
    # Determine success flag from agent status/confidence
    AGENT_SUCCESS="true"
    # confidence is nullable, and a stop that lands before any confidence
    # update reads back as an empty string. Treat "no score yet" as neutral
    # rather than feeding an empty expression to awk.
    AGENT_CONFIDENCE=$(sqlite3 "$DB_PATH" "SELECT COALESCE(confidence, '') FROM agents WHERE id = '$ESC_AGENT_ID';" 2>>"$LOG_PATH")

    # Consider failure if a recorded confidence is < 0.70, or metadata says so.
    if [ -n "$AGENT_CONFIDENCE" ] && awk "BEGIN {exit !($AGENT_CONFIDENCE < 0.70)}" 2>/dev/null; then
        AGENT_SUCCESS="false"
    fi

    # Check metadata for explicit failure flag
    if sqlite3 "$DB_PATH" "SELECT metadata FROM agents WHERE id = '$ESC_AGENT_ID';" 2>/dev/null | grep -q '"success": false'; then
        AGENT_SUCCESS="false"
    fi

    # Call CodeSearch ingestion script (non-blocking, logs errors).
    # Resolve via $HOME/.claude/skills/ symlink so the path works from any
    # project, not just claude-flow-novice (PROJECT_ROOT is per-caller).
    CODESEARCH_SCRIPT="$HOME/.claude/skills/cfn-codesearch/ingest-agent-transcript.sh"
    if [ -f "$CODESEARCH_SCRIPT" ]; then
        "$CODESEARCH_SCRIPT" \
            --transcript "$TRANSCRIPT_ARCHIVE" \
            --agent-id "$AGENT_ID" \
            --agent-type "$AGENT_TYPE" \
            --task-id "$TASK_ID" \
            --success "$AGENT_SUCCESS" \
            >> "$LOG_PATH" 2>&1 || {
                echo "[SubagentStop] Warning: CodeSearch ingestion failed for $AGENT_ID" | tee -a "$LOG_PATH"
            }
        echo "[SubagentStop] CodeSearch ingestion triggered for $AGENT_ID" | tee -a "$LOG_PATH"
    else
        echo "[SubagentStop] CodeSearch ingestion script not found, skipping" | tee -a "$LOG_PATH"
    fi

else
    echo "[SubagentStop] No transcript available for $AGENT_ID (path: $AGENT_TRANSCRIPT_PATH)" | tee -a "$LOG_PATH"
fi

# ============================================================================
# Success Exit
# ============================================================================

echo "[SubagentStop] Hook completed successfully for $AGENT_ID" | tee -a "$LOG_PATH"
exit 0
