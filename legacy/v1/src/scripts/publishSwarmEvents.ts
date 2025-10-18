#!/usr/bin/env node

/**
 * Redis Swarm Event Publisher
 *
 * This script publishes swarm coordination events to Redis for the visualization system.
 * It simulates swarm activity and publishes real-time updates to the visualization channel.
 */

import { createClient, RedisClientType } from 'redis';

interface SwarmEvent {
  type: string;
  swarmId: string;
  timestamp: string;
  data: any;
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
  lastUpdate: string;
  position?: { x: number; y: number };
}

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string[];
  progress: number;
  startTime: string;
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

class SwarmEventPublisher {
  private redisClient: RedisClientType;
  private redisPublisher: RedisClientType;
  private isRunning: boolean = false;
  private eventInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(
    private swarmId: string = 'phase-6-swarm-visualization',
    private redisHost: string = process.env.REDIS_HOST || 'localhost',
    private redisPort: number = parseInt(process.env.REDIS_PORT || '6379')
  ) {
    this.redisClient = createClient({
      socket: { host: this.redisHost, port: this.redisPort }
    });

    this.redisPublisher = createClient({
      socket: { host: this.redisHost, port: this.redisPort }
    });
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Swarm Event Publisher...');
      console.log(`📊 Swarm ID: ${this.swarmId}`);
      console.log(`🔴 Redis: ${this.redisHost}:${this.redisPort}`);

      // Connect to Redis
      await Promise.all([
        this.redisClient.connect(),
        this.redisPublisher.connect()
      ]);

      console.log('✅ Connected to Redis');

      // Start publishing events
      this.isRunning = true;
      this.startEventPublishing();
      this.startMetricsPublishing();

      console.log('✅ Swarm Event Publisher started successfully!');

      // Set up graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      console.error('❌ Failed to start event publisher:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Swarm Event Publisher...');

    this.isRunning = false;

    if (this.eventInterval) {
      clearInterval(this.eventInterval);
      this.eventInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Publish stop event
    await this.publishEvent('swarm-stopped', {
      timestamp: new Date().toISOString()
    });

    // Close Redis connections
    await Promise.all([
      this.redisClient.quit(),
      this.redisPublisher.quit()
    ]);

    console.log('✅ Swarm Event Publisher stopped');
  }

  private async publishEvent(type: string, data: any): Promise<void> {
    try {
      const event: SwarmEvent = {
        type,
        swarmId: this.swarmId,
        timestamp: new Date().toISOString(),
        data
      };

      const message = JSON.stringify(event);

      // Publish to visualization channel
      await this.redisPublisher.publish('swarm:phase-6:visualization', message);

      // Also publish to general swarm updates channel
      await this.redisPublisher.publish('swarm:updates', message);

      console.log(`📤 Published event: ${type}`);

    } catch (error) {
      console.error(`❌ Failed to publish event ${type}:`, error);
    }
  }

  private startEventPublishing(): void {
    // Initial swarm start event
    this.publishEvent('swarm-started', {
      phase: 'Phase 6',
      objective: 'Real-Time Swarm Visualization Implementation',
      agents: ['UI Designer', 'Backend Developer', 'System Architect', 'Performance Analyzer']
    });

    // Spawn agents
    setTimeout(() => {
      this.publishEvent('agent-spawned', {
        agentId: 'agent-1',
        agentName: 'UI Designer',
        agentRole: 'ui-designer',
        confidence: 0.92
      });
    }, 1000);

    setTimeout(() => {
      this.publishEvent('agent-spawned', {
        agentId: 'agent-2',
        agentName: 'Backend Developer',
        agentRole: 'backend-dev',
        confidence: 0.88
      });
    }, 2000);

    setTimeout(() => {
      this.publishEvent('agent-spawned', {
        agentId: 'agent-3',
        agentName: 'System Architect',
        agentRole: 'architect',
        confidence: 0.95
      });
    }, 3000);

    setTimeout(() => {
      this.publishEvent('agent-spawned', {
        agentId: 'agent-4',
        agentName: 'Performance Analyzer',
        agentRole: 'perf-analyzer',
        confidence: 0.90
      });
    }, 4000);

    // Create tasks
    setTimeout(() => {
      this.publishEvent('task-created', {
        taskId: 'task-1',
        taskTitle: 'Create swarm visualization components',
        assignedTo: ['agent-1'],
        priority: 'high'
      });
    }, 5000);

    setTimeout(() => {
      this.publishEvent('task-created', {
        taskId: 'task-2',
        taskTitle: 'Implement WebSocket handlers',
        assignedTo: ['agent-2'],
        priority: 'high'
      });
    }, 6000);

    setTimeout(() => {
      this.publishEvent('task-created', {
        taskId: 'task-3',
        taskTitle: 'Design data flow architecture',
        assignedTo: ['agent-3'],
        priority: 'medium'
      });
    }, 7000);

    // Periodic events
    this.eventInterval = setInterval(async () => {
      // Update agent statuses
      const agentUpdates = [
        {
          agentId: 'agent-1',
          updates: {
            status: Math.random() > 0.3 ? 'active' : 'processing',
            confidence: 0.85 + Math.random() * 0.15,
            processingTime: 800 + Math.random() * 1200,
            memoryUsage: 30 + Math.random() * 40
          }
        },
        {
          agentId: 'agent-2',
          updates: {
            status: Math.random() > 0.2 ? 'processing' : 'active',
            confidence: 0.80 + Math.random() * 0.20,
            processingTime: 1000 + Math.random() * 2000,
            memoryUsage: 40 + Math.random() * 30
          }
        },
        {
          agentId: 'agent-3',
          updates: {
            status: 'active',
            confidence: 0.90 + Math.random() * 0.10,
            processingTime: 500 + Math.random() * 800,
            memoryUsage: 20 + Math.random() * 30
          }
        },
        {
          agentId: 'agent-4',
          updates: {
            status: Math.random() > 0.7 ? 'active' : 'idle',
            confidence: 0.85 + Math.random() * 0.15,
            processingTime: Math.random() > 0.5 ? 300 + Math.random() * 700 : 0,
            memoryUsage: 15 + Math.random() * 25
          }
        }
      ];

      for (const update of agentUpdates) {
        await this.publishEvent('agent-updated', update);
      }

      // Update task progress
      const taskUpdates = [
        {
          taskId: 'task-1',
          updates: {
            progress: Math.min(100, 60 + Math.random() * 10),
            status: Math.random() > 0.8 ? 'completed' : 'in-progress'
          }
        },
        {
          taskId: 'task-2',
          updates: {
            progress: Math.min(100, 40 + Math.random() * 15),
            status: 'in-progress'
          }
        },
        {
          taskId: 'task-3',
          updates: {
            progress: 100,
            status: 'completed'
          }
        }
      ];

      for (const update of taskUpdates) {
        await this.publishEvent('task-updated', update);
      }

      // Occasionally publish consensus events
      if (Math.random() > 0.9) {
        await this.publishEvent('consensus-reached', {
          consensus: 'Continue with current implementation',
          confidence: 0.87 + Math.random() * 0.13,
          participatingAgents: 4,
          votingResults: {
            'agent-1': 0.92,
            'agent-2': 0.88,
            'agent-3': 0.95,
            'agent-4': 0.85
          }
        });
      }

    }, 2000); // Every 2 seconds
  }

  private startMetricsPublishing(): void {
    this.metricsInterval = setInterval(async () => {
      const metrics: SwarmMetrics = {
        totalAgents: 4,
        activeAgents: 2 + Math.floor(Math.random() * 2),
        completedTasks: 1 + Math.floor(Math.random() * 2),
        totalTasks: 3,
        averageConfidence: 0.85 + Math.random() * 0.15,
        systemHealth: 85 + Math.random() * 15,
        processingTime: 2000 + Math.random() * 3000,
        memoryUsage: 30 + Math.random() * 40,
        networkLatency: 10 + Math.random() * 50
      };

      await this.publishEvent('metrics-update', metrics);

    }, 3000); // Every 3 seconds
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const swarmIdIndex = args.indexOf('--swarm-id');
  const swarmId = swarmIdIndex !== -1 && args[swarmIdIndex + 1]
    ? args[swarmIdIndex + 1]
    : 'phase-6-swarm-visualization';

  const publisher = new SwarmEventPublisher(swarmId);
  publisher.start().catch(console.error);
}

export default SwarmEventPublisher;