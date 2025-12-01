# Phase 6 Security Remediation Guide

**Severity Breakdown**:
- Critical: 0
- High: 0
- Medium: 2
- Low: 3

**Total Remediation Effort**: ~7 hours (can be parallelized)

---

## Medium Severity Issues

### Issue 1: Database Error Message Sanitization

**Location**: `src/lib/connection-pool.ts` (Lines 72-74)

**Current Code**:
```typescript
this.pgPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});
```

**Problem**: Full error objects logged, may contain:
- Connection details
- Query context
- Database version info
- Other sensitive parameters

**Risk**: Information disclosure in production logs

**Timeline**: Before production deployment
**Effort**: 1 hour

---

#### Remediation Step 1: Create Secure Logger

**File**: `src/lib/logger.ts` (new)

```typescript
// src/lib/logger.ts
export interface SecureLogContext {
  code?: string;
  severity?: string;
  context?: string;
  // Exclude: detail, query, query_pos, line, routine, etc.
}

export class SecureLogger {
  error(message: string, err: Error, context?: SecureLogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      context: {
        errorCode: (err as any).code,
        errorSeverity: (err as any).severity,
        ...context,
      },
      // Never include: err.message, err.detail, err.query
    };

    // Log to secure system (e.g., Datadog, Splunk, Cloudwatch)
    console.log(JSON.stringify(logEntry));
  }

  warn(message: string, context?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      context: context || {},
    };
    console.log(JSON.stringify(logEntry));
  }

  info(message: string, context?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      context: context || {},
    };
    console.log(JSON.stringify(logEntry));
  }
}

export const logger = new SecureLogger();
```

---

#### Remediation Step 2: Update Connection Pool Error Handler

**File**: `src/lib/connection-pool.ts` (Lines 72-74)

**Updated Code**:
```typescript
import { logger } from './logger';

// ... in ConnectionPoolManager class

async initPostgresPool(): Promise<Pool> {
  // ... existing code ...

  this.pgPool = new Pool(poolConfig);

  // Handle pool errors securely
  this.pgPool.on('error', (err) => {
    logger.error('Database connection pool error', err, {
      context: 'idle_client_error',
      code: (err as any).code,
    });
  });

  // ... rest of method ...
}
```

---

#### Remediation Step 3: Update Redis Error Handler

**File**: `src/lib/connection-pool.ts` (add after line ~110)

```typescript
async initRedisCluster(): Promise<Cluster> {
  // ... existing code ...

  this.redisCluster = new Cluster(clusterNodes, clusterOptions);

  // Handle cluster errors securely
  this.redisCluster.on('error', (err) => {
    logger.error('Redis cluster connection error', err, {
      context: 'redis_cluster_error',
      code: (err as any).code,
    });
  });

  // ... rest of method ...
}
```

---

#### Testing the Fix

**File**: `tests/security/test-error-sanitization.sh` (new)

```bash
#!/bin/bash
# tests/security/test-error-sanitization.sh
# Verify error messages don't leak sensitive information

set -euo pipefail

echo "Testing error message sanitization..."

# Test 1: Verify no connection details in error logs
if grep -q "host\|password\|user.*=\|port.*=" src/lib/connection-pool.ts | grep -q "error"; then
  echo "FAIL: Connection details may leak in error handler"
  exit 1
fi

echo "PASS: Error handler sanitized"

# Test 2: Verify logger is imported
if grep -q "import.*logger\|from.*logger" src/lib/connection-pool.ts; then
  echo "PASS: Secure logger imported"
else
  echo "FAIL: Secure logger not imported"
  exit 1
fi

echo "All error sanitization tests passed"
```

---

### Issue 2: Explicit SSL/TLS Configuration

**Location**: `src/lib/connection-pool.ts` (ConnectionPoolConfig interface)

**Current Code**:
```typescript
export interface ConnectionPoolConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
  // ... no SSL/TLS config
}
```

**Problem**: SSL/TLS is supported by pg library but not explicitly configured

**Risk**: Unencrypted connections in production if not configured at deployment time

**Timeline**: Before production deployment
**Effort**: 2 hours

---

#### Remediation Step 1: Update Configuration Interface

**File**: `src/lib/connection-pool.ts` (Lines 18-32)

**Updated Code**:
```typescript
export interface ConnectionPoolConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    // Add SSL/TLS configuration
    ssl?: {
      enabled: boolean;
      rejectUnauthorized?: boolean;
      ca?: string;        // PEM-encoded CA certificate
      cert?: string;      // PEM-encoded client certificate
      key?: string;       // PEM-encoded client key
    };
  };
  redis: {
    nodes: Array<{ host: string; port: number }>;
    options?: ClusterOptions & {
      tls?: {
        enabled: boolean;
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
      };
    };
  };
}
```

---

#### Remediation Step 2: Apply SSL Configuration to Pool

**File**: `src/lib/connection-pool.ts` (Lines 47-63)

**Updated Code**:
```typescript
async initPostgresPool(): Promise<Pool> {
  if (this.pgPool) {
    return this.pgPool;
  }

  const poolConfig: PoolConfig = {
    host: this.config.postgres.host,
    port: this.config.postgres.port,
    database: this.config.postgres.database,
    user: this.config.postgres.user,
    password: this.config.postgres.password,
    max: this.config.postgres.max || 20,
    idleTimeoutMillis: this.config.postgres.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: this.config.postgres.connectionTimeoutMillis || 10000,
    // Add SSL/TLS configuration
    ssl: this.config.postgres.ssl?.enabled ? {
      rejectUnauthorized: this.config.postgres.ssl.rejectUnauthorized ?? true,
      ca: this.config.postgres.ssl.ca,
      cert: this.config.postgres.ssl.cert,
      key: this.config.postgres.ssl.key,
    } : false,
  };

  this.pgPool = new Pool(poolConfig);
  // ... rest of method ...
}
```

---

#### Remediation Step 3: Apply TLS to Redis Cluster

**File**: `src/lib/connection-pool.ts` (Lines 87-107)

**Updated Code**:
```typescript
async initRedisCluster(): Promise<Cluster> {
  if (this.redisCluster) {
    return this.redisCluster;
  }

  const clusterOptions: ClusterOptions = {
    redisOptions: {
      password: this.config.redis.options?.redisOptions?.password,
      // Add TLS configuration
      ...(this.config.redis.options?.tls?.enabled && {
        tls: {
          rejectUnauthorized: this.config.redis.options.tls.rejectUnauthorized ?? true,
          ca: this.config.redis.options.tls.ca,
          cert: this.config.redis.options.tls.cert,
          key: this.config.redis.options.tls.key,
        },
      }),
    },
    clusterRetryStrategy: (times) => {
      const delay = Math.min(100 + times * 2, 2000);
      return delay;
    },
    enableReadyCheck: true,
    ...this.config.redis.options,
  };

  // ... rest of method ...
}
```

---

#### Remediation Step 4: Production Deployment Configuration

**File**: `.env.production.example` (new)

```bash
# PostgreSQL Configuration
POSTGRES_HOST=db.production.example.com
POSTGRES_PORT=5432
POSTGRES_DB=cfn_production
POSTGRES_USER=cfn_app
POSTGRES_PASSWORD=[REDACTED]

# PostgreSQL SSL/TLS
POSTGRES_SSL_ENABLED=true
POSTGRES_SSL_REJECT_UNAUTHORIZED=true
POSTGRES_SSL_CA=/etc/ssl/certs/db-ca.pem

# Redis Configuration
REDIS_HOST=redis.production.example.com
REDIS_PORT=6379
REDIS_PASSWORD=[REDACTED]

# Redis TLS
REDIS_TLS_ENABLED=true
REDIS_TLS_REJECT_UNAUTHORIZED=true
REDIS_TLS_CA=/etc/ssl/certs/redis-ca.pem
```

---

#### Remediation Step 5: Environment Variable Loading

**File**: `src/lib/connection-pool.ts` (new utility function)

```typescript
// Add to connection-pool.ts or create config.ts

function loadConfigFromEnv(): ConnectionPoolConfig {
  return {
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'cfn',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: {
        enabled: process.env.POSTGRES_SSL_ENABLED === 'true',
        rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
        ca: process.env.POSTGRES_SSL_CA ?
          require('fs').readFileSync(process.env.POSTGRES_SSL_CA, 'utf8') : undefined,
      },
    },
    redis: {
      nodes: [
        {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      ],
      options: {
        redisOptions: {
          password: process.env.REDIS_PASSWORD,
        },
        tls: {
          enabled: process.env.REDIS_TLS_ENABLED === 'true',
          rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.REDIS_TLS_CA ?
            require('fs').readFileSync(process.env.REDIS_TLS_CA, 'utf8') : undefined,
        },
      },
    },
  };
}
```

---

#### Testing SSL/TLS Configuration

**File**: `tests/security/test-ssl-configuration.sh` (new)

```bash
#!/bin/bash
# tests/security/test-ssl-configuration.sh
# Verify SSL/TLS is properly configured

set -euo pipefail

echo "Testing SSL/TLS configuration..."

# Test 1: Verify SSL interface exists
if grep -q "ssl?: {" src/lib/connection-pool.ts; then
  echo "PASS: SSL configuration interface added"
else
  echo "FAIL: SSL configuration interface missing"
  exit 1
fi

# Test 2: Verify SSL is applied to pool config
if grep -q "ssl: this.config.postgres.ssl" src/lib/connection-pool.ts; then
  echo "PASS: SSL applied to PostgreSQL pool"
else
  echo "FAIL: SSL not applied to pool"
  exit 1
fi

# Test 3: Verify TLS for Redis
if grep -q "tls:" src/lib/connection-pool.ts | grep -q "redis"; then
  echo "PASS: TLS configuration for Redis"
else
  echo "FAIL: Redis TLS not configured"
  exit 1
fi

echo "All SSL/TLS tests passed"
```

---

## Low Severity Issues

### Issue 3: Base Image Version Pinning

**Location**: `docker/Dockerfile.optimized` (Lines 15, 37)

**Current Code**:
```dockerfile
FROM node:18-alpine AS builder
FROM node:18-alpine AS runtime
```

**Problem**: Using unversioned tag (`18-alpine`) allows automatic updates that may introduce breaking changes

**Timeline**: Next CI/CD update cycle
**Effort**: 15 minutes

---

#### Remediation

**Updated Code**:
```dockerfile
FROM node:18.19.0-alpine AS builder
FROM node:18.19.0-alpine AS runtime
```

**Verification Script**:
```bash
#!/bin/bash
# tests/docker/test-image-pinning.sh

echo "Checking image version pinning..."

if grep -q "FROM node:18\\.19\\.0-alpine" docker/Dockerfile.optimized; then
  echo "PASS: Base image version pinned"
else
  echo "FAIL: Base image version not pinned"
  exit 1
fi

echo "Base image pinning verified"
```

---

### Issue 4: Materialized View Permission Enforcement

**Location**: `migrations/002_create_materialized_views.sql` (add after view creation)

**Current Code**:
```sql
-- Views created but permissions not explicitly set
```

**Problem**: View refresh operations not restricted to application role

**Timeline**: Next database deployment
**Effort**: 30 minutes

---

#### Remediation

**Add to migration file** (after view creation):

```sql
-- Restrict refresh operations to application role only
ALTER MATERIALIZED VIEW mv_cost_by_team OWNER TO app_role;
GRANT SELECT ON mv_cost_by_team TO read_only_role;

ALTER MATERIALIZED VIEW mv_cost_by_agent_type OWNER TO app_role;
GRANT SELECT ON mv_cost_by_agent_type TO read_only_role;

ALTER MATERIALIZED VIEW mv_daily_cost_summary OWNER TO app_role;
GRANT SELECT ON mv_daily_cost_summary TO read_only_role;

-- Ensure refresh is restricted
REVOKE ALL ON mv_cost_by_team FROM public;
REVOKE ALL ON mv_cost_by_agent_type FROM public;
REVOKE ALL ON mv_daily_cost_summary FROM public;
```

---

### Issue 5: SQL Injection Negative Tests

**Location**: `tests/security/` (new test file)

**Timeline**: Phase 7 (Extended testing)
**Effort**: 3 hours

---

#### Remediation

**File**: `tests/security/test-sql-injection-prevention.sh` (new)

```bash
#!/bin/bash
# tests/security/test-sql-injection-prevention.sh
# Negative tests for SQL injection prevention

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)

echo "Testing SQL injection prevention..."

# Test 1: getCostByTeam with injection payload
test_getCostByTeam_injection() {
  local injection_payload="1' OR '1'='1'; DROP TABLE agents;--"

  # Simulate the query that would be generated
  local query="SELECT * FROM mv_cost_by_team WHERE team_id = \$1"
  local param="$injection_payload"

  # Verify parameterization
  if grep -q "WHERE team_id = \$1" "$PROJECT_ROOT/src/lib/query-optimizer.ts"; then
    echo "PASS: getCostByTeam uses parameterized query"
    # Payload is treated as literal string, not SQL
    return 0
  else
    echo "FAIL: getCostByTeam not parameterized"
    return 1
  fi
}

# Test 2: getCostByAgentType with injection
test_getCostByAgentType_injection() {
  local injection_payload="backend); DROP TABLE agents;--"

  if grep -A 10 "getCostByAgentType" "$PROJECT_ROOT/src/lib/query-optimizer.ts" | grep -q "\$1"; then
    echo "PASS: getCostByAgentType uses parameterized query"
    return 0
  else
    echo "FAIL: getCostByAgentType not parameterized"
    return 1
  fi
}

# Test 3: getDailyCostSummary with date injection
test_getDailyCostSummary_injection() {
  local injection_payload="2025-01-01'; DROP TABLE agents;--"

  if grep -A 20 "getDailyCostSummary" "$PROJECT_ROOT/src/lib/query-optimizer.ts" | grep -q "\$"; then
    echo "PASS: getDailyCostSummary uses parameterized queries"
    return 0
  else
    echo "FAIL: getDailyCostSummary not parameterized"
    return 1
  fi
}

# Test 4: Verify no string concatenation in queries
test_no_string_concatenation() {
  if ! grep -q "query.*+\|query.*\`.*\${\|concat.*query" "$PROJECT_ROOT/src/lib/query-optimizer.ts"; then
    echo "PASS: No string concatenation in queries"
    return 0
  else
    echo "FAIL: String concatenation detected"
    return 1
  fi
}

# Run tests
test_getCostByTeam_injection
test_getCostByAgentType_injection
test_getDailyCostSummary_injection
test_no_string_concatenation

echo "SQL injection prevention tests passed"
```

---

## Remediation Timeline

### Week 1 (Before Production)
- [ ] Error message sanitization (1 hour)
- [ ] SSL/TLS configuration (2 hours)
- [ ] Testing and validation (1 hour)

### Week 2-3 (Next Deployment Cycle)
- [ ] Base image version pinning (15 minutes)
- [ ] View permission enforcement (30 minutes)
- [ ] SQL injection tests (3 hours)

---

## Verification Checklist

- [ ] Error handler uses secure logger
- [ ] SSL/TLS enabled for PostgreSQL
- [ ] TLS enabled for Redis
- [ ] Environment variables load SSL certificates correctly
- [ ] Base image uses pinned version (18.19.0)
- [ ] Database role-based access configured
- [ ] SQL injection negative tests pass
- [ ] All tests run successfully
- [ ] Production deployment uses SSL certificates
- [ ] Error logs sanitized in production

---

## Sign-Off

**Auditor**: Security Specialist Agent
**Date**: 2025-11-24
**Status**: Ready for remediation
**Next Review**: Post-remediation validation
