use anyhow::{Result, Context};
use clap::Args;
use serde_json::{json};
use std::path::{Path, PathBuf};
use tracing::{info, debug, warn};
use serde::Serialize;

use crate::query_api::{QueryApi, QueryResultFormatter};
use crate::store_v2::{StoreV2};
use crate::schema_v2::{EntityKind};
use crate::paths::get_database_path;

#[derive(Debug, Args)]
pub struct FindCommand {
    /// Find functions using a specific type
    #[arg(long)]
    pub uses_type: Option<String>,

    /// Find callers of a specific function
    #[arg(long)]
    pub called_by: Option<String>,

    /// Find types from a file used elsewhere
    #[arg(long)]
    pub types_from: Option<String>,

    /// Find implementations of a trait/interface
    #[arg(long)]
    pub implements: Option<String>,

    /// Find public API of a module
    #[arg(long)]
    pub public_api: Option<String>,

    /// Find references to a path
    #[arg(long)]
    pub refs_to: Option<String>,

    /// Entity kind filter (function, struct, enum, etc.)
    #[arg(long)]
    pub kind: Option<String>,

    /// Exclude module from results (for --called-by)
    #[arg(long)]
    pub exclude: Option<String>,

    /// Maximum number of results to return
    #[arg(short, long, default_value = "50")]
    pub limit: usize,

    /// Output format
    #[arg(long, value_enum, default_value = "simple")]
    pub format: FindOutputFormat,

    /// Show detailed context
    #[arg(long)]
    pub detailed: bool,

    /// Output file (optional)
    #[arg(long)]
    pub output: Option<PathBuf>,
}

#[derive(Debug, Clone, clap::ValueEnum)]
pub enum FindOutputFormat {
    Simple,
    Json,
    Detailed,
    Csv,
}

impl FindCommand {
    pub fn execute(&self, _project_dir: &Path) -> Result<()> {
        // Use centralized database
        let db_path = get_database_path()?;
        let store = StoreV2::new(&db_path)
            .context("Failed to open database")?;
        let query_api = QueryApi::new(store);

        // Execute the appropriate query
        let result = match &self.find_type() {
            FindType::FunctionsUsingType(type_name) => {
                query_api.find_functions_using_type(type_name)
            }
            FindType::CallersOfFunction { function_name, exclude_module } => {
                query_api.find_callers_of_function(function_name, exclude_module.as_deref())
            }
            FindType::TypesUsedElsewhere(file_path) => {
                query_api.find_types_used_elsewhere(file_path)
            }
            FindType::Implementations(trait_name) => {
                query_api.find_implementations(trait_name)
            }
            FindType::PublicAPI(module_path) => {
                query_api.find_public_api(module_path)
            }
            FindType::ReferencesToPath(path) => {
                query_api.find_references_to_path(path)
            }
            FindType::None => {
                return Err(anyhow::anyhow!("No find criteria specified. Use one of the find options."));
            }
        }?;

        // Filter by kind if specified
        let filtered_result = if let Some(kind_str) = &self.kind {
            if let Some(kind) = EntityKind::from_str(kind_str) {
                let filtered_items: Vec<_> = result.results.into_iter()
                    .filter(|item| item.entity.kind == kind)
                    .collect();

                let count = filtered_items.len();
                crate::query_api::QueryResult {
                    query_type: result.query_type,
                    results: filtered_items,
                    total_count: count,
                }
            } else {
                warn!("Invalid entity kind: {}", kind_str);
                result
            }
        } else {
            result
        };

        // Apply limit
        let limited_result = crate::query_api::QueryResult {
            query_type: filtered_result.query_type,
            results: filtered_result.results.into_iter().take(self.limit).collect(),
            total_count: filtered_result.total_count,
        };

        // Format and output results
        let output = match self.format {
            FindOutputFormat::Simple => limited_result.format_simple(),
            FindOutputFormat::Json => limited_result.format_json()?,
            FindOutputFormat::Detailed => limited_result.format_detailed(),
            FindOutputFormat::Csv => self.format_csv(&limited_result)?,
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

        info!("Find command completed: {} results found", limited_result.total_count);
        Ok(())
    }

    fn find_type(&self) -> FindType {
        if let Some(type_name) = &self.uses_type {
            FindType::FunctionsUsingType(type_name.clone())
        } else if let Some(function_name) = &self.called_by {
            FindType::CallersOfFunction {
                function_name: function_name.clone(),
                exclude_module: self.exclude.clone(),
            }
        } else if let Some(file_path) = &self.types_from {
            FindType::TypesUsedElsewhere(file_path.clone())
        } else if let Some(trait_name) = &self.implements {
            FindType::Implementations(trait_name.clone())
        } else if let Some(module_path) = &self.public_api {
            FindType::PublicAPI(module_path.clone())
        } else if let Some(path) = &self.refs_to {
            FindType::ReferencesToPath(path.clone())
        } else {
            FindType::None
        }
    }

    fn format_csv(&self, result: &crate::query_api::QueryResult) -> Result<String> {
        let mut output = String::new();

        // CSV header
        output.push_str("file_path,line_number,kind,name,visibility,score\n");

        // CSV rows
        for item in &result.results {
            output.push_str(&format!(
                "{},{},{},{},{},{}\n",
                item.entity.file_path,
                item.entity.line_number,
                item.entity.kind.as_str(),
                item.entity.name,
                item.entity.visibility.as_str(),
                item.score
            ));
        }

        Ok(output)
    }
}

#[derive(Debug)]
enum FindType {
    FunctionsUsingType(String),
    CallersOfFunction {
        function_name: String,
        exclude_module: Option<String>,
    },
    TypesUsedElsewhere(String),
    Implementations(String),
    PublicAPI(String),
    ReferencesToPath(String),
    None,
}