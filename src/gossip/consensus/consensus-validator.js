/**
 * Consensus Validator
 * Handles agent lifecycle validation and consensus state verification
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ConsensusValidator extends EventEmitter {
  constructor(gossipCoordinator, options = {}) {
    super();
    this.gossip = gossipCoordinator;
    this.nodeId = gossipCoordinator.nodeId;

    // Validation state
    this.agentRegistry = new Map(); // agentId -> AgentInfo
    this.lifecycleValidations = new Map(); // validationId -> ValidationInfo
    this.consensusStates = new Map(); // stateId -> ConsensusState

    this.config = {
      validationTimeout: options.validationTimeout || 15000,
      consensusThreshold: options.consensusThreshold || 0.66,
      maxValidationHistory: options.maxValidationHistory || 1000,
      heartbeatInterval: options.heartbeatInterval || 5000,
      ...options
    };

    // Setup gossip handlers
    this.setupGossipHandlers();

    console.log(`🔍 Consensus Validator initialized on node ${this.nodeId}`);
  }

  setupGossipHandlers() {
    this.gossip.on('verificationTaskReceived', (task) => {
      if (task.data.type === 'agent_spawning' || task.data.type === 'agent_termination') {
        this.handleAgentLifecycleValidation(task);
      } else if (task.data.type === 'consensus_state') {
        this.handleConsensusValidation(task);
      }
    });
  }

  /**
   * Validate agent spawning process
   */
  async validateAgentSpawning(agentType, agentConfig, requirements = {}) {
    const validationId = crypto.randomUUID();
    const timestamp = Date.now();

    const validation = {
      id: validationId,
      type: 'agent_spawning',
      agentType,
      agentConfig,
      requirements,
      initiator: this.nodeId,
      timestamp,
      status: 'pending',
      results: new Map()
    };

    this.lifecycleValidations.set(validationId, validation);

    // Spread validation task via gossip
    await this.gossip.spreadVerificationTask(validationId, {
      type: 'agent_spawning',
      agentType,
      agentConfig,
      requirements,
      validationId
    }, requirements.priority || 'medium');

    console.log(`🚀 Started agent spawning validation: ${validationId} for ${agentType}`);

    return validationId;
  }

  /**
   * Validate agent termination process
   */
  async validateAgentTermination(agentId, terminationReason, requirements = {}) {
    const validationId = crypto.randomUUID();
    const timestamp = Date.now();

    const validation = {
      id: validationId,
      type: 'agent_termination',
      agentId,
      terminationReason,
      requirements,
      initiator: this.nodeId,
      timestamp,
      status: 'pending',
      results: new Map()
    };

    this.lifecycleValidations.set(validationId, validation);

    // Spread validation task via gossip
    await this.gossip.spreadVerificationTask(validationId, {
      type: 'agent_termination',
      agentId,
      terminationReason,
      requirements,
      validationId
    }, requirements.priority || 'medium');

    console.log(`🛑 Started agent termination validation: ${validationId} for ${agentId}`);

    return validationId;
  }

  /**
   * Handle agent lifecycle validation tasks
   */
  async handleAgentLifecycleValidation(task) {
    const { taskId, data } = task;

    try {
      let result;

      if (data.type === 'agent_spawning') {
        result = await this.executeSpawningValidation(data);
      } else if (data.type === 'agent_termination') {
        result = await this.executeTerminationValidation(data);
      }

      // Propagate validation result
      await this.gossip.propagateVerificationResult(taskId, {
        validationId: data.validationId,
        nodeId: this.nodeId,
        result,
        type: data.type
      }, 'completed');

      console.log(`✅ Completed ${data.type} validation for task ${taskId}`);

    } catch (error) {
      console.error(`❌ Failed ${data.type} validation for task ${taskId}:`, error.message);

      await this.gossip.propagateVerificationResult(taskId, {
        validationId: data.validationId,
        nodeId: this.nodeId,
        error: error.message,
        type: data.type
      }, 'failed');
    }
  }

  /**
   * Execute agent spawning validation
   */
  async executeSpawningValidation(data) {
    const { agentType, agentConfig, requirements } = data;
    const startTime = Date.now();

    const validations = await Promise.allSettled([
      this.validateResourceAvailability(agentConfig),
      this.validateAgentTypeSupport(agentType),
      this.validateSpawningConstraints(requirements),
      this.validateNetworkConnectivity(),
      this.simulateAgentInitialization(agentType, agentConfig)
    ]);

    const passed = validations.filter(v => v.status === 'fulfilled').length;
    const failed = validations.filter(v => v.status === 'rejected').length;

    return {
      type: 'agent_spawning',
      agentType,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      passed,
      failed,
      total: validations.length,
      success: failed === 0,
      validations: validations.map((v, i) => ({
        check: ['resources', 'type_support', 'constraints', 'network', 'initialization'][i],
        status: v.status,
        result: v.status === 'fulfilled' ? v.value : v.reason?.message
      }))
    };
  }

  /**
   * Execute agent termination validation
   */
  async executeTerminationValidation(data) {
    const { agentId, terminationReason, requirements } = data;
    const startTime = Date.now();

    const validations = await Promise.allSettled([
      this.validateGracefulShutdown(agentId),
      this.validateResourceCleanup(agentId),
      this.validateStateConsistency(agentId),
      this.validateDependencyHandling(agentId),
      this.simulateTerminationProcess(agentId, terminationReason)
    ]);

    const passed = validations.filter(v => v.status === 'fulfilled').length;
    const failed = validations.filter(v => v.status === 'rejected').length;

    return {
      type: 'agent_termination',
      agentId,
      terminationReason,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      passed,
      failed,
      total: validations.length,
      success: failed === 0,
      validations: validations.map((v, i) => ({
        check: ['graceful_shutdown', 'resource_cleanup', 'state_consistency', 'dependencies', 'termination'][i],
        status: v.status,
        result: v.status === 'fulfilled' ? v.value : v.reason?.message
      }))
    };
  }

  /**
   * Validation helper methods
   */
  async validateResourceAvailability(agentConfig) {
    const requiredMemory = agentConfig.memory || 512; // MB
    const requiredCpu = agentConfig.cpu || 0.1; // CPU units

    // Simulate resource check
    const availableMemory = Math.random() * 2048 + 512; // 512-2560 MB
    const availableCpu = Math.random() * 2 + 0.5; // 0.5-2.5 CPU units

    const hasMemory = availableMemory >= requiredMemory;
    const hasCpu = availableCpu >= requiredCpu;

    if (!hasMemory || !hasCpu) {
      throw new Error(`Insufficient resources: memory=${hasMemory}, cpu=${hasCpu}`);
    }

    return {
      memory: { available: availableMemory, required: requiredMemory, sufficient: hasMemory },
      cpu: { available: availableCpu, required: requiredCpu, sufficient: hasCpu }
    };
  }

  async validateAgentTypeSupport(agentType) {
    const supportedTypes = [
      'coordinator', 'researcher', 'coder', 'tester', 'reviewer',
      'monitor', 'specialist', 'analyzer', 'optimizer'
    ];

    const isSupported = supportedTypes.includes(agentType);

    if (!isSupported) {
      throw new Error(`Unsupported agent type: ${agentType}`);
    }

    return { agentType, supported: true, availableTypes: supportedTypes };
  }

  async validateSpawningConstraints(requirements) {
    const maxAgents = requirements.maxAgents || 20;
    const currentAgents = this.agentRegistry.size;

    if (currentAgents >= maxAgents) {
      throw new Error(`Maximum agents limit reached: ${currentAgents}/${maxAgents}`);
    }

    return {
      current: currentAgents,
      maximum: maxAgents,
      canSpawn: true,
      capacity: ((maxAgents - currentAgents) / maxAgents) * 100
    };
  }

  async validateNetworkConnectivity() {
    const activePeers = Array.from(this.gossip.peers.values()).filter(p => p.isActive).length;
    const minConnectivity = 1;

    if (activePeers < minConnectivity) {
      throw new Error(`Insufficient network connectivity: ${activePeers} active peers`);
    }

    return {
      activePeers,
      minRequired: minConnectivity,
      networkHealth: activePeers >= minConnectivity
    };
  }

  async simulateAgentInitialization(agentType, agentConfig) {
    // Simulate initialization process
    const initTime = Math.random() * 1000 + 500; // 500-1500ms
    const success = Math.random() > 0.05; // 95% success rate

    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async work

    if (!success) {
      throw new Error(`Agent initialization failed for type: ${agentType}`);
    }

    return {
      agentType,
      initializationTime: initTime,
      success,
      features: ['basic', 'gossip', 'monitoring']
    };
  }

  async validateGracefulShutdown(agentId) {
    // Check if agent exists in registry
    const agentInfo = this.agentRegistry.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Simulate graceful shutdown check
    const shutdownTime = Math.random() * 2000 + 1000; // 1-3 seconds
    const canShutdown = Math.random() > 0.1; // 90% success rate

    if (!canShutdown) {
      throw new Error(`Cannot perform graceful shutdown for agent: ${agentId}`);
    }

    return {
      agentId,
      canShutdown,
      estimatedShutdownTime: shutdownTime,
      pendingTasks: Math.floor(Math.random() * 3)
    };
  }

  async validateResourceCleanup(agentId) {
    // Simulate resource cleanup validation
    const memoryToFree = Math.random() * 1000 + 100; // 100-1100 MB
    const canCleanup = Math.random() > 0.05; // 95% success rate

    if (!canCleanup) {
      throw new Error(`Resource cleanup validation failed for agent: ${agentId}`);
    }

    return {
      agentId,
      memoryToFree,
      resourcesFreed: true,
      cleanupTime: Math.random() * 500 + 100
    };
  }

  async validateStateConsistency(agentId) {
    // Simulate state consistency check
    const stateHash = crypto.randomBytes(16).toString('hex');
    const isConsistent = Math.random() > 0.02; // 98% consistency rate

    if (!isConsistent) {
      throw new Error(`State consistency validation failed for agent: ${agentId}`);
    }

    return {
      agentId,
      stateHash,
      consistent: true,
      lastStateUpdate: Date.now() - Math.random() * 300000 // Last 5 minutes
    };
  }

  async validateDependencyHandling(agentId) {
    // Simulate dependency validation
    const dependencies = Math.floor(Math.random() * 5);
    const canHandleDeps = Math.random() > 0.1; // 90% success rate

    if (!canHandleDeps) {
      throw new Error(`Dependency handling validation failed for agent: ${agentId}`);
    }

    return {
      agentId,
      dependencies,
      canHandle: true,
      dependencyTypes: ['peer', 'resource', 'service']
    };
  }

  async simulateTerminationProcess(agentId, reason) {
    // Simulate termination process
    const terminationTime = Math.random() * 1500 + 500; // 500-2000ms
    const success = Math.random() > 0.03; // 97% success rate

    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work

    if (!success) {
      throw new Error(`Termination process failed for agent: ${agentId}`);
    }

    return {
      agentId,
      reason,
      terminationTime,
      success,
      cleanupSteps: ['save_state', 'close_connections', 'free_resources']
    };
  }

  /**
   * Register an agent in the local registry
   */
  registerAgent(agentId, agentInfo) {
    this.agentRegistry.set(agentId, {
      ...agentInfo,
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'active'
    });

    console.log(`📋 Registered agent: ${agentId}`);
  }

  /**
   * Unregister an agent from the local registry
   */
  unregisterAgent(agentId) {
    if (this.agentRegistry.delete(agentId)) {
      console.log(`🗑️  Unregistered agent: ${agentId}`);
      return true;
    }
    return false;
  }

  /**
   * Update agent heartbeat
   */
  updateAgentHeartbeat(agentId) {
    const agent = this.agentRegistry.get(agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      agent.status = 'active';
    }
  }

  /**
   * Get validation status
   */
  getValidationStatus() {
    const activeValidations = Array.from(this.lifecycleValidations.values())
      .filter(v => v.status === 'pending');

    const completedValidations = Array.from(this.lifecycleValidations.values())
      .filter(v => v.status === 'completed');

    return {
      nodeId: this.nodeId,
      agents: {
        registered: this.agentRegistry.size,
        active: Array.from(this.agentRegistry.values()).filter(a => a.status === 'active').length
      },
      validations: {
        active: activeValidations.length,
        completed: completedValidations.length,
        total: this.lifecycleValidations.size
      }
    };
  }

  /**
   * Get agent registry
   */
  getAgentRegistry() {
    return Array.from(this.agentRegistry.entries()).map(([id, info]) => ({
      id,
      ...info,
      uptime: Date.now() - info.registeredAt
    }));
  }
}

module.exports = ConsensusValidator;