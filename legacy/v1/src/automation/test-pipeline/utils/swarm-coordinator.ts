/**
 * SwarmCoordinator - Utility for coordinating test execution across swarm agents
 * Provides hooks and coordination mechanisms for distributed testing
 */

interface SwarmAgent {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  capabilities: string[];
  currentTask?: string;
  performance: {
    tasksCompleted: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

interface CoordinationHook {
  id: string;
  type:
    | 'pre-task'
    | 'post-task'
    | 'pre-edit'
    | 'post-edit'
    | 'notify'
    | 'session-restore'
    | 'session-end';
  timestamp: Date;
  agentId?: string;
  taskId?: string;
  data: any;
}

interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskTime: number;
  parallelEfficiency: number;
  resourceUtilization: number;
}

export class SwarmCoordinator {
  private agents: Map<string, SwarmAgent> = new Map();
  private hooks: CoordinationHook[] = [];
  private sessionId: string;
  private isActive = false;
  private metrics: SwarmMetrics;
  private memoryStore: Map<string, any> = new Map();

  constructor(sessionId?: string) {
    this.sessionId =
      sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize swarm coordination
   */
  async initialize(): Promise<void> {
    console.log(`🤖 Initializing Swarm Coordinator for session: ${this.sessionId}`);

    try {
      // Load existing session if available
      await this.loadSession();

      // Initialize memory store
      await this.initializeMemoryStore();

      // Setup coordination hooks
      this.setupCoordinationHooks();

      this.isActive = true;
      console.log('✅ Swarm Coordinator initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Swarm Coordinator:', error);
      throw error;
    }
  }

  /**
   * Register an agent with the swarm
   */
  registerAgent(agentConfig: Partial<SwarmAgent>): string {
    const agent: SwarmAgent = {
      id: agentConfig.id || `agent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: agentConfig.name || `Agent-${this.agents.size + 1}`,
      type: agentConfig.type || 'generic',
      status: 'idle',
      capabilities: agentConfig.capabilities || [],
      performance: {
        tasksCompleted: 0,
        averageExecutionTime: 0,
        successRate: 100,
      },
    };

    this.agents.set(agent.id, agent);
    this.updateMetrics();

    console.log(`🤖 Registered agent: ${agent.name} (${agent.id})`);
    return agent.id;
  }

  /**
   * Execute pre-task hook for coordination
   */
  async executePreTaskHook(taskDescription: string, agentId?: string): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'pre-task',
      timestamp: new Date(),
      agentId,
      data: { description: taskDescription },
    };

    this.hooks.push(hook);

    // Notify other agents about the upcoming task
    await this.broadcastHook(hook);

    // Store task context in memory
    if (agentId) {
      this.memoryStore.set(`task_context_${agentId}`, {
        description: taskDescription,
        startTime: new Date(),
        status: 'starting',
      });
    }

    console.log(`🚀 Pre-task hook executed: ${taskDescription}`);
  }

  /**
   * Execute post-task hook for coordination
   */
  async executePostTaskHook(taskId: string, agentId?: string, result?: any): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'post-task',
      timestamp: new Date(),
      agentId,
      taskId,
      data: { result },
    };

    this.hooks.push(hook);

    // Update agent performance metrics
    if (agentId) {
      await this.updateAgentPerformance(agentId, result?.success !== false);
    }

    // Broadcast completion to other agents
    await this.broadcastHook(hook);

    // Update memory store
    const contextKey = `task_context_${agentId}`;
    const context = this.memoryStore.get(contextKey);
    if (context) {
      context.endTime = new Date();
      context.status = result?.success !== false ? 'completed' : 'failed';
      context.result = result;
      this.memoryStore.set(contextKey, context);
    }

    console.log(`✅ Post-task hook executed for task: ${taskId}`);
  }

  /**
   * Execute post-edit hook for file coordination
   */
  async executePostEditHook(filePath: string, memoryKey: string, agentId?: string): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'post-edit',
      timestamp: new Date(),
      agentId,
      data: { filePath, memoryKey },
    };

    this.hooks.push(hook);

    // Store file change information in memory
    this.memoryStore.set(memoryKey, {
      filePath,
      timestamp: new Date(),
      agentId,
      action: 'edited',
    });

    // Notify other agents about the file change
    await this.broadcastHook(hook);

    console.log(`📝 Post-edit hook executed for file: ${filePath}`);
  }

  /**
   * Execute notification hook for inter-agent communication
   */
  async executeNotifyHook(
    message: string,
    agentId?: string,
    targetAgents?: string[],
  ): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'notify',
      timestamp: new Date(),
      agentId,
      data: { message, targetAgents },
    };

    this.hooks.push(hook);

    // Store notification in memory for target agents
    const notificationKey = `notification_${hook.id}`;
    this.memoryStore.set(notificationKey, {
      message,
      fromAgent: agentId,
      targetAgents: targetAgents || [],
      timestamp: new Date(),
      read: false,
    });

    // Broadcast or send to specific agents
    if (targetAgents) {
      await this.sendToSpecificAgents(hook, targetAgents);
    } else {
      await this.broadcastHook(hook);
    }

    console.log(`📢 Notification sent: ${message}`);
  }

  /**
   * Execute session restore hook
   */
  async executeSessionRestoreHook(sessionId: string): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'session-restore',
      timestamp: new Date(),
      data: { sessionId },
    };

    this.hooks.push(hook);

    // Restore session data from memory
    await this.restoreSessionData(sessionId);

    console.log(`🔄 Session restore hook executed for: ${sessionId}`);
  }

  /**
   * Execute session end hook with metrics export
   */
  async executeSessionEndHook(exportMetrics: boolean = true): Promise<void> {
    const hook: CoordinationHook = {
      id: `hook_${Date.now()}`,
      type: 'session-end',
      timestamp: new Date(),
      data: { exportMetrics, sessionId: this.sessionId },
    };

    this.hooks.push(hook);

    if (exportMetrics) {
      await this.exportSessionMetrics();
    }

    // Archive session data
    await this.archiveSession();

    console.log(`🏁 Session end hook executed for: ${this.sessionId}`);
  }

  /**
   * Find the best agent for a specific task
   */
  findBestAgent(requiredCapabilities: string[], taskType?: string): SwarmAgent | null {
    const availableAgents = Array.from(this.agents.values()).filter(
      (agent) =>
        agent.status === 'idle' &&
        requiredCapabilities.every((cap) => agent.capabilities.includes(cap)),
    );

    if (!availableAgents.length) return null;

    // Sort by performance metrics
    availableAgents.sort((a, b) => {
      const scoreA =
        a.performance.successRate * 0.7 +
        (1 / Math.max(a.performance.averageExecutionTime, 1)) * 0.3;
      const scoreB =
        b.performance.successRate * 0.7 +
        (1 / Math.max(b.performance.averageExecutionTime, 1)) * 0.3;
      return scoreB - scoreA;
    });

    return availableAgents[0];
  }

  /**
   * Distribute tasks across available agents with load balancing
   */
  distributeTasks(tasks: any[], capabilities: string[]): Map<string, any[]> {
    const distribution = new Map<string, any[]>();
    const availableAgents = Array.from(this.agents.values()).filter(
      (agent) =>
        agent.status === 'idle' && capabilities.every((cap) => agent.capabilities.includes(cap)),
    );

    if (!availableAgents.length) return distribution;

    // Initialize distribution map
    availableAgents.forEach((agent) => distribution.set(agent.id, []));

    // Distribute tasks using round-robin with performance weighting
    const sortedAgents = availableAgents.sort(
      (a, b) => b.performance.successRate - a.performance.successRate,
    );

    tasks.forEach((task, index) => {
      const agent = sortedAgents[index % sortedAgents.length];
      distribution.get(agent.id)!.push(task);
    });

    return distribution;
  }

  /**
   * Get current swarm status and metrics
   */
  getSwarmStatus(): any {
    this.updateMetrics();

    return {
      sessionId: this.sessionId,
      isActive: this.isActive,
      agents: Array.from(this.agents.values()),
      metrics: this.metrics,
      recentHooks: this.hooks.slice(-10),
      memoryStoreSize: this.memoryStore.size,
    };
  }

  /**
   * Get agent performance analytics
   */
  getAgentAnalytics(): any {
    const analytics = {
      totalAgents: this.agents.size,
      agentPerformance: Array.from(this.agents.values()).map((agent) => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        performance: agent.performance,
        efficiency: this.calculateAgentEfficiency(agent),
      })),
      topPerformers: this.getTopPerformingAgents(3),
      bottlenecks: this.identifyBottlenecks(),
    };

    return analytics;
  }

  /**
   * Retrieve shared memory data
   */
  getMemoryData(key: string): any {
    return this.memoryStore.get(key);
  }

  /**
   * Store shared memory data
   */
  setMemoryData(key: string, data: any): void {
    this.memoryStore.set(key, data);
  }

  /**
   * Search memory data by pattern
   */
  searchMemoryData(pattern: string): Map<string, any> {
    const results = new Map();

    for (const [key, value] of this.memoryStore.entries()) {
      if (key.includes(pattern)) {
        results.set(key, value);
      }
    }

    return results;
  }

  /**
   * Shutdown swarm coordinator
   */
  async shutdown(): Promise<void> {
    if (!this.isActive) return;

    console.log('🛑 Shutting down Swarm Coordinator');

    // Execute session end hook
    await this.executeSessionEndHook(true);

    // Archive all data
    await this.archiveSession();

    this.isActive = false;
    console.log('✅ Swarm Coordinator shut down successfully');
  }

  // Private helper methods
  private initializeMetrics(): SwarmMetrics {
    return {
      totalAgents: 0,
      activeAgents: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
      parallelEfficiency: 0,
      resourceUtilization: 0,
    };
  }

  private updateMetrics(): void {
    const agents = Array.from(this.agents.values());

    this.metrics.totalAgents = agents.length;
    this.metrics.activeAgents = agents.filter((a) => a.status === 'busy').length;
    this.metrics.completedTasks = agents.reduce((sum, a) => sum + a.performance.tasksCompleted, 0);

    const totalExecutionTime = agents.reduce(
      (sum, a) => sum + a.performance.averageExecutionTime * a.performance.tasksCompleted,
      0,
    );

    this.metrics.averageTaskTime =
      this.metrics.completedTasks > 0 ? totalExecutionTime / this.metrics.completedTasks : 0;

    this.metrics.parallelEfficiency =
      this.metrics.totalAgents > 0
        ? (this.metrics.activeAgents / this.metrics.totalAgents) * 100
        : 0;

    this.metrics.resourceUtilization = this.calculateResourceUtilization();
  }

  private calculateResourceUtilization(): number {
    const agents = Array.from(this.agents.values());
    if (!agents.length) return 0;

    const busyAgents = agents.filter((a) => a.status === 'busy').length;
    return (busyAgents / agents.length) * 100;
  }

  private calculateAgentEfficiency(agent: SwarmAgent): number {
    if (agent.performance.tasksCompleted === 0) return 0;

    const successWeight = 0.6;
    const speedWeight = 0.4;
    const maxReasonableTime = 60000; // 60 seconds

    const successScore = agent.performance.successRate;
    const speedScore = Math.max(
      0,
      100 - (agent.performance.averageExecutionTime / maxReasonableTime) * 100,
    );

    return successScore * successWeight + speedScore * speedWeight;
  }

  private getTopPerformingAgents(count: number): SwarmAgent[] {
    return Array.from(this.agents.values())
      .sort((a, b) => this.calculateAgentEfficiency(b) - this.calculateAgentEfficiency(a))
      .slice(0, count);
  }

  private identifyBottlenecks(): any[] {
    const agents = Array.from(this.agents.values());
    const bottlenecks = [];

    // Identify slow agents
    const averageTime = this.metrics.averageTaskTime;
    const slowAgents = agents.filter(
      (a) =>
        a.performance.averageExecutionTime > averageTime * 1.5 && a.performance.tasksCompleted > 0,
    );

    if (slowAgents.length) {
      bottlenecks.push({
        type: 'slow-agents',
        agents: slowAgents.map((a) => ({
          id: a.id,
          name: a.name,
          averageTime: a.performance.averageExecutionTime,
        })),
      });
    }

    // Identify agents with low success rates
    const lowSuccessAgents = agents.filter(
      (a) => a.performance.successRate < 80 && a.performance.tasksCompleted > 2,
    );

    if (lowSuccessAgents.length) {
      bottlenecks.push({
        type: 'low-success-rate',
        agents: lowSuccessAgents.map((a) => ({
          id: a.id,
          name: a.name,
          successRate: a.performance.successRate,
        })),
      });
    }

    return bottlenecks;
  }

  private async broadcastHook(hook: CoordinationHook): Promise<void> {
    // Simulate broadcasting hook to all agents
    console.log(`📡 Broadcasting hook ${hook.type} to all agents`);
  }

  private async sendToSpecificAgents(hook: CoordinationHook, agentIds: string[]): Promise<void> {
    // Simulate sending hook to specific agents
    console.log(`📤 Sending hook ${hook.type} to agents: ${agentIds.join(', ')}`);
  }

  private async updateAgentPerformance(agentId: string, success: boolean): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const taskContext = this.memoryStore.get(`task_context_${agentId}`);
    let executionTime = 0;

    if (taskContext && taskContext.startTime) {
      executionTime = Date.now() - taskContext.startTime.getTime();
    }

    // Update performance metrics
    const currentTasks = agent.performance.tasksCompleted;
    const currentAvgTime = agent.performance.averageExecutionTime;

    agent.performance.tasksCompleted += 1;
    agent.performance.averageExecutionTime =
      (currentAvgTime * currentTasks + executionTime) / agent.performance.tasksCompleted;

    // Update success rate
    const currentSuccessCount = Math.round((agent.performance.successRate / 100) * currentTasks);
    const newSuccessCount = currentSuccessCount + (success ? 1 : 0);
    agent.performance.successRate = (newSuccessCount / agent.performance.tasksCompleted) * 100;

    // Update agent status
    agent.status = 'idle';
    agent.currentTask = undefined;
  }

  private setupCoordinationHooks(): void {
    // Setup periodic metrics updates
    setInterval(() => {
      this.updateMetrics();
    }, 5000);
  }

  private async loadSession(): Promise<void> {
    // Load existing session data if available
    const sessionData = this.memoryStore.get(`session_${this.sessionId}`);
    if (sessionData) {
      console.log(`📋 Loaded existing session data for: ${this.sessionId}`);
    }
  }

  private async initializeMemoryStore(): Promise<void> {
    // Initialize shared memory store for agent coordination
    this.memoryStore.set(`session_${this.sessionId}`, {
      created: new Date(),
      lastAccess: new Date(),
    });
  }

  private async restoreSessionData(sessionId: string): Promise<void> {
    // Restore session data from specified session
    const sessionData = this.memoryStore.get(`session_${sessionId}`);
    if (sessionData) {
      console.log(`🔄 Restored session data from: ${sessionId}`);
    }
  }

  private async exportSessionMetrics(): Promise<void> {
    const metricsExport = {
      sessionId: this.sessionId,
      timestamp: new Date(),
      metrics: this.metrics,
      agents: Array.from(this.agents.values()),
      hooks: this.hooks,
      analytics: this.getAgentAnalytics(),
    };

    // Store metrics export in memory for retrieval
    this.memoryStore.set(`metrics_export_${this.sessionId}`, metricsExport);
    console.log(`📊 Exported session metrics for: ${this.sessionId}`);
  }

  private async archiveSession(): Promise<void> {
    const archiveData = {
      sessionId: this.sessionId,
      timestamp: new Date(),
      agents: Array.from(this.agents.values()),
      hooks: this.hooks,
      memoryData: Object.fromEntries(this.memoryStore.entries()),
      metrics: this.metrics,
    };

    // Store archive data
    this.memoryStore.set(`archive_${this.sessionId}`, archiveData);
    console.log(`🗄️ Archived session data for: ${this.sessionId}`);
  }
}
