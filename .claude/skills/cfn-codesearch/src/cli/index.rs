//! # RuVector Index Command
//!
//! ## IMPORTANT: Run from PROJECT ROOT
//!
//! This indexer MUST be run from the project root directory to index all files correctly.
//! Running from a subdirectory will only index that subdirectory.
//!
//! ## Recommended Usage:
//! ```bash
//! cd /path/to/project-root
//! local-ruvector index --path . --types rs,ts,js,json,md,sh --force
//! ```
//!
//! ## Supported File Types (default):
//! - rs, ts, js, json, md, sh, yaml, yml, txt, config
//! - Use --types to specify custom extensions
//!
//! ## Excluded Directories (see EXCLUDED_DIRS constant - 54 patterns):
//! - Dependencies: node_modules, vendor, .pnpm, .yarn
//! - Build artifacts: target, dist, build, out, .next, .nuxt, .output, .turbo, .parcel-cache
//! - VCS: .git, .svn, .hg
//! - IDE: .idea, .vscode, .vs
//! - Cache: .cache, __pycache__, .pytest_cache, .mypy_cache, .ruff_cache, coverage, .nyc_output
//! - Virtual envs: .venv, venv, env
//! - IaC: .terraform, .serverless, .aws-sam
//! - Project-specific: .artifacts, .ruvector, .archive, archive, .archived, archived
//! - Backups/temp: backups, .backups, backup, tmp, .tmp, temp, logs
//! - Test artifacts: __snapshots__, __mocks__, playwright-report, test-results
//! - Doc builds: _site, .docusaurus, site
//! - NOTE: .claude directory IS included (contains important config)
//!
//! ## Excluded Files (see EXCLUDED_FILES constant - 41 patterns):
//! - Secrets: .env*, credentials.json, secrets.json, .npmrc, .pypirc, .netrc, id_rsa, *.pem, *.key
//! - Lock files: package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock, go.sum, etc.
//! - Backups: *.bak, *.backup, *.orig, *.swp, *~
//! - Minified/generated: *.min.js, *.min.css, *.bundle.js, *.chunk.js, *.js.map, *.d.ts
//! - Binary/data: *.wasm, *.db, *.sqlite
//! - Build info: *.snap, *.eslintcache, *.tsbuildinfo
//!
//! ## Multi-Project Isolation:
//! - Each project root is isolated via project_root column in v2 schema
//! - Centralized database at ~/.local/share/ruvector/index_v2.db
//! - Queries are scoped to the project root passed during indexing

use anyhow::{Result, Context, anyhow};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{WalkDir, DirEntry};
use tracing::{info, debug, warn, error};
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
use crate::extractors::text_fallback::TextFallbackExtractor;
use crate::store_v2::{StoreV2, Entity as StoreEntity, Reference as StoreReference, TypeUsage};
use crate::schema_v2::{EntityKind, RefKind, Visibility};
use crate::path_validator;
use codesearch::store_pgvector::PgvectorStore;
use codesearch::paths::{get_codesearch_dir, get_database_path};
// V1 index is deprecated - all operations use V2 (index_v2.db)

/// Directories to exclude from indexing.
/// These are typically build artifacts, dependencies, VCS, or sensitive directories.
const EXCLUDED_DIRS: &[&str] = &[
    // Package managers & dependencies
    "node_modules",      // npm/yarn/pnpm dependencies
    "vendor",            // Go/PHP vendor dependencies
    ".pnpm",             // pnpm store
    ".yarn",             // Yarn 2+ PnP cache

    // Build artifacts
    "target",            // Rust/Maven build artifacts
    "dist",              // JS/TS build output
    "build",             // Generic build output
    "out",               // Common output directory
    ".next",             // Next.js build
    ".nuxt",             // Nuxt.js build
    ".output",           // Nitro/Nuxt output
    ".turbo",            // Turborepo cache
    ".parcel-cache",     // Parcel bundler cache
    ".webpack",          // Webpack cache

    // Version control
    ".git",              // Git repository data
    ".svn",              // Subversion
    ".hg",               // Mercurial

    // IDE & editor
    ".idea",             // JetBrains IDEs
    ".vscode",           // VS Code (may contain sensitive settings)
    ".vs",               // Visual Studio

    // Cache & temp
    ".cache",            // Generic cache directories
    "__pycache__",       // Python bytecode cache
    ".pytest_cache",     // Pytest cache
    ".mypy_cache",       // Mypy cache
    ".ruff_cache",       // Ruff linter cache
    "coverage",          // Test coverage reports
    ".nyc_output",       // NYC coverage output
    ".eslintcache",      // ESLint cache (dir form)

    // Virtual environments
    ".venv",             // Python virtual environments
    "venv",              // Python venv (alternate)
    ".env",              // dotenv directories (not files)
    "env",               // Generic env directory

    // Infrastructure as Code
    ".terraform",        // Terraform state/cache
    ".serverless",       // Serverless framework
    ".aws-sam",          // AWS SAM

    // Project-specific
    ".artifacts",        // CFN Loop artifacts
    ".ruvector",         // RuVector local index (avoid self-indexing)
    ".archive",          // Archived/deprecated code
    "archive",           // Archive directories
    ".archived",         // Archived code (alternate naming)
    "archived",          // Archived directories

    // Backups & generated
    "backups",           // Backup directories
    ".backups",          // Hidden backup directories
    "backup",            // Singular backup directory
    ".backup",           // Hidden singular backup
    "tmp",               // Temporary files
    ".tmp",              // Hidden temp files
    "temp",              // Temp directory
    "logs",              // Log directories
    ".logs",             // Hidden logs

    // Test artifacts (not source code)
    "__snapshots__",     // Jest snapshots
    "__mocks__",         // Jest mocks (usually generated)
    ".storybook",        // Storybook config (not source)
    "storybook-static",  // Storybook build output
    "playwright-report", // Playwright test reports
    "test-results",      // Generic test results

    // Documentation builds
    "_site",             // Jekyll output
    ".docusaurus",       // Docusaurus cache
    "site",              // MkDocs output
];

/// File patterns to exclude from indexing.
/// These are sensitive files or files that shouldn't be semantically indexed.
const EXCLUDED_FILES: &[&str] = &[
    // Sensitive/secrets
    ".env",              // Environment variables (secrets!)
    ".env.local",        // Local env overrides
    ".env.development",  // Dev env
    ".env.production",   // Prod env
    ".env.test",         // Test env
    ".env.example",      // Example env (may contain structure hints)
    "credentials.json",  // GCP/generic credentials
    "secrets.json",      // Generic secrets
    "secrets.yaml",      // Kubernetes secrets
    "service-account.json", // GCP service account
    ".npmrc",            // npm auth tokens
    ".pypirc",           // PyPI auth
    ".netrc",            // Network credentials
    "id_rsa",            // SSH private key
    "id_ed25519",        // SSH private key
    ".pem",              // Certificate/key files
    ".key",              // Key files

    // Lock files (large, not useful for semantic search)
    "package-lock.json", // npm lock
    "yarn.lock",         // Yarn lock
    "pnpm-lock.yaml",    // pnpm lock
    "Cargo.lock",        // Rust lock
    "poetry.lock",       // Python poetry lock
    "Gemfile.lock",      // Ruby bundler lock
    "composer.lock",     // PHP composer lock
    "go.sum",            // Go module checksums
    "flake.lock",        // Nix flake lock

    // Backups
    ".bak",              // Generic backup extension
    ".backup",           // Backup files
    ".orig",             // Original files (merge conflicts)
    ".swp",              // Vim swap files
    ".swo",              // Vim swap files
    "~",                 // Emacs backup files

    // Generated/minified (not useful for semantic search)
    ".min.js",           // Minified JS
    ".min.css",          // Minified CSS
    ".bundle.js",        // Bundled JS
    ".chunk.js",         // Webpack chunks
    ".js.map",           // JavaScript source maps
    ".css.map",          // CSS source maps
    ".d.ts",             // TypeScript declarations (generated, verbose)
    ".d.ts.map",         // TypeScript declaration maps

    // Binary/data files (can't extract meaningful entities)
    ".wasm",             // WebAssembly binary
    ".db",               // SQLite/database files
    ".sqlite",           // SQLite files
    ".sqlite3",          // SQLite3 files

    // Large generated files
    ".snap",             // Jest snapshots
    ".eslintcache",      // ESLint cache file
    ".tsbuildinfo",      // TypeScript incremental build info
];

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
    pgvector_store: Option<PgvectorStore>,
    tokio_runtime: Option<tokio::runtime::Runtime>,
    rust_extractor: RustExtractor,
    typescript_extractor: TypeScriptExtractor,
    text_fallback_extractor: TextFallbackExtractor,
}

/// Extract doc comments from a signature string.
/// Supports Rust-style (///, //!) and JSDoc-style (/** */) comments.
fn extract_doc_comment(signature: &str) -> Option<String> {
    let lines: Vec<&str> = signature.lines().collect();
    let mut doc_lines: Vec<String> = Vec::new();
    let mut in_jsdoc = false;

    for line in &lines {
        let trimmed = line.trim();

        // Handle JSDoc-style comments (/** ... */)
        if trimmed.starts_with("/**") {
            let after_open = trimmed.strip_prefix("/**").unwrap_or("").trim();
            // Check if it's a single-line JSDoc (/** content */)
            if after_open.ends_with("*/") {
                let content = after_open.strip_suffix("*/").unwrap_or(after_open).trim();
                if !content.is_empty() {
                    doc_lines.push(content.to_string());
                }
                // Single-line, don't enter jsdoc mode
                continue;
            }
            // Multi-line JSDoc
            in_jsdoc = true;
            if !after_open.is_empty() {
                doc_lines.push(after_open.to_string());
            }
            continue;
        }

        if in_jsdoc {
            if trimmed.contains("*/") {
                in_jsdoc = false;
                // Extract content before */
                let content = trimmed.strip_suffix("*/").unwrap_or(trimmed)
                    .trim_start_matches('*').trim();
                if !content.is_empty() {
                    doc_lines.push(content.to_string());
                }
            } else {
                // Middle lines of JSDoc (usually start with *)
                let content = trimmed.trim_start_matches('*').trim();
                if !content.is_empty() {
                    doc_lines.push(content.to_string());
                }
            }
            continue;
        }

        // Handle Rust-style doc comments (/// or //!)
        if trimmed.starts_with("///") {
            let content = trimmed.strip_prefix("///").unwrap_or("").trim();
            doc_lines.push(content.to_string());
        } else if trimmed.starts_with("//!") {
            let content = trimmed.strip_prefix("//!").unwrap_or("").trim();
            doc_lines.push(content.to_string());
        } else if !doc_lines.is_empty() {
            // Stop when we hit a non-doc-comment line after collecting some
            break;
        }
    }

    if doc_lines.is_empty() {
        None
    } else {
        Some(doc_lines.join("\n"))
    }
}

impl IndexCommand {
    pub fn new(
        project_dir: &Path,
        path: &Path,
        file_types: Vec<String>,
        patterns: Option<Vec<String>>,
        force: bool,
        pg_url: Option<&str>,
    ) -> Result<Self> {
        let index_path = get_codesearch_dir()?;
        let embeddings_manager = EmbeddingsManager::new(&index_path)?;
        let search_engine = SearchEngine::new(&index_path)?;
        let store = SqliteStore::new(&index_path.join("index.db"))?;
        let store_v2 = StoreV2::new(&get_database_path()?)?;

        // Initialize pgvector store and runtime if connection URL provided
        let (pgvector_store, tokio_runtime) = if let Some(url) = pg_url {
            info!("Initializing pgvector store with URL: {}", url);
            let rt = tokio::runtime::Runtime::new()?;
            match rt.block_on(PgvectorStore::new(url)) {
                Ok(store) => {
                    info!("Successfully connected to pgvector");
                    (Some(store), Some(rt))
                }
                Err(e) => {
                    warn!("Failed to connect to pgvector: {}. Using SQLite only.", e);
                    (None, None)
                }
            }
        } else {
            info!("No pg_url provided, using SQLite only");
            (None, None)
        };

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
            pgvector_store,
            tokio_runtime,
            rust_extractor: RustExtractor::new()?,
            typescript_extractor: TypeScriptExtractor::new()?,
            text_fallback_extractor: TextFallbackExtractor::new()?,
        })
    }

    pub fn execute(&mut self) -> Result<IndexStats> {
        // Fail early if OPENAI_API_KEY is not set
        if std::env::var("OPENAI_API_KEY").is_err() {
            error!("OPENAI_API_KEY environment variable is required for indexing");
            return Err(anyhow!(
                "OPENAI_API_KEY not found. Set it with: export OPENAI_API_KEY=\"sk-...\"\n\
                 Indexing requires a valid OpenAI API key for generating embeddings."
            ));
        }

        info!("Starting index process");
        info!("File types: {:?}", self.file_types);
        if let Some(ref patterns) = self.patterns {
            info!("Patterns: {:?}", patterns);
        }

        // Canonicalize project_dir at the start for security
        let _canonical_project_dir = path_validator::canonicalize(&self.project_dir)?;
        debug!("Project root canonicalized: {}", _canonical_project_dir.display());

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
        info!("Excluded directories: {} patterns", EXCLUDED_DIRS.len());
        info!("Excluded files: {} patterns", EXCLUDED_FILES.len());

        let mut files = Vec::new();

        let walker = WalkDir::new(&self.source_path)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();

                // Exclude build artifacts, dependencies, and sensitive directories
                // Allow .claude and other important folders (not in EXCLUDED_DIRS)
                !EXCLUDED_DIRS.contains(&name.as_ref())
            })
            .filter_map(|e| e.ok())
            .filter(|e| {
                if e.file_type().is_dir() {
                    return false;
                }

                if e.path().starts_with(&self.index_path) {
                    return false;
                }

                let file_name = e.file_name().to_string_lossy();

                // Exclude sensitive files by exact name match
                if EXCLUDED_FILES.contains(&file_name.as_ref()) {
                    return false;
                }

                // Exclude files by suffix pattern (e.g., ".min.js", ".bak")
                for pattern in EXCLUDED_FILES {
                    if pattern.starts_with('.') && file_name.ends_with(pattern) {
                        return false;
                    }
                }

                // Exclude emacs backup files ending with ~
                if file_name.ends_with('~') {
                    return false;
                }

                true
            });

        for entry in walker {
            files.push(entry.path().to_path_buf());
        }

        info!("Found {} files to index", files.len());
        Ok(files)
    }


    fn process_files(&mut self, files: Vec<PathBuf>) -> Result<IndexStats> {
        let stats = Arc::new(RwLock::new(IndexStats::default()));
        let errors = Arc::new(RwLock::new(Vec::new()));

        info!("Processing {} files (parallel extraction, sequential DB writes)", files.len());

        // Process in chunks for parallel extraction with sequential DB writes
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
        &mut self,
        file_path: &Path,
        stats: &Arc<RwLock<IndexStats>>,
        errors: &Arc<RwLock<Vec<String>>>,
    ) -> Result<()> {
        let file_hash = self.calculate_file_hash(file_path)?;

        // Check if file is already indexed with same hash (incremental indexing)
        if !self.force && self.is_file_indexed(file_path, &file_hash)? {
            debug!("Skipping already indexed file (unchanged): {}", file_path.display());
            return Ok(());
        }

        // Non-destructive update: Only delete entities for THIS specific file
        // The delete_file_entities already scopes to project_root for multi-project safety
        let file_path_str = file_path.to_string_lossy();

        // Only clean up if the file was previously indexed (avoid unnecessary DB operations)
        if self.is_file_in_index(file_path)? {
            debug!("Updating existing file entries: {}", file_path.display());
            self.store_v2.delete_file_entities(&file_path_str, &self.project_dir)?;
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

        // Store embeddings in SQLite entity_embeddings table (metadata)
        for (entity_id, embedding) in entity_ids.iter().zip(embeddings.iter()) {
            self.store_v2.store_embedding(*entity_id, embedding, "text-embedding-3-small")?;
        }

        // Store embeddings in pgvector if available
        if let Some(ref pgvector_store) = self.pgvector_store {
            if let Some(ref rt) = self.tokio_runtime {
                let project_root_str = self.project_dir.to_string_lossy().to_string();

                // Build entities the same way store_entities does
                for (i, entity) in extraction_result.entities.iter().enumerate() {
                    let store_entity = codesearch::store_v2::Entity {
                        id: entity_ids[i],
                        kind: match entity.kind {
                            crate::extractors::EntityKind::Function => codesearch::schema_v2::EntityKind::Function,
                            crate::extractors::EntityKind::Method => codesearch::schema_v2::EntityKind::Method,
                            crate::extractors::EntityKind::Constructor => codesearch::schema_v2::EntityKind::Constructor,
                            crate::extractors::EntityKind::Getter => codesearch::schema_v2::EntityKind::Getter,
                            crate::extractors::EntityKind::Setter => codesearch::schema_v2::EntityKind::Setter,
                            crate::extractors::EntityKind::Class => codesearch::schema_v2::EntityKind::Class,
                            crate::extractors::EntityKind::Interface => codesearch::schema_v2::EntityKind::Interface,
                            crate::extractors::EntityKind::Struct => codesearch::schema_v2::EntityKind::Struct,
                            crate::extractors::EntityKind::Enum => codesearch::schema_v2::EntityKind::Enum,
                            crate::extractors::EntityKind::Trait => codesearch::schema_v2::EntityKind::Trait,
                            crate::extractors::EntityKind::TypeAlias => codesearch::schema_v2::EntityKind::TypeAlias,
                            crate::extractors::EntityKind::Module => codesearch::schema_v2::EntityKind::Module,
                            crate::extractors::EntityKind::Namespace => codesearch::schema_v2::EntityKind::Namespace,
                            crate::extractors::EntityKind::Variable => codesearch::schema_v2::EntityKind::Variable,
                            crate::extractors::EntityKind::Constant => codesearch::schema_v2::EntityKind::Constant,
                            crate::extractors::EntityKind::Parameter => codesearch::schema_v2::EntityKind::Parameter,
                            crate::extractors::EntityKind::Import => codesearch::schema_v2::EntityKind::Import,
                        },
                        name: entity.name.clone(),
                        signature: Some(entity.signature.clone()),
                        visibility: match entity.visibility {
                            crate::extractors::Visibility::Public => codesearch::schema_v2::Visibility::Public,
                            crate::extractors::Visibility::Private => codesearch::schema_v2::Visibility::Private,
                            crate::extractors::Visibility::Protected => codesearch::schema_v2::Visibility::Protected,
                            crate::extractors::Visibility::Internal => codesearch::schema_v2::Visibility::Internal,
                            crate::extractors::Visibility::FilePrivate => codesearch::schema_v2::Visibility::FilePrivate,
                        },
                        parent_id: None,
                        file_path: file_path.to_string_lossy().to_string(),
                        line_number: entity.line as i64,
                        column_number: Some(entity.column as i64),
                        doc_comment: extract_doc_comment(&entity.signature),
                        attributes: None,
                        metadata: Some(serde_json::to_string(&entity.metadata)?),
                        project_root: project_root_str.clone(),
                        created_at: chrono::Utc::now(),
                        updated_at: chrono::Utc::now(),
                    };

                    // Use the stored runtime (created once in new())
                    match rt.block_on(pgvector_store.store_entity_with_embedding(
                        &store_entity,
                        &embeddings[i],
                        &project_root_str,
                    )) {
                        Ok(_) => debug!("Stored entity in pgvector: {}", store_entity.name),
                        Err(e) => warn!("Failed to store entity in pgvector: {:?}", e),
                    }
                }
            } else {
                warn!("pgvector_store available but tokio_runtime is None - this is a bug");
            }
        }

        {
            let mut s = stats.write().unwrap();
            s.files_processed += 1;
            s.entities_extracted += extraction_result.entities.len();
            s.references_extracted += extraction_result.references.len();
            s.embeddings_generated += embeddings.len();
        }

        self.mark_file_indexed(file_path, &file_hash, extraction_result.entities.len())?;

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
            "text" => {
                // Use text fallback extractor for non-code files
                let mut extractor = self.text_fallback_extractor.clone();
                extractor.extract(&file_path.to_string_lossy(), content)?
            },
            _ => {
                // Try text fallback for unknown types
                let mut extractor = self.text_fallback_extractor.clone();
                extractor.extract(&file_path.to_string_lossy(), content)?
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
                // Text-based file types
                "json" | "yaml" | "yml" | "md" | "markdown" | "sh" | "bash" | "txt" | "config" | "conf" | "env" => {
                    Ok("text".to_string())
                },
                _ => Ok("text".to_string()), // Default to text fallback for unknown types
            }
        } else {
            Ok("text".to_string())
        }
    }

    fn store_entities(&self, file_path: &Path, entities: &[Entity]) -> Result<Vec<i64>> {
        let mut entity_ids = Vec::new();
        let project_root_str = self.project_dir.to_string_lossy();

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
                doc_comment: extract_doc_comment(&entity.signature),
                attributes: None,
                metadata: Some(serde_json::to_string(&entity.metadata)?),
                project_root: project_root_str.to_string(),
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };

            let id = self.store_v2.insert_entity(&store_entity, &project_root_str)?;
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

    /// Check if file exists in the index (regardless of hash)
    fn is_file_in_index(&self, file_path: &Path) -> Result<bool> {
        let query = "SELECT COUNT(*) FROM file_hashes WHERE file_path = ?";
        let mut stmt = self.store_v2.conn.prepare(query)?;
        let count: i64 = stmt.query_row(
            params![file_path.to_string_lossy()],
            |row| row.get(0)
        )?;
        Ok(count > 0)
    }

    fn mark_file_indexed(&self, file_path: &Path, file_hash: &str, patterns_count: usize) -> Result<()> {
        let timestamp = chrono::Utc::now().timestamp();
        let file_path_str = file_path.to_string_lossy().to_string();

        // Update file_hashes table (for incremental indexing)
        self.store_v2.conn.execute(
            "INSERT OR REPLACE INTO file_hashes (file_path, file_hash, indexed_at) VALUES (?1, ?2, ?3)",
            params![&file_path_str, file_hash, timestamp]
        )?;

        // Also update the files table (for legacy compatibility and stats)
        self.store_v2.conn.execute(
            "INSERT OR REPLACE INTO files (path, hash, last_indexed, patterns_count) VALUES (?1, ?2, ?3, ?4)",
            params![&file_path_str, file_hash, timestamp, patterns_count as i64]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_rust_doc_comment() {
        let signature = r#"/// Create a new Rust extractor
pub fn new() -> Self"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, Some("Create a new Rust extractor".to_string()));
    }

    #[test]
    fn test_extract_rust_multiline_doc_comment() {
        let signature = r#"/// Create a new store
/// This is the main entry point
pub fn new() -> Self"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, Some("Create a new store\nThis is the main entry point".to_string()));
    }

    #[test]
    fn test_extract_rust_inner_doc_comment() {
        let signature = r#"//! Module documentation
//! This module handles storage
pub mod store"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, Some("Module documentation\nThis module handles storage".to_string()));
    }

    #[test]
    fn test_extract_jsdoc_comment() {
        let signature = r#"/**
 * Create a new instance
 * @param name The name
 */
function create(name: string)"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, Some("Create a new instance\n@param name The name".to_string()));
    }

    #[test]
    fn test_extract_jsdoc_single_line() {
        let signature = r#"/** Quick summary */
function test()"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, Some("Quick summary".to_string()));
    }

    #[test]
    fn test_no_doc_comment() {
        let signature = r#"pub fn new() -> Self"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, None);
    }

    #[test]
    fn test_empty_signature() {
        let doc = extract_doc_comment("");
        assert_eq!(doc, None);
    }

    #[test]
    fn test_regular_comment_not_extracted() {
        let signature = r#"// This is a regular comment
pub fn new() -> Self"#;
        let doc = extract_doc_comment(signature);
        assert_eq!(doc, None);
    }
}