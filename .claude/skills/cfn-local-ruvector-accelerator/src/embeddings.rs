use anyhow::{Result, Context, anyhow};
use serde::{Serialize, Deserialize};
use std::path::Path;
use std::env;
use reqwest;
use tokio;
use tracing::{info, debug, warn, error};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingConfig {
    pub dimension: usize,
    pub model: String,
    pub batch_size: usize,
    pub api_key: Option<String>,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            dimension: 1536,
            model: "text-embedding-3-small".to_string(),
            batch_size: 100,
            api_key: env::var("OPENAI_API_KEY").ok(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct EmbeddingsManager {
    config: EmbeddingConfig,
    client: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    input: Vec<String>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    data: Vec<OpenAIEmbedding>,
}

#[derive(Debug, Deserialize)]
struct OpenAIEmbedding {
    embedding: Vec<f32>,
}

impl EmbeddingsManager {
    pub fn new(cache_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(cache_dir)
            .context("Failed to create embeddings cache directory")?;

        let config = EmbeddingConfig::default();
        let client = reqwest::Client::new();

        Ok(Self {
            config,
            client,
        })
    }

    async fn call_openai_api(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let api_key = self.config.api_key.as_ref()
            .ok_or_else(|| anyhow!("OpenAI API key not configured"))?;

        let request = OpenAIRequest {
            input: texts.to_vec(),
            model: self.config.model.clone(),
        };

        let response = self.client
            .post("https://api.openai.com/v1/embeddings")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Failed to send request to OpenAI API")?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("OpenAI API error: {} - {}", status, error_text);
            return Err(anyhow!("OpenAI API request failed: {}", status));
        }

        let openai_response: OpenAIResponse = response.json().await
            .context("Failed to parse OpenAI API response")?;

        let embeddings: Vec<Vec<f32>> = openai_response.data
            .into_iter()
            .map(|emb| emb.embedding)
            .collect();

        Ok(embeddings)
    }

    pub fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        debug!("Generating embeddings for {} texts", texts.len());

        if self.config.api_key.is_none() {
            error!("OPENAI_API_KEY environment variable not set");
            return Err(anyhow!(
                "OPENAI_API_KEY not found. Set it with: export OPENAI_API_KEY=\"sk-...\""
            ));
        }

        let mut all_embeddings = Vec::with_capacity(texts.len());
        let rt = tokio::runtime::Runtime::new()?;

        for chunk in texts.chunks(self.config.batch_size) {
            let embeddings = rt.block_on(self.call_openai_api(chunk))
                .context("Failed to generate embeddings from OpenAI API")?;
            all_embeddings.extend(embeddings);
        }

        info!("Generated {} embeddings", all_embeddings.len());
        Ok(all_embeddings)
    }

    fn generate_dummy_embedding(&self, text: &str) -> Vec<f32> {
        let mut embedding = vec![0.0; self.config.dimension];
        
        let bytes = text.as_bytes();
        for (i, &byte) in bytes.iter().enumerate() {
            let pos = (i * 7) % self.config.dimension;
            embedding[pos] = ((byte as f32) / 255.0) * 2.0 - 1.0;
        }

        self.normalize_embedding(&mut embedding);
        embedding
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