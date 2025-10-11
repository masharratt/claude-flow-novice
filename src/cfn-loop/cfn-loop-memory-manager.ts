/**
 * CFN Loop Memory Manager - SQLite + Redis Dual-Layer Memory System
 * Sprint 1.5: Loop 3/2/4 Integration
 *
 * Implements CQRS pattern with dual-write strategy:
 * - Commands: Redis pub/sub (real-time coordination, <10ms)
 * - Queries: SQLite (persistent state, audit trail, <50ms)
 *
 * Features:
 * - Dual-write pattern (Redis first, SQLite async)
 * - Loop 3 confidence score persistence
 * - Loop 2 consensus storage
 * - Loop 4 decision history
 * - 5-level ACL enforcement
 * - AES-256-GCM encryption for private data
 * - Cross-session recovery
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.5 - SQLite Memory Integration
 *
 * @module cfn-loop/cfn-loop-memory-manager
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import { NamespaceSanitizer } from '../utils/namespace-sanitizer.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// SQLite imports (CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqliteModulePath = path.join(__dirname, '../sqlite/index.js');

// ===== TYPE DEFINITIONS =====

/**
 * ACL levels for memory access
 */
export enum ACLLevel {
  PRIVATE = 1,    // Only accessible by specific agent
  TEAM = 2,       // Accessible by agents in same team
  SWARM = 3,      // Accessible by all agents in swarm
  PROJECT = 4,    // Accessible by agents in same project
  SYSTEM = 5      // System-level access
}

/**
 * Loop 3 confidence data structure
 */
export interface Loop3Confidence {
  agentId: string;
  confidence: number;
  reasoning: string;
  blockers: string[];
  timestamp: number;
  phase: string;
  iteration: number;
  metadata?: {
    filesModified?: string[];
    testsRun?: number;
    testsPassed?: number;
  };
}

/**
 * Loop 2 validation result structure
 */
export interface Loop2ValidationResult {
  validatorId: string;
  validationType: 'security' | 'performance' | 'code-quality' | 'architecture';
  score: number;
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    location?: string;
    recommendation?: string;
  }>;
  recommendations: string[];
  timestamp: number;
  phase: string;
  iteration: number;
}

/**
 * Loop 2 consensus data structure
 */
export interface Loop2Consensus {
  consensusId: string;
  phase: string;
  iteration: number;
  threshold: number;
  currentScore: number;
  validationResults: Loop2ValidationResult[];
  status: 'pending' | 'achieved' | 'failed';
  timestamp: number;
  resolvedAt?: number;
}

/**
 * Loop 4 Product Owner decision
 */
export interface Loop4Decision {
  decisionId: string;
  phase: string;
  iteration: number;
  decision: 'PROCEED' | 'DEFER' | 'ESCALATE';
  reasoning: string;
  loop3Confidence: number;
  loop2Consensus: number;
  deferredIssues?: string[];
  escalationReason?: string;
  timestamp: number;
  nextActions: string[];
}

/**
 * Configuration for CFN Loop memory manager
 */
export interface CFNLoopMemoryConfig {
  /** Redis client instance (ioredis) */
  redisClient: Redis;
  /** SQLite database path */
  sqliteDbPath?: string;
  /** Swarm ID for context */
  swarmId: string;
  /** Project ID for ACL (optional) */
  projectId?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Dual-write timeout (ms) - default 5000 */
  dualWriteTimeout?: number;
  /** Enable encryption for private data (default: true) */
  enableEncryption?: boolean;
  /** Compression threshold in bytes (default: 1024) */
  compressionThreshold?: number;
}

/**
 * Memory operation options
 */
export interface MemoryOptions {
  /** Agent ID for ACL enforcement */
  agentId: string;
  /** ACL level (default: SWARM) */
  aclLevel?: ACLLevel;
  /** Team ID for team-level access */
  teamId?: string;
  /** TTL in seconds (default: 86400 = 24 hours) */
  ttl?: number;
  /** Enable compression (default: true for large data) */
  compress?: boolean;
  /** Enable encryption (default: true for private data) */
  encrypt?: boolean;
}

// ===== CFN LOOP MEMORY MANAGER =====

/**
 * Manages CFN Loop memory with Redis + SQLite dual-layer system
 */
export class CFNLoopMemoryManager extends EventEmitter {
  private logger: Logger;
  private redis: Redis;
  private sqlite: any; // SQLiteMemorySystem from CommonJS module
  private swarmId: string;
  private projectId?: string;
  private debug: boolean;
  private dualWriteTimeout: number;
  private enableEncryption: boolean;
  private compressionThreshold: number;

  // Metrics
  private metrics = {
    dualWrites: 0,
    dualWriteFailures: 0,
    redisWrites: 0,
    sqliteWrites: 0,
    dualWriteLatencyMs: [] as number[],
    redisLatencyMs: [] as number[],
    sqliteLatencyMs: [] as number[]
  };

  constructor(config: CFNLoopMemoryConfig) {
    super();

    this.redis = config.redisClient;
    this.swarmId = config.swarmId;
    this.projectId = config.projectId;
    this.debug = config.debug || false;
    this.dualWriteTimeout = config.dualWriteTimeout || 5000;
    this.enableEncryption = config.enableEncryption !== false;
    this.compressionThreshold = config.compressionThreshold || 1024;

    // Initialize logger
    const loggingConfig: LoggingConfig = {
      level: this.debug ? 'debug' : 'info',
      format: 'json',
      outputDir: './logs'
    };
    this.logger = new Logger('cfn-loop-memory-manager', loggingConfig);

    // Initialize SQLite (lazy loaded)
    this.sqlite = null;
  }

  /**
   * Initialize the memory manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing CFN Loop memory manager', {
      swarmId: this.swarmId,
      projectId: this.projectId
    });

    try {
      // Dynamically import SQLite system (CommonJS)
      const sqliteModule = await import(sqliteModulePath);
      const { SQLiteMemorySystem } = sqliteModule;

      // Initialize SQLite
      this.sqlite = new SQLiteMemorySystem({
        swarmId: this.swarmId,
        agentId: 'cfn-loop-memory-manager',
        dbPath: process.env.SQLITE_DB_PATH || './cfn-loop-memory.db',
        enableRedisCoordination: false, // We manage Redis separately
        enablePerformanceMonitoring: this.debug,
        compressionThreshold: this.compressionThreshold
      });

      await this.sqlite.initialize();

      this.logger.info('CFN Loop memory manager initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize CFN Loop memory manager', { error });
      throw error;
    }
  }

  /**
   * Store Loop 3 confidence score with dual-write
   */
  async storeLoop3Confidence(
    data: Loop3Confidence,
    options: MemoryOptions
  ): Promise<void> {
    const startTime = Date.now();
    const key = `cfn/phase-${data.phase}/loop3/confidence/${data.agentId}`;

    this.logger.debug('Storing Loop 3 confidence', {
      key,
      agentId: data.agentId,
      confidence: data.confidence
    });

    try {
      // 1. Write to Redis first (fail fast)
      const redisStart = Date.now();
      await this.redis.setex(
        NamespaceSanitizer.sanitize(key),
        options.ttl || 86400,
        JSON.stringify(data)
      );
      this.metrics.redisWrites++;
      this.metrics.redisLatencyMs.push(Date.now() - redisStart);

      // 2. Persist to SQLite asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const sqliteStart = Date.now();
          await this.sqlite.memoryAdapter.set(key, data, {
            agentId: options.agentId,
            aclLevel: ACLLevel.PRIVATE, // Confidence is private to agent
            ttl: options.ttl || 86400,
            namespace: 'cfn-loop',
            type: 'state',
            encrypt: this.enableEncryption && options.encrypt !== false,
            compress: options.compress !== false
          });
          this.metrics.sqliteWrites++;
          this.metrics.sqliteLatencyMs.push(Date.now() - sqliteStart);

          // 3. Broadcast to event bus
          await this.redis.publish(
            'cfn-loop:confidence',
            JSON.stringify({
              type: 'loop3.confidence.stored',
              agentId: data.agentId,
              phase: data.phase,
              confidence: data.confidence,
              timestamp: Date.now()
            })
          );

          this.logger.debug('Loop 3 confidence persisted to SQLite', {
            key,
            latencyMs: Date.now() - sqliteStart
          });
        } catch (error) {
          this.metrics.dualWriteFailures++;
          this.logger.error('Failed to persist Loop 3 confidence to SQLite', {
            key,
            error
          });
          this.emit('dualWriteFailure', { key, error });
        }
      });

      this.metrics.dualWrites++;
      this.metrics.dualWriteLatencyMs.push(Date.now() - startTime);

      this.logger.debug('Loop 3 confidence stored successfully', {
        key,
        latencyMs: Date.now() - startTime
      });
    } catch (error) {
      this.logger.error('Failed to store Loop 3 confidence to Redis', {
        key,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieve Loop 3 confidence scores for phase
   */
  async getLoop3Confidence(
    phase: string,
    options: MemoryOptions
  ): Promise<Loop3Confidence[]> {
    const pattern = `cfn/phase-${phase}/loop3/confidence/*`;

    this.logger.debug('Retrieving Loop 3 confidence scores', { phase, pattern });

    try {
      // Query SQLite for persistent data (better for complex queries)
      const results = await this.sqlite.memoryAdapter.getPattern(pattern, {
        agentId: options.agentId,
        aclLevel: ACLLevel.SWARM // Swarm can read all confidence scores
      });

      this.logger.debug('Retrieved Loop 3 confidence scores', {
        phase,
        count: results.length
      });

      return results.map((r: any) => r.value);
    } catch (error) {
      this.logger.error('Failed to retrieve Loop 3 confidence', { phase, error });
      throw error;
    }
  }

  /**
   * Store Loop 2 consensus result with dual-write
   */
  async storeLoop2Consensus(
    data: Loop2Consensus,
    options: MemoryOptions
  ): Promise<void> {
    const startTime = Date.now();
    const key = `cfn/phase-${data.phase}/loop2/consensus/${data.consensusId}`;

    this.logger.debug('Storing Loop 2 consensus', {
      key,
      consensusId: data.consensusId,
      status: data.status,
      score: data.currentScore
    });

    try {
      // 1. Write to Redis first (fail fast)
      const redisStart = Date.now();
      await this.redis.setex(
        NamespaceSanitizer.sanitize(key),
        options.ttl || 86400,
        JSON.stringify(data)
      );
      this.metrics.redisWrites++;
      this.metrics.redisLatencyMs.push(Date.now() - redisStart);

      // 2. Persist to SQLite asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const sqliteStart = Date.now();

          // Store consensus record
          await this.sqlite.memoryAdapter.set(key, data, {
            agentId: options.agentId,
            aclLevel: ACLLevel.SWARM, // Consensus is swarm-level
            ttl: options.ttl || 86400,
            namespace: 'cfn-loop',
            type: 'state',
            encrypt: false, // Consensus is not sensitive
            compress: options.compress !== false
          });

          // Store in consensus table for complex queries
          await this.storeConsensusRecord(data);

          this.metrics.sqliteWrites++;
          this.metrics.sqliteLatencyMs.push(Date.now() - sqliteStart);

          // 3. Broadcast to event bus
          await this.redis.publish(
            'cfn-loop:consensus',
            JSON.stringify({
              type: 'loop2.consensus.stored',
              consensusId: data.consensusId,
              phase: data.phase,
              status: data.status,
              score: data.currentScore,
              timestamp: Date.now()
            })
          );

          this.logger.debug('Loop 2 consensus persisted to SQLite', {
            key,
            latencyMs: Date.now() - sqliteStart
          });
        } catch (error) {
          this.metrics.dualWriteFailures++;
          this.logger.error('Failed to persist Loop 2 consensus to SQLite', {
            key,
            error
          });
          this.emit('dualWriteFailure', { key, error });
        }
      });

      this.metrics.dualWrites++;
      this.metrics.dualWriteLatencyMs.push(Date.now() - startTime);

      this.logger.debug('Loop 2 consensus stored successfully', {
        key,
        latencyMs: Date.now() - startTime
      });
    } catch (error) {
      this.logger.error('Failed to store Loop 2 consensus to Redis', {
        key,
        error
      });
      throw error;
    }
  }

  /**
   * Store consensus record in SQLite consensus table
   */
  private async storeConsensusRecord(data: Loop2Consensus): Promise<void> {
    const consensusRecord = {
      id: data.consensusId,
      type: 'validation',
      target_id: data.phase,
      target_type: 'phase',
      swarm_id: this.swarmId,
      phase: data.phase,
      loop_number: data.iteration,
      threshold: data.threshold,
      current_score: data.currentScore,
      status: data.status,
      total_participants: data.validationResults.length,
      acl_level: ACLLevel.SWARM,
      voting_strategy: 'weighted',
      metadata: JSON.stringify({
        validationResults: data.validationResults
      }),
      created_at: new Date(data.timestamp).toISOString(),
      resolved_at: data.resolvedAt ? new Date(data.resolvedAt).toISOString() : null
    };

    await this.sqlite.db.run(
      `INSERT OR REPLACE INTO consensus (
        id, type, target_id, target_type, swarm_id, phase, loop_number,
        threshold, current_score, status, total_participants, acl_level,
        voting_strategy, metadata, created_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consensusRecord.id,
        consensusRecord.type,
        consensusRecord.target_id,
        consensusRecord.target_type,
        consensusRecord.swarm_id,
        consensusRecord.phase,
        consensusRecord.loop_number,
        consensusRecord.threshold,
        consensusRecord.current_score,
        consensusRecord.status,
        consensusRecord.total_participants,
        consensusRecord.acl_level,
        consensusRecord.voting_strategy,
        consensusRecord.metadata,
        consensusRecord.created_at,
        consensusRecord.resolved_at
      ]
    );
  }

  /**
   * Retrieve Loop 2 consensus for phase
   */
  async getLoop2Consensus(
    phase: string,
    options: MemoryOptions
  ): Promise<Loop2Consensus | null> {
    const pattern = `cfn/phase-${phase}/loop2/consensus/*`;

    this.logger.debug('Retrieving Loop 2 consensus', { phase, pattern });

    try {
      // Query SQLite for persistent data
      const results = await this.sqlite.memoryAdapter.getPattern(pattern, {
        agentId: options.agentId,
        aclLevel: ACLLevel.SWARM
      });

      if (results.length === 0) {
        return null;
      }

      // Return most recent consensus
      const sorted = results.sort((a: any, b: any) => b.value.timestamp - a.value.timestamp);

      this.logger.debug('Retrieved Loop 2 consensus', {
        phase,
        consensusId: sorted[0].value.consensusId
      });

      return sorted[0].value;
    } catch (error) {
      this.logger.error('Failed to retrieve Loop 2 consensus', { phase, error });
      throw error;
    }
  }

  /**
   * Store Loop 4 Product Owner decision with dual-write
   */
  async storeLoop4Decision(
    data: Loop4Decision,
    options: MemoryOptions
  ): Promise<void> {
    const startTime = Date.now();
    const key = `cfn/phase-${data.phase}/loop4/decision/${data.decisionId}`;

    this.logger.debug('Storing Loop 4 decision', {
      key,
      decisionId: data.decisionId,
      decision: data.decision
    });

    try {
      // 1. Write to Redis first (fail fast)
      const redisStart = Date.now();
      await this.redis.setex(
        NamespaceSanitizer.sanitize(key),
        options.ttl || 86400,
        JSON.stringify(data)
      );
      this.metrics.redisWrites++;
      this.metrics.redisLatencyMs.push(Date.now() - redisStart);

      // 2. Persist to SQLite asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const sqliteStart = Date.now();
          await this.sqlite.memoryAdapter.set(key, data, {
            agentId: options.agentId,
            aclLevel: ACLLevel.SYSTEM, // Product Owner decisions are system-level
            ttl: options.ttl || 86400,
            namespace: 'cfn-loop',
            type: 'state',
            encrypt: this.enableEncryption && options.encrypt !== false,
            compress: options.compress !== false
          });

          // Store audit log
          await this.storeAuditLog({
            entity_id: data.decisionId,
            entity_type: 'system',
            action: 'loop4_decision',
            new_values: JSON.stringify(data),
            changed_by: options.agentId,
            swarm_id: this.swarmId,
            acl_level: ACLLevel.SYSTEM,
            risk_level: data.decision === 'ESCALATE' ? 'high' : 'medium',
            category: 'cfn-loop',
            metadata: JSON.stringify({
              phase: data.phase,
              iteration: data.iteration,
              decision: data.decision
            })
          });

          this.metrics.sqliteWrites++;
          this.metrics.sqliteLatencyMs.push(Date.now() - sqliteStart);

          // 3. Broadcast to event bus
          await this.redis.publish(
            'cfn-loop:decision',
            JSON.stringify({
              type: 'loop4.decision.stored',
              decisionId: data.decisionId,
              phase: data.phase,
              decision: data.decision,
              timestamp: Date.now()
            })
          );

          this.logger.debug('Loop 4 decision persisted to SQLite', {
            key,
            latencyMs: Date.now() - sqliteStart
          });
        } catch (error) {
          this.metrics.dualWriteFailures++;
          this.logger.error('Failed to persist Loop 4 decision to SQLite', {
            key,
            error
          });
          this.emit('dualWriteFailure', { key, error });
        }
      });

      this.metrics.dualWrites++;
      this.metrics.dualWriteLatencyMs.push(Date.now() - startTime);

      this.logger.debug('Loop 4 decision stored successfully', {
        key,
        latencyMs: Date.now() - startTime
      });
    } catch (error) {
      this.logger.error('Failed to store Loop 4 decision to Redis', {
        key,
        error
      });
      throw error;
    }
  }

  /**
   * Store audit log entry in SQLite
   */
  private async storeAuditLog(entry: any): Promise<void> {
    await this.sqlite.db.run(
      `INSERT INTO audit_log (
        id, entity_id, entity_type, action, new_values, changed_by,
        swarm_id, acl_level, risk_level, category, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entry.entity_id,
        entry.entity_type,
        entry.action,
        entry.new_values,
        entry.changed_by,
        entry.swarm_id,
        entry.acl_level,
        entry.risk_level,
        entry.category,
        entry.metadata,
        new Date().toISOString()
      ]
    );
  }

  /**
   * Retrieve Loop 4 decision history for phase
   */
  async getLoop4DecisionHistory(
    phase: string,
    options: MemoryOptions
  ): Promise<Loop4Decision[]> {
    const pattern = `cfn/phase-${phase}/loop4/decision/*`;

    this.logger.debug('Retrieving Loop 4 decision history', { phase, pattern });

    try {
      // Query SQLite for persistent data
      const results = await this.sqlite.memoryAdapter.getPattern(pattern, {
        agentId: options.agentId,
        aclLevel: ACLLevel.SYSTEM
      });

      // Sort by timestamp descending
      const sorted = results
        .map((r: any) => r.value)
        .sort((a: Loop4Decision, b: Loop4Decision) => b.timestamp - a.timestamp);

      this.logger.debug('Retrieved Loop 4 decision history', {
        phase,
        count: sorted.length
      });

      return sorted;
    } catch (error) {
      this.logger.error('Failed to retrieve Loop 4 decision history', { phase, error });
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const calculateStats = (arr: number[]) => {
      if (arr.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        avg: arr.reduce((a, b) => a + b, 0) / arr.length,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    };

    return {
      dualWrites: this.metrics.dualWrites,
      dualWriteFailures: this.metrics.dualWriteFailures,
      redisWrites: this.metrics.redisWrites,
      sqliteWrites: this.metrics.sqliteWrites,
      dualWriteLatency: calculateStats(this.metrics.dualWriteLatencyMs),
      redisLatency: calculateStats(this.metrics.redisLatencyMs),
      sqliteLatency: calculateStats(this.metrics.sqliteLatencyMs)
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down CFN Loop memory manager');

    try {
      if (this.sqlite) {
        await this.sqlite.gracefulShutdown();
      }

      this.logger.info('CFN Loop memory manager shutdown complete');
      this.emit('shutdown');
    } catch (error) {
      this.logger.error('Error during shutdown', { error });
      throw error;
    }
  }
}
