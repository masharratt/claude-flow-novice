use crate::memory_schema::{MemoryEntry, MemoryQuery};
use anyhow::Result;

/// Query builder for constructing memory queries
pub struct QueryBuilder {
    query: MemoryQuery,
}

impl QueryBuilder {
    /// Create a new query builder
    pub fn new() -> Self {
        Self {
            query: MemoryQuery::default(),
        }
    }

    /// Filter by agent ID
    pub fn agent_id(mut self, agent_id: &str) -> Self {
        self.query.agent_id = Some(agent_id.to_string());
        self
    }

    /// Filter by agent ID pattern (LIKE)
    pub fn agent_pattern(mut self, pattern: &str) -> Self {
        self.query.agent_id = Some(format!("%{}%", pattern));
        self
    }

    /// Filter by task ID
    pub fn task_id(mut self, task_id: &str) -> Self {
        self.query.task_id = Some(task_id.to_string());
        self
    }

    /// Filter by task ID pattern (LIKE)
    pub fn task_pattern(mut self, pattern: &str) -> Self {
        self.query.task_id = Some(format!("%{}%", pattern));
        self
    }

    /// Filter by event type
    pub fn event_type(mut self, event_type: crate::memory_schema::EventType) -> Self {
        self.query.event_type = Some(event_type);
        self
    }

    /// Filter by start timestamp
    pub fn start_timestamp(mut self, timestamp: i64) -> Self {
        self.query.start_timestamp = Some(timestamp);
        self
    }

    /// Filter by end timestamp
    pub fn end_timestamp(mut self, timestamp: i64) -> Self {
        self.query.end_timestamp = Some(timestamp);
        self
    }

    /// Set limit
    pub fn limit(mut self, limit: i64) -> Self {
        self.query.limit = Some(limit);
        self
    }

    /// Set offset
    pub fn offset(mut self, offset: i64) -> Self {
        self.query.offset = Some(offset);
        self
    }

    /// Order by field
    pub fn order_by(mut self, field: &str) -> Self {
        self.query.order_by = Some(field.to_string());
        self
    }

    /// Set descending order
    pub fn descending(mut self, descending: bool) -> Self {
        self.query.descending = descending;
        self
    }

    /// Build the query
    pub fn build(self) -> MemoryQuery {
        self.query
    }
}

impl Default for QueryBuilder {
    fn default() -> Self {
        Self::new()
    }
}
