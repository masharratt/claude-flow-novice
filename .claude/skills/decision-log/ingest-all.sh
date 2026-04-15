#!/bin/bash
# Backfill: ingest all existing session files across all projects
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECTS_DIR="${HOME}/.claude/projects"

if [ ! -d "$PROJECTS_DIR" ]; then
    echo "[decision-log] No projects directory found at $PROJECTS_DIR" >&2
    exit 1
fi

# Initialize DB
bash "$SCRIPT_DIR/init.sh"

TOTAL=0
PROJECTS=0

for project_dir in "$PROJECTS_DIR"/*/; do
    [ ! -d "$project_dir" ] && continue

    PROJECT_NAME=$(basename "$project_dir" | sed 's/^-home-[^-]*-projects-//')
    SESSION_COUNT=0

    for session_file in "$project_dir"*.jsonl; do
        [ ! -f "$session_file" ] && continue

        bash "$SCRIPT_DIR/ingest.sh" "$session_file" "$PROJECT_NAME" 2>/dev/null || true
        SESSION_COUNT=$((SESSION_COUNT + 1))
    done

    if [ "$SESSION_COUNT" -gt 0 ]; then
        PROJECTS=$((PROJECTS + 1))
        TOTAL=$((TOTAL + SESSION_COUNT))
        echo "[decision-log] $PROJECT_NAME: $SESSION_COUNT sessions"
    fi
done

# Stats
DB_PATH="${HOME}/.claude/decision-log/decisions.db"
MSG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages;" 2>/dev/null || echo "0")
USER_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages WHERE role = 'user';" 2>/dev/null || echo "0")
ASST_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM messages WHERE role = 'assistant';" 2>/dev/null || echo "0")

echo ""
echo "[decision-log] Backfill complete"
echo "  Projects: $PROJECTS"
echo "  Sessions: $TOTAL"
echo "  Messages: $MSG_COUNT (user: $USER_COUNT, assistant: $ASST_COUNT)"
