/**
 * Communication Bridge - Integration Layer
 *
 * Connects the ultra-fast communication system with the fullstack swarm orchestrator
 * to enable real-time agent coordination during fullstack development workflows.
 *
 * Key Features:
 * - Ultra-fast inter-agent communication (<1ms latency)
 * - Real-time progress broadcasting between agents
 * - Memory coordination across frontend/backend teams
 * - Event-driven architecture for scalability
 * - Backward compatibility with existing systems
 *
 * Architecture:
 * - Bridges CommunicationMemoryStore with FullStackOrchestrator
 * - Integrates UltraFastCommunicationBus with EnhancedSwarmMessageRouter
 * - Provides unified event broadcasting across all agents
 * - Manages memory sharing for iterative building workflows
 */

import { EventEmitter } from 'events';
import { FullStackOrchestrator, SwarmExecutionStatus, FeatureRequest } from '../core/fullstack-orchestrator.js';
import { EnhancedSwarmMessageRouter, EnhancedSwarmState } from '../core/enhanced-swarm-message-router.js';
import { FullStackAgentMessage, SwarmTeamComposition } from '../types/index.js';
import { ILogger } from '../../core/logger.js';

// Import communication components with runtime checks
let UltraFastCommunicationBus: any = null;
let CommunicationMemoryStore: any = null;

// Lazy load communication components to avoid top-level await
async function loadCommunicationComponents() {
  if (UltraFastCommunicationBus !== null) return; // Already loaded

  try {
    const commModule = await import('../../communication/ultra-fast-communication-bus.js');
    UltraFastCommunicationBus = commModule.UltraFastCommunicationBus || commModule.default;
  } catch {
    console.warn('⚠️  Ultra-fast communication bus not available - using fallback');
  }

  try {
    const memModule = await import('../../hooks/communication-integrated-post-edit.js');
    CommunicationMemoryStore = memModule.CommunicationMemoryStore;
  } catch {
    console.warn('⚠️  Communication memory store not available - using fallback');
  }
}

/**
 * Configuration for the Communication Bridge
 */
export interface CommunicationBridgeConfig {
  // Communication settings
  enableUltraFastComm: boolean;
  enableMemorySharing: boolean;
  enableRealTimeProgress: boolean;

  // Performance settings
  messageBufferSize: number;
  maxSubscriptionsPerAgent: number;
  broadcastBatchSize: number;

  // Coordination settings
  enableCrossLayerCoordination: boolean;
  enableDependencyTracking: boolean;
  enableIterativeBuilding: boolean;

  // Memory settings
  memoryNamespace: string;
  persistMemory: boolean;
  memoryTTL: number;

  // Monitoring
  enableMetrics: boolean;
  metricsInterval: number;
}

/**
 * Agent coordination event types
 */
export type CoordinationEventType =
  | 'agent:spawned'
  | 'agent:ready'
  | 'agent:working'
  | 'agent:blocked'
  | 'agent:completed'
  | 'agent:failed'
  | 'swarm:phase:started'
  | 'swarm:phase:completed'
  | 'swarm:coordination:required'
  | 'swarm:dependency:resolved'
  | 'swarm:conflict:detected'
  | 'swarm:progress:update'
  | 'memory:shared'
  | 'memory:updated'
  | 'memory:query';

/**
 * Coordination event structure
 */
export interface CoordinationEvent {
  type: CoordinationEventType;
  swarmId: string;
  agentId?: string;
  agentType?: string;
  data: any;
  timestamp: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

/**
 * Memory coordination structure
 */
export interface MemoryCoordination {
  key: string;
  value: any;
  swarmId: string;
  agentId: string;
  layer: string;
  dependencies?: string[];
  version: number;
  timestamp: string;
}

/**
 * Communication Bridge - Main Integration Class
 *
 * Bridges the ultra-fast communication system with the fullstack orchestrator
 * to enable real-time agent coordination and memory sharing.
 */
export class CommunicationBridge extends EventEmitter {
  private config: CommunicationBridgeConfig;
  private logger: ILogger;

  // Communication components
  private communicationBus: any;
  private memoryStore: any;
  private communicationEnabled: boolean = false;

  // Orchestrator references
  private orchestrator: FullStackOrchestrator | null = null;
  private messageRouter: EnhancedSwarmMessageRouter | null = null;

  // Active subscriptions per swarm
  private swarmSubscriptions = new Map<string, Set<string>>();
  private agentQueues = new Map<string, string>();

  // Performance metrics
  private metrics = {
    messagesRouted: 0,
    memoryOperations: 0,
    coordinationEvents: 0,
    averageLatency: 0,
    activeSwarms: 0,
    activeAgents: 0
  };

  constructor(config: Partial<CommunicationBridgeConfig>, logger: ILogger) {
    super();

    this.config = {
      enableUltraFastComm: true,
      enableMemorySharing: true,
      enableRealTimeProgress: true,
      messageBufferSize: 65536,
      maxSubscriptionsPerAgent: 100,
      broadcastBatchSize: 32,
      enableCrossLayerCoordination: true,
      enableDependencyTracking: true,
      enableIterativeBuilding: true,
      memoryNamespace: 'fullstack-swarm',
      persistMemory: true,
      memoryTTL: 3600000, // 1 hour
      enableMetrics: true,
      metricsInterval: 5000,
      ...config
    };

    this.logger = logger;
  }

  /**
   * Initialize the communication bridge
   */
  async initialize(
    orchestrator: FullStackOrchestrator,
    messageRouter: EnhancedSwarmMessageRouter
  ): Promise<void> {
    this.logger.info('Initializing Communication Bridge', {
      enableUltraFastComm: this.config.enableUltraFastComm,
      enableMemorySharing: this.config.enableMemorySharing
    });

    this.orchestrator = orchestrator;
    this.messageRouter = messageRouter;

    // Load communication components lazily
    await loadCommunicationComponents();

    // Initialize communication bus if available
    if (this.config.enableUltraFastComm && UltraFastCommunicationBus) {
      await this.initializeCommunicationBus();
    }

    // Initialize memory store if available
    if (this.config.enableMemorySharing && CommunicationMemoryStore) {
      await this.initializeMemoryStore();
    }

    // Setup event handlers
    this.setupOrchestratorHandlers();
    this.setupMessageRouterHandlers();

    // Start metrics collection
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }

    this.logger.info('Communication Bridge initialized successfully', {
      communicationEnabled: this.communicationEnabled,
      componentsActive: {
        communicationBus: !!this.communicationBus,
        memoryStore: !!this.memoryStore
      }
    });

    this.emit('bridge:initialized');
  }

  /**
   * Initialize ultra-fast communication bus
   */
  private async initializeCommunicationBus(): Promise<void> {
    try {
      this.communicationBus = new UltraFastCommunicationBus({
        enableZeroCopy: true,
        enableOptimizedSerialization: true,
        maxBufferSize: this.config.messageBufferSize
      });

      if (this.communicationBus.initialize) {
        await this.communicationBus.initialize();
      }

      this.communicationEnabled = true;
      this.logger.info('Ultra-fast communication bus initialized');
    } catch (error) {
      this.logger.error('Failed to initialize communication bus', { error });
      this.communicationBus = new EventEmitter(); // Fallback
    }
  }

  /**
   * Initialize communication memory store
   */
  private async initializeMemoryStore(): Promise<void> {
    try {
      this.memoryStore = new CommunicationMemoryStore({
        enableCommunication: this.communicationEnabled,
        enableZeroCopy: true,
        enableOptimizedSerialization: true
      });

      await this.memoryStore.initialize();

      // Subscribe to memory events
      this.memoryStore.on('store', (event: any) => {
        this.handleMemoryStoreEvent(event);
      });

      this.memoryStore.on('remoteUpdate', (update: any) => {
        this.handleMemoryRemoteUpdate(update);
      });

      this.logger.info('Communication memory store initialized');
    } catch (error) {
      this.logger.error('Failed to initialize memory store', { error });
    }
  }

  /**
   * Setup orchestrator event handlers
   */
  private setupOrchestratorHandlers(): void {
    if (!this.orchestrator) return;

    // Feature development lifecycle events
    this.orchestrator.on('feature-development-started', (event) => {
      this.handleFeatureDevelopmentStarted(event);
    });

    this.orchestrator.on('phase-completed', (event) => {
      this.handlePhaseCompleted(event);
    });

    this.orchestrator.on('swarm-team-ready', (event) => {
      this.handleSwarmTeamReady(event);
    });

    this.orchestrator.on('feature-development-completed', (event) => {
      this.handleFeatureDevelopmentCompleted(event);
    });

    this.orchestrator.on('swarm-scaled', (event) => {
      this.handleSwarmScaled(event);
    });
  }

  /**
   * Setup message router event handlers
   */
  private setupMessageRouterHandlers(): void {
    if (!this.messageRouter) return;

    // Enhanced message routing events
    this.messageRouter.on('enhanced-message', (message: FullStackAgentMessage) => {
      this.handleEnhancedMessage(message);
    });

    this.messageRouter.on('swarm-state-updated', (state: EnhancedSwarmState) => {
      this.handleSwarmStateUpdated(state);
    });

    // Routing strategy events
    this.messageRouter.on('direct-message', (event) => {
      this.routeDirectMessage(event);
    });

    this.messageRouter.on('broadcast-message', (event) => {
      this.routeBroadcastMessage(event);
    });

    this.messageRouter.on('hierarchical-message', (event) => {
      this.routeHierarchicalMessage(event);
    });
  }

  /**
   * Handle feature development started
   */
  private async handleFeatureDevelopmentStarted(event: { swarmId: string; request: FeatureRequest }): Promise<void> {
    const { swarmId, request } = event;

    this.logger.info('Feature development started - setting up communication', {
      swarmId,
      featureName: request.name
    });

    // Broadcast to all agents
    await this.broadcastCoordinationEvent({
      type: 'swarm:phase:started',
      swarmId,
      data: {
        phase: 'feature-development',
        feature: request.name,
        requirements: request.requirements
      },
      timestamp: new Date().toISOString(),
      priority: 'high'
    });

    // Store in shared memory
    if (this.memoryStore) {
      await this.memoryStore.store(
        `swarm:${swarmId}:feature`,
        request,
        {
          namespace: this.config.memoryNamespace,
          metadata: { type: 'feature-request' },
          broadcast: true
        }
      );
    }

    this.metrics.activeSwarms++;
  }

  /**
   * Handle swarm team ready
   */
  private async handleSwarmTeamReady(event: { swarmId: string; team: SwarmTeamComposition }): Promise<void> {
    const { swarmId, team } = event;

    this.logger.info('Swarm team ready - initializing agent coordination', {
      swarmId,
      agentCount: team.agents.length
    });

    // Create communication queues for each agent
    for (const agent of team.agents) {
      await this.registerAgent(swarmId, agent.id, agent.type);
    }

    // Broadcast team composition to all agents
    await this.broadcastCoordinationEvent({
      type: 'swarm:phase:started',
      swarmId,
      data: {
        phase: 'team-spawning-complete',
        team: {
          agentCount: team.agents.length,
          agents: team.agents.map(a => ({
            id: a.id,
            type: a.type,
            capabilities: a.capabilities
          }))
        }
      },
      timestamp: new Date().toISOString(),
      priority: 'high'
    });

    // Store team composition in shared memory
    if (this.memoryStore) {
      await this.memoryStore.store(
        `swarm:${swarmId}:team`,
        team,
        {
          namespace: this.config.memoryNamespace,
          metadata: { type: 'team-composition' },
          broadcast: true
        }
      );
    }

    this.metrics.activeAgents += team.agents.length;
  }

  /**
   * Register agent with communication system
   */
  private async registerAgent(swarmId: string, agentId: string, agentType: string): Promise<void> {
    const queueId = `${swarmId}:${agentId}`;

    // Create dedicated queue in communication bus
    if (this.communicationBus && this.communicationBus.subscribe) {
      // Subscribe to agent-specific topics
      this.communicationBus.subscribe(`agent:${agentId}:*`, queueId);
      this.communicationBus.subscribe(`swarm:${swarmId}:*`, queueId);
      this.communicationBus.subscribe(`layer:${this.getAgentLayer(agentType)}:*`, queueId);
    }

    // Track agent queue
    this.agentQueues.set(agentId, queueId);

    // Track swarm subscriptions
    if (!this.swarmSubscriptions.has(swarmId)) {
      this.swarmSubscriptions.set(swarmId, new Set());
    }
    this.swarmSubscriptions.get(swarmId)!.add(agentId);

    // Broadcast agent ready event
    await this.broadcastCoordinationEvent({
      type: 'agent:ready',
      swarmId,
      agentId,
      agentType,
      data: { queueId },
      timestamp: new Date().toISOString(),
      priority: 'medium'
    });
  }

  /**
   * Handle enhanced message from message router
   */
  private async handleEnhancedMessage(message: FullStackAgentMessage): Promise<void> {
    const startTime = performance.now();

    try {
      // Route through ultra-fast communication bus
      if (this.communicationBus && this.communicationBus.publish) {
        const topic = this.buildMessageTopic(message);
        const payload = this.serializeMessage(message);

        await this.communicationBus.publish(topic, payload, this.getPriority(message.priority));
      }

      // Broadcast coordination event
      await this.broadcastCoordinationEvent({
        type: this.mapMessageTypeToCoordinationEvent(message.messageType),
        swarmId: message.swarmId,
        agentId: message.agentId,
        agentType: message.agentType,
        data: {
          messageId: message.id,
          messageType: message.messageType,
          content: message.content,
          layer: message.layer
        },
        timestamp: new Date().toISOString(),
        priority: message.priority
      });

      // Update metrics
      const latency = performance.now() - startTime;
      this.updateLatencyMetrics(latency);
      this.metrics.messagesRouted++;

    } catch (error) {
      this.logger.error('Failed to handle enhanced message', {
        error,
        messageId: message.id,
        swarmId: message.swarmId
      });
    }
  }

  /**
   * Handle phase completed
   */
  private async handlePhaseCompleted(event: { swarmId: string; phase: string; [key: string]: any }): Promise<void> {
    const { swarmId, phase } = event;

    await this.broadcastCoordinationEvent({
      type: 'swarm:phase:completed',
      swarmId,
      data: {
        phase,
        completedAt: new Date().toISOString(),
        results: event
      },
      timestamp: new Date().toISOString(),
      priority: 'high'
    });

    // Store phase results in shared memory
    if (this.memoryStore) {
      await this.memoryStore.store(
        `swarm:${swarmId}:phase:${phase}`,
        event,
        {
          namespace: this.config.memoryNamespace,
          metadata: { type: 'phase-completion', phase },
          broadcast: true
        }
      );
    }
  }

  /**
   * Broadcast coordination event to all agents in swarm
   */
  private async broadcastCoordinationEvent(event: CoordinationEvent): Promise<void> {
    try {
      // Emit locally
      this.emit('coordination-event', event);

      // Broadcast via communication bus
      if (this.communicationBus && this.communicationBus.publish) {
        const topic = `coordination:${event.type}`;
        const payload = this.serializeCoordinationEvent(event);

        await this.communicationBus.publish(topic, payload, this.getPriority(event.priority));
      }

      // Store in memory if relevant
      if (this.shouldStoreCoordinationEvent(event) && this.memoryStore) {
        await this.memoryStore.store(
          `coordination:${event.swarmId}:${event.type}:${Date.now()}`,
          event,
          {
            namespace: this.config.memoryNamespace,
            metadata: { type: 'coordination-event' },
            broadcast: false // Already broadcasted above
          }
        );
      }

      this.metrics.coordinationEvents++;

    } catch (error) {
      this.logger.error('Failed to broadcast coordination event', { error, event });
    }
  }

  /**
   * Share memory across agents
   */
  async shareMemory(coordination: MemoryCoordination): Promise<void> {
    if (!this.memoryStore) {
      this.logger.warn('Memory store not available for memory sharing');
      return;
    }

    try {
      await this.memoryStore.store(
        coordination.key,
        coordination.value,
        {
          namespace: `${this.config.memoryNamespace}:${coordination.swarmId}`,
          metadata: {
            agentId: coordination.agentId,
            layer: coordination.layer,
            dependencies: coordination.dependencies,
            version: coordination.version
          },
          broadcast: true
        }
      );

      await this.broadcastCoordinationEvent({
        type: 'memory:shared',
        swarmId: coordination.swarmId,
        agentId: coordination.agentId,
        data: {
          key: coordination.key,
          layer: coordination.layer,
          dependencies: coordination.dependencies
        },
        timestamp: new Date().toISOString(),
        priority: 'medium'
      });

      this.metrics.memoryOperations++;

    } catch (error) {
      this.logger.error('Failed to share memory', { error, coordination });
    }
  }

  /**
   * Query shared memory
   */
  async queryMemory(swarmId: string, key: string, options: { queryRemote?: boolean } = {}): Promise<any> {
    if (!this.memoryStore) {
      this.logger.warn('Memory store not available for memory query');
      return null;
    }

    try {
      const value = await this.memoryStore.retrieve(key, {
        namespace: `${this.config.memoryNamespace}:${swarmId}`,
        queryRemote: options.queryRemote
      });

      if (value) {
        await this.broadcastCoordinationEvent({
          type: 'memory:query',
          swarmId,
          data: { key, found: true },
          timestamp: new Date().toISOString(),
          priority: 'low'
        });
      }

      this.metrics.memoryOperations++;

      return value;

    } catch (error) {
      this.logger.error('Failed to query memory', { error, swarmId, key });
      return null;
    }
  }

  /**
   * Handle swarm state updated
   */
  private async handleSwarmStateUpdated(state: EnhancedSwarmState): Promise<void> {
    await this.broadcastCoordinationEvent({
      type: 'swarm:progress:update',
      swarmId: state.swarmId,
      data: {
        complexity: state.complexity,
        agentCount: state.teamComposition.agents.length,
        messageCount: state.messageCount,
        coordination: state.coordination,
        resourceUsage: state.resourceUsage
      },
      timestamp: new Date().toISOString(),
      priority: 'low'
    });
  }

  /**
   * Handle memory store event
   */
  private handleMemoryStoreEvent(event: { key: string; value: any; entry: any }): void {
    this.emit('memory:stored', event);
  }

  /**
   * Handle memory remote update
   */
  private handleMemoryRemoteUpdate(update: any): void {
    this.emit('memory:updated', update);
  }

  /**
   * Route direct message to specific agent
   */
  private async routeDirectMessage(event: any): Promise<void> {
    if (this.communicationBus && this.communicationBus.publish) {
      const topic = `agent:${event.targetAgent}:direct`;
      const payload = this.serializeMessage(event);
      await this.communicationBus.publish(topic, payload, 0); // High priority
    }
  }

  /**
   * Route broadcast message to layer
   */
  private async routeBroadcastMessage(event: any): Promise<void> {
    if (this.communicationBus && this.communicationBus.publish) {
      const topic = `swarm:${event.swarmId}:broadcast`;
      const payload = this.serializeMessage(event);
      await this.communicationBus.publish(topic, payload, 2); // Normal priority
    }
  }

  /**
   * Route hierarchical message through coordinators
   */
  private async routeHierarchicalMessage(event: any): Promise<void> {
    if (this.communicationBus && this.communicationBus.publish) {
      const topic = `coordinator:${event.coordinator}:hierarchical`;
      const payload = this.serializeMessage(event);
      await this.communicationBus.publish(topic, payload, 1); // High priority
    }
  }

  /**
   * Handle feature development completed
   */
  private async handleFeatureDevelopmentCompleted(event: { swarmId: string; status: SwarmExecutionStatus }): Promise<void> {
    const { swarmId, status } = event;

    await this.broadcastCoordinationEvent({
      type: 'swarm:phase:completed',
      swarmId,
      data: {
        phase: 'feature-development-complete',
        status: status.status,
        performance: status.performance
      },
      timestamp: new Date().toISOString(),
      priority: 'high'
    });

    // Cleanup swarm resources
    await this.cleanupSwarm(swarmId);

    this.metrics.activeSwarms--;
  }

  /**
   * Handle swarm scaled
   */
  private async handleSwarmScaled(event: any): Promise<void> {
    const { swarmId, newTeamSize } = event;

    await this.broadcastCoordinationEvent({
      type: 'swarm:phase:started',
      swarmId,
      data: {
        phase: 'swarm-scaled',
        newTeamSize,
        action: event.action
      },
      timestamp: new Date().toISOString(),
      priority: 'high'
    });
  }

  /**
   * Cleanup swarm resources
   */
  private async cleanupSwarm(swarmId: string): Promise<void> {
    // Remove agent subscriptions
    const agents = this.swarmSubscriptions.get(swarmId);
    if (agents) {
      for (const agentId of agents) {
        this.agentQueues.delete(agentId);
        this.metrics.activeAgents--;
      }
      this.swarmSubscriptions.delete(swarmId);
    }

    // Clear memory namespace
    if (this.memoryStore && this.config.persistMemory === false) {
      // Memory cleanup logic would go here
    }
  }

  /**
   * Build message topic for routing
   */
  private buildMessageTopic(message: FullStackAgentMessage): string {
    if (message.targetAgents && message.targetAgents.length > 0) {
      return `agent:${message.targetAgents[0]}:direct`;
    }
    if (message.layer) {
      return `layer:${message.layer}:${message.messageType}`;
    }
    return `swarm:${message.swarmId}:${message.messageType}`;
  }

  /**
   * Map message priority to communication bus priority
   */
  private getPriority(priority: string): number {
    const priorityMap: Record<string, number> = {
      'critical': 0,
      'urgent': 0,
      'high': 1,
      'medium': 2,
      'low': 3
    };
    return priorityMap[priority] || 2;
  }

  /**
   * Map message type to coordination event type
   */
  private mapMessageTypeToCoordinationEvent(messageType: string): CoordinationEventType {
    const typeMap: Record<string, CoordinationEventType> = {
      'task-start': 'agent:working',
      'completion': 'agent:completed',
      'error': 'agent:failed',
      'coordination': 'swarm:coordination:required',
      'decision': 'swarm:coordination:required'
    };
    return typeMap[messageType] || 'swarm:progress:update';
  }

  /**
   * Get agent layer from agent type
   */
  private getAgentLayer(agentType: string): string {
    if (agentType.includes('frontend') || agentType.includes('ui')) return 'frontend';
    if (agentType.includes('backend') || agentType.includes('api')) return 'backend';
    if (agentType.includes('database') || agentType.includes('data')) return 'database';
    if (agentType.includes('devops') || agentType.includes('deployment')) return 'infrastructure';
    if (agentType.includes('qa') || agentType.includes('test')) return 'testing';
    return 'general';
  }

  /**
   * Serialize message for communication bus
   */
  private serializeMessage(message: any): ArrayBuffer {
    const json = JSON.stringify(message);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Serialize coordination event
   */
  private serializeCoordinationEvent(event: CoordinationEvent): ArrayBuffer {
    const json = JSON.stringify(event);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  /**
   * Should store coordination event in memory
   */
  private shouldStoreCoordinationEvent(event: CoordinationEvent): boolean {
    // Store important coordination events
    const importantTypes: CoordinationEventType[] = [
      'swarm:phase:started',
      'swarm:phase:completed',
      'swarm:coordination:required',
      'swarm:conflict:detected'
    ];
    return importantTypes.includes(event.type);
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(latency: number): void {
    const alpha = 0.2;
    this.metrics.averageLatency = alpha * latency + (1 - alpha) * this.metrics.averageLatency;
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.emit('metrics:updated', this.getMetrics());
    }, this.config.metricsInterval);
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): any {
    return {
      ...this.metrics,
      communicationEnabled: this.communicationEnabled,
      componentsActive: {
        communicationBus: !!this.communicationBus,
        memoryStore: !!this.memoryStore,
        orchestrator: !!this.orchestrator,
        messageRouter: !!this.messageRouter
      },
      communicationBusMetrics: this.communicationBus?.getMetrics?.() || null,
      memoryStoreMetrics: this.memoryStore?.getMetrics?.() || null
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Communication Bridge');

    // Cleanup all swarms
    for (const swarmId of this.swarmSubscriptions.keys()) {
      await this.cleanupSwarm(swarmId);
    }

    // Close communication components
    if (this.communicationBus && this.communicationBus.shutdown) {
      await this.communicationBus.shutdown();
    }

    if (this.memoryStore && this.memoryStore.close) {
      await this.memoryStore.close();
    }

    this.emit('bridge:shutdown');
    this.logger.info('Communication Bridge shutdown complete');
  }
}