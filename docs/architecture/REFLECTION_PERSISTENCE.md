# ACE Reflection Persistence Standardization

**Task 5.3** | Sprint 5: Integration Standardization Plan

## Overview

The ACE Reflection Persistence system standardizes the flow of reflection data from PostgreSQL to Redis with proper serialization, TTL management, and automatic archival. This enables efficient storage of agent reflections while maintaining historical data for analysis.

## Architecture

### Data Flow

```
Agent Reflection
      ↓
ReflectionLogger
      ↓
  ┌───┴───┐
  ↓       ↓
Redis   PostgreSQL
(24h)   (Archive)
  ↓
Auto-Archive
  ↓
PostgreSQL
```

### Components

1. **ReflectionLogger** (`src/services/reflection-logger.ts`)
   - Primary interface for logging and querying reflections
   - Dual persistence: Redis (hot) + PostgreSQL (cold)
   - Graceful degradation when Redis unavailable
   - Performance monitoring

2. **ReflectionArchiver** (`src/lib/reflection-archiver.ts`)
   - Background task for automatic archival
   - TTL-based archival trigger (default: when TTL < 1 hour)
   - Configurable scan intervals
   - Metrics tracking

3. **PostgreSQL Schema** (`src/db/migrations/005-reflection-schema.sql`)
   - Reflections table with JSONB payload support
   - Optimized indexes for common query patterns
   - Aggregate views for statistics
   - Cleanup utilities

## Schema

### Reflection Data Structure

```typescript
interface Reflection {
  agent_id: string;              // Required: Agent identifier
  task_id: string;               // Required: Task identifier
  reflection_type: 'confidence' | 'status' | 'progress' | 'error' | 'decision';
  confidence: number;            // Required: 0.0 - 1.0
  payload: Record<string, any>;  // Required: Additional data
  timestamp?: Date;              // Optional: Defaults to now
}
```

### PostgreSQL Table

```sql
CREATE TABLE reflections (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    reflection_type VARCHAR(50) NOT NULL,
    confidence DECIMAL(4, 3) NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_reflection UNIQUE (agent_id, task_id, timestamp)
);
```

## Usage

### Initialization

```typescript
import { DatabaseService } from './lib/database-service';
import { ReflectionLogger } from './services/reflection-logger';
import { createArchiver } from './lib/reflection-archiver';

// Initialize database service
const dbService = new DatabaseService({
  redis: { type: 'redis', host: 'localhost', port: 6379 },
  postgres: {
    type: 'postgres',
    connectionString: 'postgresql://user:pass@localhost:5432/cfn'
  }
});

await dbService.connect();

// Create reflection logger
const reflectionLogger = new ReflectionLogger(dbService);

// Create and start archiver (optional, for background archival)
const archiver = createArchiver(dbService, {
  ttl_threshold_seconds: 3600,   // Archive when TTL < 1 hour
  scan_interval_ms: 300000,       // Scan every 5 minutes
  max_per_scan: 100,              // Archive up to 100 per scan
  auto_archive: true              // Enable automatic archival
});
```

### Logging Reflections

```typescript
// Log a confidence reflection
await reflectionLogger.logReflection({
  agent_id: 'backend-dev-001',
  task_id: 'cfn-task-123',
  reflection_type: 'confidence',
  confidence: 0.85,
  payload: {
    reasoning: 'All tests passed, code review complete',
    deliverables: ['src/api/auth.ts', 'tests/auth.test.ts'],
    issues: []
  }
});

// Log a progress reflection
await reflectionLogger.logReflection({
  agent_id: 'backend-dev-001',
  task_id: 'cfn-task-123',
  reflection_type: 'progress',
  confidence: 0.70,
  payload: {
    status: 'in_progress',
    completed_steps: ['schema_design', 'api_implementation'],
    remaining_steps: ['testing', 'documentation']
  }
});

// Log an error reflection
await reflectionLogger.logReflection({
  agent_id: 'backend-dev-001',
  task_id: 'cfn-task-123',
  reflection_type: 'error',
  confidence: 0.40,
  payload: {
    error_type: 'validation_failure',
    message: 'Schema validation failed for user input',
    stack_trace: '...'
  }
});
```

### Querying Reflections

```typescript
// Query reflections for specific agent and task
const reflections = await reflectionLogger.queryReflections({
  agent_id: 'backend-dev-001',
  task_id: 'cfn-task-123'
});

// Query with time range
const recentReflections = await reflectionLogger.queryReflections({
  agent_id: 'backend-dev-001',
  start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
  end_date: new Date()
});

// Query with confidence filter
const lowConfidenceReflections = await reflectionLogger.queryReflections({
  task_id: 'cfn-task-123',
  min_confidence: 0.0,
  reflection_type: 'confidence'
});

// Get aggregate statistics
const stats = await reflectionLogger.getReflectionStats('backend-dev-001');
console.log(stats);
// {
//   total_count: 125,
//   average_confidence: 0.82,
//   min_confidence: 0.40,
//   max_confidence: 0.95,
//   by_type: {
//     confidence: 45,
//     status: 30,
//     progress: 40,
//     error: 5,
//     decision: 5
//   }
// }
```

### Manual Archival

```typescript
// Trigger manual archive scan
const archivedCount = await archiver.manualScan();
console.log(`Archived ${archivedCount} reflections`);

// Check archiver metrics
const metrics = archiver.getMetrics();
console.log(metrics);
// {
//   total_archived: 245,
//   last_scan_time: 2025-11-16T10:30:00.000Z,
//   last_scan_count: 12,
//   failed_archives: 2,
//   average_archive_time_ms: 85,
//   redis_unavailable_count: 0
// }

// Stop archiver (e.g., during shutdown)
archiver.stop();
```

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Write to Redis | <100ms | Single reflection log |
| Archive to PostgreSQL | <500ms | Background task per reflection |
| Query spanning both | <200ms | Redis + PostgreSQL combined |
| Batch archive scan | Variable | Scales with max_per_scan |

### Performance Optimization

1. **Redis Write Performance**
   - Uses SETEX for atomic write + TTL
   - Asynchronous PostgreSQL write
   - No blocking operations

2. **Query Performance**
   - Redis queries use pattern matching
   - PostgreSQL queries use indexed columns
   - Results deduplicated in-memory

3. **Archive Performance**
   - Background scanning (non-blocking)
   - Configurable batch sizes
   - TTL-based filtering reduces unnecessary checks

## Error Handling

### Graceful Degradation

The system is designed to handle Redis unavailability:

```typescript
// When Redis is unavailable:
// 1. Writes go directly to PostgreSQL
// 2. Queries use PostgreSQL only
// 3. Monitoring metrics track Redis failures
// 4. Archiver skips scans until Redis recovers

// Check monitoring metrics
const metrics = reflectionLogger.getMonitoringMetrics();
console.log(metrics);
// {
//   redis_available: false,
//   reflection_loss_count: 12  // Reflections written to PG only
// }
```

### Error Types

1. **Validation Errors**
   - Invalid schema (empty agent_id, confidence > 1.0)
   - Throws `StandardError` with `ErrorCode.VALIDATION_ERROR`

2. **Database Errors**
   - PostgreSQL write failure
   - Throws `StandardError` with `ErrorCode.DATABASE_ERROR`

3. **Redis Degradation**
   - Logs warning, continues with PostgreSQL only
   - No exceptions thrown

## Monitoring

### Key Metrics

1. **Reflection Logger Metrics**
   ```typescript
   const metrics = reflectionLogger.getMonitoringMetrics();
   // - redis_available: boolean
   // - reflection_loss_count: number
   ```

2. **Archiver Metrics**
   ```typescript
   const metrics = archiver.getMetrics();
   // - total_archived: number
   // - last_scan_time: Date
   // - last_scan_count: number
   // - failed_archives: number
   // - average_archive_time_ms: number
   // - redis_unavailable_count: number
   ```

3. **PostgreSQL Views**
   ```sql
   -- Reflection statistics by agent
   SELECT * FROM reflection_stats_by_agent;

   -- Reflection statistics by task
   SELECT * FROM reflection_stats_by_task;

   -- Recent low-confidence reflections
   SELECT * FROM recent_low_confidence_reflections;
   ```

### Alerts

Recommended monitoring alerts:

1. **Redis Unavailability**
   - Trigger: `redis_available = false` for >5 minutes
   - Action: Investigate Redis connectivity

2. **High Reflection Loss**
   - Trigger: `reflection_loss_count > 100`
   - Action: Check Redis capacity and connectivity

3. **Failed Archives**
   - Trigger: `failed_archives / total_archived > 0.05` (5%)
   - Action: Check PostgreSQL performance and schema

4. **Slow Archive Performance**
   - Trigger: `average_archive_time_ms > 500`
   - Action: Check PostgreSQL indexes and query performance

5. **Low Confidence Trend**
   - Trigger: `avg_confidence < 0.70` over time window
   - Action: Review agent performance and task difficulty

## TTL Management

### Redis TTL Configuration

```typescript
// Default: 24 hours (86400 seconds)
const REDIS_TTL_SECONDS = 86400;

// TTL is set automatically during write
await redisAdapter.setex(key, REDIS_TTL_SECONDS, data);
```

### Archive Threshold

```typescript
// Archive when TTL falls below threshold
const ARCHIVE_THRESHOLD_SECONDS = 3600; // 1 hour

// Configurable via archiver config
const archiver = createArchiver(dbService, {
  ttl_threshold_seconds: 3600
});
```

### TTL Workflow

1. **Reflection Created**
   - Written to Redis with 24h TTL
   - Written to PostgreSQL immediately

2. **TTL Countdown**
   - Redis automatically decrements TTL
   - Key expires after 24 hours if not archived

3. **Archive Scan** (every 5 minutes)
   - Checks TTL of all reflection keys
   - Archives keys with TTL < 1 hour

4. **Expiration**
   - Archived reflections remain in PostgreSQL
   - Expired keys removed from Redis automatically
   - No data loss

## Integration Points

### Database Service (Task 0.4)

```typescript
import { DatabaseService } from './lib/database-service';

const dbService = new DatabaseService({
  redis: { type: 'redis', host: 'localhost', port: 6379 },
  postgres: {
    type: 'postgres',
    connectionString: process.env.DATABASE_URL
  }
});
```

### Schema Transform (Task 2.2)

```typescript
import { transformSchema } from './lib/schema-transform';

// Transform reflection schema for cross-system compatibility
const transformedReflection = transformSchema(reflection, {
  from: 'redis',
  to: 'postgres'
});
```

### Standard Errors

```typescript
import { StandardError, ErrorCode } from './lib/errors';

throw new StandardError(
  ErrorCode.VALIDATION_ERROR,
  'Invalid reflection schema',
  { reflection }
);
```

### Structured Logging

```typescript
import { logger } from './lib/logging';

logger.info('Reflection logged', {
  agent_id: reflection.agent_id,
  confidence: reflection.confidence
});
```

## Testing

### Running Tests

```bash
# Run all reflection tests
npm test tests/reflection-logger.test.ts

# Run with coverage
npm test -- --coverage tests/reflection-logger.test.ts
```

### Test Coverage

Target: 90%+ coverage

Key test scenarios:
- ✅ Write to Redis with 24h TTL
- ✅ Schema validation
- ✅ Graceful Redis degradation
- ✅ Query spanning both systems
- ✅ Archive TTL-based triggering
- ✅ Performance targets (<100ms, <200ms, <500ms)
- ✅ Monitoring metrics tracking

## Migration Guide

### Running the Migration

```bash
# Apply migration to PostgreSQL
psql -d cfn_database -f src/db/migrations/005-reflection-schema.sql

# Verify tables created
psql -d cfn_database -c "\dt reflections"
psql -d cfn_database -c "\d+ reflections"

# Verify views created
psql -d cfn_database -c "\dv"
```

### Rollback

```sql
-- Drop views
DROP VIEW IF EXISTS recent_low_confidence_reflections;
DROP VIEW IF EXISTS reflection_stats_by_task;
DROP VIEW IF EXISTS reflection_stats_by_agent;

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_reflections_updated_at ON reflections;
DROP FUNCTION IF EXISTS update_reflections_updated_at();
DROP FUNCTION IF EXISTS cleanup_old_reflections(INTEGER);

-- Drop indexes
DROP INDEX IF EXISTS idx_reflections_archived_at;
DROP INDEX IF EXISTS idx_reflections_payload;
DROP INDEX IF EXISTS idx_reflections_confidence;
DROP INDEX IF EXISTS idx_reflections_type;
DROP INDEX IF EXISTS idx_reflections_agent_task;
DROP INDEX IF EXISTS idx_reflections_timestamp;
DROP INDEX IF EXISTS idx_reflections_task_id;
DROP INDEX IF EXISTS idx_reflections_agent_id;

-- Drop table
DROP TABLE IF EXISTS reflections;
```

## Maintenance

### Data Cleanup

```sql
-- Clean up reflections older than 90 days
SELECT cleanup_old_reflections(90);

-- Manual cleanup
DELETE FROM reflections
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Index Maintenance

```sql
-- Reindex for performance
REINDEX TABLE reflections;

-- Analyze for query planner
ANALYZE reflections;
```

### Monitoring Queries

```sql
-- Check reflection volume
SELECT
    DATE(timestamp) AS date,
    COUNT(*) AS reflection_count,
    AVG(confidence) AS avg_confidence
FROM reflections
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;

-- Check storage size
SELECT
    pg_size_pretty(pg_total_relation_size('reflections')) AS total_size,
    pg_size_pretty(pg_relation_size('reflections')) AS table_size,
    pg_size_pretty(pg_indexes_size('reflections')) AS indexes_size;
```

## Best Practices

1. **Always validate before logging**
   - Use schema validation
   - Ensure confidence is 0.0-1.0
   - Provide meaningful payload data

2. **Use appropriate reflection types**
   - `confidence`: Quality/completion assessment
   - `status`: Current execution state
   - `progress`: Step-by-step updates
   - `error`: Failure or issue reporting
   - `decision`: Strategic choices made

3. **Monitor Redis health**
   - Check `redis_available` metric
   - Alert on prolonged unavailability
   - Plan for Redis capacity

4. **Tune archiver configuration**
   - Adjust `scan_interval_ms` based on load
   - Set `max_per_scan` to prevent overwhelming PostgreSQL
   - Monitor `average_archive_time_ms`

5. **Regular PostgreSQL maintenance**
   - Run VACUUM and ANALYZE periodically
   - Monitor table and index sizes
   - Clean up old reflections (90+ days)

## Troubleshooting

### Problem: High reflection_loss_count

**Symptoms:**
- `reflection_loss_count` increasing rapidly
- `redis_available = false`

**Solutions:**
1. Check Redis connectivity: `redis-cli ping`
2. Verify Redis server is running
3. Check network connectivity
4. Review Redis logs for errors

### Problem: Slow query performance

**Symptoms:**
- Queries taking >200ms consistently
- High PostgreSQL CPU usage

**Solutions:**
1. Check index usage: `EXPLAIN ANALYZE SELECT ...`
2. Reindex table: `REINDEX TABLE reflections;`
3. Run ANALYZE: `ANALYZE reflections;`
4. Review query patterns and add indexes if needed

### Problem: Failed archives

**Symptoms:**
- `failed_archives` count increasing
- Archiver metrics show errors

**Solutions:**
1. Check PostgreSQL logs for errors
2. Verify unique constraint not violated
3. Check PostgreSQL disk space
4. Review archiver configuration

### Problem: Memory issues

**Symptoms:**
- Node.js process memory increasing
- Out of memory errors

**Solutions:**
1. Reduce `max_per_scan` in archiver config
2. Implement pagination in query results
3. Clear old Redis keys manually
4. Monitor Node.js heap usage

## Future Enhancements

1. **Compression**
   - Compress payload data before Redis storage
   - Reduce memory footprint

2. **Partitioning**
   - Partition PostgreSQL table by timestamp
   - Improve query performance for time-range queries

3. **Streaming**
   - Stream reflections to analytics systems
   - Real-time dashboards

4. **Retention Policies**
   - Automated tiered storage (hot/warm/cold)
   - Configurable retention by reflection type

## References

- Task 0.4: Database Query Abstraction Layer
- Task 2.2: Schema Transformation & Mapping
- Task 5.3: ACE Reflection Persistence (this document)
- `src/lib/database-service/README.md`
- `src/lib/errors.ts`
- `src/lib/logging.ts`
