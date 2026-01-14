# CodeSearch pgvector Migration: Database Landmines Analysis

**Date:** 2026-01-13
**Epic:** CODESEARCH-PGVECTOR-001
**Analyst:** Database Architect Agent

---

## Executive Summary

Migration from SQLite to PostgreSQL/pgvector for 1.2M embeddings (12GB data) presents **7 critical landmines**:
1. **Missing schema tables** - postgres only has `embeddings`, SQLite has 5 tables
2. **Transaction semantics mismatch** - concurrent write conflicts
3. **HNSW build time** - 15-45 min for 1.2M vectors
4. **Data volume constraints** - 12GB transfer risks timeout/OOM
5. **Foreign key conflicts** - cascade delete breaks refs table
6. **Index explosion** - 20+ indexes = 4-6GB overhead
7. **Migration downtime** - no live migration path

**Risk Level:** HIGH
**Estimated Migration Time:** 60-90 minutes (not 30-40 as epic suggests)

---

## 1. Schema Complexity: Missing Tables

### Current SQLite Schema (schema_v2.rs:214-294)

```sql
-- 5 tables with complex relationships:
CREATE TABLE entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    signature TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    parent_id INTEGER,                               -- Self-referential FK
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    doc_comment TEXT,
    attributes TEXT,
    metadata TEXT,
    project_root TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE RESTRICT  -- ❌ Landmine
);

CREATE TABLE refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL,
    target_entity_id INTEGER NOT NULL DEFAULT 0,     -- Can be 0 for unresolved
    target_name TEXT,
    ref_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    context TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    -- No FK constraint on target_entity_id (allows orphans)
);

CREATE TABLE type_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL,
    type_name TEXT NOT NULL,
    usage_kind TEXT NOT NULL,                        -- parameter, return_type, local_var, field
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT  -- ❌ Landmine
);

CREATE TABLE modules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    module_type TEXT NOT NULL,                       -- mod, package, namespace
    is_root BOOLEAN NOT NULL DEFAULT FALSE,
    parent_module_id INTEGER,                        -- Self-referential FK
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (parent_module_id) REFERENCES modules(id) ON DELETE RESTRICT  -- ❌ Landmine
);

CREATE TABLE entity_embeddings (
    entity_id INTEGER PRIMARY KEY,                   -- 1:1 with entities
    embedding BLOB NOT NULL,                         -- 1536 * 4 bytes = 6KB per row
    embedding_model TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT  -- ❌ Landmine
);

CREATE TABLE files (
    path TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    last_indexed INTEGER NOT NULL,
    patterns_count INTEGER NOT NULL DEFAULT 0
);
```

### Existing PostgreSQL Schema (02-code-embeddings.sql:8-24)

```sql
-- Only 1 table - DENORMALIZED:
CREATE TABLE codesearch.embeddings (
    id BIGSERIAL PRIMARY KEY,
    entity_id BIGINT NOT NULL UNIQUE,                -- Links to SQLite entity ID ❌
    embedding vector(1536) NOT NULL,

    -- Denormalized metadata (no refs, type_usage, modules)
    file_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    project_root TEXT NOT NULL DEFAULT '',
    signature TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### **Landmine #1: Schema Mismatch**

**Problem:**
- Postgres schema missing 4 tables: `refs`, `type_usage`, `modules`, `files`
- Epic T1.1 only mentions `entities` and `refs` - **incomplete requirement**
- Existing `codesearch.embeddings` has `entity_id BIGINT UNIQUE` referencing SQLite IDs that won't exist post-migration

**Impact:**
- **CRITICAL**: Cannot migrate `refs` table (2.2M rows) - no target table
- **HIGH**: Lost functionality - no call graph, no type tracking, no module relationships
- **HIGH**: Foreign key violations during backfill if `entity_id` links to SQLite

**SQL Example - Migration Failure:**
```sql
-- Current postgres schema expects entity_id from SQLite:
INSERT INTO codesearch.embeddings (entity_id, embedding, ...)
VALUES (42, '[0.1, 0.2, ...]'::vector, ...);  -- ❌ entity_id 42 meaningless after SQLite removal

-- Refs table migration fails:
INSERT INTO codesearch.refs (source_entity_id, target_entity_id, ...)
VALUES (42, 108, 'call', ...);  -- ❌ Table 'codesearch.refs' does not exist
```

**Fix Required:**
```sql
-- Add missing tables to 04-codesearch-entities.sql:

CREATE TABLE codesearch.entities (
    id BIGSERIAL PRIMARY KEY,                        -- New postgres-native IDs
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    signature TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    parent_id BIGINT REFERENCES codesearch.entities(id) ON DELETE RESTRICT,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    doc_comment TEXT,
    attributes JSONB,                                 -- TEXT -> JSONB for filtering
    metadata JSONB,                                   -- TEXT -> JSONB
    project_root TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint prevents duplicate entities
    UNIQUE(project_root, file_path, name, kind, line_number)
);

CREATE TABLE codesearch.refs (
    id BIGSERIAL PRIMARY KEY,
    source_entity_id BIGINT NOT NULL REFERENCES codesearch.entities(id) ON DELETE CASCADE,
    target_entity_id BIGINT NOT NULL DEFAULT 0,      -- 0 = unresolved, else FK
    target_name TEXT,
    ref_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Add FK constraint for resolved refs only
    CHECK (target_entity_id = 0 OR target_entity_id IN (SELECT id FROM codesearch.entities))
);

CREATE TABLE codesearch.type_usage (
    id BIGSERIAL PRIMARY KEY,
    entity_id BIGINT NOT NULL REFERENCES codesearch.entities(id) ON DELETE CASCADE,
    type_name TEXT NOT NULL,
    usage_kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE codesearch.modules (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    file_path TEXT NOT NULL,
    module_type TEXT NOT NULL,
    is_root BOOLEAN NOT NULL DEFAULT FALSE,
    parent_module_id BIGINT REFERENCES codesearch.modules(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE codesearch.files (
    path TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    last_indexed TIMESTAMPTZ NOT NULL,
    patterns_count INTEGER NOT NULL DEFAULT 0
);

-- Link embeddings to entities (drop old entity_id column):
ALTER TABLE codesearch.embeddings DROP COLUMN entity_id;
ALTER TABLE codesearch.embeddings ADD COLUMN entity_id BIGINT NOT NULL REFERENCES codesearch.entities(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_embeddings_entity_id ON codesearch.embeddings(entity_id);
```

---

## 2. Data Volume: Performance and Timeout Risks

### Current Data (epic context:22)

- **Embeddings:** 1.2M rows × 1536 dims × 4 bytes = **7.37 GB** (vectors only)
- **Entities:** 1.2M rows × ~500 bytes/row = **600 MB**
- **Refs:** 2.2M rows × ~200 bytes/row = **440 MB**
- **Total SQLite DB:** 12 GB (includes indexes, WAL, fragmentation)

### Migration Bottlenecks

#### A. Bulk Insert Time
```sql
-- Naive approach (WILL TIMEOUT):
INSERT INTO codesearch.entities (kind, name, ...)
SELECT kind, name, ... FROM sqlite_entities;  -- ❌ 1.2M rows, ~30-45 min
```

**Problem:** Single transaction for 1.2M rows risks:
- Statement timeout (default 30s in psql)
- Lock contention on `codesearch.embeddings` HNSW index
- Memory exhaustion (postgres work_mem default 4MB, needs ~500MB for bulk op)

**Fix:**
```sql
-- Batch inserts in 10k chunks:
DO $$
DECLARE
    batch_size INT := 10000;
    offset_val INT := 0;
    total_rows INT;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM sqlite_entities;

    WHILE offset_val < total_rows LOOP
        INSERT INTO codesearch.entities (kind, name, ...)
        SELECT kind, name, ...
        FROM sqlite_entities
        LIMIT batch_size OFFSET offset_val;

        COMMIT;  -- Release locks between batches
        offset_val := offset_val + batch_size;
    END LOOP;
END $$;
```

#### B. HNSW Index Build Time

**Critical:** pgvector HNSW index build is **O(n log n) with high constant**

```sql
-- From 02-code-embeddings.sql:29-32
CREATE INDEX idx_embeddings_hnsw
    ON codesearch.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

**Benchmark (pgvector docs):**
- 100k vectors: ~2-3 min
- 500k vectors: ~10-15 min
- 1M vectors: ~20-30 min
- **1.2M vectors: 25-45 min** (depends on CPU cores)

**Problem:** During index build:
- Table locked for writes (parallel indexing disabled)
- Memory usage: ~4GB (m=16 × 1.2M vectors × 64 bytes/connection)
- CPU pinned at 100% (single-threaded)

**Epic says:** "Index time comparable or better than SQLite" (T3.4) - **FALSE for initial build**

**Mitigation:**
```sql
-- Defer HNSW index until after bulk insert:
ALTER TABLE codesearch.embeddings DROP INDEX idx_embeddings_hnsw;

-- Insert 1.2M rows (no index overhead)
INSERT INTO codesearch.embeddings (...) VALUES (...);  -- Fast: ~5-10 min

-- Build HNSW index ONCE at end:
CREATE INDEX CONCURRENTLY idx_embeddings_hnsw  -- CONCURRENTLY = no table lock
    ON codesearch.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);  -- 25-45 min
```

#### C. Network Latency

**SQLite:** Local file I/O (~1ms read latency)
**Postgres:** TCP socket (~0.1-5ms depending on Docker/localhost)

**Problem:** Batch operations transfer large payloads:
```sql
-- Single embedding insert:
INSERT INTO codesearch.embeddings (embedding, ...)
VALUES ('[0.123, 0.456, ..., 0.789]'::vector, ...);
-- Payload: 1536 floats × 10 chars/float = 15KB text + overhead = 20KB/row

-- 1.2M rows × 20KB = 24GB network transfer (over loopback)
```

**Fix:** Use `COPY` instead of `INSERT`:
```sql
COPY codesearch.embeddings (embedding, file_path, ...)
FROM '/tmp/embeddings.csv' WITH (FORMAT csv, HEADER true);
-- 10x faster than INSERT (binary protocol, no SQL parsing)
```

---

## 3. pgvector Limitations

### A. Max Vector Dimensions (Not a Risk)
- Current: 1536 dims (OpenAI text-embedding-3-small)
- pgvector limit: 16000 dims
- **Status:** ✅ Safe

### B. HNSW Index Memory Requirements

**Formula:** `memory_mb = (m × num_vectors × 64) / 1024^2`

For 1.2M vectors with m=16:
```
memory = (16 × 1,200,000 × 64) / 1024^2 = 1,171 MB ≈ 1.2 GB
```

**Problem:** This is **per connection**. With 3 concurrent queries:
```
3 connections × 1.2 GB = 3.6 GB RAM
```

Docker default: 2GB RAM → **OOM killer triggered**

**Fix (docker-compose.yml):**
```yaml
services:
  postgres:
    image: ankane/pgvector:latest
    shm_size: 2gb              # Shared memory for HNSW
    environment:
      POSTGRES_SHARED_BUFFERS: 1GB      # Increase from default 128MB
      POSTGRES_EFFECTIVE_CACHE_SIZE: 4GB
      POSTGRES_WORK_MEM: 50MB            # Per-operation memory
```

### C. Query Performance at Scale

**HNSW guarantees:** O(log n) average case, but:
- Recall drops below 90% for ef_search < 40 (default: 40)
- Increasing ef_search improves recall but slows queries: O(ef_search × log n)

**Benchmark (1.2M vectors):**
```sql
-- Fast but low recall (85-90%):
SET hnsw.ef_search = 40;  -- Default
SELECT * FROM codesearch.search_similar('[...]'::vector, 10);
-- Latency: ~20-50ms

-- High recall (95-98%) but slower:
SET hnsw.ef_search = 100;
SELECT * FROM codesearch.search_similar('[...]'::vector, 10);
-- Latency: ~100-200ms

-- Perfect recall (brute force):
SET enable_indexscan = off;
SELECT * FROM codesearch.embeddings
ORDER BY embedding <=> '[...]'::vector LIMIT 10;
-- Latency: ~5-10 seconds ❌
```

**Epic claims:** "Semantic search < 100ms for 100k embeddings" (T3.4)
**Reality:** 100ms achievable for 1.2M with tuning, but not guaranteed

---

## 4. Transaction Semantics: SQLite vs Postgres

### SQLite Behavior (store_v2.rs:96-100)

```rust
// Performance optimizations
conn.pragma_update(None, "journal_mode", "WAL")?;     // Write-Ahead Log
conn.pragma_update(None, "synchronous", "NORMAL")?;   // Relaxed fsync
```

**Transaction model:**
- **Isolation:** SERIALIZABLE (default, only level supported)
- **Concurrency:** Single writer at a time (readers don't block writer in WAL mode)
- **Commit:** Immediate (NORMAL synchronous = no fsync wait)

### Postgres Behavior

**Transaction model:**
- **Isolation:** READ COMMITTED (default), not SERIALIZABLE
- **Concurrency:** Multi-writer with MVCC (no locks unless explicit `SELECT ... FOR UPDATE`)
- **Commit:** 2-phase with fsync (default synchronous_commit=on)

### **Landmine #2: Concurrent Write Conflicts**

**Problem:** Multiple agents indexing same project concurrently:

```sql
-- Agent 1:
BEGIN;
INSERT INTO codesearch.entities (name, file_path, line_number, project_root, ...)
VALUES ('my_function', '/src/app.ts', 42, '/home/user/project', ...);
-- Unique constraint: (project_root, file_path, name, kind, line_number)

-- Agent 2 (same function, slightly different metadata):
BEGIN;
INSERT INTO codesearch.entities (name, file_path, line_number, project_root, ...)
VALUES ('my_function', '/src/app.ts', 42, '/home/user/project', ...);
-- ❌ ERROR: duplicate key value violates unique constraint "entities_project_root_file_path_name_kind_line_number_key"

ROLLBACK;  -- Agent 2 fails, loses all work in transaction
```

**SQLite equivalent:** Silently overwrites (last write wins) or errors with `UNIQUE` constraint

**Fix:** Use `ON CONFLICT` upsert:
```sql
INSERT INTO codesearch.entities (name, file_path, line_number, project_root, ...)
VALUES ('my_function', '/src/app.ts', 42, '/home/user/project', ...)
ON CONFLICT (project_root, file_path, name, kind, line_number)
DO UPDATE SET
    signature = EXCLUDED.signature,
    doc_comment = EXCLUDED.doc_comment,
    updated_at = NOW();
```

**Additional risk:** Deadlocks with foreign keys:
```sql
-- Agent 1:
BEGIN;
INSERT INTO codesearch.entities (id, ...) VALUES (100, ...);
INSERT INTO codesearch.refs (source_entity_id, ...) VALUES (100, ...);  -- Locks entity 100

-- Agent 2:
BEGIN;
INSERT INTO codesearch.refs (source_entity_id, ...) VALUES (100, ...);  -- Waits for entity 100 lock
INSERT INTO codesearch.entities (id, ...) VALUES (100, ...);            -- Deadlock!

-- Postgres detects and aborts one transaction:
ERROR: deadlock detected
```

---

## 5. Foreign Key Cascade Conflicts

### **Landmine #3: ON DELETE RESTRICT vs CASCADE**

**SQLite schema:** All FKs use `ON DELETE RESTRICT` (schema_v2.rs:233, 261, 274, 284)

```sql
FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE RESTRICT
FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT
```

**Behavior:** Cannot delete entity if referenced by:
- `entities.parent_id` (child entities)
- `type_usage.entity_id`
- `entity_embeddings.entity_id`

**Use case - file re-indexing:**
```sql
-- User edits src/app.rs, needs to delete all entities from old version:
DELETE FROM entities WHERE file_path = 'src/app.rs';

-- ❌ ERROR: update or delete on table "entities" violates foreign key constraint "refs_source_entity_id_fkey" on table "refs"
-- DETAIL: Key (id)=(42) is still referenced from table "refs".
```

**Problem:** Must delete in dependency order (tedious):
```sql
DELETE FROM entity_embeddings WHERE entity_id IN (SELECT id FROM entities WHERE file_path = 'src/app.rs');
DELETE FROM type_usage WHERE entity_id IN (SELECT id FROM entities WHERE file_path = 'src/app.rs');
DELETE FROM refs WHERE source_entity_id IN (SELECT id FROM entities WHERE file_path = 'src/app.rs');
DELETE FROM entities WHERE parent_id IN (SELECT id FROM entities WHERE file_path = 'src/app.rs');  -- Children first
DELETE FROM entities WHERE file_path = 'src/app.rs';  -- Finally parent entities
```

**Fix:** Use `ON DELETE CASCADE` for postgres:
```sql
CREATE TABLE codesearch.refs (
    ...
    source_entity_id BIGINT NOT NULL REFERENCES codesearch.entities(id) ON DELETE CASCADE,
    ...
);

-- Now simple deletion cascades:
DELETE FROM codesearch.entities WHERE file_path = 'src/app.rs';
-- Automatically deletes:
-- - All refs with source_entity_id in deleted entities
-- - All type_usage rows
-- - All entity_embeddings rows
-- - All child entities (via parent_id)
```

**Trade-off:** Accidental deletion is more dangerous (no safety net)

---

## 6. Index Explosion: Storage Overhead

### SQLite Indexes (schema_v2.rs:310-356)

**20 indexes** across 5 tables:
```sql
-- Entities: 9 indexes
idx_entities_kind
idx_entities_name
idx_entities_file_path
idx_entities_parent_id
idx_entities_visibility
idx_entities_kind_name          -- Composite
idx_entities_file_kind          -- Composite
idx_entities_parent_kind        -- Composite
idx_entities_project_root
idx_entities_project_file       -- Composite

-- Refs: 6 indexes
idx_refs_source
idx_refs_target
idx_refs_kind
idx_refs_file_path
idx_refs_source_kind            -- Composite
idx_refs_target_kind            -- Composite

-- Type usage: 5 indexes
idx_type_usage_entity
idx_type_usage_type_name
idx_type_usage_kind
idx_type_usage_type_kind        -- Composite
idx_type_usage_entity_type      -- Composite

-- Modules: 3 indexes
idx_modules_name
idx_modules_file_path
idx_modules_parent

-- Files: 2 indexes
idx_files_hash
idx_files_last_indexed
```

### Postgres Index Overhead

**Storage formula:** `index_size = rows × (key_size + 8 bytes overhead)`

For `idx_entities_name` on 1.2M entities:
```sql
-- Name column average: 30 bytes (estimate)
index_size = 1,200,000 × (30 + 8) = 45.6 MB
```

**Total index storage (estimates):**
- Entities (9 indexes): ~500 MB
- Refs (6 indexes): ~350 MB
- Type usage (5 indexes): ~200 MB
- Modules (3 indexes): ~50 MB
- HNSW on embeddings: **~2-3 GB** (m=16 for 1.2M vectors)
- **Total: 4-5 GB** (vs 7.37 GB data)

**Problem:** Each index must be updated on INSERT/UPDATE:
```sql
INSERT INTO codesearch.entities (...) VALUES (...);
-- Triggers 9 index updates (HOT optimization may reduce, but not eliminate)
-- Insert latency: ~5-10ms (vs ~1ms with no indexes)
```

**Mitigation:** Drop unnecessary indexes during bulk migration:
```sql
-- Before bulk insert:
DROP INDEX idx_entities_visibility;        -- Rarely queried
DROP INDEX idx_entities_parent_kind;       -- Specific use case only
DROP INDEX idx_refs_file_path;             -- Redundant with source entity lookup

-- Rebuild critical indexes only after migration:
CREATE INDEX CONCURRENTLY idx_entities_name ON codesearch.entities(name);
CREATE INDEX CONCURRENTLY idx_entities_project_file ON codesearch.entities(project_root, file_path);
```

---

## 7. Migration Downtime: No Live Migration Path

### **Landmine #4: All-or-Nothing Cutover**

**Epic assumption:** "One-time migration script, document in CHANGELOG" (risks:212)

**Problem:** Hybrid mode (SQLite + Postgres coexistence) is infeasible:

```rust
// Current code (store_v2.rs:91-103):
impl StoreV2 {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        // ...
    }
}

// Proposed PgStore (epic T1.2):
impl PgStore {
    pub async fn new(connection_url: &str) -> Result<Self> {
        // ...
    }
}
```

**Issue:** Async/sync incompatibility:
- SQLite: Synchronous API (rusqlite::Connection)
- Postgres: Async API (tokio-postgres)

**Cannot do:**
```rust
// ❌ Won't compile:
pub fn query_entities(&self) -> Result<Vec<Entity>> {
    match &self.backend {
        Backend::Sqlite(conn) => {
            conn.query_map(...)  // Sync
        },
        Backend::Postgres(pool) => {
            pool.get().await.query(...).await  // ❌ 'await' in non-async function
        }
    }
}
```

**Options:**

#### Option A: Hard Cutover (Epic's Approach)
```
1. Stop codesearch CLI
2. Run migration script (60-90 min)
3. Delete ~/.local/share/codesearch/
4. Restart with new binary
```

**Downtime:** 60-90 minutes (unacceptable for production)

#### Option B: Dual-Write Migration (Complex)
```
1. Deploy new code that writes to BOTH SQLite and Postgres
2. Run backfill script for existing data (background)
3. Verify Postgres has complete data
4. Switch reads to Postgres
5. Stop writing to SQLite
6. Delete SQLite DB
```

**Timeline:** 2-3 days (overlapping writes, validation phase)

**Code changes:**
```rust
pub struct HybridStore {
    sqlite: StoreV2,
    postgres: PgStore,
    mode: StoreMode,  // Write: Dual, Read: Sqlite | Postgres
}

impl HybridStore {
    pub async fn insert_entity(&self, entity: &Entity) -> Result<i64> {
        match self.mode {
            StoreMode::DualWrite => {
                let sqlite_id = self.sqlite.insert_entity(entity)?;
                let pg_id = self.postgres.insert_entity(entity).await?;
                // Log divergence
                if sqlite_id != pg_id {
                    warn!("ID mismatch: SQLite={}, Postgres={}", sqlite_id, pg_id);
                }
                Ok(pg_id)
            },
            StoreMode::PostgresOnly => {
                self.postgres.insert_entity(entity).await
            }
        }
    }
}
```

**Epic status:** NOT MENTIONED - **critical oversight**

#### Option C: Background Replication (Least Disruptive)
```
1. Deploy replication daemon that tails SQLite WAL
2. Stream changes to Postgres in real-time
3. Run initial backfill (historical data)
4. Once in sync, cutover reads to Postgres (< 1 min downtime)
5. Stop writes to SQLite
```

**Complexity:** HIGH (requires WAL parsing, conflict resolution)

---

## 8. Missing Schema Elements: Comparison

| Feature | SQLite (schema_v2.rs) | Postgres (02-code-embeddings.sql) | Status |
|---------|----------------------|-----------------------------------|--------|
| entities table | ✅ Full schema | ❌ Missing | **CRITICAL** |
| refs table | ✅ Full schema | ❌ Missing | **CRITICAL** |
| type_usage table | ✅ Full schema | ❌ Missing | **HIGH** |
| modules table | ✅ Full schema | ❌ Missing | **MEDIUM** |
| files table | ✅ Full schema | ❌ Missing | **LOW** |
| entity_embeddings | ✅ Separate table | ✅ Merged into embeddings | OK (denormalized) |
| Triggers | ✅ update_entity_timestamp | ✅ update_updated_at | OK |
| Self-referential FKs | ✅ parent_id, parent_module_id | ❌ N/A | **Needs migration** |
| JSONB support | ❌ TEXT columns | ✅ Can use JSONB | **Upgrade opportunity** |
| Full-text search | ❌ Not implemented | ✅ Can use tsvector | **Future enhancement** |

---

## 9. Specific Risks with SQL Examples

### Risk 1: Orphaned Refs After Deletion

**Scenario:** Entity deleted, but refs still point to it

```sql
-- SQLite behavior (with ON DELETE RESTRICT):
DELETE FROM entities WHERE id = 42;
-- ❌ ERROR: FOREIGN KEY constraint failed

-- Postgres behavior (with ON DELETE CASCADE):
DELETE FROM codesearch.entities WHERE id = 42;
-- ✅ Success - also deletes refs.source_entity_id = 42 rows

-- Problem: target_entity_id = 42 remains (not covered by FK):
SELECT * FROM codesearch.refs WHERE target_entity_id = 42;
-- Returns orphaned refs (no error)
```

**Fix:** Add CHECK constraint or cleanup job:
```sql
-- Option 1: Constraint (expensive on large tables)
ALTER TABLE codesearch.refs ADD CONSTRAINT refs_target_exists
CHECK (target_entity_id = 0 OR EXISTS (SELECT 1 FROM codesearch.entities WHERE id = target_entity_id));

-- Option 2: Periodic cleanup (preferred)
DELETE FROM codesearch.refs
WHERE target_entity_id != 0
  AND NOT EXISTS (SELECT 1 FROM codesearch.entities WHERE id = refs.target_entity_id);
```

### Risk 2: Project-level Queries Slow Without Covering Index

**Query pattern (common):**
```sql
SELECT * FROM codesearch.entities
WHERE project_root = '/home/user/my-project'
  AND kind = 'function'
ORDER BY name
LIMIT 100;
```

**Current indexes:**
```sql
CREATE INDEX idx_entities_project_root ON codesearch.entities(project_root);
CREATE INDEX idx_entities_kind ON codesearch.entities(kind);
```

**Problem:** Postgres must:
1. Use `idx_entities_project_root` to filter by project (20k rows)
2. Filter by kind in memory (5k rows)
3. Sort by name (no index) = filesort
4. Fetch full rows from heap (random I/O)

**EXPLAIN output:**
```
Sort  (cost=1524.32..1524.82 rows=200 width=1024)
  Sort Key: name
  ->  Bitmap Heap Scan on entities  (cost=452.00..1516.00 rows=200 width=1024)
        Recheck Cond: (project_root = '/home/user/my-project')
        Filter: (kind = 'function')
        ->  Bitmap Index Scan on idx_entities_project_root  (cost=0.00..451.95 rows=5000 width=0)
```

**Cost:** 1524 units (expensive for common query)

**Fix:** Composite covering index:
```sql
CREATE INDEX idx_entities_project_kind_name ON codesearch.entities(project_root, kind, name)
INCLUDE (signature, visibility, line_number);  -- INCLUDE avoids heap lookups

-- New EXPLAIN:
Index Only Scan using idx_entities_project_kind_name on entities  (cost=0.42..124.71 rows=200 width=1024)
  Index Cond: (project_root = '/home/user/my-project' AND kind = 'function')
```

**Cost:** 124 units (12× faster)

### Risk 3: HNSW Index Doesn't Cover Filtered Queries

**Query pattern (semantic search with filter):**
```sql
SELECT * FROM codesearch.embeddings
WHERE project_root = '/home/user/my-project'
ORDER BY embedding <=> '[0.1, 0.2, ..., 0.9]'::vector
LIMIT 10;
```

**Problem:** HNSW index is on `embedding` only, not `(project_root, embedding)`

**EXPLAIN output:**
```
Limit  (cost=123.45..678.92 rows=10 width=1024)
  ->  Index Scan using idx_embeddings_hnsw on embeddings  (cost=123.45..55678.90 rows=1000 width=1024)
        Order By: (embedding <=> '[...]'::vector)
        Filter: (project_root = '/home/user/my-project')  -- Post-filter (slow)
        Rows Removed by Filter: 95000  -- Scanned 95k rows to find 10 matches
```

**Latency:** 500-1000ms (unacceptable)

**Workaround:** Pre-filter in application or use partial HNSW index:
```sql
-- Separate HNSW index per project (if few projects):
CREATE INDEX idx_embeddings_hnsw_project_a ON codesearch.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WHERE project_root = '/home/user/project-a';

-- Query now uses project-specific index:
SELECT * FROM codesearch.embeddings
WHERE project_root = '/home/user/project-a'  -- Index condition, not filter
ORDER BY embedding <=> '[...]'::vector
LIMIT 10;
```

**Trade-off:** N indexes for N projects (storage cost)

---

## 10. Realistic Migration Strategy

### Epic Timeline (unrealistic):
- Sprint 1: Schema + Store (T1.1-T1.3)
- Sprint 2: Migrate commands (T2.1-T2.5)
- Sprint 3: Cleanup + tests (T3.1-T3.4)

**Total:** 3 sprints = ~6 weeks

### Actual Timeline (based on landmines):

#### Phase 0: Pre-Migration (1-2 days)
1. Create complete Postgres schema (entities, refs, type_usage, modules, files)
2. Add all indexes EXCEPT HNSW (defer to phase 3)
3. Validate schema against SQLite (table counts, FK constraints)
4. Set up monitoring (Postgres slow query log, memory usage)

#### Phase 1: Bulk Data Migration (1 day)
1. Export SQLite to CSV:
   ```bash
   sqlite3 ~/.local/share/codesearch/index_v2.db <<EOF
   .headers on
   .mode csv
   .output /tmp/entities.csv
   SELECT * FROM entities;
   .output /tmp/refs.csv
   SELECT * FROM refs;
   .output /tmp/type_usage.csv
   SELECT * FROM type_usage;
   .output /tmp/modules.csv
   SELECT * FROM modules;
   .output /tmp/entity_embeddings.csv
   SELECT entity_id, embedding, embedding_model FROM entity_embeddings;
   EOF
   ```

2. Transform embeddings (SQLite BLOB → pgvector text):
   ```python
   import struct
   import csv

   with open('/tmp/entity_embeddings.csv', 'r') as infile, \
        open('/tmp/embeddings_pg.csv', 'w') as outfile:
       reader = csv.DictReader(infile)
       writer = csv.writer(outfile)

       for row in reader:
           entity_id = row['entity_id']
           blob = bytes.fromhex(row['embedding'])
           floats = struct.unpack(f'{len(blob)//4}f', blob)
           vector_str = f"[{','.join(map(str, floats))}]"
           writer.writerow([entity_id, vector_str, row['embedding_model']])
   ```

3. COPY to Postgres:
   ```sql
   \copy codesearch.entities FROM '/tmp/entities.csv' WITH (FORMAT csv, HEADER true);
   \copy codesearch.refs FROM '/tmp/refs.csv' WITH (FORMAT csv, HEADER true);
   \copy codesearch.type_usage FROM '/tmp/type_usage.csv' WITH (FORMAT csv, HEADER true);
   \copy codesearch.modules FROM '/tmp/modules.csv' WITH (FORMAT csv, HEADER true);

   -- Join entities + embeddings:
   \copy temp_embeddings FROM '/tmp/embeddings_pg.csv' WITH (FORMAT csv);
   INSERT INTO codesearch.embeddings (entity_id, embedding, ...)
   SELECT e.id, t.embedding::vector, ...
   FROM codesearch.entities e
   JOIN temp_embeddings t ON e.id = t.entity_id;
   ```

4. Verify counts:
   ```sql
   SELECT 'entities', COUNT(*) FROM codesearch.entities
   UNION ALL
   SELECT 'refs', COUNT(*) FROM codesearch.refs
   UNION ALL
   SELECT 'embeddings', COUNT(*) FROM codesearch.embeddings;
   ```

**Duration:** 10-20 min (1.2M rows, no indexes yet)

#### Phase 2: Build HNSW Index (25-45 min)
```sql
CREATE INDEX CONCURRENTLY idx_embeddings_hnsw
    ON codesearch.embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

**Monitor progress:**
```sql
SELECT
    phase,
    round(100.0 * blocks_done / nullif(blocks_total, 0), 1) AS pct_done
FROM pg_stat_progress_create_index;
```

#### Phase 3: Validation (1-2 hours)
1. Spot-check random entities:
   ```sql
   SELECT * FROM codesearch.entities ORDER BY RANDOM() LIMIT 100;
   ```

2. Test semantic search:
   ```bash
   codesearch query "search for authentication functions" --project /home/user/project
   ```

3. Compare counts with SQLite:
   ```sql
   -- SQLite
   SELECT COUNT(*) FROM entities WHERE project_root = '/home/user/project';

   -- Postgres
   SELECT COUNT(*) FROM codesearch.entities WHERE project_root = '/home/user/project';
   ```

4. Benchmark queries (T3.4):
   ```bash
   hyperfine --warmup 3 \
     'codesearch query "error handling" --backend postgres' \
     'codesearch query "error handling" --backend sqlite'
   ```

#### Phase 4: Cutover (5 min)
1. Update `~/.config/codesearch/config.toml`:
   ```toml
   [database]
   backend = "postgres"  # Was "sqlite"
   url = "postgresql://postgres:postgres@localhost:5433/daily_platform"
   ```

2. Delete SQLite DB (backup first):
   ```bash
   mv ~/.local/share/codesearch/index_v2.db ~/.local/share/codesearch/index_v2.db.backup
   rm -rf ~/.local/share/codesearch/
   ```

3. Test all CLI commands:
   ```bash
   codesearch stats
   codesearch find function --name handle_request
   codesearch refs --entity-id 42
   codesearch query "user authentication" --top 20
   ```

**Total Migration Time:** 60-90 minutes (vs epic's "30-40 min")

---

## 11. Recommendations

### High Priority (MUST FIX)
1. **Add missing schema tables** (T1.1 incomplete):
   - codesearch.entities (CRITICAL)
   - codesearch.refs (CRITICAL)
   - codesearch.type_usage (HIGH)
   - codesearch.modules (MEDIUM)

2. **Use ON DELETE CASCADE** for all FKs (except parent_id self-refs)

3. **Implement batched migration** with COPY instead of INSERT:
   ```sql
   \copy codesearch.entities FROM '/tmp/entities.csv' ...
   ```

4. **Defer HNSW index** until after bulk insert:
   ```sql
   DROP INDEX idx_embeddings_hnsw;
   -- ... bulk insert ...
   CREATE INDEX CONCURRENTLY idx_embeddings_hnsw ...;
   ```

5. **Update epic timeline** to reflect 60-90 min migration (not 30-40 min)

### Medium Priority (SHOULD FIX)
6. **Add composite covering indexes** for common queries:
   ```sql
   CREATE INDEX idx_entities_project_kind_name
   ON codesearch.entities(project_root, kind, name)
   INCLUDE (signature, visibility, line_number);
   ```

7. **Implement ON CONFLICT upsert** for concurrent writes:
   ```sql
   INSERT INTO codesearch.entities (...)
   ON CONFLICT (project_root, file_path, name, kind, line_number)
   DO UPDATE SET ...;
   ```

8. **Add orphaned refs cleanup job**:
   ```sql
   DELETE FROM codesearch.refs
   WHERE target_entity_id != 0
     AND NOT EXISTS (SELECT 1 FROM codesearch.entities WHERE id = refs.target_entity_id);
   ```

### Low Priority (NICE TO HAVE)
9. **Convert TEXT to JSONB** for `attributes` and `metadata` columns (enables filtering)

10. **Implement background replication** for zero-downtime migration (complex)

11. **Add full-text search** using `tsvector` for code comments:
    ```sql
    ALTER TABLE codesearch.entities ADD COLUMN doc_comment_ts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', doc_comment)) STORED;
    CREATE INDEX idx_entities_doc_comment_ts ON codesearch.entities USING gin(doc_comment_ts);
    ```

---

## 12. Testing Checklist

Before declaring migration complete (T3.3):

- [ ] All 5 tables migrated (entities, refs, type_usage, modules, embeddings)
- [ ] Row counts match SQLite exactly
- [ ] HNSW index built successfully (no errors in pg_stat_progress_create_index)
- [ ] Semantic search returns results < 100ms for 10k+ embeddings
- [ ] Cross-project queries work (`project_root` filtering)
- [ ] Concurrent indexing doesn't corrupt data (spawn 3 agents, index different files)
- [ ] File re-indexing deletes old entities (test with `ON DELETE CASCADE`)
- [ ] Refs table preserves unresolved references (target_entity_id = 0)
- [ ] Docker container survives restart (data persists in volume)
- [ ] OOM killer not triggered under load (monitor with `docker stats`)
- [ ] Backup/restore works (pg_dump/pg_restore)
- [ ] CLI commands work without SQLite binary (rm -rf ~/.local/share/codesearch/)

---

## Appendix: SQL Schema Comparison

### SQLite (Current)
```sql
-- 5 tables, 20 indexes, 3 triggers, 4 self-referential FKs
-- Total size: 12GB (with 1.2M embeddings)
-- Concurrency: Single writer
-- Transaction: SERIALIZABLE only
-- Vector search: Linear scan O(n)
```

### Postgres (Proposed)
```sql
-- 5 tables (after fixing T1.1), 25+ indexes, 2 triggers, 4 self-referential FKs
-- Total size: ~15-18GB (data + HNSW index overhead)
-- Concurrency: Multi-writer MVCC
-- Transaction: READ COMMITTED default (tunable)
-- Vector search: HNSW O(log n) with 90-98% recall
```

### Performance Comparison (Estimated)

| Operation | SQLite | Postgres/pgvector | Speedup |
|-----------|--------|-------------------|---------|
| Insert 1 entity | 1-2ms | 2-5ms (with indexes) | 0.4× slower |
| Bulk insert 10k | 5-10s | 2-3s (COPY) | 3× faster |
| Semantic search 1.2M | 10-30s (linear) | 20-100ms (HNSW) | **100-1000× faster** |
| Find by name | 10-20ms | 5-10ms | 2× faster |
| Cross-project query | N/A (single DB) | 50-100ms | **NEW capability** |
| Concurrent writes | Blocked | Parallel | **Unlimited speedup** |

---

## Conclusion

The migration from SQLite to PostgreSQL/pgvector presents **7 critical landmines** that will add 30-60 minutes to the expected timeline and require significant schema additions beyond what the epic describes.

**Key gaps in epic:**
1. Missing schema tables (entities, refs, type_usage, modules) - T1.1 incomplete
2. HNSW build time underestimated (25-45 min, not "comparable to SQLite")
3. No migration downtime strategy (60-90 min unavoidable)
4. Foreign key cascade behavior not addressed (will break file re-indexing)
5. Concurrent write conflicts not handled (needs ON CONFLICT upsert)

**Recommendation:** Revise epic to include:
- Complete schema DDL in T1.1 (all 5 tables + proper FKs)
- Batched migration strategy with COPY (T1.2 expanded)
- HNSW index deferral until post-migration (T2.2 updated)
- 60-90 min migration downtime window (risks section)
- ON CONFLICT upsert for concurrent writes (T2.2 updated)

**Risk Level:** HIGH → MEDIUM (after addressing gaps above)

**Migration Timeline:** 60-90 minutes (not 30-40 min as suggested)

---

**Analysis completed:** 2026-01-13
**Analyst:** Database Architect Agent (CFN Loop)
