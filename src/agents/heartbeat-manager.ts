/**
 * Agent Heartbeat Manager
 * Sprint 3.2: Memory Leak Prevention - Agent Heartbeat System
 *
 * Features:
 * - Agents send heartbeat every 30s to Redis
 * - Meta-coordinator monitors heartbeats
 * - Timeout handler detects dead agents (>2min idle)
 * - Work transfer to replacement agents
 * - Integration with lifecycle cleanup
 *
 * Epic: memory-leak-prevention
 * Sprint: 3.2 - Agent Heartbeat System
 *
 * @module agents/heartbeat-manager
 */

import { EventEmitter } from 'events';
import type { Redis } from 'ioredis';
import { Logger } from '../core/logger.js';
import type { LoggingConfig } from '../utils/types.js';

// ===== TYPE DEFINITIONS =====

export interface HeartbeatConfig {
  redisClient: Redis;
  heartbeatInterval: number; // milliseconds (default: 30000 = 30s)
  deadAgentThreshold: number; // milliseconds (default: 120000 = 2min)
  enableWorkTransfer: boolean;
  debug?: boolean;
}

export interface AgentHeartbeat {
  agentId: string;
  agentType: string;
  timestamp: number;
  sequenceNumber: number;
  metadata?: {
    taskId?: string;
    swarmId?: string;
    status?: string;
    currentWork?: string;
  };
}

export interface DeadAgentEvent {
  agentId: string;
  agentType: string;
  lastHeartbeat: number;
  idleDuration: number;
  currentWork?: string;
  replacementRequired: boolean;
}

// ===== HEARTBEAT MANAGER =====

export class HeartbeatManager extends EventEmitter {
  private redis: Redis;
  private logger: Logger;
  private heartbeatInterval: number;
  private deadAgentThreshold: number;
  private enableWorkTransfer: boolean;

  // State
  private isRunning: boolean = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private monitorTimer?: NodeJS.Timeout;
  private agentSequences: Map<string, number> = new Map();

  // Metrics
  private metrics = {
    heartbeatsSent: 0,
    deadAgentsDetected: 0,
    workTransfersExecuted: 0,
    errors: 0,
  };

  constructor(config: HeartbeatConfig) {
    super();

    this.redis = config.redisClient;
    this.heartbeatInterval = config.heartbeatInterval;
    this.deadAgentThreshold = config.deadAgentThreshold;
    this.enableWorkTransfer = config.enableWorkTransfer;

    const loggingConfig: LoggingConfig = {
      level: config.debug ? 'debug' : 'info',
      format: 'json',
      outputDir: './logs',
    };
    this.logger = new Logger('heartbeat-manager', loggingConfig);
  }

  async sendHeartbeat(
    agentId: string,
    agentType: string,
    metadata?: AgentHeartbeat['metadata']
  ): Promise<void> {
    const sequenceNumber = (this.agentSequences.get(agentId) || 0) + 1;
    this.agentSequences.set(agentId, sequenceNumber);

    const heartbeat: AgentHeartbeat = {
      agentId,
      agentType,
      timestamp: Date.now(),
      sequenceNumber,
      metadata,
    };

    await this.redis.setex(
      `heartbeat:agent:${agentId}`,
      Math.ceil(this.deadAgentThreshold / 1000),
      JSON.stringify(heartbeat)
    );

    this.metrics.heartbeatsSent++;
    this.emit('heartbeat:sent', heartbeat);
  }

  startMonitoring(): void {
    if (this.isRunning) return;

    this.monitorTimer = setInterval(async () => {
      await this.checkForDeadAgents();
    }, this.heartbeatInterval);

    this.isRunning = true;
    this.emit('monitoring:started');
  }

  stopMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
    this.isRunning = false;
    this.emit('monitoring:stopped');
  }

  private async checkForDeadAgents(): Promise<void> {
    try {
      const keys = await this.redis.keys('heartbeat:agent:*');
      const now = Date.now();

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (!data) continue;

        const heartbeat: AgentHeartbeat = JSON.parse(data);
        const idleDuration = now - heartbeat.timestamp;

        if (idleDuration > this.deadAgentThreshold) {
          await this.handleDeadAgent(heartbeat, idleDuration);
        }
      }
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('Error checking for dead agents', { error });
    }
  }

  private async handleDeadAgent(heartbeat: AgentHeartbeat, idleDuration: number): Promise<void> {
    const deadAgentEvent: DeadAgentEvent = {
      agentId: heartbeat.agentId,
      agentType: heartbeat.agentType,
      lastHeartbeat: heartbeat.timestamp,
      idleDuration,
      currentWork: heartbeat.metadata?.currentWork,
      replacementRequired: this.enableWorkTransfer,
    };

    this.metrics.deadAgentsDetected++;
    this.emit('agent:dead', deadAgentEvent);

    if (this.enableWorkTransfer && heartbeat.metadata?.currentWork) {
      await this.transferWork(heartbeat);
      this.metrics.workTransfersExecuted++;
    }

    await this.redis.del(`heartbeat:agent:${heartbeat.agentId}`);
  }

  private async transferWork(heartbeat: AgentHeartbeat): Promise<void> {
    await this.redis.publish(
      'agent:work-transfer',
      JSON.stringify({
        deadAgentId: heartbeat.agentId,
        workItem: heartbeat.metadata?.currentWork,
        timestamp: Date.now(),
      })
    );

    this.emit('work:transferred', {
      fromAgent: heartbeat.agentId,
      work: heartbeat.metadata?.currentWork,
    });
  }

  getMetrics() {
    return { ...this.metrics, isRunning: this.isRunning };
  }

  async shutdown(): Promise<void> {
    this.stopMonitoring();
    this.emit('shutdown');
  }
}

export function createHeartbeatManager(config: HeartbeatConfig): HeartbeatManager {
  return new HeartbeatManager(config);
}
