/**
 * Gossip Verification Workflow
 * Complete workflow orchestrator for distributed verification using gossip protocol
 */

const GossipCoordinator = require('./protocol/gossip-coordinator');
const VerificationEngine = require('./verification/verification-engine');
const ResourceMonitor = require('./monitoring/resource-monitor');
const ConsensusValidator = require('./consensus/consensus-validator');
const EventEmitter = require('events');

class GossipVerificationWorkflow extends EventEmitter {
  constructor(nodeId, options = {}) {
    super();
    this.nodeId = nodeId || `node-${Date.now()}`;

    // Initialize components
    this.gossip = new GossipCoordinator({
      nodeId: this.nodeId,
      ...options.gossip,
    });

    this.verification = new VerificationEngine(this.gossip, options.verification);
    this.monitor = new ResourceMonitor(this.gossip, options.monitoring);
    this.validator = new ConsensusValidator(this.gossip, options.consensus);

    this.isRunning = false;
    this.metrics = {
      tasksStarted: 0,
      tasksCompleted: 0,
      consensusReached: 0,
      alertsGenerated: 0,
      validationsPerformed: 0,
    };

    this.setupEventHandlers();

    console.log(`🌐 Gossip Verification Workflow initialized: ${this.nodeId}`);
  }

  setupEventHandlers() {
    // Verification events
    this.verification.on('verificationStarted', (event) => {
      this.metrics.tasksStarted++;
      this.emit('taskStarted', event);
    });

    this.verification.on('consensusReached', (event) => {
      this.metrics.consensusReached++;
      this.emit('consensusReached', event);
    });

    this.verification.on('taskCompleted', (event) => {
      this.metrics.tasksCompleted++;
      this.emit('taskCompleted', event);
    });

    // Monitoring events
    this.monitor.on('alertGenerated', (alert) => {
      this.metrics.alertsGenerated++;
      this.emit('alertGenerated', alert);
    });

    this.monitor.on('alertReceived', (event) => {
      this.emit('alertReceived', event);
    });

    // Gossip events
    this.gossip.on('peerAdded', (event) => {
      this.emit('peerAdded', event);
    });

    this.gossip.on('peerFailed', (event) => {
      this.emit('peerFailed', event);
    });

    // Validator events
    this.validator.on('agentRegistered', (event) => {
      this.metrics.validationsPerformed++;
      this.emit('agentRegistered', event);
    });
  }

  /**
   * Start the complete gossip verification workflow
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️  Workflow already running');
      return;
    }

    this.isRunning = true;

    try {
      // Start gossip protocol
      this.gossip.start();

      // Start resource monitoring
      this.monitor.start();

      this.emit('workflowStarted', { nodeId: this.nodeId });
      console.log(`🚀 Gossip verification workflow started on ${this.nodeId}`);
    } catch (error) {
      this.isRunning = false;
      console.error(`❌ Failed to start workflow on ${this.nodeId}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop the workflow
   */
  async stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    try {
      // Stop monitoring
      this.monitor.stop();

      // Stop gossip protocol
      this.gossip.stop();

      this.emit('workflowStopped', { nodeId: this.nodeId });
      console.log(`🛑 Gossip verification workflow stopped on ${this.nodeId}`);
    } catch (error) {
      console.error(`❌ Error stopping workflow on ${this.nodeId}:`, error.message);
    }
  }

  /**
   * Add peer to the gossip network
   */
  addPeer(nodeId, endpoint) {
    this.gossip.addPeer(nodeId, endpoint);
  }

  /**
   * Remove peer from the gossip network
   */
  removePeer(nodeId) {
    this.gossip.removePeer(nodeId);
  }

  /**
   * Start distributed verification of resource monitoring
   */
  async verifyResourceMonitoring(target, requirements = {}) {
    const taskId = await this.verification.startVerification('resource_monitoring', target, {
      memoryThreshold: requirements.memoryThreshold || 80,
      cpuThreshold: requirements.cpuThreshold || 75,
      networkThreshold: requirements.networkThreshold || 90,
      priority: requirements.priority || 'medium',
      ...requirements,
    });

    console.log(`🔍 Started resource monitoring verification: ${taskId}`);
    return taskId;
  }

  /**
   * Start distributed verification of agent spawning
   */
  async verifyAgentSpawning(agentType, agentConfig = {}, requirements = {}) {
    const taskId = await this.verification.startVerification('agent_spawning', 'agent-spawn', {
      agentType,
      agentConfig: {
        memory: agentConfig.memory || 512,
        cpu: agentConfig.cpu || 0.5,
        ...agentConfig,
      },
      maxAgents: requirements.maxAgents || 20,
      priority: requirements.priority || 'medium',
      ...requirements,
    });

    // Also run consensus validation
    const validationId = await this.validator.validateAgentSpawning(
      agentType,
      agentConfig,
      requirements,
    );

    console.log(`🚀 Started agent spawning verification: ${taskId}, validation: ${validationId}`);
    return { taskId, validationId };
  }

  /**
   * Start distributed verification of agent termination
   */
  async verifyAgentTermination(agentId, terminationReason = 'shutdown', requirements = {}) {
    const taskId = await this.verification.startVerification(
      'agent_termination',
      'agent-terminate',
      {
        agentId,
        terminationReason,
        priority: requirements.priority || 'medium',
        ...requirements,
      },
    );

    // Also run consensus validation
    const validationId = await this.validator.validateAgentTermination(
      agentId,
      terminationReason,
      requirements,
    );

    console.log(
      `🛑 Started agent termination verification: ${taskId}, validation: ${validationId}`,
    );
    return { taskId, validationId };
  }

  /**
   * Start network connectivity verification
   */
  async verifyNetworkConnectivity(target = 'network', requirements = {}) {
    const taskId = await this.verification.startVerification('network_connectivity', target, {
      minPeers: requirements.minPeers || 1,
      maxLatency: requirements.maxLatency || 1000,
      priority: requirements.priority || 'medium',
      ...requirements,
    });

    console.log(`🌐 Started network connectivity verification: ${taskId}`);
    return taskId;
  }

  /**
   * Start consensus state verification
   */
  async verifyConsensusState(target = 'consensus', requirements = {}) {
    const taskId = await this.verification.startVerification('consensus_state', target, {
      consensusThreshold: requirements.consensusThreshold || 0.66,
      stateHash: requirements.stateHash,
      priority: requirements.priority || 'medium',
      ...requirements,
    });

    console.log(`🎯 Started consensus state verification: ${taskId}`);
    return taskId;
  }

  /**
   * Run complete verification suite
   */
  async runCompleteVerificationSuite(options = {}) {
    const suiteId = `suite-${Date.now()}`;
    console.log(`🧪 Starting complete verification suite: ${suiteId}`);

    const results = {
      suiteId,
      startTime: Date.now(),
      tasks: {},
    };

    try {
      // 1. Resource monitoring verification
      if (options.includeResourceMonitoring !== false) {
        results.tasks.resourceMonitoring = await this.verifyResourceMonitoring('system-resources', {
          priority: 'high',
        });
      }

      // 2. Agent spawning verification
      if (options.includeAgentSpawning !== false) {
        results.tasks.agentSpawning = await this.verifyAgentSpawning(
          'coordinator',
          {
            memory: 512,
            cpu: 0.5,
          },
          {
            priority: 'high',
          },
        );
      }

      // 3. Network connectivity verification
      if (options.includeNetworkConnectivity !== false) {
        results.tasks.networkConnectivity = await this.verifyNetworkConnectivity('network-health', {
          priority: 'medium',
        });
      }

      // 4. Consensus state verification
      if (options.includeConsensusState !== false) {
        results.tasks.consensusState = await this.verifyConsensusState('state-consistency', {
          priority: 'medium',
        });
      }

      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;

      this.emit('verificationSuiteStarted', results);
      console.log(
        `✅ Verification suite started: ${suiteId} with ${Object.keys(results.tasks).length} tasks`,
      );

      return results;
    } catch (error) {
      console.error(`❌ Error in verification suite ${suiteId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get workflow status
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      isRunning: this.isRunning,
      metrics: this.metrics,
      components: {
        gossip: this.gossip.getStatus(),
        verification: this.verification.getStatus(),
        monitoring: this.monitor.getResourceStatus(),
        validation: this.validator.getValidationStatus(),
      },
    };
  }

  /**
   * Get convergence metrics
   */
  getConvergenceMetrics() {
    return {
      nodeId: this.nodeId,
      gossip: this.gossip.getConvergenceMetrics(),
      verification: this.verification.getConvergenceMetrics(),
      workflow: {
        tasksStarted: this.metrics.tasksStarted,
        tasksCompleted: this.metrics.tasksCompleted,
        successRate:
          this.metrics.tasksStarted > 0
            ? this.metrics.tasksCompleted / this.metrics.tasksStarted
            : 0,
        consensusRate:
          this.metrics.tasksCompleted > 0
            ? this.metrics.consensusReached / this.metrics.tasksCompleted
            : 0,
      },
    };
  }

  /**
   * Export workflow configuration
   */
  exportConfiguration() {
    return {
      nodeId: this.nodeId,
      gossip: this.gossip.config,
      verification: this.verification.config,
      monitoring: this.monitor.config,
      consensus: this.validator.config,
    };
  }

  /**
   * Create network of interconnected workflows
   */
  static async createNetwork(nodeCount = 5, options = {}) {
    const workflows = [];
    const basePort = options.basePort || 3000;

    // Create workflows
    for (let i = 0; i < nodeCount; i++) {
      const workflow = new GossipVerificationWorkflow(`node-${i}`, {
        gossip: {
          gossipInterval: options.gossipInterval || 1000,
          fanout: Math.min(3, nodeCount - 1),
          ...options.gossip,
        },
        ...options,
      });

      workflows.push(workflow);
    }

    // Connect workflows in mesh topology
    for (let i = 0; i < workflows.length; i++) {
      for (let j = 0; j < workflows.length; j++) {
        if (i !== j) {
          workflows[i].addPeer(`node-${j}`, `http://localhost:${basePort + j}`);
        }
      }
    }

    // Start all workflows
    for (const workflow of workflows) {
      await workflow.start();
    }

    console.log(`🌐 Created gossip verification network with ${nodeCount} nodes`);

    return {
      workflows,
      async stop() {
        for (const workflow of workflows) {
          await workflow.stop();
        }
      },
      getNetworkStatus() {
        return workflows.map((w) => w.getStatus());
      },
      getNetworkConvergence() {
        return workflows.map((w) => w.getConvergenceMetrics());
      },
    };
  }
}

module.exports = GossipVerificationWorkflow;
