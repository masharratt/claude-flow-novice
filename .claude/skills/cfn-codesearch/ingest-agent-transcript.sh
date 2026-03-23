#!/bin/bash
# ingest-agent-transcript.sh - Extract and index agent transcript data for CodeSearch
#
# Purpose: Process agent transcripts to extract searchable decision points,
#          tool usage patterns, and failure contexts for future semantic search.
#
# Usage:
#   ./ingest-agent-transcript.sh \
#     --transcript FILE \
#     --agent-id ID \
#     --agent-type TYPE \
#     --task-id TASK \
#     --success true/false

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
DB_PATH="${PROJECT_ROOT}/.claude/skills/cfn-redis-coordination/data/cfn-loop.db"
LOG_PATH="${PROJECT_ROOT}/.artifacts/logs/codesearch-ingestion.log"

# Ensure dependencies exist
mkdir -p "$(dirname "$LOG_PATH")"

# ============================================================================
# Parse Arguments
# ============================================================================

TRANSCRIPT=""
AGENT_ID=""
AGENT_TYPE=""
TASK_ID=""
SUCCESS="true"

while [[ $# -gt 0 ]]; do
    case $1 in
        --transcript)
            TRANSCRIPT="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --agent-type)
            AGENT_TYPE="$2"
            shift 2
            ;;
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --success)
            SUCCESS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$TRANSCRIPT" ] || [ -z "$AGENT_ID" ] || [ -z "$AGENT_TYPE" ]; then
    echo "Error: Missing required parameters"
    echo "Usage: $0 --transcript FILE --agent-id ID --agent-type TYPE [--task-id TASK] [--success true/false]"
    exit 1
fi

if [ ! -f "$TRANSCRIPT" ]; then
    echo "Error: Transcript file not found: $TRANSCRIPT" | tee -a "$LOG_PATH"
    exit 1
fi

echo "[CodeSearch] Starting transcript ingestion for $AGENT_ID ($AGENT_TYPE)" | tee -a "$LOG_PATH"

# ============================================================================
# Initialize Schema Extensions
# ============================================================================

# Create extended schema for agent lifecycle data in CodeSearch
sqlite3 "$DB_PATH" <<'EOF'
-- Agent transcript embeddings table
CREATE TABLE IF NOT EXISTS agent_transcripts (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    task_id TEXT,
    snippet TEXT NOT NULL,
    snippet_type TEXT,                    -- decision, tool_use, error, recovery
    embedding BLOB,                       -- placeholder for vector embedding
    metadata TEXT,                        -- JSON: tool, outcome, timestamp, line_number
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent failure patterns table
CREATE TABLE IF NOT EXISTS agent_failure_patterns (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    failure_mode TEXT NOT NULL,
    root_cause TEXT,
    recovery_strategy TEXT,
    embedding BLOB,
    occurrence_count INTEGER DEFAULT 1,
    last_seen TIMESTAMP,
    resolution_rate REAL DEFAULT 0.0,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_transcripts_agent_id ON agent_transcripts(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_transcripts_agent_type ON agent_transcripts(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_transcripts_task_id ON agent_transcripts(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_transcripts_type ON agent_transcripts(snippet_type);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_agent_type ON agent_failure_patterns(agent_type);
CREATE INDEX IF NOT EXISTS idx_failure_patterns_mode ON agent_failure_patterns(failure_mode);
EOF

echo "[CodeSearch] Schema initialized" | tee -a "$LOG_PATH"

# ============================================================================
# Extract Decision Points and Tool Usage from Transcript
# ============================================================================

# Parse JSONL transcript and extract meaningful snippets
# Decision points: where agents make choices about approach
# Tool usage: sequences of tool calls and their contexts
# Errors: failure modes and recovery attempts

SNIPPETS_EXTRACTED=0
LINE_NUM=0

while IFS= read -r line; do
    LINE_NUM=$((LINE_NUM + 1))

    # Skip empty lines
    [ -z "$line" ] && continue

    # Extract tool usage events
    if echo "$line" | grep -q '"type":"tool_use"'; then
        TOOL_NAME=$(echo "$line" | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

        # Generate snippet ID
        SNIPPET_ID="${AGENT_ID}-snippet-${LINE_NUM}"

        # Extract context (truncate to 500 chars for storage)
        SNIPPET=$(echo "$line" | head -c 500)

        # Build metadata JSON
        METADATA=$(cat <<JSON_EOF
{
    "tool": "$TOOL_NAME",
    "outcome": "$SUCCESS",
    "line_number": $LINE_NUM,
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON_EOF
)

        # Store snippet in database (escape single quotes for SQL)
        SNIPPET_ESCAPED=$(echo "$SNIPPET" | sed "s/'/''/g")

        sqlite3 "$DB_PATH" <<SQL_EOF
INSERT OR IGNORE INTO agent_transcripts
(id, agent_id, agent_type, task_id, snippet, snippet_type, metadata)
VALUES (
    '$SNIPPET_ID',
    '$AGENT_ID',
    '$AGENT_TYPE',
    '$TASK_ID',
    '$SNIPPET_ESCAPED',
    'tool_use',
    '$METADATA'
);
SQL_EOF

        SNIPPETS_EXTRACTED=$((SNIPPETS_EXTRACTED + 1))
    fi

    # Extract error patterns if agent failed
    if [ "$SUCCESS" = "false" ]; then
        if echo "$line" | grep -Eq '"(error|Error|ERROR|failed|Failed)"'; then
            SNIPPET_ID="${AGENT_ID}-error-${LINE_NUM}"
            ERROR_SNIPPET=$(echo "$line" | head -c 500)

            METADATA=$(cat <<JSON_EOF
{
    "line_number": $LINE_NUM,
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "agent_type": "$AGENT_TYPE"
}
JSON_EOF
)

            ERROR_SNIPPET_ESCAPED=$(echo "$ERROR_SNIPPET" | sed "s/'/''/g")

            sqlite3 "$DB_PATH" <<SQL_EOF
INSERT OR IGNORE INTO agent_transcripts
(id, agent_id, agent_type, task_id, snippet, snippet_type, metadata)
VALUES (
    '$SNIPPET_ID',
    '$AGENT_ID',
    '$AGENT_TYPE',
    '$TASK_ID',
    '$ERROR_SNIPPET_ESCAPED',
    'error',
    '$METADATA'
);
SQL_EOF

            SNIPPETS_EXTRACTED=$((SNIPPETS_EXTRACTED + 1))
        fi
    fi

done < "$TRANSCRIPT"

echo "[CodeSearch] Extracted $SNIPPETS_EXTRACTED snippets from transcript" | tee -a "$LOG_PATH"

# ============================================================================
# Update Agent Metadata
# ============================================================================

# Mark transcript as processed in main agents table
sqlite3 "$DB_PATH" <<EOF
UPDATE agents
SET metadata = json_set(
    metadata,
    '$.codesearch_processed',
    'true',
    '$.codesearch_snippets',
    $SNIPPETS_EXTRACTED
)
WHERE id = '$AGENT_ID';
EOF

echo "[CodeSearch] Updated agent metadata for $AGENT_ID" | tee -a "$LOG_PATH"

# ============================================================================
# Success Exit
# ============================================================================

echo "[CodeSearch] Transcript ingestion completed successfully" | tee -a "$LOG_PATH"
echo "  Agent: $AGENT_ID ($AGENT_TYPE)"
echo "  Snippets: $SNIPPETS_EXTRACTED"
echo "  Success: $SUCCESS"

exit 0
