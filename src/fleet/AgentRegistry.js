/**
 * AgentRegistry - Central repository for agent registration and discovery
 *
 * Features:
 * - Agent lifecycle management
 * - Capability tracking
 * - Performance metrics
 * - Health status monitoring
 * - Redis-backed persistence
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import crypto from 'crypto';

/**
 * AgentRegistry class
 */
export class AgentRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        ...options.redis
      },
      keyPrefix: 'fleet:agent:',
      indexKey: 'fleet:agents:index',
      poolsKey: 'fleet:pools:',
      ttl: 3600 // 1 hour
    };

    this.redis = null;
    this.isInitialized = false;
    this.localCache = new Map(); // Local cache for frequently accessed agents
    this.cacheTimeout = 30000; // 30 seconds
  }

  /**
   * Initialize the registry
   */
  async initialize() {
    try {
      this.redis = createClient(this.config.redis);
      await this.redis.connect();

      // Create indexes for efficient querying
      await this.createIndexes();

      this.isInitialized = true;
      this.emit('initialized', { registry: 'AgentRegistry' });

      console.log('📋 AgentRegistry initialized');
    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Register a new agent
   */
  async register(agent) {
    this.ensureInitialized();

    try {
      const agentId = agent.id || `agent-${crypto.randomBytes(8).toString('hex')}`;
      const agentData = {
        id: agentId,
        ...agent,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: 1
      };

      // Store agent data
      const agentKey = `${this.config.keyPrefix}${agentId}`;
      await this.redis.hSet(agentKey, this.flattenObject(agentData));
      await this.redis.expire(agentKey, this.config.ttl);

      // Add to indexes
      await this.addToIndexes(agentData);

      // Update local cache
      this.localCache.set(agentId, {
        data: agentData,
        timestamp: Date.now()
      });

      // Emit registration event
      this.emit('agent_registered', { agentId, agent: agentData });

      return agentId;
    } catch (error) {
      this.emit('error', { type: 'registration_failed', error: error.message, agentId: agent?.id });
      throw error;
    }
  }

  /**
   * Unregister an agent
   */
  async unregister(agentId) {
    this.ensureInitialized();

    try {
      const agent = await this.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      // Remove from Redis
      const agentKey = `${this.config.keyPrefix}${agentId}`;
      await this.redis.del(agentKey);

      // Remove from indexes
      await this.removeFromIndexes(agent);

      // Remove from local cache
      this.localCache.delete(agentId);

      // Emit unregistration event
      this.emit('agent_unregistered', { agentId, agent });

      return true;
    } catch (error) {
      this.emit('error', { type: 'unregistration_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  async get(agentId) {
    this.ensureInitialized();

    try {
      // Check local cache first
      const cached = this.localCache.get(agentId);
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached.data;
      }

      // Fetch from Redis
      const agentKey = `${this.config.keyPrefix}${agentId}`;
      const agentData = await this.redis.hGetAll(agentKey);

      if (!agentData || Object.keys(agentData).length === 0) {
        return null;
      }

      // Reconstruct nested objects
      const agent = this.reconstructObject(agentData);

      // Update local cache
      this.localCache.set(agentId, {
        data: agent,
        timestamp: Date.now()
      });

      return agent;
    } catch (error) {
      this.emit('error', { type: 'get_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Update agent data
   */
  async update(agentData) {
    this.ensureInitialized();

    try {
      const agentId = agentData.id;
      if (!agentId) {
        throw new Error('Agent ID is required for update');
      }

      const existingAgent = await this.get(agentId);
      if (!existingAgent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const updatedAgent = {
        ...existingAgent,
        ...agentData,
        updatedAt: Date.now(),
        version: (existingAgent.version || 1) + 1
      };

      // Store updated data
      const agentKey = `${this.config.keyPrefix}${agentId}`;
      await this.redis.hSet(agentKey, this.flattenObject(updatedAgent));
      await this.redis.expire(agentKey, this.config.ttl);

      // Update indexes if needed
      if (agentData.status !== existingAgent.status || agentData.type !== existingAgent.type) {
        await this.removeFromIndexes(existingAgent);
        await this.addToIndexes(updatedAgent);
      }

      // Update local cache
      this.localCache.set(agentId, {
        data: updatedAgent,
        timestamp: Date.now()
      });

      // Emit update event
      this.emit('agent_updated', { agentId, agent: updatedAgent, previousAgent: existingAgent });

      return updatedAgent;
    } catch (error) {
      this.emit('error', { type: 'update_failed', error: error.message, agentId: agentData.id });
      throw error;
    }
  }

  /**
   * Update agent status
   */
  async updateStatus(agentId, status) {
    return await this.update({ id: agentId, status });
  }

  /**
   * Update agent heartbeat
   */
  async updateHeartbeat(agentId, timestamp = Date.now()) {
    try {
      const agent = await this.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found`);
      }

      await this.update({
        id: agentId,
        health: {
          ...agent.health,
          lastHeartbeat: timestamp
        }
      });

      this.emit('heartbeat_updated', { agentId, timestamp });
    } catch (error) {
      this.emit('error', { type: 'heartbeat_update_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * List all agents
   */
  async listAll() {
    this.ensureInitialized();

    try {
      const agentIds = await this.redis.sMembers(this.config.indexKey);
      const agents = [];

      for (const agentId of agentIds) {
        const agent = await this.get(agentId);
        if (agent) {
          agents.push(agent);
        }
      }

      return agents;
    } catch (error) {
      this.emit('error', { type: 'list_all_failed', error: error.message });
      throw error;
    }
  }

  /**
   * List agents by type
   */
  async listByType(type) {
    this.ensureInitialized();

    try {
      const poolKey = `${this.config.poolsKey}${type}`;
      const agentIds = await this.redis.sMembers(poolKey);
      const agents = [];

      for (const agentId of agentIds) {
        const agent = await this.get(agentId);
        if (agent && agent.type === type) {
          agents.push(agent);
        }
      }

      return agents;
    } catch (error) {
      this.emit('error', { type: 'list_by_type_failed', error: error.message, type });
      throw error;
    }
  }

  /**
   * List agents by status
   */
  async listByStatus(status) {
    this.ensureInitialized();

    try {
      const allAgents = await this.listAll();
      return allAgents.filter(agent => agent.status === status);
    } catch (error) {
      this.emit('error', { type: 'list_by_status_failed', error: error.message, status });
      throw error;
    }
  }

  /**
   * Get idle agents for a specific type
   */
  async getIdleAgents(type, limit = 10) {
    this.ensureInitialized();

    try {
      const poolAgents = await this.listByType(type);
      const idleAgents = poolAgents
        .filter(agent => agent.status === 'idle')
        .sort((a, b) => (a.performance?.successRate || 0) - (b.performance?.successRate || 0))
        .slice(0, limit);

      return idleAgents.map(agent => agent.id);
    } catch (error) {
      this.emit('error', { type: 'get_idle_agents_failed', error: error.message, type });
      throw error;
    }
  }

  /**
   * Find agents by capabilities
   */
  async findByCapabilities(requiredCapabilities) {
    this.ensureInitialized();

    try {
      const allAgents = await this.listAll();
      return allAgents.filter(agent => {
        const agentCapabilities = agent.capabilities || [];
        return requiredCapabilities.every(cap => agentCapabilities.includes(cap));
      });
    } catch (error) {
      this.emit('error', { type: 'find_by_capabilities_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Get registry statistics
   */
  async getStats() {
    this.ensureInitialized();

    try {
      const allAgents = await this.listAll();
      const stats = {
        total: allAgents.length,
        byType: {},
        byStatus: {},
        averagePerformance: {
          tasksCompleted: 0,
          successRate: 0,
          averageTaskTime: 0
        },
        oldestAgent: null,
        newestAgent: null
      };

      let totalTasksCompleted = 0;
      let totalSuccessRate = 0;
      let totalAverageTaskTime = 0;
      let validPerformanceCount = 0;

      for (const agent of allAgents) {
        // By type
        stats.byType[agent.type] = (stats.byType[agent.type] || 0) + 1;

        // By status
        stats.byStatus[agent.status] = (stats.byStatus[agent.status] || 0) + 1;

        // Performance metrics
        if (agent.performance) {
          totalTasksCompleted += agent.performance.tasksCompleted || 0;
          totalSuccessRate += agent.performance.successRate || 0;
          totalAverageTaskTime += agent.performance.averageTaskTime || 0;
          validPerformanceCount++;
        }

        // Age tracking
        if (!stats.oldestAgent || agent.createdAt < stats.oldestAgent.createdAt) {
          stats.oldestAgent = agent;
        }
        if (!stats.newestAgent || agent.createdAt > stats.newestAgent.createdAt) {
          stats.newestAgent = agent;
        }
      }

      // Calculate averages
      if (validPerformanceCount > 0) {
        stats.averagePerformance.tasksCompleted = totalTasksCompleted / validPerformanceCount;
        stats.averagePerformance.successRate = totalSuccessRate / validPerformanceCount;
        stats.averagePerformance.averageTaskTime = totalAverageTaskTime / validPerformanceCount;
      }

      return stats;
    } catch (error) {
      this.emit('error', { type: 'get_stats_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup expired agents
   */
  async cleanup() {
    this.ensureInitialized();

    try {
      const allAgents = await this.listAll();
      const now = Date.now();
      const expiredThreshold = this.config.ttl * 1000; // Convert to milliseconds
      let cleanedCount = 0;

      for (const agent of allAgents) {
        const lastActive = agent.lastActive || agent.createdAt;
        if (now - lastActive > expiredThreshold) {
          await this.unregister(agent.id);
          cleanedCount++;
        }
      }

      // Cleanup local cache
      for (const [agentId, cached] of this.localCache.entries()) {
        if (now - cached.timestamp > this.cacheTimeout) {
          this.localCache.delete(agentId);
        }
      }

      this.emit('cleanup_completed', { cleanedCount });
      return cleanedCount;
    } catch (error) {
      this.emit('error', { type: 'cleanup_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Close the registry
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.localCache.clear();
    this.isInitialized = false;

    this.emit('closed', { registry: 'AgentRegistry' });
    console.log('📋 AgentRegistry closed');
  }

  /**
   * Private helper methods
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('AgentRegistry is not initialized. Call initialize() first.');
    }
  }

  async createIndexes() {
    // Create main agent index
    await this.redis.sAdd(this.config.indexKey, []);

    // Create pool indexes for each agent type
    const agentTypes = [
      'coder', 'tester', 'reviewer', 'architect', 'researcher',
      'analyst', 'optimizer', 'security', 'performance',
      'ui', 'mobile', 'devops', 'database', 'network',
      'infrastructure', 'coordinator'
    ];

    for (const type of agentTypes) {
      const poolKey = `${this.config.poolsKey}${type}`;
      await this.redis.sAdd(poolKey, []);
    }
  }

  async addToIndexes(agent) {
    // Add to main index
    await this.redis.sAdd(this.config.indexKey, agent.id);

    // Add to type-specific pool
    if (agent.type) {
      const poolKey = `${this.config.poolsKey}${agent.type}`;
      await this.redis.sAdd(poolKey, agent.id);
    }
  }

  async removeFromIndexes(agent) {
    // Remove from main index
    await this.redis.sRem(this.config.indexKey, agent.id);

    // Remove from type-specific pool
    if (agent.type) {
      const poolKey = `${this.config.poolsKey}${agent.type}`;
      await this.redis.sRem(poolKey, agent.id);
    }
  }

  flattenObject(obj, prefix = '') {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = JSON.stringify(value);
      }
    }

    return flattened;
  }

  reconstructObject(flatObj) {
    const obj = {};

    for (const [key, value] of Object.entries(flatObj)) {
      const keys = key.split('.');
      let current = obj;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Parse JSON values
      try {
        current[keys[keys.length - 1]] = JSON.parse(value);
      } catch {
        current[keys[keys.length - 1]] = value;
      }
    }

    return obj;
  }
}

export default AgentRegistry;