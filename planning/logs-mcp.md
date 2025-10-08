# Claude Flow MCP Documentation

## Overview

Claude Flow implements a comprehensive Model Context Protocol (MCP) system that provides external AI models with access to powerful agent orchestration, swarm coordination, monitoring, and development tools. The MCP integration enables seamless Claude Code integration with 30+ essential tools for AI-powered development workflows.

## MCP Server Configuration

### Server Implementation
- **Protocol**: JSON-RPC 2.0 over stdio
- **Version**: 2.0.0-novice-sdk
- **Session Timeout**: 8 hours (extended for long CFN loops)
- **Transport**: stdio with HTTP/WebSocket support planned

### Server Variants
1. **mcp-server-sdk.js**: SDK-based version using @modelcontextprotocol/sdk
2. **mcp-server-novice.js**: Simplified version for beginners
3. **server-with-wrapper.ts**: Enhanced version with wrapper functionality
4. **server-wrapper-mode.ts**: Wrapper mode implementation

## Core MCP Tools (30 Essential Tools)

### Swarm Coordination Tools (8 tools)

#### `swarm_init`

**Purpose**: Initialize swarm with topology and configuration

**Parameters**:
- `topology` (string): Topology type ('mesh', 'hierarchical', 'ring', 'star')
- `maxAgents` (number, optional): Maximum number of agents (default: 8)
- `strategy` (string, optional): Coordination strategy (default: 'auto')

**Returns**: Swarm configuration object with swarm ID and status

**Example**:
```json
{
  "tool": "swarm_init",
  "parameters": {
    "topology": "mesh",
    "maxAgents": 6,
    "strategy": "balanced"
  }
}
```

#### `agent_spawn`

**Purpose**: Create specialized AI agents

**Parameters**:
- `type` (string): Agent type ('coder', 'tester', 'researcher', 'analyst', etc.)
- `name` (string): Agent name
- `capabilities` (string[]): List of agent capabilities
- `swarmId` (string, optional): Target swarm ID

**Returns**: Created agent instance with ID and configuration

#### `task_orchestrate`

**Purpose**: Orchestrate complex task workflows

**Parameters**:
- `task` (object): Task definition with description and requirements
- `strategy` (string, optional): Orchestration strategy ('parallel', 'sequential', 'adaptive')
- `priority` (string, optional): Task priority ('low', 'medium', 'high', 'critical')
- `dependencies` (string[], optional): Task dependencies

**Returns**: Task execution result with status and output

#### `swarm_status`

**Purpose**: Monitor swarm health and performance

**Parameters**:
- `swarmId` (string, optional): Specific swarm ID (default: all swarms)

**Returns**: Comprehensive swarm status information

#### `agent_list`

**Purpose**: List active agents & capabilities

**Parameters**:
- `swarmId` (string, optional): Filter by swarm ID
- `type` (string, optional): Filter by agent type
- `status` (string, optional): Filter by status ('active', 'idle', 'completed')

**Returns**: Array of agent information with capabilities

#### `coordination_sync`

**Purpose**: Sync agent coordination

**Parameters**:
- `swarmId` (string): Swarm identifier

**Returns**: Synchronization result with updated state

#### `swarm_scale`

**Purpose**: Auto-scale agent count

**Parameters**:
- `swarmId` (string): Swarm identifier
- `targetSize` (number): Target number of agents

**Returns**: Scaling operation result

#### `swarm_destroy`

**Purpose**: Gracefully shutdown swarm

**Parameters**:
- `swarmId` (string): Swarm identifier
- `force` (boolean, optional): Force shutdown (default: false)

**Returns**: Shutdown confirmation

### Memory Management Tools (7 tools)

#### `memory_usage`

**Purpose**: Store/retrieve persistent memory with TTL and namespacing

**Parameters**:
- `action` (string): Memory action ('store', 'retrieve', 'list', 'delete', 'search')
- `key` (string, optional): Memory key
- `value` (string, optional): Value to store
- `namespace` (string, optional): Memory namespace (default: 'default')
- `ttl` (number, optional): Time to live in seconds

**Returns**: Operation result with data or confirmation

#### `memory_search`

**Purpose**: Search memory with patterns

**Parameters**:
- `pattern` (string): Search pattern
- `namespace` (string, optional): Memory namespace
- `limit` (number, optional): Maximum results (default: 10)

**Returns**: Array of search results with relevance scores

#### `memory_persist`

**Purpose**: Cross-session persistence

**Parameters**:
- `sessionId` (string): Session identifier
- `data` (object): Data to persist
- `namespace` (string, optional): Target namespace

**Returns**: Persistence confirmation

#### `memory_backup`

**Purpose**: Backup memory stores

**Parameters**:
- `namespace` (string, optional): Specific namespace
- `destination` (string, optional): Backup destination
- `compress` (boolean, optional): Compress backup (default: true)

**Returns**: Backup operation result with file location

#### `memory_restore`

**Purpose**: Restore from backups

**Parameters**:
- `backupFile` (string): Path to backup file
- `namespace` (string, optional): Target namespace
- `merge` (boolean, optional): Merge with existing data (default: false)

**Returns**: Restore operation result

#### `cache_manage`

**Purpose**: Manage coordination cache

**Parameters**:
- `action` (string): Cache action ('clear', 'stats', 'optimize', 'configure')
- `keyPattern` (string, optional): Key pattern for operations
- `config` (object, optional): Cache configuration

**Returns**: Cache operation result

#### `state_snapshot`

**Purpose**: Create state snapshots

**Parameters**:
- `components` (string[], optional): Components to snapshot
- `format` (string, optional): Snapshot format ('json', 'binary')
- `compress` (boolean, optional): Compress snapshot (default: true)

**Returns**: Snapshot creation result with file location

### Performance Monitoring Tools (5 tools)

#### `performance_report`

**Purpose**: Generate performance reports with real-time metrics

**Parameters**:
- `timeframe` (string, optional): Time range ('24h', '7d', '30d')
- `format` (string, optional): Report format ('summary', 'detailed', 'json')
- `components` (string[], optional): Specific components to analyze

**Returns**: Comprehensive performance report

#### `bottleneck_analyze`

**Purpose**: Identify performance bottlenecks

**Parameters**:
- `component` (string): Component to analyze
- `metrics` (string[], optional): Specific metrics to analyze
- `timeframe` (string, optional): Analysis timeframe

**Returns**: Bottleneck analysis with recommendations

#### `token_usage`

**Purpose**: Analyze token consumption

**Parameters**:
- `operation` (string): Operation type
- `timeframe` (string, optional): Time range
- `groupBy` (string, optional): Group results by ('agent', 'operation', 'hour')

**Returns**: Token usage statistics and trends

#### `health_check`

**Purpose**: System health monitoring

**Parameters**:
- `components` (string[], optional): Components to check
- `deep` (boolean, optional): Deep health check (default: false)
- `timeout` (number, optional): Check timeout in seconds

**Returns**: System health status with component details

#### `metrics_collect`

**Purpose**: Collect system metrics

**Parameters**:
- `metrics` (string[]): Metrics to collect
- `timeframe` (string, optional): Collection timeframe
- `interval` (number, optional): Collection interval

**Returns**: Collected metrics data

### Project Analysis Tools (7 tools)

#### `language_detect`

**Purpose**: Multi-language project analysis

**Parameters**:
- `projectPath` (string): Path to project
- `deep` (boolean, optional): Deep analysis (default: false)
- `includeTests` (boolean, optional): Include test files (default: true)

**Returns**: Language analysis with file breakdown and statistics

#### `framework_detect`

**Purpose**: Framework pattern recognition

**Parameters**:
- `projectPath` (string): Path to project
- `language` (string, optional): Specific language
- `version` (boolean, optional): Detect framework versions

**Returns**: Framework analysis with version information

#### `rust_validate`

**Purpose**: Cargo test execution and validation

**Parameters**:
- `projectPath` (string): Path to Rust project
- `tests` (string[], optional): Specific tests to run
- `features` (string[], optional): Cargo features to enable

**Returns**: Test results and validation status

#### `typescript_validate`

**Purpose**: TypeScript type safety validation

**Parameters**:
- `projectPath` (string): Path to TypeScript project
- `configPath` (string, optional): Custom tsconfig path
- `strict` (boolean, optional): Use strict mode (default: true)

**Returns**: Type validation results with error details

#### `dependency_analyze`

**Purpose**: Dependency security scanning

**Parameters**:
- `projectPath` (string): Path to project
- `severity` (string, optional): Minimum severity level
- `includeDev` (boolean, optional): Include dev dependencies

**Returns**: Security analysis with vulnerability details

#### `build_optimize`

**Purpose**: Build optimization

**Parameters**:
- `projectPath` (string): Path to project
- `optimizations` (string[]): Optimization types to apply
- `dryRun` (boolean, optional): Dry run mode (default: false)

**Returns**: Build optimization results

#### `test_coordinate`

**Purpose**: Multi-language test coordination

**Parameters**:
- `projectPath` (string): Path to project
- `testPattern` (string, optional): Test file pattern
- `parallel` (boolean, optional): Run tests in parallel (default: true)

**Returns**: Test coordination results

### Task Management Tools (3 tools)

#### `task_status`

**Purpose**: Check task execution status

**Parameters**:
- `taskId` (string): Task identifier
- `verbose` (boolean, optional): Verbose status (default: false)

**Returns**: Current task status with progress details

#### `task_results`

**Purpose**: Get task completion results

**Parameters**:
- `taskId` (string): Task identifier
- `format` (string, optional): Result format ('json', 'text', 'summary')

**Returns**: Task execution results with output and artifacts

#### `agent_metrics`

**Purpose**: Agent performance metrics

**Parameters**:
- `agentId` (string): Agent identifier
- `timeframe` (string, optional): Time range ('24h', '7d', etc.)
- `metrics` (string[], optional): Specific metrics to retrieve

**Returns**: Agent performance metrics and statistics

## MCP Resources

### Available Resources
- `claude-flow://swarms`: Active swarm configurations and status
- `claude-flow://agents`: Registry of available agents
- `claude-flow://memory`: Persistent memory and cache status
- `claude-flow://system`: Health and diagnostic information

### Resource Access Patterns
```json
{
  "resource": "claude-flow://swarms",
  "uri": "swarms/active"
}
```

## Advanced MCP Features

### Real-time Capabilities
- **Streaming**: Real-time task progress updates
- **Events**: Agent lifecycle events
- **Notifications**: System alerts and notifications

### Security Features
- **Authentication**: Token-based authentication
- **Authorization**: Role-based access control
- **Audit Trail**: Complete operation logging

### Performance Optimizations
- **Caching**: Intelligent result caching
- **Batching**: Batch operation support
- **Compression**: Data compression for large transfers

## Integration Examples

### Basic Swarm Initialization
```javascript
// Initialize a mesh swarm
const result = await mcp.call('swarm_init', {
  topology: 'mesh',
  maxAgents: 4,
  strategy: 'balanced'
});

console.log(`Swarm ${result.swarmId} ready`);
```

### Complex Task Orchestration
```javascript
// Orchestrate a multi-agent development task
const taskResult = await mcp.call('task_orchestrate', {
  task: {
    description: 'Implement user authentication system',
    requirements: ['JWT tokens', 'password hashing', 'user management'],
    deliverables: ['API endpoints', 'database schema', 'tests']
  },
  strategy: 'adaptive',
  priority: 'high'
});
```

### Performance Monitoring
```javascript
// Get comprehensive performance report
const report = await mcp.call('performance_report', {
  timeframe: '24h',
  format: 'detailed',
  components: ['swarm-coordinator', 'memory-store', 'task-queue']
});

console.log(`Average response time: ${report.metrics.avgResponseTime}ms`);
```

### Memory Management
```javascript
// Store project context
await mcp.call('memory_usage', {
  action: 'store',
  key: 'project-context',
  value: JSON.stringify({
    name: 'User Authentication System',
    status: 'in-progress',
    team: ['backend-dev', 'security-specialist', 'tester']
  }),
  namespace: 'project-123',
  ttl: 86400 // 24 hours
});
```

## Error Handling

### MCP Error Format
```json
{
  "error": {
    "code": -32603,
    "message": "Agent creation failed",
    "data": {
      "agentType": "invalid-type",
      "availableTypes": ["coder", "tester", "researcher"],
      "suggestion": "Use valid agent type from available options"
    }
  }
}
```

### Common Error Scenarios
- **Invalid Parameters**: Parameter validation errors with suggestions
- **Resource Limits**: Resource exhaustion with retry recommendations
- **Authentication Failures**: Auth errors with token refresh guidance
- **Network Issues**: Connectivity problems with fallback options

## Best Practices

### Performance Guidelines
1. **Batch Operations**: Use batch mode for multiple operations
2. **Caching**: Enable result caching for repeated queries
3. **Streaming**: Use streaming for long-running operations
4. **Timeouts**: Set appropriate timeouts for operations

### Security Guidelines
1. **Token Management**: Regular token rotation
2. **Access Control**: Principle of least privilege
3. **Data Sanitization**: Sanitize all inputs and outputs
4. **Audit Logging**: Enable comprehensive audit trails

### Integration Guidelines
1. **Error Handling**: Implement robust error handling
2. **Retry Logic**: Use exponential backoff for retries
3. **Monitoring**: Monitor MCP connection health
4. **Fallbacks**: Implement fallback mechanisms

## Configuration

### Development Configuration
```json
{
  "transport": "stdio",
  "enableMetrics": true,
  "auth": {
    "enabled": false,
    "method": "token"
  },
  "logging": {
    "level": "debug"
  }
}
```

### Production Configuration
```json
{
  "transport": "http",
  "host": "0.0.0.0",
  "port": 3000,
  "tlsEnabled": true,
  "enableMetrics": true,
  "auth": {
    "enabled": true,
    "method": "token",
    "tokens": ["secure-token-here"]
  },
  "loadBalancer": {
    "enabled": true,
    "maxRequestsPerSecond": 100,
    "maxConcurrentRequests": 50
  },
  "sessionTimeout": 3600000,
  "maxSessions": 1000
}
```

## Monitoring and Maintenance

### Health Monitoring
- **Connection Health**: Monitor MCP connection status
- **Performance Metrics**: Track tool execution performance
- **Resource Usage**: Monitor memory and CPU usage
- **Error Rates**: Track error frequencies and patterns

### Maintenance Tasks
- **Log Rotation**: Regular log file rotation
- **Cache Cleanup**: Periodic cache cleanup
- **Session Cleanup**: Expired session removal
- **Backup Operations**: Regular data backups

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available logging features
- [Functions](./logs-functions.md) - Utility functions
- [Hooks](./logs-hooks.md) - System integration points
- [Slash Commands](./logs-slash-commands.md) - CLI operations