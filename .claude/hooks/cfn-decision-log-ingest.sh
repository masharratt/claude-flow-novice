#!/usr/bin/env bash
# SessionStart hook: incremental ingest of session JSONL into the decision log.
#
# This script owns SCHEDULING only. All parsing lives in the skill's ingest.sh,
# which is the single source of truth. An earlier version inlined its own copy
# of the jq program; when ingest.sh was fixed (SQL quote escaping, array-shaped
# user content) the copy kept both bugs and silently dropped messages while
# still advancing the ingest cursor. Never reintroduce a second parser here.
#
# Returns immediately: the sweep is detached so session startup never blocks.

# No `set -e`: this is a fire-and-forget sweep over every project. One
# unreadable session file must not abort the projects that come after it.
set -uo pipefail

SKILL_DIR="${HOME}/.claude/skills/decision-log"
DB_DIR="${HOME}/.claude/decision-log"
DB_PATH="${DB_DIR}/decisions.db"
PROJECTS_DIR="${HOME}/.claude/projects"
LOCK_FILE="${DB_DIR}/ingest.lock"
LOG_FILE="${DB_DIR}/ingest.log"

# Degrade silently: a missing skill or projects dir is not a session failure.
[ -d "$PROJECTS_DIR" ] || exit 0
[ -f "$SKILL_DIR/ingest.sh" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0
command -v sqlite3 >/dev/null 2>&1 || exit 0
command -v flock >/dev/null 2>&1 || exit 0

mkdir -p "$DB_DIR" 2>/dev/null || exit 0

if [ ! -f "$DB_PATH" ]; then
    bash "$SKILL_DIR/init.sh" >/dev/null 2>&1 || exit 0
fi

sweep() {
    # Single writer. Concurrent session starts would otherwise contend on the
    # same SQLite file. Non-blocking: if a sweep is already running it covers
    # the same files, so a second one is redundant, not deferred work.
    flock -n 9 || exit 0

    local proj_dir project session_file
    for proj_dir in "$PROJECTS_DIR"/*/; do
        [ -d "$proj_dir" ] || continue
        project=$(basename "$proj_dir" | sed 's/^-home-[^-]*-projects-//')

        for session_file in "$proj_dir"*.jsonl; do
            [ -f "$session_file" ] || continue
            # ingest.sh early-exits when its cursor is already at EOF, so a
            # current file costs one wc -l and no jq pass.
            bash "$SKILL_DIR/ingest.sh" "$session_file" "$project" || true
        done
    done

    printf '[decision-log] sweep finished %s: %s messages indexed\n' \
        "$(date -Iseconds)" \
        "$(sqlite3 "$DB_PATH" 'SELECT COUNT(*) FROM messages;' 2>/dev/null || echo '?')"
}

# Detach with setsid so the sweep survives this hook process exiting. Log is
# truncated per run: a health check, not an audit trail.
export SKILL_DIR DB_PATH PROJECTS_DIR
setsid bash -c "$(declare -f sweep); sweep 9>'$LOCK_FILE'" \
    >"$LOG_FILE" 2>&1 </dev/null &

exit 0
