/**
 * Priority Message Queue with WebSocket Infrastructure
 * Multi-threaded WebSocket handling with Worker threads
 * Target: <200μs WebSocket send latency
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { performance } from 'perf_hooks';

// Priority levels for message ordering
export enum MessagePriority {
  CRITICAL = 0,    // System-critical messages
  HIGH = 1,        // High-priority tasks
  NORMAL = 2,      // Regular messages
  LOW = 3,         // Background tasks
  BATCH = 4        // Batch processing
}

// WebSocket connection state
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

// Message structure with priority
export interface PriorityMessage {
  id: string;
  priority: MessagePriority;
  timestamp: bigint;
  payload: ArrayBuffer;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  correlationId?: string;
}

// Connection metrics
export interface ConnectionMetrics {
  messagesPerSecond: number;
  avgLatencyNs: number;
  p95LatencyNs: number;
  errorRate: number;
  queueSize: number;
  connectionUptime: number;
}

// Lock-free priority queue using multiple heaps
class PriorityQueue<T> {
  private readonly queues: Array<T[]> = [];
  private readonly priorities = Object.values(MessagePriority).filter(v => typeof v === 'number') as number[];
  private size: number = 0;

  constructor() {
    // Initialize one queue per priority level
    this.priorities.forEach(() => {
      this.queues.push([]);
    });
  }

  enqueue(item: T, priority: MessagePriority): void {
    this.queues[priority].push(item);
    this.size++;
  }

  dequeue(): T | null {
    // Check queues in priority order
    for (let i = 0; i < this.queues.length; i++) {
      const queue = this.queues[i];
      if (queue.length > 0) {
        this.size--;
        return queue.shift()!;
      }
    }
    return null;
  }

  peek(): T | null {
    for (let i = 0; i < this.queues.length; i++) {
      const queue = this.queues[i];
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  getSize(): number {
    return this.size;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  // Get size by priority level
  getSizeByPriority(priority: MessagePriority): number {
    return this.queues[priority].length;
  }
}

// High-performance WebSocket connection wrapper
class FastWebSocketConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private pingInterval?: NodeJS.Timeout;
  private readonly metrics = {
    messagesSent: 0,
    messagesReceived: 0,
    totalLatency: 0n,
    errorCount: 0,
    connectTime: 0n
  };

  constructor(url: string, private readonly options: {
    pingInterval?: number;
    maxReconnectAttempts?: number;
    connectionTimeout?: number;
  } = {}) {
    super();
    this.url = url;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
  }

  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.state = ConnectionState.CONNECTING;
    const startTime = process.hrtime.bigint();

    try {
      this.ws = new WebSocket(this.url, {
        perMessageDeflate: false, // Disable compression for latency
        maxPayload: 100 * 1024 * 1024, // 100MB max payload
      });

      await this.setupWebSocketHandlers();
      this.metrics.connectTime = process.hrtime.bigint() - startTime;
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.startPingInterval();

      this.emit('connected');
    } catch (error) {
      this.state = ConnectionState.ERROR;
      this.emit('error', error);
      this.scheduleReconnect();
    }
  }

  private setupWebSocketHandlers(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.options.connectionTimeout || 5000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        this.metrics.messagesReceived++;
        this.emit('message', new Uint8Array(data));
      });

      this.ws.on('close', (code: number, reason: string) => {
        this.state = ConnectionState.DISCONNECTED;
        this.stopPingInterval();
        this.emit('disconnected', { code, reason });
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        this.metrics.errorCount++;
        this.emit('error', error);
      });

      this.ws.on('pong', () => {
        // Connection is alive
      });
    });
  }

  send(data: ArrayBuffer, priority: MessagePriority = MessagePriority.NORMAL): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state !== ConnectionState.CONNECTED || !this.ws) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const startTime = process.hrtime.bigint();

      try {
        this.ws.send(data, (error) => {
          if (error) {
            this.metrics.errorCount++;
            reject(error);
          } else {
            const latency = process.hrtime.bigint() - startTime;
            this.metrics.messagesSent++;
            this.metrics.totalLatency += latency;
            resolve();
          }
        });
      } catch (error) {
        this.metrics.errorCount++;
        reject(error);
      }
    });
  }

  private startPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.options.pingInterval || 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;
    
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    setTimeout(() => {
      this.connect().catch(() => {
        // Reconnection failed, will be handled by the connect method
      });
    }, delay);
  }

  disconnect(): void {
    this.stopPingInterval();
    
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    
    this.state = ConnectionState.DISCONNECTED;
  }

  getMetrics(): ConnectionMetrics {
    const avgLatency = this.metrics.messagesSent > 0 
      ? Number(this.metrics.totalLatency / BigInt(this.metrics.messagesSent))
      : 0;

    return {
      messagesPerSecond: this.metrics.messagesSent, // Would calculate based on time window
      avgLatencyNs: avgLatency,
      p95LatencyNs: avgLatency * 1.2, // Approximation - would use histogram in production
      errorRate: this.metrics.errorCount / Math.max(this.metrics.messagesSent, 1),
      queueSize: 0, // Would track queue size
      connectionUptime: Number(process.hrtime.bigint() - this.metrics.connectTime) / 1000000
    };
  }

  getState(): ConnectionState {
    return this.state;
  }
}

// WebSocket worker thread for handling connections
class WebSocketWorker {
  private connections = new Map<string, FastWebSocketConnection>();
  private messageQueue = new PriorityQueue<PriorityMessage>();
  private processing = false;

  constructor() {
    this.startMessageProcessor();
  }

  addConnection(id: string, url: string, options?: any): void {
    const connection = new FastWebSocketConnection(url, options);
    
    connection.on('connected', () => {
      if (parentPort) {
        parentPort.postMessage({ type: 'connectionReady', connectionId: id });
      }
    });

    connection.on('message', (data: Uint8Array) => {
      if (parentPort) {
        parentPort.postMessage({ 
          type: 'messageReceived', 
          connectionId: id, 
          data: Array.from(data) 
        });
      }
    });

    connection.on('error', (error: Error) => {
      if (parentPort) {
        parentPort.postMessage({ 
          type: 'connectionError', 
          connectionId: id, 
          error: error.message 
        });
      }
    });

    this.connections.set(id, connection);
    connection.connect();
  }

  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.disconnect();
      this.connections.delete(id);
    }
  }

  queueMessage(message: PriorityMessage): void {
    this.messageQueue.enqueue(message, message.priority);
  }

  private async startMessageProcessor(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.processing) {
      const message = this.messageQueue.dequeue();
      
      if (message) {
        await this.processMessage(message);
      } else {
        // No messages, yield control briefly
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  private async processMessage(message: PriorityMessage): Promise<void> {
    // Extract connection ID from message (would be part of routing)
    const connectionId = 'default'; // Simplified for example
    const connection = this.connections.get(connectionId);

    if (!connection || connection.getState() !== ConnectionState.CONNECTED) {
      // Connection not available, requeue if retries remain
      if (message.retryCount < message.maxRetries) {
        message.retryCount++;
        setTimeout(() => {
          this.messageQueue.enqueue(message, message.priority);
        }, 1000 * message.retryCount);
      }
      return;
    }

    try {
      await connection.send(message.payload, message.priority);
      
      if (parentPort) {
        parentPort.postMessage({
          type: 'messageSent',
          messageId: message.id,
          latency: Number(process.hrtime.bigint() - message.timestamp)
        });
      }
    } catch (error) {
      if (message.retryCount < message.maxRetries) {
        message.retryCount++;
        setTimeout(() => {
          this.messageQueue.enqueue(message, message.priority);
        }, 1000 * message.retryCount);
      } else {
        if (parentPort) {
          parentPort.postMessage({
            type: 'messageFailed',
            messageId: message.id,
            error: (error as Error).message
          });
        }
      }
    }
  }

  getMetrics(): { [connectionId: string]: ConnectionMetrics } {
    const metrics: { [connectionId: string]: ConnectionMetrics } = {};
    
    for (const [id, connection] of this.connections) {
      metrics[id] = connection.getMetrics();
    }
    
    return metrics;
  }
}

// Main WebSocket manager using worker threads
export class MultiThreadedWebSocketManager extends EventEmitter {
  private workers: Worker[] = [];
  private workerIndex: number = 0;
  private connections = new Map<string, { workerId: number; url: string; options?: any }>();
  private messageMetrics = {
    sent: 0,
    failed: 0,
    totalLatency: 0n
  };

  constructor(private readonly workerCount: number = 4) {
    super();
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(__filename, {
        workerData: { workerId: i }
      });

      worker.on('message', (message) => {
        this.handleWorkerMessage(message, i);
      });

      worker.on('error', (error) => {
        this.emit('workerError', { workerId: i, error });
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          this.emit('workerExit', { workerId: i, code });
        }
      });

      this.workers.push(worker);
    }
  }

  private handleWorkerMessage(message: any, workerId: number): void {
    switch (message.type) {
      case 'connectionReady':
        this.emit('connectionReady', message.connectionId);
        break;
      case 'messageReceived':
        this.emit('messageReceived', message.connectionId, new Uint8Array(message.data));
        break;
      case 'connectionError':
        this.emit('connectionError', message.connectionId, new Error(message.error));
        break;
      case 'messageSent':
        this.messageMetrics.sent++;
        this.messageMetrics.totalLatency += BigInt(message.latency);
        this.emit('messageSent', message.messageId, message.latency);
        break;
      case 'messageFailed':
        this.messageMetrics.failed++;
        this.emit('messageFailed', message.messageId, new Error(message.error));
        break;
    }
  }

  addConnection(id: string, url: string, options?: any): void {
    const workerId = this.workerIndex % this.workerCount;
    this.workerIndex++;

    this.connections.set(id, { workerId, url, options });
    
    this.workers[workerId].postMessage({
      type: 'addConnection',
      id,
      url,
      options
    });
  }

  removeConnection(id: string): void {
    const connectionInfo = this.connections.get(id);
    if (connectionInfo) {
      this.workers[connectionInfo.workerId].postMessage({
        type: 'removeConnection',
        id
      });
      this.connections.delete(id);
    }
  }

  sendMessage(message: PriorityMessage, connectionId?: string): void {
    // Route to appropriate worker
    let workerId = 0;
    
    if (connectionId) {
      const connectionInfo = this.connections.get(connectionId);
      if (connectionInfo) {
        workerId = connectionInfo.workerId;
      }
    } else {
      // Load balance across workers
      workerId = this.workerIndex % this.workerCount;
      this.workerIndex++;
    }

    this.workers[workerId].postMessage({
      type: 'queueMessage',
      message
    });
  }

  // Batch send for high throughput
  sendBatch(messages: PriorityMessage[]): void {
    // Distribute messages across workers
    messages.forEach((message, index) => {
      const workerId = index % this.workerCount;
      this.workers[workerId].postMessage({
        type: 'queueMessage',
        message
      });
    });
  }

  async getMetrics(): Promise<{ [connectionId: string]: ConnectionMetrics }> {
    const promises = this.workers.map((worker, index) => {
      return new Promise<{ [connectionId: string]: ConnectionMetrics }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({}); // Timeout fallback
        }, 1000);

        const handler = (message: any) => {
          if (message.type === 'metrics') {
            clearTimeout(timeout);
            worker.off('message', handler);
            resolve(message.data);
          }
        };

        worker.on('message', handler);
        worker.postMessage({ type: 'getMetrics' });
      });
    });

    const workerMetrics = await Promise.all(promises);
    
    // Combine metrics from all workers
    const combinedMetrics: { [connectionId: string]: ConnectionMetrics } = {};
    workerMetrics.forEach(metrics => {
      Object.assign(combinedMetrics, metrics);
    });

    return combinedMetrics;
  }

  getGlobalMetrics() {
    const avgLatency = this.messageMetrics.sent > 0 
      ? Number(this.messageMetrics.totalLatency / BigInt(this.messageMetrics.sent))
      : 0;

    return {
      messagesSent: this.messageMetrics.sent,
      messagesFailed: this.messageMetrics.failed,
      averageLatencyNs: avgLatency,
      successRate: this.messageMetrics.sent / (this.messageMetrics.sent + this.messageMetrics.failed),
      workerCount: this.workerCount
    };
  }

  async shutdown(): Promise<void> {
    const promises = this.workers.map(worker => worker.terminate());
    await Promise.all(promises);
  }
}

// Worker thread entry point
if (!isMainThread && parentPort) {
  const worker = new WebSocketWorker();

  parentPort.on('message', (message) => {
    switch (message.type) {
      case 'addConnection':
        worker.addConnection(message.id, message.url, message.options);
        break;
      case 'removeConnection':
        worker.removeConnection(message.id);
        break;
      case 'queueMessage':
        worker.queueMessage(message.message);
        break;
      case 'getMetrics':
        const metrics = worker.getMetrics();
        parentPort!.postMessage({ type: 'metrics', data: metrics });
        break;
    }
  });
}