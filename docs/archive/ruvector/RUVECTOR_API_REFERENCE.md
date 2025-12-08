# RuVector API Reference

## Overview

RuVector is a vector database integration layer for the Claude Flow Novice (CFN) system, providing persistent storage and similarity-based querying of decomposition tasks, error patterns, security findings, and performance metrics. This reference documents all public APIs, function signatures, and error handling mechanisms.

## Table of Contents

- [Connection Management](#connection-management)
- [Collection Operations](#collection-operations)
- [Batch Operations](#batch-operations)
- [Query Operations](#query-operations)
- [Performance Benchmarking](#performance-benchmarking)
- [Error Handling](#error-handling)
- [Connection Lifecycle](#connection-lifecycle)

---

## Connection Management

### `initializeRuVector()`

Initializes a connection to RuVector with automatic schema creation and health verification.

**Signature:**
```typescript
export interface RuVectorConfig {
  host: string;                    // RuVector service host (default: "localhost")
  port: number;                    // RuVector service port (default: 8000)
  apiKey?: string;                 // API key for authentication (optional)
  timeout?: number;                // Connection timeout in ms (default: 5000)
  retries?: number;                // Max retry attempts (default: 3)
  retryDelay?: number;             // Delay between retries in ms (default: 1000)
  collections?: string[];          // Explicit list of collections to initialize
  createIfMissing?: boolean;        // Auto-create collections (default: true)
  verbose?: boolean;               // Enable debug logging (default: false)
}

export interface RuVectorClient {
  health(): Promise<HealthStatus>;
  decompositions: CollectionAPI<DecompositionRecord>;
  errors: CollectionAPI<ErrorPatternRecord>;
  security: CollectionAPI<SecurityFindingRecord>;
  performance: CollectionAPI<PerformanceMetricRecord>;
  learnings: CollectionAPI<LearningRecord>;
  batch: BatchOperations;
  query: QueryOperations;
  benchmark: BenchmarkAPI;
  close(): Promise<void>;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;                  // Uptime in milliseconds
  collections: {
    [name: string]: {
      count: number;               // Number of documents
      indexHealth: "ok" | "rebuilding" | "error";
    };
  };
  latency: {
    p50: number;                   // 50th percentile latency (ms)
    p95: number;                   // 95th percentile latency (ms)
    p99: number;                   // 99th percentile latency (ms)
  };
}

async function initializeRuVector(config: RuVectorConfig): Promise<RuVectorClient>
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `host` | string | No | "localhost" | RuVector service hostname or IP address |
| `port` | number | No | 8000 | RuVector service port number |
| `apiKey` | string | No | undefined | Authentication API key for secured deployments |
| `timeout` | number | No | 5000 | Connection timeout in milliseconds |
| `retries` | number | No | 3 | Maximum number of connection retry attempts |
| `retryDelay` | number | No | 1000 | Delay between retry attempts in milliseconds |
| `collections` | string[] | No | all 5 | Explicit list of collections to initialize |
| `createIfMissing` | boolean | No | true | Automatically create missing collections |
| `verbose` | boolean | No | false | Enable verbose debug logging to console |

**Returns:**

`Promise<RuVectorClient>` - A client instance with full API access.

**Example:**
```typescript
import { initializeRuVector } from './lib/ruvector-client';

const client = await initializeRuVector({
  host: 'ruvector-service',
  port: 8000,
  timeout: 5000,
  retries: 3,
  verbose: process.env.DEBUG === 'true'
});

const health = await client.health();
console.log(`RuVector status: ${health.status}`);
console.log(`Decompositions stored: ${health.collections.decompositions.count}`);

// Remember to close when done
await client.close();
```

**Error Handling:**
- Throws `RuVectorConnectionError` if service is unreachable after retries
- Throws `RuVectorAuthError` if API key is invalid
- Throws `RuVectorSchemaError` if collection creation fails

---

## Collection Operations

### Collection API Interface

Each collection (decompositions, errors, security, performance, learnings) exposes the following operations:

```typescript
interface CollectionAPI<T> {
  get(id: string): Promise<T | null>;
  insert(document: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  insertBatch(documents: Omit<T, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<T[]>;
  update(id: string, changes: Partial<T>): Promise<T>;
  updateBatch(updates: Array<{id: string; changes: Partial<T>}>): Promise<T[]>;
  delete(id: string): Promise<boolean>;
  deleteBatch(ids: string[]): Promise<number>;
  list(options?: ListOptions): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<number>;
}

interface ListOptions {
  limit?: number;                  // Max results to return (default: 100)
  offset?: number;                 // Skip this many results (default: 0)
  sortBy?: string;                 // Field to sort by
  sortOrder?: 'asc' | 'desc';     // Sort direction (default: 'desc')
  filter?: Record<string, any>;   // Simple field filters
}
```

### `get(id: string)`

Retrieve a single document by ID.

**Example:**
```typescript
const decomposition = await client.decompositions.get('task-12345');
if (decomposition) {
  console.log(`Task: ${decomposition.taskId}`);
  console.log(`Status: ${decomposition.status}`);
} else {
  console.log('Not found');
}
```

### `insert(document: Omit<T, 'id' | 'createdAt' | 'updatedAt'>)`

Insert a new document into a collection. ID, createdAt, and updatedAt are auto-generated.

**Example:**
```typescript
const newError = await client.errors.insert({
  errorType: 'ValidationError',
  message: 'Schema validation failed',
  context: {
    field: 'taskId',
    expected: 'string',
    received: 'number'
  },
  frequency: 1,
  solutions: ['Check input type before submission']
});

console.log(`Created error pattern: ${newError.id}`);
```

### `insertBatch(documents: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>)`

Insert multiple documents efficiently in a single operation.

**Example:**
```typescript
const metrics = await client.performance.insertBatch([
  {
    taskId: 'task-1',
    executionTimeMs: 245,
    memoryUsageMb: 156,
    cpuPercentage: 12.5,
    timestamp: new Date()
  },
  {
    taskId: 'task-2',
    executionTimeMs: 892,
    memoryUsageMb: 512,
    cpuPercentage: 89.3,
    timestamp: new Date()
  }
]);

console.log(`Inserted ${metrics.length} performance metrics`);
```

### `update(id: string, changes: Partial<T>)`

Update specific fields of an existing document.

**Example:**
```typescript
const updated = await client.security.update('sec-finding-789', {
  severity: 'critical',
  status: 'resolved',
  resolutionNotes: 'Applied input sanitization to all endpoints'
});

console.log(`Updated security finding: ${updated.id}`);
```

### `updateBatch(updates: Array<{id: string; changes: Partial<T>}>)`

Update multiple documents in a single operation.

**Example:**
```typescript
const results = await client.errors.updateBatch([
  {
    id: 'error-1',
    changes: { frequency: 5, lastOccurred: new Date() }
  },
  {
    id: 'error-2',
    changes: { frequency: 12, lastOccurred: new Date() }
  }
]);

console.log(`Updated ${results.length} error patterns`);
```

### `delete(id: string)`

Delete a single document by ID.

**Example:**
```typescript
const deleted = await client.decompositions.delete('task-12345');
if (deleted) {
  console.log('Document removed');
} else {
  console.log('Document not found');
}
```

### `deleteBatch(ids: string[])`

Delete multiple documents efficiently.

**Example:**
```typescript
const count = await client.learnings.deleteBatch([
  'learning-1',
  'learning-2',
  'learning-3'
]);

console.log(`Deleted ${count} learning records`);
```

### `list(options?: ListOptions)`

Retrieve multiple documents with pagination and sorting.

**Example:**
```typescript
const recentMetrics = await client.performance.list({
  limit: 50,
  offset: 0,
  sortBy: 'timestamp',
  sortOrder: 'desc'
});

console.log(`Retrieved ${recentMetrics.length} recent metrics`);
recentMetrics.forEach(m => {
  console.log(`  Task ${m.taskId}: ${m.executionTimeMs}ms`);
});
```

### `count()`

Get the total number of documents in a collection.

**Example:**
```typescript
const totalDecompositions = await client.decompositions.count();
const totalErrors = await client.errors.count();
const totalSecurityIssues = await client.security.count();

console.log(`Total stored: ${totalDecompositions + totalErrors + totalSecurityIssues}`);
```

### `clear()`

Delete all documents from a collection (use with caution).

**Example:**
```typescript
// Be very careful with this!
const cleaned = await client.learnings.clear();
console.log(`Cleared ${cleaned} learning records`);
```

---

## Batch Operations

### Batch API Interface

```typescript
interface BatchOperations {
  insertMultiple(operations: BatchInsertOp[]): Promise<BatchResult>;
  updateMultiple(operations: BatchUpdateOp[]): Promise<BatchResult>;
  deleteMultiple(operations: BatchDeleteOp[]): Promise<BatchResult>;
  mixedOperations(operations: (BatchInsertOp | BatchUpdateOp | BatchDeleteOp)[]): Promise<BatchResult>;
}

interface BatchInsertOp {
  collection: 'decompositions' | 'errors' | 'security' | 'performance' | 'learnings';
  document: any;
}

interface BatchUpdateOp {
  collection: 'decompositions' | 'errors' | 'security' | 'performance' | 'learnings';
  id: string;
  changes: any;
}

interface BatchDeleteOp {
  collection: 'decompositions' | 'errors' | 'security' | 'performance' | 'learnings';
  id: string;
}

interface BatchResult {
  succeeded: number;
  failed: number;
  operations: {
    index: number;
    status: 'success' | 'error';
    result?: any;
    error?: string;
  }[];
  totalTime: number;  // Execution time in ms
}
```

### `insertMultiple(operations: BatchInsertOp[])`

Insert documents across multiple collections in a single batch.

**Example:**
```typescript
const result = await client.batch.insertMultiple([
  {
    collection: 'decompositions',
    document: {
      taskId: 'task-999',
      agentType: 'implementer',
      status: 'in_progress',
      metadata: {}
    }
  },
  {
    collection: 'performance',
    document: {
      taskId: 'task-999',
      executionTimeMs: 150,
      memoryUsageMb: 128,
      cpuPercentage: 5.2,
      timestamp: new Date()
    }
  }
]);

console.log(`Batch result: ${result.succeeded} succeeded, ${result.failed} failed`);
console.log(`Total time: ${result.totalTime}ms`);
```

### `mixedOperations(operations: (BatchInsertOp | BatchUpdateOp | BatchDeleteOp)[])`

Execute a mix of insert, update, and delete operations in a single batch.

**Example:**
```typescript
const result = await client.batch.mixedOperations([
  {
    collection: 'errors',
    document: {
      errorType: 'TimeoutError',
      message: 'Request timed out after 30s',
      frequency: 1,
      solutions: []
    }
  },
  {
    collection: 'security',
    id: 'sec-123',
    changes: { status: 'mitigated' }
  },
  {
    collection: 'learnings',
    id: 'learn-456'
  }
]);

if (result.failed > 0) {
  result.operations
    .filter(op => op.status === 'error')
    .forEach(op => {
      console.error(`Operation ${op.index} failed: ${op.error}`);
    });
}
```

---

## Query Operations

### Query API Interface

```typescript
interface QueryOperations {
  semanticSearch<T>(collection: string, query: string, limit?: number): Promise<T[]>;
  similaritySearch<T>(
    collection: string,
    vector: number[],
    limit?: number,
    threshold?: number
  ): Promise<Array<{document: T; score: number}>>;
  fullTextSearch<T>(collection: string, query: string, limit?: number): Promise<T[]>;
  filterSearch<T>(
    collection: string,
    filters: Record<string, any>,
    limit?: number
  ): Promise<T[]>;
}
```

### `semanticSearch<T>(collection: string, query: string, limit?: number)`

Search for documents using semantic similarity (natural language understanding).

**Example:**
```typescript
const results = await client.query.semanticSearch(
  'errors',
  'Task failed due to missing authentication token',
  10
);

console.log(`Found ${results.length} similar error patterns:`);
results.forEach(error => {
  console.log(`  - ${error.errorType}: ${error.message}`);
});
```

### `similaritySearch<T>(collection: string, vector: number[], limit?: number, threshold?: number)`

Search using vector embeddings for precise similarity matching.

**Example:**
```typescript
import { embed } from './lib/embedding-service';

const queryVector = await embed('Schema validation failed for required field');

const results = await client.query.similaritySearch(
  'errors',
  queryVector,
  5,
  0.7  // Minimum similarity threshold
);

console.log(`Found ${results.length} similar patterns:`);
results.forEach(({document, score}) => {
  console.log(`  Match score: ${(score * 100).toFixed(1)}% - ${document.message}`);
});
```

### `fullTextSearch<T>(collection: string, query: string, limit?: number)`

Search using traditional full-text indexing for keyword matching.

**Example:**
```typescript
const results = await client.query.fullTextSearch(
  'security',
  'SQL injection',
  20
);

console.log(`Found ${results.length} security findings mentioning SQL injection`);
results.forEach(finding => {
  console.log(`  - ${finding.severity}: ${finding.title}`);
});
```

### `filterSearch<T>(collection: string, filters: Record<string, any>, limit?: number)`

Search using field-level filters for structured queries.

**Example:**
```typescript
const highSeverityFindings = await client.query.filterSearch(
  'security',
  {
    severity: 'critical',
    status: 'open'
  },
  100
);

console.log(`${highSeverityFindings.length} open critical security issues`);
```

---

## Performance Benchmarking

### Benchmark API Interface

```typescript
interface BenchmarkAPI {
  measure<T>(operation: () => Promise<T>, name?: string): Promise<BenchmarkResult<T>>;
  compareOperations(
    operations: Array<{name: string; fn: () => Promise<any>}>,
    iterations?: number
  ): Promise<ComparisonResult>;
  profileCollection(collection: string): Promise<CollectionProfile>;
}

interface BenchmarkResult<T> {
  result: T;
  executionTimeMs: number;
  memoryDelta: {
    before: number;
    after: number;
    delta: number;
  };
}

interface ComparisonResult {
  operations: Array<{
    name: string;
    avgTime: number;
    minTime: number;
    maxTime: number;
    stdDev: number;
    percentile: {
      p50: number;
      p95: number;
      p99: number;
    };
  }>;
  winner: string;  // Fastest operation
}

interface CollectionProfile {
  name: string;
  documentCount: number;
  avgDocumentSize: number;
  indexSize: number;
  queryLatency: {
    get: number;
    list: number;
    search: number;
  };
}
```

### `measure<T>(operation: () => Promise<T>, name?: string)`

Measure execution time and memory usage of a single operation.

**Example:**
```typescript
const benchmark = await client.benchmark.measure(async () => {
  return await client.decompositions.list({ limit: 100 });
}, 'list-decompositions');

console.log(`Operation: ${benchmark.executionTimeMs}ms`);
console.log(`Memory delta: +${benchmark.memoryDelta.delta}MB`);
```

### `compareOperations(operations: Array<{name: string; fn: () => Promise<any>}>, iterations?: number)`

Compare performance of multiple operations across several iterations.

**Example:**
```typescript
const comparison = await client.benchmark.compareOperations([
  {
    name: 'semantic-search',
    fn: () => client.query.semanticSearch('errors', 'timeout', 10)
  },
  {
    name: 'full-text-search',
    fn: () => client.query.fullTextSearch('errors', 'timeout', 10)
  },
  {
    name: 'filter-search',
    fn: () => client.query.filterSearch('errors', {errorType: 'TimeoutError'}, 10)
  }
], 100);

comparison.operations.forEach(op => {
  console.log(`${op.name}:`);
  console.log(`  Avg: ${op.avgTime.toFixed(2)}ms`);
  console.log(`  P95: ${op.percentile.p95.toFixed(2)}ms`);
  console.log(`  P99: ${op.percentile.p99.toFixed(2)}ms`);
});

console.log(`Fastest: ${comparison.winner}`);
```

### `profileCollection(collection: string)`

Get detailed performance profile of a collection.

**Example:**
```typescript
const profile = await client.benchmark.profileCollection('decompositions');

console.log(`Collection: ${profile.name}`);
console.log(`Documents: ${profile.documentCount}`);
console.log(`Avg doc size: ${profile.avgDocumentSize} bytes`);
console.log(`Index size: ${profile.indexSize} bytes`);
console.log(`Get latency: ${profile.queryLatency.get}ms`);
console.log(`List latency: ${profile.queryLatency.list}ms`);
console.log(`Search latency: ${profile.queryLatency.search}ms`);
```

---

## Error Handling

### Error Classes

RuVector operations throw specific error classes for different failure scenarios:

```typescript
// Base error class
class RuVectorError extends Error {
  code: string;
  statusCode?: number;
  timestamp: Date;
  context?: Record<string, any>;
}

// Connection and authentication errors
class RuVectorConnectionError extends RuVectorError {}
class RuVectorAuthError extends RuVectorError {}
class RuVectorTimeoutError extends RuVectorError {}

// Operation errors
class RuVectorOperationError extends RuVectorError {}
class RuVectorValidationError extends RuVectorError {}
class RuVectorNotFoundError extends RuVectorError {}
class RuVectorConflictError extends RuVectorError {}

// Schema and collection errors
class RuVectorSchemaError extends RuVectorError {}
class RuVectorCollectionError extends RuVectorError {}

// Service errors
class RuVectorServiceError extends RuVectorError {}
class RuVectorQuotaError extends RuVectorError {}
```

### Error Handling Examples

**Connection Errors:**
```typescript
try {
  const client = await initializeRuVector({
    host: 'nonexistent-host',
    port: 8000,
    retries: 2
  });
} catch (err) {
  if (err instanceof RuVectorConnectionError) {
    console.error(`Could not connect to RuVector: ${err.message}`);
    // Implement fallback or retry strategy
  }
}
```

**Validation Errors:**
```typescript
try {
  await client.security.insert({
    severity: 'invalid', // Not one of the valid values
    title: 'Finding'
  });
} catch (err) {
  if (err instanceof RuVectorValidationError) {
    console.error(`Invalid data: ${err.message}`);
    console.error(`Details: ${JSON.stringify(err.context)}`);
  }
}
```

**Batch Operation Errors:**
```typescript
const result = await client.batch.insertMultiple([
  { collection: 'errors', document: {...} },
  { collection: 'errors', document: {...} }
]);

if (result.failed > 0) {
  result.operations.forEach(op => {
    if (op.status === 'error') {
      console.error(`Operation ${op.index}: ${op.error}`);
    }
  });
}
```

**Search Errors:**
```typescript
try {
  const results = await client.query.semanticSearch('invalid-collection', 'query');
} catch (err) {
  if (err instanceof RuVectorCollectionError) {
    console.error(`Collection not found: ${err.message}`);
  } else if (err instanceof RuVectorServiceError) {
    console.error(`RuVector service unavailable: ${err.message}`);
  }
}
```

---

## Connection Lifecycle

### Recommended Connection Management

**Initialization:**
```typescript
import { initializeRuVector } from './lib/ruvector-client';

// Initialize at application startup
let ruvectorClient: RuVectorClient | null = null;

export async function getRuVectorClient(): Promise<RuVectorClient> {
  if (!ruvectorClient) {
    ruvectorClient = await initializeRuVector({
      host: process.env.RUVECTOR_HOST || 'localhost',
      port: parseInt(process.env.RUVECTOR_PORT || '8000'),
      apiKey: process.env.RUVECTOR_API_KEY,
      timeout: 5000,
      retries: 3,
      verbose: process.env.DEBUG === 'true'
    });
  }
  return ruvectorClient;
}
```

**Cleanup:**
```typescript
// Call at application shutdown
export async function closeRuVector(): Promise<void> {
  if (ruvectorClient) {
    await ruvectorClient.close();
    ruvectorClient = null;
  }
}

// Register cleanup on process signals
process.on('SIGTERM', closeRuVector);
process.on('SIGINT', closeRuVector);
```

**Health Checking:**
```typescript
export async function checkRuVectorHealth(): Promise<boolean> {
  try {
    const client = await getRuVectorClient();
    const health = await client.health();
    return health.status !== 'unhealthy';
  } catch (err) {
    console.error(`Health check failed: ${err.message}`);
    return false;
  }
}
```

---

## Summary Table

| API | Purpose | Primary Use |
|-----|---------|-------------|
| `initializeRuVector()` | Connection setup | Application startup |
| `Collection.get()` | Single document retrieval | Lookup by ID |
| `Collection.insert()` | Add single document | New learning records |
| `Collection.insertBatch()` | Add multiple documents | Bulk import |
| `Collection.update()` | Modify single document | Update status/findings |
| `Collection.updateBatch()` | Modify multiple documents | Bulk updates |
| `Collection.delete()` | Remove single document | Data cleanup |
| `Collection.deleteBatch()` | Remove multiple documents | Bulk cleanup |
| `Collection.list()` | Retrieve paginated results | Browse historical data |
| `Batch.mixedOperations()` | Atomic multi-operation | Transaction-like behavior |
| `Query.semanticSearch()` | Natural language search | Find related patterns |
| `Query.similaritySearch()` | Vector-based matching | Precision similarity |
| `Query.fullTextSearch()` | Keyword indexing | Field-based search |
| `Query.filterSearch()` | Structured filtering | Categorical queries |
| `Benchmark.measure()` | Performance profiling | Operation timing |
| `client.close()` | Connection cleanup | Shutdown |

---

## Configuration Best Practices

**Development:**
```typescript
const devConfig: RuVectorConfig = {
  host: 'localhost',
  port: 8000,
  timeout: 10000,  // Longer timeout for local development
  retries: 5,
  createIfMissing: true,
  verbose: true
};
```

**Production:**
```typescript
const prodConfig: RuVectorConfig = {
  host: process.env.RUVECTOR_SERVICE_HOST!,
  port: 8000,
  apiKey: process.env.RUVECTOR_API_KEY,
  timeout: 5000,
  retries: 3,
  createIfMissing: false,  // Pre-created collections expected
  verbose: false
};
```

**Testing:**
```typescript
const testConfig: RuVectorConfig = {
  host: 'localhost',
  port: 8000,
  timeout: 2000,
  retries: 1,
  createIfMissing: true,
  verbose: process.env.DEBUG === 'true'
};
```

---

## Next Steps

- See [RUVECTOR_DEVELOPER_GUIDE.md](./RUVECTOR_DEVELOPER_GUIDE.md) for workflows and patterns
- See [RUVECTOR_SCHEMA_DETAILS.md](./RUVECTOR_SCHEMA_DETAILS.md) for collection structures
- See [RUVECTOR_INTEGRATION_WITH_CFN_COORDINATOR.md](./RUVECTOR_INTEGRATION_WITH_CFN_COORDINATOR.md) for integration patterns
- See [RUVECTOR_OPERATIONS.md](./RUVECTOR_OPERATIONS.md) for deployment and operations

