//! Transparency Middleware CLI
//!
//! Command-line interface for the transparency middleware system.
//! Provides commands for initialization, configuration, and data management.

use anyhow::Result;
use clap::{Parser, Subcommand};
use serde_json;
use std::path::PathBuf;
use tracing::info;

// Re-export from lib
use transparency_middleware::{TransparencyMiddleware, TransparencyConfig, ExportFormat};

#[derive(Parser)]
#[command(name = "transparency-middleware")]
#[command(about = "Agent interaction capture and analysis middleware")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Configuration file path
    #[arg(short, long, default_value = "config.json")]
    config: PathBuf,

    /// Enable verbose logging
    #[arg(short, long)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize the middleware system
    Init {
        /// Database path
        #[arg(short, long)]
        database: Option<PathBuf>,
        
        /// Transparency level
        #[arg(short, long, default_value = "detailed")]
        level: String,
    },
    /// Start monitoring agent interactions
    Start {
        /// Agent ID to monitor
        #[arg(short, long)]
        agent_id: String,
        
        /// Task ID for tracking
        #[arg(short, long)]
        task_id: String,
    },
    /// Query stored interactions
    Query {
        /// Agent ID filter
        #[arg(short, long)]
        agent_id: Option<String>,
        
        /// Task ID filter
        #[arg(short, long)]
        task_id: Option<String>,
        
        /// Limit results
        #[arg(short, long, default_value = "100")]
        limit: u32,
    },
    /// Export data to file
    Export {
        /// Output file path
        #[arg(short, long)]
        output: PathBuf,
        
        /// Export format
        #[arg(short, long, default_value = "json")]
        format: String,
    },
    /// Get system metrics
    Metrics,
    /// Cleanup resources
    Cleanup,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let log_level = if cli.verbose { "debug" } else { "info" };
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Load or create configuration
    let mut config = if cli.config.exists() {
        match TransparencyMiddleware::load_config(&cli.config) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to load config, using defaults: {}", e);
                TransparencyConfig::default()
            }
        }
    } else {
        println!("Config file not found, using defaults");
        TransparencyConfig::default()
    };

    match cli.command {
        Commands::Init { database, level } => {
            if let Some(db_path) = database {
                config.database_path = db_path;
            }
            
            // Parse transparency level
            config.transparency_level = match level.to_lowercase().as_str() {
                "minimal" => transparency_middleware::TransparencyLevel::Minimal,
                "verbose" => transparency_middleware::TransparencyLevel::Verbose,
                "debug" => transparency_middleware::TransparencyLevel::Debug,
                _ => transparency_middleware::TransparencyLevel::Detailed,
            };

            let mut middleware = TransparencyMiddleware::new(config);
            middleware.initialize().await?;
            
            info!("Middleware initialized successfully");
            
            // Save config
            let config_json = serde_json::to_string_pretty(&middleware.config)?;
            std::fs::write(&cli.config, config_json)?;
            info!("Configuration saved to {:?}", cli.config);
            
            middleware.cleanup().await?;
        }
        
        Commands::Start { agent_id, task_id } => {
            let mut middleware = TransparencyMiddleware::new(config);
            middleware.initialize().await?;
            middleware.set_agent_id(agent_id.clone());
            
            info!("Starting monitoring for agent: {} (task: {})", agent_id, task_id);
            
            // Example capture
            middleware.capture_agent_execution(
                &agent_id,
                "Agent started monitoring",
                &task_id,
            ).await?;
            
            middleware.cleanup().await?;
        }
        
        Commands::Query { agent_id, task_id, limit } => {
            let middleware = TransparencyMiddleware::new(config);
            // Note: This would need to be implemented in the middleware
            // For now, just showing the query parameters
            info!("Querying with filters:");
            if let Some(id) = agent_id {
                info!("  Agent ID: {}", id);
            }
            if let Some(id) = task_id {
                info!("  Task ID: {}", id);
            }
            info!("  Limit: {}", limit);
        }
        
        Commands::Export { output, format } => {
            let export_format = match format.to_lowercase().as_str() {
                "csv" => ExportFormat::Csv,
                "xml" => ExportFormat::Xml,
                "yaml" => ExportFormat::Yaml,
                _ => ExportFormat::Json,
            };
            
            let mut middleware = TransparencyMiddleware::new(config);
            middleware.initialize().await?;
            
            middleware.export_data(export_format, output.to_str().unwrap()).await?;
            info!("Data exported successfully");
            
            middleware.cleanup().await?;
        }
        
        Commands::Metrics => {
            let mut middleware = TransparencyMiddleware::new(config);
            middleware.initialize().await?;
            
            let metrics = middleware.get_metrics().await?;
            info!("Metrics:");
            info!("  Total entries: {}", metrics.total_entries);
            info!("  Uptime: {} seconds", metrics.uptime_seconds);
            info!("  Initialized: {}", metrics.is_initialized);
            
            middleware.cleanup().await?;
        }
        
        Commands::Cleanup => {
            let mut middleware = TransparencyMiddleware::new(config);
            middleware.initialize().await?;
            middleware.cleanup().await?;
            info!("Cleanup completed");
        }
    }

    Ok(())
}
