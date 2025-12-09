//! # Transparency Middleware
//!
//! A Rust-based middleware system for capturing, logging, and analyzing agent interactions
//! with comprehensive memory tracking and security features.
//!
//! This module provides:
//! - Agent interaction capture and logging
//! - Memory tracking for agent operations
//! - Performance monitoring with configurable overhead limits
//! - Security filtering for sensitive data
//! - Export capabilities for audit trails

pub mod cache_manager;
pub mod memory_schema;
pub mod memory_repository;
pub mod agent_metrics;
pub mod api_handler;

use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tracing::{info, warn, debug};
use chrono::{DateTime, Utc};

// Re-export main types for convenience
pub use memory_schema::{MemoryEntry, MemoryQuery, EventType, TransparencyLevel, QueryBuilder};
pub use memory_repository::MemoryRepository;
pub use agent_metrics::AgentMetrics;
pub use api_handler::{ApiHandler, Request, Response, ApiResponse, RouteHandler};

/// Configuration for transparency middleware
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransparencyConfig {
    /// Level of transparency for logging
    pub transparency_level: TransparencyLevel,

    /// Enable performance monitoring
    pub performance_monitoring: bool,

    /// Enable context-aware filtering
    pub context_filtering: bool,

    /// Enable message filtering
    pub message_filtering: bool,

    /// Maximum allowed overhead percentage (0-100)
    pub max_overhead_percent: f64,

    /// Message queue size
    pub queue_size: usize,

    /// Flush interval in milliseconds
    pub flush_interval_ms: u64,

    /// Patterns to exclude from logging
    pub exclude_patterns: Vec<String>,

    /// Patterns to include in logging (if empty, include all)
    pub include_patterns: Vec<String>,

    /// Database path for storing logs
    pub database_path: PathBuf,

    /// Export formats
    pub export_formats: Vec<ExportFormat>,
}

impl Default for TransparencyConfig {
    fn default() -> Self {
        Self {
            transparency_level: TransparencyLevel::Detailed,
            performance_monitoring: true,
            context_filtering: true,
            message_filtering: true,
            max_overhead_percent: 5.0,
            queue_size: 1000,
            flush_interval_ms: 5000,
            exclude_patterns: vec![
                "password".to_string(),
                "token".to_string(),
                "secret".to_string(),
                "key".to_string(),
            ],
            include_patterns: vec![],
            database_path: PathBuf::from("./transparency-middleware.db"),
            export_formats: vec![ExportFormat::Json, ExportFormat::Csv],
        }
    }
}

/// Export format options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Json,
    Csv,
    Xml,
    Yaml,
}

/// Main transparency middleware implementation
pub struct TransparencyMiddleware {
    pub config: TransparencyConfig,
    repository: Option<MemoryRepository>,
    is_initialized: bool,
    start_time: DateTime<Utc>,
    agent_id: Option<String>,
}

impl TransparencyMiddleware {
    /// Create a new transparency middleware instance
    pub fn new(config: TransparencyConfig) -> Self {
        Self {
            config,
            repository: None,
            is_initialized: false,
            start_time: Utc::now(),
            agent_id: None,
        }
    }

    /// Load configuration from JSON file
    pub fn load_config<P: Into<PathBuf>>(path: P) -> Result<TransparencyConfig> {
        let path = path.into();
        let content = std::fs::read_to_string(&path)
            .with_context(|| format!("Failed to read config file: {:?}", path))?;

        let config: TransparencyConfig = serde_json::from_str(&content)
            .with_context(|| "Failed to parse config JSON")?;

        Ok(config)
    }

    /// Initialize the middleware
    pub async fn initialize(&mut self) -> Result<()> {
        if self.is_initialized {
            warn!("Transparency middleware already initialized");
            return Ok(());
        }

        info!("Initializing transparency middleware with level: {:?}", self.config.transparency_level);

        // Initialize memory repository
        let db_path = self.config.database_path.to_string_lossy().to_string();
        let repository = MemoryRepository::new(&db_path).await
            .context("Failed to initialize memory repository")?;

        self.repository = Some(repository);
        self.is_initialized = true;

        info!("Transparency middleware initialized successfully");
        Ok(())
    }

    /// Set the current agent ID
    pub fn set_agent_id(&mut self, agent_id: String) {
        self.agent_id = Some(agent_id);
    }

    /// Capture agent execution with transparency
    pub async fn capture_agent_execution(
        &mut self,
        agent_name: &str,
        output: &str,
        task_id: &str,
    ) -> Result<()> {
        if !self.is_initialized {
            anyhow::bail!("Middleware not initialized");
        }

        let agent_id = self.agent_id.as_deref().unwrap_or(agent_name);

        // Filter content if enabled
        let filtered_output = if self.config.message_filtering {
            self.filter_sensitive_data(output)?
        } else {
            output.to_string()
        };

        // Create memory entry
        let entry = MemoryEntry {
            id: None,
            agent_id: agent_id.to_string(),
            task_id: task_id.to_string(),
            timestamp: Utc::now().timestamp_millis(),
            event_type: "agent_execution".to_string(),
            tool: None,
            input: Some(format!("Agent: {}", agent_name)),
            output: Some(filtered_output),
            metadata: {
                let mut meta = HashMap::new();
                meta.insert("transparency_level".to_string(),
                    serde_json::to_value(&self.config.transparency_level)?);
                meta.insert("performance_monitoring".to_string(),
                    serde_json::to_value(self.config.performance_monitoring)?);
                meta
            },
        };

        // Store in repository
        if let Some(ref repo) = self.repository {
            repo.store_memory(entry).await
                .context("Failed to store memory entry")?;
        }

        debug!("Captured agent execution for {} in task {}", agent_name, task_id);
        Ok(())
    }

    /// Filter sensitive data from messages
    fn filter_sensitive_data(&self, content: &str) -> Result<String> {
        let mut filtered = content.to_string();

        // Apply exclude patterns
        for pattern in &self.config.exclude_patterns {
            if filtered.to_lowercase().contains(pattern) {
                warn!("Filtering content containing pattern: {}", pattern);
                // Simple redaction - replace pattern value with [REDACTED]
                filtered = self.redact_pattern(&filtered, pattern)?;
            }
        }

        Ok(filtered)
    }

    /// Redact pattern from content
    fn redact_pattern(&self, content: &str, pattern: &str) -> Result<String> {
        use regex::Regex;

        let regex = Regex::new(&format!(r"(?i){}[:\s=]+[^\s\n]+", pattern))
            .with_context(|| format!("Invalid regex pattern: {}", pattern))?;

        Ok(regex.replace_all(content, format!("{}: [REDACTED]", pattern)).to_string())
    }

    /// Get performance metrics
    pub async fn get_metrics(&self) -> Result<TransparencyMetrics> {
        if !self.is_initialized {
            anyhow::bail!("Middleware not initialized");
        }

        let total_entries = if let Some(ref repo) = self.repository {
            repo.get_total_entries().await?
        } else {
            0
        };

        let uptime = Utc::now().signed_duration_since(self.start_time);

        Ok(TransparencyMetrics {
            total_entries,
            uptime_seconds: uptime.num_seconds(),
            is_initialized: self.is_initialized,
            current_agent: self.agent_id.clone(),
        })
    }

    /// Export data in specified format
    pub async fn export_data(&self, format: ExportFormat, output_path: &str) -> Result<()> {
        if !self.is_initialized {
            anyhow::bail!("Middleware not initialized");
        }

        if let Some(ref repo) = self.repository {
            let entries = repo.get_all_memories().await?;

            match format {
                ExportFormat::Json => {
                    let json = serde_json::to_string_pretty(&entries)?;
                    std::fs::write(output_path, json)?;
                }
                ExportFormat::Csv => {
                    self.export_to_csv(&entries, output_path)?;
                }
                _ => {
                    anyhow::bail!("Export format {:?} not yet implemented", format);
                }
            }

            info!("Exported {} entries to {}", entries.len(), output_path);
        }

        Ok(())
    }

    /// Export entries to CSV format
    fn export_to_csv(&self, entries: &[MemoryEntry], path: &str) -> Result<()> {
        use std::io::Write;

        let mut file = std::fs::File::create(path)?;
        writeln!(file, "agent_id,task_id,timestamp,event_type,input,output")?;

        for entry in entries {
            writeln!(
                file,
                "{},{},{},{},{},{}",
                entry.agent_id,
                entry.task_id,
                entry.timestamp,
                entry.event_type,
                entry.input.as_deref().unwrap_or(""),
                entry.output.as_deref().unwrap_or("")
            )?;
        }

        Ok(())
    }

    /// Cleanup resources
    pub async fn cleanup(&mut self) -> Result<()> {
        if let Some(ref mut repo) = self.repository {
            repo.cleanup().await?;
        }

        self.repository = None;
        self.is_initialized = false;

        info!("Transparency middleware cleaned up");
        Ok(())
    }
}

/// Performance metrics for the middleware
#[derive(Debug, Serialize, Deserialize)]
pub struct TransparencyMetrics {
    pub total_entries: i64,
    pub uptime_seconds: i64,
    pub is_initialized: bool,
    pub current_agent: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_middleware_initialization() {
        let temp_dir = tempdir().unwrap();
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        let db_path = temp_dir.path().join("test.db");
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        let db_path = temp_dir.path().join("test.db");
        let config = TransparencyConfig {
            database_path: db_path,
            ..Default::default()
        };

        let mut middleware = TransparencyMiddleware::new(config);
        assert!(!middleware.is_initialized);

        middleware.initialize().await.unwrap();
        assert!(middleware.is_initialized);

        middleware.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_agent_execution_capture() {
        let temp_dir = tempdir().unwrap();
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        let db_path = temp_dir.path().join("test.db");
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        std::fs::create_dir_all(temp_dir.path()).unwrap();
        let db_path = temp_dir.path().join("test.db");
        let config = TransparencyConfig {
            database_path: db_path,
            message_filtering: true,
            exclude_patterns: vec!["secret".to_string()],
            ..Default::default()
        };

        let mut middleware = TransparencyMiddleware::new(config);
        middleware.initialize().await.unwrap();

        middleware
            .capture_agent_execution(
                "test-agent",
                "Output with secret=password123",
                "task-123"
            )
            .await
            .unwrap();

        let metrics = middleware.get_metrics().await.unwrap();
        assert_eq!(metrics.total_entries, 1);

        middleware.cleanup().await.unwrap();
    }
}
