/**
 * Concurrent Filter Pipeline
 * Enables parallel processing of multiple content items through filtering system
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { FilterIntegrationHooks } from '../hooks/filter-integration.js';
import { RealtimeFilterMiddleware } from '../middleware/realtime-filter.js';
import { ContentAuditSystem } from '../audit/content-audit.js';
import { EventEmitter } from 'events';

class ConcurrentFilterPipeline extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxWorkers: options.maxWorkers || Math.min(cpus().length, 8),
      batchSize: options.batchSize || 10,
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      concurrencyLimit: options.concurrencyLimit || 20,
      ...options
    };

    this.workers = [];
    this.taskQueue = [];
    this.activeJobs = new Map();
    this.completedJobs = new Map();
    this.failedJobs = new Map();

    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      totalTime: 0,
      avgTime: 0,
      throughput: 0,
      workerUtilization: 0
    };

    this.isRunning = false;
    this.setupWorkerPool();
  }

  /**
   * Setup worker pool for concurrent processing
   */
  setupWorkerPool() {
    if (!isMainThread) {
      // Worker thread logic
      this.setupWorkerThread();
      return;
    }

    // Main thread - create workers
    for (let i = 0; i < this.options.maxWorkers; i++) {
      this.createWorker();
    }

    // Setup cleanup
    process.on('beforeExit', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Create a new worker thread
   */
  createWorker() {
    const worker = new Worker(__filename, {
      workerData: {
        isWorker: true,
        options: this.options
      }
    });

    worker.isAvailable = true;
    worker.currentJob = null;
    worker.processedCount = 0;

    worker.on('message', (message) => this.handleWorkerMessage(worker, message));
    worker.on('error', (error) => this.handleWorkerError(worker, error));
    worker.on('exit', (code) => this.handleWorkerExit(worker, code));

    this.workers.push(worker);
    this.emit('workerCreated', { workerId: worker.threadId });

    return worker;
  }

  /**
   * Setup worker thread functionality
   */
  setupWorkerThread() {
    if (!parentPort) return;

    const filterHooks = new FilterIntegrationHooks(process.cwd());
    const realtimeFilter = new RealtimeFilterMiddleware(process.cwd());
    const auditSystem = new ContentAuditSystem(process.cwd());

    parentPort.on('message', async (message) => {
      try {
        const { jobId, type, data } = message;

        let result;
        switch (type) {
          case 'processContent':
            result = await this.processContentInWorker(data, filterHooks, realtimeFilter, auditSystem);
            break;
          case 'processBatch':
            result = await this.processBatchInWorker(data, filterHooks, realtimeFilter, auditSystem);
            break;
          case 'auditAnalysis':
            result = await this.performAuditAnalysisInWorker(data, auditSystem);
            break;
          default:
            throw new Error(`Unknown job type: ${type}`);
        }

        parentPort.postMessage({
          jobId,
          type: 'success',
          result
        });

      } catch (error) {
        parentPort.postMessage({
          jobId,
          type: 'error',
          error: {
            message: error.message,
            stack: error.stack
          }
        });
      }
    });
  }

  /**
   * Process content in worker thread
   */
  async processContentInWorker(data, filterHooks, realtimeFilter, auditSystem) {
    const { content, metadata, processingType } = data;

    switch (processingType) {
      case 'document':
        const docResult = filterHooks.interceptDocumentGeneration(
          metadata.filePath || 'unknown.md',
          content,
          metadata
        );
        auditSystem.logDocumentGeneration(metadata.filePath, content, docResult);
        return docResult;

      case 'message':
        const processedMessage = filterHooks.processAgentMessage(
          content,
          metadata.agentType || 'generic',
          metadata
        );
        auditSystem.logAgentMessage(metadata.agentType, content, processedMessage, metadata);
        return { original: content, processed: processedMessage };

      case 'realtime':
        return await realtimeFilter.processContent(content, metadata);

      default:
        throw new Error(`Unknown processing type: ${processingType}`);
    }
  }

  /**
   * Process batch in worker thread
   */
  async processBatchInWorker(data, filterHooks, realtimeFilter, auditSystem) {
    const { items, metadata } = data;
    const results = [];

    for (const item of items) {
      try {
        const result = await this.processContentInWorker({
          content: item.content,
          metadata: { ...metadata, ...item.metadata },
          processingType: item.processingType || 'document'
        }, filterHooks, realtimeFilter, auditSystem);

        results.push({
          ...item,
          result,
          success: true
        });
      } catch (error) {
        results.push({
          ...item,
          error: error.message,
          success: false
        });
      }
    }

    // Log batch processing
    auditSystem.logBatchProcessing(metadata.batchId || 'unknown', {
      summary: {
        total: results.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      processingTime: Date.now() - metadata.startTime
    });

    return results;
  }

  /**
   * Perform audit analysis in worker thread
   */
  async performAuditAnalysisInWorker(data, auditSystem) {
    const { analysisType, parameters } = data;

    switch (analysisType) {
      case 'effectiveness':
        return auditSystem.analyzeFilterEffectiveness();
      case 'report':
        return auditSystem.generateAuditReport(parameters.timeframe || '24h');
      case 'search':
        return auditSystem.searchAuditLog(parameters.query || {});
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
  }

  /**
   * Process single content item
   */
  async processContent(content, metadata = {}) {
    return this.submitJob('processContent', {
      content,
      metadata: {
        ...metadata,
        processingType: metadata.processingType || 'document'
      }
    });
  }

  /**
   * Process multiple content items in parallel
   */
  async processParallel(items, metadata = {}) {
    const jobs = items.map((item, index) => ({
      jobId: `parallel_${Date.now()}_${index}`,
      type: 'processContent',
      data: {
        content: item.content,
        metadata: {
          ...metadata,
          ...item.metadata,
          batchIndex: index
        },
        processingType: item.processingType || 'document'
      }
    }));

    return this.processJobsParallel(jobs);
  }

  /**
   * Process batch of items
   */
  async processBatch(items, metadata = {}) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return this.submitJob('processBatch', {
      items,
      metadata: {
        ...metadata,
        batchId,
        startTime: Date.now()
      }
    });
  }

  /**
   * Process items in streaming fashion
   */
  createStreamingProcessor(options = {}) {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const buffer = [];
    let processing = false;

    const processor = {
      write: async (item) => {
        buffer.push({
          ...item,
          timestamp: Date.now()
        });

        if (buffer.length >= (options.batchSize || this.options.batchSize) && !processing) {
          processing = true;
          try {
            const batch = buffer.splice(0, options.batchSize || this.options.batchSize);
            const results = await this.processBatch(batch, {
              ...options.metadata,
              streamId,
              isStreaming: true
            });
            this.emit('streamBatch', { streamId, results });
          } finally {
            processing = false;
          }
        }
      },

      flush: async () => {
        if (buffer.length > 0) {
          const batch = buffer.splice(0);
          const results = await this.processBatch(batch, {
            ...options.metadata,
            streamId,
            isStreaming: true,
            isFinal: true
          });
          this.emit('streamBatch', { streamId, results });
        }
      },

      end: () => {
        this.emit('streamEnd', { streamId });
      }
    };

    this.emit('streamStart', { streamId, processor });
    return processor;
  }

  /**
   * Submit job to worker pool
   */
  async submitJob(type, data) {
    return new Promise((resolve, reject) => {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      const job = {
        jobId,
        type,
        data,
        resolve,
        reject,
        startTime,
        retries: 0,
        maxRetries: this.options.retries
      };

      this.taskQueue.push(job);
      this.activeJobs.set(jobId, job);

      // Process queue
      this.processQueue();

      // Setup timeout
      setTimeout(() => {
        if (this.activeJobs.has(jobId)) {
          this.activeJobs.delete(jobId);
          this.failedJobs.set(jobId, { ...job, error: 'Timeout' });
          reject(new Error('Job timeout'));
        }
      }, this.options.timeout);
    });
  }

  /**
   * Process job queue
   */
  processQueue() {
    if (this.taskQueue.length === 0) return;

    const availableWorkers = this.workers.filter(w => w.isAvailable && !w.currentJob);
    if (availableWorkers.length === 0) return;

    const worker = availableWorkers[0];
    const job = this.taskQueue.shift();

    if (!job) return;

    worker.isAvailable = false;
    worker.currentJob = job;

    worker.postMessage({
      jobId: job.jobId,
      type: job.type,
      data: job.data
    });

    this.emit('jobStarted', { jobId: job.jobId, workerId: worker.threadId });

    // Continue processing queue
    setImmediate(() => this.processQueue());
  }

  /**
   * Process multiple jobs in parallel
   */
  async processJobsParallel(jobs) {
    const promises = jobs.map(job =>
      this.submitJob(job.type, job.data)
    );

    return Promise.allSettled(promises);
  }

  /**
   * Handle worker messages
   */
  handleWorkerMessage(worker, message) {
    const { jobId, type, result, error } = message;
    const job = this.activeJobs.get(jobId);

    if (!job) return;

    worker.isAvailable = true;
    worker.currentJob = null;
    worker.processedCount++;

    this.activeJobs.delete(jobId);

    if (type === 'success') {
      const processingTime = Date.now() - job.startTime;
      this.updateStats(processingTime, true);

      this.completedJobs.set(jobId, {
        ...job,
        result,
        processingTime
      });

      job.resolve(result);
      this.emit('jobCompleted', { jobId, workerId: worker.threadId, processingTime });
    } else if (type === 'error') {
      // Retry logic
      if (job.retries < job.maxRetries) {
        job.retries++;
        this.taskQueue.unshift(job);
        this.activeJobs.set(jobId, job);
        this.emit('jobRetry', { jobId, retry: job.retries, workerId: worker.threadId });
      } else {
        const processingTime = Date.now() - job.startTime;
        this.updateStats(processingTime, false);

        this.failedJobs.set(jobId, {
          ...job,
          error,
          processingTime
        });

        job.reject(new Error(error.message));
        this.emit('jobFailed', { jobId, workerId: worker.threadId, error });
      }
    }

    // Continue processing queue
    this.processQueue();
  }

  /**
   * Handle worker errors
   */
  handleWorkerError(worker, error) {
    this.emit('workerError', { workerId: worker.threadId, error });

    // Mark worker as unavailable and restart if needed
    worker.isAvailable = false;

    // Requeue current job if any
    if (worker.currentJob) {
      this.taskQueue.unshift(worker.currentJob);
      this.activeJobs.delete(worker.currentJob.jobId);
      worker.currentJob = null;
    }

    // Replace failed worker
    setTimeout(() => {
      this.replaceWorker(worker);
    }, 1000);
  }

  /**
   * Handle worker exit
   */
  handleWorkerExit(worker, code) {
    this.emit('workerExit', { workerId: worker.threadId, code });

    // Remove from workers array
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    // Requeue current job if any
    if (worker.currentJob) {
      this.taskQueue.unshift(worker.currentJob);
      this.activeJobs.delete(worker.currentJob.jobId);
    }

    // Replace worker if needed
    if (this.isRunning && this.workers.length < this.options.maxWorkers) {
      this.createWorker();
    }
  }

  /**
   * Replace a failed worker
   */
  replaceWorker(failedWorker) {
    const index = this.workers.indexOf(failedWorker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    try {
      failedWorker.terminate();
    } catch (error) {
      // Worker already terminated
    }

    if (this.workers.length < this.options.maxWorkers) {
      this.createWorker();
    }
  }

  /**
   * Update processing statistics
   */
  updateStats(processingTime, success) {
    this.stats.processed++;
    this.stats.totalTime += processingTime;
    this.stats.avgTime = this.stats.totalTime / this.stats.processed;

    if (success) {
      this.stats.succeeded++;
    } else {
      this.stats.failed++;
    }

    // Calculate throughput (items per second)
    const now = Date.now();
    if (!this.statsStartTime) {
      this.statsStartTime = now;
    }
    const elapsedSeconds = (now - this.statsStartTime) / 1000;
    this.stats.throughput = this.stats.processed / Math.max(1, elapsedSeconds);

    // Calculate worker utilization
    const busyWorkers = this.workers.filter(w => !w.isAvailable).length;
    this.stats.workerUtilization = (busyWorkers / this.workers.length) * 100;
  }

  /**
   * Get processing statistics
   */
  getStats() {
    return {
      ...this.stats,
      workers: {
        total: this.workers.length,
        available: this.workers.filter(w => w.isAvailable).length,
        busy: this.workers.filter(w => !w.isAvailable).length
      },
      queue: {
        pending: this.taskQueue.length,
        active: this.activeJobs.size,
        completed: this.completedJobs.size,
        failed: this.failedJobs.size
      }
    };
  }

  /**
   * Scale worker pool
   */
  scaleWorkers(targetCount) {
    targetCount = Math.max(1, Math.min(targetCount, cpus().length * 2));

    while (this.workers.length < targetCount) {
      this.createWorker();
    }

    while (this.workers.length > targetCount) {
      const worker = this.workers.find(w => w.isAvailable && !w.currentJob);
      if (worker) {
        this.removeWorker(worker);
      } else {
        break; // Can't remove busy workers
      }
    }

    this.emit('workersScaled', { count: this.workers.length });
  }

  /**
   * Remove a worker
   */
  removeWorker(worker) {
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
      worker.terminate();
      this.emit('workerRemoved', { workerId: worker.threadId });
    }
  }

  /**
   * Pause processing
   */
  pause() {
    this.isRunning = false;
    this.emit('paused');
  }

  /**
   * Resume processing
   */
  resume() {
    this.isRunning = true;
    this.processQueue();
    this.emit('resumed');
  }

  /**
   * Clear all queues and reset
   */
  clear() {
    this.taskQueue.length = 0;
    this.activeJobs.clear();
    this.completedJobs.clear();
    this.failedJobs.clear();

    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      totalTime: 0,
      avgTime: 0,
      throughput: 0,
      workerUtilization: 0
    };

    this.emit('cleared');
  }

  /**
   * Gracefully shutdown the pipeline
   */
  async shutdown() {
    this.isRunning = false;

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = 30000;
    const startTime = Date.now();

    while (this.activeJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    const terminationPromises = this.workers.map(worker =>
      new Promise((resolve) => {
        worker.once('exit', resolve);
        worker.terminate();
      })
    );

    try {
      await Promise.all(terminationPromises);
    } catch (error) {
      // Force termination if needed
    }

    this.workers.length = 0;
    this.emit('shutdown');
  }
}

// Handle worker thread execution
if (!isMainThread && workerData?.isWorker) {
  const pipeline = new ConcurrentFilterPipeline(workerData.options);
}

export default ConcurrentFilterPipeline;
export { ConcurrentFilterPipeline };