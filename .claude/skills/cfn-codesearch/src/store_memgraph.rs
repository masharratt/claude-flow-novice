//! Memgraph graph storage backend for CodeSearch
//!
//! This module provides graph-based code dependency analysis using Memgraph.
//! Stores entity relationships as a property graph for traversal queries
//! like "what depends on X?" and "what breaks if I change Y?"

use anyhow::{Result, Context, anyhow};
use serde::{Serialize, Deserialize};
use tracing::{info, debug, warn};
use neo4rs::{Graph, ConfigBuilder, query, Node, Row};
use std::sync::Arc;

/// Memgraph graph store for dependency analysis
pub struct MemgraphStore {
    graph: Arc<Graph>,
}

/// Result of an impact analysis query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactResult {
    pub entity_name: String,
    pub entity_kind: String,
    pub file_path: String,
    pub project_root: String,
    pub depth: i64,
    pub relationship: String,
}

/// Cross-project dependency info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossProjectDep {
    pub source_project: String,
    pub source_entity: String,
    pub target_project: String,
    pub target_entity: String,
    pub relationship: String,
}

/// Graph statistics for a project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStats {
    pub entity_count: i64,
    pub file_count: i64,
    pub relationship_count: i64,
}

impl MemgraphStore {
    /// Create a new Memgraph store, connecting and initializing schema
    pub async fn new(uri: &str, user: &str, password: &str) -> Result<Self> {
        // Use ConfigBuilder with db="memgraph" — Memgraph requires this specific name
        // (Graph::new defaults to db="neo4j" which Memgraph rejects)
        let config = ConfigBuilder::default()
            .uri(uri)
            .user(user)
            .password(password)
            .db("memgraph")
            .build()
            .map_err(|e| anyhow!("Invalid Memgraph config: {:?}", e))?;

        let graph = Graph::connect(config).await
            .context("Failed to connect to Memgraph")?;

        let store = Self { graph: Arc::new(graph) };
        store.initialize_schema().await?;

        info!("Connected to Memgraph at {}", uri);
        Ok(store)
    }

    /// Initialize graph schema — create indexes and constraints
    async fn initialize_schema(&self) -> Result<()> {
        let index_queries = vec![
            "CREATE INDEX ON :Entity(sqlite_id)",
            "CREATE INDEX ON :Entity(name)",
            "CREATE INDEX ON :Entity(project_root)",
            "CREATE INDEX ON :File(path)",
            "CREATE INDEX ON :File(project_root)",
            "CREATE INDEX ON :Project(root_path)",
        ];

        for q in index_queries {
            match self.graph.run(query(q)).await {
                Ok(_) => debug!("Created index: {}", q),
                Err(e) => {
                    // Index may already exist
                    debug!("Index creation (may already exist): {} — {}", q, e);
                }
            }
        }

        Ok(())
    }

    /// Upsert a project node
    pub async fn upsert_project(&self, name: &str, root_path: &str) -> Result<()> {
        self.graph.run(
            query("MERGE (p:Project {root_path: $root_path}) SET p.name = $name, p.last_indexed = timestamp()")
                .param("root_path", root_path)
                .param("name", name)
        ).await.context("Failed to upsert project")?;

        Ok(())
    }

    /// Upsert a file node and link to project
    pub async fn upsert_file(
        &self,
        path: &str,
        project_root: &str,
        language: &str,
        hash: &str,
    ) -> Result<()> {
        self.graph.run(
            query(
                "MERGE (f:File {path: $path, project_root: $project_root}) \
                 SET f.language = $language, f.hash = $hash \
                 WITH f \
                 MATCH (p:Project {root_path: $project_root}) \
                 MERGE (p)-[:CONTAINS]->(f)"
            )
            .param("path", path)
            .param("project_root", project_root)
            .param("language", language)
            .param("hash", hash)
        ).await.context("Failed to upsert file")?;

        Ok(())
    }

    /// Upsert an entity node and link to its defining file
    pub async fn upsert_entity(
        &self,
        sqlite_id: i64,
        name: &str,
        kind: &str,
        signature: Option<&str>,
        visibility: &str,
        file_path: &str,
        line_number: i64,
        project_root: &str,
    ) -> Result<()> {
        self.graph.run(
            query(
                "MERGE (e:Entity {sqlite_id: $sqlite_id, project_root: $project_root}) \
                 SET e.name = $name, e.kind = $kind, e.signature = $signature, \
                     e.visibility = $visibility, e.file_path = $file_path, \
                     e.line_number = $line_number \
                 WITH e \
                 MATCH (f:File {path: $file_path, project_root: $project_root}) \
                 MERGE (f)-[:DEFINES]->(e)"
            )
            .param("sqlite_id", sqlite_id)
            .param("project_root", project_root)
            .param("name", name)
            .param("kind", kind)
            .param("signature", signature.unwrap_or(""))
            .param("visibility", visibility)
            .param("file_path", file_path)
            .param("line_number", line_number)
        ).await.context("Failed to upsert entity")?;

        Ok(())
    }

    /// Batch upsert references as edges between entities.
    /// Groups by ref_kind since Cypher can't parameterize relationship types.
    pub async fn upsert_references_batch(
        &self,
        refs: &[(i64, String, String, String)], // (source_sqlite_id, target_name, ref_kind, project_root)
    ) -> Result<usize> {
        if refs.is_empty() {
            return Ok(0);
        }

        // Group references by kind
        let mut by_kind: std::collections::HashMap<String, Vec<(i64, String, String)>> =
            std::collections::HashMap::new();

        for (source_id, target_name, ref_kind, project_root) in refs {
            by_kind.entry(ref_kind.clone())
                .or_default()
                .push((*source_id, target_name.clone(), project_root.clone()));
        }

        let mut total = 0;

        for (kind, entries) in &by_kind {
            let rel_type = match kind.as_str() {
                "calls" | "call" => "CALLS",
                "imports" | "import" => "IMPORTS",
                "extends" | "extend" => "EXTENDS",
                "implements" | "implement" => "IMPLEMENTS",
                "uses" | "use" => "USES",
                "instantiates" => "CALLS", // Map instantiation to CALLS
                "overrides" => "EXTENDS",  // Map override to EXTENDS
                "reads" => "USES",
                "writes" => "USES",
                _ => "USES",
            };

            // Process in batches to avoid huge queries
            for chunk in entries.chunks(50) {
                for (source_id, target_name, project_root) in chunk {
                    // Create edge between source entity and target entity (matched by name)
                    let q = format!(
                        "MATCH (source:Entity {{sqlite_id: $source_id, project_root: $project_root}}) \
                         MATCH (target:Entity {{name: $target_name, project_root: $project_root}}) \
                         MERGE (source)-[:{}]->(target)",
                        rel_type
                    );

                    match self.graph.run(
                        query(&q)
                            .param("source_id", *source_id)
                            .param("target_name", target_name.as_str())
                            .param("project_root", project_root.as_str())
                    ).await {
                        Ok(_) => total += 1,
                        Err(e) => {
                            debug!("Failed to create {} edge from {} to {}: {}",
                                rel_type, source_id, target_name, e);
                        }
                    }
                }
            }
        }

        debug!("Created {} reference edges in Memgraph", total);
        Ok(total)
    }

    /// Delete all graph data for a specific file (entities and their edges)
    pub async fn delete_file_graph(&self, file_path: &str, project_root: &str) -> Result<()> {
        self.graph.run(
            query(
                "MATCH (f:File {path: $file_path, project_root: $project_root})-[:DEFINES]->(e:Entity) \
                 DETACH DELETE e"
            )
            .param("file_path", file_path)
            .param("project_root", project_root)
        ).await.context("Failed to delete file graph")?;

        Ok(())
    }

    /// Find all entities that depend on the given entity (inbound traversal)
    pub async fn find_dependents(
        &self,
        entity_name: &str,
        project_root: Option<&str>,
        max_depth: u32,
    ) -> Result<Vec<ImpactResult>> {
        let q = if let Some(pr) = project_root {
            format!(
                "MATCH path = (dependent:Entity)-[r*1..{}]->(target:Entity {{name: $name, project_root: $project_root}}) \
                 RETURN dependent.name AS name, dependent.kind AS kind, \
                        dependent.file_path AS file_path, dependent.project_root AS project_root, \
                        length(path) AS depth, type(r[0]) AS rel_type \
                 ORDER BY depth ASC \
                 LIMIT 100",
                max_depth
            )
        } else {
            format!(
                "MATCH path = (dependent:Entity)-[r*1..{}]->(target:Entity {{name: $name}}) \
                 RETURN dependent.name AS name, dependent.kind AS kind, \
                        dependent.file_path AS file_path, dependent.project_root AS project_root, \
                        length(path) AS depth, type(r[0]) AS rel_type \
                 ORDER BY depth ASC \
                 LIMIT 100",
                max_depth
            )
        };

        let mut qb = query(&q).param("name", entity_name);
        if let Some(pr) = project_root {
            qb = qb.param("project_root", pr);
        }

        let mut result = self.graph.execute(qb).await
            .context("Failed to find dependents")?;

        let mut results = Vec::new();
        while let Some(row) = result.next().await? {
            results.push(ImpactResult {
                entity_name: row.get::<String>("name").unwrap_or_default(),
                entity_kind: row.get::<String>("kind").unwrap_or_default(),
                file_path: row.get::<String>("file_path").unwrap_or_default(),
                project_root: row.get::<String>("project_root").unwrap_or_default(),
                depth: row.get::<i64>("depth").unwrap_or(0),
                relationship: row.get::<String>("rel_type").unwrap_or_default(),
            });
        }

        Ok(results)
    }

    /// Find the impact of changing an entity — aggregated affected files/projects
    pub async fn find_impact(
        &self,
        entity_name: &str,
        file_path: Option<&str>,
        project_root: Option<&str>,
    ) -> Result<Vec<ImpactResult>> {
        let mut conditions = vec!["target.name = $name".to_string()];
        if file_path.is_some() {
            conditions.push("target.file_path = $file_path".to_string());
        }
        if project_root.is_some() {
            conditions.push("target.project_root = $project_root".to_string());
        }

        let where_clause = conditions.join(" AND ");
        let q = format!(
            "MATCH path = (dependent:Entity)-[r*1..5]->(target:Entity) \
             WHERE {} \
             RETURN DISTINCT dependent.name AS name, dependent.kind AS kind, \
                    dependent.file_path AS file_path, dependent.project_root AS project_root, \
                    length(path) AS depth, type(r[0]) AS rel_type \
             ORDER BY depth ASC \
             LIMIT 200",
            where_clause
        );

        let mut qb = query(&q).param("name", entity_name);
        if let Some(fp) = file_path {
            qb = qb.param("file_path", fp);
        }
        if let Some(pr) = project_root {
            qb = qb.param("project_root", pr);
        }

        let mut result = self.graph.execute(qb).await
            .context("Failed to find impact")?;

        let mut results = Vec::new();
        while let Some(row) = result.next().await? {
            results.push(ImpactResult {
                entity_name: row.get::<String>("name").unwrap_or_default(),
                entity_kind: row.get::<String>("kind").unwrap_or_default(),
                file_path: row.get::<String>("file_path").unwrap_or_default(),
                project_root: row.get::<String>("project_root").unwrap_or_default(),
                depth: row.get::<i64>("depth").unwrap_or(0),
                relationship: row.get::<String>("rel_type").unwrap_or_default(),
            });
        }

        Ok(results)
    }

    /// Find cross-project dependencies for a given project
    pub async fn find_cross_project_deps(&self, project_root: &str) -> Result<Vec<CrossProjectDep>> {
        let mut result = self.graph.execute(
            query(
                "MATCH (source:Entity {project_root: $project_root})-[r]->(target:Entity) \
                 WHERE target.project_root <> $project_root \
                 RETURN source.project_root AS source_project, source.name AS source_entity, \
                        target.project_root AS target_project, target.name AS target_entity, \
                        type(r) AS relationship \
                 ORDER BY target.project_root, source.name \
                 LIMIT 500"
            )
            .param("project_root", project_root)
        ).await.context("Failed to find cross-project deps")?;

        let mut results = Vec::new();
        while let Some(row) = result.next().await? {
            results.push(CrossProjectDep {
                source_project: row.get::<String>("source_project").unwrap_or_default(),
                source_entity: row.get::<String>("source_entity").unwrap_or_default(),
                target_project: row.get::<String>("target_project").unwrap_or_default(),
                target_entity: row.get::<String>("target_entity").unwrap_or_default(),
                relationship: row.get::<String>("relationship").unwrap_or_default(),
            });
        }

        Ok(results)
    }

    /// Get graph statistics for a project
    pub async fn get_stats(&self, project_root: Option<&str>) -> Result<GraphStats> {
        let (entity_q, file_q, rel_q) = if project_root.is_some() {
            (
                "MATCH (e:Entity {project_root: $pr}) RETURN count(e) AS cnt",
                "MATCH (f:File {project_root: $pr}) RETURN count(f) AS cnt",
                "MATCH (e1:Entity {project_root: $pr})-[r]->(e2:Entity) RETURN count(r) AS cnt",
            )
        } else {
            (
                "MATCH (e:Entity) RETURN count(e) AS cnt",
                "MATCH (f:File) RETURN count(f) AS cnt",
                "MATCH ()-[r]->() RETURN count(r) AS cnt",
            )
        };

        let mut entity_count = 0i64;
        let mut file_count = 0i64;
        let mut relationship_count = 0i64;

        for (i, q_str) in [entity_q, file_q, rel_q].iter().enumerate() {
            let mut qb = query(q_str);
            if let Some(p) = project_root {
                qb = qb.param("pr", p.to_string());
            }
            let mut result = self.graph.execute(qb).await?;
            let count = if let Some(row) = result.next().await? {
                row.get::<i64>("cnt").unwrap_or(0)
            } else {
                0
            };
            match i {
                0 => entity_count = count,
                1 => file_count = count,
                2 => relationship_count = count,
                _ => {}
            }
        }

        Ok(GraphStats {
            entity_count,
            file_count,
            relationship_count,
        })
    }

    /// Health check — verify connectivity
    pub async fn health_check(&self) -> Result<()> {
        self.graph.run(query("RETURN 1")).await
            .context("Memgraph health check failed")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Requires Memgraph running locally"]
    async fn test_memgraph_connection() {
        let uri = std::env::var("CODESEARCH_MEMGRAPH_URL")
            .unwrap_or_else(|_| "bolt://localhost:7687".to_string());
        let user = std::env::var("CODESEARCH_MEMGRAPH_USER")
            .unwrap_or_else(|_| "".to_string());
        let password = std::env::var("CODESEARCH_MEMGRAPH_PASSWORD")
            .unwrap_or_else(|_| "".to_string());

        let store = MemgraphStore::new(&uri, &user, &password).await;
        assert!(store.is_ok(), "Should connect to Memgraph: {:?}", store.err());
    }

    #[tokio::test]
    #[ignore = "Requires Memgraph running locally"]
    async fn test_memgraph_health_check() {
        let uri = std::env::var("CODESEARCH_MEMGRAPH_URL")
            .unwrap_or_else(|_| "bolt://localhost:7687".to_string());
        let user = std::env::var("CODESEARCH_MEMGRAPH_USER")
            .unwrap_or_else(|_| "".to_string());
        let password = std::env::var("CODESEARCH_MEMGRAPH_PASSWORD")
            .unwrap_or_else(|_| "".to_string());

        if let Ok(store) = MemgraphStore::new(&uri, &user, &password).await {
            assert!(store.health_check().await.is_ok());
        }
    }
}
