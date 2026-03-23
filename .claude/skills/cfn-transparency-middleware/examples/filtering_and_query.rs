//! Advanced filtering and querying example
//!
//! This example demonstrates:
//! - Creating complex queries
//! - Time-based filtering
//! - Event type filtering
//! - Custom pattern matching

use anyhow::Result;
use chrono::{Utc, Duration};
use transparency_middleware::{
    TransparencyMiddleware, TransparencyConfig,
    QueryBuilder, EventType
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // Load and customize configuration
    let mut config = TransparencyConfig::load_config("config.json")?;

    // Add custom patterns for this example
    config.exclude_patterns.push("example_secret".to_string());
    config.include_patterns = vec!["important".to_string()];

    let mut middleware = TransparencyMiddleware::new(config);
    middleware.initialize().await?;
    middleware.set_agent_id("filtering-example".to_string());

    // Generate sample data with different timestamps
    let now = Utc::now();
    let one_hour_ago = now - Duration::hours(1);
    let two_hours_ago = now - Duration::hours(2);

    // Simulate different types of events
    println!("Generating sample data...");

    // Important task (should match include pattern)
    middleware.capture_agent_execution(
        "important-agent",
        "Completed important security audit",
        "task-security-001"
    ).await?;

    // Regular task (won't match include pattern)
    middleware.capture_agent_execution(
        "regular-agent",
        "Ran routine maintenance",
        "task-maint-002"
    ).await?;

    // Task with sensitive data
    middleware.capture_agent_execution(
        "data-agent",
        "Processed user data with example_secret=hidden_value",
        "task-data-003"
    ).await?;

    // Query with multiple filters
    println!("\n--- Complex Queries ---");

    // Query by event type
    println!("\n1. Query by event type (AgentExecution):");
    let type_query = QueryBuilder::new()
        .event_type(EventType::AgentExecution)
        .limit(10)
        .build();

    let results = middleware.query(type_query).await?;
    println!("Found {} entries with AgentExecution event type", results.len());

    // Query by agent pattern
    println!("\n2. Query by agent pattern (contains 'important'):");
    let pattern_query = QueryBuilder::new()
        .agent_pattern("important")
        .build();

    let results = middleware.query(pattern_query).await?;
    for entry in results {
        println!("  {}: {}", entry.agent_id, entry.task_id);
    }

    // Query with time range
    println!("\n3. Query entries from last hour:");
    let time_query = QueryBuilder::new()
        .start_timestamp(one_hour_ago.timestamp_millis())
        .end_timestamp(now.timestamp_millis())
        .build();

    let results = middleware.query(time_query).await?;
    println!("Found {} entries in the last hour", results.len());

    // Query with sorting
    println!("\n4. Query with sorting (newest first):");
    let sorted_query = QueryBuilder::new()
        .order_by("timestamp")
        .descending(true)
        .limit(5)
        .build();

    let results = middleware.query(sorted_query).await?;
    for (i, entry) in results.iter().enumerate() {
        println!("  {}. [{}] {} - {}",
            i + 1,
            entry.timestamp,
            entry.agent_id,
            entry.task_id
        );
    }

    // Combined filters
    println!("\n5. Combined filters:");
    let combined_query = QueryBuilder::new()
        .event_type(EventType::AgentExecution)
        .task_pattern("task-")
        .limit(10)
        .build();

    let results = middleware.query(combined_query).await?;
    println!("Found {} entries matching all filters", results.len());

    // Export filtered results
    if !results.is_empty() {
        println!("\nExporting filtered results...");
        middleware.export_data(
            transparency_middleware::ExportFormat::Json,
            "filtered_results.json"
        ).await?;
        println!("Exported to filtered_results.json");
    }

    // Show filtering effects
    println!("\n--- Filtering Effects ---");
    println!("Note: Messages with 'example_secret' should be redacted");
    println!("Note: Only messages matching 'important' pattern should be included");

    middleware.cleanup().await?;
    Ok(())
}