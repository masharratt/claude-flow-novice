# RuVector Security Remediation Guide

## Overview
This guide provides specific code changes to remediate the 6 critical/high security findings identified in the RuVector init system audit.

---

## REMEDIATION #1: Implement Backup Before Reset

**File:** `.claude/skills/cfn-local-ruvector-accelerator/src/cli/reset.rs`
**Current Risk:** Complete data loss without backup
**Severity:** CRITICAL

### Current Code
```rust
pub fn execute(&self) -> Result<()> {
    let ruvector_dir = self.project_dir.join(".ruvector");

    if !self.confirm {
        eprintln!("⚠️  This will delete all indexed data!");
        eprintln!("To proceed, run with --confirm");
        return Ok(());
    }

    if ruvector_dir.exists() {
        fs::remove_dir_all(&ruvector_dir)?;  // UNSAFE: No backup!
        info!("Reset complete: removed .ruvector directory");
    } else {
        info!("No RuVector data found to reset");
    }

    Ok(())
}
```

### Recommended Fix
```rust
use chrono::Local;
use std::path::PathBuf;

pub fn execute(&self) -> Result<()> {
    let ruvector_dir = self.project_dir.join(".ruvector");

    if !self.confirm {
        eprintln!("⚠️  This will delete all indexed data!");
        eprintln!("To proceed, run with --confirm");
        return Ok(());
    }

    if ruvector_dir.exists() {
        // STEP 1: Create timestamped backup FIRST
        let backup_dir = self.create_timestamped_backup(&ruvector_dir)?;
        info!("Created backup at: {}", backup_dir.display());

        // STEP 2: Then proceed with deletion
        fs::remove_dir_all(&ruvector_dir)?;
        info!("Reset complete: removed .ruvector directory");
        info!("Backup preserved at: {}", backup_dir.display());

        // STEP 3: Log the operation
        self.log_deletion_event(&backup_dir)?;
    } else {
        info!("No RuVector data found to reset");
    }

    Ok(())
}

fn create_timestamped_backup(&self, source_dir: &Path) -> Result<PathBuf> {
    use std::fs::create_dir_all;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir = self.project_dir.join(".ruvector_backups")
        .join(format!("backup_{}", timestamp));

    create_dir_all(&backup_dir)?;

    // Copy entire directory
    copy_dir_recursive(source_dir, &backup_dir)?;

    debug!("Backup created: {}", backup_dir.display());
    Ok(backup_dir)
}

fn log_deletion_event(&self, backup_location: &Path) -> Result<()> {
    let log_entry = format!(
        "[{}] Reset command executed. Backup: {}",
        Local::now().to_rfc3339(),
        backup_location.display()
    );

    // Write to audit log
    let audit_log = self.project_dir.join(".ruvector_audit.log");
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&audit_log)?
        .write_all(format!("{}\n", log_entry).as_bytes())?;

    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let path = entry.path();
        let file_name = entry.file_name();
        let new_path = dst.join(file_name);

        if ty.is_dir() {
            copy_dir_recursive(&path, &new_path)?;
        } else {
            fs::copy(&path, &new_path)?;
        }
    }

    Ok(())
}
```

### Verification
```rust
#[test]
fn test_reset_creates_backup_before_deletion() {
    let temp_dir = tempdir().unwrap();
    let test_dir = temp_dir.path();

    // Create test data
    let ruvector = test_dir.join(".ruvector");
    fs::create_dir(&ruvector).unwrap();
    fs::write(ruvector.join("test.txt"), "important data").unwrap();

    // Execute reset with confirm
    let cmd = ResetCommand::new(test_dir, true);
    cmd.execute().unwrap();

    // Verify backup exists
    let backups = test_dir.join(".ruvector_backups");
    assert!(backups.exists());
    assert!(backups.join("backup_*").exists());

    // Verify original was deleted
    assert!(!ruvector.exists());
}
```

---

## REMEDIATION #2: Change CASCADE to RESTRICT

**File:** `.claude/skills/cfn-local-ruvector-accelerator/src/schema_v2.rs`
**Current Risk:** Uncontrolled cascading deletes
**Severity:** CRITICAL

### Current Code (Lines 232-283)
```sql
CREATE TABLE IF NOT EXISTS entities (
    ...
    parent_id INTEGER,
    ...
    FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE CASCADE  -- UNSAFE!
);

CREATE TABLE IF NOT EXISTS refs (
    ...
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE  -- UNSAFE!
);

CREATE TABLE IF NOT EXISTS entity_embeddings (
    entity_id INTEGER PRIMARY KEY,
    ...
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE  -- UNSAFE!
);
```

### Recommended Fix
```sql
CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    ...
    parent_id INTEGER,
    ...
    -- Change CASCADE to RESTRICT to prevent silent cascades
    FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE RESTRICT
);

-- Create audit trigger to log deletions
CREATE TRIGGER IF NOT EXISTS log_entity_deletion
    BEFORE DELETE ON entities
    FOR EACH ROW
BEGIN
    INSERT INTO deletion_audit_log (
        table_name,
        entity_id,
        entity_kind,
        deleted_at,
        deletion_method
    ) VALUES (
        'entities',
        OLD.id,
        OLD.kind,
        strftime('%s', 'now'),
        'direct_delete'
    );
END;

CREATE TABLE IF NOT EXISTS refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_entity_id INTEGER NOT NULL,
    ...
    -- RESTRICT prevents cascading deletes
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS entity_embeddings (
    entity_id INTEGER PRIMARY KEY,
    ...
    -- RESTRICT prevents orphaned embeddings
    FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT
);

-- Add audit log table
CREATE TABLE IF NOT EXISTS deletion_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    entity_id INTEGER,
    entity_kind TEXT,
    deleted_at INTEGER NOT NULL,
    deletion_method TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_timestamp
    ON deletion_audit_log(deleted_at);
```

### Handling RESTRICT Violations
```rust
pub fn safe_delete_entity(&self, entity_id: i64) -> Result<()> {
    // First check for dependent records
    let ref_count: i64 = self.conn.query_row(
        "SELECT COUNT(*) FROM refs WHERE source_entity_id = ?",
        [entity_id],
        |row| row.get(0)
    )?;

    if ref_count > 0 {
        return Err(anyhow!(
            "Cannot delete entity: {} references depend on this entity. \
             Use force_delete_with_cascade() to remove all dependent data.",
            ref_count
        ));
    }

    // Safe to delete
    self.conn.execute("DELETE FROM entities WHERE id = ?", [entity_id])?;
    Ok(())
}

pub fn force_delete_with_cascade(&self, entity_id: i64) -> Result<()> {
    // Only called with explicit user approval
    let mut tx = self.conn.transaction()?;

    // Delete in dependency order (children first)
    tx.execute("DELETE FROM entity_embeddings WHERE entity_id = ?", [entity_id])?;
    tx.execute("DELETE FROM type_usage WHERE entity_id = ?", [entity_id])?;
    tx.execute("DELETE FROM refs WHERE source_entity_id = ?", [entity_id])?;
    tx.execute("DELETE FROM entities WHERE id = ?", [entity_id])?;

    // Log the cascade
    tx.execute(
        "INSERT INTO deletion_audit_log (table_name, entity_id, deletion_method) \
         VALUES ('entities', ?, 'force_cascade_delete')",
        [entity_id]
    )?;

    tx.commit()?;
    Ok(())
}
```

---

## REMEDIATION #3: Add Preview Mode to Cleanup

**File:** `.claude/skills/cfn-local-ruvector-accelerator/src/cli/cleanup.rs`
**Current Risk:** Deletion without visibility into impact
**Severity:** HIGH

### Current Code
```rust
fn remove_old_embeddings(&self, store: &SqliteStore, days: u32) -> Result<()> {
    info!("Removing embeddings older than {} days", days);

    let cutoff = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs() - (days as u64 * 86400);

    let removed = if self.dry_run {
        store.count_old_embeddings(cutoff)?
    } else {
        store.remove_old_embeddings(cutoff)?  // UNSAFE: No preview!
    };

    if self.dry_run {
        info!("Would remove {} old embeddings", removed);
    } else {
        info!("Removed {} old embeddings", removed);
    }

    Ok(())
}
```

### Recommended Fix
```rust
pub struct CleanupCommand {
    // ... existing fields ...
    preview: bool,  // NEW: Add preview flag
    backup_before_delete: bool,  // NEW: Backup deleted records
}

impl CleanupCommand {
    pub fn execute(&self) -> Result<()> {
        info!("Starting cleanup process");

        if self.dry_run {
            info!("Running in dry-run mode - no changes will be made");
        }

        // STEP 1: Preview what will be deleted
        let preview = self.preview_cleanup()?;
        println!("\n{}", self.format_cleanup_preview(&preview));

        if self.preview {
            info!("Preview mode: showing what would be deleted");
            return Ok(());
        }

        // STEP 2: Get confirmation unless forced
        if !self.force && !self.dry_run {
            eprintln!("\n⚠️  This will permanently delete records above.");
            eprintln!("Run with --force to proceed, or --preview to see without changes.");
            return Ok(());
        }

        // STEP 3: Backup deleted records if requested
        if self.backup_before_delete {
            self.export_cleanup_records(&preview)?;
        }

        // STEP 4: Execute cleanup
        self.execute_cleanup(&preview)?;

        Ok(())
    }

    fn preview_cleanup(&self) -> Result<CleanupPreview> {
        let store = SqliteStore::new(&self.project_dir.join(".ruvector").join("index.db"))?;

        let mut preview = CleanupPreview::default();

        if let Some(days) = self.older_than {
            let cutoff = SystemTime::now()
                .duration_since(UNIX_EPOCH)?
                .as_secs() - (days as u64 * 86400);
            preview.old_embeddings_count = store.count_old_embeddings(cutoff)?;
            preview.oldest_embedding_date = store.find_oldest_embedding_before(cutoff)?;
        }

        if self.remove_orphans {
            preview.orphaned_embeddings_count = store.count_orphaned_embeddings()?;
        }

        Ok(preview)
    }

    fn format_cleanup_preview(&self, preview: &CleanupPreview) -> String {
        let mut output = String::from("\n=== Cleanup Preview ===\n");

        if let Some(count) = preview.old_embeddings_count {
            output.push_str(&format!(
                "  Old embeddings (>{} days): {}\n",
                self.older_than.unwrap_or(30),
                count
            ));
            if let Some(date) = &preview.oldest_embedding_date {
                output.push_str(&format!("  Oldest embedding from: {}\n", date));
            }
        }

        if let Some(count) = preview.orphaned_embeddings_count {
            output.push_str(&format!("  Orphaned embeddings: {}\n", count));
        }

        output
    }

    fn export_cleanup_records(&self, preview: &CleanupPreview) -> Result<()> {
        let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
        let export_path = self.project_dir
            .join(".ruvector_backups")
            .join(format!("cleanup_export_{}.json", timestamp));

        fs::create_dir_all(export_path.parent().unwrap())?;

        // Export records before deletion
        let records = self.collect_records_for_deletion()?;
        let json = serde_json::to_string_pretty(&records)?;
        fs::write(&export_path, json)?;

        info!("Exported {} records to: {}", records.len(), export_path.display());
        Ok(())
    }
}

#[derive(Debug, Default)]
struct CleanupPreview {
    old_embeddings_count: Option<usize>,
    oldest_embedding_date: Option<String>,
    orphaned_embeddings_count: Option<usize>,
}
```

---

## REMEDIATION #4: Preserve Migration Backups

**File:** `.claude/skills/cfn-local-ruvector-accelerator/src/migration.rs`
**Current Risk:** Immediate loss of backup after migration
**Severity:** CRITICAL

### Current Code
```rust
fn cleanup_after_migration(&self, old_version: u32) -> Result<()> {
    // ... validation code ...

    // Drop backup tables after successful migration
    self.conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS embeddings_v1_backup;
        DROP TABLE IF EXISTS files_v1_backup;
        "#
    )?;

    self.conn.execute("VACUUM", [])?;
    Ok(())
}
```

### Recommended Fix
```rust
const BACKUP_RETENTION_DAYS: u32 = 7;

fn cleanup_after_migration(&self, old_version: u32) -> Result<()> {
    info!("Cleaning up after migration from version {}", old_version);

    // Verify migration was successful
    let new_entities_count: i64 = self.conn.query_row(
        "SELECT COUNT(*) FROM entities",
        [],
        |row| row.get(0)
    )?;

    if new_entities_count == 0 && old_version > 0 {
        warn!("No entities found after migration, keeping backup tables");
        return Ok(());
    }

    // Create recovery record BEFORE dropping backups
    self.create_backup_recovery_record(old_version)?;

    // Check backup retention policy
    let should_keep_backup = self.should_keep_backup(old_version)?;

    if should_keep_backup {
        info!("Keeping backup tables for {} days (recovery period)", BACKUP_RETENTION_DAYS);
        return Ok(());
    }

    // Safe to drop backups - but create export first
    info!("Exporting backup data before cleanup");
    self.export_backup_tables()?;

    // ONLY NOW drop backup tables
    self.conn.execute_batch(
        r#"
        DROP TABLE IF EXISTS embeddings_v1_backup;
        DROP TABLE IF EXISTS files_v1_backup;
        "#
    )?;

    info!("Backup tables dropped successfully");

    // Run VACUUM to reclaim space
    debug!("Running VACUUM to reclaim database space");
    self.conn.execute("VACUUM", [])?;

    Ok(())
}

fn should_keep_backup(&self, old_version: u32) -> Result<bool> {
    // Check when migration was done
    let migration_time: i64 = self.conn.query_row(
        "SELECT applied_at FROM schema_version WHERE version = ? LIMIT 1",
        [old_version],
        |row| row.get(0)
    )?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs() as i64;

    let age_days = (now - migration_time) / (24 * 3600);

    Ok(age_days < BACKUP_RETENTION_DAYS as i64)
}

fn create_backup_recovery_record(&self, old_version: u32) -> Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs();

    self.conn.execute(
        "INSERT INTO migration_recovery (
            source_version, target_version, backup_created_at,
            backup_expires_at, status
         ) VALUES (?, ?, ?, ?, 'active')",
        rusqlite::params![
            old_version,
            2,
            now,
            now + (BACKUP_RETENTION_DAYS as u64 * 24 * 3600)
        ]
    )?;

    Ok(())
}

fn export_backup_tables(&self) -> Result<()> {
    use chrono::Local;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir = self.db_path
        .parent()
        .unwrap()
        .join(format!("migration_backup_{}", timestamp));

    fs::create_dir_all(&backup_dir)?;

    // Export v1 embeddings
    let mut stmt = self.conn.prepare(
        "SELECT pattern, embedding, metadata FROM embeddings_v1_backup"
    )?;

    let embeddings_file = fs::File::create(backup_dir.join("embeddings.json"))?;
    let writer = io::BufWriter::new(embeddings_file);

    // ... write JSON records ...

    info!("Backup exported to: {}", backup_dir.display());
    Ok(())
}
```

---

## REMEDIATION #5: Protect index_all.sh

**File:** `.claude/skills/cfn-local-ruvector-accelerator/index_all.sh`
**Current Risk:** Unconditional index deletion
**Severity:** CRITICAL

### Current Code
```bash
#!/bin/bash
# Index all files in the project

echo "Starting comprehensive indexing of all files..."
cd .claude/skills/cfn-local-ruvector-accelerator

# Clear existing index
rm -rf index/  # UNSAFE: No confirmation, no backup!
```

### Recommended Fix
```bash
#!/bin/bash
# Index all files in the project

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INDEX_DIR="$SCRIPT_DIR/index"
PRESERVE_INDEX="${PRESERVE_INDEX:-false}"
BACKUP_INDEX="${BACKUP_INDEX:-true}"

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

# Function to backup index
backup_index() {
    if [[ ! -d "$INDEX_DIR" ]]; then
        return 0
    fi

    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="${INDEX_DIR}_backup_${timestamp}"

    log_info "Creating backup: $backup_dir"
    cp -r "$INDEX_DIR" "$backup_dir"
    log_info "Backup created successfully"
}

# Function to clear index
clear_index() {
    if [[ ! -d "$INDEX_DIR" ]]; then
        log_info "No existing index to clear"
        return 0
    fi

    if [[ "$BACKUP_INDEX" == "true" ]]; then
        backup_index
    fi

    log_info "Clearing index directory"
    rm -rf "$INDEX_DIR"

    # Log the action
    {
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Index cleared"
    } >> "$SCRIPT_DIR/.index_audit.log"
}

# Show usage
show_usage() {
    cat << 'EOF'
Usage: ./index_all.sh [OPTIONS]

Options:
  --preserve-index    Keep existing index (incremental update)
  --no-backup        Don't backup before clearing
  --force            Force re-indexing all files

Environment:
  PRESERVE_INDEX=true ./index_all.sh
  BACKUP_INDEX=false ./index_all.sh
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --preserve-index)
            PRESERVE_INDEX=true
            shift
            ;;
        --no-backup)
            BACKUP_INDEX=false
            shift
            ;;
        --force)
            # Force reindexing (default behavior after clear)
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

log_info "Starting comprehensive indexing of all files..."
cd "$SCRIPT_DIR"

# Clear or preserve index
if [[ "$PRESERVE_INDEX" == "true" ]]; then
    log_info "Preserving existing index (incremental mode)"
else
    log_info "Index will be cleared and rebuilt"
    clear_index
fi

# ... rest of indexing code ...
```

---

## REMEDIATION #6: Protect Test Script Cleanup

**File:** `.claude/skills/cfn-local-ruvector-accelerator/test-local-ruvector.sh`
**Current Risk:** Unprotected directory deletion via variables
**Severity:** MEDIUM

### Current Code
```bash
# Clean up previous test
rm -rf "$STORAGE_PATH" "$TEST_DIR"
```

### Recommended Fix
```bash
#!/bin/bash
# test-local-ruvector.sh - Test Local RuVector implementation

set -euo pipefail

# Use mktemp for safer temporary directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STORAGE_PATH="$(mktemp -d -t ruvector-test-storage-XXXXXX)"
TEST_DIR="$(mktemp -d -t ruvector-test-project-XXXXXX)"

# Cleanup trap - only runs on exit
cleanup() {
    local exit_code=$?

    if [[ -d "$STORAGE_PATH" ]]; then
        echo "Cleaning up test storage: $STORAGE_PATH"
        rm -rf "$STORAGE_PATH"
    fi

    if [[ -d "$TEST_DIR" ]]; then
        echo "Cleaning up test directory: $TEST_DIR"
        rm -rf "$TEST_DIR"
    fi

    exit $exit_code
}

trap cleanup EXIT

# Verify paths are safe (sanity checks)
if [[ ! "$STORAGE_PATH" =~ ^/tmp/ruvector-test-storage ]]; then
    echo "ERROR: Invalid storage path: $STORAGE_PATH" >&2
    exit 1
fi

if [[ ! "$TEST_DIR" =~ ^/tmp/ruvector-test-project ]]; then
    echo "ERROR: Invalid test directory: $TEST_DIR" >&2
    exit 1
fi

# Verify paths don't exist or are empty
if [[ -d "$STORAGE_PATH" && -n $(find "$STORAGE_PATH" -type f 2>/dev/null | head -1) ]]; then
    echo "ERROR: Storage path not empty: $STORAGE_PATH" >&2
    exit 1
fi

echo "🧪 Testing Local RuVector Accelerator..."
echo "Storage: $STORAGE_PATH"
echo "Test Dir: $TEST_DIR"

mkdir -p "$TEST_DIR"

# ... rest of test code ...
# Note: cleanup happens automatically via trap on exit
```

---

## Implementation Checklist

- [ ] Remediation #1: Reset backup mechanism implemented
- [ ] Remediation #2: CASCADE changed to RESTRICT
- [ ] Remediation #3: Cleanup preview mode added
- [ ] Remediation #4: Migration backups retained 7 days
- [ ] Remediation #5: index_all.sh protected
- [ ] Remediation #6: Test script cleanup protected
- [ ] Unit tests added for each remediation
- [ ] Integration tests verify fixes
- [ ] Backward compatibility verified
- [ ] Performance impact assessed
- [ ] Deployment plan documented
- [ ] Team review completed
- [ ] Production deployment approved

---

## Testing Strategy

Each remediation should include:
1. Unit test for the specific fix
2. Integration test with real data
3. Edge case testing (empty dirs, permissions, etc.)
4. Concurrent operation testing
5. Recovery/rollback testing

---

## Deployment Order

1. First: Implement backups (Remediation #1, #4)
2. Second: Add constraints (Remediation #2)
3. Third: Enhance UX (Remediation #3)
4. Fourth: Script fixes (Remediation #5, #6)
5. Finally: Full integration test and production deployment

---

## Success Criteria

- All destructive operations have backups
- No silent cascading deletes
- All dangerous operations require explicit confirmation
- Audit trail exists for all deletions
- Recovery mechanism available for 7+ days
- Tests pass 100%
- No performance regression
- All findings marked REMEDIATED
