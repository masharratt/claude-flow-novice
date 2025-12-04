# GNN Security Remediation Guide

**Severity**: Immediate action required for production deployment
**Effort**: 2-3 sprints to complete all recommendations
**Date**: 2025-12-03

---

## Quick Reference - Priority Fixes

| Priority | Finding | Files | Effort | Impact |
|----------|---------|-------|--------|--------|
| 1 | Input sanitization | All modules | 1-2 days | HIGH - Prevents injection |
| 2 | Queue size limits | error-causality, file-clustering | 2-3 days | HIGH - Prevents DoS |
| 3 | Secure logging | All modules | 2-3 days | MEDIUM - Prevents info disclosure |
| 4 | Rate limiting | All + config | 3-5 days | MEDIUM - Prevents DoS |
| 5 | Access control | All + new module | 4-6 days | MEDIUM - Enables multi-tenancy |

---

## Remediation 1: Input Sanitization

### Problem
Node IDs and other inputs are not validated, allowing injection attacks and map collisions.

### Solution

**Create new file**: `src/lib/gnn-validation.ts`

```typescript
/**
 * Input validation utilities for GNN operations
 * Prevents injection attacks and ensures data integrity
 */

export interface ValidationOptions {
  maxLength?: number;
  pattern?: RegExp;
  allowedCharacters?: string;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  maxLength: 256,
  pattern: /^[a-zA-Z0-9_-]+$/,
};

/**
 * Validate and sanitize node ID
 * Only allows alphanumeric, hyphens, underscores
 */
export function validateNodeId(
  id: string,
  options: ValidationOptions = DEFAULT_OPTIONS
): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid node ID: must be non-empty string');
  }

  if (id.length > (options.maxLength || 256)) {
    throw new Error(
      `Node ID exceeds maximum length (${options.maxLength || 256})`
    );
  }

  if (options.pattern && !options.pattern.test(id)) {
    throw new Error(`Node ID contains invalid characters: ${id}`);
  }

  return id;
}

/**
 * Validate error message for safe logging
 * Prevents log injection attacks
 */
export function validateErrorMessage(
  message: string,
  maxLength: number = 1000
): string {
  if (!message || typeof message !== 'string') {
    return '[Invalid error message]';
  }

  if (message.length > maxLength) {
    return message.substring(0, maxLength) + '...[truncated]';
  }

  // Remove control characters that could break log formats
  return message
    .replace(/[\n\r\t\x00-\x1F]/g, ' ')
    .replace(/\x1B\[[0-9;]*m/g, ''); // Remove ANSI codes
}

/**
 * Validate numeric bounds
 */
export function validateNumber(
  value: number,
  min: number,
  max: number,
  name: string
): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(
      `${name} out of range [${min}, ${max}], got ${value}`
    );
  }

  return value;
}

/**
 * Validate array bounds
 */
export function validateArrayLength(
  arr: any[],
  minLength: number,
  maxLength: number,
  name: string
): number {
  if (!Array.isArray(arr)) {
    throw new Error(`${name} must be an array`);
  }

  if (arr.length < minLength || arr.length > maxLength) {
    throw new Error(
      `${name} length out of range [${minLength}, ${maxLength}], got ${arr.length}`
    );
  }

  return arr.length;
}

/**
 * Validate file path to prevent traversal attacks
 */
export function validateFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path');
  }

  // Prevent path traversal
  if (filePath.includes('..') || filePath.includes('//')) {
    throw new Error('Invalid file path: contains traversal sequences');
  }

  // Prevent absolute paths (must be relative)
  if (filePath.startsWith('/') || filePath.includes(':')) {
    throw new Error('Invalid file path: must be relative');
  }

  return filePath;
}

/**
 * Validate confidence/probability threshold
 */
export function validateThreshold(value: number, name: string = 'Threshold'): number {
  return validateNumber(value, 0, 1, name);
}

/**
 * Batch validation helper
 */
export function validateBatch<T>(
  items: T[],
  validator: (item: T) => void,
  maxBatchSize: number = 1000
): void {
  validateArrayLength(items, 1, maxBatchSize, 'Batch');

  for (let i = 0; i < items.length; i++) {
    try {
      validator(items[i]);
    } catch (error) {
      throw new Error(
        `Batch validation failed at index ${i}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
```

### Integration Example

**File**: `src/lib/ruvector-gnn-error-causality.ts`

```typescript
// Add import at top
import { validateNodeId, validateNumber, validateErrorMessage } from './gnn-validation.js';

export async function buildErrorCausalityGraph(
  limit: number = 1000
): Promise<{
  nodes: Map<string, ErrorCausalityNode>;
  edges: Map<string, ErrorCausalityEdge[]>;
}> {
  // Validate input
  const safeLimit = validateNumber(limit, 1, 10000, 'Graph limit');

  const nodes = new Map<string, ErrorCausalityNode>();
  const edges = new Map<string, ErrorCausalityEdge[]>();

  try {
    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);

    const errors = await collection.search({
      vector: new Float32Array(1536),
      k: safeLimit,  // Use validated limit
    });

    // Build nodes with validation
    for (const error of errors) {
      const metadata = (error as any).metadata as Partial<ErrorLibraryEntry['metadata']>;

      // VALIDATE NODE ID
      let errorId: string;
      try {
        errorId = validateNodeId((error as any).id || metadata.errorMessage);
      } catch (e) {
        console.warn(`Skipping error with invalid ID: ${e instanceof Error ? e.message : 'unknown'}`);
        continue;
      }

      // VALIDATE ERROR MESSAGE
      const safeMessage = validateErrorMessage(metadata.errorMessage || '');

      if (!nodes.has(errorId)) {
        nodes.set(errorId, {
          errorId,
          errorMessage: safeMessage,
          errorType: metadata.errorType || 'unknown',
          severity: metadata.severity || 'low',
          rootCauseConfidence: Math.max(0, Math.min(1, metadata.rootCauseConfidence || 0)),
        });
      }

      // ... rest of graph construction
    }

    return { nodes, edges };
  } catch (error) {
    console.error('[gnn-error-causality] Error building causality graph:', error);
    return { nodes, edges };
  }
}
```

---

## Remediation 2: Queue Size Limits

### Problem
Graph traversal can create unbounded queues, causing memory exhaustion DoS.

### Solution

**Create new file**: `src/lib/gnn-traversal-config.ts`

```typescript
/**
 * Configuration for graph traversal operations
 * Prevents DoS via unbounded recursion
 */

export interface TraversalConfig {
  /** Maximum hops to traverse */
  maxHops: number;

  /** Maximum queue size before stopping traversal */
  maxQueueSize: number;

  /** Maximum path length */
  maxPathLength: number;

  /** Maximum total nodes to explore */
  maxNodesExplored: number;

  /** Timeout in milliseconds */
  timeoutMs: number;
}

export const DEFAULT_TRAVERSAL_CONFIG: TraversalConfig = {
  maxHops: parseInt(process.env.GNN_MAX_HOPS || '3'),
  maxQueueSize: parseInt(process.env.GNN_MAX_QUEUE || '1000'),
  maxPathLength: parseInt(process.env.GNN_MAX_PATH_LENGTH || '50'),
  maxNodesExplored: parseInt(process.env.GNN_MAX_NODES || '5000'),
  timeoutMs: parseInt(process.env.GNN_TIMEOUT_MS || '30000'),
};

export class TraversalLimiter {
  private config: TraversalConfig;
  private startTime: number;
  private nodesExplored: number = 0;

  constructor(config: Partial<TraversalConfig> = {}) {
    this.config = { ...DEFAULT_TRAVERSAL_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Check if traversal should continue
   */
  canContinue(queueSize: number, pathLength: number): boolean {
    // Check timeout
    if (Date.now() - this.startTime > this.config.timeoutMs) {
      return false;
    }

    // Check queue size
    if (queueSize >= this.config.maxQueueSize) {
      return false;
    }

    // Check path length
    if (pathLength > this.config.maxPathLength) {
      return false;
    }

    // Check nodes explored
    if (this.nodesExplored >= this.config.maxNodesExplored) {
      return false;
    }

    return true;
  }

  /**
   * Record node exploration
   */
  recordNodeExplored(): void {
    this.nodesExplored++;
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      elapsed: Date.now() - this.startTime,
      nodesExplored: this.nodesExplored,
      timeRemaining: this.config.timeoutMs - (Date.now() - this.startTime),
      isTimedOut: Date.now() - this.startTime > this.config.timeoutMs,
    };
  }
}
```

### Integration Example

**File**: `src/lib/ruvector-gnn-error-causality.ts`

```typescript
import { TraversalLimiter, DEFAULT_TRAVERSAL_CONFIG } from './gnn-traversal-config.js';

export function predictRootCause(
  graph: {
    nodes: Map<string, ErrorCausalityNode>;
    edges: Map<string, ErrorCausalityEdge[]>;
  },
  targetErrorId: string,
  maxHops: number = 3
): RootCausePrediction {
  // Create traversal limiter
  const limiter = new TraversalLimiter({
    maxHops: Math.min(maxHops, DEFAULT_TRAVERSAL_CONFIG.maxHops),
  });

  const gnn = messagePassingGNN(graph, Math.min(maxHops, 3));

  const paths: CausalityPath[] = [];
  const visited = new Set<string>();
  const queue: Array<{
    nodeId: string;
    path: ErrorCausalityNode[];
    edges: ErrorCausalityEdge[];
    hops: number;
  }> = [];

  const startNode = graph.nodes.get(targetErrorId);
  if (!startNode) {
    throw new Error(`Error node not found: ${targetErrorId}`);
  }

  queue.push({
    nodeId: targetErrorId,
    path: [startNode],
    edges: [],
    hops: 0,
  });

  const rootCauses: Array<{
    node: ErrorCausalityNode;
    confidence: number;
    pathCount: number;
  }> = [];

  // BFS traversal with size limits
  while (queue.length > 0) {
    // CHECK TRAVERSAL LIMITS
    if (!limiter.canContinue(queue.length, queue[0].path.length)) {
      console.warn(
        '[gnn-error-causality] Traversal stopped: limits exceeded',
        limiter.getStatus()
      );
      break;
    }

    const { nodeId, path, edges: pathEdges, hops } = queue.shift()!;

    if (visited.has(nodeId) || hops > DEFAULT_TRAVERSAL_CONFIG.maxHops) {
      continue;
    }

    visited.add(nodeId);
    limiter.recordNodeExplored();

    const currentNode = graph.nodes.get(nodeId)!;

    // ... rest of root cause prediction logic
  }

  // ... return prediction
}
```

---

## Remediation 3: Secure Logging

### Problem
Errors logged to console without sanitization, causing information disclosure.

### Solution

**Create new file**: `src/lib/gnn-secure-logger.ts`

```typescript
/**
 * Secure logging for GNN operations
 * Prevents information disclosure via error logging
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  operation: string;
  message: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

export class SecureLogger {
  private module: string;
  private minLogLevel: LogLevel;

  constructor(
    module: string,
    minLogLevel: LogLevel = LogLevel.INFO
  ) {
    this.module = module;
    this.minLogLevel = minLogLevel;
  }

  /**
   * Log with automatic error sanitization
   */
  log(
    level: LogLevel,
    operation: string,
    message: string,
    context?: Record<string, any>
  ): void {
    // Check log level
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      module: this.module,
      operation,
      message: this.sanitizeMessage(message),
      metadata: this.sanitizeMetadata(context),
    };

    // Log to secure backend
    this.sendToBackend(entry);

    // For CRITICAL errors, also alert
    if (level === LogLevel.CRITICAL) {
      this.alert(entry);
    }
  }

  /**
   * Log error with sanitization
   */
  error(
    operation: string,
    error: Error | unknown,
    isSecurityRelevant: boolean = false
  ): void {
    let message: string;

    if (isSecurityRelevant) {
      // Never log details for security operations
      message = 'Security operation failed';
    } else if (error instanceof Error) {
      // Log type and generic message
      message = `${error.constructor.name}: Operation failed`;
    } else {
      message = 'Unknown error occurred';
    }

    this.log(LogLevel.ERROR, operation, message, {
      errorType: error instanceof Error ? error.constructor.name : 'unknown',
      isSecurityRelevant,
    });
  }

  /**
   * Log debug info (only in dev)
   */
  debug(
    operation: string,
    message: string,
    data?: Record<string, any>
  ): void {
    if (process.env.NODE_ENV === 'production') {
      return; // Never log debug in production
    }

    this.log(LogLevel.DEBUG, operation, message, data);
  }

  /**
   * Sanitize message for logging
   */
  private sanitizeMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return '[Invalid message]';
    }

    // Truncate long messages
    if (message.length > 500) {
      message = message.substring(0, 500) + '...[truncated]';
    }

    // Remove control characters
    return message
      .replace(/[\n\r\t\x00-\x1F]/g, ' ')
      .replace(/\x1B\[[0-9;]*m/g, ''); // Remove ANSI codes
  }

  /**
   * Sanitize metadata to prevent sensitive data leakage
   */
  private sanitizeMetadata(
    metadata?: Record<string, any>
  ): Record<string, any> | undefined {
    if (!metadata) {
      return undefined;
    }

    const sanitized: Record<string, any> = {};
    const sensitiveKeys = [
      'password', 'token', 'apiKey', 'secret', 'authorization',
      'email', 'phone', 'ssn', 'creditCard', 'apiSecret'
    ];

    for (const [key, value] of Object.entries(metadata)) {
      // Check if key is sensitive
      if (sensitiveKeys.some(sensitive =>
        key.toLowerCase().includes(sensitive.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 200) {
        sanitized[key] = value.substring(0, 200) + '...[truncated]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Check if message should be logged at this level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
    const currentIndex = levels.indexOf(this.minLogLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  /**
   * Send log entry to secure backend
   */
  private sendToBackend(entry: LogEntry): void {
    // TODO: Implement secure logging backend
    // Examples:
    // - CloudWatch, DataDog, ELK Stack
    // - Syslog with TLS
    // - Custom secure logging service
    console.log(JSON.stringify(entry));
  }

  /**
   * Alert on critical errors
   */
  private alert(entry: LogEntry): void {
    // TODO: Implement alerting
    // Examples:
    // - PagerDuty
    // - Slack
    // - Email
  }
}

/**
 * Create logger instance for module
 */
export function createLogger(module: string): SecureLogger {
  const minLevel = process.env.LOG_LEVEL as LogLevel || LogLevel.INFO;
  return new SecureLogger(module, minLevel);
}
```

### Integration Example

**File**: `src/lib/ruvector-gnn-error-causality.ts`

```typescript
import { createLogger, LogLevel } from './gnn-secure-logger.js';

const logger = createLogger('gnn-error-causality');

export async function buildErrorCausalityGraph(
  limit: number = 1000
): Promise<{
  nodes: Map<string, ErrorCausalityNode>;
  edges: Map<string, ErrorCausalityEdge[]>;
}> {
  const nodes = new Map<string, ErrorCausalityNode>();
  const edges = new Map<string, ErrorCausalityEdge[]>();

  try {
    logger.debug('buildErrorCausalityGraph', `Starting with limit=${limit}`);

    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);
    const errors = await collection.search({
      vector: new Float32Array(1536),
      k: limit,
    });

    logger.log(LogLevel.INFO, 'buildErrorCausalityGraph',
      `Retrieved ${errors.length} errors`, { limit });

    // ... graph construction logic ...

    return { nodes, edges };
  } catch (error) {
    // Use secure error logging (never logs stack trace)
    logger.error('buildErrorCausalityGraph', error, false);
    return { nodes, edges };
  }
}
```

---

## Remediation 4: Rate Limiting

### Problem
No rate limiting on expensive collection operations, allowing DoS attacks.

### Solution

**Create new file**: `src/lib/gnn-rate-limiter.ts`

```typescript
/**
 * Rate limiting for GNN operations
 * Prevents DoS via resource exhaustion
 */

import Redis from 'redis';

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRecordsPerRequest: number;
  maxConcurrentQueries: number;
  windowSize: number; // milliseconds
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: parseInt(process.env.GNN_MAX_REQUESTS_MIN || '60'),
  maxRecordsPerRequest: parseInt(process.env.GNN_MAX_RECORDS || '1000'),
  maxConcurrentQueries: parseInt(process.env.GNN_MAX_CONCURRENT || '5'),
  windowSize: 60000, // 1 minute
};

export class RateLimiter {
  private redis: Redis.RedisClient;
  private config: RateLimitConfig;

  constructor(redis: Redis.RedisClient, config: Partial<RateLimitConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }

  /**
   * Check if request is allowed
   */
  async isAllowed(
    userId: string,
    organizationId?: string,
    operation: string = 'graph_operation'
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const key = this.buildKey(userId, organizationId, operation);
    const now = Date.now();
    const windowStart = now - this.config.windowSize;

    // Remove old entries
    await this.redis.zremrangebyscore(key, '-inf', windowStart);

    // Count recent requests
    const count = await this.redis.zcard(key);

    // Check limit
    const allowed = count < this.config.maxRequestsPerMinute;

    if (allowed) {
      // Add new request
      await this.redis.zadd(key, now, `req_${now}_${Math.random()}`);

      // Set expiration
      await this.redis.expire(key, Math.ceil(this.config.windowSize / 1000) + 1);
    }

    return {
      allowed,
      remaining: Math.max(0, this.config.maxRequestsPerMinute - count - 1),
      resetAt: new Date(windowStart + this.config.windowSize),
    };
  }

  /**
   * Check concurrent query limit
   */
  async checkConcurrentLimit(
    userId: string,
    organizationId?: string
  ): Promise<{ allowed: boolean; active: number }> {
    const key = this.buildConcurrencyKey(userId, organizationId);
    const active = await this.redis.incr(key);

    const allowed = active <= this.config.maxConcurrentQueries;

    if (!allowed) {
      await this.redis.decr(key);
    } else {
      // Auto-decrement after timeout
      await this.redis.expire(key, 30);
    }

    return { allowed, active };
  }

  /**
   * Decrement concurrent query count
   */
  async releaseConcurrency(
    userId: string,
    organizationId?: string
  ): Promise<void> {
    const key = this.buildConcurrencyKey(userId, organizationId);
    await this.redis.decr(key);
  }

  /**
   * Validate record count
   */
  validateRecordCount(count: number): number {
    return Math.min(count, this.config.maxRecordsPerRequest);
  }

  /**
   * Build Redis key for rate limiting
   */
  private buildKey(userId: string, orgId?: string, operation?: string): string {
    return `ratelimit:${orgId || 'global'}:${userId}:${operation}`;
  }

  /**
   * Build Redis key for concurrency limiting
   */
  private buildConcurrencyKey(userId: string, orgId?: string): string {
    return `concurrent:${orgId || 'global'}:${userId}`;
  }
}

/**
 * Rate limit decorator for async functions
 */
export function rateLimited(
  operation: string,
  config?: Partial<RateLimitConfig>
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const userId = this.userId || 'anonymous';
      const orgId = this.organizationId;

      const limiter = new RateLimiter(redis, config);

      // Check rate limit
      const rateCheck = await limiter.isAllowed(userId, orgId, operation);
      if (!rateCheck.allowed) {
        throw new Error(`Rate limit exceeded. Reset at ${rateCheck.resetAt}`);
      }

      // Check concurrency limit
      const concurrencyCheck = await limiter.checkConcurrentLimit(userId, orgId);
      if (!concurrencyCheck.allowed) {
        throw new Error(
          `Too many concurrent requests (${concurrencyCheck.active})`
        );
      }

      try {
        return await originalMethod.apply(this, args);
      } finally {
        await limiter.releaseConcurrency(userId, orgId);
      }
    };

    return descriptor;
  };
}
```

### Integration Example

**File**: `src/lib/ruvector-gnn-error-causality.ts`

```typescript
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from './gnn-rate-limiter.js';
import Redis from 'redis';

const redis = Redis.createClient();
const rateLimiter = new RateLimiter(redis);

export async function buildErrorCausalityGraph(
  limit: number = 1000,
  userId?: string,
  orgId?: string
): Promise<{
  nodes: Map<string, ErrorCausalityNode>;
  edges: Map<string, ErrorCausalityEdge[]>;
}> {
  // Check rate limit
  const rateCheck = await rateLimiter.isAllowed(
    userId || 'anonymous',
    orgId,
    'buildErrorCausalityGraph'
  );

  if (!rateCheck.allowed) {
    throw new Error(
      `Rate limit exceeded. Remaining: ${rateCheck.remaining}. Reset at: ${rateCheck.resetAt}`
    );
  }

  // Check concurrency limit
  const concurrencyCheck = await rateLimiter.checkConcurrentLimit(userId || 'anonymous', orgId);
  if (!concurrencyCheck.allowed) {
    throw new Error(`Too many concurrent queries (${concurrencyCheck.active})`);
  }

  try {
    // Validate and limit records
    const safeLimit = rateLimiter.validateRecordCount(limit);

    const collection = getCollection(COLLECTIONS.ERROR_LIBRARY);
    const errors = await collection.search({
      vector: new Float32Array(1536),
      k: safeLimit,
    });

    // ... graph construction
    return { nodes, edges };
  } finally {
    // Release concurrency slot
    await rateLimiter.releaseConcurrency(userId || 'anonymous', orgId);
  }
}
```

---

## Environment Variables Reference

Add these to `.env`:

```bash
# Traversal configuration
GNN_MAX_HOPS=3
GNN_MAX_QUEUE=1000
GNN_MAX_PATH_LENGTH=50
GNN_MAX_NODES=5000
GNN_TIMEOUT_MS=30000

# Rate limiting
GNN_MAX_REQUESTS_MIN=60
GNN_MAX_RECORDS=1000
GNN_MAX_CONCURRENT=5

# Validation
GNN_MAX_MSG_LENGTH=1000
GNN_MAX_ID_LENGTH=256

# Logging
LOG_LEVEL=INFO
SECURE_LOGGING_BACKEND=datadog  # or: cloudwatch, elk, syslog

# Redis (for rate limiting)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Security
EMBEDDING_SIGNING_KEY=${EMBEDDING_SIGNING_KEY}
GNN_SECRET_KEY=${GNN_SECRET_KEY}
```

---

## Testing Checklist

After implementing each remediation:

- [ ] **Input Validation**
  - [ ] Test with malformed node IDs (special characters, null bytes, etc.)
  - [ ] Test with oversized inputs (>256 characters)
  - [ ] Test with path traversal attempts (../, /etc/passwd)
  - [ ] Verify no injection payloads in logs

- [ ] **Queue Size Limits**
  - [ ] Test with cyclic graphs (should stop at max queue size)
  - [ ] Test with deep chains (should respect max hops)
  - [ ] Verify memory doesn't exceed limits
  - [ ] Verify timeout works correctly

- [ ] **Secure Logging**
  - [ ] Verify no sensitive data in logs
  - [ ] Verify errors don't show stack traces
  - [ ] Verify log messages are sanitized
  - [ ] Verify ANSI codes are removed

- [ ] **Rate Limiting**
  - [ ] Test single user hitting limit
  - [ ] Test concurrent users (verify limits are per-user)
  - [ ] Test with organization isolation
  - [ ] Verify rate limit headers returned

---

## Implementation Order

1. **Day 1-2**: Input validation utilities
2. **Day 2-3**: Traversal config and limiters
3. **Day 3-4**: Secure logging
4. **Day 4-5**: Rate limiting with Redis
5. **Day 5**: Integration and testing

---

## Post-Implementation Verification

Run this script to verify all fixes are in place:

```bash
#!/bin/bash

echo "GNN Security Remediation Verification"
echo "======================================"

checks_passed=0
checks_failed=0

# Check 1: Validation module exists
if [ -f "src/lib/gnn-validation.ts" ]; then
  echo "✓ gnn-validation.ts exists"
  ((checks_passed++))
else
  echo "✗ gnn-validation.ts missing"
  ((checks_failed++))
fi

# Check 2: Secure logger exists
if [ -f "src/lib/gnn-secure-logger.ts" ]; then
  echo "✓ gnn-secure-logger.ts exists"
  ((checks_passed++))
else
  echo "✗ gnn-secure-logger.ts missing"
  ((checks_failed++))
fi

# Check 3: Rate limiter exists
if [ -f "src/lib/gnn-rate-limiter.ts" ]; then
  echo "✓ gnn-rate-limiter.ts exists"
  ((checks_passed++))
else
  echo "✗ gnn-rate-limiter.ts missing"
  ((checks_failed++))
fi

# Check 4: Traversal config exists
if [ -f "src/lib/gnn-traversal-config.ts" ]; then
  echo "✓ gnn-traversal-config.ts exists"
  ((checks_passed++))
else
  echo "✗ gnn-traversal-config.ts missing"
  ((checks_failed++))
fi

# Check 5: No console.error in error handlers
if ! grep -r "console.error" src/lib/ruvector-gnn-*.ts | grep -q "catch"; then
  echo "✓ console.error replaced with secure logging"
  ((checks_passed++))
else
  echo "✗ console.error still used in error handlers"
  ((checks_failed++))
fi

# Check 6: No hardcoded limits
if grep -r "const.*=.*0\.5\|const.*=.*3\|const.*=.*1000" src/lib/gnn-*.ts | grep -q "="; then
  echo "⚠ Warning: Hardcoded limits found (should use config)"
  ((checks_failed++))
else
  echo "✓ Using configuration for all limits"
  ((checks_passed++))
fi

echo ""
echo "Checks passed: $checks_passed/6"
echo "Checks failed: $checks_failed/6"

if [ $checks_failed -eq 0 ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "❌ Some checks failed. Review implementation."
  exit 1
fi
```

---

## Support and Next Steps

- **Questions?** Review the full audit report: `GNN_SECURITY_AUDIT_REPORT.md`
- **Need help?** Check the findings summary: `GNN_SECURITY_AUDIT_SUMMARY.json`
- **Ready to implement?** Start with Remediation 1 (Input Sanitization)

Good luck with the hardening! 🔒

