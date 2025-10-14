/**
 * Hybrid Routing WebSocket Handler
 * Handles CFN (Collaborative Framework Network) events and agent lifecycle events
 * 
 * Event Types:
 * 1. agent:spawned - Stores worker agent information
 * 2. agent:completed - Updates status, confidence, and cost metrics
 * 3. cfn:loop3:* - Stores iteration history for loop 3 events
 * 4. cfn:loop4:decision - Stores PO (Product Owner) decisions
 * 
 * All events are broadcast to connected clients via Socket.IO
 */

import { EventEmitter } from 'events';
import type { WebSocketServer } from './SocketIOServer';
import type { 
  EventPayload, 
  AgentStatus, 
  HierarchyEvent, 
  ErrorEvent, 
  NotificationEvent 
} from './types';

// CFN Event Types
export interface CFNLoop3Event {
  phaseId: string;
  iteration: number;
  agentId: string;
  agentType: string;
  task: string;
  confidence: number;
  duration: number;
  output?: any;
  errors?: string[];
  timestamp: Date;
}

export interface CFNLoop4Decision {
  phaseId: string;
  decisionId: string;
  agentId: string;
  decisionType: 'approve' | 'reject' | 'request_changes' | 'escalate';
  rationale: string;
  criteria: {
    quality: number;
    completeness: number;
    compliance: number;
    performance: number;
  };
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface AgentSpawnedEvent {
  agentId: string;
  agentType: string;
  parentId?: string;
  swarmId?: string;
  task: string;
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    storage: number;
  };
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface AgentCompletedEvent {
  agentId: string;
  status: 'completed' | 'failed' | 'terminated';
  confidence: number;
  cost: {
    compute: number;
    storage: number;
    network: number;
    total: number;
  };
  duration: number;
  output?: any;
  errors?: string[];
  metrics?: {
    tasksCompleted: number;
    quality: number;
    efficiency: number;
  };
  timestamp: Date;
}

// In-memory storage for events (in production, this would be a database)
interface EventStorage {
  agents: Map<string, AgentSpawnedEvent>;
  agentStatus: Map<string, AgentCompletedEvent>;
  loop3History: Map<string, CFNLoop3Event[]>;
  loop4Decisions: Map<string, CFNLoop4Decision[]>;
}

export class HybridRoutingHandler extends EventEmitter {
  private wsServer: WebSocketServer;
  private storage: EventStorage;
  private eventCounts: Map<string, number> = new Map();

  constructor(wsServer: WebSocketServer) {
    super();
    this.wsServer = wsServer;
    this.storage = {
      agents: new Map(),
      agentStatus: new Map(),
      loop3History: new Map(),
      loop4Decisions: new Map()
    };
    
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for different event types
   */
  private setupEventHandlers(): void {
    // Agent lifecycle events
    this.on('agent:spawned', this.handleAgentSpawned.bind(this));
    this.on('agent:completed', this.handleAgentCompleted.bind(this));
    
    // CFN Loop 3 events
    this.on('cfn:loop3:iteration', this.handleCFNLoop3Iteration.bind(this));
    this.on('cfn:loop3:phase_complete', this.handleCFNLoop3PhaseComplete.bind(this));
    this.on('cfn:loop3:error', this.handleCFNLoop3Error.bind(this));
    
    // CFN Loop 4 events
    this.on('cfn:loop4:decision', this.handleCFNLoop4Decision.bind(this));
    this.on('cfn:loop4:escalation', this.handleCFNLoop4Escalation.bind(this));
  }

  /**
   * Handle agent:spawned event
   * Stores worker agent information and broadcasts to clients
   */
  private handleAgentSpawned(data: AgentSpawnedEvent): void {
    try {
      // Store agent information
      this.storage.agents.set(data.agentId, data);
      
      // Update event count
      this.incrementEventCount('agent:spawned');
      
      // Create agent status update for broadcasting
      const agentStatus: AgentStatus = {
        agentId: data.agentId,
        status: 'spawned',
        confidence: 0.0, // Initial confidence
        health: {
          cpu: data.resources.cpu,
          memory: data.resources.memory,
          uptime: 0
        },
        timestamp: data.timestamp
      };
      
      // Broadcast agent update to all subscribers
      this.wsServer.emitAgentUpdate(data.agentId, {
        status: 'spawned',
        health: agentStatus.health
      });
      
      // Broadcast hierarchy change if parent exists
      if (data.parentId) {
        this.wsServer.emitHierarchyChange({
          type: 'spawn',
          agentId: data.agentId,
          parentId: data.parentId,
          metadata: {
            agentType: data.agentType,
            swarmId: data.swarmId,
            task: data.task
          }
        });
      }
      
      // Send notification to clients
      this.wsServer.emitNotification({
        type: 'info',
        title: 'Agent Spawned',
        message: `Agent ${data.agentId} (${data.agentType}) has been spawned`,
        action: {
          label: 'View Agent',
          url: `/agents/${data.agentId}`
        }
      });
      
      // Log event
      console.log(`[HybridRouting] Agent spawned: ${data.agentId} (${data.agentType})`);
      
      // Emit internal event for other handlers
      this.emit('agent:stored', data);
      
    } catch (error) {
      this.handleError('agent:spawned', error, data);
    }
  }

  /**
   * Handle agent:completed event
   * Updates status, confidence, and cost metrics
   */
  private handleAgentCompleted(data: AgentCompletedEvent): void {
    try {
      // Store agent completion information
      this.storage.agentStatus.set(data.agentId, data);
      
      // Update event count
      this.incrementEventCount('agent:completed');
      
      // Create agent status update for broadcasting
      const agentStatus: AgentStatus = {
        agentId: data.agentId,
        status: data.status,
        confidence: data.confidence,
        tasks: data.metrics ? [{
          id: 'primary',
          status: data.status,
          progress: 100
        }] : undefined,
        health: {
          cpu: 0, // Agent is no longer running
          memory: 0,
          uptime: data.duration
        },
        timestamp: data.timestamp
      };
      
      // Broadcast agent update to all subscribers
      this.wsServer.emitAgentUpdate(data.agentId, {
        status: data.status,
        confidence: data.confidence,
        tasks: agentStatus.tasks,
        health: agentStatus.health
      });
      
      // Send notification based on status
      const notificationType = data.status === 'completed' ? 'success' : 
                              data.status === 'failed' ? 'error' : 'warning';
      
      this.wsServer.emitNotification({
        type: notificationType,
        title: `Agent ${data.status.charAt(0).toUpperCase() + data.status.slice(1)}`,
        message: `Agent ${data.agentId} has ${data.status} with confidence ${data.confidence.toFixed(2)}`,
        action: {
          label: 'View Details',
          url: `/agents/${data.agentId}/results`
        }
      });
      
      // Log event with cost information
      console.log(`[HybridRouting] Agent completed: ${data.agentId} - Status: ${data.status}, Confidence: ${data.confidence}, Cost: $${data.cost.total.toFixed(4)}`);
      
      // Emit internal event for analytics
      this.emit('agent:completion_stored', data);
      
    } catch (error) {
      this.handleError('agent:completed', error, data);
    }
  }

  /**
   * Handle CFN Loop 3 iteration event
   * Stores iteration history and broadcasts progress updates
   */
  private handleCFNLoop3Iteration(data: CFNLoop3Event): void {
    try {
      // Store iteration in phase history
      const phaseKey = `phase-${data.phaseId}`;
      if (!this.storage.loop3History.has(phaseKey)) {
        this.storage.loop3History.set(phaseKey, []);
      }
      
      const history = this.storage.loop3History.get(phaseKey)!;
      history.push(data);
      
      // Keep only last 100 iterations per phase
      if (history.length > 100) {
        history.splice(0, history.length - 100);
      }
      
      // Update event count
      this.incrementEventCount('cfn:loop3:iteration');
      
      // Broadcast metrics update with CFN progress
      this.wsServer.emitMetricsUpdate({
        system: {
          cpu: 0,
          memory: 0,
          disk: 0,
          network: { bytesIn: 0, bytesOut: 0 }
        },
        agents: {
          total: this.storage.agents.size,
          active: this.getActiveAgentsCount(),
          idle: 0,
          failed: this.getFailedAgentsCount()
        },
        swarms: {
          total: this.getUniqueSwarmsCount(),
          active: this.getActiveSwarmsCount()
        }
      });
      
      // Send notification for significant confidence changes
      if (data.confidence >= 0.9) {
        this.wsServer.emitNotification({
          type: 'success',
          title: 'High Confidence Achieved',
          message: `Agent ${data.agentId} achieved ${data.confidence.toFixed(2)} confidence in phase ${data.phaseId}`,
          action: {
            label: 'View Phase',
            url: `/phases/${data.phaseId}`
          }
        });
      } else if (data.confidence < 0.5 && data.iteration > 5) {
        this.wsServer.emitNotification({
          type: 'warning',
          title: 'Low Confidence Detected',
          message: `Agent ${data.agentId} has low confidence (${data.confidence.toFixed(2)}) after ${data.iteration} iterations`,
          action: {
            label: 'Review Progress',
            url: `/phases/${data.phaseId}/review`
          }
        });
      }
      
      // Log event
      console.log(`[HybridRouting] CFN Loop 3 iteration: Phase ${data.phaseId}, Agent ${data.agentId}, Iteration ${data.iteration}, Confidence ${data.confidence}`);
      
      // Emit internal event for progress tracking
      this.emit('cfn:loop3:iteration_stored', data);
      
    } catch (error) {
      this.handleError('cfn:loop3:iteration', error, data);
    }
  }

  /**
   * Handle CFN Loop 3 phase complete event
   */
  private handleCFNLoop3PhaseComplete(data: { phaseId: string; totalIterations: number; finalConfidence: number; duration: number }): void {
    try {
      // Update event count
      this.incrementEventCount('cfn:loop3:phase_complete');
      
      // Broadcast completion notification
      this.wsServer.emitNotification({
        type: 'success',
        title: 'Phase Completed',
        message: `Phase ${data.phaseId} completed with confidence ${data.finalConfidence.toFixed(2)} after ${data.totalIterations} iterations`,
        action: {
          label: 'View Results',
          url: `/phases/${data.phaseId}/results`
        }
      });
      
      // Log event
      console.log(`[HybridRouting] CFN Loop 3 phase completed: ${data.phaseId} - Confidence: ${data.finalConfidence}, Duration: ${data.duration}ms`);
      
      // Emit internal event
      this.emit('cfn:loop3:phase_completed', data);
      
    } catch (error) {
      this.handleError('cfn:loop3:phase_complete', error, data);
    }
  }

  /**
   * Handle CFN Loop 3 error event
   */
  private handleCFNLoop3Error(data: { phaseId: string; agentId: string; error: string; iteration: number }): void {
    try {
      // Update event count
      this.incrementEventCount('cfn:loop3:error');
      
      // Broadcast error to clients
      this.wsServer.emitError(null, {
        severity: 'high',
        message: `CFN Loop 3 error in phase ${data.phaseId}: ${data.error}`,
        agentId: data.agentId,
        timestamp: new Date()
      });
      
      // Send notification
      this.wsServer.emitNotification({
        type: 'error',
        title: 'CFN Loop 3 Error',
        message: `Error in phase ${data.phaseId} for agent ${data.agentId}: ${data.error}`,
        action: {
          label: 'Investigate',
          url: `/phases/${data.phaseId}/errors`
        }
      });
      
      // Log event
      console.error(`[HybridRouting] CFN Loop 3 error: Phase ${data.phaseId}, Agent ${data.agentId}, Iteration ${data.iteration} - ${data.error}`);
      
      // Emit internal event
      this.emit('cfn:loop3:error_stored', data);
      
    } catch (error) {
      this.handleError('cfn:loop3:error', error, data);
    }
  }

  /**
   * Handle CFN Loop 4 decision event
   * Stores PO decisions and broadcasts to stakeholders
   */
  private handleCFNLoop4Decision(data: CFNLoop4Decision): void {
    try {
      // Store decision in phase history
      const phaseKey = `phase-${data.phaseId}`;
      if (!this.storage.loop4Decisions.has(phaseKey)) {
        this.storage.loop4Decisions.set(phaseKey, []);
      }
      
      const decisions = this.storage.loop4Decisions.get(phaseKey)!;
      decisions.push(data);
      
      // Keep only last 50 decisions per phase
      if (decisions.length > 50) {
        decisions.splice(0, decisions.length - 50);
      }
      
      // Update event count
      this.incrementEventCount('cfn:loop4:decision');
      
      // Determine notification type based on decision
      const notificationType = data.decisionType === 'approve' ? 'success' :
                              data.decisionType === 'reject' ? 'error' :
                              data.decisionType === 'escalate' ? 'error' : 'warning';
      
      // Broadcast decision notification
      this.wsServer.emitNotification({
        type: notificationType,
        title: `PO Decision: ${data.decisionType.toUpperCase()}`,
        message: `Product Owner ${data.decisionType} decision for phase ${data.phaseId} (agent ${data.agentId})`,
        action: {
          label: 'View Decision',
          url: `/phases/${data.phaseId}/decisions/${data.decisionId}`
        }
      });
      
      // Log event with criteria scores
      console.log(`[HybridRouting] CFN Loop 4 decision: Phase ${data.phaseId}, Agent ${data.agentId}, Decision: ${data.decisionType}`);
      console.log(`  Criteria - Quality: ${data.criteria.quality}, Completeness: ${data.criteria.completeness}, Compliance: ${data.criteria.compliance}, Performance: ${data.criteria.performance}`);
      console.log(`  Rationale: ${data.rationale}`);
      
      // Emit internal event for decision tracking
      this.emit('cfn:loop4:decision_stored', data);
      
    } catch (error) {
      this.handleError('cfn:loop4:decision', error, data);
    }
  }

  /**
   * Handle CFN Loop 4 escalation event
   */
  private handleCFNLoop4Escalation(data: { phaseId: string; agentId: string; reason: string; escalatedTo: string }): void {
    try {
      // Update event count
      this.incrementEventCount('cfn:loop4:escalation');
      
      // Broadcast escalation notification
      this.wsServer.emitNotification({
        type: 'error',
        title: 'CFN Loop 4 Escalation',
        message: `Phase ${data.phaseId} escalated to ${data.escalatedTo}: ${data.reason}`,
        action: {
          label: 'Review Escalation',
          url: `/phases/${data.phaseId}/escalations`
        }
      });
      
      // Log event
      console.warn(`[HybridRouting] CFN Loop 4 escalation: Phase ${data.phaseId}, Agent ${data.agentId} escalated to ${data.escalatedTo} - ${data.reason}`);
      
      // Emit internal event
      this.emit('cfn:loop4:escalation_stored', data);
      
    } catch (error) {
      this.handleError('cfn:loop4:escalation', error, data);
    }
  }

  /**
   * Handle errors in event processing
   */
  private handleError(eventType: string, error: any, data?: any): void {
    console.error(`[HybridRouting] Error processing ${eventType}:`, error);
    
    // Broadcast error to clients
    this.wsServer.emitError(null, {
      severity: 'high',
      message: `Error processing ${eventType}: ${error.message}`,
      stack: error.stack,
      timestamp: new Date()
    });
    
    // Emit internal error event
    this.emit('error', { eventType, error, data });
  }

  /**
   * Increment event count for monitoring
   */
  private incrementEventCount(eventType: string): void {
    const current = this.eventCounts.get(eventType) || 0;
    this.eventCounts.set(eventType, current + 1);
  }

  /**
   * Get count of active agents
   */
  private getActiveAgentsCount(): number {
    let count = 0;
    for (const [agentId, status] of this.storage.agentStatus) {
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'terminated') {
        continue;
      }
      count++;
    }
    return count;
  }

  /**
   * Get count of failed agents
   */
  private getFailedAgentsCount(): number {
    let count = 0;
    for (const status of this.storage.agentStatus.values()) {
      if (status.status === 'failed') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of unique swarms
   */
  private getUniqueSwarmsCount(): number {
    const swarms = new Set();
    for (const agent of this.storage.agents.values()) {
      if (agent.swarmId) {
        swarms.add(agent.swarmId);
      }
    }
    return swarms.size;
  }

  /**
   * Get count of active swarms
   */
  private getActiveSwarmsCount(): number {
    // This is a simplified implementation
    // In practice, you'd track swarm activity more carefully
    return this.getUniqueSwarmsCount();
  }

  /**
   * Public method to trigger agent:spawned event
   */
  public agentSpawned(data: AgentSpawnedEvent): void {
    this.emit('agent:spawned', data);
  }

  /**
   * Public method to trigger agent:completed event
   */
  public agentCompleted(data: AgentCompletedEvent): void {
    this.emit('agent:completed', data);
  }

  /**
   * Public method to trigger CFN Loop 3 iteration event
   */
  public cfnLoop3Iteration(data: CFNLoop3Event): void {
    this.emit('cfn:loop3:iteration', data);
  }

  /**
   * Public method to trigger CFN Loop 3 phase complete event
   */
  public cfnLoop3PhaseComplete(data: { phaseId: string; totalIterations: number; finalConfidence: number; duration: number }): void {
    this.emit('cfn:loop3:phase_complete', data);
  }

  /**
   * Public method to trigger CFN Loop 3 error event
   */
  public cfnLoop3Error(data: { phaseId: string; agentId: string; error: string; iteration: number }): void {
    this.emit('cfn:loop3:error', data);
  }

  /**
   * Public method to trigger CFN Loop 4 decision event
   */
  public cfnLoop4Decision(data: CFNLoop4Decision): void {
    this.emit('cfn:loop4:decision', data);
  }

  /**
   * Public method to trigger CFN Loop 4 escalation event
   */
  public cfnLoop4Escalation(data: { phaseId: string; agentId: string; reason: string; escalatedTo: string }): void {
    this.emit('cfn:loop4:escalation', data);
  }

  /**
   * Get stored agent information
   */
  public getAgent(agentId: string): AgentSpawnedEvent | undefined {
    return this.storage.agents.get(agentId);
  }

  /**
   * Get agent completion status
   */
  public getAgentStatus(agentId: string): AgentCompletedEvent | undefined {
    return this.storage.agentStatus.get(agentId);
  }

  /**
   * Get CFN Loop 3 history for a phase
   */
  public getLoop3History(phaseId: string): CFNLoop3Event[] {
    return this.storage.loop3History.get(`phase-${phaseId}`) || [];
  }

  /**
   * Get CFN Loop 4 decisions for a phase
   */
  public getLoop4Decisions(phaseId: string): CFNLoop4Decision[] {
    return this.storage.loop4Decisions.get(`phase-${phaseId}`) || [];
  }

  /**
   * Get event statistics
   */
  public getEventStats(): Record<string, number> {
    return Object.fromEntries(this.eventCounts);
  }

  /**
   * Clear stored data (for testing or reset)
   */
  public clearStorage(): void {
    this.storage.agents.clear();
    this.storage.agentStatus.clear();
    this.storage.loop3History.clear();
    this.storage.loop4Decisions.clear();
    this.eventCounts.clear();
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): {
    agents: number;
    agentStatus: number;
    loop3Phases: number;
    loop4Phases: number;
    totalEvents: number;
  } {
    return {
      agents: this.storage.agents.size,
      agentStatus: this.storage.agentStatus.size,
      loop3Phases: this.storage.loop3History.size,
      loop4Phases: this.storage.loop4Decisions.size,
      totalEvents: Array.from(this.eventCounts.values()).reduce((sum, count) => sum + count, 0)
    };
  }
}

export default HybridRoutingHandler;