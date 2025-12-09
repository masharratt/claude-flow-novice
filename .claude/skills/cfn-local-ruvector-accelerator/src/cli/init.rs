use anyhow::{Result, Context, anyhow};
use std::path::{Path, PathBuf};
use std::fs;
use tracing::{info, debug};
use serde_json::json;

use crate::embeddings::EmbeddingsManager;
use crate::search_engine::SearchEngine;
use crate::sqlite_store::SqliteStore;

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

        // Check if already initialized
        let ruvector_dir = self.project_dir.join(".ruvector");
        if ruvector_dir.exists() && !self.force {
            eprintln!("⚠️  RuVector already initialized. Use --force to reinitialize.");
            return Err(anyhow!("Already initialized"));
        }

        info!("Environment check passed");
        Ok(())
    }

    pub fn execute(&self) -> Result<()> {
        info!("Initializing RuVector in: {}", self.project_dir.display());

        let ruvector_dir = self.project_dir.join(".ruvector");

        // Remove existing directory if forcing
        if self.force && ruvector_dir.exists() {
            fs::remove_dir_all(&ruvector_dir)
                .context("Failed to remove existing .ruvector directory")?;
        }

        // Create directory structure
        fs::create_dir_all(&ruvector_dir)
            .context("Failed to create .ruvector directory")?;

        // Create subdirectories
        fs::create_dir_all(ruvector_dir.join("embeddings"))?;
        fs::create_dir_all(ruvector_dir.join("index"))?;
        fs::create_dir_all(ruvector_dir.join("cache"))?;

        // Create configuration file
        self.create_config()?;

        // Initialize database
        self.initialize_database()?;

        // Initialize embeddings manager
        self.initialize_embeddings()?;

        // Initialize search engine
        self.initialize_search_engine()?;

        println!("✅ RuVector initialized successfully");
        info!("RuVector initialization complete");

        Ok(())
    }

    fn create_config(&self) -> Result<()> {
        let config_path = self.project_dir.join(".ruvector").join("config.json");

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
        let db_path = self.project_dir.join(".ruvector").join("index.db");
        let store = SqliteStore::new(&db_path)?;
        store.initialize()?;

        debug!("Database initialized: {}", db_path.display());
        Ok(())
    }

    fn initialize_embeddings(&self) -> Result<()> {
        let embeddings_dir = self.project_dir.join(".ruvector");
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
