# Protocol Implementation Guide

**Version:** 1.0.0
**Status:** Design Guide
**Audience:** Developers, Architects, Framework Engineers

---

## Quick Start for Developers

This guide helps you implement the standard integration protocols in your code.

### 5-Minute Setup

1. **Import core types:**
   ```typescript
   import { DataEnvelope, StandardError, LogEntry } from '@cfn/protocols';
   ```

2. **Create envelope for outgoing message:**
   ```typescript
   const envelope = createEnvelope(payload, {
     source: 'my-component',
     taskId: context.taskId,
     agentId: context.agentId,
     operationType: 'request'
   });
   ```

3. **Handle errors:**
   ```typescript
   try {
     // operation
   } catch (error) {
     const standardError = normalizeError(error);
     const envelope = standardError.toEnvelope();
     // send or log
   }
   ```

4. **Log structured:**
   ```typescript
   logger.info('Operation started', {
     taskId: context.taskId,
     agentId: context.agentId,
     phase: 'execution'
   });
   ```

---

## Component Checklist

When integrating protocols into a component:

### Data Flow Layer
- [ ] All outgoing messages wrapped in DataEnvelope
- [ ] All incoming messages validated against schema
- [ ] Correlation IDs generated and propagated
- [ ] Metadata timestamps in ISO 8601 format

### Error Handling
- [ ] StandardError used for all error types
- [ ] Error codes follow category-NNN format
- [ ] Retry policies implemented for retryable errors
- [ ] Fallback strategies defined

### Logging
- [ ] All logs use structured format
- [ ] Correlation IDs included in every log
- [ ] Log levels appropriate (DEBUG/INFO/WARN/ERROR/FATAL)
- [ ] Sensitive data redacted

### Database Operations
- [ ] Correlation keys consistently generated
- [ ] Cross-database queries use fallback strategy
- [ ] Consistency checks implemented
- [ ] Transaction boundaries clearly defined

### File Operations
- [ ] All writes use atomic_write pattern
- [ ] Backups created before overwrites
- [ ] SHA256 hashing for integrity
- [ ] File locks acquired for concurrent access

### Agent Communication
- [ ] Spawn protocol envelope created
- [ ] Heartbeat signals sent periodically
- [ ] Completion signal includes all required fields
- [ ] Timeout handling implemented

---

## Common Implementation Patterns

### Pattern 1: Request/Response with Retry

```typescript
async function executeWithEnvelope<T, R>(
  request: T,
  handler: (req: DataEnvelope<T>) => Promise<DataEnvelope<R>>,
  options: {
    source: string;
    timeout?: number;
    retryPolicy?: RetryPolicy;
  }
): Promise<DataEnvelope<R>> {
  const envelope = createEnvelope(request, {
    source: options.source,
    taskId: getCurrentTaskId(),
    agentId: getCurrentAgentId(),
    operationType: 'request',
    timeout: options.timeout
  });

  return handleWithRetry(
    () => handler(envelope),
    (error) => logger.error('Operation failed', error),
    options.retryPolicy
  );
}
```

### Pattern 2: Event Broadcast

```typescript
async function broadcastEvent<T>(
  event: T,
  eventType: string,
  subscribers: string[]
) {
  const envelope = createEnvelope(event, {
    source: getCurrentAgentId(),
    operationType: 'event',
    taskId: getCurrentTaskId(),
    agentId: getCurrentAgentId()
  });

  return Promise.allSettled(
    subscribers.map(sub =>
      sendToSubscriber(sub, {
        ...envelope,
        metadata: { ...envelope.metadata, destination: sub }
      })
    )
  );
}
```

### Pattern 3: Database Consistency

```typescript
async function ensureConsistency<T>(
  correlationKey: string,
  sources: StorageSource[]
): Promise<T> {
  const results = await Promise.allSettled(
    sources.map(source =>
      queryStorage(source, correlationKey)
    )
  );

  const data = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<T>).value);

  if (data.length === 0) {
    throw new ProtocolError('NOT_FOUND', 'VALIDATION',
      `No data found for key: ${correlationKey}`
    );
  }

  return resolveConflicts(data);
}
```

### Pattern 4: Atomic File Write

```bash
write_and_verify() {
  local file=$1
  local content=$2

  # Write atomically
  local temp_file="${file}.tmp.$$"
  echo "$content" > "$temp_file" || return 1

  # Verify
  if ! sha256sum -c <<< "$(echo "$content" | sha256sum)" &>/dev/null; then
    rm "$temp_file"
    return 1
  fi

  # Backup and move
  [[ -f "$file" ]] && cp "$file" "${file}.backup"
  mv "$temp_file" "$file" || return 1

  return 0
}
```

---

## Testing Protocol Implementation

### Unit Test Template

```typescript
describe('DataEnvelope Protocol', () => {
  it('should create valid envelope', () => {
    const envelope = createEnvelope(
      { data: 'test' },
      {
        source: 'test-component',
        taskId: 'task-001',
        agentId: 'agent-001',
        operationType: 'request'
      }
    );

    expect(envelope.metadata.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(envelope.metadata.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(envelope.tracking.taskId).toBe('task-001');
    expect(envelope.control.version).toBe('1.0.0');
  });

  it('should validate envelope schema', () => {
    const invalid = { payload: 'test' }; // missing metadata
    expect(() => validateEnvelope(invalid)).toThrow();
  });
});

describe('Error Protocol', () => {
  it('should create retryable error', () => {
    const error = new ProtocolError(
      'DB-001',
      'DATABASE',
      'Connection failed'
    );

    expect(error.isRetryable()).toBe(true);
    expect(error.getFallbackAction()).toBe('use_cache');
  });

  it('should create non-retryable error', () => {
    const error = new ProtocolError(
      'VAL-001',
      'VALIDATION',
      'Invalid input'
    );

    expect(error.isRetryable()).toBe(false);
  });
});
```

---

## Monitoring Protocol Health

### Key Metrics

```typescript
interface ProtocolHealthMetrics {
  // Envelope validation
  envelopeCreationRate: number;    // per second
  envelopeValidationRate: number;  // per second
  envelopeValidationErrorRate: number; // %

  // Error handling
  errorRate: number;               // % of operations
  retryRate: number;               // % of errors retried
  retrySuccessRate: number;        // % of retries that succeeded

  // Logging
  logRate: number;                 // per second
  structuredLogRate: number;       // % of logs in structured format
  correlationIdCoverage: number;   // % of logs with correlation ID

  // Database
  crossDbQueryRate: number;        // per second
  inconsistencyDetections: number; // per hour
  consistencyResolutionTime: number; // milliseconds

  // File operations
  atomicWriteRate: number;         // per second
  atomicWriteFailureRate: number;  // %
  backupCreationRate: number;      // per second
}
```

### Alerting Rules

```yaml
alerts:
  - name: HighEnvelopeValidationErrors
    condition: envelopeValidationErrorRate > 1%
    severity: warning
    action: review_envelope_creation

  - name: HighRetryRate
    condition: retryRate > 30%
    severity: critical
    action: investigate_service_health

  - name: LowStructuredLogCoverage
    condition: structuredLogRate < 95%
    severity: warning
    action: update_logging_code

  - name: DatabaseInconsistency
    condition: inconsistencyDetections > 10/hour
    severity: critical
    action: trigger_consistency_repair
```

---

## Troubleshooting Common Issues

### Issue 1: Missing Correlation IDs in Logs

**Symptom:** Can't trace requests through system

**Solution:**
1. Check `CORRELATION_ID` environment variable is set
2. Verify logger is including it in structured output
3. Add middleware to inject correlation ID

```typescript
// Middleware to inject correlation ID
const correlationMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.set('X-Correlation-ID', req.correlationId);
  next();
};
```

### Issue 2: Inconsistent Timestamps

**Symptom:** Envelope timestamps not ISO 8601

**Solution:**
- Always use `new Date().toISOString()`
- For Bash: `date -u +%Y-%m-%dT%H:%M:%S.%3NZ`
- Validate in envelope creation

### Issue 3: Retry Storms

**Symptom:** Too many retries creating system load

**Solution:**
1. Review retry policy (reduce max retries)
2. Implement circuit breaker
3. Add exponential backoff with jitter
4. Log all retry attempts

```typescript
if (retryAttempt > 2) {
  logger.warn('Excessive retries detected', {
    taskId, agentId, errorCode, retryCount: retryAttempt
  });
  // Consider circuit breaker
}
```

### Issue 4: Cross-Database Inconsistency

**Symptom:** Data differs between Redis and SQLite

**Solution:**
1. Enable consistency check (queryStorage with all sources)
2. Implement conflict resolver (latest-write wins)
3. Add periodic consistency repair job
4. Log inconsistencies for analysis

---

## Performance Optimization

### Envelope Overhead

**Current:** ~200 bytes per envelope
**Impact:** < 0.1% overhead for typical 1KB payloads

**Optimization:** Compression for large envelopes
```typescript
if (JSON.stringify(envelope).length > 10000) {
  envelope.control.compression = 'gzip';
  envelope.payload = gzipCompress(envelope.payload);
}
```

### Logging Performance

**Default:** Structured logging adds ~1ms per log
**Optimization:** Batch logs or use async logging

```typescript
// Async logging (non-blocking)
logger.async.info('Message', data); // Fire and forget

// Batch logs (group before sending)
const logBatcher = new LogBatcher({ flushInterval: 1000 });
logBatcher.add('info', 'message', data);
```

### Database Query Performance

**Cross-database queries:** Try Redis first (in-memory), fall back to SQLite

```typescript
// Fast path: Redis hit
const redisResult = await redis.get(key);  // ~1ms
if (redisResult) return redisResult;

// Slower path: SQLite query
const sqliteResult = await sqlite.query(key);  // ~10ms
redis.set(key, sqliteResult, 'EX', 300);  // Re-cache
return sqliteResult;
```

---

## Migration Checklist for Existing Code

### For Each File:

- [ ] Import protocol types
- [ ] Add `DataEnvelope` wrapper to exports
- [ ] Implement error handling with `StandardError`
- [ ] Convert logs to structured format
- [ ] Add correlation ID propagation
- [ ] Update JSDoc with protocol requirements
- [ ] Add unit tests for protocol compliance
- [ ] Review for backward compatibility
- [ ] Update error handling in callers
- [ ] Document breaking changes

---

## Protocol Extension Guide

To extend protocols for custom needs:

### Step 1: Define Extension

```typescript
interface CustomEnvelope<T> extends DataEnvelope<T> {
  custom: {
    businessUnit: string;
    costCenter: string;
    approver: string;
  };
}
```

### Step 2: Create Factory

```typescript
function createCustomEnvelope<T>(
  payload: T,
  options: EnvelopeOptions & { custom: CustomField }
): CustomEnvelope<T> {
  const base = createEnvelope(payload, options);
  return { ...base, custom: options.custom };
}
```

### Step 3: Validate Extension

```typescript
function validateCustomEnvelope(envelope: any): envelope is CustomEnvelope {
  return validateEnvelope(envelope) &&
         envelope.custom?.businessUnit !== undefined;
}
```

### Step 4: Document

Create extension documentation with:
- Rationale for extension
- Required fields
- Example usage
- Migration path

---

## Getting Help

For protocol-related questions:

1. **Quick answers:** Check `STANDARD_INTEGRATION_PROTOCOLS.md`
2. **Implementation help:** See examples in `PROTOCOL_IMPLEMENTATION_GUIDE.md`
3. **Troubleshooting:** Review "Troubleshooting Common Issues"
4. **Architecture decisions:** Reach out to system architects

---

## Summary

The protocol implementation guide provides:
- **Quick start** for using protocols
- **Implementation patterns** for common scenarios
- **Testing strategies** for protocol compliance
- **Monitoring and alerting** for protocol health
- **Troubleshooting guidance** for common issues
- **Performance optimization** tips
- **Migration assistance** for existing code

By following these guidelines, your code will be consistent, observable, and maintainable across the entire Claude Flow Novice system.
