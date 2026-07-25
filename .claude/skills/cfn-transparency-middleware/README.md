# Transparency Middleware

## Overview

The Transparency Middleware is a sophisticated agent interaction tracking system designed to capture, log, and analyze agent activities with comprehensive memory tracking and advanced security features.

## Key Features

- **Memory Capture:** Comprehensive logging of agent interactions
- **Security:** Built-in data anonymization and payload filtering
- **Performance:** Low-overhead, high-throughput event tracking
- **Flexibility:** Configurable capture and logging strategies
- **SQLite Storage:** Persistent storage of all agent interactions
- **Rust Implementation:** High-performance, memory-safe implementation

## Quick Start

### Installation

As a Rust crate:

```bash
# Add to your Cargo.toml
transparency-middleware = "0.1.0"
```

Or build from source:

```bash
cd .claude/skills/cfn-transparency-middleware
cargo build --release
```

### Basic Configuration

Create a `config.json` in your project:

```json
{
  "capture": {
    "edit_operations": true,
    "bash_commands": true,
    "task_spawning": true,
    "file_reads": false,
    "network_requests": false,
    "error_tracking": true
  },
  "security": {
    "anonymize_sensitive_data": true,
    "max_payload_size_bytes": 10240,
    "exclude_patterns": [],
    "include_patterns": [],
    "redaction_patterns": ["password", "token", "secret", "key"]
  },
  "events": {
    "emit_to_redis": false,
    "emit_to_sqlite": true,
    "emit_to_file": false,
    "batch_size": 100,
    "flush_interval_ms": 5000
  },
  "performance": {
    "max_overhead_percent": 5.0,
    "queue_size": 1000,
    "async_logging": true,
    "compression_enabled": false
  }
}
```

### Basic Usage (Rust)

```rust
use transparency_middleware::{
    TransparencyMiddleware, TransparencyConfig
};
use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    // Load configuration
    let config = TransparencyConfig::load_config("config.json")?;

    // Create middleware instance
    let mut middleware = TransparencyMiddleware::new(
        config,
        "my-agent-id".to_string()
    );

    // Initialize with SQLite database
    middleware.initialize(Some("my_agent_log.db")).await?;

    // Set current task
    middleware.set_task_id("task-123".to_string());

    // Capture an agent execution
    middleware.capture_agent_execution(
        "backend-dev",
        "Agent output here...",
        "task-123",
        Some(0.95)
    ).await?;

    // Capture tool usage
    use serde_json::json;
    middleware.capture_tool_usage(
        "edit",
        &json!({"file": "src/main.rs", "changes": "..."}),
        &json!({"success": true})
    ).await?;

    // Cleanup
    middleware.cleanup().await?;

    Ok(())
}
```

### CLI Usage

Initialize transparency tracking:

```bash
# Build the CLI first
cd .claude/skills/cfn-transparency-middleware
cargo build --release

# Initialize tracking
./target/release/transparency-middleware init \
  --agent-id my-agent \
  --task-id task-123 \
  --database transparency_log.db
```

Query stored interactions:

```bash
# Query all entries for an agent
./target/release/transparency-middleware query \
  --agent-id my-agent \
  --json

# Query with filters
./target/release/transparency-middleware query \
  --agent-id my-agent \
  --task-id task-123 \
  --event-type tool_usage \
  --limit 50
```

Manually capture events:

```bash
./target/release/transparency-middleware capture \
  --event-type error \
  --agent-id my-agent \
  --task-id task-123 \
  --data '{"error": "Something went wrong", "context": "..."}'
```

## Shell Scripts

The skill includes several shell scripts for common operations:

### invoke-transparency-init.sh
Initialize transparency middleware for a new agent session:
```bash
./.claude/skills/cfn-transparency-middleware/invoke-transparency-init.sh \
  --level detailed \
  --performance-monitoring yes \
  --context-filtering yes \
  --max-overhead 5 \
  --task-id my-task-123
```

### invoke-transparency-observe.sh
Monitor agent interactions in real-time:
```bash
./.claude/skills/cfn-transparency-middleware/invoke-transparency-observe.sh \
  --agent-id my-agent \
  --real-time yes
```

### invoke-transparency-filter.sh
Filter and analyze captured interactions:
```bash
./.claude/skills/cfn-transparency-middleware/invoke-transparency-filter.sh \
  --agent-id my-agent \
  --start-time "2024-01-01T00:00:00Z" \
  --end-time "2024-01-02T00:00:00Z" \
  --event-type tool_usage
```

### invoke-transparency-metrics.sh
Get performance and usage metrics:
```bash
./.claude/skills/cfn-transparency-middleware/invoke-transparency-metrics.sh \
  --agent-id my-agent \
  --output json
```

### invoke-transparency-stop.sh
Stop transparency tracking for a session:
```bash
./.claude/skills/cfn-transparency-middleware/invoke-transparency-stop.sh \
  --agent-id my-agent \
  --task-id my-task-123 \
  --cleanup yes
```

## API Reference

### TransparencyMiddleware

The main struct for managing transparency tracking.

#### Methods

- `new(config: TransparencyConfig, agent_id: String) -> Self`
  - Create a new middleware instance

- `load_config<P: Into<PathBuf>>(path: P) -> Result<TransparencyConfig>`
  - Load configuration from JSON file

- `initialize(&mut self, database_path: Option<&str>) -> Result<()>`
  - Initialize database connections and other resources

- `set_task_id(&mut self, task_id: String)`
  - Set the current task ID for tracking

- `capture_agent_execution(...) -> Result<()>`
  - Capture an agent execution event

- `capture_tool_usage(...) -> Result<()>`
  - Capture a tool usage event

- `capture_error(...) -> Result<()>`
  - Capture an error event

- `query(&self, query: MemoryQuery) -> Result<Vec<MemoryEntry>>`
  - Query stored entries

- `get_metrics(&self) -> TransparencyMetrics`
  - Get performance metrics

- `cleanup(&self) -> Result<()>`
  - Cleanup resources

### Configuration Options

#### Capture Config
- `edit_operations`: Track file edit operations
- `bash_commands`: Track bash command executions
- `task_spawning`: Track agent/task spawning
- `file_reads`: Track file read operations
- `network_requests`: Track network/API requests
- `error_tracking`: Track error events

#### Security Config
- `anonymize_sensitive_data`: Enable data redaction
- `max_payload_size_bytes`: Maximum size for stored payloads
- `exclude_patterns`: Patterns to exclude from capture
- `include_patterns`: Patterns to include (if specified, others excluded)
- `redaction_patterns`: Patterns to redact from captured data

#### Events Config
- `emit_to_redis`: Enable Redis event emission
- `emit_to_sqlite`: Enable SQLite storage
- `emit_to_file`: Enable file-based logging
- `batch_size`: Number of events to batch together
- `flush_interval_ms`: Interval between flushes

#### Performance Config
- `max_overhead_percent`: Maximum allowed performance overhead
- `queue_size`: Size of internal event queue
- `async_logging`: Use asynchronous logging
- `compression_enabled`: Enable data compression

## Testing

Run the test suite:

```bash
cd .claude/skills/cfn-transparency-middleware

# Unit tests
cargo test

# Integration tests
./test-e2e.sh

# Performance benchmarks
./performance-benchmark.sh
```

## Security Considerations

1. **Data Redaction**: Sensitive data patterns are automatically redacted
2. **Size Limits**: Payloads are limited to prevent database bloat
3. **Access Control**: Database files should have appropriate permissions
4. **Encryption**: At-rest encryption recommended for sensitive deployments

## Performance

- Target overhead: < 5% performance impact
- Throughput: 10,000+ events/second
- Storage: Efficient SQLite backend with indexes
- Memory: Minimal memory footprint with async processing

## Troubleshooting

### Database Lock Issues
Ensure only one middleware instance accesses a database file at a time.

### Performance Issues
- Adjust `batch_size` and `flush_interval_ms`
- Enable `compression_enabled` for large datasets
- Use `async_logging` for high-throughput scenarios

### Missing Events
- Check `capture` configuration
- Verify `exclude_patterns` aren't too broad
- Ensure agent IDs match exactly

## License

MIT License - see LICENSE file for details.