// Centralized path management for RuVector index
use std::path::PathBuf;
use anyhow::{Result, Context};

/// Get the centralized RuVector directory
/// Location: ~/.local/share/ruvector/
pub fn get_ruvector_dir() -> Result<PathBuf> {
    let home = std::env::var("HOME")
        .context("HOME environment variable not set")?;
    
    let ruvector_dir = PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("ruvector");
    
    Ok(ruvector_dir)
}

/// Get the centralized database path
/// Location: ~/.local/share/ruvector/index_v2.db
pub fn get_database_path() -> Result<PathBuf> {
    Ok(get_ruvector_dir()?.join("index_v2.db"))
}

/// Get the legacy V1 index path (for migration)
/// Location: ~/.local/share/ruvector/index/
pub fn get_v1_index_dir() -> Result<PathBuf> {
    Ok(get_ruvector_dir()?.join("index"))
}