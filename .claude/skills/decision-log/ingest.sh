#!/usr/bin/env bash
# Ingest messages from Claude Code session JSONL files into decision log
# Called by Stop hook or manually to backfill

DB_DIR="${HOME}/.claude/decision-log"
DB_PATH="${DB_DIR}/decisions.db"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Initialize DB if missing
if [ ! -f "$DB_PATH" ]; then
    mkdir -p "$DB_DIR"
    sqlite3 "$DB_PATH" < "$SCRIPT_DIR/schema.sql" 2>/dev/null || true
fi

SESSION_FILE="${1:-}"
PROJECT="${2:-}"

if [ -z "$SESSION_FILE" ] || [ ! -f "$SESSION_FILE" ]; then
    echo "[decision-log] Session file required and must exist" >&2
    exit 1
fi

# Derive project name from path if not provided
if [ -z "$PROJECT" ]; then
    PROJECT=$(basename "$(dirname "$SESSION_FILE")" | sed 's/^-home-[^-]*-projects-//')
fi

SESSION_ID=$(basename "$SESSION_FILE" .jsonl)

# Get last ingested line
LAST_LINE=$(sqlite3 "$DB_PATH" "SELECT last_line FROM ingest_state WHERE session_file = '${SESSION_FILE}';" 2>/dev/null || echo "0")
LAST_LINE=${LAST_LINE:-0}

TOTAL_LINES=$(wc -l < "$SESSION_FILE")

if [ "$LAST_LINE" -ge "$TOTAL_LINES" ]; then
    exit 0
fi

# Extract messages via single jq pass, output as TSV for safe sqlite import
# Format: uuid\trole\tcontent\ttimestamp
TMPFILE=$(mktemp /tmp/decision-log-XXXXXX.sql)
trap "rm -f '$TMPFILE'" EXIT

echo "BEGIN TRANSACTION;" > "$TMPFILE"

tail -n +"$((LAST_LINE + 1))" "$SESSION_FILE" | jq -r --arg sid "$SESSION_ID" --arg proj "$PROJECT" '
    if .type == "user" then
        .message.content as $c |
        if ($c | type) == "string" and ($c | length) >= 10 and ($c | test("^<(local-command|command-name)") | not) then
            "INSERT OR IGNORE INTO messages (session_id, project, uuid, role, content, timestamp) VALUES (\($sid | @json), \($proj | @json), \(.uuid | @json), \"user\", \($c | .[0:10000] | @json), \(.timestamp | @json));"
        else empty end
    elif .type == "assistant" then
        ([.message.content[]? | select(.type == "text") | .text] | join("\n")) as $c |
        if ($c | length) >= 10 then
            "INSERT OR IGNORE INTO messages (session_id, project, uuid, role, content, timestamp) VALUES (\($sid | @json), \($proj | @json), \(.uuid | @json), \"assistant\", \($c | .[0:10000] | @json), \(.timestamp | @json));"
        else empty end
    else empty end
' 2>/dev/null >> "$TMPFILE"

echo "COMMIT;" >> "$TMPFILE"

# Batch insert
sqlite3 "$DB_PATH" < "$TMPFILE" 2>/dev/null

# Update ingest state
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO ingest_state (session_file, last_line, updated_at) VALUES ('${SESSION_FILE}', ${TOTAL_LINES}, datetime('now'));"

NEW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages WHERE session_id = '${SESSION_ID}';" 2>/dev/null || echo "?")
echo "[decision-log] Ingested from ${SESSION_ID} (${PROJECT}), total: ${NEW_COUNT}" >&2
