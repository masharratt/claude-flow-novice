/**
 * Resource Allocation Optimizer with Priority-Based Scheduling
 * Implements intelligent task assignment and conflict detection
 */

import Redis from 'ioredis';
import EventEmitter from 'events';

class ResourceOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      priorities: {
        critical: 1.0,
        high: 0.8,
        normal: 0.6,
        low: 0.4,
        background: 0.2
      },
      scheduling: {
        maxConcurrentTasks: 10,
        taskTimeout: 300000, // 5 minutes
        conflictThreshold: 0.7,
        rebalanceInterval: 30000 // 30 seconds
      },
      resources: {
        cpu: { total: 100, allocated: 0 },
        memory: { total: 1000, allocated: 0 }, // MB
        agents: { total: 50, allocated: 0 }
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      },
      ...config
    };

    this.redis = new Redis(this.config.redis);
    this.tasks = new Map();
    this.assignments = new Map();
    this.conflicts = new Map();
    this.isRunning = false;

    // Performance metrics
    this.metrics = {
      tasksAssigned: 0,
      tasksCompleted: 0,
      conflictsDetected: 0,
      avgAssignmentTime: 0,
      resourceUtilization: {
        cpu: 0,
        memory: 0,
        agents: 0
      }
    };
  }

  /**
   * Start the resource optimizer
   */
  async start() {
    if (this.isRunning) {
      console.log('Resource Optimizer is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Resource Optimizer...');

    // Start periodic rebalancing
    this.rebalanceInterval = setInterval(async () => {
      await this.rebalanceResources();
    }, this.config.scheduling.rebalanceInterval);

    // Subscribe to task events
    await this.redis.subscribe('swarm:tasks');
    this.redis.on('message', async (channel, message) => {
      if (channel === 'swarm:tasks') {
        await this.handleTaskEvent(message);
      }
    });

    this.emit('started', { timestamp: Date.now() });
  }

  /**
   * Stop the resource optimizer
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping Resource Optimizer...');

    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
    }

    await this.redis.unsubscribe('swarm:tasks');
    await this.redis.quit();

    this.emit('stopped', {
      timestamp: Date.now(),
      finalMetrics: this.metrics
    });
  }

  /**
   * Assign a task to the optimal agent
   */
  async assignTask(task) {
    const startTime = Date.now();

    try {
      // Validate task requirements
      const validatedTask = this.validateTask(task);

      // Find conflicts
      const conflicts = await this.detectConflicts(validatedTask);
      if (conflicts.length > 0) {
        await this.handleConflicts(validatedTask, conflicts);
      }

      // Find optimal agent
      const optimalAgent = await this.findOptimalAgent(validatedTask);
      if (!optimalAgent) {
        throw new Error('No suitable agent available');
      }

      // Create assignment
      const assignment = {
        taskId: validatedTask.id,
        agentId: optimalAgent.id,
        assignedAt: Date.now(),
        priority: validatedTask.priority,
        resources: validatedTask.resources,
        status: 'assigned'
      };

      // Store assignment
      this.assignments.set(validatedTask.id, assignment);
      this.tasks.set(validatedTask.id, validatedTask);

      // Update resource allocation
      this.updateResourceAllocation(validatedTask.resources, 'allocate');

      // Update agent state
      await this.updateAgentState(optimalAgent.id, 'busy', validatedTask);

      // Calculate assignment time
      const assignmentTime = Date.now() - startTime;
      this.updateAssignmentMetrics(assignmentTime);

      // Publish assignment event
      await this.publishEvent('task_assigned', {
        taskId: validatedTask.id,
        agentId: optimalAgent.id,
        assignmentTime,
        confidence: optimalAgent.confidence
      });

      this.metrics.tasksAssigned++;
      this.emit('taskAssigned', { task: validatedTask, agent: optimalAgent });

      return {
        success: true,
        taskId: validatedTask.id,
        agentId: optimalAgent.id,
        estimatedCompletion: this.estimateCompletion(validatedTask, optimalAgent)
      };

    } catch (error) {
      console.error('Task assignment failed:', error);
      await this.publishEvent('assignment_failed', {
        taskId: task.id,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate task requirements and normalize
   */
  validateTask(task) {
    const validatedTask = {
      id: task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: task.type || 'general',
      priority: this.config.priorities[task.priority] || this.config.priorities.normal,
      resources: {
        cpu: task.resources?.cpu || 10,
        memory: task.resources?.memory || 100,
        duration: task.resources?.duration || 60000, // 1 minute default
        ...task.resources
      },
      requirements: {
        capabilities: task.requirements?.capabilities || [],
        minAgentVersion: task.requirements?.minAgentVersion || '1.0.0',
        ...task.requirements
      },
      metadata: {
        createdAt: Date.now(),
        retries: 0,
        ...task.metadata
      }
    };

    // Validate resource requirements
    if (validatedTask.resources.cpu > this.config.resources.total) {
      throw new Error(`CPU requirement ${validatedTask.resources.cpu} exceeds available ${this.config.resources.total}`);
    }

    if (validatedTask.resources.memory > this.config.resources.totalMemory) {
      throw new Error(`Memory requirement ${validatedTask.resources.memory} exceeds available ${this.config.resources.totalMemory}`);
    }

    return validatedTask;
  }

  /**
   * Detect resource conflicts with existing assignments
   */
  async detectConflicts(task) {
    const conflicts = [];
    const threshold = this.config.scheduling.conflictThreshold;

    // Check resource conflicts
    const totalCPU = this.config.resources.allocated + task.resources.cpu;
    const totalMemory = this.config.resources.allocated + task.resources.memory;
    const totalAgents = this.assignments.size + 1;

    if (totalCPU / this.config.resources.total > threshold) {
      conflicts.push({
        type: 'cpu',
        severity: totalCPU / this.config.resources.total,
        message: `High CPU utilization: ${(totalCPU / this.config.resources.total * 100).toFixed(1)}%`
      });
    }

    if (totalMemory / this.config.resources.total > threshold) {
      conflicts.push({
        type: 'memory',
        severity: totalMemory / this.config.resources.total,
        message: `High memory utilization: ${(totalMemory / this.config.resources.total * 100).toFixed(1)}%`
      });
    }

    if (totalAgents / this.config.resources.agents.total > threshold) {
      conflicts.push({
        type: 'agent',
        severity: totalAgents / this.config.resources.agents.total,
        message: `High agent utilization: ${(totalAgents / this.config.resources.agents.total * 100).toFixed(1)}%`
      });
    }

    // Check for task-specific conflicts
    const taskConflicts = await this.checkTaskConflicts(task);
    conflicts.push(...taskConflicts);

    return conflicts;
  }

  /**
   * Check for task-specific conflicts
   */
  async checkTaskConflicts(task) {
    const conflicts = [];

    // Check for similar tasks that might compete for resources
    for (const [existingTaskId, existingTask] of this.tasks) {
      if (existingTaskId === task.id) continue;

      const assignment = this.assignments.get(existingTaskId);
      if (!assignment || assignment.status !== 'assigned') continue;

      // Check for capability conflicts
      const capabilityOverlap = task.requirements.capabilities.filter(cap =>
        existingTask.requirements.capabilities.includes(cap)
      ).length;

      if (capabilityOverlap > 0 && task.priority <= existingTask.priority) {
        conflicts.push({
          type: 'capability',
          severity: capabilityOverlap / task.requirements.capabilities.length,
          conflictingTask: existingTaskId,
          message: `Capability overlap with existing task ${existingTaskId}`
        });
      }
    }

    return conflicts;
  }

  /**
   * Handle detected conflicts
   */
  async handleConflicts(task, conflicts) {
    this.metrics.conflictsDetected++;
    this.conflicts.set(task.id, conflicts);

    // Sort conflicts by severity
    const sortedConflicts = conflicts.sort((a, b) => b.severity - a.severity);

    for (const conflict of sortedConflicts) {
      switch (conflict.type) {
        case 'cpu':
        case 'memory':
        case 'agent':
          await this.handleResourceConflict(task, conflict);
          break;
        case 'capability':
          await this.handleCapabilityConflict(task, conflict);
          break;
        default:
          console.warn(`Unknown conflict type: ${conflict.type}`);
      }
    }

    await this.publishEvent('conflicts_handled', {
      taskId: task.id,
      conflictCount: conflicts.length,
      resolved: conflicts.length
    });
  }

  /**
   * Handle resource conflicts by queuing or preempting
   */
  async handleResourceConflict(task, conflict) {
    if (task.priority >= 0.8) {
      // High priority tasks can preempt lower priority tasks
      await this.preemptLowPriorityTasks(task);
    } else {
      // Lower priority tasks are queued
      await this.queueTask(task, `Resource conflict: ${conflict.message}`);
    }
  }

  /**
   * Handle capability conflicts
   */
  async handleCapabilityConflict(task, conflict) {
    if (task.priority > 0.6) {
      // Try to find alternative assignment
      const alternativeAgent = await this.findAlternativeAgent(task, conflict.conflictingTask);
      if (alternativeAgent) {
        console.log(`Found alternative agent for task ${task.id}`);
        return;
      }
    }

    // Queue the task
    await this.queueTask(task, `Capability conflict: ${conflict.message}`);
  }

  /**
   * Find the optimal agent for a task
   */
  async findOptimalAgent(task) {
    const availableAgents = await this.getAvailableAgents();

    if (availableAgents.length === 0) {
      return null;
    }

    // Score agents based on multiple factors
    const scoredAgents = availableAgents.map(agent => {
      const score = this.calculateAgentScore(agent, task);
      return { ...agent, score, confidence: score };
    });

    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);

    return scoredAgents[0];
  }

  /**
   * Calculate agent suitability score for a task
   */
  calculateAgentScore(agent, task) {
    let score = 0;

    // Capability match (40% weight)
    const capabilityScore = this.calculateCapabilityScore(agent, task);
    score += capabilityScore * 0.4;

    // Resource availability (30% weight)
    const resourceScore = this.calculateResourceScore(agent, task);
    score += resourceScore * 0.3;

    // Performance history (20% weight)
    const performanceScore = agent.performance || 0.8;
    score += performanceScore * 0.2;

    // Load balancing (10% weight)
    const loadScore = this.calculateLoadScore(agent);
    score += loadScore * 0.1;

    return Math.min(1.0, score);
  }

  /**
   * Calculate capability match score
   */
  calculateCapabilityScore(agent, task) {
    const requiredCapabilities = task.requirements.capabilities;

    if (requiredCapabilities.length === 0) {
      return 1.0; // No specific requirements
    }

    const agentCapabilities = agent.capabilities || ['general'];
    const matches = requiredCapabilities.filter(cap =>
      agentCapabilities.includes(cap)
    ).length;

    return matches / requiredCapabilities.length;
  }

  /**
   * Calculate resource availability score
   */
  calculateResourceScore(agent, task) {
    const agentLoad = agent.currentLoad || 0;
    const taskLoad = task.resources.cpu / 100; // Normalize to 0-1

    const availableCapacity = 1 - agentLoad;
    const requiredCapacity = taskLoad;

    if (requiredCapacity > availableCapacity) {
      return 0; // Not enough capacity
    }

    // Higher score for more available capacity
    return availableCapacity / (requiredCapacity + 0.1);
  }

  /**
   * Calculate load balancing score
   */
  calculateLoadScore(agent) {
    const currentLoad = agent.currentLoad || 0;
    const targetLoad = 0.7; // Target 70% utilization

    if (currentLoad <= targetLoad) {
      return 1.0; // Under target load
    }

    // Penalize overloaded agents
    return Math.max(0, 1 - (currentLoad - targetLoad));
  }

  /**
   * Get available agents from Redis
   */
  async getAvailableAgents() {
    try {
      const agents = await this.redis.hgetall('swarm:agents');

      return Object.values(agents)
        .map(agentData => JSON.parse(agentData))
        .filter(agent => agent.status === 'idle' || agent.status === 'available');
    } catch (error) {
      console.error('Error getting available agents:', error);
      return [];
    }
  }

  /**
   * Update agent state in Redis
   */
  async updateAgentState(agentId, status, task = null) {
    try {
      const agentData = await this.redis.hget('swarm:agents', agentId);
      if (!agentData) return;

      const agent = JSON.parse(agentData);
      agent.status = status;
      agent.lastActivity = Date.now();

      if (task) {
        agent.currentTask = task.id;
        agent.currentLoad = (agent.currentLoad || 0) + (task.resources.cpu / 100);
      }

      await this.redis.hset('swarm:agents', agentId, JSON.stringify(agent));
    } catch (error) {
      console.error('Error updating agent state:', error);
    }
  }

  /**
   * Update resource allocation
   */
  updateResourceAllocation(resources, action) {
    if (action === 'allocate') {
      this.config.resources.cpu.allocated += resources.cpu;
      this.config.resources.memory.allocated += resources.memory;
      this.config.resources.agents.allocated += 1;
    } else if (action === 'deallocate') {
      this.config.resources.cpu.allocated -= resources.cpu;
      this.config.resources.memory.allocated -= resources.memory;
      this.config.resources.agents.allocated -= 1;
    }
  }

  /**
   * Rebalance resources periodically
   */
  async rebalanceResources() {
    try {
      // Check for stuck tasks
      await this.checkStuckTasks();

      // Optimize agent assignments
      await this.optimizeAssignments();

      // Update utilization metrics
      this.updateUtilizationMetrics();

      await this.publishEvent('rebalanced', {
        timestamp: Date.now(),
        metrics: this.metrics
      });

    } catch (error) {
      console.error('Error during rebalancing:', error);
    }
  }

  /**
   * Check for stuck or timed-out tasks
   */
  async checkStuckTasks() {
    const now = Date.now();
    const timeout = this.config.scheduling.taskTimeout;

    for (const [taskId, assignment] of this.assignments) {
      if (assignment.status === 'assigned' &&
          now - assignment.assignedAt > timeout) {

        console.warn(`Task ${taskId} appears to be stuck, marking for retry`);
        await this.handleStuckTask(taskId, assignment);
      }
    }
  }

  /**
   * Handle stuck tasks
   */
  async handleStuckTask(taskId, assignment) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Update task retry count
    task.metadata.retries++;

    if (task.metadata.retries > 3) {
      // Mark as failed after 3 retries
      assignment.status = 'failed';
      await this.publishEvent('task_failed', {
        taskId,
        reason: 'Max retries exceeded'
      });
    } else {
      // Requeue the task
      assignment.status = 'retry';
      await this.publishEvent('task_retry', {
        taskId,
        retryCount: task.metadata.retries
      });
    }
  }

  /**
   * Optimize current assignments
   */
  async optimizeAssignments() {
    // This is a placeholder for more complex optimization algorithms
    // Could include task migration, load balancing, etc.
    console.log('Running assignment optimization...');
  }

  /**
   * Update utilization metrics
   */
  updateUtilizationMetrics() {
    this.metrics.resourceUtilization = {
      cpu: this.config.resources.cpu.allocated / this.config.resources.total,
      memory: this.config.resources.memory.allocated / this.config.resources.total,
      agents: this.config.resources.agents.allocated / this.config.resources.agents.total
    };
  }

  /**
   * Update assignment metrics
   */
  updateAssignmentMetrics(assignmentTime) {
    const currentAvg = this.metrics.avgAssignmentTime;
    const count = this.metrics.tasksAssigned;

    this.metrics.avgAssignmentTime = ((currentAvg * (count - 1)) + assignmentTime) / count;
  }

  /**
   * Handle task completion
   */
  async completeTask(taskId, result) {
    const assignment = this.assignments.get(taskId);
    const task = this.tasks.get(taskId);

    if (!assignment || !task) {
      console.warn(`Task ${taskId} not found in assignments`);
      return;
    }

    // Update assignment status
    assignment.status = 'completed';
    assignment.completedAt = Date.now();

    // Update resource allocation
    this.updateResourceAllocation(task.resources, 'deallocate');

    // Update agent state
    await this.updateAgentState(assignment.agentId, 'idle');

    // Update metrics
    this.metrics.tasksCompleted++;

    // Clean up
    this.tasks.delete(taskId);
    this.assignments.delete(taskId);
    this.conflicts.delete(taskId);

    await this.publishEvent('task_completed', {
      taskId,
      agentId: assignment.agentId,
      duration: Date.now() - assignment.assignedAt,
      result
    });

    this.emit('taskCompleted', { taskId, result });
  }

  /**
   * Publish events to Redis
   */
  async publishEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    try {
      await this.redis.publish('swarm:phase-2:optimizer', JSON.stringify(event));
    } catch (error) {
      console.error('Error publishing optimizer event:', error);
    }
  }

  /**
   * Handle task events from Redis
   */
  async handleTaskEvent(message) {
    try {
      const event = JSON.parse(message);

      switch (event.type) {
        case 'task_request':
          await this.assignTask(event.data);
          break;
        case 'task_completion':
          await this.completeTask(event.data.taskId, event.data.result);
          break;
        default:
          console.warn(`Unknown task event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Error handling task event:', error);
    }
  }

  /**
   * Estimate task completion time
   */
  estimateCompletion(task, agent) {
    const baseTime = task.resources.duration;
    const agentPerformance = agent.performance || 1.0;
    const taskComplexity = task.resources.cpu / 100;

    return baseTime / (agentPerformance * taskComplexity);
  }

  /**
   * Get optimizer metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentAssignments: this.assignments.size,
      pendingTasks: this.tasks.size,
      activeConflicts: this.conflicts.size,
      utilization: this.metrics.resourceUtilization
    };
  }
}

export default ResourceOptimizer;