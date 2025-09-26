/**
 * Enhanced Mesh Coordinator with Byzantine Fault Tolerance
 *
 * Advanced mesh topology coordinator with distributed consensus,
 * Byzantine fault tolerance, peer discovery, and cross-topology communication.
 * Builds upon the lifecycle management and dependency tracking systems.
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import {
  lifecycleManager,
  registerAgentDependency,
  removeAgentDependency,
  getAgentDependencyStatus,
  forceAgentCompletion,
  type AgentLifecycleContext,
} from '../agents/lifecycle-manager.js';
import {
  DependencyType,
  getDependencyTracker,
  type DependencyTracker,
} from '../lifecycle/dependency-tracker.js';
import {
  TopologyType,
  TopologyConfiguration,
  TopologyMetrics,
  AgentNode,
  CoordinationTask,
  CoordinationMessage,
  ConsensusProposal,
  ByzantineFaultToleranceConfig,
  CommunicationChannel,
  ITopologyCoordinator,
  ICommunicationBridge,
} from './types.js';

// ============================================================================
// Enhanced Mesh Configuration
// ============================================================================

export interface EnhancedMeshConfig extends TopologyConfiguration {
  managerId?: string;
  communicationBridge?: ICommunicationBridge;
  peerDiscovery: {
    enabled: boolean;
    discoveryInterval: number;
    maxDiscoveryAttempts: number;
    bootstrapNodes: string[];
  };
  consensus: {
    algorithm: 'pbft' | 'raft' | 'gossip';
    requiredVotes: number;
    timeoutMs: number;
    enableByzantine: boolean;
  };
  loadBalancing: {
    strategy: 'round-robin' | 'least-loaded' | 'capability-weighted';
    rebalanceInterval: number;
    loadThreshold: number;
  };
  faultTolerance: ByzantineFaultToleranceConfig;
  networking: {
    enableCompression: boolean;
    enableEncryption: boolean;
    maxMessageSize: number;
    heartbeatInterval: number;
    connectionTimeout: number;
  };
}

// ============================================================================
// Enhanced Mesh Data Structures
// ============================================================================

interface PeerInfo {
  id: string;
  address: string;
  capabilities: string[];
  reputation: number;
  lastSeen: Date;
  connectionAttempts: number;
  isReliable: boolean;
  byzantineScore: number;
}

interface ConsensusState {
  currentProposal?: ConsensusProposal;
  activeProposals: Map<string, ConsensusProposal>;
  votingRound: number;
  leaderElection: {
    currentLeader?: string;
    candidates: string[];
    electionInProgress: boolean;
  };
}

interface NetworkPartition {
  id: string;
  nodes: Set<string>;
  isMainPartition: boolean;
  splitTime: Date;
  reconnectionAttempts: number;
}

// ============================================================================
// Enhanced Mesh Coordinator Implementation
// ============================================================================

export class EnhancedMeshCoordinator extends EventEmitter implements ITopologyCoordinator {
  readonly id: string;
  readonly type: TopologyType = 'mesh';
  readonly config: EnhancedMeshConfig;

  private logger: Logger;
  private agents: Map<string, AgentNode>;
  private peers: Map<string, PeerInfo>;
  private tasks: Map<string, CoordinationTask>;
  private channels: Map<string, CommunicationChannel>;
  private dependencyTracker: DependencyTracker;
  private lifecycleContext?: AgentLifecycleContext;
  private communicationBridge?: ICommunicationBridge;

  private isRunning: boolean = false;
  private consensusState: ConsensusState;
  private networkPartitions: Map<string, NetworkPartition>;
  private discoveryTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private loadBalanceTimer?: NodeJS.Timeout;
  private consensusTimer?: NodeJS.Timeout;

  // Performance tracking
  private metrics: {
    messagesProcessed: number;
    consensusRounds: number;
    failureRecoveries: number;
    averageLatency: number;
    byzantineDetections: number;
  };

  constructor(config: Partial<EnhancedMeshConfig> = {}) {
    super();

    this.id = generateId('enhanced-mesh');
    this.logger = new Logger(`EnhancedMeshCoordinator[${this.id}]`);

    this.config = {
      type: 'mesh',
      name: `enhanced-mesh-${this.id}`,
      strategy: 'distributed',
      faultTolerance: 'byzantine',
      loadBalancing: 'capability-based',
      maxAgents: 100,
      maxConnections: 15,
      enableCrossTopology: true,
      enableAdaptiveOptimization: true,
      performanceThresholds: {
        latency: 500,
        throughput: 50,
        errorRate: 0.05,
      },
      timeouts: {
        coordination: 30000,
        completion: 300000,
        heartbeat: 5000,
      },
      memoryNamespace: `enhanced-mesh-${this.id}`,
      peerDiscovery: {
        enabled: true,
        discoveryInterval: 10000,
        maxDiscoveryAttempts: 5,
        bootstrapNodes: [],
      },
      consensus: {
        algorithm: 'pbft',
        requiredVotes: 3,
        timeoutMs: 15000,
        enableByzantine: true,
      },
      loadBalancing: {
        strategy: 'capability-weighted',
        rebalanceInterval: 30000,
        loadThreshold: 0.8,
      },
      faultTolerance: {
        enabled: true,
        maxFaultyNodes: 1,
        consensusAlgorithm: 'pbft',
        verificationRequired: true,
        redundancyFactor: 3,
        timeoutMultiplier: 2,
      },
      networking: {
        enableCompression: true,
        enableEncryption: false,
        maxMessageSize: 1024 * 1024, // 1MB
        heartbeatInterval: 10000,
        connectionTimeout: 15000,
      },
      ...config,
    };

    this.agents = new Map();
    this.peers = new Map();
    this.tasks = new Map();
    this.channels = new Map();
    this.networkPartitions = new Map();
    this.dependencyTracker = getDependencyTracker(this.config.memoryNamespace);
    this.communicationBridge = config.communicationBridge;

    this.consensusState = {
      activeProposals: new Map(),
      votingRound: 0,
      leaderElection: {
        candidates: [],
        electionInProgress: false,
      },
    };

    this.metrics = {
      messagesProcessed: 0,
      consensusRounds: 0,
      failureRecoveries: 0,
      averageLatency: 0,
      byzantineDetections: 0,
    };

    this.setupEventHandlers();
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Enhanced mesh coordinator already running');
      return;
    }

    this.logger.info('Initializing enhanced mesh coordinator...');

    // Initialize dependency tracker
    await this.dependencyTracker.initialize();

    // Register with lifecycle management
    this.lifecycleContext = await lifecycleManager.initializeAgent(
      this.id,
      {
        name: this.config.name,
        type: 'coordinator',
        capabilities: [
          'enhanced-mesh-coordination',
          'byzantine-fault-tolerance',
          'distributed-consensus',
          'peer-discovery',
          'load-balancing',
        ],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3,
        },
        hooks: {
          init: 'echo "Enhanced mesh coordinator initialized"',
          task_complete: 'echo "Enhanced mesh coordination completed"',
          on_rerun_request: this.handleRerunRequest.bind(this),
          cleanup: 'echo "Enhanced mesh coordinator cleanup"',
        },
      },
      generateId('enhanced-mesh-task'),
    );

    await lifecycleManager.transitionState(this.id, 'running', 'Enhanced mesh coordinator started');

    // Initialize peer discovery
    if (this.config.peerDiscovery.enabled) {
      await this.initializePeerDiscovery();
    }

    // Initialize consensus mechanisms
    if (this.config.consensus.enableByzantine) {
      await this.initializeByzantineConsensus();
    }

    this.isRunning = true;
    this.startBackgroundTasks();

    this.logger.info('Enhanced mesh coordinator initialized successfully');
    this.emit('coordinator:initialized', { coordinatorId: this.id });
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down enhanced mesh coordinator...');
    this.isRunning = false;

    // Stop background tasks
    this.stopBackgroundTasks();

    // Handle completion dependencies if not forced
    if (!force && this.config.enableCrossTopology) {
      const canComplete = await this.checkCompletionDependencies();
      if (!canComplete) {
        this.logger.info(
          'Enhanced mesh coordinator has pending dependencies - deferring completion',
        );
        this.emit('coordinator:completion_deferred', {
          coordinatorId: this.id,
          reason: 'Pending cross-topology dependencies',
        });
        return;
      }
    }

    // Gracefully disconnect from mesh network
    await this.disconnectFromMesh();

    // Force completion if requested
    if (force) {
      await forceAgentCompletion(this.id, 'Enhanced mesh forced shutdown');
    }

    // Cleanup dependencies
    await this.cleanupDependencies();

    // Transition to stopped state
    await lifecycleManager.transitionState(
      this.id,
      'stopped',
      'Enhanced mesh coordinator shutdown',
    );

    // Shutdown dependency tracker
    await this.dependencyTracker.shutdown();

    this.logger.info('Enhanced mesh coordinator shutdown complete');
    this.emit('coordinator:shutdown', { coordinatorId: this.id });
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Agent Management with Enhanced Mesh Features
  // ============================================================================

  async registerAgent(agentId: string, agentInfo: Partial<AgentNode>): Promise<void> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached for enhanced mesh');
    }

    const agent: AgentNode = {
      id: agentId,
      name: agentInfo.name || `agent-${agentId}`,
      type: agentInfo.type || 'worker',
      status: 'initializing',
      capabilities: agentInfo.capabilities || [],
      topologyRole: agentInfo.topologyRole || 'worker',
      position: {
        connections: [],
      },
      workload: 0,
      lastActivity: new Date(),
      performanceMetrics: {
        tasksCompleted: 0,
        averageTaskTime: 0,
        errorCount: 0,
        reliability: 1.0,
      },
      communicationChannels: new Map(),
      dependencies: [],
      dependents: [],
      ...agentInfo,
    };

    this.agents.set(agentId, agent);

    // Establish mesh connections
    await this.establishMeshConnections(agentId);

    // Register dependency relationships
    await registerAgentDependency(
      this.id, // Coordinator depends on agent
      agentId, // Agent provides mesh participation
      DependencyType.COORDINATION,
      {
        timeout: this.config.timeouts.coordination,
        metadata: {
          coordinatorType: 'enhanced-mesh',
          relationship: 'mesh-participation',
          capabilities: agent.capabilities,
        },
      },
    );

    // Update agent status
    agent.status = 'ready';

    this.logger.info(
      `Registered agent ${agentId} in enhanced mesh (${this.agents.size}/${this.config.maxAgents})`,
    );
    this.emit('agent:registered', { agentId, coordinatorId: this.id });

    // Trigger consensus if this is a significant topology change
    if (this.agents.size % 5 === 0) {
      // Every 5 agents
      await this.proposeTopologyChange('agent_registered', {
        agentId,
        agentCount: this.agents.size,
      });
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.logger.info(`Unregistering agent ${agentId} from enhanced mesh`);

    // Disconnect agent from mesh
    await this.disconnectAgentFromMesh(agentId);

    // Remove dependencies
    const depStatus = getAgentDependencyStatus(agentId);
    for (const depId of depStatus.dependencies) {
      await removeAgentDependency(depId);
    }

    // Remove from registry
    this.agents.delete(agentId);

    this.emit('agent:unregistered', { agentId, coordinatorId: this.id });

    // Trigger consensus for topology change
    await this.proposeTopologyChange('agent_unregistered', {
      agentId,
      agentCount: this.agents.size,
    });
  }

  getAgent(agentId: string): AgentNode | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): AgentNode[] {
    return Array.from(this.agents.values());
  }

  // ============================================================================
  // Enhanced Mesh Connection Management
  // ============================================================================

  private async establishMeshConnections(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Find optimal mesh connections using enhanced algorithms
    const connections = await this.findOptimalConnections(agentId);

    for (const targetId of connections) {
      await this.createSecureConnection(agentId, targetId);
    }

    agent.position.connections = connections;
    this.logger.debug(`Established ${connections.length} mesh connections for agent ${agentId}`);
  }

  private async findOptimalConnections(agentId: string): Promise<string[]> {
    const agent = this.agents.get(agentId);
    if (!agent) return [];

    const candidates: Array<{ id: string; score: number }> = [];

    for (const [targetId, target] of this.agents) {
      if (targetId === agentId) continue;
      if (target.position.connections?.includes(agentId)) continue;

      // Calculate connection score based on multiple factors
      const capabilityOverlap = this.calculateCapabilityOverlap(
        agent.capabilities,
        target.capabilities,
      );
      const loadBalance = 1 / (target.workload + 1);
      const reliability = target.performanceMetrics.reliability;
      const connectionCount = target.position.connections?.length || 0;
      const connectionPenalty = connectionCount >= this.config.maxConnections ? 0 : 1;

      // Byzantine fault tolerance consideration
      const byzantineScore = this.config.faultTolerance.enabled
        ? this.getByzantineReliabilityScore(targetId)
        : 1;

      const score =
        capabilityOverlap * 0.3 +
        loadBalance * 0.25 +
        reliability * 0.25 +
        connectionPenalty * 0.1 +
        byzantineScore * 0.1;

      candidates.push({ id: targetId, score });
    }

    // Return top connections (limited by maxConnections)
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(this.config.maxConnections || 10, candidates.length))
      .map((c) => c.id);
  }

  private calculateCapabilityOverlap(caps1: string[], caps2: string[]): number {
    const set1 = new Set(caps1);
    const set2 = new Set(caps2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private getByzantineReliabilityScore(agentId: string): number {
    const peer = this.peers.get(agentId);
    if (!peer) return 0.5; // Default neutral score

    // Higher score = more reliable, lower Byzantine risk
    return Math.max(0, 1 - peer.byzantineScore);
  }

  private async createSecureConnection(sourceId: string, targetId: string): Promise<void> {
    const channelId = generateId('channel');

    const channel: CommunicationChannel = {
      id: channelId,
      sourceAgentId: sourceId,
      targetAgentId: targetId,
      type: 'direct',
      protocol: 'async',
      status: 'active',
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        averageLatency: 0,
        errorCount: 0,
        bandwidth: 0,
      },
      queueSize: 0,
      maxQueueSize: 100,
      compressionEnabled: this.config.networking.enableCompression,
      encryptionEnabled: this.config.networking.enableEncryption,
    };

    this.channels.set(channelId, channel);

    // Update agent connections
    const source = this.agents.get(sourceId);
    const target = this.agents.get(targetId);

    if (source && target) {
      source.communicationChannels.set(targetId, channel);
      target.communicationChannels.set(sourceId, channel);

      // Bidirectional connections
      if (!source.position.connections?.includes(targetId)) {
        source.position.connections?.push(targetId);
      }
      if (!target.position.connections?.includes(sourceId)) {
        target.position.connections?.push(sourceId);
      }
    }

    this.logger.debug(`Created secure connection: ${sourceId} <-> ${targetId}`);
    this.emit('connection:established', { sourceId, targetId, channelId });
  }

  private async disconnectAgentFromMesh(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Remove all connections
    const connections = agent.position.connections || [];
    for (const connectedId of connections) {
      await this.removeConnection(agentId, connectedId);
    }

    agent.position.connections = [];
    agent.communicationChannels.clear();
  }

  private async removeConnection(sourceId: string, targetId: string): Promise<void> {
    const source = this.agents.get(sourceId);
    const target = this.agents.get(targetId);

    if (source) {
      source.position.connections = source.position.connections?.filter((id) => id !== targetId);
      source.communicationChannels.delete(targetId);
    }

    if (target) {
      target.position.connections = target.position.connections?.filter((id) => id !== sourceId);
      target.communicationChannels.delete(sourceId);
    }

    // Remove channel
    for (const [channelId, channel] of this.channels) {
      if (
        (channel.sourceAgentId === sourceId && channel.targetAgentId === targetId) ||
        (channel.sourceAgentId === targetId && channel.targetAgentId === sourceId)
      ) {
        this.channels.delete(channelId);
        break;
      }
    }

    this.emit('connection:removed', { sourceId, targetId });
  }

  // ============================================================================
  // Task Coordination with Enhanced Features
  // ============================================================================

  async coordinateTask(task: CoordinationTask): Promise<string> {
    const taskId = task.id || generateId('enhanced-task');

    const enhancedTask: CoordinationTask = {
      ...task,
      id: taskId,
      topology: 'mesh',
      coordinatorId: this.id,
      status: 'pending',
      createdAt: new Date(),
      metadata: {
        ...task.metadata,
        enhancedMesh: true,
        consensusRequired: task.priority > 7, // High priority tasks need consensus
        byzantineTolerance: this.config.faultTolerance.enabled,
      },
    };

    this.tasks.set(taskId, enhancedTask);

    // Select agents using enhanced algorithms
    const selectedAgents = await this.selectAgentsForEnhancedTask(enhancedTask);

    if (selectedAgents.length === 0) {
      enhancedTask.status = 'failed';
      enhancedTask.error = 'No suitable agents available for enhanced task';
      this.emit('task:failed', { taskId, error: enhancedTask.error });
      return taskId;
    }

    enhancedTask.assignedAgents = selectedAgents.map((a) => a.id);

    // Create enhanced dependencies
    await this.createEnhancedTaskDependencies(taskId, selectedAgents);

    // Check if consensus is required for high-priority tasks
    if (enhancedTask.metadata.consensusRequired) {
      const consensusResult = await this.requestTaskConsensus(enhancedTask);
      if (!consensusResult) {
        enhancedTask.status = 'failed';
        enhancedTask.error = 'Task coordination consensus failed';
        this.emit('task:failed', { taskId, error: enhancedTask.error });
        return taskId;
      }
    }

    // Distribute task with Byzantine fault tolerance
    await this.distributeTaskWithFaultTolerance(enhancedTask, selectedAgents);

    enhancedTask.status = 'active';
    enhancedTask.startedAt = new Date();

    this.logger.info(`Coordinated enhanced task ${taskId} across ${selectedAgents.length} agents`);
    this.emit('task:coordinated', { taskId, agentIds: enhancedTask.assignedAgents });

    return taskId;
  }

  async delegateTask(taskId: string, agentIds: string[]): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const agents = agentIds
      .map((id) => this.agents.get(id))
      .filter((agent): agent is AgentNode => agent !== undefined);

    if (agents.length !== agentIds.length) {
      throw new Error('Some specified agents not found');
    }

    task.assignedAgents = agentIds;
    await this.distributeTaskWithFaultTolerance(task, agents);

    this.logger.info(`Delegated task ${taskId} to ${agentIds.length} agents`);
    this.emit('task:delegated', { taskId, agentIds });
  }

  private async selectAgentsForEnhancedTask(task: CoordinationTask): Promise<AgentNode[]> {
    const candidates: Array<{ agent: AgentNode; score: number }> = [];

    for (const [agentId, agent] of this.agents) {
      if (agent.status !== 'ready') continue;

      // Enhanced selection criteria
      const capabilityMatch = this.calculateTaskCapabilityMatch(task, agent);
      const loadScore = 1 / (agent.workload + 1);
      const reliabilityScore = agent.performanceMetrics.reliability;
      const connectivityScore =
        (agent.position.connections?.length || 0) / this.config.maxConnections!;
      const byzantineScore = this.getByzantineReliabilityScore(agentId);

      // Consider resource requirements
      const resourceScore = this.calculateResourceCompatibility(task, agent);

      const score =
        capabilityMatch * 0.35 +
        loadScore * 0.2 +
        reliabilityScore * 0.2 +
        connectivityScore * 0.1 +
        byzantineScore * 0.1 +
        resourceScore * 0.05;

      if (score > 0.3) {
        // Minimum threshold
        candidates.push({ agent, score });
      }
    }

    // Apply Byzantine fault tolerance - select diverse, reliable agents
    const sortedCandidates = candidates.sort((a, b) => b.score - a.score);
    const maxAgents = Math.min(
      task.assignedAgents.length || 3,
      Math.floor(this.agents.size / 2) + 1, // Byzantine fault tolerance requirement
    );

    return sortedCandidates.slice(0, maxAgents).map((c) => c.agent);
  }

  private calculateTaskCapabilityMatch(task: CoordinationTask, agent: AgentNode): number {
    // Extract required capabilities from task description or metadata
    const requiredCaps = (task.metadata.requiredCapabilities as string[]) || [];
    if (requiredCaps.length === 0) return 1; // No specific requirements

    const matches = requiredCaps.filter((cap) => agent.capabilities.includes(cap)).length;
    return matches / requiredCaps.length;
  }

  private calculateResourceCompatibility(task: CoordinationTask, agent: AgentNode): number {
    // Simple resource compatibility check
    const requirements = task.resourceRequirements;
    if (!requirements) return 1;

    // For now, assume agents can handle any resource requirements
    // In a real implementation, this would check actual agent capacity
    return 1;
  }

  private async createEnhancedTaskDependencies(taskId: string, agents: AgentNode[]): Promise<void> {
    // Create completion dependencies with Byzantine fault tolerance
    for (const agent of agents) {
      await registerAgentDependency(
        this.id, // Coordinator depends on agents
        agent.id, // Agent provides task completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.timeouts.completion,
          metadata: {
            taskId,
            coordinatorType: 'enhanced-mesh',
            relationship: 'enhanced-task-completion',
            byzantineTolerance: this.config.faultTolerance.enabled,
            redundancyFactor: this.config.faultTolerance.redundancyFactor,
          },
        },
      );

      agent.dependencies.push(this.id);
    }
  }

  private async requestTaskConsensus(task: CoordinationTask): Promise<boolean> {
    if (!this.config.consensus.enableByzantine) return true;

    const proposal: ConsensusProposal = {
      id: generateId('consensus'),
      proposerId: this.id,
      type: 'task_assignment',
      payload: {
        taskId: task.id,
        assignedAgents: task.assignedAgents,
        priority: task.priority,
      },
      timestamp: new Date(),
      requiredVotes: this.config.consensus.requiredVotes,
      votes: new Map(),
      status: 'pending',
      deadline: new Date(Date.now() + this.config.consensus.timeoutMs),
    };

    this.consensusState.activeProposals.set(proposal.id, proposal);

    // Request votes from mesh participants
    await this.broadcastConsensusProposal(proposal);

    // Wait for consensus or timeout
    return new Promise((resolve) => {
      const checkConsensus = () => {
        const currentProposal = this.consensusState.activeProposals.get(proposal.id);
        if (!currentProposal) {
          resolve(false);
          return;
        }

        const yesVotes = Array.from(currentProposal.votes.values()).filter(
          (vote) => vote === true,
        ).length;

        if (yesVotes >= currentProposal.requiredVotes) {
          currentProposal.status = 'accepted';
          resolve(true);
        } else if (currentProposal.deadline < new Date()) {
          currentProposal.status = 'timeout';
          resolve(false);
        } else {
          setTimeout(checkConsensus, 1000);
        }
      };

      setTimeout(checkConsensus, 1000);
    });
  }

  private async broadcastConsensusProposal(proposal: ConsensusProposal): Promise<void> {
    const message: CoordinationMessage = {
      id: generateId('consensus-msg'),
      type: 'coordination',
      sourceId: this.id,
      targetId: 'broadcast',
      payload: proposal,
      timestamp: new Date(),
      priority: 8,
      requiresAck: true,
      ttl: this.config.consensus.timeoutMs,
      retryCount: 0,
      maxRetries: 2,
    };

    await this.broadcastMessage(message);
  }

  private async distributeTaskWithFaultTolerance(
    task: CoordinationTask,
    agents: AgentNode[],
  ): Promise<void> {
    // Distribute task with redundancy for Byzantine fault tolerance
    const redundancyFactor = this.config.faultTolerance.redundancyFactor;

    for (const agent of agents) {
      agent.status = 'working';
      agent.workload += 1;
      agent.lastActivity = new Date();

      // Create task message with redundancy information
      const taskMessage: CoordinationMessage = {
        id: generateId('task-msg'),
        type: 'task',
        sourceId: this.id,
        targetId: agent.id,
        payload: {
          ...task,
          redundancyLevel: redundancyFactor,
          verificationRequired: this.config.faultTolerance.verificationRequired,
        },
        timestamp: new Date(),
        priority: task.priority,
        requiresAck: true,
        ttl: this.config.timeouts.completion,
        retryCount: 0,
        maxRetries: 3,
      };

      await this.sendMessage(taskMessage);
    }

    // Start enhanced monitoring
    this.startEnhancedTaskMonitoring(task.id);
  }

  // ============================================================================
  // Task Completion Handling
  // ============================================================================

  async handleTaskCompletion(taskId: string, agentId: string, result: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) return;

    // Update agent metrics
    agent.status = 'ready';
    agent.workload = Math.max(0, agent.workload - 1);
    agent.lastActivity = new Date();
    agent.performanceMetrics.tasksCompleted += 1;

    // Byzantine fault tolerance: verify result if required
    if (this.config.faultTolerance.verificationRequired) {
      const isValid = await this.verifyTaskResult(taskId, agentId, result);
      if (!isValid) {
        this.logger.warn(`Task result verification failed for ${taskId} from agent ${agentId}`);
        await this.handleTaskFailure(taskId, agentId, 'Result verification failed');
        return;
      }
    }

    // Check if all assigned agents completed
    const completedAgents = task.assignedAgents.filter((aId) => {
      const a = this.agents.get(aId);
      return a && a.status === 'ready';
    });

    if (completedAgents.length >= task.assignedAgents.length) {
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.actualDuration =
        task.completedAt.getTime() - (task.startedAt?.getTime() || task.createdAt.getTime());

      // Resolve dependencies
      await this.resolveTaskDependencies(taskId);

      this.logger.info(`Enhanced task ${taskId} completed successfully`);
      this.emit('task:completed', { taskId, result, duration: task.actualDuration });

      // Check coordinator completion
      await this.checkCoordinatorCompletion();
    }
  }

  async handleTaskFailure(taskId: string, agentId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) return;

    // Update agent metrics
    agent.performanceMetrics.errorCount += 1;
    agent.performanceMetrics.reliability = Math.max(0, agent.performanceMetrics.reliability - 0.1);

    // Increment Byzantine score if pattern detected
    const peer = this.peers.get(agentId);
    if (peer) {
      peer.byzantineScore += 0.1;
      if (peer.byzantineScore > 0.5) {
        this.logger.warn(`Agent ${agentId} showing Byzantine behavior pattern`);
        this.metrics.byzantineDetections += 1;
      }
    }

    // Byzantine fault tolerance: try to recover
    if (this.config.faultTolerance.enabled) {
      const recoverySuccessful = await this.attemptTaskRecovery(taskId, agentId, error);
      if (recoverySuccessful) {
        this.metrics.failureRecoveries += 1;
        return; // Recovery successful, don't mark as failed
      }
    }

    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();

    this.logger.error(`Enhanced task ${taskId} failed: ${error}`);
    this.emit('task:failed', { taskId, error, agentId });
  }

  private async verifyTaskResult(
    taskId: string,
    agentId: string,
    result: unknown,
  ): Promise<boolean> {
    // Byzantine fault tolerance: verify result integrity
    // In a real implementation, this would use cryptographic verification
    // or cross-validation with other agents

    // Simple verification: check if result is not null/undefined
    if (result === null || result === undefined) {
      return false;
    }

    // Check if result format is expected
    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>;
      if (!resultObj.status || !resultObj.data) {
        return false;
      }
    }

    return true;
  }

  private async attemptTaskRecovery(
    taskId: string,
    failedAgentId: string,
    error: string,
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    this.logger.info(`Attempting recovery for task ${taskId} after failure from ${failedAgentId}`);

    // Find alternative agents for recovery
    const availableAgents = Array.from(this.agents.values()).filter(
      (agent) =>
        agent.status === 'ready' &&
        !task.assignedAgents.includes(agent.id) &&
        agent.performanceMetrics.reliability > 0.8,
    );

    if (availableAgents.length === 0) {
      this.logger.warn(`No suitable agents available for task ${taskId} recovery`);
      return false;
    }

    // Select best recovery agent
    const recoveryAgent = availableAgents.sort(
      (a, b) => b.performanceMetrics.reliability - a.performanceMetrics.reliability,
    )[0];

    // Replace failed agent with recovery agent
    task.assignedAgents = task.assignedAgents.map((id) =>
      id === failedAgentId ? recoveryAgent.id : id,
    );

    // Redistribute task to recovery agent
    await this.distributeTaskWithFaultTolerance(task, [recoveryAgent]);

    this.logger.info(`Task ${taskId} recovery initiated with agent ${recoveryAgent.id}`);
    return true;
  }

  // ============================================================================
  // Communication Methods
  // ============================================================================

  async sendMessage(message: CoordinationMessage): Promise<void> {
    this.metrics.messagesProcessed += 1;

    const startTime = Date.now();

    try {
      // Find communication channel
      const channel = this.findChannel(message.sourceId, message.targetId);
      if (channel) {
        channel.metrics.messagesSent += 1;
        channel.queueSize += 1;

        // Simulate message processing
        await this.processMessage(message, channel);

        // Update latency metrics
        const latency = Date.now() - startTime;
        channel.metrics.averageLatency = (channel.metrics.averageLatency + latency) / 2;

        this.updateGlobalLatency(latency);
      } else {
        throw new Error(
          `No communication channel found between ${message.sourceId} and ${message.targetId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to send message ${message.id}: ${error}`);
      throw error;
    }
  }

  async broadcastMessage(message: Omit<CoordinationMessage, 'targetId'>): Promise<void> {
    const broadcastMessage: CoordinationMessage = {
      ...message,
      targetId: 'broadcast',
    };

    // Send to all connected agents
    const promises = Array.from(this.agents.keys()).map((agentId) =>
      this.sendMessage({ ...broadcastMessage, targetId: agentId }),
    );

    await Promise.allSettled(promises);
  }

  private findChannel(sourceId: string, targetId: string): CommunicationChannel | undefined {
    for (const channel of this.channels.values()) {
      if (
        (channel.sourceAgentId === sourceId && channel.targetAgentId === targetId) ||
        (channel.sourceAgentId === targetId && channel.targetAgentId === sourceId)
      ) {
        return channel;
      }
    }
    return undefined;
  }

  private async processMessage(
    message: CoordinationMessage,
    channel: CommunicationChannel,
  ): Promise<void> {
    // Apply compression if enabled
    if (channel.compressionEnabled) {
      // Simulate compression
      const originalSize = JSON.stringify(message.payload).length;
      const compressedSize = Math.floor(originalSize * 0.7); // 30% compression
      channel.metrics.bandwidth += compressedSize;
    } else {
      channel.metrics.bandwidth += JSON.stringify(message.payload).length;
    }

    // Process based on message type
    switch (message.type) {
      case 'coordination':
        await this.handleCoordinationMessage(message);
        break;
      case 'task':
        await this.handleTaskMessage(message);
        break;
      case 'status':
        await this.handleStatusMessage(message);
        break;
      case 'heartbeat':
        await this.handleHeartbeatMessage(message);
        break;
      default:
        this.logger.debug(`Received unknown message type: ${message.type}`);
    }

    channel.queueSize = Math.max(0, channel.queueSize - 1);
  }

  private async handleCoordinationMessage(message: CoordinationMessage): Promise<void> {
    if (message.payload && typeof message.payload === 'object') {
      const payload = message.payload as { type?: string };

      if (payload.type === 'consensus_proposal') {
        await this.handleConsensusProposal(message);
      } else if (payload.type === 'consensus_vote') {
        await this.handleConsensusVote(message);
      }
    }
  }

  private async handleTaskMessage(message: CoordinationMessage): Promise<void> {
    // Handle task-related messages
    this.logger.debug(`Received task message: ${message.id}`);
  }

  private async handleStatusMessage(message: CoordinationMessage): Promise<void> {
    // Handle status updates
    this.logger.debug(`Received status message from ${message.sourceId}`);
  }

  private async handleHeartbeatMessage(message: CoordinationMessage): Promise<void> {
    // Update last seen for sender
    const peer = this.peers.get(message.sourceId);
    if (peer) {
      peer.lastSeen = new Date();
    }
  }

  // ============================================================================
  // Consensus and Byzantine Fault Tolerance
  // ============================================================================

  private async handleConsensusProposal(message: CoordinationMessage): Promise<void> {
    const proposal = message.payload as ConsensusProposal;

    // Evaluate proposal
    const vote = await this.evaluateProposal(proposal);

    // Send vote back
    const voteMessage: CoordinationMessage = {
      id: generateId('vote'),
      type: 'coordination',
      sourceId: this.id,
      targetId: message.sourceId,
      payload: {
        type: 'consensus_vote',
        proposalId: proposal.id,
        vote: vote,
      },
      timestamp: new Date(),
      priority: 8,
      requiresAck: false,
      ttl: 10000,
      retryCount: 0,
      maxRetries: 1,
    };

    await this.sendMessage(voteMessage);
  }

  private async handleConsensusVote(message: CoordinationMessage): Promise<void> {
    const votePayload = message.payload as {
      proposalId: string;
      vote: boolean;
    };

    const proposal = this.consensusState.activeProposals.get(votePayload.proposalId);
    if (proposal) {
      proposal.votes.set(message.sourceId, votePayload.vote);
      this.logger.debug(
        `Received vote for proposal ${votePayload.proposalId}: ${votePayload.vote}`,
      );
    }
  }

  private async evaluateProposal(proposal: ConsensusProposal): Promise<boolean> {
    // Byzantine-safe proposal evaluation
    switch (proposal.type) {
      case 'task_assignment':
        return this.evaluateTaskAssignmentProposal(proposal);
      case 'topology_change':
        return this.evaluateTopologyChangeProposal(proposal);
      case 'leader_election':
        return this.evaluateLeaderElectionProposal(proposal);
      default:
        return false;
    }
  }

  private evaluateTaskAssignmentProposal(proposal: ConsensusProposal): boolean {
    const payload = proposal.payload as {
      taskId: string;
      assignedAgents: string[];
      priority: number;
    };

    // Check if agents are available and suitable
    const suitableAgents = payload.assignedAgents.filter((agentId) => {
      const agent = this.agents.get(agentId);
      return agent && agent.status === 'ready' && agent.performanceMetrics.reliability > 0.7;
    });

    return suitableAgents.length >= payload.assignedAgents.length * 0.8; // 80% threshold
  }

  private evaluateTopologyChangeProposal(proposal: ConsensusProposal): boolean {
    // Generally accept topology changes unless they're too disruptive
    return true;
  }

  private evaluateLeaderElectionProposal(proposal: ConsensusProposal): boolean {
    const payload = proposal.payload as { candidateId: string };
    const candidate = this.agents.get(payload.candidateId);

    return (
      candidate !== undefined &&
      candidate.performanceMetrics.reliability > 0.8 &&
      candidate.capabilities.includes('coordination')
    );
  }

  // ============================================================================
  // Peer Discovery and Network Management
  // ============================================================================

  private async initializePeerDiscovery(): Promise<void> {
    this.logger.info('Initializing peer discovery...');

    // Bootstrap with known nodes
    for (const bootstrapNode of this.config.peerDiscovery.bootstrapNodes) {
      await this.connectToPeer(bootstrapNode);
    }

    // Start discovery timer
    this.discoveryTimer = setInterval(() => {
      this.discoverPeers();
    }, this.config.peerDiscovery.discoveryInterval);
  }

  private async connectToPeer(peerAddress: string): Promise<void> {
    try {
      // In a real implementation, this would establish network connection
      const peerId = generateId('peer');

      const peer: PeerInfo = {
        id: peerId,
        address: peerAddress,
        capabilities: [], // Would be discovered
        reputation: 0.5, // Neutral starting reputation
        lastSeen: new Date(),
        connectionAttempts: 1,
        isReliable: true,
        byzantineScore: 0,
      };

      this.peers.set(peerId, peer);
      this.logger.debug(`Connected to peer: ${peerId} at ${peerAddress}`);
    } catch (error) {
      this.logger.warn(`Failed to connect to peer ${peerAddress}: ${error}`);
    }
  }

  private async discoverPeers(): Promise<void> {
    // Discover new peers through existing connections
    for (const peer of this.peers.values()) {
      if (peer.isReliable && peer.byzantineScore < 0.3) {
        // Request peer list from reliable peers
        // In a real implementation, this would send discovery messages
        this.logger.debug(`Discovering peers through ${peer.id}`);
      }
    }
  }

  // ============================================================================
  // Background Tasks and Monitoring
  // ============================================================================

  private startBackgroundTasks(): void {
    // Peer discovery
    if (this.config.peerDiscovery.enabled && !this.discoveryTimer) {
      this.discoveryTimer = setInterval(() => {
        this.discoverPeers();
      }, this.config.peerDiscovery.discoveryInterval);
    }

    // Heartbeat monitoring
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.networking.heartbeatInterval);

    // Load balancing
    this.loadBalanceTimer = setInterval(() => {
      this.rebalanceLoad();
    }, this.config.loadBalancing.rebalanceInterval);

    // Consensus cleanup
    this.consensusTimer = setInterval(() => {
      this.cleanupExpiredProposals();
    }, 30000); // Clean every 30 seconds
  }

  private stopBackgroundTasks(): void {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = undefined;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.loadBalanceTimer) {
      clearInterval(this.loadBalanceTimer);
      this.loadBalanceTimer = undefined;
    }

    if (this.consensusTimer) {
      clearInterval(this.consensusTimer);
      this.consensusTimer = undefined;
    }
  }

  private async sendHeartbeats(): Promise<void> {
    const heartbeatMessage: Omit<CoordinationMessage, 'targetId'> = {
      id: generateId('heartbeat'),
      type: 'heartbeat',
      sourceId: this.id,
      payload: {
        timestamp: new Date(),
        status: 'running',
        load: this.calculateCurrentLoad(),
      },
      timestamp: new Date(),
      priority: 1,
      requiresAck: false,
      ttl: this.config.networking.heartbeatInterval * 2,
      retryCount: 0,
      maxRetries: 0,
    };

    await this.broadcastMessage(heartbeatMessage);
  }

  private calculateCurrentLoad(): number {
    const totalWorkload = Array.from(this.agents.values()).reduce(
      (sum, agent) => sum + agent.workload,
      0,
    );

    return this.agents.size > 0 ? totalWorkload / this.agents.size : 0;
  }

  private async rebalanceLoad(): Promise<void> {
    const currentLoad = this.calculateCurrentLoad();

    if (currentLoad > this.config.loadBalancing.loadThreshold) {
      this.logger.info(`High load detected (${currentLoad.toFixed(2)}), rebalancing...`);

      // Find overloaded agents
      const overloadedAgents = Array.from(this.agents.values()).filter(
        (agent) => agent.workload > this.config.loadBalancing.loadThreshold * 2,
      );

      // Find underloaded agents
      const underloadedAgents = Array.from(this.agents.values()).filter(
        (agent) =>
          agent.workload < this.config.loadBalancing.loadThreshold * 0.5 &&
          agent.status === 'ready',
      );

      // Redistribute workload (simplified)
      for (const overloaded of overloadedAgents) {
        if (underloadedAgents.length > 0) {
          const target = underloadedAgents.shift()!;
          this.logger.debug(`Load balancing: ${overloaded.id} -> ${target.id}`);
          // In a real implementation, this would redistribute actual tasks
        }
      }
    }
  }

  private cleanupExpiredProposals(): void {
    const now = new Date();

    for (const [proposalId, proposal] of this.consensusState.activeProposals) {
      if (proposal.deadline < now) {
        proposal.status = 'timeout';
        this.consensusState.activeProposals.delete(proposalId);
        this.logger.debug(`Cleaned up expired proposal: ${proposalId}`);
      }
    }
  }

  private startEnhancedTaskMonitoring(taskId: string): void {
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && (task.status === 'active' || task.status === 'pending')) {
        this.logger.warn(`Task ${taskId} timeout, attempting recovery...`);
        this.handleTaskFailure(taskId, 'coordinator', 'Task timeout');
      }
    }, this.config.timeouts.completion);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private async initializeByzantineConsensus(): Promise<void> {
    this.logger.info('Initializing Byzantine consensus mechanisms...');
    this.consensusState.votingRound = 0;
  }

  private async proposeTopologyChange(changeType: string, payload: unknown): Promise<void> {
    if (!this.config.consensus.enableByzantine) return;

    const proposal: ConsensusProposal = {
      id: generateId('topo-change'),
      proposerId: this.id,
      type: 'topology_change',
      payload: { changeType, ...payload },
      timestamp: new Date(),
      requiredVotes: Math.min(
        this.config.consensus.requiredVotes,
        Math.floor(this.agents.size / 2) + 1,
      ),
      votes: new Map(),
      status: 'pending',
      deadline: new Date(Date.now() + this.config.consensus.timeoutMs),
    };

    this.consensusState.activeProposals.set(proposal.id, proposal);
    await this.broadcastConsensusProposal(proposal);
  }

  private async disconnectFromMesh(): Promise<void> {
    this.logger.info('Disconnecting from mesh network...');

    // Notify peers of departure
    const departureMessage: Omit<CoordinationMessage, 'targetId'> = {
      id: generateId('departure'),
      type: 'coordination',
      sourceId: this.id,
      payload: { type: 'coordinator_departure' },
      timestamp: new Date(),
      priority: 9,
      requiresAck: false,
      ttl: 5000,
      retryCount: 0,
      maxRetries: 1,
    };

    await this.broadcastMessage(departureMessage);

    // Close all channels
    this.channels.clear();
    this.peers.clear();
  }

  private async resolveTaskDependencies(taskId: string): Promise<void> {
    const depStatus = getAgentDependencyStatus(this.id);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        await this.dependencyTracker.resolveDependency(depId, this.tasks.get(taskId)?.result);
      }
    }
  }

  private async checkCompletionDependencies(): Promise<boolean> {
    const blockerInfo = await this.dependencyTracker.canAgentComplete(this.id);
    return blockerInfo.canComplete;
  }

  private async checkCoordinatorCompletion(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'active',
    );

    if (pendingTasks.length === 0) {
      const canComplete = await this.checkCompletionDependencies();
      if (canComplete && !this.isRunning) {
        await this.finalizeCompletion();
      }
    }
  }

  private async finalizeCompletion(): Promise<void> {
    this.logger.info('Enhanced mesh coordinator ready for completion');
    await this.cleanupDependencies();
    await lifecycleManager.transitionState(
      this.id,
      'stopped',
      'Enhanced mesh coordination completed',
    );
    this.emit('coordinator:completed', { coordinatorId: this.id });
  }

  private async cleanupDependencies(): Promise<void> {
    const depStatus = getAgentDependencyStatus(this.id);
    for (const depId of depStatus.dependencies) {
      await removeAgentDependency(depId);
    }
  }

  private updateGlobalLatency(latency: number): void {
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
  }

  private async handleRerunRequest(): Promise<void> {
    this.logger.info('Enhanced mesh coordinator rerun requested');
    await lifecycleManager.transitionState(this.id, 'running', 'Enhanced mesh coordinator rerun');
    this.isRunning = true;
    this.startBackgroundTasks();
    this.emit('coordinator:rerun', { coordinatorId: this.id });
  }

  private setupEventHandlers(): void {
    this.on('task:completed', this.handleTaskCompletionEvent.bind(this));
    this.on('task:failed', this.handleTaskFailureEvent.bind(this));
    this.on('agent:registered', this.handleAgentRegistrationEvent.bind(this));
  }

  private async handleTaskCompletionEvent(event: {
    taskId: string;
    result: unknown;
  }): Promise<void> {
    this.logger.debug(`Enhanced mesh task completion event: ${event.taskId}`);
  }

  private async handleTaskFailureEvent(event: { taskId: string; error: string }): Promise<void> {
    this.logger.debug(`Enhanced mesh task failure event: ${event.taskId}`);
  }

  private async handleAgentRegistrationEvent(event: { agentId: string }): Promise<void> {
    this.logger.debug(`Enhanced mesh agent registration event: ${event.agentId}`);
  }

  // ============================================================================
  // Public Status and Metrics Methods
  // ============================================================================

  getMetrics(): TopologyMetrics {
    const connectionCount = this.channels.size;
    const totalLatency = Array.from(this.channels.values()).reduce(
      (sum, channel) => sum + channel.metrics.averageLatency,
      0,
    );
    const averageLatency = connectionCount > 0 ? totalLatency / connectionCount : 0;

    const totalErrors = Array.from(this.channels.values()).reduce(
      (sum, channel) => sum + channel.metrics.errorCount,
      0,
    );
    const totalMessages = Array.from(this.channels.values()).reduce(
      (sum, channel) => sum + channel.metrics.messagesSent + channel.metrics.messagesReceived,
      0,
    );
    const errorRate = totalMessages > 0 ? totalErrors / totalMessages : 0;

    const throughput = Array.from(this.agents.values()).reduce(
      (sum, agent) => sum + agent.performanceMetrics.tasksCompleted,
      0,
    );

    return {
      id: this.id,
      type: 'mesh',
      agentCount: this.agents.size,
      connectionCount,
      averageLatency,
      throughput,
      errorRate,
      cpuUsage: this.calculateCurrentLoad(),
      memoryUsage: 0.3, // Placeholder
      lastUpdate: new Date(),
      coordinationEfficiency: this.calculateCoordinationEfficiency(),
      faultToleranceScore: this.calculateFaultToleranceScore(),
    };
  }

  getPerformanceStats(): Record<string, number> {
    return {
      messagesProcessed: this.metrics.messagesProcessed,
      consensusRounds: this.metrics.consensusRounds,
      failureRecoveries: this.metrics.failureRecoveries,
      averageLatency: this.metrics.averageLatency,
      byzantineDetections: this.metrics.byzantineDetections,
      activeProposals: this.consensusState.activeProposals.size,
      peerCount: this.peers.size,
      channelCount: this.channels.size,
    };
  }

  canAdaptTo(newType: TopologyType): boolean {
    // Enhanced mesh can adapt to hierarchical or hybrid
    return ['hierarchical', 'hybrid'].includes(newType);
  }

  getOptimizationRecommendations(): never[] {
    // Placeholder - would analyze current performance and suggest improvements
    return [];
  }

  private calculateCoordinationEfficiency(): number {
    const totalTasks = this.tasks.size;
    const completedTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'completed',
    ).length;

    return totalTasks > 0 ? completedTasks / totalTasks : 1;
  }

  private calculateFaultToleranceScore(): number {
    const byzantineDetectionRate =
      this.metrics.byzantineDetections / Math.max(1, this.metrics.messagesProcessed);
    const recoveryRate =
      this.metrics.failureRecoveries / Math.max(1, this.metrics.byzantineDetections + 1);

    return Math.max(0, 1 - byzantineDetectionRate + recoveryRate * 0.5);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEnhancedMeshCoordinator(
  config?: Partial<EnhancedMeshConfig>,
): EnhancedMeshCoordinator {
  return new EnhancedMeshCoordinator(config);
}

export function createEnhancedMeshCoordinatorWithByzantine(
  namespace: string,
  maxFaultyNodes: number = 1,
  config?: Partial<EnhancedMeshConfig>,
): EnhancedMeshCoordinator {
  const enhancedConfig: Partial<EnhancedMeshConfig> = {
    ...config,
    memoryNamespace: namespace,
    faultTolerance: {
      enabled: true,
      maxFaultyNodes,
      consensusAlgorithm: 'pbft',
      verificationRequired: true,
      redundancyFactor: Math.max(3, maxFaultyNodes * 2 + 1),
      timeoutMultiplier: 2,
    },
    consensus: {
      algorithm: 'pbft',
      requiredVotes: Math.max(3, maxFaultyNodes * 2 + 1),
      timeoutMs: 15000,
      enableByzantine: true,
    },
  };

  return new EnhancedMeshCoordinator(enhancedConfig);
}

// Export types for external use
export type { EnhancedMeshConfig };
