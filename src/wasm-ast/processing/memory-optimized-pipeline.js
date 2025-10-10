/**
 * Memory-Optimized AST Processing Pipeline
 *
 * High-performance, memory-efficient processing with sub-millisecond targets
 * through advanced memory management, streaming, and Redis coordination
 */

import { performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

export interface MemoryPool {
  nodes: any[];
  strings: string[];
  buffers: Buffer[];
  maxSize: number;
  currentSize: number;
}

export interface ProcessingBatch {
  id: string;
  files: string[];
  operations: string[];
  priority: number;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  memoryBudget: number; // MB
}

export interface StreamProcessor {
  id: string;
  stream: Transform;
  buffer: Buffer;
  position: number;
  memoryUsage: number;
}

export interface MemoryOptimizedMetrics {
  totalProcessed: number;
  averageProcessingTime: number;
  memoryEfficiency: number; // MB per 1000 files
  cacheHitRate: number;
  throughput: number; // files per second
  subMillisecondRate: number;
  memoryLeaksDetected: number;
  gcFrequency: number;
  streamingEfficiency: number;
}

export interface RedisMemoryMessage {
  type: 'MEMORY_UPDATE' | 'PROCESSING_BATCH' | 'MEMORY_LEAK_ALERT' | 'GARBAGE_COLLECTION';
  swarmId: string;
  timestamp: number;
  agent: string;
  confidence: number;
  data: {
    memoryUsage?: number;
    processingBatch?: string;
    leakDetected?: boolean;
    gcTriggered?: boolean;
    metrics?: Partial<MemoryOptimizedMetrics>;
  };
}

export class MemoryOptimizedPipeline {
  private memoryPool: MemoryPool;
  private activeWorkers: Map<string, Worker> = new Map();
  private streamProcessors: Map<string, StreamProcessor> = new Map();
  private processingQueue: ProcessingBatch[] = [];
  private activeBatches: Map<string, ProcessingBatch> = new Map();
  private metrics: MemoryOptimizedMetrics;
  private agentId: string;
  private swarmId: string;
  private redisClient: any;
  private memoryLimit: number; // MB
  private gcThreshold: number; // MB
  private lastGCTime: number = 0;
  private memorySnapshots: number[] = [];
  private streamBufferSize: number = 64 * 1024; // 64KB buffers

  constructor(
    swarmId: string = 'ast-performance-optimization',
    memoryLimit: number = 512, // 512MB default
    redisClient?: any
  ) {
    this.swarmId = swarmId;
    this.agentId = `memory-optimizer-${process.pid}-${Date.now()}`;
    this.redisClient = redisClient;
    this.memoryLimit = memoryLimit;
    this.gcThreshold = memoryLimit * 0.8; // GC at 80% of limit

    // Initialize memory pool
    this.memoryPool = {
      nodes: [],
      strings: [],
      buffers: [],
      maxSize: 10000,
      currentSize: 0
    };

    // Initialize metrics
    this.metrics = {
      totalProcessed: 0,
      averageProcessingTime: 0,
      memoryEfficiency: 0,
      cacheHitRate: 0,
      throughput: 0,
      subMillisecondRate: 0,
      memoryLeaksDetected: 0,
      gcFrequency: 0,
      streamingEfficiency: 0
    };

    this.initializeMemoryPool();
    this.setupMemoryMonitoring();
    this.initializeRedisCoordination();
  }

  /**
   * Initialize memory pool for efficient object allocation
   */
  private initializeMemoryPool(): void {
    // Pre-allocate AST nodes
    for (let i = 0; i < 5000; i++) {
      this.memoryPool.nodes.push({
        type: null,
        name: null,
        value: null,
        children: null,
        metadata: null,
        _inUse: false
      });
    }

    // Pre-allocate string buffers
    for (let i = 0; i < 1000; i++) {
      this.memoryPool.strings.push('');
    }

    // Pre-allocate Buffer objects
    for (let i = 0; i < 500; i++) {
      this.memoryPool.buffers.push(Buffer.alloc(this.streamBufferSize));
    }

    console.log(`🧠 Memory pool initialized: ${this.memoryPool.nodes.length} nodes, ${this.memoryPool.buffers.length} buffers`);
  }

  /**
   * Setup memory monitoring and garbage collection
   */
  private setupMemoryMonitoring(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage().heapUsed / (1024 * 1024); // MB
      this.memorySnapshots.push(memUsage);

      // Keep only last 100 snapshots
      if (this.memorySnapshots.length > 100) {
        this.memorySnapshots.shift();
      }

      // Check if GC is needed
      if (memUsage > this.gcThreshold) {
        this.triggerGarbageCollection();
      }

      // Check for memory leaks
      if (this.detectMemoryLeak()) {
        this.handleMemoryLeak();
      }

      // Update memory efficiency metrics
      this.updateMemoryMetrics();

      // Publish memory update
      this.publishMemoryUpdate({
        memoryUsage: memUsage,
        metrics: this.metrics
      });

    }, 5000); // Check every 5 seconds
  }

  /**
   * Initialize Redis coordination
   */
  private async initializeRedisCoordination(): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.subscribe(`swarm:${this.swarmId}`, (message) => {
        this.handleRedisMessage(JSON.parse(message));
      });

      // Publish initialization
      await this.publishMemoryUpdate({
        memoryUsage: process.memoryUsage().heapUsed / (1024 * 1024),
        metrics: this.metrics
      });

    } catch (error) {
      console.warn('Redis coordination setup failed:', error);
    }
  }

  /**
   * Process batch of files with memory optimization
   */
  async processBatchOptimized(batch: ProcessingBatch): Promise<any> {
    const startTime = performance.now();
    batch.status = 'processing';
    this.activeBatches.set(batch.id, batch);

    console.log(`🔄 Processing batch ${batch.id} with ${batch.files.length} files...`);

    try {
      // Check memory budget
      if (!this.checkMemoryBudget(batch)) {
        throw new Error(`Memory budget exceeded: ${batch.memoryBudget}MB`);
      }

      // Choose processing strategy based on batch size
      let results;
      if (batch.files.length <= 50) {
        results = await this.processSmallBatch(batch);
      } else if (batch.files.length <= 500) {
        results = await this.processMediumBatch(batch);
      } else {
        results = await this.processLargeBatchStreaming(batch);
      }

      const processingTime = performance.now() - startTime;

      // Update metrics
      this.updateBatchMetrics(processingTime, batch.files.length);

      batch.status = 'completed';

      // Publish completion
      await this.publishBatchUpdate(batch, {
        success: true,
        processingTime,
        filesProcessed: batch.files.length
      });

      return results;

    } catch (error) {
      batch.status = 'failed';
      console.error(`❌ Batch ${batch.id} failed:`, error);

      await this.publishBatchUpdate(batch, {
        success: false,
        error: error.message
      });

      throw error;

    } finally {
      this.activeBatches.delete(batch.id);
      this.cleanupBatchResources(batch);
    }
  }

  /**
   * Process small batch with in-memory optimization
   */
  private async processSmallBatch(batch: ProcessingBatch): Promise<any[]> {
    const results = [];

    for (const file of batch.files) {
      const result = await this.processFileOptimized(file, batch.operations);
      results.push(result);
    }

    return results;
  }

  /**
   * Process medium batch with worker threads
   */
  private async processMediumBatch(batch: ProcessingBatch): Promise<any[]> {
    const workerCount = Math.min(4, batch.files.length);
    const chunkSize = Math.ceil(batch.files.length / workerCount);
    const promises = [];

    for (let i = 0; i < workerCount; i++) {
      const chunk = batch.files.slice(i * chunkSize, (i + 1) * chunkSize);
      const promise = this.processWithWorker(chunk, batch.operations, `worker-${batch.id}-${i}`);
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    return results.flat();
  }

  /**
   * Process large batch with streaming
   */
  private async processLargeBatchStreaming(batch: ProcessingBatch): Promise<any[]> {
    const streamProcessor = this.createStreamProcessor(batch);
    const results = [];

    // Create transform stream for AST processing
    const astTransform = new Transform({
      objectMode: true,
      transform: async (chunk, encoding, callback) => {
        try {
          const result = await this.processFileChunk(chunk, batch.operations);
          results.push(result);
          callback(null, result);
        } catch (error) {
          callback(error);
        }
      }
    });

    // Process files as stream
    for (const file of batch.files) {
      streamProcessor.stream.write({
        id: file,
        content: file, // In real implementation, this would be file content
        operations: batch.operations
      });
    }

    streamProcessor.stream.end();

    // Wait for stream processing to complete
    await new Promise((resolve, reject) => {
      streamProcessor.stream.on('finish', resolve);
      streamProcessor.stream.on('error', reject);
    });

    return results;
  }

  /**
   * Process individual file with memory optimization
   */
  private async processFileOptimized(file: string, operations: string[]): Promise<any> {
    const startTime = performance.now();

    // Get AST node from pool
    const astNode = this.getNodeFromPool();

    try {
      // Simulate AST parsing (in real implementation, this would use optimized AST engine)
      astNode.type = 'File';
      astNode.name = file;
      astNode.children = [];
      astNode.metadata = {
        parseTime: 0,
        operations: operations,
        memoryUsage: process.memoryUsage().heapUsed
      };

      // Apply operations
      for (const operation of operations) {
        this.applyOperationOptimized(astNode, operation);
      }

      const processingTime = performance.now() - startTime;
      astNode.metadata.processingTime = processingTime;

      return {
        success: true,
        file,
        astNode,
        processingTime,
        operations: operations.length
      };

    } finally {
      // Return node to pool
      this.returnNodeToPool(astNode);
    }
  }

  /**
   * Process file chunk for streaming
   */
  private async processFileChunk(chunk: any, operations: string[]): Promise<any> {
    const startTime = performance.now();

    // Use minimal memory for chunk processing
    const result = {
      id: chunk.id,
      processed: true,
      operations: operations.map(op => ({ name: op, applied: true })),
      timestamp: Date.now(),
      processingTime: 0
    };

    result.processingTime = performance.now() - startTime;
    return result;
  }

  /**
   * Apply operation with minimal memory allocation
   */
  private applyOperationOptimized(node: any, operation: string): void {
    // Use string pooling for operation names
    let opString = this.getStringFromPool();
    opString = operation;

    switch (opString) {
      case 'parse':
        // Minimal parsing logic
        node.parsed = true;
        break;
      case 'transform':
        // Minimal transformation logic
        node.transformed = true;
        break;
      case 'optimize':
        // Minimal optimization logic
        node.optimized = true;
        break;
      default:
        node.customOperation = opString;
    }

    // Return string to pool
    this.returnStringToPool(opString);
  }

  /**
   * Process with worker thread
   */
  private async processWithWorker(files: string[], operations: string[], workerId: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');

        parentPort.on('message', async ({ files, operations }) => {
          const results = [];

          for (const file of files) {
            // Simulate processing
            results.push({
              file,
              processed: true,
              operations: operations.length,
              workerId: process.env.WORKER_ID
            });
          }

          parentPort.postMessage({ results });
        });
      `, {
        eval: true,
        env: { ...process.env, WORKER_ID: workerId }
      });

      this.activeWorkers.set(workerId, worker);

      worker.on('message', (message) => {
        this.activeWorkers.delete(workerId);
        worker.terminate();
        resolve(message.results);
      });

      worker.on('error', (error) => {
        this.activeWorkers.delete(workerId);
        worker.terminate();
        reject(error);
      });

      worker.on('exit', (code) => {
        this.activeWorkers.delete(workerId);
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      worker.postMessage({ files, operations });
    });
  }

  /**
   * Create stream processor
   */
  private createStreamProcessor(batch: ProcessingBatch): StreamProcessor {
    const buffer = this.getBufferFromPool();

    const stream = new Transform({
      objectMode: true,
      highWaterMark: 100,
      transform: (chunk, encoding, callback) => {
        // Process chunk with minimal memory usage
        setImmediate(() => {
          try {
            const processed = { ...chunk, processed: true, batchId: batch.id };
            callback(null, processed);
          } catch (error) {
            callback(error);
          }
        });
      }
    });

    const processor: StreamProcessor = {
      id: `stream-${batch.id}`,
      stream,
      buffer,
      position: 0,
      memoryUsage: buffer.length
    };

    this.streamProcessors.set(processor.id, processor);
    return processor;
  }

  /**
   * Check memory budget for batch
   */
  private checkMemoryBudget(batch: ProcessingBatch): boolean {
    const currentMemory = process.memoryUsage().heapUsed / (1024 * 1024);
    const estimatedBatchMemory = batch.files.length * 0.1; // Estimate 100KB per file

    return (currentMemory + estimatedBatchMemory) <= batch.memoryBudget;
  }

  /**
   * Trigger garbage collection
   */
  private triggerGarbageCollection(): void {
    const now = Date.now();

    // Limit GC frequency
    if (now - this.lastGCTime < 10000) { // 10 seconds minimum
      return;
    }

    console.log('🗑️  Triggering garbage collection...');

    if (global.gc) {
      global.gc();
      this.lastGCTime = now;
      this.metrics.gcFrequency++;

      this.publishMemoryUpdate({
        gcTriggered: true
      });
    }
  }

  /**
   * Detect memory leak
   */
  private detectMemoryLeak(): boolean {
    if (this.memorySnapshots.length < 20) {
      return false;
    }

    // Check if memory is consistently increasing
    const recent = this.memorySnapshots.slice(-10);
    const older = this.memorySnapshots.slice(-20, -10);

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const growthRate = (recentAvg - olderAvg) / olderAvg;

    if (growthRate > 0.1) { // 10% growth indicates potential leak
      this.metrics.memoryLeaksDetected++;
      return true;
    }

    return false;
  }

  /**
   * Handle memory leak
   */
  private handleMemoryLeak(): void {
    console.warn('🚨 Memory leak detected!');

    this.publishMemoryUpdate({
      leakDetected: true
    });

    // Aggressive cleanup
    this.cleanupAllResources();
    this.triggerGarbageCollection();
  }

  /**
   * Update memory metrics
   */
  private updateMemoryMetrics(): void {
    const memUsage = process.memoryUsage().heapUsed / (1024 * 1024);

    this.metrics.memoryEfficiency = this.metrics.totalProcessed > 0
      ? memUsage / (this.metrics.totalProcessed / 1000)
      : 0;

    // Calculate streaming efficiency
    const activeStreams = this.streamProcessors.size;
    this.metrics.streamingEfficiency = activeStreams > 0
      ? this.metrics.totalProcessed / activeStreams
      : 0;
  }

  /**
   * Update batch metrics
   */
  private updateBatchMetrics(processingTime: number, fileCount: number): void {
    this.metrics.totalProcessed += fileCount;

    // Update average processing time
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (this.metrics.totalProcessed - fileCount) + processingTime) /
      this.metrics.totalProcessed;

    // Update throughput
    this.metrics.throughput = this.metrics.totalProcessed / (Date.now() / 1000);

    // Update sub-millisecond rate
    const subMsCount = processingTime < 1.0 ? fileCount : 0;
    this.metrics.subMillisecondRate =
      (this.metrics.subMillisecondRate * (this.metrics.totalProcessed - fileCount) + subMsCount) /
      this.metrics.totalProcessed;
  }

  /**
   * Memory pool management
   */
  private getNodeFromPool(): any {
    const node = this.memoryPool.nodes.find(n => !n._inUse);
    if (node) {
      node._inUse = true;
      return node;
    }
    // Create new node if pool is exhausted
    return { type: null, name: null, value: null, children: null, metadata: null, _inUse: true };
  }

  private returnNodeToPool(node: any): void {
    if (node && node._inUse !== undefined) {
      // Reset node
      node.type = null;
      node.name = null;
      node.value = null;
      node.children = null;
      node.metadata = null;
      node._inUse = false;
    }
  }

  private getStringFromPool(): string {
    const str = this.memoryPool.strings.pop();
    return str || '';
  }

  private returnStringToPool(str: string): void {
    if (this.memoryPool.strings.length < 1000) {
      this.memoryPool.strings.push('');
    }
  }

  private getBufferFromPool(): Buffer {
    const buffer = this.memoryPool.buffers.pop();
    return buffer || Buffer.alloc(this.streamBufferSize);
  }

  private returnBufferToPool(buffer: Buffer): void {
    if (buffer && this.memoryPool.buffers.length < 500) {
      buffer.fill(0);
      this.memoryPool.buffers.push(buffer);
    }
  }

  /**
   * Cleanup batch resources
   */
  private cleanupBatchResources(batch: ProcessingBatch): void {
    // Cleanup stream processors
    const streamProcessor = this.streamProcessors.get(`stream-${batch.id}`);
    if (streamProcessor) {
      this.returnBufferToPool(streamProcessor.buffer);
      this.streamProcessors.delete(streamProcessor.id);
    }
  }

  /**
   * Cleanup all resources
   */
  private cleanupAllResources(): void {
    // Return all nodes to pool
    for (const node of this.memoryPool.nodes) {
      if (node._inUse) {
        this.returnNodeToPool(node);
      }
    }

    // Terminate all workers
    for (const [id, worker] of this.activeWorkers) {
      worker.terminate();
      this.activeWorkers.delete(id);
    }

    // Cleanup stream processors
    for (const [id, processor] of this.streamProcessors) {
      this.returnBufferToPool(processor.buffer);
      this.streamProcessors.delete(id);
    }

    // Clear active batches
    this.activeBatches.clear();
  }

  /**
   * Handle Redis messages
   */
  private handleRedisMessage(message: RedisMemoryMessage): void {
    if (message.agent === this.agentId) {
      return; // Ignore own messages
    }

    switch (message.type) {
      case 'MEMORY_UPDATE':
        console.log(`Memory update from ${message.agent}:`, message.data);
        break;
      case 'PROCESSING_BATCH':
        console.log(`Batch update from ${message.agent}:`, message.data);
        break;
      case 'MEMORY_LEAK_ALERT':
        console.warn(`Memory leak alert from ${message.agent}:`, message.data);
        break;
      case 'GARBAGE_COLLECTION':
        console.log(`GC event from ${message.agent}:`, message.data);
        break;
    }
  }

  /**
   * Publish memory update
   */
  private async publishMemoryUpdate(data: any): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const message: RedisMemoryMessage = {
        type: 'MEMORY_UPDATE',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        agent: this.agentId,
        confidence: 0.85,
        data
      };

      await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(message));
    } catch (error) {
      console.warn('Failed to publish memory update:', error);
    }
  }

  /**
   * Publish batch update
   */
  private async publishBatchUpdate(batch: ProcessingBatch, result: any): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const message: RedisMemoryMessage = {
        type: 'PROCESSING_BATCH',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        agent: this.agentId,
        confidence: 0.9,
        data: {
          processingBatch: batch.id,
          ...result
        }
      };

      await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(message));
    } catch (error) {
      console.warn('Failed to publish batch update:', error);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): MemoryOptimizedMetrics {
    return { ...this.metrics };
  }

  /**
   * Get memory status
   */
  getMemoryStatus(): any {
    const memUsage = process.memoryUsage();

    return {
      agentId: this.agentId,
      swarmId: this.swarmId,
      currentMemoryUsage: memUsage.heapUsed / (1024 * 1024),
      memoryLimit: this.memoryLimit,
      memoryUtilization: (memUsage.heapUsed / (this.memoryLimit * 1024 * 1024)) * 100,
      activeWorkers: this.activeWorkers.size,
      activeBatches: this.activeBatches.size,
      streamProcessors: this.streamProcessors.size,
      memoryPool: {
        nodesAvailable: this.memoryPool.nodes.filter(n => !n._inUse).length,
        stringsAvailable: this.memoryPool.strings.length,
        buffersAvailable: this.memoryPool.buffers.length
      },
      metrics: this.metrics
    };
  }

  /**
   * Shutdown pipeline
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Memory-Optimized Pipeline...');

    this.cleanupAllResources();

    if (this.redisClient) {
      try {
        const message: RedisMemoryMessage = {
          type: 'MEMORY_UPDATE',
          swarmId: this.swarmId,
          timestamp: Date.now(),
          agent: this.agentId,
          confidence: 1.0,
          data: {
            shutdown: true
          }
        };

        await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(message));
      } catch (error) {
        console.warn('Failed to publish shutdown message:', error);
      }
    }

    console.log(`✅ Memory-Optimized Pipeline shutdown complete - Agent: ${this.agentId}`);
  }
}

export default MemoryOptimizedPipeline;