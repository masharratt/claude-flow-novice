//! Qdrant vector storage backend for CodeSearch
//!
//! This module provides HNSW-indexed vector similarity search using Qdrant.
//! Replaces brute-force SQLite cosine similarity with sub-millisecond HNSW lookups.

use anyhow::{Result, Context, anyhow};
use serde::{Serialize, Deserialize};
use tracing::{info, debug, warn};
use uuid::Uuid;

use qdrant_client::Qdrant;
use qdrant_client::qdrant::{
    CreateCollectionBuilder, Distance, VectorParamsBuilder,
    PointStruct, SearchPointsBuilder, DeletePointsBuilder,
    Filter, Condition,
    UpsertPointsBuilder,
    CreateFieldIndexCollectionBuilder, FieldType,
    value::Kind, Value,
};

use crate::store_v2::Entity;

/// Embedding dimension — matches fastembed BGE-small-en-v1.5 by default.
/// Set to 1536 for OpenAI text-embedding-3-small.
pub const EMBEDDING_DIMENSION: u64 = crate::embeddings::LOCAL_DIMENSION as u64;

/// Qdrant collection name for code entities
const COLLECTION_NAME: &str = "codesearch_entities";

/// Batch size for upsert operations
const UPSERT_BATCH_SIZE: usize = 100;

/// UUID v5 namespace for deterministic point IDs
const CODESEARCH_UUID_NAMESPACE: Uuid = Uuid::from_bytes([
    0x6b, 0xa7, 0xb8, 0x10, 0x9d, 0xad, 0x11, 0xd1,
    0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8,
]);

/// Qdrant vector store for semantic code search
pub struct QdrantStore {
    client: Qdrant,
}

/// Search result from Qdrant similarity search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QdrantSearchResult {
    pub entity_kind: String,
    pub entity_name: String,
    pub file_path: String,
    pub line_number: i64,
    pub signature: Option<String>,
    pub project_root: String,
    pub similarity: f32,
}

/// Filter options for Qdrant search
#[derive(Debug, Default)]
pub struct SearchFilters {
    pub project_root: Option<String>,
    pub entity_kind: Option<String>,
    pub file_path: Option<String>,
}

impl QdrantStore {
    /// Create a new Qdrant store, connecting and initializing the collection
    pub async fn new(url: &str) -> Result<Self> {
        let client = Qdrant::from_url(url)
            .build()
            .context("Failed to create Qdrant client")?;

        let store = Self { client };
        store.ensure_collection().await?;
        store.ensure_indexes().await?;

        info!("Connected to Qdrant at {}", url);
        Ok(store)
    }

    /// Create collection if it doesn't exist; recreate if dimension has changed
    async fn ensure_collection(&self) -> Result<()> {
        let collections = self.client.list_collections().await
            .context("Failed to list Qdrant collections")?;

        let exists = collections.collections.iter()
            .any(|c| c.name == COLLECTION_NAME);

        if exists {
            // Check if dimension matches — recreate if stale (e.g. switching from OpenAI 1536 to local 384)
            if let Ok(info) = self.client.collection_info(COLLECTION_NAME).await {
                if let Some(result) = info.result {
                    let actual_dim = result.config
                        .and_then(|c| c.params)
                        .and_then(|p| p.vectors_config)
                        .and_then(|vc| {
                            use qdrant_client::qdrant::vectors_config::Config;
                            match vc.config? {
                                Config::Params(vp) => Some(vp.size),
                                Config::ParamsMap(_) => None,
                            }
                        });

                    if let Some(dim) = actual_dim {
                        if dim != EMBEDDING_DIMENSION {
                            info!("Qdrant collection dimension mismatch ({}d vs expected {}d) — recreating", dim, EMBEDDING_DIMENSION);
                            self.client.delete_collection(COLLECTION_NAME).await
                                .context("Failed to delete stale Qdrant collection")?;
                            // Fall through to create below
                        } else {
                            return Ok(());
                        }
                    } else {
                        return Ok(());
                    }
                }
            }
        }

        info!("Creating Qdrant collection: {} ({}d)", COLLECTION_NAME, EMBEDDING_DIMENSION);
        self.client.create_collection(
            CreateCollectionBuilder::new(COLLECTION_NAME)
                .vectors_config(VectorParamsBuilder::new(EMBEDDING_DIMENSION, Distance::Cosine))
        ).await.context("Failed to create Qdrant collection")?;

        Ok(())
    }

    /// Create payload field indexes for filtering
    async fn ensure_indexes(&self) -> Result<()> {
        let index_fields = vec![
            ("project_root", FieldType::Keyword),
            ("entity_kind", FieldType::Keyword),
            ("file_path", FieldType::Keyword),
            ("entity_name", FieldType::Keyword),
        ];

        for (field, field_type) in index_fields {
            match self.client.create_field_index(
                CreateFieldIndexCollectionBuilder::new(COLLECTION_NAME, field, field_type)
            ).await {
                Ok(_) => debug!("Created index on {}", field),
                Err(e) => {
                    // Index may already exist, that's fine
                    debug!("Index creation for {} (may already exist): {}", field, e);
                }
            }
        }

        Ok(())
    }

    /// Generate a deterministic UUID v5 point ID from entity metadata
    fn point_id(project_root: &str, file_path: &str, entity_name: &str, entity_kind: &str, line_number: i64) -> String {
        let input = format!("{}:{}:{}:{}:{}", project_root, file_path, entity_name, entity_kind, line_number);
        Uuid::new_v5(&CODESEARCH_UUID_NAMESPACE, input.as_bytes()).to_string()
    }

    /// Batch upsert entities with their embeddings
    pub async fn upsert_batch(
        &self,
        entities: &[Entity],
        embeddings: &[Vec<f32>],
        project_root: &str,
    ) -> Result<usize> {
        if entities.len() != embeddings.len() {
            return Err(anyhow!(
                "Entity count ({}) does not match embedding count ({})",
                entities.len(), embeddings.len()
            ));
        }

        let mut total_upserted = 0;

        for chunk in entities.iter().zip(embeddings.iter()).collect::<Vec<_>>().chunks(UPSERT_BATCH_SIZE) {
            let points: Vec<PointStruct> = chunk.iter().map(|(entity, embedding)| {
                let kind_str = format!("{:?}", entity.kind);
                let id = Self::point_id(
                    project_root,
                    &entity.file_path,
                    &entity.name,
                    &kind_str,
                    entity.line_number,
                );

                let mut payload = std::collections::HashMap::new();
                payload.insert("entity_id".to_string(), Value { kind: Some(Kind::IntegerValue(entity.id)) });
                payload.insert("project_root".to_string(), Value { kind: Some(Kind::StringValue(project_root.to_string())) });
                payload.insert("file_path".to_string(), Value { kind: Some(Kind::StringValue(entity.file_path.clone())) });
                payload.insert("line_number".to_string(), Value { kind: Some(Kind::IntegerValue(entity.line_number)) });
                payload.insert("entity_kind".to_string(), Value { kind: Some(Kind::StringValue(kind_str)) });
                payload.insert("entity_name".to_string(), Value { kind: Some(Kind::StringValue(entity.name.clone())) });
                if let Some(ref sig) = entity.signature {
                    payload.insert("signature".to_string(), Value { kind: Some(Kind::StringValue(sig.clone())) });
                }
                payload.insert("visibility".to_string(), Value { kind: Some(Kind::StringValue(format!("{:?}", entity.visibility))) });

                PointStruct::new(id, (*embedding).clone(), payload)
            }).collect();

            self.client.upsert_points(
                UpsertPointsBuilder::new(COLLECTION_NAME, points)
            ).await.context("Failed to upsert points to Qdrant")?;

            total_upserted += chunk.len();
        }

        debug!("Upserted {} entities to Qdrant", total_upserted);
        Ok(total_upserted)
    }

    /// Search for similar code entities using HNSW
    pub async fn search_similar(
        &self,
        query_embedding: &[f32],
        max_results: usize,
        threshold: f32,
        filters: &SearchFilters,
    ) -> Result<Vec<QdrantSearchResult>> {
        if query_embedding.len() != EMBEDDING_DIMENSION as usize {
            return Err(anyhow!(
                "Invalid query embedding dimension: expected {}, got {}",
                EMBEDDING_DIMENSION, query_embedding.len()
            ));
        }

        let mut search_builder = SearchPointsBuilder::new(
            COLLECTION_NAME,
            query_embedding.to_vec(),
            max_results as u64,
        ).with_payload(true)
         .score_threshold(threshold);

        // Build filter conditions using Condition::matches (qdrant-client v1.17 API)
        let mut conditions = Vec::new();
        if let Some(ref project_root) = filters.project_root {
            conditions.push(Condition::matches("project_root", project_root.to_string()));
        }
        if let Some(ref entity_kind) = filters.entity_kind {
            conditions.push(Condition::matches("entity_kind", entity_kind.to_string()));
        }
        if let Some(ref file_path) = filters.file_path {
            conditions.push(Condition::matches("file_path", file_path.to_string()));
        }

        if !conditions.is_empty() {
            search_builder = search_builder.filter(Filter::must(conditions));
        }

        let results = self.client.search_points(search_builder).await
            .context("Failed to search Qdrant")?;

        let search_results = results.result.iter().map(|point| {
            let payload = &point.payload;

            let get_str = |key: &str| -> String {
                payload.get(key)
                    .and_then(|v| match &v.kind {
                        Some(Kind::StringValue(s)) => Some(s.clone()),
                        _ => None,
                    })
                    .unwrap_or_default()
            };

            let get_i64 = |key: &str| -> i64 {
                payload.get(key)
                    .and_then(|v| match &v.kind {
                        Some(Kind::IntegerValue(i)) => Some(*i),
                        _ => None,
                    })
                    .unwrap_or(0)
            };

            QdrantSearchResult {
                entity_kind: get_str("entity_kind"),
                entity_name: get_str("entity_name"),
                file_path: get_str("file_path"),
                line_number: get_i64("line_number"),
                signature: {
                    let s = get_str("signature");
                    if s.is_empty() { None } else { Some(s) }
                },
                project_root: get_str("project_root"),
                similarity: point.score,
            }
        }).collect();

        Ok(search_results)
    }

    /// Delete all entities for a specific file (for re-indexing)
    pub async fn delete_file_entities(&self, file_path: &str, project_root: &str) -> Result<u64> {
        let filter = Filter::must(vec![
            Condition::matches("file_path", file_path.to_string()),
            Condition::matches("project_root", project_root.to_string()),
        ]);

        self.client.delete_points(
            DeletePointsBuilder::new(COLLECTION_NAME).points(filter)
        ).await.context("Failed to delete file entities from Qdrant")?;

        debug!("Deleted entities for file {} from Qdrant", file_path);
        // Qdrant doesn't return count for filter deletes
        Ok(0)
    }

    /// Delete all entities for a project (for full re-index)
    pub async fn delete_project(&self, project_root: &str) -> Result<()> {
        let filter = Filter::must(vec![
            Condition::matches("project_root", project_root.to_string()),
        ]);

        self.client.delete_points(
            DeletePointsBuilder::new(COLLECTION_NAME).points(filter)
        ).await.context("Failed to delete project from Qdrant")?;

        info!("Deleted all entities for project {} from Qdrant", project_root);
        Ok(())
    }

    /// Health check — verify connectivity
    pub async fn health_check(&self) -> Result<()> {
        self.client.health_check().await
            .context("Qdrant health check failed")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_point_id_deterministic() {
        let id1 = QdrantStore::point_id("/home/user/project", "src/main.rs", "main", "Function", 1);
        let id2 = QdrantStore::point_id("/home/user/project", "src/main.rs", "main", "Function", 1);
        assert_eq!(id1, id2);
    }

    #[test]
    fn test_point_id_unique() {
        let id1 = QdrantStore::point_id("/home/user/project", "src/main.rs", "main", "Function", 1);
        let id2 = QdrantStore::point_id("/home/user/project", "src/main.rs", "main", "Function", 2);
        assert_ne!(id1, id2);
    }

    #[tokio::test]
    #[ignore = "Requires Qdrant running locally"]
    async fn test_qdrant_connection() {
        let url = std::env::var("CODESEARCH_QDRANT_URL")
            .unwrap_or_else(|_| "http://localhost:6334".to_string());
        let store = QdrantStore::new(&url).await;
        assert!(store.is_ok(), "Should connect to Qdrant: {:?}", store.err());
    }

    #[tokio::test]
    #[ignore = "Requires Qdrant running locally"]
    async fn test_qdrant_health_check() {
        let url = std::env::var("CODESEARCH_QDRANT_URL")
            .unwrap_or_else(|_| "http://localhost:6334".to_string());
        if let Ok(store) = QdrantStore::new(&url).await {
            assert!(store.health_check().await.is_ok());
        }
    }
}
