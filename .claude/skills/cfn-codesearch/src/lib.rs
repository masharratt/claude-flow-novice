//! CodeSearch - Fast semantic code search with AST indexing
//!
//! This crate provides storage and search capabilities for code patterns
//! using vector embeddings. Supports SQLite (default) and pgvector backends.

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
pub mod store_pgvector;
pub mod store_qdrant;
pub mod store_memgraph;
pub mod unified_query;

#[cfg(test)]
mod transaction_tests;

// Re-export main types
pub use embeddings::EmbeddingsManager;
pub use sqlite_store::SqliteStore;
pub use search_engine::SearchEngine;
pub use paths::{get_codesearch_dir, get_database_path};
// V1 index functions are deprecated - use V2 via get_database_path()
pub use store_v2::StoreV2;
pub use store_v2_tx::StoreV2WithTx;
pub use schema_v2::SchemaV2;
pub use query_v2::QueryV2;
pub use migration_v2::MigrationV2;
pub use store_pgvector::PgvectorStore;
pub use store_qdrant::QdrantStore;
pub use store_memgraph::MemgraphStore;
pub use unified_query::UnifiedQuery;
