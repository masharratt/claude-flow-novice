# Claude Flow MCP Documentation

## Overview

Claude Flow implements a comprehensive Model Context Protocol (MCP) system that provides external AI models with access to powerful agent orchestration, fleet management, swarm coordination, monitoring, and development tools. The MCP integration enables seamless Claude Code integration with 44+ essential tools for AI-powered development workflows, including advanced fleet management, event bus architecture, multi-national compliance, and WASM 40x performance optimization capabilities.

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

## Core MCP Tools (44 Essential Tools)

### Fleet Management Tools (6 tools)

#### `fleet_manager_initialize`

**Purpose**: Initialize enterprise fleet manager supporting 1000+ agents

**Parameters**:
- `config` (object, optional): Fleet configuration
  - `maxAgents` (number): Maximum concurrent agents (default: 1000)
  - `regions` (string[]): Supported geographic regions
  - `autoScaling` (boolean): Enable auto-scaling (default: true)
  - `efficiencyTarget` (number): Efficiency gain target (default: 0.40)

**Returns**: Initialized fleet manager instance

**Example**:
```json
{
  "tool": "fleet_manager_initialize",
  "parameters": {
    "config": {
      "maxAgents": 1500,
      "regions": ["us-east-1", "eu-west-1"],
      "autoScaling": true,
      "efficiencyTarget": 0.40
    }
  }
}
```

#### `fleet_scale`

**Purpose**: Auto-scale fleet size with efficiency optimization

**Parameters**:
- `fleetId` (string): Fleet identifier
- `targetSize` (number): Target fleet size
- `strategy` (string, optional): Scaling strategy ('predictive', 'reactive', 'cost-optimized')

**Returns**: Scaling operation result with efficiency metrics

#### `fleet_optimize_resources`

**Purpose**: Optimize resource allocation across fleet

**Parameters**:
- `fleetId` (string): Fleet identifier
- `options` (object, optional): Optimization options
  - `efficiencyTarget` (number): Efficiency gain target (default: 0.40)
  - `costOptimization` (boolean): Enable cost optimization (default: true)

**Returns**: Resource optimization result with efficiency gains

#### `fleet_get_metrics`

**Purpose**: Get comprehensive fleet performance metrics

**Parameters**:
- `fleetId` (string): Fleet identifier
- `timeframe` (string, optional): Analysis timeframe ('1h', '24h', '7d')

**Returns**: Fleet performance metrics and efficiency data

#### `fleet_set_regions`

**Purpose**: Configure multi-region fleet deployment

**Parameters**:
- `fleetId` (string): Fleet identifier
- `regions` (string[]): Geographic regions for deployment
- `failover` (boolean, optional): Enable automatic failover (default: true)

**Returns**: Multi-region configuration result

#### `fleet_monitor_health`

**Purpose**: Monitor fleet health and availability

**Parameters**:
- `fleetId` (string): Fleet identifier
- `deepCheck` (boolean, optional): Perform deep health check (default: false)

**Returns**: Fleet health status with availability metrics

### Event Bus Tools (4 tools)

#### `eventbus_initialize`

**Purpose**: Initialize high-performance event bus supporting 10,000+ events/second

**Parameters**:
- `config` (object, optional): Event bus configuration
  - `throughputTarget` (number): Events per second target (default: 10000)
  - `latencyTarget` (number): Average latency target in ms (default: 50)
  - `workerThreads` (number): Worker thread pool size (default: 4)
  - `protocols` (string[]): Supported protocols (default: ['WebSocket', 'HTTP/2', 'gRPC'])

**Returns**: Initialized event bus instance

#### `eventbus_publish`

**Purpose**: Publish events with advanced routing and load balancing

**Parameters**:
- `event` (object): Event to publish
  - `type` (string): Event type
  - `data` (object): Event data
  - `priority` (number): Event priority (1-10)
- `routing` (object, optional): Routing options
  - `strategy` (string): Load balancing strategy ('round-robin', 'least-connections', 'weighted')
  - `serialization` (string): Serialization format ('json', 'messagepack')

**Returns**: Event publication result with delivery confirmation

#### `eventbus_subscribe`

**Purpose**: Subscribe to event patterns with advanced filtering

**Parameters**:
- `pattern` (string): Event pattern to match
- `handler` (string): Handler function name
- `options` (object, optional): Subscription options
  - `filter` (object): Event filter criteria
  - `batchSize` (number): Batch processing size (default: 100)

**Returns**: Subscription handle with unsubscribe capability

#### `eventbus_get_metrics`

**Purpose**: Get event bus performance metrics

**Parameters**:
- `timeframe` (string, optional): Analysis timeframe ('1h', '24h', '7d')
- `detailed` (boolean, optional): Include detailed metrics (default: false)

**Returns**: Event bus performance metrics and throughput data

### Compliance Tools (4 tools)

#### `compliance_validate_standard`

**Purpose**: Validate compliance against regulatory standards

**Parameters**:
- `standard` (string): Compliance standard ('GDPR', 'CCPA', 'SOC2', 'ISO27001')
- `scope` (string[], optional): Compliance scope areas
- `detailed` (boolean, optional): Include detailed analysis (default: false)

**Returns**: Compliance validation result with recommendations

#### `compliance_audit_generate`

**Purpose**: Generate comprehensive compliance audit reports

**Parameters**:
- `period` (string): Audit period ('daily', 'weekly', 'monthly', 'quarterly')
- `format` (string, optional): Report format ('json', 'pdf', 'csv')
- `includeRecommendations` (boolean, optional): Include improvement recommendations (default: true)

**Returns**: Generated compliance audit report

#### `compliance_setup_data_residency`

**Purpose**: Configure data residency compliance

**Parameters**:
- `region` (string): Data residency region
- `standards` (string[]): Applicable compliance standards
- `encryption` (boolean, optional): Enable encryption (default: true)

**Returns**: Data residency configuration result

#### `compliance_monitor_ongoing`

**Purpose**: Monitor ongoing compliance status

**Parameters**:
- `standards` (string[]): Compliance standards to monitor
- `alertThreshold` (number, optional): Alert threshold for compliance issues (default: 0.95)

**Returns**: Current compliance status with alerts

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

### WASM Performance Tools (6 tools)

#### `wasm_runtime_initialize`

**Purpose**: Initialize WebAssembly runtime with 40x performance optimization

**Parameters**:
- `config` (object, optional): Runtime configuration
  - `memorySize` (number): Memory pool size in bytes (default: 1GB)
  - `enableSIMD` (boolean): Enable SIMD vectorization (default: true)
  - `performanceTarget` (number): Target performance multiplier (default: 40x)
  - `workerPoolSize` (number): Worker thread pool size (default: 8)

**Returns**: Initialized WASM runtime instance with configuration

**Example**:
```json
{
  "tool": "wasm_runtime_initialize",
  "parameters": {
    "config": {
      "memorySize": 1073741824,
      "enableSIMD": true,
      "performanceTarget": 40.0,
      "workerPoolSize": 8
    }
  }
}
```

#### `wasm_optimize_code`

**Purpose**: Optimize code with 40x performance boost

**Parameters**:
- `code` (string): Source code to optimize
- `options` (object, optional): Optimization options
  - `enableVectorization` (boolean): Enable SIMD vectorization (default: true)
  - `enableMemoization` (boolean): Enable function memoization (default: true)
  - `unrollLoops` (boolean): Enable loop unrolling (default: true)
  - `maxUnrollIterations` (number): Maximum unroll iterations (default: 64)

**Returns**: Optimization result with performance metrics

#### `wasm_parse_ast`

**Purpose**: Parse AST with sub-millisecond performance

**Parameters**:
- `code` (string): Source code to parse
- `options` (object, optional): Parse options
  - `includeTokens` (boolean): Include token information (default: false)
  - `includeSourceMap` (boolean): Include source mapping (default: false)

**Returns**: AST parse result with timing information

#### `wasm_batch_process`

**Purpose**: Batch process files with high throughput

**Parameters**:
- `files` (object[]): Array of file data
  - `name` (string): File name
  - `content` (string): File content
- `options` (object, optional): Processing options
  - `batchSize` (number): Files per batch (default: 10)
  - `enableParallel` (boolean): Enable parallel processing (default: true)
  - `maxConcurrency` (number): Maximum concurrent operations (default: 8)

**Returns**: Batch processing result with throughput metrics

#### `wasm_execute_operation`

**Purpose**: Execute enhanced WASM operations with 40x performance

**Parameters**:
- `operation` (string): Operation type ('optimize', 'vectorize', 'batch_process', 'memory_copy')
- `args` (any[]): Operation arguments

**Returns**: Execution result with performance boost metrics

#### `wasm_benchmark_performance`

**Purpose**: Benchmark 40x performance capabilities

**Parameters**:
- `tests` (object[], optional): Custom test cases (default: standard suite)
  - `name` (string): Test name
  - `operation` (string): Operation to test
  - `args` (any[]): Test arguments
  - `expectedBoost` (number): Expected performance boost

**Returns**: Benchmark results with success rate and performance metrics

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