# Security Hardening Guide - CFN Loop Enterprise

## Overview

This guide documents the security hardening measures implemented for CFN Loop enterprise orchestration, including mTLS, audit logging, RBAC, and rate limiting.

## Security Architecture

```
┌─────────────────────────────────────────┐
│   External Clients                      │
│   (Users, Teams, Services)              │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│   Security Layer                        │
│   - Rate Limiting                       │
│   - Authentication                      │
│   - RBAC Authorization                  │
│   - Audit Logging                       │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│   Application Layer                     │
│   (Agent Spawning, Job Execution)       │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│   Service-to-Service (mTLS)             │
│   - Redis (TLS 1.3)                     │
│   - PostgreSQL (TLS 1.3)                │
│   - Docker Daemon (TLS 1.2+)            │
└─────────────────────────────────────────┘
```

## mTLS for Service-to-Service Communication

### Certificate Generation

Generate CA and service certificates using the provided script:

```bash
./scripts/security/generate-certificates.sh
```

This creates:
```
.certs/
├── ca/
│   ├── ca-cert.pem        # CA certificate (public)
│   └── ca-key.pem         # CA private key (600 permissions)
├── redis/
│   ├── redis-cert.pem     # Redis service certificate
│   └── redis-key.pem      # Redis private key (600 permissions)
├── postgres/
│   ├── postgres-cert.pem  # PostgreSQL service certificate
│   └── postgres-key.pem   # PostgreSQL private key (600 permissions)
└── client/
    ├── client-cert.pem    # Client certificate
    └── client-key.pem     # Client private key (600 permissions)
```

**Important:** The `.certs/` directory is git-ignored. Never commit certificate private keys to version control.

### Certificate Rotation

Certificates expire after 365 days. Automate rotation with:

```bash
# Manual rotation
./scripts/security/rotate-certificates.sh

# Automated via cron (recommended)
0 0 1 * * /path/to/project/scripts/security/rotate-certificates.sh
```

The rotation script:
1. Checks certificate expiration dates
2. Generates new certificates if expiring within 30 days
3. Updates service configurations
4. Performs graceful service restarts
5. Sends notifications on completion

### Redis mTLS Configuration

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    command: >
      redis-server
      --tls-port 6380
      --port 0
      --tls-cert-file /certs/redis-cert.pem
      --tls-key-file /certs/redis-key.pem
      --tls-ca-cert-file /certs/ca-cert.pem
      --tls-auth-clients yes
    volumes:
      - ./.certs/ca/ca-cert.pem:/certs/ca-cert.pem:ro
      - ./.certs/redis/redis-cert.pem:/certs/redis-cert.pem:ro
      - ./.certs/redis/redis-key.pem:/certs/redis-key.pem:ro
```

Client connection:

```typescript
import { createClient } from 'redis';
import fs from 'fs';

const redis = createClient({
  socket: {
    host: 'redis',
    port: 6380,
    tls: true,
    cert: fs.readFileSync('.certs/client/client-cert.pem'),
    key: fs.readFileSync('.certs/client/client-key.pem'),
    ca: fs.readFileSync('.certs/ca/ca-cert.pem'),
    rejectUnauthorized: true
  }
});
```

### PostgreSQL mTLS Configuration

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    command: >
      postgres
      -c ssl=on
      -c ssl_cert_file=/certs/postgres-cert.pem
      -c ssl_key_file=/certs/postgres-key.pem
      -c ssl_ca_file=/certs/ca-cert.pem
      -c ssl_min_protocol_version=TLSv1.3
    volumes:
      - ./.certs/ca/ca-cert.pem:/certs/ca-cert.pem:ro
      - ./.certs/postgres/postgres-cert.pem:/certs/postgres-cert.pem:ro
      - ./.certs/postgres/postgres-key.pem:/certs/postgres-key.pem:ro
```

Client connection:

```typescript
import { Pool } from 'pg';
import fs from 'fs';

const pool = new Pool({
  host: 'postgres',
  port: 5432,
  database: 'cfn',
  user: 'cfn_user',
  password: process.env.POSTGRES_PASSWORD,
  ssl: {
    cert: fs.readFileSync('.certs/client/client-cert.pem'),
    key: fs.readFileSync('.certs/client/client-key.pem'),
    ca: fs.readFileSync('.certs/ca/ca-cert.pem'),
    rejectUnauthorized: true
  }
});
```

## Audit Logging

### Purpose

Log all privileged operations for security monitoring and compliance.

### Configuration

```typescript
import { auditLogger } from '../middleware/audit-logging';

// Apply to Express app
app.use(auditLogger({
  logPath: '/var/log/cfn/audit.log',
  retentionDays: 90,
  includeRequestBody: false,  // Avoid logging sensitive data
  operations: [
    'AGENT_SPAWN',
    'QUOTA_CHANGE',
    'COST_QUERY',
    'ROLE_CHANGE',
    'CERTIFICATE_ROTATION'
  ]
}));
```

### Log Format

```json
{
  "timestamp": "2025-11-24T10:15:30.000Z",
  "userId": "user-12345",
  "teamId": "team-67890",
  "action": "AGENT_SPAWN",
  "resource": "backend-developer",
  "resourceId": "agent-abc123",
  "metadata": {
    "taskId": "task-xyz789",
    "provider": "zai",
    "model": "glm-4.6"
  },
  "ipAddress": "10.0.1.45",
  "userAgent": "Claude-Desktop/2.0",
  "result": "SUCCESS"
}
```

### Operations Logged

| Operation | Description | Metadata |
|-----------|-------------|----------|
| AGENT_SPAWN | Container spawned | taskId, agentType, provider |
| QUOTA_CHANGE | Team quota modified | oldQuota, newQuota, reason |
| COST_QUERY | Cost data accessed | dateRange, aggregation |
| ROLE_CHANGE | User role updated | oldRole, newRole, teamId |
| CERTIFICATE_ROTATION | mTLS certs rotated | expirationDate, services |

### Querying Audit Logs

```bash
# View recent agent spawns
jq '.action == "AGENT_SPAWN"' /var/log/cfn/audit.log | tail -20

# Find quota changes by team
jq 'select(.teamId == "team-67890" and .action == "QUOTA_CHANGE")' /var/log/cfn/audit.log

# Detect suspicious activity (many failures)
jq 'select(.result == "FAILURE")' /var/log/cfn/audit.log | wc -l
```

### Retention Policy

Audit logs are retained for 90 days:

```bash
# Automated cleanup via cron
0 0 * * * find /var/log/cfn/audit.log.* -mtime +90 -delete
```

## Role-Based Access Control (RBAC)

### Roles

**Admin** - Full system access
- Spawn agents
- Modify team quotas
- Change user roles
- View all audit logs
- Rotate certificates

**Operator** - Limited operational access
- View metrics and dashboards
- Restart failed agents
- View team-specific logs
- Query cost data

**Viewer** - Read-only access
- View dashboards
- View team-specific logs
- No modification permissions

### Permission Matrix

| Resource | Admin | Operator | Viewer |
|----------|-------|----------|--------|
| Agent Spawn | ✅ | ❌ | ❌ |
| Agent View | ✅ | ✅ | ✅ |
| Quota Modify | ✅ | ❌ | ❌ |
| Quota View | ✅ | ✅ | ✅ |
| Logs View | ✅ | ✅ (team only) | ✅ (team only) |
| Metrics View | ✅ | ✅ | ✅ |
| Role Change | ✅ | ❌ | ❌ |
| Cert Rotation | ✅ | ❌ | ❌ |

### Implementation

```typescript
import { rbacMiddleware, Role } from '../middleware/rbac';

// Protect endpoints with RBAC
app.post('/api/agents/spawn',
  rbacMiddleware({ resource: 'agents', action: 'create' }),
  async (req, res) => {
    // Only Admin can reach here
    const result = await spawnAgent(req.body);
    res.json(result);
  }
);

app.put('/api/teams/:teamId/quota',
  rbacMiddleware({ resource: 'quotas', action: 'update' }),
  async (req, res) => {
    // Only Admin can reach here
    await updateQuota(req.params.teamId, req.body.quota);
    res.json({ success: true });
  }
);

app.get('/api/metrics',
  rbacMiddleware({ resource: 'metrics', action: 'read' }),
  async (req, res) => {
    // All roles can reach here
    const metrics = await getMetrics(req.user.teamId);
    res.json(metrics);
  }
);
```

### Role Assignment

```typescript
// Assign role to user
await assignRole(userId, teamId, Role.OPERATOR);

// Check user permissions
const hasPermission = await checkPermission(
  userId,
  { resource: 'agents', action: 'create' }
);
```

### Policy Definitions

```typescript
// src/middleware/rbac.ts
export const rolePermissions = {
  [Role.ADMIN]: [
    { resource: 'agents', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'quotas', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'roles', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'logs', actions: ['read'] },
    { resource: 'metrics', actions: ['read'] },
    { resource: 'certificates', actions: ['rotate'] }
  ],
  [Role.OPERATOR]: [
    { resource: 'agents', actions: ['read'] },
    { resource: 'quotas', actions: ['read'] },
    { resource: 'logs', actions: ['read'] },  // Team-scoped
    { resource: 'metrics', actions: ['read'] }
  ],
  [Role.VIEWER]: [
    { resource: 'logs', actions: ['read'] },  // Team-scoped
    { resource: 'metrics', actions: ['read'] }
  ]
};
```

## Rate Limiting

### Purpose

Prevent abuse and ensure fair resource allocation across teams.

### Configuration

```typescript
import { rateLimiter } from '../middleware/rate-limiting';

// Global API rate limit
app.use('/api/', rateLimiter({
  windowMs: 60000,        // 1 minute
  maxRequests: 100,       // 100 requests per minute
  keyGenerator: (req) => req.user.teamId,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: 60
    });
  }
}));

// Agent spawn rate limit (stricter)
app.use('/api/agents/spawn', rateLimiter({
  windowMs: 60000,
  maxRequests: 10,  // 10 concurrent spawns per team
  keyGenerator: (req) => req.user.teamId
}));

// Cost query rate limit
app.use('/api/cost/', rateLimiter({
  windowMs: 60000,
  maxRequests: 60,  // 60 queries per minute
  keyGenerator: (req) => req.user.teamId
}));
```

### Rate Limit Headers

Responses include rate limit information:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1732445730000
```

When limit exceeded:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1732445730000

{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### Sliding Window Algorithm

The rate limiter uses a sliding window algorithm for accurate counting:

```typescript
// Redis-backed sliding window
async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);

  // Count current window
  const count = await redis.zcard(key);

  if (count >= limit) {
    return false;  // Rate limit exceeded
  }

  // Add current request
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));

  return true;  // Within limit
}
```

### Team-Specific Overrides

```typescript
// Premium teams get higher limits
const teamLimits = {
  'team-premium-1': { maxRequests: 200 },
  'team-premium-2': { maxRequests: 200 },
  'team-free-1': { maxRequests: 50 }
};

app.use('/api/', rateLimiter({
  windowMs: 60000,
  maxRequests: (req) => {
    const teamId = req.user.teamId;
    return teamLimits[teamId]?.maxRequests || 100;
  },
  keyGenerator: (req) => req.user.teamId
}));
```

## Security Best Practices

### Credential Management

✅ **DO:**
- Store credentials in environment variables
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Rotate credentials regularly (90 days)
- Use different credentials per environment

❌ **DON'T:**
- Hardcode credentials in source code
- Commit `.env` files to git
- Share credentials in documentation
- Use same credentials across environments

### Certificate Management

✅ **DO:**
- Rotate certificates before expiration (30 days)
- Use strong key sizes (RSA 4096, ECDSA P-384)
- Store private keys with restrictive permissions (600)
- Monitor certificate expiration dates

❌ **DON'T:**
- Commit certificate private keys to git
- Use self-signed certificates in production
- Share private keys between services
- Ignore certificate warnings

### Audit Log Security

✅ **DO:**
- Write audit logs to secure, append-only storage
- Include sufficient context for forensics
- Monitor audit logs for suspicious patterns
- Retain logs for compliance requirements (90 days minimum)

❌ **DON'T:**
- Log sensitive data (passwords, tokens)
- Allow users to delete their own audit entries
- Store audit logs in user-writable locations
- Use inconsistent log formats

## Monitoring and Alerting

### Security Metrics

```typescript
{
  // Authentication
  'auth.login_attempts': 125,
  'auth.login_failures': 3,
  'auth.token_refreshes': 42,

  // Authorization (RBAC)
  'rbac.permission_denials': 5,
  'rbac.role_changes': 2,

  // Rate limiting
  'ratelimit.429_responses': 8,
  'ratelimit.teams_throttled': 3,

  // mTLS
  'mtls.certificate_errors': 0,
  'mtls.handshake_failures': 1,

  // Audit logs
  'audit.entries_written': 342,
  'audit.write_failures': 0
}
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: security
    rules:
      - alert: HighAuthFailureRate
        expr: rate(auth_login_failures[5m]) > 10
        annotations:
          summary: "High authentication failure rate"

      - alert: CertificateExpiringSoon
        expr: (mtls_certificate_expiry_days < 30)
        annotations:
          summary: "mTLS certificate expiring in {{ $value }} days"

      - alert: HighRateLimitHitRate
        expr: rate(ratelimit_429_responses[5m]) > 50
        annotations:
          summary: "High rate limit hit rate"

      - alert: SuspiciousAuditPattern
        expr: rate(audit_entries{result="FAILURE"}[5m]) > 20
        annotations:
          summary: "Suspicious pattern in audit logs"
```

## Testing

### mTLS Tests

```typescript
describe('mTLS', () => {
  it('should reject connections without valid certificates', async () => {
    const client = createRedisClient({ ssl: { rejectUnauthorized: true } });
    await expect(client.connect()).rejects.toThrow('certificate');
  });

  it('should accept connections with valid certificates', async () => {
    const client = createRedisClient({
      ssl: {
        cert: fs.readFileSync('.certs/client/client-cert.pem'),
        key: fs.readFileSync('.certs/client/client-key.pem'),
        ca: fs.readFileSync('.certs/ca/ca-cert.pem')
      }
    });
    await client.connect();
    expect(client.isOpen).toBe(true);
  });
});
```

### RBAC Tests

```typescript
describe('RBAC', () => {
  it('should deny viewer from spawning agents', async () => {
    const req = { user: { role: Role.VIEWER } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await rbacMiddleware({ resource: 'agents', action: 'create' })(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow admin to spawn agents', async () => {
    const req = { user: { role: Role.ADMIN } };
    const next = jest.fn();

    await rbacMiddleware({ resource: 'agents', action: 'create' })(req, {}, next);

    expect(next).toHaveBeenCalled();
  });
});
```

### Rate Limiting Tests

```typescript
describe('Rate Limiting', () => {
  it('should throttle after limit exceeded', async () => {
    const limiter = rateLimiter({ windowMs: 60000, maxRequests: 5 });

    // Make 5 requests (should succeed)
    for (let i = 0; i < 5; i++) {
      const req = { user: { teamId: 'team-1' } };
      const next = jest.fn();
      await limiter(req, {}, next);
      expect(next).toHaveBeenCalled();
    }

    // 6th request should be throttled
    const req = { user: { teamId: 'team-1' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await limiter(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(429);
  });
});
```

## Troubleshooting

### mTLS Connection Failures

**Symptom:** Services cannot connect to Redis/PostgreSQL

**Diagnosis:**
```bash
# Check certificate validity
openssl x509 -in .certs/redis/redis-cert.pem -noout -dates

# Test connection
openssl s_client -connect redis:6380 \
  -cert .certs/client/client-cert.pem \
  -key .certs/client/client-key.pem \
  -CAfile .certs/ca/ca-cert.pem
```

**Solution:**
- Verify certificate expiration dates
- Check file permissions (600 for keys)
- Ensure CA certificate is valid
- Rotate certificates if expired

### RBAC Permission Denials

**Symptom:** Users unable to perform operations they should have access to

**Diagnosis:**
```typescript
// Check user role and permissions
const user = await getUser(userId);
console.log(user.role);
console.log(rolePermissions[user.role]);
```

**Solution:**
- Verify role assignment is correct
- Check permission definitions in code
- Review audit logs for permission denials
- Update role definitions if needed

### Rate Limit False Positives

**Symptom:** Legitimate requests being throttled

**Diagnosis:**
```bash
# Check Redis rate limit counters
redis-cli zrange "ratelimit:team-123" 0 -1 WITHSCORES
```

**Solution:**
- Increase limit for specific teams
- Adjust window size
- Review key generation logic
- Consider separate limits per endpoint

## See Also

- [Resilience Guide](./RESILIENCE_GUIDE.md)
- [Monitoring Guide](./MONITORING_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
