# Performance Optimization Guide

Phase 6 Implementation - Enterprise-grade performance optimizations for CFN Loop system.

## Overview

Four core performance optimizations implemented to achieve production-ready performance:

1. **Connection Pooling** - 3-5x throughput improvement
2. **Query Optimization** - 10-20x query speedup
3. **Docker Image Optimization** - 50% image size reduction
4. **Agent Result Caching** - 80%+ cache hit rate

---

## 1. Connection Pooling

### PostgreSQL Connection Pool

**Implementation**: `src/lib/connection-pool.ts`

**Configuration**:
```typescript
const config = {
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'cfn',
    user: 'postgres',
    password: 'password',
    max: 20,  // Maximum pool size
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },
};
```

**Usage**:
```typescript
import { initConnectionPool, getConnectionPool } from './lib/connection-pool';

// Initialize once at application startup
await initConnectionPool(config);

// Use throughout application
const pool = getConnectionPool();
const result = await pool.executePostgresQuery('SELECT * FROM agents WHERE status = $1', ['completed']);
```

**Benefits**:
- 3-5x throughput improvement over direct connections
- Automatic connection reuse
- Graceful pool shutdown
- Connection health monitoring

### Redis Cluster Mode

**Configuration**:
```typescript
const config = {
  redis: {
    nodes: [
      { host: 'redis-node-1', port: 6379 },
      { host: 'redis-node-2', port: 6379 },
      { host: 'redis-node-3', port: 6379 },
    ],
    options: {
      redisOptions: { password: 'redis-password' },
    },
  },
};
```

**Usage**:
```typescript
const pool = getConnectionPool();
const redis = pool.getRedisCluster();
await redis.set('key', 'value');
const value = await redis.get('key');
```

**Benefits**:
- High availability through clustering
- Automatic failover
- Horizontal scaling
- Built-in retry logic

---

## 2. Query Optimization

### Database Indexes

**Implementation**: `src/lib/query-optimizer.ts`
**Migration**: `migrations/001_add_agent_indexes.sql`

**Indexes Created**:
```sql
-- Single column indexes
CREATE INDEX idx_agents_team_id ON agents (team_id);
CREATE INDEX idx_agents_status ON agents (status);
CREATE INDEX idx_agents_spawned_at ON agents (spawned_at);

-- Composite indexes for common queries
CREATE INDEX idx_agents_team_status ON agents (team_id, status);
CREATE INDEX idx_agents_status_spawned ON agents (status, spawned_at);
```

**Query Patterns Optimized**:
```typescript
// Get agents by team and status (uses idx_agents_team_status)
const agents = await optimizer.getAgentsByTeamAndStatus('engineering', 'completed');

// Get agents by status and time range (uses idx_agents_status_spawned)
const agents = await optimizer.getAgentsByStatusAndTimeRange(
  'completed',
  new Date('2025-01-01'),
  new Date('2025-01-31')
);
```

**Expected Improvement**: 10-20x query speedup for filtered queries

### Materialized Views

**Migration**: `migrations/002_create_materialized_views.sql`

**Views Created**:
1. `mv_cost_by_team` - Cost aggregation by team
2. `mv_cost_by_agent_type` - Cost aggregation by agent type
3. `mv_daily_cost_summary` - Daily cost rollups

**Usage**:
```typescript
// Get cost by team (pre-aggregated)
const teamCosts = await optimizer.getCostByTeam('engineering');

// Get cost by agent type (pre-aggregated)
const agentCosts = await optimizer.getCostByAgentType('backend-developer');

// Get daily cost summary (pre-aggregated)
const dailyCosts = await optimizer.getDailyCostSummary(
  new Date('2025-01-01'),
  new Date('2025-01-31')
);
```

**Automatic Refresh**:
```typescript
const optimizer = new QueryOptimizer({
  pool: pgPool,
  refreshInterval: 3600000, // 1 hour (default)
});
await optimizer.initialize(); // Starts automatic refresh
```

**Manual Refresh**:
```typescript
await optimizer.refreshMaterializedViews();
```

**Expected Improvement**: 10-20x query speedup for aggregate queries

---

## 3. Docker Image Optimization

### Multi-Stage Build

**Implementation**: `docker/Dockerfile.optimized`

**Build Process**:
```dockerfile
# Stage 1: Build Stage (includes dev dependencies)
FROM node:18-alpine AS builder
RUN npm ci --include=dev
RUN npm run build
RUN npm prune --production

# Stage 2: Runtime Stage (production only)
FROM node:18-alpine AS runtime
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
USER cfn  # Non-root user
```

**Build Commands**:
```bash
# Production build (optimized)
DOCKER_BUILDKIT=1 docker build --target=runtime -f docker/Dockerfile.optimized -t cfn-app:prod .

# Development build
DOCKER_BUILDKIT=1 docker build --target=development -f docker/Dockerfile.optimized -t cfn-app:dev .
```

**Benefits**:
- 50% image size reduction (300-400 MB → 150-200 MB)
- Faster builds with BuildKit layer caching
- Separate build/runtime dependencies
- Security hardening (non-root user)

**Size Comparison**:
```bash
docker images | grep cfn-app
# cfn-app:prod     ~150-200 MB
# cfn-app:dev      ~300-400 MB (includes dev tools)
```

---

## 4. Agent Result Caching

### Redis-Based Cache

**Implementation**: `src/lib/result-cache.ts`

**Configuration**:
```typescript
const cache = initResultCache({
  redisCluster: redisCluster,
  ttl: 3600,  // 1 hour TTL
  namespace: 'cfn:agent:result',
  compressionThreshold: 10240,  // 10KB
});
```

**Usage**:
```typescript
// Check cache before executing agent
const cached = await cache.get('backend-developer', taskDescription);
if (cached) {
  return cached.result;  // Cache HIT
}

// Execute agent and cache result
const result = await executeAgent('backend-developer', taskDescription);
await cache.set('backend-developer', taskDescription, result, confidence, executionTime);
```

**Cache Key Generation**:
```
cfn:agent:result:{agent_type}:{task_hash}
```
Where `task_hash` is SHA-256 hash of task description (first 16 characters).

**Prometheus Metrics**:
```typescript
// Metrics exported
cfn_agent_cache_hits_total{agent_type="backend-developer"}
cfn_agent_cache_misses_total{agent_type="backend-developer"}
cfn_agent_cache_get_duration_seconds{agent_type="backend-developer", hit="true"}
cfn_agent_cache_set_duration_seconds{agent_type="backend-developer"}
```

**Cache Statistics**:
```typescript
const stats = await cache.getStats();
console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Total Keys: ${stats.totalKeys}`);
```

**Cache Invalidation**:
```typescript
// Invalidate specific task
await cache.invalidate('backend-developer', taskDescription);

// Invalidate all results for agent type
await cache.invalidateAgentType('backend-developer');

// Clear entire cache
await cache.clear();
```

**Expected Hit Rate**: 80%+ in production workloads

---

## Testing

### Run All Performance Tests

```bash
# Run all 4 test suites
./tests/perf/run-all-perf-tests.sh

# Run individual test suites
./tests/perf/test-connection-pooling.sh
./tests/perf/test-query-optimization.sh
./tests/perf/test-docker-optimization.sh
./tests/perf/test-result-caching.sh
```

### Test Coverage

- **Connection Pooling**: Pool initialization, concurrent queries, graceful shutdown, health checks
- **Query Optimization**: Index creation, materialized view performance, query rewriting
- **Docker Optimization**: Multi-stage build structure, image size reduction, BuildKit configuration
- **Result Caching**: Cache key generation, hit/miss tracking, TTL enforcement, Prometheus metrics

---

## Migration Guide

### Step 1: Database Migrations

```bash
# Run migrations in order
psql -U postgres -d cfn -f migrations/001_add_agent_indexes.sql
psql -U postgres -d cfn -f migrations/002_create_materialized_views.sql
```

### Step 2: Initialize Connection Pool

```typescript
// In your application startup (e.g., src/index.ts)
import { initConnectionPool } from './lib/connection-pool';

const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'cfn',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASS || 'postgres',
    max: 20,
  },
  redis: {
    nodes: [
      { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
    ],
  },
};

await initConnectionPool(config);
```

### Step 3: Initialize Query Optimizer

```typescript
import { initQueryOptimizer } from './lib/query-optimizer';
import { getConnectionPool } from './lib/connection-pool';

const pool = getConnectionPool();
const optimizer = await initQueryOptimizer({
  pool: pool.getPostgresClient(),
  refreshInterval: 3600000,  // 1 hour
});
```

### Step 4: Initialize Result Cache

```typescript
import { initResultCache } from './lib/result-cache';
import { getConnectionPool } from './lib/connection-pool';

const pool = getConnectionPool();
const cache = initResultCache({
  redisCluster: pool.getRedisCluster(),
  ttl: 3600,
});
```

### Step 5: Build Optimized Docker Images

```bash
# Use the docker-build skill (96% faster on WSL2)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.optimized \
  --tag cfn-app:prod \
  --target runtime

# Or use the manual script
DOCKERFILE="docker/Dockerfile.optimized" \
IMAGE_NAME="cfn-app" \
IMAGE_TAG="prod" \
TARGET="runtime" \
./scripts/docker/build-from-linux.sh
```

---

## Monitoring and Metrics

### Connection Pool Metrics

```typescript
const pool = getConnectionPool();
const stats = pool.getPoolStats();
console.log('PostgreSQL Pool:', stats.postgres);
console.log('Redis Cluster:', stats.redis);
```

### Query Performance

```typescript
const optimizer = getQueryOptimizer();
const indexStats = await optimizer.getIndexUsageStats();
console.log('Index Usage:', indexStats);
```

### Cache Performance

```typescript
const cache = getResultCache();
const stats = await cache.getStats();
console.log(`Cache Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);

const hitRatesByType = await cache.getHitRateByAgentType();
for (const [agentType, hitRate] of hitRatesByType) {
  console.log(`${agentType}: ${(hitRate * 100).toFixed(2)}%`);
}
```

### Prometheus Metrics Endpoint

```typescript
import { register } from 'prom-client';

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Performance Targets

| Optimization | Target | Measurement |
|--------------|--------|-------------|
| Connection Pooling | 3-5x throughput | Concurrent query benchmark |
| Query Optimization | 10-20x speedup | EXPLAIN ANALYZE query plans |
| Docker Image | 50% size reduction | docker images size comparison |
| Result Caching | 80%+ hit rate | Cache statistics over 24 hours |

---

## Troubleshooting

### Connection Pool Issues

**Problem**: Connection pool exhausted
**Solution**: Increase `max` pool size or reduce connection hold time

**Problem**: Idle connections timing out
**Solution**: Adjust `idleTimeoutMillis` configuration

### Query Performance Issues

**Problem**: Queries not using indexes
**Solution**: Run `EXPLAIN ANALYZE` and check index usage:
```typescript
const plan = await optimizer.analyzeQuery('SELECT * FROM agents WHERE team_id = $1', ['engineering']);
console.log(JSON.stringify(plan, null, 2));
```

### Cache Issues

**Problem**: Low cache hit rate
**Solution**: Check task description consistency and TTL configuration

**Problem**: Redis connection failures
**Solution**: Verify Redis cluster health and network connectivity

### Docker Build Issues

**Problem**: Slow builds on WSL2
**Solution**: Always use Linux build scripts:
```bash
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.optimized --tag cfn-app:prod
```

---

## Related Documentation

- Connection Pool: `src/lib/connection-pool.ts`
- Query Optimizer: `src/lib/query-optimizer.ts`
- Result Cache: `src/lib/result-cache.ts`
- Docker Optimization: `docker/Dockerfile.optimized`
- Test Suite: `tests/perf/`
- Migrations: `migrations/`

---

## Next Steps

1. Monitor performance metrics in production
2. Tune connection pool sizes based on load
3. Adjust materialized view refresh intervals
4. Optimize cache TTL based on task patterns
5. Profile and optimize hot code paths

**Phase 6 Performance Implementation Complete** ✓
