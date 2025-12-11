use anyhow::{Result, Context, anyhow};
use rusqlite::{Connection, params, Row, OptionalExtension};
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tracing::{info, debug, error, warn};
use chrono::{DateTime, Utc};

use crate::schema_v2::{EntityKind, RefKind, Visibility};
use crate::search_engine::SearchResult;
use crate::path_validator;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: i64,
    pub kind: EntityKind,
    pub name: String,
    pub signature: Option<String>,
    pub visibility: Visibility,
    pub parent_id: Option<i64>,
    pub file_path: String,
    pub line_number: i64,
    pub column_number: Option<i64>,
    pub doc_comment: Option<String>,
    pub attributes: Option<String>,
    pub metadata: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub id: i64,
    pub source_entity_id: i64,
    pub target_entity_id: i64,
    pub ref_kind: RefKind,
    pub file_path: String,
    pub line_number: i64,
    pub column_number: Option<i64>,
    pub context: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeUsage {
    pub id: i64,
    pub entity_id: i64,
    pub type_name: String,
    pub usage_kind: String,
    pub file_path: String,
    pub line_number: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Module {
    pub id: i64,
    pub name: String,
    pub file_path: String,
    pub module_type: String,
    pub is_root: bool,
    pub parent_module_id: Option<i64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug)]
pub struct StoreV2 {
    pub(crate) conn: Connection,
}


    /// Validate that IDs are valid integers to prevent injection
    fn validate_ids(ids: &[i64]) -> Result<()> {
        for id in ids {
            if *id < 0 || *id > 9223372036854775807 {
                return Err(anyhow::anyhow!("Invalid ID value: {}", id));
            }
        }
        Ok(())
    }

/// Escape special characters in LIKE patterns to prevent unintended wildcards
    fn escape_like_pattern(pattern: &str) -> String {
        pattern
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    }

impl StoreV2 {
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
    
    pub fn transaction(&self) -> Result<rusqlite::Transaction> {
        Ok(self.conn.unchecked_transaction()?)
    }
    
    // Entity operations
    pub fn insert_entity(&self, entity: &Entity, project_root: &str) -> Result<i64> {
        debug!("Inserting entity: {} ({}) in project {}", entity.name, entity.kind.as_str(), project_root);

        self.conn.execute(
            r#"
            INSERT INTO entities (
                kind, name, signature, visibility, parent_id, file_path,
                line_number, column_number, doc_comment, attributes, metadata, project_root
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
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
                entity.metadata,
                project_root
            ],
        )?;

        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn get_entity(&self, id: i64) -> Result<Option<Entity>> {
        debug!("Getting entity with id: {}", id);
        
        let mut stmt = self.conn.prepare(
            "SELECT * FROM entities WHERE id = ?"
        )?;
        
        let entity = stmt.query_row([id], |row| {
            self.row_to_entity(row)
        }).optional()?;
        
        Ok(entity)
    }
    
    pub fn find_entities_by_name(&self, name: &str, limit: usize, project_root: &Path) -> Result<Vec<Entity>> {
        debug!("Finding entities with name: {} in project root: {}", name, project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            "SELECT * FROM entities WHERE name = ? AND file_path LIKE ? ESCAPE '\\' ORDER BY file_path, line_number LIMIT ?"
        )?;

        let entities = stmt.query_map(
            params![name, project_root_pattern, limit as i64],
            |row| self.row_to_entity(row)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(entities)
    }
    
    pub fn find_entities_by_kind(&self, kind: EntityKind, limit: usize, project_root: &Path) -> Result<Vec<Entity>> {
        debug!("Finding entities of kind: {} in project root: {}", kind.as_str(), project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            "SELECT * FROM entities WHERE kind = ? AND file_path LIKE ? ESCAPE '\\' ORDER BY name LIMIT ?"
        )?;

        let entities = stmt.query_map(
            params![kind.as_str(), project_root_pattern, limit as i64],
            |row| self.row_to_entity(row)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(entities)
    }
    
    pub fn find_entities_in_file(&self, file_path: &str) -> Result<Vec<Entity>> {
        debug!("Finding entities in file: {}", file_path);
        
        let mut stmt = self.conn.prepare(
            "SELECT * FROM entities WHERE file_path = ? ORDER BY line_number"
        )?;
        
        let entities = stmt.query_map([file_path], |row| {
            self.row_to_entity(row)
        })?.collect::<Result<Vec<_>, _>>()?;
        
        Ok(entities)
    }
    
    pub fn search_entities(&self, query: &str, limit: usize, project_root: &Path) -> Result<Vec<Entity>> {
        debug!("Searching entities with query: {} in project root: {}", query, project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            r#"
            SELECT * FROM entities
            WHERE (name LIKE ? ESCAPE '\' OR signature LIKE ? ESCAPE '\' OR doc_comment LIKE ? ESCAPE '\') AND file_path LIKE ? ESCAPE '\'
            ORDER BY
                CASE WHEN name LIKE ? ESCAPE '\' THEN 1 ELSE 2 END,
                name
            LIMIT ?
            "#
        )?;

        let escaped_query = escape_like_pattern(query);
        let pattern = format!("%{}%", escaped_query);
        let entities = stmt.query_map(
            params![pattern, pattern, pattern, project_root_pattern, pattern, limit as i64],
            |row| self.row_to_entity(row)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(entities)
    }
    
    // Reference operations
    pub fn insert_reference(&self, reference: &Reference) -> Result<i64> {
        debug!("Inserting reference: {} -> {}", reference.source_entity_id, reference.target_entity_id);
        
        self.conn.execute(
            r#"
            INSERT INTO refs (
                source_entity_id, target_entity_id, ref_kind, file_path, 
                line_number, column_number, context
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                reference.source_entity_id,
                reference.target_entity_id,
                reference.ref_kind.as_str(),
                reference.file_path,
                reference.line_number,
                reference.column_number,
                reference.context
            ],
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn find_references_to_entity(&self, entity_id: i64, project_root: &Path) -> Result<Vec<Reference>> {
        debug!("Finding references to entity: {} in project root: {}", entity_id, project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            "SELECT * FROM refs WHERE target_entity_id = ? AND file_path LIKE ? ESCAPE '\\' ORDER BY file_path, line_number"
        )?;

        let refs = stmt.query_map(
            params![entity_id, project_root_pattern],
            |row| self.row_to_reference(row)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(refs)
    }
    
    pub fn find_references_from_entity(&self, entity_id: i64, project_root: &Path) -> Result<Vec<Reference>> {
        debug!("Finding references from entity: {} in project root: {}", entity_id, project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            "SELECT * FROM refs WHERE source_entity_id = ? AND file_path LIKE ? ESCAPE '\\' ORDER BY ref_kind, file_path"
        )?;

        let refs = stmt.query_map(
            params![entity_id, project_root_pattern],
            |row| self.row_to_reference(row)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(refs)
    }
    
    // Type usage operations
    pub fn insert_type_usage(&self, type_usage: &TypeUsage) -> Result<i64> {
        debug!("Inserting type usage: {} uses {}", type_usage.entity_id, type_usage.type_name);
        
        self.conn.execute(
            r#"
            INSERT INTO type_usage (
                entity_id, type_name, usage_kind, file_path, line_number
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                type_usage.entity_id,
                type_usage.type_name,
                type_usage.usage_kind,
                type_usage.file_path,
                type_usage.line_number
            ],
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn find_entities_using_type(&self, type_name: &str, project_root: &Path) -> Result<Vec<i64>> {
        debug!("Finding entities using type: {} in project root: {}", type_name, project_root.display());

        let project_root_str = project_root
            .to_string_lossy()
            .to_string();
        let escaped_root = escape_like_pattern(&project_root_str);
        let project_root_pattern = format!("{}%", escaped_root);

        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT entity_id FROM type_usage WHERE type_name = ? AND file_path LIKE ? ESCAPE '\\'"
        )?;

        let entity_ids = stmt.query_map(
            params![type_name, project_root_pattern],
            |row| row.get(0)
        )?.collect::<Result<Vec<_>, _>>()?;

        Ok(entity_ids)
    }
    
    // Module operations
    pub fn insert_module(&self, module: &Module) -> Result<i64> {
        debug!("Inserting module: {}", module.name);
        
        self.conn.execute(
            r#"
            INSERT INTO modules (
                name, file_path, module_type, is_root, parent_module_id
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                module.name,
                module.file_path,
                module.module_type,
                module.is_root,
                module.parent_module_id
            ],
        )?;
        
        Ok(self.conn.last_insert_rowid())
    }
    
    pub fn find_module_by_file(&self, file_path: &str) -> Result<Option<Module>> {
        debug!("Finding module for file: {}", file_path);
        
        let mut stmt = self.conn.prepare(
            "SELECT * FROM modules WHERE file_path = ?"
        )?;
        
        let module = stmt.query_row([file_path], |row| {
            self.row_to_module(row)
        }).optional()?;
        
        Ok(module)
    }
    
    // Embedding operations
    pub fn store_embedding(&self, entity_id: i64, embedding: &[f32], model: &str) -> Result<()> {
        debug!("Storing embedding for entity: {}", entity_id);
        
        // Serialize embedding to bytes
        let embedding_bytes: Vec<u8> = embedding
            .iter()
            .flat_map(|&v| v.to_le_bytes().to_vec())
            .collect();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO entity_embeddings (entity_id, embedding, embedding_model) VALUES (?1, ?2, ?3)",
            params![entity_id, embedding_bytes, model]
        )?;
        
        Ok(())
    }
    
    pub fn get_embedding(&self, entity_id: i64) -> Result<Option<Vec<f32>>> {
        debug!("Getting embedding for entity: {}", entity_id);
        
        let mut stmt = self.conn.prepare(
            "SELECT embedding FROM entity_embeddings WHERE entity_id = ?"
        )?;
        
        let embedding = stmt.query_row([entity_id], |row| {
            let embedding_bytes: Vec<u8> = row.get(0)?;
            let mut embedding: Vec<f32> = Vec::with_capacity(embedding_bytes.len() / 4);
            
            for chunk in embedding_bytes.chunks_exact(4) {
                let bytes: [u8; 4] = chunk.try_into().unwrap();
                embedding.push(f32::from_le_bytes(bytes));
            }
            
            Ok(embedding)
        }).optional()?;
        
        Ok(embedding)
    }
    
    // Performance optimization methods
    pub fn get_entity_batch(&self, ids: &[i64]) -> Result<Vec<Entity>> {
        debug!("Getting batch of {} entities", ids.len());
        
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT * FROM entities WHERE id IN ({}) ORDER BY id",
            placeholders
        );
        
        let params: Vec<&dyn rusqlite::ToSql> = ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        
        let mut stmt = self.conn.prepare(&query)?;
        let entities = stmt.query_map(&params[..], |row| {
            self.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| anyhow::anyhow!("Failed to collect entities: {}", e))?;

        Ok(entities)
    }
    
    // Statistics
    pub fn get_stats(&self) -> Result<StoreStats> {
        debug!("Getting store statistics");

        let entities_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;

        let refs_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM refs",
            [],
            |row| row.get(0)
        )?;

        let type_usage_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM type_usage",
            [],
            |row| row.get(0)
        )?;

        let modules_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM modules",
            [],
            |row| row.get(0)
        )?;

        let embeddings_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM entity_embeddings",
            [],
            |row| row.get(0)
        )?;

        let files_count: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT file_path) FROM entities",
            [],
            |row| row.get(0)
        )?;

        let db_size = std::fs::metadata("index.db")
            .map(|m| m.len())
            .unwrap_or(0);

        Ok(StoreStats {
            entities_count: entities_count as usize,
            refs_count: refs_count as usize,
            type_usage_count: type_usage_count as usize,
            modules_count: modules_count as usize,
            embeddings_count: embeddings_count as usize,
            files_count: files_count as usize,
            database_size_bytes: db_size,
        })
    }

    // File cleanup operations (critical for preventing duplicate entries during reindexing)
    pub fn delete_file_entities(&mut self, file_path: &str, project_root: &Path) -> Result<()> {
        // Validate path against project root for security
        path_validator::prevent_traversal(file_path)?;
        // Use string-based validation that doesn't require filesystem access
        let project_root_str = project_root.to_str()
            .ok_or_else(|| anyhow::anyhow!("Project root path is not valid UTF-8"))?;
        path_validator::validate_against_root_str(file_path, project_root_str)?;

        info!("Cleaning old entries for {} in project root {}", file_path, project_root.display());

        // Delete in correct order to respect FK constraints:
        // 1. entity_embeddings (references entities.id)
        // 2. refs (references entities.id via source/target)
        // 3. type_usage (references entities.id)
        // 4. entities (primary table)

        // Wrap in transaction for atomicity
        let tx = self.conn.transaction()?;

        debug!("Deleting entity embeddings for file: {}", file_path);
        tx.execute(
            "DELETE FROM entity_embeddings WHERE entity_id IN (SELECT id FROM entities WHERE file_path = ?)",
            params![file_path]
        )?;

        debug!("Deleting references for file: {}", file_path);
        tx.execute(
            "DELETE FROM refs WHERE file_path = ?",
            params![file_path]
        )?;

        debug!("Deleting type usage entries for file: {}", file_path);
        tx.execute(
            "DELETE FROM type_usage WHERE entity_id IN (SELECT id FROM entities WHERE file_path = ?)",
            params![file_path]
        )?;

        debug!("Deleting entities for file: {}", file_path);
        let deleted_count = tx.execute(
            "DELETE FROM entities WHERE file_path = ?",
            params![file_path]
        )?;

        tx.commit()?;

        debug!("Deleted {} entities and related records for file: {}", deleted_count, file_path);

        Ok(())
    }

    // Helper methods to convert rows to structs
    pub(crate) fn row_to_entity(&self, row: &Row) -> rusqlite::Result<Entity> {
        let created_timestamp: i64 = row.get(12)?;
        let updated_timestamp: i64 = row.get(13)?;

        let kind_str = row.get::<_, String>(1)?;
        let kind = EntityKind::from_str(&kind_str)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("Invalid entity kind: {}", kind_str)))?;

        let visibility_str = row.get::<_, String>(4)?;
        let visibility = Visibility::from_str(&visibility_str)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("Invalid visibility: {}", visibility_str)))?;

        Ok(Entity {
            id: row.get(0)?,
            kind,
            name: row.get(2)?,
            signature: row.get(3)?,
            visibility,
            parent_id: row.get(5)?,
            file_path: row.get(6)?,
            line_number: row.get(7)?,
            column_number: row.get(8)?,
            doc_comment: row.get(9)?,
            attributes: row.get(10)?,
            metadata: row.get(11)?,
            created_at: DateTime::from_timestamp(created_timestamp, 0).unwrap_or_default(),
            updated_at: DateTime::from_timestamp(updated_timestamp, 0).unwrap_or_default(),
        })
    }
    
    fn row_to_reference(&self, row: &Row) -> rusqlite::Result<Reference> {
        let created_timestamp: i64 = row.get(7)?;

        let ref_kind_str = row.get::<_, String>(3)?;
        let ref_kind = RefKind::from_str(&ref_kind_str)
            .ok_or_else(|| rusqlite::Error::InvalidParameterName(format!("Invalid reference kind: {}", ref_kind_str)))?;

        Ok(Reference {
            id: row.get(0)?,
            source_entity_id: row.get(1)?,
            target_entity_id: row.get(2)?,
            ref_kind,
            file_path: row.get(4)?,
            line_number: row.get(5)?,
            column_number: row.get(6)?,
            context: row.get(7)?,
            created_at: DateTime::from_timestamp(created_timestamp, 0).unwrap_or_default(),
        })
    }
    
    fn row_to_module(&self, row: &Row) -> rusqlite::Result<Module> {
        let created_timestamp: i64 = row.get(5)?;

        Ok(Module {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            module_type: row.get(3)?,
            is_root: row.get(4)?,
            parent_module_id: row.get(5)?,
            created_at: DateTime::from_timestamp(created_timestamp, 0).unwrap_or_default(),
        })
    }
}

#[derive(Debug)]
pub struct StoreStats {
    pub entities_count: usize,
    pub refs_count: usize,
    pub type_usage_count: usize,
    pub modules_count: usize,
    pub embeddings_count: usize,
    pub files_count: usize,
    pub database_size_bytes: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use crate::schema_v2::SchemaV2;
    
    #[test]
    fn test_entity_crud() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test_entities.db");
        let conn = Connection::open(&db_path)?;
        
        // Initialize schema
        SchemaV2::initialize(&conn)?;
        
        let store = StoreV2::new(&db_path)?;
        
        // Insert entity
        let entity = Entity {
            id: 0,
            kind: EntityKind::Function,
            name: "test_function".to_string(),
            signature: Some("fn test_function() -> Result<()>".to_string()),
            visibility: Visibility::Public,
            parent_id: None,
            file_path: "/test.rs".to_string(),
            line_number: 10,
            column_number: Some(0),
            doc_comment: Some("Test function".to_string()),
            attributes: None,
            metadata: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        
        let entity_id = store.insert_entity(&entity)?;
        assert!(entity_id > 0);
        
        // Retrieve entity
        let retrieved = store.get_entity(entity_id)?;
        assert!(retrieved.is_some());
        
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.name, "test_function");
        assert_eq!(retrieved.kind, EntityKind::Function);
        
        Ok(())
    }
}