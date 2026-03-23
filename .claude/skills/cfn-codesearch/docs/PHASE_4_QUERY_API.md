# Phase 4: Agent Query API Implementation

## Overview

Phase 4 of the AST-Aware CodeSearch Accelerator implements a high-level query interface for agent use cases, replacing complex grep patterns with structured SQL queries. The implementation provides fast (<50ms) queries on 10k+ entity indexes with support for both Rust and TypeScript codebases.

## Features Implemented

### 1. Query API (`src/query_api.rs`)

The QueryApi struct provides six core query methods:

- **`find_functions_using_type(type_name)`**: Find all functions that use a specific type
- **`find_callers_of_function(function_name, exclude_module)`**: Find all callers of a function
- **`find_types_used_elsewhere(file_path)`**: Find types defined in a file that are used elsewhere
- **`find_implementations(trait_name)`**: Find all implementations of a trait/interface
- **`find_public_api(module_path)`**: Get the public API surface of a module
- **`find_references_to_path(path)`**: Find all references to a path for refactoring

### 2. CLI Commands

#### `codesearch find` Command
Structured search with multiple filter options:

```bash
# Find functions using a type
codesearch find --uses-type Album

# Find callers of a function, excluding certain module
codesearch find --called-by create_album --exclude tests

# Find types from a file used elsewhere
codesearch find --types-from src/models.rs

# Find implementations of a trait
codesearch find --implements Display

# Find public API of a module
codesearch find --public-api auth

# Filter by entity kind
codesearch find --uses-type String --kind function

# Output in different formats
codesearch find --uses-type Album --format json
codesearch find --uses-type Album --format csv --output results.csv
```

#### `codesearch refs` Command
Find all references to an entity:

```bash
# Simple reference search
codesearch refs create_album

# With specific entity kind
codesearch refs Album --kind struct

# Group results by file
codesearch refs Album --group-by-file

# Tree format for visual hierarchy
codesearch refs Album --format tree

# Filter to specific file
codesearch refs Album --file src/main.rs

# Inbound/outbound reference filtering
codesearch refs create_album --inbound
codesearch refs create_album --outbound
```

### 3. Performance Optimizations

- Database indexes optimized for common query patterns
- Composite indexes for entity+kind, file+kind, and type+usage patterns
- Query result caching in SQLite WAL mode
- Memory-mapped I/O for large databases (256MB default)

### 4. Output Formats

All queries support multiple output formats:

- **Simple**: One line per result (default)
- **Detailed**: Full entity information with context
- **JSON**: Machine-readable format for agents
- **CSV**: Spreadsheet-friendly format
- **Tree**: Hierarchical view for references

## Usage Examples

### Agent Integration

The query API is designed for easy integration with AI agents:

```rust
use crate::query_api::QueryApi;
use crate::store_v2::StoreV2;

let store = StoreV2::new(&db_path)?;
let query_api = QueryApi::new(store);

// Find all functions using the Album type
let results = query_api.find_functions_using_type("Album")?;

// JSON output for agent consumption
let json_output = results.format_json()?;
```

### Refactoring Support

The references query enables safe refactoring:

```bash
# Before renaming a function
codesearch refs old_function_name --format tree

# Check all uses of a type before major changes
codesearch find --uses-type MyStruct --format detailed
```

### Code Analysis

Understand codebase structure and dependencies:

```bash
# Public API surface
codesearch find --public-api . --format json

# Type usage statistics
codesearch find --types-from src/lib.rs --format detailed
```

## Database Schema

The query API uses the v2 schema with optimized tables:

- `entities`: Core entity definitions (functions, types, etc.)
- `refs`: Cross-references between entities
- `type_usage`: Type usage tracking for dependency analysis
- `entity_embeddings`: Vector embeddings for semantic search

## Performance Metrics

Target performance for all queries:
- **< 50ms** for databases with 10,000+ entities
- **< 200ms** for databases with 100,000+ entities
- **Concurrent query support** through SQLite connection pooling

## Testing

Run the test suite:

```bash
# Basic functionality test
./test_query_api.sh

# Performance benchmarks
cargo test --release query_performance

# Integration tests
cargo test query_api_integration
```

## Future Enhancements

Planned improvements for Sprint 4-2:

1. **Natural Language Query Parsing**
   - Parse "find all functions that return Result"
   - Support "show me callers of main in tests only"

2. **Advanced Filters**
   - Filter by visibility (pub, pub(crate), private)
   - Filter by attributes (#[test], #[async_trait])
   - Date range filters for recently changed code

3. **Query Composition**
   - Chain multiple queries
   - Set operations (union, intersection, difference)

4. **Performance Optimizations**
   - Query result pagination
   - Incremental result streaming
   - Parallel query execution

## Integration with CFN Agents

The query API is designed to work seamlessly with CFN agents:

- Agents can query code structure without parsing files
- Fast lookups enable real-time code analysis
- JSON output format easy for agent consumption
- Structured queries replace brittle grep patterns

## Troubleshooting

### Common Issues

1. **Slow queries**: Check database indexes with `EXPLAIN QUERY PLAN`
2. **No results**: Verify entities are indexed with `codesearch stats`
3. **JSON errors**: Ensure entity names are properly quoted

### Debug Queries

Enable debug logging to see actual SQL queries:

```bash
RUST_LOG=debug codesearch find --uses-type Album
```