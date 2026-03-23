use anyhow::{Result, Context, anyhow};
use rusqlite::{Connection, params, Row};
use std::path::{Path, PathBuf};
use tracing::{info, debug, warn, error};
use crate::embeddings::EmbeddingsManager;
use crate::store_v2::StoreV2;

#[derive(Debug)]
pub struct QueryV2 {
    store: StoreV2,
    embeddings_manager: EmbeddingsManager,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub entity_name: String,
    pub entity_kind: String,
    pub file_path: String,
    pub similarity: f32,
    pub line_start: Option<i64>,
    pub line_end: Option<i64>,
}

impl QueryV2 {
    pub fn new(db_path: &PathBuf) -> Result<Self> {
        let store = StoreV2::new(db_path)
            .context("Failed to initialize store")?;
        
        let cache_dir = db_path.parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("cache");
        
        let embeddings_manager = EmbeddingsManager::new(&cache_dir)
            .context("Failed to initialize embeddings manager")?;

        Ok(Self {
            store,
            embeddings_manager,
        })
    }
    
    pub fn search(&self, query: &str, max_results: usize, threshold: f32, project_root: &Path) -> Result<Vec<SearchResult>> {
        debug!("Searching for: {} (max_results: {}, threshold: {}) in project root: {}", query, max_results, threshold, project_root.display());

        // 1. Generate embedding for query
        let query_embedding = self.embeddings_manager.generate_embeddings(&[query.to_string()])?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("Failed to generate query embedding"))?;

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();

        // 2. Get all embeddings with entity details, filtered by project root
        let mut stmt = self.store.conn.prepare(
            "SELECT e.id, e.kind, e.name, e.signature, e.visibility, e.parent_id,
                    e.file_path, e.line_number, e.column_number, e.doc_comment,
                    e.attributes, e.metadata, e.created_at, e.updated_at,
                    ee.embedding
             FROM entities e
             JOIN entity_embeddings ee ON e.id = ee.entity_id
             WHERE e.project_root = ?"
        )?;

        let embedding_rows = stmt.query_map(params![project_root_str], |row| {
            let entity_id: i64 = row.get(0)?;
            let entity_kind: String = row.get(1)?;
            let entity_name: String = row.get(2)?;
            let file_path: String = row.get(6)?;
            let line_number: i64 = row.get(7)?;
            let embedding_bytes: Vec<u8> = row.get(14)?;
            
            // Deserialize embedding from bytes
            let mut embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into()
                    .map_err(|_| rusqlite::Error::InvalidColumnType(14, "embedding".to_string(), rusqlite::types::Type::Blob))?;
                embedding.push(f32::from_le_bytes(bytes));
            }
            
            Ok((entity_id, entity_kind, entity_name, file_path, line_number, embedding))
        })?;
        
        // 3. Calculate similarities and filter by threshold
        let mut similarities = Vec::new();
        for row_result in embedding_rows {
            let (entity_id, entity_kind, entity_name, file_path, line_number, embedding) = row_result
                .context("Failed to read embedding row")?;
            
            let similarity = Self::cosine_similarity(&query_embedding, &embedding);
            if similarity >= threshold {
                similarities.push((entity_id, entity_kind, entity_name, file_path, line_number, similarity));
            }
        }
        
        // 4. Sort by similarity descending
        similarities.sort_by(|a, b| b.5.partial_cmp(&a.5).unwrap_or(std::cmp::Ordering::Equal));
        
        // 5. Limit results
        similarities.truncate(max_results);
        
        if similarities.is_empty() {
            info!("No results found for query: {}", query);
            return Ok(Vec::new());
        }
        
        // 6. Build search results
        let mut results = Vec::new();
        for (_, entity_kind, entity_name, file_path, line_number, similarity) in similarities {
            results.push(SearchResult {
                entity_name,
                entity_kind,
                file_path,
                similarity,
                line_start: Some(line_number),
                line_end: None,
            });
        }
        
        info!("Found {} results for query: {}", results.len(), query);
        Ok(results)
    }
    
    fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
            return 0.0;
        }
        
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }
        
        dot_product / (norm_a * norm_b)
    }
    
    pub fn search_similar_entities(&self, entity_id: i64, max_results: usize, threshold: f32, project_root: &Path) -> Result<Vec<SearchResult>> {
        debug!("Finding entities similar to entity_id: {} in project root: {}", entity_id, project_root.display());

        // Get embedding for the reference entity
        let embedding = self.store.get_embedding(entity_id)?
            .ok_or_else(|| anyhow!("No embedding found for entity_id: {}", entity_id))?;

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let project_root_pattern = format!("{}%", project_root_str);

        // Get all embeddings with entity details, excluding the reference entity, filtered by project root
        let mut stmt = self.store.conn.prepare(
            "SELECT e.id, e.kind, e.name, e.signature, e.visibility, e.parent_id,
                    e.file_path, e.line_number, e.column_number, e.doc_comment,
                    e.attributes, e.metadata, e.created_at, e.updated_at,
                    ee.embedding
             FROM entities e
             JOIN entity_embeddings ee ON e.id = ee.entity_id
             WHERE e.id != ? AND e.file_path LIKE ?"
        )?;
        
        let embedding_rows = stmt.query_map(params![entity_id, project_root_pattern], |row| {
            let other_entity_id: i64 = row.get(0)?;
            let entity_kind: String = row.get(1)?;
            let entity_name: String = row.get(2)?;
            let file_path: String = row.get(6)?;
            let line_number: i64 = row.get(7)?;
            let embedding_bytes: Vec<u8> = row.get(14)?;
            
            // Deserialize embedding from bytes
            let mut other_embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into()
                    .map_err(|_| rusqlite::Error::InvalidColumnType(14, "embedding".to_string(), rusqlite::types::Type::Blob))?;
                other_embedding.push(f32::from_le_bytes(bytes));
            }
            
            Ok((other_entity_id, entity_kind, entity_name, file_path, line_number, other_embedding))
        })?;
        
        // Calculate similarities and filter by threshold
        let mut similarities = Vec::new();
        for row_result in embedding_rows {
            let (other_entity_id, entity_kind, entity_name, file_path, line_number, other_embedding) = row_result
                .context("Failed to read embedding row")?;
            
            let similarity = Self::cosine_similarity(&embedding, &other_embedding);
            if similarity >= threshold {
                similarities.push((other_entity_id, entity_kind, entity_name, file_path, line_number, similarity));
            }
        }
        
        // Sort by similarity descending and limit results
        similarities.sort_by(|a, b| b.5.partial_cmp(&a.5).unwrap_or(std::cmp::Ordering::Equal));
        similarities.truncate(max_results);
        
        if similarities.is_empty() {
            info!("No similar entities found for entity_id: {}", entity_id);
            return Ok(Vec::new());
        }
        
        // Build search results
        let mut results = Vec::new();
        for (_, entity_kind, entity_name, file_path, line_number, similarity) in similarities {
            results.push(SearchResult {
                entity_name,
                entity_kind,
                file_path,
                similarity,
                line_start: Some(line_number),
                line_end: None,
            });
        }
        
        info!("Found {} similar entities for entity_id: {}", results.len(), entity_id);
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::schema_v2::SchemaV2;
    use crate::store_v2::Entity;
    use crate::schema_v2::{EntityKind, Visibility};
    use chrono::Utc;
    
    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((QueryV2::cosine_similarity(&a, &b) - 1.0).abs() < f32::EPSILON);
        
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!((QueryV2::cosine_similarity(&a, &b) - 0.0).abs() < f32::EPSILON);
        
        let a = vec![1.0, 1.0, 0.0];
        let b = vec![1.0, 0.0, 1.0];
        let expected = 1.0 / (2.0_f32.sqrt() * 2.0_f32.sqrt());
        assert!((QueryV2::cosine_similarity(&a, &b) - expected).abs() < f32::EPSILON);
    }
    
    #[test]
    fn test_search_no_embeddings() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_search.db");
        let conn = Connection::open(&db_path)?;

        // Initialize schema
        SchemaV2::initialize(&conn)?;

        let query = QueryV2::new(&db_path)?;
        let results = query.search("test query", 10, 0.5, dir.path())?;

        assert!(results.is_empty());
        Ok(())
    }
}