import { createClient } from 'redis';

/**
 * CFN Loop Metrics API
 *
 * Provides real-time access to CFN Loop execution metrics stored in Redis.
 * Uses Redis pub/sub for live updates and key-value store for state.
 */

export interface CFNLoopMetrics {
  taskId: string;
  iteration: number;
  maxIterations: number;
  loop3Confidence: number[];
  loop2Consensus: number;
  productOwnerDecision: 'PROCEED' | 'ITERATE' | 'ABORT' | 'PENDING';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  lastUpdate: string;
  agents: {
    loop3: string[];
    loop2: string[];
    productOwner: string;
  };
}

export interface CFNLoopEvent {
  type: 'iteration' | 'confidence' | 'consensus' | 'decision' | 'status';
  taskId: string;
  data: any;
  timestamp: string;
}

/**
 * CFNMetricsClient - Real-time CFN Loop metrics from Redis
 */
export class CFNMetricsClient {
  private redisClient: ReturnType<typeof createClient> | null = null;
  private subscriptionClient: ReturnType<typeof createClient> | null = null;
  private isConnected = false;

  constructor(
    private redisUrl: string = 'redis://localhost:6379'
  ) {}

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    this.redisClient = createClient({ url: this.redisUrl });
    this.subscriptionClient = createClient({ url: this.redisUrl });

    await Promise.all([
      this.redisClient.connect(),
      this.subscriptionClient.connect(),
    ]);

    this.isConnected = true;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    await Promise.all([
      this.redisClient?.quit(),
      this.subscriptionClient?.quit(),
    ]);

    this.isConnected = false;
  }

  /**
   * Get metrics for specific task
   */
  async getMetrics(taskId: string): Promise<CFNLoopMetrics | null> {
    if (!this.isConnected) await this.connect();

    try {
      const contextKey = `swarm:${taskId}:epic-context`;
      const successCriteriaKey = `swarm:${taskId}:success-criteria`;

      const [contextData, successCriteriaData] = await Promise.all([
        this.redisClient!.get(contextKey),
        this.redisClient!.get(successCriteriaKey),
      ]);

      if (!contextData && !successCriteriaData) {
        return null;
      }

      const context = contextData ? JSON.parse(contextData) : {};
      const successCriteria = successCriteriaData ? JSON.parse(successCriteriaData) : {};

      // Get agent confidence scores
      const loop3AgentKeys = await this.redisClient!.keys(`swarm:${taskId}:*-*-*:confidence`);
      const loop3Confidence: number[] = [];
      const loop3AgentIds: string[] = [];

      for (const key of loop3AgentKeys) {
        const confidence = await this.redisClient!.get(key);
        if (confidence) {
          loop3Confidence.push(parseFloat(confidence));
          const agentId = key.split(':')[2].split(':confidence')[0];
          loop3AgentIds.push(agentId);
        }
      }

      // Get Loop 2 consensus
      const consensusKey = `swarm:${taskId}:consensus`;
      const consensusData = await this.redisClient!.get(consensusKey);
      const loop2Consensus = consensusData ? parseFloat(consensusData) : 0;

      // Get product owner decision
      const decisionKey = `swarm:${taskId}:product-owner-decision`;
      const decisionData = await this.redisClient!.get(decisionKey);
      const productOwnerDecision = (decisionData as any) || 'PENDING';

      // Get iteration count
      const iterationKey = `swarm:${taskId}:iteration`;
      const iterationData = await this.redisClient!.get(iterationKey);
      const iteration = iterationData ? parseInt(iterationData, 10) : 1;

      // Get status
      const statusKey = `swarm:${taskId}:status`;
      const statusData = await this.redisClient!.get(statusKey);
      const status = (statusData as any) || 'running';

      // Get timestamps
      const startTimeKey = `swarm:${taskId}:start-time`;
      const startTimeData = await this.redisClient!.get(startTimeKey);
      const startTime = startTimeData || new Date().toISOString();

      const lastUpdateKey = `swarm:${taskId}:last-update`;
      const lastUpdateData = await this.redisClient!.get(lastUpdateKey);
      const lastUpdate = lastUpdateData || new Date().toISOString();

      return {
        taskId,
        iteration,
        maxIterations: successCriteria.maxIterations || 10,
        loop3Confidence,
        loop2Consensus,
        productOwnerDecision,
        status,
        startTime,
        lastUpdate,
        agents: {
          loop3: loop3AgentIds,
          loop2: context.loop2Agents || [],
          productOwner: context.productOwner || 'product-owner',
        },
      };
    } catch (error) {
      console.error('Error fetching CFN Loop metrics:', error);
      return null;
    }
  }

  /**
   * Get latest active task metrics
   */
  async getLatestMetrics(): Promise<CFNLoopMetrics | null> {
    if (!this.isConnected) await this.connect();

    try {
      // Find all active tasks
      const taskKeys = await this.redisClient!.keys('swarm:*:status');

      if (taskKeys.length === 0) {
        return null;
      }

      // Get the most recent task
      const tasks = await Promise.all(
        taskKeys.map(async (key) => {
          const taskId = key.split(':')[1];
          const lastUpdateKey = `swarm:${taskId}:last-update`;
          const lastUpdate = await this.redisClient!.get(lastUpdateKey);
          return {
            taskId,
            lastUpdate: lastUpdate || '1970-01-01T00:00:00.000Z',
          };
        })
      );

      tasks.sort((a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime()
      );

      const latestTaskId = tasks[0].taskId;
      return this.getMetrics(latestTaskId);
    } catch (error) {
      console.error('Error fetching latest CFN Loop metrics:', error);
      return null;
    }
  }

  /**
   * Subscribe to real-time CFN Loop events
   */
  async subscribe(
    taskId: string,
    callback: (event: CFNLoopEvent) => void
  ): Promise<void> {
    if (!this.isConnected) await this.connect();

    const pattern = `swarm:${taskId}:*`;

    await this.subscriptionClient!.pSubscribe(pattern, (message, channel) => {
      const parts = channel.split(':');
      const eventType = parts[parts.length - 1];

      const event: CFNLoopEvent = {
        type: this.mapEventType(eventType),
        taskId,
        data: this.parseMessage(message),
        timestamp: new Date().toISOString(),
      };

      callback(event);
    });
  }

  /**
   * Unsubscribe from CFN Loop events
   */
  async unsubscribe(taskId: string): Promise<void> {
    if (!this.isConnected) return;

    const pattern = `swarm:${taskId}:*`;
    await this.subscriptionClient!.pUnsubscribe(pattern);
  }

  /**
   * List all active CFN Loop tasks
   */
  async listActiveTasks(): Promise<string[]> {
    if (!this.isConnected) await this.connect();

    try {
      const keys = await this.redisClient!.keys('swarm:*:status');
      const taskIds = keys.map((key) => key.split(':')[1]);
      return [...new Set(taskIds)]; // Remove duplicates
    } catch (error) {
      console.error('Error listing active tasks:', error);
      return [];
    }
  }

  /**
   * Get historical metrics for a task
   */
  async getHistoricalMetrics(
    taskId: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<CFNLoopMetrics[]> {
    // This would require additional Redis data structure (e.g., sorted sets)
    // For now, return current metrics only
    const current = await this.getMetrics(taskId);
    return current ? [current] : [];
  }

  /**
   * Clear metrics for a task (admin operation)
   */
  async clearMetrics(taskId: string): Promise<void> {
    if (!this.isConnected) await this.connect();

    const keys = await this.redisClient!.keys(`swarm:${taskId}:*`);
    if (keys.length > 0) {
      await this.redisClient!.del(keys);
    }
  }

  private mapEventType(eventType: string): CFNLoopEvent['type'] {
    switch (eventType) {
      case 'iteration':
        return 'iteration';
      case 'confidence':
        return 'confidence';
      case 'consensus':
        return 'consensus';
      case 'product-owner-decision':
        return 'decision';
      case 'status':
        return 'status';
      default:
        return 'status';
    }
  }

  private parseMessage(message: string): any {
    try {
      return JSON.parse(message);
    } catch {
      return message;
    }
  }
}

/**
 * Singleton instance for API routes
 */
let metricsClient: CFNMetricsClient | null = null;

export function getCFNMetricsClient(redisUrl?: string): CFNMetricsClient {
  if (!metricsClient) {
    metricsClient = new CFNMetricsClient(redisUrl);
  }
  return metricsClient;
}

/**
 * Express/Fastify middleware for CFN metrics endpoints
 */
export async function cfnMetricsHandler(req: any, res: any) {
  const { taskId } = req.params;
  const client = getCFNMetricsClient();

  try {
    await client.connect();

    if (taskId) {
      const metrics = await client.getMetrics(taskId);
      if (!metrics) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json(metrics);
    } else {
      const metrics = await client.getLatestMetrics();
      if (!metrics) {
        return res.status(404).json({ error: 'No active tasks found' });
      }
      return res.json(metrics);
    }
  } catch (error) {
    console.error('Error in CFN metrics handler:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * WebSocket handler for real-time updates
 */
export async function cfnMetricsWebSocketHandler(ws: any, taskId: string) {
  const client = getCFNMetricsClient();

  try {
    await client.connect();

    // Send initial metrics
    const initialMetrics = await client.getMetrics(taskId);
    ws.send(JSON.stringify({ type: 'initial', data: initialMetrics }));

    // Subscribe to updates
    await client.subscribe(taskId, (event) => {
      ws.send(JSON.stringify({ type: 'update', data: event }));
    });

    // Handle client disconnect
    ws.on('close', async () => {
      await client.unsubscribe(taskId);
    });
  } catch (error) {
    console.error('Error in CFN metrics WebSocket handler:', error);
    ws.close(1011, 'Internal server error');
  }
}

export default {
  CFNMetricsClient,
  getCFNMetricsClient,
  cfnMetricsHandler,
  cfnMetricsWebSocketHandler,
};
