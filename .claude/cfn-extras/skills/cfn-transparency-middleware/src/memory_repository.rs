use anyhow::{Result, Context};
use sqlx::{sqlite::SqlitePool, Row};
use crate::memory_schema::{MemoryEntry, MemoryQuery};
use serde_json;

pub struct MemoryRepository {
    pool: SqlitePool,
}

impl MemoryRepository {
    pub async fn new(database_path: &str) -> Result<Self> {
        let pool = SqlitePool::connect(&format!("sqlite:{}?mode=rwc", database_path))
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
                input TEXT,
                output TEXT,
                metadata TEXT
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

    pub async fn store_memory(&self, entry: MemoryEntry) -> Result<i64> {
        let metadata_json = serde_json::to_string(&entry.metadata)
            .context("Failed to serialize metadata")?;

        let result = sqlx::query(r#"
            INSERT INTO agent_memory 
            (agent_id, task_id, timestamp, event_type, tool, input, output, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        "#)
        .bind(&entry.agent_id)
        .bind(&entry.task_id)
        .bind(entry.timestamp)
        .bind(&entry.event_type)
        .bind(&entry.tool)
        .bind(&entry.input)
        .bind(&entry.output)
        .bind(metadata_json)
        .execute(&self.pool)
        .await
        .context("Failed to insert memory entry")?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_memories(&self, query: &MemoryQuery) -> Result<Vec<MemoryEntry>> {
        let mut final_sql = "
            SELECT id, agent_id, task_id, timestamp, event_type, tool, input, output, metadata
            FROM agent_memory
            WHERE 1=1
        ".to_string();

        if let Some(agent_id) = &query.agent_id {
            final_sql.push_str(&format!(" AND agent_id = '{}'", agent_id));
        }

        if let Some(task_id) = &query.task_id {
            final_sql.push_str(&format!(" AND task_id = '{}'", task_id));
        }

        if let Some(event_type) = &query.event_type {
            final_sql.push_str(&format!(" AND event_type = '{}'", event_type));
        }

        if let Some(start_timestamp) = query.start_timestamp {
            final_sql.push_str(&format!(" AND timestamp >= {}", start_timestamp));
        }

        if let Some(end_timestamp) = query.end_timestamp {
            final_sql.push_str(&format!(" AND timestamp <= {}", end_timestamp));
        }

        final_sql.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = query.limit {
            final_sql.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = query.offset {
            final_sql.push_str(&format!(" OFFSET {}", offset));
        }

        let rows = sqlx::query(&final_sql)
            .fetch_all(&self.pool)
            .await
            .context("Failed to query memories")?;

        let mut entries = Vec::new();
        for row in rows {
            let metadata_str: Option<String> = row.get("metadata");
            let metadata = if let Some(meta_str) = metadata_str {
                serde_json::from_str(&meta_str).unwrap_or_default()
            } else {
                std::collections::HashMap::default()
            };

            entries.push(MemoryEntry {
                id: Some(row.get("id")),
                agent_id: row.get("agent_id"),
                task_id: row.get("task_id"),
                timestamp: row.get("timestamp"),
                event_type: row.get("event_type"),
                tool: row.get("tool"),
                input: row.get("input"),
                output: row.get("output"),
                metadata,
            });
        }

        Ok(entries)
    }

    pub async fn get_all_memories(&self) -> Result<Vec<MemoryEntry>> {
        let query = MemoryQuery::default();
        self.get_memories(&query).await
    }

    pub async fn get_total_entries(&self) -> Result<i64> {
        let result = sqlx::query("SELECT COUNT(*) as count FROM agent_memory")
            .fetch_one(&self.pool)
            .await
            .context("Failed to count entries")?;

        Ok(result.get("count"))
    }

    pub async fn cleanup(&self) -> Result<()> {
        // Close the pool
        self.pool.close().await;
        Ok(())
    }
}
