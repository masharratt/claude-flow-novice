/**
 * Native WebSocket API Implementation for Dashboard
 * Alternative to Socket.io for real-time dashboard communication
 */

export interface NativeWebSocketMessage {
  type: string;
  timestamp: Date;
  payload: any;
  id?: string;
}

export interface NativeWebSocketStatus {
  connected: boolean;
  reconnectAttempts: number;
  lastConnected?: Date;
  lastMessage?: Date;
  error?: string;
  latency: number;
  protocol: string;
}

export interface NativeWebSocketOptions {
  url?: string;
  protocols?: string[];
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  enableLatencyMeasurement?: boolean;
  onConnect?: () => void;
  onDisconnect?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: NativeWebSocketMessage) => void;
}

export class NativeWebSocketManager {
  private socket: WebSocket | null = null;
  private options: Required<NativeWebSocketOptions>;
  private status: NativeWebSocketStatus;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private latencyTimeout: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();
  private messageQueue: NativeWebSocketMessage[] = [];
  private latencyStartTime: number = 0;
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(options: NativeWebSocketOptions = {}) {
    this.options = {
      url: options.url || `ws://${window.location.host}/ws`,
      protocols: options.protocols || [],
      autoConnect: options.autoConnect ?? true,
      reconnectAttempts: options.reconnectAttempts ?? 5,
      reconnectDelay: options.reconnectDelay ?? 1000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      connectionTimeout: options.connectionTimeout ?? 10000,
      enableLatencyMeasurement: options.enableLatencyMeasurement ?? true,
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onMessage: options.onMessage || (() => {})
    };

    this.status = {
      connected: false,
      reconnectAttempts: 0,
      latency: 0,
      protocol: 'native-websocket'
    };

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Establish WebSocket connection
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      try {
        console.log(`Connecting to WebSocket: ${this.options.url}`);
        this.socket = new WebSocket(this.options.url, this.options.protocols);

        // Connection timeout
        const timeout = setTimeout(() => {
          if (this.socket?.readyState === WebSocket.CONNECTING) {
            this.socket.close();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.socket.onopen = (event) => {
          clearTimeout(timeout);
          console.log('WebSocket connected');
          this.status.connected = true;
          this.status.reconnectAttempts = 0;
          this.status.lastConnected = new Date();
          this.status.error = undefined;

          // Start heartbeat
          this.startHeartbeat();

          // Send queued messages
          this.flushMessageQueue();

          // Request initial data
          this.sendMessage('request_initial_data', {});

          this.options.onConnect();
          resolve();
        };

        this.socket.onclose = (event) => {
          clearTimeout(timeout);
          console.log('WebSocket disconnected:', event.code, event.reason);
          this.status.connected = false;
          this.stopHeartbeat();

          this.options.onDisconnect(event);

          // Auto-reconnect logic
          if (event.code !== 1000 && this.status.reconnectAttempts < this.options.reconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (event) => {
          clearTimeout(timeout);
          console.error('WebSocket error:', event);
          this.status.error = 'Connection error';
          this.options.onError(event);
          reject(new Error('WebSocket connection failed'));
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close WebSocket connection
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.status.connected = false;
  }

  /**
   * Send message to server
   */
  sendMessage(type: string, payload: any, id?: string): boolean {
    const message: NativeWebSocketMessage = {
      type,
      timestamp: new Date(),
      payload,
      id: id || this.generateMessageId()
    };

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    } else {
      // Queue message for later delivery
      this.messageQueue.push(message);
      console.warn('WebSocket not connected, message queued');
      return false;
    }
  }

  /**
   * Subscribe to specific message types
   */
  subscribe(eventType: string, callback: (data: any) => void): () => void {
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(eventType);
        }
      }
    };
  }

  /**
   * Get current connection status
   */
  getStatus(): NativeWebSocketStatus {
    return { ...this.status };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.status.connected;
  }

  /**
   * Add event listener for WebSocket events
   */
  addEventListener(event: string, listener: EventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);

    if (this.socket) {
      this.socket.addEventListener(event, listener);
    }
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: string, listener: EventListener): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(event);
      }
    }

    if (this.socket) {
      this.socket.removeEventListener(event, listener);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: NativeWebSocketMessage = JSON.parse(event.data);

      // Update last message timestamp
      this.status.lastMessage = new Date();

      // Handle latency measurement
      if (this.options.enableLatencyMeasurement && message.type === 'pong') {
        this.status.latency = Date.now() - this.latencyStartTime;
        return;
      }

      // Notify subscribers
      const callbacks = this.subscriptions.get(message.type);
      if (callbacks) {
        callbacks.forEach(callback => callback(message.payload));
      }

      // Handle specific message types
      this.handleSpecificMessage(message);

      // Global message handler
      this.options.onMessage(message);

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  /**
   * Handle specific message types for dashboard functionality
   */
  private handleSpecificMessage(message: NativeWebSocketMessage): void {
    switch (message.type) {
      case 'agent_update':
        // Handle agent status updates
        break;
      case 'metrics_update':
        // Handle performance metrics
        break;
      case 'hierarchy_change':
        // Handle agent hierarchy changes
        break;
      case 'event_stream':
        // Handle real-time event stream
        break;
      case 'alert':
        // Handle alerts and notifications
        break;
      case 'recommendation':
        // Handle optimization recommendations
        break;
      default:
        console.log('Unhandled message type:', message.type);
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        if (this.options.enableLatencyMeasurement) {
          this.latencyStartTime = Date.now();
          this.sendMessage('ping', { timestamp: Date.now() });
        } else {
          this.sendMessage('heartbeat', {});
        }
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = this.options.reconnectDelay * Math.pow(2, this.status.reconnectAttempts);
    console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.status.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.status.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * Send queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message.type, message.payload, message.id);
      }
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      status: this.status,
      subscriptions: Array.from(this.subscriptions.keys()),
      queuedMessages: this.messageQueue.length,
      eventListeners: Array.from(this.eventListeners.keys())
    };
  }

  /**
   * Force reconnect
   */
  async reconnect(): Promise<void> {
    this.disconnect();
    this.status.reconnectAttempts = 0;
    await this.connect();
  }
}

export default NativeWebSocketManager;