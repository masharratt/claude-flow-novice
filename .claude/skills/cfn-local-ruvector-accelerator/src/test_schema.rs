#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::path::PathBuf;
    
    #[test]
    fn test_complete_schema_migration() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_migration.db");
        
        // Create a v1 database
        let conn = rusqlite::Connection::open(&db_path)?;
        
        // Initialize v1 schema
        conn.execute_batch(
            r#"
            CREATE TABLE embeddings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern TEXT NOT NULL UNIQUE,
                embedding BLOB NOT NULL,
                metadata TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                file_hash TEXT NOT NULL
            );
            
            CREATE TABLE files (
                path TEXT PRIMARY KEY,
                hash TEXT NOT NULL,
                last_indexed INTEGER NOT NULL,
                patterns_count INTEGER DEFAULT 0
            );
            "#
        )?;
        
        // Insert some test data
        let test_embedding = vec![0.1f32; 1536];
        let embedding_bytes: Vec<u8> = test_embedding
            .iter()
            .flat_map(|&v| v.to_le_bytes().to_vec())
            .collect();
        
        let test_metadata = serde_json::json!({
            "path": "/test.rs",
            "pattern": "fn test_function() -> Result<()>",
            "line_number": 10,
            "file_hash": "abc123",
            "indexed_at": 1700000000
        });
        
        conn.execute(
            "INSERT INTO embeddings (pattern, embedding, metadata, created_at, file_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "fn test_function() -> Result<()>",
                embedding_bytes,
                test_metadata.to_string(),
                1700000000i64,
                "abc123"
            ]
        )?;
        
        conn.execute(
            "INSERT INTO files (path, hash, last_indexed, patterns_count) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["/test.rs", "abc123", 1700000000i64, 1]
        )?;
        
        drop(conn);
        
        // Now run migration
        let migration_manager = crate::migration::MigrationManager::new(&db_path)?;
        migration_manager.migrate_to_latest()?;
        
        // Verify migration
        assert!(migration_manager.validate_migration()?);
        assert_eq!(migration_manager.current_version()?, 2);
        
        // Check that data was migrated
        let store = crate::store_v2::StoreV2::new(&db_path)?;
        let entities = store.search_entities("test_function", 10)?;
        assert!(!entities.is_empty());
        
        let entity = &entities[0];
        assert_eq!(entity.name, "test_function");
        assert_eq!(entity.kind.as_str(), "function");
        
        // Check embedding was migrated
        let embedding = store.get_embedding(entity.id)?;
        assert!(embedding.is_some());
        assert_eq!(embedding.unwrap().len(), 1536);
        
        Ok(())
    }
    
    #[test]
    fn test_performance_lookups() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_perf.db");
        
        // Initialize with v2 schema
        let conn = rusqlite::Connection::open(&db_path)?;
        crate::schema_v2::SchemaV2::initialize(&conn)?;
        drop(conn);
        
        let store = crate::store_v2::StoreV2::new(&db_path)?;
        
        // Insert test entities
        let start = std::time::Instant::now();
        for i in 0..1000 {
            let entity = crate::store_v2::Entity {
                id: 0,
                kind: crate::schema_v2::EntityKind::Function,
                name: format!("function_{}", i),
                signature: Some(format!("fn function_{}() -> Result<()>", i)),
                visibility: crate::schema_v2::Visibility::Public,
                parent_id: None,
                file_path: format!("/src/file_{}.rs", i % 10),
                line_number: i as i64,
                column_number: Some(0),
                doc_comment: None,
                attributes: None,
                metadata: None,
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };
            
            store.insert_entity(&entity)?;
        }
        let insert_time = start.elapsed();
        println!("Inserted 1000 entities in {:?}", insert_time);
        
        // Test lookup performance
        let start = std::time::Instant::now();
        let entity = store.find_entities_by_name("function_500", 1)?;
        let lookup_time = start.elapsed();
        println!("Found entity by name in {:?}", lookup_time);
        assert!(!entity.is_empty());
        
        // Test type search performance
        let start = std::time::Instant::now();
        let functions = store.find_entities_by_kind(crate::schema_v2::EntityKind::Function, 100)?;
        let search_time = start.elapsed();
        println!("Found 100 functions in {:?}", search_time);
        assert_eq!(functions.len(), 100);
        
        // Verify performance targets
        assert!(lookup_time.as_millis() < 10, "Name lookup should be < 10ms");
        assert!(search_time.as_millis() < 10, "Type search should be < 10ms");
        
        Ok(())
    }
    
    #[test]
    fn test_reference_tracking() -> anyhow::Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_refs.db");
        
        let conn = rusqlite::Connection::open(&db_path)?;
        crate::schema_v2::SchemaV2::initialize(&conn)?;
        drop(conn);
        
        let store = crate::store_v2::StoreV2::new(&db_path)?;
        
        // Create test entities
        let mut caller = crate::store_v2::Entity {
            id: 0,
            kind: crate::schema_v2::EntityKind::Function,
            name: "caller".to_string(),
            signature: Some("fn caller()".to_string()),
            visibility: crate::schema_v2::Visibility::Public,
            parent_id: None,
            file_path: "/src/caller.rs".to_string(),
            line_number: 10,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        
        let mut callee = crate::store_v2::Entity {
            id: 0,
            kind: crate::schema_v2::EntityKind::Function,
            name: "callee".to_string(),
            signature: Some("fn callee()".to_string()),
            visibility: crate::schema_v2::Visibility::Public,
            parent_id: None,
            file_path: "/src/callee.rs".to_string(),
            line_number: 20,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        
        // Insert entities
        let caller_id = store.insert_entity(&caller)?;
        let callee_id = store.insert_entity(&callee)?;
        
        // Create a reference
        let reference = crate::store_v2::Reference {
            id: 0,
            source_entity_id: caller_id,
            target_entity_id: callee_id,
            ref_kind: crate::schema_v2::RefKind::Call,
            file_path: "/src/caller.rs".to_string(),
            line_number: 12,
            column_number: Some(5),
            context: Some("callee()".to_string()),
            created_at: chrono::Utc::now(),
        };
        
        store.insert_reference(&reference)?;
        
        // Test reference lookups
        let refs_to_callee = store.find_references_to_entity(callee_id)?;
        assert_eq!(refs_to_callee.len(), 1);
        assert_eq!(refs_to_callee[0].source_entity_id, caller_id);
        
        let refs_from_caller = store.find_references_from_entity(caller_id)?;
        assert_eq!(refs_from_caller.len(), 1);
        assert_eq!(refs_from_caller[0].target_entity_id, callee_id);
        
        Ok(())
    }
}
