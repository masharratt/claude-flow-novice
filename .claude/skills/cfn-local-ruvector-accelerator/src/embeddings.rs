use anyhow::{Result, Context, anyhow};
use ndarray::Array1;
use serde::{Serialize, Deserialize};
use std::path::Path;
use std::collections::HashMap;
use std::fs;
use tracing::{info, debug};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    pub dimension: usize,
    pub model: String,
    pub batch_size: usize,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            dimension: 1536,
            model: "text-embedding-ada-002".to_string(),
            batch_size: 100,
        }
    }
}

#[derive(Debug, Clone)]
pub struct EmbeddingsManager {
    config: EmbeddingConfig,
    cache: HashMap<String, Array1<f32>>,
}

impl EmbeddingsManager {
    pub fn new(cache_dir: &Path) -> Result<Self> {
        fs::create_dir_all(cache_dir)
            .context("Failed to create embeddings cache directory")?;

        let config = EmbeddingConfig::default();

        Ok(Self {
            config,
            cache: HashMap::new(),
        })
    }

    pub fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        debug!("Generating embeddings for {} texts", texts.len());

        let mut embeddings = Vec::with_capacity(texts.len());

        for text in texts {
            // Generate a simple dummy embedding for now
            // In a real implementation, this would call an embedding API
            let embedding = self.generate_dummy_embedding(text)?;
            embeddings.push(embedding);
        }

        info!("Generated {} embeddings", embeddings.len());
        Ok(embeddings)
    }

    pub fn generate_embedding(&self, text: &str) -> Result<Vec<f32>> {
        // Check cache first
        if let Some(embedding) = self.cache.get(text) {
            return Ok(embedding.to_vec());
        }

        // Generate new embedding
        let embedding = self.generate_dummy_embedding(text)?;
        
        Ok(embedding)
    }

    fn generate_dummy_embedding(&self, text: &str) -> Result<Vec<f32>> {
        // Generate a deterministic but pseudo-random embedding based on text
        let mut embedding = vec![0.0; self.config.dimension];
        
        // Simple hash-based embedding generation
        let bytes = text.as_bytes();
        for (i, &byte) in bytes.iter().enumerate() {
            let pos = (i * 7) % self.config.dimension;
            embedding[pos] = ((byte as f32) / 255.0) * 2.0 - 1.0;
        }

        // Apply some transformations to make it more realistic
        self.normalize_embedding(&mut embedding);

        Ok(embedding)
    }

    fn normalize_embedding(&self, embedding: &mut [f32]) {
        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for v in embedding.iter_mut() {
                *v /= norm;
            }
        }
    }

    pub fn compute_similarity(&self, a: &[f32], b: &[f32]) -> Result<f32> {
        if a.len() != b.len() {
            return Err(anyhow!("Embedding dimensions don't match"));
        }

        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

        if norm_a == 0.0 || norm_b == 0.0 {
            return Ok(0.0);
        }

        Ok(dot_product / (norm_a * norm_b))
    }

    pub fn batch_cosine_similarity(&self, query: &[f32], embeddings: &[Vec<f32>]) -> Result<Vec<f32>> {
        embeddings
            .iter()
            .map(|emb| self.compute_similarity(query, emb))
            .collect()
    }
}
