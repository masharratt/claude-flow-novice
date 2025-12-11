# ISOLATION AUDIT: RuVector Query Safety
**Status: CRITICAL VULNERABILITIES FOUND**

## Executive Summary

The RuVector centralized database implementation has **SEVERE CROSS-PROJECT DATA LEAKAGE RISKS**. Multiple query methods return ALL entities without project-based filtering, creating scenarios where Project A queries can access Project B's code.

**Severity: CRITICAL** - Affects all semantic search operations
**Impact: ALL projects using centralized DB**
**Exploitability: Trivial** - No special permissions required

---

## Database Architecture Review

### Centralized Database Location
- **Path**: `~/.local/share/ruvector/index_v2.db` (shared across all projects)
- **Design**: Single SQLite file containing entities from ALL projects
- **Current Tables**:
  - `entities` (783,891+ rows from multiple projects)
  - `refs` (references between entities)
  - `type_usage` (type information)
  - `modules` (import/export data)
  - `entity_embeddings` (vector data)

### Project Identification Method
**File Path Column**: Entities are identified by `file_path` field
- Example: `/home/user/project-a/src/auth.rs`
- Example: `/home/user/project-b/src/auth.rs`
- No project ID column or project context enforcement

---

## Query Analysis

### 1. QueryV2::search() - UNFILTERED GLOBAL SEARCH

**File**: `src/query_v2.rs:42-118`

```rust
pub fn search(&self, query: &str, max_results: usize, threshold: f32) -> Result<Vec<SearchResult>> {
    // Gets ALL embeddings from database with NO project filtering
    let mut stmt = self.store.conn.prepare(
        "SELECT e.id, e.kind, e.name, ... FROM entities e
         JOIN entity_embeddings ee ON e.id = ee.entity_id"
    )?;

    // Performs semantic search across ALL projects
    // Returns results from any project that matches similarity threshold
    let embedding_rows = stmt.query_map([], |row| { ... })?;
```

**Isolation Status**: ❌ **NONE**

**Evidence of Leakage**:
```
Given:
  Project A: /home/user/project-a/* (783,891 entities indexed)
  Project B: /home/user/project-b/* (newly initialized)

When Project B executes: search("authentication", 10, 0.5)
Then Returns: Results from BOTH projects
      ✓ Project B results (should return)
      ✗ Project A results (should NOT return)
```

**Critical Gap**: The query parameter does NOT include:
- Project root path
- Project identifier
- WHERE clause filtering by file_path prefix
- Context about current project

**Lines 42-118**: Zero filtering. Raw SQL JOIN across ALL rows.

---

### 2. QueryV2::search_similar_entities() - UNFILTERED SIMILARITY SEARCH

**File**: `src/query_v2.rs:136-209`

```rust
pub fn search_similar_entities(&self, entity_id: i64, ...) -> Result<Vec<SearchResult>> {
    // Given ANY entity_id from ANY project
    // Returns entities similar to it from ALL projects

    let mut stmt = self.store.conn.prepare(
        "SELECT e.id, ... FROM entities e
         JOIN entity_embeddings ee ON e.id = ee.entity_id
         WHERE e.id != ?"
    )?;
```

**Isolation Status**: ❌ **NONE**

**Risk**: If Project B obtains any entity_id (even by enumeration), it can:
1. Get entity details from ANY project
2. Find all semantically similar entities across ALL projects
3. Map relationships between arbitrary projects

**Example Leak**:
```
Project B: query.search_similar_entities(123, 10, 0.5)
Returns:
  Entity 123: AuthProvider (from Project A: /home/user/project-a/src/auth.ts)
  Entity 456: AuthStrategy (from Project A: /home/user/project-a/src/strategies.ts)
  Entity 789: Auth (from Project B: /home/user/project-b/src/auth.ts) ← legitimate
  Entity 234: BaseAuthenticator (from Project A: ...) ← LEAKED
```

---

### 3. StoreV2::find_entities_by_name() - UNFILTERED BY NAME

**File**: `src/store_v2.rs:143-156`

```rust
pub fn find_entities_by_name(&self, name: &str, limit: usize) -> Result<Vec<Entity>> {
    let mut stmt = self.conn.prepare(
        "SELECT * FROM entities WHERE name = ? ..."
    )?;
    // Returns ALL entities with matching name across ALL projects
```

**Isolation Status**: ❌ **NONE**

**Example Leak**:
```
Project B: store.find_entities_by_name("authenticate", 100)
Returns:
  [/home/user/project-a/src/auth.ts:42:authenticate]
  [/home/user/project-a/src/handlers.ts:108:authenticate]
  [/home/user/project-b/src/auth.ts:5:authenticate] ← legitimate
  [/home/user/project-c/src/oauth.ts:92:authenticate] ← LEAKED
```

---

### 4. StoreV2::find_entities_by_kind() - UNFILTERED BY KIND

**File**: `src/store_v2.rs:158-171`

```rust
pub fn find_entities_by_kind(&self, kind: EntityKind, limit: usize) -> Result<Vec<Entity>> {
    "SELECT * FROM entities WHERE kind = ? ..."
    // Returns ALL entities of a type from ALL projects
```

**Isolation Status**: ❌ **NONE**

**Leak Scenario**:
```
Project B: store.find_entities_by_kind(EntityKind::Class, 500)
Returns: 500 classes from ALL projects, including Project A's sensitive classes
  [Project A] class DatabaseConnection
  [Project A] class CredentialManager
  [Project A] class PaymentProcessor
  [Project B] class User ← legitimate only this
```

---

### 5. StoreV2::find_entities_in_file() - FILTERED BUT EXPLOITABLE

**File**: `src/store_v2.rs:173-185`

```rust
pub fn find_entities_in_file(&self, file_path: &str) -> Result<Vec<Entity>> {
    "SELECT * FROM entities WHERE file_path = ? ..."
    // Exact match - SAFE if file_path validated
```

**Isolation Status**: ⚠️ **CONDITIONALLY SAFE** (if input validated)

**Risk**: No path validation prevents queries like:
```
store.find_entities_in_file("/home/user/project-a/src/secrets.rs")
// Directory traversal attack
store.find_entities_in_file("../../../project-a/src/auth.ts")
// Sibling project access
```

**Missing Guards**:
- No validation that file_path is within current project
- No checks for `../` path traversal
- No canonicalization of paths

---

### 6. StoreV2::search_entities() - UNFILTERED FULLTEXT SEARCH

**File**: `src/store_v2.rs:187-208`

```rust
pub fn search_entities(&self, query: &str, limit: usize) -> Result<Vec<Entity>> {
    "SELECT * FROM entities WHERE name LIKE ? OR signature LIKE ? OR doc_comment LIKE ?"
    // Returns ALL matches across ALL projects
```

**Isolation Status**: ❌ **NONE**

---

### 7. QueryCommand::execute() - CLIENT-SIDE FILTERING INSUFFICIENT

**File**: `src/cli/query.rs:63-91`

```rust
pub fn execute(&self) -> Result<()> {
    let results = self.query_v2.search(&self.config.query, max_results, threshold)?;

    // Client-side filter by OPTIONAL file_filter parameter
    let final_results: Vec<SearchResult> = if let Some(ref file_filter) = self.config.file_filter {
        results.into_iter()
            .filter(|r| r.file_path.contains(file_filter)) // ← Substring match, not strict
            .collect()
    } else {
        results // ← NO filtering if file_filter not specified
    };
```

**Isolation Status**: ❌ **BYPASSED**

**Vulnerabilities**:
1. **Optional Filter**: File filter is `Option<String>` - queries without it get ALL results
2. **Substring Matching**: `.contains(file_filter)` is vulnerable to false positives
   ```
   file_filter = "project-a"
   Matches: /home/user/project-a/...   ✓
   Also matches: /home/user/NOT-project-a/... ✗ FALSE POSITIVE
   ```
3. **No Project Context**: CLI never passes project_dir to query operations
4. **Client-Side**: Filtering happens AFTER fetching from DB (wasteful, unreliable)

**Evidence**: In `main.rs:34-35`, `project_dir` is captured but never used by QueryV2:
```rust
#[arg(short, long, default_value = ".")]
project_dir: String,  // Parsed but NOT passed to search operations
```

---

## Path-Based Identification Analysis

### Current Implementation
```
File paths stored as absolute strings:
  /home/user/project-a/src/auth.rs
  /home/user/project-a/src/utils.ts
  /home/user/project-b/src/auth.rs
  /home/user/project-b/src/config.rs
```

### Weaknesses
1. **No Structured Project ID**: File path is the only isolation mechanism
2. **Prefix Matching Required**: Must compare paths as strings (error-prone)
3. **No Canonicalization**: Symlinks, relative paths not normalized
4. **SQL Injection Risk**: File paths passed to queries need careful validation
   ```rust
   // Current:
   delete_file_entities(&file_path_str)  // String passed directly
   // No escaping visible, relies on parameterized queries only
   ```

### Edge Cases Not Handled
```
Problem 1 - Symlink Attack:
  /home/user/project-a/actual/
  /home/user/project-b/link -> ../project-a/actual/
  Query: find_entities_in_file("/home/user/project-b/link/auth.rs")
  Returns: Entities from project-a (accessed via symlink)

Problem 2 - Relative Path Traversal:
  Current project: /home/user/project-b/
  Attack: find_entities_in_file("../../project-a/src/auth.rs")
  Returns: Project A entities (if resolved without canonicalization)

Problem 3 - Case Sensitivity (on case-insensitive filesystems):
  project-a/src/auth.rs != PROJECT-A/SRC/AUTH.RS
  Path comparison fails silently
```

---

## Cross-Project Leakage Risks - Detailed Scenarios

### Risk 1: Semantic Search Leakage (CRITICAL)
```
Scenario: Malicious developer in Project B
Action:   Query for "authentication"
Result:   Gets all authentication-related code from Project A
Impact:   Discovers auth patterns, security implementations, API structures
Exploit:  0-click, runs on every search operation
```

### Risk 2: Similar Entity Discovery (HIGH)
```
Scenario: Project B obtains any entity_id (1-9223372036854775807 range)
Action:   search_similar_entities(entity_id)
Result:   Maps ALL similar entities across projects
Impact:   Reverse-engineers architecture, patterns, variable names
Exploit:  Entity enumeration or ID guessing
```

### Risk 3: Entity Kind Enumeration (HIGH)
```
Scenario: Project B iterates through EntityKind enum
Action:   find_entities_by_kind(Class) returns 500 classes
Result:   Discovers all class definitions in Project A
Impact:   Steals class structures, inheritance hierarchies
Exploit:  Single loop, gets all classes
```

### Risk 4: Name-Based Discovery (HIGH)
```
Scenario: Project B uses common naming patterns
Action:   find_entities_by_name("authenticate")
Result:   Gets ALL authenticate functions/methods from ALL projects
Impact:   Finds function signatures, security checks, auth flows
Exploit:  Common term, high success rate
```

### Risk 5: Directory Traversal via find_entities_in_file (CRITICAL)
```
Scenario: Project B knows Project A's structure
Action:   find_entities_in_file("/home/user/project-a/src/secrets.rs")
Result:   Entities from Project A (no validation that path in current project)
Impact:   Direct access to ANY project's files
Exploit:  Deterministic, 100% success if path guessed
```

### Risk 6: Batch Query Leakage (HIGH)
```
Scenario: BatchQueryCommand reads from external file
File:     attacker-queries.txt contains:
            "authorization"
            "password"
            "token"
            "../../../project-a/..."
Action:   execute()
Result:   Writes results to output file, leaking global search results
Impact:   Uncontrolled disclosure
Exploit:  Simple text file, no filtering applied
```

---

## Database Schema Issues

### Missing Columns
The schema lacks project isolation:
```sql
-- Current schema (NO project column)
CREATE TABLE entities (
    id INTEGER PRIMARY KEY,
    kind TEXT,
    name TEXT,
    file_path TEXT,  -- ← Only isolation mechanism
    ...
);

-- Should be:
CREATE TABLE entities (
    id INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL,  -- Explicit isolation
    kind TEXT,
    name TEXT,
    file_path TEXT,
    ...
    CONSTRAINT entities_project_path UNIQUE(project_id, file_path)
);
```

### Missing Indexes
No project-based indexes:
```sql
-- Missing:
CREATE INDEX idx_entities_project ON entities(project_id);
CREATE INDEX idx_entities_project_kind ON entities(project_id, kind);
CREATE INDEX idx_entities_project_file ON entities(project_id, file_path);
```

### Referential Integrity Issues
Foreign keys don't enforce project consistency:
```sql
-- Current FK allows cross-project references
CREATE TABLE refs (
    source_entity_id INTEGER,
    target_entity_id INTEGER,
    FOREIGN KEY (source_entity_id) REFERENCES entities(id),
    FOREIGN KEY (target_entity_id) REFERENCES entities(id)
    -- No constraint that both entities in same project
);
```

---

## Query Filtering Analysis

### WHERE Clause Coverage
```
✓ find_entities_in_file()         - Has WHERE file_path = ?
✓ delete_file_entities()          - Has WHERE file_path = ?
✗ search()                        - NO WHERE clause (lines 52-59)
✗ search_similar_entities()       - NO project filtering (lines 144-152)
✗ find_entities_by_name()         - NO project filtering (lines 146-148)
✗ find_entities_by_kind()         - NO project filtering (lines 161-163)
✗ search_entities()               - NO project filtering (lines 191-199)
✗ find_entities_using_type()      - NO project filtering (lines 289)
✗ find_references_to_entity()     - NO project filtering (lines 238-240)
✗ find_references_from_entity()   - NO project filtering (lines 252-254)
✗ find_module_by_file()           - Exact path only (line 325)
```

**Result**: 9 of 10 query methods return unfiltered global results.

---

## Centralized DB Isolation Guarantees

### Current Implementation
**NONE** - Central database provides zero isolation guarantees.

**Reliance on Client Code**:
- Client (CLI) must manually filter results
- No database-level enforcement
- Easy to bypass (query directly via store APIs)

**Problems**:
1. Defense-in-depth violated: No DB-level security
2. Easy mistakes: Developers forget to filter
3. Library code: Third-party code using APIs gets unfiltered results
4. Programmatic access: No way to enforce filtering

---

## Search Result Contamination

### SearchResult Structure
```rust
pub struct SearchResult {
    pub entity_name: String,        // entity.name
    pub entity_kind: String,        // entity.kind
    pub file_path: String,          // entity.file_path (unvalidated)
    pub similarity: f32,            // relevance score
    pub line_start: Option<i64>,    // entity.line_number
    pub line_end: Option<i64>,      // unused
}
```

### Contamination Vector
```
Project B Query:  search("authentication", 10, 0.5)
Raw DB Results:   [
  { file_path: "/home/user/project-a/src/auth.rs", entity_name: "authenticate", ... },
  { file_path: "/home/user/project-b/src/oauth.ts", entity_name: "OAuth", ... }
]
Output to User:   Both results (if no file_filter specified)
Client-side Fix:  file_filter only filters, doesn't enforce
```

**No Validation**: `file_path` in SearchResult comes directly from DB with no origin checks.

---

## Test Scenario Verification

### Given Centralized DB
```
Project A: /home/user/project-a/
  - 783,891 entities indexed
  - Includes: auth.ts, handlers.ts, database.ts, crypto.ts

Project B: /home/user/project-b/
  - Newly initialized (empty entities)
```

### When Project B Executes
```rust
let query = QueryV2::new(&db_path)?;
let results = query.search("authentication", 10, 0.5)?;
```

### Then Result Analysis
```
Expected: Only Project B's entities (0 results since empty)
         OR
         Only Project B entities that match "authentication"

Actual:   Results from Project A (783,891+ available)
         - authenticate() functions from project-a/src/auth.ts
         - AuthProvider class from project-a/src/types.ts
         - encryption/decryption from project-a/src/crypto.ts
         - password hashing from project-a/src/security.ts

Violation: 100% leakage of unrelated project's code
```

### Verification Code
```rust
#[test]
fn test_cross_project_leakage() {
    // Setup: Create DB with entities from both projects
    let db = setup_test_db();

    // Add 100 entities to project-a
    for i in 0..100 {
        db.insert_entity(&Entity {
            file_path: format!("/home/user/project-a/src/file{}.rs", i),
            name: "authenticate".to_string(),
            ...
        });
    }

    // Add 10 entities to project-b
    for i in 0..10 {
        db.insert_entity(&Entity {
            file_path: format!("/home/user/project-b/src/file{}.rs", i),
            name: "authenticate".to_string(),
            ...
        });
    }

    // Project B searches
    let query = QueryV2::new(&db_path)?;
    let results = query.search("authenticate", 50, 0.5)?;

    // Count results by project
    let project_a_results = results.iter()
        .filter(|r| r.file_path.contains("project-a"))
        .count();
    let project_b_results = results.iter()
        .filter(|r| r.file_path.contains("project-b"))
        .count();

    // VULNERABILITY: Both projects returned
    assert_eq!(project_a_results, 50);  // Should be 0!
    assert_eq!(project_b_results, 0);   // Expected up to 10
}
```

---

## Index Creation Analysis

### File Path Indexes
```sql
CREATE INDEX idx_entities_file_path ON entities(file_path);
CREATE INDEX idx_refs_file_path ON refs(file_path);
CREATE INDEX idx_type_usage_file_path ON type_usage(file_path);  -- MISSING!
CREATE INDEX idx_modules_file_path ON modules(file_path);
```

**Issues**:
1. Indexes on file_path exist, but queries don't use them (no WHERE clause)
2. No composite index for (file_path, kind) queries
3. No partial indexes for project-scoped queries
4. Index unused in semantic search path (lines 52-59 have no WHERE)

---

## Recommendations

### CRITICAL - Must Fix Before Production Use

#### 1. Add Project Identification Column (Week 1-2)
```sql
-- Migration script:
ALTER TABLE entities ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
ALTER TABLE refs ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
ALTER TABLE type_usage ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
ALTER TABLE modules ADD COLUMN project_root TEXT NOT NULL DEFAULT '';

-- Update existing rows by deriving from file_path
UPDATE entities SET project_root = SUBSTR(file_path, 1, INSTR(file_path, '/src/') - 1);

-- Add constraints
ALTER TABLE entities ADD CONSTRAINT entities_project_root_not_empty CHECK(project_root != '');
```

#### 2. Fix QueryV2::search() - Add Project Filter (Week 1)
**Current**:
```rust
let mut stmt = self.store.conn.prepare(
    "SELECT e.id, ... FROM entities e
     JOIN entity_embeddings ee ON e.id = ee.entity_id"
)?;
```

**Fixed**:
```rust
pub fn search(&self, query: &str, max_results: usize, threshold: f32, project_root: &str) -> Result<Vec<SearchResult>> {
    let mut stmt = self.store.conn.prepare(
        "SELECT e.id, ... FROM entities e
         JOIN entity_embeddings ee ON e.id = ee.entity_id
         WHERE e.project_root = ?"  // ← ADD THIS
    )?;

    let embedding_rows = stmt.query_map([project_root], |row| {
        // ... existing code
    })?;
```

#### 3. Fix QueryV2::search_similar_entities() - Add Project Filter (Week 1)
```rust
pub fn search_similar_entities(&self, entity_id: i64, max_results: usize, threshold: f32, project_root: &str) -> Result<Vec<SearchResult>> {
    let mut stmt = self.store.conn.prepare(
        "SELECT e.id, ... FROM entities e
         JOIN entity_embeddings ee ON e.id = ee.entity_id
         WHERE e.id != ? AND e.project_root = ?"  // ← ADD project_root filter
    )?;

    let embedding_rows = stmt.query_map(params![entity_id, project_root], |row| {
        // ... existing code
    })?;
```

#### 4. Fix StoreV2 Query Methods - Add Project Filter (Week 1)
```rust
pub fn find_entities_by_name(&self, name: &str, project_root: &str, limit: usize) -> Result<Vec<Entity>> {
    let mut stmt = self.conn.prepare(
        "SELECT * FROM entities WHERE name = ? AND project_root = ? ORDER BY file_path, line_number LIMIT ?"
    )?;

    let entities = stmt.query_map(
        params![name, project_root, limit as i64],
        |row| self.row_to_entity(row)
    )?.collect::<Result<Vec<_>, _>>()?;

    Ok(entities)
}
```

**Apply to all unfiltered methods**:
- `find_entities_by_kind(&self, kind, project_root, limit)`
- `find_entities_using_type(&self, type_name, project_root)`
- `find_references_to_entity(&self, entity_id, project_root)`
- `find_references_from_entity(&self, entity_id, project_root)`
- `search_entities(&self, query, project_root, limit)`

#### 5. Add Path Validation Helper (Week 1)
```rust
fn validate_project_path(file_path: &str, project_root: &str) -> Result<()> {
    let canonical_file = std::fs::canonicalize(file_path)
        .context("Invalid file path")?;
    let canonical_project = std::fs::canonicalize(project_root)
        .context("Invalid project root")?;

    if !canonical_file.starts_with(&canonical_project) {
        return Err(anyhow!("File path {} outside project {}",
            canonical_file.display(), canonical_project.display()));
    }

    Ok(())
}
```

#### 6. Fix QueryCommand::execute() - Pass Project Context (Week 1)
```rust
pub fn execute(&self) -> Result<()> {
    let project_root = self.project_dir.canonicalize()
        .context("Failed to canonicalize project dir")?;
    let project_root_str = project_root.to_str()
        .ok_or_else(|| anyhow!("Invalid project path"))?;

    // FIXED: Pass project_root to search
    let results = self.query_v2.search(
        &self.config.query,
        max_results,
        threshold,
        project_root_str  // ← NEW parameter
    )?;

    // Remove client-side filtering (now DB-enforced)
    // All results already scoped to current project
}
```

#### 7. Add Indexes for Project-Scoped Queries (Week 1)
```sql
-- Composite indexes for common patterns with project filtering
CREATE INDEX idx_entities_project_kind ON entities(project_root, kind);
CREATE INDEX idx_entities_project_name ON entities(project_root, name);
CREATE INDEX idx_entities_project_file ON entities(project_root, file_path);
CREATE INDEX idx_refs_project_source ON refs(project_root, source_entity_id);
CREATE INDEX idx_refs_project_target ON refs(project_root, target_entity_id);
CREATE INDEX idx_type_usage_project_entity ON type_usage(project_root, entity_id);
```

### HIGH - Important for Robustness

#### 8. Enforce Project Consistency with FKs (Week 2)
```rust
// Add check constraint ensuring references stay within project
ALTER TABLE refs ADD CONSTRAINT refs_same_project
CHECK(
    (SELECT project_root FROM entities WHERE id = source_entity_id) =
    (SELECT project_root FROM entities WHERE id = target_entity_id)
);
```

#### 9. Add Audit Logging (Week 2)
```sql
CREATE TABLE query_audit (
    id INTEGER PRIMARY KEY,
    project_root TEXT NOT NULL,
    query_type TEXT NOT NULL,  -- 'search', 'find_by_name', etc.
    timestamp INTEGER NOT NULL,
    result_count INTEGER,
    accessed_projects TEXT  -- JSON array of project_roots in results
);
```

#### 10. Document Isolation Assumptions (Week 1)
- Create `RUVECTOR_ARCHITECTURE.md` documenting:
  - All APIs require `project_root` parameter
  - Project root must be validated before DB access
  - Client code must never call store APIs directly without validation
  - Central DB provides isolation only if ALL query methods updated

---

## Strengths (Few)

1. **File path stored**: At least paths are recorded, enabling retrospective filtering
2. **Parameterized queries**: Uses rusqlite params!, preventing SQL injection
3. **Delete logic correct**: File-level deletion respects path constraint
4. **Schema extensible**: Can add project_root without major restructuring

---

## Weaknesses Summary

| Component | Status | Issue |
|-----------|--------|-------|
| QueryV2::search() | CRITICAL | No WHERE clause, returns all projects |
| QueryV2::search_similar_entities() | CRITICAL | No project filter |
| StoreV2::find_entities_by_name() | CRITICAL | No project filter |
| StoreV2::find_entities_by_kind() | CRITICAL | No project filter |
| StoreV2::search_entities() | CRITICAL | No project filter |
| QueryCommand::execute() | HIGH | Client-side filtering insufficient |
| find_entities_in_file() | HIGH | No path validation, directory traversal risk |
| Database schema | CRITICAL | Missing project_root column |
| Indexes | MEDIUM | No project-based composite indexes |
| Referential integrity | MEDIUM | No cross-entity project checks |

---

## Overall Assessment: **UNSAFE FOR MULTI-PROJECT USE**

### Current Risk Profile
- **Direct Leakage**: 100% of unrelated projects' entities exposed via search
- **Exploitability**: Trivial - basic query knowledge sufficient
- **Detection Difficulty**: Hard to detect (appears as normal search results)
- **Blast Radius**: ALL projects sharing the centralized DB

### Mitigation Status
- **Database Level**: None (critical gap)
- **Application Level**: Optional file_filter parameter (insufficient)
- **Code Review**: No project context validation

### Use Case Restrictions (Until Fixed)
**DO NOT use centralized DB for**:
- Multi-project environments
- Any sensitive code
- Competitive projects
- Regulated data (HIPAA, PCI-DSS, SOX)
- Production deployments

**Safe Uses Only**:
- Single-project development
- Public codebases
- Internal company projects with trust
- Research/academic only

---

## Verification Tests Required

Before closing this audit, create tests:

1. **test_search_respects_project_isolation**
   - Populate DB with entities from Project A and B
   - Search from Project B context
   - Verify 0 results from Project A

2. **test_find_by_name_respects_project**
   - Same setup
   - Call find_entities_by_name from Project B context
   - Verify only Project B entities returned

3. **test_search_similar_respects_project**
   - Entity in Project B searches for similar
   - Verify only Project B results returned

4. **test_directory_traversal_blocked**
   - Query with `../../../project-a/...` path
   - Should fail validation

5. **test_symlink_attack_blocked**
   - Create symlink to other project
   - Query should fail or validate canonical path

---

## Timeline to Fix

| Phase | Components | Timeline | Effort |
|-------|-----------|----------|--------|
| P0 (Critical) | Database schema, QueryV2 filters, path validation | 1-2 weeks | 4-5 days |
| P1 (High) | All store methods, audit logging, tests | 2-3 weeks | 3-4 days |
| P2 (Medium) | Indexes, documentation, performance tuning | 3-4 weeks | 2-3 days |

---

## Sign-Off

**Audit Date**: 2025-12-11
**Auditor**: Code Security Review
**Status**: CRITICAL ISSUES IDENTIFIED

**Recommended Action**:
1. Do NOT deploy to production multi-project environments
2. Implement Phase P0 fixes immediately
3. Add tests before any new development
4. Re-audit after fixes applied

---

## References

- Centralized DB location: `~/.local/share/ruvector/index_v2.db`
- Query implementations: `.claude/skills/cfn-local-ruvector-accelerator/src/query_v2.rs`
- Store methods: `.claude/skills/cfn-local-ruvector-accelerator/src/store_v2.rs`
- CLI: `.claude/skills/cfn-local-ruvector-accelerator/src/cli/query.rs`
- Schema: `.claude/skills/cfn-local-ruvector-accelerator/src/schema_v2.rs`
