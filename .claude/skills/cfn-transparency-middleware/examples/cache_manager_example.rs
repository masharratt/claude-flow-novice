// Example demonstrating the LRU Cache Manager usage

use transparency_middleware::cache_manager::CacheManager;

fn main() {
    // Create a new cache with capacity of 3 items
    let mut cache = CacheManager::new(3);

    println!("=== LRU Cache Manager Example ===\n");

    // Insert some agent responses
    println!("Inserting 3 agent responses...");
    cache.insert("agent_1".to_string(), "Response from agent 1: Task completed successfully".to_string());
    cache.insert("agent_2".to_string(), "Response from agent 2: Found 5 issues in the code".to_string());
    cache.insert("agent_3".to_string(), "Response from agent 3: All tests passing".to_string());

    println!("Cache length: {}", cache.len());
    println!("Cache empty: {}\n", cache.is_empty());

    // Retrieve responses
    println!("Retrieving responses:");
    if let Some(response) = cache.get("agent_1") {
        println!("  agent_1: {}", response);
    }
    if let Some(response) = cache.get("agent_2") {
        println!("  agent_2: {}", response);
    }

    // Insert a fourth item (should evict the least recently used)
    println!("\nInserting 4th response (should evict agent_3)...");
    cache.insert("agent_4".to_string(), "Response from agent 4: Security scan complete".to_string());

    println!("Cache length: {}", cache.len());

    // Check what's in the cache
    println!("\nChecking cache contents:");
    let agents = ["agent_1", "agent_2", "agent_3", "agent_4"];
    for agent in &agents {
        match cache.get(agent) {
            Some(response) => println!("  ✓ {}: {}", agent, response),
            None => println!("  ✗ {}: Not found (evicted)", agent),
        }
    }

    // Demonstrate updating an existing entry
    println!("\nUpdating agent_1 response...");
    let old_value = cache.insert("agent_1".to_string(), "Updated response: Task completed with optimizations".to_string());

    if let Some(old) = old_value {
        println!("Old value: {}", old);
    }

    if let Some(response) = cache.get("agent_1") {
        println!("New value: {}", response);
    }

    // Clear the cache
    println!("\nClearing cache...");
    cache.clear();
    println!("Cache length: {}", cache.len());
    println!("Cache empty: {}", cache.is_empty());
}