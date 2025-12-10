use anyhow::{Result, Context};
use rusqlite::{Connection, params};
use std::path::Path;
use tracing::{info, debug, error};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum EntityKind {
    // Rust entities
    Struct,
    Enum,
    Function,
    Method,
    Trait,
    Impl,
    Module,
    Constant,
    Static,
    TypeAlias,
    Macro,

    // TypeScript entities
    Class,
    Interface,
    Type,
    Variable,
    Parameter,
    Property,
    Constructor,
    Getter,
    Setter,
    Namespace,
    Import,

    // Generic
    File,
    Package,
}

impl EntityKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "struct" => Some(EntityKind::Struct),
            "enum" => Some(EntityKind::Enum),
            "function" => Some(EntityKind::Function),
            "method" => Some(EntityKind::Method),
            "trait" => Some(EntityKind::Trait),
            "impl" => Some(EntityKind::Impl),
            "module" => Some(EntityKind::Module),
            "constant" => Some(EntityKind::Constant),
            "static" => Some(EntityKind::Static),
            "type_alias" => Some(EntityKind::TypeAlias),
            "macro" => Some(EntityKind::Macro),
            "class" => Some(EntityKind::Class),
            "interface" => Some(EntityKind::Interface),
            "type" => Some(EntityKind::Type),
            "variable" => Some(EntityKind::Variable),
            "parameter" => Some(EntityKind::Parameter),
            "property" => Some(EntityKind::Property),
            "constructor" => Some(EntityKind::Constructor),
            "getter" => Some(EntityKind::Getter),
            "setter" => Some(EntityKind::Setter),
            "namespace" => Some(EntityKind::Namespace),
            "import" => Some(EntityKind::Import),
            "file" => Some(EntityKind::File),
            "package" => Some(EntityKind::Package),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            EntityKind::Struct => "struct",
            EntityKind::Enum => "enum",
            EntityKind::Function => "function",
            EntityKind::Method => "method",
            EntityKind::Trait => "trait",
            EntityKind::Impl => "impl",
            EntityKind::Module => "module",
            EntityKind::Constant => "constant",
            EntityKind::Static => "static",
            EntityKind::TypeAlias => "type_alias",
            EntityKind::Macro => "macro",
            EntityKind::Class => "class",
            EntityKind::Interface => "interface",
            EntityKind::Type => "type",
            EntityKind::Variable => "variable",
            EntityKind::Parameter => "parameter",
            EntityKind::Property => "property",
            EntityKind::Constructor => "constructor",
            EntityKind::Getter => "getter",
            EntityKind::Setter => "setter",
            EntityKind::Namespace => "namespace",
            EntityKind::Import => "import",
            EntityKind::File => "file",
            EntityKind::Package => "package",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RefKind {
    Call,
    Calls,
    Import,
    Imports,
    Extend,
    Extends,
    Implement,
    Implements,
    Reference,
    Use,
    Uses,
    Instantiates,
    Overrides,
    Reads,
    Writes,
    TypeParameter,
    GenericConstraint,
}

impl RefKind {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "call" => Some(RefKind::Call),
            "calls" => Some(RefKind::Calls),
            "import" => Some(RefKind::Import),
            "imports" => Some(RefKind::Imports),
            "extend" => Some(RefKind::Extend),
            "extends" => Some(RefKind::Extends),
            "implement" => Some(RefKind::Implement),
            "implements" => Some(RefKind::Implements),
            "reference" => Some(RefKind::Reference),
            "use" => Some(RefKind::Use),
            "uses" => Some(RefKind::Uses),
            "instantiates" => Some(RefKind::Instantiates),
            "overrides" => Some(RefKind::Overrides),
            "reads" => Some(RefKind::Reads),
            "writes" => Some(RefKind::Writes),
            "type_parameter" => Some(RefKind::TypeParameter),
            "generic_constraint" => Some(RefKind::GenericConstraint),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            RefKind::Call => "call",
            RefKind::Calls => "calls",
            RefKind::Import => "import",
            RefKind::Imports => "imports",
            RefKind::Extend => "extend",
            RefKind::Extends => "extends",
            RefKind::Implement => "implement",
            RefKind::Implements => "implements",
            RefKind::Reference => "reference",
            RefKind::Use => "use",
            RefKind::Uses => "uses",
            RefKind::Instantiates => "instantiates",
            RefKind::Overrides => "overrides",
            RefKind::Reads => "reads",
            RefKind::Writes => "writes",
            RefKind::TypeParameter => "type_parameter",
            RefKind::GenericConstraint => "generic_constraint",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Visibility {
    Public,
    Private,
    Protected,
    Crate,
    Internal,
    FilePrivate,
}

impl Visibility {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "public" => Some(Visibility::Public),
            "private" => Some(Visibility::Private),
            "protected" => Some(Visibility::Protected),
            "crate" => Some(Visibility::Crate),
            "internal" => Some(Visibility::Internal),
            "file_private" => Some(Visibility::FilePrivate),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Visibility::Public => "public",
            Visibility::Private => "private",
            Visibility::Protected => "protected",
            Visibility::Crate => "crate",
            Visibility::Internal => "internal",
            Visibility::FilePrivate => "file_private",
        }
    }
}

pub struct SchemaV2;

impl SchemaV2 {
    pub fn initialize(conn: &Connection) -> Result<()> {
        info!("Initializing Schema v2 with entity-based design");

        // Execute schema creation directly on the connection
        // The caller is responsible for transaction management

        // Create entities table - core table for all code entities
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS entities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                signature TEXT,
                visibility TEXT NOT NULL DEFAULT 'private',
                parent_id INTEGER,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                column_number INTEGER,
                doc_comment TEXT,
                attributes TEXT,
                metadata TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                
                FOREIGN KEY (parent_id) REFERENCES entities(id) ON DELETE CASCADE
            );
            
            -- Create refs table for cross-file and intra-file references
            -- Note: target_entity_id can be 0 for unresolved references
            CREATE TABLE IF NOT EXISTS refs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_entity_id INTEGER NOT NULL,
                target_entity_id INTEGER NOT NULL DEFAULT 0,
                target_name TEXT,
                ref_kind TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                column_number INTEGER,
                context TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
            );
            
            -- Create type_usage table for tracking type usage in functions/methods
            CREATE TABLE IF NOT EXISTS type_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id INTEGER NOT NULL,
                type_name TEXT NOT NULL,
                usage_kind TEXT NOT NULL, -- 'parameter', 'return_type', 'local_var', 'field'
                file_path TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                
                FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
            );
            
            -- Create modules table for import/export tracking
            CREATE TABLE IF NOT EXISTS modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                file_path TEXT NOT NULL,
                module_type TEXT NOT NULL, -- 'mod', 'package', 'namespace'
                is_root BOOLEAN NOT NULL DEFAULT FALSE,
                parent_module_id INTEGER,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                
                FOREIGN KEY (parent_module_id) REFERENCES modules(id) ON DELETE CASCADE
            );
            
            -- Create entity_embeddings table for vector search
            CREATE TABLE IF NOT EXISTS entity_embeddings (
                entity_id INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL,
                embedding_model TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
                
                FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
            );
            "#
        )?;

        // Create indexes for performance optimization
        Self::create_indexes(conn)?;

        // Create triggers for maintaining updated_at timestamps
        Self::create_triggers(conn)?;

        info!("Schema v2 initialized successfully");
        Ok(())
    }

    fn create_indexes(conn: &Connection) -> Result<()> {
        debug!("Creating performance indexes");

        conn.execute_batch(
            r#"
            -- Entity indexes for fast lookups
            CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
            CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
            CREATE INDEX IF NOT EXISTS idx_entities_file_path ON entities(file_path);
            CREATE INDEX IF NOT EXISTS idx_entities_parent_id ON entities(parent_id);
            CREATE INDEX IF NOT EXISTS idx_entities_visibility ON entities(visibility);
            
            -- Composite indexes for common query patterns
            CREATE INDEX IF NOT EXISTS idx_entities_kind_name ON entities(kind, name);
            CREATE INDEX IF NOT EXISTS idx_entities_file_kind ON entities(file_path, kind);
            CREATE INDEX IF NOT EXISTS idx_entities_parent_kind ON entities(parent_id, kind);
            
            -- Reference indexes
            CREATE INDEX IF NOT EXISTS idx_refs_source ON refs(source_entity_id);
            CREATE INDEX IF NOT EXISTS idx_refs_target ON refs(target_entity_id);
            CREATE INDEX IF NOT EXISTS idx_refs_kind ON refs(ref_kind);
            CREATE INDEX IF NOT EXISTS idx_refs_file_path ON refs(file_path);
            
            -- Composite reference indexes
            CREATE INDEX IF NOT EXISTS idx_refs_source_kind ON refs(source_entity_id, ref_kind);
            CREATE INDEX IF NOT EXISTS idx_refs_target_kind ON refs(target_entity_id, ref_kind);
            
            -- Type usage indexes
            CREATE INDEX IF NOT EXISTS idx_type_usage_entity ON type_usage(entity_id);
            CREATE INDEX IF NOT EXISTS idx_type_usage_type_name ON type_usage(type_name);
            CREATE INDEX IF NOT EXISTS idx_type_usage_kind ON type_usage(usage_kind);
            
            -- Composite type usage indexes
            CREATE INDEX IF NOT EXISTS idx_type_usage_type_kind ON type_usage(type_name, usage_kind);
            CREATE INDEX IF NOT EXISTS idx_type_usage_entity_type ON type_usage(entity_id, type_name);
            
            -- Module indexes
            CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name);
            CREATE INDEX IF NOT EXISTS idx_modules_file_path ON modules(file_path);
            CREATE INDEX IF NOT EXISTS idx_modules_parent ON modules(parent_module_id);
            
            -- Entity-module relationship index (via file path)
            CREATE INDEX IF NOT EXISTS idx_entities_module_lookup ON entities(file_path);
            "#
        )?;

        Ok(())
    }

    fn create_triggers(conn: &Connection) -> Result<()> {
        debug!("Creating database triggers");

        conn.execute_batch(
            r#"
            -- Trigger to update updated_at timestamp on entity modification
            CREATE TRIGGER IF NOT EXISTS update_entity_timestamp
                AFTER UPDATE ON entities
                FOR EACH ROW
            BEGIN
                UPDATE entities SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
            END;
            "#
        )?;

        Ok(())
    }
    
    /// Migrate from v1 schema to v2 schema
    pub fn migrate_v1_to_v2(conn: &mut Connection) -> Result<()> {
        info!("Starting migration from v1 to v2 schema");
        
        // Check if v1 tables exist
        let has_v1_tables = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('embeddings', 'files')"
        )?.exists([])?;
        
        if !has_v1_tables {
            info!("No v1 tables found, skipping migration");
            return Ok(());
        }
        
        let tx = conn.transaction()?;
        
        // Step 1: Create new v2 schema
        Self::initialize(&tx)?;
        
        // Step 2: Migrate file data
        info!("Migrating file metadata");
        tx.execute(
            r#"
            INSERT OR IGNORE INTO files (path, hash, last_indexed, patterns_count)
            SELECT path, hash, last_indexed, patterns_count FROM old_files
            "#,
            [],
        )?;
        
        // Step 3: Parse v1 embeddings and extract entities
        info!("Migrating embeddings and extracting entities");
        {
            let mut stmt = tx.prepare(
                "SELECT pattern, embedding, metadata, created_at, file_hash FROM old_embeddings"
            )?;

            let mut rows = stmt.query([])?;
            while let Some(row) = rows.next()? {
                let pattern: String = row.get(0)?;
                let embedding: Vec<u8> = row.get(1)?;
                let metadata: String = row.get(2)?;
                let created_at: u64 = row.get(3)?;
                let _file_hash: String = row.get(4)?;

                // Parse metadata to extract entity information
                if let Ok(index_metadata) = serde_json::from_str::<crate::search_engine::IndexMetadata>(&metadata) {
                    // Try to extract entity kind from pattern
                    let kind = Self::infer_entity_kind(&pattern);
                    let name = Self::extract_entity_name(&pattern, kind.as_str());
                    let visibility = Self::infer_visibility(&pattern);

                    // Insert entity
                    let entity_id = tx.query_row(
                        r#"
                        INSERT INTO entities (kind, name, signature, visibility, file_path, line_number, created_at)
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                        RETURNING id
                        "#,
                        params![
                            kind.as_str(),
                            name,
                            pattern,
                            visibility.as_str(),
                            index_metadata.path,
                            index_metadata.line_number.unwrap_or(0) as i64,
                            created_at
                        ],
                        |row| row.get::<_, i64>(0)
                    )?;

                    // Insert embedding
                    tx.execute(
                        "INSERT INTO entity_embeddings (entity_id, embedding, embedding_model) VALUES (?1, ?2, ?3)",
                        params![entity_id, embedding, "text-embedding-ada-002"]
                    )?;
                }
            }
        }
        
        // Step 4: Create backup of old tables and drop them
        info!("Creating backup of v1 tables");
        tx.execute_batch(
            r#"
            ALTER TABLE embeddings RENAME TO embeddings_v1_backup;
            ALTER TABLE files RENAME TO files_v1_backup;
            "#
        )?;
        
        tx.commit()?;
        
        info!("Migration from v1 to v2 completed successfully");
        Ok(())
    }
    
    fn infer_entity_kind(pattern: &str) -> EntityKind {
        // Simple heuristic to infer entity kind from pattern
        if pattern.starts_with("struct ") || pattern.contains(" struct ") {
            EntityKind::Struct
        } else if pattern.starts_with("enum ") || pattern.contains(" enum ") {
            EntityKind::Enum
        } else if pattern.starts_with("fn ") || pattern.contains(" fn ") {
            EntityKind::Function
        } else if pattern.starts_with("impl ") || pattern.contains(" impl ") {
            EntityKind::Impl
        } else if pattern.starts_with("trait ") || pattern.contains(" trait ") {
            EntityKind::Trait
        } else if pattern.starts_with("mod ") || pattern.contains(" mod ") {
            EntityKind::Module
        } else if pattern.starts_with("const ") || pattern.contains(" const ") {
            EntityKind::Constant
        } else if pattern.starts_with("static ") || pattern.contains(" static ") {
            EntityKind::Static
        } else if pattern.starts_with("type ") || pattern.contains(" type ") {
            EntityKind::TypeAlias
        } else if pattern.starts_with("macro_rules!") || pattern.contains("macro_rules!") {
            EntityKind::Macro
        } else if pattern.starts_with("class ") || pattern.contains(" class ") {
            EntityKind::Class
        } else if pattern.starts_with("interface ") || pattern.contains(" interface ") {
            EntityKind::Interface
        } else {
            EntityKind::Function // Default fallback
        }
    }
    
    fn extract_entity_name(pattern: &str, kind: &str) -> String {
        // Extract name from pattern based on entity kind
        let pattern = pattern.trim();
        
        match kind {
            "struct" | "enum" | "trait" | "impl" | "mod" | "class" | "interface" => {
                if let Some(start) = pattern.find(kind) {
                    let after = &pattern[start + kind.len()..].trim();
                    // Extract name before any < or { or :
                    if let Some(end) = after.find(['<', '{', ':', '(']) {
                        after[..end].trim().to_string()
                    } else {
                        after.split_whitespace().next().unwrap_or("").to_string()
                    }
                } else {
                    "unknown".to_string()
                }
            },
            "function" | "method" => {
                if let Some(start) = pattern.find("fn ") {
                    let after = &pattern[start + 3..].trim();
                    // Extract function name before (
                    if let Some(end) = after.find('(') {
                        after[..end].trim().to_string()
                    } else {
                        after.split_whitespace().next().unwrap_or("").to_string()
                    }
                } else {
                    "unknown".to_string()
                }
            },
            "constant" | "static" => {
                let keyword = if pattern.starts_with("const ") { "const " } else { "static " };
                if let Some(start) = pattern.find(keyword) {
                    let after = &pattern[start + keyword.len()..].trim();
                    // Extract name before :
                    if let Some(end) = after.find(':') {
                        after[..end].trim().to_string()
                    } else {
                        after.split_whitespace().next().unwrap_or("").to_string()
                    }
                } else {
                    "unknown".to_string()
                }
            },
            _ => pattern.split_whitespace().next().unwrap_or("unknown").to_string()
        }
    }
    
    fn infer_visibility(pattern: &str) -> Visibility {
        if pattern.contains("pub ") || pattern.starts_with("pub") {
            Visibility::Public
        } else if pattern.contains("pub(crate)") {
            Visibility::Crate
        } else {
            Visibility::Private
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::tempdir;
    
    #[test]
    fn test_schema_initialization() -> Result<()> {
        let dir = tempdir()?;
        let db_path = dir.path().join("test.db");
        let conn = Connection::open(db_path)?;
        
        SchemaV2::initialize(&conn)?;
        
        // Verify tables exist
        let tables = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )?.query_map([], |row| row.get::<_, String>(0))?;
        
        let table_names: Vec<String> = tables.collect::<Result<Vec<_>, _>>()?;
        assert!(table_names.contains(&"entities".to_string()));
        assert!(table_names.contains(&"refs".to_string()));
        assert!(table_names.contains(&"type_usage".to_string()));
        assert!(table_names.contains(&"modules".to_string()));
        assert!(table_names.contains(&"entity_embeddings".to_string()));
        
        Ok(())
    }
    
    #[test]
    fn test_entity_kinds() -> Result<()> {
        assert_eq!(EntityKind::from_str("struct").unwrap().as_str(), "struct");
        assert_eq!(EntityKind::from_str("class").unwrap().as_str(), "class");
        assert!(EntityKind::from_str("invalid").is_none());
        Ok(())
    }
    
    #[test]
    fn test_entity_name_extraction() -> Result<()> {
        assert_eq!(
            SchemaV2::extract_entity_name("struct MyStruct { field: i32 }", "struct"),
            "MyStruct"
        );
        assert_eq!(
            SchemaV2::extract_entity_name("fn my_function() -> Result<()>", "function"),
            "my_function"
        );
        assert_eq!(
            SchemaV2::extract_entity_name("impl MyStruct for Trait", "impl"),
            "MyStruct"
        );
        Ok(())
    }
}
