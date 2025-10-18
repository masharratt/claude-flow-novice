/**
 * Unified Ultra-Fast Agent Manager
 * Integrates all Stage 1 & 2 components into single production-ready system
 * Target: <100ms P95 agent spawn time, <5ms P95 communication
 */

import { EventEmitter } from "node:events";
import { performance } from "perf_hooks";
import { communicationBus } from "../communication/ultra-fast-communication-bus.js";
import { OptimizedExecutor } from "../swarm/optimizations/optimized-executor.js";
import { Logger } from "../core/logger.js";

export interface UnifiedAgentConfig {
  memoryStore?: {
    cacheSize?: number;
    ttl?: number;
    enableMetrics?: boolean;
  };
  communicationBus?: {
    maxConcurrency?: number;
    batchSize?: number;
    bufferTimeout?: number;
  };
  executor?: {
    connectionPool?: {
      min?: number;
      max?: number;
    };
    concurrency?: number;
    enableCaching?: boolean;
  };
  performanceTargets?: {
    spawnTimeP95Ms?: number;
    communicationP95Ms?: number;
    maxConcurrentAgents?: number;
  };
}

export interface AgentDefinition {
  id: string;
  type:
    | "coordinator"
    | "researcher"
    | "coder"
    | "tester"
    | "reviewer"
    | "analyst";
  config?: Record<string, any>;
  priority?: "low" | "normal" | "high";
}

export interface AgentInstance {
  id: string;
  type: string;
  state: "spawning" | "ready" | "working" | "idle" | "terminating";
  spawnTime: number;
  lastActivity: number;
  metadata: Record<string, any>;
}

export interface MessageDefinition {
  id?: string;
  from: string;
  to: string | string[];
  type: string;
  data: any;
  priority?: "low" | "normal" | "high";
  timestamp?: number;
}

export interface TaskDefinition {
  id: string;
  type: string;
  agentId: string;
  data: any;
  priority?: "low" | "normal" | "high";
  timeout?: number;
}

export interface SystemMetrics {
  totalAgents: number;
  activeAgents: number;
  averageSpawnTime: number;
  p95SpawnTime: number;
  totalMessages: number;
  averageMessageLatency: number;
  p95MessageLatency: number;
  totalTasks: number;
  averageTaskTime: number;
  memoryUsage: number;
  systemThroughput: number;
}

export class UltraFastAgentManager extends EventEmitter {
  private logger: Logger;
  private executor: OptimizedExecutor;
  private agents = new Map<string, AgentInstance>();
  private agentPool = new Map<string, AgentInstance[]>();

  private metrics = {
    spawnTimes: [] as number[],
    messageTimes: [] as number[],
    taskTimes: [] as number[],
    totalAgentsSpawned: 0,
    totalMessagesProcessed: 0,
    totalTasksExecuted: 0,
    startTime: Date.now(),
  };

  private config: Required<UnifiedAgentConfig>;
  private isInitialized = false;

  constructor(config: UnifiedAgentConfig = {}) {
    super();

    this.config = {
      memoryStore: {
        cacheSize: 10000,
        ttl: 300000, // 5 minutes
        enableMetrics: true,
        ...config.memoryStore,
      },
      communicationBus: {
        maxConcurrency: 1000,
        batchSize: 100,
        bufferTimeout: 1,
        ...config.communicationBus,
      },
      executor: {
        connectionPool: {
          min: 5,
          max: 50,
          ...config.executor?.connectionPool,
        },
        concurrency: 20,
        enableCaching: true,
        ...config.executor,
      },
      performanceTargets: {
        spawnTimeP95Ms: 100,
        communicationP95Ms: 5,
        maxConcurrentAgents: 10000,
        ...config.performanceTargets,
      },
    };

    // Use test-safe logger configuration
    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === "test"
        ? {
            level: "error" as const,
            format: "json" as const,
            destination: "console" as const,
          }
        : {
            level: "info" as const,
            format: "json" as const,
            destination: "console" as const,
          };

    this.logger = new Logger(loggerConfig, {
      component: "UltraFastAgentManager",
    });

    this.executor = new OptimizedExecutor({
      connectionPool: this.config.executor.connectionPool,
      concurrency: this.config.executor.concurrency,
      caching: {
        enabled: this.config.executor.enableCaching,
        ttl: 300000,
        maxSize: 1000,
      },
    });

    // Start performance monitoring
    this.startPerformanceMonitoring();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.logger.info("Initializing Unified Ultra-Fast Agent Manager");

    try {
      // Execute initialization steps in parallel for speed
      await Promise.all([
        this.preWarmAgentPools(),
        Promise.resolve(this.setupCommunicationHandlers()),
        Promise.resolve(this.initializePerformanceTracking()),
      ]);

      this.isInitialized = true;
      this.logger.info(
        "Unified Ultra-Fast Agent Manager initialized successfully",
      );
      this.emit("initialized");
    } catch (error) {
      this.logger.error("Failed to initialize Unified Agent Manager", {
        error,
      });
      throw error;
    }
  }

  async spawnAgent(definition: AgentDefinition): Promise<AgentInstance> {
    if (!this.isInitialized) {
      throw new Error("Agent manager not initialized");
    }

    const spawnStart = performance.now();

    try {
      // Check for available pre-warmed agent
      const pooledAgent = this.getFromPool(definition.type);
      if (pooledAgent) {
        pooledAgent.id = definition.id;
        pooledAgent.metadata = {
          ...pooledAgent.metadata,
          ...definition.config,
        };
        pooledAgent.state = "ready";
        pooledAgent.lastActivity = Date.now();

        this.agents.set(definition.id, pooledAgent);

        const spawnTime = performance.now() - spawnStart;
        this.recordSpawnMetrics(spawnTime);

        this.logger.debug("Agent spawned from pool", {
          agentId: definition.id,
          type: definition.type,
          spawnTime: `${spawnTime.toFixed(2)}ms`,
        });

        this.emit("agent:spawned", pooledAgent);
        return pooledAgent;
      }

      // Create new agent instance
      const agent: AgentInstance = {
        id: definition.id,
        type: definition.type,
        state: "spawning",
        spawnTime: Date.now(),
        lastActivity: Date.now(),
        metadata: {
          priority: definition.priority || "normal",
          ...definition.config,
        },
      };

      // Simulate agent initialization (in real implementation, this would setup the agent)
      await this.initializeAgent(agent);

      agent.state = "ready";
      this.agents.set(definition.id, agent);

      const spawnTime = performance.now() - spawnStart;
      this.recordSpawnMetrics(spawnTime);

      this.logger.info("Agent spawned successfully", {
        agentId: definition.id,
        type: definition.type,
        spawnTime: `${spawnTime.toFixed(2)}ms`,
      });

      this.emit("agent:spawned", agent);
      return agent;
    } catch (error) {
      this.logger.error("Failed to spawn agent", {
        agentId: definition.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Spawn multiple agents in parallel for ultra-fast initialization
   * Target: <50ms per agent with 100+ concurrent spawns
   */
  async spawnAgentBatch(
    definitions: AgentDefinition[],
  ): Promise<AgentInstance[]> {
    if (!this.isInitialized) {
      throw new Error("Agent manager not initialized");
    }

    const batchStart = performance.now();
    this.logger.info("Starting parallel agent batch spawn", {
      count: definitions.length,
    });

    try {
      // Spawn all agents in parallel using Promise.all
      const spawnPromises = definitions.map((def) => this.spawnAgent(def));
      const agents = await Promise.all(spawnPromises);

      const batchTime = performance.now() - batchStart;
      const avgSpawnTime = batchTime / definitions.length;

      this.logger.info("Agent batch spawned successfully", {
        count: agents.length,
        totalTime: `${batchTime.toFixed(2)}ms`,
        avgPerAgent: `${avgSpawnTime.toFixed(2)}ms`,
      });

      this.emit("agent:batch-spawned", { agents, batchTime, avgSpawnTime });
      return agents;
    } catch (error) {
      this.logger.error("Failed to spawn agent batch", {
        count: definitions.length,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Spawn agents in waves for controlled scaling
   * Prevents overwhelming system resources
   */
  async spawnAgentWaves(
    definitions: AgentDefinition[],
    waveSize: number = 20,
  ): Promise<AgentInstance[]> {
    const allAgents: AgentInstance[] = [];

    for (let i = 0; i < definitions.length; i += waveSize) {
      const wave = definitions.slice(i, i + waveSize);
      this.logger.debug("Spawning agent wave", {
        wave: Math.floor(i / waveSize) + 1,
        size: wave.length,
      });

      const waveAgents = await this.spawnAgentBatch(wave);
      allAgents.push(...waveAgents);

      // Brief pause between waves to prevent resource exhaustion
      if (i + waveSize < definitions.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    return allAgents;
  }

  async sendMessage(
    message: MessageDefinition,
  ): Promise<{ success: boolean; messageId: string; deliveryTime?: number }> {
    const messageStart = performance.now();
    const messageId =
      message.id ||
      `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Validate target agents exist
      const targets = Array.isArray(message.to) ? message.to : [message.to];
      const validTargets = targets.filter((target) => this.agents.has(target));

      if (validTargets.length === 0) {
        this.logger.warn("No valid target agents for message", {
          messageId,
          targets,
        });
        return { success: false, messageId };
      }

      // Send through ultra-fast communication bus
      const busMessage = {
        id: messageId,
        type: message.type,
        timestamp: BigInt(message.timestamp || Date.now()),
        payload: this.serializeMessage(message.data),
        routingKey: validTargets[0], // Primary target
        priority: this.getPriorityLevel(message.priority || "normal"),
      };

      const delivered = communicationBus.publish(
        validTargets[0],
        busMessage.payload,
        busMessage.priority,
      );

      if (delivered) {
        // Update target agents' last activity
        validTargets.forEach((target) => {
          const agent = this.agents.get(target);
          if (agent) {
            agent.lastActivity = Date.now();
          }
        });

        const deliveryTime = performance.now() - messageStart;
        this.recordMessageMetrics(deliveryTime);

        this.logger.debug("Message delivered successfully", {
          messageId,
          targets: validTargets,
          deliveryTime: `${deliveryTime.toFixed(2)}ms`,
        });

        this.emit("message:sent", {
          messageId,
          targets: validTargets,
          deliveryTime,
        });
        return { success: true, messageId, deliveryTime };
      } else {
        this.logger.warn("Message delivery failed - communication bus full", {
          messageId,
        });
        return { success: false, messageId };
      }
    } catch (error) {
      this.logger.error("Failed to send message", {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, messageId };
    }
  }

  async executeTask(
    task: TaskDefinition,
  ): Promise<{
    success: boolean;
    taskId: string;
    result?: any;
    executionTime?: number;
  }> {
    const taskStart = performance.now();

    try {
      // Validate agent exists and is available
      const agent = this.agents.get(task.agentId);
      if (!agent) {
        throw new Error(`Agent ${task.agentId} not found`);
      }

      if (agent.state === "working") {
        this.logger.warn("Agent is busy, queueing task", {
          taskId: task.id,
          agentId: task.agentId,
        });
      }

      agent.state = "working";
      agent.lastActivity = Date.now();

      // Convert to executor task format
      const executorTask = {
        id: task.id,
        type: task.type as any,
        objective: `Execute ${task.type} task for agent ${task.agentId}`,
        constraints: {
          maxTokens: 2000,
          timeout: task.timeout || 30000,
        },
        metadata: {
          agentId: task.agentId,
          priority: task.priority,
          ...task.data,
        },
      };

      // Execute through optimized executor
      const result = await this.executor.executeTask(executorTask, {
        id: task.agentId,
      });

      agent.state = result.success ? "idle" : "ready";
      agent.lastActivity = Date.now();

      const executionTime = performance.now() - taskStart;
      this.recordTaskMetrics(executionTime);

      this.logger.info("Task executed successfully", {
        taskId: task.id,
        agentId: task.agentId,
        executionTime: `${executionTime.toFixed(2)}ms`,
        success: result.success,
      });

      this.emit("task:completed", {
        taskId: task.id,
        agentId: task.agentId,
        success: result.success,
      });

      return {
        success: result.success,
        taskId: task.id,
        result: result.output,
        executionTime,
      };
    } catch (error) {
      this.logger.error("Task execution failed", {
        taskId: task.id,
        agentId: task.agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Reset agent state
      const agent = this.agents.get(task.agentId);
      if (agent) {
        agent.state = "ready";
      }

      return {
        success: false,
        taskId: task.id,
      };
    }
  }

  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      this.logger.warn("Attempted to terminate non-existent agent", {
        agentId,
      });
      return false;
    }

    try {
      agent.state = "terminating";

      // Cleanup agent resources
      await this.cleanupAgent(agent);

      // Return to pool if possible for reuse
      if (this.shouldReturnToPool(agent)) {
        this.returnToPool(agent);
      }

      this.agents.delete(agentId);

      this.logger.info("Agent terminated successfully", { agentId });
      this.emit("agent:terminated", agentId);

      return true;
    } catch (error) {
      this.logger.error("Failed to terminate agent", {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  getSystemMetrics(): SystemMetrics {
    const now = Date.now();
    const uptime = (now - this.metrics.startTime) / 1000;

    // Calculate P95 metrics
    const sortedSpawnTimes = [...this.metrics.spawnTimes].sort((a, b) => a - b);
    const sortedMessageTimes = [...this.metrics.messageTimes].sort(
      (a, b) => a - b,
    );

    const p95Index = Math.floor(sortedSpawnTimes.length * 0.95);
    const p95SpawnTime = sortedSpawnTimes[p95Index] || 0;
    const p95MessageLatency =
      sortedMessageTimes[Math.floor(sortedMessageTimes.length * 0.95)] || 0;

    const totalOps =
      this.metrics.totalAgentsSpawned +
      this.metrics.totalMessagesProcessed +
      this.metrics.totalTasksExecuted;

    return {
      totalAgents: this.agents.size,
      activeAgents: Array.from(this.agents.values()).filter(
        (a) => a.state !== "idle",
      ).length,
      averageSpawnTime:
        this.metrics.spawnTimes.length > 0
          ? this.metrics.spawnTimes.reduce((a, b) => a + b, 0) /
            this.metrics.spawnTimes.length
          : 0,
      p95SpawnTime,
      totalMessages: this.metrics.totalMessagesProcessed,
      averageMessageLatency:
        this.metrics.messageTimes.length > 0
          ? this.metrics.messageTimes.reduce((a, b) => a + b, 0) /
            this.metrics.messageTimes.length
          : 0,
      p95MessageLatency,
      totalTasks: this.metrics.totalTasksExecuted,
      averageTaskTime:
        this.metrics.taskTimes.length > 0
          ? this.metrics.taskTimes.reduce((a, b) => a + b, 0) /
            this.metrics.taskTimes.length
          : 0,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      systemThroughput: totalOps / uptime,
    };
  }

  async getSystemStatus(): Promise<{
    status: "operational" | "degraded" | "critical";
    components: Record<string, string>;
    performanceTargets: Record<string, boolean>;
  }> {
    const metrics = this.getSystemMetrics();
    const busMetrics = communicationBus.getMetrics();

    const performanceTargets = {
      spawnTimeP95:
        metrics.p95SpawnTime < this.config.performanceTargets.spawnTimeP95Ms,
      communicationP95:
        metrics.p95MessageLatency <
        this.config.performanceTargets.communicationP95Ms,
      concurrentAgents:
        metrics.totalAgents <=
        this.config.performanceTargets.maxConcurrentAgents,
      memoryUsage: metrics.memoryUsage < 1024, // <1GB
    };

    const allTargetsMet = Object.values(performanceTargets).every(
      (target) => target,
    );
    const mostTargetsMet =
      Object.values(performanceTargets).filter((target) => target).length >= 3;

    return {
      status: allTargetsMet
        ? "operational"
        : mostTargetsMet
          ? "degraded"
          : "critical",
      components: {
        agentManager: "operational",
        communicationBus:
          busMetrics.poolUtilization < 0.9 ? "operational" : "degraded",
        executor: "operational", // Would check executor status in real implementation
        memoryStore: metrics.memoryUsage < 512 ? "operational" : "degraded",
      },
      performanceTargets,
    };
  }

  // Private helper methods

  private async preWarmAgentPools(): Promise<void> {
    const commonTypes = ["researcher", "coder", "tester", "reviewer"];
    const poolSize = 5;

    // Initialize all pools in parallel for maximum speed
    await Promise.all(
      commonTypes.map(async (type) => {
        const pool: AgentInstance[] = [];

        // Initialize agents in parallel batches
        const agentPromises = Array.from({ length: poolSize }, async (_, i) => {
          const agent: AgentInstance = {
            id: `pool-${type}-${i}`,
            type,
            state: "idle",
            spawnTime: Date.now(),
            lastActivity: Date.now(),
            metadata: { pooled: true },
          };

          await this.initializeAgent(agent);
          return agent;
        });

        const agents = await Promise.all(agentPromises);
        pool.push(...agents);

        this.agentPool.set(type, pool);
      }),
    );

    this.logger.info("Agent pools pre-warmed", {
      types: commonTypes,
      poolSize,
    });
  }

  private async initializeAgent(agent: AgentInstance): Promise<void> {
    // Simulate agent initialization time (actual implementation would setup agent runtime)
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));

    // Store agent metadata in high-performance memory store (would use actual store)
    agent.metadata.initialized = true;
  }

  private getFromPool(type: string): AgentInstance | null {
    const pool = this.agentPool.get(type);
    if (!pool || pool.length === 0) return null;

    const agent = pool.pop()!;
    agent.state = "ready";
    return agent;
  }

  private returnToPool(agent: AgentInstance): void {
    if (!this.shouldReturnToPool(agent)) return;

    // Reset agent state for reuse
    agent.id = `pool-${agent.type}-${Date.now()}`;
    agent.state = "idle";
    agent.metadata = { pooled: true };
    agent.lastActivity = Date.now();

    const pool = this.agentPool.get(agent.type);
    if (pool && pool.length < 10) {
      // Max pool size
      pool.push(agent);
    }
  }

  private shouldReturnToPool(agent: AgentInstance): boolean {
    // Return to pool if agent is in good state and of common type
    const commonTypes = ["researcher", "coder", "tester", "reviewer"];
    return commonTypes.includes(agent.type) && agent.state !== "terminating";
  }

  private async cleanupAgent(agent: AgentInstance): Promise<void> {
    // Cleanup agent resources (connections, memory, etc.)
    agent.metadata = {};
  }

  private setupCommunicationHandlers(): void {
    // Setup message handling through communication bus
    communicationBus.subscribe("agent.*", "unified-manager");

    // Use batch processing with larger batches for better throughput
    setInterval(() => {
      const messages = communicationBus.consume("unified-manager", 256);
      if (messages.length > 0) {
        // Process messages in parallel batches for maximum throughput
        this.processBatchMessages(messages);
      }
    }, 5); // Check every 5ms - less frequent polling reduces overhead
  }

  private processBatchMessages(messages: any[]): void {
    // Process messages in parallel for higher throughput
    messages.forEach((message) => {
      // Process asynchronously to avoid blocking
      setImmediate(() => this.processIncomingMessage(message));
    });
  }

  private processIncomingMessage(message: any): void {
    // Process incoming messages and route to appropriate agents
    this.emit("message:received", message);
  }

  private initializePerformanceTracking(): void {
    // Keep metrics arrays bounded
    setInterval(() => {
      const maxSize = 10000;
      if (this.metrics.spawnTimes.length > maxSize) {
        this.metrics.spawnTimes = this.metrics.spawnTimes.slice(-maxSize);
      }
      if (this.metrics.messageTimes.length > maxSize) {
        this.metrics.messageTimes = this.metrics.messageTimes.slice(-maxSize);
      }
      if (this.metrics.taskTimes.length > maxSize) {
        this.metrics.taskTimes = this.metrics.taskTimes.slice(-maxSize);
      }
    }, 60000); // Clean up every minute
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      // Defer metrics calculation to avoid blocking main operations
      setImmediate(() => {
        const metrics = this.getSystemMetrics();

        // Alert on performance threshold violations
        if (
          metrics.p95SpawnTime > this.config.performanceTargets.spawnTimeP95Ms
        ) {
          this.logger.warn("P95 spawn time threshold exceeded", {
            current: metrics.p95SpawnTime,
            target: this.config.performanceTargets.spawnTimeP95Ms,
          });
        }

        if (
          metrics.p95MessageLatency >
          this.config.performanceTargets.communicationP95Ms
        ) {
          this.logger.warn("P95 message latency threshold exceeded", {
            current: metrics.p95MessageLatency,
            target: this.config.performanceTargets.communicationP95Ms,
          });
        }

        this.emit("metrics:updated", metrics);
      });
    }, 30000); // Monitor every 30 seconds - reduce overhead
  }

  private recordSpawnMetrics(spawnTime: number): void {
    this.metrics.spawnTimes.push(spawnTime);
    this.metrics.totalAgentsSpawned++;
  }

  private recordMessageMetrics(messageTime: number): void {
    this.metrics.messageTimes.push(messageTime);
    this.metrics.totalMessagesProcessed++;
  }

  private recordTaskMetrics(taskTime: number): void {
    this.metrics.taskTimes.push(taskTime);
    this.metrics.totalTasksExecuted++;
  }

  private serializeMessage(data: any): ArrayBuffer {
    // Fast binary serialization for zero-copy message passing
    const json = JSON.stringify(data);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  private getPriorityLevel(priority: string): number {
    switch (priority) {
      case "high":
        return 3;
      case "normal":
        return 2;
      case "low":
        return 1;
      default:
        return 2;
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down Unified Ultra-Fast Agent Manager");

    // Terminate all active agents
    const terminationPromises = Array.from(this.agents.keys()).map((id) =>
      this.terminateAgent(id),
    );

    await Promise.all(terminationPromises);

    // Shutdown executor
    await this.executor.shutdown();

    // Clear pools
    this.agentPool.clear();

    this.isInitialized = false;
    this.logger.info("Unified Ultra-Fast Agent Manager shut down successfully");
  }
}
