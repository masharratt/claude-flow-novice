/**
 * Transparency System Integration Adapter
 * Maps TransparencySystem agent lifecycle events to WebSocket events
 *
 * Real-time event propagation from TransparencySystem to WebSocket clients
 */

import type { WebSocketServer } from '../SocketIOServer';
import type { AgentStatus } from '../types';
import type { AgentLifecycleEvent, AgentState } from '../../../../../../src/coordination/shared/transparency/interfaces/transparency-system.js';
import type { TransparencyService } from '../../services/transparency-service';

export interface TransparencySystemEvent {
  type: 'agent_spawned' | 'agent_updated' | 'agent_terminated' | 'agent_health_changed';
  agentId: string;
  data: any;
  timestamp: Date;
}

export class TransparencyAdapter {
  private wsServer: WebSocketServer;
  private transparencyService: any; // Will be injected
  private lastAgentStatuses: Map<string, AgentStatus> = new Map();
  private unsubscribe?: () => void;

  constructor(wsServer: WebSocketServer) {
    this.wsServer = wsServer;
  }

  /**
   * Handle agent lifecycle event from TransparencySystem
   */
  public handleAgentEvent(event: TransparencySystemEvent): void {
    switch (event.type) {
      case 'agent_spawned':
        this.handleAgentSpawned(event);
        break;
      case 'agent_updated':
        this.handleAgentUpdated(event);
        break;
      case 'agent_terminated':
        this.handleAgentTerminated(event);
        break;
      case 'agent_health_changed':
        this.handleAgentHealthChanged(event);
        break;
      default:
        console.warn(`Unknown event type: ${event.type}`);
    }
  }

  /**
   * Handle agent spawned
   */
  private handleAgentSpawned(event: TransparencySystemEvent): void {
    const agentStatus: AgentStatus = {
      agentId: event.agentId,
      status: 'spawned',
      confidence: event.data.confidence || 0,
      tasks: [],
      health: {
        cpu: 0,
        memory: 0,
        uptime: 0
      },
      timestamp: event.timestamp
    };

    this.lastAgentStatuses.set(event.agentId, agentStatus);

    this.wsServer.emitAgentUpdate(event.agentId, {
      status: 'spawned',
      confidence: agentStatus.confidence,
      tasks: agentStatus.tasks,
      health: agentStatus.health
    });
  }

  /**
   * Handle agent updated
   */
  private handleAgentUpdated(event: TransparencySystemEvent): void {
    const lastStatus = this.lastAgentStatuses.get(event.agentId);
    const agentStatus: AgentStatus = {
      agentId: event.agentId,
      status: event.data.status || lastStatus?.status || 'running',
      confidence: event.data.confidence ?? lastStatus?.confidence ?? 0,
      tasks: event.data.tasks || lastStatus?.tasks || [],
      health: event.data.health || lastStatus?.health || {
        cpu: 0,
        memory: 0,
        uptime: 0
      },
      timestamp: event.timestamp
    };

    this.lastAgentStatuses.set(event.agentId, agentStatus);

    this.wsServer.emitAgentUpdate(event.agentId, {
      status: agentStatus.status,
      confidence: agentStatus.confidence,
      tasks: agentStatus.tasks,
      health: agentStatus.health
    });
  }

  /**
   * Handle agent terminated
   */
  private handleAgentTerminated(event: TransparencySystemEvent): void {
    const agentStatus: AgentStatus = {
      agentId: event.agentId,
      status: 'terminated',
      confidence: event.data.confidence || 0,
      tasks: event.data.tasks || [],
      timestamp: event.timestamp
    };

    this.lastAgentStatuses.delete(event.agentId);

    this.wsServer.emitAgentUpdate(event.agentId, {
      status: 'terminated',
      confidence: agentStatus.confidence,
      tasks: agentStatus.tasks
    });
  }

  /**
   * Handle agent health changed
   */
  private handleAgentHealthChanged(event: TransparencySystemEvent): void {
    const lastStatus = this.lastAgentStatuses.get(event.agentId);
    if (!lastStatus) return;

    const updatedHealth = {
      cpu: event.data.cpu ?? lastStatus.health?.cpu ?? 0,
      memory: event.data.memory ?? lastStatus.health?.memory ?? 0,
      uptime: event.data.uptime ?? lastStatus.health?.uptime ?? 0
    };

    lastStatus.health = updatedHealth;
    this.lastAgentStatuses.set(event.agentId, lastStatus);

    this.wsServer.emitAgentUpdate(event.agentId, {
      status: lastStatus.status,
      confidence: lastStatus.confidence,
      tasks: lastStatus.tasks,
      health: updatedHealth
    });
  }

  /**
   * Subscribe to TransparencySystem events
   * Integrates with real TransparencySystem lifecycle events
   */
  public subscribeToTransparencySystem(transparencyService: any): void {
    if (!transparencyService) {
      console.warn(
        'TransparencyService not available - WebSocket events will not be populated'
      );
      return;
    }

    this.transparencyService = transparencyService;

    // Subscribe to lifecycle events from TransparencySystem
    this.unsubscribe = transparencyService.subscribeToLifecycleEvents(
      (event: AgentLifecycleEvent) => {
        this.handleLifecycleEvent(event);
      }
    );

    console.log('TransparencyAdapter subscribed to TransparencySystem events');
  }

  /**
   * Unsubscribe from TransparencySystem events
   */
  public unsubscribe(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  /**
   * Handle TransparencySystem lifecycle event
   * Maps lifecycle events to WebSocket events
   */
  private handleLifecycleEvent(event: AgentLifecycleEvent): void {
    const { agentId, eventType, eventData, timestamp } = event;

    switch (eventType) {
      case 'spawned':
        this.handleAgentSpawnedEvent(agentId, eventData, timestamp);
        break;

      case 'state_changed':
        this.handleAgentStateChangedEvent(agentId, eventData, timestamp);
        break;

      case 'terminated':
        this.handleAgentTerminatedEvent(agentId, eventData, timestamp);
        break;

      case 'task_assigned':
      case 'task_completed':
        this.handleAgentTaskEvent(agentId, eventType, eventData, timestamp);
        break;

      case 'error_occurred':
        this.handleAgentErrorEvent(agentId, eventData, timestamp);
        break;

      case 'checkpoint_created':
      case 'checkpoint_restored':
      case 'paused':
      case 'resumed':
        // Update agent status for these events
        this.handleAgentStatusUpdate(agentId, eventType, eventData, timestamp);
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }
  }

  /**
   * Handle agent spawned event
   */
  private handleAgentSpawnedEvent(
    agentId: string,
    eventData: any,
    timestamp: Date
  ): void {
    const agentStatus: AgentStatus = {
      agentId,
      status: 'spawned',
      confidence: 0,
      tasks: [],
      health: {
        cpu: 0,
        memory: 0,
        uptime: 0,
      },
      timestamp,
    };

    this.lastAgentStatuses.set(agentId, agentStatus);

    this.wsServer.emitAgentUpdate(agentId, {
      status: 'spawned',
      confidence: 0,
      tasks: [],
      health: { cpu: 0, memory: 0, uptime: 0 },
    });
  }

  /**
   * Handle agent state changed event
   */
  private handleAgentStateChangedEvent(
    agentId: string,
    eventData: any,
    timestamp: Date
  ): void {
    const lastStatus = this.lastAgentStatuses.get(agentId);
    const status = this.mapAgentState(eventData.newState);

    const agentStatus: AgentStatus = {
      agentId,
      status,
      confidence: lastStatus?.confidence || 0,
      tasks: lastStatus?.tasks || [],
      health: lastStatus?.health || { cpu: 0, memory: 0, uptime: 0 },
      timestamp,
    };

    this.lastAgentStatuses.set(agentId, agentStatus);

    this.wsServer.emitAgentUpdate(agentId, {
      status,
      confidence: agentStatus.confidence,
      tasks: agentStatus.tasks,
      health: agentStatus.health,
    });
  }

  /**
   * Handle agent terminated event
   */
  private handleAgentTerminatedEvent(
    agentId: string,
    eventData: any,
    timestamp: Date
  ): void {
    const lastStatus = this.lastAgentStatuses.get(agentId);

    this.lastAgentStatuses.delete(agentId);

    this.wsServer.emitAgentUpdate(agentId, {
      status: 'terminated',
      confidence: lastStatus?.confidence || 0,
      tasks: lastStatus?.tasks || [],
    });
  }

  /**
   * Handle agent task event
   */
  private handleAgentTaskEvent(
    agentId: string,
    eventType: string,
    eventData: any,
    timestamp: Date
  ): void {
    const lastStatus = this.lastAgentStatuses.get(agentId);
    if (!lastStatus) return;

    const tasks = lastStatus.tasks || [];

    if (eventType === 'task_assigned' && eventData.taskDescription) {
      tasks.push({
        id: `task-${Date.now()}`,
        description: eventData.taskDescription,
        status: 'in-progress',
      });
    } else if (eventType === 'task_completed' && tasks.length > 0) {
      tasks[tasks.length - 1].status = 'completed';
    }

    const agentStatus: AgentStatus = {
      ...lastStatus,
      tasks,
      timestamp,
    };

    this.lastAgentStatuses.set(agentId, agentStatus);

    this.wsServer.emitAgentUpdate(agentId, {
      status: lastStatus.status,
      confidence: lastStatus.confidence,
      tasks,
      health: lastStatus.health,
    });
  }

  /**
   * Handle agent error event
   */
  private handleAgentErrorEvent(
    agentId: string,
    eventData: any,
    timestamp: Date
  ): void {
    // Emit error event to WebSocket
    this.wsServer.emitError(null, {
      severity: 'high',
      message: eventData.errorMessage || 'Agent error occurred',
      timestamp,
      context: { agentId, ...eventData },
    });
  }

  /**
   * Handle agent status update (pause/resume/checkpoint)
   */
  private handleAgentStatusUpdate(
    agentId: string,
    eventType: string,
    eventData: any,
    timestamp: Date
  ): void {
    const lastStatus = this.lastAgentStatuses.get(agentId);
    if (!lastStatus) return;

    // Update status based on event type
    let status = lastStatus.status;
    if (eventType === 'paused') {
      status = 'paused';
    } else if (eventType === 'resumed') {
      status = 'running';
    }

    const agentStatus: AgentStatus = {
      ...lastStatus,
      status,
      timestamp,
    };

    this.lastAgentStatuses.set(agentId, agentStatus);

    this.wsServer.emitAgentUpdate(agentId, {
      status,
      confidence: lastStatus.confidence,
      tasks: lastStatus.tasks,
      health: lastStatus.health,
    });
  }

  /**
   * Map AgentState to WebSocket status string
   */
  private mapAgentState(state: AgentState): string {
    const stateMap: Record<AgentState, string> = {
      idle: 'idle',
      active: 'running',
      paused: 'paused',
      terminated: 'terminated',
      error: 'error',
      completing: 'completing',
      checkpointing: 'checkpointing',
      waiting_for_dependency: 'waiting',
    };

    return stateMap[state] || 'unknown';
  }

  /**
   * Get current agent statuses
   */
  public getAgentStatuses(): Map<string, AgentStatus> {
    return new Map(this.lastAgentStatuses);
  }

  /**
   * Clear cached statuses
   */
  public clearCache(): void {
    this.lastAgentStatuses.clear();
  }
}

export default TransparencyAdapter;
