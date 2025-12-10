# Agent Integration Patterns for AST-Aware RuVector

This document describes how agents can integrate with the AST-aware RuVector indexer to achieve sub-50ms query performance for code intelligence tasks.

## Overview

The AST-Aware RuVector Accelerator provides:
- Entity-based indexing (functions, structs, traits, etc.)
- Reference tracking (calls, imports, type usage)
- Vector embeddings for semantic search
- Structured query interface

## Integration Patterns

### 1. Agent Setup

```bash
# Initialize RuVector in the project
./target/release/local-ruvector init

# Index the codebase
./target/release/local-ruvector index --path . --types rs,ts,tsx,js,jsx --force
```

### 2. Query Patterns

#### A. Find Functions Using a Type

```bash
# Find all functions that use the `Album` type
./target/release/local-ruvector find --kind function --uses-type Album

# Example SQL query behind the scenes:
SELECT e.* FROM entities e
JOIN type_usage tu ON e.id = tu.entity_id
WHERE e.kind = 'function' AND tu.type_name = 'Album';
```

#### B. Find Callers of a Function

```bash
# Find all functions that call `create_album`
./target/release/local-ruvector refs --target create_album --kind calls

# Exclude calls within the same module
./target/release/local-ruvector refs --target create_album --kind calls --exclude-module src/album/

# Example SQL query:
SELECT r.* FROM refs r
JOIN entities e ON r.target_entity_id = e.id
WHERE e.name = 'create_album' AND r.ref_kind = 'call'
  AND r.file_path NOT LIKE '%src/album/%';
```

#### C. Refactoring Workflow

```bash
# Step 1: Find all references to a function
./target/release/local-ruvector refs --target function_name

# Step 2: Find all implementations of a trait
./target/release/local-ruvector find --kind impl --implements Trait

# Step 3: Find types used in a module
./target/release/local-ruvector find --file-path src/module/ --kind struct

# Step 4: Verify no breaks after refactoring
./target/release/local-ruvector query "broken reference error" --threshold 0.9
```

### 3. Programmatic Integration

Agents can integrate using the Rust API directly:

```rust
use local_ruvector::store_v2::StoreV2;
use local_ruvector::query_api::QueryEngine;

let store = StoreV2::new(&db_path)?;
let query_engine = QueryEngine::new(store);

// Find functions using a type
let functions = query_engine.find_functions_using_type("Album")?;

// Find callers of a function
let callers = query_engine.find_callers("create_album", Some("src/other/"))?;

// Search by semantic similarity
let results = query_engine.semantic_search("database transaction", 10)?;
```

### 4. Performance Optimization Tips

#### A. Use Database Indexes
The schema includes optimized indexes:
- `idx_entities_kind_name` for fast entity lookups
- `idx_type_usage_type_name` for type usage queries
- `idx_refs_target_kind` for reference queries

#### B. Batch Operations
```rust
// Batch insert entities
let entities: Vec<Entity> = vec![...];
store.insert_entities_batch(entities)?;

// Batch query multiple entities
let ids = vec![1, 2, 3, 4, 5];
let entities = store.get_entity_batch(&ids)?;
```

#### C. Query Result Caching
```rust
use std::time::Duration;
use cached::proc_macro::cached;

#[cached(size = 1000, time = 300)]
pub fn find_functions_using_type(type_name: &str) -> Result<Vec<Entity>> {
    // Query implementation
}
```

## Agent Workflow Examples

### 1. Code Review Agent

```rust
pub async fn review_pull_request(pr_id: i32) -> Result<ReviewResult> {
    // 1. Get changed files
    let changed_files = get_pr_files(pr_id).await?;

    // 2. Query for potentially problematic patterns
    let issues = query_engine.search_patterns([
        "TODO:",
        "FIXME:",
        "unwrap()",
        "panic!",
        "expect(",
    ])?;

    // 3. Check for breaking changes
    let public_api_changes = query_engine.find_public_api_changes(&changed_files)?;

    // 4. Verify imports are correct
    let unused_imports = query_engine.find_unused_imports(&changed_files)?;

    Ok(ReviewResult { issues, public_api_changes, unused_imports })
}
```

### 2. Refactoring Agent

```rust
pub async fn extract_function(
    file_path: &str,
    start_line: usize,
    end_line: usize,
    function_name: &str,
) -> Result<RefactorResult> {
    // 1. Analyze the selected code
    let entities = query_engine.find_entities_in_range(file_path, start_line, end_line)?;

    // 2. Find all external dependencies
    let dependencies = query_engine.find_dependencies(&entities)?;

    // 3. Check if extraction is safe
    let safe_to_extract = query_engine.verify_extraction_safety(&entities)?;

    if safe_to_extract {
        // 4. Perform refactoring
        let new_content = extract_function_to_module(file_path, start_line, end_line, function_name)?;

        // 5. Update imports in dependent files
        for dep in dependencies {
            update_imports(&dep.file_path, function_name)?;
        }

        Ok(RefactorResult::Success)
    } else {
        Ok(RefactorResult::Unsafe)
    }
}
```

### 3. Documentation Agent

```rust
pub async fn generate_documentation(entity_name: &str) -> Result<Documentation> {
    // 1. Find the entity
    let entity = query_engine.find_entity_by_name(entity_name)?;

    // 2. Get all related documentation
    let related_docs = query_engine.find_related_documentation(&entity)?;

    // 3. Find usage examples
    let examples = query_engine.find_usage_examples(&entity)?;

    // 4. Check for undocumented public APIs
    if entity.visibility == Visibility::Public && entity.doc_comment.is_none() {
        return Err(anyhow!("Public entity lacks documentation"));
    }

    // 5. Generate comprehensive docs
    Ok(Documentation {
        entity,
        related_docs,
        examples,
    })
}
```

## Performance Benchmarks

Based on the current implementation:

- **Index Size**: 175MB for 31 Rust files with 5,897 embeddings
- **Index Time**: ~90 seconds for full reindex
- **Query Performance**: Target <50ms for indexed queries
- **Entity Coverage**: Functions, structs, traits, impls, enums

## Future Enhancements

1. **Incremental Updates**: Only reindex changed files
2. **Cross-Language Support**: TypeScript, JavaScript support
3. **Enhanced Query API**: More complex query builders
4. **Integration with LLMs**: Use embeddings for AI-assisted coding
5. **Real-time Updates**: File watching for automatic reindexing

## Troubleshooting

### Common Issues

1. **Compilation Errors**: Ensure tree-sitter parsers are properly linked
2. **Database Locks**: Use WAL mode for concurrent access
3. **Memory Usage**: Limit batch sizes for large codebases
4. **Slow Queries**: Check EXPLAIN QUERY PLAN and add indexes

### Debug Commands

```bash
# Check database health
./target/release/local-ruvector stats --detailed

# Rebuild index
./target/release/local-ruvector index --force

# Query optimization
sqlite3 .ruvector/index.db "EXPLAIN QUERY PLAN SELECT ..."

# Check embeddings
./target/release/local-ruvector query "test query" --format json
```

## Conclusion

The AST-Aware RuVector Accelerator provides a powerful foundation for agent-driven code intelligence. By leveraging entity-based indexing and structured queries, agents can achieve sub-50ms response times for complex code analysis tasks.