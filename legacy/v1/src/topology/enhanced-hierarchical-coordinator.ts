/**
 * Enhanced Hierarchical Coordinator with Dynamic Management
 *
 * Advanced hierarchical topology coordinator with dynamic hierarchy management,
 * parent-child delegation with failure recovery, promotion/demotion algorithms,
 * and hierarchical resource allocation strategies.
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
  ITopologyCoordinator,
  ICommunicationBridge,
} from './types.js';

// ============================================================================
// Enhanced Hierarchical Configuration
// ============================================================================

export interface EnhancedHierarchicalConfig extends TopologyConfiguration {
  managerId?: string;
  communicationBridge?: ICommunicationBridge;
  hierarchy: {
    maxDepth: number;
    maxChildrenPerNode: number;
    balancingStrategy: 'load-based' | 'capability-based' | 'geographical' | 'hybrid';
    promotionThreshold: number;
    demotionThreshold: number;
    rebalanceInterval: number;
  };
  delegation: {
    strategy: 'top-down' | 'bottom-up' | 'hybrid' | 'adaptive';
    enableSubdelegation: boolean;
    maxDelegationDepth: number;
    parallelDelegation: boolean;
  };
  recovery: {
    enableAutomaticRecovery: boolean;
    failureDetectionTimeout: number;
    recoveryAttempts: number;
    backupLeaderSelection: boolean;
  };
  resourceAllocation: {
    strategy: 'proportional' | 'priority-based' | 'capability-weighted';
    reserveCapacity: number;
    dynamicReallocation: boolean;
  };
}

// ============================================================================
// Enhanced Hierarchical Data Structures
// ============================================================================

interface HierarchicalNode extends AgentNode {
  hierarchyLevel: number;
  parentId?: string;
  childIds: string[];
  hierarchyPath: string[];
  leadershipScore: number;
  delegationCapacity: number;
  resourceAllocation: {
    cpu: number;
    memory: number;
    bandwidth: number;
    delegatedTasks: number;
  };
  subtreeMetrics: {
    totalNodes: number;
    activeNodes: number;
    failedNodes: number;
    averagePerformance: number;
  };
}

interface DelegationPath {
  taskId: string;
  path: Array<{
    agentId: string;
    level: number;
    delegationTime: Date;
    status: 'pending' | 'active' | 'completed' | 'failed';
  }>;
  totalDepth: number;
  expectedCompletionTime: Date;
}

interface PromotionCandidate {
  agentId: string;
  currentLevel: number;
  targetLevel: number;
  score: number;
  reasoning: string[];
  requirements: string[];
  promotionPlan: {
    steps: string[];
    estimatedDuration: number;
    riskAssessment: 'low' | 'medium' | 'high';
  };
}

interface ResourcePool {
  levelId: string;
  totalCapacity: {
    cpu: number;
    memory: number;
    bandwidth: number;
    taskSlots: number;
  };
  allocatedResources: {
    cpu: number;
    memory: number;
    bandwidth: number;
    taskSlots: number;
  };
  availableResources: {
    cpu: number;
    memory: number;
    bandwidth: number;
    taskSlots: number;
  };
  utilizationRate: number;
}

// ============================================================================
// Enhanced Hierarchical Coordinator Implementation
// ============================================================================

export class EnhancedHierarchicalCoordinator extends EventEmitter implements ITopologyCoordinator {
  readonly id: string;
  readonly type: TopologyType = 'hierarchical';
  readonly config: EnhancedHierarchicalConfig;

  private logger: Logger;
  private nodes: Map<string, HierarchicalNode>;
  private tasks: Map<string, CoordinationTask>;
  private delegationPaths: Map<string, DelegationPath>;
  private resourcePools: Map<number, ResourcePool>;
  private dependencyTracker: DependencyTracker;
  private lifecycleContext?: AgentLifecycleContext;
  private communicationBridge?: ICommunicationBridge;

  private isRunning: boolean = false;
  private rootNodeIds: Set<string>;
  private leaderNodes: Map<number, string>; // Level -> Leader node ID
  private promotionCandidates: PromotionCandidate[];

  // Background task timers
  private hierarchyRebalanceTimer?: NodeJS.Timeout;
  private resourceReallocationTimer?: NodeJS.Timeout;
  private failureDetectionTimer?: NodeJS.Timeout;
  private promotionEvaluationTimer?: NodeJS.Timeout;

  // Performance tracking
  private metrics: {
    delegationLatency: number;
    hierarchyEfficiency: number;
    promotions: number;
    demotions: number;
    recoveryActions: number;
    resourceUtilization: number;
  };

  constructor(config: Partial<EnhancedHierarchicalConfig> = {}) {
    super();

    this.id = generateId('enhanced-hier');
    this.logger = new Logger(`EnhancedHierarchicalCoordinator[${this.id}]`);

    this.config = {
      type: 'hierarchical',
      name: `enhanced-hierarchical-${this.id}`,
      strategy: 'adaptive',
      faultTolerance: 'basic',
      loadBalancing: 'capability-based',
      maxAgents: 200,
      maxDepth: 6,
      enableCrossTopology: true,
      enableAdaptiveOptimization: true,
      performanceThresholds: {
        latency: 800,
        throughput: 30,
        errorRate: 0.08,
      },
      timeouts: {
        coordination: 45000,
        completion: 300000,
        heartbeat: 8000,
      },
      memoryNamespace: `enhanced-hierarchical-${this.id}`,
      hierarchy: {
        maxDepth: 6,
        maxChildrenPerNode: 12,
        balancingStrategy: 'hybrid',
        promotionThreshold: 0.8,
        demotionThreshold: 0.3,
        rebalanceInterval: 60000,
      },
      delegation: {
        strategy: 'adaptive',
        enableSubdelegation: true,
        maxDelegationDepth: 4,
        parallelDelegation: true,
      },
      recovery: {
        enableAutomaticRecovery: true,
        failureDetectionTimeout: 20000,
        recoveryAttempts: 3,
        backupLeaderSelection: true,
      },
      resourceAllocation: {
        strategy: 'capability-weighted',
        reserveCapacity: 0.2,
        dynamicReallocation: true,
      },
      ...config,
    };

    this.nodes = new Map();
    this.tasks = new Map();
    this.delegationPaths = new Map();
    this.resourcePools = new Map();
    this.rootNodeIds = new Set();
    this.leaderNodes = new Map();
    this.promotionCandidates = [];
    this.dependencyTracker = getDependencyTracker(this.config.memoryNamespace);
    this.communicationBridge = config.communicationBridge;

    this.metrics = {
      delegationLatency: 0,
      hierarchyEfficiency: 1,
      promotions: 0,
      demotions: 0,
      recoveryActions: 0,
      resourceUtilization: 0,
    };

    this.setupEventHandlers();
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Enhanced hierarchical coordinator already running');
      return;
    }

    this.logger.info('Initializing enhanced hierarchical coordinator...');

    // Initialize dependency tracker
    await this.dependencyTracker.initialize();

    // Register with lifecycle management
    this.lifecycleContext = await lifecycleManager.initializeAgent(
      this.id,
      {
        name: this.config.name,
        type: 'coordinator',
        capabilities: [
          'enhanced-hierarchical-coordination',
          'dynamic-hierarchy-management',
          'intelligent-delegation',
          'automatic-recovery',
          'resource-allocation',
        ],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3,
        },
        hooks: {
          init: 'echo "Enhanced hierarchical coordinator initialized"',
          task_complete: 'echo "Enhanced hierarchical coordination completed"',
          on_rerun_request: this.handleRerunRequest.bind(this),
          cleanup: 'echo "Enhanced hierarchical coordinator cleanup"',
        },
      },
      generateId('enhanced-hier-task'),
    );

    await lifecycleManager.transitionState(
      this.id,
      'running',
      'Enhanced hierarchical coordinator started',
    );

    // Initialize resource pools for each level
    await this.initializeResourcePools();

    this.isRunning = true;
    this.startBackgroundTasks();

    this.logger.info('Enhanced hierarchical coordinator initialized successfully');
    this.emit('coordinator:initialized', { coordinatorId: this.id });
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down enhanced hierarchical coordinator...');
    this.isRunning = false;

    // Stop background tasks
    this.stopBackgroundTasks();

    // Handle completion dependencies if not forced
    if (!force) {
      const canComplete = await this.checkHierarchyCompletionDependencies();
      if (!canComplete) {
        this.logger.info(
          'Enhanced hierarchical coordinator has pending dependencies - deferring completion',
        );
        this.emit('coordinator:completion_deferred', {
          coordinatorId: this.id,
          reason: 'Pending hierarchical dependencies',
        });
        return;
      }
    }

    // Gracefully shutdown hierarchy
    await this.shutdownHierarchy();

    // Force completion if requested
    if (force) {
      await forceAgentCompletion(this.id, 'Enhanced hierarchical forced shutdown');
    }

    // Cleanup dependencies
    await this.cleanupDependencies();

    // Transition to stopped state
    await lifecycleManager.transitionState(
      this.id,
      'stopped',
      'Enhanced hierarchical coordinator shutdown',
    );

    // Shutdown dependency tracker
    await this.dependencyTracker.shutdown();

    this.logger.info('Enhanced hierarchical coordinator shutdown complete');
    this.emit('coordinator:shutdown', { coordinatorId: this.id });
  }

  isRunning(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Agent Management with Enhanced Hierarchy
  // ============================================================================

  async registerAgent(agentId: string, agentInfo: Partial<AgentNode>): Promise<void> {
    if (this.nodes.size >= this.config.maxAgents) {
      throw new Error('Maximum agent limit reached for enhanced hierarchy');
    }

    // Determine optimal placement in hierarchy
    const optimalPlacement = await this.findOptimalHierarchyPlacement(agentId, agentInfo);

    const node: HierarchicalNode = {
      id: agentId,
      name: agentInfo.name || `agent-${agentId}`,
      type: agentInfo.type || 'worker',
      status: 'initializing',
      capabilities: agentInfo.capabilities || [],
      topologyRole: agentInfo.topologyRole || 'worker',
      position: {
        level: optimalPlacement.level,
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
      hierarchyLevel: optimalPlacement.level,
      parentId: optimalPlacement.parentId,
      childIds: [],
      hierarchyPath: optimalPlacement.path,
      leadershipScore: this.calculateLeadershipScore(agentInfo),
      delegationCapacity: this.calculateDelegationCapacity(agentInfo),
      resourceAllocation: {
        cpu: 0,
        memory: 0,
        bandwidth: 0,
        delegatedTasks: 0,
      },
      subtreeMetrics: {
        totalNodes: 1,
        activeNodes: 1,
        failedNodes: 0,
        averagePerformance: 1.0,
      },
      ...agentInfo,
    };

    this.nodes.set(agentId, node);

    // Establish hierarchy relationships
    await this.establishHierarchyRelationships(node);

    // Allocate resources
    await this.allocateResources(node);

    // Register dependencies
    await this.registerHierarchyDependencies(node);

    // Update subtree metrics for ancestors
    await this.updateAncestorMetrics(agentId);

    node.status = 'ready';

    this.logger.info(
      `Registered agent ${agentId} at level ${node.hierarchyLevel} in enhanced hierarchy`,
    );
    this.emit('agent:registered', { agentId, coordinatorId: this.id, level: node.hierarchyLevel });

    // Consider for leadership role
    if (this.shouldConsiderForLeadership(node)) {
      await this.evaluateLeadershipCandidate(node);
    }
  }

  async unregisterAgent(agentId: string): Promise<void> {
    const node = this.nodes.get(agentId);
    if (!node) return;

    this.logger.info(`Unregistering agent ${agentId} from enhanced hierarchy`);

    // Handle children redistribution if this node has children
    if (node.childIds.length > 0) {
      await this.redistributeChildren(node);
    }

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((id) => id !== agentId);
        await this.updateSubtreeMetrics(parent.id);
      }
    } else {
      this.rootNodeIds.delete(agentId);
    }

    // Handle leadership transition if this was a leader
    if (this.isLeaderNode(agentId)) {
      await this.handleLeadershipTransition(agentId);
    }

    // Deallocate resources
    await this.deallocateResources(node);

    // Remove dependencies
    const depStatus = getAgentDependencyStatus(agentId);
    for (const depId of depStatus.dependencies) {
      await removeAgentDependency(depId);
    }

    // Remove from registry
    this.nodes.delete(agentId);

    this.emit('agent:unregistered', { agentId, coordinatorId: this.id });
  }

  getAgent(agentId: string): AgentNode | undefined {
    return this.nodes.get(agentId);
  }

  getAllAgents(): AgentNode[] {
    return Array.from(this.nodes.values());
  }

  // ============================================================================
  // Dynamic Hierarchy Management
  // ============================================================================

  private async findOptimalHierarchyPlacement(
    agentId: string,
    agentInfo: Partial<AgentNode>,
  ): Promise<{ level: number; parentId?: string; path: string[] }> {
    const capabilities = agentInfo.capabilities || [];
    const topologyRole = agentInfo.topologyRole || 'worker';

    // Leaders prefer higher levels
    if (topologyRole === 'coordinator' || capabilities.includes('coordination')) {
      return this.findLeadershipPosition();
    }

    // Workers prefer positions that balance load and capability match
    return this.findWorkerPosition(capabilities);
  }

  private async findLeadershipPosition(): Promise<{
    level: number;
    parentId?: string;
    path: string[];
  }> {
    // Try to place at level 1 (just below root) if space available
    for (let level = 1; level <= 3; level++) {
      const nodesAtLevel = Array.from(this.nodes.values()).filter(
        (node) => node.hierarchyLevel === level,
      );

      if (nodesAtLevel.length < Math.pow(this.config.hierarchy.maxChildrenPerNode, level)) {
        const parentId = level === 0 ? undefined : this.findBestParentAtLevel(level - 1);
        const path = parentId ? [...(this.nodes.get(parentId)?.hierarchyPath || []), parentId] : [];
        return { level, parentId, path };
      }
    }

    // Fallback to worker position
    return this.findWorkerPosition(['coordination']);
  }

  private async findWorkerPosition(
    capabilities: string[],
  ): Promise<{ level: number; parentId?: string; path: string[] }> {
    const candidates: Array<{ level: number; parentId?: string; path: string[]; score: number }> =
      [];

    // Evaluate placement at each level
    for (let level = 2; level <= this.config.hierarchy.maxDepth; level++) {
      const potentialParents = Array.from(this.nodes.values()).filter(
        (node) =>
          node.hierarchyLevel === level - 1 &&
          node.childIds.length < this.config.hierarchy.maxChildrenPerNode &&
          node.status === 'ready',
      );

      for (const parent of potentialParents) {
        const capabilityMatch = this.calculateCapabilityMatch(capabilities, parent.capabilities);
        const loadBalance = 1 / (parent.childIds.length + 1);
        const parentPerformance = parent.performanceMetrics.reliability;

        const score = capabilityMatch * 0.4 + loadBalance * 0.4 + parentPerformance * 0.2;

        candidates.push({
          level,
          parentId: parent.id,
          path: [...parent.hierarchyPath, parent.id],
          score,
        });
      }
    }

    if (candidates.length === 0) {
      // Place at root level if no suitable parents found
      return { level: 0, path: [] };
    }

    // Return best placement
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return { level: best.level, parentId: best.parentId, path: best.path };
  }

  private findBestParentAtLevel(level: number): string | undefined {
    const candidateParents = Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.hierarchyLevel === level &&
          node.childIds.length < this.config.hierarchy.maxChildrenPerNode &&
          node.status === 'ready',
      )
      .sort((a, b) => {
        const aScore = a.leadershipScore + 1 / (a.childIds.length + 1);
        const bScore = b.leadershipScore + 1 / (b.childIds.length + 1);
        return bScore - aScore;
      });

    return candidateParents[0]?.id;
  }

  private calculateCapabilityMatch(caps1: string[], caps2: string[]): number {
    const set1 = new Set(caps1);
    const set2 = new Set(caps2);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private calculateLeadershipScore(agentInfo: Partial<AgentNode>): number {
    const capabilities = agentInfo.capabilities || [];
    const hasCoordination = capabilities.includes('coordination');
    const hasLeadership = capabilities.includes('leadership');
    const hasManagement = capabilities.includes('management');

    let score = 0.5; // Base score
    if (hasCoordination) score += 0.3;
    if (hasLeadership) score += 0.2;
    if (hasManagement) score += 0.1;

    return Math.min(1.0, score);
  }

  private calculateDelegationCapacity(agentInfo: Partial<AgentNode>): number {
    const capabilities = agentInfo.capabilities || [];
    const hasTaskManagement = capabilities.includes('task-management');
    const hasCoordination = capabilities.includes('coordination');

    let capacity = 5; // Base capacity
    if (hasTaskManagement) capacity += 5;
    if (hasCoordination) capacity += 10;

    return capacity;
  }

  private async establishHierarchyRelationships(node: HierarchicalNode): Promise<void> {
    // Add to parent's children if has parent
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.childIds.push(node.id);

        // Establish communication channel
        const channelId = generateId('hier-channel');
        const channel = {
          id: channelId,
          sourceAgentId: node.id,
          targetAgentId: parent.id,
          type: 'routed' as const,
          protocol: 'sync' as const,
          status: 'active' as const,
          metrics: {
            messagesSent: 0,
            messagesReceived: 0,
            averageLatency: 0,
            errorCount: 0,
            bandwidth: 0,
          },
          queueSize: 0,
          maxQueueSize: 50,
          compressionEnabled: true,
          encryptionEnabled: false,
        };

        node.communicationChannels.set(parent.id, channel);
        parent.communicationChannels.set(node.id, channel);
      }
    } else {
      // Add to root nodes
      this.rootNodeIds.add(node.id);
    }
  }

  private async redistributeChildren(departingNode: HierarchicalNode): Promise<void> {
    if (departingNode.childIds.length === 0) return;

    this.logger.info(
      `Redistributing ${departingNode.childIds.length} children of departing node ${departingNode.id}`,
    );

    // Find suitable new parents at the same level or promote children
    const newParentCandidates = Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.hierarchyLevel === departingNode.hierarchyLevel &&
          node.id !== departingNode.id &&
          node.childIds.length < this.config.hierarchy.maxChildrenPerNode &&
          node.status === 'ready',
      )
      .sort((a, b) => {
        const aCapacity = this.config.hierarchy.maxChildrenPerNode - a.childIds.length;
        const bCapacity = this.config.hierarchy.maxChildrenPerNode - b.childIds.length;
        return bCapacity - aCapacity;
      });

    for (const childId of departingNode.childIds) {
      const child = this.nodes.get(childId);
      if (!child) continue;

      if (newParentCandidates.length > 0) {
        // Redistribute to existing parent
        const newParent = newParentCandidates[0];
        child.parentId = newParent.id;
        child.hierarchyPath = [...newParent.hierarchyPath, newParent.id];
        newParent.childIds.push(childId);

        // Update capacity tracking
        if (newParent.childIds.length >= this.config.hierarchy.maxChildrenPerNode) {
          newParentCandidates.shift();
        }
      } else {
        // Promote child to same level as departing node
        child.hierarchyLevel = departingNode.hierarchyLevel;
        child.parentId = departingNode.parentId;
        child.hierarchyPath = departingNode.hierarchyPath;

        if (departingNode.parentId) {
          const grandparent = this.nodes.get(departingNode.parentId);
          if (grandparent) {
            grandparent.childIds.push(childId);
          }
        } else {
          this.rootNodeIds.add(childId);
        }

        this.metrics.promotions += 1;
        this.logger.info(`Promoted child ${childId} to level ${child.hierarchyLevel}`);
      }

      await this.updateSubtreeMetrics(childId);
    }
  }

  private isLeaderNode(agentId: string): boolean {
    return Array.from(this.leaderNodes.values()).includes(agentId);
  }

  private async handleLeadershipTransition(departingLeaderId: string): Promise<void> {
    const departingNode = this.nodes.get(departingLeaderId);
    if (!departingNode) return;

    const level = departingNode.hierarchyLevel;
    this.logger.info(
      `Handling leadership transition at level ${level} for departing leader ${departingLeaderId}`,
    );

    // Find replacement leader
    const leadershipCandidates = Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.hierarchyLevel === level &&
          node.id !== departingLeaderId &&
          node.status === 'ready' &&
          node.leadershipScore > this.config.hierarchy.promotionThreshold,
      )
      .sort((a, b) => b.leadershipScore - a.leadershipScore);

    if (leadershipCandidates.length > 0) {
      const newLeader = leadershipCandidates[0];
      this.leaderNodes.set(level, newLeader.id);
      newLeader.topologyRole = 'coordinator';

      this.logger.info(`Selected new leader ${newLeader.id} for level ${level}`);
      this.emit('leadership:transition', {
        level,
        oldLeader: departingLeaderId,
        newLeader: newLeader.id,
      });
    } else {
      // No suitable replacement, remove leadership at this level
      this.leaderNodes.delete(level);
      this.logger.warn(`No suitable leadership replacement found for level ${level}`);
    }
  }

  // ============================================================================
  // Resource Allocation and Management
  // ============================================================================

  private async initializeResourcePools(): Promise<void> {
    for (let level = 0; level <= this.config.hierarchy.maxDepth; level++) {
      const pool: ResourcePool = {
        levelId: `level-${level}`,
        totalCapacity: {
          cpu: 100 * Math.pow(0.8, level), // Decrease with depth
          memory: 100 * Math.pow(0.8, level),
          bandwidth: 100 * Math.pow(0.9, level),
          taskSlots: 50 * Math.pow(0.7, level),
        },
        allocatedResources: { cpu: 0, memory: 0, bandwidth: 0, taskSlots: 0 },
        availableResources: { cpu: 0, memory: 0, bandwidth: 0, taskSlots: 0 },
        utilizationRate: 0,
      };

      // Calculate available resources (reserve some capacity)
      const reserveRatio = this.config.resourceAllocation.reserveCapacity;
      pool.availableResources = {
        cpu: pool.totalCapacity.cpu * (1 - reserveRatio),
        memory: pool.totalCapacity.memory * (1 - reserveRatio),
        bandwidth: pool.totalCapacity.bandwidth * (1 - reserveRatio),
        taskSlots: Math.floor(pool.totalCapacity.taskSlots * (1 - reserveRatio)),
      };

      this.resourcePools.set(level, pool);
    }

    this.logger.debug(`Initialized resource pools for ${this.resourcePools.size} hierarchy levels`);
  }

  private async allocateResources(node: HierarchicalNode): Promise<void> {
    const pool = this.resourcePools.get(node.hierarchyLevel);
    if (!pool) return;

    // Calculate resource requirements based on node capabilities and role
    const requirements = this.calculateResourceRequirements(node);

    // Check if resources are available
    if (this.canAllocateResources(pool, requirements)) {
      // Allocate resources
      node.resourceAllocation = requirements;
      pool.allocatedResources.cpu += requirements.cpu;
      pool.allocatedResources.memory += requirements.memory;
      pool.allocatedResources.bandwidth += requirements.bandwidth;
      pool.allocatedResources.delegatedTasks += requirements.delegatedTasks;

      // Update utilization rate
      pool.utilizationRate = this.calculateUtilizationRate(pool);

      this.logger.debug(
        `Allocated resources to ${node.id}: CPU ${requirements.cpu}, Memory ${requirements.memory}`,
      );
    } else {
      this.logger.warn(
        `Insufficient resources at level ${node.hierarchyLevel} for node ${node.id}`,
      );
      // Try to reallocate if dynamic reallocation is enabled
      if (this.config.resourceAllocation.dynamicReallocation) {
        await this.reallocateResources(node.hierarchyLevel);
      }
    }
  }

  private async deallocateResources(node: HierarchicalNode): Promise<void> {
    const pool = this.resourcePools.get(node.hierarchyLevel);
    if (!pool) return;

    // Deallocate resources
    pool.allocatedResources.cpu -= node.resourceAllocation.cpu;
    pool.allocatedResources.memory -= node.resourceAllocation.memory;
    pool.allocatedResources.bandwidth -= node.resourceAllocation.bandwidth;
    pool.allocatedResources.delegatedTasks -= node.resourceAllocation.delegatedTasks;

    // Ensure non-negative values
    pool.allocatedResources.cpu = Math.max(0, pool.allocatedResources.cpu);
    pool.allocatedResources.memory = Math.max(0, pool.allocatedResources.memory);
    pool.allocatedResources.bandwidth = Math.max(0, pool.allocatedResources.bandwidth);
    pool.allocatedResources.delegatedTasks = Math.max(0, pool.allocatedResources.delegatedTasks);

    // Update utilization rate
    pool.utilizationRate = this.calculateUtilizationRate(pool);

    this.logger.debug(`Deallocated resources from ${node.id}`);
  }

  private calculateResourceRequirements(node: HierarchicalNode): {
    cpu: number;
    memory: number;
    bandwidth: number;
    delegatedTasks: number;
  } {
    const baseCpu = 10;
    const baseMemory = 10;
    const baseBandwidth = 5;
    const baseTaskSlots = 3;

    let multiplier = 1;

    // Increase requirements for coordinators
    if (node.topologyRole === 'coordinator') {
      multiplier *= 2;
    }

    // Increase based on capabilities
    if (node.capabilities.includes('coordination')) multiplier *= 1.5;
    if (node.capabilities.includes('leadership')) multiplier *= 1.3;
    if (node.capabilities.includes('management')) multiplier *= 1.2;

    // Adjust based on hierarchy level (higher levels need more resources)
    const levelMultiplier = 1 + 0.2 * (this.config.hierarchy.maxDepth - node.hierarchyLevel);

    return {
      cpu: Math.ceil(baseCpu * multiplier * levelMultiplier),
      memory: Math.ceil(baseMemory * multiplier * levelMultiplier),
      bandwidth: Math.ceil(baseBandwidth * multiplier * levelMultiplier),
      delegatedTasks: Math.ceil(baseTaskSlots * multiplier),
    };
  }

  private canAllocateResources(
    pool: ResourcePool,
    requirements: { cpu: number; memory: number; bandwidth: number; delegatedTasks: number },
  ): boolean {
    const availableCpu = pool.totalCapacity.cpu - pool.allocatedResources.cpu;
    const availableMemory = pool.totalCapacity.memory - pool.allocatedResources.memory;
    const availableBandwidth = pool.totalCapacity.bandwidth - pool.allocatedResources.bandwidth;
    const availableTaskSlots =
      pool.totalCapacity.taskSlots - pool.allocatedResources.delegatedTasks;

    return (
      availableCpu >= requirements.cpu &&
      availableMemory >= requirements.memory &&
      availableBandwidth >= requirements.bandwidth &&
      availableTaskSlots >= requirements.delegatedTasks
    );
  }

  private calculateUtilizationRate(pool: ResourcePool): number {
    const cpuUtilization = pool.allocatedResources.cpu / pool.totalCapacity.cpu;
    const memoryUtilization = pool.allocatedResources.memory / pool.totalCapacity.memory;
    const bandwidthUtilization = pool.allocatedResources.bandwidth / pool.totalCapacity.bandwidth;
    const taskUtilization = pool.allocatedResources.delegatedTasks / pool.totalCapacity.taskSlots;

    return (cpuUtilization + memoryUtilization + bandwidthUtilization + taskUtilization) / 4;
  }

  private async reallocateResources(level: number): Promise<void> {
    this.logger.info(`Reallocating resources at level ${level}`);

    const nodesAtLevel = Array.from(this.nodes.values()).filter(
      (node) => node.hierarchyLevel === level,
    );

    // Collect all allocated resources
    let totalAllocated = { cpu: 0, memory: 0, bandwidth: 0, delegatedTasks: 0 };
    for (const node of nodesAtLevel) {
      totalAllocated.cpu += node.resourceAllocation.cpu;
      totalAllocated.memory += node.resourceAllocation.memory;
      totalAllocated.bandwidth += node.resourceAllocation.bandwidth;
      totalAllocated.delegatedTasks += node.resourceAllocation.delegatedTasks;
    }

    // Redistribute based on current performance and needs
    const pool = this.resourcePools.get(level);
    if (pool) {
      pool.allocatedResources = totalAllocated;
      pool.utilizationRate = this.calculateUtilizationRate(pool);
    }
  }

  // ============================================================================
  // Enhanced Task Coordination and Delegation
  // ============================================================================

  async coordinateTask(task: CoordinationTask): Promise<string> {
    const taskId = task.id || generateId('enhanced-hier-task');

    const enhancedTask: CoordinationTask = {
      ...task,
      id: taskId,
      topology: 'hierarchical',
      coordinatorId: this.id,
      status: 'pending',
      createdAt: new Date(),
      coordinationPattern: task.coordinationPattern || 'sequential',
      metadata: {
        ...task.metadata,
        enhancedHierarchical: true,
        delegationStrategy: this.config.delegation.strategy,
        requiresSubdelegation: task.priority > 6,
      },
    };

    this.tasks.set(taskId, enhancedTask);

    // Select optimal delegation path
    const delegationPath = await this.planDelegationPath(enhancedTask);
    this.delegationPaths.set(taskId, delegationPath);

    // Execute delegation
    await this.executeDelegation(enhancedTask, delegationPath);

    enhancedTask.status = 'active';
    enhancedTask.startedAt = new Date();

    this.logger.info(
      `Coordinated enhanced hierarchical task ${taskId} with ${delegationPath.totalDepth} levels`,
    );
    this.emit('task:coordinated', {
      taskId,
      agentIds: enhancedTask.assignedAgents,
      delegationDepth: delegationPath.totalDepth,
    });

    return taskId;
  }

  async delegateTask(taskId: string, agentIds: string[]): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const agents = agentIds
      .map((id) => this.nodes.get(id))
      .filter((agent): agent is HierarchicalNode => agent !== undefined);

    if (agents.length !== agentIds.length) {
      throw new Error('Some specified agents not found');
    }

    task.assignedAgents = agentIds;

    // Create new delegation path for manual delegation
    const delegationPath = await this.createDelegationPath(task, agents);
    this.delegationPaths.set(taskId, delegationPath);

    await this.executeDelegation(task, delegationPath);

    this.logger.info(`Manually delegated task ${taskId} to ${agentIds.length} agents`);
    this.emit('task:delegated', { taskId, agentIds });
  }

  private async planDelegationPath(task: CoordinationTask): Promise<DelegationPath> {
    const startTime = Date.now();

    // Select appropriate agents based on task requirements and hierarchy
    const selectedAgents = await this.selectAgentsForHierarchicalTask(task);

    if (selectedAgents.length === 0) {
      throw new Error('No suitable agents found for hierarchical delegation');
    }

    // Create delegation path
    const path = await this.createDelegationPath(task, selectedAgents);

    // Update delegation latency metric
    this.metrics.delegationLatency =
      (this.metrics.delegationLatency + (Date.now() - startTime)) / 2;

    return path;
  }

  private async selectAgentsForHierarchicalTask(
    task: CoordinationTask,
  ): Promise<HierarchicalNode[]> {
    const requiredCapabilities = (task.metadata.requiredCapabilities as string[]) || [];
    const priority = task.priority;

    // Strategy-based selection
    switch (this.config.delegation.strategy) {
      case 'top-down':
        return this.selectAgentsTopDown(requiredCapabilities, priority);
      case 'bottom-up':
        return this.selectAgentsBottomUp(requiredCapabilities, priority);
      case 'adaptive':
        return this.selectAgentsAdaptive(task);
      case 'hybrid':
      default:
        return this.selectAgentsHybrid(requiredCapabilities, priority);
    }
  }

  private async selectAgentsTopDown(
    capabilities: string[],
    priority: number,
  ): Promise<HierarchicalNode[]> {
    const selectedAgents: HierarchicalNode[] = [];

    // Start from top levels and work down
    for (let level = 0; level <= this.config.hierarchy.maxDepth; level++) {
      const candidatesAtLevel = Array.from(this.nodes.values())
        .filter(
          (node) =>
            node.hierarchyLevel === level &&
            node.status === 'ready' &&
            this.hasRequiredCapabilities(node, capabilities),
        )
        .sort((a, b) => b.leadershipScore - a.leadershipScore);

      if (candidatesAtLevel.length > 0) {
        selectedAgents.push(candidatesAtLevel[0]);
        if (selectedAgents.length >= 3) break; // Limit selection
      }
    }

    return selectedAgents;
  }

  private async selectAgentsBottomUp(
    capabilities: string[],
    priority: number,
  ): Promise<HierarchicalNode[]> {
    const selectedAgents: HierarchicalNode[] = [];

    // Start from bottom levels and work up
    for (let level = this.config.hierarchy.maxDepth; level >= 0; level--) {
      const candidatesAtLevel = Array.from(this.nodes.values())
        .filter(
          (node) =>
            node.hierarchyLevel === level &&
            node.status === 'ready' &&
            this.hasRequiredCapabilities(node, capabilities) &&
            node.workload < node.delegationCapacity * 0.8,
        )
        .sort((a, b) => b.performanceMetrics.reliability - a.performanceMetrics.reliability);

      if (candidatesAtLevel.length > 0) {
        selectedAgents.push(candidatesAtLevel[0]);
        if (selectedAgents.length >= 3) break;
      }
    }

    return selectedAgents;
  }

  private async selectAgentsAdaptive(task: CoordinationTask): Promise<HierarchicalNode[]> {
    // Analyze task characteristics to determine best approach
    const isComplexTask =
      task.priority > 7 || ((task.metadata.requiredCapabilities as string[]) || []).length > 3;
    const needsCoordination =
      task.coordinationPattern === 'parallel' || task.coordinationPattern === 'mapreduce';

    if (needsCoordination || isComplexTask) {
      return this.selectAgentsTopDown(
        (task.metadata.requiredCapabilities as string[]) || [],
        task.priority,
      );
    } else {
      return this.selectAgentsBottomUp(
        (task.metadata.requiredCapabilities as string[]) || [],
        task.priority,
      );
    }
  }

  private async selectAgentsHybrid(
    capabilities: string[],
    priority: number,
  ): Promise<HierarchicalNode[]> {
    const selectedAgents: HierarchicalNode[] = [];

    // Select one coordinator from top levels
    const coordinators = Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.hierarchyLevel <= 2 &&
          node.topologyRole === 'coordinator' &&
          node.status === 'ready',
      )
      .sort((a, b) => b.leadershipScore - a.leadershipScore);

    if (coordinators.length > 0) {
      selectedAgents.push(coordinators[0]);
    }

    // Select workers from appropriate levels
    const workers = Array.from(this.nodes.values())
      .filter(
        (node) =>
          node.hierarchyLevel >= 2 &&
          node.status === 'ready' &&
          this.hasRequiredCapabilities(node, capabilities) &&
          node.workload < node.delegationCapacity * 0.7,
      )
      .sort((a, b) => b.performanceMetrics.reliability - a.performanceMetrics.reliability)
      .slice(0, 4); // Limit workers

    selectedAgents.push(...workers);

    return selectedAgents;
  }

  private hasRequiredCapabilities(node: HierarchicalNode, requiredCapabilities: string[]): boolean {
    if (requiredCapabilities.length === 0) return true;
    return requiredCapabilities.every((cap) => node.capabilities.includes(cap));
  }

  private async createDelegationPath(
    task: CoordinationTask,
    agents: HierarchicalNode[],
  ): Promise<DelegationPath> {
    const path: DelegationPath['path'] = agents.map((agent) => ({
      agentId: agent.id,
      level: agent.hierarchyLevel,
      delegationTime: new Date(),
      status: 'pending' as const,
    }));

    // Sort by hierarchy level (top-down delegation)
    path.sort((a, b) => a.level - b.level);

    const estimatedDuration = this.estimateTaskDuration(task, agents);

    return {
      taskId: task.id,
      path,
      totalDepth: path.length,
      expectedCompletionTime: new Date(Date.now() + estimatedDuration),
    };
  }

  private estimateTaskDuration(task: CoordinationTask, agents: HierarchicalNode[]): number {
    const baseEstimate = task.estimatedDuration || 60000; // 1 minute default

    // Adjust based on delegation complexity
    const delegationOverhead = agents.length * 1000; // 1 second per agent

    // Adjust based on hierarchy depth
    const maxLevel = Math.max(...agents.map((a) => a.hierarchyLevel));
    const depthOverhead = maxLevel * 500; // 0.5 seconds per level

    return baseEstimate + delegationOverhead + depthOverhead;
  }

  private async executeDelegation(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Register dependencies for hierarchical coordination
    await this.registerHierarchicalTaskDependencies(task, delegationPath);

    // Execute delegation according to pattern
    switch (task.coordinationPattern) {
      case 'sequential':
        await this.executeSequentialDelegation(task, delegationPath);
        break;
      case 'parallel':
        await this.executeParallelDelegation(task, delegationPath);
        break;
      case 'pipeline':
        await this.executePipelineDelegation(task, delegationPath);
        break;
      case 'mapreduce':
        await this.executeMapReduceDelegation(task, delegationPath);
        break;
      default:
        await this.executeSequentialDelegation(task, delegationPath);
    }

    // Update task assignment
    task.assignedAgents = delegationPath.path.map((p) => p.agentId);
  }

  private async executeSequentialDelegation(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Delegate to agents in sequence (top-down)
    for (const step of delegationPath.path) {
      const agent = this.nodes.get(step.agentId);
      if (agent) {
        await this.delegateToAgent(task, agent, 'sequential');
        step.status = 'active';
        step.delegationTime = new Date();
      }
    }
  }

  private async executeParallelDelegation(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Delegate to all agents simultaneously
    const promises = delegationPath.path.map(async (step) => {
      const agent = this.nodes.get(step.agentId);
      if (agent) {
        await this.delegateToAgent(task, agent, 'parallel');
        step.status = 'active';
        step.delegationTime = new Date();
      }
    });

    await Promise.allSettled(promises);
  }

  private async executePipelineDelegation(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Create pipeline stages based on hierarchy levels
    const stages = new Map<number, typeof delegationPath.path>();

    for (const step of delegationPath.path) {
      if (!stages.has(step.level)) {
        stages.set(step.level, []);
      }
      stages.get(step.level)!.push(step);
    }

    // Execute stages in order
    const sortedLevels = Array.from(stages.keys()).sort();
    for (const level of sortedLevels) {
      const stageSteps = stages.get(level)!;
      const promises = stageSteps.map(async (step) => {
        const agent = this.nodes.get(step.agentId);
        if (agent) {
          await this.delegateToAgent(task, agent, 'pipeline');
          step.status = 'active';
          step.delegationTime = new Date();
        }
      });

      await Promise.allSettled(promises);
    }
  }

  private async executeMapReduceDelegation(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Separate mappers and reducers
    const mappers = delegationPath.path.filter((step) => step.level >= 3); // Lower levels for mapping
    const reducers = delegationPath.path.filter((step) => step.level < 3); // Higher levels for reducing

    // Execute map phase
    const mapPromises = mappers.map(async (step) => {
      const agent = this.nodes.get(step.agentId);
      if (agent) {
        await this.delegateToAgent(task, agent, 'map');
        step.status = 'active';
        step.delegationTime = new Date();
      }
    });

    await Promise.allSettled(mapPromises);

    // Execute reduce phase
    const reducePromises = reducers.map(async (step) => {
      const agent = this.nodes.get(step.agentId);
      if (agent) {
        await this.delegateToAgent(task, agent, 'reduce');
        step.status = 'active';
        step.delegationTime = new Date();
      }
    });

    await Promise.allSettled(reducePromises);
  }

  private async delegateToAgent(
    task: CoordinationTask,
    agent: HierarchicalNode,
    executionMode: string,
  ): Promise<void> {
    // Update agent workload
    agent.workload += 1;
    agent.lastActivity = new Date();
    agent.status = 'working';
    agent.resourceAllocation.delegatedTasks += 1;

    // Create delegation message
    const delegationMessage: CoordinationMessage = {
      id: generateId('delegation'),
      type: 'task',
      sourceId: this.id,
      targetId: agent.id,
      payload: {
        task,
        executionMode,
        hierarchyContext: {
          level: agent.hierarchyLevel,
          parentId: agent.parentId,
          childIds: agent.childIds,
          delegationCapacity: agent.delegationCapacity,
        },
      },
      timestamp: new Date(),
      priority: task.priority,
      requiresAck: true,
      ttl: this.config.timeouts.completion,
      retryCount: 0,
      maxRetries: 2,
    };

    // Send delegation (simulated)
    await this.sendMessage(delegationMessage);

    this.logger.debug(`Delegated task ${task.id} to agent ${agent.id} in ${executionMode} mode`);
  }

  // ============================================================================
  // Task Completion and Recovery
  // ============================================================================

  async handleTaskCompletion(taskId: string, agentId: string, result: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.nodes.get(agentId);
    const delegationPath = this.delegationPaths.get(taskId);

    if (!task || !agent || !delegationPath) return;

    // Update agent metrics and status
    agent.status = 'ready';
    agent.workload = Math.max(0, agent.workload - 1);
    agent.lastActivity = new Date();
    agent.performanceMetrics.tasksCompleted += 1;
    agent.resourceAllocation.delegatedTasks = Math.max(
      0,
      agent.resourceAllocation.delegatedTasks - 1,
    );

    // Calculate task completion time
    const taskStartTime = delegationPath.path.find((p) => p.agentId === agentId)?.delegationTime;
    if (taskStartTime) {
      const completionTime = Date.now() - taskStartTime.getTime();
      agent.performanceMetrics.averageTaskTime =
        (agent.performanceMetrics.averageTaskTime + completionTime) / 2;
    }

    // Update delegation path
    const pathStep = delegationPath.path.find((p) => p.agentId === agentId);
    if (pathStep) {
      pathStep.status = 'completed';
    }

    // Check if all agents in delegation path completed
    const allCompleted = delegationPath.path.every((p) => p.status === 'completed');

    if (allCompleted) {
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;
      task.actualDuration =
        task.completedAt.getTime() - (task.startedAt?.getTime() || task.createdAt.getTime());

      // Resolve dependencies
      await this.resolveHierarchicalTaskDependencies(taskId);

      // Update hierarchy efficiency metric
      this.updateHierarchyEfficiency(task, delegationPath);

      this.logger.info(`Enhanced hierarchical task ${taskId} completed by all agents`);
      this.emit('task:completed', { taskId, result, delegationDepth: delegationPath.totalDepth });

      // Check coordinator completion
      await this.checkCoordinatorCompletion();
    }

    // Update subtree metrics
    await this.updateSubtreeMetrics(agentId);
  }

  async handleTaskFailure(taskId: string, agentId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.nodes.get(agentId);
    const delegationPath = this.delegationPaths.get(taskId);

    if (!task || !agent) return;

    // Update agent metrics
    agent.performanceMetrics.errorCount += 1;
    agent.performanceMetrics.reliability = Math.max(
      0.1,
      agent.performanceMetrics.reliability - 0.05,
    );
    agent.status = 'ready'; // Reset to ready for potential retry
    agent.workload = Math.max(0, agent.workload - 1);
    agent.resourceAllocation.delegatedTasks = Math.max(
      0,
      agent.resourceAllocation.delegatedTasks - 1,
    );

    // Update delegation path
    if (delegationPath) {
      const pathStep = delegationPath.path.find((p) => p.agentId === agentId);
      if (pathStep) {
        pathStep.status = 'failed';
      }
    }

    // Attempt recovery if enabled
    if (this.config.recovery.enableAutomaticRecovery) {
      const recoverySuccessful = await this.attemptHierarchicalRecovery(taskId, agentId, error);
      if (recoverySuccessful) {
        this.metrics.recoveryActions += 1;
        this.logger.info(`Successfully recovered task ${taskId} after failure from ${agentId}`);
        return; // Recovery successful, don't mark as failed
      }
    }

    // Mark task as failed if recovery unsuccessful
    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date();

    this.logger.error(`Enhanced hierarchical task ${taskId} failed: ${error}`);
    this.emit('task:failed', { taskId, error, agentId });

    // Update subtree metrics
    await this.updateSubtreeMetrics(agentId);
  }

  private async attemptHierarchicalRecovery(
    taskId: string,
    failedAgentId: string,
    error: string,
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    const delegationPath = this.delegationPaths.get(taskId);
    const failedAgent = this.nodes.get(failedAgentId);

    if (!task || !delegationPath || !failedAgent) return false;

    this.logger.info(
      `Attempting hierarchical recovery for task ${taskId} after failure from ${failedAgentId}`,
    );

    // Strategy 1: Try sibling agents at the same level
    const siblings = await this.findSiblingAgents(failedAgent);
    for (const sibling of siblings) {
      if (
        sibling.status === 'ready' &&
        sibling.workload < sibling.delegationCapacity * 0.8 &&
        this.hasRequiredCapabilities(
          sibling,
          (task.metadata.requiredCapabilities as string[]) || [],
        )
      ) {
        // Replace failed agent with sibling
        const pathStep = delegationPath.path.find((p) => p.agentId === failedAgentId);
        if (pathStep) {
          pathStep.agentId = sibling.id;
          pathStep.status = 'pending';
          pathStep.delegationTime = new Date();
        }

        // Update task assignment
        task.assignedAgents = task.assignedAgents.map((id) =>
          id === failedAgentId ? sibling.id : id,
        );

        // Delegate to recovery agent
        await this.delegateToAgent(task, sibling, 'recovery');

        this.logger.info(`Recovered task ${taskId} using sibling agent ${sibling.id}`);
        return true;
      }
    }

    // Strategy 2: Try agents at parent level (escalation)
    if (failedAgent.parentId) {
      const parent = this.nodes.get(failedAgent.parentId);
      if (
        parent &&
        parent.status === 'ready' &&
        parent.workload < parent.delegationCapacity * 0.9
      ) {
        // Escalate to parent
        const pathStep = delegationPath.path.find((p) => p.agentId === failedAgentId);
        if (pathStep) {
          pathStep.agentId = parent.id;
          pathStep.level = parent.hierarchyLevel;
          pathStep.status = 'pending';
          pathStep.delegationTime = new Date();
        }

        task.assignedAgents = task.assignedAgents.map((id) =>
          id === failedAgentId ? parent.id : id,
        );

        await this.delegateToAgent(task, parent, 'escalation');

        this.logger.info(`Recovered task ${taskId} by escalating to parent ${parent.id}`);
        return true;
      }
    }

    // Strategy 3: Try to delegate to children (sub-delegation)
    if (this.config.delegation.enableSubdelegation && failedAgent.childIds.length > 0) {
      const suitableChildren = failedAgent.childIds
        .map((id) => this.nodes.get(id))
        .filter(
          (child): child is HierarchicalNode =>
            child !== undefined &&
            child.status === 'ready' &&
            child.workload < child.delegationCapacity * 0.8,
        );

      if (suitableChildren.length > 0) {
        const recoveryChild = suitableChildren[0];

        const pathStep = delegationPath.path.find((p) => p.agentId === failedAgentId);
        if (pathStep) {
          pathStep.agentId = recoveryChild.id;
          pathStep.level = recoveryChild.hierarchyLevel;
          pathStep.status = 'pending';
          pathStep.delegationTime = new Date();
        }

        task.assignedAgents = task.assignedAgents.map((id) =>
          id === failedAgentId ? recoveryChild.id : id,
        );

        await this.delegateToAgent(task, recoveryChild, 'sub-delegation');

        this.logger.info(`Recovered task ${taskId} by sub-delegating to child ${recoveryChild.id}`);
        return true;
      }
    }

    this.logger.warn(`No recovery strategy available for task ${taskId} failure`);
    return false;
  }

  private async findSiblingAgents(agent: HierarchicalNode): Promise<HierarchicalNode[]> {
    if (!agent.parentId) {
      // Root level siblings
      return Array.from(this.nodes.values()).filter(
        (node) =>
          node.hierarchyLevel === agent.hierarchyLevel && node.id !== agent.id && !node.parentId,
      );
    }

    const parent = this.nodes.get(agent.parentId);
    if (!parent) return [];

    return parent.childIds
      .map((id) => this.nodes.get(id))
      .filter(
        (sibling): sibling is HierarchicalNode => sibling !== undefined && sibling.id !== agent.id,
      );
  }

  // ============================================================================
  // Metrics and Monitoring
  // ============================================================================

  private async updateSubtreeMetrics(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Calculate subtree metrics
    const subtreeNodes = await this.getSubtreeNodes(nodeId);

    node.subtreeMetrics = {
      totalNodes: subtreeNodes.length,
      activeNodes: subtreeNodes.filter((n) => n.status === 'ready' || n.status === 'working')
        .length,
      failedNodes: subtreeNodes.filter((n) => n.status === 'failed').length,
      averagePerformance:
        subtreeNodes.reduce((sum, n) => sum + n.performanceMetrics.reliability, 0) /
        subtreeNodes.length,
    };

    // Recursively update parent metrics
    if (node.parentId) {
      await this.updateSubtreeMetrics(node.parentId);
    }
  }

  private async getSubtreeNodes(rootId: string): Promise<HierarchicalNode[]> {
    const root = this.nodes.get(rootId);
    if (!root) return [];

    const subtree: HierarchicalNode[] = [root];

    // Recursively collect all descendants
    for (const childId of root.childIds) {
      const childSubtree = await this.getSubtreeNodes(childId);
      subtree.push(...childSubtree);
    }

    return subtree;
  }

  private updateHierarchyEfficiency(task: CoordinationTask, delegationPath: DelegationPath): void {
    const actualDuration = task.actualDuration || 0;
    const expectedDuration =
      delegationPath.expectedCompletionTime.getTime() - task.createdAt.getTime();

    const efficiency = expectedDuration > 0 ? Math.min(1, expectedDuration / actualDuration) : 1;

    this.metrics.hierarchyEfficiency = (this.metrics.hierarchyEfficiency + efficiency) / 2;
  }

  private async updateAncestorMetrics(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node || !node.parentId) return;

    await this.updateSubtreeMetrics(node.parentId);
  }

  // ============================================================================
  // Background Tasks and Promotion/Demotion
  // ============================================================================

  private startBackgroundTasks(): void {
    // Hierarchy rebalancing
    this.hierarchyRebalanceTimer = setInterval(() => {
      this.rebalanceHierarchy();
    }, this.config.hierarchy.rebalanceInterval);

    // Resource reallocation
    if (this.config.resourceAllocation.dynamicReallocation) {
      this.resourceReallocationTimer = setInterval(() => {
        this.dynamicResourceReallocation();
      }, 45000); // Every 45 seconds
    }

    // Failure detection
    if (this.config.recovery.enableAutomaticRecovery) {
      this.failureDetectionTimer = setInterval(() => {
        this.detectAndHandleFailures();
      }, this.config.recovery.failureDetectionTimeout);
    }

    // Promotion/demotion evaluation
    this.promotionEvaluationTimer = setInterval(() => {
      this.evaluatePromotionDemotionOpportunities();
    }, 90000); // Every 90 seconds
  }

  private stopBackgroundTasks(): void {
    if (this.hierarchyRebalanceTimer) {
      clearInterval(this.hierarchyRebalanceTimer);
      this.hierarchyRebalanceTimer = undefined;
    }

    if (this.resourceReallocationTimer) {
      clearInterval(this.resourceReallocationTimer);
      this.resourceReallocationTimer = undefined;
    }

    if (this.failureDetectionTimer) {
      clearInterval(this.failureDetectionTimer);
      this.failureDetectionTimer = undefined;
    }

    if (this.promotionEvaluationTimer) {
      clearInterval(this.promotionEvaluationTimer);
      this.promotionEvaluationTimer = undefined;
    }
  }

  private async rebalanceHierarchy(): Promise<void> {
    this.logger.debug('Rebalancing hierarchy...');

    // Check for overloaded nodes at each level
    for (let level = 0; level <= this.config.hierarchy.maxDepth; level++) {
      const nodesAtLevel = Array.from(this.nodes.values()).filter(
        (node) => node.hierarchyLevel === level,
      );

      for (const node of nodesAtLevel) {
        // Check if node is overloaded
        if (node.childIds.length > this.config.hierarchy.maxChildrenPerNode * 0.9) {
          await this.redistributeChildren(node);
        }

        // Check for underutilized nodes
        if (node.childIds.length === 0 && node.hierarchyLevel > 0 && node.workload === 0) {
          await this.considerNodeDemotion(node);
        }
      }
    }
  }

  private async dynamicResourceReallocation(): Promise<void> {
    for (const [level, pool] of this.resourcePools) {
      if (pool.utilizationRate > 0.9) {
        // High utilization - try to reallocate
        await this.reallocateResources(level);
      }
    }

    // Update global resource utilization metric
    const totalUtilization = Array.from(this.resourcePools.values()).reduce(
      (sum, pool) => sum + pool.utilizationRate,
      0,
    );

    this.metrics.resourceUtilization =
      this.resourcePools.size > 0 ? totalUtilization / this.resourcePools.size : 0;
  }

  private async detectAndHandleFailures(): Promise<void> {
    const now = new Date();
    const timeoutThreshold = this.config.recovery.failureDetectionTimeout;

    for (const [nodeId, node] of this.nodes) {
      const timeSinceActivity = now.getTime() - node.lastActivity.getTime();

      if (timeSinceActivity > timeoutThreshold && node.status === 'working') {
        this.logger.warn(
          `Detected potential failure in node ${nodeId} (no activity for ${timeSinceActivity}ms)`,
        );

        // Mark as failed and attempt recovery
        node.status = 'failed';
        await this.handleNodeFailure(nodeId);
      }
    }
  }

  private async handleNodeFailure(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.logger.info(`Handling failure for node ${nodeId}`);

    // Find active tasks assigned to this node
    const activeTasks = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'active' && task.assignedAgents.includes(nodeId),
    );

    // Attempt recovery for each active task
    for (const task of activeTasks) {
      await this.attemptHierarchicalRecovery(task.id, nodeId, 'Node failure detected');
    }

    // Handle children redistribution
    if (node.childIds.length > 0) {
      await this.redistributeChildren(node);
    }
  }

  private async evaluatePromotionDemotionOpportunities(): Promise<void> {
    this.promotionCandidates = [];

    for (const [nodeId, node] of this.nodes) {
      // Check for promotion opportunities
      if (
        node.performanceMetrics.reliability > this.config.hierarchy.promotionThreshold &&
        node.leadershipScore > this.config.hierarchy.promotionThreshold &&
        node.hierarchyLevel < this.config.hierarchy.maxDepth - 1
      ) {
        const promotionCandidate = await this.evaluatePromotionCandidate(node);
        if (promotionCandidate) {
          this.promotionCandidates.push(promotionCandidate);
        }
      }

      // Check for demotion opportunities
      if (
        node.performanceMetrics.reliability < this.config.hierarchy.demotionThreshold &&
        node.hierarchyLevel > 0
      ) {
        await this.considerNodeDemotion(node);
      }
    }

    // Execute top promotion recommendations
    const topPromotions = this.promotionCandidates.sort((a, b) => b.score - a.score).slice(0, 2); // Limit to 2 promotions per cycle

    for (const promotion of topPromotions) {
      await this.executePromotion(promotion);
    }
  }

  private async evaluatePromotionCandidate(
    node: HierarchicalNode,
  ): Promise<PromotionCandidate | null> {
    const targetLevel = Math.max(0, node.hierarchyLevel - 1); // Promote one level up

    // Check if there's space at target level
    const nodesAtTargetLevel = Array.from(this.nodes.values()).filter(
      (n) => n.hierarchyLevel === targetLevel,
    );

    if (
      nodesAtTargetLevel.length >=
      Math.pow(this.config.hierarchy.maxChildrenPerNode, targetLevel + 1)
    ) {
      return null; // No space for promotion
    }

    // Calculate promotion score
    const performanceScore = node.performanceMetrics.reliability;
    const leadershipScore = node.leadershipScore;
    const capacityScore = node.delegationCapacity / 20; // Normalize
    const experienceScore = Math.min(1, node.performanceMetrics.tasksCompleted / 50);

    const score =
      performanceScore * 0.3 + leadershipScore * 0.3 + capacityScore * 0.2 + experienceScore * 0.2;

    if (score < 0.7) return null; // Minimum score threshold

    return {
      agentId: node.id,
      currentLevel: node.hierarchyLevel,
      targetLevel,
      score,
      reasoning: [
        `High performance: ${(performanceScore * 100).toFixed(1)}%`,
        `Strong leadership: ${(leadershipScore * 100).toFixed(1)}%`,
        `Good delegation capacity: ${node.delegationCapacity}`,
        `Completed ${node.performanceMetrics.tasksCompleted} tasks`,
      ],
      requirements: [
        'Maintain current performance level',
        'Accept increased coordination responsibilities',
        'Manage additional subordinates',
      ],
      promotionPlan: {
        steps: [
          'Update hierarchy position',
          'Establish new parent-child relationships',
          'Reallocate resources',
          'Update communication channels',
        ],
        estimatedDuration: 30000, // 30 seconds
        riskAssessment: score > 0.85 ? 'low' : 'medium',
      },
    };
  }

  private async executePromotion(promotion: PromotionCandidate): Promise<void> {
    const node = this.nodes.get(promotion.agentId);
    if (!node) return;

    this.logger.info(
      `Promoting agent ${promotion.agentId} from level ${promotion.currentLevel} to ${promotion.targetLevel}`,
    );

    // Find new parent at target level
    const newParentId = this.findBestParentAtLevel(promotion.targetLevel - 1);

    // Remove from current parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== node.id);
      }
    } else {
      this.rootNodeIds.delete(node.id);
    }

    // Update node hierarchy position
    node.hierarchyLevel = promotion.targetLevel;
    node.parentId = newParentId;
    node.hierarchyPath = newParentId
      ? [...(this.nodes.get(newParentId)?.hierarchyPath || []), newParentId]
      : [];

    // Add to new parent or root
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (newParent) {
        newParent.childIds.push(node.id);
      }
    } else {
      this.rootNodeIds.add(node.id);
    }

    // Reallocate resources
    await this.deallocateResources(node);
    await this.allocateResources(node);

    // Update dependencies
    await this.updatePromotionDependencies(node);

    // Update metrics
    await this.updateSubtreeMetrics(node.id);
    if (node.parentId) {
      await this.updateSubtreeMetrics(node.parentId);
    }

    this.metrics.promotions += 1;

    this.emit('agent:promoted', {
      agentId: promotion.agentId,
      fromLevel: promotion.currentLevel,
      toLevel: promotion.targetLevel,
      score: promotion.score,
    });
  }

  private async considerNodeDemotion(node: HierarchicalNode): Promise<void> {
    if (node.hierarchyLevel >= this.config.hierarchy.maxDepth) return;

    this.logger.info(`Considering demotion for underperforming node ${node.id}`);

    const targetLevel = node.hierarchyLevel + 1; // Demote one level down

    // Find suitable parent at current level
    const potentialParents = Array.from(this.nodes.values()).filter(
      (n) =>
        n.hierarchyLevel === node.hierarchyLevel &&
        n.id !== node.id &&
        n.childIds.length < this.config.hierarchy.maxChildrenPerNode &&
        n.performanceMetrics.reliability > this.config.hierarchy.promotionThreshold,
    );

    if (potentialParents.length === 0) return;

    const newParent = potentialParents[0];

    // Execute demotion
    await this.executeDemotion(node, newParent, targetLevel);
  }

  private async executeDemotion(
    node: HierarchicalNode,
    newParent: HierarchicalNode,
    targetLevel: number,
  ): Promise<void> {
    this.logger.info(
      `Demoting agent ${node.id} from level ${node.hierarchyLevel} to ${targetLevel}`,
    );

    // Remove from current parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter((id) => id !== node.id);
      }
    } else {
      this.rootNodeIds.delete(node.id);
    }

    // Update hierarchy position
    node.hierarchyLevel = targetLevel;
    node.parentId = newParent.id;
    node.hierarchyPath = [...newParent.hierarchyPath, newParent.id];

    // Add to new parent
    newParent.childIds.push(node.id);

    // Reallocate resources
    await this.deallocateResources(node);
    await this.allocateResources(node);

    // Update dependencies
    await this.updatePromotionDependencies(node);

    // Update metrics
    await this.updateSubtreeMetrics(node.id);
    await this.updateSubtreeMetrics(newParent.id);

    this.metrics.demotions += 1;

    this.emit('agent:demoted', {
      agentId: node.id,
      fromLevel: targetLevel - 1,
      toLevel: targetLevel,
      newParentId: newParent.id,
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private shouldConsiderForLeadership(node: HierarchicalNode): boolean {
    return (
      node.leadershipScore > 0.7 &&
      node.capabilities.includes('coordination') &&
      node.hierarchyLevel <= 2
    );
  }

  private async evaluateLeadershipCandidate(node: HierarchicalNode): Promise<void> {
    const level = node.hierarchyLevel;
    const currentLeader = this.leaderNodes.get(level);

    if (
      !currentLeader ||
      node.leadershipScore > (this.nodes.get(currentLeader)?.leadershipScore || 0)
    ) {
      this.leaderNodes.set(level, node.id);
      node.topologyRole = 'coordinator';

      this.logger.info(`Agent ${node.id} elected as leader for level ${level}`);
      this.emit('leadership:elected', {
        agentId: node.id,
        level,
        previousLeader: currentLeader,
      });
    }
  }

  private async registerHierarchyDependencies(node: HierarchicalNode): Promise<void> {
    // Register coordination dependency
    await registerAgentDependency(
      this.id, // Coordinator depends on node
      node.id, // Node provides hierarchical participation
      DependencyType.COORDINATION,
      {
        timeout: this.config.timeouts.coordination,
        metadata: {
          coordinatorType: 'enhanced-hierarchical',
          relationship: 'hierarchical-participation',
          level: node.hierarchyLevel,
          capabilities: node.capabilities,
        },
      },
    );

    // Register parent-child dependencies if applicable
    if (node.parentId) {
      await registerAgentDependency(
        node.parentId, // Parent depends on child
        node.id, // Child provides completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.timeouts.completion,
          metadata: {
            coordinatorType: 'enhanced-hierarchical',
            relationship: 'parent-child',
            parentLevel: node.hierarchyLevel - 1,
            childLevel: node.hierarchyLevel,
          },
        },
      );
    }
  }

  private async registerHierarchicalTaskDependencies(
    task: CoordinationTask,
    delegationPath: DelegationPath,
  ): Promise<void> {
    // Register completion dependencies for each agent in delegation path
    for (const step of delegationPath.path) {
      await registerAgentDependency(
        this.id, // Coordinator depends on agents
        step.agentId, // Agent provides task completion
        DependencyType.COMPLETION,
        {
          timeout: this.config.timeouts.completion,
          metadata: {
            taskId: task.id,
            coordinatorType: 'enhanced-hierarchical',
            relationship: 'hierarchical-task-completion',
            delegationLevel: step.level,
            delegationDepth: delegationPath.totalDepth,
          },
        },
      );
    }
  }

  private async updatePromotionDependencies(node: HierarchicalNode): Promise<void> {
    // Remove old dependencies
    const depStatus = getAgentDependencyStatus(node.id);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.relationship === 'parent-child') {
        await removeAgentDependency(depId);
      }
    }

    // Add new dependencies based on updated hierarchy position
    await this.registerHierarchyDependencies(node);
  }

  private async sendMessage(message: CoordinationMessage): Promise<void> {
    // Simulate message sending in hierarchical topology
    this.logger.debug(
      `Sending message ${message.id} from ${message.sourceId} to ${message.targetId}`,
    );

    // In a real implementation, this would route through the hierarchy
    // For now, just emit an event
    this.emit('message:sent', message);
  }

  private async shutdownHierarchy(): Promise<void> {
    this.logger.info('Gracefully shutting down hierarchy...');

    // Notify all nodes of shutdown
    const shutdownMessage: Omit<CoordinationMessage, 'targetId'> = {
      id: generateId('shutdown'),
      type: 'coordination',
      sourceId: this.id,
      payload: { type: 'coordinator_shutdown' },
      timestamp: new Date(),
      priority: 10,
      requiresAck: false,
      ttl: 5000,
      retryCount: 0,
      maxRetries: 0,
    };

    for (const nodeId of this.nodes.keys()) {
      await this.sendMessage({ ...shutdownMessage, targetId: nodeId });
    }
  }

  private async checkHierarchyCompletionDependencies(): Promise<boolean> {
    const blockerInfo = await this.dependencyTracker.canAgentComplete(this.id);
    return blockerInfo.canComplete;
  }

  private async checkCoordinatorCompletion(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'pending' || t.status === 'active',
    );

    if (pendingTasks.length === 0) {
      const canComplete = await this.checkHierarchyCompletionDependencies();
      if (canComplete && !this.isRunning) {
        await this.finalizeCompletion();
      }
    }
  }

  private async finalizeCompletion(): Promise<void> {
    this.logger.info('Enhanced hierarchical coordinator ready for completion');
    await this.cleanupDependencies();
    await lifecycleManager.transitionState(
      this.id,
      'stopped',
      'Enhanced hierarchical coordination completed',
    );
    this.emit('coordinator:completed', { coordinatorId: this.id });
  }

  private async cleanupDependencies(): Promise<void> {
    const depStatus = getAgentDependencyStatus(this.id);
    for (const depId of depStatus.dependencies) {
      await removeAgentDependency(depId);
    }
  }

  private async resolveHierarchicalTaskDependencies(taskId: string): Promise<void> {
    const depStatus = getAgentDependencyStatus(this.id);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.metadata?.taskId === taskId) {
        await this.dependencyTracker.resolveDependency(depId, this.tasks.get(taskId)?.result);
      }
    }
  }

  private async handleRerunRequest(): Promise<void> {
    this.logger.info('Enhanced hierarchical coordinator rerun requested');
    await lifecycleManager.transitionState(
      this.id,
      'running',
      'Enhanced hierarchical coordinator rerun',
    );
    this.isRunning = true;
    this.startBackgroundTasks();
    this.emit('coordinator:rerun', { coordinatorId: this.id });
  }

  private setupEventHandlers(): void {
    this.on('task:completed', this.handleTaskCompletionEvent.bind(this));
    this.on('task:failed', this.handleTaskFailureEvent.bind(this));
    this.on('agent:promoted', this.handleAgentPromotionEvent.bind(this));
    this.on('agent:demoted', this.handleAgentDemotionEvent.bind(this));
  }

  private async handleTaskCompletionEvent(event: {
    taskId: string;
    result: unknown;
  }): Promise<void> {
    this.logger.debug(`Enhanced hierarchical task completion event: ${event.taskId}`);
  }

  private async handleTaskFailureEvent(event: { taskId: string; error: string }): Promise<void> {
    this.logger.debug(`Enhanced hierarchical task failure event: ${event.taskId}`);
  }

  private async handleAgentPromotionEvent(event: {
    agentId: string;
    fromLevel: number;
    toLevel: number;
  }): Promise<void> {
    this.logger.debug(
      `Agent promotion event: ${event.agentId} promoted from level ${event.fromLevel} to ${event.toLevel}`,
    );
  }

  private async handleAgentDemotionEvent(event: {
    agentId: string;
    fromLevel: number;
    toLevel: number;
  }): Promise<void> {
    this.logger.debug(
      `Agent demotion event: ${event.agentId} demoted from level ${event.fromLevel} to ${event.toLevel}`,
    );
  }

  // ============================================================================
  // Public Status and Metrics Methods
  // ============================================================================

  getMetrics(): TopologyMetrics {
    const totalConnections = Array.from(this.nodes.values()).reduce(
      (sum, node) => sum + node.communicationChannels.size,
      0,
    );

    const totalLatency = Array.from(this.nodes.values()).reduce((sum, node) => {
      const channelLatencies = Array.from(node.communicationChannels.values()).map(
        (channel) => channel.metrics.averageLatency,
      );
      return (
        sum + channelLatencies.reduce((a, b) => a + b, 0) / Math.max(1, channelLatencies.length)
      );
    }, 0);

    const averageLatency = this.nodes.size > 0 ? totalLatency / this.nodes.size : 0;

    const totalErrors = Array.from(this.nodes.values()).reduce(
      (sum, node) => sum + node.performanceMetrics.errorCount,
      0,
    );

    const totalTasks = Array.from(this.nodes.values()).reduce(
      (sum, node) => sum + node.performanceMetrics.tasksCompleted,
      0,
    );

    const errorRate = totalTasks > 0 ? totalErrors / totalTasks : 0;

    const throughput = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'completed',
    ).length;

    return {
      id: this.id,
      type: 'hierarchical',
      agentCount: this.nodes.size,
      connectionCount: totalConnections,
      averageLatency,
      throughput,
      errorRate,
      cpuUsage: this.metrics.resourceUtilization,
      memoryUsage: 0.4, // Placeholder
      lastUpdate: new Date(),
      coordinationEfficiency: this.metrics.hierarchyEfficiency,
      faultToleranceScore: this.calculateFaultToleranceScore(),
    };
  }

  getPerformanceStats(): Record<string, number> {
    return {
      delegationLatency: this.metrics.delegationLatency,
      hierarchyEfficiency: this.metrics.hierarchyEfficiency,
      promotions: this.metrics.promotions,
      demotions: this.metrics.demotions,
      recoveryActions: this.metrics.recoveryActions,
      resourceUtilization: this.metrics.resourceUtilization,
      hierarchyDepth: this.config.hierarchy.maxDepth,
      activeLeaders: this.leaderNodes.size,
      totalResourcePools: this.resourcePools.size,
      promotionCandidates: this.promotionCandidates.length,
    };
  }

  canAdaptTo(newType: TopologyType): boolean {
    // Enhanced hierarchical can adapt to mesh or hybrid
    return ['mesh', 'hybrid'].includes(newType);
  }

  getOptimizationRecommendations(): never[] {
    // Placeholder - would analyze hierarchy performance and suggest improvements
    return [];
  }

  private calculateFaultToleranceScore(): number {
    const totalRecoveryAttempts = this.metrics.recoveryActions;
    const successfulRecoveries = totalRecoveryAttempts * 0.8; // Assume 80% success rate

    const recoveryRate =
      totalRecoveryAttempts > 0 ? successfulRecoveries / totalRecoveryAttempts : 1;
    const hierarchyStability = this.metrics.hierarchyEfficiency;

    return recoveryRate * 0.6 + hierarchyStability * 0.4;
  }

  // Public methods for hierarchy inspection
  getHierarchyStructure(): {
    levels: Array<{
      level: number;
      nodes: Array<{
        id: string;
        name: string;
        parentId?: string;
        childIds: string[];
        isLeader: boolean;
        workload: number;
        status: string;
      }>;
    }>;
    depth: number;
    totalNodes: number;
  } {
    const levelMap = new Map<number, HierarchicalNode[]>();

    // Group nodes by level
    for (const node of this.nodes.values()) {
      if (!levelMap.has(node.hierarchyLevel)) {
        levelMap.set(node.hierarchyLevel, []);
      }
      levelMap.get(node.hierarchyLevel)!.push(node);
    }

    const levels = Array.from(levelMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([level, nodes]) => ({
        level,
        nodes: nodes.map((node) => ({
          id: node.id,
          name: node.name,
          parentId: node.parentId,
          childIds: [...node.childIds],
          isLeader: this.leaderNodes.get(level) === node.id,
          workload: node.workload,
          status: node.status,
        })),
      }));

    return {
      levels,
      depth: Math.max(...Array.from(levelMap.keys())) + 1,
      totalNodes: this.nodes.size,
    };
  }

  getResourceAllocation(): Record<
    number,
    {
      level: number;
      totalCapacity: { cpu: number; memory: number; bandwidth: number; taskSlots: number };
      allocated: { cpu: number; memory: number; bandwidth: number; taskSlots: number };
      utilization: number;
    }
  > {
    const allocation: Record<number, any> = {};

    for (const [level, pool] of this.resourcePools) {
      allocation[level] = {
        level,
        totalCapacity: { ...pool.totalCapacity },
        allocated: { ...pool.allocatedResources },
        utilization: pool.utilizationRate,
      };
    }

    return allocation;
  }

  getDelegationPaths(): Array<{
    taskId: string;
    totalDepth: number;
    expectedCompletion: Date;
    path: Array<{
      agentId: string;
      level: number;
      status: string;
      delegationTime: Date;
    }>;
  }> {
    return Array.from(this.delegationPaths.values()).map((path) => ({
      taskId: path.taskId,
      totalDepth: path.totalDepth,
      expectedCompletion: path.expectedCompletionTime,
      path: path.path.map((step) => ({
        agentId: step.agentId,
        level: step.level,
        status: step.status,
        delegationTime: step.delegationTime,
      })),
    }));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createEnhancedHierarchicalCoordinator(
  config?: Partial<EnhancedHierarchicalConfig>,
): EnhancedHierarchicalCoordinator {
  return new EnhancedHierarchicalCoordinator(config);
}

export function createEnhancedHierarchicalCoordinatorWithRecovery(
  namespace: string,
  maxDepth: number = 6,
  config?: Partial<EnhancedHierarchicalConfig>,
): EnhancedHierarchicalCoordinator {
  const enhancedConfig: Partial<EnhancedHierarchicalConfig> = {
    ...config,
    memoryNamespace: namespace,
    hierarchy: {
      maxDepth,
      maxChildrenPerNode: 12,
      balancingStrategy: 'hybrid',
      promotionThreshold: 0.8,
      demotionThreshold: 0.3,
      rebalanceInterval: 60000,
    },
    recovery: {
      enableAutomaticRecovery: true,
      failureDetectionTimeout: 20000,
      recoveryAttempts: 3,
      backupLeaderSelection: true,
    },
    delegation: {
      strategy: 'adaptive',
      enableSubdelegation: true,
      maxDelegationDepth: Math.max(4, maxDepth - 2),
      parallelDelegation: true,
    },
  };

  return new EnhancedHierarchicalCoordinator(enhancedConfig);
}

// Export types for external use
export type { EnhancedHierarchicalConfig, HierarchicalNode, DelegationPath, PromotionCandidate };
