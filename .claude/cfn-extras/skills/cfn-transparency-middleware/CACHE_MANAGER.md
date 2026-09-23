# Cache Manager Module

## Overview

The `cache_manager.rs` module provides a simple Least Recently Used (LRU) cache implementation for storing and managing agent responses efficiently. This cache helps reduce redundant processing by maintaining frequently accessed data in memory.

## Features

- **LRU Eviction Strategy**: Automatically removes the least recently used items when the cache reaches capacity
- **O(1) Average Time Complexity**: Fast insertions and lookups using HashMap
- **Configurable Capacity**: Set the maximum number of items the cache can hold
- **Thread-Safe**: All operations take `&mut self`, ensuring safe mutable access
- **Zero-Capacity Support**: Handles edge case of zero capacity gracefully

## API

### `new(capacity: usize) -> Self`
Creates a new cache with the specified capacity.

```rust
let mut cache = CacheManager::new(100);
```

### `get(&mut self, key: &str) -> Option<&String>`
Retrieves a value by key and moves it to the most recently used position.

```rust
if let Some(value) = cache.get("agent_1") {
    println!("Found: {}", value);
}
```

### `insert(&mut self, key: String, value: String) -> Option<String>`
Inserts a key-value pair. Returns the old value if the key already existed.

```rust
let old_value = cache.insert("key".to_string(), "value".to_string());
```

### `clear(&mut self)`
Removes all items from the cache.

```rust
cache.clear();
```

### `len(&self) -> usize`
Returns the number of items in the cache.

```rust
println!("Cache size: {}", cache.len());
```

### `is_empty(&self) -> bool`
Returns true if the cache is empty.

```rust
if cache.is_empty() {
    println!("Cache is empty");
}
```

## Implementation Details

The cache uses two data structures:
1. `HashMap<String, String>` - For O(1) key-value lookups
2. `VecDeque<String>` - To track access order for LRU eviction

When an item is accessed (via `get` or `insert`), it's moved to the end of the deque (most recently used). When the cache exceeds capacity, the item at the front of the deque (least recently used) is evicted.

## Usage Example

See `examples/cache_manager_example.rs` for a complete demonstration of the cache in action.

## Testing

The module includes comprehensive tests covering:
- Basic insert/get operations
- LRU eviction behavior
- Edge cases (zero capacity, single item)
- Cache clearing
- Duplicate key handling

Run tests with:
```bash
cargo test cache_manager --lib
```

## Performance Considerations

- **Memory Usage**: Each cached entry stores both the key and value as String types
- **Eviction Overhead**: Uses `retain` to remove keys from order tracking, which is O(n) in worst case
- **Clone Operations**: Returns cloned values to avoid borrowing issues

For production use with high-performance requirements, consider:
1. Using `Arc<str>` or `Cow` for reduced memory overhead
2. Implementing a doubly-linked list for O(1) eviction operations
3. Adding metrics for cache hit/miss ratios