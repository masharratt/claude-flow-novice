use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MemoryEntry {
    pub id: Option<i64>,
    pub agent_id: String,
    pub task_id: String,
    pub timestamp: i64,
    pub event_type: EventType,
    pub tool: Option<String>,
    pub metadata: Option<String>,
    pub confidence: Option<f64>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventType {
    Edit,
    Write,
    Bash,
    Task,
    Read,
    Other(String),
}

impl From<&str> for EventType {
    fn from(s: &str) -> Self {
        match s {
            "edit" => EventType::Edit,
            "write" => EventType::Write,
            "bash" => EventType::Bash,
            "task" => EventType::Task,
            "read" => EventType::Read,
            _ => EventType::Other(s.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQuery {
    pub agent_id: Option<String>,
    pub task_id: Option<String>,
    pub event_type: Option<EventType>,
    pub tool: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub limit: Option<u32>,
}

impl Default for MemoryQuery {
    fn default() -> Self {
        Self {
            agent_id: None,
            task_id: None,
            event_type: None,
            tool: None,
            start_timestamp: None,
            end_timestamp: None,
            limit: Some(100),
        }
    }
}