/**
 * Enhanced Swarm Message Router - Extends SwarmMessageRouter for Full-Stack Teams
 * Maintains backward compatibility with existing 3-agent swarms
 * Supports 2-20 agents with intelligent coordination
 */

import { EventEmitter } from 'events';
import { SwarmMessageRouter } from '../../web/messaging/swarm-message-router.js';
import { AgentMessage, MessageQuery, SwarmState, FullStackAgentMessage, FullStackAgentType, SwarmTeamComposition, FullStackAgent, ComplexityLevel } from '../types/index.js';
import type { ILogger } from '../../utils/types.js';

export interface EnhancedSwarmState extends SwarmState {
  complexity: ComplexityLevel;
  teamComposition: SwarmTeamComposition;
  resourceUsage: {
    totalCpu: number;
    totalMemory: number;
    networkBandwidth: number;
  };
  coordination: SwarmState['coordination'] & {
    crossLayerMessages: number;
    dependencyChainLength: number;
    bottleneckAgents: string[];
  };
}

export interface MessageRoutingStrategy {
  type: 'direct' | 'broadcast' | 'hierarchical' | 'dependency-chain' | 'load-balanced';
  criteria: Record<string, any>;
  priority: number;
}

export interface AgentPool {
  warmAgents: Map<FullStackAgentType, FullStackAgent[]>;
  coldAgents: Map<FullStackAgentType, number>;
  maxPoolSize: number;
  recycleThreshold: number;
}

export class EnhancedSwarmMessageRouter extends SwarmMessageRouter {
  private enhancedSwarms = new Map<string, EnhancedSwarmState>();
  private agentPool: AgentPool;
  private routingStrategies = new Map<string, MessageRoutingStrategy>();
  private resourceAllocator: ResourceAllocator;
  private backwardCompatibilityManager: BackwardCompatibilityManager;

  constructor(logger: ILogger, config: {
    maxAgentsPerSwarm?: number;
    enableLegacyMode?: boolean;
    resourceLimits?: {
      maxCpuPerAgent: number;
      maxMemoryPerAgent: number;
      maxNetworkPerSwarm: number;
    };
  } = {}) {
    super(logger);

    this.resourceAllocator = new ResourceAllocator(config.resourceLimits);
    this.backwardCompatibilityManager = new BackwardCompatibilityManager();

    this.agentPool = {
      warmAgents: new Map(),
      coldAgents: new Map(),
      maxPoolSize: config.maxAgentsPerSwarm || 20,
      recycleThreshold: 0.8
    };

    this.initializeRoutingStrategies();
    this.initializeAgentPool();
  }

  /**
   * Enhanced message handling with backward compatibility
   */
  public handleAgentMessage(message: AgentMessage | FullStackAgentMessage): void {
    try {
      // Detect if this is a legacy 3-agent swarm
      const isLegacy = this.backwardCompatibilityManager.isLegacyMessage(message);

      if (isLegacy) {
        // Use original SwarmMessageRouter logic for legacy swarms
        super.handleAgentMessage(message as AgentMessage);
        return;
      }

      // Enhanced handling for full-stack swarms
      const enhancedMessage = message as FullStackAgentMessage;
      const swarmState = this.getOrCreateEnhancedSwarmState(enhancedMessage.swarmId);

      // Validate agent limits
      if (!this.validateAgentLimits(swarmState, enhancedMessage)) {
        console.warn('Agent limit validation failed', {
          swarmId: enhancedMessage.swarmId,
          currentAgents: swarmState.agents.length,
          maxAgents: this.agentPool.maxPoolSize
        });
        return;
      }

      // Add or update agent in enhanced swarm
      this.updateEnhancedSwarmAgent(swarmState, enhancedMessage);

      // Store enhanced message
      this.storeEnhancedMessage(enhancedMessage);

      // Route message based on strategy
      this.routeEnhancedMessage(enhancedMessage, swarmState);

      // Update resource usage
      this.resourceAllocator.updateResourceUsage(swarmState);

      // Emit enhanced events
      this.emit('enhanced-message', enhancedMessage);
      this.emit('swarm-state-updated', swarmState);

      console.log('Enhanced agent message processed', {
        messageId: enhancedMessage.id,
        swarmId: enhancedMessage.swarmId,
        agentId: enhancedMessage.agentId,
        agentType: enhancedMessage.agentType,
        layer: enhancedMessage.layer
      });

    } catch (error) {
      console.error('Error handling enhanced agent message', {
        error,
        messageId: message.id,
        swarmId: message.swarmId
      });
      throw error;
    }
  }

  /**
   * Intelligent message routing based on agent types and dependencies
   */
  private routeEnhancedMessage(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): void {
    const strategy = this.selectRoutingStrategy(message, swarmState);

    switch (strategy.type) {
      case 'direct':
        this.routeDirect(message, swarmState);
        break;
      case 'broadcast':
        this.routeBroadcast(message, swarmState, strategy.criteria);
        break;
      case 'hierarchical':
        this.routeHierarchical(message, swarmState);
        break;
      case 'dependency-chain':
        this.routeDependencyChain(message, swarmState);
        break;
      case 'load-balanced':
        this.routeLoadBalanced(message, swarmState);
        break;
    }
  }

  /**
   * Select optimal routing strategy based on message and swarm context
   */
  private selectRoutingStrategy(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): MessageRoutingStrategy {
    // High priority messages use direct routing
    if (message.priority === 'critical' || message.priority === 'urgent') {
      return { type: 'direct', criteria: {}, priority: 10 };
    }

    // Coordination messages use hierarchical routing
    if (message.messageType === 'coordination') {
      return { type: 'hierarchical', criteria: { layer: message.layer }, priority: 8 };
    }

    // Messages with dependencies use dependency-chain routing
    if (message.dependencies && message.dependencies.length > 0) {
      return { type: 'dependency-chain', criteria: { dependencies: message.dependencies }, priority: 7 };
    }

    // Large swarms use load-balanced routing for performance
    if (swarmState.agents.length > 10) {
      return { type: 'load-balanced', criteria: { targetLoad: 0.8 }, priority: 6 };
    }

    // Default to broadcast for smaller swarms
    return { type: 'broadcast', criteria: { layer: message.layer }, priority: 5 };
  }

  /**
   * Direct message routing to specific agents
   */
  private routeDirect(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): void {
    if (message.targetAgents) {
      message.targetAgents.forEach(agentId => {
        this.emit('direct-message', { ...message, targetAgent: agentId });
      });
    }
  }

  /**
   * Broadcast to agents in specific layer or category
   */
  private routeBroadcast(message: FullStackAgentMessage, swarmState: EnhancedSwarmState, criteria: any): void {
    const targetAgents = swarmState.teamComposition.agents.filter(agent => {
      if (criteria.layer && message.layer) {
        return this.getAgentLayer(agent.type) === message.layer;
      }
      return true;
    });

    targetAgents.forEach(agent => {
      this.emit('broadcast-message', { ...message, targetAgent: agent.id });
    });
  }

  /**
   * Hierarchical routing through coordinators
   */
  private routeHierarchical(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): void {
    const coordinators = swarmState.teamComposition.agents.filter(agent =>
      agent.type === 'project-coordinator' || agent.type === 'integration-specialist'
    );

    if (coordinators.length > 0) {
      coordinators.forEach(coordinator => {
        this.emit('hierarchical-message', { ...message, coordinator: coordinator.id });
      });
    } else {
      // Fallback to broadcast if no coordinators
      this.routeBroadcast(message, swarmState, {});
    }
  }

  /**
   * Route based on dependency chain
   */
  private routeDependencyChain(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): void {
    if (!message.dependencies) return;

    const dependentAgents = swarmState.teamComposition.agents.filter(agent =>
      message.dependencies!.some(dep => agent.capabilities.includes(dep))
    );

    // Route in dependency order
    dependentAgents
      .sort((a, b) => this.calculateDependencyPriority(a, message.dependencies!) -
                     this.calculateDependencyPriority(b, message.dependencies!))
      .forEach((agent, index) => {
        setTimeout(() => {
          this.emit('dependency-message', { ...message, targetAgent: agent.id, order: index });
        }, index * 100); // Stagger by 100ms
      });
  }

  /**
   * Load-balanced routing for performance
   */
  private routeLoadBalanced(message: FullStackAgentMessage, swarmState: EnhancedSwarmState): void {
    const availableAgents = swarmState.teamComposition.agents
      .filter(agent => agent.resources.cpuUsage < 0.8) // Not overloaded
      .sort((a, b) => a.resources.cpuUsage - b.resources.cpuUsage); // Least loaded first

    if (availableAgents.length > 0) {
      const selectedAgent = availableAgents[0];
      this.emit('load-balanced-message', { ...message, targetAgent: selectedAgent.id });
    } else {
      // All agents overloaded, use broadcast
      this.routeBroadcast(message, swarmState, {});
    }
  }

  /**
   * Create or get enhanced swarm state
   */
  private getOrCreateEnhancedSwarmState(swarmId: string): EnhancedSwarmState {
    if (!this.enhancedSwarms.has(swarmId)) {
      // Check if this is an upgrade from legacy swarm
      const legacyState = this.getSwarmState(swarmId);

      if (legacyState) {
        // Upgrade legacy swarm to enhanced
        const enhancedState = this.upgradeLegacySwarm(legacyState);
        this.enhancedSwarms.set(swarmId, enhancedState);
        return enhancedState;
      }

      // Create new enhanced swarm
      const enhancedState: EnhancedSwarmState = {
        swarmId,
        agents: [],
        messageCount: 0,
        coordination: {
          activeThreads: 0,
          pendingHandoffs: 0,
          blockedTasks: 0,
          crossLayerMessages: 0,
          dependencyChainLength: 0,
          bottleneckAgents: []
        },
        lastActivity: new Date().toISOString(),
        complexity: 'simple',
        teamComposition: {
          swarmId,
          feature: 'unknown',
          complexity: 'simple',
          agents: [],
          estimatedDuration: 0,
          requiredSkills: [],
          resourceLimits: {
            maxAgents: this.agentPool.maxPoolSize,
            maxCpuPerAgent: 1.0,
            maxMemoryPerAgent: 1024,
            timeoutMinutes: 60
          }
        },
        resourceUsage: {
          totalCpu: 0,
          totalMemory: 0,
          networkBandwidth: 0
        }
      };

      this.enhancedSwarms.set(swarmId, enhancedState);
      return enhancedState;
    }

    return this.enhancedSwarms.get(swarmId)!;
  }

  /**
   * Update enhanced swarm agent information
   */
  private updateEnhancedSwarmAgent(swarmState: EnhancedSwarmState, message: FullStackAgentMessage): void {
    let agent = swarmState.teamComposition.agents.find(a => a.id === message.agentId);

    if (!agent) {
      // Add new agent to swarm
      agent = {
        id: message.agentId,
        type: message.agentType,
        capabilities: this.getAgentCapabilities(message.agentType),
        status: 'active',
        performance: {
          tasksCompleted: 0,
          successRate: 1.0,
          averageTime: 0,
          qualityScore: 1.0
        },
        resources: {
          cpuUsage: 0.1,
          memoryUsage: 128,
          activeTasks: 0
        }
      };

      swarmState.teamComposition.agents.push(agent);

      // Also update legacy agents array for compatibility
      swarmState.agents.push({
        id: agent.id,
        type: this.mapToLegacyType(agent.type),
        status: agent.status as any,
        currentTask: message.content
      });
    }

    // Update agent status based on message type
    this.updateAgentStatusFromMessage(agent, message);
  }

  /**
   * Map full-stack agent types to legacy types for backward compatibility
   */
  private mapToLegacyType(agentType: FullStackAgentType): 'researcher' | 'coder' | 'reviewer' {
    if (agentType === 'researcher' || agentType.includes('research')) return 'researcher';
    if (agentType === 'reviewer' || agentType.includes('review') || agentType.includes('qa')) return 'reviewer';
    return 'coder'; // Default mapping
  }

  /**
   * Get agent capabilities based on type
   */
  private getAgentCapabilities(agentType: FullStackAgentType): string[] {
    const capabilityMap: Record<string, string[]> = {
      'frontend-developer': ['react', 'typescript', 'css', 'html', 'testing'],
      'backend-developer': ['nodejs', 'database', 'api', 'security', 'performance'],
      'qa-engineer': ['testing', 'automation', 'quality-assurance', 'debugging'],
      'devops-engineer': ['deployment', 'ci-cd', 'monitoring', 'infrastructure'],
      'ui-designer': ['design', 'user-experience', 'accessibility', 'visual-design'],
      'database-developer': ['sql', 'database-design', 'optimization', 'migration'],
      'security-tester': ['security', 'penetration-testing', 'vulnerability-assessment'],
      'performance-tester': ['performance', 'load-testing', 'optimization', 'monitoring']
    };

    return capabilityMap[agentType] || ['general'];
  }

  /**
   * Get agent layer (frontend, backend, etc.)
   */
  private getAgentLayer(agentType: FullStackAgentType): string {
    const layerMap: Record<string, string> = {
      'frontend-developer': 'frontend',
      'ui-designer': 'frontend',
      'accessibility-specialist': 'frontend',
      'backend-developer': 'backend',
      'api-developer': 'backend',
      'microservices-architect': 'backend',
      'database-developer': 'database',
      'data-architect': 'database',
      'qa-engineer': 'testing',
      'e2e-tester': 'testing',
      'performance-tester': 'testing',
      'devops-engineer': 'infrastructure',
      'deployment-specialist': 'infrastructure'
    };

    return layerMap[agentType] || 'general';
  }

  /**
   * Validate agent limits for the swarm
   */
  private validateAgentLimits(swarmState: EnhancedSwarmState, message: FullStackAgentMessage): boolean {
    const currentAgentCount = swarmState.teamComposition.agents.length;
    const maxAgents = swarmState.teamComposition.resourceLimits.maxAgents;

    // Allow existing agents to send messages
    const existingAgent = swarmState.teamComposition.agents.find(a => a.id === message.agentId);
    if (existingAgent) {
      return true;
    }

    // Check if we can add a new agent
    return currentAgentCount < maxAgents;
  }

  /**
   * Store enhanced message with additional indexing
   */
  private storeEnhancedMessage(message: FullStackAgentMessage): void {
    // Store in base class for compatibility
    super.handleAgentMessage(message as AgentMessage);

    // Additional enhanced indexing could go here
    // (layer-based indexing, complexity-based indexing, etc.)
  }

  /**
   * Initialize routing strategies
   */
  private initializeRoutingStrategies(): void {
    this.routingStrategies.set('critical', { type: 'direct', criteria: {}, priority: 10 });
    this.routingStrategies.set('coordination', { type: 'hierarchical', criteria: {}, priority: 8 });
    this.routingStrategies.set('dependency', { type: 'dependency-chain', criteria: {}, priority: 7 });
    this.routingStrategies.set('performance', { type: 'load-balanced', criteria: {}, priority: 6 });
    this.routingStrategies.set('default', { type: 'broadcast', criteria: {}, priority: 5 });
  }

  /**
   * Initialize agent pool with warm agents
   */
  private initializeAgentPool(): void {
    const commonTypes: FullStackAgentType[] = [
      'frontend-developer',
      'backend-developer',
      'qa-engineer',
      'devops-engineer'
    ];

    commonTypes.forEach(type => {
      this.agentPool.warmAgents.set(type, []);
      this.agentPool.coldAgents.set(type, 2); // 2 cold agents per type
    });
  }

  /**
   * Calculate dependency priority for routing
   */
  private calculateDependencyPriority(agent: FullStackAgent, dependencies: string[]): number {
    return dependencies.filter(dep => agent.capabilities.includes(dep)).length;
  }

  /**
   * Update agent status based on message
   */
  private updateAgentStatusFromMessage(agent: FullStackAgent, message: FullStackAgentMessage): void {
    switch (message.messageType) {
      case 'task-start':
        agent.status = 'working';
        agent.resources.activeTasks++;
        break;
      case 'completion':
        agent.status = 'active';
        agent.resources.activeTasks = Math.max(0, agent.resources.activeTasks - 1);
        agent.performance.tasksCompleted++;
        break;
      case 'error':
        agent.status = 'blocked';
        break;
      default:
        if (agent.status === 'idle') {
          agent.status = 'active';
        }
    }
  }

  /**
   * Upgrade legacy swarm to enhanced swarm
   */
  private upgradeLegacySwarm(legacyState: SwarmState): EnhancedSwarmState {
    return {
      ...legacyState,
      complexity: 'simple',
      teamComposition: {
        swarmId: legacyState.swarmId,
        feature: 'legacy-upgrade',
        complexity: 'simple',
        agents: legacyState.agents.map(a => ({
          id: a.id,
          type: a.type as FullStackAgentType,
          capabilities: this.getAgentCapabilities(a.type as FullStackAgentType),
          currentTask: a.currentTask,
          status: a.status as any,
          performance: {
            tasksCompleted: 0,
            successRate: 1.0,
            averageTime: 0,
            qualityScore: 1.0
          },
          resources: {
            cpuUsage: 0.1,
            memoryUsage: 128,
            activeTasks: 0
          }
        })),
        estimatedDuration: 60,
        requiredSkills: [],
        resourceLimits: {
          maxAgents: 3, // Keep legacy limit
          maxCpuPerAgent: 1.0,
          maxMemoryPerAgent: 512,
          timeoutMinutes: 30
        }
      },
      resourceUsage: {
        totalCpu: 0.3,
        totalMemory: 384,
        networkBandwidth: 0
      },
      coordination: {
        ...legacyState.coordination,
        crossLayerMessages: 0,
        dependencyChainLength: 0,
        bottleneckAgents: []
      }
    };
  }

  /**
   * Get enhanced swarm state (public method)
   */
  public getEnhancedSwarmState(swarmId: string): EnhancedSwarmState | null {
    return this.enhancedSwarms.get(swarmId) || null;
  }

  /**
   * Get all enhanced swarms
   */
  public getEnhancedSwarms(): EnhancedSwarmState[] {
    return Array.from(this.enhancedSwarms.values());
  }
}

/**
 * Resource Allocator for managing agent resources
 */
class ResourceAllocator {
  constructor(private limits: any = {}) {}

  updateResourceUsage(swarmState: EnhancedSwarmState): void {
    const totalCpu = swarmState.teamComposition.agents.reduce((sum, agent) => sum + agent.resources.cpuUsage, 0);
    const totalMemory = swarmState.teamComposition.agents.reduce((sum, agent) => sum + agent.resources.memoryUsage, 0);

    swarmState.resourceUsage = {
      totalCpu,
      totalMemory,
      networkBandwidth: this.estimateNetworkBandwidth(swarmState)
    };
  }

  private estimateNetworkBandwidth(swarmState: EnhancedSwarmState): number {
    // Estimate based on agent count and activity
    return swarmState.teamComposition.agents.length * 10; // 10 KB/s per agent
  }
}

/**
 * Backward Compatibility Manager
 */
class BackwardCompatibilityManager {
  isLegacyMessage(message: AgentMessage | FullStackAgentMessage): boolean {
    // Check if message uses legacy agent types
    const legacyTypes = ['researcher', 'coder', 'reviewer'];
    return legacyTypes.includes(message.agentType as string);
  }

  isLegacySwarm(swarmState: SwarmState): boolean {
    return swarmState.agents.length <= 3 &&
           swarmState.agents.every(a => ['researcher', 'coder', 'reviewer'].includes(a.type));
  }
}