# Claude Flow API Documentation

## Overview

Claude Flow provides comprehensive APIs for AI agent orchestration, swarm coordination, monitoring, and system management. This documentation covers all REST APIs, MCP tools, CLI commands, and internal APIs.

## REST API (Transparency Dashboard)

### Base Configuration
- **Server**: Express.js with Socket.IO
- **Port**: Configurable (default from ApiConfig)
- **Base URL**: `http://localhost:{port}`

### Agent Status APIs
#### `/api/v1/status`
- **GET /**: Get all agent statuses with pagination and filtering
- **GET /agent/:agentId**: Get specific agent status
- **GET /active**: Get currently active agents
- **GET /paused**: Get currently paused agents
- **GET /summary**: Get status summary statistics
- **GET /errors**: Get agents with recent errors
- **GET /performance**: Get performance metrics for all agents
- **GET /heartbeat**: Get recent heartbeat information

### Metrics APIs
#### `/api/v1/metrics`
- **GET /**: Get current transparency metrics
- **GET /agent/:agentId**: Get performance metrics for specific agent
- **GET /tokens**: Get token usage metrics
- **GET /performance**: Get performance metrics
- **GET /hierarchy`: Get hierarchy analytics
- **GET /events`: Get event stream metrics
- **GET /efficiency`: Get efficiency and resource utilization metrics
- **GET /trends`: Get metric trends over time
- **GET /alerts`: Get current performance alerts

### Hierarchy APIs
#### `/api/v1/hierarchy`
- **GET /**: Get complete agent hierarchy tree
- **GET /level/:level`: Get agents at specific hierarchy level
- **GET /root`: Get root agents (level 1, no parent)
- **GET /parent/:parentAgentId`: Get child agents of specified parent
- **GET /agent/:agentId`: Get specific agent hierarchy information
- **GET /tree`: Get hierarchy as a tree structure (nested)
- **GET /stats`: Get hierarchy statistics
- **GET /search`: Search agents in hierarchy

### Event APIs
#### `/api/v1/events`
- **GET /**: Get recent agent lifecycle events
- **GET /agent/:agentId`: Get events for specific agent
- **GET /types`: Get available event types
- **GET /stats`: Get event statistics
- **GET /recent`: Get most recent events across all agents
- **GET /errors`: Get recent error events
- **GET /performance`: Get performance-related events

### System Routes
- **GET `/health`**: Health check endpoint
- **GET `/api`**: API documentation endpoint

## MCP Server APIs

### Server Configuration
- **Protocol**: JSON-RPC 2.0 over stdio
- **Version**: 2.0.0-novice-sdk
- **Session Timeout**: 8 hours

### Core Tools (30 Essential)

#### Swarm Coordination (8 tools)
- `swarm_init`: Initialize swarm with topology
- `agent_spawn`: Create specialized agents
- `task_orchestrate`: Orchestrate workflows
- `swarm_status`: Monitor swarm health
- `agent_list`: List active agents
- `coordination_sync`: Sync coordination
- `swarm_scale`: Auto-scale agents
- `swarm_destroy`: Shutdown swarm

#### Memory Management (7 tools)
- `memory_usage`: Store/retrieve memory
- `memory_search`: Search memory patterns
- `memory_persist`: Cross-session persistence
- `memory_backup`: Backup memory
- `memory_restore`: Restore backups
- `cache_manage`: Manage cache
- `state_snapshot`: Create snapshots

#### Performance Monitoring (5 tools)
- `performance_report`: Generate reports
- `bottleneck_analyze`: Identify bottlenecks
- `token_usage`: Analyze consumption
- `health_check`: System health
- `metrics_collect`: Collect metrics

#### Project Analysis (7 tools)
- `language_detect`: Multi-language analysis
- `framework_detect`: Framework patterns
- `rust_validate`: Cargo test execution
- `typescript_validate`: Type safety
- `dependency_analyze`: Security scanning
- `build_optimize`: Build optimization
- `test_coordinate`: Test coordination

#### Task Management (3 tools)
- `task_status`: Check execution status
- `task_results`: Get completion results
- `agent_metrics`: Agent performance

## CLI APIs

### Command Structure
- **Entry**: `src/cli/main.ts`
- **Registry**: `src/cli/commands/index.ts`
- **Framework**: Custom CLI with context

### Core Commands
- `swarm`: Swarm coordination
- `agent`: Agent lifecycle
- `memory`: Memory management
- `mcp`: MCP server management
- `config`: Configuration
- `status`: System status
- `monitor`: Monitoring
- `sparc`: SPARC methodology

## Authentication

### Methods
- **JWT Tokens**: Bearer token with roles
- **API Keys**: Service authentication
- **Basic Auth**: Development (admin/admin)
- **Optional Auth**: Anonymous access

### Authorization Levels
- **Roles**: admin, user, service
- **Permissions**: read, write, admin
- **Resource-based**: Per-endpoint control

## Response Formats

### Success Response
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Error Response
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable error",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "requestId": "req-123"
}
```

## Error Handling

### Error Classes
- `ApiError`: Base API error
- `ValidationError`: Validation failure
- `NotFoundError`: Resource missing
- `UnauthorizedError`: Auth failure
- `ForbiddenError`: Permission denied
- `RateLimitError`: Rate limit exceeded

### Middleware
- Centralized error processing
- Development vs production details
- Structured logging
- Graceful degradation

## Logger API (Legacy)

### Logger Configuration

#### configure(options)

**Purpose**: Configure logger behavior

**Signature**: `configure(options: LoggingConfig) -> Promise<void>`

**Parameters**:
- `options` (LoggingConfig): Configuration object
  - `level` (string): Log level - 'debug', 'info', 'warn', 'error'
  - `format` (string): Output format - 'json', 'text'
  - `destination` (string): Where to log - 'console', 'file', 'both'
  - `filePath` (string, optional): Path for file logging
  - `maxFileSize` (number, optional): Maximum file size in bytes
  - `maxFiles` (number, optional): Maximum number of rotated files

**Example**:
```javascript
await logger.configure({
  level: 'info',
  format: 'json',
  destination: 'both',
  filePath: './logs/app.log',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});
```

### Log Methods

#### debug(message, meta?)

**Purpose**: Log debug-level information

**Signature**: `debug(message: string, meta?: unknown) -> void`

**Parameters**:
- `message` (string): Log message
- `meta` (unknown, optional): Additional context data

**Example**:
```javascript
logger.debug('Processing request', { requestId: '123', userId: '456' });
```

#### info(message, meta?)

**Purpose**: Log informational messages

**Signature**: `info(message: string, meta?: unknown) -> void`

**Parameters**:
- `message` (string): Log message
- `meta` (unknown, optional): Additional context data

**Example**:
```javascript
logger.info('User authenticated', { userId: '456', timestamp: Date.now() });
```

#### warn(message, meta?)

**Purpose**: Log warning messages

**Signature**: `warn(message: string, meta?: unknown) -> void`

**Parameters**:
- `message` (string): Warning message
- `meta` (unknown, optional): Additional context data

**Example**:
```javascript
logger.warn('Rate limit approaching', { userId: '456', current: 95, limit: 100 });
```

#### error(message, error?)

**Purpose**: Log error messages

**Signature**: `error(message: string, error?: unknown) -> void`

**Parameters**:
- `message` (string): Error message
- `error` (unknown, optional): Error object or details

**Example**:
```javascript
logger.error('Database connection failed', {
  host: 'localhost',
  port: 5432,
  originalError: error
});
```

### Advanced Features

#### child(context)

**Purpose**: Create child logger with additional context

**Signature**: `child(context: Record<string, unknown>) -> Logger`

**Parameters**:
- `context` (Record): Context data to include in all log entries

**Returns**: New Logger instance with inherited configuration plus context

**Example**:
```javascript
const requestLogger = logger.child({
  requestId: '123',
  userId: '456',
  ip: '192.168.1.1'
});

requestLogger.info('Processing order');
// Output includes all context from parent + child
```

#### close()

**Purpose**: Properly close logger and release resources

**Signature**: `close() -> Promise<void>`

**Example**:
```javascript
// In application shutdown
await logger.close();
process.exit(0);
```

## Related Documentation

- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration hooks
- [MCP](./logs-mcp.md) - Model Context Protocol integration
- [Slash Commands](./logs-slash-commands.md) - CLI commands