import WebSocket from 'ws';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

interface SwarmVisualizationData {
  agents: Agent[];
  tasks: Task[];
  metrics: SwarmMetrics;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'processing' | 'error';
  confidence: number;
  currentTask?: string;
  processingTime: number;
  memoryUsage: number;
  lastUpdate: Date;
  position?: { x: number; y: number };
}

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string[];
  progress: number;
  startTime: Date;
  estimatedDuration: number;
}

interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  totalTasks: number;
  averageConfidence: number;
  systemHealth: number;
  processingTime: number;
  memoryUsage: number;
  networkLatency: number;
}

class SwarmWebSocketServer extends EventEmitter {
  private wss: WebSocket.Server | null = null;
  private redisClient: RedisClientType | null = null;
  private redisSubscriber: RedisClientType | null = null;
  private port: number;
  private connections: Map<string, WebSocket> = new Map();
  private swarmData: Map<string, SwarmVisualizationData> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(port: number = 8080) {
    super();
    this.port = port;
  }

  async start(): Promise<void> {
    try {
      // Initialize Redis clients
      await this.initializeRedis();

      // Create WebSocket server
      this.wss = new WebSocket.Server({
        port: this.port,
        perMessageDeflate: false
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', this.handleError.bind(this));

      // Start Redis subscription
      await this.startRedisSubscription();

      // Start periodic data updates
      this.startPeriodicUpdates();

      this.isRunning = true;
      console.log(`Swarm WebSocket server started on port ${this.port}`);
      this.emit('started');

    } catch (error) {
      console.error('Failed to start WebSocket server:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.redisSubscriber) {
      await this.redisSubscriber.quit();
      this.redisSubscriber = null;
    }

    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }

    this.connections.clear();
    this.swarmData.clear();

    console.log('Swarm WebSocket server stopped');
    this.emit('stopped');
  }

  private async initializeRedis(): Promise<void> {
    try {
      // Main Redis client for publishing
      this.redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      // Redis subscriber for listening to swarm events
      this.redisSubscriber = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        }
      });

      await Promise.all([
        this.redisClient.connect(),
        this.redisSubscriber.connect()
      ]);

      console.log('Redis clients initialized for WebSocket server');
    } catch (error) {
      console.error('Failed to initialize Redis clients:', error);
      throw error;
    }
  }

  private async startRedisSubscription(): Promise<void> {
    if (!this.redisSubscriber) return;

    // Subscribe to swarm visualization events
    await this.redisSubscriber.subscribe('swarm:phase-6:visualization', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleSwarmEvent(data);
      } catch (error) {
        console.error('Error parsing Redis message:', error);
      }
    });

    // Subscribe to individual swarm channels
    await this.redisSubscriber.subscribe('swarm:updates', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleSwarmUpdate(data);
      } catch (error) {
        console.error('Error parsing swarm update:', error);
      }
    });

    console.log('Redis subscriptions started');
  }

  private handleConnection(ws: WebSocket, request: any): void {
    // Extract swarm ID from URL
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const pathParts = url.pathname.split('/');
    const swarmId = pathParts[pathParts.length - 1] || 'default';

    const connectionId = this.generateConnectionId();
    this.connections.set(connectionId, ws);

    console.log(`New WebSocket connection for swarm: ${swarmId} (ID: ${connectionId})`);

    // Initialize swarm data if not exists
    if (!this.swarmData.has(swarmId)) {
      this.swarmData.set(swarmId, this.generateMockData());
    }

    // Send initial data
    this.sendToConnection(connectionId, {
      type: 'initial-data',
      swarmId,
      data: this.swarmData.get(swarmId)
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(connectionId, swarmId, message);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      this.connections.delete(connectionId);
      console.log(`WebSocket connection closed: ${connectionId}`);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for connection ${connectionId}:`, error);
      this.connections.delete(connectionId);
    });

    // Send connection info to client
    this.sendToConnection(connectionId, {
      type: 'connection-established',
      connectionId,
      swarmId,
      timestamp: new Date().toISOString()
    });
  }

  private handleMessage(connectionId: string, swarmId: string, message: any): void {
    switch (message.type) {
      case 'subscribe-to-swarm':
        // Subscribe to specific swarm updates
        if (message.swarmId && message.swarmId !== swarmId) {
          // Client wants to switch to different swarm
          this.handleSwarmSwitch(connectionId, message.swarmId);
        }
        break;

      case 'request-full-sync':
        // Send full current state
        this.sendToConnection(connectionId, {
          type: 'full-sync',
          swarmId,
          data: this.swarmData.get(swarmId)
        });
        break;

      case 'ping':
        // Respond with pong for connection health check
        this.sendToConnection(connectionId, {
          type: 'pong',
          timestamp: new Date().toISOString()
        });
        break;

      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  private handleSwarmSwitch(connectionId: string, newSwarmId: string): void {
    // Initialize new swarm data if not exists
    if (!this.swarmData.has(newSwarmId)) {
      this.swarmData.set(newSwarmId, this.generateMockData());
    }

    // Send new swarm data
    this.sendToConnection(connectionId, {
      type: 'swarm-switched',
      swarmId: newSwarmId,
      data: this.swarmData.get(newSwarmId)
    });
  }

  private handleSwarmEvent(eventData: any): void {
    // Handle events from Redis pub/sub
    const { swarmId, type, data } = eventData;

    if (!this.swarmData.has(swarmId)) {
      this.swarmData.set(swarmId, this.generateMockData());
    }

    const currentData = this.swarmData.get(swarmId)!;

    switch (type) {
      case 'agent-status-change':
        this.updateAgentStatus(currentData, data);
        break;
      case 'task-update':
        this.updateTaskStatus(currentData, data);
        break;
      case 'metrics-update':
        this.updateMetrics(currentData, data);
        break;
    }

    // Broadcast to all connections for this swarm
    this.broadcastToSwarm(swarmId, {
      type,
      swarmId,
      data
    });
  }

  private handleSwarmUpdate(updateData: any): void {
    // Handle general swarm updates
    const { swarmId, agents, tasks, metrics } = updateData;

    if (swarmId && (agents || tasks || metrics)) {
      const currentData = this.swarmData.get(swarmId) || this.generateMockData();

      if (agents) {
        currentData.agents = agents;
      }
      if (tasks) {
        currentData.tasks = tasks;
      }
      if (metrics) {
        currentData.metrics = metrics;
      }

      this.swarmData.set(swarmId, currentData);

      // Broadcast to all connections for this swarm
      this.broadcastToSwarm(swarmId, {
        type: 'swarm-data-update',
        swarmId,
        data: currentData
      });
    }
  }

  private updateAgentStatus(swarmData: SwarmVisualizationData, update: any): void {
    const { agentId, status, confidence, currentTask } = update;

    const agentIndex = swarmData.agents.findIndex(a => a.id === agentId);
    if (agentIndex >= 0) {
      swarmData.agents[agentIndex] = {
        ...swarmData.agents[agentIndex],
        ...(status && { status }),
        ...(confidence !== undefined && { confidence }),
        ...(currentTask && { currentTask }),
        lastUpdate: new Date()
      };
    }
  }

  private updateTaskStatus(swarmData: SwarmVisualizationData, update: any): void {
    const { taskId, status, progress, assignedTo } = update;

    const taskIndex = swarmData.tasks.findIndex(t => t.id === taskId);
    if (taskIndex >= 0) {
      swarmData.tasks[taskIndex] = {
        ...swarmData.tasks[taskIndex],
        ...(status && { status }),
        ...(progress !== undefined && { progress }),
        ...(assignedTo && { assignedTo })
      };
    }
  }

  private updateMetrics(swarmData: SwarmVisualizationData, update: any): void {
    swarmData.metrics = {
      ...swarmData.metrics,
      ...update
    };
  }

  private broadcastToSwarm(swarmId: string, message: any): void {
    for (const [connectionId, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
        } catch (error) {
          console.error(`Error sending to connection ${connectionId}:`, error);
          this.connections.delete(connectionId);
        }
      }
    }
  }

  private sendToConnection(connectionId: string, message: any): void {
    const ws = this.connections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending to connection ${connectionId}:`, error);
        this.connections.delete(connectionId);
      }
    }
  }

  private handleError(error: Error): void {
    console.error('WebSocket server error:', error);
    this.emit('error', error);
  }

  private startPeriodicUpdates(): void {
    // Send periodic updates to simulate real-time data
    this.updateInterval = setInterval(() => {
      if (!this.isRunning) return;

      // Update each swarm's data
      for (const [swarmId, data] of this.swarmData) {
        this.simulateDataUpdate(data);

        // Broadcast updates to connected clients
        this.broadcastToSwarm(swarmId, {
          type: 'agents-update',
          swarmId,
          agents: data.agents
        });

        this.broadcastToSwarm(swarmId, {
          type: 'tasks-update',
          swarmId,
          tasks: data.tasks
        });

        this.broadcastToSwarm(swarmId, {
          type: 'metrics-update',
          swarmId,
          metrics: data.metrics
        });
      }
    }, 1000); // Update every second
  }

  private simulateDataUpdate(data: SwarmVisualizationData): void {
    // Simulate agent status changes
    data.agents.forEach(agent => {
      // Randomly update processing time
      if (agent.status === 'processing') {
        agent.processingTime = Math.max(100, agent.processingTime + (Math.random() - 0.5) * 200);
        agent.memoryUsage = Math.max(10, Math.min(90, agent.memoryUsage + (Math.random() - 0.5) * 10));
      }

      // Randomly update confidence for active agents
      if (agent.status === 'active' || agent.status === 'processing') {
        agent.confidence = Math.max(0.6, Math.min(1.0, agent.confidence + (Math.random() - 0.5) * 0.05));
      }

      agent.lastUpdate = new Date();
    });

    // Simulate task progress
    data.tasks.forEach(task => {
      if (task.status === 'in-progress') {
        task.progress = Math.min(100, task.progress + Math.random() * 5);
        if (task.progress >= 100) {
          task.status = 'completed';
          task.progress = 100;
          data.metrics.completedTasks++;
        }
      }
    });

    // Update metrics
    data.metrics.activeAgents = data.agents.filter(a => a.status === 'active' || a.status === 'processing').length;
    data.metrics.averageConfidence = data.agents.reduce((sum, a) => sum + a.confidence, 0) / data.agents.length;
    data.metrics.processingTime = data.agents.reduce((sum, a) => sum + a.processingTime, 0);
    data.metrics.memoryUsage = data.agents.reduce((sum, a) => sum + a.memoryUsage, 0) / data.agents.length;
    data.metrics.systemHealth = Math.max(50, Math.min(100, data.metrics.systemHealth + (Math.random() - 0.5) * 5));
    data.metrics.networkLatency = Math.max(10, Math.min(100, data.metrics.networkLatency + (Math.random() - 0.5) * 10));
  }

  private generateMockData(): SwarmVisualizationData {
    const agents: Agent[] = [
      {
        id: 'agent-1',
        name: 'UI Designer',
        role: 'ui-designer',
        status: 'active',
        confidence: 0.92,
        currentTask: 'Create swarm visualization components',
        processingTime: 1250,
        memoryUsage: 45,
        lastUpdate: new Date(),
        position: { x: 200, y: 150 }
      },
      {
        id: 'agent-2',
        name: 'Backend Developer',
        role: 'backend-dev',
        status: 'processing',
        confidence: 0.88,
        currentTask: 'Implement WebSocket handlers',
        processingTime: 2100,
        memoryUsage: 67,
        lastUpdate: new Date(),
        position: { x: 400, y: 200 }
      },
      {
        id: 'agent-3',
        name: 'System Architect',
        role: 'architect',
        status: 'active',
        confidence: 0.95,
        currentTask: 'Design data flow architecture',
        processingTime: 800,
        memoryUsage: 32,
        lastUpdate: new Date(),
        position: { x: 300, y: 350 }
      },
      {
        id: 'agent-4',
        name: 'Performance Analyzer',
        role: 'perf-analyzer',
        status: 'idle',
        confidence: 0.00,
        processingTime: 0,
        memoryUsage: 12,
        lastUpdate: new Date(),
        position: { x: 500, y: 100 }
      }
    ];

    const tasks: Task[] = [
      {
        id: 'task-1',
        title: 'Create swarm visualization components',
        status: 'in-progress',
        assignedTo: ['agent-1'],
        progress: 65,
        startTime: new Date(Date.now() - 60000),
        estimatedDuration: 120000
      },
      {
        id: 'task-2',
        title: 'Implement WebSocket handlers',
        status: 'in-progress',
        assignedTo: ['agent-2'],
        progress: 40,
        startTime: new Date(Date.now() - 90000),
        estimatedDuration: 150000
      },
      {
        id: 'task-3',
        title: 'Design data flow architecture',
        status: 'completed',
        assignedTo: ['agent-3'],
        progress: 100,
        startTime: new Date(Date.now() - 120000),
        estimatedDuration: 90000
      }
    ];

    const metrics: SwarmMetrics = {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active' || a.status === 'processing').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      totalTasks: tasks.length,
      averageConfidence: agents.reduce((sum, a) => sum + a.confidence, 0) / agents.length,
      systemHealth: 94,
      processingTime: agents.reduce((sum, a) => sum + a.processingTime, 0),
      memoryUsage: agents.reduce((sum, a) => sum + a.memoryUsage, 0),
      networkLatency: 23
    };

    return { agents, tasks, metrics };
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  public updateSwarmData(swarmId: string, data: Partial<SwarmVisualizationData>): void {
    const currentData = this.swarmData.get(swarmId) || this.generateMockData();

    this.swarmData.set(swarmId, {
      agents: data.agents || currentData.agents,
      tasks: data.tasks || currentData.tasks,
      metrics: { ...currentData.metrics, ...data.metrics }
    });

    // Broadcast updates
    if (data.agents) {
      this.broadcastToSwarm(swarmId, {
        type: 'agents-update',
        swarmId,
        agents: data.agents
      });
    }

    if (data.tasks) {
      this.broadcastToSwarm(swarmId, {
        type: 'tasks-update',
        swarmId,
        tasks: data.tasks
      });
    }

    if (data.metrics) {
      this.broadcastToSwarm(swarmId, {
        type: 'metrics-update',
        swarmId,
        metrics: { ...currentData.metrics, ...data.metrics }
      });
    }
  }

  public getConnectedClients(): number {
    return this.connections.size;
  }

  public getActiveSwarms(): string[] {
    return Array.from(this.swarmData.keys());
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }
}

// Singleton instance
let serverInstance: SwarmWebSocketServer | null = null;

export function getSwarmWebSocketServer(port: number = 8080): SwarmWebSocketServer {
  if (!serverInstance) {
    serverInstance = new SwarmWebSocketServer(port);
  }
  return serverInstance;
}

export default SwarmWebSocketServer;