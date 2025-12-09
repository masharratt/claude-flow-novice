impl SearchEngine {
    pub fn new(project_dir: &Path) -> Result<Self> {
        let config = SearchConfig::default();
        let index_path = project_dir.join(&config.index_path);

        let embedding_manager = EmbeddingsManager::new(&index_path)?;

        Ok(Self {
            index: VectorIndex::new(config.dimension),
            config,
            embedding_manager,
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

        // Search patterns using SQLite store
        let pattern_results = self.embedding_manager.store.search_patterns(query, max_results)?;

        let mut results = Vec::new();

        for (pattern, score) in pattern_results {
            // Get full metadata for each pattern
            if let Some((_, metadata)) = self.embedding_manager.store.get_embedding(&pattern)? {
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

        // Sort and limit results
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

        // Save vectors and IDs
        self.save_vectors(&index_file)?;

        // Save metadata
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

        // Write magic number and version
        writer.write_u32::<LittleEndian>(0x52554345)?; // "RUCE"
        writer.write_u32::<LittleEndian>(1)?; // Version

        // Write dimensions and count
        writer.write_u32::<LittleEndian>(self.config.dimension as u32)?;
        writer.write_u32::<LittleEndian>(self.index.vectors.nrows() as u32)?;

        // Write vectors
        for vector in self.index.vectors.rows() {
            for &value in vector.iter() {
                writer.write_f32::<LittleEndian>(value)?;
            }
        }

        // Write IDs (length-prefixed strings)
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

        // Load vectors and IDs
        self.load_vectors(&index_file)?;

        // Load metadata
        let metadata_json = std::fs::read_to_string(&metadata_file)
            .context("Failed to read metadata file")?;
        self.index.metadata = serde_json::from_str(&metadata_json)
            .context("Failed to parse metadata")?;

        Ok(())
    }

    fn load_vectors(&mut self, path: &Path) -> Result<()> {
        let file = File::open(path)?;

        if self.config.use_mmap {
            // Use memory mapping for large files
            let mmap = unsafe { MmapOptions::new().map(&file)? };
            self.load_vectors_from_slice(&mmap)?;
        } else {
            // Read normally for smaller files
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
        // Read and verify magic number
        let magic = reader.read_u32::<LittleEndian>()?;
        if magic != 0x52554345 {
            return Err(anyhow!("Invalid file format"));
        }

        // Read version
        let version = reader.read_u32::<LittleEndian>()?;
        if version != 1 {
            return Err(anyhow!("Unsupported version: {}", version));
        }

        // Read dimensions and count
        let dimension = reader.read_u32::<LittleEndian>()? as usize;
        let count = reader.read_u32::<LittleEndian>()? as usize;

        if dimension != self.config.dimension {
            return Err(anyhow!(
                "Dimension mismatch: expected {}, got {}",
                self.config.dimension,
                dimension
            ));
        }

        // Read vectors
        let mut vectors = Vec::with_capacity(count * dimension);
        for _ in 0..count * dimension {
            vectors.push(reader.read_f32::<LittleEndian>()?);
        }

        let vectors_array = Array2::from_shape_vec((count, dimension), vectors)?;

        // Read IDs
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
        let vectors_size = self.index.vectors.nrows() * self.index.vectors.ncols() * 4; // f32 = 4 bytes
        let ids_size: usize = self.index.ids.iter().map(|id| id.len()).sum();
        (vectors_size + ids_size) as u64
    }

    pub fn optimize_index(&mut self) -> Result<()> {
        info!("Optimizing index...");

        // Normalize all vectors
        for mut vector in self.index.vectors.rows_mut() {
            let norm = vector.iter().map(|x| x * x).sum::<f32>().sqrt();
            if norm > 0.0 {
                for v in vector.iter_mut() {
                    *v /= norm;
                }
            }
        }

        // Optional: Rebuild metadata index for faster lookups
        self.rebuild_metadata_indexlettes()?;

        info!("Index optimized successfully");
        Ok(())
    }

    fn rebuild_metadata_index(&mut self) -> Result<()> {
        // Create path-based index for faster filtering
        let mut path_index: HashMap<String, Vec<String>> = HashMap::new();

        for (id, metadata) in &self.index.metadata {
            path_index.entry(metadata.path.clone())
                .or_default()
                .push(id.clone());
        }

        // Store path index as metadata
        let path_index_json = serde_json::to_string(&path_index)?;
        let path_index_file = self.config.index_path.join("path_index.json");
        std::fs::write(path_index_file, path_index_json)?;

        Ok(())
    }
}