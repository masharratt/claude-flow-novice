/**
 * CPU Utilization Optimizer and Async Processing Enhancements
 * Provides intelligent CPU load balancing, async task scheduling, and processing optimization
 */

import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';

export class CPUOptimizer extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      cores: require('os').cpus().length,
      maxWorkers: Math.min(require('os').cpus().length - 1, 4),
      monitoring: {
        intervalMs: 1000, // 1 second
        historySize: 300, // 5 minutes
        loadThreshold: 80, // CPU load percentage
        optimizationThreshold: 70
      },
      scheduling: {
        quantumMs: 10, // Task scheduling quantum
        maxQueueSize: 1000,
        priorityLevels: 5,
        preemptionEnabled: true
      },
      asyncProcessing: {
        batchSize: 50,
        batchTimeoutMs: 100,
        maxConcurrentTasks: 100,
        threadPoolSize: 4
      },
      ...config
    };

    this.workers = [];
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.cpuHistory = [];
    this.loadBalancing = {
      enabled: true,
      algorithm: 'round-robin', // round-robin, least-loaded, weighted
      workerLoads: new Map()
    };

    this.scheduling = {
      currentQuantum: 0,
      taskScheduler: null,
      preemptedTasks: []
    };

    this.metrics = {
      tasksProcessed: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0,
      queueUtilization: 0,
      cpuUtilization: 0,
      workerUtilization: 0,
      contextSwitches: 0
    };

    this.active = false;
    this.startTime = null;
  }

  /**
   * Initialize CPU optimizer
   */
  async initialize() {
    console.log('⚡ Initializing CPU Optimizer...');

    try {
      // Detect CPU capabilities
      await this.detectCPUCapabilities();

      // Initialize worker pool
      await this.initializeWorkerPool();

      // Start CPU monitoring
      this.startCPUMonitoring();

      // Initialize task scheduler
      this.initializeTaskScheduler();

      // Start load balancing
      if (this.loadBalancing.enabled) {
        this.startLoadBalancing();
      }

      this.active = true;
      this.startTime = Date.now();

      console.log(`✅ CPU Optimizer initialized`);
      console.log(`🔧 Using ${this.config.maxWorkers} worker threads`);
      console.log(`📊 Detected ${this.config.cores} CPU cores`);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize CPU optimizer:', error.message);
      throw error;
    }
  }

  /**
   * Detect CPU capabilities and set optimal configuration
   */
  async detectCPUCapabilities() {
    const cpus = require('os').cpus();

    // CPU info
    this.cpuInfo = {
      model: cpus[0].model,
      cores: cpus.length,
      speed: cpus[0].speed,
      architecture: process.arch,
      platform: process.platform
    };

    // Adjust configuration based on CPU capabilities
    if (this.cpuInfo.cores < 4) {
      this.config.maxWorkers = Math.max(1, this.cpuInfo.cores - 1);
      this.config.asyncProcessing.threadPoolSize = Math.max(2, this.cpuInfo.cores - 1);
    }

    console.log(`🔍 CPU: ${this.cpuInfo.model} (${this.cpuInfo.cores} cores @ ${this.cpuInfo.speed}MHz)`);
  }

  /**
   * Initialize worker thread pool
   */
  async initializeWorkerPool() {
    console.log('🏗️ Initializing worker thread pool...');

    // Create worker threads
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = await this.createWorker(i);
      this.workers.push(worker);
      this.loadBalancing.workerLoads.set(worker.id, {
        load: 0,
        tasksProcessed: 0,
        lastUsed: Date.now()
      });
    }

    console.log(`✅ Created ${this.workers.length} worker threads`);
  }

  /**
   * Create individual worker thread
   */
  async createWorker(id) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('worker_threads');
        const { performance } = require('perf_hooks');

        let currentTask = null;
        let taskCount = 0;

        parentPort.on('message', (message) => {
          if (message.type === 'task') {
            currentTask = message.task;
            const startTime = performance.now();

            try {
              // Execute task based on type
              const result = executeTask(message.task);
              const endTime = performance.now();

              parentPort.postMessage({
                type: 'result',
                taskId: message.task.id,
                result,
                executionTime: endTime - startTime,
                workerId: workerData.id
              });

              taskCount++;
            } catch (error) {
              parentPort.postMessage({
                type: 'error',
                taskId: message.task.id,
                error: error.message,
                workerId: workerData.id
              });
            }

            currentTask = null;
          } else if (message.type === 'status') {
            parentPort.postMessage({
              type: 'status',
              workerId: workerData.id,
              busy: currentTask !== null,
              taskCount,
              load: taskCount
            });
          }
        });

        function executeTask(task) {
          switch (task.type) {
            case 'computation':
              return performComputation(task.data);
            case 'sorting':
              return performSorting(task.data);
            case 'search':
              return performSearch(task.data);
            case 'processing':
              return performProcessing(task.data);
            default:
              return performGenericTask(task.data);
          }
        }

        function performComputation(data) {
          const { iterations = 1000000 } = data;
          let result = 0;
          for (let i = 0; i < iterations; i++) {
            result += Math.sqrt(i) * Math.sin(i);
          }
          return { result, iterations };
        }

        function performSorting(data) {
          const { array = [] } = data;
          return array.slice().sort((a, b) => a - b);
        }

        function performSearch(data) {
          const { array = [], target } = data;
          return array.indexOf(target);
        }

        function performProcessing(data) {
          const { items = [] } = data;
          return items.map(item => ({
            ...item,
            processed: true,
            timestamp: Date.now()
          }));
        }

        function performGenericTask(data) {
          return {
            processed: true,
            data,
            timestamp: Date.now()
          };
        }

        // Start status reporting
        setInterval(() => {
          parentPort.postMessage({
            type: 'heartbeat',
            workerId: workerData.id
          });
        }, 5000);
      `, { eval: true, workerData: { id } });

      worker.on('message', (message) => {
        this.handleWorkerMessage(worker, message);
      });

      worker.on('error', (error) => {
        console.error(`❌ Worker ${id} error:`, error.message);
        this.handleWorkerError(worker, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`❌ Worker ${id} exited with code ${code}`);
          this.handleWorkerExit(worker, code);
        }
      });

      worker.id = id;
      worker.busy = false;
      worker.taskCount = 0;

      setTimeout(() => resolve(worker), 100);
    });
  }

  /**
   * Handle messages from worker threads
   */
  handleWorkerMessage(worker, message) {
    switch (message.type) {
      case 'result':
        this.handleTaskResult(worker, message);
        break;
      case 'error':
        this.handleTaskError(worker, message);
        break;
      case 'status':
        this.updateWorkerStatus(worker, message);
        break;
      case 'heartbeat':
        // Update worker heartbeat
        worker.lastHeartbeat = Date.now();
        break;
    }
  }

  /**
   * Handle task completion result
   */
  handleTaskResult(worker, message) {
    const taskId = message.taskId;
    const task = this.runningTasks.get(taskId);

    if (task) {
      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.totalProcessingTime += message.executionTime;
      this.metrics.avgProcessingTime = this.metrics.totalProcessingTime / this.metrics.tasksProcessed;

      // Update worker load
      const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
      if (workerLoad) {
        workerLoad.load = Math.max(0, workerLoad.load - 1);
        workerLoad.tasksProcessed++;
        workerLoad.lastUsed = Date.now();
      }

      // Mark worker as available
      worker.busy = false;
      worker.taskCount++;

      // Remove from running tasks
      this.runningTasks.delete(taskId);

      // Emit completion event
      this.emit('taskCompleted', {
        taskId,
        result: message.result,
        executionTime: message.executionTime,
        workerId: message.workerId
      });

      // Process next task in queue
      this.processNextTask();
    }
  }

  /**
   * Handle task execution error
   */
  handleTaskError(worker, message) {
    const taskId = message.taskId;
    const task = this.runningTasks.get(taskId);

    if (task) {
      // Update worker load
      const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
      if (workerLoad) {
        workerLoad.load = Math.max(0, workerLoad.load - 1);
      }

      // Mark worker as available
      worker.busy = false;

      // Remove from running tasks
      this.runningTasks.delete(taskId);

      // Emit error event
      this.emit('taskError', {
        taskId,
        error: message.error,
        workerId: message.workerId
      });

      // Process next task
      this.processNextTask();
    }
  }

  /**
   * Update worker status information
   */
  updateWorkerStatus(worker, message) {
    worker.busy = message.busy;
    worker.taskCount = message.taskCount;

    const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
    if (workerLoad) {
      workerLoad.load = message.load;
    }
  }

  /**
   * Handle worker thread errors
   */
  handleWorkerError(worker, error) {
    console.error(`❌ Worker ${worker.id} error:`, error.message);

    // Mark worker as unavailable
    worker.busy = false;
    worker.error = error;

    // Emit error event
    this.emit('workerError', {
      workerId: worker.id,
      error: error.message
    });
  }

  /**
   * Handle worker thread exit
   */
  handleWorkerExit(worker, code) {
    console.error(`❌ Worker ${worker.id} exited with code ${code}`);

    // Remove worker from pool
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    // Remove from load balancing
    this.loadBalancing.workerLoads.delete(worker.id);

    // Emit exit event
    this.emit('workerExit', {
      workerId: worker.id,
      code
    });

    // Attempt to recreate worker
    this.recreateWorker(worker.id);
  }

  /**
   * Recreate failed worker thread
   */
  async recreateWorker(id) {
    try {
      console.log(`🔄 Recreating worker ${id}...`);
      const newWorker = await this.createWorker(id);
      this.workers.push(newWorker);
      this.loadBalancing.workerLoads.set(newWorker.id, {
        load: 0,
        tasksProcessed: 0,
        lastUsed: Date.now()
      });
      console.log(`✅ Worker ${id} recreated successfully`);
    } catch (error) {
      console.error(`❌ Failed to recreate worker ${id}:`, error.message);
    }
  }

  /**
   * Start CPU monitoring
   */
  startCPUMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.collectCPUMetrics();
    }, this.config.monitoring.intervalMs);

    console.log('📊 CPU monitoring started');
  }

  /**
   * Collect CPU performance metrics
   */
  collectCPUMetrics() {
    const startUsage = process.cpuUsage();
    const startTime = performance.now();

    // Get system CPU usage
    const cpus = require('os').cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const totalUsage = totalTick - totalIdle;
    const cpuPercentage = ((totalUsage / totalTick) * 100).toFixed(2);

    // Calculate process CPU usage
    setTimeout(() => {
      const endUsage = process.cpuUsage(startUsage);
      const endTime = performance.now();
      const timeDelta = endTime - startTime;

      const userUsage = (endUsage.user / timeDelta) * 100;
      const systemUsage = (endUsage.system / timeDelta) * 100;

      // Store metrics
      const metrics = {
        timestamp: Date.now(),
        systemCPU: parseFloat(cpuPercentage),
        processCPU: {
          user: userUsage.toFixed(2),
          system: systemUsage.toFixed(2),
          total: (userUsage + systemUsage).toFixed(2)
        },
        workers: {
          total: this.workers.length,
          busy: this.workers.filter(w => w.busy).length,
          idle: this.workers.filter(w => !w.busy).length
        },
        queue: {
          size: this.taskQueue.length,
          utilization: ((this.taskQueue.length / this.config.scheduling.maxQueueSize) * 100).toFixed(2)
        }
      };

      this.cpuHistory.push(metrics);
      if (this.cpuHistory.length > this.config.monitoring.historySize) {
        this.cpuHistory.shift();
      }

      // Update overall metrics
      this.metrics.cpuUtilization = parseFloat(cpuPercentage);
      this.metrics.workerUtilization = (metrics.workers.busy / metrics.workers.total * 100).toFixed(2);
      this.metrics.queueUtilization = parseFloat(metrics.queue.utilization);

      // Check for optimization opportunities
      this.checkOptimizationOpportunities(metrics);

      // Emit metrics
      this.emit('cpuMetrics', metrics);

    }, 10);
  }

  /**
   * Check for CPU optimization opportunities
   */
  checkOptimizationOpportunities(metrics) {
    const systemCPU = metrics.systemCPU;
    const queueUtilization = parseFloat(metrics.queue.utilization);

    // High CPU usage - optimize
    if (systemCPU > this.config.monitoring.loadThreshold) {
      console.log(`⚠️ High CPU usage: ${systemCPU}%`);
      this.optimizeCPUUsage();
    }

    // High queue utilization - scale workers if possible
    if (queueUtilization > 80 && this.workers.length < this.config.cores - 1) {
      console.log(`⚠️ High queue utilization: ${queueUtilization}%`);
      this.scaleWorkers();
    }

    // Low CPU usage but high queue - optimize scheduling
    if (systemCPU < 50 && queueUtilization > 60) {
      console.log(`⚠️ Scheduling inefficiency detected`);
      this.optimizeScheduling();
    }
  }

  /**
   * Initialize task scheduler
   */
  initializeTaskScheduler() {
    this.scheduling.taskScheduler = setInterval(() => {
      this.scheduleTasks();
    }, this.config.scheduling.quantumMs);

    console.log('📅 Task scheduler initialized');
  }

  /**
   * Schedule tasks from queue
   */
  scheduleTasks() {
    this.scheduling.currentQuantum++;

    // Process pending tasks
    while (this.taskQueue.length > 0 && this.hasAvailableWorker()) {
      this.processNextTask();
    }

    // Check for task preemption (if enabled)
    if (this.config.scheduling.preemptionEnabled) {
      this.checkTaskPreemption();
    }
  }

  /**
   * Process next task in queue
   */
  processNextTask() {
    if (this.taskQueue.length === 0 || !this.hasAvailableWorker()) {
      return;
    }

    // Get next task (sorted by priority)
    const task = this.taskQueue.shift();
    const worker = this.selectWorker();

    if (worker && !worker.busy) {
      this.executeTask(worker, task);
    } else {
      // Put task back in queue if no available worker
      this.taskQueue.unshift(task);
    }
  }

  /**
   * Check if worker is available
   */
  hasAvailableWorker() {
    return this.workers.some(worker => !worker.busy);
  }

  /**
   * Select worker based on load balancing algorithm
   */
  selectWorker() {
    const availableWorkers = this.workers.filter(w => !w.busy);

    if (availableWorkers.length === 0) {
      return null;
    }

    switch (this.loadBalancing.algorithm) {
      case 'round-robin':
        return this.roundRobinSelection(availableWorkers);
      case 'least-loaded':
        return this.leastLoadedSelection(availableWorkers);
      case 'weighted':
        return this.weightedSelection(availableWorkers);
      default:
        return availableWorkers[0];
    }
  }

  /**
   * Round-robin worker selection
   */
  roundRobinSelection(workers) {
    this.scheduling.currentQuantum = (this.scheduling.currentQuantum + 1) % workers.length;
    return workers[this.scheduling.currentQuantum];
  }

  /**
   * Least-loaded worker selection
   */
  leastLoadedSelection(workers) {
    let leastLoaded = workers[0];
    let minLoad = Infinity;

    for (const worker of workers) {
      const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
      if (workerLoad && workerLoad.load < minLoad) {
        minLoad = workerLoad.load;
        leastLoaded = worker;
      }
    }

    return leastLoaded;
  }

  /**
   * Weighted worker selection
   */
  weightedSelection(workers) {
    // Calculate weights based on performance metrics
    const weights = workers.map(worker => {
      const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
      const performance = workerLoad ? workerLoad.tasksProcessed : 0;
      const load = workerLoad ? workerLoad.load : 0;

      // Higher weight for better performance and lower load
      return Math.max(1, performance * 0.7 + (100 - load) * 0.3);
    });

    // Select based on weighted probability
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < workers.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return workers[i];
      }
    }

    return workers[0];
  }

  /**
   * Execute task on worker thread
   */
  executeTask(worker, task) {
    worker.busy = true;
    this.runningTasks.set(task.id, {
      ...task,
      startTime: Date.now(),
      workerId: worker.id
    });

    // Update worker load
    const workerLoad = this.loadBalancing.workerLoads.get(worker.id);
    if (workerLoad) {
      workerLoad.load++;
      workerLoad.lastUsed = Date.now();
    }

    // Send task to worker
    worker.postMessage({
      type: 'task',
      task
    });

    // Emit task start event
    this.emit('taskStarted', {
      taskId: task.id,
      workerId: worker.id,
      taskType: task.type
    });
  }

  /**
   * Submit task for execution
   */
  submitTask(taskData, priority = 'normal') {
    const task = {
      id: this.generateTaskId(),
      type: taskData.type || 'generic',
      data: taskData,
      priority: this.getPriorityValue(priority),
      submittedAt: Date.now(),
      status: 'queued'
    };

    // Check queue capacity
    if (this.taskQueue.length >= this.config.scheduling.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    // Add to queue (maintain priority order)
    this.insertTaskByPriority(task);

    // Emit task submitted event
    this.emit('taskSubmitted', {
      taskId: task.id,
      taskType: task.type,
      priority,
      queueSize: this.taskQueue.length
    });

    return task.id;
  }

  /**
   * Insert task into queue maintaining priority order
   */
  insertTaskByPriority(task) {
    let insertIndex = this.taskQueue.length;

    for (let i = 0; i < this.taskQueue.length; i++) {
      if (this.taskQueue[i].priority < task.priority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * Get numeric priority value
   */
  getPriorityValue(priority) {
    const priorities = {
      'critical': 5,
      'high': 4,
      'normal': 3,
      'low': 2,
      'background': 1
    };

    return priorities[priority] || 3;
  }

  /**
   * Generate unique task ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check for task preemption
   */
  checkTaskPreemption() {
    // Find low-priority tasks that can be preempted
    const runningTasks = Array.from(this.runningTasks.values());
    const highPriorityQueued = this.taskQueue.filter(t => t.priority >= 4);

    if (highPriorityQueued.length > 0 && runningTasks.length > 0) {
      // Find lowest priority running task
      const lowestPriorityTask = runningTasks.reduce((lowest, task) =>
        task.priority < lowest.priority ? task : lowest
      );

      if (lowestPriorityTask.priority < 4) {
        // Preempt the low priority task
        this.preemptTask(lowestPriorityTask);
      }
    }
  }

  /**
   * Preempt running task
   */
  preemptTask(task) {
    // This is a simplified preemption implementation
    // In a real system, you'd need to handle task state saving and restoration
    console.log(`⏸️ Preempting task ${task.id} (priority: ${task.priority})`);

    // Mark as preempted and requeue
    task.status = 'preempted';
    task.priority = Math.max(1, task.priority - 1); // Lower priority

    this.taskQueue.push(task);
    this.runningTasks.delete(task.id);

    // Emit preemption event
    this.emit('taskPreempted', {
      taskId: task.id,
      newPriority: task.priority
    });
  }

  /**
   * Start load balancing
   */
  startLoadBalancing() {
    this.loadBalancingInterval = setInterval(() => {
      this.balanceLoad();
    }, 5000);

    console.log('⚖️ Load balancing started');
  }

  /**
   * Balance load across workers
   */
  balanceLoad() {
    const workerLoads = Array.from(this.loadBalancing.workerLoads.entries());

    // Check for load imbalances
    const avgLoad = workerLoads.reduce((sum, [_, load]) => sum + load.load, 0) / workerLoads.length;

    for (const [workerId, load] of workerLoads) {
      if (load.load > avgLoad * 1.5) {
        console.log(`⚖️ Worker ${workerId} is overloaded (${load.load} > ${avgLoad.toFixed(2)})`);
        // In a real implementation, you might redistribute tasks
      }
    }
  }

  /**
   * Optimize CPU usage
   */
  optimizeCPUUsage() {
    console.log('🔧 Optimizing CPU usage...');

    // Reduce worker count if system is overloaded
    if (this.workers.length > 2 && this.metrics.cpuUtilization > 90) {
      const workerToStop = this.workers.find(w => !w.busy);
      if (workerToStop) {
        console.log(`🛑 Stopping worker ${workerToStop.id} to reduce CPU load`);
        workerToStop.terminate();
        const index = this.workers.indexOf(workerToStop);
        this.workers.splice(index, 1);
      }
    }

    // Increase task scheduling quantum
    this.config.scheduling.quantumMs = Math.min(50, this.config.scheduling.quantumMs * 1.2);

    // Enable more aggressive task batching
    this.config.asyncProcessing.batchSize = Math.min(100, this.config.asyncProcessing.batchSize * 1.5);

    console.log('✅ CPU optimization applied');
  }

  /**
   * Scale worker pool
   */
  async scaleWorkers() {
    if (this.workers.length >= this.config.cores - 1) {
      return; // Already at max capacity
    }

    try {
      console.log('📈 Scaling worker pool...');
      const newWorker = await this.createWorker(this.workers.length);
      this.workers.push(newWorker);
      this.loadBalancing.workerLoads.set(newWorker.id, {
        load: 0,
        tasksProcessed: 0,
        lastUsed: Date.now()
      });
      console.log(`✅ Added worker ${newWorker.id} to pool`);
    } catch (error) {
      console.error('❌ Failed to scale workers:', error.message);
    }
  }

  /**
   * Optimize task scheduling
   */
  optimizeScheduling() {
    console.log('🔧 Optimizing task scheduling...');

    // Switch to more efficient algorithm
    if (this.loadBalancing.algorithm === 'round-robin') {
      this.loadBalancing.algorithm = 'least-loaded';
      console.log('📊 Switched to least-loaded scheduling');
    }

    // Reduce scheduling quantum for better responsiveness
    this.config.scheduling.quantumMs = Math.max(5, this.config.scheduling.quantumMs * 0.8);

    // Enable preemption if not already enabled
    if (!this.config.scheduling.preemptionEnabled) {
      this.config.scheduling.preemptionEnabled = true;
      console.log('⏸️ Enabled task preemption');
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      workers: {
        total: this.workers.length,
        busy: this.workers.filter(w => w.busy).length,
        idle: this.workers.filter(w => !w.busy).length
      },
      queue: {
        size: this.taskQueue.length,
        maxSize: this.config.scheduling.maxQueueSize,
        utilization: this.metrics.queueUtilization
      },
      cpu: {
        utilization: this.metrics.cpuUtilization,
        cores: this.config.cores,
        history: this.cpuHistory.slice(-10)
      },
      loadBalancing: {
        algorithm: this.loadBalancing.algorithm,
        workerLoads: Array.from(this.loadBalancing.workerLoads.entries())
      }
    };
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      return {
        status: 'running',
        ...runningTask
      };
    }

    const queuedTask = this.taskQueue.find(t => t.id === taskId);
    if (queuedTask) {
      return {
        status: 'queued',
        ...queuedTask
      };
    }

    return {
      status: 'not_found',
      taskId
    };
  }

  /**
   * Cancel queued task
   */
  cancelTask(taskId) {
    const index = this.taskQueue.findIndex(t => t.id === taskId);
    if (index > -1) {
      const task = this.taskQueue.splice(index, 1)[0];
      this.emit('taskCancelled', { taskId: task.id });
      return true;
    }
    return false;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down CPU Optimizer...');

    this.active = false;

    // Stop monitoring
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Stop task scheduler
    if (this.scheduling.taskScheduler) {
      clearInterval(this.scheduling.taskScheduler);
    }

    // Stop load balancing
    if (this.loadBalancingInterval) {
      clearInterval(this.loadBalancingInterval);
    }

    // Wait for running tasks to complete (with timeout)
    const shutdownTimeout = 10000; // 10 seconds
    const shutdownStart = Date.now();

    while (this.runningTasks.size > 0 && Date.now() - shutdownStart < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate worker threads
    for (const worker of this.workers) {
      worker.terminate();
    }

    this.workers = [];
    this.taskQueue = [];
    this.runningTasks.clear();

    console.log('✅ CPU Optimizer shutdown complete');
  }
}

// Export for use in other modules
export default CPUOptimizer;