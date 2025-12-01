/**
 * Mode Detection for CFN Loop Agents
 * 
 * Detects whether an agent is running in Task Mode or CLI Mode,
 * and whether Redis operations are safe to execute.
 * 
 * CRITICAL: Task Mode agents should NOT use Redis (per CLAUDE.md).
 * This module enforces that distinction at runtime.
 */

import type { ExecutionMode, ModeDetection, Logger } from './types';

/**
 * Detect execution mode and Redis availability
 * 
 * @param logger Optional logger for diagnostics
 * @returns ModeDetection with full context
 */
export async function detectMode(logger?: Logger): Promise<ModeDetection> {
  // Check environment variables
  const cfnMode = process.env.CFN_MODE?.toLowerCase();
  const taskId = process.env.TASK_ID;
  const agentId = process.env.AGENT_ID;
  
  // Check Redis availability (quick test)
  const redisAvailable = await checkRedisAvailability();
  
  // Determine mode
  let mode: ExecutionMode = 'unknown';
  let canUseRedis = false;
  let reason = '';
  
  // Explicit CFN_MODE takes precedence
  if (cfnMode === 'task') {
    mode = 'task';
    canUseRedis = false;
    reason = 'CFN_MODE=task (explicit Task Mode - Redis operations disabled)';
  } else if (cfnMode === 'cli') {
    mode = 'cli';
    canUseRedis = redisAvailable;
    reason = redisAvailable 
      ? 'CFN_MODE=cli (CLI Mode - Redis operations enabled)'
      : 'CFN_MODE=cli but Redis unavailable (Redis operations disabled)';
  } 
  // Fallback: Infer mode from environment variables
  else if (taskId && agentId) {
    mode = 'cli';
    canUseRedis = redisAvailable;
    reason = redisAvailable
      ? 'TASK_ID and AGENT_ID present, Redis available (inferred CLI Mode)'
      : 'TASK_ID and AGENT_ID present but Redis unavailable (Redis operations disabled)';
  } else {
    mode = 'task';
    canUseRedis = false;
    reason = 'No TASK_ID or AGENT_ID (inferred Task Mode - Redis operations disabled)';
  }
  
  const detection: ModeDetection = {
    mode,
    redisAvailable,
    taskIdPresent: !!taskId,
    agentIdPresent: !!agentId,
    canUseRedis,
    reason
  };
  
  // Log detection result
  if (logger) {
    logger.info('Mode detection complete', detection as unknown as Record<string, unknown>);
    
    if (mode === 'task') {
      logger.info('⚠️  Task Mode detected: Redis operations will be stubbed');
      logger.info('💡 Task Mode agents return results directly to Main Chat');
      logger.info('🔧 Redis coordination is only for CLI Mode agents');
    } else if (mode === 'cli' && !redisAvailable) {
      logger.warn('⚠️  CLI Mode but Redis unavailable: Operations will soft-fail');
      logger.warn('💡 Check Redis connection: REDIS_HOST, REDIS_PORT');
    } else if (mode === 'cli' && redisAvailable) {
      logger.info('✅ CLI Mode with Redis: Full coordination available');
    }
  }
  
  return detection;
}

/**
 * Check if Redis is available
 * 
 * Quick connectivity test with 1 second timeout.
 * Returns false instead of throwing errors.
 */
async function checkRedisAvailability(): Promise<boolean> {
  try {
    // Dynamic import to avoid loading Redis in Task Mode
    const Redis = (await import('ioredis')).default;
    
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || process.env.CFN_REDIS_PASSWORD;
    
    const client = new Redis({
      host,
      port,
      password: password || undefined,
      connectTimeout: 1000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null, // Don't retry
      lazyConnect: true
    });
    
    try {
      await client.connect();
      const result = await client.ping();
      await client.quit();
      return result === 'PONG';
    } catch {
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      return false;
    }
  } catch {
    // Redis module not available or connection failed
    return false;
  }
}

/**
 * Console logger implementation for mode detection
 * 
 * Simple console-based logger that doesn't require external dependencies.
 */
export class ConsoleLogger implements Logger {
  constructor(private prefix: string = '[CFN-Redis]') {}
  
  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.DEBUG) {
      console.log(`${this.prefix} DEBUG: ${message}`, context || '');
    }
  }
  
  info(message: string, context?: Record<string, unknown>): void {
    console.log(`${this.prefix} ${message}`, context || '');
  }
  
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(`${this.prefix} ⚠️  ${message}`, context || '');
  }
  
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    console.error(`${this.prefix} ❌ ${message}`, error?.message || '', context || '');
  }
}
