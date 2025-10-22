/**
 * Swarm Coordinator Integration Adapter
 * Maps SwarmCoordinator events to WebSocket hierarchy_change events
 * Persists events to EventStore for historical queries
 * Implements Redis pub/sub for real-time CLI agent coordination (CLAUDE.md Critical Rule #19)
 */

import type { WebSocketServer } from '../SocketIOServer';
import type { HierarchyEvent } from '../types';
import { eventStoreService } from '../../services/event-store.js';
import { redisClientService, RedisSubscriber } from '../../services/redis-client.js';

export interface SwarmCoordinatorEvent {
  type: 'swarm_created' | 'swarm_updated' | 'swarm_terminated' | 'agent_spawned' | 'agent_terminated' | 'agent_reparented';
  swarmId?: string;
  agentId?: string;
  parentId?: string;
  newParentId?: string;
  data: any;
  timestamp: Date;
}

export class SwarmAdapter {
  private wsServer: WebSocketServer;
  private activeSwarms: Map<string, any> = new Map();
  private agentHierarchy: Map<string, string> = new Map(); // agentId -> parentId
  private eventStorageEnabled: boolean = true;
  private redisSubscriber: RedisSubscriber | null = null;
  private isSubscribed: boolean = false;
  private messageCount: number = 0;

  constructor(wsServer: WebSocketServer, options: { enableEventStorage?: boolean } = {}) {
    this.wsServer = wsServer;
    this.eventStorageEnabled = options.enableEventStorage !== false;

    // Initialize event store if enabled
    if (this.eventStorageEnabled) {
      this.initializeEventStore().catch(error => {
        console.error('Failed to initialize event store:', error);
        this.eventStorageEnabled = false;
      });
    }
  }

  /**
   * Initialize event store service
   */
  private async initializeEventStore(): Promise<void> {
    if (!eventStoreService.isReady()) {
      await eventStoreService.initialize();
      console.log('SwarmAdapter: Event store initialized');
    }
  }

  /**
   * Persist event to event store
   * Non-blocking - logs errors but doesn't break real-time flow
   */
  private async persistEvent(event: SwarmCoordinatorEvent): Promise<void> {
    if (!this.eventStorageEnabled) return;

    try {
      await eventStoreService.storeEvent({
        timestamp: event.timestamp,
        phaseId: event.swarmId || 'unknown',
        agentId: event.agentId || 'swarm-coordinator',
        eventType: `swarm_${event.type}`,
        payload: {
          type: event.type,
          swarmId: event.swarmId,
          agentId: event.agentId,
          parentId: event.parentId,
          newParentId: event.newParentId,
          data: event.data
        },
        metadata: {
          source: 'swarm-adapter',
          version: '1.0.0'
        }
      });
    } catch (error) {
      // Log error but don't throw - persistence failure shouldn't break real-time events
      console.error('Failed to persist swarm event to event store:', error);
    }
  }

  /**
   * Handle swarm coordinator event
   * Broadcasts to WebSocket clients and persists to event store
   */
  public handleSwarmEvent(event: SwarmCoordinatorEvent): void {
    // Persist event asynchronously (non-blocking)
    this.persistEvent(event).catch(error => {
      console.error('Event persistence failed:', error);
    });

    // Handle event synchronously for real-time broadcast
    switch (event.type) {
      case 'swarm_created':
        this.handleSwarmCreated(event);
        break;
      case 'swarm_updated':
        this.handleSwarmUpdated(event);
        break;
      case 'swarm_terminated':
        this.handleSwarmTerminated(event);
        break;
      case 'agent_spawned':
        this.handleAgentSpawned(event);
        break;
      case 'agent_terminated':
        this.handleAgentTerminated(event);
        break;
      case 'agent_reparented':
        this.handleAgentReparented(event);
        break;
      default:
        console.warn(`Unknown swarm event type: ${event.type}`);
    }
  }

  /**
   * Handle swarm created
   */
  private handleSwarmCreated(event: SwarmCoordinatorEvent): void {
    if (!event.swarmId) return;

    this.activeSwarms.set(event.swarmId, {
      id: event.swarmId,
      createdAt: event.timestamp,
      agents: [],
      ...event.data
    });

    console.log(`Swarm created: ${event.swarmId}`);
  }

  /**
   * Handle swarm updated
   */
  private handleSwarmUpdated(event: SwarmCoordinatorEvent): void {
    if (!event.swarmId) return;

    const swarm = this.activeSwarms.get(event.swarmId);
    if (swarm) {
      Object.assign(swarm, event.data);
    }

    console.log(`Swarm updated: ${event.swarmId}`);
  }

  /**
   * Handle swarm terminated
   */
  private handleSwarmTerminated(event: SwarmCoordinatorEvent): void {
    if (!event.swarmId) return;

    this.activeSwarms.delete(event.swarmId);

    console.log(`Swarm terminated: ${event.swarmId}`);
  }

  /**
   * Handle agent spawned in hierarchy
   */
  private handleAgentSpawned(event: SwarmCoordinatorEvent): void {
    if (!event.agentId) return;

    if (event.parentId) {
      this.agentHierarchy.set(event.agentId, event.parentId);
    }

    this.wsServer.emitHierarchyChange({
      type: 'spawn',
      agentId: event.agentId,
      parentId: event.parentId,
      metadata: event.data
    });
  }

  /**
   * Handle agent terminated in hierarchy
   */
  private handleAgentTerminated(event: SwarmCoordinatorEvent): void {
    if (!event.agentId) return;

    const parentId = this.agentHierarchy.get(event.agentId);
    this.agentHierarchy.delete(event.agentId);

    this.wsServer.emitHierarchyChange({
      type: 'terminate',
      agentId: event.agentId,
      parentId,
      metadata: event.data
    });
  }

  /**
   * Handle agent reparented in hierarchy
   */
  private handleAgentReparented(event: SwarmCoordinatorEvent): void {
    if (!event.agentId || !event.newParentId) return;

    const oldParentId = this.agentHierarchy.get(event.agentId);
    this.agentHierarchy.set(event.agentId, event.newParentId);

    this.wsServer.emitHierarchyChange({
      type: 'reparent',
      agentId: event.agentId,
      parentId: oldParentId,
      newParentId: event.newParentId,
      metadata: event.data
    });
  }

  /**
   * Subscribe to Redis pub/sub for real-time CLI agent coordination
   * Implements CLAUDE.md Critical Rule #19: ALL agent communication MUST use Redis pub/sub
   */
  public async subscribeToSwarmCoordinator(): Promise<void> {
    if (this.isSubscribed) {
      console.log('[SwarmAdapter] Already subscribed to Redis pub/sub');
      return;
    }

    try {
      // Get Redis subscriber client
      this.redisSubscriber = await redisClientService.getSubscriber();

      // Subscribe to patterns for swarm, agent, and cfn coordination
      const patterns = ['swarm:*', 'agent:*', 'cfn:*'];

      console.log('[SwarmAdapter] Subscribing to Redis patterns:', patterns);

      // Use pSubscribe for pattern-based subscriptions
      await this.redisSubscriber.pSubscribe(patterns, (message, channel) => {
        this.handleRedisMessage(message, channel);
      });

      this.isSubscribed = true;
      console.log('[SwarmAdapter] Successfully subscribed to Redis pub/sub');
      console.log('[SwarmAdapter] Listening for CLI agent coordination events');

    } catch (error) {
      console.error('[SwarmAdapter] Failed to subscribe to Redis:', error);
      this.isSubscribed = false;
      throw error;
    }
  }

  /**
   * Handle incoming Redis pub/sub messages
   * Parse and map to SwarmCoordinatorEvent format
   */
  private handleRedisMessage(message: string, channel: string): void {
    this.messageCount++;

    try {
      // Parse JSON message
      const data = JSON.parse(message);

      // Map Redis message to SwarmCoordinatorEvent
      const event = this.mapRedisMessageToEvent(data, channel);

      if (event) {
        // Handle event (broadcasts to WebSocket and persists)
        this.handleSwarmEvent(event);

        // Log for debugging
        if (this.messageCount % 10 === 0) {
          console.log(`[SwarmAdapter] Processed ${this.messageCount} Redis messages`);
        }
      }

    } catch (error) {
      console.error('[SwarmAdapter] Error parsing Redis message:', error);
      console.error('[SwarmAdapter] Channel:', channel);
      console.error('[SwarmAdapter] Raw message:', message);
    }
  }

  /**
   * Map Redis pub/sub message to SwarmCoordinatorEvent
   * Handles multiple CLI event formats
   */
  private mapRedisMessageToEvent(data: any, channel: string): SwarmCoordinatorEvent | null {
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

    // Parse channel to determine event type
    const [prefix, ...parts] = channel.split(':');

    // Swarm coordination events
    if (prefix === 'swarm') {
      const [swarmId, eventType] = parts;

      switch (eventType) {
        case 'created':
          return {
            type: 'swarm_created',
            swarmId,
            data,
            timestamp
          };

        case 'updated':
          return {
            type: 'swarm_updated',
            swarmId,
            data,
            timestamp
          };

        case 'terminated':
          return {
            type: 'swarm_terminated',
            swarmId,
            data,
            timestamp
          };
      }
    }

    // Agent lifecycle events
    if (prefix === 'agent') {
      const [agentId, eventType] = parts;

      switch (eventType) {
        case 'spawned':
          return {
            type: 'agent_spawned',
            agentId,
            parentId: data.parentId,
            swarmId: data.swarmId,
            data,
            timestamp
          };

        case 'terminated':
          return {
            type: 'agent_terminated',
            agentId,
            swarmId: data.swarmId,
            data,
            timestamp
          };

        case 'reparented':
          return {
            type: 'agent_reparented',
            agentId,
            parentId: data.oldParentId,
            newParentId: data.newParentId,
            swarmId: data.swarmId,
            data,
            timestamp
          };
      }
    }

    // CFN Loop events (map to swarm events)
    if (prefix === 'cfn') {
      const [taskId, eventType] = parts;

      // Map CFN events to appropriate swarm events
      if (eventType === 'loop' || eventType === 'phase') {
        return {
          type: 'swarm_updated',
          swarmId: taskId,
          data: {
            ...data,
            cfnEvent: true,
            eventType
          },
          timestamp
        };
      }

      // CFN agent events
      if (data.agentId || data.agent) {
        const agentId = data.agentId || data.agent;

        if (data.status === 'spawned' || data.status === 'started') {
          return {
            type: 'agent_spawned',
            agentId,
            swarmId: taskId,
            parentId: data.parentId,
            data,
            timestamp
          };
        }

        if (data.status === 'complete' || data.status === 'terminated') {
          return {
            type: 'agent_terminated',
            agentId,
            swarmId: taskId,
            data,
            timestamp
          };
        }
      }
    }

    // Unknown event format - log for debugging
    console.warn('[SwarmAdapter] Unknown Redis event format:', { channel, data });
    return null;
  }

  /**
   * Unsubscribe from Redis pub/sub
   */
  public async unsubscribe(): Promise<void> {
    if (!this.isSubscribed || !this.redisSubscriber) {
      return;
    }

    try {
      await this.redisSubscriber.pUnsubscribe();
      this.isSubscribed = false;
      console.log('[SwarmAdapter] Unsubscribed from Redis pub/sub');
    } catch (error) {
      console.error('[SwarmAdapter] Error unsubscribing from Redis:', error);
    }
  }

  /**
   * Get subscription status
   */
  public getSubscriptionStatus(): { isSubscribed: boolean; messageCount: number } {
    return {
      isSubscribed: this.isSubscribed,
      messageCount: this.messageCount
    };
  }

  /**
   * Get active swarms
   */
  public getActiveSwarms(): Map<string, any> {
    return new Map(this.activeSwarms);
  }

  /**
   * Get agent hierarchy
   */
  public getAgentHierarchy(): Map<string, string> {
    return new Map(this.agentHierarchy);
  }

  /**
   * Get agent parent
   */
  public getAgentParent(agentId: string): string | undefined {
    return this.agentHierarchy.get(agentId);
  }

  /**
   * Get agent children
   */
  public getAgentChildren(agentId: string): string[] {
    const children: string[] = [];
    this.agentHierarchy.forEach((parentId, childId) => {
      if (parentId === agentId) {
        children.push(childId);
      }
    });
    return children;
  }

  /**
   * Clear cached data
   */
  public clearCache(): void {
    this.activeSwarms.clear();
    this.agentHierarchy.clear();
  }

  /**
   * Query historical events from event store
   */
  public async queryEventHistory(filters: {
    swarmId?: string;
    agentId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: any[];
    total: number;
    hasMore: boolean;
  }> {
    if (!this.eventStorageEnabled) {
      return { events: [], total: 0, hasMore: false };
    }

    try {
      // Map swarmId to phaseId for event store query
      const result = await eventStoreService.queryEvents({
        phaseId: filters.swarmId,
        agentId: filters.agentId,
        eventType: filters.eventType ? `swarm_${filters.eventType}` : undefined,
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: filters.limit,
        offset: filters.offset
      });

      return {
        events: result.events.map(event => ({
          ...event.payload,
          eventId: event.id,
          timestamp: event.timestamp,
          metadata: event.metadata
        })),
        total: result.total,
        hasMore: result.hasMore
      };
    } catch (error) {
      console.error('Failed to query event history:', error);
      return { events: [], total: 0, hasMore: false };
    }
  }

  /**
   * Get swarm event timeline
   */
  public async getSwarmTimeline(swarmId: string, limit: number = 100): Promise<any[]> {
    const result = await this.queryEventHistory({ swarmId, limit });
    return result.events;
  }

  /**
   * Get agent event history
   */
  public async getAgentEventHistory(agentId: string, limit: number = 100): Promise<any[]> {
    const result = await this.queryEventHistory({ agentId, limit });
    return result.events;
  }

  /**
   * Get event statistics for a swarm
   */
  public async getSwarmStatistics(swarmId: string): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    agentCount: number;
    startTime?: Date;
    endTime?: Date;
  }> {
    if (!this.eventStorageEnabled) {
      return {
        totalEvents: 0,
        eventsByType: {},
        agentCount: 0
      };
    }

    try {
      const result = await eventStoreService.queryEvents({
        phaseId: swarmId,
        limit: 10000 // Get all events for statistics
      });

      const eventsByType: Record<string, number> = {};
      const agents = new Set<string>();

      result.events.forEach(event => {
        const type = event.payload.type || event.eventType;
        eventsByType[type] = (eventsByType[type] || 0) + 1;
        if (event.agentId) {
          agents.add(event.agentId);
        }
      });

      return {
        totalEvents: result.total,
        eventsByType,
        agentCount: agents.size,
        startTime: result.events[result.events.length - 1]?.timestamp,
        endTime: result.events[0]?.timestamp
      };
    } catch (error) {
      console.error('Failed to get swarm statistics:', error);
      return {
        totalEvents: 0,
        eventsByType: {},
        agentCount: 0
      };
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('[SwarmAdapter] Shutting down...');

    await this.unsubscribe();
    this.clearCache();

    console.log('[SwarmAdapter] Shutdown complete');
  }
}

export default SwarmAdapter;
