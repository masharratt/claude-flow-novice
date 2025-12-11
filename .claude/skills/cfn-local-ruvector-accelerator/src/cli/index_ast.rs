use anyhow::{Result, Context, anyhow};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{WalkDir, DirEntry};
use tracing::{info, debug, warn, error};
use std::sync::{Arc, RwLock};
use std::rc::Rc;
use std::cell::RefCell;
use sha2::{Sha256, Digest};
use rusqlite::{params, Transaction, OptionalExtension};
use std::collections::HashMap;

use crate::embeddings::EmbeddingsManager;
use crate::extractors::{Extractor, ExtractionResult, Entity, Reference};
use crate::extractors::rust::RustExtractor;
use crate::extractors::typescript::TypeScriptExtractor;
use crate::store_v2::{StoreV2, Entity as StoreEntity, Reference as StoreReference, TypeUsage, Module};
use crate::store_v2_tx::StoreV2WithTx;
use crate::schema_v2::{EntityKind, RefKind, Visibility};
use crate::paths::get_database_path;

#[derive(Debug)]
pub struct IndexStats {
    pub files_processed: usize,
    pub entities_extracted: usize,
    pub references_extracted: usize,
    pub embeddings_generated: usize,
    pub errors: Vec<String>,
    pub index_time_ms: u64,
}

impl Default for IndexStats {
    fn default() -> Self {
        Self {
            files_processed: 0,
            entities_extracted: 0,
            references_extracted: 0,
            embeddings_generated: 0,
            errors: Vec::new(),
            index_time_ms: 0,
        }
    }
}

pub struct AstIndexCommand {
    project_dir: PathBuf,
    source_path: PathBuf,
    index_path: PathBuf,
    file_types: Vec<String>,
    patterns: Option<Vec<String>>,
    force: bool,
    embeddings_manager: EmbeddingsManager,
    store_v2: StoreV2,
    extractors: HashMap<String, Rc<RefCell<dyn Extractor>>>,
}

impl AstIndexCommand {
    pub fn new(
        project_dir: &Path,
        path: &Path,
        file_types: Vec<String>,
        patterns: Option<Vec<String>>,
        force: bool,
    ) -> Result<Self> {
        // Use local .ruvector for embeddings cache, but centralized DB for entities
        let index_path = project_dir.join(".ruvector");
        fs::create_dir_all(&index_path)?;

        // Embeddings are cached locally per project
        let embeddings_manager = EmbeddingsManager::new(&index_path)?;

        // Use centralized database for all entities (multi-project isolation via project_root)
        let db_path = get_database_path()?;
        let store_v2 = StoreV2::new(&db_path)?;

        // Initialize extractors for different languages
        let mut extractors: HashMap<String, Rc<RefCell<dyn Extractor>>> = HashMap::new();
        extractors.insert("rust".to_string(), Rc::new(RefCell::new(RustExtractor::new()?)));
        extractors.insert("typescript".to_string(), Rc::new(RefCell::new(TypeScriptExtractor::new()?)));

        // Use path argument for file collection
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
            store_v2,
            extractors,
        })
    }

    pub fn execute(&mut self) -> Result<IndexStats> {
        let start_time = std::time::Instant::now();

        info!("Starting AST-based index process");
        info!("File types: {:?}", self.file_types);

        // Initialize database schema
        self.initialize()?;

        // Walk directory and collect files
        let files = self.collect_files()?;
        info!("Found {} files to process", files.len());

        // Process files
        let stats = self.process_files(files)?;

        let elapsed = start_time.elapsed();
        let mut final_stats = stats;
        final_stats.index_time_ms = elapsed.as_millis() as u64;

        info!("AST indexing complete in {}ms: {} files, {} entities, {} references, {} embeddings",
              elapsed.as_millis(),
              final_stats.files_processed,
              final_stats.entities_extracted,
              final_stats.references_extracted,
              final_stats.embeddings_generated);

        Ok(final_stats)
    }

    fn initialize(&self) -> Result<()> {
        info!("Initializing AST index components");

        // Initialize database schema v2 on the connection (not in a transaction)
        crate::schema_v2::SchemaV2::initialize(&self.store_v2.conn)?;

        // Now create file_hashes and handle force rebuild in a transaction
        let tx = self.store_v2.transaction()?;

        // Create file_hashes table for incremental indexing
        tx.execute(
            "CREATE TABLE IF NOT EXISTS file_hashes (
                file_path TEXT PRIMARY KEY,
                file_hash TEXT NOT NULL,
                indexed_at INTEGER NOT NULL
            )",
            [],
        )?;

        // If force rebuild, clear existing data
        if self.force {
            info!("Force rebuild enabled, clearing existing index");
            tx.execute("DELETE FROM entities", [])?;
            tx.execute("DELETE FROM refs", [])?;
            tx.execute("DELETE FROM type_usage", [])?;
            tx.execute("DELETE FROM modules", [])?;
            tx.execute("DELETE FROM entity_embeddings", [])?;
            tx.execute("DELETE FROM file_hashes", [])?;
        }

        tx.commit()?;

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

                // Skip common build/output directories
                let path_str = e.path().to_string_lossy();
                if path_str.contains("/node_modules/") ||
                   path_str.contains("/target/") ||
                   path_str.contains("/dist/") ||
                   path_str.contains("/build/") ||
                   path_str.contains("/.git/") {
                    return false;
                }

                // Check file extension for supported languages
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
                // Allow .claude directory
                if s == ".claude" {
                    return false;
                }
                // Skip other hidden directories
                s.starts_with('.')
            })
            .unwrap_or(false)
    }

    fn process_files(&mut self, files: Vec<PathBuf>) -> Result<IndexStats> {
        let stats = Arc::new(RwLock::new(IndexStats::default()));
        let errors = Arc::new(RwLock::new(Vec::new()));

        info!("Processing {} files with AST extraction", files.len());

        for file_path in files {
            debug!("Processing: {}", file_path.display());

            if let Err(e) = self.process_file_ast(&file_path, &stats, &errors) {
                let error_msg = format!("Failed to process {}: {}", file_path.display(), e);
                warn!("{}", error_msg);
                errors.write().unwrap().push(error_msg);
            }
        }

        let stats_guard = stats.read().unwrap();
        let errors_guard = errors.read().unwrap();

        Ok(IndexStats {
            files_processed: stats_guard.files_processed,
            entities_extracted: stats_guard.entities_extracted,
            references_extracted: stats_guard.references_extracted,
            embeddings_generated: stats_guard.embeddings_generated,
            errors: errors_guard.clone(),
            index_time_ms: 0, // Will be set by caller
        })
    }

    fn process_file_ast(
        &mut self,
        file_path: &Path,
        stats: &Arc<RwLock<IndexStats>>,
        errors: &Arc<RwLock<Vec<String>>>,
    ) -> Result<()> {
        // Calculate file hash for incremental indexing
        let file_hash = self.calculate_file_hash(file_path)?;

        // Check if file needs re-indexing (unless force is enabled)
        if !self.force && self.is_file_indexed(file_path, &file_hash)? {
            debug!("Skipping unchanged file: {}", file_path.display());
            return Ok(());
        }

        // Read file content
        let content = fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {}", file_path.display()))?;

        // Detect language and get appropriate extractor
        let language = self.detect_language(file_path)?;
        let extractor = self.extractors.get(&language)
            .ok_or_else(|| anyhow!("No extractor available for language: {}", language))?;

        // Extract entities and references using AST
        let extraction_result = extractor.borrow_mut().extract(&file_path.to_string_lossy(), &content)
            .with_context(|| format!("Failed to extract AST from: {}", file_path.display()))?;

        if extraction_result.entities.is_empty() && extraction_result.references.is_empty() {
            debug!("No entities or references found in {}", file_path.display());
            // Still mark file as indexed to avoid re-processing
            self.mark_file_indexed_atomic(file_path, &file_hash)?;
            return Ok(());
        }

        // Use atomic file indexing with transactions
        let store_tx = StoreV2WithTx::new(&self.index_path.join("index_v2.db"))
            .context("Failed to create transactional store")?;

        let file_path_str = file_path.to_string_lossy().to_string();
        let entity_ids = store_tx.index_file_atomic(&file_path_str, &file_hash, |tx| {
            // Store entities in batch
            let mut store_entities = Vec::new();
            let mut entity_map = HashMap::new();
            let mut type_usages = Vec::new();

            for (idx, entity) in extraction_result.entities.iter().enumerate() {
                let store_entity = StoreEntity {
                    id: 0,
                    kind: self.convert_entity_kind(&entity.kind),
                    name: entity.name.clone(),
                    signature: Some(entity.signature.clone()),
                    visibility: self.convert_visibility(&entity.visibility),
                    parent_id: None, // TODO: Handle parent relationships
                    file_path: entity.file_path.clone(),
                    line_number: entity.line as i64,
                    column_number: Some(entity.column as i64),
                    doc_comment: None, // TODO: Extract doc comments
                    attributes: None, // TODO: Extract attributes
                    metadata: Some(serde_json::to_string(&entity.metadata)?),
                    created_at: chrono::Utc::now(),
                    updated_at: chrono::Utc::now(),
                };
                store_entities.push(store_entity);

                // Store temporary mapping for reference resolution
                entity_map.insert(idx, 0); // Will be updated with actual ID after insert

                // Prepare type usages
                let type_names = self.extract_type_names_from_signature(&entity.signature);
                for type_name in type_names {
                    type_usages.push(TypeUsage {
                        id: 0,
                        entity_id: 0, // Will be updated after entity insert
                        type_name: type_name.clone(),
                        usage_kind: "signature".to_string(),
                        file_path: file_path_str.clone(),
                        line_number: entity.line as i64,
                        created_at: chrono::Utc::now(),
                    });
                }
            }

            // Insert entities and get their IDs
            let mut entity_ids = Vec::new();
            let project_root_str = self.project_dir.to_string_lossy();
            for entity in &store_entities {
                let mut stmt = tx.prepare(
                    r#"
                    INSERT INTO entities (
                        kind, name, signature, visibility, parent_id, file_path,
                        line_number, column_number, doc_comment, attributes, metadata, project_root
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                    "#
                )?;

                stmt.execute(params![
                    entity.kind.as_str(),
                    entity.name,
                    entity.signature,
                    entity.visibility.as_str(),
                    entity.parent_id,
                    entity.file_path,
                    entity.line_number,
                    entity.column_number,
                    entity.doc_comment,
                    entity.attributes,
                    entity.metadata,
                    project_root_str.as_ref()
                ])?;

                let entity_id = tx.last_insert_rowid();
                entity_ids.push(entity_id);

                // Update entity mapping
                if let Some(idx) = entity_map.iter().find(|(_, &v)| v == 0).map(|(k, _)| *k) {
                    entity_map.insert(idx, entity_id);
                }
            }

            // Update type usages with actual entity IDs
            for (type_usage, entity_id) in type_usages.iter_mut().zip(entity_ids.iter()) {
                type_usage.entity_id = *entity_id;
            }

            // Insert type usages in batch
            if !type_usages.is_empty() {
                let mut stmt = tx.prepare(
                    r#"
                    INSERT INTO type_usage (
                        entity_id, type_name, usage_kind, file_path, line_number
                    ) VALUES (?1, ?2, ?3, ?4, ?5)
                    "#
                )?;

                for type_usage in &type_usages {
                    stmt.execute(params![
                        type_usage.entity_id,
                        type_usage.type_name,
                        type_usage.usage_kind,
                        type_usage.file_path,
                        type_usage.line_number
                    ])?;
                }
            }

            // Store references with proper target entity resolution
            let mut store_references = Vec::new();
            for reference in &extraction_result.references {
                // Try to find target entity by name
                let target_entity_id = self.find_target_entity_tx(tx, &reference.target_name, &file_path_str)?;

                // Parse source_id if available; extractors typically don't provide source_id
                let source_entity_id = reference.source_id
                    .as_ref()
                    .and_then(|id| id.parse::<i64>().ok())
                    .unwrap_or(0);

                let store_reference = StoreReference {
                    id: 0,
                    source_entity_id,
                    target_entity_id,
                    ref_kind: self.convert_ref_kind(&reference.ref_kind),
                    file_path: reference.file_path.clone(),
                    line_number: reference.line as i64,
                    column_number: Some(reference.column as i64),
                    context: reference.metadata.get("context").cloned(),
                    created_at: chrono::Utc::now(),
                };
                store_references.push(store_reference);
            }

            // Insert references in batch
            if !store_references.is_empty() {
                let mut stmt = tx.prepare(
                    r#"
                    INSERT INTO refs (
                        source_entity_id, target_entity_id, ref_kind, file_path,
                        line_number, column_number, context
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                    "#
                )?;

                for reference in &store_references {
                    stmt.execute(params![
                        reference.source_entity_id,
                        reference.target_entity_id,
                        reference.ref_kind.as_str(),
                        reference.file_path,
                        reference.line_number,
                        reference.column_number,
                        reference.context
                    ])?;
                }
            }

            // Generate and store embeddings
            if !entity_ids.is_empty() {
                let entity_texts: Vec<String> = extraction_result.entities
                    .iter()
                    .map(|e| format!("{} {}", e.name, e.signature))
                    .collect();

                let embeddings = self.embeddings_manager.generate_embeddings(&entity_texts)?;

                // Store embeddings in batch
                let mut stmt = tx.prepare(
                    "INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding, embedding_model) VALUES (?1, ?2, ?3)"
                )?;

                for (entity_id, embedding) in entity_ids.iter().zip(embeddings) {
                    let embedding_bytes: Vec<u8> = embedding
                        .iter()
                        .flat_map(|&v| v.to_le_bytes().to_vec())
                        .collect();

                    stmt.execute(params![entity_id, embedding_bytes, "text-embedding-ada-002"])?;
                }
            }

            Ok(())
        })?;

        // Update stats
        {
            let mut s = stats.write().unwrap();
            s.files_processed += 1;
            s.entities_extracted += extraction_result.entities.len();
            s.references_extracted += extraction_result.references.len();
            s.embeddings_generated += extraction_result.entities.len();
        }

        Ok(())
    }

    fn detect_language(&self, file_path: &Path) -> Result<String> {
        if let Some(ext) = file_path.extension() {
            match ext.to_string_lossy().as_ref() {
                "rs" => Ok("rust".to_string()),
                "ts" | "tsx" | "js" | "jsx" => Ok("typescript".to_string()),
                _ => Err(anyhow!("Unsupported file extension: {}", ext.to_string_lossy())),
            }
        } else {
            Err(anyhow!("No file extension found"))
        }
    }

    fn convert_entity_kind(&self, kind: &crate::extractors::EntityKind) -> EntityKind {
        match kind {
            crate::extractors::EntityKind::Function => EntityKind::Function,
            crate::extractors::EntityKind::Method => EntityKind::Method,
            crate::extractors::EntityKind::Class => EntityKind::Class,
            crate::extractors::EntityKind::Interface => EntityKind::Interface,
            crate::extractors::EntityKind::Struct => EntityKind::Struct,
            crate::extractors::EntityKind::Enum => EntityKind::Enum,
            crate::extractors::EntityKind::Trait => EntityKind::Trait,
            crate::extractors::EntityKind::Module => EntityKind::Module,
            crate::extractors::EntityKind::TypeAlias => EntityKind::TypeAlias,
            crate::extractors::EntityKind::Variable => EntityKind::Variable,
            crate::extractors::EntityKind::Constant => EntityKind::Constant,
            crate::extractors::EntityKind::Import => EntityKind::Function, // Convert imports to function for now
            crate::extractors::EntityKind::Constructor => EntityKind::Function, // Map to function
            crate::extractors::EntityKind::Getter => EntityKind::Method, // Map to method
            crate::extractors::EntityKind::Setter => EntityKind::Method, // Map to method
            crate::extractors::EntityKind::Namespace => EntityKind::Module, // Map to module
            crate::extractors::EntityKind::Parameter => EntityKind::Variable, // Map to variable
        }
    }

    fn convert_visibility(&self, visibility: &crate::extractors::Visibility) -> Visibility {
        match visibility {
            crate::extractors::Visibility::Public => Visibility::Public,
            crate::extractors::Visibility::Private => Visibility::Private,
            crate::extractors::Visibility::Protected => Visibility::Protected,
            crate::extractors::Visibility::Internal => Visibility::Internal,
            crate::extractors::Visibility::FilePrivate => Visibility::Private,
        }
    }

    fn convert_ref_kind(&self, kind: &crate::extractors::RefKind) -> RefKind {
        match kind {
            crate::extractors::RefKind::Calls => RefKind::Call,
            crate::extractors::RefKind::Imports => RefKind::Import,
            crate::extractors::RefKind::Extends => RefKind::Extend,
            crate::extractors::RefKind::Implements => RefKind::Implement,
            crate::extractors::RefKind::Uses => RefKind::Use,
            crate::extractors::RefKind::Instantiates => RefKind::Reference,
            crate::extractors::RefKind::Overrides => RefKind::Reference,
            crate::extractors::RefKind::Reads => RefKind::Reference,
            crate::extractors::RefKind::Writes => RefKind::Reference,
        }
    }

    fn store_type_usage(&self, entity: &Entity, entity_id: i64, file_path: &Path) -> Result<()> {
        // Extract type names from signature (simple heuristic)
        let type_names = self.extract_type_names_from_signature(&entity.signature);

        for type_name in type_names {
            let type_usage = TypeUsage {
                id: 0,
                entity_id,
                type_name: type_name.clone(),
                usage_kind: "signature".to_string(),
                file_path: file_path.to_string_lossy().to_string(),
                line_number: entity.line as i64,
                created_at: chrono::Utc::now(),
            };

            self.store_v2.insert_type_usage(&type_usage)?;
        }

        Ok(())
    }

    fn extract_type_names_from_signature(&self, signature: &str) -> Vec<String> {
        // Simple regex-based type extraction
        // TODO: Use AST for more accurate type extraction
        let mut types = Vec::new();

        // Common patterns
        let patterns = vec![
            r"\b([A-Z][a-zA-Z0-9_]*)\b",  // CamelCase types
            r"Result<([^,>]+)",             // Result<T>
            r"Option<([^>]+)",              // Option<T>
            r"Vec<([^>]+)",                 // Vec<T>
            r"HashMap<([^,>]+)",            // HashMap<K>
        ];

        for pattern in patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                for cap in re.captures_iter(signature) {
                    if let Some(type_match) = cap.get(1) {
                        let type_name = type_match.as_str().to_string();
                        if !types.contains(&type_name) {
                            types.push(type_name);
                        }
                    }
                }
            }
        }

        types
    }

    fn find_target_entity(&self, target_name: &str, source_file: &Path) -> Result<i64> {
        // Search for target entity in the same file first
        let entities = self.store_v2.find_entities_by_name(target_name, 10, &self.project_dir)?;

        for entity in &entities {
            // Prefer entities in the same file
            if entity.file_path == source_file.to_string_lossy() {
                return Ok(entity.id);
            }
        }

        // If not found in same file, return the first match
        if let Some(entity) = entities.first() {
            Ok(entity.id)
        } else {
            // Create a placeholder entity for unknown references
            let placeholder = StoreEntity {
                id: 0,
                kind: EntityKind::Function,
                name: target_name.to_string(),
                signature: None,
                visibility: Visibility::Public,
                parent_id: None,
                file_path: "unknown".to_string(),
                line_number: 0,
                column_number: None,
                doc_comment: None,
                attributes: None,
                metadata: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };

            let project_root_str = self.project_dir.to_string_lossy();
            Ok(self.store_v2.insert_entity(&placeholder, &project_root_str)?)
        }
    }

    // Transaction-aware version for finding target entity
    fn find_target_entity_tx(&self, tx: &Transaction, target_name: &str, source_file: &str) -> Result<i64> {
        // Search for target entity in the same file first
        let mut stmt = tx.prepare(
            "SELECT * FROM entities WHERE name = ? ORDER BY file_path = ? DESC LIMIT 1"
        )?;

        let entity = stmt.query_row(
            params![target_name, source_file],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?, // id
                    row.get::<_, String>(6)?, // file_path
                ))
            }
        ).optional().map_err(|e| anyhow::anyhow!("Database error: {}", e))?;

        if let Some((entity_id, _)) = entity {
            Ok(entity_id)
        } else {
            // Create a placeholder entity for unknown references
            let project_root_str = self.project_dir.to_string_lossy();
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO entities (
                    kind, name, signature, visibility, parent_id, file_path,
                    line_number, column_number, doc_comment, attributes, metadata, project_root
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#
            )?;

            stmt.execute(params![
                EntityKind::Function.as_str(),
                target_name,
                None::<String>,
                Visibility::Public.as_str(),
                None::<i64>,
                "unknown",
                0i64,
                None::<i64>,
                None::<String>,
                None::<String>,
                None::<String>,
                project_root_str.as_ref(),
            ])?;

            Ok(tx.last_insert_rowid())
        }
    }

    // Find entity by name and line number within a transaction
    fn find_entity_by_name_and_line_tx(&self, tx: &Transaction, name: &str, line: usize, file_path: &str) -> Result<i64> {
        let mut stmt = tx.prepare(
            "SELECT id FROM entities WHERE name = ? AND file_path = ? AND line_number = ? LIMIT 1"
        )?;

        let entity_id = stmt.query_row(
            params![name, file_path, line as i64],
            |row| row.get(0)
        ).optional().map_err(|e| anyhow::anyhow!("Database error: {}", e))?;

        if let Some(id) = entity_id {
            Ok(id)
        } else {
            // Try to find any entity with that name in the file
            let mut stmt = tx.prepare(
                "SELECT id FROM entities WHERE name = ? AND file_path = ? LIMIT 1"
            )?;

            let entity_id = stmt.query_row(
                params![name, file_path],
                |row| row.get(0)
            ).optional().map_err(|e| anyhow::anyhow!("Database error: {}", e))?;

            if let Some(id) = entity_id {
                Ok(id)
            } else {
                Err(anyhow!("Entity not found: {} at line {} in {}", name, line, file_path))
            }
        }
    }

    // Atomic version of mark_file_indexed
    fn mark_file_indexed_atomic(&self, file_path: &Path, file_hash: &str) -> Result<()> {
        let tx = self.store_v2.transaction()?;
        tx.execute(
            "INSERT OR REPLACE INTO file_hashes (file_path, file_hash, indexed_at) VALUES (?1, ?2, ?3)",
            params![
                file_path.to_string_lossy(),
                file_hash,
                chrono::Utc::now().timestamp()
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    fn is_file_indexed(&self, file_path: &Path, file_hash: &str) -> Result<bool> {
        let mut stmt = self.store_v2.conn.prepare(
            "SELECT COUNT(*) FROM file_hashes WHERE file_path = ? AND file_hash = ?"
        )?;

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
            ],
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