// Transaction-aware migration module with proper error handling and rollback
use anyhow::{Result, Context, anyhow};
use rusqlite::{Connection, params, Transaction};
use tracing::{info, debug, error, warn};
use std::collections::HashMap;

use crate::schema_v2::{SchemaV2, EntityKind, Visibility};
use crate::search_engine::IndexMetadata;

pub struct MigrationWithTx;

impl MigrationWithTx {
    pub fn migrate_v1_to_v2_atomic(conn: &mut Connection) -> Result<()> {
        info!("Starting atomic migration from v1 to v2 schema");

        // Check if v1 tables exist
        let has_v1_tables = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('embeddings', 'files')"
        )?.exists([])?;

        if !has_v1_tables {
            info!("No v1 tables found, skipping migration");
            return Ok(());
        }

        // Use a transaction for atomic operations
        let tx = conn.transaction()?;

        // Ensure atomic migration - if anything fails, rollback everything
        let migration_result = (|| {
            // Step 1: Create new v2 schema
            info!("Creating v2 schema");
            SchemaV2::initialize(&tx)?;

            // Step 2: Migrate file data
            info!("Migrating file metadata");
            Self::migrate_files(&tx)?;

            // Step 3: Migrate embeddings and entities in batches
            info!("Migrating embeddings and extracting entities");
            Self::migrate_embeddings_batch(&tx)?;

            // Step 4: Create backup of old tables and drop them
            info!("Creating backup of v1 tables");
            tx.execute_batch(
                r#"
                ALTER TABLE embeddings RENAME TO embeddings_v1_backup;
                ALTER TABLE files RENAME TO files_v1_backup;
                "#
            )?;

            Ok::<(), anyhow::Error>(())
        })();

        match migration_result {
            Ok(()) => {
                tx.commit()?;
                info!("Migration from v1 to v2 completed successfully");
                Ok(())
            }
            Err(e) => {
                error!("Migration failed: {}. Rolling back changes.", e);
                tx.rollback()?;
                Err(anyhow!("Migration failed and was rolled back: {}", e))
            }
        }
    }

    fn migrate_files(tx: &Transaction) -> Result<()> {
        // First check if old_files table exists
        let old_files_exists = tx.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='old_files'"
        )?.exists([])?;

        if !old_files_exists {
            warn!("old_files table not found, skipping file migration");
            return Ok(());
        }

        // Backup the old files table first
        tx.execute("CREATE TEMPORARY TABLE files_backup AS SELECT * FROM old_files", [])?;

        // Migrate in batches to avoid long-running transactions
        let batch_size = 1000;
        let mut offset = 0;
        let mut migrated_count = 0;

        loop {
            let mut stmt = tx.prepare(
                "SELECT path, hash, last_indexed, patterns_count FROM old_files LIMIT ? OFFSET ?"
            )?;

            let mut rows = stmt.query([batch_size, offset])?;
            let mut batch_count = 0usize;

            while let Some(row) = rows.next()? {
                let path: String = row.get(0)?;
                let hash: String = row.get(1)?;
                let last_indexed: Option<u64> = row.get(2)?;
                let patterns_count: Option<u32> = row.get(3)?;

                tx.execute(
                    "INSERT OR IGNORE INTO files (path, hash, last_indexed, patterns_count) VALUES (?1, ?2, ?3, ?4)",
                    params![path, hash, last_indexed, patterns_count]
                )?;
                batch_count += 1;
            }

            migrated_count += batch_count;

            if batch_count < batch_size {
                break;
            }

            offset += batch_size;
            debug!("Migrated {} files so far...", migrated_count);
        }

        info!("Migrated {} files", migrated_count);
        Ok(())
    }

    fn migrate_embeddings_batch(tx: &Transaction) -> Result<()> {
        // First check if old_embeddings table exists
        let old_embeddings_exists = tx.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='old_embeddings'"
        )?.exists([])?;

        if !old_embeddings_exists {
            warn!("old_embeddings table not found, skipping embedding migration");
            return Ok(());
        }

        // Prepare statements for batch operations
        let mut insert_entity_stmt = tx.prepare(
            r#"
            INSERT INTO entities (
                kind, name, signature, visibility, file_path, line_number, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            RETURNING id
            "#
        )?;

        let mut insert_embedding_stmt = tx.prepare(
            "INSERT INTO entity_embeddings (entity_id, embedding, embedding_model) VALUES (?1, ?2, ?3)"
        )?;

        // Migration statistics
        let mut total_count = 0;
        let mut success_count = 0;
        let mut error_count = 0;
        let batch_size = 100;

        // Get total count for progress reporting
        let total_embeddings: u64 = tx.query_row(
            "SELECT COUNT(*) FROM old_embeddings",
            [],
            |row| row.get(0)
        ).unwrap_or(0);

        info!("Migrating {} embeddings", total_embeddings);

        // Process in batches
        let mut offset = 0;
        loop {
            let mut stmt = tx.prepare(
                "SELECT id, pattern, embedding, metadata, created_at, file_hash FROM old_embeddings LIMIT ? OFFSET ?"
            )?;

            let mut rows = stmt.query([batch_size, offset])?;
            let mut batch_count = 0;
            let mut batch_success = 0;

            while let Some(row) = rows.next()? {
                let old_id: i64 = row.get(0)?;
                let pattern: String = row.get(1)?;
                let embedding: Vec<u8> = row.get(2)?;
                let metadata: String = row.get(3)?;
                let created_at: u64 = row.get(4)?;
                let _file_hash: String = row.get(5)?;

                batch_count += 1;

                // Parse metadata to extract entity information
                match serde_json::from_str::<IndexMetadata>(&metadata) {
                    Ok(index_metadata) => {
                        // Try to extract entity information
                        let kind = Self::infer_entity_kind(&pattern);
                        let name = Self::extract_entity_name(&pattern, kind.as_str());
                        let visibility = Self::infer_visibility(&pattern);

                        // Insert entity
                        let entity_id = insert_entity_stmt.query_row(
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
                        insert_embedding_stmt.execute(
                            params![entity_id, embedding, "text-embedding-ada-002"]
                        )?;

                        batch_success += 1;
                        success_count += 1;
                    }
                    Err(e) => {
                        // Try to create a basic entity even if metadata parsing fails
                        warn!("Failed to parse metadata for embedding {}: {}. Creating basic entity.", old_id, e);

                        let kind = EntityKind::Function; // Default
                        let name = Self::extract_entity_name(&pattern, kind.as_str());
                        let visibility = Visibility::Public;
                        let file_path = "unknown".to_string();
                        let line_number = 0i64;

                        // Insert basic entity
                        let entity_id = insert_entity_stmt.query_row(
                            params![
                                kind.as_str(),
                                name,
                                pattern,
                                visibility.as_str(),
                                file_path,
                                line_number,
                                created_at
                            ],
                            |row| row.get::<_, i64>(0)
                        )?;

                        // Insert embedding
                        insert_embedding_stmt.execute(
                            params![entity_id, embedding, "text-embedding-ada-002"]
                        )?;

                        batch_success += 1;
                        success_count += 1;
                    }
                }
            }

            total_count += batch_count;
            let batch_errors = batch_count - batch_success;
            error_count += batch_errors;

            if batch_count == 0 {
                break;
            }

            offset += batch_size;

            // Progress reporting
            if total_count % (batch_size * 10) == 0 {
                info!("Migration progress: {}/{} embeddings ({:.1}%), {} errors",
                      total_count, total_embeddings,
                      (total_count as f64 / total_embeddings as f64) * 100.0,
                      error_count);
            }
        }

        info!("Migration completed: {} total, {} successful, {} errors",
              total_count, success_count, error_count);

        if error_count > 0 {
            warn!("Migration completed with {} errors", error_count);
        }

        Ok(())
    }

    fn infer_entity_kind(pattern: &str) -> EntityKind {
        // Enhanced heuristic to infer entity kind from pattern
        let pattern_lower = pattern.to_lowercase();

        if pattern.starts_with("struct ") || pattern_lower.contains(" struct ") {
            EntityKind::Struct
        } else if pattern.starts_with("enum ") || pattern_lower.contains(" enum ") {
            EntityKind::Enum
        } else if pattern.starts_with("fn ") || pattern_lower.contains(" fn ") {
            EntityKind::Function
        } else if pattern.starts_with("impl ") || pattern_lower.contains(" impl ") {
            EntityKind::Impl
        } else if pattern.starts_with("trait ") || pattern_lower.contains(" trait ") {
            EntityKind::Trait
        } else if pattern.starts_with("mod ") || pattern_lower.contains(" mod ") {
            EntityKind::Module
        } else if pattern.starts_with("const ") || pattern_lower.contains(" const ") {
            EntityKind::Constant
        } else if pattern.starts_with("static ") || pattern_lower.contains(" static ") {
            EntityKind::Static
        } else if pattern.starts_with("type ") || pattern_lower.contains(" type ") {
            EntityKind::TypeAlias
        } else if pattern.starts_with("macro_rules!") || pattern_lower.contains("macro_rules!") {
            EntityKind::Macro
        } else if pattern.starts_with("class ") || pattern_lower.contains(" class ") {
            EntityKind::Class
        } else if pattern.starts_with("interface ") || pattern_lower.contains(" interface ") {
            EntityKind::Interface
        } else if pattern_lower.contains("->") || pattern_lower.contains("return") {
            EntityKind::Function // Likely a function/method
        } else if pattern_lower.contains("{") && pattern_lower.contains("}") {
            EntityKind::Struct // Could be a struct definition
        } else {
            EntityKind::Function // Default fallback
        }
    }

    fn extract_entity_name(pattern: &str, kind: &str) -> String {
        // Enhanced name extraction logic
        let pattern = pattern.trim();

        // Look for specific patterns based on kind
        match kind {
            "struct" | "enum" | "trait" | "impl" | "mod" | "class" | "interface" => {
                let keyword = if kind == "impl" { "impl" } else { kind };
                if let Some(start) = pattern.find(keyword) {
                    let after = &pattern[start + keyword.len()..].trim();

                    // Handle impl special cases (impl Trait for Struct)
                    if kind == "impl" {
                        if let Some(for_pos) = after.find("for") {
                            let before_for = &after[..for_pos].trim();
                            if let Some(end) = before_for.find(['<', '{']) {
                                return before_for[..end].trim().to_string();
                            }
                            return before_for.split_whitespace().next().unwrap_or("").to_string();
                        }
                    }

                    // Extract name before any < or { or : or (
                    if let Some(end) = after.find(['<', '{', ':', '(', ' ']) {
                        after[..end].trim().to_string()
                    } else {
                        after.split_whitespace().next().unwrap_or("").to_string()
                    }
                } else {
                    // Try to extract using regex as fallback
                    Self::extract_name_fallback(pattern)
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
                    // Try to find any identifier followed by (
                    if let Some(paren) = pattern.find('(') {
                        let before = &pattern[..paren].trim();
                        before.split_whitespace().last().unwrap_or("unknown").to_string()
                    } else {
                        Self::extract_name_fallback(pattern)
                    }
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
                    Self::extract_name_fallback(pattern)
                }
            },
            "typealias" => {
                if let Some(start) = pattern.find("type ") {
                    let after = &pattern[start + 5..].trim();
                    // Extract name before =
                    if let Some(end) = after.find('=') {
                        after[..end].trim().to_string()
                    } else {
                        after.split_whitespace().next().unwrap_or("").to_string()
                    }
                } else {
                    Self::extract_name_fallback(pattern)
                }
            },
            _ => Self::extract_name_fallback(pattern),
        }
    }

    fn extract_name_fallback(pattern: &str) -> String {
        // Fallback: extract the first camel case or snake_case identifier
        use regex::Regex;

        if let Ok(re) = Regex::new(r"[a-zA-Z_][a-zA-Z0-9_]*") {
            if let Some(m) = re.find(pattern) {
                m.as_str().to_string()
            } else {
                "unknown".to_string()
            }
        } else {
            "unknown".to_string()
        }
    }

    fn infer_visibility(pattern: &str) -> Visibility {
        // Infer visibility from pattern
        if pattern.contains("pub ") || pattern.starts_with("pub ") {
            Visibility::Public
        } else if pattern.contains("pub(crate)") {
            Visibility::Private // Limited to crate
        } else if pattern.contains("pub(super)") {
            Visibility::Private // Limited to parent module
        } else {
            Visibility::Private // Default to private
        }
    }

    /// Validates migration was successful
    pub fn validate_migration(conn: &Connection) -> Result<()> {
        info!("Validating migration results");

        // Check if v2 tables exist
        let v2_tables = [
            "entities", "refs", "type_usage", "modules",
            "entity_embeddings", "files", "file_hashes"
        ];

        for table in &v2_tables {
            let exists = conn.prepare(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?"
            )?.exists([table])?;

            if !exists {
                return Err(anyhow!("Missing v2 table: {}", table));
            }
        }

        // Check data integrity
        let entity_count: u64 = conn.query_row(
            "SELECT COUNT(*) FROM entities",
            [],
            |row| row.get(0)
        )?;

        let embedding_count: u64 = conn.query_row(
            "SELECT COUNT(*) FROM entity_embeddings",
            [],
            |row| row.get(0)
        )?;

        // Check if all embeddings have corresponding entities
        let orphaned_embeddings: u64 = conn.query_row(
            "SELECT COUNT(*) FROM entity_embeddings ee LEFT JOIN entities e ON ee.entity_id = e.id WHERE e.id IS NULL",
            [],
            |row| row.get(0)
        )?;

        if orphaned_embeddings > 0 {
            warn!("Found {} orphaned embeddings", orphaned_embeddings);
        }

        info!("Migration validation complete: {} entities, {} embeddings",
              entity_count, embedding_count);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_entity_name_extraction() {
        // Test various patterns
        assert_eq!(
            MigrationWithTx::extract_entity_name("struct MyStruct { field: i32 }", "struct"),
            "MyStruct"
        );

        assert_eq!(
            MigrationWithTx::extract_entity_name("fn my_function() -> Result<()>", "function"),
            "my_function"
        );

        assert_eq!(
            MigrationWithTx::extract_entity_name("impl MyTrait for MyStruct", "impl"),
            "MyTrait"
        );
    }

    #[test]
    fn test_visibility_inference() {
        assert_eq!(
            MigrationWithTx::infer_visibility("pub fn public_function()"),
            Visibility::Public
        );

        assert_eq!(
            MigrationWithTx::infer_visibility("fn private_function()"),
            Visibility::Private
        );
    }
}