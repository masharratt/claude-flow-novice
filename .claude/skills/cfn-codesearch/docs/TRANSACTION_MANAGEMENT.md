# Transaction Management in AST-Aware CodeSearch Accelerator

## Overview

This document describes the transaction management improvements implemented to ensure data integrity during multi-step database operations.

## Problem Statement

The original code lacked proper transaction management for:
- Batch entity insertions
- File indexing operations
- Schema migrations
- Multi-table updates

This could lead to:
- Partial updates and data corruption
- Inconsistent database state
- Difficulty recovering from errors

## Solution Architecture

### 1. Transaction-Aware Storage Layer (`store_v2_tx.rs`)

Created a new transaction-aware storage layer that provides:
- Batch operations with automatic transaction wrapping
- Atomic file indexing
- Schema migration support with rollback
- Proper error handling with context

#### Key Features:

```rust
// Batch insert with automatic transaction
let ids = store.insert_entities_batch(&entities)?;

// Atomic file indexing - all or nothing
store.index_file_atomic(file_path, file_hash, |tx| {
    // All operations within this closure are atomic
    // If an error occurs, everything rolls back
    insert_entities(tx)?;
    insert_references(tx)?;
    insert_embeddings(tx)?;
    Ok(())
})?;

// Atomic schema migration
store.migrate_schema_atomic("migration_name", |tx| {
    // Migration logic
    Ok(())
})?;
```

### 2. Enhanced File Indexing (`index_ast.rs`)

Modified the AST indexing process to use transactions:

- All entities, references, and embeddings for a file are inserted atomically
- Previous data for a file is cleared before inserting new data
- File hash tracking ensures incremental indexing works correctly

```rust
// Original approach - vulnerable to partial updates
for entity in entities {
    store.insert_entity(entity)?; // Each call is separate
}

// New approach - atomic
store.index_file_atomic(&file_path, &file_hash, |tx| {
    // All operations in a single transaction
    for entity in entities {
        insert_entity_in_tx(tx, entity)?;
    }
    Ok(())
})?;
```

### 3. Robust Migration System (`migration_tx.rs`)

Implemented a new migration system with:

- Savepoint-based transactions for nested operations
- Batch processing to avoid long-running transactions
- Progress tracking and error reporting
- Automatic rollback on failures
- Migration validation

```rust
// Atomic migration with validation
MigrationWithTx::migrate_v1_to_v2_atomic(&conn)?;
MigrationWithTx::validate_migration(&conn)?;
```

## Implementation Details

### Transaction Patterns

1. **Simple Transaction**
```rust
let tx = conn.transaction()?;
// ... operations ...
tx.commit()?;
```

2. **Savepoint for Nested Operations**
```rust
let sp = conn.savepoint()?;
// ... operations ...
sp.commit()?; // or sp.rollback()?
```

3. **Atomic Operation Pattern**
```rust
fn atomic_operation<F>(&self, f: F) -> Result<()>
where F: FnOnce(&Transaction) -> Result<()>
{
    let tx = self.transaction()?;
    f(&tx)?; // May fail
    tx.commit()?; // Only commits if f succeeds
    Ok(())
}
```

### Error Handling Strategy

1. **Context Preservation**
   - All errors include context about what operation failed
   - Uses `anyhow::Context` for chainable error messages

2. **Automatic Rollback**
   - Dropping a transaction without commit triggers rollback
   - Savepoints can be explicitly rolled back

3. **Batch Processing**
   - Large operations are split into batches
   - Each batch is a separate transaction
   - Partial progress is preserved

### Performance Considerations

1. **Statement Preparation**
   - Prepared statements are reused within transactions
   - Reduces parsing overhead

2. **Batch Size**
   - Configurable batch sizes prevent long-running transactions
   - Default batch size: 1000 for migrations, 100 for file indexing

3. **Connection Pooling**
   - WAL mode enables concurrent readers
   - Memory-mapped I/O for better performance

## Usage Examples

### Indexing a File with Transactions

```rust
let store = StoreV2WithTx::new(&db_path)?;

// All operations for the file are atomic
let result = store.index_file_atomic("src/main.rs", "hash123", |tx| {
    // Clear existing data for this file
    tx.execute("DELETE FROM entities WHERE file_path = ?", ["src/main.rs"])?;

    // Insert new entities
    for entity in entities {
        insert_entity(tx, entity)?;
    }

    // Insert references
    for reference in references {
        insert_reference(tx, reference)?;
    }

    // Update file hash
    tx.execute(
        "INSERT OR REPLACE INTO file_hashes (file_path, file_hash) VALUES (?, ?)",
        ["src/main.rs", "hash123"]
    )?;

    Ok(())
})?;

// If any operation failed, everything rolls back
```

### Migration with Validation

```rust
// Migrate with automatic rollback on errors
match MigrationWithTx::migrate_v1_to_v2_atomic(&conn) {
    Ok(()) => {
        // Validate migration was successful
        MigrationWithTx::validate_migration(&conn)?;
        println!("Migration completed successfully");
    }
    Err(e) => {
        eprintln!("Migration failed: {}", e);
        // Database remains in original state
    }
}
```

## Testing

Comprehensive tests verify:
- Atomic operations rollback on errors
- Transaction isolation works correctly
- Batch operations maintain consistency
- Migration rollback preserves original data
- Concurrent access patterns

Run tests with:
```bash
cargo test transaction
```

## Best Practices

1. **Always use transactions for multi-step operations**
2. **Keep transactions as short as possible**
3. **Use savepoints for nested operations**
4. **Provide meaningful error context**
5. **Validate after complex operations**

## Migration Checklist

When updating existing code to use transactions:

1. Identify multi-step operations
2. Wrap them in transactions or atomic operations
3. Test rollback behavior
4. Add error context
5. Consider batch processing for large operations

## Future Improvements

1. **Distributed Transactions**: Support for multiple database files
2. **Transaction Logging**: Detailed logging of transaction boundaries
3. **Performance Monitoring**: Track transaction durations
4. **Deadlock Detection**: Automatic detection and resolution
5. **Async Support**: Async transaction operations for better concurrency