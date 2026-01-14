use anyhow::{Result, anyhow};
use serde_json::{json};
use std::path::{Path, PathBuf};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use tracing::{info, debug, warn, error};
use serde::Serialize;

use crate::query_v2::{QueryV2, SearchResult};
use crate::paths::get_database_path;
use crate::path_validator;
use codesearch::store_pgvector::PgvectorStore;
use codesearch::embeddings::EmbeddingsManager;

#[derive(Debug, Clone)]
pub enum OutputFormat {
    Simple,
    Json,
    Detailed,
}

#[derive(Debug, Clone)]
pub struct QueryConfig {
    pub query: String,
    pub max_results: Option<usize>,
    pub threshold: Option<f32>,
    pub output_format: OutputFormat,
    pub context_lines: usize,
    pub file_filter: Option<String>,
}

pub struct QueryCommand {
    project_dir: PathBuf,
    config: QueryConfig,
    query_v2: QueryV2,
    pgvector_store: Option<PgvectorStore>,
    embeddings_manager: Option<EmbeddingsManager>,
}

impl QueryCommand {
    pub fn new(
        project_dir: &Path,
        query: String,
        max_results: Option<usize>,
        threshold: Option<f32>,
        output_format: OutputFormat,
        context_lines: usize,
        file_filter: Option<String>,
        pg_url: Option<&str>,
    ) -> Result<Self> {
        // Canonicalize project_dir at the start for security
        let canonical_project_dir = path_validator::canonicalize(project_dir)?;
        debug!("Project root canonicalized: {}", canonical_project_dir.display());

        let db_path = get_database_path()?;
        let query_v2 = QueryV2::new(&db_path)?;

        // Initialize pgvector store if connection URL provided
        let (pgvector_store, embeddings_manager) = if let Some(url) = pg_url {
            info!("Initializing pgvector store for queries");
            let rt = tokio::runtime::Runtime::new()?;
            match rt.block_on(PgvectorStore::new(url)) {
                Ok(store) => {
                    info!("Successfully connected to pgvector");
                    // Need embeddings manager to generate query embeddings
                    let index_path = crate::paths::get_codesearch_dir()?;
                    let embeddings_mgr = EmbeddingsManager::new(&index_path)?;
                    (Some(store), Some(embeddings_mgr))
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

        Ok(Self {
            project_dir: canonical_project_dir,
            config: QueryConfig {
                query,
                max_results,
                threshold,
                output_format,
                context_lines,
                file_filter,
            },
            query_v2,
            pgvector_store,
            embeddings_manager,
        })
    }

    pub fn execute(&self) -> Result<()> {
        info!("Executing query: {}", self.config.query);

        // Set default values
        let max_results = self.config.max_results.unwrap_or(10);
        let threshold = self.config.threshold.unwrap_or(0.3);

        // Perform search - use pgvector if available, otherwise SQLite
        let results: Vec<SearchResult> = if let (Some(ref pgvector_store), Some(ref embeddings_mgr)) =
            (&self.pgvector_store, &self.embeddings_manager) {
            info!("Using pgvector for semantic search");

            // Generate embedding for query
            let query_texts: Vec<String> = vec![self.config.query.clone()];
            let query_embeddings: Vec<Vec<f32>> = embeddings_mgr.generate_embeddings(&query_texts)?;
            let query_embedding: &[f32] = &query_embeddings[0];

            // Search pgvector
            let rt = tokio::runtime::Runtime::new()?;
            let project_root_str = self.project_dir.to_string_lossy().to_string();
            let pg_results = rt.block_on(
                pgvector_store.search_similar(
                    query_embedding,
                    max_results,
                    threshold,
                    Some(&project_root_str),
                )
            )?;

            // Convert pgvector SearchResult to query_v2 SearchResult
            pg_results.into_iter().map(|r| SearchResult {
                entity_kind: r.entity_kind,
                entity_name: r.entity_name,
                file_path: r.file_path,
                similarity: r.similarity,
                line_start: Some(r.line_number),
                line_end: None,
            }).collect()
        } else {
            info!("Using SQLite for search");
            self.query_v2.search(&self.config.query, max_results, threshold, &self.project_dir)?
        };

        // Filter by file if specified
        let final_results: Vec<SearchResult> = if let Some(ref file_filter) = self.config.file_filter {
            results.into_iter()
                .filter(|r| r.file_path.contains(file_filter))
                .collect()
        } else {
            results
        };

        // Output results
        match self.config.output_format {
            OutputFormat::Json => self.output_json(&final_results)?,
            OutputFormat::Detailed => self.output_detailed(&final_results)?,
            OutputFormat::Simple => self.output_simple(&final_results)?,
        }

        info!("Query complete: {} results", final_results.len());
        Ok(())
    }

    fn output_simple(&self, results: &[SearchResult]) -> Result<()> {
        for result in results {
            let line_info = result.line_start
                .map(|l| format!(":{}", l))
                .unwrap_or_default();
            println!("{} {} in {}{} (similarity: {:.3})",
                result.entity_kind,
                result.entity_name,
                result.file_path,
                line_info,
                result.similarity
            );
        }
        Ok(())
    }

    fn output_json(&self, results: &[SearchResult]) -> Result<()> {
        let json_results: Vec<serde_json::Value> = results.iter()
            .map(|r| json!({
                "entity_kind": r.entity_kind,
                "entity_name": r.entity_name,
                "file_path": r.file_path,
                "similarity": r.similarity,
                "line_start": r.line_start,
                "line_end": r.line_end
            }))
            .collect();

        println!("{}", serde_json::to_string_pretty(&json_results)?);
        Ok(())
    }

    fn output_detailed(&self, results: &[SearchResult]) -> Result<()> {
        for (i, result) in results.iter().enumerate() {
            let line_info = result.line_start.map(|l| format!(":{}", l)).unwrap_or_default();
            println!("{}. {} {} in {}{} (similarity: {:.3})", 
                i + 1, 
                result.entity_kind, 
                result.entity_name,
                result.file_path,
                line_info,
                result.similarity
            );
            println!("   File: {}", result.file_path);
            if let Some(line_start) = result.line_start {
                println!("   Line: {}", line_start);
            }
            if let Some(line_end) = result.line_end {
                println!("   End Line: {}", line_end);
            }
            println!();
        }
        Ok(())
    }
}

pub struct BatchQueryCommand {
    project_dir: PathBuf,
    batch_file: PathBuf,
    output_file: Option<PathBuf>,
    max_results: Option<usize>,
    query_v2: QueryV2,
}

impl BatchQueryCommand {
    pub fn new(
        project_dir: &Path,
        batch_file: PathBuf,
        output_file: Option<PathBuf>,
        max_results: Option<usize>,
    ) -> Result<Self> {
        // Canonicalize project_dir at the start for security
        let canonical_project_dir = path_validator::canonicalize(project_dir)?;
        debug!("Project root canonicalized: {}", canonical_project_dir.display());

        let db_path = get_database_path()?;
        let query_v2 = QueryV2::new(&db_path)?;

        Ok(Self {
            project_dir: canonical_project_dir,
            batch_file,
            output_file,
            max_results,
            query_v2,
        })
    }

    pub fn execute(&self) -> Result<()> {
        info!("Executing batch queries from: {}", self.batch_file.display());

        // Read batch queries
        let file = File::open(&self.batch_file)?;
        let reader = BufReader::new(file);
        let mut queries = Vec::new();

        for line in reader.lines() {
            let line = line?;
            let line = line.trim();
            if !line.is_empty() {
                queries.push(line.to_string());
            }
        }

        info!("Processing {} queries", queries.len());

        // Prepare output
        let mut output: Box<dyn Write> = if let Some(ref output_path) = self.output_file {
            Box::new(File::create(output_path)?)
        } else {
            Box::new(std::io::stdout())
        };

        // Set default values
        let max_results = self.max_results.unwrap_or(10);
        let threshold = 0.5;

        // Process each query
        for query in queries {
            debug!("Query: {}", query);

            let results = self.query_v2.search(&query, max_results, threshold, &self.project_dir)?;
            
            // Write results
            writeln!(output, "Query: {}", query)?;
            for result in results {
                let line_info = result.line_start
                    .map(|l| format!(":{}", l))
                    .unwrap_or_default();
                writeln!(output, "{} {} in {}{} (similarity: {:.3})",
                    result.entity_kind,
                    result.entity_name,
                    result.file_path,
                    line_info,
                    result.similarity
                )?;
            }
            writeln!(output)?;
        }

        info!("Batch query complete");
        Ok(())
    }
}