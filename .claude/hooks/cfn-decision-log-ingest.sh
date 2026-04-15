#!/usr/bin/env bash
# SessionStart hook: ingest new messages from all session files into decision log
# Runs in background to avoid blocking startup

SKILL_DIR="${HOME}/.claude/skills/decision-log"
DB_DIR="${HOME}/.claude/decision-log"
DB_PATH="${DB_DIR}/decisions.db"
PROJECTS_DIR="${HOME}/.claude/projects"

# Initialize DB if missing
if [ ! -f "$DB_PATH" ]; then
    mkdir -p "$DB_DIR"
    sqlite3 "$DB_PATH" < "$SKILL_DIR/schema.sql" 2>/dev/null || exit 0
fi

# Ingest all session files across all projects
TOTAL_NEW=0
for proj_dir in "$PROJECTS_DIR"/*/; do
    [ ! -d "$proj_dir" ] && continue
    PROJECT=$(basename "$proj_dir" | sed 's/^-home-[^-]*-projects-//')

    for f in "$proj_dir"*.jsonl; do
        [ ! -f "$f" ] && continue
        SESSION_ID=$(basename "$f" .jsonl)
        TOTAL_LINES=$(wc -l < "$f")

        # Check if already fully ingested
        LAST_LINE=$(sqlite3 "$DB_PATH" "SELECT last_line FROM ingest_state WHERE session_file = '${f}';" 2>/dev/null || echo "0")
        LAST_LINE=${LAST_LINE:-0}
        [ "$LAST_LINE" -ge "$TOTAL_LINES" ] && continue

        # Generate SQL batch via jq
        TMPFILE=$(mktemp /tmp/dl-XXXXXX.sql)
        echo "BEGIN TRANSACTION;" > "$TMPFILE"

        tail -n +"$((LAST_LINE + 1))" "$f" | jq -r --arg sid "$SESSION_ID" --arg proj "$PROJECT" '
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
        sqlite3 "$DB_PATH" < "$TMPFILE" 2>/dev/null
        rm -f "$TMPFILE"

        # Update ingest state
        sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO ingest_state (session_file, last_line, updated_at) VALUES ('${f}', ${TOTAL_LINES}, datetime('now'));"
    done
done

MSG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo "?")
echo "[decision-log] Synced. ${MSG_COUNT} messages indexed." >&2
