#!/usr/bin/env bash
# Post-commit hook: incrementally update CodeSearch index for changed files.
# - Re-indexes modified/added files
# - Removes entities for deleted files from SQLite + Qdrant + Memgraph
#
# Design: each commit enqueues its changes (fast), then a single worker drains
# the queue under an flock. Concurrent commits never stack indexers and never
# lose work — a busy worker re-checks the queue and picks up later commits.

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Structured logging
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"

BINARY="${HOME}/.local/bin/local-codesearch"
INDEX_DB="${HOME}/.local/share/codesearch/index_v2.db"
QDRANT_URL="http://localhost:6334"
QDRANT_REST="http://localhost:6333"
# codesearch-memgraph maps bolt to host 7689 (7687 is fireside-memgraph; see
# ~/.claude/references/project-ports.md). Pointing here avoids the wrong-DB hang.
MEMGRAPH_BOLT="localhost:7689"
LOG="/tmp/codesearch-post-commit.log"
LOCK_FILE="/tmp/codesearch-post-commit.lock"
QUEUE_DIR="/tmp/codesearch-queue"

# Bail if binary or DB missing
[ -x "$BINARY" ] || exit 0
[ -f "$INDEX_DB" ] || exit 0

# Get project root
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# File type filter — all types we index
INDEXED_TYPES="rs|py|js|ts|tsx|md|sh|yml|yaml|sql"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

# Enqueue this commit's changes as a job file. Captured at commit time because
# HEAD moves on; the worker may drain long after this hook returns.
# Job format: "D<TAB>file" for deletions, "I<TAB>dir" for dirs to (re)index.
enqueue() {
    mkdir -p "$QUEUE_DIR"

    local changed_files deleted_files
    changed_files=$(git diff-tree --no-commit-id --name-status -r HEAD 2>/dev/null | grep -E '^[AMR]' | awk '{print $NF}') || true
    deleted_files=$(git diff-tree --no-commit-id --name-status -r HEAD 2>/dev/null | grep -E '^D' | awk '{print $2}') || true

    local job
    job="$QUEUE_DIR/$(date +%s%N)-$$.job"
    : > "$job.tmp"

    if [ -n "$deleted_files" ]; then
        while IFS= read -r file; do
            ext="${file##*.}"
            echo "$ext" | grep -qE "^($INDEXED_TYPES)$" || continue
            printf 'D\t%s\n' "$file" >> "$job.tmp"
        done <<< "$deleted_files"
    fi

    if [ -n "$changed_files" ]; then
        while IFS= read -r file; do
            ext="${file##*.}"
            echo "$ext" | grep -qE "^($INDEXED_TYPES)$" || continue
            local dir
            dir=$(dirname "$file")
            # Skip "." (repo root) - reindexing the whole project for a single
            # root-level file change is wasteful (hours, GB of RAM).
            [ "$dir" = "." ] && continue
            printf 'I\t%s\n' "$dir" >> "$job.tmp"
        done <<< "$changed_files"
    fi

    # Only publish a non-empty job (atomic rename)
    if [ -s "$job.tmp" ]; then
        mv "$job.tmp" "$job"
    else
        rm -f "$job.tmp"
    fi
}

delete_file() {
    local file="$1"
    log "DELETE: $file"
    cs_log "index:delete" "$file" 1 "post-commit" ""

    sqlite3 "$INDEX_DB" "DELETE FROM entity_embeddings WHERE entity_id IN (SELECT id FROM entities WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT');" 2>/dev/null || true
    sqlite3 "$INDEX_DB" "DELETE FROM refs WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT';" 2>/dev/null || true
    sqlite3 "$INDEX_DB" "DELETE FROM entities WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT';" 2>/dev/null || true
    sqlite3 "$INDEX_DB" "DELETE FROM file_hashes WHERE file_path = '$file';" 2>/dev/null || true

    if curl -s --max-time 2 "$QDRANT_REST/collections/codesearch_entities" >/dev/null 2>&1; then
        curl -s --max-time 5 -X POST "$QDRANT_REST/collections/codesearch_entities/points/delete" \
            -H "Content-Type: application/json" \
            -d "{\"filter\":{\"must\":[{\"key\":\"file_path\",\"match\":{\"value\":\"$file\"}},{\"key\":\"project_root\",\"match\":{\"value\":\"$PROJECT_ROOT\"}}]}}" \
            >/dev/null 2>&1 || true
    fi

    local cypher_query="MATCH (e:Entity {file_path: '$file', project_root: '$PROJECT_ROOT'}) DETACH DELETE e; MATCH (f:File {path: '$file', project_root: '$PROJECT_ROOT'}) DETACH DELETE f;"
    if command -v mgconsole >/dev/null 2>&1; then
        echo "$cypher_query" | mgconsole --host "${MEMGRAPH_BOLT%%:*}" --port "${MEMGRAPH_BOLT##*:}" 2>/dev/null || true
    elif command -v cypher-shell >/dev/null 2>&1; then
        echo "$cypher_query" | cypher-shell -a "bolt://$MEMGRAPH_BOLT" -u "" -p "" 2>/dev/null || true
    elif docker exec codesearch-memgraph mgconsole --version >/dev/null 2>&1; then
        echo "$cypher_query" | docker exec -i codesearch-memgraph mgconsole 2>/dev/null || true
    fi
}

index_dir() {
    local dir="$1"
    [ -d "$PROJECT_ROOT/$dir" ] || return 0
    log "INDEX: $dir"
    cs_log "index:file" "$dir" 1 "post-commit" ""

    local memgraph_flag=""
    if ! nc -z "${MEMGRAPH_BOLT%%:*}" "${MEMGRAPH_BOLT##*:}" 2>/dev/null; then
        memgraph_flag="--skip-memgraph"
    fi
    # Hard timeout: a single-dir incremental index takes seconds. If a backend
    # is missing/wrong the client blocks forever (futex) — timeout guarantees the
    # indexer dies instead of leaking. 600s is generous for the largest dir.
    # `|| rc=$?` swallows the failure so `set -e` does not abort the drain loop.
    cd "$PROJECT_ROOT" || return 0
    local rc=0
    timeout --signal=KILL "${INDEX_TIMEOUT:-600}" "$BINARY" \
        --project-dir . \
        --qdrant-url "$QDRANT_URL" \
        --memgraph-url "bolt://$MEMGRAPH_BOLT" \
        $memgraph_flag \
        index \
        --path "$dir" \
        --types "$(echo "$INDEXED_TYPES" | tr '|' ',')" \
        2>>"$LOG" || rc=$?
    if [ "$rc" = "137" ]; then
        log "WARN: index TIMED OUT for $dir (backend unreachable?) — killed after ${INDEX_TIMEOUT:-600}s"
    elif [ "$rc" != "0" ]; then
        log "WARN: index failed for $dir (rc=$rc)"
    fi
}

# Drain the queue: aggregate all pending jobs, apply deletes, then index each
# unique dir ONCE. The incremental indexer reads current disk state, so a single
# pass per dir yields the correct final index regardless of commit order.
# Re-checks the queue after each pass to absorb commits that arrived mid-drain.
drain() {
    while :; do
        local jobs
        jobs=$(find "$QUEUE_DIR" -maxdepth 1 -name '*.job' 2>/dev/null | sort) || true
        [ -n "$jobs" ] || break

        # Aggregate across all pending jobs, then dedup.
        local all_deletes all_dirs
        all_deletes=$(cat $jobs 2>/dev/null | grep '^D' | cut -f2- | sort -u | grep -v '^$') || true
        all_dirs=$(cat $jobs 2>/dev/null | grep '^I' | cut -f2- | sort -u | grep -v '^$') || true

        # Consume the jobs we just read (later commits land in new files).
        rm -f $jobs

        if [ -n "$all_deletes" ]; then
            while IFS= read -r file; do delete_file "$file"; done <<< "$all_deletes"
        fi
        if [ -n "$all_dirs" ]; then
            while IFS= read -r dir; do index_dir "$dir"; done <<< "$all_dirs"
        fi
    done
}

do_update() {
    enqueue

    # Single worker: if another drain holds the lock, it will pick up our job.
    # Stale lock (>30min, e.g. a hung indexer) is force-broken.
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        local lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))
        if [ "$lock_age" -gt 1800 ]; then
            log "WARN: lock held >30min, breaking stale lock"
            rm -f "$LOCK_FILE"
            exec 9>"$LOCK_FILE"
            flock -n 9 || { log "SKIP: still locked after break"; exit 0; }
        else
            log "ENQUEUED: active worker will drain (lock age ${lock_age}s)"
            exit 0
        fi
    fi

    log "Post-commit index drain started"
    drain
    log "Post-commit index drain done"
    cs_log "index:complete" "" 0 "post-commit" "drained"
}

# Run in background so the commit returns immediately
do_update &
