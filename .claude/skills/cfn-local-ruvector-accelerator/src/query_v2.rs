use anyhow::{Result, Context, anyhow};
use rusqlite::{Connection, params, Row};
use std::path::PathBuf;
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
    
    pub fn search(&self, query: &str, max_results: usize, threshold: f32) -> Result<Vec<SearchResult>> {
        debug!("Searching for: {} (max_results: {}, threshold: {})", query, max_results, threshold);
        
        // 1. Generate embedding for query
        let query_embedding = self.embeddings_manager.generate_embeddings(&[query.to_string()])?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("Failed to generate query embedding"))?;
        
        // 2. Get all embeddings from database
        let mut stmt = self.store.conn.prepare(
            "SELECT entity_id, embedding FROM entity_embeddings"
        )?;
        
        let embedding_rows = stmt.query_map([], |row| {
            let entity_id: i64 = row.get(0)?;
            let embedding_bytes: Vec<u8> = row.get(1)?;
            
            // Deserialize embedding from bytes
            let mut embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into()
                    .map_err(|_| rusqlite::Error::InvalidColumnType(0, "embedding".to_string(), rusqlite::types::Type::Blob))?;
                embedding.push(f32::from_le_bytes(bytes));
            }
            
            Ok((entity_id, embedding))
        })?;
        
        // 3. Calculate similarities and filter by threshold
        let mut similarities = Vec::new();
        for row_result in embedding_rows {
            let (entity_id, embedding) = row_result
                .context("Failed to read embedding row")?;
            
            let similarity = Self::cosine_similarity(&query_embedding, &embedding);
            if similarity >= threshold {
                similarities.push((entity_id, similarity));
            }
        }
        
        // 4. Sort by similarity descending
        similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        // 5. Limit results
        similarities.truncate(max_results);
        
        if similarities.is_empty() {
            info!("No results found for query: {}", query);
            return Ok(Vec::new());
        }
        
        // 6. Get entity details for top results
        let entity_ids: Vec<i64> = similarities.iter().map(|(id, _)| *id).collect();
        let entities = self.store.get_entity_batch(&entity_ids)?;
        
        // 7. Build search results
        let mut results = Vec::new();
        for (entity_id, similarity) in similarities {
            if let Some(entity) = entities.iter().find(|e| e.id == entity_id) {
                results.push(SearchResult {
                    entity_name: entity.name.clone(),
                    entity_kind: entity.kind.as_str().to_string(),
                    file_path: entity.file_path.clone(),
                    similarity,
                    line_start: Some(entity.line_number),
                    line_end: None,
                });
            }
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
    
    pub fn search_similar_entities(&self, entity_id: i64, max_results: usize, threshold: f32) -> Result<Vec<SearchResult>> {
        debug!("Finding entities similar to entity_id: {}", entity_id);
        
        // Get embedding for the reference entity
        let embedding = self.store.get_embedding(entity_id)?
            .ok_or_else(|| anyhow!("No embedding found for entity_id: {}", entity_id))?;
        
        // Get all embeddings from database
        let mut stmt = self.store.conn.prepare(
            "SELECT entity_id, embedding FROM entity_embeddings WHERE entity_id != ?"
        )?;
        
        let embedding_rows = stmt.query_map([entity_id], |row| {
            let entity_id: i64 = row.get(0)?;
            let embedding_bytes: Vec<u8> = row.get(1)?;
            
            // Deserialize embedding from bytes
            let mut embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into()
                    .map_err(|_| rusqlite::Error::InvalidColumnType(0, "embedding".to_string(), rusqlite::types::Type::Blob))?;
                embedding.push(f32::from_le_bytes(bytes));
            }
            
            Ok((entity_id, embedding))
        })?;
        
        // Calculate similarities and filter by threshold
        let mut similarities = Vec::new();
        for row_result in embedding_rows {
            let (other_entity_id, other_embedding) = row_result
                .context("Failed to read embedding row")?;
            
            let similarity = Self::cosine_similarity(&embedding, &other_embedding);
            if similarity >= threshold {
                similarities.push((other_entity_id, similarity));
            }
        }
        
        // Sort by similarity descending and limit results
        similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        similarities.truncate(max_results);
        
        if similarities.is_empty() {
            info!("No similar entities found for entity_id: {}", entity_id);
            return Ok(Vec::new());
        }
        
        // Get entity details
        let entity_ids: Vec<i64> = similarities.iter().map(|(id, _)| *id).collect();
        let entities = self.store.get_entity_batch(&entity_ids)?;
        
        // Build search results
        let mut results = Vec::new();
        for (other_entity_id, similarity) in similarities {
            if let Some(entity) = entities.iter().find(|e| e.id == other_entity_id) {
                results.push(SearchResult {
                    entity_name: entity.name.clone(),
                    entity_kind: entity.kind.as_str().to_string(),
                    file_path: entity.file_path.clone(),
                    similarity,
                    line_start: Some(entity.line_number),
                    line_end: None,
                });
            }
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
        let results = query.search("test query", 10, 0.5)?;
        
        assert!(results.is_empty());
        Ok(())
    }
}