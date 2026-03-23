use anyhow::{Result, anyhow};
use std::path::Path;
use std::env;
use tracing::{info, debug};

/// Which embedding backend to use
#[derive(Debug, Clone)]
pub enum EmbeddingBackend {
    /// Local fastembed (BGE-small-en-v1.5, 384-dim, no API key)
    Local,
    /// OpenAI text-embedding-3-small (1536-dim, requires OPENAI_API_KEY)
    OpenAI,
}

/// Embedding dimension for each backend
pub const LOCAL_DIMENSION: usize = 384;
pub const OPENAI_DIMENSION: usize = 1536;

pub struct EmbeddingsManager {
    pub backend: EmbeddingBackend,
    // OpenAI fields (only used when backend == OpenAI)
    openai_api_key: Option<String>,
    http_client: Option<reqwest::Client>,
    // fastembed model is not Clone, so we hold it behind Arc
    local_model: Option<std::sync::Arc<fastembed::TextEmbedding>>,
}

impl std::fmt::Debug for EmbeddingsManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "EmbeddingsManager({:?}, {}d)",
            match self.backend { EmbeddingBackend::Local => "local", EmbeddingBackend::OpenAI => "openai" },
            self.dimension())
    }
}

impl Clone for EmbeddingsManager {
    fn clone(&self) -> Self {
        Self {
            backend: self.backend.clone(),
            openai_api_key: self.openai_api_key.clone(),
            http_client: self.http_client.clone(),
            local_model: self.local_model.clone(),
        }
    }
}

impl EmbeddingsManager {
    /// Create manager — prefers local fastembed, falls back to OpenAI if `use_openai=true`
    pub fn new(cache_dir: &Path) -> Result<Self> {
        Self::new_with_backend(cache_dir, false)
    }

    pub fn new_with_backend(cache_dir: &Path, use_openai: bool) -> Result<Self> {
        std::fs::create_dir_all(cache_dir)?;

        if use_openai {
            let api_key = env::var("OPENAI_API_KEY")
                .map_err(|_| anyhow!("OPENAI_API_KEY not found. Set it with: export OPENAI_API_KEY=\"sk-...\""))?;
            info!("Using OpenAI embeddings (text-embedding-3-small, {}d)", OPENAI_DIMENSION);
            return Ok(Self {
                backend: EmbeddingBackend::OpenAI,
                openai_api_key: Some(api_key),
                http_client: Some(reqwest::Client::new()),
                local_model: None,
            });
        }

        // Default: local fastembed
        info!("Loading fastembed BGE-small-en-v1.5 ({}d, no API key needed)...", LOCAL_DIMENSION);
        let model = fastembed::TextEmbedding::try_new(
            fastembed::InitOptions::new(fastembed::EmbeddingModel::BGESmallENV15)
        ).map_err(|e| anyhow!("Failed to load fastembed model: {}", e))?;
        info!("fastembed model loaded");

        Ok(Self {
            backend: EmbeddingBackend::Local,
            openai_api_key: None,
            http_client: None,
            local_model: Some(std::sync::Arc::new(model)),
        })
    }

    /// Embedding dimension for the active backend
    pub fn dimension(&self) -> usize {
        match self.backend {
            EmbeddingBackend::Local => LOCAL_DIMENSION,
            EmbeddingBackend::OpenAI => OPENAI_DIMENSION,
        }
    }

    /// Generate embeddings for a batch of texts
    pub fn generate_embeddings(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        debug!("Generating {} embeddings via {:?}", texts.len(), self.backend);
        match self.backend {
            EmbeddingBackend::Local => self.generate_local(texts),
            EmbeddingBackend::OpenAI => self.generate_openai(texts),
        }
    }

    fn generate_local(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let model = self.local_model.as_ref()
            .ok_or_else(|| anyhow!("Local model not initialized"))?;
        let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
        let embeddings = model.embed(text_refs, None)
            .map_err(|e| anyhow!("fastembed error: {}", e))?;
        info!("Generated {} embeddings", embeddings.len());
        Ok(embeddings)
    }

    fn generate_openai(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let api_key = self.openai_api_key.as_ref()
            .ok_or_else(|| anyhow!("OpenAI API key not configured"))?;
        let client = self.http_client.as_ref()
            .ok_or_else(|| anyhow!("HTTP client not initialized"))?;

        let body = serde_json::json!({
            "input": texts,
            "model": "text-embedding-3-small"
        });

        // Handle both tokio runtime contexts
        let response_bytes = match tokio::runtime::Handle::try_current() {
            Ok(handle) => {
                handle.block_on(async {
                    client.post("https://api.openai.com/v1/embeddings")
                        .header("Authorization", format!("Bearer {}", api_key))
                        .json(&body)
                        .send().await?
                        .bytes().await
                })
            }
            Err(_) => {
                let rt = tokio::runtime::Runtime::new()?;
                rt.block_on(async {
                    client.post("https://api.openai.com/v1/embeddings")
                        .header("Authorization", format!("Bearer {}", api_key))
                        .json(&body)
                        .send().await?
                        .bytes().await
                })
            }
        }.map_err(|e| anyhow!("OpenAI request failed: {}", e))?;

        let json: serde_json::Value = serde_json::from_slice(&response_bytes)?;

        if let Some(err) = json.get("error") {
            return Err(anyhow!("OpenAI API error: {}", err));
        }

        let embeddings: Vec<Vec<f32>> = json["data"].as_array()
            .ok_or_else(|| anyhow!("No data in OpenAI response"))?
            .iter()
            .map(|item| {
                item["embedding"].as_array().unwrap()
                    .iter().map(|v| v.as_f64().unwrap() as f32)
                    .collect()
            })
            .collect();

        info!("Generated {} embeddings", embeddings.len());
        Ok(embeddings)
    }

    pub fn compute_similarity(&self, a: &[f32], b: &[f32]) -> Result<f32> {
        if a.len() != b.len() {
            return Err(anyhow!("Embedding dimensions don't match: {} vs {}", a.len(), b.len()));
        }
        let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
        let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if na == 0.0 || nb == 0.0 { Ok(0.0) } else { Ok(dot / (na * nb)) }
    }

    pub fn batch_cosine_similarity(&self, query: &[f32], embeddings: &[Vec<f32>]) -> Result<Vec<f32>> {
        embeddings.iter().map(|emb| self.compute_similarity(query, emb)).collect()
    }
}
