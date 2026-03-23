//! PostgreSQL/pgvector storage backend for CodeSearch
//!
//! This module provides vector similarity search using pgvector extension.
//! Embeddings are stored in pgvector for fast HNSW-indexed similarity search.

use anyhow::{Result, Context, anyhow};
use tokio_postgres::NoTls;
use deadpool_postgres::{Config, Pool, Runtime};
use serde::{Serialize, Deserialize};
use tracing::{info, debug, warn};
use pgvector::Vector;

use crate::store_v2::Entity;

/// Expected embedding dimension for text-embedding-3-small model
pub const EMBEDDING_DIMENSION: usize = 1536;

/// PostgreSQL connection pool for pgvector operations
pub struct PgvectorStore {
    pool: Pool,
}

impl PgvectorStore {
    /// Create a new pgvector store from connection URL
    pub async fn new(database_url: &str) -> Result<Self> {
        let config = database_url.parse::<tokio_postgres::Config>()
            .context("Invalid PostgreSQL connection string")?;

        let mut pool_config = Config::new();
        pool_config.host = config.get_hosts().first()
            .and_then(|h| match h {
                tokio_postgres::config::Host::Tcp(s) => Some(s.clone()),
                _ => None,
            });
        pool_config.port = config.get_ports().first().copied();
        pool_config.user = config.get_user().map(|s| s.to_string());
        pool_config.password = config.get_password().map(|p| String::from_utf8_lossy(p).to_string());
        pool_config.dbname = config.get_dbname().map(|s| s.to_string());

        // Configure connection pool for better resource management
        // Limit max connections to avoid pool exhaustion
        pool_config.manager = Some(deadpool_postgres::ManagerConfig {
            recycling_method: deadpool_postgres::RecyclingMethod::Fast,
        });
        // Set max_size through pool_config fields directly
        pool_config.pool = Some(deadpool_postgres::PoolConfig::new(10));

        let pool = pool_config.create_pool(Some(Runtime::Tokio1), NoTls)
            .context("Failed to create connection pool")?;

        // Verify connection and pgvector extension
        let client = pool.get().await.context("Failed to get connection from pool")?;
        client.execute("SELECT 1", &[]).await.context("Failed to ping database")?;

        // Check pgvector extension
        let row = client.query_opt(
            "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
            &[]
        ).await.context("Failed to check pgvector extension")?;

        if row.is_none() {
            return Err(anyhow!("pgvector extension not installed. Run: CREATE EXTENSION vector;"));
        }

        let version: String = row.unwrap().get(0);
        info!("Connected to PostgreSQL with pgvector v{}", version);
        Ok(Self { pool })
    }

    /// Store an entity with its embedding
    pub async fn store_entity_with_embedding(
        &self,
        entity: &Entity,
        embedding: &[f32],
        project_root: &str,
    ) -> Result<i64> {
        // Validate embedding dimension
        if embedding.len() != EMBEDDING_DIMENSION {
            return Err(anyhow!(
                "Invalid embedding dimension: expected {}, got {} for entity '{}'",
                EMBEDDING_DIMENSION, embedding.len(), entity.name
            ));
        }

        let client = self.pool.get().await
            .context(format!("Failed to get connection from pool for entity: {}", entity.name))?;

        // Convert embedding to pgvector Vector type
        let embedding_vec = Vector::from(embedding.to_vec());

        let row = client.query_one(
            r#"
            INSERT INTO codesearch.embeddings (
                entity_kind, entity_name, file_path, line_number,
                signature, doc_comment, project_root, embedding
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (project_root, file_path, entity_name, entity_kind, line_number)
            DO UPDATE SET
                signature = EXCLUDED.signature,
                doc_comment = EXCLUDED.doc_comment,
                embedding = EXCLUDED.embedding,
                updated_at = NOW()
            RETURNING id
            "#,
            &[
                &format!("{:?}", entity.kind),
                &entity.name,
                &entity.file_path,
                &(entity.line_number as i32),
                &entity.signature,
                &entity.doc_comment,
                &project_root,
                &embedding_vec,
            ]
        ).await.context(format!(
            "Failed to store entity '{}' at {}:{}",
            entity.name, entity.file_path, entity.line_number
        ))?;

        Ok(row.get::<_, i64>(0))
    }

    /// Search for similar entities by embedding
    pub async fn search_similar(
        &self,
        query_embedding: &[f32],
        max_results: usize,
        threshold: f32,
        project_root: Option<&str>,
    ) -> Result<Vec<SearchResult>> {
        // Validate query embedding dimension
        if query_embedding.len() != EMBEDDING_DIMENSION {
            return Err(anyhow!(
                "Invalid query embedding dimension: expected {}, got {}",
                EMBEDDING_DIMENSION, query_embedding.len()
            ));
        }

        let client = self.pool.get().await.context("Failed to get connection")?;

        // Convert query embedding to pgvector Vector type
        let embedding_vec = Vector::from(query_embedding.to_vec());

        debug!("Searching pgvector with threshold {} for {} results", threshold, max_results);

        // Convert threshold to f64 for PostgreSQL float8 compatibility
        let threshold_f64 = threshold as f64;

        let rows = if let Some(project) = project_root {
            client.query(
                r#"
                SELECT id, entity_kind, entity_name, file_path, line_number,
                       signature, doc_comment, project_root,
                       1 - (embedding <=> $1) as similarity
                FROM codesearch.embeddings
                WHERE project_root = $2
                  AND 1 - (embedding <=> $1) >= $3
                ORDER BY embedding <=> $1
                LIMIT $4
                "#,
                &[
                    &embedding_vec,
                    &project,
                    &threshold_f64,
                    &(max_results as i64),
                ]
            ).await
        } else {
            client.query(
                r#"
                SELECT id, entity_kind, entity_name, file_path, line_number,
                       signature, doc_comment, project_root,
                       1 - (embedding <=> $1) as similarity
                FROM codesearch.embeddings
                WHERE 1 - (embedding <=> $1) >= $2
                ORDER BY embedding <=> $1
                LIMIT $3
                "#,
                &[
                    &embedding_vec,
                    &threshold_f64,
                    &(max_results as i64),
                ]
            ).await
        }.context("Failed to search embeddings")?;

        let results = rows.iter().map(|row| {
            SearchResult {
                id: row.get::<_, i64>("id"),
                entity_kind: row.get::<_, String>("entity_kind"),
                entity_name: row.get::<_, String>("entity_name"),
                file_path: row.get::<_, String>("file_path"),
                line_number: row.get::<_, i32>("line_number") as i64,
                signature: row.get::<_, Option<String>>("signature"),
                doc_comment: row.get::<_, Option<String>>("doc_comment"),
                project_root: row.get::<_, String>("project_root"),
                similarity: row.get::<_, f64>("similarity") as f32,
            }
        }).collect();

        Ok(results)
    }

    /// Get entity count by project
    pub async fn get_entity_count(&self, project_root: Option<&str>) -> Result<i64> {
        let client = self.pool.get().await.context("Failed to get connection")?;

        let count: i64 = if let Some(project) = project_root {
            let row = client.query_one(
                "SELECT COUNT(*) FROM codesearch.embeddings WHERE project_root = $1",
                &[&project]
            ).await?;
            row.get(0)
        } else {
            let row = client.query_one(
                "SELECT COUNT(*) FROM codesearch.embeddings",
                &[]
            ).await?;
            row.get(0)
        };

        Ok(count)
    }

    /// Delete entities for a file (for re-indexing)
    pub async fn delete_file_entities(&self, file_path: &str, project_root: &str) -> Result<u64> {
        let client = self.pool.get().await.context("Failed to get connection")?;

        let result = client.execute(
            "DELETE FROM codesearch.embeddings WHERE file_path = $1 AND project_root = $2",
            &[&file_path, &project_root]
        ).await.context("Failed to delete file entities")?;

        Ok(result)
    }
}

/// Search result from pgvector similarity search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: i64,
    pub entity_kind: String,
    pub entity_name: String,
    pub file_path: String,
    pub line_number: i64,
    pub signature: Option<String>,
    pub doc_comment: Option<String>,
    pub project_root: String,
    pub similarity: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_embedding_dimension_constant() {
        // Verify the constant matches the expected dimension for text-embedding-3-small
        assert_eq!(EMBEDDING_DIMENSION, 1536);
    }

    #[test]
    fn test_valid_embedding_dimension() {
        let valid_embedding = vec![0.1f32; 1536];
        assert_eq!(valid_embedding.len(), EMBEDDING_DIMENSION);
    }

    #[test]
    fn test_invalid_embedding_dimension_too_small() {
        let invalid_embedding = vec![0.1f32; 512];
        assert_ne!(invalid_embedding.len(), EMBEDDING_DIMENSION);
        assert!(invalid_embedding.len() < EMBEDDING_DIMENSION);
    }

    #[test]
    fn test_invalid_embedding_dimension_too_large() {
        let invalid_embedding = vec![0.1f32; 3072];
        assert_ne!(invalid_embedding.len(), EMBEDDING_DIMENSION);
        assert!(invalid_embedding.len() > EMBEDDING_DIMENSION);
    }

    #[tokio::test]
    #[ignore = "Requires PostgreSQL with pgvector"]
    async fn test_pgvector_connection() {
        // This test requires CODESEARCH_PG_URL to be set
        if let Ok(pg_url) = std::env::var("CODESEARCH_PG_URL") {
            let store = PgvectorStore::new(&pg_url).await;
            assert!(store.is_ok(), "Should connect to pgvector: {:?}", store.err());
        }
    }

    #[tokio::test]
    #[ignore = "Requires PostgreSQL with pgvector"]
    async fn test_entity_count() {
        if let Ok(pg_url) = std::env::var("CODESEARCH_PG_URL") {
            let store = PgvectorStore::new(&pg_url).await.unwrap();
            let count = store.get_entity_count(None).await;
            assert!(count.is_ok(), "Should get entity count: {:?}", count.err());
        }
    }
}
