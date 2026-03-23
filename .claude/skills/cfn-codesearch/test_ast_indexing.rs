// Test script for AST-based indexing
// Run with: cargo run --bin test_ast_indexing

use anyhow::Result;
use std::path::Path;
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

use cli::index_ast::AstIndexCommand;

fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_target(false)
        .init();

    println!("Testing AST-based indexing...");

    let project_path = Path::new(".").canonicalize()?;

    // Create AST index command
    let mut cmd = AstIndexCommand::new(
        &project_path,
        Path::new("."),
        vec!["rs".to_string(), "ts".to_string()],
        None,
        true, // force rebuild
    )?;

    // Execute indexing
    let stats = cmd.execute()?;

    // Print results
    println!("\n=== AST Indexing Results ===");
    println!("Files processed: {}", stats.files_processed);
    println!("Entities extracted: {}", stats.entities_extracted);
    println!("References extracted: {}", stats.references_extracted);
    println!("Embeddings generated: {}", stats.embeddings_generated);
    println!("Index time: {}ms", stats.index_time_ms);

    if !stats.errors.is_empty() {
        println!("\nErrors encountered:");
        for error in &stats.errors {
            println!("  - {}", error);
        }
    }

    Ok(())
}