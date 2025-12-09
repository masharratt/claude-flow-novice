use anyhow::{Result, anyhow};
use serde_json::{json};
use std::path::{Path, PathBuf};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use tracing::{info, debug, warn, error};
use serde::Serialize;

use crate::search_engine::{SearchEngine, SearchResult};

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

#[derive(Debug)]
pub struct QueryCommand {
    project_dir: PathBuf,
    config: QueryConfig,
    search_engine: SearchEngine,
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
    ) -> Self {
        let search_engine = SearchEngine::new(project_dir).unwrap();

        Self {
            project_dir: project_dir.to_path_buf(),
            config: QueryConfig {
                query,
                max_results,
                threshold,
                output_format,
                context_lines,
                file_filter,
            },
            search_engine,
        }
    }

    pub fn execute(&self) -> Result<()> {
        info!("Executing query: {}", self.config.query);

        // Load the search engine
        let mut search_engine = self.search_engine.duplicate()?;
        search_engine.load_or_create()?;

        // Perform search
        let results = search_engine.search(&self.config.query, self.config.max_results)?;

        // Filter by threshold if specified
        let filtered_results: Vec<SearchResult> = if let Some(threshold) = self.config.threshold {
            results.into_iter()
                .filter(|r| r.score >= threshold)
                .collect()
        } else {
            results
        };

        // Filter by file if specified
        let final_results: Vec<SearchResult> = if let Some(ref file_filter) = self.config.file_filter {
            filtered_results.into_iter()
                .filter(|r| r.path.contains(file_filter))
                .collect()
        } else {
            filtered_results
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
            println!("{}", result.pattern);
        }
        Ok(())
    }

    fn output_json(&self, results: &[SearchResult]) -> Result<()> {
        let json_results: Vec<serde_json::Value> = results.iter()
            .map(|r| json!({
                "id": r.id,
                "path": r.path,
                "pattern": r.pattern,
                "score": r.score,
                "context": r.context,
                "line_number": r.line_number,
                "snippet": r.snippet
            }))
            .collect();

        println!("{}", serde_json::to_string_pretty(&json_results)?);
        Ok(())
    }

    fn output_detailed(&self, results: &[SearchResult]) -> Result<()> {
        for (i, result) in results.iter().enumerate() {
            println!("{}. {} (score: {:.3})", i + 1, result.path, result.score);
            if let Some(line) = result.line_number {
                println!("   Line: {}", line);
            }
            println!("   Pattern: {}", result.pattern);
            if let Some(snippet) = &result.snippet {
                println!("   Snippet: {}", snippet);
            }
            if let Some(context) = &result.context {
                println!("   Context: {}", context);
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
    search_engine: SearchEngine,
}

impl BatchQueryCommand {
    pub fn new(
        project_dir: &Path,
        batch_file: PathBuf,
        output_file: Option<PathBuf>,
        max_results: Option<usize>,
    ) -> Self {
        let search_engine = SearchEngine::new(project_dir).unwrap();

        Self {
            project_dir: project_dir.to_path_buf(),
            batch_file,
            output_file,
            max_results,
            search_engine,
        }
    }

    pub fn execute(&self) -> Result<()> {
        info!("Executing batch queries from: {}", self.batch_file.display());

        // Load the search engine
        let mut search_engine = self.search_engine.duplicate()?;
        search_engine.load_or_create()?;

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

        // Process each query
        for query in queries {
            debug!("Query: {}", query);
            
            let results = search_engine.search(&query, self.max_results)?;
            
            // Write results
            writeln!(output, "Query: {}", query)?;
            for result in results {
                let snippet = result.snippet.as_deref().unwrap_or(&result.pattern);
                writeln!(output, "{},{},{},\"{}\",\"{}\"",
                    result.id,
                    result.path,
                    result.score,
                    result.pattern,
                    snippet
                )?;
            }
            writeln!(output)?;
        }

        info!("Batch query complete");
        Ok(())
    }
}
