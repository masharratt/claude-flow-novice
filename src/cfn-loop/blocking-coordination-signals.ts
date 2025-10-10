/**
 * Blocking Coordination Signal Delivery Implementation
 *
 * Sprint 1.1: Signal ACK Protocol - Signal Delivery via Redis SETEX
 *
 * Implements atomic signal delivery with:
 * - Redis SETEX for 24h TTL persistence
 * - Idempotent signal handling for duplicates
 * - Structured signal format with metadata
 * - Input validation against Redis key injection (SEC-HIGH-001)
 *
 * Key Format: blocking:signal:{coordinatorId}
 * Value: JSON with { timestamp, senderId, iteration, type, payload }
 * TTL: 86400 seconds (24 hours)
 *
 * @module cfn-loop/blocking-coordination-signals
 */

import { createClient, RedisClientType } from 'redis';
import { Logger } from '../core/logger.js';

// ===== TYPE DEFINITIONS =====

export interface SignalPayload {
  timestamp: number;
  senderId: string;
  receiverId: string;
  iteration: number;
  type: SignalType;
  payload?: Record<string, any>;
  messageId: string; // For idempotency
}

export enum SignalType {
  COMPLETION = 'completion',
  RETRY_REQUEST = 'retry_request',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
  STATUS_UPDATE = 'status_update'
}

export interface SignalDeliveryResult {
  success: boolean;
  messageId: string;
  isDuplicate: boolean;
  timestamp: number;
  key: string;
}

export interface SignalReceiveResult {
  signal: SignalPayload | null;
  exists: boolean;
  key: string;
}

export interface BlockingCoordinationSignalsConfig {
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  redisDatabase?: number;
  signalTTL?: number; // TTL in seconds (default: 86400 = 24h)
  enableIdempotency?: boolean; // Enable duplicate detection (default: true)
  idempotencyTTL?: number; // Idempotency record TTL in seconds (default: 86400)
}

// ===== BLOCKING COORDINATION SIGNALS CLASS =====

export class BlockingCoordinationSignals {
  private logger: Logger;
  private config: Required<BlockingCoordinationSignalsConfig>;
  private redisClient: RedisClientType | null = null;
  private connected: boolean = false;

  // Statistics
  private stats = {
    signalsSent: 0,
    signalsReceived: 0,
    duplicatesDetected: 0,
    errors: 0,
  };

  constructor(config: BlockingCoordinationSignalsConfig = {}) {
    // Set defaults
    this.config = {
      redisHost: config.redisHost || process.env.REDIS_HOST || 'localhost',
      redisPort: config.redisPort || parseInt(process.env.REDIS_PORT || '6379'),
      redisPassword: config.redisPassword || process.env.REDIS_PASSWORD || undefined,
      redisDatabase: config.redisDatabase || parseInt(process.env.REDIS_DB || '0'),
      signalTTL: config.signalTTL ?? 86400, // 24 hours default
      enableIdempotency: config.enableIdempotency ?? true,
      idempotencyTTL: config.idempotencyTTL ?? 86400,
    };

    // Initialize logger
    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'BlockingCoordinationSignals' });

    this.logger.info('Blocking Coordination Signals initialized', {
      signalTTL: this.config.signalTTL,
      idempotencyEnabled: this.config.enableIdempotency,
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.connected && this.redisClient) {
      this.logger.warn('Redis already connected');
      return;
    }

    try {
      this.redisClient = createClient({
        socket: {
          host: this.config.redisHost,
          port: this.config.redisPort,
        },
        password: this.config.redisPassword,
        database: this.config.redisDatabase,
      });

      // Handle Redis events
      this.redisClient.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
        this.stats.errors++;
      });

      this.redisClient.on('connect', () => {
        this.logger.info('Redis client connected');
      });

      this.redisClient.on('ready', () => {
        this.logger.info('Redis client ready');
      });

      this.redisClient.on('end', () => {
        this.logger.info('Redis client disconnected');
        this.connected = false;
      });

      await this.redisClient.connect();
      this.connected = true;

      this.logger.info('Successfully connected to Redis', {
        host: this.config.redisHost,
        port: this.config.redisPort,
        database: this.config.redisDatabase,
      });
    } catch (error) {
      this.logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Redis connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.quit();
      this.redisClient = null;
      this.connected = false;
      this.logger.info('Disconnected from Redis');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send signal via Redis SETEX
   *
   * Atomically stores signal with 24h TTL using Redis SETEX command.
   * Implements idempotent handling to detect and skip duplicate signals.
   *
   * Key format: blocking:signal:{receiverId}
   * Value: JSON serialized SignalPayload
   * TTL: 86400 seconds (24 hours)
   *
   * @param senderId - ID of coordinator/agent sending signal
   * @param receiverId - ID of coordinator/agent receiving signal
   * @param type - Signal type (completion, retry_request, etc.)
   * @param iteration - Current iteration number
   * @param payload - Optional additional data
   * @returns SignalDeliveryResult with success status and metadata
   */
  async sendSignal(
    senderId: string,
    receiverId: string,
    type: SignalType,
    iteration: number,
    payload?: Record<string, any>
  ): Promise<SignalDeliveryResult> {
    this.ensureConnected();

    // SEC-HIGH-001: Validate IDs before Redis key construction
    const validatedSenderId = this.validateId(senderId, 'senderId');
    const validatedReceiverId = this.validateId(receiverId, 'receiverId');

    const timestamp = Date.now();
    const messageId = this.generateMessageId(validatedSenderId, validatedReceiverId, type, iteration, timestamp);
    const key = this.getSignalKey(validatedReceiverId);

    try {
      // Check for duplicate if idempotency enabled
      if (this.config.enableIdempotency) {
        const isDuplicate = await this.checkDuplicate(messageId);
        if (isDuplicate) {
          this.logger.warn('Duplicate signal detected, skipping', {
            messageId,
            senderId,
            receiverId,
            type,
          });
          this.stats.duplicatesDetected++;
          return {
            success: true,
            messageId,
            isDuplicate: true,
            timestamp,
            key,
          };
        }
      }

      // Create signal payload with validated IDs
      const signal: SignalPayload = {
        timestamp,
        senderId: validatedSenderId,
        receiverId: validatedReceiverId,
        iteration,
        type,
        payload: payload || undefined,
        messageId,
      };

      // Atomic signal storage with SETEX (set + expire)
      const serialized = JSON.stringify(signal);
      const ttl = this.config.signalTTL || 86400;
      await this.redisClient!.setEx(key, ttl, serialized);

      // Store idempotency record if enabled
      if (this.config.enableIdempotency) {
        await this.recordMessageId(messageId);
      }

      this.stats.signalsSent++;

      this.logger.info('Signal sent successfully', {
        messageId,
        senderId,
        receiverId,
        type,
        iteration,
        key,
        ttl: this.config.signalTTL,
      });

      return {
        success: true,
        messageId,
        isDuplicate: false,
        timestamp,
        key,
      };
    } catch (error) {
      this.logger.error('Failed to send signal', {
        error: error instanceof Error ? error.message : String(error),
        senderId,
        receiverId,
        type,
      });
      this.stats.errors++;
      throw new Error(`Signal delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Receive signal from Redis
   *
   * Retrieves signal stored at blocking:signal:{coordinatorId} key.
   * Non-destructive read - signal remains in Redis until TTL expires.
   *
   * @param coordinatorId - ID of coordinator receiving signal
   * @returns SignalReceiveResult with signal payload or null if not found
   */
  async receiveSignal(coordinatorId: string): Promise<SignalReceiveResult> {
    this.ensureConnected();

    // SEC-HIGH-001: Validate coordinator ID before Redis key construction
    const validatedCoordinatorId = this.validateId(coordinatorId, 'coordinatorId');

    const key = this.getSignalKey(validatedCoordinatorId);

    try {
      const serialized = await this.redisClient!.get(key);

      if (!serialized) {
        this.logger.debug('No signal found', { coordinatorId, key });
        return {
          signal: null,
          exists: false,
          key,
        };
      }

      const signal: SignalPayload = JSON.parse(serialized);
      this.stats.signalsReceived++;

      this.logger.info('Signal received', {
        messageId: signal.messageId,
        senderId: signal.senderId,
        receiverId: signal.receiverId,
        type: signal.type,
        iteration: signal.iteration,
        key,
      });

      return {
        signal,
        exists: true,
        key,
      };
    } catch (error) {
      this.logger.error('Failed to receive signal', {
        error: error instanceof Error ? error.message : String(error),
        coordinatorId,
        key,
      });
      this.stats.errors++;
      throw new Error(`Signal receive failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete signal from Redis
   *
   * Removes signal after processing to prevent repeated reads.
   *
   * @param coordinatorId - ID of coordinator
   * @returns True if signal was deleted, false if not found
   */
  async deleteSignal(coordinatorId: string): Promise<boolean> {
    this.ensureConnected();

    // SEC-HIGH-001: Validate coordinator ID before Redis key construction
    const validatedCoordinatorId = this.validateId(coordinatorId, 'coordinatorId');

    const key = this.getSignalKey(validatedCoordinatorId);

    try {
      const deleted = await this.redisClient!.del(key);

      this.logger.info('Signal deleted', {
        coordinatorId,
        key,
        deleted: deleted > 0,
      });

      return deleted > 0;
    } catch (error) {
      this.logger.error('Failed to delete signal', {
        error: error instanceof Error ? error.message : String(error),
        coordinatorId,
        key,
      });
      this.stats.errors++;
      throw new Error(`Signal deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if signal exists
   *
   * @param coordinatorId - ID of coordinator
   * @returns True if signal exists, false otherwise
   */
  async signalExists(coordinatorId: string): Promise<boolean> {
    this.ensureConnected();

    // SEC-HIGH-001: Validate coordinator ID before Redis key construction
    const validatedCoordinatorId = this.validateId(coordinatorId, 'coordinatorId');

    const key = this.getSignalKey(validatedCoordinatorId);

    try {
      const exists = await this.redisClient!.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error('Failed to check signal existence', {
        error: error instanceof Error ? error.message : String(error),
        coordinatorId,
        key,
      });
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Get remaining TTL for signal
   *
   * @param coordinatorId - ID of coordinator
   * @returns Remaining TTL in seconds, -1 if no expiry, -2 if not found
   */
  async getSignalTTL(coordinatorId: string): Promise<number> {
    this.ensureConnected();

    // SEC-HIGH-001: Validate coordinator ID before Redis key construction
    const validatedCoordinatorId = this.validateId(coordinatorId, 'coordinatorId');

    const key = this.getSignalKey(validatedCoordinatorId);

    try {
      const ttl = await this.redisClient!.ttl(key);
      return ttl;
    } catch (error) {
      this.logger.error('Failed to get signal TTL', {
        error: error instanceof Error ? error.message : String(error),
        coordinatorId,
        key,
      });
      this.stats.errors++;
      return -2;
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      signalsSent: 0,
      signalsReceived: 0,
      duplicatesDetected: 0,
      errors: 0,
    };
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Generate signal Redis key
   */
  private getSignalKey(coordinatorId: string): string {
    return `blocking:signal:${coordinatorId}`;
  }

  /**
   * Generate idempotency key
   */
  private getIdempotencyKey(messageId: string): string {
    return `blocking:idempotency:${messageId}`;
  }

  /**
   * Generate unique message ID for idempotency
   */
  private generateMessageId(
    senderId: string,
    receiverId: string,
    type: SignalType,
    iteration: number,
    timestamp: number
  ): string {
    return `${senderId}:${receiverId}:${type}:${iteration}:${timestamp}`;
  }

  /**
   * Check if message is duplicate
   */
  private async checkDuplicate(messageId: string): Promise<boolean> {
    const key = this.getIdempotencyKey(messageId);
    try {
      const exists = await this.redisClient!.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error('Failed to check duplicate', {
        error: error instanceof Error ? error.message : String(error),
        messageId,
      });
      return false; // Assume not duplicate on error
    }
  }

  /**
   * Record message ID for idempotency
   */
  private async recordMessageId(messageId: string): Promise<void> {
    const key = this.getIdempotencyKey(messageId);
    try {
      await this.redisClient!.setEx(key, this.config.idempotencyTTL, '1');
    } catch (error) {
      this.logger.error('Failed to record message ID', {
        error: error instanceof Error ? error.message : String(error),
        messageId,
      });
      // Don't throw - idempotency failure shouldn't block signal delivery
    }
  }

  /**
   * Ensure Redis is connected
   */
  private ensureConnected(): void {
    if (!this.connected || !this.redisClient) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
  }

  /**
   * SEC-HIGH-001: Validate ID string to prevent Redis key injection attacks
   *
   * Validates that IDs contain only safe characters (alphanumeric, hyphens, underscores)
   * and are within reasonable length limits to prevent injection attacks.
   *
   * @param id - ID string to validate
   * @param fieldName - Name of the field being validated (for error messages)
   * @returns Validated ID string
   * @throws Error if ID contains invalid characters or exceeds length limit
   */
  private validateId(id: string, fieldName: string): string {
    // Check for null/empty
    if (!id || typeof id !== 'string') {
      throw new Error(`${fieldName} must be a non-empty string`);
    }

    // Check length (max 64 chars to prevent abuse)
    if (id.length > 64) {
      throw new Error(`${fieldName} exceeds maximum length of 64 characters (got ${id.length})`);
    }

    // Allow only alphanumeric, hyphens, and underscores
    const idPattern = /^[a-zA-Z0-9_-]+$/;

    if (!idPattern.test(id)) {
      throw new Error(
        `Invalid ${fieldName} "${id}": must contain only alphanumeric characters, hyphens, and underscores (SEC-HIGH-001)`
      );
    }

    return id;
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a BlockingCoordinationSignals instance
 *
 * @param config - Configuration options
 * @returns Configured BlockingCoordinationSignals instance
 */
export function createBlockingCoordinationSignals(
  config: BlockingCoordinationSignalsConfig = {}
): BlockingCoordinationSignals {
  return new BlockingCoordinationSignals(config);
}

// ===== EXPORTS =====

export default BlockingCoordinationSignals;
