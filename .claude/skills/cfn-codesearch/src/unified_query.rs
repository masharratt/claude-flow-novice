//! Unified query interface for CodeSearch
//!
//! Orchestrates queries across SQLite (structural), Qdrant (semantic),
//! and Memgraph (graph) backends. Merges, deduplicates, and ranks results.

use anyhow::{Result, Context, anyhow};
use serde::{Serialize, Deserialize};
use tracing::{info, debug, warn};
use std::collections::HashMap;
use std::path::Path;

use crate::query_v2::{QueryV2, SearchResult as SqliteSearchResult};
use crate::store_qdrant::{QdrantStore, QdrantSearchResult, SearchFilters};
use crate::store_memgraph::{MemgraphStore, ImpactResult, CrossProjectDep};
use crate::embeddings::EmbeddingsManager;

/// Unified search result combining all backends
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedSearchResult {
    pub entity_name: String,
    pub entity_kind: String,
    pub file_path: String,
    pub line_number: Option<i64>,
    pub similarity: f32,
    pub semantic_score: f32,
    pub structural_score: f32,
    pub graph_relevance: f32,
    pub source: ResultSource,
}

/// Which backend produced this result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResultSource {
    Sqlite,
    Qdrant,
    Both,
}

/// Weights for result ranking
#[derive(Debug, Clone)]
pub struct RankingWeights {
    pub semantic: f32,
    pub structural: f32,
    pub graph: f32,
}

impl Default for RankingWeights {
    fn default() -> Self {
        Self {
            semantic: 0.4,
            structural: 0.3,
            graph: 0.3,
        }
    }
}

/// Configuration for unified queries
#[derive(Debug, Clone)]
pub struct UnifiedQueryConfig {
    pub max_results: usize,
    pub threshold: f32,
    pub weights: RankingWeights,
    pub project_root: Option<String>,
    pub entity_kind_filter: Option<String>,
    pub file_filter: Option<String>,
}

impl Default for UnifiedQueryConfig {
    fn default() -> Self {
        Self {
            max_results: 10,
            threshold: 0.3,
            weights: RankingWeights::default(),
            project_root: None,
            entity_kind_filter: None,
            file_filter: None,
        }
    }
}

/// Unified query engine that orchestrates all 3 backends
pub struct UnifiedQuery {
    query_v2: QueryV2,
    qdrant_store: Option<QdrantStore>,
    memgraph_store: Option<MemgraphStore>,
    embeddings_manager: EmbeddingsManager,
}

impl UnifiedQuery {
    pub fn new(
        query_v2: QueryV2,
        qdrant_store: Option<QdrantStore>,
        memgraph_store: Option<MemgraphStore>,
        embeddings_manager: EmbeddingsManager,
    ) -> Self {
        Self {
            query_v2,
            qdrant_store,
            memgraph_store,
            embeddings_manager,
        }
    }

    /// Main search: combines SQLite structural + Qdrant semantic + Memgraph graph enrichment
    pub async fn search(
        &self,
        query: &str,
        config: &UnifiedQueryConfig,
    ) -> Result<Vec<UnifiedSearchResult>> {
        let project_root_path = config.project_root.as_ref()
            .map(|p| std::path::PathBuf::from(p));

        // 1. SQLite structural search (entity name/signature LIKE matching)
        let sqlite_results = if let Some(ref pr) = project_root_path {
            self.query_v2.search(query, config.max_results * 2, config.threshold, pr)?
        } else {
            Vec::new()
        };

        // 2. Qdrant semantic search (if available)
        let qdrant_results = if let Some(ref qdrant) = self.qdrant_store {
            let query_embedding = self.embeddings_manager
                .generate_embeddings(&[query.to_string()])?
                .into_iter()
                .next()
                .ok_or_else(|| anyhow!("Failed to generate query embedding"))?;

            let filters = SearchFilters {
                project_root: config.project_root.clone(),
                entity_kind: config.entity_kind_filter.clone(),
                file_path: config.file_filter.clone(),
            };

            match qdrant.search_similar(
                &query_embedding,
                config.max_results * 2,
                config.threshold,
                &filters,
            ).await {
                Ok(results) => results,
                Err(e) => {
                    warn!("Qdrant search failed, continuing with SQLite only: {}", e);
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };

        // 3. Merge and deduplicate
        let mut merged = self.merge_results(&sqlite_results, &qdrant_results, config);

        // 4. Graph enrichment (if Memgraph available, for top-N only)
        if let Some(ref memgraph) = self.memgraph_store {
            let top_n = std::cmp::min(merged.len(), config.max_results);
            for result in merged.iter_mut().take(top_n) {
                match memgraph.find_dependents(
                    &result.entity_name,
                    config.project_root.as_deref(),
                    2,
                ).await {
                    Ok(deps) => {
                        // Graph relevance = normalized dependent count
                        let dep_count = deps.len() as f32;
                        result.graph_relevance = (dep_count / 10.0).min(1.0);
                    }
                    Err(e) => {
                        debug!("Memgraph enrichment failed for {}: {}", result.entity_name, e);
                    }
                }
            }
        }

        // 5. Re-rank with weighted scores
        for result in &mut merged {
            result.similarity = config.weights.semantic * result.semantic_score
                + config.weights.structural * result.structural_score
                + config.weights.graph * result.graph_relevance;
        }

        merged.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        merged.truncate(config.max_results);

        Ok(merged)
    }

    /// Merge SQLite and Qdrant results, deduplicating by (file_path, line_number, entity_name)
    fn merge_results(
        &self,
        sqlite_results: &[SqliteSearchResult],
        qdrant_results: &[QdrantSearchResult],
        config: &UnifiedQueryConfig,
    ) -> Vec<UnifiedSearchResult> {
        // Key: (file_path, entity_name, line_number)
        let mut seen: HashMap<(String, String, i64), usize> = HashMap::new();
        let mut merged = Vec::new();

        // Add SQLite results
        for r in sqlite_results {
            let line = r.line_start.unwrap_or(0);
            let key = (r.file_path.clone(), r.entity_name.clone(), line);

            let result = UnifiedSearchResult {
                entity_name: r.entity_name.clone(),
                entity_kind: r.entity_kind.clone(),
                file_path: r.file_path.clone(),
                line_number: r.line_start,
                similarity: r.similarity,
                semantic_score: 0.0,
                structural_score: r.similarity,
                graph_relevance: 0.0,
                source: ResultSource::Sqlite,
            };

            seen.insert(key, merged.len());
            merged.push(result);
        }

        // Add Qdrant results, merging with existing if duplicate
        for r in qdrant_results {
            let key = (r.file_path.clone(), r.entity_name.clone(), r.line_number);

            if let Some(&idx) = seen.get(&key) {
                // Merge: this entity appeared in both backends
                merged[idx].semantic_score = r.similarity;
                merged[idx].source = ResultSource::Both;
            } else {
                let result = UnifiedSearchResult {
                    entity_name: r.entity_name.clone(),
                    entity_kind: r.entity_kind.clone(),
                    file_path: r.file_path.clone(),
                    line_number: Some(r.line_number),
                    similarity: r.similarity,
                    semantic_score: r.similarity,
                    structural_score: 0.0,
                    graph_relevance: 0.0,
                    source: ResultSource::Qdrant,
                };

                seen.insert(key, merged.len());
                merged.push(result);
            }
        }

        merged
    }

    /// Impact analysis: pure Memgraph traversal, enriched with SQLite details
    pub async fn impact_analysis(
        &self,
        entity_name: &str,
        project_root: Option<&str>,
    ) -> Result<Vec<ImpactResult>> {
        let memgraph = self.memgraph_store.as_ref()
            .ok_or_else(|| anyhow!("Memgraph not available for impact analysis"))?;

        memgraph.find_dependents(entity_name, project_root, 5).await
    }

    /// Find similar entities: look up entity's vector in Qdrant, search for neighbors
    pub async fn find_similar(
        &self,
        entity_name: &str,
        project_root: &str,
        max_results: usize,
    ) -> Result<Vec<UnifiedSearchResult>> {
        let qdrant = self.qdrant_store.as_ref()
            .ok_or_else(|| anyhow!("Qdrant not available for similarity search"))?;

        // Use entity name as search query to find the entity's embedding
        let query_embedding = self.embeddings_manager
            .generate_embeddings(&[entity_name.to_string()])?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("Failed to generate embedding for entity"))?;

        let filters = SearchFilters {
            project_root: Some(project_root.to_string()),
            ..Default::default()
        };

        let results = qdrant.search_similar(&query_embedding, max_results, 0.3, &filters).await?;

        Ok(results.into_iter().map(|r| UnifiedSearchResult {
            entity_name: r.entity_name,
            entity_kind: r.entity_kind,
            file_path: r.file_path,
            line_number: Some(r.line_number),
            similarity: r.similarity,
            semantic_score: r.similarity,
            structural_score: 0.0,
            graph_relevance: 0.0,
            source: ResultSource::Qdrant,
        }).collect())
    }

    /// Cross-project search: Qdrant search without project_root filter
    pub async fn cross_project_search(
        &self,
        query: &str,
        max_results: usize,
        threshold: f32,
    ) -> Result<Vec<UnifiedSearchResult>> {
        let qdrant = self.qdrant_store.as_ref()
            .ok_or_else(|| anyhow!("Qdrant not available for cross-project search"))?;

        let query_embedding = self.embeddings_manager
            .generate_embeddings(&[query.to_string()])?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("Failed to generate query embedding"))?;

        let filters = SearchFilters::default(); // No project filter

        let results = qdrant.search_similar(&query_embedding, max_results, threshold, &filters).await?;

        Ok(results.into_iter().map(|r| UnifiedSearchResult {
            entity_name: r.entity_name,
            entity_kind: r.entity_kind,
            file_path: r.file_path,
            line_number: Some(r.line_number),
            similarity: r.similarity,
            semantic_score: r.similarity,
            structural_score: 0.0,
            graph_relevance: 0.0,
            source: ResultSource::Qdrant,
        }).collect())
    }

    /// Cross-project dependency map via Memgraph
    pub async fn cross_project_deps(&self, project_root: &str) -> Result<Vec<CrossProjectDep>> {
        let memgraph = self.memgraph_store.as_ref()
            .ok_or_else(|| anyhow!("Memgraph not available for cross-project deps"))?;

        memgraph.find_cross_project_deps(project_root).await
    }

    /// Check which backends are available
    pub fn available_backends(&self) -> Vec<&'static str> {
        let mut backends = vec!["sqlite"];
        if self.qdrant_store.is_some() {
            backends.push("qdrant");
        }
        if self.memgraph_store.is_some() {
            backends.push("memgraph");
        }
        backends
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_weights() {
        let w = RankingWeights::default();
        let total = w.semantic + w.structural + w.graph;
        assert!((total - 1.0).abs() < 0.001, "Weights should sum to 1.0");
    }

    #[test]
    fn test_default_config() {
        let c = UnifiedQueryConfig::default();
        assert_eq!(c.max_results, 10);
        assert_eq!(c.threshold, 0.3);
    }
}
