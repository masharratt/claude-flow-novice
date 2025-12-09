//! Performance testing example
//!
//! This example demonstrates the middleware's performance characteristics
//! by generating a large volume of test data and measuring various metrics.

use anyhow::Result;
use std::time::Instant;
use transparency_middleware::{
    TransparencyMiddleware, TransparencyConfig,
    QueryBuilder, EventType
};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // Performance-oriented configuration
    let mut config = TransparencyConfig {
        performance_monitoring: true,
        queue_size: 10000,
        flush_interval_ms: 1000,  // Flush more frequently for testing
        message_filtering: false,  // Disable for max performance
        ..TransparencyConfig::default()
    };

    // Use a test database
    config.database_path = "./performance_test.db".into();

    let mut middleware = TransparencyMiddleware::new(config);
    middleware.initialize().await?;
    middleware.set_agent_id("performance-test".to_string());

    println!("=== Transparency Middleware Performance Test ===\n");

    // Test 1: Single write performance
    println!("Test 1: Single write performance");
    let start = Instant::now();

    middleware.capture_agent_execution(
        "test-agent",
        "Single test entry",
        "single-test"
    ).await?;

    let duration = start.elapsed();
    println!("  Single write: {:?}", duration);
    println!("  Throughput: {:.2} writes/sec", 1.0 / duration.as_secs_f64());

    // Test 2: Batch write performance
    println!("\nTest 2: Batch write performance");
    const BATCH_SIZE: usize = 1000;
    let start = Instant::now();

    for i in 0..BATCH_SIZE {
        if i % 100 == 0 {
            print!("\r  Progress: {}/{}", i, BATCH_SIZE);
        }

        middleware.capture_agent_execution(
            &format!("batch-agent-{}", i % 10),
            &format!("Batch entry {}", i),
            &format!("batch-task-{}", i)
        ).await?;
    }

    let batch_duration = start.elapsed();
    println!("\r  Batch complete: {}/{}", BATCH_SIZE, BATCH_SIZE);
    println!("  Total time: {:?}", batch_duration);
    println!("  Average per write: {:?}", batch_duration / BATCH_SIZE as u32);
    println!("  Throughput: {:.2} writes/sec",
             BATCH_SIZE as f64 / batch_duration.as_secs_f64());

    // Test 3: Query performance
    println!("\nTest 3: Query performance");

    // Query all entries
    let start = Instant::now();
    let all_query = QueryBuilder::new().limit(BATCH_SIZE as i64 + 100).build();
    let all_entries = middleware.query(all_query).await?;
    let query_duration = start.elapsed();

    println!("  Queried {} entries in {:?}", all_entries.len(), query_duration);
    println!("  Query rate: {:.2} entries/sec",
             all_entries.len() as f64 / query_duration.as_secs_f64());

    // Query with filters
    let start = Instant::now();
    let filter_query = QueryBuilder::new()
        .agent_id("batch-agent-1")
        .build();
    let filtered_entries = middleware.query(filter_query).await?;
    let filter_duration = start.elapsed();

    println!("  Filtered query returned {} entries in {:?}",
             filtered_entries.len(), filter_duration);

    // Test 4: Export performance
    println!("\nTest 4: Export performance");

    // JSON export
    let start = Instant::now();
    middleware.export_data(
        transparency_middleware::ExportFormat::Json,
        "performance_export.json"
    ).await?;
    let json_export_time = start.elapsed();
    println!("  JSON export: {:?}", json_export_time);

    // CSV export
    let start = Instant::now();
    middleware.export_data(
        transparency_middleware::ExportFormat::Csv,
        "performance_export.csv"
    ).await?;
    let csv_export_time = start.elapsed();
    println!("  CSV export: {:?}", csv_export_time);

    // Test 5: Memory usage and cleanup
    println!("\nTest 5: Metrics and cleanup");
    let metrics = middleware.get_metrics().await?;

    println!("  Total entries stored: {}", metrics.total_entries);
    println!("  Uptime: {} seconds", metrics.uptime_seconds);

    // Calculate memory efficiency (rough estimate)
    let db_size = std::fs::metadata("./performance_test.db")?.len();
    println!("  Database size: {} MB", db_size / 1024 / 1024);
    println!("  Avg size per entry: {} bytes", db_size / metrics.total_entries as u64);

    // Cleanup
    println!("\nCleaning up...");
    middleware.cleanup().await?;

    // Remove test database
    std::fs::remove_file("./performance_test.db")?;
    std::fs::remove_file("performance_export.json")?;
    std::fs::remove_file("performance_export.csv")?;

    println!("Cleanup complete");

    Ok(())
}