import { EventEmitter } from 'events';
import { Logger } from '../core/logger';
import { generateId } from '../utils/helpers';
import {
  CoordinationMessage,
  TopologyBridge,
  ICommunicationBridge,
  MessageRoute,
  ProtocolAdapter,
  MessageQueue,
  BridgeConfiguration,
} from './types';

export interface CommunicationBridgeConfig {
  managerId: string;
  enableCompression: boolean;
  enableEncryption: boolean;
  maxQueueSize: number;
  retryAttempts: number;
  retryDelay: number;
  messageTimeout: number;
  protocolAdapters: ProtocolAdapter[];
  routingRules: RoutingRule[];
}

export interface RoutingRule {
  id: string;
  name: string;
  sourcePattern: string;
  targetPattern: string;
  condition: (message: CoordinationMessage) => boolean;
  transform?: (message: CoordinationMessage) => CoordinationMessage;
  priority: number;
}

export interface QueuedMessage {
  id: string;
  message: CoordinationMessage;
  route: string[];
  timestamp: Date;
  retryCount: number;
  priority: number;
}

export class CommunicationBridge extends EventEmitter implements ICommunicationBridge {
  private bridgeId: string;
  private logger: Logger;
  private config: CommunicationBridgeConfig;
  private bridges: Map<string, TopologyBridge>;
  private messageQueues: Map<string, MessageQueue>;
  private routingTable: Map<string, MessageRoute>;
  private protocolAdapters: Map<string, ProtocolAdapter>;
  private isRunning: boolean = false;
  private messageCounter: number = 0;
  private processingTimer?: NodeJS.Timeout;

  constructor(config: Partial<CommunicationBridgeConfig> = {}) {
    super();

    this.bridgeId = generateId('comm-bridge');
    this.logger = new Logger(`CommunicationBridge[${this.bridgeId}]`);

    this.config = {
      managerId: config.managerId || generateId('manager'),
      enableCompression: false,
      enableEncryption: false,
      maxQueueSize: 1000,
      retryAttempts: 3,
      retryDelay: 1000,
      messageTimeout: 30000,
      protocolAdapters: [],
      routingRules: [],
      ...config,
    };

    this.bridges = new Map();
    this.messageQueues = new Map();
    this.routingTable = new Map();
    this.protocolAdapters = new Map();

    this.initializeDefaultProtocolAdapters();
    this.initializeDefaultRoutingRules();
  }

  async initialize(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Communication bridge already running');
      return;
    }

    this.logger.info('Initializing communication bridge...');

    // Initialize protocol adapters
    for (const adapter of this.config.protocolAdapters) {
      this.protocolAdapters.set(adapter.id, adapter);
      this.logger.debug(`Registered protocol adapter: ${adapter.id}`);
    }

    this.isRunning = true;
    this.startMessageProcessing();

    this.logger.info('Communication bridge initialized successfully');
    this.emit('bridge:initialized', { bridgeId: this.bridgeId });
  }

  async shutdown(): Promise<void> {
    if (!this.isRunning) return;

    this.logger.info('Shutting down communication bridge...');
    this.isRunning = false;

    // Stop message processing
    this.stopMessageProcessing();

    // Close all bridges
    for (const bridgeId of this.bridges.keys()) {
      await this.closeBridge(bridgeId);
    }

    // Clear all queues
    this.messageQueues.clear();
    this.routingTable.clear();

    this.logger.info('Communication bridge shutdown complete');
    this.emit('bridge:shutdown', { bridgeId: this.bridgeId });
  }

  async establishBridge(sourceTopologyId: string, targetTopologyId: string): Promise<string> {
    const bridgeId = generateId('bridge');

    const bridge: TopologyBridge = {
      id: bridgeId,
      sourceTopology: sourceTopologyId,
      targetTopology: targetTopologyId,
      type: 'protocol_adapter',
      status: 'active',
      configuration: {
        enableCompression: this.config.enableCompression,
        enableEncryption: this.config.enableEncryption,
        maxQueueSize: this.config.maxQueueSize,
        timeoutMs: this.config.messageTimeout,
      },
      metrics: {
        messagesRouted: 0,
        averageLatency: 0,
        errorRate: 0,
        throughput: 0,
      },
    };

    this.bridges.set(bridgeId, bridge);

    // Create message queues for both directions
    const forwardQueueId = `${sourceTopologyId}-${targetTopologyId}`;
    const reverseQueueId = `${targetTopologyId}-${sourceTopologyId}`;

    this.messageQueues.set(forwardQueueId, {
      id: forwardQueueId,
      sourceTopology: sourceTopologyId,
      targetTopology: targetTopologyId,
      messages: [],
      maxSize: this.config.maxQueueSize,
      processingRate: 0,
    });

    this.messageQueues.set(reverseQueueId, {
      id: reverseQueueId,
      sourceTopology: targetTopologyId,
      targetTopology: sourceTopologyId,
      messages: [],
      maxSize: this.config.maxQueueSize,
      processingRate: 0,
    });

    // Add routing entries
    this.routingTable.set(`${sourceTopologyId}-${targetTopologyId}`, {
      id: generateId('route'),
      source: sourceTopologyId,
      target: targetTopologyId,
      path: [sourceTopologyId, targetTopologyId],
      cost: 1,
      latency: 100, // ms
      reliability: 0.95,
      lastUpdated: new Date(),
    });

    this.routingTable.set(`${targetTopologyId}-${sourceTopologyId}`, {
      id: generateId('route'),
      source: targetTopologyId,
      target: sourceTopologyId,
      path: [targetTopologyId, sourceTopologyId],
      cost: 1,
      latency: 100, // ms
      reliability: 0.95,
      lastUpdated: new Date(),
    });

    this.logger.info(`Established bridge ${bridgeId}: ${sourceTopologyId} <-> ${targetTopologyId}`);
    this.emit('bridge:established', {
      bridgeId,
      sourceTopologyId,
      targetTopologyId,
    });

    return bridgeId;
  }

  async closeBridge(bridgeId: string): Promise<void> {
    const bridge = this.bridges.get(bridgeId);
    if (!bridge) {
      throw new Error(`Bridge ${bridgeId} not found`);
    }

    // Remove message queues
    const forwardQueueId = `${bridge.sourceTopology}-${bridge.targetTopology}`;
    const reverseQueueId = `${bridge.targetTopology}-${bridge.sourceTopology}`;

    this.messageQueues.delete(forwardQueueId);
    this.messageQueues.delete(reverseQueueId);

    // Remove routing entries
    this.routingTable.delete(`${bridge.sourceTopology}-${bridge.targetTopology}`);
    this.routingTable.delete(`${bridge.targetTopology}-${bridge.sourceTopology}`);

    // Remove bridge
    this.bridges.delete(bridgeId);

    this.logger.info(`Closed bridge ${bridgeId}`);
    this.emit('bridge:closed', { bridgeId });
  }

  async routeMessage(message: CoordinationMessage & { route?: string[] }): Promise<void> {
    const messageId = message.id || generateId('msg');
    const enhancedMessage: CoordinationMessage = {
      ...message,
      id: messageId,
      timestamp: message.timestamp || new Date(),
    };

    this.logger.debug(`Routing message ${messageId}`);

    // If route is provided, use it; otherwise, find optimal route
    const route =
      message.route ||
      (await this.findOptimalRoute(message.sourceTopology || '', message.targetTopology || ''));

    if (!route || route.length < 2) {
      throw new Error(`No route found for message ${messageId}`);
    }

    // Apply routing rules
    const processedMessage = await this.applyRoutingRules(enhancedMessage);

    // Queue message for processing
    await this.queueMessage(processedMessage, route);

    this.messageCounter++;
  }

  async sendMessage(
    sourceTopologyId: string,
    targetTopologyId: string,
    message: CoordinationMessage,
  ): Promise<void> {
    const enhancedMessage: CoordinationMessage = {
      ...message,
      sourceTopology: sourceTopologyId,
      targetTopology: targetTopologyId,
      timestamp: message.timestamp || new Date(),
    };

    await this.routeMessage(enhancedMessage);
  }

  getBridgeMetrics(bridgeId: string): TopologyBridge | undefined {
    return this.bridges.get(bridgeId);
  }

  getAllBridges(): TopologyBridge[] {
    return Array.from(this.bridges.values());
  }

  getQueueStatus(): Array<{ queueId: string; size: number; processingRate: number }> {
    return Array.from(this.messageQueues.values()).map((queue) => ({
      queueId: queue.id,
      size: queue.messages.length,
      processingRate: queue.processingRate,
    }));
  }

  getRoutingTable(): MessageRoute[] {
    return Array.from(this.routingTable.values());
  }

  private async findOptimalRoute(sourceId: string, targetId: string): Promise<string[]> {
    // Direct route if available
    const directRoute = this.routingTable.get(`${sourceId}-${targetId}`);
    if (directRoute) {
      return directRoute.path;
    }

    // Find multi-hop route using Dijkstra-like algorithm
    const routes = Array.from(this.routingTable.values());
    const graph = this.buildRoutingGraph(routes);

    return this.findShortestPath(graph, sourceId, targetId);
  }

  private buildRoutingGraph(
    routes: MessageRoute[],
  ): Map<string, Array<{ target: string; cost: number }>> {
    const graph = new Map<string, Array<{ target: string; cost: number }>>();

    for (const route of routes) {
      if (!graph.has(route.source)) {
        graph.set(route.source, []);
      }
      graph.get(route.source)!.push({
        target: route.target,
        cost: route.cost,
      });
    }

    return graph;
  }

  private findShortestPath(
    graph: Map<string, Array<{ target: string; cost: number }>>,
    start: string,
    end: string,
  ): string[] {
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const unvisited = new Set<string>();

    // Initialize distances
    for (const node of graph.keys()) {
      distances.set(node, node === start ? 0 : Infinity);
      unvisited.add(node);
    }

    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let current: string | null = null;
      let minDistance = Infinity;

      for (const node of unvisited) {
        const distance = distances.get(node) || Infinity;
        if (distance < minDistance) {
          minDistance = distance;
          current = node;
        }
      }

      if (!current || minDistance === Infinity) {
        break; // No path found
      }

      unvisited.delete(current);

      if (current === end) {
        break; // Found target
      }

      // Update distances to neighbors
      const neighbors = graph.get(current) || [];
      for (const neighbor of neighbors) {
        if (unvisited.has(neighbor.target)) {
          const newDistance = minDistance + neighbor.cost;
          const currentDistance = distances.get(neighbor.target) || Infinity;

          if (newDistance < currentDistance) {
            distances.set(neighbor.target, newDistance);
            previous.set(neighbor.target, current);
          }
        }
      }
    }

    // Reconstruct path
    const path: string[] = [];
    let current: string | undefined = end;

    while (current) {
      path.unshift(current);
      current = previous.get(current);
    }

    return path.length > 1 && path[0] === start ? path : [];
  }

  private async applyRoutingRules(message: CoordinationMessage): Promise<CoordinationMessage> {
    let processedMessage = { ...message };

    // Sort rules by priority (higher priority first)
    const sortedRules = this.config.routingRules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.condition(processedMessage)) {
        this.logger.debug(`Applying routing rule: ${rule.name}`);

        if (rule.transform) {
          processedMessage = rule.transform(processedMessage);
        }

        // Only apply first matching rule
        break;
      }
    }

    return processedMessage;
  }

  private async queueMessage(message: CoordinationMessage, route: string[]): Promise<void> {
    if (route.length < 2) {
      throw new Error('Invalid route: must have at least 2 hops');
    }

    for (let i = 0; i < route.length - 1; i++) {
      const sourceId = route[i];
      const targetId = route[i + 1];
      const queueId = `${sourceId}-${targetId}`;

      const queue = this.messageQueues.get(queueId);
      if (!queue) {
        throw new Error(`Queue ${queueId} not found`);
      }

      if (queue.messages.length >= queue.maxSize) {
        throw new Error(`Queue ${queueId} is full`);
      }

      const queuedMessage: QueuedMessage = {
        id: generateId('queued-msg'),
        message,
        route: route.slice(i),
        timestamp: new Date(),
        retryCount: 0,
        priority: message.priority || 5,
      };

      queue.messages.push(queuedMessage);

      // Sort by priority (higher priority first)
      queue.messages.sort((a, b) => b.priority - a.priority);

      this.logger.debug(`Queued message ${message.id} in queue ${queueId}`);
    }
  }

  private startMessageProcessing(): void {
    this.processingTimer = setInterval(() => {
      this.processMessageQueues();
    }, 100); // Process every 100ms
  }

  private stopMessageProcessing(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  private async processMessageQueues(): Promise<void> {
    for (const [queueId, queue] of this.messageQueues) {
      if (queue.messages.length === 0) continue;

      try {
        const startTime = Date.now();
        const processedCount = await this.processQueue(queue);
        const endTime = Date.now();

        // Update processing rate (messages per second)
        const processingTime = (endTime - startTime) / 1000;
        queue.processingRate = processingTime > 0 ? processedCount / processingTime : 0;
      } catch (error) {
        this.logger.error(`Error processing queue ${queueId}: ${error.message}`);
      }
    }
  }

  private async processQueue(queue: MessageQueue): Promise<number> {
    let processedCount = 0;
    const maxBatchSize = 10;

    while (queue.messages.length > 0 && processedCount < maxBatchSize) {
      const queuedMessage = queue.messages.shift()!;

      try {
        await this.processQueuedMessage(queuedMessage);
        processedCount++;

        // Update bridge metrics
        this.updateBridgeMetrics(queue.sourceTopology, queue.targetTopology, true);
      } catch (error) {
        this.logger.warn(`Failed to process message ${queuedMessage.message.id}: ${error.message}`);

        // Retry logic
        if (queuedMessage.retryCount < this.config.retryAttempts) {
          queuedMessage.retryCount++;
          queuedMessage.timestamp = new Date();

          // Add back to queue with delay
          setTimeout(() => {
            queue.messages.push(queuedMessage);
          }, this.config.retryDelay * queuedMessage.retryCount);
        } else {
          this.logger.error(`Message ${queuedMessage.message.id} exceeded retry limit, dropping`);
          this.updateBridgeMetrics(queue.sourceTopology, queue.targetTopology, false);

          this.emit('message:dropped', {
            messageId: queuedMessage.message.id,
            reason: 'retry_limit_exceeded',
            error: error.message,
          });
        }
      }
    }

    return processedCount;
  }

  private async processQueuedMessage(queuedMessage: QueuedMessage): Promise<void> {
    const { message, route } = queuedMessage;

    if (route.length < 2) {
      throw new Error('Invalid route in queued message');
    }

    const sourceId = route[0];
    const targetId = route[1];

    // Apply protocol adaptation if needed
    const adapter = this.findProtocolAdapter(sourceId, targetId);
    let processedMessage = message;

    if (adapter && adapter.transform) {
      processedMessage = await adapter.transform(message);
    }

    // Simulate message delivery
    await this.deliverMessage(processedMessage, targetId);

    this.logger.debug(`Delivered message ${message.id} from ${sourceId} to ${targetId}`);

    this.emit('message:delivered', {
      messageId: message.id,
      sourceTopology: sourceId,
      targetTopology: targetId,
    });
  }

  private async deliverMessage(
    message: CoordinationMessage,
    targetTopologyId: string,
  ): Promise<void> {
    // Simulate network latency
    const latency = Math.random() * 100; // 0-100ms
    await new Promise((resolve) => setTimeout(resolve, latency));

    // Message would be delivered to the target topology coordinator here
    this.emit('message:received', {
      message,
      targetTopologyId,
      receivedAt: new Date(),
    });
  }

  private findProtocolAdapter(sourceId: string, targetId: string): ProtocolAdapter | undefined {
    return Array.from(this.protocolAdapters.values()).find(
      (adapter) => adapter.sourceProtocol === sourceId || adapter.targetProtocol === targetId,
    );
  }

  private updateBridgeMetrics(sourceId: string, targetId: string, success: boolean): void {
    const bridgeId = this.findBridgeId(sourceId, targetId);
    if (!bridgeId) return;

    const bridge = this.bridges.get(bridgeId);
    if (!bridge) return;

    bridge.metrics.messagesRouted++;

    if (!success) {
      const totalMessages = bridge.metrics.messagesRouted;
      const currentErrors = bridge.metrics.errorRate * (totalMessages - 1);
      bridge.metrics.errorRate = (currentErrors + 1) / totalMessages;
    } else {
      // Update average latency (simplified)
      const newLatency = Math.random() * 200; // 0-200ms
      const currentAvg = bridge.metrics.averageLatency;
      const count = bridge.metrics.messagesRouted;
      bridge.metrics.averageLatency = (currentAvg * (count - 1) + newLatency) / count;
    }

    // Update throughput (messages per second over last minute)
    bridge.metrics.throughput = bridge.metrics.messagesRouted / 60;
  }

  private findBridgeId(sourceId: string, targetId: string): string | undefined {
    for (const [bridgeId, bridge] of this.bridges) {
      if (
        (bridge.sourceTopology === sourceId && bridge.targetTopology === targetId) ||
        (bridge.sourceTopology === targetId && bridge.targetTopology === sourceId)
      ) {
        return bridgeId;
      }
    }
    return undefined;
  }

  private initializeDefaultProtocolAdapters(): void {
    this.config.protocolAdapters = [
      {
        id: 'mesh-hierarchical-adapter',
        name: 'Mesh to Hierarchical Adapter',
        sourceProtocol: 'mesh',
        targetProtocol: 'hierarchical',
        transform: async (message: CoordinationMessage) => {
          // Transform mesh broadcast to hierarchical delegation
          if (message.type === 'broadcast') {
            return {
              ...message,
              type: 'delegate',
              hierarchical: true,
            };
          }
          return message;
        },
      },
      {
        id: 'hierarchical-mesh-adapter',
        name: 'Hierarchical to Mesh Adapter',
        sourceProtocol: 'hierarchical',
        targetProtocol: 'mesh',
        transform: async (message: CoordinationMessage) => {
          // Transform hierarchical delegation to mesh broadcast
          if (message.type === 'delegate') {
            return {
              ...message,
              type: 'broadcast',
              broadcast: true,
            };
          }
          return message;
        },
      },
      {
        id: 'hybrid-universal-adapter',
        name: 'Hybrid Universal Adapter',
        sourceProtocol: 'hybrid',
        targetProtocol: '*',
        transform: async (message: CoordinationMessage) => {
          // Hybrid can adapt to any protocol
          return {
            ...message,
            adaptedFromHybrid: true,
          };
        },
      },
    ];
  }

  private initializeDefaultRoutingRules(): void {
    this.config.routingRules = [
      {
        id: 'high-priority-rule',
        name: 'High Priority Message Routing',
        sourcePattern: '*',
        targetPattern: '*',
        condition: (message) => (message.priority || 0) >= 9,
        priority: 10,
        transform: (message) => ({
          ...message,
          expedited: true,
        }),
      },
      {
        id: 'broadcast-optimization-rule',
        name: 'Broadcast Message Optimization',
        sourcePattern: '*',
        targetPattern: '*',
        condition: (message) => message.broadcast === true,
        priority: 5,
        transform: (message) => ({
          ...message,
          optimized: true,
          batchable: true,
        }),
      },
      {
        id: 'error-handling-rule',
        name: 'Error Message Special Handling',
        sourcePattern: '*',
        targetPattern: '*',
        condition: (message) => message.type === 'error',
        priority: 8,
        transform: (message) => ({
          ...message,
          immediate: true,
          persistent: true,
        }),
      },
    ];
  }
}
