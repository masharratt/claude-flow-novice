use clap::{Parser, Subcommand};
use anyhow::{Result, anyhow};
use tracing::info;
use tracing_subscriber;
use std::path::{Path, PathBuf};

mod embeddings;
mod sqlite_store;
mod search_engine;
mod cli;

use cli::*;

#[derive(Parser)]
#[command(name = "local-ruvector")]
#[command(about = "Local RuVector Accelerator - Fast pattern storage and search", long_about = None)]
#[command(version = "1.0.0")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Project directory (defaults to current)
    #[arg(short, long, default_value = ".")]
    project_dir: String,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize local RuVector in project
    Init {
        /// Force reinitialization
        #[arg(long)]
        force: bool,
    },
    /// Index code files
    Index {
        /// Path to index (defaults to project root)
        #[arg(short, long, default_value = ".")]
        path: String,

        /// File types to index (comma-separated)
        #[arg(short, long, default_value = "rs,py,js,ts,go,java")]
        types: String,

        /// Patterns to focus on (comma-separated)
        #[arg(long)]
        patterns: Option<String>,

        /// Force reindexing all files
        #[arg(long)]
        force: bool,
    },
    /// Query patterns
    Query {
        /// Search query text
        query: String,

        /// Maximum results to return
        #[arg(short, long, default_value = "10")]
        max_results: usize,

        /// Minimum similarity threshold (0.0-1.0)
        #[arg(long, default_value = "0.7")]
        threshold: f32,

        /// Output format
        #[arg(long, value_enum, default_value = "simple")]
        format: QueryOutputFormat,

        /// Number of context lines to show
        #[arg(long, default_value = "3")]
        context: usize,

        /// Filter results by file path
        #[arg(long)]
        file: Option<String>,

        /// Batch query file
        #[arg(long)]
        batch: Option<String>,

        /// Output file for batch results
        #[arg(long)]
        output: Option<String>,
    },
    /// Show statistics
    Stats {
        /// Show detailed statistics
        #[arg(long)]
        detailed: bool,

        /// Output format
        #[arg(long, value_enum, default_value = "table")]
        format: StatsOutputFormat,

        /// Generate analysis report
        #[arg(long, value_enum)]
        analyze: Option<AnalysisType>,

        /// Output file for analysis report
        #[arg(long)]
        report: Option<String>,
    },
    /// Cleanup old data
    Cleanup {
        /// Remove embeddings older than N days
        #[arg(long)]
        older_than: Option<u32>,

        /// Remove orphaned embeddings
        #[arg(long)]
        orphans: bool,

        /// Run vacuum to reclaim space
        #[arg(long)]
        vacuum: bool,

        /// Dry run (don't actually delete)
        #[arg(long)]
        dry_run: bool,

        /// Force cleanup without confirmation
        #[arg(long)]
        force: bool,
    },
    /// Reset all data
    Reset {
        /// Confirm reset operation
        #[arg(long)]
        confirm: bool,
    },
    /// Migrate from other systems
    Migrate {
        /// Source type
        #[arg(value_enum)]
        source: MigrationSource,

        /// Source path
        path: String,

        /// Dry run (don't actually migrate)
        #[arg(long)]
        dry_run: bool,
    },
    /// Export data
    Export {
        /// Export path
        path: String,

        /// Export format
        #[arg(long, value_enum, default_value = "json")]
        format: cli::export::ExportFormat,

        /// Include embedding vectors
        #[arg(long)]
        include_embeddings: bool,
    },
}

#[derive(clap::ValueEnum, Clone)]
enum QueryOutputFormat {
    Simple,
    Json,
    Detailed,
}

#[derive(clap::ValueEnum, Clone)]
enum StatsOutputFormat {
    Table,
    Json,
    Csv,
}

#[derive(clap::ValueEnum, Clone)]
enum AnalysisType {
    Patterns,
    Dependencies,
    Complexity,
    Security,
}

#[derive(clap::ValueEnum, Clone)]
enum MigrationSource {
    Python,
    CodeBERT,
    Whoosh,
    Elastic,
}


fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.verbose { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_env_filter(log_level)
        .with_target(false)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false)
        .compact()
        .init();

    // Validate project directory
    let project_path = Path::new(&cli.project_dir)
        .canonicalize()
        .map_err(|e| anyhow!("Invalid project directory: {}", e))?;

    info!("Local RuVector Accelerator v1.0.0");
    info!("Project: {}", project_path.display());

    // Check if RuVector is initialized for most commands
    let ruvector_dir = project_path.join(".ruvector");

    match cli.command {
        Commands::Init { force } => {
            let cmd = InitCommand::new(&project_path, force);
            cmd.check_environment()?;
            cmd.execute()?;
        }
        Commands::Index { path, types, patterns, force } => {
            if !ruvector_dir.exists() {
                return Err(anyhow!("RuVector not initialized. Run 'init' first."));
            }

            let file_types: Vec<String> = types.split(',').map(|s| s.trim().to_string()).collect();
            let pattern_list: Option<Vec<String>> = patterns
                .map(|p| p.split(',').map(|s| s.trim().to_string()).collect());

            let cmd = IndexCommand::new(
                &project_path,
                Path::new(&path),
                file_types,
                pattern_list,
                force,
            );
            let stats = cmd.execute()?;
            println!("✅ Indexed {} files with {} patterns", stats.files_processed, stats.embeddings_generated);
        }
        Commands::Query {
            query,
            max_results,
            threshold,
            format,
            context,
            file,
            batch,
            output,
        } => {
            if !ruvector_dir.exists() {
                return Err(anyhow!("RuVector not initialized. Run 'init' first."));
            }

            if let Some(batch_file) = batch {
                let cmd = BatchQueryCommand::new(
                    &project_path,
                    Path::new(&batch_file).to_path_buf(),
                    output.map(PathBuf::from),
                    Some(max_results),
                );
                cmd.execute()?;
            } else {
                let output_format = match format {
                    QueryOutputFormat::Simple => cli::query::OutputFormat::Simple,
                    QueryOutputFormat::Json => cli::query::OutputFormat::Json,
                    QueryOutputFormat::Detailed => cli::query::OutputFormat::Detailed,
                };

                let cmd = QueryCommand::new(
                    &project_path,
                    query,
                    Some(max_results),
                    Some(threshold),
                    output_format,
                    context,
                    file,
                );
                cmd.execute()?;
            }
        }
        Commands::Stats {
            detailed,
            format,
            analyze,
            report,
        } => {
            if !ruvector_dir.exists() {
                return Err(anyhow!("RuVector not initialized. Run 'init' first."));
            }

            let output_format = match format {
                StatsOutputFormat::Table => cli::stats::OutputFormat::Table,
                StatsOutputFormat::Json => cli::stats::OutputFormat::Json,
                StatsOutputFormat::Csv => cli::stats::OutputFormat::Csv,
            };

            let cmd = StatsCommand::new(&project_path, detailed, output_format);
            cmd.execute()?;

            // Analysis not implemented yet
            if analyze.is_some() {
                println!("⚠️  Analysis feature not yet implemented");
            }
        }
        Commands::Cleanup {
            older_than,
            orphans,
            vacuum,
            dry_run,
            force,
        } => {
            if !ruvector_dir.exists() {
                return Err(anyhow!("RuVector not initialized. Run 'init' first."));
            }

            let cmd = CleanupCommand::new(
                &project_path,
                dry_run,
                force,
                older_than,
                orphans,
                vacuum,
            );
            cmd.execute()?;
        }
        Commands::Reset { confirm } => {
            // Simple reset implementation
            if !confirm {
                eprintln!("⚠️  This will delete all indexed data!");
                eprintln!("To proceed, run with --confirm");
                return Ok(());
            }
            
            if ruvector_dir.exists() {
                std::fs::remove_dir_all(&ruvector_dir)?;
                println!("✅ Reset complete: removed .ruvector directory");
            } else {
                println!("ℹ️  No RuVector data found to reset");
            }
        }
        Commands::Migrate { source: _, path: _, dry_run: _ } => {
            println!("⚠️  Migration feature not yet implemented");
        }
        Commands::Export { path, format: _, include_embeddings: _ } => {
            if !ruvector_dir.exists() {
                return Err(anyhow!("RuVector not initialized. Run 'init' first."));
            }
            println!("⚠️  Export feature not yet implemented");
            println!("Would export to: {}", path);
        }
    }

    Ok(())
}
