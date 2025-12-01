# RuVector Developer Guide

## Overview

This guide provides hands-on patterns and workflows for integrating RuVector into Claude Flow Novice (CFN) systems. It covers common use cases, best practices, and troubleshooting for developers working with decomposition history, error patterns, and learning systems.

## Table of Contents

- [Getting Started](#getting-started)
- [Schema Overview](#schema-overview)
- [Common Workflows](#common-workflows)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installation

RuVector is included in the CFN Loop project. Ensure your environment is configured:

```bash
# Install dependencies
npm install

# Verify RuVector service is running (Docker)
docker-compose ps | grep ruvector

# Check RuVector health
curl http://localhost:8000/health
```

### Basic Setup

```typescript
import { initializeRuVector } from './src/lib/ruvector-client';

// Initialize on application startup
const client = await initializeRuVector({
  host: process.env.RUVECTOR_HOST || 'localhost',
  port: parseInt(process.env.RUVECTOR_PORT || '8000'),
  timeout: 5000,
  retries: 3,
  verbose: process.env.DEBUG === 'true'
});

// Verify connection
const health = await client.health();
console.log(`RuVector ready: ${health.status}`);

// Clean shutdown
process.on('SIGINT', async () => {
  await client.close();
  process.exit(0);
});
```

### Minimal Integration Example

```typescript
import { initializeRuVector } from './src/lib/ruvector-client';

async function storeTaskDecomposition(taskId: string, components: string[]) {
  const client = await initializeRuVector();

  try {
    const record = await client.decompositions.insert({
      taskId,
      agentType: 'implementer',
      status: 'completed',
      components,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    });

    console.log(`Stored decomposition: ${record.id}`);
    return record.id;
  } finally {
    await client.close();
  }
}
```

---

## Schema Overview

### The Five Core Collections

RuVector maintains five collections that form the CFN learning system:

```
┌─────────────────────────────────────────────────────────┐
│                 RuVector Collections                     │
├─────────────────────────────────────────────────────────┤
│ 1. Decompositions                                       │
│    └─ Task breakdowns, component analysis               │
│ 2. Errors                                               │
│    └─ Error patterns, frequencies, solutions            │
│ 3. Security                                             │
│    └─ Security findings, vulnerabilities                │
│ 4. Performance                                          │
│    └─ Metrics, execution times, resource usage          │
│ 5. Learnings                                            │
│    └─ Aggregate insights, best practices                │
└─────────────────────────────────────────────────────────┘
```

#### 1. Decompositions Collection

Stores how tasks are broken down into components.

**Schema:**
```typescript
interface DecompositionRecord {
  id: string;                      // Auto-generated
  taskId: string;                  // Original task identifier
  agentType: 'implementer' | 'validator' | 'coordinator';
  status: 'in_progress' | 'completed' | 'failed';
  components: string[];            // Task components identified
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  metadata: {
    timestamp?: string;
    version?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Use Case:** Understanding how similar tasks were previously decomposed.

```typescript
// Store decomposition
await client.decompositions.insert({
  taskId: 'task-12345',
  agentType: 'implementer',
  status: 'completed',
  components: ['schema-validation', 'data-mapping', 'persistence'],
  estimatedComplexity: 'moderate',
  metadata: {
    timestamp: new Date().toISOString(),
    model: 'claude-3-sonnet',
    duration: 'PT45S'
  }
});

// Query similar decompositions
const similar = await client.query.semanticSearch(
  'decompositions',
  'How to decompose a data transformation task?',
  5
);

similar.forEach(rec => {
  console.log(`Task ${rec.taskId}: ${rec.components.join(' -> ')}`);
});
```

#### 2. Errors Collection

Tracks error patterns discovered during task execution.

**Schema:**
```typescript
interface ErrorPatternRecord {
  id: string;                      // Auto-generated
  errorType: string;               // e.g., "ValidationError", "TimeoutError"
  message: string;                 // Error message
  context: {
    field?: string;
    expectedType?: string;
    receivedValue?: any;
    [key: string]: any;
  };
  frequency: number;               // How many times seen
  lastOccurred?: Date;
  solutions: string[];             // Known fixes
  createdAt: Date;
  updatedAt: Date;
}
```

**Use Case:** Automatically suggest solutions when similar errors occur.

```typescript
// Record a new error pattern
await client.errors.insert({
  errorType: 'ValidationError',
  message: 'Required field "taskId" missing from input',
  context: {
    field: 'taskId',
    expectedType: 'string',
    receivedValue: 'undefined'
  },
  frequency: 1,
  solutions: [
    'Check input validation before function call',
    'Add default taskId if applicable',
    'Return 400 error to caller'
  ]
});

// Find similar errors and their solutions
const solutions = await client.query.semanticSearch(
  'errors',
  'Input validation failed for required field',
  3
);

solutions.forEach(error => {
  console.log(`Similar: ${error.message}`);
  console.log(`Solutions: ${error.solutions.join(', ')}`);
});
```

#### 3. Security Collection

Records security findings and vulnerabilities.

**Schema:**
```typescript
interface SecurityFindingRecord {
  id: string;                      // Auto-generated
  title: string;                   // Finding title
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  type: 'injection' | 'auth' | 'crypto' | 'exposure' | 'other';
  affectedComponent: string;       // Which component
  status: 'open' | 'in_progress' | 'resolved' | 'mitigated';
  mitigation?: string;             // How it was fixed
  createdAt: Date;
  updatedAt: Date;
}
```

**Use Case:** Track and prevent recurring security issues.

```typescript
// Log a security finding
await client.security.insert({
  title: 'SQL Injection vulnerability in user search',
  severity: 'critical',
  description: 'User input directly concatenated into SQL query',
  type: 'injection',
  affectedComponent: 'src/services/userService.ts:45',
  status: 'in_progress'
});

// Query critical open findings
const criticalIssues = await client.query.filterSearch(
  'security',
  { severity: 'critical', status: 'open' },
  100
);

console.log(`${criticalIssues.length} critical security issues need attention`);

// Update status when fixed
await client.security.update('sec-finding-id', {
  status: 'resolved',
  mitigation: 'Used parameterized queries with prepared statements'
});
```

#### 4. Performance Collection

Stores execution metrics and performance data.

**Schema:**
```typescript
interface PerformanceMetricRecord {
  id: string;                      // Auto-generated
  taskId: string;
  executionTimeMs: number;         // Total execution time
  memoryUsageMb: number;           // Peak memory usage
  cpuPercentage: number;           // CPU utilization
  timestamp: Date;
  metadata: {
    agentType?: string;
    complexity?: string;
    iterations?: number;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Use Case:** Identify performance bottlenecks and optimization opportunities.

```typescript
// Record performance metrics
const startTime = Date.now();
const result = await executeComplexTask();
const duration = Date.now() - startTime;

await client.performance.insert({
  taskId: 'task-xyz',
  executionTimeMs: duration,
  memoryUsageMb: process.memoryUsage().heapUsed / 1024 / 1024,
  cpuPercentage: getCpuUsage(),
  timestamp: new Date(),
  metadata: {
    agentType: 'implementer',
    complexity: 'complex',
    iterations: 3
  }
});

// Find slow tasks
const slowTasks = await client.query.filterSearch(
  'performance',
  { },
  1000
);

const avgTime = slowTasks.reduce((sum, m) => sum + m.executionTimeMs, 0) / slowTasks.length;
const slow = slowTasks.filter(m => m.executionTimeMs > avgTime * 2);

console.log(`${slow.length} tasks are significantly slower than average`);
```

#### 5. Learnings Collection

Aggregate insights derived from other collections.

**Schema:**
```typescript
interface LearningRecord {
  id: string;                      // Auto-generated
  category: 'pattern' | 'insight' | 'recommendation' | 'optimization';
  title: string;
  description: string;
  confidence: number;              // 0.0 - 1.0
  evidenceCount: number;           // How many records support this
  tags: string[];
  relatedRecords: {
    decompositions?: string[];
    errors?: string[];
    security?: string[];
    performance?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Use Case:** Surface high-confidence patterns for decision making.

```typescript
// Create a learning from observed patterns
await client.learnings.insert({
  category: 'optimization',
  title: 'Batch operations reduce overhead by 40-60%',
  description: 'Single-document operations average 245ms; batch operations average 95ms per document',
  confidence: 0.92,
  evidenceCount: 847,
  tags: ['performance', 'batch-operations', 'critical'],
  relatedRecords: {
    performance: ['perf-1234', 'perf-5678']
  }
});

// Retrieve high-confidence learnings
const insights = await client.query.filterSearch(
  'learnings',
  { confidence: {$gte: 0.85} }
);

insights.forEach(learning => {
  console.log(`${learning.category}: ${learning.title}`);
  console.log(`  Confidence: ${(learning.confidence * 100).toFixed(0)}%`);
  console.log(`  Based on ${learning.evidenceCount} observations`);
});
```

---

## Common Workflows

### Workflow 1: Storing Decomposition History

**Goal:** Record how a task was decomposed for future reference.

```typescript
async function recordTaskDecomposition(
  taskId: string,
  decompositionPlan: {
    stages: string[];
    agents: string[];
    dependencies: Record<string, string[]>;
  }
) {
  const client = await initializeRuVector();

  try {
    const record = await client.decompositions.insert({
      taskId,
      agentType: 'coordinator',
      status: 'completed',
      components: decompositionPlan.stages,
      estimatedComplexity: decompositionPlan.stages.length > 5 ? 'complex' : 'moderate',
      metadata: {
        agents: decompositionPlan.agents,
        dependencies: decompositionPlan.dependencies,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`Recorded decomposition: ${record.id}`);
    return record.id;
  } catch (err) {
    console.error(`Failed to record decomposition: ${err.message}`);
    throw err;
  } finally {
    await client.close();
  }
}

// Usage
await recordTaskDecomposition('task-analyze-logs', {
  stages: ['parse-logs', 'extract-errors', 'cluster-patterns', 'generate-report'],
  agents: ['implementer-1', 'analyzer-1'],
  dependencies: {
    'extract-errors': ['parse-logs'],
    'cluster-patterns': ['extract-errors'],
    'generate-report': ['cluster-patterns']
  }
});
```

### Workflow 2: Querying Similar Tasks

**Goal:** Find how previous tasks handled similar problems.

```typescript
async function findSimilarTaskApproaches(problemDescription: string) {
  const client = await initializeRuVector();

  try {
    // Search for similar decompositions
    const similar = await client.query.semanticSearch(
      'decompositions',
      problemDescription,
      10
    );

    if (similar.length === 0) {
      console.log('No similar tasks found');
      return [];
    }

    console.log(`Found ${similar.length} similar task approaches:`);

    const approaches = similar.map(task => ({
      taskId: task.taskId,
      complexity: task.estimatedComplexity,
      components: task.components,
      similar: task.estimatedComplexity === 'complex'
        ? 'Similar complexity, may be good reference'
        : 'Different complexity, may need adjustment'
    }));

    approaches.forEach(approach => {
      console.log(`\n${approach.taskId}`);
      console.log(`  Complexity: ${approach.complexity}`);
      console.log(`  Components: ${approach.components.join(' -> ')}`);
      console.log(`  Note: ${approach.similar}`);
    });

    return approaches;
  } finally {
    await client.close();
  }
}

// Usage
await findSimilarTaskApproaches('How should I decompose a data transformation pipeline?');
```

### Workflow 3: Adding and Learning from Error Patterns

**Goal:** Build a knowledge base of errors and their solutions.

```typescript
async function recordErrorAndSuggestSolution(
  error: Error,
  context: Record<string, any>,
  solutions: string[]
) {
  const client = await initializeRuVector();

  try {
    // Check if this error pattern exists
    const existing = await client.query.semanticSearch(
      'errors',
      error.message,
      1
    );

    if (existing.length > 0 && existing[0].message === error.message) {
      // Update frequency
      await client.errors.update(existing[0].id, {
        frequency: existing[0].frequency + 1,
        lastOccurred: new Date(),
        solutions: [...new Set([...existing[0].solutions, ...solutions])]
      });

      console.log(`Updated error pattern: ${error.message}`);
      console.log(`Known solutions: ${existing[0].solutions.join(', ')}`);
      return existing[0].id;
    } else {
      // Create new error pattern
      const record = await client.errors.insert({
        errorType: error.constructor.name,
        message: error.message,
        context,
        frequency: 1,
        solutions,
        lastOccurred: new Date()
      });

      console.log(`Created new error pattern: ${record.id}`);
      return record.id;
    }
  } finally {
    await client.close();
  }
}

// Usage
try {
  await validateUserInput(input);
} catch (err) {
  await recordErrorAndSuggestSolution(
    err,
    { field: 'userId', receivedType: typeof input.userId },
    [
      'Ensure userId is a string, not number',
      'Add type validation before function call',
      'Check API contract documentation'
    ]
  );
}
```

### Workflow 4: Security Finding Tracking

**Goal:** Track security issues and ensure they're resolved.

```typescript
async function manageSecurity Issues(
  findings: Array<{
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    type: string;
    component: string;
  }>
) {
  const client = await initializeRuVector();

  try {
    // Insert findings
    const records = await client.security.insertBatch(
      findings.map(f => ({
        title: f.title,
        severity: f.severity,
        description: f.description,
        type: f.type,
        affectedComponent: f.component,
        status: 'open' as const
      }))
    );

    console.log(`Recorded ${records.length} security findings`);

    // Query critical issues
    const critical = await client.query.filterSearch(
      'security',
      { severity: 'critical' }
    );

    console.log(`Action required: ${critical.length} critical issues`);
    critical.forEach(issue => {
      console.log(`  - [${issue.severity.toUpperCase()}] ${issue.title}`);
      console.log(`    Component: ${issue.affectedComponent}`);
    });

    return records;
  } finally {
    await client.close();
  }
}

// Usage
await manageSecurity Issues([
  {
    title: 'Missing CSRF protection on form submission',
    severity: 'high',
    description: 'Form doesn\'t include CSRF token validation',
    type: 'auth',
    component: 'src/forms/submitHandler.ts'
  }
]);
```

### Workflow 5: Performance Analysis and Optimization

**Goal:** Identify slow operations and find optimization opportunities.

```typescript
async function analyzePerformanceBottlenecks() {
  const client = await initializeRuVector();

  try {
    // Get all recent metrics
    const recentMetrics = await client.performance.list({
      limit: 500,
      sortBy: 'timestamp',
      sortOrder: 'desc'
    });

    if (recentMetrics.length < 10) {
      console.log('Not enough metrics to analyze');
      return;
    }

    // Calculate statistics
    const times = recentMetrics.map(m => m.executionTimeMs);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    // Find outliers
    const stdDev = Math.sqrt(
      times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length
    );

    const outliers = recentMetrics.filter(
      m => m.executionTimeMs > avgTime + 2 * stdDev
    );

    console.log(`Performance Analysis`);
    console.log(`  Average: ${avgTime.toFixed(0)}ms`);
    console.log(`  Min: ${minTime}ms, Max: ${maxTime}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(0)}ms`);
    console.log(`  Outliers (>2σ): ${outliers.length}`);

    // Find slowest tasks
    const slowest = recentMetrics
      .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
      .slice(0, 5);

    console.log(`\nSlowest 5 tasks:`);
    slowest.forEach((m, i) => {
      const ratio = (m.executionTimeMs / avgTime).toFixed(1);
      console.log(`  ${i + 1}. ${m.taskId}: ${m.executionTimeMs}ms (${ratio}x avg)`);
    });

    return { avgTime, stdDev, outliers, slowest };
  } finally {
    await client.close();
  }
}

// Usage
const analysis = await analyzePerformanceBottlenecks();
```

### Workflow 6: Batch Learning Record Creation

**Goal:** Create multiple learning insights from analysis.

```typescript
async function createLearningInsights(
  category: 'pattern' | 'insight' | 'recommendation' | 'optimization',
  insights: Array<{
    title: string;
    description: string;
    confidence: number;
    evidenceCount: number;
    tags: string[];
  }>
) {
  const client = await initializeRuVector();

  try {
    const records = await client.learnings.insertBatch(
      insights.map(insight => ({
        category,
        ...insight
      }))
    );

    console.log(`Created ${records.length} learning records`);

    // Verify high-confidence learnings
    const highConfidence = records.filter(r => r.confidence >= 0.85);
    console.log(`High-confidence insights: ${highConfidence.length}`);

    return records;
  } finally {
    await client.close();
  }
}

// Usage
await createLearningInsights('optimization', [
  {
    title: 'Batch operations reduce latency significantly',
    description: 'Inserting documents in batches is 40-60% faster than individual inserts',
    confidence: 0.95,
    evidenceCount: 245,
    tags: ['batch', 'performance', 'critical']
  },
  {
    title: 'Semantic search outperforms full-text for natural queries',
    description: 'Semantic search finds more relevant results for human-written queries',
    confidence: 0.88,
    evidenceCount: 89,
    tags: ['search', 'semantics', 'query-optimization']
  }
]);
```

---

## Best Practices

### 1. Connection Management

**DO:**
```typescript
// Reuse single connection throughout application
let client: RuVectorClient | null = null;

async function getClient(): Promise<RuVectorClient> {
  if (!client) {
    client = await initializeRuVector({...});
  }
  return client;
}

// Register cleanup
process.on('SIGINT', async () => {
  if (client) await client.close();
  process.exit(0);
});
```

**DON'T:**
```typescript
// Create new connection for every operation (wasteful)
async function insert(doc: any) {
  const client = await initializeRuVector({...});
  await client.someCollection.insert(doc);
  await client.close();  // Unnecessarily expensive
}
```

### 2. Batch Operations for Multiple Records

**DO:**
```typescript
// Insert multiple at once
const records = await client.errors.insertBatch([
  { errorType: 'E1', message: 'msg1', ... },
  { errorType: 'E2', message: 'msg2', ... },
  { errorType: 'E3', message: 'msg3', ... }
]);  // ~3x faster than individual inserts
```

**DON'T:**
```typescript
// Insert one at a time
for (const error of errors) {
  await client.errors.insert(error);  // Slow!
}
```

### 3. Error Handling and Retry Logic

**DO:**
```typescript
async function robustInsert(document: any, maxRetries: number = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.decompositions.insert(document);
    } catch (err) {
      if (err instanceof RuVectorConnectionError && attempt < maxRetries) {
        console.warn(`Connection error, retrying (${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 1000 * attempt));  // Exponential backoff
        continue;
      }
      throw err;
    }
  }
}
```

**DON'T:**
```typescript
// Fire and forget without error handling
await client.decompositions.insert(document);  // If this fails, no one knows
```

### 4. Semantic Search over Exact Matching

**DO:**
```typescript
// Find similar error patterns using natural language
const results = await client.query.semanticSearch(
  'errors',
  'User input validation failed for required fields',
  5
);
```

**DON'T:**
```typescript
// Only exact matches are limiting
const results = await client.query.filterSearch(
  'errors',
  { errorType: 'ValidationError' }  // Might miss related patterns
);
```

### 5. Metadata for Better Tracking

**DO:**
```typescript
await client.decompositions.insert({
  taskId,
  agentType: 'implementer',
  status: 'completed',
  components: [...],
  metadata: {
    startTime: startTimestamp,
    duration: duration,
    model: 'claude-3-sonnet',
    parentTaskId: parentId,
    retryCount: 0
  }
});
```

**DON'T:**
```typescript
// Missing context makes later analysis impossible
await client.decompositions.insert({
  taskId,
  agentType: 'implementer',
  status: 'completed',
  components: [...]
  // No metadata!
});
```

### 6. Health Checks Before Critical Operations

**DO:**
```typescript
async function safeLearningCreation(insights: any[]) {
  const client = await getClient();
  const health = await client.health();

  if (health.status === 'unhealthy') {
    throw new Error('RuVector service is unhealthy, cannot proceed');
  }

  // Safe to proceed
  return await client.learnings.insertBatch(insights);
}
```

**DON'T:**
```typescript
// Assume service is always available
async function learnFromData(insights: any[]) {
  const client = await getClient();
  return await client.learnings.insertBatch(insights);  // May fail silently
}
```

---

## Troubleshooting

### Issue: Connection Timeout

**Symptom:**
```
RuVectorConnectionError: Connection timeout after 5000ms
```

**Solutions:**
1. Verify RuVector service is running:
   ```bash
   docker-compose ps | grep ruvector
   curl http://localhost:8000/health
   ```

2. Increase timeout for high-load scenarios:
   ```typescript
   const client = await initializeRuVector({
     timeout: 10000,  // Increased from 5000
     retries: 5
   });
   ```

3. Check network connectivity:
   ```bash
   ping ruvector-service  # If using Docker networking
   ```

### Issue: Collection Not Found

**Symptom:**
```
RuVectorCollectionError: Collection 'decompositions' not found
```

**Solutions:**
1. Ensure `createIfMissing` is true during initialization:
   ```typescript
   const client = await initializeRuVector({
     createIfMissing: true  // Ensure this is set
   });
   ```

2. Manually trigger schema creation:
   ```bash
   # Inside RuVector container
   ruvector-cli init-collections
   ```

3. Check collection exists:
   ```typescript
   const health = await client.health();
   console.log(Object.keys(health.collections));
   ```

### Issue: Validation Errors

**Symptom:**
```
RuVectorValidationError: Invalid value for field 'severity'
```

**Solutions:**
1. Check allowed enum values:
   ```typescript
   // severity must be one of these
   const validSeverities = ['low', 'medium', 'high', 'critical'];
   ```

2. Validate before insert:
   ```typescript
   if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
     throw new Error(`Invalid severity: ${severity}`);
   }
   ```

3. Use TypeScript interfaces to catch errors early:
   ```typescript
   const finding: SecurityFindingRecord = {
     severity: userInput,  // TypeScript will error if invalid type
   };
   ```

### Issue: Slow Query Performance

**Symptom:**
```
Semantic search taking >5 seconds for 1000 documents
```

**Solutions:**
1. Reduce search scope:
   ```typescript
   // Instead of searching all
   const results = await client.query.semanticSearch('errors', query, 1000);

   // Search with limit
   const results = await client.query.semanticSearch('errors', query, 10);
   ```

2. Use filter-based searches for structured data:
   ```typescript
   // Faster for categorical queries
   const results = await client.query.filterSearch(
     'errors',
     { errorType: 'ValidationError', frequency: {$gte: 5} }
   );
   ```

3. Check index status:
   ```typescript
   const health = await client.health();
   const errorHealth = health.collections.errors;
   if (errorHealth.indexHealth !== 'ok') {
     console.warn('Error collection index is rebuilding, queries may be slow');
   }
   ```

### Issue: Batch Operation Partial Failure

**Symptom:**
```
BatchResult { succeeded: 98, failed: 2 }
```

**Solutions:**
1. Inspect failed operations:
   ```typescript
   const result = await client.batch.mixedOperations([...]);

   result.operations
     .filter(op => op.status === 'error')
     .forEach(op => {
       console.error(`Operation ${op.index} failed: ${op.error}`);
     });
   ```

2. Handle failures gracefully:
   ```typescript
   if (result.failed > 0) {
     // Log for manual review
     console.warn(`${result.failed} operations failed in batch`);

     // Decide whether to retry or proceed
     if (result.failed > result.succeeded) {
       throw new Error('Batch operation mostly failed');
     }
   }
   ```

3. Retry failed operations individually:
   ```typescript
   for (const op of result.operations.filter(o => o.status === 'error')) {
     try {
       // Retry with exponential backoff
       await retryOperation(operations[op.index], 3);
     } catch (err) {
       console.error(`Failed to recover operation ${op.index}: ${err.message}`);
     }
   }
   ```

### Issue: Memory Usage Growing

**Symptom:**
```
Process heap size increasing over time
```

**Solutions:**
1. Ensure client is being closed:
   ```typescript
   // Always close in finally block
   try {
     await doWork();
   } finally {
     if (client) await client.close();
   }
   ```

2. Check for connection pooling issues:
   ```bash
   # Monitor open connections
   netstat -an | grep :8000 | wc -l
   ```

3. Limit list operations:
   ```typescript
   // DON'T load entire collection
   const all = await client.decompositions.list();  // Could be millions

   // DO use pagination
   const page = await client.decompositions.list({
     limit: 100,
     offset: pageNumber * 100
   });
   ```

---

## Summary

RuVector enables CFN systems to learn and improve over time. Use it to:

1. **Record** decomposition strategies, error patterns, and findings
2. **Query** similar historical cases for guidance
3. **Analyze** performance and security trends
4. **Learn** high-confidence patterns for automation
5. **Improve** future decisions based on past experience

For detailed API information, see [RUVECTOR_API_REFERENCE.md](./RUVECTOR_API_REFERENCE.md).

For integration with CFN Coordinator, see [RUVECTOR_INTEGRATION_WITH_CFN_COORDINATOR.md](./RUVECTOR_INTEGRATION_WITH_CFN_COORDINATOR.md).

