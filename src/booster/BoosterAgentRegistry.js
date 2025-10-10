/**
 * Booster Agent Registry
 *
 * Integrates booster agents with the existing agent registry system
 * and provides discovery, registration, and lifecycle management.
 */

import CodeBoosterAgent from './CodeBoosterAgent.js';
import { connectRedis } from '../cli/utils/redis-client.js';
import { EventEmitter } from 'events';
import path from 'path';
import { promises as fs } from 'fs';

export class BoosterAgentRegistry extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redisKey: config.redisKey || 'swarm:phase-5',
      registryPath: config.registryPath || '.claude/agents',
      autoDiscovery: config.autoDiscovery !== false,
      maxAgents: config.maxAgents || 50,
      healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
      ...config
    };

    this.redisClient = null;
    this.registeredAgents = new Map(); // agentId -> agent instance
    this.agentTypes = new Map(); // typeId -> type definition
    this.availableAgents = new Set(); // pool of available agents
    this.busyAgents = new Map(); // agentId -> task info
    this.healthCheckTimer = null;
    this.isInitialized = false;

    // Registry metrics
    this.metrics = {
      totalAgents: 0,
      activeAgents: 0,
      busyAgents: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0
    };
  }

  /**
   * Initialize the booster agent registry
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Booster Agent Registry');

      // Connect to Redis
      this.redisClient = await connectRedis({
        host: 'localhost',
        port: 6379,
        database: 0
      });

      // Register built-in agent types
      await this.registerBuiltinAgentTypes();

      // Discover existing agents
      if (this.config.autoDiscovery) {
        await this.discoverAgents();
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Load registry state from Redis
      await this.loadRegistryState();

      this.isInitialized = true;
      console.log('✅ Booster Agent Registry initialized successfully');

      this.emit('initialized', {
        registeredAgents: this.registeredAgents.size,
        agentTypes: this.agentTypes.size,
        availableAgents: this.availableAgents.size
      });

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Booster Agent Registry:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Register built-in agent types
   */
  async registerBuiltinAgentTypes() {
    const builtinTypes = [
      {
        id: 'code-booster',
        name: 'Code Booster Agent',
        class: CodeBoosterAgent,
        description: 'Specialized agent for WASM-accelerated code tasks',
        capabilities: [
          'code-generation',
          'code-optimization',
          'performance-analysis',
          'wasm-acceleration',
          'code-review',
          'refactoring'
        ],
        config: {
          maxConcurrentTasks: 3,
          timeout: 30000,
          autoOptimize: true,
          fallbackEnabled: true
        }
      }
    ];

    for (const type of builtinTypes) {
      await this.registerAgentType(type);
    }

    console.log(`📚 Registered ${builtinTypes.length} built-in agent types`);
  }

  /**
   * Register an agent type
   */
  async registerAgentType(typeDefinition) {
    const { id, name, class: AgentClass, description, capabilities, config = {} } = typeDefinition;

    if (this.agentTypes.has(id)) {
      console.warn(`⚠️ Agent type ${id} already registered, updating...`);
    }

    const typeInfo = {
      id,
      name,
      AgentClass,
      description,
      capabilities,
      config,
      registeredAt: Date.now()
    };

    this.agentTypes.set(id, typeInfo);

    // Save to Redis
    await this.saveAgentTypeToRedis(typeInfo);

    console.log(`📝 Registered agent type: ${name} (${id})`);

    this.emit('agent-type-registered', typeInfo);
    return typeInfo;
  }

  /**
   * Create and register a new agent instance
   */
  async createAgent(typeId, config = {}) {
    if (!this.isInitialized) {
      throw new Error('Booster Agent Registry not initialized');
    }

    const agentType = this.agentTypes.get(typeId);
    if (!agentType) {
      throw new Error(`Unknown agent type: ${typeId}`);
    }

    if (this.registeredAgents.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached');
    }

    try {
      console.log(`🤖 Creating ${agentType.name} instance`);

      // Create agent instance
      const agent = new agentType.AgentClass({
        ...agentType.config,
        ...config,
        agentId: config.agentId || `${typeId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      // Initialize agent
      await agent.initialize();

      // Set up event listeners
      this.setupAgentEventListeners(agent);

      // Register agent
      this.registeredAgents.set(agent.config.agentId, {
        agent,
        type: agentType,
        registeredAt: Date.now(),
        lastActivity: Date.now(),
        status: 'ready',
        taskCount: 0,
        successCount: 0,
        errorCount: 0
      });

      this.availableAgents.add(agent.config.agentId);

      // Save to Redis
      await this.saveAgentToRedis(agent.config.agentId, agentType.id);

      console.log(`✅ Agent created: ${agent.config.name} (${agent.config.agentId})`);

      this.emit('agent-created', {
        agentId: agent.config.agentId,
        typeId,
        name: agent.config.name
      });

      return agent;

    } catch (error) {
      console.error(`❌ Failed to create agent of type ${typeId}:`, error);
      throw error;
    }
  }

  /**
   * Set up event listeners for an agent
   */
  setupAgentEventListeners(agent) {
    agent.on('task.completed', (data) => {
      this.handleAgentTaskCompleted(agent.config.agentId, data);
    });

    agent.on('task.failed', (data) => {
      this.handleAgentTaskFailed(agent.config.agentId, data);
    });

    agent.on('error', (error) => {
      this.handleAgentError(agent.config.agentId, error);
    });
  }

  /**
   * Acquire an available agent for a task
   */
  async acquireAgent(taskRequirements = {}) {
    const { taskType, capabilities, priority = 'normal' } = taskRequirements;

    // Find suitable available agents
    let suitableAgentId = null;

    for (const agentId of this.availableAgents) {
      const agentInfo = this.registeredAgents.get(agentId);
      if (!agentInfo) continue;

      const agent = agentInfo.agent;

      // Check if agent can handle the task
      if (taskType && !agent.canHandleTask(taskType)) {
        continue;
      }

      if (capabilities && !capabilities.every(cap => agent.config.capabilities.includes(cap))) {
        continue;
      }

      suitableAgentId = agentId;
      break;
    }

    if (!suitableAgentId) {
      throw new Error('No suitable agent available');
    }

    // Move agent from available to busy
    this.availableAgents.delete(suitableAgentId);
    this.busyAgents.set(suitableAgentId, {
      startTime: Date.now(),
      priority
    });

    const agentInfo = this.registeredAgents.get(suitableAgentId);
    agentInfo.status = 'busy';
    agentInfo.lastActivity = Date.now();

    console.log(`🔧 Agent acquired: ${suitableAgentId} for task type ${taskType || 'general'}`);

    this.emit('agent-acquired', {
      agentId: suitableAgentId,
      taskRequirements
    });

    return {
      agentId: suitableAgentId,
      agent: agentInfo.agent,
      release: () => this.releaseAgent(suitableAgentId)
    };
  }

  /**
   * Release an agent back to the available pool
   */
  async releaseAgent(agentId) {
    const agentInfo = this.registeredAgents.get(agentId);
    if (!agentInfo) {
      console.warn(`⚠️ Attempted to release unknown agent: ${agentId}`);
      return;
    }

    if (this.busyAgents.has(agentId)) {
      this.busyAgents.delete(agentId);
    }

    agentInfo.status = 'ready';
    agentInfo.lastActivity = Date.now();
    this.availableAgents.add(agentId);

    console.log(`↩️ Agent released: ${agentId}`);

    this.emit('agent-released', {
      agentId
    });
  }

  /**
   * Execute a task using an appropriate agent
   */
  async executeTask(taskRequest) {
    const startTime = Date.now();

    try {
      // Acquire suitable agent
      const { agent, agentId, release } = await this.acquireAgent({
        taskType: taskRequest.type,
        capabilities: taskRequest.capabilities,
        priority: taskRequest.priority
      });

      console.log(`🚀 Executing task ${taskRequest.taskId || 'unknown'} with agent ${agentId}`);

      // Execute task
      const result = await agent.executeTask(taskRequest);

      // Release agent
      await release();

      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(result, executionTime);

      return {
        ...result,
        agentId,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`❌ Task execution failed:`, error);

      // Update metrics
      this.metrics.failedTasks++;

      throw error;
    }
  }

  /**
   * Discover agents from the registry path
   */
  async discoverAgents() {
    try {
      const registryPath = path.resolve(this.config.registryPath);

      if (!await this.pathExists(registryPath)) {
        console.log(`📁 Registry path not found: ${registryPath}`);
        return;
      }

      const entries = await fs.readdir(registryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          await this.processAgentDefinition(path.join(registryPath, entry.name));
        }
      }

      console.log(`🔍 Discovered agents from ${entries.length} registry entries`);
    } catch (error) {
      console.warn('⚠️ Failed to discover agents:', error);
    }
  }

  /**
   * Process an agent definition file
   */
  async processAgentDefinition(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const frontmatter = this.extractFrontmatter(content);

      if (frontmatter && frontmatter.type === 'specialist' &&
          frontmatter.capabilities && frontmatter.capabilities.includes('wasm-acceleration')) {

        console.log(`📖 Processing booster agent definition: ${path.basename(filePath)}`);

        // This could be extended to dynamically load agent types
        // For now, we just log the discovery
      }
    } catch (error) {
      console.warn(`⚠️ Failed to process agent definition ${filePath}:`, error);
    }
  }

  /**
   * Extract YAML frontmatter from markdown content
   */
  extractFrontmatter(content) {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return null;
    }

    try {
      // Simple YAML parsing (basic implementation)
      const yaml = match[1];
      const frontmatter = {};

      yaml.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          let value = line.substring(colonIndex + 1).trim();

          // Handle arrays and simple values
          if (value.startsWith('[') && value.endsWith(']')) {
            value = value.slice(1, -1).split(',').map(v => v.trim().replace(/['"]/g, ''));
          } else if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          frontmatter[key] = value;
        }
      });

      return frontmatter;
    } catch (error) {
      console.warn('⚠️ Failed to parse frontmatter:', error);
      return null;
    }
  }

  /**
   * Handle agent task completion
   */
  handleAgentTaskCompleted(agentId, data) {
    const agentInfo = this.registeredAgents.get(agentId);
    if (!agentInfo) return;

    agentInfo.taskCount++;
    agentInfo.successCount++;
    agentInfo.lastActivity = Date.now();

    this.metrics.completedTasks++;

    console.log(`✅ Agent ${agentId} completed task: ${data.taskId}`);

    this.emit('agent-task-completed', {
      agentId,
      ...data
    });
  }

  /**
   * Handle agent task failure
   */
  handleAgentTaskFailed(agentId, data) {
    const agentInfo = this.registeredAgents.get(agentId);
    if (!agentInfo) return;

    agentInfo.taskCount++;
    agentInfo.errorCount++;
    agentInfo.lastActivity = Date.now();

    this.metrics.failedTasks++;

    console.error(`❌ Agent ${agentId} failed task: ${data.taskId}`);

    this.emit('agent-task-failed', {
      agentId,
      ...data
    });
  }

  /**
   * Handle agent error
   */
  handleAgentError(agentId, error) {
    const agentInfo = this.registeredAgents.get(agentId);
    if (!agentInfo) return;

    agentInfo.status = 'error';
    agentInfo.lastActivity = Date.now();

    console.error(`🚨 Agent ${agentId} error:`, error);

    this.emit('agent-error', {
      agentId,
      error
    });

    // Consider agent recovery if too many errors
    if (agentInfo.errorCount > 5) {
      this.recoverAgent(agentId);
    }
  }

  /**
   * Recover a failed agent
   */
  async recoverAgent(agentId) {
    console.log(`🔄 Recovering agent: ${agentId}`);

    const agentInfo = this.registeredAgents.get(agentId);
    if (!agentInfo) return;

    try {
      // Reset error count and status
      agentInfo.errorCount = 0;
      agentInfo.status = 'ready';

      // If agent was busy, move it back to available
      if (this.busyAgents.has(agentId)) {
        this.busyAgents.delete(agentId);
        this.availableAgents.add(agentId);
      }

      console.log(`✅ Agent ${agentId} recovered`);

      this.emit('agent-recovered', { agentId });
    } catch (error) {
      console.error(`❌ Failed to recover agent ${agentId}:`, error);
    }
  }

  /**
   * Start health monitoring for all agents
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health check on all agents
   */
  async performHealthCheck() {
    const now = Date.now();
    let unhealthyAgents = 0;

    for (const [agentId, agentInfo] of this.registeredAgents) {
      try {
        const timeSinceLastActivity = now - agentInfo.lastActivity;
        const agent = agentInfo.agent;

        // Check if agent has been inactive for too long (5 minutes)
        if (timeSinceLastActivity > 300000 && agentInfo.status === 'busy') {
          console.warn(`⚠️ Agent ${agentId} appears stuck, attempting recovery`);
          await this.recoverAgent(agentId);
          unhealthyAgents++;
        }

        // Check agent-specific health if available
        if (agent.getStatus) {
          const status = agent.getStatus();
          if (status.status === 'error') {
            unhealthyAgents++;
          }
        }

      } catch (error) {
        console.error(`❌ Health check failed for agent ${agentId}:`, error);
        unhealthyAgents++;
      }
    }

    // Update metrics
    this.metrics.activeAgents = this.registeredAgents.size;
    this.metrics.busyAgents = this.busyAgents.size;

    if (unhealthyAgents > 0) {
      console.log(`🏥 Health check complete: ${unhealthyAgents} unhealthy agents detected`);
    }
  }

  /**
   * Update registry metrics
   */
  updateMetrics(result, executionTime) {
    this.metrics.totalTasks++;

    if (result.success) {
      this.metrics.completedTasks++;
    }

    this.metrics.averageTaskTime =
      (this.metrics.averageTaskTime * (this.metrics.totalTasks - 1) + executionTime) /
      this.metrics.totalTasks;
  }

  /**
   * Save agent type to Redis
   */
  async saveAgentTypeToRedis(typeInfo) {
    try {
      const key = `${this.config.redisKey}:agent-types:${typeInfo.id}`;
      await this.redisClient.setEx(key, 86400, JSON.stringify(typeInfo)); // 24 hour TTL
    } catch (error) {
      console.warn('⚠️ Failed to save agent type to Redis:', error);
    }
  }

  /**
   * Save agent to Redis
   */
  async saveAgentToRedis(agentId, typeId) {
    try {
      const key = `${this.config.redisKey}:agents:${agentId}`;
      const data = {
        agentId,
        typeId,
        registeredAt: Date.now()
      };
      await this.redisClient.setEx(key, 86400, JSON.stringify(data)); // 24 hour TTL
    } catch (error) {
      console.warn('⚠️ Failed to save agent to Redis:', error);
    }
  }

  /**
   * Load registry state from Redis
   */
  async loadRegistryState() {
    try {
      // Load metrics
      const metricsKey = `${this.config.redisKey}:registry-metrics`;
      const metricsData = await this.redisClient.get(metricsKey);
      if (metricsData) {
        const savedMetrics = JSON.parse(metricsData);
        Object.assign(this.metrics, savedMetrics);
      }

      console.log('📂 Loaded registry state from Redis');
    } catch (error) {
      console.warn('⚠️ Failed to load registry state from Redis:', error);
    }
  }

  /**
   * Save registry metrics to Redis
   */
  async saveMetricsToRedis() {
    try {
      const metricsKey = `${this.config.redisKey}:registry-metrics`;
      await this.redisClient.setEx(metricsKey, 3600, JSON.stringify(this.metrics)); // 1 hour TTL
    } catch (error) {
      console.warn('⚠️ Failed to save metrics to Redis:', error);
    }
  }

  /**
   * Check if path exists
   */
  async pathExists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get registry status and metrics
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      config: this.config,
      agents: {
        total: this.registeredAgents.size,
        available: this.availableAgents.size,
        busy: this.busyAgents.size
      },
      types: this.agentTypes.size,
      metrics: { ...this.metrics },
      agentsByType: this.getAgentsByType()
    };
  }

  /**
   * Get agents grouped by type
   */
  getAgentsByType() {
    const agentsByType = {};

    for (const [agentId, agentInfo] of this.registeredAgents) {
      const typeId = agentInfo.type.id;
      if (!agentsByType[typeId]) {
        agentsByType[typeId] = {
          typeName: agentInfo.type.name,
          count: 0,
          agents: []
        };
      }

      agentsByType[typeId].count++;
      agentsByType[typeId].agents.push({
        agentId,
        name: agentInfo.agent.config.name,
        status: agentInfo.status,
        taskCount: agentInfo.taskCount,
        successCount: agentInfo.successCount,
        errorCount: agentInfo.errorCount
      });
    }

    return agentsByType;
  }

  /**
   * Get available agent types
   */
  getAgentTypes() {
    return Array.from(this.agentTypes.values()).map(type => ({
      id: type.id,
      name: type.name,
      description: type.description,
      capabilities: type.capabilities
    }));
  }

  /**
   * Gracefully shutdown the registry
   */
  async shutdown() {
    console.log('🛑 Shutting down Booster Agent Registry');

    try {
      // Stop health monitoring
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }

      // Save final metrics
      await this.saveMetricsToRedis();

      // Shutdown all agents
      for (const [agentId, agentInfo] of this.registeredAgents) {
        try {
          await agentInfo.agent.shutdown();
          console.log(`  🛑 Agent ${agentId} shutdown`);
        } catch (error) {
          console.error(`  ❌ Failed to shutdown agent ${agentId}:`, error);
        }
      }

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      // Clear data
      this.registeredAgents.clear();
      this.availableAgents.clear();
      this.busyAgents.clear();
      this.agentTypes.clear();

      this.isInitialized = false;

      console.log('✅ Booster Agent Registry shutdown complete');

      this.emit('shutdown');
    } catch (error) {
      console.error('❌ Error during registry shutdown:', error);
      throw error;
    }
  }
}

export default BoosterAgentRegistry;