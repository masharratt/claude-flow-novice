use anyhow::{Result, Context};
use clap::Args;
use serde_json::{json};
use std::path::{Path, PathBuf};
use tracing::{info, debug, warn};

use crate::query_api::{QueryApi, QueryResultFormatter};
use crate::store_v2::{StoreV2};
use crate::paths::get_database_path;

#[derive(Debug, Args)]
pub struct RefsCommand {
    /// Find all references to an entity by name
    #[arg()]
    pub entity_name: String,

    /// Entity kind to search for (function, struct, enum, etc.)
    #[arg(long)]
    pub kind: Option<String>,

    /// Reference kind filter (call, import, implement, etc.)
    #[arg(long)]
    pub ref_kind: Option<String>,

    /// Limit search to specific file
    #[arg(long)]
    pub file: Option<String>,

    /// Maximum number of results to return
    #[arg(short, long, default_value = "50")]
    pub limit: usize,

    /// Output format
    #[arg(long, value_enum, default_value = "simple")]
    pub format: RefsOutputFormat,

    /// Show detailed context
    #[arg(long)]
    pub detailed: bool,

    /// Output file (optional)
    #[arg(long)]
    pub output: Option<PathBuf>,

    /// Group results by file
    #[arg(long)]
    pub group_by_file: bool,

    /// Include only inbound references (references to this entity)
    #[arg(long)]
    pub inbound: bool,

    /// Include only outbound references (references from this entity)
    #[arg(long)]
    pub outbound: bool,
}

#[derive(Debug, Clone, clap::ValueEnum)]
pub enum RefsOutputFormat {
    Simple,
    Json,
    Detailed,
    Tree,
}

impl RefsCommand {
    pub fn execute(&self, _project_dir: &Path) -> Result<()> {
        // Use centralized database
        let db_path = get_database_path()?;
        let store = StoreV2::new(&db_path)
            .context("Failed to open database")?;
        let query_api = QueryApi::new(store);

        // Build a path-like search term
        let search_term = if let Some(kind) = &self.kind {
            format!("{}::{}", kind, self.entity_name)
        } else {
            self.entity_name.clone()
        };

        // Find references using the query API
        let mut result = query_api.find_references_to_path(&search_term)?;

        // Filter results based on command options
        let filtered_results: Vec<_> = result.results.into_iter()
            .filter(|item| {
                // Filter by file if specified
                if let Some(file) = &self.file {
                    if !item.entity.file_path.contains(file) {
                        return false;
                    }
                }

                // Additional filtering could be added here for ref_kind
                true
            })
            .collect();

        // Update the result with filtered items
        result.results = filtered_results;
        result.total_count = result.results.len();

        // Apply limit
        let limited_result = crate::query_api::QueryResult {
            query_type: result.query_type,
            results: result.results.into_iter().take(self.limit).collect(),
            total_count: result.total_count,
        };

        // Format and output results
        let output = match self.format {
            RefsOutputFormat::Simple => self.format_simple(&limited_result),
            RefsOutputFormat::Json => limited_result.format_json()?,
            RefsOutputFormat::Detailed => limited_result.format_detailed(),
            RefsOutputFormat::Tree => self.format_tree(&limited_result),
        };

        // Write output
        if let Some(output_path) = &self.output {
            std::fs::write(output_path, output)
                .context("Failed to write output file")?;
            info!("Results written to: {}", output_path.display());
        } else {
            println!("{}", output);
        }

        // Show summary if we truncated results
        if limited_result.total_count > self.limit {
            eprintln!("\n⚠️  Showing {} of {} total results", self.limit, limited_result.total_count);
        }

        info!("Refs command completed: {} references found", limited_result.total_count);
        Ok(())
    }

    fn format_simple(&self, result: &crate::query_api::QueryResult) -> String {
        if self.group_by_file {
            let mut groups = std::collections::HashMap::new();
            for item in &result.results {
                groups.entry(&item.entity.file_path)
                    .or_insert_with(Vec::new)
                    .push(item);
            }

            let mut output = String::new();
            for (file_path, items) in groups {
                output.push_str(&format!("\n📁 {}\n", file_path));
                for item in items {
                    output.push_str(&format!("  {}:{} - {}\n",
                        item.entity.line_number,
                        item.entity.name,
                        item.entity.kind.as_str()
                    ));
                }
            }
            output.trim_start().to_string()
        } else {
            result.results.iter()
                .map(|item| format!("{}:{} - {} ({})",
                    item.entity.file_path,
                    item.entity.line_number,
                    item.entity.name,
                    item.entity.kind.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        }
    }

    fn format_tree(&self, result: &crate::query_api::QueryResult) -> String {
        let mut tree = String::new();

        // Group by file for tree view
        let mut groups = std::collections::HashMap::new();
        for item in &result.results {
            groups.entry(&item.entity.file_path)
                .or_insert_with(Vec::new)
                .push(item);
        }

        for (file_path, items) in groups {
            tree.push_str(&format!("📁 {}\n", file_path));

            // Group by line number to show multiple refs on same line
            let mut line_groups = std::collections::HashMap::new();
            for item in items {
                line_groups.entry(item.entity.line_number)
                    .or_insert_with(Vec::new)
                    .push(item);
            }

            for (line, items_at_line) in line_groups {
                tree.push_str(&format!("  📍 Line {}:\n", line));
                for item in items_at_line {
                    tree.push_str(&format!("    ├── {} ({})\n",
                        item.entity.name,
                        item.entity.kind.as_str()
                    ));
                    if let Some(context) = &item.context {
                        let first_line = context.lines().next().unwrap_or("").trim();
                        if !first_line.is_empty() {
                            tree.push_str(&format!("    │   └─ {}\n", first_line));
                        }
                    }
                }
            }
        }

        tree
    }
}