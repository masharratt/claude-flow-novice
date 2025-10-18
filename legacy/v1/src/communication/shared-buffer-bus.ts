import { Worker } from 'worker_threads';

interface MessageHeader {
  type: number;
  priority: number;
  size: number;
  timestamp: number;
  sourceId: number;
  targetId: number;
}

interface CircularBuffer {
  buffer: SharedArrayBuffer;
  metadata: Int32Array;
  data: Uint8Array;
  capacity: number;
  readIndex: number;
  writeIndex: number;
  lockIndex: number;
}

export class SharedBufferBus {
  private static readonly HEADER_SIZE = 24; // 6 * 4 bytes
  private static readonly BUFFER_SIZE = 64 * 1024 * 1024; // 64MB
  private static readonly MAX_MESSAGE_SIZE = 8192;
  private static readonly LOCK_FREE = 0;
  private static readonly LOCK_ACQUIRED = 1;

  private messageBuffer: CircularBuffer;
  private workerPool: Map<number, Worker> = new Map();
  private messagePool: SharedArrayBuffer[];
  private freeMessages: Int32Array;
  private metrics: {
    messagesProcessed: number;
    averageLatency: number;
    peakThroughput: number;
    currentConnections: number;
  };

  constructor() {
    this.initializeSharedMemory();
    this.initializeMessagePool();
    this.metrics = {
      messagesProcessed: 0,
      averageLatency: 0,
      peakThroughput: 0,
      currentConnections: 0
    };
  }

  private initializeSharedMemory(): void {
    // Create shared buffer for circular message queue
    const totalSize = SharedBufferBus.BUFFER_SIZE + 32; // Extra for metadata
    this.messageBuffer = {
      buffer: new SharedArrayBuffer(totalSize),
      metadata: new Int32Array(new SharedArrayBuffer(32)),
      data: new Uint8Array(new SharedArrayBuffer(SharedBufferBus.BUFFER_SIZE)),
      capacity: SharedBufferBus.BUFFER_SIZE,
      readIndex: 0,
      writeIndex: 1,
      lockIndex: 2
    };

    // Initialize atomic counters
    Atomics.store(this.messageBuffer.metadata, 0, 0); // read index
    Atomics.store(this.messageBuffer.metadata, 1, 0); // write index  
    Atomics.store(this.messageBuffer.metadata, 2, SharedBufferBus.LOCK_FREE); // lock
    Atomics.store(this.messageBuffer.metadata, 3, 0); // message count
  }

  private initializeMessagePool(): void {
    const poolSize = 10000;
    this.messagePool = [];
    this.freeMessages = new Int32Array(new SharedArrayBuffer(poolSize * 4));

    // Pre-allocate message buffers
    for (let i = 0; i < poolSize; i++) {
      const msgBuffer = new SharedArrayBuffer(SharedBufferBus.MAX_MESSAGE_SIZE);
      this.messagePool.push(msgBuffer);
      Atomics.store(this.freeMessages, i, 1); // Mark as free
    }
  }

  public async sendMessage(
    type: number,
    data: Uint8Array,
    priority: number = 0,
    targetId: number = -1
  ): Promise<boolean> {
    const startTime = performance.now();
    
    // Acquire message buffer from pool
    const msgIndex = this.acquireMessageBuffer();
    if (msgIndex === -1) {
      return false; // Pool exhausted
    }

    const messageSize = SharedBufferBus.HEADER_SIZE + data.length;
    if (messageSize > SharedBufferBus.MAX_MESSAGE_SIZE) {
      this.releaseMessageBuffer(msgIndex);
      return false;
    }

    // Try to acquire write lock with atomic compare-exchange
    let lockAcquired = false;
    let attempts = 0;
    const maxAttempts = 1000;

    while (!lockAcquired && attempts < maxAttempts) {
      const current = Atomics.compareExchange(
        this.messageBuffer.metadata,
        this.messageBuffer.lockIndex,
        SharedBufferBus.LOCK_FREE,
        SharedBufferBus.LOCK_ACQUIRED
      );
      
      lockAcquired = current === SharedBufferBus.LOCK_FREE;
      attempts++;
      
      if (!lockAcquired) {
        // Exponential backoff with atomic wait
        const backoff = Math.min(attempts * 10, 1000);
        Atomics.wait(this.messageBuffer.metadata, this.messageBuffer.lockIndex, SharedBufferBus.LOCK_ACQUIRED, backoff);
      }
    }

    if (!lockAcquired) {
      this.releaseMessageBuffer(msgIndex);
      return false;
    }

    try {
      // Get current write position
      const writePos = Atomics.load(this.messageBuffer.metadata, this.messageBuffer.writeIndex);
      const readPos = Atomics.load(this.messageBuffer.metadata, this.messageBuffer.readIndex);
      
      // Check if buffer has space (circular buffer logic)
      const availableSpace = this.calculateAvailableSpace(writePos, readPos);
      if (availableSpace < messageSize) {
        return false; // Buffer full
      }

      // Write message header
      const header: MessageHeader = {
        type,
        priority,
        size: data.length,
        timestamp: Date.now(),
        sourceId: 0, // Current worker ID
        targetId
      };

      this.writeMessageToBuffer(writePos, header, data);
      
      // Update write index atomically
      const newWritePos = (writePos + messageSize) % this.messageBuffer.capacity;
      Atomics.store(this.messageBuffer.metadata, this.messageBuffer.writeIndex, newWritePos);
      
      // Increment message count
      Atomics.add(this.messageBuffer.metadata, 3, 1);

      // Wake up waiting readers
      Atomics.notify(this.messageBuffer.metadata, this.messageBuffer.readIndex, 1);

      // Update metrics
      const latency = performance.now() - startTime;
      this.updateMetrics(latency);

      return true;

    } finally {
      // Release write lock
      Atomics.store(this.messageBuffer.metadata, this.messageBuffer.lockIndex, SharedBufferBus.LOCK_FREE);
      Atomics.notify(this.messageBuffer.metadata, this.messageBuffer.lockIndex, 1);
      this.releaseMessageBuffer(msgIndex);
    }
  }

  public async receiveMessage(timeoutMs: number = 1000): Promise<{
    type: number;
    data: Uint8Array;
    header: MessageHeader;
  } | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const readPos = Atomics.load(this.messageBuffer.metadata, this.messageBuffer.readIndex);
      const writePos = Atomics.load(this.messageBuffer.metadata, this.messageBuffer.writeIndex);

      // Check if messages available
      if (readPos === writePos) {
        // Wait for new messages with atomic wait
        const result = Atomics.wait(
          this.messageBuffer.metadata,
          this.messageBuffer.readIndex,
          readPos,
          Math.min(100, timeoutMs - (Date.now() - startTime))
        );
        
        if (result === 'timed-out') continue;
        if (result === 'not-equal') continue; // New message available
      }

      // Try to read message
      const message = this.readMessageFromBuffer(readPos);
      if (message) {
        // Update read index atomically
        const newReadPos = (readPos + SharedBufferBus.HEADER_SIZE + message.header.size) % this.messageBuffer.capacity;
        Atomics.store(this.messageBuffer.metadata, this.messageBuffer.readIndex, newReadPos);
        
        // Decrement message count
        Atomics.sub(this.messageBuffer.metadata, 3, 1);
        
        return message;
      }
    }

    return null; // Timeout
  }

  private acquireMessageBuffer(): number {
    for (let i = 0; i < this.freeMessages.length; i++) {
      const current = Atomics.compareExchange(this.freeMessages, i, 1, 0);
      if (current === 1) {
        return i; // Successfully acquired buffer at index i
      }
    }
    return -1; // No free buffers
  }

  private releaseMessageBuffer(index: number): void {
    Atomics.store(this.freeMessages, index, 1);
  }

  private calculateAvailableSpace(writePos: number, readPos: number): number {
    if (writePos >= readPos) {
      return this.messageBuffer.capacity - writePos + readPos;
    }
    return readPos - writePos;
  }

  private writeMessageToBuffer(position: number, header: MessageHeader, data: Uint8Array): void {
    const headerView = new DataView(this.messageBuffer.buffer, position, SharedBufferBus.HEADER_SIZE);
    
    // Write header fields
    headerView.setUint32(0, header.type, true);
    headerView.setUint32(4, header.priority, true);
    headerView.setUint32(8, header.size, true);
    headerView.setBigUint64(12, BigInt(header.timestamp), true);
    headerView.setUint32(20, header.sourceId, true);
    headerView.setUint32(24, header.targetId, true);

    // Write message data
    const dataView = new Uint8Array(this.messageBuffer.buffer, position + SharedBufferBus.HEADER_SIZE, data.length);
    dataView.set(data);
  }

  private readMessageFromBuffer(position: number): {
    type: number;
    data: Uint8Array;
    header: MessageHeader;
  } | null {
    try {
      const headerView = new DataView(this.messageBuffer.buffer, position, SharedBufferBus.HEADER_SIZE);
      
      const header: MessageHeader = {
        type: headerView.getUint32(0, true),
        priority: headerView.getUint32(4, true),
        size: headerView.getUint32(8, true),
        timestamp: Number(headerView.getBigUint64(12, true)),
        sourceId: headerView.getUint32(20, true),
        targetId: headerView.getUint32(24, true)
      };

      // Read message data
      const data = new Uint8Array(this.messageBuffer.buffer, position + SharedBufferBus.HEADER_SIZE, header.size);
      
      return {
        type: header.type,
        data: new Uint8Array(data), // Copy data
        header
      };
    } catch (error) {
      return null;
    }
  }

  private updateMetrics(latency: number): void {
    this.metrics.messagesProcessed++;
    this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);
  }

  public getMetrics() {
    return { ...this.metrics };
  }

  public getBufferStatus() {
    return {
      readIndex: Atomics.load(this.messageBuffer.metadata, this.messageBuffer.readIndex),
      writeIndex: Atomics.load(this.messageBuffer.metadata, this.messageBuffer.writeIndex),
      messageCount: Atomics.load(this.messageBuffer.metadata, 3),
      capacity: this.messageBuffer.capacity
    };
  }

  public getSharedBuffer(): SharedArrayBuffer {
    return this.messageBuffer.buffer;
  }
}