#!/usr/bin/env bash
# sync-all-memgraph.sh - Sync all indexed projects from SQLite to Memgraph
# Uses sync-memgraph.py for each project root found in SQLite

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_DB="$HOME/.local/share/codesearch/index_v2.db"
SYNC_SCRIPT="$SCRIPT_DIR/sync-memgraph.py"

if [[ ! -f "$INDEX_DB" ]]; then
    echo "ERROR: Index DB not found at $INDEX_DB"
    exit 1
fi

if [[ ! -f "$SYNC_SCRIPT" ]]; then
    echo "ERROR: sync-memgraph.py not found at $SYNC_SCRIPT"
    exit 1
fi

# Test Memgraph connectivity
if ! echo "RETURN 1;" | docker exec -i codesearch-memgraph mgconsole >/dev/null 2>&1; then
    echo "ERROR: Cannot connect to Memgraph container"
    exit 1
fi

# Get all project roots from SQLite
PROJECTS=$(sqlite3 "$INDEX_DB" "SELECT project_root, COUNT(*) FROM entities GROUP BY project_root ORDER BY COUNT(*) DESC;")

total=0
synced=0

echo "=== Memgraph Sync: All Projects ==="
echo ""

while IFS='|' read -r project_root entity_count; do
    [[ -z "$project_root" ]] && continue
    total=$((total + 1))
    project_name=$(basename "$project_root")
    echo "[$total] $project_name ($entity_count entities)"

    if python3 "$SYNC_SCRIPT" "$project_root" 2>&1 | tail -5; then
        synced=$((synced + 1))
    else
        echo "  WARN: sync failed for $project_root"
    fi
    echo ""
done <<< "$PROJECTS"

echo "=== Done: $synced / $total projects synced ==="

# Final stats
echo ""
echo "=== Memgraph Final Stats ==="
echo "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS cnt;" | docker exec -i codesearch-memgraph mgconsole 2>/dev/null
echo "MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS cnt;" | docker exec -i codesearch-memgraph mgconsole 2>/dev/null
echo "MATCH (p:Project) RETURN p.name AS project, p.root_path AS root;" | docker exec -i codesearch-memgraph mgconsole 2>/dev/null
