/**
 * Agent Registry with Memory Integration
 * Provides persistent storage and coordination for agent management
 */

import { EventEmitter } from 'node:events';
import type { DistributedMemorySystem } from '../memory/distributed-memory.js';
import type { AgentState, AgentId, AgentType, AgentStatus } from '../swarm/types.js';

export interface AgentRegistryEntry {
  agent: AgentState;
  createdAt: Date;
  lastUpdated: Date;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface AgentQuery {
  type?: AgentType;
  status?: AgentStatus;
  tags?: string[];
  healthThreshold?: number;
  namePattern?: string;
  createdAfter?: Date;
  lastActiveAfter?: Date;
}

export interface AgentStatistics {
  totalAgents: number;
  byType: Record<AgentType, number>;
  byStatus: Record<AgentStatus, number>;
  averageHealth: number;
  activeAgents: number;
  totalUptime: number;
  tasksCompleted: number;
  successRate: number;
}

/**
 * Centralized agent registry with persistent storage
 */
export class AgentRegistry extends EventEmitter {
  private memory: DistributedMemorySystem;
  private namespace: string;
  private cache = new Map<string, AgentRegistryEntry>();
  private cacheExpiry = 60000; // 1 minute
  private lastCacheUpdate = 0;

  constructor(memory: DistributedMemorySystem, namespace = 'agents') {
    super();
    this.memory = memory;
    this.namespace = namespace;
  }

  async initialize(): Promise<void> {
    await this.loadFromMemory();
    this.emit('registry:initialized');
  }

  private async loadFromMemory(): Promise<void> {
    try {
      const storedAgents = await this.memory.get(`${this.namespace}:registry`);
      if (storedAgents) {
        // Restore cached agents from memory
        for (const [key, entry] of Object.entries(storedAgents)) {
          this.cache.set(key, entry as AgentRegistryEntry);
        }
      }
    } catch (error) {
      console.error('Failed to load agents from memory:', error);
    }
  }

  private calculateAgentScore(
    agent: AgentState,
    taskType: string,
    requiredCapabilities: string[],
  ): number {
    // Comprehensive scoring logic
    let score = 0;

    // Basic type matching
    if (agent.type === taskType) {
      score += 50;
    }

    // Capability matching
    if (
      (agent.capabilities.domains && agent.capabilities.domains.includes(taskType)) ||
      (agent.capabilities.languages && agent.capabilities.languages.includes(taskType))
    ) {
      score += 30;
    }

    // Required capabilities
    for (const capability of requiredCapabilities) {
      if (
        (agent.capabilities.domains && agent.capabilities.domains.includes(capability)) ||
        (agent.capabilities.languages && agent.capabilities.languages.includes(capability))
      ) {
        score += 10;
      }
    }

    // Health bonus
    score += Math.floor(agent.health * 10);

    return score;
  }
}