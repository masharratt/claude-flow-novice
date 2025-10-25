use crate::memory_repository::MemoryRepository;
use crate::memory_schema::{MemoryEntry, MemoryQuery};
use anyhow::Result;
use tracing::{info, error};

pub struct MemoryQueryBuilder {
    query: MemoryQuery,
}

impl MemoryQueryBuilder {
    pub fn new() -> Self {
        Self {
            query: MemoryQuery::default(),
        }
    }

    pub fn agent_id(mut self, id: String) -> Self {
        self.query.agent_id = Some(id);
        self
    }

    pub fn task_id(mut self, id: String) -> Self {
        self.query.task_id = Some(id);
        self
    }

    pub fn event_type(mut self, event_type: EventType) -> Self {
        self.query.event_type = Some(event_type);
        self
    }

    pub fn tool(mut self, tool: String) -> Self {
        self.query.tool = Some(tool);
        self
    }

    pub fn time_range(mut self, start: i64, end: i64) -> Self {
        self.query.start_timestamp = Some(start);
        self.query.end_timestamp = Some(end);
        self
    }

    pub fn limit(mut self, limit: u32) -> Self {
        self.query.limit = Some(limit);
        self
    }

    pub async fn execute(self, repository: &MemoryRepository) -> Result<Vec<MemoryEntry>> {
        info!("Executing memory query: {:?}", self.query);

        let results = repository.query(&self.query).await?;

        info!("Query returned {} results", results.len());

        Ok(results)
    }
}

pub struct MemoryManager {
    repository: MemoryRepository,
}

impl MemoryManager {
    pub async fn new(database_path: &str) -> Result<Self> {
        let repository = MemoryRepository::new(database_path).await?;
        Ok(Self { repository })
    }

    pub fn query_builder(&self) -> MemoryQueryBuilder {
        MemoryQueryBuilder::new()
    }

    pub async fn log_entry(&self, entry: &MemoryEntry) -> Result<i64> {
        match self.repository.insert(entry).await {
            Ok(id) => {
                info!("Successfully logged memory entry with id: {}", id);
                Ok(id)
            },
            Err(e) => {
                error!("Failed to log memory entry: {:?}", e);
                Err(e)
            }
        }
    }
}