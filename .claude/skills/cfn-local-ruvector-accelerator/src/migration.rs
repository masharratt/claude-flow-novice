use anyhow::{Result, Context, bail};
use rusqlite::Connection;
use std::path::Path;
use tracing::{info, warn, error, debug};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::schema_v2::SchemaV2;

pub struct MigrationManager {
    conn: Connection,
}

impl MigrationManager {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)
            .context("Failed to open database for migration")?;
        
        // Enable foreign key constraints
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        
        Ok(Self { conn })
    }
    
    /// Get the current schema version
    pub fn current_version(&self) -> Result<u32> {
        let mut stmt = self.conn.prepare(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
        )?;
        
        match stmt.query_row([], |row| row.get(0)) {
            Ok(version) => Ok(version),
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Check if this is a pre-versioned database (v1)
                if self.has_v1_tables()? {
                    Ok(1)
                } else {
                    Ok(0) // New database
                }
            }
            Err(e) => Err(e.into()),
        }
    }
    
    /// Check if database has v1 tables
    fn has_v1_tables(&self) -> Result<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('embeddings', 'files')",
            [],
            |row| row.get(0)
        )?;
        Ok(count > 0)
    }
    
    /// Run all necessary migrations to bring database to latest version
    pub fn migrate_to_latest(&mut self) -> Result<()> {
        let current_version = self.current_version()?;
        let target_version = 2; // Current latest version
        
        info!("Starting migration from version {} to {}", current_version, target_version);
        
        if current_version == 0 {
            // Fresh installation
            info!("Initializing fresh database with latest schema");
            self.initialize_schema_version_table()?;
            SchemaV2::initialize(&self.conn)?;
            self.set_schema_version(2)?;
        } else if current_version < target_version {
            // Need to migrate
            self.run_migrations(current_version, target_version)?;
        } else {
            info!("Database is already at latest version {}", current_version);
        }
        
        Ok(())
    }
    
    fn run_migrations(&mut self, from_version: u32, to_version: u32) -> Result<()> {
        // Ensure schema version table exists
        self.ensure_schema_version_table()?;
        
        for version in (from_version + 1)..=to_version {
            info!("Running migration to version {}", version);
            
            match version {
                2 => {
                    // Create backup before migration
                    self.create_database_backup(version - 1)?;

                    // Run v1 to v2 migration
                    SchemaV2::migrate_v1_to_v2(&mut self.conn)?;
                    
                    // Clean up old data after successful migration
                    self.cleanup_after_migration(version - 1)?;
                }
                _ => bail!("Unknown migration version: {}", version),
            }
            
            // Record successful migration
            self.set_schema_version(version)?;
            
            info!("Successfully migrated to version {}", version);
        }
        
        Ok(())
    }
    
    fn initialize_schema_version_table(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
            []
        )?;
        Ok(())
    }
    
    fn ensure_schema_version_table(&self) -> Result<()> {
        let table_exists: bool = self.conn.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'"
        )?.exists([])?;
        
        if !table_exists {
            self.initialize_schema_version_table()?;
            // Set initial version based on current schema
            let initial_version = if self.has_v1_tables()? { 1 } else { 0 };
            self.set_schema_version(initial_version)?;
        }
        
        Ok(())
    }
    
    fn set_schema_version(&self, version: u32) -> Result<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        self.conn.execute(
            "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?1, ?2)",
            rusqlite::params![version, now as u32]
        )?;

        Ok(())
    }
    
    fn create_database_backup(&self, version: u32) -> Result<()> {
        info!("Creating backup before migration from version {}", version);
        
        // Rename old tables with version suffix
        self.conn.execute_batch(
            r#"
            ALTER TABLE embeddings RENAME TO embeddings_v1_backup;
            ALTER TABLE files RENAME TO files_v1_backup;
            "#
        )?;
        
        info!("Backup created successfully");
        Ok(())
    }
    
    fn cleanup_after_migration(&self, old_version: u32) -> Result<()> {
        info!("Cleaning up after migration from version {}", old_version);
        
        // Verify migration was successful before dropping backups
        let new_entities_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;
        
        if new_entities_count == 0 && old_version > 0 {
            warn!("No entities found after migration, keeping backup tables");
            return Ok(());
        }
        
        // Drop backup tables after successful migration
        self.conn.execute_batch(
            r#"
            DROP TABLE IF EXISTS embeddings_v1_backup;
            DROP TABLE IF EXISTS files_v1_backup;
            "#
        )?;
        
        // Run VACUUM to reclaim space
        debug!("Running VACUUM to reclaim database space");
        self.conn.execute("VACUUM", [])?;
        
        info!("Cleanup completed successfully");
        Ok(())
    }
    
    /// Validate migration integrity
    pub fn validate_migration(&self) -> Result<bool> {
        info!("Validating migration integrity");
        
        let version = self.current_version()?;
        if version < 2 {
            return Ok(false);
        }
        
        // Check that all required tables exist
        let required_tables = vec![
            "entities", "refs", "type_usage", "modules", 
            "entity_embeddings", "schema_version"
        ];
        
        for table in required_tables {
            let exists: bool = self.conn.prepare(
                &format!("SELECT 1 FROM sqlite_master WHERE type='table' AND name='{}'", table)
            )?.exists([])?;
            
            if !exists {
                error!("Required table '{}' does not exist", table);
                return Ok(false);
            }
        }
        
        // Check indexes exist
        let required_indexes = vec![
            "idx_entities_kind", "idx_entities_name", "idx_entities_file_path",
            "idx_refs_source", "idx_refs_target", "idx_type_usage_type_name"
        ];
        
        for index in required_indexes {
            let exists: bool = self.conn.prepare(
                &format!("SELECT 1 FROM sqlite_master WHERE type='index' AND name='{}'", index)
            )?.exists([])?;
            
            if !exists {
                warn!("Required index '{}' does not exist", index);
                // Not failing validation as indexes can be recreated
            }
        }
        
        // Validate foreign key constraints
        let fk_check: i64 = self.conn.query_row(
            "PRAGMA foreign_key_check(entities)",
            [],
            |row| row.get(0)
        ).unwrap_or(0);
        
        if fk_check > 0 {
            error!("Foreign key constraint violations detected: {}", fk_check);
            return Ok(false);
        }
        
        info!("Migration validation passed");
        Ok(true)
    }
    
    /// Get migration statistics
    pub fn migration_stats(&self) -> Result<MigrationStats> {
        let version = self.current_version()?;
        
        let entities_count: i64 = if version >= 2 {
            self.conn.query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))?
        } else {
            self.conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?
        };
        
        let files_count: i64 = self.conn.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;
        
        let refs_count: i64 = if version >= 2 {
            self.conn.query_row("SELECT COUNT(*) FROM refs", [], |row| row.get(0))?
        } else {
            0
        };
        
        let db_size = std::fs::metadata("index.db")
            .map(|m| m.len())
            .unwrap_or(0);
        
        Ok(MigrationStats {
            version,
            entities_count: entities_count as usize,
            files_count: files_count as usize,
            refs_count: refs_count as usize,
            database_size_bytes: db_size,
        })
    }
}

#[derive(Debug)]
pub struct MigrationStats {
    pub version: u32,
    pub entities_count: usize,
    pub files_count: usize,
    pub refs_count: usize,
    pub database_size_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_fresh_installation() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_fresh.db");
        let manager = MigrationManager::new(&db_path)?;
        
        manager.migrate_to_latest()?;
        
        assert_eq!(manager.current_version()?, 2);
        assert!(manager.validate_migration()?);
        
        Ok(())
    }
    
    #[test]
    fn test_version_tracking() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_version.db");
        let manager = MigrationManager::new(&db_path)?;
        
        // Fresh database should have version 0
        assert_eq!(manager.current_version()?, 0);
        
        manager.migrate_to_latest()?;
        
        // Should now be at version 2
        assert_eq!(manager.current_version()?, 2);
        
        Ok(())
    }
}
