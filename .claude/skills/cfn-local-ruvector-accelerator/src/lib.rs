//! Local RuVector Accelerator - Fast pattern storage and search
//!
//! This crate provides local storage and search capabilities for code patterns
//! using vector embeddings and SQLite.

pub mod embeddings;
pub mod sqlite_store;
pub mod search_engine;
pub mod extractors;
pub mod paths;
pub mod path_validator;
pub mod store_v2;
pub mod store_v2_tx;
pub mod schema_v2;
pub mod query_v2;
pub mod migration_v2;
pub mod migration_tx;

#[cfg(test)]
mod transaction_tests;

// Re-export main types
pub use embeddings::EmbeddingsManager;
pub use sqlite_store::SqliteStore;
pub use search_engine::SearchEngine;
pub use paths::{get_ruvector_dir, get_database_path};
pub use store_v2::StoreV2;
pub use store_v2_tx::StoreV2WithTx;
pub use schema_v2::SchemaV2;
pub use query_v2::QueryV2;
pub use migration_v2::MigrationV2;
