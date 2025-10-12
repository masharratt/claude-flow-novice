import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { EventBus } from '../core/event-bus.js';
import { generateId } from '../utils/helpers.js';
import { SwarmMonitor } from './swarm-monitor.js';
import type { AdvancedTaskScheduler } from './advanced-scheduler.js';
import { MemoryManager } from '../memory/manager.js';
import { AgentExecutor } from './agent-executor.js';
import { ProviderManager } from '../providers/provider-manager.js';
import { createClient } from 'redis';

export interface SwarmAgent {
  id: string;
  name: string;
  type: 'researcher' | 'coder' | 'analyst' | 'coordinator' | 'reviewer';
  status: 'idle' | 'busy' | 'failed' | 'completed';
  capabilities: string[];
  currentTask?: SwarmTask;
  processId?: number;
  terminalId?: string;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    totalDuration: number;
    lastActivity: Date;
  };
}

export interface SwarmTask {
  id: string;
  type: string;
  description: string;
  priority: number;
  dependencies: string[];
  assignedTo?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
  timeout?: number;
}

export interface SwarmObjective {
  id: string;
  description: string;
  strategy: 'auto' | 'research' | 'development' | 'analysis';
  tasks: SwarmTask[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface SwarmConfig {
  id?: string;
  objective?: string;
  topology?: 'mesh' | 'hierarchical';
  maxAgents: number;
  maxConcurrentTasks: number;
  taskTimeout: number;
  enableMonitoring: boolean;
  enableWorkStealing: boolean;
  enableCircuitBreaker: boolean;
  enableSQLiteMemory?: boolean; // Default: true. Set to false for Redis-only state storage
  memoryNamespace: string;
  coordinationStrategy: 'centralized' | 'distributed' | 'hybrid';
  backgroundTaskInterval: number;
  healthCheckInterval: number;
  maxRetries: number;
  backoffMultiplier: number;
  providerConfig?: any;
  configManager?: any; // ConfigManager instance for ProviderManager initialization
  redisUrl?: string;
}

export class SwarmCoordinator extends EventEmitter {
  private id: string;
  private logger: Logger;
  private config: SwarmConfig;
  private agents: Map<string, SwarmAgent>;
  private objectives: Map<string, SwarmObjective>;
  private tasks: Map<string, SwarmTask>;
  private monitor?: SwarmMonitor;
  private scheduler?: AdvancedTaskScheduler;
  private memoryManager: MemoryManager;
  private backgroundWorkers: Map<string, NodeJS.Timeout>;
  private isRunning: boolean = false;
  private workStealer?: any;
  private circuitBreaker?: any;
  private agentExecutor?: AgentExecutor;
  private providerManager?: ProviderManager;
  private redisClient?: any;

  constructor(config: Partial<SwarmConfig> = {}, logger?: Logger) {
    super();
    this.id = config.id || generateId('swarm');
    this.logger = logger || new Logger({ level: 'info', format: 'text', destination: 'console' }, { component: 'SwarmCoordinator' });
    this.config = {
      maxAgents: 10,
      maxConcurrentTasks: 5,
      taskTimeout: 300000, // 5 minutes
      enableMonitoring: true,
      enableWorkStealing: true,
      enableCircuitBreaker: true,
      enableSQLiteMemory: true, // Default: true for backward compatibility
      memoryNamespace: 'swarm',
      coordinationStrategy: 'hybrid',
      backgroundTaskInterval: 5000, // 5 seconds
      healthCheckInterval: 10000, // 10 seconds
      maxRetries: 3,
      backoffMultiplier: 2,
      ...config,
    };

    this.agents = new Map();
    this.objectives = new Map();
    this.tasks = new Map();
    this.backgroundWorkers = new Map();

    // Initialize memory manager
    const eventBus = EventBus.getInstance();
    this.memoryManager = new MemoryManager(
      {
        backend: 'sqlite',
        cacheSizeMB: 50,
        syncInterval: 5000,
        conflictResolution: 'last-write',
        retentionDays: 30,
      },
      eventBus,
      this.logger,
    );

    if (this.config.enableMonitoring) {
      this.monitor = new SwarmMonitor({
        updateInterval: 1000,
        enableAlerts: true,
        enableHistory: true,
      });
    }

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Monitor events
    if (this.monitor) {
      this.monitor.on('alert', (alert: any) => {
        this.handleMonitorAlert(alert);
      });
    }

    // Add custom event handlers for swarm coordination
    this.on('task:completed', (data: any) => {
      this.handleTaskCompleted(data.taskId, data.result);
    });

    this.on('task:failed', (data: any) => {
      this.handleTaskFailed(data.taskId, data.error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Swarm coordinator already running');
      return;
    }

    this.logger.info('Starting swarm coordinator...');
    this.isRunning = true;

    // Initialize memory manager ONLY if SQLite enabled
    if (this.config.enableSQLiteMemory !== false) {
      this.logger.info('Initializing SQLite memory manager...');
      await this.memoryManager.initialize();
    } else {
      this.logger.info('SQLite memory disabled, using Redis-only state storage');
    }

    // Initialize Redis if URL provided
    if (this.config.redisUrl) {
      this.redisClient = createClient({ url: this.config.redisUrl });
      await this.redisClient.connect();
    }

    // Initialize ProviderManager if config provided
    if (this.config.providerConfig && this.config.configManager) {
      this.providerManager = new ProviderManager(
        this.logger,
        this.config.configManager,
        this.config.providerConfig
      );

      // Initialize ProviderManager (async provider initialization)
      await this.providerManager.init();

      // Create AgentExecutor if we have both ProviderManager and Redis
      if (this.redisClient) {
        this.agentExecutor = new AgentExecutor(
          this.providerManager,
          this.logger,
          this.redisClient,
        );
      }
    }

    if (this.monitor) {
      await this.monitor.start();
    }

    // Start background workers
    this.startBackgroundWorkers();

    this.emit('coordinator:started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping swarm coordinator...');
    this.isRunning = false;

    // Stop background workers
    this.stopBackgroundWorkers();

    // Stop subsystems
    await this.scheduler.shutdown();

    if (this.monitor) {
      this.monitor.stop();
    }

    // Cleanup Redis
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    // Cleanup ProviderManager
    if (this.providerManager) {
      await this.providerManager.destroy();
    }

    this.emit('coordinator:stopped');
  }

  private startBackgroundWorkers(): void {
    // Task processor worker
    const taskProcessor = setInterval(() => {
      this.processBackgroundTasks();
    }, this.config.backgroundTaskInterval);
    this.backgroundWorkers.set('taskProcessor', taskProcessor);

    // Health check worker
    const healthChecker = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
    this.backgroundWorkers.set('healthChecker', healthChecker);

    // Work stealing worker
    if (this.workStealer) {
      const workStealerWorker = setInterval(() => {
        this.performWorkStealing();
      }, this.config.backgroundTaskInterval);
      this.backgroundWorkers.set('workStealer', workStealerWorker);
    }

    // Memory sync worker
    const memorySync = setInterval(() => {
      this.syncMemoryState();
    }, this.config.backgroundTaskInterval * 2);
    this.backgroundWorkers.set('memorySync', memorySync);
  }

  private stopBackgroundWorkers(): void {
    for (const [name, worker] of this.backgroundWorkers) {
      clearInterval(worker);
      this.logger.debug(`Stopped background worker: ${name}`);
    }
    this.backgroundWorkers.clear();
  }

  async createObjective(
    description: string,
    strategy: SwarmObjective['strategy'] = 'auto',
  ): Promise<string> {
    const objectiveId = generateId('objective');
    const objective: SwarmObjective = {
      id: objectiveId,
      description,
      strategy,
      tasks: [],
      status: 'planning',
      createdAt: new Date(),
    };

    this.objectives.set(objectiveId, objective);
    this.logger.info(`Created objective: ${objectiveId} - ${description}`);

    // Decompose objective into tasks
    const tasks = await this.decomposeObjective(objective);
    objective.tasks = tasks;

    // Store in memory (if SQLite enabled)
    if (this.config.enableSQLiteMemory !== false) {
      await this.memoryManager.store({
        id: `objective:${objectiveId}`,
        agentId: 'swarm-coordinator',
        sessionId: this.id,
        type: 'artifact',
        content: JSON.stringify(objective),
        context: {
          type: 'objective',
          strategy,
          taskCount: tasks.length,
        },
        timestamp: new Date(),
        tags: ['objective', strategy],
        version: 1,
        metadata: {
          objectiveId,
          namespace: this.config.memoryNamespace,
        },
      });
    } else if (this.redisClient) {
      // Fallback to Redis for state storage
      await this.redisClient.set(
        `${this.config.memoryNamespace}:objective:${objectiveId}`,
        JSON.stringify(objective),
        { EX: 3600 } // 1 hour TTL
      );
    }

    this.emit('objective:created', objective);
    return objectiveId;
  }

  private async decomposeObjective(objective: SwarmObjective): Promise<SwarmTask[]> {
    const tasks: SwarmTask[] = [];

    switch (objective.strategy) {
      case 'research':
        tasks.push(
          this.createTask('research', 'Gather information and research materials', 1),
          this.createTask('analysis', 'Analyze research findings', 2, ['research']),
          this.createTask('synthesis', 'Synthesize insights and create report', 3, ['analysis']),
        );
        break;

      case 'development':
        tasks.push(
          this.createTask('planning', 'Plan architecture and design', 1),
          this.createTask('implementation', 'Implement core functionality', 2, ['planning']),
          this.createTask('testing', 'Test and validate implementation', 3, ['implementation']),
          this.createTask('documentation', 'Create documentation', 3, ['implementation']),
          this.createTask('review', 'Peer review and refinement', 4, ['testing', 'documentation']),
        );
        break;

      case 'analysis':
        tasks.push(
          this.createTask('data-collection', 'Collect and prepare data', 1),
          this.createTask('analysis', 'Perform detailed analysis', 2, ['data-collection']),
          this.createTask('visualization', 'Create visualizations', 3, ['analysis']),
          this.createTask('reporting', 'Generate final report', 4, ['analysis', 'visualization']),
        );
        break;

      default: // auto
        // Use AI to decompose based on objective description
        tasks.push(
          this.createTask('exploration', 'Explore and understand requirements', 1),
          this.createTask('planning', 'Create execution plan', 2, ['exploration']),
          this.createTask('execution', 'Execute main tasks', 3, ['planning']),
          this.createTask('validation', 'Validate and test results', 4, ['execution']),
          this.createTask('completion', 'Finalize and document', 5, ['validation']),
        );
    }

    // Register tasks
    tasks.forEach((task) => {
      this.tasks.set(task.id, task);
    });

    return tasks;
  }

  private createTask(
    type: string,
    description: string,
    priority: number,
    dependencies: string[] = [],
  ): SwarmTask {
    return {
      id: generateId('task'),
      type,
      description,
      priority,
      dependencies,
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      timeout: this.config.taskTimeout,
    };
  }

  async registerAgent(
    name: string,
    type: SwarmAgent['type'],
    capabilities: string[] = [],
  ): Promise<string> {
    const agentId = generateId('agent');
    const agent: SwarmAgent = {
      id: agentId,
      name,
      type,
      status: 'idle',
      capabilities,
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalDuration: 0,
        lastActivity: new Date(),
      },
    };

    this.agents.set(agentId, agent);

    if (this.monitor) {
      this.monitor.registerAgent(agentId, name);
    }

    // Register with work stealer if enabled
    if (this.workStealer) {
      this.workStealer.registerWorker(agentId, 1);
    }

    this.logger.info(`Registered agent: ${name} (${agentId}) - Type: ${type}`);
    this.emit('agent:registered', agent);

    return agentId;
  }

  async assignTask(taskId: string, agentId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const agent = this.agents.get(agentId);

    if (!task || !agent) {
      throw new Error('Task or agent not found');
    }

    if (agent.status !== 'idle') {
      throw new Error('Agent is not available');
    }

    // Check circuit breaker
    if (this.circuitBreaker && !this.circuitBreaker.canExecute(agentId)) {
      throw new Error('Agent circuit breaker is open');
    }

    task.assignedTo = agentId;
    task.status = 'running';
    task.startedAt = new Date();

    agent.status = 'busy';
    agent.currentTask = task;

    if (this.monitor) {
      this.monitor.taskStarted(agentId, taskId, task.description);
    }

    this.logger.info(`Assigned task ${taskId} to agent ${agentId}`);
    this.emit('task:assigned', { task, agent });

    // Execute task in background
    this.executeTask(task, agent);
  }

  private async executeTask(task: SwarmTask, agent: SwarmAgent): Promise<void> {
    try {
      // Use real agent execution via AgentExecutor
      const result = await this.executeAgentTask(task, agent);

      await this.handleTaskCompleted(task.id, result);
    } catch (error) {
      await this.handleTaskFailed(task.id, error);
    }
  }

  private async executeAgentTask(task: SwarmTask, agent: SwarmAgent): Promise<any> {
    if (!this.agentExecutor) {
      // Fallback to simulation if AgentExecutor not initialized
      return await this.simulateTaskExecution(task, agent);
    }

    try {
      // Use AgentExecutor for real Z.ai-powered execution
      const result = await this.agentExecutor.executeAgent(
        task.description,
        agent.type as any,
      );

      return result;
    } catch (error) {
      this.logger.error('Agent execution failed:', error);
      throw error;
    }
  }

  private async simulateTaskExecution(task: SwarmTask, agent: SwarmAgent): Promise<any> {
    // This is where we would actually spawn Claude processes
    // For now, simulate with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Task timeout'));
      }, task.timeout || this.config.taskTimeout);

      // Simulate work
      setTimeout(
        () => {
          clearTimeout(timeout);
          resolve({
            taskId: task.id,
            agentId: agent.id,
            result: `Completed ${task.type} task`,
            timestamp: new Date(),
          });
        },
        Math.random() * 5000 + 2000,
      );
    });
  }

  private async handleTaskCompleted(taskId: string, result: any): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const agent = task.assignedTo ? this.agents.get(task.assignedTo) : null;

    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;

    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.metrics.tasksCompleted++;
      agent.metrics.totalDuration += task.completedAt.getTime() - (task.startedAt?.getTime() || 0);
      agent.metrics.lastActivity = new Date();

      if (this.monitor) {
        this.monitor.taskCompleted(agent.id, taskId);
      }

      if (this.circuitBreaker) {
        this.circuitBreaker.recordSuccess(agent.id);
      }
    }

    // Store result in memory (if SQLite enabled)
    if (this.config.enableSQLiteMemory !== false) {
      await this.memoryManager.store({
        id: `task:${taskId}:result`,
        agentId: agent?.id || 'unknown',
        sessionId: this.id,
        type: 'artifact',
        content: JSON.stringify(result),
        context: {
          type: 'task-result',
          taskType: task.type,
          taskId,
        },
        timestamp: new Date(),
        tags: ['task-result', task.type],
        version: 1,
        metadata: {
          agentId: agent?.id,
          namespace: this.config.memoryNamespace,
        },
      });
    } else if (this.redisClient) {
      // Fallback to Redis for state storage
      await this.redisClient.set(
        `${this.config.memoryNamespace}:task:${taskId}:result`,
        JSON.stringify(result),
        { EX: 3600 } // 1 hour TTL
      );
    }

    this.logger.info(`Task ${taskId} completed successfully`);
    this.emit('task:completed', { task, result });

    // Check if objective is complete
    this.checkObjectiveCompletion(task);
  }

  private async handleTaskFailed(taskId: string, error: any): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const agent = task.assignedTo ? this.agents.get(task.assignedTo) : null;

    task.error = (error instanceof Error ? error.message : String(error)) || String(error);
    task.retryCount++;

    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.metrics.tasksFailed++;
      agent.metrics.lastActivity = new Date();

      if (this.monitor) {
        this.monitor.taskFailed(agent.id, taskId, task.error);
      }

      if (this.circuitBreaker) {
        this.circuitBreaker.recordFailure(agent.id);
      }
    }

    // Retry logic
    if (task.retryCount < task.maxRetries) {
      task.status = 'pending';
      task.assignedTo = undefined;
      this.logger.warn(`Task ${taskId} failed, will retry (${task.retryCount}/${task.maxRetries})`);
      this.emit('task:retry', { task, error });
    } else {
      task.status = 'failed';
      task.completedAt = new Date();
      this.logger.error(`Task ${taskId} failed after ${task.retryCount} retries`);
      this.emit('task:failed', { task, error });
    }
  }

  private checkObjectiveCompletion(completedTask: SwarmTask): void {
    for (const [objectiveId, objective] of this.objectives) {
      if (objective.status !== 'executing') continue;

      const allTasksComplete = objective.tasks.every((task) => {
        const t = this.tasks.get(task.id);
        return t && (t.status === 'completed' || t.status === 'failed');
      });

      if (allTasksComplete) {
        objective.status = 'completed';
        objective.completedAt = new Date();
        this.logger.info(`Objective ${objectiveId} completed`);
        this.emit('objective:completed', objective);
      }
    }
  }

  private async processBackgroundTasks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Process pending tasks
      const pendingTasks = Array.from(this.tasks.values()).filter(
        (t) => t.status === 'pending' && this.areDependenciesMet(t),
      );

      // Get available agents
      const availableAgents = Array.from(this.agents.values()).filter((a) => a.status === 'idle');

      // Assign tasks to agents
      for (const task of pendingTasks) {
        if (availableAgents.length === 0) break;

        const agent = this.selectBestAgent(task, availableAgents);
        if (agent) {
          try {
            await this.assignTask(task.id, agent.id);
            availableAgents.splice(availableAgents.indexOf(agent), 1);
          } catch (error) {
            this.logger.error(`Failed to assign task ${task.id}:`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing background tasks:', error);
    }
  }

  private areDependenciesMet(task: SwarmTask): boolean {
    return task.dependencies.every((depId) => {
      const dep = this.tasks.get(depId);
      return dep && dep.status === 'completed';
    });
  }

  private selectBestAgent(task: SwarmTask, availableAgents: SwarmAgent[]): SwarmAgent | null {
    // Simple selection based on task type and agent capabilities
    const compatibleAgents = availableAgents.filter((agent) => {
      // Match task type to agent type
      if (task.type.includes('research') && agent.type === 'researcher') return true;
      if (task.type.includes('implement') && agent.type === 'coder') return true;
      if (task.type.includes('analysis') && agent.type === 'analyst') return true;
      if (task.type.includes('review') && agent.type === 'reviewer') return true;
      return agent.type === 'coordinator'; // Coordinator can do any task
    });

    if (compatibleAgents.length === 0) {
      return availableAgents[0]; // Fallback to any available agent
    }

    // Select agent with best performance metrics
    return compatibleAgents.reduce((best, agent) => {
      const bestRatio = best.metrics.tasksCompleted / (best.metrics.tasksFailed + 1);
      const agentRatio = agent.metrics.tasksCompleted / (agent.metrics.tasksFailed + 1);
      return agentRatio > bestRatio ? agent : best;
    });
  }

  private async performHealthChecks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const now = new Date();

      for (const [agentId, agent] of this.agents) {
        // Check for stalled agents
        if (agent.status === 'busy' && agent.currentTask) {
          const taskDuration = now.getTime() - (agent.currentTask.startedAt?.getTime() || 0);
          if (taskDuration > this.config.taskTimeout) {
            this.logger.warn(`Agent ${agentId} appears stalled on task ${agent.currentTask.id}`);
            await this.handleTaskFailed(agent.currentTask.id, new Error('Task timeout'));
          }
        }

        // Check agent health
        const inactivityTime = now.getTime() - agent.metrics.lastActivity.getTime();
        if (inactivityTime > this.config.healthCheckInterval * 3) {
          this.logger.warn(
            `Agent ${agentId} has been inactive for ${Math.round(inactivityTime / 1000)}s`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error performing health checks:', error);
    }
  }

  private async performWorkStealing(): Promise<void> {
    if (!this.isRunning || !this.workStealer) return;

    try {
      // Get agent workloads
      const workloads = new Map<string, number>();
      for (const [agentId, agent] of this.agents) {
        workloads.set(agentId, agent.status === 'busy' ? 1 : 0);
      }

      // Update work stealer
      this.workStealer.updateLoads(workloads);

      // Check for work stealing opportunities
      const stealingSuggestions = this.workStealer.suggestWorkStealing();

      for (const suggestion of stealingSuggestions) {
        this.logger.debug(`Work stealing suggestion: ${suggestion.from} -> ${suggestion.to}`);
        // In a real implementation, we would reassign tasks here
      }
    } catch (error) {
      this.logger.error('Error performing work stealing:', error);
    }
  }

  private async syncMemoryState(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Sync current state to memory
      const state = {
        objectives: Array.from(this.objectives.values()),
        tasks: Array.from(this.tasks.values()),
        agents: Array.from(this.agents.values()).map((a) => ({
          ...a,
          currentTask: undefined, // Don't store transient state
        })),
        timestamp: new Date(),
      };

      // Store in memory (if SQLite enabled)
      if (this.config.enableSQLiteMemory !== false) {
        await this.memoryManager.store({
          id: 'swarm:state',
          agentId: 'swarm-coordinator',
          sessionId: this.id,
          type: 'artifact',
          content: JSON.stringify(state),
          context: {
            type: 'swarm-state',
            objectiveCount: state.objectives.length,
            taskCount: state.tasks.length,
            agentCount: state.agents.length,
          },
          timestamp: new Date(),
          tags: ['swarm-state'],
          version: 1,
          metadata: {
            namespace: this.config.memoryNamespace,
          },
        });
      } else if (this.redisClient) {
        // Fallback to Redis for state storage
        await this.redisClient.set(
          `${this.config.memoryNamespace}:swarm:state`,
          JSON.stringify(state),
          { EX: 3600 } // 1 hour TTL
        );
      }
    } catch (error) {
      this.logger.error('Error syncing memory state:', error);
    }
  }

  private handleMonitorAlert(alert: any): void {
    this.logger.warn(`Monitor alert: ${alert.message}`);
    this.emit('monitor:alert', alert);
  }

  private handleAgentMessage(message: any): void {
    this.logger.debug(`Agent message: ${message.type} from ${message.from}`);
    this.emit('agent:message', message);
  }

  // Public API methods
  async executeObjective(objectiveId: string): Promise<void> {
    const objective = this.objectives.get(objectiveId);
    if (!objective) {
      throw new Error('Objective not found');
    }

    objective.status = 'executing';
    this.logger.info(`Executing objective: ${objectiveId}`);
    this.emit('objective:started', objective);

    // Tasks will be processed by background workers
  }

  getObjectiveStatus(objectiveId: string): SwarmObjective | undefined {
    return this.objectives.get(objectiveId);
  }

  getAgentStatus(agentId: string): SwarmAgent | undefined {
    return this.agents.get(agentId);
  }

  getSwarmStatus(): {
    objectives: number;
    tasks: { total: number; pending: number; running: number; completed: number; failed: number };
    agents: { total: number; idle: number; busy: number; failed: number };
    uptime: number;
  } {
    const tasks = Array.from(this.tasks.values());
    const agents = Array.from(this.agents.values());

    return {
      objectives: this.objectives.size,
      tasks: {
        total: tasks.length,
        pending: tasks.filter((t) => t.status === 'pending').length,
        running: tasks.filter((t) => t.status === 'running').length,
        completed: tasks.filter((t) => t.status === 'completed').length,
        failed: tasks.filter((t) => t.status === 'failed').length,
      },
      agents: {
        total: agents.length,
        idle: agents.filter((a) => a.status === 'idle').length,
        busy: agents.filter((a) => a.status === 'busy').length,
        failed: agents.filter((a) => a.status === 'failed').length,
      },
      uptime: this.monitor ? this.monitor.getSummary().uptime : 0,
    };
  }

  /**
   * Add a task to the coordinator for processing
   * @param task Task definition with id, description, priority, dependencies, and metadata
   */
  async addTask(task: Partial<SwarmTask> & { id: string; description: string }): Promise<void> {
    const fullTask: SwarmTask = {
      type: task.type || 'generic',
      priority: task.priority || 1,
      dependencies: task.dependencies || [],
      status: 'pending',
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: task.maxRetries || this.config.maxRetries,
      timeout: task.timeout || this.config.taskTimeout,
      ...task,
    };

    this.tasks.set(fullTask.id, fullTask);
    this.logger.debug(`Added task ${fullTask.id} to coordinator`);

    // If coordinator is running and task has no dependencies, try to assign immediately
    if (this.isRunning && this.areDependenciesMet(fullTask)) {
      const availableAgents = Array.from(this.agents.values()).filter((a) => a.status === 'idle');
      if (availableAgents.length > 0) {
        const agent = this.selectBestAgent(fullTask, availableAgents);
        if (agent) {
          try {
            await this.assignTask(fullTask.id, agent.id);
          } catch (error) {
            this.logger.error(`Failed to auto-assign task ${fullTask.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * Get current status of the coordinator
   * @returns Status object with task counts and metrics
   */
  getStatus(): {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    pendingTasks: number;
    runningTasks: number;
    activeAgents: number;
    idleAgents: number;
  } {
    const tasks = Array.from(this.tasks.values());
    const agents = Array.from(this.agents.values());

    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === 'completed').length,
      failedTasks: tasks.filter((t) => t.status === 'failed').length,
      pendingTasks: tasks.filter((t) => t.status === 'pending').length,
      runningTasks: tasks.filter((t) => t.status === 'running').length,
      activeAgents: agents.filter((a) => a.status === 'busy').length,
      idleAgents: agents.filter((a) => a.status === 'idle').length,
    };
  }
}
