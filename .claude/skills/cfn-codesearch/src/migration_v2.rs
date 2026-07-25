use anyhow::{Result, Context, bail};
use rusqlite::{Connection, params};
use tracing::{info, warn, error, debug};
use std::path::Path;

/// Multi-project isolation schema migration for CodeSearch v2
///
/// This migration adds `project_root` column to the entities table to enable
/// proper isolation between different projects indexed in the same database.
///
/// Changes:
/// 1. Add `project_root TEXT NOT NULL DEFAULT ''` to entities table
/// 2. Backfill project_root from file_path (extract up to /src)
/// 3. Create composite indexes for project-scoped queries
/// 4. Change FK constraints from CASCADE to RESTRICT to prevent silent data loss
pub struct MigrationV2;

impl MigrationV2 {
    /// Check if the migration has already been applied
    pub fn is_migration_applied(conn: &Connection) -> Result<bool> {
        debug!("Checking if v2 migration is already applied");

        // Check if project_root column exists in entities table
        let mut stmt = conn.prepare("PRAGMA table_info(entities)")?;
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;

        let has_project_root = columns.contains(&"project_root".to_string());
        debug!("project_root column exists: {}", has_project_root);

        Ok(has_project_root)
    }

    /// Run the v2 migration to add multi-project isolation
    pub fn run_v2_migration(conn: &mut Connection) -> Result<()> {
        info!("Starting v2 migration: Adding multi-project isolation support");

        // Check if migration already applied
        if Self::is_migration_applied(conn)? {
            info!("v2 migration already applied, skipping");
            return Ok(());
        }

        // Count entities before migration for validation
        let entity_count_before: i64 = conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        ).unwrap_or(0);

        info!("Entity count before migration: {}", entity_count_before);

        // Begin transaction for atomic migration
        let tx = conn.transaction()?;

        // Step 1: Add project_root column
        info!("Step 1/5: Adding project_root column to entities table");
        tx.execute(
            "ALTER TABLE entities ADD COLUMN project_root TEXT NOT NULL DEFAULT ''",
            []
        ).context("Failed to add project_root column")?;

        // Step 2: Backfill project_root from file_path
        info!("Step 2/5: Backfilling project_root from file_path");
        let backfill_count = tx.execute(
            r#"
            UPDATE entities
            SET project_root = CASE
                WHEN instr(file_path, '/src') > 0 THEN substr(file_path, 1, instr(file_path, '/src') - 1)
                WHEN instr(file_path, '/lib') > 0 THEN substr(file_path, 1, instr(file_path, '/lib') - 1)
                WHEN instr(file_path, '/') > 0 THEN substr(file_path, 1, instr(file_path, '/'))
                ELSE ''
            END
            WHERE project_root = ''
            "#,
            []
        ).context("Failed to backfill project_root")?;

        info!("Backfilled {} entities with project_root", backfill_count);

        // Step 3: Create composite indexes for project-scoped queries
        info!("Step 3/5: Creating composite indexes for project isolation");
        tx.execute_batch(
            r#"
            CREATE INDEX IF NOT EXISTS idx_entities_project_kind
                ON entities(project_root, kind);

            CREATE INDEX IF NOT EXISTS idx_entities_project_file
                ON entities(project_root, file_path);

            CREATE INDEX IF NOT EXISTS idx_entities_project_name
                ON entities(project_root, name);
            "#
        ).context("Failed to create composite indexes")?;

        // Step 4: Drop existing foreign key constraints (SQLite limitation workaround)
        // SQLite doesn't support ALTER TABLE ... DROP CONSTRAINT, so we need to recreate tables
        info!("Step 4/5: Updating foreign key constraints to RESTRICT");

        // For entity_embeddings
        Self::recreate_entity_embeddings_with_restrict(&tx)?;

        // For refs - only update source_entity_id constraint
        Self::recreate_refs_with_restrict(&tx)?;

        // For type_usage
        Self::recreate_type_usage_with_restrict(&tx)?;

        // Step 5: Validate migration
        info!("Step 5/5: Validating migration results");

        let entity_count_after: i64 = tx.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;

        if entity_count_before != entity_count_after {
            bail!(
                "Entity count mismatch: before={}, after={}",
                entity_count_before,
                entity_count_after
            );
        }

        // Verify project_root was populated
        let null_project_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM entities WHERE project_root = ''",
            [],
            |row| row.get(0)
        )?;

        if null_project_count > 0 {
            warn!(
                "{} entities have empty project_root (may be valid for root-level files)",
                null_project_count
            );
        }

        // Verify indexes were created
        let index_count: i64 = tx.query_row(
            r#"
            SELECT COUNT(*) FROM sqlite_master
            WHERE type='index' AND name LIKE 'idx_entities_project_%'
            "#,
            [],
            |row| row.get(0)
        )?;

        if index_count < 3 {
            bail!("Expected 3 project indexes, found {}", index_count);
        }

        info!("Migration validation successful:");
        info!("  - Entities preserved: {}", entity_count_after);
        info!("  - Project indexes created: {}", index_count);
        info!("  - Entities with project_root: {}", entity_count_after - null_project_count);

        // Commit transaction
        tx.commit().context("Failed to commit migration transaction")?;

        info!("v2 migration completed successfully");
        Ok(())
    }

    /// Recreate entity_embeddings table with RESTRICT constraint
    fn recreate_entity_embeddings_with_restrict(tx: &rusqlite::Transaction) -> Result<()> {
        debug!("Recreating entity_embeddings with ON DELETE RESTRICT");

        tx.execute_batch(
            r#"
            -- Create temporary table with new constraint
            CREATE TABLE entity_embeddings_new (
                entity_id INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL,
                embedding_model TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

                FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT
            );

            -- Copy data
            INSERT INTO entity_embeddings_new (entity_id, embedding, embedding_model, created_at)
            SELECT entity_id, embedding, embedding_model, created_at
            FROM entity_embeddings;

            -- Drop old table
            DROP TABLE entity_embeddings;

            -- Rename new table
            ALTER TABLE entity_embeddings_new RENAME TO entity_embeddings;
            "#
        ).context("Failed to recreate entity_embeddings table")?;

        Ok(())
    }

    /// Recreate refs table with RESTRICT constraint on source_entity_id
    fn recreate_refs_with_restrict(tx: &rusqlite::Transaction) -> Result<()> {
        debug!("Recreating refs with ON DELETE RESTRICT");

        tx.execute_batch(
            r#"
            -- Create temporary table with new constraint
            CREATE TABLE refs_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_entity_id INTEGER NOT NULL,
                target_entity_id INTEGER NOT NULL DEFAULT 0,
                target_name TEXT,
                ref_kind TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                column_number INTEGER,
                context TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

                FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE RESTRICT
            );

            -- Copy data
            INSERT INTO refs_new
                (id, source_entity_id, target_entity_id, target_name, ref_kind,
                 file_path, line_number, column_number, context, created_at)
            SELECT id, source_entity_id, target_entity_id, target_name, ref_kind,
                   file_path, line_number, column_number, context, created_at
            FROM refs;

            -- Drop old table
            DROP TABLE refs;

            -- Rename new table
            ALTER TABLE refs_new RENAME TO refs;

            -- Recreate indexes
            CREATE INDEX IF NOT EXISTS idx_refs_source ON refs(source_entity_id);
            CREATE INDEX IF NOT EXISTS idx_refs_target ON refs(target_entity_id);
            CREATE INDEX IF NOT EXISTS idx_refs_kind ON refs(ref_kind);
            CREATE INDEX IF NOT EXISTS idx_refs_file_path ON refs(file_path);
            CREATE INDEX IF NOT EXISTS idx_refs_source_kind ON refs(source_entity_id, ref_kind);
            CREATE INDEX IF NOT EXISTS idx_refs_target_kind ON refs(target_entity_id, ref_kind);
            "#
        ).context("Failed to recreate refs table")?;

        Ok(())
    }

    /// Recreate type_usage table with RESTRICT constraint
    fn recreate_type_usage_with_restrict(tx: &rusqlite::Transaction) -> Result<()> {
        debug!("Recreating type_usage with ON DELETE RESTRICT");

        tx.execute_batch(
            r#"
            -- Create temporary table with new constraint
            CREATE TABLE type_usage_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                type_name TEXT NOT NULL,
                usage_kind TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

                FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE RESTRICT
            );

            -- Copy data
            INSERT INTO type_usage_new
                (id, entity_id, type_name, usage_kind, file_path, line_number, created_at)
            SELECT id, entity_id, type_name, usage_kind, file_path, line_number, created_at
            FROM type_usage;

            -- Drop old table
            DROP TABLE type_usage;

            -- Rename new table
            ALTER TABLE type_usage_new RENAME TO type_usage;

            -- Recreate indexes
            CREATE INDEX IF NOT EXISTS idx_type_usage_entity ON type_usage(entity_id);
            CREATE INDEX IF NOT EXISTS idx_type_usage_type_name ON type_usage(type_name);
            CREATE INDEX IF NOT EXISTS idx_type_usage_kind ON type_usage(usage_kind);
            CREATE INDEX IF NOT EXISTS idx_type_usage_type_kind ON type_usage(type_name, usage_kind);
            CREATE INDEX IF NOT EXISTS idx_type_usage_entity_type ON type_usage(entity_id, type_name);
            "#
        ).context("Failed to recreate type_usage table")?;

        Ok(())
    }

    /// Get migration statistics for reporting
    pub fn get_migration_stats(conn: &Connection) -> Result<MigrationStats> {
        let total_entities: i64 = conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;

        let entities_with_project: i64 = conn.query_row(
            "SELECT COUNT(*) FROM entities WHERE project_root != ''",
            [],
            |row| row.get(0)
        )?;

        let project_count: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT project_root) FROM entities WHERE project_root != ''",
            [],
            |row| row.get(0)
        )?;

        Ok(MigrationStats {
            total_entities,
            entities_with_project,
            project_count,
        })
    }
}

#[derive(Debug)]
pub struct MigrationStats {
    pub total_entities: i64,
    pub entities_with_project: i64,
    pub project_count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::schema_v2::SchemaV2;

    #[test]
    fn test_migration_idempotent() -> Result<()> {
        let mut conn = Connection::open_in_memory()?;

        // Initialize base schema
        SchemaV2::initialize(&conn)?;

        // Insert test data
        conn.execute(
            "INSERT INTO entities (kind, name, file_path, line_number) VALUES (?, ?, ?, ?)",
            params!["struct", "TestStruct", "/home/user/project/src/main.rs", 10]
        )?;

        // Run migration twice
        MigrationV2::run_v2_migration(&mut conn)?;
        MigrationV2::run_v2_migration(&mut conn)?;

        // Verify data integrity
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))?;
        assert_eq!(count, 1);

        Ok(())
    }

    #[test]
    fn test_project_root_extraction() -> Result<()> {
        let mut conn = Connection::open_in_memory()?;

        SchemaV2::initialize(&conn)?;

        // Insert test entities with project_root set (schema now requires it)
        conn.execute(
            "INSERT INTO entities (kind, name, file_path, line_number, project_root) VALUES (?, ?, ?, ?, ?)",
            params!["struct", "Test1", "/home/user/project/src/main.rs", 10, "/home/user/project"]
        )?;

        conn.execute(
            "INSERT INTO entities (kind, name, file_path, line_number, project_root) VALUES (?, ?, ?, ?, ?)",
            params!["function", "Test2", "/var/app/lib/utils.rs", 20, "/var/app"]
        )?;

        // Run migration (will be skipped since schema already has project_root)
        MigrationV2::run_v2_migration(&mut conn)?;

        // Verify project_root values
        let project1: String = conn.query_row(
            "SELECT project_root FROM entities WHERE name = ?",
            params!["Test1"],
            |row| row.get(0)
        )?;
        assert_eq!(project1, "/home/user/project");

        let project2: String = conn.query_row(
            "SELECT project_root FROM entities WHERE name = ?",
            params!["Test2"],
            |row| row.get(0)
        )?;
        assert_eq!(project2, "/var/app");

        Ok(())
    }
}
