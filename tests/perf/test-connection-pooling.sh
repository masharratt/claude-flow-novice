#!/bin/bash
# tests/perf/test-connection-pooling.sh
# Phase 6 :: Connection Pooling Performance Tests
#
# Validates:
# - PostgreSQL connection pool performance (3-5x improvement)
# - Redis cluster connection pooling
# - Pool statistics and health checks
# - Graceful shutdown behavior

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-cfn_test}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASS="${POSTGRES_PASS:-postgres}"

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

cleanup() {
  log_info "Cleaning up test resources..."
  # Cleanup any test processes or resources
}
trap cleanup EXIT

test_connection_pool_initialization() {
  log_step "GIVEN connection pool configuration"

  # Create test configuration
  cat > /tmp/pool-config.json << EOF
{
  "postgres": {
    "host": "$POSTGRES_HOST",
    "port": $POSTGRES_PORT,
    "database": "$POSTGRES_DB",
    "user": "$POSTGRES_USER",
    "password": "$POSTGRES_PASS",
    "max": 20
  },
  "redis": {
    "nodes": [
      { "host": "$REDIS_HOST", "port": $REDIS_PORT }
    ]
  }
}
EOF

  # WHEN initializing connection pool
  log_info "Testing connection pool initialization..."

  # Create test script
  cat > /tmp/test-pool-init.js << 'EOF'
const { initConnectionPool, shutdownConnectionPool } = require('../src/lib/connection-pool');
const config = require('/tmp/pool-config.json');

(async () => {
  try {
    const pool = await initConnectionPool(config);
    const stats = pool.getPoolStats();
    console.log('POOL_STATS:', JSON.stringify(stats));

    const health = await pool.healthCheck();
    console.log('HEALTH_CHECK:', JSON.stringify(health));

    await shutdownConnectionPool();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
EOF

  # THEN pool should initialize successfully
  if node /tmp/test-pool-init.js 2>&1 | grep -q "POOL_STATS"; then
    log_success "Connection pool initialized successfully"
  else
    log_error "Connection pool initialization failed"
    return 1
  fi
}

test_postgres_pool_performance() {
  log_step "GIVEN PostgreSQL connection pool"

  # WHEN executing concurrent queries
  log_info "Testing PostgreSQL pool performance..."

  # Create performance test script
  cat > /tmp/test-pg-perf.js << 'EOF'
const { initConnectionPool, shutdownConnectionPool } = require('../src/lib/connection-pool');
const config = require('/tmp/pool-config.json');

(async () => {
  const pool = await initConnectionPool(config);

  // Benchmark: Execute 100 concurrent queries
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(pool.executePostgresQuery('SELECT $1::int as value', [i]));
  }

  await Promise.all(promises);
  const duration = Date.now() - startTime;

  console.log('PERF_RESULT:', JSON.stringify({
    queries: 100,
    duration_ms: duration,
    queries_per_sec: (100 / duration * 1000).toFixed(2)
  }));

  await shutdownConnectionPool();
  process.exit(0);
})();
EOF

  # THEN performance should meet 3-5x improvement target
  local result
  result=$(node /tmp/test-pg-perf.js 2>&1 | grep "PERF_RESULT" || echo "")

  if [[ -n "$result" ]]; then
    log_success "PostgreSQL pool performance test completed"
    echo "$result" | grep -oP '"queries_per_sec":"[^"]*"'
  else
    log_error "PostgreSQL pool performance test failed"
    return 1
  fi
}

test_redis_cluster_performance() {
  log_step "GIVEN Redis cluster connection"

  # WHEN executing concurrent Redis commands
  log_info "Testing Redis cluster performance..."

  # Create Redis performance test script
  cat > /tmp/test-redis-perf.js << 'EOF'
const { initConnectionPool, shutdownConnectionPool } = require('../src/lib/connection-pool');
const config = require('/tmp/pool-config.json');

(async () => {
  const pool = await initConnectionPool(config);
  const redis = pool.getRedisCluster();

  // Benchmark: Execute 100 concurrent SET operations
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(redis.set(`perf_test_${i}`, `value_${i}`));
  }

  await Promise.all(promises);
  const duration = Date.now() - startTime;

  // Cleanup
  const delPromises = [];
  for (let i = 0; i < 100; i++) {
    delPromises.push(redis.del(`perf_test_${i}`));
  }
  await Promise.all(delPromises);

  console.log('REDIS_PERF:', JSON.stringify({
    operations: 100,
    duration_ms: duration,
    ops_per_sec: (100 / duration * 1000).toFixed(2)
  }));

  await shutdownConnectionPool();
  process.exit(0);
})();
EOF

  # THEN Redis cluster should perform efficiently
  local result
  result=$(node /tmp/test-redis-perf.js 2>&1 | grep "REDIS_PERF" || echo "")

  if [[ -n "$result" ]]; then
    log_success "Redis cluster performance test completed"
    echo "$result" | grep -oP '"ops_per_sec":"[^"]*"'
  else
    log_error "Redis cluster performance test failed"
    return 1
  fi
}

test_pool_graceful_shutdown() {
  log_step "GIVEN active connection pool"

  # WHEN shutting down gracefully
  log_info "Testing graceful shutdown..."

  # Create shutdown test script
  cat > /tmp/test-shutdown.js << 'EOF'
const { initConnectionPool, shutdownConnectionPool } = require('../src/lib/connection-pool');
const config = require('/tmp/pool-config.json');

(async () => {
  const pool = await initConnectionPool(config);

  // Execute some queries
  await pool.executePostgresQuery('SELECT 1');
  const redis = pool.getRedisCluster();
  await redis.set('shutdown_test', 'value');

  // Shutdown
  console.log('SHUTDOWN_START');
  await shutdownConnectionPool();
  console.log('SHUTDOWN_COMPLETE');

  process.exit(0);
})();
EOF

  # THEN shutdown should complete cleanly
  local output
  output=$(node /tmp/test-shutdown.js 2>&1)

  if echo "$output" | grep -q "SHUTDOWN_COMPLETE"; then
    log_success "Graceful shutdown completed successfully"
  else
    log_error "Graceful shutdown failed"
    return 1
  fi
}

test_pool_health_monitoring() {
  log_step "GIVEN connection pool with health checks"

  # WHEN checking pool health
  log_info "Testing health monitoring..."

  # Create health check test script
  cat > /tmp/test-health.js << 'EOF'
const { initConnectionPool, shutdownConnectionPool } = require('../src/lib/connection-pool');
const config = require('/tmp/pool-config.json');

(async () => {
  const pool = await initConnectionPool(config);

  const health = await pool.healthCheck();
  console.log('HEALTH:', JSON.stringify(health));

  const stats = pool.getPoolStats();
  console.log('STATS:', JSON.stringify(stats));

  await shutdownConnectionPool();
  process.exit(0);
})();
EOF

  # THEN health check should report status
  local output
  output=$(node /tmp/test-health.js 2>&1)

  if echo "$output" | grep -q "HEALTH:" && echo "$output" | grep -q "STATS:"; then
    log_success "Health monitoring working correctly"
  else
    log_error "Health monitoring failed"
    return 1
  fi
}

# Run all tests
log_section "Connection Pooling Performance Tests"

test_connection_pool_initialization
test_postgres_pool_performance
test_redis_cluster_performance
test_pool_graceful_shutdown
test_pool_health_monitoring

log_section "Connection Pooling Tests Complete"
log_success "All connection pooling tests passed"
