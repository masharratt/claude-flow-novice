/**
 * CodeBoosterAgent - Specialized Agent Type with Booster Capabilities
 *
 * A specialized agent that integrates WASM-powered code acceleration
 * capabilities with standard agent functionality.
 */

import AgentBoosterWrapper from './AgentBoosterWrapper.js';
import { EventEmitter } from 'events';

export class CodeBoosterAgent extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      agentId: config.agentId || `booster-agent-${Date.now()}`,
      name: config.name || 'Code Booster Agent',
      capabilities: [
        'code-generation',
        'code-optimization',
        'performance-analysis',
        'wasm-acceleration',
        'code-review',
        'refactoring'
      ],
      specialization: 'code-acceleration',
      maxConcurrentTasks: config.maxConcurrentTasks || 3,
      timeout: config.timeout || 30000,
      autoOptimize: config.autoOptimize !== false,
      fallbackEnabled: config.fallbackEnabled !== false,
      ...config
    };

    this.boosterWrapper = new AgentBoosterWrapper({
      redisKey: 'swarm:phase-5',
      fallbackEnabled: this.config.fallbackEnabled,
      ...config.booster
    });

    this.status = 'initializing';
    this.currentTasks = new Map(); // taskId -> task info
    this.completedTasks = [];
    this.performanceMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
      boosterUsageRate: 0,
      optimizationRate: 0
    };

    this.isInitialized = false;
  }

  /**
   * Initialize the CodeBoosterAgent
   */
  async initialize() {
    try {
      console.log(`🚀 Initializing CodeBoosterAgent: ${this.config.name}`);

      // Initialize booster wrapper
      await this.boosterWrapper.initialize();

      // Set up event listeners
      this.setupEventListeners();

      this.status = 'ready';
      this.isInitialized = true;

      console.log(`✅ CodeBoosterAgent ${this.config.name} initialized successfully`);

      this.emit('initialized', {
        agentId: this.config.agentId,
        name: this.config.name,
        capabilities: this.config.capabilities
      });

      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize CodeBoosterAgent ${this.config.name}:`, error);
      this.status = 'error';
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for booster wrapper
   */
  setupEventListeners() {
    this.boosterWrapper.on('task.completed', (data) => {
      this.handleTaskCompleted(data);
    });

    this.boosterWrapper.on('task.failed', (data) => {
      this.handleTaskFailed(data);
    });

    this.boosterWrapper.on('booster.event', (event) => {
      this.handleBoosterEvent(event);
    });
  }

  /**
   * Execute a task with booster capabilities
   */
  async executeTask(taskRequest) {
    if (!this.isInitialized) {
      throw new Error('CodeBoosterAgent not initialized');
    }

    const {
      taskId = this.generateTaskId(),
      type,
      description,
      input,
      options = {},
      priority = 'normal'
    } = taskRequest;

    // Check if agent can handle this task type
    if (!this.canHandleTask(type)) {
      throw new Error(`Cannot handle task type: ${type}`);
    }

    // Check concurrent task limit
    if (this.currentTasks.size >= this.config.maxConcurrentTasks) {
      throw new Error('Maximum concurrent tasks limit reached');
    }

    console.log(`🎯 CodeBoosterAgent executing task: ${description}`);

    const startTime = Date.now();

    try {
      // Add to current tasks
      this.currentTasks.set(taskId, {
        type,
        description,
        startTime,
        status: 'executing'
      });

      // Prepare task for booster
      const boosterTask = {
        taskId,
        agentId: this.config.agentId,
        taskType: type,
        description,
        input,
        options: {
          ...options,
          priority,
          autoOptimize: this.config.autoOptimize
        }
      };

      // Execute with booster
      const result = await this.boosterWrapper.executeTask(boosterTask);

      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateMetrics(result, executionTime);

      // Store completed task
      this.completedTasks.push({
        taskId,
        type,
        description,
        result,
        executionTime,
        timestamp: Date.now(),
        usedBooster: !result.usedFallback,
        fromCache: result.fromCache
      });

      // Keep only last 100 completed tasks
      if (this.completedTasks.length > 100) {
        this.completedTasks = this.completedTasks.slice(-100);
      }

      console.log(`✅ Task ${taskId} completed in ${executionTime}ms`);

      return {
        taskId,
        agentId: this.config.agentId,
        type,
        description,
        result: result.result,
        executionTime,
        usedBooster: !result.usedFallback,
        fromCache: result.fromCache,
        success: result.success
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      console.error(`❌ Task ${taskId} failed:`, error);

      // Update metrics
      this.performanceMetrics.failedTasks++;

      throw error;
    } finally {
      // Remove from current tasks
      this.currentTasks.delete(taskId);
    }
  }

  /**
   * Generate optimized code with booster acceleration
   */
  async generateCode(specification, options = {}) {
    return this.executeTask({
      type: 'code-generation',
      description: `Generate code: ${specification.description}`,
      input: {
        language: specification.language || 'javascript',
        framework: specification.framework,
        requirements: specification.requirements,
        patterns: specification.patterns || [],
        optimization: options.optimization || 'performance'
      },
      options
    });
  }

  /**
   * Optimize existing code with booster acceleration
   */
  async optimizeCode(code, options = {}) {
    return this.executeTask({
      type: 'code-optimization',
      description: `Optimize code for ${options.target || 'performance'}`,
      input: {
        code,
        language: options.language || this.detectLanguage(code),
        optimizationLevel: options.level || 'standard',
        targetMetrics: options.metrics || ['performance', 'memory']
      },
      options
    });
  }

  /**
   * Analyze code performance with booster acceleration
   */
  async analyzePerformance(code, options = {}) {
    return this.executeTask({
      type: 'performance-analysis',
      description: 'Analyze code performance characteristics',
      input: {
        code,
        language: options.language || this.detectLanguage(code),
        analysisDepth: options.depth || 'standard',
        focusAreas: options.focus || ['complexity', 'bottlenecks', 'memory']
      },
      options
    });
  }

  /**
   * Review code quality and suggest improvements
   */
  async reviewCode(code, options = {}) {
    return this.executeTask({
      type: 'code-review',
      description: 'Review code quality and suggest improvements',
      input: {
        code,
        language: options.language || this.detectLanguage(code),
        reviewType: options.type || 'comprehensive',
        standards: options.standards || ['best-practices', 'security', 'performance']
      },
      options
    });
  }

  /**
   * Refactor code structure with booster acceleration
   */
  async refactorCode(code, refactorPlan, options = {}) {
    return this.executeTask({
      type: 'refactoring',
      description: `Refactor code: ${refactorPlan.description}`,
      input: {
        code,
        language: options.language || this.detectLanguage(code),
        refactorPlan,
        preserveBehavior: options.preserveBehavior !== false,
        validation: options.validation || 'syntax'
      },
      options
    });
  }

  /**
   * Check if agent can handle a specific task type
   */
  canHandleTask(taskType) {
    return this.config.capabilities.includes(taskType) ||
           this.config.capabilities.includes('code-acceleration');
  }

  /**
   * Detect programming language from code
   */
  detectLanguage(code) {
    if (!code || typeof code !== 'string') {
      return 'unknown';
    }

    // Simple language detection based on patterns
    if (code.includes('function ') || code.includes('const ') || code.includes('let ')) {
      return 'javascript';
    } else if (code.includes('def ') || code.includes('import ')) {
      return 'python';
    } else if (code.includes('public class ') || code.includes('import java.')) {
      return 'java';
    } else if (code.includes('package ') || code.includes('func ')) {
      return 'go';
    } else if (code.includes('#include') || code.includes('int main')) {
      return 'cpp';
    }

    return 'unknown';
  }

  /**
   * Handle task completion
   */
  handleTaskCompleted(data) {
    const { taskId, agentId, taskType, executionTime, usedBooster } = data;

    if (agentId === this.config.agentId) {
      console.log(`✅ Booster task completed: ${taskId} (${taskType}) in ${executionTime}ms`);

      this.emit('task.completed', {
        agentId: this.config.agentId,
        ...data
      });
    }
  }

  /**
   * Handle task failure
   */
  handleTaskFailed(data) {
    const { taskId, agentId, taskType, error } = data;

    if (agentId === this.config.agentId) {
      console.error(`❌ Booster task failed: ${taskId} (${taskType}): ${error}`);

      this.emit('task.failed', {
        agentId: this.config.agentId,
        ...data
      });
    }
  }

  /**
   * Handle booster events
   */
  handleBoosterEvent(event) {
    // Filter and forward relevant booster events
    const { type, data } = event;

    if (type === 'booster.error' || type === 'booster.recovered') {
      this.emit('booster.event', event);
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(result, executionTime) {
    this.performanceMetrics.totalTasks++;

    if (result.success) {
      this.performanceMetrics.completedTasks++;
    } else {
      this.performanceMetrics.failedTasks++;
    }

    // Update average task time
    this.performanceMetrics.averageTaskTime =
      (this.performanceMetrics.averageTaskTime * (this.performanceMetrics.totalTasks - 1) + executionTime) /
      this.performanceMetrics.totalTasks;

    // Update booster usage rate
    if (!result.usedFallback) {
      this.performanceMetrics.boosterUsageRate =
        (this.performanceMetrics.boosterUsageRate * (this.performanceMetrics.totalTasks - 1) + 100) /
        this.performanceMetrics.totalTasks;
    } else {
      this.performanceMetrics.boosterUsageRate =
        (this.performanceMetrics.boosterUsageRate * (this.performanceMetrics.totalTasks - 1)) /
        this.performanceMetrics.totalTasks;
    }

    // Update optimization rate (if result includes optimization info)
    if (result.result && result.result.performanceGain) {
      this.performanceMetrics.optimizationRate =
        (this.performanceMetrics.optimizationRate * (this.performanceMetrics.completedTasks - 1) +
         (result.result.performanceGain > 0 ? 100 : 0)) /
        this.performanceMetrics.completedTasks;
    }
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `${this.config.agentId}-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current agent status
   */
  getStatus() {
    return {
      agentId: this.config.agentId,
      name: this.config.name,
      status: this.status,
      capabilities: this.config.capabilities,
      currentTasks: this.currentTasks.size,
      maxConcurrentTasks: this.config.maxConcurrentTasks,
      performanceMetrics: { ...this.performanceMetrics },
      boosterStatus: this.boosterWrapper.getStatus(),
      recentTasks: this.completedTasks.slice(-10)
    };
  }

  /**
   * Get detailed performance report
   */
  getPerformanceReport() {
    const status = this.getStatus();

    return {
      agent: {
        id: status.agentId,
        name: status.name,
        specialization: this.config.specialization
      },
      performance: {
        ...status.performanceMetrics,
        successRate: status.performanceMetrics.totalTasks > 0
          ? (status.performanceMetrics.completedTasks / status.performanceMetrics.totalTasks) * 100
          : 0,
        efficiency: status.performanceMetrics.boosterUsageRate
      },
      booster: {
        ...status.boosterStatus,
        wrapperMetrics: status.boosterStatus.performanceMetrics
      },
      recentActivity: {
        currentTasks: Array.from(this.currentTasks.entries()).map(([taskId, task]) => ({
          taskId,
          ...task
        })),
        recentCompleted: status.recentTasks
      },
      capabilities: {
        supported: status.capabilities,
        utilization: this.calculateCapabilityUtilization()
      }
    };
  }

  /**
   * Calculate capability utilization rates
   */
  calculateCapabilityUtilization() {
    const utilization = {};

    this.config.capabilities.forEach(capability => {
      const tasksWithCapability = this.completedTasks.filter(task => task.type === capability);
      utilization[capability] = {
        usage: tasksWithCapability.length,
        successRate: tasksWithCapability.length > 0
          ? (tasksWithCapability.filter(task => task.result.success).length / tasksWithCapability.length) * 100
          : 0,
        averageTime: tasksWithCapability.length > 0
          ? tasksWithCapability.reduce((sum, task) => sum + task.executionTime, 0) / tasksWithCapability.length
          : 0
      };
    });

    return utilization;
  }

  /**
   * Clear performance history
   */
  clearHistory() {
    this.completedTasks = [];
    this.performanceMetrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
      boosterUsageRate: 0,
      optimizationRate: 0
    };
    console.log('🧹 Performance history cleared');
  }

  /**
   * Gracefully shutdown the agent
   */
  async shutdown() {
    console.log(`🛑 Shutting down CodeBoosterAgent: ${this.config.name}`);

    try {
      // Wait for current tasks to complete or timeout
      const shutdownTimeout = 10000; // 10 seconds
      const shutdownStart = Date.now();

      while (this.currentTasks.size > 0 && Date.now() - shutdownStart < shutdownTimeout) {
        console.log(`⏳ Waiting for ${this.currentTasks.size} tasks to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Shutdown booster wrapper
      await this.boosterWrapper.shutdown();

      this.status = 'shutdown';
      this.isInitialized = false;

      console.log(`✅ CodeBoosterAgent ${this.config.name} shutdown complete`);

      this.emit('shutdown');
    } catch (error) {
      console.error(`❌ Error during shutdown:`, error);
      throw error;
    }
  }
}

export default CodeBoosterAgent;