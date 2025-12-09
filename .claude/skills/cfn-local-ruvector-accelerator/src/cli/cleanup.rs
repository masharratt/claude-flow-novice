use anyhow::{Result, Context, anyhow};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use tracing::{info, debug};
use chrono::{DateTime, Utc, Duration as ChronoDuration};

use crate::search_engine::SearchEngine;
use crate::sqlite_store::SqliteStore;

pub struct CleanupCommand {
    project_dir: PathBuf,
    dry_run: bool,
    force: bool,
    older_than: Option<u32>,
    remove_orphans: bool,
    vacuum: bool,
}

impl CleanupCommand {
    pub fn new(
        project_dir: &Path,
        dry_run: bool,
        force: bool,
        older_than: Option<u32>,
        remove_orphans: bool,
        vacuum: bool,
    ) -> Self {
        Self {
            project_dir: project_dir.to_path_buf(),
            dry_run,
            force,
            older_than,
            remove_orphans,
            vacuum,
        }
    }

    pub fn execute(&self) -> Result<()> {
        info!("Starting cleanup process");
        
        if self.dry_run {
            info!("Running in dry-run mode - no changes will be made");
        }

        let search_engine = SearchEngine::new(&self.project_dir)?;
        let store = SqliteStore::new(&self.project_dir.join(".ruvector").join("index.db"))?;

        // Check if there's anything to clean
        let stats = store.get_stats()?;
        if stats.num_embeddings == 0 {
            info!("No embeddings found - nothing to clean");
            return Ok(());
        }

        // Get confirmation unless forced or dry run
        if !self.force && !self.dry_run {
            eprintln!("⚠️  This will remove old embeddings. Use --force to proceed.");
            return Ok(());
        }

        // Remove old embeddings if requested
        if let Some(days) = self.older_than {
            self.remove_old_embeddings(&store, days)?;
        }

        // Remove orphaned embeddings if requested
        if self.remove_orphans {
            self.remove_orphaned_embeddings(&store)?;
        }

        // Vacuum database if requested
        if self.vacuum {
            self.vacuum_database(&store)?;
        }

        info!("Cleanup complete");
        Ok(())
    }

    fn remove_old_embeddings(&self, store: &SqliteStore, days: u32) -> Result<()> {
        info!("Removing embeddings older than {} days", days);
        
        let cutoff = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() - (days as u64 * 86400);
        
        let removed = if self.dry_run {
            // Count what would be removed
            store.count_old_embeddings(cutoff)?
        } else {
            // Actually remove
            store.remove_old_embeddings(cutoff)?
        };

        if self.dry_run {
            info!("Would remove {} old embeddings", removed);
        } else {
            info!("Removed {} old embeddings", removed);
        }

        Ok(())
    }

    fn remove_orphaned_embeddings(&self, store: &SqliteStore) -> Result<()> {
        info!("Removing orphaned embeddings");
        
        let removed = if self.dry_run {
            store.count_orphaned_embeddings()?
        } else {
            store.remove_orphaned_embeddings()?
        };

        if self.dry_run {
            info!("Would remove {} orphaned embeddings", removed);
        } else {
            info!("Removed {} orphaned embeddings", removed);
        }

        Ok(())
    }

    fn vacuum_database(&self, store: &SqliteStore) -> Result<()> {
        info!("Vacuuming database");
        
        if !self.dry_run {
            store.vacuum()?;
            info!("Database vacuumed");
        } else {
            info!("Would vacuum database");
        }

        Ok(())
    }
}
