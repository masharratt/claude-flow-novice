/**
 * WebSocket Manager - Real-time communication for swarm transparency
 * Integrates with Claude Flow and ruv-swarm MCP systems
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { ILogger } from '../../core/logger.js';

export interface WebSocketEvent {
  type:
    | 'agent-message'
    | 'status-change'
    | 'human-intervention'
    | 'transparency-insight'
    | 'swarm-event';
  data: any;
  swarmId?: string;
  agentId?: string;
  timestamp: string;
}

export interface ClientConnection {
  socketId: string;
  userId?: string;
  joinedSwarms: Set<string>;
  filters?: any;
  lastActivity: string;
}

export class WebSocketManager {
  private connections = new Map<string, ClientConnection>();
  private swarmSubscriptions = new Map<string, Set<string>>(); // swarmId -> socketIds

  constructor(
    private io: SocketIOServer,
    private logger: ILogger,
  ) {
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleNewConnection(socket);

      socket.on('join-swarm', (data: { swarmId: string; userId?: string }) => {
        this.handleJoinSwarm(socket, data);
      });

      socket.on('leave-swarm', (data: { swarmId: string }) => {
        this.handleLeaveSwarm(socket, data);
      });

      socket.on('send-intervention', (data: any) => {
        this.handleHumanIntervention(socket, data);
      });

      socket.on('request-status', (data: { swarmId?: string; agentId?: string }) => {
        this.handleStatusRequest(socket, data);
      });

      socket.on('set-filter', (filterConfig: any) => {
        this.handleFilterUpdate(socket, filterConfig);
      });

      // Claude Flow MCP integration events
      socket.on('claude-flow-command', (data: any) => {
        this.handleClaudeFlowCommand(socket, data);
      });

      // ruv-swarm MCP integration events
      socket.on('ruv-swarm-command', (data: any) => {
        this.handleRuvSwarmCommand(socket, data);
      });

      socket.on('disconnect', () => {
        this.handleDisconnection(socket);
      });
    });
  }

  private handleNewConnection(socket: Socket): void {
    const connection: ClientConnection = {
      socketId: socket.id,
      joinedSwarms: new Set(),
      lastActivity: new Date().toISOString(),
    };

    this.connections.set(socket.id, connection);

    this.logger.info('WebSocket client connected', {
      socketId: socket.id,
      clientsCount: this.connections.size,
    });

    // Send initial connection success
    socket.emit('connected', {
      socketId: socket.id,
      serverTime: new Date().toISOString(),
      supportedEvents: [
        'agent-message',
        'status-change',
        'human-intervention',
        'transparency-insight',
        'claude-flow-event',
        'ruv-swarm-event',
      ],
    });
  }

  private handleJoinSwarm(socket: Socket, data: { swarmId: string; userId?: string }): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    connection.joinedSwarms.add(data.swarmId);
    connection.userId = data.userId;
    connection.lastActivity = new Date().toISOString();

    // Add to swarm subscriptions
    if (!this.swarmSubscriptions.has(data.swarmId)) {
      this.swarmSubscriptions.set(data.swarmId, new Set());
    }
    this.swarmSubscriptions.get(data.swarmId)!.add(socket.id);

    // Join Socket.IO room
    socket.join(`swarm-${data.swarmId}`);

    this.logger.info('Client joined swarm', {
      socketId: socket.id,
      swarmId: data.swarmId,
      userId: data.userId,
    });

    // Send join confirmation with current swarm state
    socket.emit('swarm-joined', {
      swarmId: data.swarmId,
      timestamp: new Date().toISOString(),
      subscribersCount: this.swarmSubscriptions.get(data.swarmId)!.size,
    });

    // Request initial swarm data using MCP integration
    this.requestSwarmStatusFromMCP(data.swarmId, socket);
  }

  private handleLeaveSwarm(socket: Socket, data: { swarmId: string }): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    connection.joinedSwarms.delete(data.swarmId);

    // Remove from swarm subscriptions
    const swarmSubs = this.swarmSubscriptions.get(data.swarmId);
    if (swarmSubs) {
      swarmSubs.delete(socket.id);
      if (swarmSubs.size === 0) {
        this.swarmSubscriptions.delete(data.swarmId);
      }
    }

    // Leave Socket.IO room
    socket.leave(`swarm-${data.swarmId}`);

    this.logger.info('Client left swarm', {
      socketId: socket.id,
      swarmId: data.swarmId,
    });

    socket.emit('swarm-left', {
      swarmId: data.swarmId,
      timestamp: new Date().toISOString(),
    });
  }

  private async handleHumanIntervention(
    socket: Socket,
    data: {
      swarmId: string;
      agentId?: string;
      message: string;
      action: string;
      metadata?: any;
    },
  ): Promise<void> {
    try {
      this.logger.info('Human intervention received', {
        socketId: socket.id,
        swarmId: data.swarmId,
        agentId: data.agentId,
        action: data.action,
      });

      // Forward intervention to Claude Flow MCP
      await this.forwardInterventionToClaudeFlow(data, socket);

      // Broadcast intervention to other clients in the swarm
      socket.to(`swarm-${data.swarmId}`).emit('human-intervention', {
        ...data,
        fromClient: socket.id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling human intervention', {
        error: error.message,
        socketId: socket.id,
        swarmId: data.swarmId,
      });

      socket.emit('intervention-error', {
        error: 'Failed to process intervention',
        originalData: data,
      });
    }
  }

  private handleStatusRequest(socket: Socket, data: { swarmId?: string; agentId?: string }): void {
    // Request status from MCP systems
    if (data.swarmId) {
      this.requestSwarmStatusFromMCP(data.swarmId, socket);
    }

    if (data.agentId) {
      this.requestAgentStatusFromMCP(data.agentId, socket);
    }
  }

  private handleFilterUpdate(socket: Socket, filterConfig: any): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    connection.filters = filterConfig;
    connection.lastActivity = new Date().toISOString();

    socket.emit('filter-updated', {
      status: 'success',
      filterConfig,
    });
  }

  private async handleClaudeFlowCommand(
    socket: Socket,
    data: {
      command: string;
      params?: any;
      swarmId?: string;
    },
  ): Promise<void> {
    try {
      this.logger.info('Claude Flow MCP command received', {
        socketId: socket.id,
        command: data.command,
        swarmId: data.swarmId,
      });

      // Execute Claude Flow MCP command
      const result = await this.executeClaudeFlowMCPCommand(data.command, data.params);

      socket.emit('claude-flow-response', {
        command: data.command,
        result,
        timestamp: new Date().toISOString(),
      });

      // If it's a swarm-related command, broadcast to swarm room
      if (data.swarmId) {
        socket.to(`swarm-${data.swarmId}`).emit('claude-flow-event', {
          command: data.command,
          result,
          fromClient: socket.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('Claude Flow MCP command error', {
        error: error.message,
        command: data.command,
      });

      socket.emit('claude-flow-error', {
        command: data.command,
        error: error.message,
      });
    }
  }

  private async handleRuvSwarmCommand(
    socket: Socket,
    data: {
      command: string;
      params?: any;
      swarmId?: string;
    },
  ): Promise<void> {
    try {
      this.logger.info('ruv-swarm MCP command received', {
        socketId: socket.id,
        command: data.command,
        swarmId: data.swarmId,
      });

      // Execute ruv-swarm MCP command
      const result = await this.executeRuvSwarmMCPCommand(data.command, data.params);

      socket.emit('ruv-swarm-response', {
        command: data.command,
        result,
        timestamp: new Date().toISOString(),
      });

      // If it's a swarm-related command, broadcast to swarm room
      if (data.swarmId) {
        socket.to(`swarm-${data.swarmId}`).emit('ruv-swarm-event', {
          command: data.command,
          result,
          fromClient: socket.id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('ruv-swarm MCP command error', {
        error: error.message,
        command: data.command,
      });

      socket.emit('ruv-swarm-error', {
        command: data.command,
        error: error.message,
      });
    }
  }

  private handleDisconnection(socket: Socket): void {
    const connection = this.connections.get(socket.id);
    if (!connection) return;

    // Remove from all swarm subscriptions
    for (const swarmId of connection.joinedSwarms) {
      const swarmSubs = this.swarmSubscriptions.get(swarmId);
      if (swarmSubs) {
        swarmSubs.delete(socket.id);
        if (swarmSubs.size === 0) {
          this.swarmSubscriptions.delete(swarmId);
        }
      }
    }

    this.connections.delete(socket.id);

    this.logger.info('WebSocket client disconnected', {
      socketId: socket.id,
      clientsCount: this.connections.size,
    });
  }

  /**
   * Broadcast event to all clients in a swarm
   */
  public broadcastToSwarm(swarmId: string, event: WebSocketEvent): void {
    this.io.to(`swarm-${swarmId}`).emit(event.type, {
      ...event.data,
      timestamp: event.timestamp,
      swarmId,
      agentId: event.agentId,
    });

    this.logger.debug('Event broadcast to swarm', {
      swarmId,
      eventType: event.type,
      subscribersCount: this.swarmSubscriptions.get(swarmId)?.size || 0,
    });
  }

  /**
   * Send event to specific client
   */
  public sendToClient(socketId: string, event: WebSocketEvent): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event.type, {
        ...event.data,
        timestamp: event.timestamp,
      });
    }
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    totalConnections: number;
    activeSwarms: number;
    averageSubscriptionsPerSwarm: number;
  } {
    const activeSwarms = this.swarmSubscriptions.size;
    const totalSubscriptions = Array.from(this.swarmSubscriptions.values()).reduce(
      (sum, subs) => sum + subs.size,
      0,
    );

    return {
      totalConnections: this.connections.size,
      activeSwarms,
      averageSubscriptionsPerSwarm: activeSwarms > 0 ? totalSubscriptions / activeSwarms : 0,
    };
  }

  /**
   * Request swarm status from Claude Flow MCP
   */
  private async requestSwarmStatusFromMCP(swarmId: string, socket: Socket): Promise<void> {
    try {
      // Use Claude Flow MCP to get swarm status
      const swarmStatus = await this.executeClaudeFlowMCPCommand('swarm_status', { swarmId });

      socket.emit('swarm-status', {
        swarmId,
        status: swarmStatus,
        source: 'claude-flow-mcp',
        timestamp: new Date().toISOString(),
      });

      // Also try ruv-swarm MCP for additional metrics
      try {
        const ruvSwarmStatus = await this.executeRuvSwarmMCPCommand('swarm_status', {
          verbose: true,
        });
        socket.emit('ruv-swarm-status', {
          swarmId,
          status: ruvSwarmStatus,
          source: 'ruv-swarm-mcp',
          timestamp: new Date().toISOString(),
        });
      } catch (ruvError) {
        // ruv-swarm might not be available, that's okay
        this.logger.debug('ruv-swarm MCP not available for status', { swarmId });
      }
    } catch (error) {
      this.logger.error('Error requesting swarm status from MCP', {
        error: error.message,
        swarmId,
      });

      socket.emit('status-error', {
        swarmId,
        error: 'Failed to fetch swarm status',
      });
    }
  }

  /**
   * Request agent status from MCP systems
   */
  private async requestAgentStatusFromMCP(agentId: string, socket: Socket): Promise<void> {
    try {
      // Try both MCP systems for comprehensive agent data
      const [claudeFlowResult, ruvSwarmResult] = await Promise.allSettled([
        this.executeClaudeFlowMCPCommand('agent_list', { filter: 'all' }),
        this.executeRuvSwarmMCPCommand('agent_list', { filter: 'all' }),
      ]);

      const responses: any = { agentId, timestamp: new Date().toISOString() };

      if (claudeFlowResult.status === 'fulfilled') {
        responses.claudeFlowData = claudeFlowResult.value;
      }

      if (ruvSwarmResult.status === 'fulfilled') {
        responses.ruvSwarmData = ruvSwarmResult.value;
      }

      socket.emit('agent-status', responses);
    } catch (error) {
      this.logger.error('Error requesting agent status from MCP', {
        error: error.message,
        agentId,
      });

      socket.emit('agent-status-error', {
        agentId,
        error: 'Failed to fetch agent status',
      });
    }
  }

  /**
   * Forward human intervention to Claude Flow MCP
   */
  private async forwardInterventionToClaudeFlow(intervention: any, socket: Socket): Promise<void> {
    try {
      // Use task orchestration to send human message
      const result = await this.executeClaudeFlowMCPCommand('task_orchestrate', {
        task: `Human intervention: ${intervention.message}`,
        strategy: 'adaptive',
        priority: 'high',
        metadata: {
          humanIntervention: true,
          action: intervention.action,
          targetAgent: intervention.agentId,
          ...intervention.metadata,
        },
      });

      socket.emit('intervention-forwarded', {
        interventionId: result.taskId || 'unknown',
        status: 'sent',
        mcpResponse: result,
      });
    } catch (error) {
      throw new Error(`Failed to forward intervention to Claude Flow MCP: ${error.message}`);
    }
  }

  /**
   * Execute Claude Flow MCP command
   */
  private async executeClaudeFlowMCPCommand(command: string, params?: any): Promise<any> {
    // This would integrate with the actual MCP system
    // For now, we'll simulate the integration
    this.logger.debug('Executing Claude Flow MCP command', { command, params });

    // Simulate MCP commands that would be available
    switch (command) {
      case 'swarm_status':
        return {
          swarmId: params?.swarmId || 'unknown',
          status: 'active',
          agents: 3,
          tasks: { active: 2, completed: 5, failed: 0 },
        };

      case 'agent_list':
        return {
          agents: [
            { id: 'researcher-1', type: 'researcher', status: 'active' },
            { id: 'coder-1', type: 'coder', status: 'working' },
            { id: 'reviewer-1', type: 'reviewer', status: 'idle' },
          ],
        };

      case 'task_orchestrate':
        return {
          taskId: `task_${Date.now()}`,
          status: 'queued',
          priority: params?.priority || 'medium',
          strategy: params?.strategy || 'adaptive',
        };

      default:
        throw new Error(`Unknown Claude Flow MCP command: ${command}`);
    }
  }

  /**
   * Execute ruv-swarm MCP command
   */
  private async executeRuvSwarmMCPCommand(command: string, params?: any): Promise<any> {
    // This would integrate with the actual ruv-swarm MCP system
    this.logger.debug('Executing ruv-swarm MCP command', { command, params });

    // Simulate ruv-swarm MCP commands
    switch (command) {
      case 'swarm_status':
        return {
          topology: 'mesh',
          agents: 3,
          performance: { efficiency: 87.5 },
          memory: { usage: '45MB' },
        };

      case 'agent_list':
        return {
          agents: [
            { id: 'agent-001', capabilities: ['research', 'analysis'] },
            { id: 'agent-002', capabilities: ['coding', 'testing'] },
            { id: 'agent-003', capabilities: ['review', 'optimization'] },
          ],
        };

      default:
        throw new Error(`Unknown ruv-swarm MCP command: ${command}`);
    }
  }

  /**
   * Get active swarm connections
   */
  public getActiveSwarms(): string[] {
    return Array.from(this.swarmSubscriptions.keys());
  }

  /**
   * Get clients connected to a specific swarm
   */
  public getSwarmClients(swarmId: string): string[] {
    return Array.from(this.swarmSubscriptions.get(swarmId) || []);
  }
}
