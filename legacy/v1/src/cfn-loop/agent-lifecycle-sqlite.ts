/**
 * Agent Lifecycle SQLite Integration
 * Sprint 1.6: Agent Lifecycle Hooks
 *
 * Persists agent lifecycle events to SQLite for audit trail and recovery.
 * Integrates with CFNLoopMemoryManager for dual-write pattern.
 *
 * Features:
 * - Agent spawn registration
 * - Confidence score updates
 * - Agent termination cleanup
 * - Blocking coordination event tracking
 * - ACL-enforced audit trail
 *
 * Epic: production-blocking-coordination
 * Sprint: 1.6 - Agent Lifecycle Hooks
 *
 * @module cfn-loop/agent-lifecycle-sqlite
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import type { CFNLoopMemoryManager, ACLLevel, MemoryOptions } from './cfn-loop-memory-manager.js';

// ===== TYPE DEFINITIONS =====

/**
 * Agent lifecycle event types
 */
export type AgentLifecycleEventType =
  | 'spawn'
  | 'update'
  | 'confidence_update'
  | 'task_assigned'
  | 'task_completed'
  | 'terminate'
  | 'error';

/**
 * Agent lifecycle event structure
 */
export interface AgentLifecycleEvent {
  eventId: string;
  eventType: AgentLifecycleEventType;
  agentId: string;
  agentType: string;
  swarmId: string;
  timestamp: number;
  phase?: string;
  iteration?: number;
  metadata?: {
    confidence?: number;
    task?: string;
    error?: string;
    filesModified?: string[];
    performanceMetrics?: any;
  };
}

/**
 * Agent registration data
 */
export interface AgentRegistration {
  agentId: string;
  name: string;
  type: string;
  swarmId: string;
  teamId?: string;
  projectId?: string;
  capabilities?: string[];
  aclLevel: ACLLevel;
  metadata?: any;
}

/**
 * Configuration for agent lifecycle SQLite integration
 */
export interface AgentLifecycleSQLiteConfig {
  /** Redis client instance */
  redisClient: Redis;
  /** CFN Loop memory manager */
  cfnMemoryManager: CFNLoopMemoryManager;
  /** Swarm ID for context */
  swarmId: string;
  /** Project ID for ACL (optional) */
  projectId?: string;
  /** Enable debug logging */
  debug?: boolean;
}

// ===== AGENT LIFECYCLE SQLITE MANAGER =====

/**
 * Manages agent lifecycle events with SQLite persistence
 */
export class AgentLifecycleSQLiteManager extends EventEmitter {
  private logger: Logger;
  private redis: Redis;
  private cfnMemoryManager: CFNLoopMemoryManager;
  private swarmId: string;
  private projectId?: string;
  private debug: boolean;

  // Metrics
  private metrics = {
    lifecycleEvents: 0,
    agentRegistrations: 0,
    confidenceUpdates: 0,
    agentTerminations: 0,
    auditLogsWritten: 0,
    errors: 0
  };

  constructor(config: AgentLifecycleSQLiteConfig) {
    super();

    this.redis = config.redisClient;
    this.cfnMemoryManager = config.cfnMemoryManager;
    this.swarmId = config.swarmId;
    this.projectId = config.projectId;
    this.debug = config.debug || false;

    // Initialize logger
    const loggingConfig: LoggingConfig = {
      level: this.debug ? 'debug' : 'info',
      format: 'json',
      outputDir: './logs'
    };
    this.logger = new Logger('agent-lifecycle-sqlite', loggingConfig);

    this.logger.info('Agent lifecycle SQLite manager initialized', {
      swarmId: this.swarmId,
      projectId: this.projectId
    });
  }

  /**
   * Register agent spawn event
   */
  async registerAgentSpawn(registration: AgentRegistration): Promise<void> {
    this.logger.info('Registering agent spawn', {
      agentId: registration.agentId,
      type: registration.type
    });

    try {
      // 1. Store in SQLite agents table
      await this.storeAgentRecord(registration);

      // 2. Log lifecycle event
      const event: AgentLifecycleEvent = {
        eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'spawn',
        agentId: registration.agentId,
        agentType: registration.type,
        swarmId: this.swarmId,
        timestamp: Date.now(),
        metadata: {
          capabilities: registration.capabilities,
          teamId: registration.teamId
        }
      };

      await this.logLifecycleEvent(event);

      // 3. Broadcast to event bus
      await this.redis.publish(
        'cfn-loop:agent-lifecycle',
        JSON.stringify({
          type: 'agent.spawned',
          agentId: registration.agentId,
          swarmId: this.swarmId,
          timestamp: Date.now()
        })
      );

      this.metrics.agentRegistrations++;

      this.logger.info('Agent spawn registered successfully', {
        agentId: registration.agentId
      });
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to register agent spawn', {
        agentId: registration.agentId,
        error
      });
      throw error;
    }
  }

  /**
   * Update agent confidence score
   */
  async updateAgentConfidence(
    agentId: string,
    confidence: number,
    reasoning: string,
    phase?: string,
    iteration?: number
  ): Promise<void> {
    this.logger.debug('Updating agent confidence', {
      agentId,
      confidence,
      phase
    });

    try {
      // 1. Update agent record in SQLite
      await this.updateAgentPerformanceMetrics(agentId, {
        confidence,
        reasoning,
        lastUpdate: Date.now()
      });

      // 2. Log lifecycle event
      const event: AgentLifecycleEvent = {
        eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'confidence_update',
        agentId,
        agentType: 'unknown', // Type will be fetched from DB if needed
        swarmId: this.swarmId,
        timestamp: Date.now(),
        phase,
        iteration,
        metadata: {
          confidence,
          reasoning
        }
      };

      await this.logLifecycleEvent(event);

      this.metrics.confidenceUpdates++;

      this.logger.debug('Agent confidence updated successfully', {
        agentId,
        confidence
      });
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to update agent confidence', {
        agentId,
        error
      });
      throw error;
    }
  }

  /**
   * Register agent termination
   */
  async registerAgentTermination(
    agentId: string,
    reason: string
  ): Promise<void> {
    this.logger.info('Registering agent termination', {
      agentId,
      reason
    });

    try {
      // 1. Update agent status in SQLite
      await this.updateAgentStatus(agentId, 'terminated');

      // 2. Log lifecycle event
      const event: AgentLifecycleEvent = {
        eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        eventType: 'terminate',
        agentId,
        agentType: 'unknown',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        metadata: {
          reason
        }
      };

      await this.logLifecycleEvent(event);

      // 3. Broadcast to event bus
      await this.redis.publish(
        'cfn-loop:agent-lifecycle',
        JSON.stringify({
          type: 'agent.terminated',
          agentId,
          swarmId: this.swarmId,
          reason,
          timestamp: Date.now()
        })
      );

      this.metrics.agentTerminations++;

      this.logger.info('Agent termination registered successfully', {
        agentId
      });
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Failed to register agent termination', {
        agentId,
        error
      });
      throw error;
    }
  }

  /**
   * Log lifecycle event to SQLite
   */
  private async logLifecycleEvent(event: AgentLifecycleEvent): Promise<void> {
    try {
      // Store event in SQLite events table
      const sqlite = this.cfnMemoryManager['sqlite']; // Access private property
      if (!sqlite || !sqlite.db) {
        throw new Error('SQLite database not initialized');
      }

      await sqlite.db.run(
        `INSERT INTO events (
          id, type, source, swarm_id, agent_id, project_id,
          payload, priority, acl_level, ttl_seconds, expires_at,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.eventId,
          event.eventType,
          event.agentId,
          this.swarmId,
          event.agentId,
          this.projectId || null,
          JSON.stringify(event.metadata || {}),
          5, // Normal priority
          3, // Swarm-level ACL
          86400, // 24 hour TTL
          new Date(Date.now() + 86400000).toISOString(),
          'completed',
          new Date(event.timestamp).toISOString()
        ]
      );

      // Store audit log
      await sqlite.db.run(
        `INSERT INTO audit_log (
          id, entity_id, entity_type, action, new_values,
          changed_by, swarm_id, acl_level, risk_level,
          category, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `audit-${event.eventId}`,
          event.agentId,
          'agent',
          event.eventType,
          JSON.stringify(event),
          event.agentId,
          this.swarmId,
          3, // Swarm-level ACL
          'low',
          'agent-lifecycle',
          JSON.stringify({
            phase: event.phase,
            iteration: event.iteration
          }),
          new Date(event.timestamp).toISOString()
        ]
      );

      this.metrics.lifecycleEvents++;
      this.metrics.auditLogsWritten++;

      this.logger.debug('Lifecycle event logged', {
        eventId: event.eventId,
        eventType: event.eventType
      });
    } catch (error) {
      this.logger.error('Failed to log lifecycle event', {
        eventId: event.eventId,
        error
      });
      throw error;
    }
  }

  /**
   * Store agent record in SQLite
   */
  private async storeAgentRecord(registration: AgentRegistration): Promise<void> {
    const sqlite = this.cfnMemoryManager['sqlite'];
    if (!sqlite || !sqlite.db) {
      throw new Error('SQLite database not initialized');
    }

    await sqlite.db.run(
      `INSERT OR REPLACE INTO agents (
        id, name, type, status, swarm_id, team_id, project_id,
        capabilities, acl_level, metadata, created_at, updated_at, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        registration.agentId,
        registration.name,
        registration.type,
        'active',
        registration.swarmId,
        registration.teamId || null,
        registration.projectId || this.projectId || null,
        JSON.stringify(registration.capabilities || []),
        registration.aclLevel,
        JSON.stringify(registration.metadata || {}),
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );
  }

  /**
   * Update agent performance metrics
   */
  private async updateAgentPerformanceMetrics(
    agentId: string,
    metrics: any
  ): Promise<void> {
    const sqlite = this.cfnMemoryManager['sqlite'];
    if (!sqlite || !sqlite.db) {
      throw new Error('SQLite database not initialized');
    }

    await sqlite.db.run(
      `UPDATE agents
       SET performance_metrics = ?,
           updated_at = ?,
           last_seen = ?
       WHERE id = ?`,
      [
        JSON.stringify(metrics),
        new Date().toISOString(),
        new Date().toISOString(),
        agentId
      ]
    );
  }

  /**
   * Update agent status
   */
  private async updateAgentStatus(
    agentId: string,
    status: 'active' | 'inactive' | 'suspended' | 'terminated'
  ): Promise<void> {
    const sqlite = this.cfnMemoryManager['sqlite'];
    if (!sqlite || !sqlite.db) {
      throw new Error('SQLite database not initialized');
    }

    await sqlite.db.run(
      `UPDATE agents
       SET status = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        status,
        new Date().toISOString(),
        agentId
      ]
    );
  }

  /**
   * Get agent lifecycle history
   */
  async getAgentLifecycleHistory(
    agentId: string,
    options: { limit?: number; eventTypes?: AgentLifecycleEventType[] } = {}
  ): Promise<AgentLifecycleEvent[]> {
    const sqlite = this.cfnMemoryManager['sqlite'];
    if (!sqlite || !sqlite.db) {
      throw new Error('SQLite database not initialized');
    }

    let query = `
      SELECT id, type, source, payload, created_at
      FROM events
      WHERE agent_id = ? AND swarm_id = ?
    `;

    const params: any[] = [agentId, this.swarmId];

    if (options.eventTypes && options.eventTypes.length > 0) {
      query += ` AND type IN (${options.eventTypes.map(() => '?').join(',')})`;
      params.push(...options.eventTypes);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return new Promise((resolve, reject) => {
      sqlite.db.all(query, params, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        const events: AgentLifecycleEvent[] = rows.map(row => ({
          eventId: row.id,
          eventType: row.type,
          agentId: row.source,
          agentType: 'unknown',
          swarmId: this.swarmId,
          timestamp: new Date(row.created_at).getTime(),
          metadata: JSON.parse(row.payload || '{}')
        }));

        resolve(events);
      });
    });
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent lifecycle SQLite manager');
    this.emit('shutdown');
  }
}

/**
 * Create agent lifecycle SQLite manager
 */
export function createAgentLifecycleSQLiteManager(
  config: AgentLifecycleSQLiteConfig
): AgentLifecycleSQLiteManager {
  return new AgentLifecycleSQLiteManager(config);
}

export default AgentLifecycleSQLiteManager;
