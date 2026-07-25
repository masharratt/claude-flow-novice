# RuVector Isolation Audit - Quick Reference

## Status: CRITICAL - Multi-Project Data Leakage

### One-Minute Summary
The centralized RuVector database (`~/.local/share/ruvector/index_v2.db`) contains 783K+ entities from all projects but provides **zero isolation**. Any query returns results from ALL projects. Project B can access Project A's code by simply searching for common terms.

---

## Vulnerability Matrix

```
Query Method                      | Isolation | Risk    | Impact
----------------------------------|-----------|---------|----------
QueryV2::search()                 | NONE      | HIGH    | Semantic search leaks all projects
QueryV2::search_similar_entities()| NONE      | HIGH    | Returns similar from ANY project
StoreV2::find_entities_by_name()  | NONE      | HIGH    | Gets all matching names globally
StoreV2::find_entities_by_kind()  | NONE      | HIGH    | Enumerates all classes/functions
StoreV2::search_entities()        | NONE      | HIGH    | Fulltext search across all
find_entities_in_file()           | PATH ONLY | MEDIUM  | Directory traversal possible
```

**Summary**: 9 of 10 query methods unfiltered.

---

## Leakage Demonstration

### Step 1: Setup
```
Centralized DB contains:
├── Project A: /home/user/project-a/ (783,891 entities)
│   ├── src/auth.ts (sensitive auth implementation)
│   ├── src/database.ts (connection details)
│   └── src/crypto.ts (encryption keys pattern)
└── Project B: /home/user/project-b/ (empty, just initialized)
```

### Step 2: Attack
```rust
// In Project B context:
let query = QueryV2::new(&db_path)?;
let results = query.search("authentication", 10, 0.5)?;
// search() has NO project_root parameter
// search() has NO WHERE clause filtering
```

### Step 3: Leak
```
Results returned:
  [Project A] authenticate() in /home/user/project-a/src/auth.ts
  [Project A] OAuth provider in /home/user/project-a/src/oauth.ts
  [Project A] SessionManager in /home/user/project-a/src/session.ts
  [Project B] User model in /home/user/project-b/src/user.ts ← legitimate
  [Project A] CredentialManager in /home/user/project-a/src/crypto.ts
```

**Result**: Project A's entire auth system exposed to Project B.

---

## Root Causes (Top 3)

### 1. No Project Identifier Column
```sql
-- Current schema (BAD):
CREATE TABLE entities (
    id INTEGER PRIMARY KEY,
    kind TEXT,
    name TEXT,
    file_path TEXT,  -- ← ONLY isolation mechanism
    ...
);
-- Single string field insufficient for reliable isolation
```

### 2. No WHERE Clause in Core Queries
```rust
// Current QueryV2::search() (BAD):
let mut stmt = self.store.conn.prepare(
    "SELECT e.id, e.kind, e.name, ... FROM entities e
     JOIN entity_embeddings ee ON e.id = ee.entity_id"
    // ↑ NO WHERE clause - returns ALL rows
)?;
```

### 3. No Project Context Passed to APIs
```rust
// main.rs parses project_dir but never uses it:
pub fn search(&self, query: &str, max_results: usize, threshold: f32) -> Result<Vec<SearchResult>>
    // ↑ NO project_root parameter
```

---

## Call Stack Analysis

```
main.rs:CommandQuery.execute()
  ↓
cli/query.rs:QueryCommand.execute()
  ├─ Captures project_dir: PathBuf
  ├─ Creates QueryV2 (no project context passed)
  ├─ Calls query_v2.search(query, max_results, threshold)
  │  └─ ❌ search() has NO project filtering
  │     ├─ Queries ALL rows: "SELECT ... FROM entities e JOIN entity_embeddings"
  │     └─ Returns results from ANY project matching similarity
  └─ Optional client-side filter (insufficient)
     └─ if let Some(ref file_filter) = self.config.file_filter {
            results.filter(...contains(file_filter))  // Substring, bypassed easily
        }
```

**Gap**: Project context lost between CLI and query layer.

---

## Attack Vectors

### Vector 1: Direct Semantic Search
```rust
// No project parameter exists
query.search("password", 10, 0.5)  // Gets ALL password-related code
query.search("token", 10, 0.5)     // Gets ALL token logic
query.search("secret", 10, 0.5)    // Gets ALL secrets/keys
```

### Vector 2: Entity Kind Enumeration
```rust
// Enumerate all classes across projects
for kind in [Struct, Class, Function, Type] {
    let results = store.find_entities_by_kind(kind, 1000);
    // Gets 1000 results from ALL projects for each kind
}
```

### Vector 3: Name-Based Discovery
```rust
// Find all functions named "authenticate"
let results = store.find_entities_by_name("authenticate", 500);
// Returns authenticate() from Project A, B, C, ...
```

### Vector 4: Similar Entity Mapping
```rust
// If entity_id obtained (1 to 9B range):
let similar = query.search_similar_entities(entity_id, 10, 0.5);
// Maps ALL similar entities from ALL projects
```

### Vector 5: Directory Traversal
```rust
// No validation on path
store.find_entities_in_file("/home/user/project-a/src/secrets.rs")
// Directly accesses any project's file entities
```

---

## Code Locations - What Needs Fixing

| File | Method | Line | Issue | Fix |
|------|--------|------|-------|-----|
| query_v2.rs | search() | 42-118 | No WHERE filter | Add `WHERE project_root = ?` |
| query_v2.rs | search_similar_entities() | 136-209 | No project filter | Add project_root param |
| store_v2.rs | find_entities_by_name() | 143-156 | No WHERE filter | Add `AND project_root = ?` |
| store_v2.rs | find_entities_by_kind() | 158-171 | No WHERE filter | Add `AND project_root = ?` |
| store_v2.rs | search_entities() | 187-208 | No WHERE filter | Add `AND project_root = ?` |
| cli/query.rs | QueryCommand.execute() | 63-91 | Insufficient filtering | Enforce DB-level filtering |
| schema_v2.rs | SchemaV2.initialize() | 214-286 | Missing project_root column | Add column with constraint |
| main.rs | Query subcommand | 69-99 | Unused project_dir param | Pass to query methods |

---

## High-Level Fix (Pseudo-code)

### Step 1: Database
```sql
-- Add project isolation column
ALTER TABLE entities ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
UPDATE entities SET project_root = ...;  -- derive from file_path

-- Add indexes for performance
CREATE INDEX idx_entities_project_kind ON entities(project_root, kind);
```

### Step 2: QueryV2
```rust
// Current:
pub fn search(&self, query: &str, max_results: usize, threshold: f32)

// Fixed:
pub fn search(&self, query: &str, max_results: usize, threshold: f32, project_root: &str)
    // Add WHERE project_root = ? to SQL query
```

### Step 3: CLI
```rust
// Current:
let results = self.query_v2.search(&self.config.query, max_results, threshold)?;

// Fixed:
let results = self.query_v2.search(
    &self.config.query,
    max_results,
    threshold,
    &project_root_string  // ← Pass project context
)?;
```

### Step 4: Tests
```rust
#[test]
fn test_search_isolation() {
    // Add Project A and B entities to same DB
    // Search from Project B context
    // Assert: Results from Project A == 0
}
```

---

## Timeline

| Phase | Tasks | Effort |
|-------|-------|--------|
| **CRITICAL (Week 1)** | Add project_root column, fix 5 query methods, path validation | 3-4 days |
| **HIGH (Week 2)** | Fix remaining methods, audit logging, test suite | 2-3 days |
| **MEDIUM (Week 3-4)** | Indexes, documentation, performance | 1-2 days |

---

## Do NOT Use Until Fixed

```
❌ Multi-project environments
❌ Sensitive code repositories
❌ Regulated data (HIPAA, PCI-DSS, SOX, GDPR)
❌ Competitive projects
❌ Production deployments
```

---

## Safe Uses Only

```
✓ Single-project development
✓ Public codebases
✓ Internal company projects (with trust)
✓ Research/academic
```

---

## Test To Verify Fix

```bash
# Before running, check for critical issues:
cargo test --lib query_v2::tests::test_cross_project_leakage

# Should FAIL before fix (demonstrating vulnerability)
# Should PASS after fix
```

---

## References

- **Full Audit**: `docs/RUVECTOR_ISOLATION_AUDIT.md`
- **Query Implementation**: `.claude/skills/cfn-local-ruvector-accelerator/src/query_v2.rs`
- **Store Layer**: `.claude/skills/cfn-local-ruvector-accelerator/src/store_v2.rs`
- **Database Location**: `~/.local/share/ruvector/index_v2.db`

---

## Key Takeaway

**Centralized database without per-project filtering = multi-project code leakage.**

Fix requires:
1. Add `project_root` column to schema
2. Add `project_root` parameter to all query APIs
3. Update CLI to pass project context
4. Add tests to enforce isolation

Estimated effort: **1-2 weeks** for safe production use.
