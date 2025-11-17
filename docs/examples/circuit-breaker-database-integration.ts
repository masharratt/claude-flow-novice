/**
 * Circuit Breaker Integration Examples for Database Adapters
 *
 * Demonstrates how to integrate circuit breaker pattern with database adapters
 * for system-wide resilience and graceful degradation.
 */

import { CircuitBreakerRegistry, CircuitOpenError } from '../../src/lib/circuit-breaker';
import { PostgresAdapter } from '../../src/lib/database-service/postgres-adapter';
import { SQLiteAdapter } from '../../src/lib/database-service/sqlite-adapter';
import { RedisAdapter } from '../../src/lib/database-service/redis-adapter';

/**
 * Example 1: PostgreSQL Adapter with Circuit Breaker
 *
 * Protects against PostgreSQL connection failures and query timeouts.
 */
export class ResilientPostgresAdapter extends PostgresAdapter {
  private breaker = CircuitBreakerRegistry.getOrCreate('postgres-db', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000, // 30 seconds
  });

  /**
   * Execute query with circuit breaker protection
   */
  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.breaker.execute(
      async () => {
        // Execute actual query via parent class
        return await super.query<T>(sql, params);
      },
      async () => {
        // Fallback: throw user-friendly error
        throw new Error(
          'Database temporarily unavailable. Please try again in a few moments.'
        );
      }
    );
  }

  /**
   * Connect with circuit breaker protection
   */
  async connect(): Promise<void> {
    return this.breaker.execute(
      async () => await super.connect(),
      async () => {
        throw new Error('Unable to establish database connection');
      }
    );
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.breaker.execute(async () => {
        await this.query('SELECT 1', []);
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Example 2: SQLite Adapter with Circuit Breaker
 *
 * Protects against file system failures and lock timeouts.
 */
export class ResilientSQLiteAdapter extends SQLiteAdapter {
  private breaker = CircuitBreakerRegistry.getOrCreate('sqlite-db', {
    failureThreshold: 3, // Fail fast for file-based DB
    successThreshold: 2,
    timeout: 10000, // 10 seconds
  });

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.breaker.execute(
      async () => await super.query<T>(sql, params),
      async () => {
        // Fallback: return empty result for read queries
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
          return [] as T[];
        }
        throw new Error('SQLite database unavailable');
      }
    );
  }
}

/**
 * Example 3: Redis Adapter with Circuit Breaker
 *
 * Protects against Redis connection failures with graceful cache degradation.
 */
export class ResilientRedisAdapter extends RedisAdapter {
  private breaker = CircuitBreakerRegistry.getOrCreate('redis-cache', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 5000, // 5 seconds - quick recovery for cache
  });

  async get<T>(key: string): Promise<T | null> {
    return this.breaker.execute(
      async () => await super.get<T>(key),
      async () => {
        // Fallback: return null (cache miss)
        // Application should fall back to primary data source
        return null;
      }
    );
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    return this.breaker.execute(
      async () => await super.set(key, value, ttl),
      async () => {
        // Fallback: silently fail (cache write is not critical)
        console.warn('Redis unavailable, cache write skipped:', key);
      }
    );
  }
}

/**
 * Example 4: Multi-Database Service with Circuit Breakers
 *
 * Demonstrates coordinated circuit breakers for multi-database operations.
 */
export class MultiDatabaseService {
  constructor(
    private postgres: ResilientPostgresAdapter,
    private redis: ResilientRedisAdapter
  ) {}

  /**
   * Get user data with cache and circuit breaker protection
   */
  async getUserData(userId: string) {
    // Try cache first (with circuit breaker)
    try {
      const cached = await this.redis.get<any>(`user:${userId}`);
      if (cached) {
        return cached;
      }
    } catch (error) {
      // Redis circuit may be open - continue to database
      console.warn('Cache unavailable, falling back to database');
    }

    // Fetch from database (with circuit breaker)
    try {
      const user = await this.postgres.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      // Try to cache result (best effort)
      try {
        await this.redis.set(`user:${userId}`, user[0], 300);
      } catch (error) {
        // Cache write failed - not critical
      }

      return user[0];
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        throw new Error('User service temporarily unavailable');
      }
      throw error;
    }
  }

  /**
   * Health check for all services
   */
  async healthCheck() {
    const health = CircuitBreakerRegistry.getHealthStatus();
    return {
      postgres: health['postgres-db'] ?? true,
      redis: health['redis-cache'] ?? true,
      overall: Object.values(health).every((h) => h),
    };
  }
}

/**
 * Example 5: Transaction with Circuit Breaker
 *
 * Demonstrates transaction handling with circuit breaker protection.
 */
export class TransactionService {
  constructor(private postgres: ResilientPostgresAdapter) {}

  async executeTransaction<T>(
    operations: (adapter: ResilientPostgresAdapter) => Promise<T>
  ): Promise<T> {
    const breaker = CircuitBreakerRegistry.get('postgres-db');

    if (breaker && !breaker.isHealthy()) {
      throw new Error('Database circuit is open - transactions temporarily disabled');
    }

    return breaker!.execute(
      async () => {
        // Begin transaction
        await this.postgres.query('BEGIN', []);

        try {
          const result = await operations(this.postgres);
          await this.postgres.query('COMMIT', []);
          return result;
        } catch (error) {
          await this.postgres.query('ROLLBACK', []);
          throw error;
        }
      },
      async () => {
        throw new Error('Transaction failed - database unavailable');
      }
    );
  }
}

/**
 * Example 6: Monitoring Dashboard
 *
 * Demonstrates how to build a monitoring dashboard for circuit breakers.
 */
export class CircuitBreakerMonitor {
  /**
   * Get comprehensive system health report
   */
  getHealthReport() {
    const allMetrics = CircuitBreakerRegistry.getAllMetrics();
    const healthStatus = CircuitBreakerRegistry.getHealthStatus();

    return {
      timestamp: new Date().toISOString(),
      summary: {
        total: Object.keys(allMetrics).length,
        healthy: Object.values(healthStatus).filter((h) => h).length,
        unhealthy: Object.values(healthStatus).filter((h) => !h).length,
      },
      services: Object.entries(allMetrics).map(([name, metrics]) => ({
        name,
        healthy: healthStatus[name],
        state: metrics.state,
        failures: metrics.failures,
        successes: metrics.successes,
        totalCalls: metrics.totalCalls || 0,
        totalSuccesses: metrics.totalSuccesses || 0,
        totalFailures: metrics.totalFailures || 0,
        totalRejected: metrics.totalRejected || 0,
        lastFailure: metrics.lastFailureTime?.toISOString(),
        lastSuccess: metrics.lastSuccessTime?.toISOString(),
        openedAt: metrics.openedAt?.toISOString(),
      })),
    };
  }

  /**
   * Get alerts for unhealthy services
   */
  getAlerts() {
    const healthStatus = CircuitBreakerRegistry.getHealthStatus();
    const alerts: Array<{ service: string; severity: string; message: string }> = [];

    Object.entries(healthStatus).forEach(([service, healthy]) => {
      if (!healthy) {
        const breaker = CircuitBreakerRegistry.get(service);
        const metrics = breaker?.getMetrics();

        alerts.push({
          service,
          severity: 'critical',
          message: `Circuit breaker OPEN for ${service} (state: ${metrics?.state}, failures: ${metrics?.failures})`,
        });
      }
    });

    return alerts;
  }

  /**
   * Auto-recovery check
   */
  async checkRecovery() {
    const allMetrics = CircuitBreakerRegistry.getAllMetrics();

    for (const [name, metrics] of Object.entries(allMetrics)) {
      if (metrics.state === 'HALF_OPEN') {
        console.log(`Service ${name} is testing recovery...`);
      } else if (metrics.state === 'OPEN' && metrics.openedAt) {
        const timeOpen = Date.now() - metrics.openedAt.getTime();
        console.log(`Service ${name} has been open for ${timeOpen}ms`);
      }
    }
  }
}

/**
 * Example 7: Express.js Middleware Integration
 *
 * Demonstrates HTTP endpoint for circuit breaker monitoring.
 */
export function createCircuitBreakerMiddleware() {
  const monitor = new CircuitBreakerMonitor();

  return {
    /**
     * Health check endpoint
     */
    healthCheck: (req: any, res: any) => {
      const health = monitor.getHealthReport();
      const status = health.summary.unhealthy > 0 ? 503 : 200;
      res.status(status).json(health);
    },

    /**
     * Alerts endpoint
     */
    alerts: (req: any, res: any) => {
      const alerts = monitor.getAlerts();
      res.json({
        count: alerts.length,
        alerts,
      });
    },

    /**
     * Metrics endpoint
     */
    metrics: (req: any, res: any) => {
      const allMetrics = CircuitBreakerRegistry.getAllMetrics();
      res.json(allMetrics);
    },

    /**
     * Manual control endpoint (admin only)
     */
    control: (req: any, res: any) => {
      const { service, action } = req.body;
      const breaker = CircuitBreakerRegistry.get(service);

      if (!breaker) {
        return res.status(404).json({ error: 'Service not found' });
      }

      if (action === 'open') {
        breaker.open();
      } else if (action === 'close') {
        breaker.close();
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      res.json({
        service,
        action,
        state: breaker.getState(),
      });
    },
  };
}

/**
 * Example Usage
 */
export async function exampleUsage() {
  // Setup adapters with circuit breakers
  const postgres = new ResilientPostgresAdapter({
    connectionString: process.env.DATABASE_URL!,
  });

  const redis = new ResilientRedisAdapter({
    connectionString: process.env.REDIS_URL!,
  });

  // Setup service
  const service = new MultiDatabaseService(postgres, redis);

  // Fetch user data (with automatic circuit breaker protection)
  try {
    const user = await service.getUserData('user123');
    console.log('User data:', user);
  } catch (error) {
    console.error('Failed to fetch user:', error);
  }

  // Check system health
  const health = await service.healthCheck();
  console.log('System health:', health);

  // Monitor circuit breakers
  const monitor = new CircuitBreakerMonitor();
  const report = monitor.getHealthReport();
  console.log('Health report:', JSON.stringify(report, null, 2));

  // Get alerts
  const alerts = monitor.getAlerts();
  if (alerts.length > 0) {
    console.warn('ALERTS:', alerts);
  }
}
