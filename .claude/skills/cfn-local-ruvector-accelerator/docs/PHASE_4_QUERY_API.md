# Phase 4: Agent Query API Implementation

## Overview

Phase 4 of the AST-Aware RuVector Accelerator implements a high-level query interface for agent use cases, replacing complex grep patterns with structured SQL queries. The implementation provides fast (<50ms) queries on 10k+ entity indexes with support for both Rust and TypeScript codebases.

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

#### `ruvector find` Command
Structured search with multiple filter options:

```bash
# Find functions using a type
ruvector find --uses-type Album

# Find callers of a function, excluding certain module
ruvector find --called-by create_album --exclude tests

# Find types from a file used elsewhere
ruvector find --types-from src/models.rs

# Find implementations of a trait
ruvector find --implements Display

# Find public API of a module
ruvector find --public-api auth

# Filter by entity kind
ruvector find --uses-type String --kind function

# Output in different formats
ruvector find --uses-type Album --format json
ruvector find --uses-type Album --format csv --output results.csv
```

#### `ruvector refs` Command
Find all references to an entity:

```bash
# Simple reference search
ruvector refs create_album

# With specific entity kind
ruvector refs Album --kind struct

# Group results by file
ruvector refs Album --group-by-file

# Tree format for visual hierarchy
ruvector refs Album --format tree

# Filter to specific file
ruvector refs Album --file src/main.rs

# Inbound/outbound reference filtering
ruvector refs create_album --inbound
ruvector refs create_album --outbound
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
ruvector refs old_function_name --format tree

# Check all uses of a type before major changes
ruvector find --uses-type MyStruct --format detailed
```

### Code Analysis

Understand codebase structure and dependencies:

```bash
# Public API surface
ruvector find --public-api . --format json

# Type usage statistics
ruvector find --types-from src/lib.rs --format detailed
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
2. **No results**: Verify entities are indexed with `ruvector stats`
3. **JSON errors**: Ensure entity names are properly quoted

### Debug Queries

Enable debug logging to see actual SQL queries:

```bash
RUST_LOG=debug ruvector find --uses-type Album
```