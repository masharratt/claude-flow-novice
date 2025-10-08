# Claude Flow Functions Documentation

## Core Agent Management Functions

### Agent Registry Functions

#### `AgentRegistry.getInstance()`

**Purpose**: Get singleton agent registry instance

**Signature**: `getInstance() -> AgentRegistry`

**Returns**: AgentRegistry singleton instance

**Example**:
```javascript
const registry = AgentRegistry.getInstance();
const agents = registry.listActiveAgents();
```

#### `AgentRegistry.registerAgent(agentConfig)`

**Purpose**: Register new agent with capabilities

**Signature**: `registerAgent(agentConfig: AgentConfig) -> string`

**Parameters**:
- `agentConfig` (AgentConfig): Agent configuration with capabilities

**Returns**: Agent ID

**Example**:
```javascript
const agentId = registry.registerAgent({
  type: 'coder',
  capabilities: ['javascript', 'react', 'node.js'],
  maxConcurrency: 3
});
```

#### `AgentRegistry.getAgent(agentId)`

**Purpose**: Get agent by ID

**Signature**: `getAgent(agentId: string) -> Agent | null`

**Parameters**:
- `agentId` (string): Agent identifier

**Returns**: Agent instance or null

#### `AgentRegistry.listAgents(filter?)`

**Purpose**: List agents with optional filtering

**Signature**: `listAgents(filter?: AgentFilter) -> Agent[]`

**Parameters**:
- `filter` (AgentFilter, optional): Filter criteria

**Returns**: Array of matching agents

## Swarm Coordination Functions

### Swarm Initialization Functions

#### `swarm_init(topology, maxAgents?, strategy?)`

**Purpose**: Initialize swarm with topology and configuration

**Signature**: `swarm_init(topology: TopologyType, maxAgents?: number, strategy?: SwarmStrategy) -> SwarmConfig`

**Parameters**:
- `topology` (TopologyType): 'mesh', 'hierarchical', 'ring', 'star'
- `maxAgents` (number, optional): Maximum number of agents (default: 8)
- `strategy` (SwarmStrategy, optional): Coordination strategy (default: 'auto')

**Returns**: Swarm configuration object

**Example**:
```javascript
const swarm = await swarm_init('mesh', 6, 'balanced');
console.log(`Swarm ${swarm.id} initialized with ${swarm.agentCount} agents`);
```

#### `agent_spawn(type, name, capabilities, swarmId?)`

**Purpose**: Create specialized AI agents

**Signature**: `agent_spawn(type: AgentType, name: string, capabilities: string[], swarmId?: string) -> Agent`

**Parameters**:
- `type` (AgentType): Agent type ('coder', 'tester', 'researcher', etc.)
- `name` (string): Agent name
- `capabilities` (string[]): List of agent capabilities
- `swarmId` (string, optional): Target swarm ID

**Returns**: Created agent instance

**Example**:
```javascript
const coder = await agent_spawn('coder', 'frontend-dev',
  ['react', 'typescript', 'css'], 'swarm-123');
```

#### `task_orchestrate(task, strategy?, priority?, dependencies?)`

**Purpose**: Orchestrate complex task workflows

**Signature**: `task_orchestrate(task: Task, strategy?: OrchestrationStrategy, priority?: Priority, dependencies?: string[]) -> TaskResult`

**Parameters**:
- `task` (Task): Task to orchestrate
- `strategy` (OrchestrationStrategy, optional): 'parallel', 'sequential', 'adaptive'
- `priority` (Priority, optional): 'low', 'medium', 'high', 'critical'
- `dependencies` (string[], optional): Task dependencies

**Returns**: Task execution result

### Swarm Monitoring Functions

#### `swarm_status(swarmId?)`

**Purpose**: Monitor swarm health and performance

**Signature**: `swarm_status(swarmId?: string) -> SwarmStatus`

**Parameters**:
- `swarmId` (string, optional): Specific swarm ID (default: all swarms)

**Returns**: Swarm status information

**Example**:
```javascript
const status = await swarm_status('swarm-123');
console.log(`Active agents: ${status.activeAgents}, Health: ${status.health}%`);
```

#### `swarm_scale(swarmId, targetSize)`

**Purpose**: Auto-scale agent count

**Signature**: `swarm_scale(swarmId: string, targetSize: number) -> ScaleResult`

**Parameters**:
- `swarmId` (string): Swarm identifier
- `targetSize` (number): Target number of agents

**Returns**: Scaling operation result

#### `coordination_sync(swarmId)`

**Purpose**: Sync agent coordination

**Signature**: `coordination_sync(swarmId: string) -> SyncResult`

**Parameters**:
- `swarmId` (string): Swarm identifier

**Returns**: Synchronization result

## Memory Management Functions

### Memory Storage Functions

#### `memory_usage(action, key?, value?, namespace?, ttl?)`

**Purpose**: Store/retrieve persistent memory with TTL and namespacing

**Signature**: `memory_usage(action: MemoryAction, key?: string, value?: string, namespace?: string, ttl?: number) -> any`

**Parameters**:
- `action` (MemoryAction): 'store', 'retrieve', 'list', 'delete', 'search'
- `key` (string, optional): Memory key
- `value` (string, optional): Value to store
- `namespace` (string, optional): Memory namespace (default: 'default')
- `ttl` (number, optional): Time to live in seconds

**Returns**: Operation result

**Example**:
```javascript
// Store memory
await memory_usage('store', 'user-preference', 'dark-mode', 'ui', 3600);

// Retrieve memory
const preference = await memory_usage('retrieve', 'user-preference', null, 'ui');
```

#### `memory_search(pattern, namespace?, limit?)`

**Purpose**: Search memory with patterns

**Signature**: `memory_search(pattern: string, namespace?: string, limit?: number) -> SearchResult[]`

**Parameters**:
- `pattern` (string): Search pattern
- `namespace` (string, optional): Memory namespace
- `limit` (number, optional): Maximum results (default: 10)

**Returns**: Array of search results

### Memory Persistence Functions

#### `memory_persist(sessionId, data)`

**Purpose**: Cross-session persistence

**Signature**: `memory_persist(sessionId: string, data: any) -> Promise<void>`

**Parameters**:
- `sessionId` (string): Session identifier
- `data` (any): Data to persist

#### `memory_backup(namespace?, destination?)`

**Purpose**: Backup memory stores

**Signature**: `memory_backup(namespace?: string, destination?: string) -> BackupResult`

**Parameters**:
- `namespace` (string, optional): Specific namespace
- `destination` (string, optional): Backup destination

**Returns**: Backup operation result

## Task Management Functions

### Task Status Functions

#### `task_status(taskId)`

**Purpose**: Check task execution status

**Signature**: `task_status(taskId: string) -> TaskStatus`

**Parameters**:
- `taskId` (string): Task identifier

**Returns**: Current task status

**Example**:
```javascript
const status = await task_status('task-456');
console.log(`Task ${status.state}: ${status.progress}% complete`);
```

#### `task_results(taskId)`

**Purpose**: Get task completion results

**Signature**: `task_results(taskId: string) -> TaskResult`

**Parameters**:
- `taskId` (string): Task identifier

**Returns**: Task execution results

### Agent Performance Functions

#### `agent_metrics(agentId, timeframe?)`

**Purpose**: Agent performance metrics

**Signature**: `agent_metrics(agentId: string, timeframe?: string) -> AgentMetrics`

**Parameters**:
- `agentId` (string): Agent identifier
- `timeframe` (string, optional): Time range ('24h', '7d', etc.)

**Returns**: Agent performance metrics

## Performance Monitoring Functions

### Performance Analysis Functions

#### `performance_report(timeframe?, format?)`

**Purpose**: Generate performance reports with real-time metrics

**Signature**: `performance_report(timeframe?: string, format?: string) -> PerformanceReport`

**Parameters**:
- `timeframe` (string, optional): Time range ('24h', '7d', '30d')
- `format` (string, optional): Report format ('summary', 'detailed', 'json')

**Returns**: Comprehensive performance report

**Example**:
```javascript
const report = await performance_report('24h', 'detailed');
console.log(`Average response time: ${report.metrics.avgResponseTime}ms`);
```

#### `bottleneck_analyze(component, metrics?)`

**Purpose**: Identify performance bottlenecks

**Signature**: `bottleneck_analyze(component: string, metrics?: string[]) -> BottleneckAnalysis`

**Parameters**:
- `component` (string): Component to analyze
- `metrics` (string[], optional): Specific metrics to analyze

**Returns**: Bottleneck analysis results

#### `token_usage(operation, timeframe?)`

**Purpose**: Analyze token consumption

**Signature**: `token_usage(operation: string, timeframe?: string) -> TokenUsage`

**Parameters**:
- `operation` (string): Operation type
- `timeframe` (string, optional): Time range

**Returns**: Token usage statistics

### Health Check Functions

#### `health_check(components?)`

**Purpose**: System health monitoring

**Signature**: `health_check(components?: string[]) -> HealthStatus`

**Parameters**:
- `components` (string[], optional): Components to check

**Returns**: System health status

## Project Analysis Functions

### Language Detection Functions

#### `language_detect(projectPath)`

**Purpose**: Multi-language project analysis

**Signature**: `language_detect(projectPath: string) -> LanguageAnalysis`

**Parameters**:
- `projectPath` (string): Path to project

**Returns**: Language analysis results

#### `framework_detect(projectPath, language?)`

**Purpose**: Framework pattern recognition

**Signature**: `framework_detect(projectPath: string, language?: string) -> FrameworkAnalysis`

**Parameters**:
- `projectPath` (string): Path to project
- `language` (string, optional): Specific language

**Returns**: Framework analysis results

### Validation Functions

#### `rust_validate(projectPath, options?)`

**Purpose**: Cargo test execution

**Signature**: `rust_validate(projectPath: string, options?: RustOptions) -> ValidationResult`

**Parameters**:
- `projectPath` (string): Path to Rust project
- `options` (RustOptions, optional): Validation options

**Returns**: Validation results

#### `typescript_validate(projectPath, config?)`

**Purpose**: TypeScript type safety

**Signature**: `typescript_validate(projectPath: string, config?: TSConfig) -> ValidationResult`

**Parameters**:
- `projectPath` (string): Path to TypeScript project
- `config` (TSConfig, optional): TypeScript configuration

**Returns**: Type validation results

## Security Functions

### Security Scanning Functions

#### `dependency_analyze(projectPath, severity?)`

**Purpose**: Dependency security scanning

**Signature**: `dependency_analyze(projectPath: string, severity?: string) -> SecurityAnalysis`

**Parameters**:
- `projectPath` (string): Path to project
- `severity` (string, optional): Minimum severity level

**Returns**: Security analysis results

#### `security_scan(target, type?)`

**Purpose**: Security scanning

**Signature**: `security_scan(target: string, type?: ScanType) -> ScanResult`

**Parameters**:
- `target` (string): Target to scan
- `type` (ScanType, optional): Scan type

**Returns**: Security scan results

## Utility Functions

### System Functions

#### `diagnostic_run(components?)`

**Purpose**: System diagnostics

**Signature**: `diagnostic_run(components?: string[]) -> DiagnosticResult`

**Parameters**:
- `components` (string[], optional): Components to diagnose

**Returns**: Diagnostic results

#### `config_manage(action, key?, value?)`

**Purpose**: Configuration management

**Signature**: `config_manage(action: ConfigAction, key?: string, value?: any) -> ConfigResult`

**Parameters**:
- `action` (ConfigAction): 'get', 'set', 'list', 'delete'
- `key` (string, optional): Configuration key
- `value` (any, optional): Configuration value

**Returns**: Configuration operation result

### Build Functions

#### `build_optimize(projectPath, options?)`

**Purpose**: Build optimization

**Signature**: `build_optimize(projectPath: string, options?: BuildOptions) -> OptimizationResult`

**Parameters**:
- `projectPath` (string): Path to project
- `options` (BuildOptions, optional): Optimization options

**Returns**: Build optimization results

## Logging Functions (Legacy)

### Core Logger Functions

#### `Logger.getInstance(config?)`

**Purpose**: Get singleton logger instance

**Signature**: `getInstance(config?: LoggingConfig) -> Logger`

**Parameters**:
- `config` (LoggingConfig, optional): Configuration for first-time initialization

**Returns**: Logger singleton instance

#### `Logger.resetInstance()`

**Purpose**: Reset singleton instance (mainly for testing)

**Signature**: `resetInstance() -> void`

### Utility Functions

#### `formatBytes(bytes)`

**Purpose**: Convert bytes to human-readable format

**Signature**: `formatBytes(bytes: number) -> string`

**Parameters**:
- `bytes` (number): Number of bytes

**Returns**: Formatted string (e.g., "1.5 MB")

#### `validateConfig(config)`

**Purpose**: Validate logging configuration

**Signature**: `validateConfig(config: LoggingConfig) -> ValidationResult`

**Parameters**:
- `config` (LoggingConfig): Configuration to validate

**Returns**: Validation result with errors/warnings

#### `parseLogLevel(level)`

**Purpose**: Convert string log level to LogLevel enum

**Signature**: `parseLogLevel(level: string) -> LogLevel`

**Parameters**:
- `level` (string): Log level string ('debug', 'info', 'warn', 'error')

**Returns**: LogLevel enum value

## File System Functions

### File Management Functions

#### `ensureLogDirectory(path)`

**Purpose**: Create log directory if it doesn't exist

**Signature**: `ensureLogDirectory(path: string) -> Promise<void>`

**Parameters**:
- `path` (string): Directory path to create

#### `getLogFiles(directory, pattern?)`

**Purpose**: Get list of log files in directory

**Signature**: `getLogFiles(directory: string, pattern?: string) -> Promise<string[]>`

**Parameters**:
- `directory` (string): Directory to search
- `pattern` (string, optional): File name pattern (default: "*.log")

**Returns**: Array of file paths

#### `cleanupOldFiles(directory, maxFiles, pattern?)`

**Purpose**: Remove old log files, keeping only the most recent

**Signature**: `cleanupOldFiles(directory: string, maxFiles: number, pattern?: string) -> Promise<void>`

**Parameters**:
- `directory` (string): Directory containing log files
- `maxFiles` (number): Maximum files to keep
- `pattern` (string, optional): File pattern to match

## Error Handling Functions

### Error Management Functions

#### `createErrorLogger(baseLogger)`

**Purpose**: Create specialized error logger

**Signature**: `createErrorLogger(baseLogger: Logger) -> ErrorLogger`

**Returns**: ErrorLogger with enhanced error handling

#### `sanitizeForLogging(data)`

**Purpose**: Remove sensitive information from log data

**Signature**: `sanitizeForLogging(data: unknown) -> unknown`

**Parameters**:
- `data` (unknown): Data to sanitize

**Returns**: Sanitized data safe for logging

## Related Documentation

- [API](./logs-api.md) - Complete API reference
- [Features](./logs-features.md) - Available logging features
- [Hooks](./logs-hooks.md) - System integration points
- [MCP](./logs-mcp.md) - Model Context Protocol
- [Slash Commands](./logs-slash-commands.md) - CLI operations