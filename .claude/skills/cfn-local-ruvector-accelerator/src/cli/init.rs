use anyhow::{Result, Context, anyhow};
use std::path::{Path, PathBuf};
use std::fs;
use tracing::{info, debug, warn};
use serde_json::json;

use crate::embeddings::EmbeddingsManager;
use crate::search_engine::SearchEngine;
use crate::sqlite_store::SqliteStore;
use crate::migration_v2::MigrationV2;
use local_ruvector::paths::{get_ruvector_dir, get_v1_index_dir, get_database_path};

pub struct InitCommand {
    project_dir: PathBuf,
    force: bool,
}

impl InitCommand {
    pub fn new(project_dir: &Path, force: bool) -> Self {
        Self {
            project_dir: project_dir.to_path_buf(),
            force,
        }
    }

    pub fn check_environment(&self) -> Result<()> {
        debug!("Checking environment");

        // Check if project directory exists
        if !self.project_dir.exists() {
            return Err(anyhow!("Project directory does not exist: {}", 
                              self.project_dir.display()));
        }

        // Check HOME environment variable
        if std::env::var("HOME").is_err() && std::env::var("USERPROFILE").is_err() {
            return Err(anyhow!("Neither HOME nor USERPROFILE environment variable is set"));
        }

        // Check SQLite availability
        let _ = rusqlite::Connection::open_in_memory()
            .context("SQLite is not available")?;

        let ruvector_dir = get_ruvector_dir()?;
        if ruvector_dir.exists() {
            info!("RuVector already initialized at: {}", ruvector_dir.display());
        }

        info!("Environment check passed");
        Ok(())
    }

    pub fn execute(&self) -> Result<()> {
        let ruvector_dir = get_ruvector_dir()?;
        
        // Create directory if doesn't exist (idempotent)
        if !ruvector_dir.exists() {
            info!("Creating centralized RuVector directory: {}", ruvector_dir.display());
            fs::create_dir_all(&ruvector_dir)
                .context("Failed to create RuVector directory")?;
            fs::create_dir_all(ruvector_dir.join("embeddings"))
                .context("Failed to create embeddings directory")?;
            fs::create_dir_all(get_v1_index_dir()?)
                .context("Failed to create index directory")?;
            fs::create_dir_all(ruvector_dir.join("cache"))
                .context("Failed to create cache directory")?;
        } else {
            info!("Using existing centralized RuVector directory: {}", ruvector_dir.display());
        }
        
        // Create configuration file if missing
        if !ruvector_dir.join("config.json").exists() {
            self.create_config()?;
        }
        
        // Initialize database (preserves existing data)
        self.initialize_database()?;
        
        // If --force, warn and recreate schema only (non-destructive)
        if self.force {
            warn!("⚠️  --force flag: Recreating schema tables (existing data preserved)");
            self.recreate_schema()?;
        }
        
        // Initialize embeddings manager
        if !ruvector_dir.join("embeddings").exists() {
            self.initialize_embeddings()?;
        }
        
        // Initialize search engine
        self.initialize_search_engine()?;
        
        info!("✅ Centralized index ready at: {}", get_database_path()?.display());
        Ok(())
    }

    fn create_config(&self) -> Result<()> {
        let ruvector_dir = get_ruvector_dir()?;
        let config_path = ruvector_dir.join("config.json");

        let config = json!({
            "version": "1.0.0",
            "embedding_dimension": 1536,
            "batch_size": 1000,
            "max_results": 50,
            "similarity_threshold": 0.7,
            "file_types": ["rs", "py", "js", "ts", "go", "java"],
            "exclude_patterns": [".git", "node_modules", "target", "dist", "build"]
        });

        fs::write(&config_path, serde_json::to_string_pretty(&config)?)
            .context("Failed to write config file")?;

        debug!("Configuration file created: {}", config_path.display());
        Ok(())
    }

    fn initialize_database(&self) -> Result<()> {
        let db_path = get_database_path()?;

        // Create database directory if needed
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .context("Failed to create database directory")?;
        }

        let store = SqliteStore::new(&db_path)?;
        store.initialize()?;

        // Initialize Schema V2 using CREATE TABLE IF NOT EXISTS (always safe)
        let mut conn = rusqlite::Connection::open(&db_path)?;
        local_ruvector::schema_v2::SchemaV2::initialize(&conn)?;

        // Run v2 migration to add multi-project isolation
        info!("Running database migrations...");
        match MigrationV2::run_v2_migration(&mut conn) {
            Ok(()) => {
                info!("Database migrations completed successfully");

                // Report migration statistics
                match MigrationV2::get_migration_stats(&conn) {
                    Ok(stats) => {
                        info!("Migration stats:");
                        info!("  Total entities: {}", stats.total_entities);
                        info!("  Entities with project: {}", stats.entities_with_project);
                        info!("  Unique projects: {}", stats.project_count);
                    },
                    Err(e) => warn!("Failed to get migration stats: {}", e),
                }
            },
            Err(e) => {
                warn!("Migration failed (non-fatal): {}", e);
                warn!("Database will continue to work, but multi-project isolation may not be available");
            }
        }

        debug!("Database initialized (V1 + V2 schemas): {}", db_path.display());
        Ok(())
    }

    fn recreate_schema(&self) -> Result<()> {
        let db_path = get_database_path()?;
        let conn = rusqlite::Connection::open(&db_path)?;
        
        // Re-run schema initialization (uses IF NOT EXISTS)
        local_ruvector::schema_v2::SchemaV2::initialize(&conn)?;
        
        debug!("Schema tables recreated (non-destructive)");
        Ok(())
    }

    fn initialize_embeddings(&self) -> Result<()> {
        let embeddings_dir = get_ruvector_dir()?;
        let _ = EmbeddingsManager::new(&embeddings_dir)?;

        debug!("Embeddings manager initialized");
        Ok(())
    }

    fn initialize_search_engine(&self) -> Result<()> {
        let mut search_engine = SearchEngine::new(&self.project_dir)?;
        search_engine.load_or_create()?;
        search_engine.save_index()?;

        debug!("Search engine initialized");
        Ok(())
    }
}