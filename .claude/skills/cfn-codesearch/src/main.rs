use clap::{Parser, Subcommand};
use anyhow::{Result, anyhow};
use tracing::info;
use tracing_subscriber;
use std::path::{Path, PathBuf};

mod embeddings;
mod sqlite_store;
mod search_engine;
mod cli;
mod extractors;
mod paths;
mod path_validator;
mod schema_v2;
mod migration;
mod migration_tx;
mod migration_v2;
mod store_v2;
mod store_v2_tx;
mod query_api;
mod query_v2;
mod store_qdrant;
mod store_memgraph;
mod unified_query;

#[cfg(test)]
mod transaction_tests;

use cli::*;

/// Default PostgreSQL connection for pgvector
const DEFAULT_PG_URL: &str = "postgresql://postgres:postgres@localhost:5433/daily_platform";

#[derive(Parser)]
#[command(name = "codesearch")]
#[command(about = "CodeSearch - Fast semantic code search with pgvector", long_about = None)]
#[command(version = "0.2.0")]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Project directory (defaults to current)
    #[arg(short, long, default_value = ".")]
    project_dir: String,

    /// PostgreSQL connection string
    #[arg(long, env = "CODESEARCH_PG_URL", default_value = DEFAULT_PG_URL)]
    pg_url: String,

    /// Qdrant connection URL
    #[arg(long, env = "CODESEARCH_QDRANT_URL", default_value = "http://localhost:6334")]
    qdrant_url: String,

    /// Memgraph connection URL
    #[arg(long, env = "CODESEARCH_MEMGRAPH_URL", default_value = "bolt://localhost:7687")]
    memgraph_url: String,

    /// Memgraph username
    #[arg(long, env = "CODESEARCH_MEMGRAPH_USER", default_value = "")]
    memgraph_user: String,

    /// Memgraph password
    #[arg(long, env = "CODESEARCH_MEMGRAPH_PASSWORD", default_value = "")]
    memgraph_password: String,

    /// Skip Qdrant integration
    #[arg(long)]
    skip_qdrant: bool,

    /// Skip Memgraph integration
    #[arg(long)]
    skip_memgraph: bool,

    /// Use OpenAI API for embeddings instead of local fastembed (requires OPENAI_API_KEY)
    #[arg(long, env = "CODESEARCH_USE_OPENAI")]
    use_openai: bool,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize local CodeSearch in project
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
    /// Find entities using structured queries
    Find {
        #[command(flatten)]
        args: cli::find::FindCommand,
    },
    /// Find references to an entity
    Refs {
        #[command(flatten)]
        args: cli::refs::RefsCommand,
    },
    /// Analyze impact of changing an entity
    Impact {
        /// Entity name to analyze
        entity_name: String,

        /// Maximum traversal depth
        #[arg(long, default_value = "5")]
        max_depth: u32,

        /// Output format
        #[arg(long, value_enum, default_value = "simple")]
        format: QueryOutputFormat,
    },
    /// Graph dependency queries
    Graph {
        #[command(subcommand)]
        subcommand: GraphSubcommand,
    },
}

#[derive(Subcommand)]
enum GraphSubcommand {
    /// Find what depends on an entity
    Dependents {
        /// Entity name
        name: String,
        /// Max traversal depth
        #[arg(long, default_value = "3")]
        max_depth: u32,
    },
    /// Find what an entity depends on
    Deps {
        /// Entity name
        name: String,
    },
    /// Show cross-project dependencies
    CrossProject {
        /// Project root path (defaults to current project)
        project: Option<String>,
    },
    /// Show graph statistics
    Stats {
        /// Specific project to show stats for
        project: Option<String>,
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

    info!("Local CodeSearch Accelerator v1.0.0");
    info!("Project: {}", project_path.display());

    // Check if CodeSearch is initialized for most commands
    let codesearch_dir = project_path.join(".codesearch");

    match cli.command {
        Commands::Init { force } => {
            let cmd = InitCommand::new(&project_path, force);
            cmd.check_environment()?;
            cmd.execute()?;
        }
        Commands::Index { path, types, patterns, force } => {
            // Auto-initialize CodeSearch if not already initialized
            let db_path = codesearch::paths::get_database_path()?;
            if !db_path.exists() {
                info!("CodeSearch not initialized, auto-initializing...");
                let init_cmd = InitCommand::new(&project_path, false);
                init_cmd.check_environment()?;
                init_cmd.execute()?;
                info!("✅ CodeSearch auto-initialized");
            }

            let file_types: Vec<String> = types.split(',').map(|s| s.trim().to_string()).collect();
            let pattern_list: Option<Vec<String>> = patterns
                .map(|p| p.split(',').map(|s| s.trim().to_string()).collect());

            let qdrant_url = if cli.skip_qdrant { None } else { Some(cli.qdrant_url.as_str()) };
            let memgraph_url = if cli.skip_memgraph { None } else { Some(cli.memgraph_url.as_str()) };

            let mut cmd = IndexCommand::new(
                &project_path,
                Path::new(&path),
                file_types,
                pattern_list,
                force,
                Some(&cli.pg_url),
                qdrant_url,
                memgraph_url,
                if cli.skip_memgraph { None } else { Some(cli.memgraph_user.as_str()) },
                if cli.skip_memgraph { None } else { Some(cli.memgraph_password.as_str()) },
                cli.use_openai,
            )?;
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
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
            }

            if let Some(batch_file) = batch {
                let cmd = BatchQueryCommand::new(
                    &project_path,
                    Path::new(&batch_file).to_path_buf(),
                    output.map(PathBuf::from),
                    Some(max_results),
                )?;
                cmd.execute()?;
            } else {
                let output_format = match format {
                    QueryOutputFormat::Simple => cli::query::OutputFormat::Simple,
                    QueryOutputFormat::Json => cli::query::OutputFormat::Json,
                    QueryOutputFormat::Detailed => cli::query::OutputFormat::Detailed,
                };

                let qdrant_url = if cli.skip_qdrant { None } else { Some(cli.qdrant_url.as_str()) };
                let cmd = QueryCommand::new(
                    &project_path,
                    query,
                    Some(max_results),
                    Some(threshold),
                    output_format,
                    context,
                    file,
                    Some(&cli.pg_url),
                    qdrant_url,
                    cli.use_openai,
                )?;
                cmd.execute()?;
            }
        }
        Commands::Stats {
            detailed,
            format,
            analyze,
            report,
        } => {
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
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
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
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
            
            if codesearch_dir.exists() {
                std::fs::remove_dir_all(&codesearch_dir)?;
                println!("✅ Reset complete: removed .codesearch directory");
            } else {
                println!("ℹ️  No CodeSearch data found to reset");
            }
        }
        Commands::Migrate { source: _, path: _, dry_run: _ } => {
            println!("⚠️  Migration feature not yet implemented");
        }
        Commands::Export { path, format: _, include_embeddings: _ } => {
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
            }
            println!("⚠️  Export feature not yet implemented");
            println!("Would export to: {}", path);
        }
        Commands::Find { args } => {
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
            }
            args.execute(&project_path)?;
        }
        Commands::Refs { args } => {
            // Check centralized database exists (not local .codesearch dir)
            let db_path = paths::get_database_path()?;
            if !db_path.exists() {
                return Err(anyhow!("CodeSearch database not found. Run 'init' and 'index' first."));
            }
            args.execute(&project_path)?;
        }
        Commands::Impact { entity_name, max_depth, format: _ } => {
            if cli.skip_memgraph {
                return Err(anyhow!("Impact analysis requires Memgraph. Remove --skip-memgraph."));
            }
            let rt = tokio::runtime::Runtime::new()?;
            let memgraph = rt.block_on(
                store_memgraph::MemgraphStore::new(&cli.memgraph_url, &cli.memgraph_user, &cli.memgraph_password)
            )?;

            let project_root_str = project_path.to_string_lossy().to_string();
            let results = rt.block_on(memgraph.find_dependents(
                &entity_name,
                Some(&project_root_str),
                max_depth,
            ))?;

            if results.is_empty() {
                println!("No dependents found for '{}'", entity_name);
            } else {
                println!("Impact analysis for '{}' ({} dependents):", entity_name, results.len());
                for r in &results {
                    println!("  [depth {}] {} {} in {} ({})",
                        r.depth, r.entity_kind, r.entity_name, r.file_path, r.relationship);
                }
            }
        }
        Commands::Graph { subcommand } => {
            if cli.skip_memgraph {
                return Err(anyhow!("Graph commands require Memgraph. Remove --skip-memgraph."));
            }
            let rt = tokio::runtime::Runtime::new()?;
            let memgraph = rt.block_on(
                store_memgraph::MemgraphStore::new(&cli.memgraph_url, &cli.memgraph_user, &cli.memgraph_password)
            )?;

            let project_root_str = project_path.to_string_lossy().to_string();

            match subcommand {
                GraphSubcommand::Dependents { name, max_depth } => {
                    let results = rt.block_on(memgraph.find_dependents(
                        &name, Some(&project_root_str), max_depth,
                    ))?;
                    if results.is_empty() {
                        println!("No dependents found for '{}'", name);
                    } else {
                        println!("Dependents of '{}' ({}):", name, results.len());
                        for r in &results {
                            println!("  {} {} in {}:{} [{}]",
                                r.entity_kind, r.entity_name, r.file_path, r.depth, r.relationship);
                        }
                    }
                }
                GraphSubcommand::Deps { name } => {
                    // Forward traversal: what does this entity depend on?
                    let results = rt.block_on(memgraph.find_impact(
                        &name, None, Some(&project_root_str),
                    ))?;
                    if results.is_empty() {
                        println!("No dependencies found for '{}'", name);
                    } else {
                        println!("Dependencies of '{}' ({}):", name, results.len());
                        for r in &results {
                            println!("  {} {} in {} [{}]",
                                r.entity_kind, r.entity_name, r.file_path, r.relationship);
                        }
                    }
                }
                GraphSubcommand::CrossProject { project } => {
                    let pr = project.as_deref().unwrap_or(&project_root_str);
                    let results = rt.block_on(memgraph.find_cross_project_deps(pr))?;
                    if results.is_empty() {
                        println!("No cross-project dependencies found");
                    } else {
                        println!("Cross-project dependencies ({}):", results.len());
                        for r in &results {
                            println!("  {} ({}) -> {} ({}) [{}]",
                                r.source_entity, r.source_project,
                                r.target_entity, r.target_project,
                                r.relationship);
                        }
                    }
                }
                GraphSubcommand::Stats { project } => {
                    let pr = project.as_deref();
                    let stats = rt.block_on(memgraph.get_stats(pr))?;
                    println!("Graph statistics:");
                    println!("  Entities: {}", stats.entity_count);
                    println!("  Files: {}", stats.file_count);
                    println!("  Relationships: {}", stats.relationship_count);
                }
            }
        }
    }

    Ok(())
}
