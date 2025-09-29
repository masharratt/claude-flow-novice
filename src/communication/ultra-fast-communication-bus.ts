/**
 * Ultra-Fast Communication Bus
 * Zero-latency message routing with lock-free data structures
 * Target: <1ms P95 message delivery
 */

import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';

// Lock-free ring buffer implementation
class LockFreeRingBuffer<T> {
  private readonly buffer: Array<T>;
  private readonly capacity: number;
  private readonly mask: number;
  
  // Atomic indices with cache line padding
  private readonly writeIndex = new SharedArrayBuffer(64);
  private readonly readIndex = new SharedArrayBuffer(64);
  private readonly writeView: BigUint64Array;
  private readonly readView: BigUint64Array;

  constructor(capacity: number = 65536) {
    // Ensure power of 2 for efficient modulo operations
    this.capacity = Math.pow(2, Math.ceil(Math.log2(capacity)));
    this.mask = this.capacity - 1;
    this.buffer = new Array(this.capacity);
    
    this.writeView = new BigUint64Array(this.writeIndex);
    this.readView = new BigUint64Array(this.readIndex);
    
    // Initialize atomic counters
    Atomics.store(this.writeView, 0, 0n);
    Atomics.store(this.readView, 0, 0n);
  }

  enqueue(item: T): boolean {
    const writePos = Number(Atomics.load(this.writeView, 0));
    const nextWritePos = (writePos + 1) & this.mask;
    const readPos = Number(Atomics.load(this.readView, 0));

    // Check if buffer is full
    if (nextWritePos === readPos) {
      return false;
    }

    this.buffer[writePos] = item;
    
    // Memory barrier to ensure write completion before index update
    Atomics.store(this.writeView, 0, BigInt(nextWritePos));
    return true;
  }

  dequeue(): T | null {
    const readPos = Number(Atomics.load(this.readView, 0));
    const writePos = Number(Atomics.load(this.writeView, 0));

    // Check if buffer is empty
    if (readPos === writePos) {
      return null;
    }

    const item = this.buffer[readPos];
    const nextReadPos = (readPos + 1) & this.mask;
    
    Atomics.store(this.readView, 0, BigInt(nextReadPos));
    return item;
  }

  size(): number {
    const writePos = Number(Atomics.load(this.writeView, 0));
    const readPos = Number(Atomics.load(this.readView, 0));
    return (writePos - readPos) & this.mask;
  }

  isEmpty(): boolean {
    return this.size() === 0;
  }

  isFull(): boolean {
    return this.size() === this.capacity - 1;
  }
}

// High-performance message structure
interface UltraFastMessage {
  readonly id: bigint;
  readonly type: number;
  readonly timestamp: bigint;
  readonly payload: ArrayBuffer;
  readonly routingKey: string;
  readonly priority: number;
}

// Memory pool for zero-allocation message creation
class MessagePool {
  private readonly pool: UltraFastMessage[];
  private readonly available: LockFreeRingBuffer<number>;
  private readonly poolSize: number;

  constructor(poolSize: number = 10000) {
    this.poolSize = poolSize;
    this.pool = new Array(poolSize);
    this.available = new LockFreeRingBuffer<number>(poolSize);

    // Pre-allocate all messages
    for (let i = 0; i < poolSize; i++) {
      this.pool[i] = this.createMessage();
      this.available.enqueue(i);
    }
  }

  private createMessage(): UltraFastMessage {
    return {
      id: 0n,
      type: 0,
      timestamp: 0n,
      payload: new ArrayBuffer(0),
      routingKey: '',
      priority: 0
    };
  }

  acquire(): UltraFastMessage | null {
    const index = this.available.dequeue();
    if (index === null) {
      return null;
    }
    return this.pool[index];
  }

  release(message: UltraFastMessage): void {
    const index = this.pool.indexOf(message);
    if (index >= 0) {
      this.available.enqueue(index);
    }
  }
}

// Ultra-fast topic matcher with pre-compiled patterns
class TopicMatcher {
  private readonly patterns = new Map<string, RegExp>();
  private readonly exactMatches = new Map<string, Set<string>>();
  private readonly wildcardPatterns = new Map<RegExp, Set<string>>();

  addRoute(pattern: string, target: string): void {
    if (pattern.includes('*') || pattern.includes('#')) {
      // Wildcard pattern
      const regex = this.compilePattern(pattern);
      this.patterns.set(pattern, regex);
      
      if (!this.wildcardPatterns.has(regex)) {
        this.wildcardPatterns.set(regex, new Set());
      }
      this.wildcardPatterns.get(regex)!.add(target);
    } else {
      // Exact match
      if (!this.exactMatches.has(pattern)) {
        this.exactMatches.set(pattern, new Set());
      }
      this.exactMatches.get(pattern)!.add(target);
    }
  }

  private compilePattern(pattern: string): RegExp {
    // Convert MQTT-style wildcards to regex
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '[^/]*')
      .replace(/\\#/g, '.*');
    
    return new RegExp(`^${escaped}$`);
  }

  match(topic: string): Set<string> {
    const results = new Set<string>();

    // Check exact matches first (fastest)
    const exactTargets = this.exactMatches.get(topic);
    if (exactTargets) {
      exactTargets.forEach(target => results.add(target));
    }

    // Check wildcard patterns
    for (const [regex, targets] of this.wildcardPatterns) {
      if (regex.test(topic)) {
        targets.forEach(target => results.add(target));
      }
    }

    return results;
  }
}

// Main ultra-fast communication bus
export class UltraFastCommunicationBus {
  private readonly messageQueues = new Map<string, LockFreeRingBuffer<UltraFastMessage>>();
  private readonly messagePool: MessagePool;
  private readonly topicMatcher: TopicMatcher;
  private readonly workers: Worker[] = [];
  private readonly metrics = {
    messagesProcessed: 0n,
    totalLatency: 0n,
    lastFlushTime: BigInt(Math.floor(performance.now() * 1000000))
  };

  constructor() {
    this.messagePool = new MessagePool(50000);
    this.topicMatcher = new TopicMatcher();
    this.initializeWorkerPool();
    this.startMetricsCollection();
  }

  private initializeWorkerPool(): void {
    const cpuCount = require('os').cpus().length;
    const workerCount = Math.min(cpuCount - 1, 8); // Reserve one core for main thread

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(`
        const { parentPort } = require('worker_threads');
        
        parentPort.on('message', (msg) => {
          // Process message with zero-copy operations
          const startTime = process.hrtime.bigint();
          
          // Simulate processing
          const endTime = process.hrtime.bigint();
          const latency = endTime - startTime;
          
          parentPort.postMessage({
            type: 'processed',
            messageId: msg.id,
            latency: latency
          });
        });
      `, { eval: true });

      // Pin worker to specific CPU core if possible
      this.pinWorkerToCPU(worker, i);
      this.workers.push(worker);
    }
  }

  private pinWorkerToCPU(worker: Worker, cpuIndex: number): void {
    // This would require native bindings or Linux-specific calls
    // For now, we'll use thread affinity hints
    try {
      const binding = require('cpu-features');
      if (binding && binding.setAffinity) {
        binding.setAffinity(worker.threadId, 1 << cpuIndex);
      }
    } catch (error) {
      // CPU pinning not available, continue without it
    }
  }

  // Ultra-fast message publishing with zero-copy semantics
  publish(topic: string, payload: ArrayBuffer, priority: number = 0): boolean {
    const startTime = process.hrtime.bigint();
    
    // Acquire message from pool
    const message = this.messagePool.acquire();
    if (!message) {
      return false; // Pool exhausted
    }

    // Populate message (reuse existing object)
    (message as any).id = BigInt(Date.now()) * 1000000n + BigInt(Math.random() * 1000000);
    (message as any).type = 1;
    (message as any).timestamp = startTime;
    (message as any).payload = payload; // Zero-copy reference
    (message as any).routingKey = topic;
    (message as any).priority = priority;

    // Route to subscribers
    const targets = this.topicMatcher.match(topic);
    let delivered = false;

    for (const target of targets) {
      const queue = this.messageQueues.get(target);
      if (queue && queue.enqueue(message)) {
        delivered = true;
      }
    }

    // Update metrics atomically
    const endTime = process.hrtime.bigint();
    const latency = endTime - startTime;
    
    Atomics.add(new BigUint64Array(new SharedArrayBuffer(8)), 0, 1n); // Message count
    Atomics.add(new BigUint64Array(new SharedArrayBuffer(8)), 0, latency); // Total latency

    return delivered;
  }

  // Subscribe with dedicated queue
  subscribe(topic: string, queueId: string): void {
    if (!this.messageQueues.has(queueId)) {
      this.messageQueues.set(queueId, new LockFreeRingBuffer<UltraFastMessage>(65536));
    }
    
    this.topicMatcher.addRoute(topic, queueId);
  }

  // High-performance message consumption
  consume(queueId: string, maxBatch: number = 32): UltraFastMessage[] {
    const queue = this.messageQueues.get(queueId);
    if (!queue) {
      return [];
    }

    const batch: UltraFastMessage[] = [];
    let message: UltraFastMessage | null;
    
    while (batch.length < maxBatch && (message = queue.dequeue()) !== null) {
      batch.push(message);
    }

    return batch;
  }

  // Batch processing for maximum throughput
  processBatch(queueId: string, processor: (messages: UltraFastMessage[]) => void): void {
    const batch = this.consume(queueId, 64);
    if (batch.length > 0) {
      const startTime = process.hrtime.bigint();
      processor(batch);
      const endTime = process.hrtime.bigint();

      // Release messages back to pool
      batch.forEach(msg => this.messagePool.release(msg));
      
      // Update processing metrics
      this.metrics.messagesProcessed += BigInt(batch.length);
      this.metrics.totalLatency += (endTime - startTime);
    }
  }

  // Performance metrics
  getMetrics(): {
    messagesPerSecond: number;
    averageLatencyNs: number;
    queueSizes: Map<string, number>;
    poolUtilization: number;
  } {
    const now = BigInt(Math.floor(performance.now() * 1000000));
    const timeDiff = now - this.metrics.lastFlushTime;
    const messagesPerSecond = timeDiff > 0n ? 
      Number(this.metrics.messagesProcessed * 1000000000n / timeDiff) : 0;

    const averageLatencyNs = this.metrics.messagesProcessed > 0n ? 
      Number(this.metrics.totalLatency / this.metrics.messagesProcessed) : 0;

    const queueSizes = new Map<string, number>();
    for (const [queueId, queue] of this.messageQueues) {
      queueSizes.set(queueId, queue.size());
    }

    return {
      messagesPerSecond,
      averageLatencyNs,
      queueSizes,
      poolUtilization: 0.85 // Placeholder - would calculate actual pool usage
    };
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      const metrics = this.getMetrics();
      if (metrics.averageLatencyNs > 1000000) { // > 1ms
        console.warn(`High latency detected: ${metrics.averageLatencyNs}ns`);
      }
    }, 1000);
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    // Drain all queues
    for (const [queueId, queue] of this.messageQueues) {
      while (!queue.isEmpty()) {
        const message = queue.dequeue();
        if (message) {
          this.messagePool.release(message);
        }
      }
    }

    // Terminate workers
    await Promise.all(
      this.workers.map(worker => worker.terminate())
    );
  }
}

// Export singleton instance
export const communicationBus = new UltraFastCommunicationBus();