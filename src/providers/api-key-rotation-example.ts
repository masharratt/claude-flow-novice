/**
 * API Key Rotation Integration Example
 *
 * Demonstrates how to integrate APIKeyRotator with existing provider infrastructure.
 */

import { APIKeyRotator, APIKeyRotatorOptions } from './api-key-rotator.js';
import { RedisClient } from '../dashboard/RedisClient.js';
import { ILogger } from '../core/logger.js';

/**
 * Example: Initialize API key rotator with environment variables
 */
export async function initializeAPIKeyRotator(
  redis: RedisClient,
  logger: ILogger
): Promise<APIKeyRotator> {
  // Load API keys from environment (comma-separated)
  const apiKeysEnv = process.env.ZAI_API_KEYS || process.env.Z_AI_API_KEY;

  if (!apiKeysEnv) {
    throw new Error('No API keys configured. Set ZAI_API_KEYS environment variable (comma-separated).');
  }

  const apiKeys = apiKeysEnv.split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) {
    throw new Error('At least one valid API key is required');
  }

  // Configuration
  const options: APIKeyRotatorOptions = {
    apiKeys,
    redis,
    logger,
    rateLimitThreshold: parseInt(process.env.ZAI_RATE_LIMIT || '100', 10),
    backoffDelays: (process.env.ZAI_BACKOFF_DELAYS || '1000,2000,4000,8000')
      .split(',')
      .map(d => parseInt(d, 10)),
    baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/v1',
  };

  const rotator = new APIKeyRotator(options);

  logger.info('API key rotator initialized', {
    keyCount: apiKeys.length,
    rateLimitThreshold: options.rateLimitThreshold,
    backoffDelays: options.backoffDelays,
  });

  // Listen to rate limit events
  rotator.on('rate_limit', (event) => {
    logger.warn('API key rate limited', {
      keyHash: event.keyHash,
      rateLimitUntil: event.rateLimitUntil,
      retryAfter: event.retryAfter,
    });
  });

  // Listen to request success events
  rotator.on('request:success', (event) => {
    logger.debug('API request succeeded', {
      keyHash: event.keyHash,
      duration: event.duration,
      attempts: event.attempts,
    });
  });

  return rotator;
}

/**
 * Example: Usage in Z.ai Provider
 */
export class ZaiProviderWithRotation {
  private rotator: APIKeyRotator;
  private logger: ILogger;

  constructor(rotator: APIKeyRotator, logger: ILogger) {
    this.rotator = rotator;
    this.logger = logger;
  }

  /**
   * Make API request with automatic rotation
   */
  async complete(messages: Array<{ role: string; content: string }>) {
    try {
      const response = await this.rotator.makeRequest({
        model: 'haiku',
        messages,
        temperature: 0.7,
        max_tokens: 8192,
      });

      return {
        content: response.choices[0].message.content,
        usage: response.usage,
      };
    } catch (error: any) {
      this.logger.error('API request failed', {
        error: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Get current usage statistics
   */
  getUsageStats() {
    return this.rotator.getUsageStats();
  }

  /**
   * Cleanup
   */
  destroy() {
    this.rotator.destroy();
  }
}

/**
 * Example: Monitoring usage and setting alerts
 */
export function monitorAPIKeyUsage(rotator: APIKeyRotator, logger: ILogger) {
  // Check usage every 30 seconds
  const interval = setInterval(() => {
    const stats = rotator.getUsageStats();

    // Log current state
    logger.info('API key usage statistics', {
      totalKeys: stats.totalKeys,
      activeKeys: stats.activeKeys,
      rateLimitedKeys: stats.rateLimitedKeys,
      totalRequests: stats.totalRequests,
    });

    // Alert if all keys at 90%+ utilization
    const minUtilization = Math.min(...stats.usagePerKey.map(k => k.utilization));
    if (minUtilization > 90) {
      logger.error('CRITICAL: All API keys at >90% utilization', {
        recommendation: 'Add more API keys or reduce parallelism',
        stats,
      });
    }

    // Alert if multiple keys rate limited
    if (stats.rateLimitedKeys >= stats.totalKeys / 2) {
      logger.warn('WARNING: Multiple API keys rate limited', {
        rateLimitedKeys: stats.rateLimitedKeys,
        totalKeys: stats.totalKeys,
      });
    }
  }, 30000);

  return () => clearInterval(interval);
}

/**
 * Example: Calculate safe parallel sprint count
 */
export function calculateSafeParallelSprints(
  rotator: APIKeyRotator,
  requestsPerSprintPerMin: number = 20
): number {
  const stats = rotator.getUsageStats();
  const maxRequestsPerMin = stats.activeKeys * 100; // Assuming 100 req/min per key
  const maxSafeSprints = Math.floor(maxRequestsPerMin / requestsPerSprintPerMin);

  return Math.max(1, maxSafeSprints); // At least 1 sprint
}

/**
 * Example: Environment variable configuration template
 */
export const CONFIG_TEMPLATE = `
# API Key Rotation Configuration

# Multiple API keys (comma-separated)
ZAI_API_KEYS="key-1,key-2,key-3"

# Rate limit per key (requests per minute)
ZAI_RATE_LIMIT=100

# Exponential backoff delays (milliseconds, comma-separated)
ZAI_BACKOFF_DELAYS="1000,2000,4000,8000"

# API base URL (optional)
ZAI_BASE_URL="https://api.z.ai/v1"

# Example: Calculate safe parallel sprints
# With 3 keys @ 100 req/min = 300 req/min total capacity
# If each sprint uses ~20 req/min → 300 / 20 = 15 parallel sprints safe
`;
