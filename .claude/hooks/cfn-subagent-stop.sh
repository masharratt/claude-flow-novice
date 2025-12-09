#!/bin/bash
# SubagentStop Hook - Claude Code v2.0.43+
# Automatically invoked when Task() agent completes
#
# High-value features:
# 1. Automatic lifecycle completion tracking
# 2. Transcript collection for post-mortem analysis

set -euo pipefail

# Hook input (provided by Claude Code v2.0.42+)
AGENT_ID="${AGENT_ID:-unknown}"
AGENT_TYPE="${AGENT_TYPE:-unknown}"
AGENT_TRANSCRIPT_PATH="${AGENT_TRANSCRIPT_PATH:-}"
TASK_ID="${TASK_ID:-unknown}"
COMPLETED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Project paths
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${PROJECT_ROOT}/.claude/skills/cfn-redis-coordination/data/cfn-loop.db"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/subagent-lifecycle.log"
TRANSCRIPT_DIR="${PROJECT_ROOT}/.artifacts/transcripts"

# Ensure directories exist
mkdir -p "$(dirname "$DB_PATH")"
mkdir -p "$(dirname "$LOG_PATH")"
mkdir -p "$TRANSCRIPT_DIR"

# ============================================================================
# Feature 1: Automatic Lifecycle Completion Tracking
# ============================================================================

# Update completion status in SQLite
sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET
    status = 'completed',
    completed_at = '$COMPLETED_AT'
WHERE id = '$AGENT_ID';
EOF

echo "[SubagentStop] Lifecycle tracking: $AGENT_ID ($AGENT_TYPE) completed at $COMPLETED_AT" | tee -a "$LOG_PATH"

# ============================================================================
# Feature 2: Transcript Collection for Post-Mortem Analysis
# ============================================================================

if [ -n "$AGENT_TRANSCRIPT_PATH" ] && [ -f "$AGENT_TRANSCRIPT_PATH" ]; then
    # Determine transcript archive path
    TRANSCRIPT_ARCHIVE="$TRANSCRIPT_DIR/${AGENT_ID}.jsonl"

    # Copy transcript to archive
    cp "$AGENT_TRANSCRIPT_PATH" "$TRANSCRIPT_ARCHIVE"

    # Update metadata with transcript path
    sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET metadata = json_set(
    metadata,
    '$.transcript_path',
    '$TRANSCRIPT_ARCHIVE'
)
WHERE id = '$AGENT_ID';
EOF

    # Extract key metrics from transcript (tool usage, confidence scores)
    # JSONL format: one JSON object per line
    TOOL_CALLS=$(grep -c '"type":"tool_use"' "$AGENT_TRANSCRIPT_PATH" 2>/dev/null || echo 0)
    LAST_MESSAGE=$(tail -n 1 "$AGENT_TRANSCRIPT_PATH" 2>/dev/null || echo "{}")

    echo "[SubagentStop] Transcript collected: $TRANSCRIPT_ARCHIVE ($TOOL_CALLS tool calls)" | tee -a "$LOG_PATH"

    # Store metrics
    sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET metadata = json_set(
    metadata,
    '$.tool_calls',
    $TOOL_CALLS
)
WHERE id = '$AGENT_ID';
EOF

    # ========================================================================
    # Feature 3: RuVector Transcript Ingestion
    # ========================================================================

    # Ingest transcript data into RuVector for semantic search
    # Determine success flag from agent status/confidence
    AGENT_SUCCESS="true"
    AGENT_CONFIDENCE=$(sqlite3 "$DB_PATH" "SELECT confidence FROM agents WHERE id = '$AGENT_ID';" || echo "0")

    # Consider failure if confidence < 0.70 or metadata indicates failure
    if awk "BEGIN {exit !($AGENT_CONFIDENCE < 0.70)}"; then
        AGENT_SUCCESS="false"
    fi

    # Check metadata for explicit failure flag
    if sqlite3 "$DB_PATH" "SELECT metadata FROM agents WHERE id = '$AGENT_ID';" | grep -q '"success": false'; then
        AGENT_SUCCESS="false"
    fi

    # Call RuVector ingestion script (non-blocking, logs errors)
    RUVECTOR_SCRIPT="${PROJECT_ROOT}/.claude/skills/cfn-local-ruvector-accelerator/ingest-agent-transcript.sh"
    if [ -f "$RUVECTOR_SCRIPT" ]; then
        "$RUVECTOR_SCRIPT" \
            --transcript "$TRANSCRIPT_ARCHIVE" \
            --agent-id "$AGENT_ID" \
            --agent-type "$AGENT_TYPE" \
            --task-id "$TASK_ID" \
            --success "$AGENT_SUCCESS" \
            >> "$LOG_PATH" 2>&1 || {
                echo "[SubagentStop] Warning: RuVector ingestion failed for $AGENT_ID" | tee -a "$LOG_PATH"
            }
        echo "[SubagentStop] RuVector ingestion triggered for $AGENT_ID" | tee -a "$LOG_PATH"
    else
        echo "[SubagentStop] RuVector ingestion script not found, skipping" | tee -a "$LOG_PATH"
    fi

else
    echo "[SubagentStop] No transcript available for $AGENT_ID (path: $AGENT_TRANSCRIPT_PATH)" | tee -a "$LOG_PATH"
fi

# ============================================================================
# Success Exit
# ============================================================================

echo "[SubagentStop] Hook completed successfully for $AGENT_ID" | tee -a "$LOG_PATH"
exit 0
