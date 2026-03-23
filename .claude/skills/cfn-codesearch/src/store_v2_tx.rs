// Transaction-extended version of store_v2.rs with proper batch transaction management
use anyhow::{Result, Context, anyhow};
use rusqlite::{Connection, params, Row, Transaction};
use std::path::Path;
use serde::{Serialize, Deserialize};
use tracing::{info, debug, error, warn};
use chrono::{DateTime, Utc};

use crate::schema_v2::{EntityKind, RefKind, Visibility};
use crate::search_engine::SearchResult;

// Re-export the original structs
pub use crate::store_v2::{Entity, Reference, TypeUsage, Module, StoreStats, StoreV2};

pub struct StoreV2WithTx {
    pub(crate) conn: Connection,
}

impl StoreV2WithTx {
    pub fn new(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)
            .context("Failed to open database")?;

        // Performance optimizations
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "cache_size", 10000)?; // 10MB cache
        conn.pragma_update(None, "temp_store", "memory")?;
        conn.pragma_update(None, "mmap_size", 268435456)?; // 256MB memory map

        Ok(Self { conn })
    }

    pub fn transaction(&self) -> Result<Transaction> {
        Ok(self.conn.unchecked_transaction()?)
    }

    /// Insert a single entity
    pub fn insert_entity(&self, entity: &Entity) -> Result<i64> {
        let entities = vec![entity.clone()];
        let ids = self.insert_entities_batch(&entities)?;
        Ok(ids.get(0).copied().unwrap_or(-1))
    }

    // Batch operations with transaction support
    pub fn insert_entities_batch(&self, entities: &[Entity]) -> Result<Vec<i64>> {
        if entities.is_empty() {
            return Ok(Vec::new());
        }

        debug!("Inserting batch of {} entities", entities.len());
        let tx = self.transaction()
            .context("Failed to start transaction for batch entity insert")?;

        let mut ids = Vec::with_capacity(entities.len());

        // Prepare statement once for performance
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO entities (
                    kind, name, signature, visibility, parent_id, file_path,
                    line_number, column_number, doc_comment, attributes, metadata
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                "#
            )?;

            for entity in entities {
                stmt.execute(params![
                    entity.kind.as_str(),
                    entity.name,
                    entity.signature,
                    entity.visibility.as_str(),
                    entity.parent_id,
                    entity.file_path,
                    entity.line_number,
                    entity.column_number,
                    entity.doc_comment,
                    entity.attributes,
                    entity.metadata
                ])?;

                ids.push(tx.last_insert_rowid());
            }
        } // stmt is dropped here, releasing the borrow

        tx.commit()
            .context("Failed to commit transaction for batch entity insert")?;

        debug!("Successfully inserted {} entities", ids.len());
        Ok(ids)
    }

    pub fn insert_references_batch(&self, references: &[Reference]) -> Result<Vec<i64>> {
        if references.is_empty() {
            return Ok(Vec::new());
        }

        debug!("Inserting batch of {} references", references.len());
        let tx = self.transaction()
            .context("Failed to start transaction for batch reference insert")?;

        let mut ids = Vec::with_capacity(references.len());

        // Prepare statement once for performance
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO refs (
                    source_entity_id, target_entity_id, ref_kind, file_path,
                    line_number, column_number, context
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#
            )?;

            for reference in references {
                stmt.execute(params![
                    reference.source_entity_id,
                    reference.target_entity_id,
                    reference.ref_kind.as_str(),
                    reference.file_path,
                    reference.line_number,
                    reference.column_number,
                    reference.context
                ])?;

                ids.push(tx.last_insert_rowid());
            }
        } // stmt is dropped here

        tx.commit()
            .context("Failed to commit transaction for batch reference insert")?;

        debug!("Successfully inserted {} references", ids.len());
        Ok(ids)
    }

    pub fn insert_type_usages_batch(&self, type_usages: &[TypeUsage]) -> Result<Vec<i64>> {
        if type_usages.is_empty() {
            return Ok(Vec::new());
        }

        debug!("Inserting batch of {} type usages", type_usages.len());
        let tx = self.transaction()
            .context("Failed to start transaction for batch type usage insert")?;

        let mut ids = Vec::with_capacity(type_usages.len());

        // Prepare statement once for performance
        {
            let mut stmt = tx.prepare(
                r#"
                INSERT INTO type_usage (
                    entity_id, type_name, usage_kind, file_path, line_number
                ) VALUES (?1, ?2, ?3, ?4, ?5)
                "#
            )?;

            for type_usage in type_usages {
                stmt.execute(params![
                    type_usage.entity_id,
                    type_usage.type_name,
                    type_usage.usage_kind,
                    type_usage.file_path,
                    type_usage.line_number
                ])?;

                ids.push(tx.last_insert_rowid());
            }
        } // stmt is dropped here

        tx.commit()
            .context("Failed to commit transaction for batch type usage insert")?;

        debug!("Successfully inserted {} type usages", ids.len());
        Ok(ids)
    }

    pub fn store_embeddings_batch(&self, embeddings: &[(i64, &[f32])], model: &str) -> Result<()> {
        if embeddings.is_empty() {
            return Ok(());
        }

        debug!("Storing embeddings for {} entities", embeddings.len());
        let tx = self.transaction()
            .context("Failed to start transaction for batch embedding storage")?;

        {
            let mut stmt = tx.prepare(
                r#"
                INSERT OR REPLACE INTO embeddings (entity_id, embedding, model)
                VALUES (?1, ?2, ?3)
                "#
            )?;

            for (entity_id, embedding) in embeddings {
                let embedding_bytes = unsafe {
                    std::slice::from_raw_parts(
                        embedding.as_ptr() as *const u8,
                        embedding.len() * std::mem::size_of::<f32>(),
                    )
                };
                stmt.execute(params![entity_id, embedding_bytes, model])?;
            }
        }

        tx.commit()
            .context("Failed to commit embedding storage transaction")?;

        debug!("Successfully stored {} embeddings", embeddings.len());
        Ok(())
    }

    pub fn index_file_atomic<F>(&self, file_path: &str, file_hash: &str, f: F) -> Result<()>
    where
        F: FnOnce(&Transaction) -> Result<()>,
    {
        let tx = self.transaction()
            .context("Failed to start transaction for atomic file indexing")?;

        // Delete existing data for this file
        tx.execute("DELETE FROM entities WHERE file_path = ?", [file_path])?;
        tx.execute("DELETE FROM file_hashes WHERE file_path = ?", [file_path])?;

        // Execute the callback
        f(&tx)?;

        // Record file hash with current timestamp
        let current_time = chrono::Utc::now().timestamp();
        tx.execute(
            "INSERT INTO file_hashes (file_path, file_hash, indexed_at) VALUES (?, ?, ?)",
            params![file_path, file_hash, current_time],
        )?;

        tx.commit()
            .context("Failed to commit atomic file indexing transaction")?;

        info!("Successfully indexed file: {} with hash: {}", file_path, file_hash);
        Ok(())
    }

    pub fn migrate_schema_atomic<F>(&self, migration_name: &str, f: F) -> Result<()>
    where
        F: FnOnce(&Transaction) -> Result<()>,
    {
        let tx = self.transaction()
            .context("Failed to start transaction for atomic schema migration")?;

        // Execute the callback
        f(&tx)?;

        // Record migration
        tx.execute(
            "INSERT INTO schema_migrations (migration_name, applied_at) VALUES (?, ?)",
            params![migration_name, Utc::now().timestamp()],
        )?;

        tx.commit()
            .context("Failed to commit schema migration transaction")?;

        info!("Successfully applied schema migration: {}", migration_name);
        Ok(())
    }

    pub fn delete_file_data(&self, file_path: &str) -> Result<()> {
        debug!("Deleting all data for file: {}", file_path);
        let tx = self.transaction()
            .context("Failed to start transaction for file deletion")?;

        tx.execute("DELETE FROM entities WHERE file_path = ?", [file_path])?;
        tx.execute("DELETE FROM file_hashes WHERE file_path = ?", [file_path])?;

        tx.commit()
            .context("Failed to commit file deletion transaction")?;

        debug!("Successfully deleted all data for file: {}", file_path);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::schema_v2::SchemaV2;

    #[test]
    fn test_batch_entity_insertion() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_batch.db");
        let conn = Connection::open(&db_path)?;

        // Initialize schema
        SchemaV2::initialize(&conn)?;

        let store = StoreV2WithTx::new(&db_path)?;

        // Create test entities
        let entities: Vec<Entity> = (0..10).map(|i| Entity {
            id: 0,
            kind: EntityKind::Function,
            name: format!("test_function_{}", i),
            signature: Some(format!("fn test_function_{}() -> Result<()>", i)),
            visibility: Visibility::Public,
            parent_id: None,
            file_path: "/test.rs".to_string(),
            line_number: (i * 10) as i64,
            column_number: Some(0),
            doc_comment: None,
            attributes: None,
            metadata: None,
            project_root: "/test/project".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }).collect();

        // Insert batch
        let ids = store.insert_entities_batch(&entities)?;
        assert_eq!(ids.len(), 10);

        // Verify all entities were inserted
        let count: i64 = store.conn.query_row(
            "SELECT COUNT(*) FROM entities WHERE file_path = ?",
            ["/test.rs"],
            |row| row.get(0)
        )?;

        assert_eq!(count, 10);

        Ok(())
    }

    #[test]
    fn test_transaction_rollback() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_rollback.db");
        let conn = Connection::open(&db_path)?;

        // Initialize schema
        SchemaV2::initialize(&conn)?;

        let store = StoreV2WithTx::new(&db_path)?;

        // Start a transaction that will fail
        let result: Result<(), rusqlite::Error> = store.conn.unchecked_transaction().and_then(|mut tx| {
            // Insert some data
            tx.execute(
                "INSERT INTO entities (kind, name, file_path, line_number) VALUES (?1, ?2, ?3, ?4)",
                params!["function", "test_func", "/test.rs", 10i64]
            )?;

            // Simulate an error - return a proper rusqlite::Error wrapped in Result
            Err(rusqlite::Error::InvalidParameterName("simulated".to_string()))
        });

        // Transaction should have rolled back
        assert!(result.is_err());

        // Verify no data was inserted
        let count: i64 = store.conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;

        assert_eq!(count, 0);

        Ok(())
    }
}
