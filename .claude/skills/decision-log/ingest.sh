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

# Extract messages via a single jq pass into a batch of SQL INSERTs.
# The jq program lives in its own file (heredoc, quoted delimiter) so it can
# contain literal single quotes: SQLite string literals need them, and inlining
# the program in a bash single-quoted argument would break on the first one.
TMPFILE=$(mktemp /tmp/decision-log-XXXXXX.sql)
JQFILE=$(mktemp /tmp/decision-log-XXXXXX.jq)
trap "rm -f '$TMPFILE' '$JQFILE'" EXIT

cat > "$JQFILE" <<'JQPROG'
# SQLite string literal: wrap in single quotes, double any internal quote.
# Do NOT use @json here: it emits a double-quoted JSON string with backslash
# escapes, which SQLite cannot parse. Any message containing a double quote
# used to blow up the statement (and sometimes the rest of the batch).
def sql: "'" + (tostring | gsub("'"; "''")) + "'";

# Modern session files store user content as an array of blocks; older ones
# store a bare string. Handle both, keeping only text blocks (tool_result
# payloads are machine noise, not conversation).
def text_of:
    if type == "string" then .
    elif type == "array" then ([.[]? | select(.type == "text") | .text] | join("\n"))
    else "" end;

def row($role; $c):
    "INSERT OR IGNORE INTO messages (session_id, project, uuid, role, content, timestamp) VALUES ("
    + ($sid|sql) + ", " + ($proj|sql) + ", " + (.uuid|sql) + ", " + ($role|sql) + ", "
    + ($c | .[0:10000] | sql) + ", " + (.timestamp|sql) + ");";

if .type == "user" then
    (.message.content | text_of) as $c |
    if ($c | length) >= 10 and ($c | test("^<(local-command|command-name)") | not) then
        row("user"; $c)
    else empty end
elif .type == "assistant" then
    (.message.content | text_of) as $c |
    if ($c | length) >= 10 then
        row("assistant"; $c)
    else empty end
else empty end
JQPROG

echo "BEGIN TRANSACTION;" > "$TMPFILE"

tail -n +"$((LAST_LINE + 1))" "$SESSION_FILE" \
    | jq -r --arg sid "$SESSION_ID" --arg proj "$PROJECT" -f "$JQFILE" 2>/dev/null >> "$TMPFILE"

echo "COMMIT;" >> "$TMPFILE"

# Batch insert
sqlite3 "$DB_PATH" < "$TMPFILE" 2>/dev/null

# Update ingest state
sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO ingest_state (session_file, last_line, updated_at) VALUES ('${SESSION_FILE}', ${TOTAL_LINES}, datetime('now'));"

NEW_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages WHERE session_id = '${SESSION_ID}';" 2>/dev/null || echo "?")
echo "[decision-log] Ingested from ${SESSION_ID} (${PROJECT}), total: ${NEW_COUNT}" >&2
