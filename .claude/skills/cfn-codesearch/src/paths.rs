// Centralized path management for CodeSearch index
use std::path::PathBuf;
use anyhow::{Result, Context};

/// Get the centralized CodeSearch directory
/// Location: ~/.local/share/codesearch/
pub fn get_codesearch_dir() -> Result<PathBuf> {
    let home = std::env::var("HOME")
        .context("HOME environment variable not set")?;

    let codesearch_dir = PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("codesearch");

    Ok(codesearch_dir)
}

/// Get the centralized database path
/// Location: ~/.local/share/codesearch/index_v2.db
pub fn get_database_path() -> Result<PathBuf> {
    Ok(get_codesearch_dir()?.join("index_v2.db"))
}

/// DEPRECATED: V1 index is no longer used
/// All operations should use index_v2.db via get_database_path()
/// This function remains only for migration cleanup
#[deprecated(since = "2.0.0", note = "V1 index removed. Use get_database_path() for V2.")]
pub fn get_v1_index_dir() -> Result<PathBuf> {
    Ok(get_codesearch_dir()?.join("index"))
}
