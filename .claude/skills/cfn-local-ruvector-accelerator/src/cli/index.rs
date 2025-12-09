use anyhow::{Result, Context, anyhow};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{WalkDir, DirEntry};
use tracing::{info, debug, warn};
use regex::Regex;
use std::sync::Arc;
use std::sync::RwLock;
use sha2::{Sha256, Digest};

use crate::embeddings::EmbeddingsManager;
use crate::search_engine::{SearchEngine, IndexMetadata};
use crate::sqlite_store::SqliteStore;

#[derive(Debug)]
pub struct IndexStats {
    pub files_processed: usize,
    pub embeddings_generated: usize,
    pub errors: Vec<String>,
}

impl Default for IndexStats {
    fn default() -> Self {
        Self {
            files_processed: 0,
            embeddings_generated: 0,
            errors: Vec::new(),
        }
    }
}

pub struct IndexCommand {
    project_dir: PathBuf,
    source_path: PathBuf,  // Path to walk for files (can differ from project_dir)
    index_path: PathBuf,
    file_types: Vec<String>,
    patterns: Option<Vec<String>>,
    force: bool,
    embeddings_manager: EmbeddingsManager,
    search_engine: SearchEngine,
    store: SqliteStore,
}

impl IndexCommand {
    pub fn new(
        project_dir: &Path,
        path: &Path,
        file_types: Vec<String>,
        patterns: Option<Vec<String>>,
        force: bool,
    ) -> Self {
        let index_path = project_dir.join(".ruvector");
        let embeddings_manager = EmbeddingsManager::new(&index_path).unwrap();
        let search_engine = SearchEngine::new(project_dir).unwrap();
        let store = SqliteStore::new(&index_path.join("index.db")).unwrap();

        // Use path argument for file collection, defaulting to project_dir if path is empty
        let source_path = if path.as_os_str().is_empty() || path == Path::new(".") {
            project_dir.to_path_buf()
        } else {
            path.to_path_buf()
        };

        Self {
            project_dir: project_dir.to_path_buf(),
            source_path,
            index_path,
            file_types,
            patterns,
            force,
            embeddings_manager,
            search_engine,
            store,
        }
    }

    pub fn execute(&self) -> Result<IndexStats> {
        info!("Starting index process");
        info!("File types: {:?}", self.file_types);
        if let Some(ref patterns) = self.patterns {
            info!("Patterns: {:?}", patterns);
        }

        // Initialize components
        self.initialize()?;

        // Walk directory and collect files
        let files = self.collect_files()?;

        // Process files
        let stats = self.process_files(files)?;

        info!("Index complete: {} files, {} embeddings", 
              stats.files_processed, stats.embeddings_generated);

        Ok(stats)
    }

    fn initialize(&self) -> Result<()> {
        info!("Initializing index components");

        // Create index directory
        fs::create_dir_all(&self.index_path)
            .context("Failed to create index directory")?;

        // Initialize search engine
        let mut search_engine = self.search_engine.duplicate()?;
        search_engine.load_or_create()?;

        // Initialize database
        self.store.initialize()?;

        info!("Components initialized");
        Ok(())
    }

    fn collect_files(&self) -> Result<Vec<PathBuf>> {
        info!("Collecting files to index from: {}", self.source_path.display());

        let mut files = Vec::new();

        let walker = WalkDir::new(&self.source_path)
            .into_iter()
            .filter_entry(|e| !Self::is_hidden(e))
            .filter_map(|e| e.ok())
            .filter(|e| {
                // Skip directories
                if e.file_type().is_dir() {
                    return false;
                }

                // Skip .ruvector directory
                if e.path().starts_with(&self.index_path) {
                    return false;
                }

                // Skip node_modules, target, dist, build directories
                let path_str = e.path().to_string_lossy();
                if path_str.contains("/node_modules/") ||
                   path_str.contains("/target/") ||
                   path_str.contains("/dist/") ||
                   path_str.contains("/build/") {
                    return false;
                }

                // Check file extension
                if let Some(ext) = e.path().extension() {
                    self.file_types.contains(&ext.to_string_lossy().to_string())
                } else {
                    false
                }
            });

        for entry in walker {
            files.push(entry.path().to_path_buf());
        }

        info!("Found {} files to index", files.len());
        Ok(files)
    }

    fn is_hidden(entry: &DirEntry) -> bool {
        entry.file_name()
            .to_str()
            .map(|s| {
                // Allow .claude directory (contains agents, skills, commands, hooks)
                if s == ".claude" {
                    return false;
                }
                // Skip other hidden directories (like .git, .ruvector, etc.)
                s.starts_with('.')
            })
            .unwrap_or(false)
    }

    fn process_files(&self, files: Vec<PathBuf>) -> Result<IndexStats> {
        let stats = Arc::new(RwLock::new(IndexStats::default()));
        let errors = Arc::new(RwLock::new(Vec::new()));

        info!("Processing {} files", files.len());

        for file_path in files {
            debug!("Processing: {}", file_path.display());

            if let Err(e) = self.process_file(&file_path, &stats, &errors) {
                let error_msg = format!("Failed to process {}: {}", file_path.display(), e);
                warn!("{}", error_msg);
                errors.write().unwrap().push(error_msg);
            }
        }

        let stats_guard = stats.write().unwrap();
        let errors_guard = errors.read().unwrap();

        let final_stats = IndexStats {
            files_processed: stats_guard.files_processed,
            embeddings_generated: stats_guard.embeddings_generated,
            errors: errors_guard.clone(),
        };

        Ok(final_stats)
    }

    fn process_file(
        &self,
        file_path: &Path,
        stats: &Arc<RwLock<IndexStats>>,
        errors: &Arc<RwLock<Vec<String>>>,
    ) -> Result<()> {
        // Read file content
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {}", file_path.display()))?;

        // Extract patterns
        let patterns = self.extract_patterns(&content, file_path)?;

        if patterns.is_empty() {
            debug!("No patterns found in {}", file_path.display());
            return Ok(());
        }

        // Generate embeddings for patterns
        let embeddings = self.embeddings_manager.generate_embeddings(&patterns)?;

        // Update stats
        {
            let mut s = stats.write().unwrap();
            s.files_processed += 1;
            s.embeddings_generated += embeddings.len();
        }

        // Store in search engine
        self.store_patterns(file_path, patterns, embeddings)?;

        Ok(())
    }

    fn extract_patterns(&self, content: &str, file_path: &Path) -> Result<Vec<String>> {
        let mut patterns = Vec::new();

        // Extract lines as patterns
        for (line_num, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            
            // Skip empty lines and comments
            if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
                continue;
            }

            // Create pattern with context
            let pattern = format!("{}:{}:{}", 
                                file_path.file_name().unwrap().to_string_lossy(),
                                line_num + 1,
                                trimmed);
            
            patterns.push(pattern);
        }

        // If specific patterns are requested, filter
        if let Some(ref target_patterns) = self.patterns {
            let regexes: Vec<Regex> = target_patterns
                .iter()
                .filter_map(|p| Regex::new(p).ok())
                .collect();

            if !regexes.is_empty() {
                patterns = patterns.into_iter()
                    .filter(|p| regexes.iter().any(|r| r.is_match(p)))
                    .collect();
            }
        }

        Ok(patterns)
    }

    fn store_patterns(
        &self,
        file_path: &Path,
        patterns: Vec<String>,
        embeddings: Vec<Vec<f32>>,
    ) -> Result<()> {
        let file_hash = self.calculate_file_hash(file_path)?;

        for (i, pattern) in patterns.into_iter().enumerate() {
            let embedding = embeddings.get(i).ok_or_else(|| anyhow!("Missing embedding for pattern"))?;
            
            let metadata = IndexMetadata {
                path: file_path.to_string_lossy().to_string(),
                pattern: pattern.clone(),
                line_number: None, // We'll extract this from the pattern
                context: None,
                snippet: None,
                file_hash: file_hash.clone(),
                indexed_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            };

            // Store in search engine
            // Note: We'll need to modify SearchEngine to handle this
            // For now, just store in database
            self.store.store_embedding(&pattern, embedding, &metadata)?;
        }

        Ok(())
    }

    fn calculate_file_hash(&self, file_path: &Path) -> Result<String> {
        use std::io::Read;
        
        let mut file = fs::File::open(file_path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192];
        
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }
        
        Ok(format!("{:x}", hasher.finalize()))
    }
}
