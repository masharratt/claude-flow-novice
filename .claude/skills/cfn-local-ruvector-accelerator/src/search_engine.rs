use anyhow::{Result, Context, anyhow};
use ndarray::{Array1, Array2};
use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use std::path::{Path, PathBuf};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write, BufReader, BufWriter};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::info;
use memmap2::MmapOptions;
use crate::embeddings::EmbeddingsManager;
use crate::sqlite_store::SqliteStore;
use crate::paths::get_v1_index_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchConfig {
    pub dimension: usize,
    pub batch_size: usize,
    pub max_results: usize,
    pub index_path: PathBuf,
    pub use_mmap: bool,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            dimension: 1536,
            batch_size: 100,
            max_results: 10,
            index_path: PathBuf::from("index"),
            use_mmap: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct VectorIndex {
    pub vectors: Array2<f32>,
    pub ids: Vec<String>,
    pub metadata: HashMap<String, IndexMetadata>,
}

impl VectorIndex {
    pub fn new(dimension: usize) -> Self {
        Self {
            vectors: Array2::zeros((0, dimension)),
            ids: Vec::new(),
            metadata: HashMap::new(),
        }
    }

    pub fn add_vector(&mut self, id: String, vector: Array1<f32>, metadata: IndexMetadata) -> Result<()> {
        if vector.len() != self.vectors.ncols() {
            return Err(anyhow!("Vector dimension mismatch"));
        }

        let new_row = self.vectors.nrows();
        self.vectors.push_row(vector.view())?;
        self.ids.push(id.clone());
        self.metadata.insert(id, metadata);

        Ok(())
    }

    pub fn add_vectors(&mut self, vectors: Vec<Array1<f32>>, ids: Vec<String>, metadata: HashMap<String, IndexMetadata>) -> Result<()> {
        if vectors.len() != ids.len() {
            return Err(anyhow!("Vectors and IDs length mismatch"));
        }

        for (vector, id) in vectors.into_iter().zip(ids.into_iter()) {
            let meta = metadata.get(&id).cloned().unwrap_or_else(|| IndexMetadata::default());
            self.add_vector(id, vector, meta)?;
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IndexMetadata {
    pub path: String,
    pub pattern: String,
    pub context: Option<String>,
    pub line_number: Option<usize>,
    pub snippet: Option<String>,
    pub file_hash: String,
    pub indexed_at: u64,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub path: String,
    pub pattern: String,
    pub score: f32,
    pub context: Option<String>,
    pub line_number: Option<usize>,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone)]
pub struct IndexStats {
    pub num_vectors: usize,
    pub dimension: usize,
    pub index_size_bytes: u64,
    pub metadata_count: usize,
}

pub struct SearchEngine {
    pub index: VectorIndex,
    pub config: SearchConfig,
    pub embedding_manager: EmbeddingsManager,
    pub store: SqliteStore,
}

impl std::fmt::Debug for SearchEngine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SearchEngine")
            .field("index", &self.index)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

impl SearchEngine {
    /// Create a copy of the search engine by recreating connections
    pub fn duplicate(&self) -> Result<Self> {
        let index_path = &self.config.index_path;
        let embedding_manager = EmbeddingsManager::new(index_path)?;
        let store = SqliteStore::new(&index_path.join("index.db"))?;

        Ok(Self {
            index: self.index.clone(),
            config: self.config.clone(),
            embedding_manager,
            store,
        })
    }
}

impl SearchEngine {
    pub fn new(_project_dir: &Path) -> Result<Self> {
        let mut config = SearchConfig::default();
        // Use centralized V1 index directory (~/.local/share/ruvector/index/)
        let index_path = get_v1_index_dir()?;
        config.index_path = index_path.clone();
        
        let embedding_manager = EmbeddingsManager::new(&index_path)?;
        let store = SqliteStore::new(&index_path.join("index.db"))?;
        
        Ok(Self {
            index: VectorIndex::new(config.dimension),
            config,
            embedding_manager,
            store,
        })
    }

    pub fn load_or_create(&mut self) -> Result<()> {
        let index_file = self.config.index_path.join("index.bin");

        if index_file.exists() {
            info!("Loading existing index from {:?}", index_file);
            self.load_index()?;
        } else {
            info!("Creating new index");
            self.index = VectorIndex::new(self.config.dimension);
        }

        Ok(())
    }

    pub fn add_embedding(&mut self, id: String, embedding: Array1<f32>, metadata: IndexMetadata) -> Result<()> {
        let vector = embedding.into_shape((self.config.dimension,))?;
        self.index.add_vector(id.clone(), vector.to_owned(), metadata)?;

        Ok(())
    }

    pub fn search(&self, query: &str, max_results: Option<usize>) -> Result<Vec<SearchResult>> {
        let max_results = max_results.unwrap_or(self.config.max_results);

        let pattern_results = self.store.search_patterns(query, max_results)?;

        let mut results = Vec::new();

        for (pattern, score) in pattern_results {
            if let Some((_, metadata)) = self.store.get_embedding(&pattern)? {
                results.push(SearchResult {
                    id: pattern.clone(),
                    path: metadata.path.clone(),
                    pattern: metadata.pattern.clone(),
                    score,
                    context: metadata.context.clone(),
                    line_number: metadata.line_number,
                    snippet: metadata.snippet.clone(),
                });
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        results.truncate(max_results);

        Ok(results)
    }

    pub fn bulk_add(&mut self, items: Vec<(String, Array1<f32>, IndexMetadata)>) -> Result<()> {
        let batch_size = self.config.batch_size;

        for chunk in items.chunks(batch_size) {
            let vectors: Vec<Array1<f32>> = chunk
                .iter()
                .map(|(_, vector, _)| {
                    vector.clone().into_shape((self.config.dimension,)).unwrap()
                })
                .collect();

            let ids: Vec<String> = chunk.iter().map(|(id, _, _)| id.clone()).collect();
            let metadata: HashMap<String, IndexMetadata> = chunk
                .iter()
                .map(|(id, _, meta)| (id.clone(), meta.clone()))
                .collect();

            self.index.add_vectors(vectors, ids, metadata)?;
        }

        Ok(())
    }

    pub fn save_index(&self) -> Result<()> {
        info!("Saving index to {:?}", self.config.index_path);

        std::fs::create_dir_all(&self.config.index_path)?;

        let index_file = self.config.index_path.join("index.bin");
        let metadata_file = self.config.index_path.join("metadata.json");

        self.save_vectors(&index_file)?;

        let metadata_json = serde_json::to_string_pretty(&self.index.metadata)?;
        std::fs::write(&metadata_file, metadata_json)?;

        info!("Index saved successfully");
        Ok(())
    }

    fn save_vectors(&self, path: &Path) -> Result<()> {
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(path)?;

        let mut writer = BufWriter::new(file);

        writer.write_u32::<LittleEndian>(0x52554345)?;
        writer.write_u32::<LittleEndian>(1)?;

        writer.write_u32::<LittleEndian>(self.config.dimension as u32)?;
        writer.write_u32::<LittleEndian>(self.index.vectors.nrows() as u32)?;

        for vector in self.index.vectors.rows() {
            for &value in vector.iter() {
                writer.write_f32::<LittleEndian>(value)?;
            }
        }

        for id in &self.index.ids {
            writer.write_u32::<LittleEndian>(id.len() as u32)?;
            writer.write_all(id.as_bytes())?;
        }

        writer.flush()?;
        Ok(())
    }

    fn load_index(&mut self) -> Result<()> {
        let index_file = self.config.index_path.join("index.bin");
        let metadata_file = self.config.index_path.join("metadata.json");

        self.load_vectors(&index_file)?;

        let metadata_json = std::fs::read_to_string(&metadata_file)
            .context("Failed to read metadata file")?;
        self.index.metadata = serde_json::from_str(&metadata_json)
            .context("Failed to parse metadata")?;

        Ok(())
    }

    fn load_vectors(&mut self, path: &Path) -> Result<()> {
        let file = File::open(path)?;

        if self.config.use_mmap {
            let mmap = unsafe { MmapOptions::new().map(&file)? };
            self.load_vectors_from_slice(&mmap)?;
        } else {
            let mut reader = BufReader::new(file);
            self.load_vectors_from_reader(&mut reader)?;
        }

        Ok(())
    }

    fn load_vectors_from_slice(&mut self, data: &[u8]) -> Result<()> {
        use std::io::Cursor;

        let mut cursor = Cursor::new(data);
        self.load_vectors_from_reader(&mut cursor)
    }

    fn load_vectors_from_reader<R: Read>(&mut self, reader: &mut R) -> Result<()> {
        let magic = reader.read_u32::<LittleEndian>()?;
        if magic != 0x52554345 {
            return Err(anyhow!("Invalid file format"));
        }

        let version = reader.read_u32::<LittleEndian>()?;
        if version != 1 {
            return Err(anyhow!("Unsupported version: {}", version));
        }

        let dimension = reader.read_u32::<LittleEndian>()? as usize;
        let count = reader.read_u32::<LittleEndian>()? as usize;

        if dimension != self.config.dimension {
            return Err(anyhow!(
                "Dimension mismatch: expected {}, got {}",
                self.config.dimension,
                dimension
            ));
        }

        let mut vectors = Vec::with_capacity(count * dimension);
        for _ in 0..count * dimension {
            vectors.push(reader.read_f32::<LittleEndian>()?);
        }

        let vectors_array = Array2::from_shape_vec((count, dimension), vectors)?;

        let mut ids = Vec::with_capacity(count);
        for _ in 0..count {
            let len = reader.read_u32::<LittleEndian>()? as usize;
            let mut id_bytes = vec![0u8; len];
            reader.read_exact(&mut id_bytes)?;
            ids.push(String::from_utf8(id_bytes)?);
        }

        self.index.vectors = vectors_array;
        self.index.ids = ids;

        Ok(())
    }

    pub fn get_stats(&self) -> IndexStats {
        IndexStats {
            num_vectors: self.index.vectors.nrows(),
            dimension: self.config.dimension,
            index_size_bytes: self.estimate_index_size(),
            metadata_count: self.index.metadata.len(),
        }
    }

    fn estimate_index_size(&self) -> u64 {
        let vectors_size = self.index.vectors.nrows() * self.index.vectors.ncols() * 4;
        let ids_size: usize = self.index.ids.iter().map(|id| id.len()).sum();
        (vectors_size + ids_size) as u64
    }

    pub fn optimize_index(&mut self) -> Result<()> {
        info!("Optimizing index...");

        for mut vector in self.index.vectors.rows_mut() {
            let norm = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
            if norm > 0.0 {
                for v in vector.iter_mut() {
                    *v /= norm;
                }
            }
        }

        self.rebuild_metadata_index()?;

        info!("Index optimized successfully");
        Ok(())
    }

    fn rebuild_metadata_index(&mut self) -> Result<()> {
        let mut path_index: HashMap<String, Vec<String>> = HashMap::new();

        for (id, metadata) in &self.index.metadata {
            path_index.entry(metadata.path.clone())
                .or_default()
                .push(id.clone());
        }

        let path_index_json = serde_json::to_string(&path_index)?;
        let path_index_file = self.config.index_path.join("path_index.json");
        std::fs::write(path_index_file, path_index_json)?;

        Ok(())
    }
}