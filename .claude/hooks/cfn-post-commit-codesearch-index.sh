#!/bin/bash
# Post-commit hook: incrementally update CodeSearch index for changed files.
# - Re-indexes modified/added files
# - Removes entities for deleted files from SQLite + Qdrant + Memgraph
# Runs asynchronously (backgrounded) so commits aren't blocked.

set -euo pipefail

# Structured logging
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"

BINARY="${HOME}/.local/bin/local-codesearch"
INDEX_DB="${HOME}/.local/share/codesearch/index_v2.db"
QDRANT_URL="http://localhost:6334"
QDRANT_REST="http://localhost:6333"
MEMGRAPH_BOLT="localhost:7687"
LOG="/tmp/codesearch-post-commit.log"

# Bail if binary or DB missing
[ -x "$BINARY" ] || exit 0
[ -f "$INDEX_DB" ] || exit 0

# Get project root
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# Load the manifest to know which dirs/types are indexed
MANIFEST="$PROJECT_ROOT/.claude/skills/cfn-codesearch/index-manifest-claude-flow-novice.md"

# File type filter — all types we index
INDEXED_TYPES="rs|py|js|ts|tsx|md|sh|yml|yaml|sql"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"
}

do_update() {
    log "Post-commit index update started"

    # Get files changed in the last commit
    local changed_files deleted_files
    changed_files=$(git diff-tree --no-commit-id --name-status -r HEAD 2>/dev/null | grep -E '^[AMR]' | awk '{print $NF}') || true
    deleted_files=$(git diff-tree --no-commit-id --name-status -r HEAD 2>/dev/null | grep -E '^D' | awk '{print $2}') || true

    # Handle deleted files — remove from SQLite + Qdrant
    if [ -n "$deleted_files" ]; then
        while IFS= read -r file; do
            # Only care about indexed file types
            ext="${file##*.}"
            echo "$ext" | grep -qE "^($INDEXED_TYPES)$" || continue

            log "DELETE: $file"
            cs_log "index:delete" "$file" 1 "post-commit" ""

            # Remove from SQLite
            sqlite3 "$INDEX_DB" "DELETE FROM entity_embeddings WHERE entity_id IN (SELECT id FROM entities WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT');" 2>/dev/null || true
            sqlite3 "$INDEX_DB" "DELETE FROM refs WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT';" 2>/dev/null || true
            sqlite3 "$INDEX_DB" "DELETE FROM entities WHERE file_path = '$file' AND project_root = '$PROJECT_ROOT';" 2>/dev/null || true
            sqlite3 "$INDEX_DB" "DELETE FROM file_hashes WHERE file_path = '$file';" 2>/dev/null || true

            # Remove from Qdrant (filter by file_path payload field)
            if curl -s --max-time 2 "$QDRANT_REST/collections/codesearch_entities" >/dev/null 2>&1; then
                curl -s --max-time 5 -X POST "$QDRANT_REST/collections/codesearch_entities/points/delete" \
                    -H "Content-Type: application/json" \
                    -d "{\"filter\":{\"must\":[{\"key\":\"file_path\",\"match\":{\"value\":\"$file\"}},{\"key\":\"project_root\",\"match\":{\"value\":\"$PROJECT_ROOT\"}}]}}" \
                    >/dev/null 2>&1 || true
            fi

            # Remove from Memgraph (entities + file node + edges)
            local cypher_query="MATCH (e:Entity {file_path: '$file', project_root: '$PROJECT_ROOT'}) DETACH DELETE e; MATCH (f:File {path: '$file', project_root: '$PROJECT_ROOT'}) DETACH DELETE f;"
            if command -v mgconsole >/dev/null 2>&1; then
                echo "$cypher_query" | mgconsole --host "${MEMGRAPH_BOLT%%:*}" --port "${MEMGRAPH_BOLT##*:}" 2>/dev/null || true
            elif command -v cypher-shell >/dev/null 2>&1; then
                echo "$cypher_query" | cypher-shell -a "bolt://$MEMGRAPH_BOLT" -u "" -p "" 2>/dev/null || true
            elif docker exec codesearch-memgraph mgconsole --version >/dev/null 2>&1; then
                echo "$cypher_query" | docker exec -i codesearch-memgraph mgconsole 2>/dev/null || true
            fi
        done <<< "$deleted_files"
    fi

    # Handle modified/added files — collect unique parent dirs
    if [ -n "$changed_files" ]; then
        local dirs_to_index=""
        while IFS= read -r file; do
            ext="${file##*.}"
            echo "$ext" | grep -qE "^($INDEXED_TYPES)$" || continue

            # Get the parent directory (first 2 levels for grouping)
            local dir
            dir=$(dirname "$file")
            dirs_to_index="$dirs_to_index $dir"
        done <<< "$changed_files"

        # Deduplicate directories
        local unique_dirs
        unique_dirs=$(echo "$dirs_to_index" | tr ' ' '\n' | sort -u | grep -v '^$') || true

        if [ -n "$unique_dirs" ]; then
            # Incremental index each directory (no --force, uses hash check)
            while IFS= read -r dir; do
                [ -d "$PROJECT_ROOT/$dir" ] || continue
                log "INDEX: $dir"
                cs_log "index:file" "$dir" 1 "post-commit" ""
                # Include Memgraph if reachable, skip if not
                local memgraph_flag=""
                if ! nc -z "${MEMGRAPH_BOLT%%:*}" "${MEMGRAPH_BOLT##*:}" 2>/dev/null; then
                    memgraph_flag="--skip-memgraph"
                fi
                cd "$PROJECT_ROOT" && "$BINARY" \
                    --project-dir . \
                    --qdrant-url "$QDRANT_URL" \
                    --memgraph-url "bolt://$MEMGRAPH_BOLT" \
                    $memgraph_flag \
                    index \
                    --path "$dir" \
                    --types "$(echo "$INDEXED_TYPES" | tr '|' ',')" \
                    2>>"$LOG" || log "WARN: index failed for $dir"
            done <<< "$unique_dirs"
        fi
    fi

    local changed_count deleted_count
    changed_count=$(echo "$changed_files" | grep -c '.' 2>/dev/null || echo 0)
    deleted_count=$(echo "$deleted_files" | grep -c '.' 2>/dev/null || echo 0)
    log "Post-commit index update done: $changed_count changed, $deleted_count deleted"
    cs_log "index:complete" "" "$changed_count" "post-commit" "$deleted_count deleted"
}

# Run in background so the commit returns immediately
do_update &
