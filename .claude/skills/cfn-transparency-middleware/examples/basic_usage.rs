//! Basic usage example for transparency middleware
//!
//! This example demonstrates how to:
//! - Load configuration
//! - Initialize the middleware
//! - Capture agent interactions
//! - Query stored data

use anyhow::Result;
use chrono::Utc;
use serde_json::json;
use transparency_middleware::{
    TransparencyMiddleware, TransparencyConfig,
    MemoryQuery, QueryBuilder, EventType
};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt::init();

    // Load configuration
    let config = TransparencyConfig::load_config("config.json")?;
    println!("Loaded configuration");

    // Create and initialize middleware
    let mut middleware = TransparencyMiddleware::new(config);
    middleware.initialize().await?;
    println!("Middleware initialized");

    // Set agent ID
    middleware.set_agent_id("example-agent-1".to_string());
    println!("Set agent ID");

    // Capture some agent interactions
    println!("\nCapturing interactions...");

    // Capture task execution
    middleware.capture_agent_execution(
        "backend-dev",
        "Successfully implemented authentication module",
        "task-auth-123"
    ).await?;
    println!("Captured task execution");

    // Capture another task with different data
    middleware.capture_agent_execution(
        "database-admin",
        "Created new user table with proper indexes",
        "task-db-456"
    ).await?;
    println!("Captured database task");

    // Get metrics
    let metrics = middleware.get_metrics().await?;
    println!("\nMetrics:");
    println!("  Total entries: {}", metrics.total_entries);
    println!("  Uptime: {} seconds", metrics.uptime_seconds);
    println!("  Current agent: {:?}", metrics.current_agent);

    // Query all entries
    println!("\nQuerying all entries:");
    let all_query = QueryBuilder::new().limit(10).build();
    let all_entries = middleware.query(all_query).await?;

    for entry in all_entries {
        println!(
            "  [{}] {}: {} - {}",
            entry.timestamp,
            entry.agent_id,
            entry.task_id,
            entry.event_type
        );
        if let Some(output) = &entry.output {
            println!("    Output: {}", &output[..output.len().min(50)]);
        }
    }

    // Query specific agent
    println!("\nQuerying entries for backend-dev:");
    let agent_query = QueryBuilder::new()
        .agent_id("backend-dev")
        .build();
    let agent_entries = middleware.query(agent_query).await?;

    for entry in agent_entries {
        println!("  {}: {}", entry.task_id, entry.event_type);
    }

    // Export data to JSON
    println!("\nExporting data to JSON...");
    middleware.export_data(
        transparency_middleware::ExportFormat::Json,
        "example_export.json"
    ).await?;
    println!("Exported to example_export.json");

    // Export data to CSV
    println!("Exporting data to CSV...");
    middleware.export_data(
        transparency_middleware::ExportFormat::Csv,
        "example_export.csv"
    ).await?;
    println!("Exported to example_export.csv");

    // Cleanup
    middleware.cleanup().await?;
    println!("\nCleanup complete");

    Ok(())
}