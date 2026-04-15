#!/usr/bin/env bash
# Initialize the decision log SQLite database with FTS5

DB_DIR="${HOME}/.claude/decision-log"
DB_PATH="${DB_DIR}/decisions.db"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$DB_DIR"
sqlite3 "$DB_PATH" < "$SCRIPT_DIR/schema.sql"
echo "[decision-log] Database initialized at $DB_PATH"
