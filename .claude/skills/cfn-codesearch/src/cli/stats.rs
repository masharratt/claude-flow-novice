use anyhow::{Result, Context};
use std::path::Path;
use std::collections::HashMap;
use tracing::info;
use serde::{Serialize, Deserialize};

use crate::store_v2::StoreV2;
use crate::paths::get_database_path;

#[derive(Debug, Clone)]
pub enum OutputFormat {
    Table,
    Json,
    Csv,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StatsReport {
    pub total_files: usize,
    pub total_embeddings: usize,
    pub total_patterns: usize,
    pub index_size_bytes: u64,
    pub database_size_bytes: u64,
    pub file_types: HashMap<String, usize>,
}

pub struct StatsCommand {
    project_dir: String,
    detailed: bool,
    output_format: OutputFormat,
}

impl StatsCommand {
    pub fn new(project_dir: &Path, detailed: bool, output_format: OutputFormat) -> Self {
        Self {
            project_dir: project_dir.to_string_lossy().to_string(),
            detailed,
            output_format,
        }
    }

    pub fn execute(&self) -> Result<()> {
        info!("Gathering statistics");

        // Use centralized v2 database
        let db_path = get_database_path()?;
        let store = StoreV2::new(&db_path)
            .context("Failed to open centralized database")?;

        // Get stats from v2 database
        let db_stats = store.get_stats()?;

        // Get database file size
        let database_size_bytes = std::fs::metadata(&db_path)
            .map(|m| m.len())
            .unwrap_or(0);

        // Create report using v2 stats
        let report = StatsReport {
            total_files: db_stats.files_count,
            total_embeddings: db_stats.embeddings_count,
            total_patterns: db_stats.entities_count, // entities are our "patterns" in v2
            index_size_bytes: 0, // v2 doesn't have separate index file
            database_size_bytes,
            file_types: HashMap::new(), // TODO: Calculate actual file types
        };

        // Output report
        match self.output_format {
            OutputFormat::Json => self.output_json(&report)?,
            OutputFormat::Csv => self.output_csv(&report)?,
            OutputFormat::Table => self.output_table(&report)?,
        }

        Ok(())
    }

    fn output_json(&self, report: &StatsReport) -> Result<()> {
        println!("{}", serde_json::to_string_pretty(report)?);
        Ok(())
    }

    fn output_csv(&self, report: &StatsReport) -> Result<()> {
        println!("Metric,Value");
        println!("Total Files,{}", report.total_files);
        println!("Total Embeddings,{}", report.total_embeddings);
        println!("Total Patterns,{}", report.total_patterns);
        println!("Index Size (bytes),{}", report.index_size_bytes);
        println!("Database Size (bytes),{}", report.database_size_bytes);
        Ok(())
    }

    fn output_table(&self, report: &StatsReport) -> Result<()> {
        println!("┌──────────────────────────┬────────────────┐");
        println!("│ Metric                   │ Value          │");
        println!("├──────────────────────────┼────────────────┤");
        println!("│ Total Files              │ {:>14} │", report.total_files);
        println!("│ Total Embeddings         │ {:>14} │", report.total_embeddings);
        println!("│ Total Patterns           │ {:>14} │", report.total_patterns);
        println!("│ Index Size               │ {:>14} │", format_bytes(report.index_size_bytes));
        println!("│ Database Size            │ {:>14} │", format_bytes(report.database_size_bytes));
        
        if self.detailed {
            // Add more detailed statistics
            let avg_emb = if report.total_files > 0 {
                format!("{:.2}", report.total_embeddings as f64 / report.total_files as f64)
            } else {
                "0".to_string()
            };
            println!("│ Avg Embeddings per File  │ {:>14} │", avg_emb);
        }
        
        println!("└──────────────────────────┴────────────────┘");
        Ok(())
    }
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.2} {}", size, UNITS[unit_index])
    }
}
