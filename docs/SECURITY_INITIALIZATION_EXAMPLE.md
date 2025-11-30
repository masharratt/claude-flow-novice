# RuVector Security Initialization Example

Complete example showing how to initialize and integrate all P0 security components.

---

## Step 1: Generate Encryption Key

```bash
# Generate a cryptographically secure 256-bit encryption key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "RUVECTOR_BACKUP_KEY=$ENCRYPTION_KEY"

# Store securely in your environment/secrets manager
# DO NOT commit to git or share
export RUVECTOR_BACKUP_KEY=$ENCRYPTION_KEY
```

---

## Step 2: Set Environment Variables

Create a `.env.production` file with all security configuration:

```bash
# Encryption Configuration
RUVECTOR_BACKUP_KEY=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2

# Authentication Configuration
RUVECTOR_AUTH_METHOD=jwt
RUVECTOR_JWT_SECRET=your-jwt-secret-at-least-32-characters-long
RUVECTOR_JWT_ALGORITHM=HS256
RUVECTOR_REQUIRE_API_KEY=true
RUVECTOR_SESSION_TIMEOUT_HOURS=24

# RBAC Configuration
RUVECTOR_RBAC_ENABLED=true
RUVECTOR_RBAC_DEFAULT_DENY=true
RUVECTOR_COLLECTION_ACL_ENABLED=true
RUVECTOR_ROLE_HIERARCHY=viewer,editor,admin,super_admin

# Rate Limiting Configuration
RUVECTOR_RATE_LIMITING_ENABLED=true
RUVECTOR_RATE_LIMIT_PER_MINUTE=1000
RUVECTOR_RATE_LIMIT_PER_HOUR=50000
RUVECTOR_RATE_LIMIT_PER_DAY=500000
RUVECTOR_BURST_CAPACITY=100

# Audit Logging Configuration
RUVECTOR_AUDIT_ENABLED=true
RUVECTOR_AUDIT_BACKEND=postgres
RUVECTOR_AUDIT_RETENTION_DAYS=90
RUVECTOR_AUDIT_ARCHIVE_ENABLED=true
RUVECTOR_AUDIT_ARCHIVE_DAYS=30
RUVECTOR_AUDIT_TAMPER_DETECTION=true

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/ruvector

# Redis Configuration (optional, for distributed rate limiting)
REDIS_URL=redis://localhost:6379
```

---

## Step 3: Run Database Migrations

```bash
# Apply security schema migration
npm run migrate -- migrations/create_audit_table.sql

# Verify tables were created
psql $DATABASE_URL -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('audit_logs', 'actor_permissions', 'role_hierarchy', 'audit_archive');
"

# Expected output:
#     table_name
# ───────────────────
#  audit_logs
#  actor_permissions
#  role_hierarchy
#  audit_archive
# (4 rows)
```

---

## Step 4: Initialize in Application Startup

Create `src/security/init.ts`:

```typescript
/**
 * Security Initialization Module
 *
 * Initializes all security components at application startup
 */

import { initializeSecurityConfig } from '../lib/security-config.js';
import { getAuditLogger } from '../lib/audit-logger.js';
import { getRuVectorACL } from '../lib/ruvector-acl.js';
import { createLogger } from '../lib/logging.js';
import { Pool } from 'pg';

const logger = createLogger('security-init');

/**
 * Initialize all security components
 */
export async function initializeSecurity(options: {
  databasePool: Pool;
  redisClient?: any;
  onReady?: () => void;
}): Promise<{
  securityConfig: any;
  auditLogger: any;
  acl: any;
}> {
  try {
    logger.info('Starting security initialization');

    // Step 1: Validate security configuration
    logger.info('Validating security configuration');
    const securityConfig = await initializeSecurityConfig();

    if (!securityConfig.valid) {
      logger.error('CRITICAL: Security configuration validation failed', {
        errors: securityConfig.errors,
      });
      throw new Error(`Security config invalid: ${securityConfig.errors.join(', ')}`);
    }

    if (securityConfig.warnings.length > 0) {
      logger.warn('Security configuration warnings', {
        warnings: securityConfig.warnings,
      });
    }

    // Step 2: Initialize audit logger
    logger.info('Initializing audit logger');
    const auditLogger = getAuditLogger({
      enabled: true,
      backend: process.env.RUVECTOR_AUDIT_BACKEND as any || 'postgres',
      database_pool: options.databasePool,
      retention_days: parseInt(process.env.RUVECTOR_AUDIT_RETENTION_DAYS || '90', 10),
      archive_enabled: process.env.RUVECTOR_AUDIT_ARCHIVE_ENABLED !== 'false',
      archive_days: parseInt(process.env.RUVECTOR_AUDIT_ARCHIVE_DAYS || '30', 10),
      enable_checksums: process.env.RUVECTOR_AUDIT_TAMPER_DETECTION !== 'false',
    });

    // Log initialization event
    await auditLogger.logAuditEvent({
      event_type: 'CONFIG',
      actor: {
        id: 'system',
        type: 'system',
        role: 'admin',
      },
      resource: { collection: 'config' },
      action: 'System startup - security initialization',
      result: 'SUCCESS',
    });

    // Step 3: Initialize access control layer
    logger.info('Initializing access control layer');
    const acl = getRuVectorACL({
      database_pool: options.databasePool,
      audit_logger: auditLogger,
      cache_ttl_ms: 5 * 60 * 1000, // 5 minutes
      rate_limit_config: {
        per_minute: parseInt(process.env.RUVECTOR_RATE_LIMIT_PER_MINUTE || '1000', 10),
        per_hour: parseInt(process.env.RUVECTOR_RATE_LIMIT_PER_HOUR || '50000', 10),
        per_day: parseInt(process.env.RUVECTOR_RATE_LIMIT_PER_DAY || '500000', 10),
        burst_capacity: parseInt(process.env.RUVECTOR_BURST_CAPACITY || '100', 10),
      },
    });

    // Step 4: Set up graceful shutdown
    setupGracefulShutdown(auditLogger);

    logger.info('Security initialization completed successfully', {
      encryption_enabled: true,
      rbac_enabled: true,
      audit_logging_enabled: true,
      rate_limiting_enabled: true,
    });

    if (options.onReady) {
      options.onReady();
    }

    return {
      securityConfig,
      auditLogger,
      acl,
    };

  } catch (error) {
    logger.error('Security initialization failed', { error });
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(auditLogger: any): void {
  const signals = ['SIGTERM', 'SIGINT'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown`);

      try {
        // Flush any pending audit logs
        await auditLogger.flush();
        await auditLogger.shutdown();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    });
  });
}
```

---

## Step 5: Integrate with Express Application

Create `src/app.ts`:

```typescript
import express from 'express';
import { Pool } from 'pg';
import { initializeSecurity } from './security/init.js';
import { createACLMiddleware, requirePermission, Permission } from './lib/ruvector-acl.js';
import { createLogger } from './lib/logging.js';

const logger = createLogger('app');
const app = express();

// Global security components (will be set during init)
let acl: any = null;
let auditLogger: any = null;

/**
 * Initialize Express application with security
 */
export async function createApp(options: {
  databasePool: Pool;
  redisClient?: any;
}): Promise<express.Application> {
  try {
    // Initialize security components
    const security = await initializeSecurity({
      databasePool: options.databasePool,
      redisClient: options.redisClient,
    });

    acl = security.acl;
    auditLogger = security.auditLogger;

    // Middleware: Add ACL context to all requests
    app.use(createACLMiddleware(acl));

    // Middleware: Add security headers
    app.use((req, res, next) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('X-Frame-Options', 'DENY');
      res.set('X-XSS-Protection', '1; mode=block');
      res.set('Content-Security-Policy', "default-src 'self'");
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // Middleware: JSON parsing
    app.use(express.json());

    // Health check endpoint (no auth required)
    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        security: {
          audit_logging: auditLogger ? 'enabled' : 'disabled',
          access_control: acl ? 'enabled' : 'disabled',
        },
      });
    });

    // Example: Protected GET endpoint
    app.get('/api/:collection',
      requirePermission(Permission.READ),
      async (req, res) => {
        try {
          const { collection } = req.params;
          const authContext = (req as any).authContext;

          // Log the access
          await auditLogger.logAccessEvent(
            {
              id: authContext.actor_id,
              type: authContext.actor_type,
              role: authContext.role,
            },
            collection,
            'READ',
            'SUCCESS',
            {
              ip_address: authContext.ip_address,
              metadata: { path: req.path },
            }
          );

          // Return collection data
          res.json({
            collection,
            data: [], // Your actual data here
          });
        } catch (error) {
          logger.error('GET request error', { error });
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    );

    // Example: Protected POST endpoint
    app.post('/api/:collection',
      requirePermission(Permission.WRITE),
      async (req, res) => {
        try {
          const { collection } = req.params;
          const authContext = (req as any).authContext;

          // Verify permission explicitly
          const decision = await acl.checkAccess(
            authContext,
            collection,
            Permission.WRITE
          );

          if (!decision.allowed) {
            return res.status(403).json({
              error: 'Forbidden',
              reason: decision.reason,
            });
          }

          // Log the write operation
          await auditLogger.logAccessEvent(
            {
              id: authContext.actor_id,
              type: authContext.actor_type,
              role: authContext.role,
            },
            collection,
            'WRITE',
            'SUCCESS',
            {
              ip_address: authContext.ip_address,
              metadata: { path: req.path, body: req.body },
            }
          );

          // Your write operation here
          res.status(201).json({
            id: 'new-document-id',
            collection,
            created: new Date().toISOString(),
          });
        } catch (error) {
          logger.error('POST request error', { error });

          const authContext = (req as any).authContext;
          await auditLogger.logErrorEvent(
            {
              id: authContext.actor_id,
              type: authContext.actor_type,
              role: authContext.role,
            },
            `Failed to create document in ${req.params.collection}`,
            String(error),
            {
              collection: req.params.collection,
              ip_address: authContext.ip_address,
            }
          );

          res.status(500).json({ error: 'Internal server error' });
        }
      }
    );

    // Example: Admin endpoint - grant permissions
    app.post('/admin/permissions',
      // Add your own admin auth check here
      async (req, res) => {
        try {
          const { actor_id, collection, permission } = req.body;

          // Validate inputs
          if (!actor_id || !collection || !permission) {
            return res.status(400).json({
              error: 'Missing required fields: actor_id, collection, permission',
            });
          }

          // Grant permission
          await acl.grantAccess(actor_id, collection, permission);

          // Log the permission grant
          const authContext = (req as any).authContext;
          await auditLogger.logConfigChange(
            {
              id: authContext.actor_id,
              type: authContext.actor_type,
              role: authContext.role,
            },
            `Granted ${permission} on ${collection} to ${actor_id}`,
            'SUCCESS',
            {
              metadata: {
                target_actor: actor_id,
                collection,
                permission,
              },
            }
          );

          res.json({
            success: true,
            message: `Granted ${permission} on ${collection} to ${actor_id}`,
          });
        } catch (error) {
          logger.error('Permission grant error', { error });
          res.status(500).json({ error: 'Failed to grant permission' });
        }
      }
    );

    // Example: Query audit logs (admin only)
    app.get('/admin/audit-logs',
      // Add your own admin auth check here
      async (req, res) => {
        try {
          const { actor_id, collection, event_type, limit } = req.query;

          const logs = await auditLogger.queryAuditLog({
            actor_id: actor_id as string,
            collection: collection as string,
            event_type: event_type as string,
            limit: parseInt(limit as string) || 100,
          });

          res.json({
            count: logs.length,
            logs,
          });
        } catch (error) {
          logger.error('Audit query error', { error });
          res.status(500).json({ error: 'Failed to query audit logs' });
        }
      }
    );

    // Error handling middleware
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', { error: err });
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    });

    return app;

  } catch (error) {
    logger.error('Failed to create app', { error });
    throw error;
  }
}

export default app;
```

---

## Step 6: Start the Server

Create `src/server.ts`:

```typescript
import { createApp } from './app.js';
import { Pool } from 'pg';
import { createLogger } from './lib/logging.js';
import redis from 'redis';

const logger = createLogger('server');

async function startServer() {
  try {
    // Initialize database pool
    const databasePool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Test database connection
    logger.info('Testing database connection');
    await databasePool.query('SELECT NOW()');
    logger.info('Database connection successful');

    // Initialize Redis (optional, for distributed rate limiting)
    let redisClient = null;
    if (process.env.REDIS_URL) {
      logger.info('Connecting to Redis');
      redisClient = redis.createClient({
        url: process.env.REDIS_URL,
      });
      await redisClient.connect();
      logger.info('Redis connection successful');
    }

    // Create and start Express app
    logger.info('Creating Express application');
    const app = await createApp({
      databasePool,
      redisClient,
    });

    // Start server
    const port = parseInt(process.env.PORT || '3000', 10);
    const server = app.listen(port, () => {
      logger.info(`Security-enabled server running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        await databasePool.end();
        if (redisClient) {
          await redisClient.disconnect();
        }
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

startServer();
```

---

## Step 7: Verify Installation

```bash
# Run security validation
npm run validate-security-config

# Expected output:
# ✅ Encryption configured (AES-256-GCM)
# ✅ Authentication configured (JWT)
# ✅ RBAC enabled (deny-by-default)
# ✅ Audit logging enabled (PostgreSQL)
# ✅ Rate limiting enabled
# ✅ All security checks passed
# Overall confidence: 0.93

# Run tests
npm test -- --grep "security"

# Expected output:
# ✅ Audit Logger Tests: 100/100 passed
# ✅ ACL Tests: 100/100 passed
# ✅ Security Config Tests: All passed

# Start server
npm run dev

# Expected output:
# INFO: Security initialization completed successfully
# INFO: Security-enabled server running on port 3000
```

---

## Step 8: Test the Security Implementation

```bash
# Test 1: Verify audit logging
curl -X POST http://localhost:3000/admin/grant-permission \
  -H "Content-Type: application/json" \
  -d '{
    "actor_id": "user-123",
    "collection": "documents",
    "permission": "READ"
  }'

# Query audit logs to verify event was logged
curl http://localhost:3000/admin/audit-logs?actor_id=user-123

# Expected: Audit entries for permission grant

# Test 2: Verify access control
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:3000/api/documents

# Expected: { error: 'Forbidden', reason: 'No permissions for collection documents' }

# Test 3: Verify rate limiting
for i in {1..1001}; do
  curl http://localhost:3000/api/public-data
done

# Expected: After ~1000 requests, rate limit error

# Test 4: Verify security headers
curl -I http://localhost:3000/health

# Expected headers:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Content-Security-Policy: default-src 'self'
# Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## Troubleshooting

### Issue: "RUVECTOR_BACKUP_KEY not set"

```bash
# Solution: Generate and set encryption key
export RUVECTOR_BACKUP_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Issue: "Database connection failed"

```bash
# Solution: Verify PostgreSQL is running
psql $DATABASE_URL -c "SELECT NOW();"

# Or check PostgreSQL service
systemctl status postgresql
```

### Issue: "Migration failed"

```bash
# Solution: Verify tables don't already exist
psql $DATABASE_URL -c "DROP TABLE IF EXISTS audit_logs CASCADE;"

# Then re-run migration
npm run migrate -- migrations/create_audit_table.sql
```

### Issue: "Rate limit seems broken"

```bash
# Solution: Clear rate limit trackers and redis cache
redis-cli FLUSHDB

# Restart server
npm run dev
```

---

## Next Steps

1. Set up monitoring and alerts for failed authentication attempts
2. Configure audit log archival to S3
3. Integrate with SIEM (Splunk, ELK, Datadog, etc.)
4. Set up automated compliance reports
5. Test disaster recovery procedures

See `/docs/RUVECTOR_SECURITY_IMPLEMENTATION.md` for comprehensive documentation.
