# API Reference

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [DatabaseService API](#databaseservice-api)
2. [CoordinationManager API](#coordinationmanager-api)
3. [ArtifactStorage API](#artifactstorage-api)
4. [TransactionManager API](#transactionmanager-api)
5. [SkillDeployment API](#skilldeployment-api)
6. [EdgeCaseAnalyzer API](#edgecaseanalyzer-api)
7. [Error Codes](#error-codes)

---

## DatabaseService API

The DatabaseService provides unified access to all databases with automatic caching, schema validation, and connection pooling.

### `query(request: QueryRequest): Promise<QueryResponse>`

**Description:** Execute a database query with automatic caching and schema validation.

**Parameters:**
- `request: QueryRequest` - Query request object containing:
  - `correlation_key: string` (required) - Unique operation identifier
  - `operation: "select" | "insert" | "update" | "delete" | "upsert"` (required) - Operation type
  - `database: string` (optional, default: "primary") - Target database
  - `table: string` (required) - Target table
  - `schema: string` (optional) - Schema name (auto-discovered if omitted)
  - `fields: string[]` (optional) - Fields to select (default: all)
  - `filters: Record<string, any>` (optional) - WHERE clause filters
  - `values: Record<string, any>` (optional) - Values for insert/update
  - `options: QueryOptions` (optional) - Query options

**Returns:** `Promise<QueryResponse>` with fields:
- `status: "success" | "error" | "cached"` - Operation status
- `result: {rows: any[], row_count: number, affected_rows: number}` - Query results
- `metadata: {execution_time_ms: number, from_cache: boolean, ...}` - Execution metadata
- `errors: Error[]` - Any validation or execution errors

**Throws:**
- `VALIDATION_FAILED` - Input validation failed
- `SCHEMA_NOT_FOUND` - Requested schema not found
- `QUERY_TIMEOUT` - Query exceeded timeout
- `DATABASE_UNAVAILABLE` - Cannot connect to database
- `INVALID_SCHEMA` - Schema validation failed

**Example:**
```typescript
const response = await databaseService.query({
  correlation_key: "query-001:iter-1:1731752400000",
  operation: "select",
  table: "agents",
  schema: "cfn_schema",
  fields: ["id", "status", "confidence"],
  filters: {
    status: "completed",
    confidence: { $gte: 0.75 }
  },
  options: {
    cache_ttl_seconds: 300,
    timeout_seconds: 10
  }
});

console.log(response.result.rows); // Array of agents
console.log(response.metadata.from_cache); // boolean
```

---

### `registerSchema(schema: SchemaDefinition): Promise<SchemaRegistration>`

**Description:** Register a new database schema for validation and discovery.

**Parameters:**
- `schema: SchemaDefinition` - Schema definition containing:
  - `schema_id: string` (required) - Unique schema identifier
  - `schema_version: number` (required) - Version number
  - `source_database: string` (required) - Source database
  - `fields: FieldDefinition[]` (required) - Field definitions
  - `primary_key: string` (optional) - Primary key field

**Returns:** `Promise<SchemaRegistration>` with:
- `schema_id: string` - Registered schema ID
- `version: number` - Schema version
- `status: "registered"` - Registration status
- `cached_until: string` - When cache expires

**Throws:**
- `INVALID_SCHEMA` - Schema definition invalid
- `SCHEMA_ID_CONFLICT` - Schema ID already exists
- `FIELD_DEFINITION_ERROR` - Invalid field definition

**Example:**
```typescript
const registration = await databaseService.registerSchema({
  schema_id: "agents-v2",
  schema_version: 2,
  source_database: "primary",
  fields: [
    { name: "id", type: "string", required: true },
    { name: "status", type: "enum", enum_values: ["running", "completed"], required: true },
    { name: "confidence", type: "number", min: 0, max: 1 }
  ]
});

console.log(registration.status); // "registered"
```

---

### `getSchema(schema_id: string): Promise<SchemaDefinition>`

**Description:** Retrieve a registered schema definition.

**Parameters:**
- `schema_id: string` - Schema identifier to retrieve

**Returns:** `Promise<SchemaDefinition>` - Complete schema definition

**Throws:**
- `SCHEMA_NOT_FOUND` - Schema not found
- `CACHE_MISS` - Schema not in cache (will auto-discover)

**Example:**
```typescript
const schema = await databaseService.getSchema("agents-v2");
console.log(schema.fields); // Array of field definitions
```

---

### `executeTransaction(txn: TransactionRequest): Promise<TransactionHandle>`

**Description:** Begin a distributed transaction across multiple databases.

**Parameters:**
- `txn: TransactionRequest` - Transaction request:
  - `correlation_key: string` (required) - Operation identifier
  - `transaction_type: "read" | "write" | "mixed"` (required) - Transaction type
  - `databases: string[]` (required) - Databases to involve
  - `timeout_seconds: number` (optional, default: 60) - Timeout
  - `isolation_level: string` (optional) - Isolation level

**Returns:** `Promise<TransactionHandle>` - Handle for transaction operations

**Throws:**
- `DATABASE_UNAVAILABLE` - Cannot connect to database
- `TRANSACTION_TIMEOUT` - Already exceeded timeout

**Example:**
```typescript
const handle = await databaseService.executeTransaction({
  correlation_key: "txn-001:iter-1:1731752400000",
  transaction_type: "write",
  databases: ["primary", "cache"],
  timeout_seconds: 30
});

// Use handle for further operations
await handle.query({operation: "update", ...});
```

---

### `cacheQuery(key: string, data: any, ttl_seconds: number): Promise<void>`

**Description:** Manually cache query results.

**Parameters:**
- `key: string` - Cache key
- `data: any` - Data to cache
- `ttl_seconds: number` - Time-to-live in seconds

**Returns:** `Promise<void>`

**Throws:**
- `CACHE_UNAVAILABLE` - Redis not available

**Example:**
```typescript
await databaseService.cacheQuery("agents-completed", agentsData, 300);
```

---

## CoordinationManager API

The CoordinationManager provides inter-agent signaling and synchronization primitives.

### `broadcastSignal(signal: BroadcastSignal): Promise<BroadcastResult>`

**Description:** Broadcast a signal to multiple agents via Redis Pub/Sub.

**Parameters:**
- `signal: BroadcastSignal` - Signal to broadcast:
  - `signal_type: "broadcast" | "unicast"` (required) - Signal type
  - `topic: string` (required) - Redis topic
  - `agents: string[]` (required) - Target agent IDs
  - `message: any` (required) - Message payload
  - `retry_count: number` (optional, default: 0) - Retry count

**Returns:** `Promise<BroadcastResult>` with:
- `status: "sent" | "partial_failure" | "failure"` - Broadcast status
- `delivered_to: string[]` - Successfully delivered agents
- `failed_for: string[]` - Agents that didn't receive

**Throws:**
- `REDIS_UNAVAILABLE` - Redis not available
- `INVALID_TOPIC` - Topic format invalid
- `EMPTY_AGENT_LIST` - No agents specified

**Example:**
```typescript
const result = await coordinationManager.broadcastSignal({
  signal_type: "broadcast",
  topic: "swarm:task-001:*:start",
  agents: ["agent-1", "agent-2", "agent-3"],
  message: {
    operation: "start_loop",
    phase: "loop3",
    context: { iteration: 1 }
  }
});

console.log(result.delivered_to); // ['agent-1', 'agent-2', 'agent-3']
```

---

### `wait(request: WaitRequest): Promise<WaitResponse>`

**Description:** Block until a signal arrives or timeout occurs.

**Parameters:**
- `request: WaitRequest` - Wait request:
  - `agent_id: string` (required) - Waiting agent ID
  - `topic: string` (required) - Topic to wait on
  - `timeout_seconds: number` (optional, default: 300) - Timeout
  - `callback: Function` (optional) - Callback when signal arrives

**Returns:** `Promise<WaitResponse>` with:
- `status: "signaled" | "timeout" | "error"` - Wait result
- `signal: any` (optional) - Received signal message
- `waited_ms: number` - Actual wait time

**Throws:**
- `TIMEOUT` - Waited longer than timeout
- `INVALID_TOPIC` - Topic format invalid
- `REDIS_UNAVAILABLE` - Redis not available

**Example:**
```typescript
const response = await coordinationManager.wait({
  agent_id: "agent-123",
  topic: "swarm:task-001:gate:passed",
  timeout_seconds: 300
});

if (response.status === "signaled") {
  console.log("Gate passed!", response.signal);
} else if (response.status === "timeout") {
  console.log("Wait timeout after", response.waited_ms, "ms");
}
```

---

### `reportCompletion(report: CompletionReport): Promise<void>`

**Description:** Report task completion with confidence score.

**Parameters:**
- `report: CompletionReport` - Completion report:
  - `task_id: string` (required) - Task identifier
  - `agent_id: string` (required) - Agent identifier
  - `correlation_key: string` (required) - Correlation key
  - `confidence: number` (required) - Confidence score 0-1
  - `status: "success" | "partial" | "failure"` (required) - Status
  - `result: any` (optional) - Result data
  - `metadata: any` (optional) - Additional metadata

**Returns:** `Promise<void>`

**Throws:**
- `INVALID_CONFIDENCE` - Confidence not 0-1
- `REDIS_UNAVAILABLE` - Redis not available

**Example:**
```typescript
await coordinationManager.reportCompletion({
  task_id: "task-001",
  agent_id: "agent-123",
  correlation_key: "query-001:iter-1:1731752400000",
  confidence: 0.92,
  status: "success",
  result: { agents_analyzed: 10 },
  metadata: { duration_ms: 2500 }
});
```

---

### `collectConsensus(request: ConsensusRequest): Promise<ConsensusResult>`

**Description:** Collect consensus votes from multiple validators.

**Parameters:**
- `request: ConsensusRequest` - Consensus request:
  - `task_id: string` (required) - Task identifier
  - `validator_ids: string[]` (required) - Validator agent IDs
  - `consensus_type: "unanimous" | "majority" | "threshold"` (required) - Type
  - `threshold: number` (optional, default: 0.90) - Pass threshold
  - `timeout_seconds: number` (optional, default: 300) - Timeout

**Returns:** `Promise<ConsensusResult>` with:
- `status: "passed" | "failed"` - Consensus status
- `votes: Record<string, number>` - Confidence scores from validators
- `average_confidence: number` - Average score
- `passed_count: number` - Number passing threshold

**Throws:**
- `TIMEOUT` - Collection timeout
- `NO_RESPONSES` - No validators responded

**Example:**
```typescript
const consensus = await coordinationManager.collectConsensus({
  task_id: "task-001",
  validator_ids: ["validator-1", "validator-2", "validator-3"],
  consensus_type: "threshold",
  threshold: 0.90,
  timeout_seconds: 300
});

console.log(consensus.status); // "passed" or "failed"
console.log(consensus.average_confidence); // e.g., 0.92
```

---

### `registerAgent(agent: AgentRegistration): Promise<string>`

**Description:** Register an agent in the coordination system.

**Parameters:**
- `agent: AgentRegistration` - Agent registration:
  - `agent_id: string` (required) - Agent identifier
  - `agent_type: string` (required) - Type of agent
  - `process_id: number` (required) - Process ID
  - `metadata: any` (optional) - Additional metadata

**Returns:** `Promise<string>` - Agent registration ID

**Throws:**
- `AGENT_ID_CONFLICT` - Agent ID already registered
- `INVALID_PROCESS_ID` - Invalid process ID

**Example:**
```typescript
const registration_id = await coordinationManager.registerAgent({
  agent_id: "agent-123",
  agent_type: "backend-developer",
  process_id: 12345,
  metadata: { iteration: 1, task: "implement-feature" }
});
```

---

## ArtifactStorage API

The ArtifactStorage provides versioned content storage with Git-like revision history.

### `storeArtifact(request: StoreRequest): Promise<StoreResponse>`

**Description:** Store a new artifact version.

**Parameters:**
- `request: StoreRequest` - Store request:
  - `correlation_key: string` (required) - Operation identifier
  - `artifact_name: string` (required) - Artifact name
  - `artifact_type: "document" | "code" | "data" | "analysis"` (required) - Type
  - `content: string | Buffer` (required) - Artifact content
  - `format: string` (required) - Format (markdown, json, csv, binary)
  - `metadata: Record<string, any>` (optional) - Metadata

**Returns:** `Promise<StoreResponse>` with:
- `artifact_info: {name, version, created_at, size_bytes, ...}` - Artifact info
- `status: "success" | "error"` - Storage status

**Throws:**
- `INVALID_ARTIFACT_NAME` - Name format invalid
- `STORAGE_FULL` - Storage quota exceeded
- `FILE_SYSTEM_ERROR` - Cannot write to storage

**Example:**
```typescript
const response = await artifactStorage.storeArtifact({
  correlation_key: "query-001:iter-1:1731752400000",
  artifact_name: "analysis-report",
  artifact_type: "document",
  content: "# Analysis Report\n\nFindings...",
  format: "markdown",
  metadata: {
    created_by: "agent-123",
    description: "Performance analysis",
    tags: ["important", "weekly"]
  }
});

console.log(response.artifact_info.version); // 1
console.log(response.artifact_info.url); // file:///artifacts/analysis-report/v1/content
```

---

### `retrieveArtifact(request: RetrieveRequest): Promise<RetrieveResponse>`

**Description:** Retrieve an artifact by name and version.

**Parameters:**
- `request: RetrieveRequest` - Retrieve request:
  - `artifact_name: string` (required) - Artifact name
  - `version: "latest" | number` (optional, default: "latest") - Version
  - `correlation_key: string` (required) - Operation identifier

**Returns:** `Promise<RetrieveResponse>` with:
- `content: string | Buffer` - Artifact content
- `artifact_info: {...}` - Artifact metadata
- `metadata: {created_by, tags, ...}` - Additional metadata

**Throws:**
- `ARTIFACT_NOT_FOUND` - Artifact doesn't exist
- `VERSION_NOT_FOUND` - Requested version doesn't exist
- `FILE_READ_ERROR` - Cannot read artifact

**Example:**
```typescript
const response = await artifactStorage.retrieveArtifact({
  artifact_name: "analysis-report",
  version: "latest",
  correlation_key: "query-001:iter-1:1731752400000"
});

console.log(response.content); // Artifact content
console.log(response.artifact_info.version); // e.g., 5
```

---

### `listVersions(artifact_name: string, limit?: number): Promise<VersionInfo[]>`

**Description:** List all versions of an artifact.

**Parameters:**
- `artifact_name: string` - Artifact name
- `limit: number` (optional, default: 10) - Maximum versions to return

**Returns:** `Promise<VersionInfo[]>` - Array of version information

**Throws:**
- `ARTIFACT_NOT_FOUND` - Artifact doesn't exist

**Example:**
```typescript
const versions = await artifactStorage.listVersions("analysis-report", 5);

versions.forEach(v => {
  console.log(`Version ${v.version}: ${v.description} (${v.size_bytes} bytes)`);
});
```

---

### `getVersionDiff(artifact_name: string, from_version: number, to_version: number): Promise<DiffResult>`

**Description:** Get differences between two versions.

**Parameters:**
- `artifact_name: string` - Artifact name
- `from_version: number` - First version number
- `to_version: number` - Second version number

**Returns:** `Promise<DiffResult>` with:
- `diff_content: string` - Unified diff format
- `added_lines: number` - Number of added lines
- `removed_lines: number` - Number of removed lines
- `modified_lines: number` - Number of modified lines

**Throws:**
- `VERSION_NOT_FOUND` - One or both versions not found
- `CANNOT_DIFF_BINARY` - Cannot diff binary formats

**Example:**
```typescript
const diff = await artifactStorage.getVersionDiff("analysis-report", 1, 2);

console.log(diff.diff_content); // Unified diff
console.log(`Added: ${diff.added_lines}, Removed: ${diff.removed_lines}`);
```

---

## TransactionManager API

The TransactionManager provides distributed transaction management with ACID guarantees.

### `beginTransaction(request: TransactionRequest): Promise<Transaction>`

**Description:** Begin a new distributed transaction.

**Parameters:**
- `request: TransactionRequest` - Transaction request:
  - `correlation_key: string` (required) - Operation identifier
  - `transaction_type: "read" | "write" | "mixed"` (required) - Transaction type
  - `databases: string[]` (required) - Databases to involve
  - `timeout_seconds: number` (optional, default: 60) - Timeout
  - `isolation_level: string` (optional) - Isolation level

**Returns:** `Promise<Transaction>` - Transaction handle

**Throws:**
- `DATABASE_UNAVAILABLE` - Cannot connect to database
- `INVALID_ISOLATION_LEVEL` - Isolation level not supported

**Example:**
```typescript
const txn = await transactionManager.beginTransaction({
  correlation_key: "txn-001:iter-1:1731752400000",
  transaction_type: "write",
  databases: ["primary", "cache"],
  timeout_seconds: 30,
  isolation_level: "repeatable_read"
});

console.log(txn.transaction_id); // e.g., "txn-abc123"
```

---

### `Transaction.query(operation: QueryRequest): Promise<QueryResponse>`

**Description:** Execute a query within a transaction.

**Parameters:**
- `operation: QueryRequest` - Query operation (same format as DatabaseService)

**Returns:** `Promise<QueryResponse>` - Query result

**Throws:**
- `TRANSACTION_ABORTED` - Transaction already aborted
- `QUERY_TIMEOUT` - Query exceeded timeout
- `CONFLICT_DETECTED` - Write-write conflict

**Example:**
```typescript
const result = await txn.query({
  operation: "update",
  table: "agents",
  filters: { id: "agent-123" },
  values: { status: "completed" }
});
```

---

### `Transaction.createSavepoint(name: string): Promise<SavepointInfo>`

**Description:** Create a rollback savepoint.

**Parameters:**
- `name: string` - Savepoint name

**Returns:** `Promise<SavepointInfo>` with:
- `savepoint_id: string` - Savepoint identifier
- `timestamp: string` - Creation timestamp

**Throws:**
- `TRANSACTION_ABORTED` - Transaction already aborted
- `INVALID_SAVEPOINT_NAME` - Name format invalid

**Example:**
```typescript
const sp = await txn.createSavepoint("before_critical_update");
console.log(sp.savepoint_id); // e.g., "sp-2"
```

---

### `Transaction.rollbackToSavepoint(savepoint_id: string): Promise<void>`

**Description:** Rollback transaction to a savepoint.

**Parameters:**
- `savepoint_id: string` - Savepoint identifier

**Returns:** `Promise<void>`

**Throws:**
- `SAVEPOINT_NOT_FOUND` - Savepoint doesn't exist
- `INVALID_SAVEPOINT_ID` - Savepoint ID invalid

**Example:**
```typescript
await txn.rollbackToSavepoint("sp-2");
console.log("Rolled back to savepoint sp-2");
```

---

### `Transaction.commit(): Promise<CommitResult>`

**Description:** Commit the transaction.

**Returns:** `Promise<CommitResult>` with:
- `status: "success" | "conflict" | "timeout"` - Commit status
- `operations_committed: number` - Number of operations committed
- `conflicts_detected: number` - Number of conflicts

**Throws:**
- `CONFLICT_DETECTED` - Write-write conflict (may auto-rollback)
- `TRANSACTION_TIMEOUT` - Exceeded timeout

**Example:**
```typescript
const result = await txn.commit();

if (result.status === "success") {
  console.log(`Committed ${result.operations_committed} operations`);
} else if (result.status === "conflict") {
  console.log(`${result.conflicts_detected} conflicts detected`);
}
```

---

### `Transaction.rollback(): Promise<void>`

**Description:** Rollback the entire transaction.

**Returns:** `Promise<void>`

**Throws:**
- `TRANSACTION_ALREADY_CLOSED` - Transaction already closed

**Example:**
```typescript
await txn.rollback();
console.log("Transaction rolled back");
```

---

## SkillDeployment API

The SkillDeployment provides standardized execution of scripts and tools.

### `executeSkill(request: SkillRequest): Promise<SkillResponse>`

**Description:** Execute a skill with frontmatter metadata and environment injection.

**Parameters:**
- `request: SkillRequest` - Skill execution request:
  - `skill_name: string` (required) - Skill name
  - `skill_version: string` (optional, default: "latest") - Skill version
  - `parameters: Record<string, any>` (optional) - Skill parameters
  - `environment: Record<string, string>` (optional) - Environment variables
  - `timeout_seconds: number` (optional, default: 60) - Timeout
  - `retry_policy: {max_attempts: number, backoff_seconds: number}` (optional) - Retry policy
  - `correlation_key: string` (required) - Operation identifier

**Returns:** `Promise<SkillResponse>` with:
- `status: "success" | "error" | "timeout"` - Execution status
- `output: {result: any}` - Parsed JSON output
- `execution: {started_at, completed_at, duration_ms}` - Execution info
- `metadata: {exit_code, stdout_lines, stderr_lines}` - Execution metadata

**Throws:**
- `SKILL_NOT_FOUND` - Skill doesn't exist
- `MISSING_DEPENDENCY` - Required dependency missing
- `EXECUTION_TIMEOUT` - Exceeded timeout
- `INVALID_JSON_OUTPUT` - Output is not valid JSON

**Example:**
```typescript
const response = await skillDeployment.executeSkill({
  skill_name: "analyze-database",
  skill_version: "1.0",
  parameters: {
    database: "primary",
    metric_type: "performance"
  },
  environment: {
    DATABASE_URL: "sqlite:///data/primary.db",
    REDIS_URL: "redis://localhost:6379",
    CORRELATION_KEY: "skill-001:iter-1:1731752400000"
  },
  timeout_seconds: 60,
  correlation_key: "skill-001:iter-1:1731752400000"
});

console.log(response.output.result); // Parsed JSON output
console.log(response.execution.duration_ms); // e.g., 4523
```

---

### `listSkills(): Promise<SkillInfo[]>`

**Description:** List all available skills.

**Returns:** `Promise<SkillInfo[]>` - Array of skill information

**Throws:**
- `SKILL_DIRECTORY_ERROR` - Cannot read skill directory

**Example:**
```typescript
const skills = await skillDeployment.listSkills();

skills.forEach(skill => {
  console.log(`${skill.name} v${skill.version}: ${skill.description}`);
});
```

---

### `getSkillMetadata(skill_name: string): Promise<SkillMetadata>`

**Description:** Get frontmatter metadata for a skill.

**Parameters:**
- `skill_name: string` - Skill name

**Returns:** `Promise<SkillMetadata>` with:
- `name: string` - Skill name
- `version: string` - Skill version
- `description: string` - Description
- `required_environment: string[]` - Required env vars
- `optional_environment: string[]` - Optional env vars
- `timeout_seconds: number` - Default timeout
- `dependencies: string[]` - Required commands

**Throws:**
- `SKILL_NOT_FOUND` - Skill doesn't exist
- `PARSE_ERROR` - Cannot parse frontmatter

**Example:**
```typescript
const metadata = await skillDeployment.getSkillMetadata("analyze-database");

console.log(metadata.required_environment); // ['DATABASE_URL', 'REDIS_URL']
console.log(metadata.timeout_seconds); // 60
```

---

## EdgeCaseAnalyzer API

The EdgeCaseAnalyzer detects anomalies, patterns, and generates insights.

### `analyzeExecution(execution: ExecutionData): Promise<AnalysisResult>`

**Description:** Analyze execution data for edge cases and patterns.

**Parameters:**
- `execution: ExecutionData` - Execution data:
  - `correlation_key: string` (required) - Operation identifier
  - `iteration: number` (required) - Iteration number
  - `agent_confidence_scores: Record<string, number>` (required) - Confidence by agent
  - `execution_times: Record<string, number>` (optional) - Duration by agent
  - `error_logs: string[]` (optional) - Error messages

**Returns:** `Promise<AnalysisResult>` with:
- `patterns: Pattern[]` - Detected patterns
- `anomalies: Anomaly[]` - Detected anomalies
- `insights: Insight[]` - Generated insights
- `recommendations: string[]` - Improvement suggestions

**Throws:**
- `INVALID_EXECUTION_DATA` - Data format invalid
- `ANALYSIS_TIMEOUT` - Analysis exceeded timeout

**Example:**
```typescript
const analysis = await edgeCaseAnalyzer.analyzeExecution({
  correlation_key: "analysis-001:iter-1:1731752400000",
  iteration: 1,
  agent_confidence_scores: {
    "agent-1": 0.92,
    "agent-2": 0.87,
    "agent-3": 0.45  // Low confidence
  },
  execution_times: {
    "agent-1": 2500,
    "agent-2": 2300,
    "agent-3": 8500  // High execution time
  }
});

console.log(analysis.anomalies); // Detected issues
console.log(analysis.recommendations); // Suggestions
```

---

### `persistReflection(reflection: ReflectionData): Promise<string>`

**Description:** Persist analysis reflection for future reference.

**Parameters:**
- `reflection: ReflectionData` - Reflection data:
  - `analysis_type: "pattern" | "insight" | "anomaly" | "metric"` (required) - Type
  - `subject: string` (required) - Analysis subject
  - `reflection_data: any` (required) - Analysis results
  - `correlation_key: string` (required) - Operation identifier
  - `confidence: number` (required) - Confidence score 0-1

**Returns:** `Promise<string>` - Reflection ID

**Throws:**
- `DATABASE_UNAVAILABLE` - Cannot persist to database
- `INVALID_REFLECTION_DATA` - Data format invalid

**Example:**
```typescript
const reflection_id = await edgeCaseAnalyzer.persistReflection({
  analysis_type: "pattern",
  subject: "confidence_variance",
  reflection_data: {
    pattern: "high_variance_confidence",
    affected_agents: ["agent-3"],
    possible_causes: ["timeout", "resource_limitation"]
  },
  correlation_key: "analysis-001:iter-1:1731752400000",
  confidence: 0.87
});

console.log(reflection_id); // e.g., "refl-abc123"
```

---

### `queryReflections(query: ReflectionQuery): Promise<Reflection[]>`

**Description:** Query previously persisted reflections.

**Parameters:**
- `query: ReflectionQuery` - Query parameters:
  - `analysis_type: string` (optional) - Filter by type
  - `subject: string` (optional) - Filter by subject
  - `limit: number` (optional, default: 10) - Result limit

**Returns:** `Promise<Reflection[]>` - Matching reflections

**Throws:**
- `DATABASE_UNAVAILABLE` - Cannot query database

**Example:**
```typescript
const reflections = await edgeCaseAnalyzer.queryReflections({
  analysis_type: "pattern",
  subject: "confidence_variance",
  limit: 5
});

reflections.forEach(r => {
  console.log(`${r.pattern}: ${r.description} (confidence: ${r.confidence})`);
});
```

---

## Error Codes

### Database Errors

| Code | Status | Meaning | Retry |
|------|--------|---------|-------|
| VALIDATION_FAILED | 400 | Input validation error | No |
| SCHEMA_NOT_FOUND | 404 | Requested schema missing | No |
| QUERY_TIMEOUT | 504 | Query exceeded timeout | Yes |
| DATABASE_UNAVAILABLE | 503 | Cannot connect | Yes |
| INVALID_SCHEMA | 400 | Schema validation failed | No |
| PERMISSION_DENIED | 403 | Insufficient permissions | No |
| CONFLICT | 409 | Data conflict (transaction) | Conditional |

### Coordination Errors

| Code | Status | Meaning | Retry |
|------|--------|---------|-------|
| REDIS_UNAVAILABLE | 503 | Redis not available | Yes |
| TIMEOUT | 504 | Wait timeout exceeded | No |
| INVALID_TOPIC | 400 | Topic format invalid | No |
| EMPTY_AGENT_LIST | 400 | No agents specified | No |
| AGENT_NOT_FOUND | 404 | Agent not found | No |

### Storage Errors

| Code | Status | Meaning | Retry |
|------|--------|---------|-------|
| ARTIFACT_NOT_FOUND | 404 | Artifact doesn't exist | No |
| VERSION_NOT_FOUND | 404 | Version doesn't exist | No |
| STORAGE_FULL | 507 | Storage quota exceeded | No |
| FILE_SYSTEM_ERROR | 500 | Cannot write to storage | Yes |
| CANNOT_DIFF_BINARY | 400 | Cannot diff binary format | No |

### Skill Errors

| Code | Status | Meaning | Retry |
|------|--------|---------|-------|
| SKILL_NOT_FOUND | 404 | Skill doesn't exist | No |
| MISSING_DEPENDENCY | 424 | Required dependency missing | No |
| EXECUTION_TIMEOUT | 504 | Exceeded timeout | Yes |
| INVALID_JSON_OUTPUT | 400 | Output not valid JSON | No |
| SKILL_DIRECTORY_ERROR | 500 | Cannot read skill directory | Yes |

---

**Document Reference:** API_REFERENCE.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
