use anyhow::{Result, Context, anyhow};
use std::path::{Path, PathBuf};
use rusqlite::Connection;
use tracing::{info, error};

use crate::migration_tx::MigrationWithTx;

#[derive(Debug, Clone)]
pub enum SourceType {
    CodeSearchPython,
    CodeBERT,
    Whoosh,
    Elastic,
}

pub struct MigrationCommand {
    project_dir: PathBuf,
    source_type: SourceType,
    source_path: PathBuf,
    dry_run: bool,
}

impl MigrationCommand {
    pub fn new(
        project_dir: &Path,
        source_type: SourceType,
        source_path: PathBuf,
        dry_run: bool,
    ) -> Self {
        Self {
            project_dir: project_dir.to_path_buf(),
            source_type,
            source_path,
            dry_run,
        }
    }

    pub fn execute(&self) -> Result<()> {
        match self.source_type {
            SourceType::CodeSearchPython => self.migrate_from_python(),
            SourceType::CodeBERT => self.migrate_from_codebert(),
            SourceType::Whoosh => self.migrate_from_whoosh(),
            SourceType::Elastic => self.migrate_from_elastic(),
        }
    }

    /// Execute migration with transaction support
    pub fn execute_with_tx(&self) -> Result<()> {
        let db_path = self.project_dir.join(".codesearch/index_v2.db");

        // Ensure database directory exists
        std::fs::create_dir_all(db_path.parent().unwrap())
            .context("Failed to create database directory")?;

        let mut conn = Connection::open(&db_path)
            .context("Failed to open database for migration")?;

        info!("Starting migration with transaction support");

        // Use the transaction-aware migration
        match self.source_type {
            SourceType::CodeSearchPython => {
                MigrationWithTx::migrate_v1_to_v2_atomic(&mut conn)?;
                MigrationWithTx::validate_migration(&mut conn)?;
            }
            _ => {
                // For other sources, fall back to the original method
                self.execute()?;
            }
        }

        info!("Migration completed successfully");
        Ok(())
    }

    fn migrate_from_python(&self) -> Result<()> {
        println!("⚠️  Migration from Python CodeSearch not yet implemented");
        if self.dry_run {
            println!("Would migrate from: {}", self.source_path.display());
        }
        Ok(())
    }

    fn migrate_from_codebert(&self) -> Result<()> {
        println!("⚠️  Migration from CodeBERT not yet implemented");
        if self.dry_run {
            println!("Would migrate from: {}", self.source_path.display());
        }
        Ok(())
    }

    fn migrate_from_whoosh(&self) -> Result<()> {
        println!("⚠️  Migration from Whoosh not yet implemented");
        if self.dry_run {
            println!("Would migrate from: {}", self.source_path.display());
        }
        Ok(())
    }

    fn migrate_from_elastic(&self) -> Result<()> {
        println!("⚠️  Migration from Elasticsearch not yet implemented");
        if self.dry_run {
            println!("Would migrate from: {}", self.source_path.display());
        }
        Ok(())
    }
}
