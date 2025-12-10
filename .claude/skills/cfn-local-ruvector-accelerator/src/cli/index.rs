use anyhow::{Result, Context, anyhow};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{WalkDir, DirEntry};
use tracing::{info, debug, warn};
use regex::Regex;
use std::sync::Arc;
use std::sync::RwLock;
use sha2::{Sha256, Digest};
use rusqlite::params;

use crate::embeddings::EmbeddingsManager;
use crate::search_engine::{SearchEngine, IndexMetadata};
use crate::sqlite_store::SqliteStore;
use crate::extractors::{Extractor, ExtractionResult, Entity, Reference};
use crate::extractors::rust::RustExtractor;
use crate::extractors::typescript::TypeScriptExtractor;
use crate::store_v2::{StoreV2, Entity as StoreEntity, Reference as StoreReference, TypeUsage};
use crate::schema_v2::{EntityKind, RefKind, Visibility};

#[derive(Debug)]
pub struct IndexStats {
    pub files_processed: usize,
    pub entities_extracted: usize,
    pub references_extracted: usize,
    pub embeddings_generated: usize,
    pub errors: Vec<String>,
}

impl Default for IndexStats {
    fn default() -> Self {
        Self {
            files_processed: 0,
            entities_extracted: 0,
            references_extracted: 0,
            embeddings_generated: 0,
            errors: Vec::new(),
        }
    }
}

pub struct IndexCommand {
    project_dir: PathBuf,
    source_path: PathBuf,
    index_path: PathBuf,
    file_types: Vec<String>,
    patterns: Option<Vec<String>>,
    force: bool,
    embeddings_manager: EmbeddingsManager,
    search_engine: SearchEngine,
    store: SqliteStore,
    store_v2: StoreV2,
    rust_extractor: RustExtractor,
    typescript_extractor: TypeScriptExtractor,
}

impl IndexCommand {
    pub fn new(
        project_dir: &Path,
        path: &Path,
        file_types: Vec<String>,
        patterns: Option<Vec<String>>,
        force: bool,
    ) -> Result<Self> {
        let index_path = project_dir.join(".ruvector");
        let embeddings_manager = EmbeddingsManager::new(&index_path).unwrap();
        let search_engine = SearchEngine::new(project_dir).unwrap();
        let store = SqliteStore::new(&index_path.join("index.db")).unwrap();
        let store_v2 = StoreV2::new(&index_path.join("index_v2.db")).unwrap();

        let source_path = if path.as_os_str().is_empty() || path == Path::new(".") {
            project_dir.to_path_buf()
        } else {
            path.to_path_buf()
        };

        Ok(Self {
            project_dir: project_dir.to_path_buf(),
            source_path,
            index_path,
            file_types,
            patterns,
            force,
            embeddings_manager,
            search_engine,
            store,
            store_v2,
            rust_extractor: RustExtractor::new()?,
            typescript_extractor: TypeScriptExtractor::new()?,
        })
    }

    pub fn execute(&self) -> Result<IndexStats> {
        info!("Starting index process");
        info!("File types: {:?}", self.file_types);
        if let Some(ref patterns) = self.patterns {
            info!("Patterns: {:?}", patterns);
        }

        self.initialize()?;

        let files = self.collect_files()?;

        let stats = self.process_files(files)?;

        info!("Index complete: {} files, {} entities, {} references, {} embeddings", 
              stats.files_processed, stats.entities_extracted, 
              stats.references_extracted, stats.embeddings_generated);

        Ok(stats)
    }

    fn initialize(&self) -> Result<()> {
        info!("Initializing index components");

        fs::create_dir_all(&self.index_path)
            .context("Failed to create index directory")?;

        let mut search_engine = self.search_engine.duplicate()?;
        search_engine.load_or_create()?;

        self.store.initialize()?;

        // Initialize Schema V2 tables (entities, refs, etc.)
        crate::schema_v2::SchemaV2::initialize(&self.store_v2.conn)?;

        self.store_v2.conn.execute(
            "CREATE TABLE IF NOT EXISTS file_hashes (
                file_path TEXT PRIMARY KEY,
                file_hash TEXT NOT NULL,
                indexed_at INTEGER NOT NULL
            )",
            []
        )?;

        info!("Components initialized");
        Ok(())
    }

    fn collect_files(&self) -> Result<Vec<PathBuf>> {
        info!("Collecting files to index from: {}", self.source_path.display());

        let mut files = Vec::new();

        let walker = WalkDir::new(&self.source_path)
            .into_iter()
            .filter_entry(|e| {
                let path = e.path();
                let name = e.file_name().to_string_lossy();

                // Only exclude specific directories, not hidden ones
                // This allows .claude and other important hidden folders
                match name.as_ref() {
                    "node_modules" | "target" | "dist" | "build" | ".git" => false,
                    _ => true
                }
            })
            .filter_map(|e| e.ok())
            .filter(|e| {
                if e.file_type().is_dir() {
                    return false;
                }

                if e.path().starts_with(&self.index_path) {
                    return false;
                }

                // Index ALL files regardless of extension
                // File type metadata is captured during processing
                true
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
                if s == ".claude" {
                    return false;
                }
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

        let stats_guard = stats.read().unwrap();
        let errors_guard = errors.read().unwrap();

        let final_stats = IndexStats {
            files_processed: stats_guard.files_processed,
            entities_extracted: stats_guard.entities_extracted,
            references_extracted: stats_guard.references_extracted,
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
        let file_hash = self.calculate_file_hash(file_path)?;

        if !self.force && self.is_file_indexed(file_path, &file_hash)? {
            debug!("Skipping already indexed file: {}", file_path.display());
            return Ok(());
        }

        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {}", file_path.display()))?;

        let extraction_result = self.process_ast_extraction(file_path, &content)?;

        if extraction_result.entities.is_empty() {
            debug!("No entities found in {}", file_path.display());
            return Ok(());
        }

        let entity_ids = self.store_entities(file_path, &extraction_result.entities)?;
        self.store_references(file_path, &extraction_result.references, &entity_ids)?;
        self.store_type_usage(file_path, &extraction_result.entities, &entity_ids)?;

        let embeddings = self.generate_entity_embeddings(&extraction_result.entities)?;

        // Store embeddings in entity_embeddings table
        for (entity_id, embedding) in entity_ids.iter().zip(embeddings.iter()) {
            self.store_v2.store_embedding(*entity_id, embedding, "text-embedding-3-small")?;
        }

        {
            let mut s = stats.write().unwrap();
            s.files_processed += 1;
            s.entities_extracted += extraction_result.entities.len();
            s.references_extracted += extraction_result.references.len();
            s.embeddings_generated += embeddings.len();
        }

        self.mark_file_indexed(file_path, &file_hash)?;

        Ok(())
    }

    fn process_ast_extraction(&self, file_path: &Path, content: &str) -> Result<ExtractionResult> {
        let language = self.detect_language(file_path)?;
        
        let result = match language.as_str() {
            "rust" => {
                let mut extractor = self.rust_extractor.clone();
                extractor.extract(&file_path.to_string_lossy(), content)?
            },
            "typescript" | "javascript" => {
                let mut extractor = self.typescript_extractor.clone();
                extractor.extract(&file_path.to_string_lossy(), content)?
            },
            _ => {
                return Ok(ExtractionResult {
                    entities: Vec::new(),
                    references: Vec::new(),
                    errors: vec![format!("Unsupported language: {}", language)],
                });
            }
        };

        Ok(result)
    }

    fn detect_language(&self, file_path: &Path) -> Result<String> {
        if let Some(ext) = file_path.extension() {
            match ext.to_string_lossy().as_ref() {
                "rs" => Ok("rust".to_string()),
                "ts" => Ok("typescript".to_string()),
                "js" => Ok("javascript".to_string()),
                "tsx" => Ok("typescript".to_string()),
                "jsx" => Ok("javascript".to_string()),
                _ => Ok("unknown".to_string()),
            }
        } else {
            Ok("unknown".to_string())
        }
    }

    fn store_entities(&self, file_path: &Path, entities: &[Entity]) -> Result<Vec<i64>> {
        let mut entity_ids = Vec::new();
        
        for entity in entities {
            let store_entity = StoreEntity {
                id: 0,
                kind: self.convert_entity_kind(&entity.kind),
                name: entity.name.clone(),
                signature: Some(entity.signature.clone()),
                visibility: self.convert_visibility(&entity.visibility),
                parent_id: None,
                file_path: file_path.to_string_lossy().to_string(),
                line_number: entity.line as i64,
                column_number: Some(entity.column as i64),
                doc_comment: None,
                attributes: None,
                metadata: Some(serde_json::to_string(&entity.metadata)?),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };
            
            let id = self.store_v2.insert_entity(&store_entity)?;
            entity_ids.push(id);
        }
        
        Ok(entity_ids)
    }

    fn store_references(&self, file_path: &Path, references: &[Reference], entity_ids: &[i64]) -> Result<()> {
        for (reference, &entity_id) in references.iter().zip(entity_ids.iter()) {
            let store_reference = StoreReference {
                id: 0,
                source_entity_id: entity_id,
                target_entity_id: 0,
                ref_kind: self.convert_ref_kind(&reference.ref_kind),
                file_path: file_path.to_string_lossy().to_string(),
                line_number: reference.line as i64,
                column_number: Some(reference.column as i64),
                context: Some(serde_json::to_string(&reference.metadata)?),
                created_at: chrono::Utc::now(),
            };
            
            self.store_v2.insert_reference(&store_reference)?;
        }
        
        Ok(())
    }

    fn store_type_usage(&self, file_path: &Path, entities: &[Entity], entity_ids: &[i64]) -> Result<()> {
        for (entity, &entity_id) in entities.iter().zip(entity_ids.iter()) {
            if let Some(type_info) = entity.metadata.get("type") {
                let type_usage = TypeUsage {
                    id: 0,
                    entity_id,
                    type_name: type_info.clone(),
                    usage_kind: "annotation".to_string(),
                    file_path: file_path.to_string_lossy().to_string(),
                    line_number: entity.line as i64,
                    created_at: chrono::Utc::now(),
                };
                
                self.store_v2.insert_type_usage(&type_usage)?;
            }
        }
        
        Ok(())
    }

    fn generate_entity_embeddings(&self, entities: &[Entity]) -> Result<Vec<Vec<f32>>> {
        let texts: Vec<String> = entities.iter()
            .map(|e| format!("{}:{}:{}", e.kind.as_str(), e.name, e.signature))
            .collect();
        
        self.embeddings_manager.generate_embeddings(&texts)
    }

    fn convert_entity_kind(&self, kind: &crate::extractors::EntityKind) -> EntityKind {
        match kind {
            crate::extractors::EntityKind::Function => EntityKind::Function,
            crate::extractors::EntityKind::Method => EntityKind::Method,
            crate::extractors::EntityKind::Constructor => EntityKind::Constructor,
            crate::extractors::EntityKind::Getter => EntityKind::Getter,
            crate::extractors::EntityKind::Setter => EntityKind::Setter,
            crate::extractors::EntityKind::Class => EntityKind::Class,
            crate::extractors::EntityKind::Interface => EntityKind::Interface,
            crate::extractors::EntityKind::Struct => EntityKind::Struct,
            crate::extractors::EntityKind::Enum => EntityKind::Enum,
            crate::extractors::EntityKind::Trait => EntityKind::Trait,
            crate::extractors::EntityKind::TypeAlias => EntityKind::TypeAlias,
            crate::extractors::EntityKind::Module => EntityKind::Module,
            crate::extractors::EntityKind::Namespace => EntityKind::Namespace,
            crate::extractors::EntityKind::Variable => EntityKind::Variable,
            crate::extractors::EntityKind::Constant => EntityKind::Constant,
            crate::extractors::EntityKind::Parameter => EntityKind::Parameter,
            crate::extractors::EntityKind::Import => EntityKind::Import,
        }
    }

    fn convert_visibility(&self, visibility: &crate::extractors::Visibility) -> Visibility {
        match visibility {
            crate::extractors::Visibility::Public => Visibility::Public,
            crate::extractors::Visibility::Private => Visibility::Private,
            crate::extractors::Visibility::Protected => Visibility::Protected,
            crate::extractors::Visibility::Internal => Visibility::Internal,
            crate::extractors::Visibility::FilePrivate => Visibility::FilePrivate,
        }
    }

    fn convert_ref_kind(&self, ref_kind: &crate::extractors::RefKind) -> RefKind {
        match ref_kind {
            crate::extractors::RefKind::Calls => RefKind::Calls,
            crate::extractors::RefKind::Extends => RefKind::Extends,
            crate::extractors::RefKind::Implements => RefKind::Implements,
            crate::extractors::RefKind::Imports => RefKind::Imports,
            crate::extractors::RefKind::Uses => RefKind::Uses,
            crate::extractors::RefKind::Instantiates => RefKind::Instantiates,
            crate::extractors::RefKind::Overrides => RefKind::Overrides,
            crate::extractors::RefKind::Reads => RefKind::Reads,
            crate::extractors::RefKind::Writes => RefKind::Writes,
        }
    }

    fn is_file_indexed(&self, file_path: &Path, file_hash: &str) -> Result<bool> {
        let query = "SELECT COUNT(*) FROM file_hashes WHERE file_path = ? AND file_hash = ?";
        let mut stmt = self.store_v2.conn.prepare(query)?;
        let count: i64 = stmt.query_row(
            params![file_path.to_string_lossy(), file_hash],
            |row| row.get(0)
        )?;
        Ok(count > 0)
    }

    fn mark_file_indexed(&self, file_path: &Path, file_hash: &str) -> Result<()> {
        self.store_v2.conn.execute(
            "INSERT OR REPLACE INTO file_hashes (file_path, file_hash, indexed_at) VALUES (?1, ?2, ?3)",
            params![
                file_path.to_string_lossy(),
                file_hash,
                chrono::Utc::now().timestamp()
            ]
        )?;
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