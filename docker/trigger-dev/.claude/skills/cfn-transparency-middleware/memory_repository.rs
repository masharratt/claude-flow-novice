use anyhow::{Result, Context};
use sqlx::{sqlite::SqlitePool, FromRow};
use crate::memory_schema::{MemoryEntry, MemoryQuery, EventType};
use serde_json;
use tracing::{info, warn};

pub struct MemoryRepository {
    pool: SqlitePool,
}

impl MemoryRepository {
    pub async fn new(database_path: &str) -> Result<Self> {
        let pool = SqlitePool::connect(&format!("sqlite:{}", database_path))
            .await
            .context("Failed to connect to SQLite database")?;

        Self::create_table(&pool).await?;

        Ok(Self { pool })
    }

    async fn create_table(pool: &SqlitePool) -> Result<()> {
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS agent_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                tool TEXT,
                metadata TEXT,
                confidence REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#)
        .execute(pool)
        .await
        .context("Failed to create agent_memory table")?;

        // Create indexes
        let indexes = vec![
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_id ON agent_memory(agent_id)",
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_task_id ON agent_memory(task_id)",
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_timestamp ON agent_memory(timestamp DESC)",
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_event_type ON agent_memory(event_type)",
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_tool ON agent_memory(tool)",
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_task_agent ON agent_memory(task_id, agent_id)"
        ];

        for index in indexes {
            sqlx::query(index)
                .execute(pool)
                .await
                .context("Failed to create index")?;
        }

        Ok(())
    }

    pub async fn insert(&self, entry: &MemoryEntry) -> Result<i64> {
        let metadata_json = entry.metadata.as_ref()
            .map(|m| serde_json::to_string(m).ok())
            .flatten();

        let id = sqlx::query(r#"
            INSERT INTO agent_memory
            (agent_id, task_id, timestamp, event_type, tool, metadata, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        "#)
        .bind(&entry.agent_id)
        .bind(&entry.task_id)
        .bind(entry.timestamp)
        .bind(entry.event_type.to_string())
        .bind(&entry.tool)
        .bind(metadata_json)
        .bind(entry.confidence)
        .execute(&self.pool)
        .await
        .context("Failed to insert memory entry")?
        .last_insert_rowid();

        info!(
            "Inserted memory entry for agent {} in task {}",
            entry.agent_id, entry.task_id
        );

        Ok(id)
    }

    pub async fn query(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>> {
        let mut sql = "SELECT * FROM agent_memory WHERE 1=1".to_string();
        let mut conditions = Vec::new();
        let mut params = Vec::new();

        if let Some(agent_id) = &query.agent_id {
            conditions.push("agent_id = ?");
            params.push(agent_id);
        }

        if let Some(task_id) = &query.task_id {
            conditions.push("task_id = ?");
            params.push(task_id);
        }

        if let Some(event_type) = &query.event_type {
            conditions.push("event_type = ?");
            params.push(&event_type.to_string());
        }

        if let Some(tool) = &query.tool {
            conditions.push("tool = ?");
            params.push(tool);
        }

        if let Some(start) = query.start_timestamp {
            conditions.push("timestamp >= ?");
            params.push(start);
        }

        if let Some(end) = query.end_timestamp {
            conditions.push("timestamp <= ?");
            params.push(end);
        }

        sql.push_str(" AND ");
        sql.push_str(&conditions.join(" AND "));
        sql.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }

        let results = sqlx::query_as::<_, MemoryEntry>(&sql)
            .fetch_all(&self.pool)
            .await
            .context("Failed to query memory entries")?;

        Ok(results)
    }
}