use anyhow::Result;
use rusqlite::params;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use tracing::{info, debug, warn};

use crate::store_v2::{StoreV2, Entity, Reference, TypeUsage};
use crate::schema_v2::{EntityKind, RefKind, Visibility};

/// High-level query API for agent use cases
pub struct QueryApi {
    store: StoreV2,
}

impl QueryApi {
    pub fn new(store: StoreV2) -> Self {
        Self { store }
    }

    /// Query 1: Find all functions using a specific type
    ///
    /// Example: Find all functions using the type 'Album'
    pub fn find_functions_using_type(&self, type_name: &str) -> Result<QueryResult> {
        debug!("Finding functions using type: {}", type_name);

        // Input validation
        if type_name.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::FunctionsUsingType { type_name: type_name.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT DISTINCT e.*
            FROM entities e
            JOIN type_usage tu ON e.id = tu.entity_id
            WHERE e.kind = 'function'
            AND tu.type_name = ?
            ORDER BY e.file_path, e.line_number
        "#;

        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map([type_name], |row| {
            self.store.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::FunctionsUsingType { type_name: type_name.to_string() },
            results,
            total_count,
        })
    }

    /// Query 2: Find all callers of a specific function
    ///
    /// Example: Find all functions that call 'create_album'
    pub fn find_callers_of_function(&self, function_name: &str, exclude_module: Option<&str>) -> Result<QueryResult> {
        debug!("Finding callers of function: {}", function_name);

        // Input validation
        if function_name.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::CallersOfFunction {
                    function_name: function_name.to_string(),
                    exclude_module: exclude_module.map(|s| s.to_string()),
                },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT DISTINCT caller.*
            FROM entities caller
            JOIN refs r ON caller.id = r.source_entity_id
            JOIN entities target ON r.target_entity_id = target.id
            WHERE r.ref_kind = 'call'
            AND target.name = ?
            AND (? IS NULL OR caller.file_path NOT LIKE ?)
            ORDER BY caller.file_path, caller.line_number
        "#;

        let exclude_pattern = exclude_module.map(|m| format!("%{}%", m));
        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map(
            params![function_name, exclude_module, exclude_pattern],
            |row| {
                self.store.row_to_entity(row)
            }
        )?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::CallersOfFunction {
                function_name: function_name.to_string(),
                exclude_module: exclude_module.map(|s| s.to_string()),
            },
            results,
            total_count,
        })
    }

    /// Query 3: Find types defined in a file that are used elsewhere
    ///
    /// Example: Find all types from 'module.rs' that are used in other files
    pub fn find_types_used_elsewhere(&self, file_path: &str) -> Result<QueryResult> {
        debug!("Finding types from {} used elsewhere", file_path);

        // Input validation
        if file_path.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::TypesUsedElsewhere { file_path: file_path.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT DISTINCT e.*
            FROM entities e
            WHERE e.kind IN ('struct', 'enum', 'trait', 'interface', 'class', 'type_alias')
            AND e.file_path = ?
            AND e.id IN (
                SELECT DISTINCT tu.type_name
                FROM type_usage tu
                WHERE tu.file_path != ?
            )
            ORDER BY e.name
        "#;

        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map([file_path, file_path], |row| {
            self.store.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::TypesUsedElsewhere { file_path: file_path.to_string() },
            results,
            total_count,
        })
    }

    /// Query 4: Find all implementations of a trait/interface
    ///
    /// Example: Find all implementations of the 'Display' trait
    pub fn find_implementations(&self, trait_name: &str) -> Result<QueryResult> {
        debug!("Finding implementations of trait: {}", trait_name);

        // Input validation
        if trait_name.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::Implementations { trait_name: trait_name.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT DISTINCT impl_block.*
            FROM entities impl_block
            JOIN refs r ON impl_block.id = r.source_entity_id
            JOIN entities trait ON r.target_entity_id = trait.id
            WHERE impl_block.kind = 'impl'
            AND r.ref_kind = 'implement'
            AND trait.name = ?
            ORDER BY impl_block.file_path, impl_block.line_number
        "#;

        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map([trait_name], |row| {
            self.store.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::Implementations { trait_name: trait_name.to_string() },
            results,
            total_count,
        })
    }

    /// Query 5: Get the public API surface of a module
    ///
    /// Example: Find all public entities in the 'auth' module
    pub fn find_public_api(&self, module_path: &str) -> Result<QueryResult> {
        debug!("Finding public API for module: {}", module_path);

        // Input validation
        if module_path.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::PublicAPI { module_path: module_path.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT e.*
            FROM entities e
            WHERE e.visibility = 'public'
            AND e.file_path LIKE ?
            ORDER BY e.kind, e.name
        "#;

        let pattern = format!("%{}%", module_path);
        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map([pattern], |row| {
            self.store.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::PublicAPI { module_path: module_path.to_string() },
            results,
            total_count,
        })
    }

    /// Query 6: Find all references to a path (for refactoring)
    ///
    /// Example: Find all references to 'crate::models::Album'
    pub fn find_references_to_path(&self, path: &str) -> Result<QueryResult> {
        debug!("Finding references to path: {}", path);

        // Input validation
        if path.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::ReferencesToPath { path: path.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        // First, find entities that match this path
        let find_entities_query = r#"
            SELECT id, kind, name, signature, visibility, parent_id, file_path, line_number,
                   column_number, doc_comment, attributes, metadata, created_at, updated_at
            FROM entities
            WHERE signature LIKE ? OR name = ?
        "#;

        let pattern = format!("%{}%", path);
        let mut stmt = self.store.conn.prepare(find_entities_query)?;
        let mut matching_entities = Vec::new();
        let rows = stmt.query_map([pattern.as_str(), path], |row| {
            Ok((
                row.get::<_, i64>(0)?,           // id
                row.get::<_, String>(1)?,        // kind
                row.get::<_, String>(2)?,        // name
                row.get::<_, Option<String>>(3)?,  // signature
                row.get::<_, String>(4)?,        // visibility
                row.get::<_, Option<i64>>(5)?,   // parent_id
                row.get::<_, String>(6)?,        // file_path
                row.get::<_, i64>(7)?,           // line_number
                row.get::<_, Option<i64>>(8)?,   // column_number
                row.get::<_, Option<String>>(9)?,  // doc_comment
                row.get::<_, Option<String>>(10)?,  // attributes
                row.get::<_, Option<String>>(11)?,  // metadata
                row.get::<_, String>(12)?,       // project_root
                row.get::<_, i64>(13)?,          // created_at
                row.get::<_, i64>(14)?,          // updated_at
            ))
        })?;

        for row in rows {
            let row = row?;
            let (id, kind_str, name, signature, visibility_str, parent_id, file_path, line_number, column_number, doc_comment, attributes, metadata, project_root, created_at, updated_at) = row;
            // For now, just create a simple entity - the full parsing can be done later
            // This is just to get the IDs for reference finding
            matching_entities.push(crate::store_v2::Entity {
                id,
                kind: crate::schema_v2::EntityKind::from_str(&kind_str).unwrap_or(crate::schema_v2::EntityKind::Function),
                name,
                signature,
                visibility: crate::schema_v2::Visibility::from_str(&visibility_str).unwrap_or(crate::schema_v2::Visibility::Private),
                parent_id,
                file_path,
                line_number,
                column_number,
                doc_comment,
                attributes,
                metadata,
                project_root,
                created_at: chrono::DateTime::from_timestamp(created_at, 0).unwrap_or_default(),
                updated_at: chrono::DateTime::from_timestamp(updated_at, 0).unwrap_or_default(),
            });
        }

        // Then find all references to these entities
        let mut all_refs = Vec::new();

        for entity in matching_entities {
            let ref_query = r#"
                SELECT r.*, e.*
                FROM refs r
                JOIN entities e ON r.source_entity_id = e.id
                WHERE r.target_entity_id = ?
                ORDER BY e.file_path, e.line_number
            "#;

            let mut ref_stmt = self.store.conn.prepare(ref_query)?;
            let refs = ref_stmt.query_map([entity.id], |row| {
                // Create a dummy entity for now - this needs proper implementation
                let ref_entity = crate::store_v2::Entity {
                    id: row.get(8)?,
                    kind: crate::schema_v2::EntityKind::Function,
                    name: "".to_string(),
                    signature: None,
                    visibility: crate::schema_v2::Visibility::Private,
                    parent_id: None,
                    file_path: "".to_string(),
                    line_number: 0,
                    column_number: None,
                    doc_comment: None,
                    attributes: None,
                    metadata: None,
                    project_root: "".to_string(),
                    created_at: chrono::DateTime::from_timestamp(0, 0).unwrap_or_default(),
                    updated_at: chrono::DateTime::from_timestamp(0, 0).unwrap_or_default(),
                };
                Ok((Reference {
                    id: row.get(0)?,
                    source_entity_id: row.get(1)?,
                    target_entity_id: row.get(2)?,
                    ref_kind: RefKind::from_str(&row.get::<_, String>(3)?).unwrap_or(RefKind::Reference),
                    file_path: row.get(4)?,
                    line_number: row.get(5)?,
                    column_number: row.get(6)?,
                    context: row.get(7)?,
                    created_at: chrono::DateTime::from_timestamp(row.get(9)?, 0).unwrap_or_default(),
                }, ref_entity))
            })?.collect::<Result<Vec<_>, _>>()?;

            all_refs.extend(refs);
        }

        let results: Vec<QueryResultItem> = all_refs.into_iter().map(|(r, e)| {
            QueryResultItem {
                entity: e,
                context: r.context,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::ReferencesToPath { path: path.to_string() },
            results,
            total_count,
        })
    }

    /// Get type usage statistics for a file
    pub fn get_type_usage_stats(&self, file_path: &str) -> Result<TypeUsageStats> {
        debug!("Getting type usage statistics for: {}", file_path);

        // Input validation
        if file_path.is_empty() {
            return Ok(TypeUsageStats {
                file_path: file_path.to_string(),
                total_unique_types: 0,
                stats: vec![],
            });
        }

        let query = r#"
            SELECT e.name, COUNT(*) as usage_count
            FROM entities e
            JOIN type_usage tu ON e.name = tu.type_name
            WHERE e.file_path LIKE ?
            AND e.kind IN ('struct', 'enum', 'trait', 'interface', 'class', 'type_alias')
            GROUP BY e.name
            ORDER BY usage_count DESC
        "#;

        let pattern = format!("%{}%", file_path);
        let mut stmt = self.store.conn.prepare(query)?;
        let stats = stmt.query_map([pattern], |row| {
            Ok(TypeUsageStat {
                type_name: row.get(0)?,
                usage_count: row.get(1)?,
            })
        })?.collect::<Result<Vec<_>, _>>()?;

        Ok(TypeUsageStats {
            file_path: file_path.to_string(),
            total_unique_types: stats.len(),
            stats,
        })
    }

    /// Advanced query: Find functions by signature pattern
    pub fn find_functions_by_pattern(&self, pattern: &str) -> Result<QueryResult> {
        debug!("Finding functions matching pattern: {}", pattern);

        // Input validation
        if pattern.is_empty() {
            return Ok(QueryResult {
                query_type: QueryType::FunctionPattern { pattern: pattern.to_string() },
                results: vec![],
                total_count: 0,
            });
        }

        let query = r#"
            SELECT * FROM entities
            WHERE kind = 'function'
            AND (signature LIKE ? OR name LIKE ?)
            ORDER BY file_path, line_number
        "#;

        let pattern_like = format!("%{}%", pattern);
        let mut stmt = self.store.conn.prepare(query)?;
        let entities = stmt.query_map([pattern_like.as_str(), pattern_like.as_str()], |row| {
            self.store.row_to_entity(row)
        })?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
            .map_err(|e| anyhow::anyhow!("Failed to fetch entities: {}", e))?;

        let results: Vec<QueryResultItem> = entities.into_iter().map(|e| {
            QueryResultItem {
                entity: e,
                context: None,
                score: 1.0,
            }
        }).collect();

        let total_count = results.len();
        Ok(QueryResult {
            query_type: QueryType::FunctionPattern { pattern: pattern.to_string() },
            results,
            total_count,
        })
    }
}

/// Result types for the query API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub query_type: QueryType,
    pub results: Vec<QueryResultItem>,
    pub total_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResultItem {
    pub entity: Entity,
    pub context: Option<String>,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "params")]
pub enum QueryType {
    FunctionsUsingType { type_name: String },
    CallersOfFunction {
        function_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        exclude_module: Option<String>,
    },
    TypesUsedElsewhere { file_path: String },
    Implementations { trait_name: String },
    PublicAPI { module_path: String },
    ReferencesToPath { path: String },
    FunctionPattern { pattern: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeUsageStats {
    pub file_path: String,
    pub stats: Vec<TypeUsageStat>,
    pub total_unique_types: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeUsageStat {
    pub type_name: String,
    pub usage_count: i64,
}

/// Utility trait for converting query results to different formats
pub trait QueryResultFormatter {
    fn format_simple(&self) -> String;
    fn format_json(&self) -> Result<String>;
    fn format_detailed(&self) -> String;
}

impl QueryResultFormatter for QueryResult {
    fn format_simple(&self) -> String {
        self.results.iter()
            .map(|item| format!("{}:{} - {}",
                item.entity.file_path,
                item.entity.line_number,
                item.entity.name))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn format_json(&self) -> Result<String> {
        Ok(serde_json::to_string_pretty(self)?)
    }

    fn format_detailed(&self) -> String {
        let mut output = String::new();

        match &self.query_type {
            QueryType::FunctionsUsingType { type_name } => {
                output.push_str(&format!("Functions using type '{}':\n", type_name));
            }
            QueryType::CallersOfFunction { function_name, exclude_module } => {
                output.push_str(&format!("Callers of function '{}'", function_name));
                if let Some(module) = exclude_module {
                    output.push_str(&format!(" (excluding {})", module));
                }
                output.push_str(":\n");
            }
            QueryType::TypesUsedElsewhere { file_path } => {
                output.push_str(&format!("Types from {} used elsewhere:\n", file_path));
            }
            QueryType::Implementations { trait_name } => {
                output.push_str(&format!("Implementations of trait '{}':\n", trait_name));
            }
            QueryType::PublicAPI { module_path } => {
                output.push_str(&format!("Public API for module '{}':\n", module_path));
            }
            QueryType::ReferencesToPath { path } => {
                output.push_str(&format!("References to path '{}':\n", path));
            }
            QueryType::FunctionPattern { pattern } => {
                output.push_str(&format!("Functions matching pattern '{}':\n", pattern));
            }
        }

        for (i, item) in self.results.iter().enumerate() {
            output.push_str(&format!("\n  {}. {} ({}:{}): {}\n",
                i + 1,
                item.entity.name,
                item.entity.file_path,
                item.entity.line_number,
                item.entity.kind.as_str()
            ));

            if let Some(signature) = &item.entity.signature {
                output.push_str(&format!("     {}\n", signature));
            }

            if let Some(doc) = &item.entity.doc_comment {
                let first_line = doc.lines().next().unwrap_or("");
                if !first_line.is_empty() {
                    output.push_str(&format!("     /// {}\n", first_line));
                }
            }
        }

        output.push_str(&format!("\nTotal: {} results\n", self.total_count));
        output
    }
}