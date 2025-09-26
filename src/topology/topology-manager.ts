/**
 * Topology Manager - Centralized Topology Configuration and Management
 * 
 * Provides centralized management of multiple topology coordinators with
 * cross-topology communication, dynamic optimization, and adaptive reconfiguration.
 * Builds upon lifecycle management and dependency tracking systems.
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import {
  lifecycleManager,
  registerAgentDependency,
  removeAgentDependency,
  getAgentDependencyStatus,
  type AgentLifecycleContext
} from '../agents/lifecycle-manager.js';
import {
  DependencyType,
  getDependencyTracker,
  type DependencyTracker
} from '../lifecycle/dependency-tracker.js';
import {
  TopologyType,
  TopologyConfiguration,
  TopologyMetrics,
  TopologyBridge,
  AdaptationDecision,
  TopologyOptimizationResult,
  CoordinationMessage,
  ITopologyCoordinator,
  ITopologyManager,
  ICommunicationBridge,
  TopologyEvent,
  OptimizationRule,
  PerformanceMetric
} from './types.js';

// ============================================================================
// Topology Manager Configuration
// ============================================================================

export interface TopologyManagerConfig {
  maxTopologies: number;
  maxBridges: number;
  enableCrossTopologyRouting: boolean;
  enableAdaptiveOptimization: boolean;
  optimizationInterval: number;
  metricsCollectionInterval: number;
  performanceThresholds: {
    latencyWarning: number;
    latencyCritical: number;
    throughputWarning: number;
    errorRateWarning: number;
    errorRateCritical: number;
  };
  defaultTimeouts: {
    coordination: number;
    completion: number;
    adaptation: number;
  };
  memoryNamespace: string;
  enablePersistence: boolean;
}

// ============================================================================
// Topology Manager Implementation
// ============================================================================

export class TopologyManager extends EventEmitter implements ITopologyManager {
  private managerId: string;
  private logger: Logger;
  private config: TopologyManagerConfig;
  private topologies: Map<string, ITopologyCoordinator>;
  private bridges: Map<string, TopologyBridge>;
  private dependencyTracker: DependencyTracker;
  private lifecycleContext?: AgentLifecycleContext;
  private isRunning: boolean = false;
  private optimizationTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private communicationBridge?: ICommunicationBridge;
  private optimizationRules: OptimizationRule[];
  private globalMetrics: Map<string, PerformanceMetric>;

  constructor(config: Partial<TopologyManagerConfig> = {}) {
    super();

    this.managerId = generateId('topo-mgr');
    this.logger = new Logger(`TopologyManager[${this.managerId}]`);

    this.config = {
      maxTopologies: 10,
      maxBridges: 20,
      enableCrossTopologyRouting: true,
      enableAdaptiveOptimization: true,
      optimizationInterval: 60000, // 1 minute
      metricsCollectionInterval: 15000, // 15 seconds
      performanceThresholds: {
        latencyWarning: 1000, // 1s
        latencyCritical: 5000, // 5s
        throughputWarning: 10, // 10 ops/s
        errorRateWarning: 0.05, // 5%
        errorRateCritical: 0.15 // 15%
      },
      defaultTimeouts: {
        coordination: 30000, // 30s
        completion: 300000, // 5m
        adaptation: 120000 // 2m
      },
      memoryNamespace: 'topology-manager',
      enablePersistence: true,
      ...config
    };

    this.topologies = new Map();
    this.bridges = new Map();
    this.dependencyTracker = getDependencyTracker(this.config.memoryNamespace);
    this.optimizationRules = [];
    this.globalMetrics = new Map();

    this.setupEventHandlers();
    this.initializeOptimizationRules();
  }

  // ============================================================================
  // Initialization and Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Topology manager already running');
      return;
    }

    this.logger.info('Initializing topology manager...');

    // Initialize dependency tracker
    await this.dependencyTracker.initialize();

    // Register with lifecycle management
    this.lifecycleContext = await lifecycleManager.initializeAgent(
      this.managerId,
      {
        name: 'topology-manager',
        type: 'manager',
        capabilities: [
          'topology-management',
          'cross-topology-routing',
          'adaptive-optimization',
          'performance-monitoring'
        ],
        lifecycle: {
          state_management: true,
          persistent_memory: true,
          max_retries: 3
        },
        hooks: {
          init: 'echo "Topology manager initialized"',
          task_complete: 'echo "Topology management task completed"',
          cleanup: 'echo "Topology manager cleanup"'
        }
      },
      generateId('topo-mgr-task')
    );

    await lifecycleManager.transitionState(
      this.managerId,
      'running',
      'Topology manager started'
    );

    // Initialize communication bridge if cross-topology routing is enabled
    if (this.config.enableCrossTopologyRouting) {
      const { CommunicationBridge } = await import('./communication-bridge.js');
      this.communicationBridge = new CommunicationBridge({
        managerId: this.managerId,
        enableCompression: true,
        enableEncryption: false,
        maxQueueSize: 1000,
        retryAttempts: 3
      });
      await this.communicationBridge.initialize();
    }

    this.isRunning = true;
    this.startBackgroundTasks();

    this.logger.info('Topology manager initialized successfully');
    this.emit('manager:initialized', { managerId: this.managerId });
  }

  async shutdown(force: boolean = false): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down topology manager...');
    this.isRunning = false;

    // Stop background tasks
    this.stopBackgroundTasks();

    // Shutdown all topologies
    for (const [topologyId, topology] of this.topologies) {
      try {
        await topology.shutdown(force);
        this.logger.debug(`Shutdown topology: ${topologyId}`);
      } catch (error) {
        this.logger.warn(`Error shutting down topology ${topologyId}: ${error}`);
      }
    }

    // Close all bridges
    for (const bridgeId of this.bridges.keys()) {
      await this.removeBridge(bridgeId);
    }

    // Shutdown communication bridge
    if (this.communicationBridge) {
      await this.communicationBridge.shutdown();
    }

    // Transition to stopped state
    await lifecycleManager.transitionState(
      this.managerId,
      'stopped',
      'Topology manager shutdown'
    );

    // Shutdown dependency tracker
    await this.dependencyTracker.shutdown();

    this.logger.info('Topology manager shutdown complete');
    this.emit('manager:shutdown', { managerId: this.managerId });
  }

  // ============================================================================
  // Topology Lifecycle Management
  // ============================================================================

  async createTopology(config: TopologyConfiguration): Promise<ITopologyCoordinator> {
    if (this.topologies.size >= this.config.maxTopologies) {
      throw new Error('Maximum topology limit reached');
    }

    const topologyId = generateId(`${config.type}-topo`);
    this.logger.info(`Creating ${config.type} topology: ${topologyId}`);

    let coordinator: ITopologyCoordinator;

    // Create coordinator based on topology type
    switch (config.type) {
      case 'mesh': {
        const { EnhancedMeshCoordinator } = await import('./enhanced-mesh-coordinator.js');
        coordinator = new EnhancedMeshCoordinator({
          ...config,
          managerId: this.managerId,
          communicationBridge: this.communicationBridge
        });
        break;
      }
      case 'hierarchical': {
        const { EnhancedHierarchicalCoordinator } = await import('./enhanced-hierarchical-coordinator.js');
        coordinator = new EnhancedHierarchicalCoordinator({
          ...config,
          managerId: this.managerId,
          communicationBridge: this.communicationBridge
        });
        break;
      }
      case 'hybrid': {
        const { AdaptiveCoordinator } = await import('./adaptive-coordinator.js');
        coordinator = new AdaptiveCoordinator({
          ...config,
          managerId: this.managerId,
          communicationBridge: this.communicationBridge
        });
        break;
      }
      default:
        throw new Error(`Unsupported topology type: ${config.type}`);
    }

    // Initialize coordinator
    await coordinator.initialize();

    // Register topology
    this.topologies.set(topologyId, coordinator);

    // Setup event forwarding
    this.setupTopologyEventForwarding(topologyId, coordinator);

    // Register dependency relationship
    await registerAgentDependency(
      this.managerId, // Manager depends on topology
      topologyId,     // Topology provides coordination
      DependencyType.COORDINATION,
      {
        timeout: this.config.defaultTimeouts.coordination,
        metadata: {
          topologyType: config.type,
          relationship: 'management'
        }
      }
    );

    this.logger.info(`Created topology ${topologyId} of type ${config.type}`);
    this.emit('topology:created', {
      type: 'topology:created',
      timestamp: new Date(),
      topologyId,
      data: { config }
    } as TopologyEvent);

    return coordinator;
  }

  async destroyTopology(topologyId: string): Promise<void> {
    const topology = this.topologies.get(topologyId);
    if (!topology) {
      throw new Error(`Topology ${topologyId} not found`);
    }

    this.logger.info(`Destroying topology: ${topologyId}`);

    // Remove all bridges connected to this topology
    const bridgesToRemove = Array.from(this.bridges.values())
      .filter(bridge => 
        bridge.sourceTopology === topologyId || 
        bridge.targetTopology === topologyId
      )
      .map(bridge => bridge.id);

    for (const bridgeId of bridgesToRemove) {
      await this.removeBridge(bridgeId);
    }

    // Remove dependency relationship
    const depStatus = getAgentDependencyStatus(this.managerId);
    for (const depId of depStatus.dependencies) {
      const dep = this.dependencyTracker.getDependencyDetails(depId);
      if (dep?.providerAgentId === topologyId) {
        await removeAgentDependency(depId);
      }
    }

    // Shutdown topology
    await topology.shutdown(true);

    // Remove from registry
    this.topologies.delete(topologyId);

    this.logger.info(`Destroyed topology: ${topologyId}`);
    this.emit('topology:destroyed', {
      type: 'topology:destroyed',
      timestamp: new Date(),
      topologyId,
      data: {}
    } as TopologyEvent);
  }

  getTopology(topologyId: string): ITopologyCoordinator | undefined {
    return this.topologies.get(topologyId);
  }

  getAllTopologies(): ITopologyCoordinator[] {
    return Array.from(this.topologies.values());
  }

  // ============================================================================
  // Cross-Topology Bridge Management
  // ============================================================================

  async createBridge(
    sourceId: string,
    targetId: string,
    bridgeType: string = 'protocol_adapter'
  ): Promise<TopologyBridge> {
    if (this.bridges.size >= this.config.maxBridges) {
      throw new Error('Maximum bridge limit reached');
    }

    const sourceTopology = this.topologies.get(sourceId);
    const targetTopology = this.topologies.get(targetId);

    if (!sourceTopology || !targetTopology) {
      throw new Error('Source or target topology not found');
    }

    const bridgeId = generateId('bridge');
    const bridge: TopologyBridge = {
      id: bridgeId,
      sourceTopology: sourceId,
      targetTopology: targetId,
      type: bridgeType as any,
      status: 'active',
      configuration: {
        enableCompression: true,
        enableEncryption: false,
        maxQueueSize: 100,
        timeoutMs: 5000
      },
      metrics: {
        messagesRouted: 0,
        averageLatency: 0,
        errorRate: 0,
        throughput: 0
      }
    };

    this.bridges.set(bridgeId, bridge);

    // Register bridge with communication bridge if available
    if (this.communicationBridge) {
      await this.communicationBridge.establishBridge(sourceId, targetId);
    }

    this.logger.info(`Created bridge ${bridgeId}: ${sourceId} -> ${targetId}`);
    this.emit('bridge:created', {
      type: 'bridge:created',
      timestamp: new Date(),
      topologyId: bridgeId,
      data: { bridge }
    } as TopologyEvent);

    return bridge;
  }

  async removeBridge(bridgeId: string): Promise<void> {
    const bridge = this.bridges.get(bridgeId);
    if (!bridge) {
      throw new Error(`Bridge ${bridgeId} not found`);
    }

    // Close bridge in communication bridge
    if (this.communicationBridge) {
      await this.communicationBridge.closeBridge(bridgeId);
    }

    this.bridges.delete(bridgeId);

    this.logger.info(`Removed bridge: ${bridgeId}`);
    this.emit('bridge:removed', {
      type: 'bridge:removed',
      timestamp: new Date(),
      topologyId: bridgeId,
      data: { bridge }
    } as TopologyEvent);
  }

  async routeMessage(message: CoordinationMessage, route: string[]): Promise<void> {
    if (!this.communicationBridge) {
      throw new Error('Cross-topology routing not enabled');
    }

    // Validate route
    for (const topologyId of route) {
      if (!this.topologies.has(topologyId)) {
        throw new Error(`Topology ${topologyId} in route not found`);
      }
    }

    await this.communicationBridge.routeMessage({
      ...message,
      route
    });

    this.logger.debug(`Routed message ${message.id} through ${route.join(' -> ')}`);
  }

  // ============================================================================
  // Optimization and Adaptation
  // ============================================================================

  async optimizeTopology(topologyId: string): Promise<TopologyOptimizationResult> {
    const topology = this.topologies.get(topologyId);
    if (!topology) {
      throw new Error(`Topology ${topologyId} not found`);
    }

    this.logger.info(`Optimizing topology: ${topologyId}`);

    const currentMetrics = topology.getMetrics();
    const currentConfig = topology.config;

    // Generate optimization recommendations
    const recommendations = await this.generateOptimizationRecommendations(
      currentConfig,
      currentMetrics
    );

    // Apply best recommendation if confidence is high enough
    const bestRecommendation = recommendations
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (bestRecommendation && bestRecommendation.confidence > 0.7) {
      const optimizedConfig = {
        ...currentConfig,
        ...this.applyOptimizationRecommendation(currentConfig, bestRecommendation)
      };

      const result: TopologyOptimizationResult = {
        originalTopology: currentConfig,
        optimizedTopology: optimizedConfig,
        improvements: {
          performance: bestRecommendation.expectedImprovements.latency,
          efficiency: bestRecommendation.expectedImprovements.throughput,
          reliability: bestRecommendation.expectedImprovements.reliability,
          cost: bestRecommendation.expectedImprovements.cost
        },
        changes: [{
          component: 'topology_configuration',
          before: currentConfig,
          after: optimizedConfig,
          impact: bestRecommendation.reasoning.join('; ')
        }],
        validationResults: {
          passed: true,
          warnings: [],
          errors: []
        }
      };

      this.emit('topology:optimized', {
        type: 'topology:optimized',
        timestamp: new Date(),
        topologyId,
        data: { result }
      } as TopologyEvent);

      return result;
    }

    // No optimization applied
    return {
      originalTopology: currentConfig,
      optimizedTopology: currentConfig,
      improvements: { performance: 0, efficiency: 0, reliability: 0, cost: 0 },
      changes: [],
      validationResults: {
        passed: true,
        warnings: ['No optimization opportunities found'],
        errors: []
      }
    };
  }

  async adaptTopology(
    topologyId: string,
    newConfig: Partial<TopologyConfiguration>
  ): Promise<void> {
    const topology = this.topologies.get(topologyId);
    if (!topology) {
      throw new Error(`Topology ${topologyId} not found`);
    }

    this.logger.info(`Adapting topology ${topologyId} with new configuration`);

    // Apply configuration changes
    Object.assign(topology.config, newConfig);

    // If topology type changed, recreate with new type
    if (newConfig.type && newConfig.type !== topology.type) {
      const fullConfig = { ...topology.config, ...newConfig };
      await this.destroyTopology(topologyId);
      await this.createTopology(fullConfig);
    }

    this.emit('topology:adapted', {
      type: 'topology:adapted',
      timestamp: new Date(),
      topologyId,
      data: { newConfig }
    } as TopologyEvent);
  }

  async recommendTopology(
    requirements: Record<string, unknown>
  ): Promise<TopologyConfiguration> {
    const {
      expectedAgents = 10,
      latencyRequirement = 1000,
      throughputRequirement = 100,
      faultToleranceLevel = 'basic',
      consistencyLevel = 'eventual'
    } = requirements;

    // Simple heuristic-based recommendation
    let recommendedType: TopologyType = 'mesh';

    if (expectedAgents > 50) {
      recommendedType = 'hierarchical';
    } else if (latencyRequirement < 100 && throughputRequirement > 1000) {
      recommendedType = 'hybrid';
    } else if (faultToleranceLevel === 'byzantine') {
      recommendedType = 'mesh';
    }

    const config: TopologyConfiguration = {
      type: recommendedType,
      name: `recommended-${recommendedType}`,
      strategy: 'adaptive',
      faultTolerance: faultToleranceLevel as any,
      loadBalancing: 'adaptive',
      maxAgents: expectedAgents as number * 1.2, // 20% buffer
      maxConnections: Math.min(expectedAgents as number, 20),
      enableCrossTopology: true,
      enableAdaptiveOptimization: true,
      performanceThresholds: {
        latency: latencyRequirement as number,
        throughput: throughputRequirement as number,
        errorRate: 0.05
      },
      timeouts: this.config.defaultTimeouts,
      memoryNamespace: generateId('topo')
    };

    this.logger.info(`Recommended ${recommendedType} topology for requirements`);
    return config;
  }

  // ============================================================================
  // Monitoring and Metrics
  // ============================================================================

  getGlobalMetrics(): Record<string, TopologyMetrics> {
    const metrics: Record<string, TopologyMetrics> = {};
    
    for (const [topologyId, topology] of this.topologies) {
      metrics[topologyId] = topology.getMetrics();
    }

    return metrics;
  }

  getResourceUtilization(): Record<string, number> {
    const utilization: Record<string, number> = {
      topologyCount: this.topologies.size,
      bridgeCount: this.bridges.size,
      totalAgents: 0,
      averageLatency: 0,
      totalThroughput: 0,
      aggregateErrorRate: 0
    };

    let totalLatency = 0;
    let totalErrorRate = 0;

    for (const topology of this.topologies.values()) {
      const metrics = topology.getMetrics();
      utilization.totalAgents += metrics.agentCount;
      utilization.totalThroughput += metrics.throughput;
      totalLatency += metrics.averageLatency;
      totalErrorRate += metrics.errorRate;
    }

    if (this.topologies.size > 0) {
      utilization.averageLatency = totalLatency / this.topologies.size;
      utilization.aggregateErrorRate = totalErrorRate / this.topologies.size;
    }

    return utilization;
  }

  detectBottlenecks(): Array<{ component: string; severity: number; description: string }> {
    const bottlenecks: Array<{ component: string; severity: number; description: string }> = [];

    for (const [topologyId, topology] of this.topologies) {
      const metrics = topology.getMetrics();
      const thresholds = this.config.performanceThresholds;

      // Check latency
      if (metrics.averageLatency > thresholds.latencyCritical) {
        bottlenecks.push({
          component: `topology:${topologyId}:latency`,
          severity: 0.9,
          description: `Critical latency: ${metrics.averageLatency}ms > ${thresholds.latencyCritical}ms`
        });
      } else if (metrics.averageLatency > thresholds.latencyWarning) {
        bottlenecks.push({
          component: `topology:${topologyId}:latency`,
          severity: 0.6,
          description: `High latency: ${metrics.averageLatency}ms > ${thresholds.latencyWarning}ms`
        });
      }

      // Check error rate
      if (metrics.errorRate > thresholds.errorRateCritical) {
        bottlenecks.push({
          component: `topology:${topologyId}:errors`,
          severity: 0.95,
          description: `Critical error rate: ${(metrics.errorRate * 100).toFixed(1)}% > ${(thresholds.errorRateCritical * 100).toFixed(1)}%`
        });
      } else if (metrics.errorRate > thresholds.errorRateWarning) {
        bottlenecks.push({
          component: `topology:${topologyId}:errors`,
          severity: 0.7,
          description: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}% > ${(thresholds.errorRateWarning * 100).toFixed(1)}%`
        });
      }

      // Check throughput
      if (metrics.throughput < thresholds.throughputWarning) {
        bottlenecks.push({
          component: `topology:${topologyId}:throughput`,
          severity: 0.5,
          description: `Low throughput: ${metrics.throughput} ops/s < ${thresholds.throughputWarning} ops/s`
        });
      }
    }

    return bottlenecks.sort((a, b) => b.severity - a.severity);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private setupEventHandlers(): void {
    this.on('topology:created', this.handleTopologyCreated.bind(this));
    this.on('topology:destroyed', this.handleTopologyDestroyed.bind(this));
    this.on('bridge:created', this.handleBridgeCreated.bind(this));
    this.on('bridge:removed', this.handleBridgeRemoved.bind(this));
  }

  private setupTopologyEventForwarding(
    topologyId: string,
    topology: ITopologyCoordinator
  ): void {
    // Forward topology events to manager level
    topology.on('agent:registered', (event) => {
      this.emit('agent:registered', { ...event, topologyId });
    });

    topology.on('task:completed', (event) => {
      this.emit('task:completed', { ...event, topologyId });
    });

    topology.on('coordinator:completed', (event) => {
      this.emit('coordinator:completed', { ...event, topologyId });
    });
  }

  private initializeOptimizationRules(): void {
    this.optimizationRules = [
      {
        id: 'high-latency-rule',
        condition: (metrics) => metrics.averageLatency > this.config.performanceThresholds.latencyCritical,
        action: async (coordinator) => {
          // Suggest topology optimization
          this.logger.warn(`High latency detected in ${coordinator.id}, suggesting optimization`);
        },
        priority: 0.9,
        description: 'Triggers optimization when latency exceeds critical threshold'
      },
      {
        id: 'high-error-rate-rule',
        condition: (metrics) => metrics.errorRate > this.config.performanceThresholds.errorRateCritical,
        action: async (coordinator) => {
          // Suggest fault tolerance improvements
          this.logger.warn(`High error rate detected in ${coordinator.id}, reviewing fault tolerance`);
        },
        priority: 0.95,
        description: 'Triggers fault tolerance review when error rate is high'
      },
      {
        id: 'low-throughput-rule',
        condition: (metrics) => metrics.throughput < this.config.performanceThresholds.throughputWarning,
        action: async (coordinator) => {
          // Suggest load balancing improvements
          this.logger.info(`Low throughput detected in ${coordinator.id}, reviewing load balancing`);
        },
        priority: 0.6,
        description: 'Triggers load balancing review when throughput is low'
      }
    ];
  }

  private startBackgroundTasks(): void {
    // Periodic optimization
    if (this.config.enableAdaptiveOptimization) {
      this.optimizationTimer = setInterval(() => {
        this.runOptimizationCycle();
      }, this.config.optimizationInterval);
    }

    // Periodic metrics collection
    this.metricsTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsCollectionInterval);
  }

  private stopBackgroundTasks(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = undefined;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }
  }

  private async runOptimizationCycle(): Promise<void> {
    try {
      for (const [topologyId, topology] of this.topologies) {
        const metrics = topology.getMetrics();
        
        // Apply optimization rules
        for (const rule of this.optimizationRules) {
          if (rule.condition(metrics)) {
            await rule.action(topology);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error in optimization cycle: ${error}`);
    }
  }

  private collectMetrics(): void {
    try {
      const timestamp = new Date();
      
      // Collect global metrics
      const utilization = this.getResourceUtilization();
      
      for (const [key, value] of Object.entries(utilization)) {
        this.globalMetrics.set(key, {
          name: key,
          value,
          unit: this.getMetricUnit(key),
          timestamp
        });
      }

      // Detect and report bottlenecks
      const bottlenecks = this.detectBottlenecks();
      if (bottlenecks.length > 0) {
        this.emit('bottlenecks:detected', {
          type: 'bottlenecks:detected',
          timestamp,
          topologyId: this.managerId,
          data: { bottlenecks }
        } as TopologyEvent);
      }
    } catch (error) {
      this.logger.error(`Error collecting metrics: ${error}`);
    }
  }

  private getMetricUnit(metricName: string): string {
    const units: Record<string, string> = {
      topologyCount: 'count',
      bridgeCount: 'count',
      totalAgents: 'count',
      averageLatency: 'ms',
      totalThroughput: 'ops/s',
      aggregateErrorRate: 'percentage'
    };
    return units[metricName] || 'unknown';
  }

  private async generateOptimizationRecommendations(
    config: TopologyConfiguration,
    metrics: TopologyMetrics
  ): Promise<AdaptationDecision[]> {
    const recommendations: AdaptationDecision[] = [];

    // High latency recommendation
    if (metrics.averageLatency > config.performanceThresholds.latency * 2) {
      recommendations.push({
        id: generateId('recommendation'),
        timestamp: new Date(),
        currentTopology: config.type,
        recommendedTopology: 'mesh',
        confidence: 0.8,
        reasoning: [
          'High latency detected',
          'Mesh topology may provide better performance',
          'Direct agent connections reduce coordination overhead'
        ],
        expectedImprovements: {
          latency: -0.3, // 30% reduction
          throughput: 0.2, // 20% increase
          reliability: 0.1, // 10% increase
          cost: 0.05 // 5% increase
        },
        migrationPlan: {
          steps: [
            {
              description: 'Create mesh topology',
              estimatedDuration: 30000,
              riskLevel: 'low',
              rollbackPossible: true
            },
            {
              description: 'Migrate agents',
              estimatedDuration: 60000,
              riskLevel: 'medium',
              rollbackPossible: true
            },
            {
              description: 'Destroy old topology',
              estimatedDuration: 15000,
              riskLevel: 'low',
              rollbackPossible: false
            }
          ],
          totalDuration: 105000,
          resources: { cpu: 0.2, memory: 0.3, bandwidth: 0.1 }
        }
      });
    }

    return recommendations;
  }

  private applyOptimizationRecommendation(
    config: TopologyConfiguration,
    recommendation: AdaptationDecision
  ): Partial<TopologyConfiguration> {
    const changes: Partial<TopologyConfiguration> = {};

    if (recommendation.recommendedTopology !== config.type) {
      changes.type = recommendation.recommendedTopology;
    }

    // Apply threshold adjustments based on recommendations
    if (recommendation.expectedImprovements.latency < -0.2) {
      changes.performanceThresholds = {
        ...config.performanceThresholds,
        latency: config.performanceThresholds.latency * 0.8
      };
    }

    return changes;
  }

  private async handleTopologyCreated(event: TopologyEvent): Promise<void> {
    this.logger.debug(`Topology created: ${event.topologyId}`);
  }

  private async handleTopologyDestroyed(event: TopologyEvent): Promise<void> {
    this.logger.debug(`Topology destroyed: ${event.topologyId}`);
  }

  private async handleBridgeCreated(event: TopologyEvent): Promise<void> {
    this.logger.debug(`Bridge created: ${event.topologyId}`);
  }

  private async handleBridgeRemoved(event: TopologyEvent): Promise<void> {
    this.logger.debug(`Bridge removed: ${event.topologyId}`);
  }

  // ============================================================================
  // Public Status Methods
  // ============================================================================

  getManagerStatus(): {
    managerId: string;
    status: string;
    topologyCount: number;
    bridgeCount: number;
    isOptimizing: boolean;
    metrics: Record<string, PerformanceMetric>;
  } {
    return {
      managerId: this.managerId,
      status: this.lifecycleContext?.state || 'unknown',
      topologyCount: this.topologies.size,
      bridgeCount: this.bridges.size,
      isOptimizing: this.config.enableAdaptiveOptimization,
      metrics: Object.fromEntries(this.globalMetrics)
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createTopologyManager(
  config?: Partial<TopologyManagerConfig>
): TopologyManager {
  return new TopologyManager(config);
}

export function createTopologyManagerWithPersistence(
  namespace: string,
  config?: Partial<TopologyManagerConfig>
): TopologyManager {
  const enhancedConfig = {
    ...config,
    memoryNamespace: namespace,
    enablePersistence: true
  };

  return new TopologyManager(enhancedConfig);
}

// Export types for external use
export type { TopologyManagerConfig };
