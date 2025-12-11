//! Local RuVector Accelerator - Fast pattern storage and search
//!
//! This crate provides local storage and search capabilities for code patterns
//! using vector embeddings and SQLite.

pub mod embeddings;
pub mod sqlite_store;
pub mod search_engine;
pub mod extractors;
pub mod paths;

// Re-export main types
pub use embeddings::EmbeddingsManager;
pub use sqlite_store::SqliteStore;
pub use search_engine::SearchEngine;
pub use paths::{get_ruvector_dir, get_database_path};