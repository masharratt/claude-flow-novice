/**
 * ResourceOptimizer - Advanced resource optimization algorithms for 100+ concurrent agents
 *
 * Features:
 * - CPU and memory optimization algorithms
 * - Load balancing across agent pools
 * - Resource isolation and prioritization
 * - Automatic resource cleanup
 * - Performance monitoring and analysis
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import os from 'os';
import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';

/**
 * Resource optimization configuration
 */
const OPTIMIZATION_CONFIG = {
  // Resource thresholds
  cpuThreshold: 0.80,              // 80% CPU usage threshold
  memoryThreshold: 0.85,           // 85% memory usage threshold
  diskThreshold: 0.90,             // 90% disk usage threshold

  // Optimization intervals
  monitoringInterval: 5000,        // 5 seconds
  optimizationInterval: 30000,     // 30 seconds
  cleanupInterval: 300000,         // 5 minutes
  analysisInterval: 60000,         // 1 minute

  // Resource allocation
  defaultAgentResources: {
    memory: 256,                   // MB per agent
    cpu: 0.5,                      // CPU cores per agent
    disk: 100                      // MB disk space per agent
  },

  // Priority levels
  priorities: {
    critical: 10,
    high: 8,
    normal: 5,
    low: 3,
    background: 1
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Optimization strategies
  strategies: {
    load_balancing: 'weighted_round_robin',
    resource_allocation: 'dynamic_fit',
    cleanup: 'lru_with_priority',
    analysis: 'performance_based'
  }
};

/**
 * Resource types
 */
const RESOURCE_TYPES = {
  CPU: 'cpu',
  MEMORY: 'memory',
  DISK: 'disk',
  NETWORK: 'network',
  AGENT: 'agent',
  TASK: 'task'
};

/**
 * Optimization algorithms
 */
const OPTIMIZATION_ALGORITHMS = {
  WEIGHTED_ROUND_ROBIN: 'weighted_round_robin',
  LEAST_CONNECTIONS: 'least_connections',
  RESOURCE_BASED: 'resource_based',
  PERFORMANCE_BASED: 'performance_based',
  PREDICTIVE_ALLOCATION: 'predictive_allocation'
};

/**
 * ResourceOptimizer class
 */
export class ResourceOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...OPTIMIZATION_CONFIG, ...options };
    this.optimizerId = `resource-optimizer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis client
    this.redis = null;

    // System state
    this.isInitialized = false;
    this.isRunning = false;

    // Resource tracking
    this.resources = {
      system: {
        cpu: { total: os.cpus().length, used: 0, available: 0 },
        memory: { total: os.totalmem(), used: 0, available: 0 },
        disk: { total: 0, used: 0, available: 0 },
        network: { bandwidth: 0, used: 0, available: 0 }
      },
      allocated: {
        agents: new Map(),
        tasks: new Map(),
        pools: new Map()
      },
      available: {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0
      }
    };

    // Performance metrics
    this.metrics = {
      optimization: {
        totalOptimizations: 0,
        successfulOptimizations: 0,
        averageOptimizationTime: 0,
        resourceUtilization: 0,
        efficiency: 0
      },
      allocation: {
        totalAllocations: 0,
        failedAllocations: 0,
        reallocations: 0,
        averageAllocationTime: 0
      },
      cleanup: {
        totalCleanups: 0,
        resourcesRecovered: 0,
        averageCleanupTime: 0
      }
    };

    // Resource pools
    this.resourcePools = new Map();
    this.allocationQueue = [];
    this.optimizationHistory = [];

    // Monitoring data
    this.monitoringData = [];
    this.performanceData = [];

    // Timers
    this.monitoringTimer = null;
    this.optimizationTimer = null;
    this.cleanupTimer = null;
    this.analysisTimer = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the resource optimizer
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Resource Optimizer' });

      // Initialize Redis connection
      await this.initializeRedis();

      // Initialize resource tracking
      await this.initializeResourceTracking();

      // Create resource pools
      await this.createResourcePools();

      // Start monitoring and optimization
      this.startOptimizationProcesses();

      this.isInitialized = true;
      this.isRunning = true;

      // Publish optimizer startup
      await this.publishOptimizationEvent({
        type: 'optimizer_started',
        optimizerId: this.optimizerId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'Resource Optimizer initialized successfully' });
      console.log(`🚀 Resource Optimizer ${this.optimizerId} initialized`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async initializeRedis() {
    this.redis = createClient(this.config.redis);
    await this.redis.connect();

    console.log('📡 Redis connection established for resource optimizer');
  }

  /**
   * Initialize resource tracking
   */
  async initializeResourceTracking() {
    // Get initial system resources
    await this.updateSystemResources();

    // Load existing allocations from Redis
    await this.loadExistingAllocations();

    console.log('📊 Resource tracking initialized');
  }

  /**
   * Create resource pools
   */
  async createResourcePools() {
    const poolTypes = [
      { name: 'high_priority', priority: 10, resources: { cpu: 0.8, memory: 0.7 } },
      { name: 'normal_priority', priority: 5, resources: { cpu: 0.6, memory: 0.5 } },
      { name: 'low_priority', priority: 1, resources: { cpu: 0.4, memory: 0.3 } }
    ];

    for (const poolType of poolTypes) {
      const pool = {
        name: poolType.name,
        priority: poolType.priority,
        resources: poolType.resources,
        allocated: new Map(),
        utilization: 0,
        lastOptimized: Date.now()
      };

      this.resourcePools.set(poolType.name, pool);
    }

    console.log('🏊 Resource pools created');
  }

  /**
   * Start optimization processes
   */
  startOptimizationProcesses() {
    // Resource monitoring
    this.monitoringTimer = setInterval(async () => {
      await this.monitorResources();
    }, this.config.monitoringInterval);

    // Resource optimization
    this.optimizationTimer = setInterval(async () => {
      await this.optimizeResources();
    }, this.config.optimizationInterval);

    // Resource cleanup
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupResources();
    }, this.config.cleanupInterval);

    // Performance analysis
    this.analysisTimer = setInterval(async () => {
      await this.analyzePerformance();
    }, this.config.analysisInterval);

    console.log('🔄 Optimization processes started');
  }

  /**
   * Monitor system resources
   */
  async monitorResources() {
    try {
      const startTime = performance.now();

      // Update system resources
      await this.updateSystemResources();

      // Collect resource metrics
      const resourceMetrics = {
        timestamp: Date.now(),
        system: { ...this.resources.system },
        allocated: {
          agents: this.resources.allocated.agents.size,
          tasks: this.resources.allocated.tasks.size,
          pools: Array.from(this.resourcePools.entries()).map(([name, pool]) => ({
            name,
            utilization: pool.utilization,
            allocatedCount: pool.allocated.size
          }))
        },
        available: { ...this.resources.available }
      };

      // Store monitoring data
      this.monitoringData.push(resourceMetrics);

      // Keep monitoring data size manageable
      if (this.monitoringData.length > 1000) {
        this.monitoringData = this.monitoringData.slice(-500);
      }

      // Calculate utilization
      this.calculateResourceUtilization();

      // Check for resource thresholds
      await this.checkResourceThresholds();

      // Publish metrics
      await this.publishOptimizationEvent({
        type: 'resource_metrics',
        metrics: resourceMetrics,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'monitoring_failed', error: error.message });
    }
  }

  /**
   * Update system resources
   */
  async updateSystemResources() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();

    // CPU resources
    this.resources.system.cpu = {
      total: cpus.length,
      used: loadAvg[0], // 1-minute load average
      available: Math.max(0, cpus.length - loadAvg[0])
    };

    // Memory resources
    this.resources.system.memory = {
      total: totalMem,
      used: totalMem - freeMem,
      available: freeMem
    };

    // Calculate available resources
    this.resources.available.cpu = this.resources.system.cpu.available;
    this.resources.available.memory = this.resources.system.memory.available;
  }

  /**
   * Calculate resource utilization
   */
  calculateResourceUtilization() {
    const totalCPU = this.resources.system.cpu.total;
    const totalMemory = this.resources.system.memory.total;

    let usedCPU = 0;
    let usedMemory = 0;

    // Calculate allocated resources
    for (const [agentId, allocation] of this.resources.allocated.agents) {
      usedCPU += allocation.resources.cpu;
      usedMemory += allocation.resources.memory;
    }

    const cpuUtilization = totalCPU > 0 ? usedCPU / totalCPU : 0;
    const memoryUtilization = totalMemory > 0 ? usedMemory / totalMemory : 0;

    this.metrics.optimization.resourceUtilization = (cpuUtilization + memoryUtilization) / 2;
  }

  /**
   * Check resource thresholds
   */
  async checkResourceThresholds() {
    const utilization = this.metrics.optimization.resourceUtilization;

    if (utilization > this.config.cpuThreshold) {
      await this.publishOptimizationEvent({
        type: 'resource_alert',
        alertType: 'high_cpu',
        utilization,
        threshold: this.config.cpuThreshold,
        timestamp: Date.now()
      });

      // Trigger immediate optimization
      await this.optimizeResources();
    }

    if (utilization > this.config.memoryThreshold) {
      await this.publishOptimizationEvent({
        type: 'resource_alert',
        alertType: 'high_memory',
        utilization,
        threshold: this.config.memoryThreshold,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Optimize resources
   */
  async optimizeResources() {
    try {
      const startTime = performance.now();
      this.metrics.optimization.totalOptimizations++;

      // Analyze current allocation
      const analysis = await this.analyzeResourceAllocation();

      // Identify optimization opportunities
      const optimizations = await this.identifyOptimizations(analysis);

      // Apply optimizations
      let successfulOptimizations = 0;
      for (const optimization of optimizations) {
        try {
          await this.applyOptimization(optimization);
          successfulOptimizations++;
        } catch (error) {
          console.warn('Failed to apply optimization:', error.message);
        }
      }

      // Update metrics
      const duration = performance.now() - startTime;
      this.updateOptimizationMetrics(duration, successfulOptimizations);

      // Record optimization history
      this.optimizationHistory.push({
        timestamp: Date.now(),
        duration,
        optimizations: optimizations.length,
        successful: successfulOptimizations,
        analysis
      });

      // Keep history manageable
      if (this.optimizationHistory.length > 100) {
        this.optimizationHistory = this.optimizationHistory.slice(-50);
      }

      // Publish optimization results
      await this.publishOptimizationEvent({
        type: 'optimization_completed',
        duration,
        optimizations: optimizations.length,
        successful: successfulOptimizations,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'optimization_failed', error: error.message });
    }
  }

  /**
   * Analyze resource allocation
   */
  async analyzeResourceAllocation() {
    const analysis = {
      totalAllocations: this.resources.allocated.agents.size,
      resourceUtilization: this.metrics.optimization.resourceUtilization,
      poolUtilization: {},
      efficiency: 0,
      recommendations: []
    };

    // Analyze pool utilization
    for (const [poolName, pool] of this.resourcePools) {
      const poolUtilization = this.calculatePoolUtilization(pool);
      analysis.poolUtilization[poolName] = poolUtilization;

      // Generate recommendations
      if (poolUtilization > 0.9) {
        analysis.recommendations.push({
          type: 'scale_pool',
          pool: poolName,
          action: 'increase',
          reason: 'High utilization'
        });
      } else if (poolUtilization < 0.3) {
        analysis.recommendations.push({
          type: 'scale_pool',
          pool: poolName,
          action: 'decrease',
          reason: 'Low utilization'
        });
      }
    }

    // Calculate efficiency
    analysis.efficiency = this.calculateEfficiency();

    return analysis;
  }

  /**
   * Calculate pool utilization
   */
  calculatePoolUtilization(pool) {
    if (pool.allocated.size === 0) return 0;

    let totalUtilization = 0;
    for (const allocation of pool.allocated.values()) {
      totalUtilization += allocation.utilization || 0;
    }

    return totalUtilization / pool.allocated.size;
  }

  /**
   * Calculate system efficiency
   */
  calculateEfficiency() {
    // Efficiency = (successful allocations / total allocations) * resource utilization
    const allocationEfficiency = this.metrics.allocation.totalAllocations > 0 ?
      (this.metrics.allocation.totalAllocations - this.metrics.allocation.failedAllocations) / this.metrics.allocation.totalAllocations : 0;

    const resourceEfficiency = this.metrics.optimization.resourceUtilization;

    return (allocationEfficiency + resourceEfficiency) / 2;
  }

  /**
   * Identify optimization opportunities
   */
  async identifyOptimizations(analysis) {
    const optimizations = [];

    // Resource reallocation optimizations
    for (const [agentId, allocation] of this.resources.allocated.agents) {
      if (allocation.utilization < 0.3 && allocation.priority < 8) {
        optimizations.push({
          type: 'reallocate',
          agentId,
          reason: 'Low utilization',
          priority: allocation.priority
        });
      }
    }

    // Pool balancing optimizations
    const poolUtilizations = Object.entries(analysis.poolUtilization);
    if (poolUtilizations.length > 1) {
      const maxPool = poolUtilizations.reduce((max, curr) => curr[1] > max[1] ? curr : max);
      const minPool = poolUtilizations.reduce((min, curr) => curr[1] < min[1] ? curr : min);

      if (maxPool[1] - minPool[1] > 0.4) {
        optimizations.push({
          type: 'balance_pools',
          sourcePool: maxPool[0],
          targetPool: minPool[0],
          reason: 'Pool imbalance'
        });
      }
    }

    // Resource cleanup optimizations
    const now = Date.now();
    for (const [task_id, allocation] of this.resources.allocated.tasks) {
      if (now - allocation.timestamp > 300000 && allocation.status === 'completed') {
        optimizations.push({
          type: 'cleanup',
          task_id,
          reason: 'Completed task allocation'
        });
      }
    }

    // Sort by priority
    optimizations.sort((a, b) => (b.priority || 5) - (a.priority || 5));

    return optimizations.slice(0, 10); // Limit to 10 optimizations per cycle
  }

  /**
   * Apply optimization
   */
  async applyOptimization(optimization) {
    switch (optimization.type) {
      case 'reallocate':
        await this.reallocateResource(optimization);
        break;
      case 'balance_pools':
        await this.balancePools(optimization);
        break;
      case 'cleanup':
        await this.cleanupAllocation(optimization);
        break;
      default:
        console.warn('Unknown optimization type:', optimization.type);
    }
  }

  /**
   * Reallocate resource
   */
  async reallocateResource(optimization) {
    const allocation = this.resources.allocated.agents.get(optimization.agentId);
    if (!allocation) return;

    // Find better pool
    const targetPool = this.findOptimalPool(allocation);
    if (targetPool && targetPool.name !== allocation.pool) {
      // Move allocation to better pool
      await this.moveAllocation(allocation, targetPool);
    }
  }

  /**
   * Balance pools
   */
  async balancePools(optimization) {
    const sourcePool = this.resourcePools.get(optimization.sourcePool);
    const targetPool = this.resourcePools.get(optimization.targetPool);

    if (!sourcePool || !targetPool) return;

    // Move some allocations from source to target
    const allocationsToMove = Array.from(sourcePool.allocated.values()).slice(0, 5);
    for (const allocation of allocationsToMove) {
      await this.moveAllocation(allocation, targetPool);
    }
  }

  /**
   * Find optimal pool for allocation
   */
  findOptimalPool(allocation) {
    let optimalPool = null;
    let bestScore = -1;

    for (const pool of this.resourcePools.values()) {
      const score = this.calculatePoolScore(pool, allocation);
      if (score > bestScore) {
        bestScore = score;
        optimalPool = pool;
      }
    }

    return optimalPool;
  }

  /**
   * Calculate pool score for allocation
   */
  calculatePoolScore(pool, allocation) {
    // Factors: utilization, priority match, resource availability
    const utilizationScore = 1 - pool.utilization;
    const priorityScore = pool.priority >= allocation.priority ? 1 : 0.5;
    const resourceScore = this.calculateResourceAvailability(pool, allocation);

    return (utilizationScore * 0.4) + (priorityScore * 0.3) + (resourceScore * 0.3);
  }

  /**
   * Calculate resource availability
   */
  calculateResourceAvailability(pool, allocation) {
    // Simplified calculation - in production would be more sophisticated
    const maxUtilization = 0.8;
    return pool.utilization < maxUtilization ? 1 : 0;
  }

  /**
   * Move allocation between pools
   */
  async moveAllocation(allocation, targetPool) {
    // Remove from current pool
    const currentPool = this.resourcePools.get(allocation.pool);
    if (currentPool) {
      currentPool.allocated.delete(allocation.agentId);
    }

    // Add to target pool
    targetPool.allocated.set(allocation.agentId, allocation);
    allocation.pool = targetPool.name;

    // Update pool utilizations
    this.updatePoolUtilization(currentPool);
    this.updatePoolUtilization(targetPool);
  }

  /**
   * Update pool utilization
   */
  updatePoolUtilization(pool) {
    if (!pool) return;

    let totalUtilization = 0;
    for (const allocation of pool.allocated.values()) {
      totalUtilization += allocation.utilization || 0;
    }

    pool.utilization = pool.allocated.size > 0 ? totalUtilization / pool.allocated.size : 0;
    pool.lastOptimized = Date.now();
  }

  /**
   * Cleanup resources
   */
  async cleanupResources() {
    try {
      const startTime = performance.now();
      this.metrics.cleanup.totalCleanups++;

      let resourcesRecovered = 0;

      // Cleanup completed task allocations
      const now = Date.now();
      const tasksToCleanup = [];

      for (const [taskId, allocation] of this.resources.allocated.tasks) {
        const age = now - allocation.timestamp;
        const isStale = age > 600000; // 10 minutes
        const isCompleted = allocation.status === 'completed';

        if (isCompleted || isStale) {
          tasksToCleanup.push(taskId);
        }
      }

      // Remove stale allocations
      for (const taskId of tasksToCleanup) {
        const allocation = this.resources.allocated.tasks.get(taskId);
        if (allocation) {
          this.resources.allocated.tasks.delete(taskId);
          resourcesRecovered += allocation.resources.memory || 0;
        }
      }

      // Cleanup monitoring data
      const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours
      this.monitoringData = this.monitoringData.filter(data => data.timestamp > cutoffTime);

      // Update metrics
      const duration = performance.now() - startTime;
      this.metrics.cleanup.resourcesRecovered += resourcesRecovered;
      this.metrics.cleanup.averageCleanupTime =
        (this.metrics.cleanup.averageCleanupTime * (this.metrics.cleanup.totalCleanups - 1) + duration) / this.metrics.cleanup.totalCleanups;

      // Publish cleanup results
      await this.publishOptimizationEvent({
        type: 'cleanup_completed',
        duration,
        resourcesRecovered,
        tasksCleaned: tasksToCleanup.length,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'cleanup_failed', error: error.message });
    }
  }

  /**
   * Analyze performance
   */
  async analyzePerformance() {
    try {
      const analysis = {
        timestamp: Date.now(),
        efficiency: this.calculateEfficiency(),
        utilization: this.metrics.optimization.resourceUtilization,
        allocationSuccessRate: this.calculateAllocationSuccessRate(),
        optimizationFrequency: this.calculateOptimizationFrequency(),
        recommendations: []
      };

      // Generate recommendations
      if (analysis.efficiency < 0.7) {
        analysis.recommendations.push({
          type: 'efficiency',
          message: 'Low system efficiency detected',
          suggestion: 'Consider adjusting resource allocation thresholds'
        });
      }

      if (analysis.utilization > 0.9) {
        analysis.recommendations.push({
          type: 'utilization',
          message: 'High resource utilization',
          suggestion: 'Consider scaling up or optimizing resource usage'
        });
      }

      // Store performance data
      this.performanceData.push(analysis);

      // Keep performance data manageable
      if (this.performanceData.length > 100) {
        this.performanceData = this.performanceData.slice(-50);
      }

      // Publish analysis
      await this.publishOptimizationEvent({
        type: 'performance_analysis',
        analysis,
        timestamp: Date.now()
      });

    } catch (error) {
      this.emit('error', { type: 'performance_analysis_failed', error: error.message });
    }
  }

  /**
   * Calculate allocation success rate
   */
  calculateAllocationSuccessRate() {
    if (this.metrics.allocation.totalAllocations === 0) return 1;
    return (this.metrics.allocation.totalAllocations - this.metrics.allocation.failedAllocations) / this.metrics.allocation.totalAllocations;
  }

  /**
   * Calculate optimization frequency
   */
  calculateOptimizationFrequency() {
    const recentOptimizations = this.optimizationHistory.filter(
      opt => Date.now() - opt.timestamp < 3600000 // Last hour
    );
    return recentOptimizations.length;
  }

  /**
   * Allocate resources to agent
   */
  async allocateResources(agentId, requirements, priority = 5) {
    try {
      const startTime = performance.now();
      this.metrics.allocation.totalAllocations++;

      // Check if resources are available
      const available = this.checkResourceAvailability(requirements);
      if (!available) {
        this.metrics.allocation.failedAllocations++;
        throw new Error('Insufficient resources available');
      }

      // Find optimal pool
      const allocation = {
        agentId,
        resources: requirements,
        priority,
        pool: null,
        utilization: 0,
        timestamp: Date.now(),
        status: 'active'
      };

      const optimalPool = this.findOptimalPool(allocation);
      if (!optimalPool) {
        this.metrics.allocation.failedAllocations++;
        throw new Error('No suitable pool available');
      }

      // Allocate to pool
      allocation.pool = optimalPool.name;
      optimalPool.allocated.set(agentId, allocation);
      this.resources.allocated.agents.set(agentId, allocation);

      // Update metrics
      const duration = performance.now() - startTime;
      this.metrics.allocation.averageAllocationTime =
        (this.metrics.allocation.averageAllocationTime * (this.metrics.allocation.totalAllocations - 1) + duration) / this.metrics.allocation.totalAllocations;

      // Update pool utilization
      this.updatePoolUtilization(optimalPool);

      // Publish allocation event
      await this.publishOptimizationEvent({
        type: 'resource_allocated',
        agentId,
        pool: optimalPool.name,
        resources: requirements,
        timestamp: Date.now()
      });

      return {
        agentId,
        pool: optimalPool.name,
        resources: requirements,
        allocationId: `alloc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

    } catch (error) {
      this.metrics.allocation.failedAllocations++;
      this.emit('error', { type: 'allocation_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Check resource availability
   */
  checkResourceAvailability(requirements) {
    const availableCPU = this.resources.available.cpu;
    const availableMemory = this.resources.available.memory;

    return requirements.cpu <= availableCPU && requirements.memory <= availableMemory;
  }

  /**
   * Update optimization metrics
   */
  updateOptimizationMetrics(duration, successfulOptimizations) {
    this.metrics.optimization.successfulOptimizations += successfulOptimizations;
    this.metrics.optimization.averageOptimizationTime =
      (this.metrics.optimization.averageOptimizationTime * (this.metrics.optimization.totalOptimizations - 1) + duration) / this.metrics.optimization.totalOptimizations;
  }

  /**
   * Load existing allocations from Redis
   */
  async loadExistingAllocations() {
    try {
      const agentKeys = await this.redis.keys('allocation:agent:*');

      for (const key of agentKeys) {
        const allocationData = await this.redis.hGetAll(key);
        if (Object.keys(allocationData).length > 0) {
          const allocation = JSON.parse(allocationData.data);
          this.resources.allocated.agents.set(allocation.agentId, allocation);
        }
      }

      console.log(`📋 Loaded ${agentKeys.length} existing allocations`);
    } catch (error) {
      console.warn('Failed to load existing allocations:', error.message);
    }
  }

  /**
   * Publish optimization event
   */
  async publishOptimizationEvent(data) {
    try {
      const eventData = {
        optimizerId: this.optimizerId,
        ...data,
        timestamp: Date.now()
      };

      await this.redis.publish('swarm:scalability:optimization', JSON.stringify(eventData));
    } catch (error) {
      console.warn('Failed to publish optimization event:', error.message);
    }
  }

  /**
   * Get optimizer status
   */
  async getOptimizerStatus() {
    return {
      optimizerId: this.optimizerId,
      isRunning: this.isRunning,
      resources: this.resources,
      metrics: this.metrics,
      pools: Array.from(this.resourcePools.entries()).map(([name, pool]) => ({
        name,
        priority: pool.priority,
        utilization: pool.utilization,
        allocatedCount: pool.allocated.size
      })),
      monitoringDataPoints: this.monitoringData.length,
      optimizationHistory: this.optimizationHistory.slice(-10),
      timestamp: Date.now()
    };
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ ResourceOptimizer error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 ResourceOptimizer status: ${status.status} - ${status.message}`);
    });
  }

  /**
   * Shutdown the resource optimizer
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Resource Optimizer' });

    this.isRunning = false;

    // Clear all timers
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    if (this.optimizationTimer) clearInterval(this.optimizationTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.analysisTimer) clearInterval(this.analysisTimer);

    // Save final state to Redis
    await this.saveOptimizerState();

    // Publish shutdown event
    await this.publishOptimizationEvent({
      type: 'optimizer_shutdown',
      optimizerId: this.optimizerId,
      timestamp: Date.now()
    });

    // Close Redis connection
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Resource Optimizer shutdown complete' });
    console.log('🛑 Resource Optimizer shutdown complete');
  }

  /**
   * Save optimizer state to Redis
   */
  async saveOptimizerState() {
    try {
      const state = {
        optimizerId: this.optimizerId,
        resources: this.resources,
        metrics: this.metrics,
        resourcePools: Array.from(this.resourcePools.entries()),
        timestamp: Date.now()
      };

      await this.redis.setEx(
        `optimizer:state:${this.optimizerId}`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('Failed to save optimizer state:', error.message);
    }
  }
}

export default ResourceOptimizer;