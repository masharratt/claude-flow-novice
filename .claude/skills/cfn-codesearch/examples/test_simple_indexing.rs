// Simple indexing test without full AST extraction
// Tests the basic indexing functionality

use anyhow::Result;
use std::path::Path;
use std::time::Instant;
use tracing_subscriber;

mod embeddings;
mod sqlite_store;
mod search_engine;
mod cli;
mod extractors;
mod schema_v2;
mod migration;
mod store_v2;
mod query_api;

use cli::index::IndexCommand;

fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    println!("Testing basic line-based indexing...");

    let project_path = Path::new(".").canonicalize()?;
    let start_time = Instant::now();

    // Create index command
    let cmd = IndexCommand::new(
        &project_path,
        Path::new(".claude/skills"), // Index just the skills directory
        vec!["rs".to_string()],      // Only Rust files
        None,                        // No specific patterns
        true,                        // force rebuild
    )?;

    // Execute indexing
    let stats = cmd.execute()?;
    let elapsed = start_time.elapsed();

    // Print results
    println!("\n=== Indexing Results ===");
    println!("Files processed: {}", stats.files_processed);
    println!("Embeddings generated: {}", stats.embeddings_generated);
    println!("Index time: {}ms", elapsed.as_millis());

    if !stats.errors.is_empty() {
        println!("\nErrors encountered:");
        for error in stats.errors.iter().take(5) {
            println!("  - {}", error);
        }
        if stats.errors.len() > 5 {
            println!("  ... and {} more errors", stats.errors.len() - 5);
        }
    }

    // Check database size
    let index_path = project_path.join(".ruvector");
    let db_path = index_path.join("index.db");
    if db_path.exists() {
        let db_size = std::fs::metadata(&db_path)?.len();
        println!("\nDatabase size: {} MB", db_size / 1024 / 1024);
    }

    Ok(())
}