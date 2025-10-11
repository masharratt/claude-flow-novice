/**
 * Parallel CFN Loop WebSocket API
 * Sprint 5 - Phase 5.2: Monitoring Dashboard Backend
 *
 * Real-time WebSocket endpoints for streaming sprint status updates,
 * test slot monitoring, memory tracking, and conflict resolution events.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

interface SprintUpdate {
  sprintId: string;
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  wave: number;
  confidence?: number;
  memoryUsageMb: number;
  timestamp: number;
}

interface ConflictUpdate {
  conflictId: string;
  type: 'test-slot' | 'file-lock' | 'dependency' | 'memory';
  sprints: string[];
  status: 'detected' | 'resolving' | 'resolved';
  resolution?: string;
  timestamp: number;
}

interface DashboardState {
  sprints: Map<string, SprintUpdate>;
  conflicts: ConflictUpdate[];
  testSlots: Map<number, { occupied: boolean; sprintId?: string }>;
  totalMemoryMb: number;
  usedMemoryMb: number;
}

/**
 * Parallel Status Monitor
 * Subscribes to Redis pub/sub channels and broadcasts updates via WebSocket
 */
export class ParallelStatusMonitor extends EventEmitter {
  private io: SocketIOServer;
  private redis: Redis;
  private redisSub: Redis;
  private state: DashboardState;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(httpServer: HTTPServer, redisUrl: string = 'redis://localhost:6379') {
    super();

    // Initialize Socket.IO
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling']
    });

    // Initialize Redis connections
    this.redis = new Redis(redisUrl);
    this.redisSub = new Redis(redisUrl);

    // Initialize state
    this.state = {
      sprints: new Map(),
      conflicts: [],
      testSlots: new Map([[1, { occupied: false }], [2, { occupied: false }], [3, { occupied: false }], [4, { occupied: false }]]),
      totalMemoryMb: 8192,
      usedMemoryMb: 0
    };

    this.setupSocketHandlers();
    this.setupRedisSubscriptions();
    this.startPeriodicUpdates();
  }

  /**
   * Setup Socket.IO connection handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`WebSocket client connected: ${socket.id}`);

      // Send initial state
      socket.emit('dashboard:update', this.serializeState());

      // Handle dashboard update requests
      socket.on('dashboard:request-update', async () => {
        const freshState = await this.loadStateFromRedis();
        socket.emit('dashboard:update', freshState);
      });

      // Handle sprint subscription
      socket.on('sprint:subscribe', (sprintId: string) => {
        socket.join(`sprint:${sprintId}`);
        console.log(`Client ${socket.id} subscribed to sprint ${sprintId}`);
      });

      // Handle sprint unsubscription
      socket.on('sprint:unsubscribe', (sprintId: string) => {
        socket.leave(`sprint:${sprintId}`);
      });

      socket.on('disconnect', () => {
        console.log(`WebSocket client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Setup Redis pub/sub subscriptions for CFN Loop events
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to CFN parallel coordination channels
    this.redisSub.subscribe(
      'cfn:parallel:sprint:update',
      'cfn:parallel:conflict:update',
      'cfn:parallel:test-slot:update',
      'cfn:parallel:memory:update',
      (err, count) => {
        if (err) {
          console.error('Redis subscription error:', err);
          return;
        }
        console.log(`Subscribed to ${count} Redis channels`);
      }
    );

    // Handle Redis messages
    this.redisSub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        await this.handleRedisMessage(channel, data);
      } catch (error) {
        console.error(`Error processing Redis message from ${channel}:`, error);
      }
    });

    // Pattern-based subscription for all sprint updates
    this.redisSub.psubscribe('cfn:parallel:sprint:*:state', (err, count) => {
      if (err) {
        console.error('Redis pattern subscription error:', err);
      }
    });

    this.redisSub.on('pmessage', async (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        const sprintId = channel.split(':')[3];
        await this.handleSprintUpdate(sprintId, data);
      } catch (error) {
        console.error(`Error processing Redis pattern message from ${channel}:`, error);
      }
    });
  }

  /**
   * Handle Redis pub/sub messages
   */
  private async handleRedisMessage(channel: string, data: any): Promise<void> {
    switch (channel) {
      case 'cfn:parallel:sprint:update':
        await this.handleSprintUpdate(data.sprintId, data);
        break;

      case 'cfn:parallel:conflict:update':
        await this.handleConflictUpdate(data);
        break;

      case 'cfn:parallel:test-slot:update':
        await this.handleTestSlotUpdate(data);
        break;

      case 'cfn:parallel:memory:update':
        await this.handleMemoryUpdate(data);
        break;

      default:
        console.warn(`Unknown Redis channel: ${channel}`);
    }
  }

  /**
   * Handle sprint status update
   */
  private async handleSprintUpdate(sprintId: string, data: any): Promise<void> {
    const update: SprintUpdate = {
      sprintId,
      status: data.status || 'queued',
      wave: data.wave || 1,
      confidence: data.confidence,
      memoryUsageMb: data.memoryUsageMb || 0,
      timestamp: data.timestamp || Date.now()
    };

    this.state.sprints.set(sprintId, update);

    // Broadcast to all clients
    this.io.emit('sprint:update', update);

    // Broadcast to sprint-specific subscribers
    this.io.to(`sprint:${sprintId}`).emit('sprint:detail', update);

    this.emit('sprint:updated', update);
  }

  /**
   * Handle conflict resolution update
   */
  private async handleConflictUpdate(data: ConflictUpdate): Promise<void> {
    // Update or add conflict
    const existingIndex = this.state.conflicts.findIndex(c => c.conflictId === data.conflictId);
    if (existingIndex >= 0) {
      this.state.conflicts[existingIndex] = data;
    } else {
      this.state.conflicts.unshift(data);
    }

    // Keep only last 50 conflicts
    if (this.state.conflicts.length > 50) {
      this.state.conflicts = this.state.conflicts.slice(0, 50);
    }

    // Broadcast to all clients
    this.io.emit('conflict:update', data);

    this.emit('conflict:updated', data);
  }

  /**
   * Handle test slot update
   */
  private async handleTestSlotUpdate(data: {
    slotId: number;
    occupied: boolean;
    sprintId?: string;
  }): Promise<void> {
    this.state.testSlots.set(data.slotId, {
      occupied: data.occupied,
      sprintId: data.sprintId
    });

    // Broadcast to all clients
    this.io.emit('test-slot:update', {
      slotId: data.slotId,
      occupied: data.occupied,
      sprintId: data.sprintId
    });

    this.emit('test-slot:updated', data);
  }

  /**
   * Handle memory usage update
   */
  private async handleMemoryUpdate(data: { usedMemoryMb: number }): Promise<void> {
    this.state.usedMemoryMb = data.usedMemoryMb;

    // Broadcast to all clients
    this.io.emit('memory:update', {
      usedMemoryMb: data.usedMemoryMb,
      totalMemoryMb: this.state.totalMemoryMb,
      percentage: (data.usedMemoryMb / this.state.totalMemoryMb) * 100
    });

    this.emit('memory:updated', data);
  }

  /**
   * Load complete state from Redis
   */
  private async loadStateFromRedis(): Promise<any> {
    try {
      // Load all sprint states
      const sprintKeys = await this.redis.keys('cfn:parallel:sprint:*:state');
      const sprints = [];

      for (const key of sprintKeys) {
        const state = await this.redis.get(key);
        if (state) {
          const data = JSON.parse(state);
          const sprintId = key.split(':')[3];
          sprints.push({
            sprintId,
            status: data.status,
            wave: data.wave,
            confidence: data.confidence,
            estimatedAgents: data.estimatedAgents,
            actualAgents: data.actualAgents || data.estimatedAgents,
            memoryUsageMb: data.memoryUsageMb || data.estimatedAgents * 150,
            startTime: data.startTime,
            endTime: data.endTime
          });
          this.state.sprints.set(sprintId, data);
        }
      }

      // Load wave summaries
      const waveKeys = await this.redis.keys('cfn:parallel:wave:*:status');
      const waves = [];

      for (const key of waveKeys) {
        const state = await this.redis.get(key);
        if (state) {
          const data = JSON.parse(state);
          waves.push(data);
        }
      }

      // Load test slot queue
      const queueLength = await this.redis.llen('cfn:parallel:test-slot-queue');

      // Calculate total memory usage
      const totalMemoryUsage = sprints
        .filter(s => s.status === 'in-progress')
        .reduce((sum, s) => sum + s.memoryUsageMb, 0);

      this.state.usedMemoryMb = totalMemoryUsage;

      return {
        sprints,
        waves,
        testSlots: Array.from(this.state.testSlots.entries()).map(([slotId, data]) => ({
          slotId,
          ...data
        })),
        conflicts: this.state.conflicts,
        totalMemoryMb: this.state.totalMemoryMb,
        availableMemoryMb: this.state.totalMemoryMb - totalMemoryUsage,
        queueDepth: queueLength
      };
    } catch (error) {
      console.error('Error loading state from Redis:', error);
      return this.serializeState();
    }
  }

  /**
   * Serialize current state for WebSocket transmission
   */
  private serializeState(): any {
    return {
      sprints: Array.from(this.state.sprints.values()),
      waves: [], // Would be calculated from sprint data
      testSlots: Array.from(this.state.testSlots.entries()).map(([slotId, data]) => ({
        slotId,
        ...data
      })),
      conflicts: this.state.conflicts,
      totalMemoryMb: this.state.totalMemoryMb,
      availableMemoryMb: this.state.totalMemoryMb - this.state.usedMemoryMb,
      queueDepth: 0 // Would be fetched from Redis
    };
  }

  /**
   * Start periodic state updates
   */
  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(async () => {
      const freshState = await this.loadStateFromRedis();
      this.io.emit('dashboard:update', freshState);
    }, 5000); // Update every 5 seconds
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    await this.redisSub.quit();
    await this.redis.quit();
    this.io.close();
  }

  /**
   * Get Socket.IO server instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }
}

/**
 * Initialize Parallel Status Monitor
 */
export function initializeParallelStatusAPI(httpServer: HTTPServer): ParallelStatusMonitor {
  const monitor = new ParallelStatusMonitor(httpServer);

  console.log('✅ Parallel CFN Loop Status API initialized');
  console.log('   WebSocket endpoint: ws://localhost:3001');
  console.log('   Redis channels:');
  console.log('     - cfn:parallel:sprint:update');
  console.log('     - cfn:parallel:conflict:update');
  console.log('     - cfn:parallel:test-slot:update');
  console.log('     - cfn:parallel:memory:update');

  return monitor;
}

/**
 * Helper function to publish sprint update to Redis
 */
export async function publishSprintUpdate(
  redis: Redis,
  sprintId: string,
  update: Partial<SprintUpdate>
): Promise<void> {
  const message = JSON.stringify({
    sprintId,
    ...update,
    timestamp: Date.now()
  });

  await redis.publish('cfn:parallel:sprint:update', message);
}

/**
 * Helper function to publish conflict update to Redis
 */
export async function publishConflictUpdate(
  redis: Redis,
  conflict: ConflictUpdate
): Promise<void> {
  await redis.publish('cfn:parallel:conflict:update', JSON.stringify(conflict));
}

export default {
  ParallelStatusMonitor,
  initializeParallelStatusAPI,
  publishSprintUpdate,
  publishConflictUpdate
};
