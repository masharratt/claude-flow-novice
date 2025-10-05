/**
 * WebSocket Manager - Real-time communication for swarm transparency
 * Integrates with Claude Flow and ruv-swarm MCP systems
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { ILogger } from '../../core/logger.js';

// Message validation schemas
interface MessageSchema {
  type: string;
  required: string[];
  validate: (data: any) => boolean;
}

interface RateLimitEntry {
  count: number;
  lastReset: number;
}

const MESSAGE_SCHEMAS: Record<string, MessageSchema> = {
  'join-swarm': {
    type: 'join-swarm',
    required: ['swarmId'],
    validate: (data: any) => {
      return typeof data.swarmId === 'string' &&
             data.swarmId.length > 0 && data.swarmId.length <= 100 &&
             (!data.userId || (typeof data.userId === 'string' && data.userId.length <= 100));
    }
  },
  'leave-swarm': {
    type: 'leave-swarm',
    required: ['swarmId'],
    validate: (data: any) => {
      return typeof data.swarmId === 'string' &&
             data.swarmId.length > 0 && data.swarmId.length <= 100;
    }
  },
  'send-intervention': {
    type: 'send-intervention',
    required: ['swarmId', 'message', 'action'],
    validate: (data: any) => {
      return typeof data.swarmId === 'string' && data.swarmId.length > 0 && data.swarmId.length <= 100 &&
             typeof data.message === 'string' && data.message.length > 0 && data.message.length <= 5000 &&
             typeof data.action === 'string' && data.action.length > 0 && data.action.length <= 100 &&
             (!data.agentId || (typeof data.agentId === 'string' && data.agentId.length <= 100));
    }
  },
  'request-status': {
    type: 'request-status',
    required: [],
    validate: (data: any) => {
      return (!data.swarmId || (typeof data.swarmId === 'string' && data.swarmId.length <= 100)) &&
             (!data.agentId || (typeof data.agentId === 'string' && data.agentId.length <= 100));
    }
  },
  'set-filter': {
    type: 'set-filter',
    required: [],
    validate: (data: any) => {
      // Allow any JSON object but limit size
      return JSON.stringify(data).length <= 10000;
    }
  },
  'claude-flow-command': {
    type: 'claude-flow-command',
    required: ['command'],
    validate: (data: any) => {
      const allowedCommands = ['swarm_status', 'agent_list', 'task_orchestrate', 'swarm_init', 'memory_usage'];
      return typeof data.command === 'string' &&
             allowedCommands.includes(data.command) &&
             (!data.swarmId || (typeof data.swarmId === 'string' && data.swarmId.length <= 100));
    }
  },
  'ruv-swarm-command': {
    type: 'ruv-swarm-command',
    required: ['command'],
    validate: (data: any) => {
      const allowedCommands = ['swarm_status', 'agent_list', 'swarm_monitor', 'performance_report'];
      return typeof data.command === 'string' &&
             allowedCommands.includes(data.command) &&
             (!data.swarmId || (typeof data.swarmId === 'string' && data.swarmId.length <= 100));
    }
  }
};

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
  private rateLimiting = new Map<string, RateLimitEntry>(); // socketId -> rate limit data
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute
  private readonly ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://localhost:3000',
    'https://localhost:3001',
    // Add your production domains here
  ];

  constructor(
    private io: SocketIOServer,
    private logger: ILogger,
  ) {
    this.setupSecurityMiddleware();
    this.setupSocketHandlers();
  }

  private setupSecurityMiddleware(): void {
  // Add origin validation middleware
  this.io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;

    if (!origin) {
      this.logger.warn('WebSocket connection rejected: No origin header', {
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      return next(new Error('Origin header required'));
    }

    if (!this.ALLOWED_ORIGINS.includes(origin)) {
      this.logger.warn('WebSocket connection rejected: Invalid origin', {
        socketId: socket.id,
        origin,
        ip: socket.handshake.address,
      });
      return next(new Error('Origin not allowed'));
    }

    next();
  });
}

private validateMessage(messageType: string, data: any): boolean {
  const schema = MESSAGE_SCHEMAS[messageType];
  if (!schema) {
    this.logger.warn('Unknown message type', { messageType });
    return false;
  }

  // Check required fields
  for (const field of schema.required) {
    if (!(field in data)) {
      this.logger.warn('Missing required field', { messageType, field });
      return false;
    }
  }

  // Run custom validation
  if (!schema.validate(data)) {
    this.logger.warn('Message validation failed', { messageType, data });
    return false;
  }

  return true;
}

private checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const rateLimitEntry = this.rateLimiting.get(socketId);

  if (!rateLimitEntry) {
    this.rateLimiting.set(socketId, { count: 1, lastReset: now });
    return true;
  }

  // Reset counter if window has expired
  if (now - rateLimitEntry.lastReset > this.RATE_LIMIT_WINDOW) {
    this.rateLimiting.set(socketId, { count: 1, lastReset: now });
    return true;
  }

  // Check if rate limit exceeded
  if (rateLimitEntry.count >= this.RATE_LIMIT_MAX_REQUESTS) {
    this.logger.warn('Rate limit exceeded', {
      socketId,
      count: rateLimitEntry.count,
      window: this.RATE_LIMIT_WINDOW,
    });
    return false;
  }

  // Increment counter
  rateLimitEntry.count++;
  return true;
}

private setupSocketHandlers(): void {
  this.io.on('connection', (socket: Socket) => {
    this.handleNewConnection(socket);

    socket.on('join-swarm', (data: { swarmId: string; userId?: string }) => {
      if (!this.checkRateLimit(socket.id)) {
        socket.emit('error', { message: 'Rate limit exceeded' });
        return;
      }
      if (!this.validateMessage('join-swarm', data)) {
        socket.emit('error', { message: 'Invalid message format' });
        return;
      }
      this.handleJoinSwarm(socket, data);
    });

      socket.on('leave-swarm', (data: { swarmId: string }) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('leave-swarm', data)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
        this.handleLeaveSwarm(socket, data);
      });

      socket.on('send-intervention', (data: any) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('send-intervention', data)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
        this.handleHumanIntervention(socket, data);
      });

      socket.on('request-status', (data: { swarmId?: string; agentId?: string }) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('request-status', data)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
        this.handleStatusRequest(socket, data);
      });

      socket.on('set-filter', (filterConfig: any) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('set-filter', filterConfig)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
        this.handleFilterUpdate(socket, filterConfig);
      });

      // Claude Flow MCP integration events
      socket.on('claude-flow-command', (data: any) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('claude-flow-command', data)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
        this.handleClaudeFlowCommand(socket, data);
      });

      // ruv-swarm MCP integration events
      socket.on('ruv-swarm-command', (data: any) => {
        if (!this.checkRateLimit(socket.id)) {
          socket.emit('error', { message: 'Rate limit exceeded' });
          return;
        }
        if (!this.validateMessage('ruv-swarm-command', data)) {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }
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

    // Clean up rate limiting data
    this.rateLimiting.delete(socket.id);

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
