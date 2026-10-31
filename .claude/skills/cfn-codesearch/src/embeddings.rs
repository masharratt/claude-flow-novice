use anyhow::{Result, anyhow};
use std::path::Path;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tracing::{info, debug, warn};

/// Env var: `cpu` forces the CPU provider; anything else (or unset) tries CUDA first.
pub const DEVICE_ENV: &str = "CODESEARCH_DEVICE";
/// Env var: CUDA arena cap in MiB (the GPU is shared with renders, so keep it small).
pub const GPU_MEM_ENV: &str = "CODESEARCH_GPU_MEM_MB";
/// Default CUDA arena cap in MiB.
pub const DEFAULT_GPU_MEM_MB: usize = 3072;

/// Which ONNX Runtime execution provider the local model should try.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DevicePlan {
    Cpu,
    Cuda { mem_limit_bytes: usize },
}

/// Pure provider selection from the two env values (testable without touching the process env).
pub fn plan_device(device_env: Option<&str>, gpu_mem_env: Option<&str>) -> DevicePlan {
    if device_env.map(|d| d.trim().eq_ignore_ascii_case("cpu")).unwrap_or(false) {
        return DevicePlan::Cpu;
    }
    let mem_mb = gpu_mem_env
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|mb| *mb > 0)
        .unwrap_or(DEFAULT_GPU_MEM_MB);
    DevicePlan::Cuda { mem_limit_bytes: mem_mb * 1024 * 1024 }
}

fn plan_device_from_env() -> DevicePlan {
    plan_device(env::var(DEVICE_ENV).ok().as_deref(), env::var(GPU_MEM_ENV).ok().as_deref())
}

fn load_cpu_model() -> Result<fastembed::TextEmbedding> {
    fastembed::TextEmbedding::try_new(
        fastembed::InitOptions::new(fastembed::EmbeddingModel::BGESmallENV15)
    ).map_err(|e| anyhow!("Failed to load fastembed model: {}", e))
}

/// Load the local model on the planned device. Returns the model and whether it runs on CUDA.
/// Any CUDA failure (missing libs, no device, out of memory) falls back to CPU.
fn load_local_model(plan: DevicePlan) -> Result<(fastembed::TextEmbedding, bool)> {
    #[cfg(not(feature = "gpu"))]
    if matches!(plan, DevicePlan::Cuda { .. }) {
        debug!("Built without the gpu feature: using CPU");
    }
    #[cfg(feature = "gpu")]
    if let DevicePlan::Cuda { mem_limit_bytes } = plan {
        use ort::execution_providers::{ArenaExtendStrategy, CUDAExecutionProvider};
        let ep = CUDAExecutionProvider::default()
            .with_memory_limit(mem_limit_bytes)
            .with_arena_extend_strategy(ArenaExtendStrategy::SameAsRequested)
            .build()
            .error_on_failure();
        let opts = fastembed::InitOptions::new(fastembed::EmbeddingModel::BGESmallENV15)
            .with_execution_providers(vec![ep]);
        match fastembed::TextEmbedding::try_new(opts) {
            Ok(model) => {
                info!("Embedding provider: CUDAExecutionProvider (GPU, arena cap {} MiB)",
                    mem_limit_bytes / (1024 * 1024));
                return Ok((model, true));
            }
            Err(e) => warn!("CUDA provider unavailable, falling back to CPU: {}", e),
        }
    }
    let model = load_cpu_model()?;
    info!("Embedding provider: CPUExecutionProvider");
    Ok((model, false))
}

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
    local_model: Option<Arc<fastembed::TextEmbedding>>,
    // True while `local_model` runs on CUDA; cleared (shared across clones) after a GPU failure.
    gpu_active: Arc<AtomicBool>,
    // CPU model built lazily if the CUDA model fails mid-run (e.g. GPU out of memory).
    cpu_fallback: Arc<Mutex<Option<Arc<fastembed::TextEmbedding>>>>,
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
            gpu_active: self.gpu_active.clone(),
            cpu_fallback: self.cpu_fallback.clone(),
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
                gpu_active: Arc::new(AtomicBool::new(false)),
                cpu_fallback: Arc::new(Mutex::new(None)),
            });
        }

        // Default: local fastembed
        info!("Loading fastembed BGE-small-en-v1.5 ({}d, no API key needed)...", LOCAL_DIMENSION);
        let (model, on_gpu) = load_local_model(plan_device_from_env())?;
        info!("fastembed model loaded");

        Ok(Self {
            backend: EmbeddingBackend::Local,
            openai_api_key: None,
            http_client: None,
            local_model: Some(Arc::new(model)),
            gpu_active: Arc::new(AtomicBool::new(on_gpu)),
            cpu_fallback: Arc::new(Mutex::new(None)),
        })
    }

    /// Local model on the CPU provider regardless of CODESEARCH_DEVICE or the
    /// gpu feature (the resident `serve` process must never hold GPU memory).
    pub fn new_cpu_only() -> Result<Self> {
        let (model, on_gpu) = load_local_model(DevicePlan::Cpu)?;
        Ok(Self {
            backend: EmbeddingBackend::Local,
            openai_api_key: None,
            http_client: None,
            local_model: Some(Arc::new(model)),
            gpu_active: Arc::new(AtomicBool::new(on_gpu)),
            cpu_fallback: Arc::new(Mutex::new(None)),
        })
    }

    /// Whether embeddings currently run on CUDA.
    pub fn on_gpu(&self) -> bool {
        self.gpu_active.load(Ordering::Acquire)
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
        let embeddings = if self.gpu_active.load(Ordering::Acquire) {
            match model.embed(text_refs.clone(), None) {
                Ok(e) => e,
                Err(e) => {
                    warn!("CUDA embedding failed, switching to CPU for the rest of this run: {}", e);
                    self.gpu_active.store(false, Ordering::Release);
                    self.cpu_model()?.embed(text_refs, None)
                        .map_err(|e| anyhow!("fastembed error: {}", e))?
                }
            }
        } else if self.cpu_fallback_loaded() {
            self.cpu_model()?.embed(text_refs, None)
                .map_err(|e| anyhow!("fastembed error: {}", e))?
        } else {
            model.embed(text_refs, None)
                .map_err(|e| anyhow!("fastembed error: {}", e))?
        };
        info!("Generated {} embeddings", embeddings.len());
        Ok(embeddings)
    }

    fn cpu_fallback_loaded(&self) -> bool {
        self.cpu_fallback.lock().map(|g| g.is_some()).unwrap_or(false)
    }

    /// The lazily built CPU model used after a CUDA failure.
    fn cpu_model(&self) -> Result<Arc<fastembed::TextEmbedding>> {
        let mut guard = self.cpu_fallback.lock()
            .map_err(|_| anyhow!("CPU fallback model lock poisoned"))?;
        if let Some(m) = guard.as_ref() {
            return Ok(m.clone());
        }
        let model = Arc::new(load_cpu_model()?);
        info!("Embedding provider: CPUExecutionProvider (fallback after CUDA failure)");
        *guard = Some(model.clone());
        Ok(model)
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

#[cfg(test)]
mod device_plan_tests {
    use super::*;

    const MIB: usize = 1024 * 1024;

    #[test]
    fn plan_device_defaults_to_cuda_with_3gib_cap() {
        assert_eq!(plan_device(None, None), DevicePlan::Cuda { mem_limit_bytes: 3072 * MIB });
    }

    #[test]
    fn plan_device_cpu_env_forces_cpu_case_insensitive() {
        assert_eq!(plan_device(Some("cpu"), None), DevicePlan::Cpu);
        assert_eq!(plan_device(Some(" CPU "), Some("8000")), DevicePlan::Cpu);
    }

    #[test]
    fn plan_device_explicit_cuda_or_auto_uses_gpu() {
        assert_eq!(plan_device(Some("cuda"), None), DevicePlan::Cuda { mem_limit_bytes: 3072 * MIB });
        assert_eq!(plan_device(Some("auto"), None), DevicePlan::Cuda { mem_limit_bytes: 3072 * MIB });
    }

    /// `serve` is resident for up to 30 min: it must load on CPU even when the
    /// env asks for CUDA (and in the gpu build). Loads the real model (~1.5 s,
    /// needs .fastembed_cache in the crate dir).
    #[test]
    fn new_cpu_only_never_uses_gpu_even_when_env_asks() {
        // Process env: only this test reads DEVICE_ENV through new_cpu_only.
        std::env::set_var(DEVICE_ENV, "cuda");
        let m = EmbeddingsManager::new_cpu_only().expect("model loads");
        std::env::remove_var(DEVICE_ENV);
        assert!(!m.on_gpu());
        let v = m.generate_embeddings(&["orphan reaper".to_string()]).unwrap();
        assert_eq!(v[0].len(), LOCAL_DIMENSION);
    }

    #[test]
    fn plan_device_gpu_mem_env_overrides_cap() {
        assert_eq!(plan_device(None, Some("1536")), DevicePlan::Cuda { mem_limit_bytes: 1536 * MIB });
    }

    #[test]
    fn plan_device_invalid_gpu_mem_falls_back_to_default() {
        for bad in ["", "0", "-5", "lots", "3.5"] {
            assert_eq!(
                plan_device(None, Some(bad)),
                DevicePlan::Cuda { mem_limit_bytes: 3072 * MIB },
                "input {bad:?}"
            );
        }
    }
}
