/**
 * ResourceAllocator - Intelligent resource allocation system for fleet management
 *
 * Features:
 * - Priority-based task assignment
 * - Load balancing across pools
 * - Dynamic scaling based on demand
 * - Resource pool management
 * - Performance optimization
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';

/**
 * Allocation strategies
 */
const ALLOCATION_STRATEGIES = {
  PRIORITY_BASED: 'priority_based',
  ROUND_ROBIN: 'round_robin',
  LEAST_LOADED: 'least_loaded',
  CAPABILITY_MATCH: 'capability_match',
  PERFORMANCE_BASED: 'performance_based'
};

/**
 * ResourceAllocator class
 */
export class ResourceAllocator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        ...options.redis
      },
      defaultStrategy: ALLOCATION_STRATEGIES.PRIORITY_BASED,
      allocationTimeout: 30000,
      pools: options.pools || {},
      keyPrefix: 'fleet:allocator:',
      poolsKey: 'fleet:pools:',
      allocationsKey: 'fleet:allocations:'
    };

    this.redis = null;
    this.isInitialized = false;
    this.pools = new Map();
    this.allocations = new Map();
    this.roundRobinCounters = new Map();
  }

  /**
   * Initialize the allocator
   */
  async initialize() {
    try {
      this.redis = createClient(this.config.redis);
      await this.redis.connect();

      // Load existing pools and allocations
      await this.loadPools();
      await this.loadAllocations();

      this.isInitialized = true;
      this.emit('initialized', { allocator: 'ResourceAllocator' });

      console.log('⚖️ ResourceAllocator initialized');
    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Create a new agent pool
   */
  async createPool(poolType, poolConfig) {
    this.ensureInitialized();

    try {
      const pool = {
        type: poolType,
        minAgents: poolConfig.min || 1,
        maxAgents: poolConfig.max || 10,
        currentAgents: 0,
        priorityLevel: poolConfig.priority || 5,
        resourceLimits: poolConfig.resources || { memory: 256, cpu: 0.5 },
        scalingEnabled: poolConfig.scalingEnabled !== false,
        agents: new Set(),
        metrics: {
          totalAllocations: 0,
          activeAllocations: 0,
          averageUtilization: 0,
          lastAllocationTime: null,
          lastScaleTime: null
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Store pool
      this.pools.set(poolType, pool);

      // Persist to Redis
      await this.persistPool(pool);

      // Initialize round robin counter
      this.roundRobinCounters.set(poolType, 0);

      this.emit('pool_created', { poolType, pool });
      console.log(`🏊 Created pool ${poolType} with min=${pool.minAgents}, max=${pool.maxAgents}`);

      return pool;
    } catch (error) {
      this.emit('error', { type: 'pool_creation_failed', error: error.message, poolType });
      throw error;
    }
  }

  /**
   * Allocate an agent for a task
   */
  async allocate(taskRequirements) {
    this.ensureInitialized();

    try {
      const allocationId = `alloc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const strategy = taskRequirements.strategy || this.config.defaultStrategy;

      // Find suitable agent
      const agent = await this.findSuitableAgent(taskRequirements, strategy);

      if (!agent) {
        throw new Error('No suitable agent available for task requirements');
      }

      // Create allocation
      const allocation = {
        id: allocationId,
        agentId: agent.id,
        poolType: agent.type,
        taskId: taskRequirements.taskId,
        strategy,
        requirements: taskRequirements,
        status: 'allocated',
        allocatedAt: Date.now(),
        timeoutAt: Date.now() + this.config.allocationTimeout,
        agent: agent
      };

      // Store allocation
      this.allocations.set(allocationId, allocation);

      // Update pool metrics
      const pool = this.pools.get(agent.type);
      if (pool) {
        pool.metrics.totalAllocations++;
        pool.metrics.activeAllocations++;
        pool.metrics.lastAllocationTime = Date.now();
        pool.updatedAt = Date.now();
        await this.persistPool(pool);
      }

      // Persist allocation
      await this.persistAllocation(allocation);

      this.emit('agent_allocated', { allocationId, agent, task: taskRequirements });

      return {
        allocationId,
        agentId: agent.id,
        poolType: agent.type,
        agent: agent
      };
    } catch (error) {
      this.emit('error', { type: 'allocation_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Release an allocation
   */
  async release(allocationId, result = {}) {
    this.ensureInitialized();

    try {
      const allocation = this.allocations.get(allocationId);
      if (!allocation) {
        throw new Error(`Allocation ${allocationId} not found`);
      }

      // Update allocation status
      allocation.status = 'released';
      allocation.releasedAt = Date.now();
      allocation.result = result;

      // Update pool metrics
      const pool = this.pools.get(allocation.poolType);
      if (pool) {
        pool.metrics.activeAllocations--;
        pool.updatedAt = Date.now();
        await this.persistPool(pool);
      }

      // Remove from active allocations
      this.allocations.delete(allocationId);

      // Persist allocation
      await this.persistAllocation(allocation);

      this.emit('allocation_released', { allocationId, result });

      return true;
    } catch (error) {
      this.emit('error', { type: 'release_failed', error: error.message, allocationId });
      throw error;
    }
  }

  /**
   * Add agent to pool
   */
  async addAgentToPool(poolType, agent) {
    this.ensureInitialized();

    try {
      const pool = this.pools.get(poolType);
      if (!pool) {
        throw new Error(`Pool ${poolType} not found`);
      }

      if (pool.agents.has(agent.id)) {
        throw new Error(`Agent ${agent.id} already exists in pool ${poolType}`);
      }

      if (pool.currentAgents >= pool.maxAgents) {
        throw new Error(`Pool ${poolType} is at maximum capacity (${pool.maxAgents})`);
      }

      // Add agent to pool
      pool.agents.add(agent.id);
      pool.currentAgents++;
      pool.updatedAt = Date.now();

      // Persist pool
      await this.persistPool(pool);

      this.emit('agent_added_to_pool', { poolType, agentId: agent.id });

      return true;
    } catch (error) {
      this.emit('error', { type: 'add_agent_failed', error: error.message, poolType, agentId: agent.id });
      throw error;
    }
  }

  /**
   * Remove agent from pool
   */
  async removeAgentFromPool(poolType, agentId) {
    this.ensureInitialized();

    try {
      const pool = this.pools.get(poolType);
      if (!pool) {
        throw new Error(`Pool ${poolType} not found`);
      }

      if (!pool.agents.has(agentId)) {
        throw new Error(`Agent ${agentId} not found in pool ${poolType}`);
      }

      // Check if agent has active allocations
      const activeAllocations = Array.from(this.allocations.values())
        .filter(alloc => alloc.agentId === agentId && alloc.status === 'allocated');

      if (activeAllocations.length > 0) {
        throw new Error(`Agent ${agentId} has ${activeAllocations.length} active allocations`);
      }

      // Remove agent from pool
      pool.agents.delete(agentId);
      pool.currentAgents--;
      pool.updatedAt = Date.now();

      // Persist pool
      await this.persistPool(pool);

      this.emit('agent_removed_from_pool', { poolType, agentId });

      return true;
    } catch (error) {
      this.emit('error', { type: 'remove_agent_failed', error: error.message, poolType, agentId });
      throw error;
    }
  }

  /**
   * Get pool status
   */
  async getPoolStatus(poolType = null) {
    this.ensureInitialized();

    try {
      if (poolType) {
        const pool = this.pools.get(poolType);
        if (!pool) {
          throw new Error(`Pool ${poolType} not found`);
        }

        return {
          type: pool.type,
          currentAgents: pool.currentAgents,
          minAgents: pool.minAgents,
          maxAgents: pool.maxAgents,
          priorityLevel: pool.priorityLevel,
          resourceLimits: pool.resourceLimits,
          scalingEnabled: pool.scalingEnabled,
          utilization: pool.currentAgents / pool.maxAgents,
          metrics: { ...pool.metrics }
        };
      } else {
        const status = {};
        for (const [type, pool] of this.pools.entries()) {
          status[type] = {
            type: pool.type,
            currentAgents: pool.currentAgents,
            minAgents: pool.minAgents,
            maxAgents: pool.maxAgents,
            priorityLevel: pool.priorityLevel,
            utilization: pool.currentAgents / pool.maxAgents,
            metrics: { ...pool.metrics }
          };
        }
        return status;
      }
    } catch (error) {
      this.emit('error', { type: 'get_pool_status_failed', error: error.message, poolType });
      throw error;
    }
  }

  /**
   * Get pool
   */
  async getPool(poolType) {
    return this.pools.get(poolType);
  }

  /**
   * Get allocation statistics
   */
  async getAllocationStats() {
    this.ensureInitialized();

    try {
      const activeAllocations = Array.from(this.allocations.values())
        .filter(alloc => alloc.status === 'allocated');

      const stats = {
        totalAllocations: this.allocations.size,
        activeAllocations: activeAllocations.length,
        byStrategy: {},
        byPoolType: {},
        averageAllocationTime: 0,
        timeoutRate: 0
      };

      let totalAllocationTime = 0;
      let timeoutCount = 0;

      for (const allocation of this.allocations.values()) {
        // By strategy
        stats.byStrategy[allocation.strategy] = (stats.byStrategy[allocation.strategy] || 0) + 1;

        // By pool type
        stats.byPoolType[allocation.poolType] = (stats.byPoolType[allocation.poolType] || 0) + 1;

        // Calculate allocation time
        if (allocation.releasedAt) {
          const allocationTime = allocation.releasedAt - allocation.allocatedAt;
          totalAllocationTime += allocationTime;
        }

        // Count timeouts
        if (allocation.status === 'timeout') {
          timeoutCount++;
        }
      }

      const completedAllocations = this.allocations.size - activeAllocations.length;
      if (completedAllocations > 0) {
        stats.averageAllocationTime = totalAllocationTime / completedAllocations;
        stats.timeoutRate = timeoutCount / completedAllocations;
      }

      return stats;
    } catch (error) {
      this.emit('error', { type: 'get_allocation_stats_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup expired allocations
   */
  async cleanupExpiredAllocations() {
    this.ensureInitialized();

    try {
      const now = Date.now();
      const expiredAllocations = [];

      for (const [allocationId, allocation] of this.allocations.entries()) {
        if (allocation.status === 'allocated' && now > allocation.timeoutAt) {
          allocation.status = 'timeout';
          allocation.expiredAt = now;
          expiredAllocations.push(allocation);

          // Update pool metrics
          const pool = this.pools.get(allocation.poolType);
          if (pool) {
            pool.metrics.activeAllocations--;
            await this.persistPool(pool);
          }
        }
      }

      // Remove expired allocations from active tracking
      for (const allocation of expiredAllocations) {
        this.allocations.delete(allocation.id);
        await this.persistAllocation(allocation);
      }

      this.emit('cleanup_completed', { expiredCount: expiredAllocations.length });
      return expiredAllocations.length;
    } catch (error) {
      this.emit('error', { type: 'cleanup_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Close the allocator
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.pools.clear();
    this.allocations.clear();
    this.roundRobinCounters.clear();
    this.isInitialized = false;

    this.emit('closed', { allocator: 'ResourceAllocator' });
    console.log('⚖️ ResourceAllocator closed');
  }

  /**
   * Private helper methods
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('ResourceAllocator is not initialized. Call initialize() first.');
    }
  }

  async findSuitableAgent(taskRequirements, strategy) {
    const requiredCapabilities = taskRequirements.capabilities || [];
    const preferredPoolType = taskRequirements.poolType;

    // Filter pools by type if specified
    let candidatePools = Array.from(this.pools.values());
    if (preferredPoolType) {
      candidatePools = candidatePools.filter(pool => pool.type === preferredPoolType);
    }

    // Find agents with required capabilities
    let candidateAgents = [];
    for (const pool of candidatePools) {
      for (const agentId of pool.agents) {
        // This would normally fetch from AgentRegistry
        // For now, we'll assume the agent has the required capabilities
        candidateAgents.push({
          id: agentId,
          type: pool.type,
          priority: pool.priorityLevel,
          // Mock agent data - in real implementation, fetch from registry
          capabilities: this.getPoolCapabilities(pool.type),
          status: 'idle',
          performance: { successRate: 0.9, averageTaskTime: 1000 }
        });
      }
    }

    // Filter by capabilities
    if (requiredCapabilities.length > 0) {
      candidateAgents = candidateAgents.filter(agent =>
        requiredCapabilities.every(cap => agent.capabilities.includes(cap))
      );
    }

    if (candidateAgents.length === 0) {
      return null;
    }

    // Apply allocation strategy
    switch (strategy) {
      case ALLOCATION_STRATEGIES.PRIORITY_BASED:
        return this.selectByPriority(candidateAgents);

      case ALLOCATION_STRATEGIES.ROUND_ROBIN:
        return this.selectByRoundRobin(candidateAgents);

      case ALLOCATION_STRATEGIES.LEAST_LOADED:
        return this.selectByLeastLoaded(candidateAgents);

      case ALLOCATION_STRATEGIES.CAPABILITY_MATCH:
        return this.selectByCapabilityMatch(candidateAgents, requiredCapabilities);

      case ALLOCATION_STRATEGIES.PERFORMANCE_BASED:
        return this.selectByPerformance(candidateAgents);

      default:
        return this.selectByPriority(candidateAgents);
    }
  }

  selectByPriority(agents) {
    return agents.sort((a, b) => b.priority - a.priority)[0];
  }

  selectByRoundRobin(agents) {
    const poolType = agents[0].type;
    const counter = this.roundRobinCounters.get(poolType) || 0;
    const selectedAgent = agents[counter % agents.length];
    this.roundRobinCounters.set(poolType, counter + 1);
    return selectedAgent;
  }

  selectByLeastLoaded(agents) {
    // Sort by pool utilization (fewer active allocations)
    return agents.sort((a, b) => {
      const poolA = this.pools.get(a.type);
      const poolB = this.pools.get(b.type);
      const utilizationA = poolA ? poolA.metrics.activeAllocations / poolA.currentAgents : 1;
      const utilizationB = poolB ? poolB.metrics.activeAllocations / poolB.currentAgents : 1;
      return utilizationA - utilizationB;
    })[0];
  }

  selectByCapabilityMatch(agents, requiredCapabilities) {
    return agents.sort((a, b) => {
      const matchScoreA = this.calculateCapabilityMatchScore(a.capabilities, requiredCapabilities);
      const matchScoreB = this.calculateCapabilityMatchScore(b.capabilities, requiredCapabilities);
      return matchScoreB - matchScoreA;
    })[0];
  }

  selectByPerformance(agents) {
    return agents.sort((a, b) => {
      const scoreA = (a.performance.successRate || 0) * 0.7 + (1 / (a.performance.averageTaskTime || 1)) * 0.3;
      const scoreB = (b.performance.successRate || 0) * 0.7 + (1 / (b.performance.averageTaskTime || 1)) * 0.3;
      return scoreB - scoreA;
    })[0];
  }

  calculateCapabilityMatchScore(agentCapabilities, requiredCapabilities) {
    if (requiredCapabilities.length === 0) return 1;

    const matches = requiredCapabilities.filter(cap => agentCapabilities.includes(cap));
    return matches.length / requiredCapabilities.length;
  }

  getPoolCapabilities(poolType) {
    const capabilities = {
      coder: ['javascript', 'typescript', 'python', 'java'],
      tester: ['unit-testing', 'integration-testing', 'e2e-testing'],
      reviewer: ['code-review', 'security-review', 'performance-review'],
      architect: ['system-design', 'api-design', 'database-design'],
      researcher: ['information-gathering', 'analysis', 'documentation'],
      analyst: ['data-analysis', 'statistical-analysis', 'reporting'],
      optimizer: ['performance-optimization', 'code-optimization'],
      security: ['security-audit', 'vulnerability-assessment'],
      performance: ['performance-testing', 'load-testing', 'profiling'],
      ui: ['frontend-development', 'ux-design', 'responsive-design'],
      mobile: ['mobile-development', 'ios', 'android'],
      devops: ['ci-cd', 'deployment', 'infrastructure'],
      database: ['database-design', 'sql', 'nosql'],
      network: ['network-configuration', 'protocols', 'security'],
      infrastructure: ['cloud-services', 'containerization', 'orchestration'],
      coordinator: ['project-management', 'coordination', 'planning']
    };

    return capabilities[poolType] || [];
  }

  async persistPool(pool) {
    const poolKey = `${this.config.poolsKey}${pool.type}`;
    const poolData = {
      ...pool,
      agents: Array.from(pool.agents)
    };
    await this.redis.hSet(poolKey, this.flattenObject(poolData));
  }

  async persistAllocation(allocation) {
    const allocationKey = `${this.config.allocationsKey}${allocation.id}`;
    await this.redis.hSet(allocationKey, this.flattenObject(allocation));
    await this.redis.expire(allocationKey, this.config.allocationTimeout / 1000);
  }

  async loadPools() {
    try {
      const keys = await this.redis.keys(`${this.config.poolsKey}*`);
      for (const key of keys) {
        const poolData = await this.redis.hGetAll(key);
        if (Object.keys(poolData).length > 0) {
          const pool = this.reconstructObject(poolData);
          pool.agents = new Set(pool.agents);
          this.pools.set(pool.type, pool);
          this.roundRobinCounters.set(pool.type, 0);
        }
      }
    } catch (error) {
      console.warn('Failed to load pools from Redis:', error.message);
    }
  }

  async loadAllocations() {
    try {
      const keys = await this.redis.keys(`${this.config.allocationsKey}*`);
      for (const key of keys) {
        const allocationData = await this.redis.hGetAll(key);
        if (Object.keys(allocationData).length > 0) {
          const allocation = this.reconstructObject(allocationData);
          if (allocation.status === 'allocated') {
            this.allocations.set(allocation.id, allocation);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load allocations from Redis:', error.message);
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

export default ResourceAllocator;