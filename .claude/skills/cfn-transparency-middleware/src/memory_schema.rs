use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MemoryEntry {
    pub id: Option<i64>,
    pub agent_id: String,
    pub task_id: String,
    pub timestamp: i64,
    pub event_type: String, // Store as string in database
    pub tool: Option<String>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventType {
    AgentExecution,
    ToolExecution,
    Interaction,
    StateChange,
    Error,
    Other(String),
}

impl Default for EventType {
    fn default() -> Self {
        Self::AgentExecution
    }
}

impl std::fmt::Display for EventType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EventType::AgentExecution => write!(f, "agent_execution"),
            EventType::ToolExecution => write!(f, "tool_execution"),
            EventType::Interaction => write!(f, "interaction"),
            EventType::StateChange => write!(f, "state_change"),
            EventType::Error => write!(f, "error"),
            EventType::Other(s) => write!(f, "{}", s),
        }
    }
}

impl EventType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "agent_execution" => EventType::AgentExecution,
            "tool_execution" => EventType::ToolExecution,
            "interaction" => EventType::Interaction,
            "state_change" => EventType::StateChange,
            "error" => EventType::Error,
            _ => EventType::Other(s.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TransparencyLevel {
    Minimal,
    Detailed,
    Verbose,
    Debug,
}

impl Default for TransparencyLevel {
    fn default() -> Self {
        Self::Detailed
    }
}

impl std::fmt::Display for TransparencyLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransparencyLevel::Minimal => write!(f, "minimal"),
            TransparencyLevel::Detailed => write!(f, "detailed"),
            TransparencyLevel::Verbose => write!(f, "verbose"),
            TransparencyLevel::Debug => write!(f, "debug"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MemoryQuery {
    pub agent_id: Option<String>,
    pub task_id: Option<String>,
    pub event_type: Option<EventType>,
    pub tool: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Query builder for constructing complex memory queries
pub struct QueryBuilder {
    query: MemoryQuery,
}

impl QueryBuilder {
    pub fn new() -> Self {
        Self {
            query: MemoryQuery::default(),
        }
    }

    pub fn agent_id(mut self, agent_id: String) -> Self {
        self.query.agent_id = Some(agent_id);
        self
    }

    pub fn task_id(mut self, task_id: String) -> Self {
        self.query.task_id = Some(task_id);
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

    pub fn offset(mut self, offset: u32) -> Self {
        self.query.offset = Some(offset);
        self
    }

    pub fn build(self) -> MemoryQuery {
        self.query
    }
}

impl Default for QueryBuilder {
    fn default() -> Self {
        Self::new()
    }
}
