#!/usr/bin/env python3
"""
Sync SQLite CodeSearch entities into Memgraph using UNWIND batches.
Generates Cypher with proper escaping via subprocess to mgconsole.
"""

import json
import sqlite3
import subprocess
import sys
import time
import os

INDEX_DB = os.path.expanduser("~/.local/share/codesearch/index_v2.db")
MEMGRAPH_CONTAINER = os.environ.get("MEMGRAPH_CONTAINER", "codesearch-memgraph")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "500"))
PROJECT_ROOT = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()


def cypher_escape(s: str) -> str:
    """Escape a string for Cypher single-quoted literals.
    Handles backslashes, quotes, backticks, newlines, tabs, and null bytes."""
    if s is None:
        return ""
    return (
        s.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace('"', '\\"')
        .replace("`", "\\u0060")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
        .replace("\0", "")
    )


def run_cypher(query: str) -> bool:
    """Run a Cypher query via docker exec mgconsole."""
    try:
        result = subprocess.run(
            ["docker", "exec", "-i", MEMGRAPH_CONTAINER, "mgconsole"],
            input=query,
            capture_output=True,
            text=True,
            timeout=60,
        )
        return result.returncode == 0
    except Exception as e:
        print(f"  WARN: Cypher error: {e}", file=sys.stderr)
        return False


def log(msg: str):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def main():
    if not os.path.exists(INDEX_DB):
        print(f"ERROR: Index DB not found at {INDEX_DB}")
        sys.exit(1)

    # Test connection
    if not run_cypher("RETURN 1;"):
        print(f"ERROR: Cannot connect to Memgraph via container {MEMGRAPH_CONTAINER}")
        sys.exit(1)

    conn = sqlite3.connect(INDEX_DB)
    conn.row_factory = sqlite3.Row

    log(f"Syncing SQLite -> Memgraph for project: {PROJECT_ROOT}")

    # Get counts
    file_count = conn.execute(
        "SELECT COUNT(DISTINCT file_path) FROM entities WHERE project_root = ?",
        (PROJECT_ROOT,),
    ).fetchone()[0]
    entity_count = conn.execute(
        "SELECT COUNT(*) FROM entities WHERE project_root = ?", (PROJECT_ROOT,)
    ).fetchone()[0]
    ref_count = conn.execute(
        "SELECT COUNT(*) FROM refs WHERE source_entity_id IN (SELECT id FROM entities WHERE project_root = ?)",
        (PROJECT_ROOT,),
    ).fetchone()[0]

    log(f"Found: {file_count} files, {entity_count} entities, {ref_count} refs")

    # Create indexes
    for idx in [
        "CREATE INDEX ON :File(path);",
        "CREATE INDEX ON :Entity(id);",
        "CREATE INDEX ON :Entity(name);",
        "CREATE INDEX ON :Project(root_path);",
    ]:
        run_cypher(idx)

    # Project node
    proj_name = cypher_escape(os.path.basename(PROJECT_ROOT))
    proj_root = cypher_escape(PROJECT_ROOT)
    run_cypher(
        f"MERGE (p:Project {{root_path: '{proj_root}'}}) SET p.name = '{proj_name}';"
    )

    # --- SYNC FILES ---
    log(f"Syncing files (batch {BATCH_SIZE})...")
    files_synced = 0
    offset = 0
    while True:
        rows = conn.execute(
            """SELECT DISTINCT file_path,
                      REPLACE(file_path, RTRIM(file_path, REPLACE(file_path, '.', '')), '') AS ext
               FROM entities
               WHERE project_root = ?
               ORDER BY file_path
               LIMIT ? OFFSET ?""",
            (PROJECT_ROOT, BATCH_SIZE, offset),
        ).fetchall()

        if not rows:
            break

        # Build UNWIND list with proper escaping
        items = []
        for r in rows:
            p = cypher_escape(r["file_path"])
            e = cypher_escape(r["ext"])
            items.append(f"{{path: '{p}', ext: '{e}'}}")

        cypher = f"""
            UNWIND [{', '.join(items)}] AS f
            MERGE (file:File {{path: f.path, project_root: '{proj_root}'}})
            SET file.language = f.ext
            WITH file
            MATCH (p:Project {{root_path: '{proj_root}'}})
            MERGE (p)-[:CONTAINS]->(file);
        """
        if not run_cypher(cypher):
            log(f"  WARN: file batch at offset {offset} failed")

        files_synced += len(rows)
        offset += BATCH_SIZE
        if files_synced % 2000 < BATCH_SIZE:
            log(f"  Files: {files_synced} / {file_count}")

    log(f"Files synced: {files_synced}")

    # --- SYNC ENTITIES ---
    log(f"Syncing entities (batch {BATCH_SIZE})...")
    entities_synced = 0
    offset = 0
    start_time = time.time()

    while True:
        rows = conn.execute(
            """SELECT id, name, kind, signature, visibility, file_path, line_number
               FROM entities
               WHERE project_root = ?
               ORDER BY id
               LIMIT ? OFFSET ?""",
            (PROJECT_ROOT, BATCH_SIZE, offset),
        ).fetchall()

        if not rows:
            break

        items = []
        for r in rows:
            eid = r["id"]
            name = cypher_escape(r["name"] or "")
            kind = cypher_escape(r["kind"] or "unknown")
            sig = cypher_escape(r["signature"] or "")
            vis = cypher_escape(r["visibility"] or "unknown")
            fp = cypher_escape(r["file_path"] or "")
            ln = r["line_number"] or 0
            items.append(
                f"{{id: {eid}, name: '{name}', kind: '{kind}', sig: '{sig}', vis: '{vis}', fp: '{fp}', ln: {ln}}}"
            )

        item_list = f"[{', '.join(items)}]"

        # MERGE entities
        cypher = f"""
            UNWIND {item_list} AS e
            MERGE (ent:Entity {{id: e.id, project_root: '{proj_root}'}})
            SET ent.name = e.name, ent.kind = e.kind, ent.signature = e.sig,
                ent.visibility = e.vis, ent.file_path = e.fp, ent.line_number = e.ln;
        """
        ok1 = run_cypher(cypher)

        # DEFINES edges (File defines Entity)
        cypher2 = f"""
            UNWIND {item_list} AS e
            MATCH (f:File {{path: e.fp, project_root: '{proj_root}'}})
            MATCH (ent:Entity {{id: e.id, project_root: '{proj_root}'}})
            MERGE (f)-[:DEFINES]->(ent);
        """
        ok2 = run_cypher(cypher2)

        if not ok1:
            log(f"  WARN: entity MERGE batch at offset {offset} failed")
        if not ok2:
            log(f"  WARN: CONTAINS batch at offset {offset} failed")

        entities_synced += len(rows)
        offset += BATCH_SIZE

        if entities_synced % 5000 < BATCH_SIZE:
            elapsed = time.time() - start_time
            rate = entities_synced / elapsed if elapsed > 0 else 0
            eta = (entity_count - entities_synced) / rate if rate > 0 else 0
            log(
                f"  Entities: {entities_synced} / {entity_count} ({rate:.0f}/s, ETA {eta:.0f}s)"
            )

    log(f"Entities synced: {entities_synced}")

    # --- SYNC REFERENCES ---
    log(f"Syncing references (batch {BATCH_SIZE})...")
    refs_synced = 0
    offset = 0

    kind_to_rel = {
        "calls": "CALLS",
        "call": "CALLS",
        "imports": "IMPORTS",
        "import": "IMPORTS",
        "uses": "USES",
        "use": "USES",
        "extends": "EXTENDS",
        "extend": "EXTENDS",
        "implements": "IMPLEMENTS",
        "implement": "IMPLEMENTS",
        "references": "REFERENCES",
        "reference": "REFERENCES",
    }

    while True:
        rows = conn.execute(
            """SELECT r.id, r.file_path, r.line_number, r.ref_kind, r.source_entity_id, r.target_name
               FROM refs r
               WHERE r.source_entity_id IN (SELECT id FROM entities WHERE project_root = ?)
               ORDER BY r.id
               LIMIT ? OFFSET ?""",
            (PROJECT_ROOT, BATCH_SIZE, offset),
        ).fetchall()

        if not rows:
            break

        # Group by ref_kind since Cypher can't parameterize relationship types
        by_kind: dict[str, list] = {}
        for r in rows:
            rk = r["ref_kind"] or "reference"
            by_kind.setdefault(rk, []).append(r)

        for kind, kind_rows in by_kind.items():
            rel_type = kind_to_rel.get(kind, "REFERENCES")
            items = []
            for r in kind_rows:
                src = r["source_entity_id"]
                tgt = cypher_escape(r["target_name"] or "")
                fp = cypher_escape(r["file_path"] or "")
                ln = r["line_number"] or 0
                if not tgt:
                    continue
                items.append(f"{{src: {src}, tgt: '{tgt}', fp: '{fp}', ln: {ln}}}")

            if not items:
                continue

            cypher = f"""
                UNWIND [{', '.join(items)}] AS r
                MATCH (src:Entity {{id: r.src, project_root: '{proj_root}'}})
                MATCH (tgt:Entity {{name: r.tgt, project_root: '{proj_root}'}})
                MERGE (src)-[:{rel_type} {{file_path: r.fp, line: r.ln}}]->(tgt);
            """
            run_cypher(cypher)

        refs_synced += len(rows)
        offset += BATCH_SIZE
        if refs_synced % 500 < BATCH_SIZE or refs_synced == len(rows):
            log(f"  Refs: {refs_synced} / {ref_count}")

    log(
        f"Done: {files_synced} files, {entities_synced} entities, {refs_synced} refs synced"
    )

    # Final stats
    print("\n=== Memgraph Stats ===")
    run_cypher("MATCH (n) RETURN labels(n) AS label, count(*) AS count;")
    run_cypher("MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS count;")

    conn.close()


if __name__ == "__main__":
    main()
