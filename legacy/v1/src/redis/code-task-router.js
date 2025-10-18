/**
 * Code Task Router - Intelligent task routing system for code operations
 * Phase 5 Agent-Booster Integration & Code Performance Acceleration
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class CodeTaskRouter extends EventEmitter {
  constructor(redisClient) {
    super();
    this.redis = redisClient || new Redis();
    this.routingTable = new Map();
    this.agentLoad = new Map();
    this.wasmInstances = new Map();

    // Routing configuration
    this.config = {
      maxFallbackLatency: 100, // ms
      loadBalancingStrategy: 'least-connections',
      healthCheckInterval: 30000, // 30 seconds
      routingChannel: 'swarm:phase-5:routing',
      memoryKey: 'swarm:phase-5:routing-table'
    };

    // Task classification criteria
    this.routingCriteria = {
      fileType: ['js', 'ts', 'py', 'rs', 'go', 'java', 'cpp', 'c'],
      operationType: ['create', 'edit', 'refactor', 'test', 'analyze', 'optimize'],
      complexity: ['simple', 'medium', 'complex', 'critical'],
      priority: ['low', 'normal', 'high', 'urgent']
    };

    this.initializeRouter();
  }

  async initializeRouter() {
    // Load existing routing table from Redis
    await this.loadRoutingTable();

    // Initialize Redis pub/sub for routing events
    this.routingSubscriber = new Redis();
    await this.routingSubscriber.subscribe(this.config.routingChannel);

    this.routingSubscriber.on('message', async (channel, message) => {
      if (channel === this.config.routingChannel) {
        await this.handleRoutingEvent(JSON.parse(message));
      }
    });

    // Start health monitoring
    this.startHealthMonitoring();

    console.log('🚀 CodeTaskRouter initialized with Redis coordination');
  }

  /**
   * Classify and route tasks based on multiple criteria
   */
  async routeTask(task) {
    const startTime = Date.now();

    try {
      // Classify the task
      const classification = await this.classifyTask(task);

      // Select optimal agent/instance
      const target = await this.selectOptimalTarget(classification);

      // Update routing table
      await this.updateRoutingTable(task, classification, target);

      // Emit routing event
      await this.emitRoutingEvent({
        type: 'task_routed',
        taskId: task.id,
        classification,
        target,
        timestamp: Date.now()
      });

      const routingTime = Date.now() - startTime;

      if (routingTime > this.config.maxFallbackLatency) {
        console.warn(`⚠️ Routing latency exceeded: ${routingTime}ms`);
        await this.handleFallbackRouting(task, classification);
      }

      return {
        success: true,
        target,
        classification,
        routingTime
      };

    } catch (error) {
      console.error('❌ Task routing failed:', error);
      await this.handleRoutingError(task, error);
      throw error;
    }
  }

  /**
   * Classify task based on routing criteria
   */
  async classifyTask(task) {
    const classification = {
      fileType: this.extractFileType(task),
      operationType: this.extractOperationType(task),
      complexity: this.assessComplexity(task),
      priority: this.extractPriority(task),
      estimatedDuration: this.estimateTaskDuration(task),
      resourceRequirements: this.assessResourceRequirements(task)
    };

    // Calculate routing score
    classification.routingScore = this.calculateRoutingScore(classification);

    return classification;
  }

  extractFileType(task) {
    if (task.filePath) {
      const ext = task.filePath.split('.').pop().toLowerCase();
      return this.routingCriteria.fileType.includes(ext) ? ext : 'unknown';
    }
    return 'unknown';
  }

  extractOperationType(task) {
    const type = task.type || task.operation || 'unknown';
    return this.routingCriteria.operationType.includes(type) ? type : 'unknown';
  }

  assessComplexity(task) {
    let score = 0;

    // File-based complexity
    if (task.filePath) {
      score += this.getFileComplexity(task.filePath);
    }

    // Operation complexity
    if (task.type === 'refactor' || task.type === 'optimize') {
      score += 2;
    }

    // Size-based complexity
    if (task.content) {
      const lines = task.content.split('\n').length;
      if (lines > 100) score += 2;
      else if (lines > 50) score += 1;
    }

    if (score >= 4) return 'critical';
    if (score >= 3) return 'complex';
    if (score >= 1) return 'medium';
    return 'simple';
  }

  getFileComplexity(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const complexityMap = {
      'rs': 3, // Rust - high complexity
      'cpp': 3, // C++ - high complexity
      'c': 2,  // C - medium complexity
      'java': 2, // Java - medium complexity
      'ts': 2,  // TypeScript - medium complexity
      'js': 1,  // JavaScript - low complexity
      'py': 1   // Python - low complexity
    };
    return complexityMap[ext] || 1;
  }

  extractPriority(task) {
    return task.priority || 'normal';
  }

  estimateTaskDuration(task) {
    const complexity = this.assessComplexity(task);
    const durationMap = {
      'simple': 5000,    // 5 seconds
      'medium': 15000,   // 15 seconds
      'complex': 60000,  // 1 minute
      'critical': 180000 // 3 minutes
    };
    return durationMap[complexity] || 15000;
  }

  assessResourceRequirements(task) {
    const requirements = {
      memory: 'low',
      cpu: 'low',
      wasm: false
    };

    // Assess based on file type and operation
    const fileType = this.extractFileType(task);
    const operationType = this.extractOperationType(task);

    // High-performance file types benefit from WASM
    if (['rs', 'cpp', 'c'].includes(fileType)) {
      requirements.wasm = true;
      requirements.cpu = 'high';
    }

    // Complex operations need more resources
    if (['refactor', 'optimize'].includes(operationType)) {
      requirements.memory = 'high';
      requirements.cpu = 'medium';
    }

    return requirements;
  }

  calculateRoutingScore(classification) {
    let score = 0;

    // Priority weight
    const priorityWeight = {
      'urgent': 4,
      'high': 3,
      'normal': 2,
      'low': 1
    };
    score += priorityWeight[classification.priority] || 2;

    // Complexity weight
    const complexityWeight = {
      'critical': 4,
      'complex': 3,
      'medium': 2,
      'simple': 1
    };
    score += complexityWeight[classification.complexity] || 2;

    // WASM suitability bonus
    if (classification.resourceRequirements.wasm) {
      score += 2;
    }

    return score;
  }

  /**
   * Select optimal target agent/instance using load balancing
   */
  async selectOptimalTarget(classification) {
    const candidates = await this.getCandidateTargets(classification);

    if (candidates.length === 0) {
      throw new Error('No suitable targets available for task routing');
    }

    // Apply load balancing strategy
    let selected;
    switch (this.config.loadBalancingStrategy) {
      case 'least-connections':
        selected = this.selectLeastConnections(candidates);
        break;
      case 'weighted-round-robin':
        selected = this.selectWeightedRoundRobin(candidates);
        break;
      case 'resource-based':
        selected = this.selectResourceBased(candidates, classification);
        break;
      default:
        selected = candidates[0];
    }

    // Update load tracking
    this.updateAgentLoad(selected.id, 'increment');

    return selected;
  }

  async getCandidateTargets(classification) {
    const candidates = [];

    // Get all available agents
    const agents = await this.getAvailableAgents();

    // Filter based on task requirements
    for (const agent of agents) {
      if (this.isAgentSuitable(agent, classification)) {
        candidates.push({
          id: agent.id,
          type: agent.type,
          capabilities: agent.capabilities,
          currentLoad: this.agentLoad.get(agent.id) || 0,
          maxCapacity: agent.maxCapacity || 10,
          performance: agent.performance || {}
        });
      }
    }

    // Add WASM instances if beneficial
    if (classification.resourceRequirements.wasm) {
      const wasmInstances = await this.getAvailableWasmInstances();
      for (const instance of wasmInstances) {
        candidates.push({
          id: instance.id,
          type: 'wasm',
          capabilities: instance.capabilities,
          currentLoad: this.wasmInstances.get(instance.id) || 0,
          maxCapacity: instance.maxCapacity || 20,
          performance: instance.performance || {}
        });
      }
    }

    return candidates;
  }

  async getAvailableAgents() {
    try {
      const agents = await this.redis.hgetall('swarm:agents');
      return Object.values(agents).map(agent => JSON.parse(agent));
    } catch (error) {
      console.error('Failed to get available agents:', error);
      return [];
    }
  }

  async getAvailableWasmInstances() {
    try {
      const instances = await this.redis.hgetall('swarm:wasm-instances');
      return Object.values(instances).map(instance => JSON.parse(instance));
    } catch (error) {
      console.error('Failed to get WASM instances:', error);
      return [];
    }
  }

  isAgentSuitable(agent, classification) {
    // Check if agent has required capabilities
    if (agent.capabilities && agent.capabilities.fileTypes) {
      if (!agent.capabilities.fileTypes.includes(classification.fileType)) {
        return false;
      }
    }

    if (agent.capabilities && agent.capabilities.operations) {
      if (!agent.capabilities.operations.includes(classification.operationType)) {
        return false;
      }
    }

    // Check if agent is healthy
    if (agent.status !== 'active') {
      return false;
    }

    // Check load capacity
    const currentLoad = this.agentLoad.get(agent.id) || 0;
    if (currentLoad >= (agent.maxCapacity || 10)) {
      return false;
    }

    return true;
  }

  selectLeastConnections(candidates) {
    return candidates.reduce((min, candidate) => {
      const minLoadRatio = (this.agentLoad.get(min.id) || 0) / min.maxCapacity;
      const candidateLoadRatio = candidate.currentLoad / candidate.maxCapacity;
      return candidateLoadRatio < minLoadRatio ? candidate : min;
    });
  }

  selectWeightedRoundRobin(candidates) {
    // Simple implementation - could be enhanced with proper round-robin state
    const weights = candidates.map(c => ({
      ...c,
      weight: (c.maxCapacity - c.currentLoad) / c.maxCapacity
    }));

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;

    for (const candidate of weights) {
      random -= candidate.weight;
      if (random <= 0) {
        return candidate;
      }
    }

    return weights[0];
  }

  selectResourceBased(candidates, classification) {
    // Score candidates based on resource match
    return candidates.reduce((best, candidate) => {
      const bestScore = this.calculateResourceScore(best, classification);
      const candidateScore = this.calculateResourceScore(candidate, classification);
      return candidateScore > bestScore ? candidate : best;
    });
  }

  calculateResourceScore(candidate, classification) {
    let score = 0;

    // Load factor (lower load = higher score)
    const loadRatio = candidate.currentLoad / candidate.maxCapacity;
    score += (1 - loadRatio) * 40;

    // Performance factor
    if (candidate.performance.avgResponseTime) {
      const responseScore = Math.max(0, 100 - candidate.performance.avgResponseTime / 10);
      score += responseScore * 0.3;
    }

    // Capability match factor
    if (candidate.capabilities && candidate.capabilities.specializations) {
      if (candidate.capabilities.specializations.includes(classification.fileType)) {
        score += 30;
      }
    }

    return score;
  }

  updateAgentLoad(agentId, operation) {
    const currentLoad = this.agentLoad.get(agentId) || 0;
    if (operation === 'increment') {
      this.agentLoad.set(agentId, currentLoad + 1);
    } else if (operation === 'decrement') {
      this.agentLoad.set(agentId, Math.max(0, currentLoad - 1));
    }
  }

  /**
   * Handle fallback routing when latency exceeds threshold
   */
  async handleFallbackRouting(task, classification) {
    console.log('🔄 Executing fallback routing strategy');

    // Try to route to the least loaded available target
    const candidates = await this.getCandidateTargets(classification);
    if (candidates.length > 0) {
      const fallbackTarget = this.selectLeastConnections(candidates);

      await this.emitRoutingEvent({
        type: 'fallback_routing',
        taskId: task.id,
        originalTarget: null,
        fallbackTarget,
        reason: 'high_latency',
        timestamp: Date.now()
      });

      return fallbackTarget;
    }

    throw new Error('No fallback targets available');
  }

  /**
   * Handle routing errors
   */
  async handleRoutingError(task, error) {
    await this.emitRoutingEvent({
      type: 'routing_error',
      taskId: task.id,
      error: error.message,
      timestamp: Date.now()
    });
  }

  /**
   * Redis coordination methods
   */
  async loadRoutingTable() {
    try {
      const routingData = await this.redis.get(this.config.memoryKey);
      if (routingData) {
        const data = JSON.parse(routingData);
        this.routingTable = new Map(Object.entries(data.routingTable || {}));
        this.agentLoad = new Map(Object.entries(data.agentLoad || {}));
        this.wasmInstances = new Map(Object.entries(data.wasmInstances || {}));
        console.log('📊 Routing table loaded from Redis');
      }
    } catch (error) {
      console.error('Failed to load routing table:', error);
    }
  }

  async saveRoutingTable() {
    try {
      const data = {
        routingTable: Object.fromEntries(this.routingTable),
        agentLoad: Object.fromEntries(this.agentLoad),
        wasmInstances: Object.fromEntries(this.wasmInstances),
        lastUpdated: Date.now()
      };

      await this.redis.setex(this.config.memoryKey, 3600, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save routing table:', error);
    }
  }

  async updateRoutingTable(task, classification, target) {
    const routingKey = `${classification.fileType}:${classification.operationType}`;

    if (!this.routingTable.has(routingKey)) {
      this.routingTable.set(routingKey, {
        targets: [],
        successCount: 0,
        failureCount: 0,
        avgResponseTime: 0
      });
    }

    const route = this.routingTable.get(routingKey);
    route.targets.push({
      targetId: target.id,
      timestamp: Date.now(),
      success: true
    });

    // Keep only recent entries (last 100)
    if (route.targets.length > 100) {
      route.targets = route.targets.slice(-100);
    }

    await this.saveRoutingTable();
  }

  async emitRoutingEvent(event) {
    try {
      await this.redis.publish(this.config.routingChannel, JSON.stringify(event));
    } catch (error) {
      console.error('Failed to emit routing event:', error);
    }
  }

  async handleRoutingEvent(event) {
    switch (event.type) {
      case 'task_completed':
        this.updateAgentLoad(event.targetId, 'decrement');
        break;
      case 'agent_registered':
        await this.refreshAgentList();
        break;
      case 'wasm_instance_registered':
        await this.refreshWasmInstanceList();
        break;
    }
  }

  async refreshAgentList() {
    // Refresh available agents
    const agents = await this.getAvailableAgents();
    console.log(`📋 Refreshed agent list: ${agents.length} agents available`);
  }

  async refreshWasmInstanceList() {
    // Refresh available WASM instances
    const instances = await this.getAvailableWasmInstances();
    console.log(`🔧 Refreshed WASM instance list: ${instances.length} instances available`);
  }

  /**
   * Health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  async performHealthCheck() {
    try {
      // Check agent connectivity
      const agents = await this.getAvailableAgents();
      for (const agent of agents) {
        const lastSeen = agent.lastSeen || 0;
        const now = Date.now();

        if (now - lastSeen > 60000) { // 1 minute timeout
          console.warn(`⚠️ Agent ${agent.id} appears to be offline`);
          await this.handleOfflineAgent(agent.id);
        }
      }

      // Clean up old routing data
      await this.cleanupRoutingData();

    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  async handleOfflineAgent(agentId) {
    // Remove from load tracking
    this.agentLoad.delete(agentId);

    // Re-route any pending tasks
    await this.reroutePendingTasks(agentId);

    await this.emitRoutingEvent({
      type: 'agent_offline',
      agentId,
      timestamp: Date.now()
    });
  }

  async reroutePendingTasks(agentId) {
    // Implementation for re-routing tasks from offline agents
    console.log(`🔄 Re-routing tasks from offline agent: ${agentId}`);
  }

  async cleanupRoutingData() {
    // Remove old routing entries and cleanup memory
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    for (const [key, route] of this.routingTable.entries()) {
      route.targets = route.targets.filter(target => target.timestamp > cutoff);

      if (route.targets.length === 0) {
        this.routingTable.delete(key);
      }
    }

    await this.saveRoutingTable();
  }

  /**
   * Get routing statistics
   */
  async getRoutingStats() {
    const stats = {
      totalRoutes: this.routingTable.size,
      activeAgents: this.agentLoad.size,
      activeWasmInstances: this.wasmInstances.size,
      avgLoadPerAgent: 0,
      routingTableEntries: []
    };

    if (this.agentLoad.size > 0) {
      const totalLoad = Array.from(this.agentLoad.values()).reduce((sum, load) => sum + load, 0);
      stats.avgLoadPerAgent = totalLoad / this.agentLoad.size;
    }

    for (const [key, route] of this.routingTable.entries()) {
      stats.routingTableEntries.push({
        route: key,
        successCount: route.successCount,
        failureCount: route.failureCount,
        avgResponseTime: route.avgResponseTime
      });
    }

    return stats;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down CodeTaskRouter...');

    if (this.routingSubscriber) {
      await this.routingSubscriber.unsubscribe();
      await this.routingSubscriber.quit();
    }

    await this.saveRoutingTable();

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ CodeTaskRouter shutdown complete');
  }
}

module.exports = CodeTaskRouter;