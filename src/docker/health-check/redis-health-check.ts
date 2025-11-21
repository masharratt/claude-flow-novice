/**
 * Redis Health Check Module
 * Migrated from: docker/redis-health-check.sh
 *
 * Provides type-safe Redis health checking with password security
 * SECURITY: Never exposes passwords in command-line arguments
 */

import { spawnSync } from 'child_process';

/**
 * Configuration for Redis health check
 */
export interface RedisHealthCheckConfig {
  host?: string;
  port?: number;
  password?: string;
}

/**
 * Result of a health check operation
 */
export interface HealthCheckResult {
  success: boolean;
  message?: string;
  error?: string;
  exitCode: number;
  timestamp: Date;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Retry result with attempt tracking
 */
export interface RetryResult extends HealthCheckResult {
  attempts: number;
}

/**
 * Redis Health Check Class
 * Safely checks Redis connectivity without exposing credentials
 */
export class RedisHealthCheck {
  readonly host: string;
  readonly port: number;
  password: string;

  constructor(config: RedisHealthCheckConfig = {}) {
    // Load from explicit config, then environment variables
    this.host = config.host || process.env.CFN_REDIS_HOST || process.env.REDIS_HOST || 'cfn-redis';

    const portStr = config.port !== undefined ? String(config.port) :
      (process.env.CFN_REDIS_PORT || process.env.REDIS_PORT || '6379');
    this.port = parseInt(portStr, 10);

    // Password from explicit config, CFN_REDIS_PASSWORD, or REDIS_PASSWORD
    this.password = config.password ||
      process.env.CFN_REDIS_PASSWORD ||
      process.env.REDIS_PASSWORD ||
      '';
  }

  /**
   * Perform a single health check
   * SECURITY: Password is passed via environment variable, not command-line args
   */
  async check(): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const result = spawnSync('redis-cli', [
        '-h', this.host,
        '-p', String(this.port),
        'ping'
      ], {
        // SECURITY: Pass password via environment to avoid command-line exposure
        env: {
          ...process.env,
          ...(this.password && { REDISCLI_AUTH: this.password })
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000, // 5 second timeout
      });

      const success = result.status === 0;
      const stdout = result.stdout?.toString() || '';
      const stderr = result.stderr?.toString() || '';

      resolve({
        success,
        message: success ? stdout.trim() : undefined,
        error: !success ? `Redis health check failed: ${stderr || 'Unknown error'}` : undefined,
        exitCode: result.status !== null && result.status !== undefined ? result.status : 1,
        timestamp: new Date(),
      });
    });
  }

  /**
   * Perform health check with retry logic
   */
  async checkWithRetry(config: RetryConfig = {}): Promise<RetryResult> {
    const maxAttempts = config.maxAttempts || 3;
    const delayMs = config.delayMs || 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.check();

      if (result.success) {
        return {
          ...result,
          attempts: attempt,
        };
      }

      // Don't delay after final attempt
      if (attempt < maxAttempts) {
        await this.delay(delayMs);
      }
    }

    // All attempts failed
    return {
      success: false,
      error: `Redis health check failed after ${maxAttempts} attempts`,
      exitCode: 1,
      timestamp: new Date(),
      attempts: maxAttempts,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for immediate health check
 */
export async function checkRedisHealth(config?: RedisHealthCheckConfig): Promise<HealthCheckResult> {
  const checker = new RedisHealthCheck(config);
  return checker.check();
}

/**
 * Convenience function for health check with retry
 */
export async function checkRedisHealthWithRetry(
  config?: RedisHealthCheckConfig,
  retryConfig?: RetryConfig
): Promise<RetryResult> {
  const checker = new RedisHealthCheck(config);
  return checker.checkWithRetry(retryConfig);
}
