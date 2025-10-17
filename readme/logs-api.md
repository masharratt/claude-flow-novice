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

### Agent Observation APIs

**Purpose**: Real-time agent state monitoring and transparency system

**Base URL**: `http://localhost:3001/api/v1`

#### `/api/v1/agents/:agentId/state`
- **GET /**: Get current agent state (idle, active, paused, error, completed)
- **GET /transitions**: Get state transition history
- **GET /timeline`: Get chronological state timeline

**Response**:
```json
{
  "agentId": "coder-1",
  "state": "active",
  "lastUpdated": 1697234567890,
  "duration": 120000,
  "progress": 0.65,
  "confidence": 0.82
}
```

#### `/api/v1/agents/:agentId/activity`
- **GET /**: Get recent activity log
- **GET /tools`: Get tool usage history
- **GET /messages`: Get message exchange history

**Response**:
```json
{
  "agentId": "coder-1",
  "activities": [
    {
      "timestamp": 1697234567890,
      "type": "tool_use",
      "tool": "bash_execute",
      "duration": 5000,
      "status": "completed"
    }
  ]
}
```

#### `/api/v1/agents/:agentId/progress`
- **GET /**: Get current progress metrics
- **GET /prediction`: Get ML-based completion prediction
- **GET /milestones`: Get milestone achievements

**Response**:
```json
{
  "agentId": "coder-1",
  "progress": 0.65,
  "estimatedCompletion": 1697235678900,
  "confidence": 0.82,
  "milestones": [
    {
      "name": "Code implementation",
      "completed": true,
      "timestamp": 1697234567890
    }
  ]
}
```

#### `/api/v1/agents/:agentId/intervention`
- **POST /pause**: Pause agent execution
- **POST /resume**: Resume paused agent
- **POST /redirect`: Redirect agent to new task

**Request**:
```json
{
  "action": "pause",
  "reason": "Manual intervention for review"
}
```

#### `/api/v1/transparency/stream`
- **WebSocket**: Real-time agent state updates
- **Events**: `state_change`, `progress_update`, `activity`, `error`

**WebSocket Usage**:
```javascript
const socket = io('ws://localhost:3001');
socket.emit('subscribe', { agents: ['coder-1', 'security-1'] });
socket.on('agent:update', (data) => {
  console.log('Agent state updated:', data);
});
```

### Web Portal API

**Purpose**: REST and WebSocket API for web portal monitoring interface

**Base URLs**:
- REST: `http://localhost:3000/api`
- WebSocket: `ws://localhost:3000` (Socket.IO)

**Authentication**: JWT Bearer token (optional for most endpoints, required for admin operations)

**REST Endpoints**:
1. `GET /api/agents/hierarchy` - Agent tree with optional filters (status, type)
2. `GET /api/agents/:id/status` - Individual agent status with metrics
3. `POST /api/agents/:id/intervene` - Admin-only intervention (pause/resume/terminate/restart)
4. `GET /api/metrics` - System-wide metrics (5-min aggregation)
5. `GET /api/events` - Paginated event history (max 1000/page)
6. `GET /api/resources` - Current system resource utilization
7. `GET /api/health` - Health check (healthy/degraded/unhealthy)
8. `POST /api/auth/logout` - JWT token revocation (blacklist)
9. `POST /api/auth/refresh` - Refresh access token

**WebSocket Events**:

Server-to-Client:
- `agent:update` - Agent status update (throttle: 1/sec)
- `agent:spawned` - New agent created
- `agent:terminated` - Agent terminated
- `hierarchy:change` - Hierarchy structure changed
- `metrics:update` - System metrics (throttle: 1/5sec)
- `event:stream` - Real-time event stream
- `cfn:loop:update` - CFN loop status change
- `cfn:phase:complete` - Phase completed with telemetry
- `cfn:consensus:ready` - Consensus validation results
- `ace:context:updated` - Adaptive context changes
- `error` - Error notification

Client-to-Server:
- `subscribe` - Subscribe to agent/swarm updates
- `unsubscribe` - Unsubscribe from updates
- `ping` - Connection latency check
- `cfn:loop:control` - CFN loop control commands
- `ace:context:query` - Query adaptive context

**Rate Limiting**:
- Standard endpoints: 100 req/min per IP
- Intervention endpoint: 10 req/min per IP
- Auth endpoints: 10 req/min per IP

**Documentation**: packages/web-portal/docs/API.md (1303 lines)

## CFN Loop APIs

### Loop Management
#### `/api/v1/cfn/loops`
- **GET /**: List all CFN loops with status
- **POST /**: Create new CFN loop
- **GET /:loopId**: Get specific loop details
- **PUT /:loopId`: Update loop configuration
- **DELETE /:loopId`: Cancel/terminate loop

#### `/api/v1/cfn/phases`
- **GET /**: List all phases across loops
- **GET /:phaseId`: Get phase details with telemetry
- **POST /:phaseId/advance`: Advance to next phase
- **GET /:phaseId/consensus`: Get consensus validation status

#### `/api/v1/cfn/agents`
- **GET /**: List agents in CFN loops
- **POST /:agentId/confidence`: Submit confidence score
- **GET /:agentId/metrics`: Get agent performance metrics
- **POST /:agentId/retry`: Retry failed agent task

### ACE System APIs
#### `/api/v1/ace/context`
- **GET /**: Get current adaptive context
- **POST /**: Store context with semantic similarity
- **GET /search`: Search context by content/tags
- **POST /inject`: Inject context into CLAUDE.md dynamically

#### `/api/v1/ace/bullets`
- **GET /**: Get context bullets by category
- **POST /**: Create new context bullet
- **PUT /:bulletId`: Update existing bullet
- **DELETE /:bulletId`: Remove context bullet

#### `/api/v1/ace/reflection`
- **GET /**: Get recent reflection deltas
- **POST /**: Store reflection from completed tasks
- **GET /curate`: Get curated reflection summaries

## Agent Selection APIs

### Agent Registry
#### `/api/v1/agents`
- **GET /**: List all available agents with capabilities
- **GET /categories`: List agent categories
- **GET /category/:category`: Get agents in specific category
- **GET /search`: Search agents by name or capability

**Response**:
```json
{
  "agents": [
    {
      "type": "security-specialist",
      "name": "Security Specialist",
      "category": "security",
      "description": "Security audits, vulnerability assessment, security implementation",
      "capabilities": ["security audits", "vulnerability scanning", "secure coding practices"],
      "useCases": ["security-audit", "feature-development"],
      "keywords": ["security", "vulnerability", "audit", "authentication", "encryption"]
    }
  ],
  "total": 85,
  "categories": ["core-agents", "security", "architecture", "testing"]
}
```

#### `/api/v1/agents/recommend`
- **POST /**: Get agent recommendations for task

**Request**:
```json
{
  "task": "Build secure authentication system",
  "context": {
    "mode": "enterprise",
    "domain": "security",
    "complexity": "high"
  },
  "options": {
    "maxAgents": 5,
    "includeReasoning": true,
    "useCaseOverride": null
  }
}
```

**Response**:
```json
{
  "primary": [
    {
      "type": "coordinator-hybrid",
      "name": "Coordinator Hybrid",
      "reasoning": "Complex task requires coordination",
      "confidence": 0.95
    },
    {
      "type": "security-specialist",
      "name": "Security Specialist", 
      "reasoning": "Security domain matched",
      "confidence": 0.90
    }
  ],
  "secondary": [
    {
      "type": "architect",
      "name": "Architect",
      "reasoning": "System design required",
      "confidence": 0.85
    }
  ],
  "reasoning": [
    "Matched use case: feature-development",
    "Matched domain: security", 
    "Complex task requires coordination"
  ],
  "spawnCommand": "node spawn-workers.js \"Build secure authentication system\" --agents=coordinator-hybrid,security-specialist,architect"
}
```

#### `/api/v1/agents/use-cases`
- **GET /**: List all available use cases
- **GET /:useCase`: Get agents for specific use case
- **POST /**: Create custom use case mapping

**Response**:
```json
{
  "useCases": [
    {
      "name": "feature-development",
      "description": "New feature implementation and development",
      "primaryAgents": ["architect", "coder", "tester"],
      "secondaryAgents": ["code-analyzer"],
      "domain": "development"
    },
    {
      "name": "security-audit",
      "description": "Security assessment and vulnerability analysis",
      "primaryAgents": ["security-specialist", "code-analyzer", "tester"],
      "secondaryAgents": ["production-validator"],
      "domain": "security"
    }
  ]
}
```

### Agent Definition Management
#### `/api/v1/agents/definitions`
- **GET /**: Get agent definitions from AVAILABLE-AGENTS.md
- **POST /rebuild`: Rebuild agent definitions from .claude/agents/ folder
- **PUT /:agentType`: Update agent definition
- **GET /validate`: Validate agent definitions

**Response**:
```json
{
  "lastUpdated": "2025-10-15T10:30:00Z",
  "totalAgents": 85,
  "categories": 12,
  "sourceFiles": 85,
  "validation": {
    "valid": 82,
    "warnings": 3,
    "errors": 0
  }
}
```

### Coordinator Integration APIs
#### `/api/v1/coordinators/selection`
- **POST /**: Intelligent agent selection for coordinators

**Request**:
```json
{
  "task": "Implement microservices architecture",
  "coordinatorType": "coordinator-hybrid",
  "preferences": {
    "includeSecurity": true,
    "maxAgents": 4,
    "excludeTypes": ["mobile-dev"]
  }
}
```

**Response**:
```json
{
  "selection": {
    "primary": ["system-architect", "backend-dev", "security-specialist"],
    "secondary": ["tester", "api-docs"],
    "reasoning": "Enterprise architecture requires security integration"
  },
  "executionPlan": {
    "spawnCommand": "node spawn-workers.js \"Implement microservices\" --agents=system-architect,backend-dev,security-specialist",
    "estimatedDuration": 45,
    "estimatedCost": 0.85
  }
}
```

#### `/api/v1/coordinators/registry/status`
- **GET /**: Get agent use case registry status

**Response**:
```json
{
  "status": "loaded",
  "lastUpdated": "2025-10-15T10:30:00Z",
  "agentCount": 85,
  "useCaseCount": 15,
  "domainCount": 12,
  "fallbackMode": false,
  "health": "healthy"
}
```

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