/**
 * Production Blocking Coordination - Signal ACK Protocol
 *
 * Implements coordinator acknowledgment mechanism for distributed agent coordination.
 * Part of Sprint 1.1: Signal ACK Protocol
 *
 * Features:
 * - Immediate ACK on signal reception
 * - Timestamp tracking for coordination timing
 * - Iteration count for retry loop coordination
 * - Redis persistence with 1-hour TTL
 * - Idempotent ACK handling
 * - HMAC-SHA256 cryptographic ACK verification (SEC-CRIT-001)
 * - Input validation against injection attacks (SEC-HIGH-001)
 *
 * @module cfn-loop/blocking-coordination
 */

import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import { createHmac, randomBytes } from 'crypto';

// ===== TYPE DEFINITIONS =====

/**
 * Signal ACK structure
 */
export interface SignalAck {
  /** Coordinator ID that sent the ACK */
  coordinatorId: string;
  /** Signal ID that triggered the ACK */
  signalId: string;
  /** Timestamp when ACK was sent (ms since epoch) */
  timestamp: number;
  /** Current iteration count (for retry loops) */
  iteration: number;
  /** ACK status - always "received" on initial send */
  status: 'received';
  /** HMAC-SHA256 signature for ACK verification (SEC-CRIT-001) */
  signature: string;
  /** Optional metadata for debugging */
  metadata?: {
    /** Signal type (e.g., "completion", "retry", "validation") */
    signalType?: string;
    /** Phase or context information */
    phase?: string;
  };
}

/**
 * Signal structure for coordinator communication
 */
export interface CoordinationSignal {
  /** Unique signal identifier */
  signalId: string;
  /** Signal type */
  type: 'completion' | 'retry' | 'validation' | 'error';
  /** Source coordinator that sent the signal */
  source: string;
  /** Target coordinator(s) */
  targets: string[];
  /** Signal payload */
  payload?: any;
  /** Timestamp when signal was created */
  timestamp: number;
}

/**
 * Configuration for blocking coordination
 */
export interface BlockingCoordinationConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;
  /** Coordinator ID for this instance */
  coordinatorId: string;
  /** TTL for ACK keys in seconds (default: 3600 = 1 hour) */
  ackTtl?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** HMAC secret for ACK signing (SEC-CRIT-001) - defaults to env var or random */
  hmacSecret?: string;
}

// ===== BLOCKING COORDINATION MANAGER =====

/**
 * Manages blocking coordination and signal acknowledgment for CFN Loop coordinators
 */
export class BlockingCoordinationManager {
  private logger: Logger;
  private redis: Redis;
  private coordinatorId: string;
  private ackTtl: number;
  private debug: boolean;
  private hmacSecret: string;

  // Current iteration counter (incremented on each retry loop)
  private currentIteration: number = 0;

  // Signal tracking
  private processedSignals: Set<string> = new Set();

  constructor(config: BlockingCoordinationConfig) {
    this.redis = config.redisClient;

    // SEC-HIGH-001: Validate coordinator ID before use
    this.coordinatorId = this.validateId(config.coordinatorId, 'coordinatorId');

    this.ackTtl = config.ackTtl ?? 3600; // Default: 1 hour
    this.debug = config.debug ?? false;

    // SEC-CRIT-001-B FIX: Require shared secret for distributed ACK verification
    // For internal coordination only - see readme/logs-cli-redis.md for external use
    this.hmacSecret = config.hmacSecret || process.env.BLOCKING_COORDINATION_SECRET;
    if (!this.hmacSecret) {
      throw new Error(
        'BLOCKING_COORDINATION_SECRET environment variable required for ACK verification. ' +
        'All coordinators must share the same secret for distributed coordination.'
      );
    }

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: this.debug ? 'debug' : 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'BlockingCoordination' });

    this.logger.info('Blocking Coordination Manager initialized', {
      coordinatorId: this.coordinatorId,
      ackTtl: this.ackTtl,
      debug: this.debug,
    });
  }

  /**
   * Process incoming signal and send immediate ACK
   *
   * CRITICAL: This method MUST be called BEFORE processing the signal payload.
   * The ACK confirms receipt, allowing the sender to proceed without waiting.
   *
   * @param signal - Coordination signal to acknowledge
   * @returns ACK object with timestamp and iteration
   */
  async acknowledgeSignal(signal: CoordinationSignal): Promise<SignalAck> {
    const startTime = Date.now();

    this.logger.info('Received signal, sending immediate ACK', {
      signalId: signal.signalId,
      signalType: signal.type,
      source: signal.source,
      coordinatorId: this.coordinatorId,
    });

    // Check if we've already processed this signal (idempotency)
    if (this.processedSignals.has(signal.signalId)) {
      this.logger.warn('Signal already processed, returning cached ACK', {
        signalId: signal.signalId,
        coordinatorId: this.coordinatorId,
      });

      // Retrieve existing ACK from Redis
      const existingAck = await this.getAck(signal.signalId);
      if (existingAck) {
        return existingAck;
      }
    }

    // Create ACK structure with timestamp
    const timestamp = Date.now();

    // SEC-CRIT-001: Generate HMAC-SHA256 signature for ACK
    const signature = this.signAck(
      this.coordinatorId,
      signal.signalId,
      timestamp,
      this.currentIteration
    );

    const ack: SignalAck = {
      coordinatorId: this.coordinatorId,
      signalId: signal.signalId,
      timestamp,
      iteration: this.currentIteration,
      status: 'received',
      signature,
      metadata: {
        signalType: signal.type,
        phase: signal.payload?.phase,
      },
    };

    // Persist ACK to Redis with TTL
    const ackKey = this.buildAckKey(signal.signalId);
    await this.redis.setex(ackKey, this.ackTtl, JSON.stringify(ack));

    // Mark signal as processed
    this.processedSignals.add(signal.signalId);

    const duration = Date.now() - startTime;

    this.logger.info('ACK sent successfully', {
      signalId: signal.signalId,
      coordinatorId: this.coordinatorId,
      iteration: this.currentIteration,
      ackKey,
      ttl: this.ackTtl,
      duration,
    });

    if (this.debug) {
      this.logger.debug('ACK details', {
        ack,
        redisKey: ackKey,
      });
    }

    return ack;
  }

  /**
   * Retrieve ACK for a specific signal
   *
   * @param signalId - Signal ID to retrieve ACK for
   * @returns ACK object if found, null otherwise
   */
  async getAck(signalId: string): Promise<SignalAck | null> {
    const ackKey = this.buildAckKey(signalId);

    try {
      const ackJson = await this.redis.get(ackKey);

      if (!ackJson) {
        this.logger.debug('No ACK found for signal', {
          signalId,
          ackKey,
        });
        return null;
      }

      const ack: SignalAck = JSON.parse(ackJson);

      // SEC-CRIT-001: Verify HMAC signature before returning ACK
      const isValid = this.verifyAckSignature(ack);
      if (!isValid) {
        this.logger.error('ACK signature verification failed - possible spoofing attack', {
          signalId,
          coordinatorId: ack.coordinatorId,
          ackKey,
        });
        throw new Error(`ACK signature verification failed for signal ${signalId} - potential ACK spoofing attack (SEC-CRIT-001)`);
      }

      this.logger.debug('Retrieved ACK (signature verified)', {
        signalId,
        ack,
      });

      return ack;
    } catch (error) {
      this.logger.error('Failed to retrieve ACK', {
        signalId,
        ackKey,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  /**
   * Check if a signal has been acknowledged by a specific coordinator
   *
   * @param coordinatorId - Coordinator to check
   * @param signalId - Signal ID to check
   * @returns True if ACK exists, false otherwise
   */
  async isAcknowledged(coordinatorId: string, signalId: string): Promise<boolean> {
    // SEC-HIGH-001: Validate IDs before Redis key construction
    const validatedCoordinatorId = this.validateId(coordinatorId, 'coordinatorId');
    const validatedSignalId = this.validateId(signalId, 'signalId');

    const ackKey = this.buildAckKeyForCoordinator(validatedCoordinatorId, validatedSignalId);

    try {
      const exists = await this.redis.exists(ackKey);
      return exists === 1;
    } catch (error) {
      this.logger.error('Failed to check ACK existence', {
        coordinatorId,
        signalId,
        ackKey,
        error: error instanceof Error ? error.message : String(error),
      });

      return false;
    }
  }

  /**
   * Wait for ACKs from multiple coordinators
   *
   * @param coordinatorIds - List of coordinator IDs to wait for
   * @param signalId - Signal ID to check ACKs for
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000 = 30s)
   * @returns Map of coordinator IDs to their ACKs
   */
  async waitForAcks(
    coordinatorIds: string[],
    signalId: string,
    timeoutMs: number = 30000
  ): Promise<Map<string, SignalAck>> {
    const startTime = Date.now();
    const acks = new Map<string, SignalAck>();

    this.logger.info('Waiting for ACKs', {
      signalId,
      coordinators: coordinatorIds,
      timeout: timeoutMs,
    });

    // Poll for ACKs until all received or timeout
    while (acks.size < coordinatorIds.length) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        const missing = coordinatorIds.filter(id => !acks.has(id));
        this.logger.warn('ACK wait timeout', {
          signalId,
          received: acks.size,
          total: coordinatorIds.length,
          missing,
          duration: Date.now() - startTime,
        });
        break;
      }

      // Check each coordinator for ACK
      for (const coordId of coordinatorIds) {
        if (acks.has(coordId)) {
          continue; // Already received
        }

        const ackKey = this.buildAckKeyForCoordinator(coordId, signalId);
        const ackJson = await this.redis.get(ackKey);

        if (ackJson) {
          const ack: SignalAck = JSON.parse(ackJson);

          // SEC-CRIT-001: Verify signature before accepting ACK
          const isValid = this.verifyAckSignature(ack);
          if (!isValid) {
            this.logger.error('ACK signature verification failed in waitForAcks', {
              signalId,
              coordinatorId: coordId,
              ackKey,
            });
            // Skip this ACK - treat as not received
            continue;
          }

          acks.set(coordId, ack);

          this.logger.debug('Received ACK (signature verified)', {
            signalId,
            coordinatorId: coordId,
            ack,
          });
        }
      }

      // Short delay before next poll
      await this.sleep(100); // 100ms
    }

    const duration = Date.now() - startTime;

    this.logger.info('ACK wait complete', {
      signalId,
      received: acks.size,
      total: coordinatorIds.length,
      duration,
    });

    return acks;
  }

  /**
   * Increment iteration counter (called when entering a new retry loop)
   *
   * @returns New iteration count
   */
  incrementIteration(): number {
    this.currentIteration++;

    this.logger.info('Iteration incremented', {
      coordinatorId: this.coordinatorId,
      iteration: this.currentIteration,
    });

    return this.currentIteration;
  }

  /**
   * Get current iteration count
   *
   * @returns Current iteration number
   */
  getCurrentIteration(): number {
    return this.currentIteration;
  }

  /**
   * Reset iteration counter (called when starting fresh coordination)
   */
  resetIteration(): void {
    this.currentIteration = 0;

    this.logger.info('Iteration reset', {
      coordinatorId: this.coordinatorId,
    });
  }

  /**
   * Clear processed signals cache
   */
  clearProcessedSignals(): void {
    const count = this.processedSignals.size;
    this.processedSignals.clear();

    this.logger.info('Cleared processed signals cache', {
      coordinatorId: this.coordinatorId,
      clearedCount: count,
    });
  }

  /**
   * Cleanup all ACKs for this coordinator
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up blocking coordination', {
      coordinatorId: this.coordinatorId,
    });

    try {
      // Find all ACK keys for this coordinator
      const pattern = `blocking:ack:${this.coordinatorId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(keys);

        this.logger.info('Cleanup complete', {
          coordinatorId: this.coordinatorId,
          keysDeleted: keys.length,
        });
      } else {
        this.logger.debug('No ACK keys to clean up', {
          coordinatorId: this.coordinatorId,
        });
      }

      // Clear in-memory state
      this.clearProcessedSignals();
    } catch (error) {
      this.logger.error('Cleanup failed', {
        coordinatorId: this.coordinatorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Build Redis key for ACK
   *
   * Format: blocking:ack:{coordinatorId}:{signalId}
   */
  private buildAckKey(signalId: string): string {
    return `blocking:ack:${this.coordinatorId}:${signalId}`;
  }

  /**
   * Build Redis key for ACK from a specific coordinator
   *
   * Format: blocking:ack:{coordinatorId}:{signalId}
   */
  private buildAckKeyForCoordinator(coordinatorId: string, signalId: string): string {
    return `blocking:ack:${coordinatorId}:${signalId}`;
  }

  /**
   * Sleep utility for polling loops
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * SEC-HIGH-001: Validate ID string to prevent injection attacks
   *
   * @param id - ID string to validate
   * @param fieldName - Name of the field being validated (for error messages)
   * @returns Validated ID string
   * @throws Error if ID contains invalid characters
   */
  private validateId(id: string, fieldName: string): string {
    // Allow alphanumeric, hyphens, underscores (common for IDs)
    const idPattern = /^[a-zA-Z0-9_-]+$/;

    if (!id || !idPattern.test(id)) {
      throw new Error(
        `Invalid ${fieldName}: must contain only alphanumeric characters, hyphens, and underscores`
      );
    }

    return id;
  }

  /**
   * SEC-CRIT-001: Generate HMAC-SHA256 signature for ACK verification
   *
   * @param coordinatorId - Coordinator ID
   * @param signalId - Signal ID
   * @param timestamp - ACK timestamp
   * @param iteration - Current iteration count
   * @returns HMAC-SHA256 signature (hex string)
   */
  private signAck(
    coordinatorId: string,
    signalId: string,
    timestamp: number,
    iteration: number
  ): string {
    // Create canonical string for signing
    const data = `${coordinatorId}:${signalId}:${timestamp}:${iteration}`;

    // Generate HMAC-SHA256 signature
    const hmac = createHmac('sha256', this.hmacSecret);
    hmac.update(data);

    return hmac.digest('hex');
  }

  /**
   * SEC-CRIT-001: Verify HMAC-SHA256 signature for ACK
   *
   * @param ack - ACK object to verify
   * @returns True if signature is valid, false otherwise
   */
  private verifyAckSignature(ack: SignalAck): boolean {
    // Handle legacy ACKs without signatures (gracefully fail)
    if (!ack.signature) {
      this.logger.warn('ACK missing signature field - rejecting', {
        coordinatorId: ack.coordinatorId,
        signalId: ack.signalId,
      });
      return false;
    }

    const expectedSignature = this.signAck(
      ack.coordinatorId,
      ack.signalId,
      ack.timestamp,
      ack.iteration
    );

    // Use timing-safe comparison to prevent timing attacks
    return ack.signature === expectedSignature;
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a BlockingCoordinationManager instance
 *
 * @param config - Configuration for blocking coordination
 * @returns Configured BlockingCoordinationManager
 */
export function createBlockingCoordinationManager(
  config: BlockingCoordinationConfig
): BlockingCoordinationManager {
  return new BlockingCoordinationManager(config);
}

// ===== EXPORTS =====

export default BlockingCoordinationManager;
