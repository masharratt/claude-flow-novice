# IMMEDIATE ACTION REQUIRED: RuVector Data Loss Vulnerability

**Date**: 2025-12-11
**Severity**: 🔴 **CRITICAL**
**Status**: UNSAFE FOR PRODUCTION USE

---

## Executive Summary

The RuVector indexing system has a **critical data loss vulnerability** when operating with a centralized database shared across multiple projects. Reindexing one project can **accidentally delete data from other projects** with identical relative file paths.

**Impact**: ALL projects sharing common file names (e.g., `main.rs`, `lib.rs`, `index.ts`) are at risk.

---

## Vulnerability Details

### Root Cause
- Centralized database location: `~/.local/share/ruvector/index_v2.db`
- File paths stored as **relative paths** (e.g., `src/main.rs`)
- DELETE query lacks project discriminator: `DELETE FROM entities WHERE file_path = ?`

### Reproduction Scenario

```bash
# Setup
cd ~/project-a && local-ruvector index src/
# → Stores entities with file_path="src/main.rs"

cd ~/project-b && local-ruvector index src/
# → Stores entities with file_path="src/main.rs"

# Trigger bug
cd ~/project-a && local-ruvector index --force src/
# → DELETE FROM entities WHERE file_path = 'src/main.rs'
# → Deletes BOTH project-a AND project-b entities!
```

**Result**: Project B's data is silently deleted when reindexing Project A.

---

## Affected Operations

### 1. Reindexing Files (`local-ruvector index --force`)
- **Risk**: Deletes all entities with matching relative path across ALL projects
- **Detection**: Silent (no errors, no warnings)
- **Recovery**: Requires full reindex of affected projects

### 2. Modified File Indexing
- **Risk**: Same as above for any modified files
- **Trigger**: Automatic on file change detection

### 3. Cleanup Operations
- **Risk**: Potential over-deletion if using relative paths

---

## Immediate Mitigation Steps

### Option 1: Disable Centralized Database (FASTEST - 5 minutes)

```bash
# Temporarily switch to per-project databases
# Edit src/paths.rs:

pub fn get_database_path(project_root: &Path) -> Result<PathBuf> {
    Ok(project_root.join(".ruvector").join("index_v2.db"))
}
```

**Pros**: Eliminates cross-project risk immediately
**Cons**: Loses centralized search capability
**Revert Time**: Easy (restore original paths.rs)

---

### Option 2: Add Project Root Validation (RECOMMENDED - 2 hours)

```rust
// src/store_v2.rs - delete_file_entities()
pub fn delete_file_entities(&self, file_path: &str, project_root: &str) -> Result<()> {
    // Validate file path is within project root
    if !file_path.starts_with(project_root) {
        return Err(anyhow!(
            "File path '{}' is not within project root '{}'",
            file_path, project_root
        ));
    }

    // Add project_root filter to WHERE clause
    self.conn.execute(
        "DELETE FROM entities WHERE file_path = ? AND file_path LIKE ?",
        params![file_path, format!("{}%", project_root)]
    )?;

    // ... rest of delete operations with same filtering
}

// Update all callers
// src/cli/index.rs:246
let project_root = self.project_dir.to_string_lossy();
self.store_v2.delete_file_entities(&file_path_str, &project_root)?;
```

**Pros**: Maintains centralized DB, prevents cross-project deletion
**Cons**: Requires updating 5-10 call sites
**Testing**: Run `tests/test_multi_project_safety.rs`

---

### Option 3: Use Absolute Paths (SAFEST - 4 hours)

```rust
// src/cli/index.rs:245
// Change from relative to absolute paths
let file_path_absolute = file_path.canonicalize()
    .context("Failed to get absolute path")?;
let file_path_str = file_path_absolute.to_string_lossy();

self.store_v2.delete_file_entities(&file_path_str)?;
```

**Pros**: Natural isolation, no schema changes needed
**Cons**: Changes existing data format, requires migration
**Migration**: Update all existing `file_path` values to absolute

---

## Recommended Action Plan

### Phase 1: Immediate Hotfix (Deploy Today)
**Timeline**: 2-4 hours

```bash
# 1. Implement Option 2 (Add project_root parameter)
# Files to modify:
- src/store_v2.rs:delete_file_entities()
- src/cli/index.rs:process_file()
- src/cli/index_ast.rs (if used)

# 2. Add validation
if !file_path.starts_with(project_root) {
    return Err(anyhow!("Path outside project root"));
}

# 3. Update WHERE clauses
WHERE file_path = ? AND file_path LIKE ?
params![file_path, format!("{}%", project_root)]

# 4. Test with multi-project scenario
cargo test test_cross_project_data_deletion_vulnerability

# 5. Deploy as patch (v2.0.1)
```

---

### Phase 2: Schema Enhancement (Within 1 Week)
**Timeline**: 2-3 days

```sql
-- Add project_root column
ALTER TABLE entities ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
ALTER TABLE refs ADD COLUMN project_root TEXT NOT NULL DEFAULT '';
ALTER TABLE type_usage ADD COLUMN project_root TEXT NOT NULL DEFAULT '';

-- Add indexes
CREATE INDEX idx_entities_project_file ON entities(project_root, file_path);

-- Add CHECK constraint (enforce absolute paths)
ALTER TABLE entities ADD CONSTRAINT chk_absolute_path
  CHECK (file_path LIKE '/%' OR file_path LIKE '[A-Z]:\%');

-- Backfill existing data
UPDATE entities SET project_root = substr(file_path, 1, instr(file_path, '/src') - 1);
```

---

### Phase 3: Transaction Wrapping (Within 2 Weeks)
**Timeline**: 1-2 days

```rust
// Wrap DELETE+INSERT in transaction for atomicity
pub fn process_file(&self, file_path: &Path, ...) -> Result<()> {
    let store_tx = StoreV2WithTx::new(&get_database_path()?)?;

    store_tx.index_file_atomic(&file_path_str, &file_hash, |tx| {
        delete_file_entities_tx(tx, &file_path_str, &project_root)?;
        let extraction_result = self.process_ast_extraction(file_path, &content)?;
        insert_entities_tx(tx, &extraction_result.entities)?;
        Ok(())
    })?;
}
```

---

## Testing Checklist

Before deploying fixes:

- [ ] Run `cargo test test_cross_project_data_deletion_vulnerability`
- [ ] Run `cargo test test_reindex_with_absolute_paths_is_safe`
- [ ] Run `cargo test test_partial_path_overlap_safety`
- [ ] Run `cargo test test_full_reindex_workflow_without_transactions`
- [ ] Manual test: Index 2 projects with same file names, reindex one, verify other intact
- [ ] Performance test: Benchmark query time with new WHERE clause
- [ ] Rollback test: Verify migration can be reverted

---

## Rollback Procedure

If hotfix causes issues:

```bash
# 1. Revert code changes
git revert <commit-hash>

# 2. Redeploy previous version
cargo build --release
./target/release/local-ruvector --version

# 3. Document issue and replan fix
```

---

## Communication Plan

### Internal Team
- [ ] Alert all developers immediately
- [ ] Block production deployments until fixed
- [ ] Schedule emergency review meeting

### Users (if applicable)
- [ ] Send security advisory with mitigation steps
- [ ] Provide backup/restore instructions
- [ ] Offer support for data recovery if needed

---

## Success Criteria

**Phase 1 Complete When**:
- ✅ `delete_file_entities()` requires `project_root` parameter
- ✅ All DELETE queries filter by `project_root` prefix
- ✅ Path validation rejects files outside `project_root`
- ✅ All multi-project tests pass
- ✅ No regression in single-project usage
- ✅ Performance within 5% of baseline

**Phase 2 Complete When**:
- ✅ Schema migration deployed
- ✅ All existing data backfilled with `project_root`
- ✅ CHECK constraints enforced
- ✅ Query performance validated (indexes working)

**Phase 3 Complete When**:
- ✅ All reindex operations wrapped in transactions
- ✅ Partial failure tests pass (rollback verified)
- ✅ Concurrent reindex tests pass (no race conditions)

---

## Additional Resources

- **Full Audit Report**: `DATABASE_SAFETY_AUDIT.md`
- **Test Suite**: `tests/test_multi_project_safety.rs`
- **Transaction Tests**: `src/transaction_tests.rs`
- **Security Tests**: `src/security_tests.rs`

---

## Questions & Support

**Primary Contact**: Database Architect Agent
**Escalation**: CTO/Engineering Lead
**Timeline**: Phase 1 hotfix MUST deploy within 24 hours

---

## Revision History

| Date       | Version | Changes                                    |
|------------|---------|-------------------------------------------|
| 2025-12-11 | 1.0     | Initial vulnerability report and action plan |
