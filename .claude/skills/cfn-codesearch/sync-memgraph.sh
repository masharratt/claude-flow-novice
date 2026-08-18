#!/usr/bin/env bash
# Sync existing SQLite entities into Memgraph.
# Uses UNWIND batches for speed (~720 queries instead of ~360k).
# Use after bulk indexing with --skip-memgraph.

set -euo pipefail

INDEX_DB="${HOME}/.local/share/codesearch/index_v2.db"
MEMGRAPH_HOST="${MEMGRAPH_HOST:-localhost}"
MEMGRAPH_PORT="${MEMGRAPH_PORT:-7689}"
PROJECT_ROOT="${1:-$(pwd)}"
BATCH_SIZE="${BATCH_SIZE:-500}"
LOG="/tmp/sync-memgraph.log"

if [ ! -f "$INDEX_DB" ]; then
    echo "ERROR: Index DB not found at $INDEX_DB"
    exit 1
fi

# Detect Cypher client
MEMGRAPH_CONTAINER="${MEMGRAPH_CONTAINER:-codesearch-memgraph}"
CYPHER_CMD=""
if command -v mgconsole >/dev/null 2>&1; then
    CYPHER_CMD="mgconsole --host $MEMGRAPH_HOST --port $MEMGRAPH_PORT"
elif command -v cypher-shell >/dev/null 2>&1; then
    CYPHER_CMD="cypher-shell -a bolt://$MEMGRAPH_HOST:$MEMGRAPH_PORT -u '' -p ''"
elif docker exec "$MEMGRAPH_CONTAINER" mgconsole --version >/dev/null 2>&1; then
    CYPHER_CMD="docker exec -i $MEMGRAPH_CONTAINER mgconsole"
else
    echo "ERROR: No Cypher client found (need mgconsole, cypher-shell, or docker container '$MEMGRAPH_CONTAINER')"
    exit 1
fi

run_cypher() {
    echo "$1" | $CYPHER_CMD 2>/dev/null
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

# Test connection
if ! run_cypher "RETURN 1;" >/dev/null 2>&1; then
    echo "ERROR: Cannot connect to Memgraph at $MEMGRAPH_HOST:$MEMGRAPH_PORT"
    exit 1
fi

log "Syncing SQLite -> Memgraph for project: $PROJECT_ROOT"

# Get counts
file_count=$(sqlite3 "$INDEX_DB" "SELECT COUNT(DISTINCT file_path) FROM entities WHERE project_root = '$PROJECT_ROOT';")
entity_count=$(sqlite3 "$INDEX_DB" "SELECT COUNT(*) FROM entities WHERE project_root = '$PROJECT_ROOT';")
ref_count=$(sqlite3 "$INDEX_DB" "SELECT COUNT(*) FROM refs WHERE source_entity_id IN (SELECT id FROM entities WHERE project_root = '$PROJECT_ROOT');")

log "Found: $file_count files, $entity_count entities, $ref_count refs"

# Create indexes
run_cypher "CREATE INDEX ON :File(path);" 2>/dev/null || true
run_cypher "CREATE INDEX ON :Entity(id);" 2>/dev/null || true
run_cypher "CREATE INDEX ON :Entity(name);" 2>/dev/null || true
run_cypher "CREATE INDEX ON :Project(root_path);" 2>/dev/null || true

# Create project node
run_cypher "MERGE (p:Project {root_path: '$PROJECT_ROOT'}) SET p.name = '$(basename "$PROJECT_ROOT")';" || true

# --- BATCH SYNC FILES ---
log "Syncing files in batches of $BATCH_SIZE..."
offset=0
files_synced=0

while true; do
    # Build UNWIND list from SQLite batch
    batch_json=$(sqlite3 -json "$INDEX_DB" \
        "SELECT DISTINCT file_path AS path,
                REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '.', '')), '') AS ext
         FROM entities
         WHERE project_root = '$PROJECT_ROOT'
         ORDER BY file_path
         LIMIT $BATCH_SIZE OFFSET $offset;" 2>/dev/null)

    # Check if empty
    [ "$batch_json" = "[]" ] || [ -z "$batch_json" ] && break

    # Convert JSON array to Cypher list of maps
    cypher_list=$(echo "$batch_json" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
parts = []
for r in rows:
    p = r['path'].replace(\"'\", \"\\\\'\")
    e = r['ext'].replace(\"'\", \"\\\\'\")
    parts.append('{' + f\"path: '{p}', ext: '{e}'\" + '}')
print('[' + ', '.join(parts) + ']')
")

    run_cypher "
        UNWIND $cypher_list AS f
        MERGE (file:File {path: f.path, project_root: '$PROJECT_ROOT'})
        SET file.language = f.ext;
    " || log "WARN: file batch at offset $offset failed"

    batch_count=$(echo "$batch_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    files_synced=$((files_synced + batch_count))
    offset=$((offset + BATCH_SIZE))
    log "  Files: $files_synced / $file_count"
done

log "Files synced: $files_synced"

# --- BATCH SYNC ENTITIES ---
log "Syncing entities in batches of $BATCH_SIZE..."
offset=0
entities_synced=0

while true; do
    batch_json=$(sqlite3 -json "$INDEX_DB" \
        "SELECT id, name, kind, signature, visibility, file_path, line_number
         FROM entities
         WHERE project_root = '$PROJECT_ROOT'
         ORDER BY id
         LIMIT $BATCH_SIZE OFFSET $offset;" 2>/dev/null)

    [ "$batch_json" = "[]" ] || [ -z "$batch_json" ] && break

    # Convert to Cypher-safe list
    cypher_list=$(echo "$batch_json" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
parts = []
for r in rows:
    eid = r['id']
    name = r['name'].replace(\"'\", \"\\\\'\").replace('\\\\', '\\\\\\\\')
    kind = r['kind'].replace(\"'\", \"\\\\'\")
    sig = (r['signature'] or '').replace(\"'\", \"\\\\'\").replace('\\\\', '\\\\\\\\')
    vis = (r['visibility'] or 'unknown').replace(\"'\", \"\\\\'\")
    fp = r['file_path'].replace(\"'\", \"\\\\'\")
    ln = r['line_number'] or 0
    parts.append('{' + f\"id: {eid}, name: '{name}', kind: '{kind}', sig: '{sig}', vis: '{vis}', fp: '{fp}', ln: {ln}\" + '}')
print('[' + ', '.join(parts) + ']')
")

    # MERGE entities
    run_cypher "
        UNWIND $cypher_list AS e
        MERGE (ent:Entity {id: e.id, project_root: '$PROJECT_ROOT'})
        SET ent.name = e.name, ent.kind = e.kind, ent.signature = e.sig,
            ent.visibility = e.vis, ent.file_path = e.fp, ent.line_number = e.ln;
    " || log "WARN: entity MERGE batch at offset $offset failed"

    # Create CONTAINS edges (file -> entity)
    run_cypher "
        UNWIND $cypher_list AS e
        MATCH (f:File {path: e.fp, project_root: '$PROJECT_ROOT'})
        MATCH (ent:Entity {id: e.id, project_root: '$PROJECT_ROOT'})
        MERGE (f)-[:CONTAINS]->(ent);
    " || log "WARN: CONTAINS batch at offset $offset failed"

    batch_count=$(echo "$batch_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    entities_synced=$((entities_synced + batch_count))
    offset=$((offset + BATCH_SIZE))

    if [ $((entities_synced % 5000)) -lt $BATCH_SIZE ]; then
        log "  Entities: $entities_synced / $entity_count"
    fi
done

log "Entities synced: $entities_synced"

# --- BATCH SYNC REFERENCES ---
log "Syncing references in batches of $BATCH_SIZE..."
offset=0
refs_synced=0

while true; do
    batch_json=$(sqlite3 -json "$INDEX_DB" \
        "SELECT r.id, r.file_path, r.line_number, r.ref_kind, r.source_entity_id, r.target_name
         FROM refs r
         WHERE r.source_entity_id IN (SELECT id FROM entities WHERE project_root = '$PROJECT_ROOT')
         ORDER BY r.id
         LIMIT $BATCH_SIZE OFFSET $offset;" 2>/dev/null)

    [ "$batch_json" = "[]" ] || [ -z "$batch_json" ] && break

    # Group by ref_kind (Cypher can't parameterize relationship types)
    # Process each kind separately
    for ref_kind in "call" "import" "use" "extend" "implement" "reference"; do
        rel_type=$(echo "$ref_kind" | python3 -c "
import sys
k = sys.stdin.read().strip()
mapping = {'call': 'CALLS', 'import': 'IMPORTS', 'use': 'USES', 'extend': 'EXTENDS', 'implement': 'IMPLEMENTS', 'reference': 'REFERENCES'}
print(mapping.get(k, 'REFERENCES'))
")

        kind_list=$(echo "$batch_json" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
kind = '$ref_kind'
parts = []
for r in rows:
    if (r.get('ref_kind') or 'reference') != kind:
        continue
    src = r['source_entity_id']
    tgt = (r['target_name'] or '').replace(\"'\", \"\\\\'\").replace('\\\\', '\\\\\\\\')
    fp = (r['file_path'] or '').replace(\"'\", \"\\\\'\")
    ln = r.get('line_number') or 0
    if not tgt:
        continue
    parts.append('{' + f\"src: {src}, tgt: '{tgt}', fp: '{fp}', ln: {ln}\" + '}')
if parts:
    print('[' + ', '.join(parts) + ']')
else:
    print('')
")

        [ -z "$kind_list" ] && continue

        run_cypher "
            UNWIND $kind_list AS r
            MATCH (src:Entity {id: r.src, project_root: '$PROJECT_ROOT'})
            MATCH (tgt:Entity {name: r.tgt, project_root: '$PROJECT_ROOT'})
            MERGE (src)-[:${rel_type} {file_path: r.fp, line: r.ln}]->(tgt);
        " 2>/dev/null || true
    done

    batch_count=$(echo "$batch_json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
    refs_synced=$((refs_synced + batch_count))
    offset=$((offset + BATCH_SIZE))

    if [ $((refs_synced % 500)) -lt $BATCH_SIZE ] || [ "$refs_synced" -eq "$batch_count" ]; then
        log "  Refs: $refs_synced / $ref_count"
    fi
done

log "Done: $files_synced files, $entities_synced entities, $refs_synced refs synced to Memgraph"

# Final stats
echo ""
echo "=== Memgraph Stats ==="
run_cypher "MATCH (n) RETURN labels(n) AS label, count(*) AS count;" 2>/dev/null || true
echo ""
run_cypher "MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS count;" 2>/dev/null || true
