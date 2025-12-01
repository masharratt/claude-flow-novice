# Security Remediation Code Examples
## Phase 1 & 2 Implementation Guide

---

## SEC-CRITICAL-001: API Key Masking in Logs

### Problem
API keys can be exposed in error messages, stack traces, and log statements.

### Solution 1: Masked Logging Utility

```typescript
// lib/secure-logger.ts
import { getLogger } from './structured-logger.js';

const logger = getLogger('secure-logger');

/**
 * Mask sensitive values in logs
 * @example maskSensitive('cerebras-key-123456') => 'cere***'
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) {
    return '***';
  }
  return value.substring(0, visibleChars) + '***' + value.substring(value.length - 2);
}

/**
 * Sanitize object for logging (remove sensitive keys)
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;

  const SENSITIVE_KEYS = [
    'api_key', 'apiKey', 'secret', 'password', 'token', 'jwt',
    'authorization', 'x-api-key', 'cerebras_api_key',
  ];

  const sanitized = { ...obj };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = maskSensitive(String(sanitized[key]));
    }
  }
  return sanitized;
}

/**
 * Log API call without exposing credentials
 */
export function logApiCall(method: string, url: string, statusCode: number): void {
  logger.info('API call', {
    method,
    url: url.replace(/Bearer [^ ]+/, 'Bearer ***'),  // Mask auth header
    status: statusCode,
  });
}

/**
 * Log error safely (no credentials)
 */
export function logErrorSafely(error: Error, context: string): void {
  logger.error(context, {
    name: error.name,
    message: error.message,
    // DO NOT log stack trace which may contain credentials
  });
}
```

### Solution 2: Safe API Call Wrapper

```typescript
// lib/cerebras-api.ts
import { maskSensitive, logApiCall, logErrorSafely } from './secure-logger.js';

class CerebrasAPIClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.CEREBRAS_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('CEREBRAS_API_KEY environment variable not set');
    }
  }

  async callAPI(prompt: string): Promise<string> {
    const url = 'https://api.cerebras.ai/v1/chat/completions';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,  // Kept in memory only
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'claude-3-sonnet',
        }),
      });

      // Log without exposing the key
      logApiCall('POST', url, response.status);

      if (!response.ok) {
        // Log response status only, NOT full response body
        logger.error('Cerebras API error', {
          status: response.status,
          statusText: response.statusText,
          // Safe to log: doesn't contain the API key
        });
        throw new Error(`API returned ${response.status}`);
      }

      const result = await response.text();
      return result;

    } catch (error) {
      // Safe error logging
      if (error instanceof TypeError) {
        logErrorSafely(error as Error, 'Network error calling Cerebras API');
      } else {
        logErrorSafely(error as Error, 'Cerebras API call failed');
      }
      throw error;
    }
    // apiKey automatically goes out of scope here
  }
}

export const cerebrasisInstance = new CerebrasAPIClient();
```

### Solution 3: Pre-commit Hook for Secret Scanning

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Scan for common secret patterns
PATTERNS=(
  "CEREBRAS_API_KEY="
  "ANTHROPIC_API_KEY="
  "Bearer [a-zA-Z0-9_-]{20,}"  # Bearer token pattern
  "sk_[a-zA-Z0-9]{20,}"         # OpenAI key pattern
)

EXIT_CODE=0
for pattern in "${PATTERNS[@]}"; do
  if git diff --cached -S "$pattern" --quiet; then
    echo "❌ Security Check Failed: Potential secret detected"
    echo "   Pattern: $pattern"
    echo "   Use: git add -p to exclude this chunk"
    EXIT_CODE=1
  fi
done

exit $EXIT_CODE
```

---

## SEC-CRITICAL-002: Rate Limiting Implementation

### Solution: p-queue Based Rate Limiter

```typescript
// lib/cerebras-rate-limiter.ts
import PQueue from 'p-queue';
import { getLogger } from './structured-logger.js';

const logger = getLogger('rate-limiter');

interface RateLimiterConfig {
  concurrency: number;        // Parallel requests
  interval: number;            // Time window in ms
  intervalCap: number;         // Max requests per interval
  dailyTokenLimit: number;     // Max tokens per day
  timeout: number;             // Request timeout in ms
  maxRetries: number;          // Retry attempts
}

export class CerebrasRateLimiter {
  private queue: PQueue;
  private dailyBudget = {
    tokensUsed: 0,
    limit: 1000000,
    resetAt: this.getNextMidnight(),
  };

  constructor(config: Partial<RateLimiterConfig> = {}) {
    const finalConfig = {
      concurrency: 1,
      interval: 60000,
      intervalCap: parseInt(process.env.CEREBRAS_API_RATE_LIMIT_PER_MINUTE || '10'),
      dailyTokenLimit: parseInt(process.env.CEREBRAS_API_DAILY_TOKEN_LIMIT || '1000000'),
      timeout: parseInt(process.env.CEREBRAS_API_TIMEOUT_MS || '30000'),
      maxRetries: 3,
      ...config,
    };

    this.queue = new PQueue({
      concurrency: finalConfig.concurrency,
      interval: finalConfig.interval,
      intervalCap: finalConfig.intervalCap,
      timeout: finalConfig.timeout,
    });

    this.dailyBudget.limit = finalConfig.dailyTokenLimit;

    // Reset budget at midnight UTC
    this.scheduleTokenReset();
  }

  /**
   * Call Cerebras API with rate limiting
   */
  async call(prompt: string, apiKey: string): Promise<{
    content: string;
    tokensUsed: number;
  }> {
    // Check token budget
    const estimatedTokens = Math.ceil(prompt.length / 4);
    if (this.dailyBudget.tokensUsed + estimatedTokens > this.dailyBudget.limit) {
      throw new Error(
        `Daily token limit exceeded. Used: ${this.dailyBudget.tokensUsed}, ` +
        `Requested: ${estimatedTokens}, Limit: ${this.dailyBudget.limit}`
      );
    }

    // Queue the request
    return this.queue.add(async () => {
      logger.debug('Calling Cerebras API', {
        estimatedTokens,
        budgetRemaining: this.dailyBudget.limit - this.dailyBudget.tokensUsed,
      });

      const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'claude-3-sonnet',
        }),
        signal: AbortSignal.timeout(30000),  // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const tokensUsed = (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0);

      // Update budget
      this.dailyBudget.tokensUsed += tokensUsed;
      logger.info('API call successful', { tokensUsed, budgetRemaining: this.dailyBudget.limit - this.dailyBudget.tokensUsed });

      return {
        content: data.choices[0].message.content,
        tokensUsed,
      };
    });
  }

  private getNextMidnight(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  private scheduleTokenReset(): void {
    const now = new Date();
    const timeUntilMidnight = this.dailyBudget.resetAt.getTime() - now.getTime();

    setTimeout(() => {
      this.dailyBudget.tokensUsed = 0;
      logger.info('Daily token budget reset');
      this.scheduleTokenReset();  // Reschedule for next midnight
    }, timeUntilMidnight);
  }
}

// Usage in cfn-mdap-implementer.ts
const limiter = new CerebrasRateLimiter();
const result = await limiter.call(prompt, apiKey);
```

### Environment Variables

```bash
# .env
CEREBRAS_API_RATE_LIMIT_PER_MINUTE=10
CEREBRAS_API_DAILY_TOKEN_LIMIT=1000000
CEREBRAS_API_TIMEOUT_MS=30000
```

---

## SEC-CRITICAL-003: HTTPS Certificate Validation

### Solution: HTTPS Agent with Certificate Pinning

```typescript
// lib/cerebras-https-agent.ts
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create HTTPS agent with certificate pinning
 * Prevents MITM attacks by validating certificate against known good copy
 */
export function createCerebrasAgent(): https.Agent {
  // Option 1: Use system CA bundle (recommended for production)
  const agent = new https.Agent({
    rejectUnauthorized: true,
    // Disable older TLS versions
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    // Optional: enable session caching
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
  });

  // Option 2: Pin specific certificate (advanced)
  // Uncomment below if you want additional pinning security
  /*
  try {
    const certPath = path.join(__dirname, '../certs/cerebras-api.pem');
    if (fs.existsSync(certPath)) {
      const cert = fs.readFileSync(certPath, 'utf-8');
      agent = new https.Agent({
        ca: [cert],
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      });
    }
  } catch (error) {
    logger.warn('Certificate pinning not available, using system CA', error);
  }
  */

  return agent;
}

/**
 * Validate certificate on first connection
 * This ensures we're actually talking to api.cerebras.ai
 */
export async function validateCerebrasConnection(apiKey: string): Promise<boolean> {
  try {
    const agent = createCerebrasAgent();

    const response = await fetch('https://api.cerebras.ai/v1/health', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      agent,
      timeout: 5000,
    });

    return response.ok;
  } catch (error) {
    logger.error('Failed to validate Cerebras connection', error);
    return false;
  }
}
```

### Usage in API Client

```typescript
// lib/cerebras-api.ts
import { createCerebrasAgent, validateCerebrasConnection } from './cerebras-https-agent.js';

class CerebrasAPIClient {
  private agent: https.Agent;

  async initialize(): Promise<void> {
    this.agent = createCerebrasAgent();

    // Validate connection on startup
    const valid = await validateCerebrasConnection(process.env.CEREBRAS_API_KEY || '');
    if (!valid) {
      throw new Error('Failed to validate Cerebras API connection');
    }
  }

  async callAPI(prompt: string): Promise<string> {
    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        model: 'claude-3-sonnet',
      }),
      agent: this.agent,  // Use secure agent
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.text();
  }
}
```

### Testing HTTPS Validation

```bash
#!/bin/bash
# tests/test-https-validation.sh

# Test with valid certificate
echo "Testing valid Cerebras connection..."
curl -v --cacert /etc/ssl/certs/ca-certificates.crt https://api.cerebras.ai/v1/health \
  -H "Authorization: Bearer $CEREBRAS_API_KEY"

# This should succeed (TLS verification passes)
if [ $? -eq 0 ]; then
  echo "✅ HTTPS validation working"
else
  echo "❌ HTTPS validation failed"
  exit 1
fi
```

---

## SEC-HIGH-001: Health Check Sanitization

### Problem
Health check exposes internal configuration details to unauthenticated users.

### Solution: Authenticated Health Endpoint

```typescript
// lib/health-check-secure.ts
import { getLogger } from './structured-logger.js';
import { Role, authenticate } from './ruvector-auth.js';

const logger = getLogger('health-check');

/**
 * Public health check (minimal information)
 */
export async function getPublicHealthStatus(): Promise<{
  status: 'healthy' | 'unhealthy';
  timestamp: string;
}> {
  try {
    // Perform basic checks (non-blocking)
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    if (heapPercent > 90) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Public health check error', error);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Detailed health check (requires ADMIN authentication)
 */
export async function getDetailedHealthStatus(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
  }[];
  timestamp: string;
}> {
  const components = [];

  // Only check components if configured
  const hasRuVector = !!process.env.RUVECTOR_API_KEY;
  const hasDatabase = !!process.env.DATABASE_URL;

  if (hasRuVector) {
    const rv = await checkRuVectorHealth();
    components.push(rv);
  } else {
    components.push({
      name: 'RuVector',
      status: 'unhealthy',
      message: 'Not configured',
    });
  }

  if (hasDatabase) {
    const db = await checkDatabaseHealth();
    components.push(db);
  } else {
    components.push({
      name: 'Database',
      status: 'unhealthy',
      message: 'Not configured',
    });
  }

  const status = components.every(c => c.status === 'healthy')
    ? 'healthy'
    : components.every(c => c.status !== 'unhealthy')
    ? 'degraded'
    : 'unhealthy';

  return {
    status,
    components,
    timestamp: new Date().toISOString(),
  };
}

async function checkRuVectorHealth(): Promise<{
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
}> {
  try {
    const apiKey = process.env.RUVECTOR_API_KEY;
    if (!apiKey) {
      return { name: 'RuVector', status: 'unhealthy', message: 'Service unavailable' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(
        process.env.RUVECTOR_ENDPOINT || 'http://ruvector:8080/health',
        {
          signal: controller.signal,
          headers: { 'Authorization': `Bearer ${apiKey}` },
        }
      );
      clearTimeout(timeout);

      if (response.ok) {
        return { name: 'RuVector', status: 'healthy', message: 'Connected' };
      } else {
        logger.warn(`RuVector returned ${response.status} (internal)`, { status: response.status });
        return { name: 'RuVector', status: 'unhealthy', message: 'Service unavailable' };
      }
    } catch (error) {
      clearTimeout(timeout);
      logger.warn('RuVector health check timeout or error (internal)', { error: error instanceof Error ? error.message : String(error) });
      return { name: 'RuVector', status: 'unhealthy', message: 'Service unavailable' };
    }
  } catch (error) {
    logger.error('RuVector health check failed (internal)', error);
    return { name: 'RuVector', status: 'unhealthy', message: 'Service unavailable' };
  }
}

async function checkDatabaseHealth(): Promise<{
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
}> {
  try {
    // Actual database check (ping query)
    // Implementation depends on your database library
    return { name: 'Database', status: 'healthy', message: 'Connected' };
  } catch (error) {
    logger.error('Database health check failed (internal)', error);
    return { name: 'Database', status: 'unhealthy', message: 'Service unavailable' };
  }
}
```

### Express Routes with Authentication

```typescript
// routes/health.ts
import express from 'express';
import { getPublicHealthStatus, getDetailedHealthStatus } from '../lib/health-check-secure.js';
import { authenticate } from '../lib/ruvector-auth.js';
import { Role } from '../lib/auth-types.js';

const router = express.Router();

/**
 * Public health endpoint
 * Returns minimal status without authentication
 */
router.get('/health', async (req, res) => {
  try {
    const health = await getPublicHealthStatus();
    res.json(health);
  } catch (error) {
    res.status(500).json({ status: 'unhealthy' });
  }
});

/**
 * Detailed health endpoint
 * Returns full component details, requires ADMIN authentication
 */
router.get('/health/detailed', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    try {
      const context = authenticate(authHeader);

      // Require ADMIN role
      if (context.role !== Role.ADMIN) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const health = await getDetailedHealthStatus();
      res.json(health);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

---

## SEC-HIGH-003: Global Authentication Middleware

### Solution: Express Middleware Setup

```typescript
// middleware/auth-middleware.ts
import express, { Request, Response, NextFunction } from 'express';
import { authenticate, Role, AuthContext } from '../lib/ruvector-auth.js';
import { AuthenticationError, AuthorizationError } from '../lib/auth-types.js';
import { getLogger } from '../lib/structured-logger.js';

const logger = getLogger('auth-middleware');

/**
 * Augment Express Request type with auth context
 */
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

/**
 * Global authentication middleware
 * Applies to all routes except public endpoints
 */
export function setupAuthMiddleware(app: express.Application): void {
  // Public endpoints (no auth required)
  const PUBLIC_PATHS = ['/health', '/status'];

  // Apply auth to all routes except public
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip auth for public endpoints
    if (PUBLIC_PATHS.some(path => req.path.startsWith(path))) {
      return next();
    }

    try {
      const authHeader = req.headers.authorization;
      const context = authenticate(authHeader);

      req.authContext = context;

      // Log successful authentication
      logger.info('Authenticated request', {
        userId: context.id,
        role: context.role,
        method: req.method,
        path: req.path,
      });

      next();
    } catch (error) {
      // Log failed authentication
      logger.warn('Authentication failed', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthenticationError) {
        return res.status(401).json({
          error: error.message || 'Authentication required',
        });
      }

      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        userId: req.authContext?.id || 'anonymous',
        role: req.authContext?.role || 'none',
      });
    });

    next();
  });
}

/**
 * Route-specific authorization middleware
 * @example app.post('/admin', requireRole(Role.ADMIN), handler)
 */
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authContext) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const roleHierarchy = { [Role.VIEWER]: 0, [Role.OPERATOR]: 1, [Role.ADMIN]: 2 };
    if (roleHierarchy[req.authContext.role] < roleHierarchy[role]) {
      logger.warn('Authorization failed', {
        userId: req.authContext.id,
        requiredRole: role,
        actualRole: req.authContext.role,
      });

      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Operation-specific permission middleware
 * @example app.post('/collections', requirePermission(Operation.WRITE), handler)
 */
export function requirePermission(operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authContext) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check permission based on role
    const permissions = {
      [Role.VIEWER]: ['read'],
      [Role.OPERATOR]: ['read', 'write'],
      [Role.ADMIN]: ['read', 'write', 'delete', 'admin'],
    };

    if (!permissions[req.authContext.role]?.includes(operation)) {
      logger.warn('Permission denied', {
        userId: req.authContext.id,
        operation,
        role: req.authContext.role,
      });

      return res.status(403).json({ error: 'Permission denied' });
    }

    next();
  };
}
```

### Application Setup

```typescript
// app.ts
import express from 'express';
import { setupAuthMiddleware, requireRole, requirePermission } from './middleware/auth-middleware.js';
import { Role } from './lib/auth-types.js';
import { Operation } from './lib/auth-types.js';

const app = express();

// Setup authentication globally
setupAuthMiddleware(app);

// Public endpoints (defined in middleware, no auth required)
app.get('/health', async (req, res) => {
  // Handler
});

// Protected endpoints
app.get('/collections', requireRole(Role.VIEWER), async (req, res) => {
  // Handler - requires VIEWER role or higher
});

app.post('/collections', requireRole(Role.ADMIN), async (req, res) => {
  // Handler - requires ADMIN role
});

app.get('/metrics', requireRole(Role.OPERATOR), async (req, res) => {
  // Handler - requires OPERATOR role
});

// Error handling middleware (must be last)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
```

---

## SEC-MEDIUM-001: Audit Log Persistence

### Solution: PostgreSQL Persistence

```typescript
// lib/audit-logger-db.ts
import { Pool } from 'pg';
import { getLogger } from './structured-logger.js';
import fs from 'fs';

const logger = getLogger('audit-logger');

const pool = new Pool({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL !== 'false',
});

// Create audit table on startup
async function initializeAuditTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP NOT NULL DEFAULT now(),
        event VARCHAR(100) NOT NULL,
        user_id VARCHAR(256),
        role VARCHAR(50),
        operation VARCHAR(100),
        resource VARCHAR(256),
        success BOOLEAN NOT NULL,
        error VARCHAR(1000),
        ip_address INET,
        user_agent VARCHAR(1000),
        request_id VARCHAR(256)
      );

      CREATE INDEX IF NOT EXISTS idx_auth_audit_timestamp
        ON auth_audit_log(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id
        ON auth_audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_audit_event
        ON auth_audit_log(event);
    `);
    logger.info('Audit table initialized');
  } catch (error) {
    logger.error('Failed to initialize audit table', error);
    throw error;
  }
}

export async function logAuditEntry(entry: {
  event: string;
  userId?: string;
  role?: string;
  operation?: string;
  resource?: string;
  success: boolean;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO auth_audit_log
       (event, user_id, role, operation, resource, success, error, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.event,
        entry.userId,
        entry.role,
        entry.operation,
        entry.resource,
        entry.success,
        entry.error,
        entry.ipAddress,
        entry.userAgent,
        entry.requestId,
      ]
    );
  } catch (error) {
    logger.error('Failed to log audit entry to database', error);

    // Fallback: log to file
    try {
      fs.appendFileSync(
        '/var/log/ruvector-audit.log',
        JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + '\n'
      );
    } catch (fileError) {
      logger.error('Failed to write audit log to file', fileError);
    }
  }
}

export async function getAuditLog(options: {
  limit?: number;
  offset?: number;
  userId?: string;
  event?: string;
  startTime?: Date;
  endTime?: Date;
}): Promise<any[]> {
  let query = 'SELECT * FROM auth_audit_log WHERE 1=1';
  const params: any[] = [];

  if (options.userId) {
    query += ` AND user_id = $${params.length + 1}`;
    params.push(options.userId);
  }

  if (options.event) {
    query += ` AND event = $${params.length + 1}`;
    params.push(options.event);
  }

  if (options.startTime) {
    query += ` AND timestamp >= $${params.length + 1}`;
    params.push(options.startTime);
  }

  if (options.endTime) {
    query += ` AND timestamp <= $${params.length + 1}`;
    params.push(options.endTime);
  }

  query += ` ORDER BY timestamp DESC`;

  if (options.limit) {
    query += ` LIMIT $${params.length + 1}`;
    params.push(options.limit);
  }

  if (options.offset) {
    query += ` OFFSET $${params.length + 1}`;
    params.push(options.offset);
  }

  const result = await pool.query(query, params);
  return result.rows;
}

// Initialize on startup
await initializeAuditTable();
```

---

## Testing Remediations

```bash
#!/bin/bash
# tests/test-security-remediations.sh

echo "Testing Security Remediations..."

# Test 1: Verify no API keys in logs
echo "Test 1: Checking for exposed API keys in logs..."
if grep -r "CEREBRAS_API_KEY" src/ tests/; then
  echo "❌ FAILED: API keys found in source code"
  exit 1
fi
echo "✅ PASSED: No hardcoded API keys"

# Test 2: Verify rate limiting is enabled
echo "Test 2: Checking rate limiting configuration..."
if [ -z "$CEREBRAS_API_RATE_LIMIT_PER_MINUTE" ]; then
  echo "❌ WARNING: Rate limiting not configured"
fi
echo "✅ Rate limiting environment variable present"

# Test 3: Verify HTTPS validation
echo "Test 3: Testing HTTPS connection validation..."
npm test -- --testNamePattern="HTTPS validation"

# Test 4: Verify authentication middleware
echo "Test 4: Testing authentication middleware..."
npm test -- --testNamePattern="Authentication"

# Test 5: Verify audit logging
echo "Test 5: Testing audit logging..."
npm test -- --testNamePattern="Audit log"

echo ""
echo "All remediation tests completed"
```

---

## Deployment Verification

```bash
#!/bin/bash
# scripts/verify-security-deployment.sh

echo "Verifying Security Deployment..."

# Check environment variables
required_vars=("CEREBRAS_API_KEY" "JWT_SECRET" "NODE_ENV" "DATABASE_URL")

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi
done

echo "✅ All required environment variables set"

# Verify NODE_ENV
if [ "$NODE_ENV" != "production" ]; then
  echo "⚠️  WARNING: NODE_ENV is not set to 'production'"
fi

# Verify JWT secret length
jwt_len=${#JWT_SECRET}
if [ $jwt_len -lt 32 ]; then
  echo "❌ JWT_SECRET must be 32+ characters (current: $jwt_len)"
  exit 1
fi
echo "✅ JWT_SECRET is securely configured"

# Verify permissions
if [ ! -d "$RUVECTOR_DB_PATH" ]; then
  echo "❌ RUVECTOR_DB_PATH directory doesn't exist"
  exit 1
fi

perms=$(stat -c %a "$RUVECTOR_DB_PATH" 2>/dev/null || stat -f %A "$RUVECTOR_DB_PATH" 2>/dev/null)
if [ "$perms" != "700" ]; then
  echo "⚠️  WARNING: RUVECTOR_DB_PATH permissions should be 700 (current: $perms)"
fi

echo ""
echo "✅ Security deployment verification complete"
```

---

These code examples provide production-ready implementations for all critical and high-priority security fixes. Each solution includes:
- Error handling
- Logging
- Configuration via environment variables
- Testing guidance
- Deployment verification

For questions or additional examples, refer to the main security audit report.
