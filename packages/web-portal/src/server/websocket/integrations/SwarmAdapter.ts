/**
 * Swarm Coordinator Integration Adapter
 * Maps SwarmCoordinator events to WebSocket hierarchy_change events
 */

import type { WebSocketServer } from '../SocketIOServer';
import type { HierarchyEvent } from '../types';

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

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Handle swarm coordinator event
   */
  public handleSwarmEvent(event: SwarmCoordinatorEvent): void {
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
   * Subscribe to SwarmCoordinator events
   * This would integrate with actual SwarmCoordinator implementation
   */
  public subscribeToSwarmCoordinator(swarmCoordinator: any): void {
    if (!swarmCoordinator) {
      console.warn('SwarmCoordinator not available - WebSocket hierarchy events will not be populated');
      return;
    }

    // Subscribe to swarm lifecycle events
    // Note: Actual implementation depends on SwarmCoordinator API
    // This is a placeholder for the integration point

    console.log('SwarmAdapter subscribed to SwarmCoordinator');
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
}

export default SwarmAdapter;
