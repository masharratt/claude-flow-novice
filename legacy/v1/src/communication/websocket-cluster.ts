import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { SharedBufferBus } from './shared-buffer-bus';

interface WorkerConfig {
  workerId: number;
  port: number;
  sharedBuffer: SharedArrayBuffer;
  connectionLimit: number;
}

interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
}

export class WebSocketCluster {
  private workers: Map<number, Worker> = new Map();
  private sharedBus: SharedBufferBus;
  private loadBalancer: LoadBalancer;
  private healthMonitor: HealthMonitor;
  private metrics: ConnectionMetrics;
  private readonly workerCount: number;
  private readonly basePort: number;

  constructor(options: {
    workerCount?: number;
    basePort?: number;
    connectionLimit?: number;
  } = {}) {
    this.workerCount = options.workerCount || Math.max(2, require('os').cpus().length);
    this.basePort = options.basePort || 8080;
    this.sharedBus = new SharedBufferBus();
    this.loadBalancer = new LoadBalancer(this.workerCount);
    this.healthMonitor = new HealthMonitor();
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      messagesPerSecond: 0,
      averageLatency: 0,
      errorRate: 0
    };
  }

  public async start(): Promise<void> {
    if (!isMainThread) {
      throw new Error('WebSocketCluster must run in main thread');
    }

    console.log(`Starting WebSocket cluster with ${this.workerCount} workers`);

    // Start worker processes
    for (let i = 0; i < this.workerCount; i++) {
      await this.startWorker(i);
    }

    // Start health monitoring
    this.healthMonitor.start(this.workers);

    // Start metrics collection
    this.startMetricsCollection();

    console.log('WebSocket cluster started successfully');
  }

  private async startWorker(workerId: number): Promise<void> {
    const worker = new Worker(__filename, {
      workerData: {
        workerId,
        port: this.basePort + workerId,
        sharedBuffer: this.sharedBus.getSharedBuffer(),
        connectionLimit: Math.floor(10000 / this.workerCount)
      } as WorkerConfig
    });

    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });

    worker.on('error', (error) => {
      console.error(`Worker ${workerId} error:`, error);
      this.restartWorker(workerId);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${workerId} exited with code ${code}`);
        this.restartWorker(workerId);
      }
    });

    this.workers.set(workerId, worker);

    // Wait for worker to be ready
    return new Promise((resolve) => {
      const readyHandler = (message: any) => {
        if (message.type === 'ready' && message.workerId === workerId) {
          worker.off('message', readyHandler);
          resolve();
        }
      };
      worker.on('message', readyHandler);
    });
  }

  private async restartWorker(workerId: number): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate();
      this.workers.delete(workerId);
    }

    // Add backoff delay before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startWorker(workerId);
  }

  private handleWorkerMessage(workerId: number, message: any): void {
    switch (message.type) {
      case 'metrics':
        this.updateMetrics(workerId, message.data);
        break;
      case 'broadcast':
        this.broadcastToAllWorkers(message.data, workerId);
        break;
      case 'route':
        this.routeMessage(message.data);
        break;
    }
  }

  private broadcastToAllWorkers(data: any, excludeWorkerId?: number): void {
    for (const [workerId, worker] of this.workers) {
      if (workerId !== excludeWorkerId) {
        worker.postMessage({
          type: 'broadcast',
          data
        });
      }
    }
  }

  private routeMessage(data: any): void {
    const targetWorker = this.loadBalancer.selectWorker(data.targetId);
    const worker = this.workers.get(targetWorker);
    
    if (worker) {
      worker.postMessage({
        type: 'route',
        data
      });
    }
  }

  private updateMetrics(workerId: number, workerMetrics: any): void {
    // Aggregate metrics from all workers
    this.metrics.totalConnections += workerMetrics.connections || 0;
    this.metrics.messagesPerSecond += workerMetrics.messagesPerSecond || 0;
    this.metrics.averageLatency = Math.max(this.metrics.averageLatency, workerMetrics.averageLatency || 0);
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      // Collect and log cluster metrics
      console.log(`Cluster Metrics:`, {
        activeWorkers: this.workers.size,
        totalConnections: this.metrics.totalConnections,
        messagesPerSecond: this.metrics.messagesPerSecond,
        averageLatency: `${this.metrics.averageLatency.toFixed(2)}ms`
      });
      
      // Reset counters for next interval
      this.metrics.totalConnections = 0;
      this.metrics.messagesPerSecond = 0;
    }, 5000);
  }

  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  public async stop(): Promise<void> {
    console.log('Stopping WebSocket cluster...');
    
    for (const [workerId, worker] of this.workers) {
      worker.postMessage({ type: 'shutdown' });
      await worker.terminate();
    }
    
    this.workers.clear();
    this.healthMonitor.stop();
    
    console.log('WebSocket cluster stopped');
  }
}

// Worker thread implementation
if (!isMainThread && parentPort) {
  const config = workerData as WorkerConfig;
  const workerBus = new SharedBufferBus();
  
  class WebSocketWorker {
    private server: WebSocketServer;
    private connections: Map<string, WebSocket> = new Map();
    private metrics: {
      connections: number;
      messagesPerSecond: number;
      averageLatency: number;
    } = {
      connections: 0,
      messagesPerSecond: 0,
      averageLatency: 0
    };

    constructor() {
      this.setupWebSocketServer();
      this.startMessageProcessor();
      this.startMetricsReporting();
    }

    private setupWebSocketServer(): void {
      const httpServer = createServer();
      this.server = new WebSocketServer({ 
        server: httpServer,
        perMessageDeflate: {
          zlibDeflateOptions: {
            windowBits: 13,
            memLevel: 7
          }
        }
      });

      this.server.on('connection', this.handleConnection.bind(this));

      httpServer.listen(config.port, () => {
        parentPort?.postMessage({
          type: 'ready',
          workerId: config.workerId
        });
      });
    }

    private handleConnection(ws: WebSocket, request: any): void {
      const connectionId = `${config.workerId}-${Date.now()}-${Math.random()}`;
      this.connections.set(connectionId, ws);
      this.metrics.connections++;

      ws.on('message', async (data) => {
        const startTime = performance.now();
        
        try {
          // Parse message and route through shared buffer bus
          const message = JSON.parse(data.toString());
          const binaryData = new TextEncoder().encode(JSON.stringify(message));
          
          await workerBus.sendMessage(
            message.type || 0,
            binaryData,
            message.priority || 0,
            message.targetId
          );

          const latency = performance.now() - startTime;
          this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);
          this.metrics.messagesPerSecond++;

        } catch (error) {
          console.error(`Worker ${config.workerId} message error:`, error);
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
        this.metrics.connections--;
      });

      ws.on('error', (error) => {
        console.error(`Worker ${config.workerId} connection error:`, error);
        this.connections.delete(connectionId);
        this.metrics.connections--;
      });
    }

    private startMessageProcessor(): void {
      // Process messages from shared buffer bus
      setImmediate(async () => {
        while (true) {
          const message = await workerBus.receiveMessage(100);
          if (message) {
            this.broadcastToConnections(message);
          }
        }
      });
    }

    private broadcastToConnections(message: any): void {
      const data = JSON.stringify({
        type: message.type,
        data: new TextDecoder().decode(message.data),
        timestamp: Date.now()
      });

      for (const [connectionId, ws] of this.connections) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
          } catch (error) {
            console.error(`Failed to send to connection ${connectionId}:`, error);
            this.connections.delete(connectionId);
            this.metrics.connections--;
          }
        }
      }
    }

    private startMetricsReporting(): void {
      setInterval(() => {
        parentPort?.postMessage({
          type: 'metrics',
          data: { ...this.metrics }
        });
        
        // Reset message counter
        this.metrics.messagesPerSecond = 0;
      }, 1000);
    }
  }

  // Handle messages from main thread
  parentPort.on('message', (message) => {
    switch (message.type) {
      case 'broadcast':
        // Handle broadcast messages
        break;
      case 'route':
        // Handle routed messages
        break;
      case 'shutdown':
        process.exit(0);
        break;
    }
  });

  new WebSocketWorker();
}

class LoadBalancer {
  private currentWorker = 0;
  private workerLoads: number[];

  constructor(private workerCount: number) {
    this.workerLoads = new Array(workerCount).fill(0);
  }

  selectWorker(targetId?: number): number {
    if (targetId !== undefined && targetId >= 0 && targetId < this.workerCount) {
      return targetId;
    }

    // Round-robin with load consideration
    let selectedWorker = this.currentWorker;
    let minLoad = this.workerLoads[selectedWorker];

    for (let i = 0; i < this.workerCount; i++) {
      if (this.workerLoads[i] < minLoad) {
        minLoad = this.workerLoads[i];
        selectedWorker = i;
      }
    }

    this.currentWorker = (this.currentWorker + 1) % this.workerCount;
    this.workerLoads[selectedWorker]++;

    return selectedWorker;
  }

  updateWorkerLoad(workerId: number, load: number): void {
    if (workerId >= 0 && workerId < this.workerCount) {
      this.workerLoads[workerId] = load;
    }
  }
}

class HealthMonitor {
  private healthCheckInterval?: NodeJS.Timeout;
  private workers: Map<number, Worker> = new Map();

  start(workers: Map<number, Worker>): void {
    this.workers = workers;
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 10000); // Health check every 10 seconds
  }

  private performHealthCheck(): void {
    for (const [workerId, worker] of this.workers) {
      // Send ping to worker
      worker.postMessage({ type: 'ping', timestamp: Date.now() });
      
      // Set timeout for response
      const timeout = setTimeout(() => {
        console.warn(`Worker ${workerId} health check timeout`);
      }, 5000);

      const responseHandler = (message: any) => {
        if (message.type === 'pong' && message.workerId === workerId) {
          clearTimeout(timeout);
          worker.off('message', responseHandler);
        }
      };

      worker.on('message', responseHandler);
    }
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}