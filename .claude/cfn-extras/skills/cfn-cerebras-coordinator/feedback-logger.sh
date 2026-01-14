#!/bin/bash
set -euo pipefail

# Feedback logger for learning from generation results
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
CODESEARCH_INDEX="${CODESEARCH_INDEX_PATH:-./.claude/skills/cfn-codesearch/data}"

# Parse arguments
GENERATION_ID=""
AGENT_ID=""
FILE_PATH=""
SUCCESS=""
ERROR_MESSAGE=""
TEST_OUTPUT=""
PERFORMANCE_MS=""
LEARNINGS=""
FEEDBACK_TYPE="generation"

while [[ $# -gt 0 ]]; do
    case $1 in
        --generation-id) GENERATION_ID="$2"; shift 2 ;;
        --agent-id) AGENT_ID="$2"; shift 2 ;;
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --success) SUCCESS="$2"; shift 2 ;;
        --error-message) ERROR_MESSAGE="$2"; shift 2 ;;
        --test-output) TEST_OUTPUT="$2"; shift 2 ;;
        --performance-ms) PERFORMANCE_MS="$2"; shift 2 ;;
        --learnings) LEARNINGS="$2"; shift 2 ;;
        --feedback-type) FEEDBACK_TYPE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Required arguments
if [[ -z "${AGENT_ID:-}" || -z "${FILE_PATH:-}" || -z "${SUCCESS:-}" ]]; then
    echo "Usage: $0 --agent-id <id> --file-path <path> --success <true|false> [options]"
    echo "Options:"
    echo "  --generation-id <id>      ID of the generation record"
    echo "  --error-message <msg>     Error message if failed"
    echo "  --test-output <output>    Test output/results"
    echo "  --performance-ms <ms>     Performance in milliseconds"
    echo "  --learnings <notes>       Key learnings from this generation"
    echo "  --feedback-type <type>    Type of feedback (generation, review, etc.)"
    exit 1
fi

# Initialize feedback table
sqlite3 "$DB_PATH" <<'EOF' || true
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    generation_id INTEGER,
    agent_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    test_output TEXT,
    performance_ms INTEGER,
    learnings TEXT,
    feedback_type TEXT DEFAULT 'generation',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (generation_id) REFERENCES generations(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_agent ON feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_feedback_success ON feedback(success);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type);
EOF

# Extract file type
FILE_TYPE="${FILE_PATH##*.}"

# Update generation record with feedback
if [[ -n "$GENERATION_ID" ]]; then
    sqlite3 "$DB_PATH" <<EOF
UPDATE generations
SET success = $SUCCESS,
    error_message = $(printf '%s' "$ERROR_MESSAGE" | sed "s/'/''/g"),
    test_output = $(printf '%s' "$TEST_OUTPUT" | sed "s/'/''/g"),
    performance_ms = ${PERFORMANCE_MS:-NULL}
WHERE id = $GENERATION_ID;
EOF
fi

# Insert feedback record
sqlite3 "$DB_PATH" <<EOF
INSERT INTO feedback (
    generation_id,
    agent_id,
    file_path,
    file_type,
    success,
    error_message,
    test_output,
    performance_ms,
    learnings,
    feedback_type
) VALUES (
    ${GENERATION_ID:-NULL},
    '$AGENT_ID',
    '$FILE_PATH',
    '$FILE_TYPE',
    $SUCCESS,
    $(printf '%s' "$ERROR_MESSAGE" | sed "s/'/''/g"),
    $(printf '%s' "$TEST_OUTPUT" | sed "s/'/''/g"),
    ${PERFORMANCE_MS:-NULL},
    $(printf '%s' "$LEARNINGS" | sed "s/'/''/g"),
    '$FEEDBACK_TYPE'
);
EOF

# Extract learnings for CodeSearch
extract_learnings() {
    local pattern_type=""
    local tags=""

    # Determine pattern type
    if [[ "$SUCCESS" == "true" ]]; then
        pattern_type="success_pattern"
        tags="success,$FILE_TYPE,${AGENT_ID##*-}"
    else
        pattern_type="failure_pattern"
        tags="failure,$FILE_TYPE,${AGENT_ID##*-}"

        # Extract error patterns
        if [[ -n "$ERROR_MESSAGE" ]]; then
            # Common error patterns
            if echo "$ERROR_MESSAGE" | grep -qi "compile"; then
                tags="$tags,compilation_error"
            elif echo "$ERROR_MESSAGE" | grep -qi "test"; then
                tags="$tags,test_failure"
            elif echo "$ERROR_MESSAGE" | grep -qi "import\|module"; then
                tags="$tags,import_error"
            fi
        fi
    fi

    # Create learning record
    local learning_content=""
    if [[ -n "$LEARNINGS" ]]; then
        learning_content="$LEARNINGS"
    elif [[ "$SUCCESS" == "true" ]]; then
        learning_content="Successful generation for $FILE_TYPE file by $AGENT_ID"
    else
        learning_content="Failed generation: $ERROR_MESSAGE"
    fi

    # Store in CodeSearch if available
    if [[ -f "$CODESEARCH_INDEX/store.sh" ]]; then
        local metadata=$(cat <<EOF
{
    "type": "$pattern_type",
    "agent_id": "$AGENT_ID",
    "file_type": "$FILE_TYPE",
    "success": $SUCCESS,
    "tags": "$tags",
    "created_at": "$(date -Iseconds)",
    "performance_ms": ${PERFORMANCE_MS:-null}
}
EOF
)

        echo "$learning_content" | \
        "$CODESEARCH_INDEX/store.sh" \
            --metadata "$metadata" \
            --type "$pattern_type" \
            --tags "$tags" \
            2>/dev/null || true
    fi
}

# Process and store learnings
extract_learnings

# Update success statistics
update_statistics() {
    sqlite3 "$DB_PATH" <<'EOF' || true
CREATE TABLE IF NOT EXISTS generation_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    agent_id TEXT NOT NULL,
    file_type TEXT NOT NULL,
    total_generations INTEGER DEFAULT 0,
    successful_generations INTEGER DEFAULT 0,
    avg_performance_ms REAL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, agent_id, file_type)
);

INSERT OR REPLACE INTO generation_stats (
    date,
    agent_id,
    file_type,
    total_generations,
    successful_generations,
    avg_performance_ms
)
SELECT
    CURRENT_DATE,
    agent_id,
    file_type,
    COALESCE(total_generations, 0) + 1,
    COALESCE(successful_generations, 0) + CASE WHEN $SUCCESS = 1 THEN 1 ELSE 0 END,
    COALESCE(avg_performance_ms, 0) * 0.7 + ${PERFORMANCE_MS:-0} * 0.3
FROM (
    SELECT
        agent_id,
        file_type,
        total_generations,
        successful_generations,
        avg_performance_ms
    FROM generation_stats
    WHERE date = CURRENT_DATE AND agent_id = '$AGENT_ID' AND file_type = '$FILE_TYPE'
    UNION ALL
    SELECT
        '$AGENT_ID' as agent_id,
        '$FILE_TYPE' as file_type,
        0 as total_generations,
        0 as successful_generations,
        NULL as avg_performance_ms
) t;
EOF
}

update_statistics

# Return summary
echo "✅ Feedback logged successfully"
echo "   Agent: $AGENT_ID"
echo "   File: $FILE_PATH ($FILE_TYPE)"
echo "   Success: $SUCCESS"
if [[ -n "$PERFORMANCE_MS" ]]; then
    echo "   Performance: ${PERFORMANCE_MS}ms"
fi
if [[ -n "$LEARNINGS" ]]; then
    echo "   Learnings: $LEARNINGS"
fi

# Get recent success rate for context
RECENT_STATS=$(sqlite3 "$DB_PATH" <<EOF
SELECT
    COUNT(*) as total,
    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
    ROUND(COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
FROM feedback
WHERE agent_id = '$AGENT_ID'
AND created_at >= datetime('now', '-7 days');
EOF
)

echo ""
echo "📊 Recent 7-day stats for $AGENT_ID:"
echo "$RECENT_STATS" | column -t -s '|'