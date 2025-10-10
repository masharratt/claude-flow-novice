/**
 * Server-Sent Events (SSE) Manager for Dashboard
 * Alternative real-time communication method using SSE with Fetch API
 */

export interface SSEMessage {
  id?: string;
  event: string;
  data: any;
  retry?: number;
  timestamp?: number;
}

export interface SSEStatus {
  connected: boolean;
  reconnectAttempts: number;
  lastConnected?: Date;
  lastMessage?: Date;
  error?: string;
  eventsReceived: number;
  dataRate: number; // bytes per second
  protocol: string;
}

export interface SSEOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  connectionTimeout?: number;
  heartbeatInterval?: number;
  enableCompression?: boolean;
  withCredentials?: boolean;
  headers?: Record<string, string>;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (message: SSEMessage) => void;
}

export class SSEManager {
  private eventSource: EventSource | null = null;
  private options: Required<SSEOptions>;
  private status: SSEStatus;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, Set<(data: any) => void>> = new Map();
  private messageBuffer: SSEMessage[] = [];
  private dataTransferCounter: number = 0;
  private lastDataTransferReset: number = Date.now();
  private customFetchController: AbortController | null = null;

  constructor(options: SSEOptions = {}) {
    this.options = {
      url: options.url || `${window.location.origin}/api/events`,
      autoConnect: options.autoConnect ?? true,
      reconnectAttempts: options.reconnectAttempts ?? 5,
      reconnectDelay: options.reconnectDelay ?? 1000,
      connectionTimeout: options.connectionTimeout ?? 10000,
      heartbeatInterval: options.heartbeatInterval ?? 30000,
      enableCompression: options.enableCompression ?? true,
      withCredentials: options.withCredentials ?? true,
      headers: options.headers || {},
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || (() => {}),
      onMessage: options.onMessage || (() => {})
    };

    this.status = {
      connected: false,
      reconnectAttempts: 0,
      eventsReceived: 0,
      dataRate: 0,
      protocol: 'sse'
    };

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  /**
   * Establish SSE connection using native EventSource or custom fetch
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource?.readyState === EventSource.OPEN) {
        resolve();
        return;
      }

      try {
        console.log(`Connecting to SSE endpoint: ${this.options.url}`);

        // Use custom fetch implementation for more control
        if (this.options.headers && Object.keys(this.options.headers).length > 0) {
          this.connectWithCustomFetch(resolve, reject);
        } else {
          this.connectWithEventSource(resolve, reject);
        }

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect using native EventSource API
   */
  private connectWithEventSource(resolve: Function, reject: Function): void {
    this.eventSource = new EventSource(this.options.url, {
      withCredentials: this.options.withCredentials
    });

    this.setupEventSourceHandlers(resolve, reject);
  }

  /**
   * Connect using custom fetch implementation (for headers support)
   */
  private connectWithCustomFetch(resolve: Function, reject: Function): void {
    this.customFetchController = new AbortController();

    // Connection timeout
    const timeout = setTimeout(() => {
      if (this.customFetchController) {
        this.customFetchController.abort();
        reject(new Error('Connection timeout'));
      }
    }, this.options.connectionTimeout);

    fetch(this.options.url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...this.options.headers
      },
      credentials: this.options.withCredentials ? 'include' : 'omit',
      signal: this.customFetchController.signal
    }).then(response => {
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process SSE stream manually
      this.processSSEStream(response.body);

      this.status.connected = true;
      this.status.reconnectAttempts = 0;
      this.status.lastConnected = new Date();
      this.status.error = undefined;

      this.startHeartbeat();
      this.options.onConnect();
      resolve();

    }).catch(error => {
      clearTimeout(timeout);
      console.error('SSE connection failed:', error);
      this.status.error = error.message;
      this.options.onError(error);
      reject(error);
    });
  }

  /**
   * Process SSE stream manually from fetch response
   */
  private async processSSEStream(stream: ReadableStream): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          this.parseSSELine(line);
        }
      }
    } catch (error) {
      console.error('Error processing SSE stream:', error);
      this.status.error = error.message;
      this.options.onDisconnect();
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse SSE line and create message
   */
  private parseSSELine(line: string): void {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      try {
        const parsedData = JSON.parse(data);
        const message: SSEMessage = {
          event: 'message',
          data: parsedData,
          timestamp: Date.now()
        };
        this.handleMessage(message);
      } catch (error) {
        // If not JSON, treat as raw data
        this.handleMessage({
          event: 'message',
          data: data,
          timestamp: Date.now()
        });
      }
    } else if (line.startsWith('event: ')) {
      const eventType = line.slice(7);
      // Next data line will belong to this event type
    } else if (line.startsWith('id: ')) {
      const id = line.slice(4);
      // Handle event ID
    }
  }

  /**
   * Setup EventSource handlers
   */
  private setupEventSourceHandlers(resolve: Function, reject: Function): void {
    if (!this.eventSource) return;

    // Connection timeout
    const timeout = setTimeout(() => {
      if (this.eventSource?.readyState === EventSource.CONNECTING) {
        this.eventSource.close();
        reject(new Error('Connection timeout'));
      }
    }, this.options.connectionTimeout);

    this.eventSource.onopen = () => {
      clearTimeout(timeout);
      console.log('SSE connection opened');
      this.status.connected = true;
      this.status.reconnectAttempts = 0;
      this.status.lastConnected = new Date();
      this.status.error = undefined;

      this.startHeartbeat();
      this.options.onConnect();
      resolve();
    };

    this.eventSource.onmessage = (event) => {
      this.handleMessage({
        event: 'message',
        data: event.data,
        id: event.lastEventId,
        timestamp: Date.now()
      });
    };

    this.eventSource.onerror = (event) => {
      clearTimeout(timeout);
      console.error('SSE error:', event);
      this.status.error = 'SSE connection error';
      this.status.connected = false;

      this.options.onError(new Error('SSE connection error'));

      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.options.onDisconnect();

        // Auto-reconnect
        if (this.status.reconnectAttempts < this.options.reconnectAttempts) {
          this.scheduleReconnect();
        }
      }
    };

    // Setup custom event handlers
    this.eventSource.addEventListener('agent_update', (event) => {
      this.handleMessage({
        event: 'agent_update',
        data: JSON.parse(event.data),
        timestamp: Date.now()
      });
    });

    this.eventSource.addEventListener('metrics_update', (event) => {
      this.handleMessage({
        event: 'metrics_update',
        data: JSON.parse(event.data),
        timestamp: Date.now()
      });
    });

    this.eventSource.addEventListener('hierarchy_change', (event) => {
      this.handleMessage({
        event: 'hierarchy_change',
        data: JSON.parse(event.data),
        timestamp: Date.now()
      });
    });

    this.eventSource.addEventListener('alert', (event) => {
      this.handleMessage({
        event: 'alert',
        data: JSON.parse(event.data),
        timestamp: Date.now()
      });
    });
  }

  /**
   * Handle incoming SSE messages
   */
  private handleMessage(message: SSEMessage): void {
    // Update statistics
    this.status.eventsReceived++;
    this.status.lastMessage = new Date();

    // Calculate data rate
    const messageSize = JSON.stringify(message).length;
    this.dataTransferCounter += messageSize;
    this.updateDataRate();

    // Buffer messages for replay
    this.messageBuffer.push(message);
    if (this.messageBuffer.length > 1000) {
      this.messageBuffer = this.messageBuffer.slice(-1000); // Keep last 1000 messages
    }

    // Notify subscribers
    const callbacks = this.subscriptions.get(message.event);
    if (callbacks) {
      callbacks.forEach(callback => callback(message.data));
    }

    // Handle specific message types
    this.handleSpecificMessage(message);

    // Global message handler
    this.options.onMessage(message);
  }

  /**
   * Handle specific message types
   */
  private handleSpecificMessage(message: SSEMessage): void {
    switch (message.event) {
      case 'agent_update':
        // Handle agent status updates
        break;
      case 'metrics_update':
        // Handle performance metrics
        break;
      case 'hierarchy_change':
        // Handle agent hierarchy changes
        break;
      case 'alert':
        // Handle alerts and notifications
        break;
      case 'heartbeat':
        // Handle heartbeat/keepalive
        break;
      default:
        console.log('Unhandled SSE event type:', message.event);
    }
  }

  /**
   * Subscribe to specific event types
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
   * Close SSE connection
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.customFetchController) {
      this.customFetchController.abort();
      this.customFetchController = null;
    }

    this.status.connected = false;
    this.options.onDisconnect();
  }

  /**
   * Get connection status
   */
  getStatus(): SSEStatus {
    return { ...this.status };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status.connected &&
           (this.eventSource?.readyState === EventSource.OPEN || this.customFetchController !== null);
  }

  /**
   * Start heartbeat mechanism (client-side ping)
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        // SSE is unidirectional, so we can't send heartbeat
        // Just update connection status
        this.status.lastConnected = new Date();
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
    console.log(`Scheduling SSE reconnect in ${delay}ms (attempt ${this.status.reconnectAttempts + 1})`);

    this.reconnectTimeout = setTimeout(async () => {
      this.status.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        console.error('SSE reconnection failed:', error);
      }
    }, delay);
  }

  /**
   * Update data rate calculation
   */
  private updateDataRate(): void {
    const now = Date.now();
    const timeDiff = (now - this.lastDataTransferReset) / 1000; // seconds

    if (timeDiff >= 1) {
      this.status.dataRate = this.dataTransferCounter / timeDiff;
      this.dataTransferCounter = 0;
      this.lastDataTransferReset = now;
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      status: this.status,
      subscriptions: Array.from(this.subscriptions.keys()),
      bufferedMessages: this.messageBuffer.length,
      connectionType: this.eventSource ? 'eventsource' : 'fetch-stream'
    };
  }

  /**
   * Get recent messages from buffer
   */
  getRecentMessages(count: number = 100): SSEMessage[] {
    return this.messageBuffer.slice(-count);
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

export default SSEManager;