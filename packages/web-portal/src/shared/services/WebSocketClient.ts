/**
 * Unified WebSocket Client Service
 * Consolidates 5 fragmented WebSocket implementations into a single service
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Event subscription system with TypeScript types
 * - Connection state management
 * - Error handling and logging
 * - Room-based event routing
 * - Message queuing during disconnection
 * - DevTools integration
 * - Memory leak prevention
 */

import { io, Socket } from 'socket.io-client';
import { ConnectionState } from '../types/websocket';
import type {
  WebSocketClientConfig,
  ConnectionStatus,
  WebSocketMessage,
  EventSubscription,
  SubscriptionOptions,
  QueuedMessage,
  ConnectionMetrics,
  WebSocketError,
  EventHandler,
  UnsubscribeFunction,
  DevToolsEvent
} from '../types/websocket';

export class WebSocketClient {
  private socket: Socket | null = null;
  private config: Required<WebSocketClientConfig>;
  private status: ConnectionStatus;
  private subscriptions: Map<string, Set<EventSubscription>> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private reconnectTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private lastPongTime: number = Date.now();
  private subscriptionIdCounter: number = 0;
  private metrics: ConnectionMetrics;
  private devToolsEnabled: boolean = false;
  private devToolsEvents: DevToolsEvent[] = [];

  constructor(config: WebSocketClientConfig = {}) {
    this.config = this.normalizeConfig(config);
    this.status = {
      state: ConnectionState.DISCONNECTED,
      connected: false,
      reconnectAttempts: 0
    };
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      averageLatency: 0,
      uptime: 0,
      reconnections: 0,
      errors: 0
    };

    // Don't autoConnect in test environment (Vitest sets NODE_ENV=test)
    const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
    if (this.config.autoConnect && !isTestEnv) {
      this.connect();
    }
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: WebSocketClientConfig): Required<WebSocketClientConfig> {
    return {
      url: config.url || '', // Will be resolved lazily in getWebSocketURL()
      autoConnect: config.autoConnect !== false,
      reconnectAttempts: config.reconnectAttempts ?? 10,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      reconnectBackoffMultiplier: config.reconnectBackoffMultiplier ?? 2,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      connectionTimeout: config.connectionTimeout ?? 10000,
      messageQueueSize: config.messageQueueSize ?? 100,
      debug: config.debug ?? false,
      onConnect: config.onConnect ?? (() => {}),
      onDisconnect: config.onDisconnect ?? (() => {}),
      onError: config.onError ?? (() => {}),
      onMessage: config.onMessage ?? (() => {}),
      onReconnecting: config.onReconnecting ?? (() => {}),
      onReconnectFailed: config.onReconnectFailed ?? (() => {})
    };
  }

  /**
   * Lazily resolve WebSocket URL to avoid accessing window.location during module initialization
   */
  private getWebSocketURL(): string {
    if (this.config.url) {
      return this.config.url;
    }
    // Default: infer from window.location (only accessed when needed)
    try {
      return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
    } catch {
      // Fallback for test environments without window.location
      return 'ws://localhost:3000';
    }
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): void {
    if (this.status.state === ConnectionState.CONNECTED || this.status.state === ConnectionState.CONNECTING) {
      this.log('Already connected or connecting');
      return;
    }

    this.updateStatus(ConnectionState.CONNECTING);

    try {
      const url = this.getWebSocketURL();
      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        timeout: this.config.connectionTimeout,
        forceNew: false,
        reconnection: false // We handle reconnection manually
      });

      this.setupSocketListeners();
    } catch (error) {
      this.handleError(this.createError(error, 'connection'));
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.clearReconnectTimeout();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.updateStatus(ConnectionState.DISCONNECTED);
    this.messageQueue = [];
  }

  /**
   * Reconnect to WebSocket server
   */
  public reconnect(): void {
    this.disconnect();
    setTimeout(() => this.connect(), 100);
  }

  /**
   * Send a message through the WebSocket
   */
  public sendMessage(type: string, payload: any): void {
    const message: WebSocketMessage = {
      type: type as any,
      timestamp: new Date(),
      payload
    };

    if (!this.socket || !this.status.connected) {
      this.queueMessage(message);
      this.log('Message queued (not connected)', message);
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.socket.emit('message', message);

      this.metrics.messagesSent++;
      this.metrics.bytesSent += messageStr.length;

      this.emitDevToolsEvent({
        timestamp: new Date(),
        type: 'message',
        direction: 'out',
        data: message
      });

      this.log('Message sent', message);
    } catch (error) {
      this.handleError(this.createError(error, 'message'));
    }
  }

  /**
   * Subscribe to an event
   */
  public subscribe<T = any>(
    event: string,
    callback: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): UnsubscribeFunction {
    const subscription: EventSubscription = {
      id: `sub_${this.subscriptionIdCounter++}`,
      event,
      callback,
      options,
      unsubscribe: () => this.unsubscribe(event, callback)
    };

    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }

    this.subscriptions.get(event)!.add(subscription);

    this.emitDevToolsEvent({
      timestamp: new Date(),
      type: 'subscription',
      direction: 'in',
      data: { event, subscriptionId: subscription.id }
    });

    this.log(`Subscribed to ${event}`, { subscriptionId: subscription.id });

    return subscription.unsubscribe;
  }

  /**
   * Unsubscribe from an event
   */
  public unsubscribe(event: string, callback?: EventHandler): void {
    const subscriptions = this.subscriptions.get(event);
    if (!subscriptions) return;

    if (callback) {
      for (const sub of subscriptions) {
        if (sub.callback === callback) {
          subscriptions.delete(sub);
          this.log(`Unsubscribed from ${event}`, { subscriptionId: sub.id });
        }
      }
    } else {
      subscriptions.clear();
      this.log(`Unsubscribed all from ${event}`);
    }

    if (subscriptions.size === 0) {
      this.subscriptions.delete(event);
    }
  }

  /**
   * Join a room for targeted event routing
   */
  public joinRoom(room: string): void {
    if (this.socket && this.status.connected) {
      this.socket.emit('join-room', room);
      this.log(`Joined room: ${room}`);
    }
  }

  /**
   * Leave a room
   */
  public leaveRoom(room: string): void {
    if (this.socket && this.status.connected) {
      this.socket.emit('leave-room', room);
      this.log(`Left room: ${room}`);
    }
  }

  /**
   * Get current connection status
   */
  public getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  /**
   * Get connection metrics
   */
  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Enable DevTools integration
   */
  public enableDevTools(): void {
    this.devToolsEnabled = true;
    this.log('DevTools integration enabled');
  }

  /**
   * Disable DevTools integration
   */
  public disableDevTools(): void {
    this.devToolsEnabled = false;
    this.devToolsEvents = [];
    this.log('DevTools integration disabled');
  }

  /**
   * Get DevTools events
   */
  public getDevToolsEvents(): DevToolsEvent[] {
    return [...this.devToolsEvents];
  }

  /**
   * Setup socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Connection established
    this.socket.on('connect', () => {
      this.updateStatus(ConnectionState.CONNECTED);
      this.status.lastConnected = new Date();
      this.status.reconnectAttempts = 0;

      this.config.onConnect();
      this.startHeartbeat();
      this.processMessageQueue();

      this.log('Connected to WebSocket server');
    });

    // Connection lost
    this.socket.on('disconnect', (reason) => {
      this.updateStatus(ConnectionState.DISCONNECTED);
      this.stopHeartbeat();

      this.config.onDisconnect(reason);

      // Auto-reconnect if not a clean disconnect
      if (reason !== 'io client disconnect' && this.status.reconnectAttempts < this.config.reconnectAttempts) {
        this.attemptReconnect();
      }

      this.log('Disconnected from WebSocket server', { reason });
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      this.handleError(this.createError(error, 'connection'));
    });

    // Handle generic messages
    this.socket.on('message', (data: WebSocketMessage) => {
      this.handleMessage(data);
    });

    // Handle specific event types from all 5 implementations
    const eventTypes = [
      'agent_update',
      'hierarchy_change',
      'metrics_update',
      'event_stream',
      'error',
      'mcp-status',
      'swarm-metrics',
      'agents-update',
      'tasks-update',
      'initial-data',
      'connection-established',
      'full-sync',
      'swarm-switched',
      'swarm-data-update',
      'notification'
    ];

    eventTypes.forEach(eventType => {
      this.socket!.on(eventType, (data) => {
        const message: WebSocketMessage = {
          type: eventType as any,
          timestamp: new Date(),
          payload: data
        };
        this.handleMessage(message);
      });
    });

    // Heartbeat response
    this.socket.on('pong', () => {
      this.lastPongTime = Date.now();
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    try {
      this.status.lastMessage = new Date();
      this.metrics.messagesReceived++;

      const messageStr = JSON.stringify(message);
      this.metrics.bytesReceived += messageStr.length;

      this.emitDevToolsEvent({
        timestamp: new Date(),
        type: 'message',
        direction: 'in',
        data: message
      });

      // Notify global message handler
      this.config.onMessage(message);

      // Notify event subscribers
      const subscriptions = this.subscriptions.get(message.type);
      if (subscriptions) {
        subscriptions.forEach(sub => {
          try {
            // Apply filter if specified
            if (sub.options.filter && !sub.options.filter(message.payload)) {
              return;
            }

            // Apply transform if specified
            const data = sub.options.transform
              ? sub.options.transform(message.payload)
              : message.payload;

            // Call callback
            sub.callback(data);

            // Unsubscribe if once option is set
            if (sub.options.once) {
              subscriptions.delete(sub);
            }
          } catch (error) {
            this.log('Error in subscription callback', { error, subscription: sub.id });
          }
        });
      }

      this.log('Message received', message);
    } catch (error) {
      this.handleError(this.createError(error, 'message'));
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    this.status.reconnectAttempts++;
    this.updateStatus(ConnectionState.RECONNECTING);

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(this.config.reconnectBackoffMultiplier, this.status.reconnectAttempts - 1),
      this.config.maxReconnectDelay
    );

    this.config.onReconnecting(this.status.reconnectAttempts, delay);
    this.log(`Reconnecting in ${delay}ms (attempt ${this.status.reconnectAttempts}/${this.config.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.metrics.reconnections++;

      if (this.status.reconnectAttempts >= this.config.reconnectAttempts) {
        this.updateStatus(ConnectionState.ERROR);
        this.config.onReconnectFailed();
        this.log('Reconnection failed - max attempts reached');
      } else {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPongTime = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.status.connected) {
        const timeSinceLastPong = Date.now() - this.lastPongTime;

        if (timeSinceLastPong > this.config.heartbeatInterval * 2) {
          this.log('Heartbeat timeout - connection may be dead');
          this.socket.disconnect();
          return;
        }

        this.socket.emit('ping', { timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Queue a message for later delivery
   */
  private queueMessage(message: WebSocketMessage): void {
    if (this.messageQueue.length >= this.config.messageQueueSize) {
      this.messageQueue.shift(); // Remove oldest message
    }

    this.messageQueue.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message,
      timestamp: new Date(),
      retryCount: 0,
      priority: 0
    });
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    if (!this.socket || !this.status.connected) return;

    this.log(`Processing ${this.messageQueue.length} queued messages`);

    while (this.messageQueue.length > 0) {
      const queuedMessage = this.messageQueue.shift()!;
      this.sendMessage(queuedMessage.message.type, queuedMessage.message.payload);
    }
  }

  /**
   * Clear reconnect timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  /**
   * Update connection status
   */
  private updateStatus(state: ConnectionState): void {
    this.status.state = state;
    this.status.connected = state === ConnectionState.CONNECTED;

    this.emitDevToolsEvent({
      timestamp: new Date(),
      type: 'connection',
      direction: 'in',
      data: { state, connected: this.status.connected }
    });
  }

  /**
   * Handle error
   */
  private handleError(error: WebSocketError): void {
    this.status.error = error.message;
    this.metrics.errors++;

    this.emitDevToolsEvent({
      timestamp: new Date(),
      type: 'error',
      direction: 'in',
      data: error
    });

    this.config.onError(error);
    this.log('WebSocket error', error);

    if (error.retryable && this.status.reconnectAttempts < this.config.reconnectAttempts) {
      this.attemptReconnect();
    }
  }

  /**
   * Create WebSocket error
   */
  private createError(error: any, type: WebSocketError['type']): WebSocketError {
    const wsError = new Error(error?.message || 'WebSocket error') as WebSocketError;
    wsError.code = error?.code;
    wsError.type = type;
    wsError.retryable = type === 'connection' || type === 'timeout';
    wsError.timestamp = new Date();
    return wsError;
  }

  /**
   * Emit DevTools event
   */
  private emitDevToolsEvent(event: DevToolsEvent): void {
    if (!this.devToolsEnabled) return;

    this.devToolsEvents.push(event);

    // Keep only last 1000 events
    if (this.devToolsEvents.length > 1000) {
      this.devToolsEvents.shift();
    }
  }

  /**
   * Log debug message
   */
  private log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[WebSocketClient] ${message}`, data || '');
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.disconnect();
    this.subscriptions.clear();
    this.messageQueue = [];
    this.devToolsEvents = [];
    this.log('WebSocketClient destroyed');
  }
}

export default WebSocketClient;
