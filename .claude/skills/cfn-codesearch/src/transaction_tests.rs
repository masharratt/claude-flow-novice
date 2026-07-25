// Comprehensive tests for transaction behavior
use anyhow::Result;
use tempfile::tempdir;
use rusqlite::{Connection, params};
use std::path::Path;

use crate::store_v2_tx::StoreV2WithTx;
use crate::schema_v2::{SchemaV2, EntityKind, Visibility};
use crate::store_v2::{Entity, Reference, TypeUsage};

/// Test atomic file indexing with transaction rollback on error
#[test]
fn test_atomic_file_indexing_with_rollback() -> Result<()> {
    let dir = tempdir()?;
    let db_path = dir.path().join("test_atomic.db");
    let conn = Connection::open(&db_path)?;

    // Initialize schema
    SchemaV2::initialize(&conn)?;

    // Create file hashes table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS file_hashes (
            file_path TEXT PRIMARY KEY,
            file_hash TEXT NOT NULL,
            indexed_at INTEGER NOT NULL
        )",
        [],
    )?;

    let store = StoreV2WithTx::new(&db_path)?;

    // Insert initial entity
    let initial_entity = Entity {
        id: 0,
        kind: EntityKind::Function,
        name: "initial_function".to_string(),
        signature: Some("fn initial() -> Result<()>".to_string()),
        visibility: Visibility::Public,
        parent_id: None,
        file_path: "/test.rs".to_string(),
        line_number: 10,
        column_number: Some(0),
        doc_comment: None,
        attributes: None,
        metadata: None,
        project_root: "/test/project".to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    let initial_id = store.insert_entity(&initial_entity)?;
    assert!(initial_id > 0);

    // Test atomic file indexing with successful operation
    let result = store.index_file_atomic("/test.rs", "hash1", |tx| {
        // Insert entities
        let entity1 = Entity {
            id: 0,
            kind: EntityKind::Function,
            name: "test_function_1".to_string(),
            signature: Some("fn test1() -> Result<()>".to_string()),
            visibility: Visibility::Public,
            parent_id: None,
            file_path: "/test.rs".to_string(),
            line_number: 1,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            project_root: "/test/project".to_string(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let entity2 = Entity {
            id: 0,
            kind: EntityKind::Function,
            name: "test_function_2".to_string(),
            signature: Some("fn test2() -> Result<()>".to_string()),
            visibility: Visibility::Public,
            parent_id: None,
            file_path: "/test.rs".to_string(),
            line_number: 2,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            project_root: "/test/project".to_string(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        let mut stmt = tx.prepare(
            r#"
            INSERT INTO entities (
                kind, name, signature, visibility, parent_id, file_path,
                line_number, column_number, doc_comment, attributes, metadata, project_root
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#
        )?;

        stmt.execute(params![
            entity1.kind.as_str(),
            entity1.name,
            entity1.signature,
            entity1.visibility.as_str(),
            entity1.parent_id,
            entity1.file_path,
            entity1.line_number,
            entity1.column_number,
            entity1.doc_comment,
            entity1.attributes,
            entity1.metadata,
            entity1.project_root,
        ])?;

        stmt.execute(params![
            entity2.kind.as_str(),
            entity2.name,
            entity2.signature,
            entity2.visibility.as_str(),
            entity2.parent_id,
            entity2.file_path,
            entity2.line_number,
            entity2.column_number,
            entity2.doc_comment,
            entity2.attributes,
            entity2.metadata,
            entity2.project_root,
        ])?;

        Ok(())
    });

    assert!(result.is_ok());

    // Verify new entities were inserted
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE file_path = ?",
        ["/test.rs"],
        |row| row.get(0)
    )?;

    assert_eq!(count, 2); // Only new entities should remain

    // Test atomic file indexing with failed operation (should rollback)
    let result = store.index_file_atomic("/test2.rs", "hash2", |tx| {
        // Insert an entity
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO entities (
                kind, name, signature, visibility, parent_id, file_path,
                line_number, column_number, doc_comment, attributes, metadata
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#
        )?;

        stmt.execute(params![
            EntityKind::Function.as_str(),
            "will_fail_function",
            "fn will_fail() -> Result<()>",
            Visibility::Public.as_str(),
            None::<i64>,
            "/test2.rs",
            1i64,
            Some(0i64),
            None::<String>,
            None::<String>,
            None::<String>,
        ])?;

        // Simulate an error
        Err(anyhow::anyhow!("Simulated error"))
    });

    assert!(result.is_err());

    // Verify no entities were inserted for test2.rs
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE file_path = ?",
        ["/test2.rs"],
        |row| row.get(0)
    )?;

    assert_eq!(count, 0);

    // Verify file hashes table integrity
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM file_hashes WHERE file_path = ?",
        ["/test.rs"],
        |row| row.get(0)
    )?;

    assert_eq!(count, 1);

    Ok(())
}

/// Test batch insert with partial failure
#[test]
fn test_batch_insert_rollback() -> Result<()> {
    let dir = tempdir()?;
    let db_path = dir.path().join("test_batch.db");
    let conn = Connection::open(&db_path)?;

    // Initialize schema
    SchemaV2::initialize(&conn)?;

    let store = StoreV2WithTx::new(&db_path)?;

    // Create entities
    let mut entities = Vec::new();
    for i in 0..5 {
        entities.push(Entity {
            id: 0,
            kind: EntityKind::Function,
            name: format!("batch_function_{}", i),
            signature: Some(format!("fn batch_{}() -> Result<()>", i)),
            visibility: Visibility::Public,
            parent_id: None,
            file_path: "/batch.rs".to_string(),
            line_number: (i * 10) as i64,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            project_root: "/test/project".to_string(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        });
    }

    // Insert batch successfully
    let ids = store.insert_entities_batch(&entities)?;
    assert_eq!(ids.len(), 5);

    // Count inserted entities
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE file_path = ?",
        ["/batch.rs"],
        |row| row.get(0)
    )?;

    assert_eq!(count, 5);

    // Test empty batch
    let empty_ids = store.insert_entities_batch(&[])?;
    assert_eq!(empty_ids.len(), 0);

    Ok(())
}

/// Test atomic schema migration
#[test]
fn test_schema_migration_atomic() -> Result<()> {
    let dir = tempdir()?;
    let db_path = dir.path().join("test_migration.db");
    let mut conn = Connection::open(&db_path)?;

    // Create v1 tables
    conn.execute_batch(
        r#"
        CREATE TABLE old_files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL,
            hash TEXT,
            last_indexed INTEGER,
            patterns_count INTEGER
        );

        CREATE TABLE old_embeddings (
            id INTEGER PRIMARY KEY,
            pattern TEXT NOT NULL,
            embedding BLOB,
            metadata TEXT,
            created_at INTEGER,
            file_hash TEXT
        );

        INSERT INTO old_files (path, hash, patterns_count) VALUES
            ('/old_file.rs', 'hash123', 3),
            ('/old_file2.rs', 'hash456', 5);

        INSERT INTO old_embeddings (pattern, embedding, metadata, created_at) VALUES
            ('fn test1()', x'01020304', '{"path": "/old_file.rs", "line_number": 10}', 1234567890),
            ('struct TestStruct', x'05060708', '{"path": "/old_file.rs", "line_number": 20}', 1234567891);
        "#
    )?;

    // Run atomic migration - requires mutable connection
    let result = crate::migration_tx::MigrationWithTx::migrate_v1_to_v2_atomic(&mut conn);

    assert!(result.is_ok());

    // Validate migration
    let validation_result = crate::migration_tx::MigrationWithTx::validate_migration(&conn);
    assert!(validation_result.is_ok());

    // Check v2 tables exist
    let v2_tables = ["entities", "entity_embeddings", "files"];
    for table in &v2_tables {
        let exists = conn.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
        )?.exists([table])?;
        assert!(exists, "Table {} should exist", table);
    }

    // Check data was migrated
    let entity_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities",
        [],
        |row| row.get(0)
    )?;

    assert!(entity_count > 0, "Entities should have been migrated");

    // Check old tables were renamed
    let backup_exists = conn.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='old_embeddings_v1_backup'"
    )?.exists([])?;
    assert!(backup_exists, "Backup table should exist");

    Ok(())
}

/// Test transaction isolation
#[test]
fn test_transaction_isolation() -> Result<()> {
    let dir = tempdir()?;
    let db_path = dir.path().join("test_isolation.db");
    let mut conn = Connection::open(&db_path)?;

    // Initialize schema
    SchemaV2::initialize(&conn)?;

    // Start a transaction
    let tx = conn.transaction()?;

    // Insert entity within transaction
    tx.execute(
        r#"
        INSERT INTO entities (kind, name, file_path, line_number)
        VALUES (?1, ?2, ?3, ?4)
        "#,
        params!["function", "tx_function", "/tx.rs", 1i64]
    )?;

    // Check from within transaction - should see the entity
    let count_in_tx: i64 = tx.query_row(
        "SELECT COUNT(*) FROM entities WHERE name = ?",
        ["tx_function"],
        |row| row.get(0)
    )?;
    assert_eq!(count_in_tx, 1);

    // Commit the transaction
    tx.commit()?;

    // Now main connection should see the entity
    let count_main: i64 = conn.query_row(
        "SELECT COUNT(*) FROM entities WHERE name = ?",
        ["tx_function"],
        |row| row.get(0)
    )?;
    assert_eq!(count_main, 1);

    Ok(())
}

/// Test concurrent transaction behavior with savepoints
#[test]
fn test_savepoint_rollback() -> Result<()> {
    let dir = tempdir()?;
    let db_path = dir.path().join("test_savepoint.db");
    let mut conn = Connection::open(&db_path)?;

    // Initialize schema
    SchemaV2::initialize(&conn)?;

    // Insert initial data
    conn.execute(
        "INSERT INTO entities (kind, name, file_path, line_number) VALUES (?1, ?2, ?3, ?4)",
        params!["function", "initial", "/initial.rs", 1i64]
    )?;

    {
        // Create a savepoint with scoped lifetime
        let mut sp = conn.savepoint()?;

        // Insert more data
        sp.execute(
            "INSERT INTO entities (kind, name, file_path, line_number) VALUES (?1, ?2, ?3, ?4)",
            params!["function", "savepoint", "/savepoint.rs", 2i64]
        )?;

        // Check count within savepoint
        let count: i64 = sp.query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))?;
        assert_eq!(count, 2);

        // Rollback savepoint
        sp.rollback()?;
    } // savepoint is dropped here

    // Should only have initial data
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))?;
    assert_eq!(count, 1);

    Ok(())
}
