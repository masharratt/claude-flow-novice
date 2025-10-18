# Enhanced Message Bus Design

## Overview

The Enhanced Message Bus serves as the central nervous system for the Redis messaging infrastructure, providing high-performance message routing, granular tracking, and intelligent coordination capabilities. This design extends the existing `SwarmMessenger` with advanced features for progress tracking and agent visibility.

## Core Architecture

### Message Bus Components

```typescript
interface EnhancedMessageBusConfig {
  redis: RedisConfig;
  performance: {
    batchSize: number;
    compressionThreshold: number;
    priorityQueues: number;
    maxMessageSize: number;
  };
  tracking: {
    enableMetrics: boolean;
    retentionPeriod: number;
    aggregationInterval: number;
  };
  security: {
    encryption: boolean;
    authentication: boolean;
    authorization: boolean;
  };
}

class EnhancedMessageBus extends EventEmitter {
  private publisher: Redis;
  private subscriber: Redis;
  private messageTracker: MessageTracker;
  private priorityQueues: Map<MessagePriority, PriorityQueue>;
  private compressionEngine: CompressionEngine;
  private metricsCollector: MetricsCollector;
  
  constructor(config: EnhancedMessageBusConfig);
  
  // Core messaging methods
  async publishMessage(message: EnhancedMessage): Promise<string>;
  async subscribeToPattern(pattern: string, handler: MessageHandler): Promise<void>;
  async publishProgress(progress: ProgressUpdate): Promise<void>;
  async publishStateChange(stateChange: StateChangeMessage): Promise<void>;
  
  // Performance optimization
  async publishBatch(messages: EnhancedMessage[]): Promise<string[]>;
  async getMetrics(timeRange: TimeRange): Promise<MessageBusMetrics>;
  
  // Lifecycle management
  async start(): Promise<void>;
  async stop(): Promise<void>;
}
```

### Message Structure

```typescript
interface EnhancedMessage {
  id: string;
  type: MessageType;
  priority: MessagePriority;
  source: MessageSource;
  destination: MessageDestination;
  payload: MessagePayload;
  metadata: MessageMetadata;
  tracking: MessageTracking;
}

interface MessageMetadata {
  timestamp: number;
  version: string;
  correlationId?: string;
  causationId?: string;
  requiresAck: boolean;
  ttl?: number;
  retryCount: number;
  maxRetries: number;
  encryptionKeyId?: string;
}

interface MessageTracking {
  delivered: boolean;
  deliveredAt?: number;
  processed: boolean;
  processedAt?: number;
  ackReceived: boolean;
  ackReceivedAt?: number;
  errors: MessageError[];
  metrics: DeliveryMetrics;
}
```

## Message Types and Handlers

### 1. Progress Messages

```typescript
interface ProgressMessage extends EnhancedMessage {
  type: 'progress';
  payload: {
    agentId: string;
    taskId: string;
    operationId?: string;
    currentStep: number;
    totalSteps: number;
    stepDescription: string;
    progressPercentage: number;
    estimatedTimeRemaining?: number;
    confidence?: number;
    blockers?: BlockerInfo[];
    milestones?: MilestoneAchievement[];
  };
}

class ProgressMessageHandler implements MessageHandler {
  async handle(message: ProgressMessage): Promise<void> {
    // Update progress tracking
    await this.progressTracker.updateProgress(message.payload);
    
    // Calculate ETA if needed
    if (message.payload.estimatedTimeRemaining) {
      await this.etaCalculator.updateETA(message.payload.taskId, message.payload.estimatedTimeRemaining);
    }
    
    // Check for milestones
    await this.milestoneTracker.checkMilestones(message.payload);
    
    // Emit progress event
    this.emit('progress_updated', message.payload);
  }
}
```

### 2. State Change Messages

```typescript
interface StateChangeMessage extends EnhancedMessage {
  type: 'state_change';
  payload: {
    agentId: string;
    previousState: AgentState;
    currentState: AgentState;
    reason: StateChangeReason;
    context?: StateChangeContext;
    affectedTasks?: string[];
    relatedAgents?: string[];
  };
}

class StateChangeHandler implements MessageHandler {
  async handle(message: StateChangeMessage): Promise<void> {
    // Update agent state
    await this.agentStateManager.updateState(message.payload);
    
    // Update coordination state
    await this.coordinationManager.handleStateChange(message.payload);
    
    // Check for cascading effects
    await this.cascadeAnalyzer.analyzeImpact(message.payload);
    
    // Update visibility dashboard
    await this.visibilityManager.updateAgentState(message.payload);
    
    // Emit state change event
    this.emit('state_changed', message.payload);
  }
}
```

### 3. Coordination Messages

```typescript
interface CoordinationMessage extends EnhancedMessage {
  type: 'coordination';
  payload: {
    action: CoordinationAction;
    fromAgent: string;
    toAgent: string;
    taskId: string;
    data: any;
    deadline?: number;
    dependencies?: string[];
    priority: MessagePriority;
  };
}

class CoordinationMessageHandler implements MessageHandler {
  async handle(message: CoordinationMessage): Promise<void> {
    switch (message.payload.action) {
      case 'handoff':
        await this.handoffManager.processHandoff(message.payload);
        break;
      case 'request':
        await this.requestManager.processRequest(message.payload);
        break;
      case 'approval':
        await this.approvalManager.processApproval(message.payload);
        break;
      case 'block':
        await this.blockManager.processBlock(message.payload);
        break;
      case 'unblock':
        await this.blockManager.processUnblock(message.payload);
        break;
    }
    
    // Update coordination metrics
    await this.coordinationMetrics.updateMetrics(message.payload);
    
    // Emit coordination event
    this.emit('coordination_action', message.payload);
  }
}
```

### 4. Visibility Messages

```typescript
interface VisibilityMessage extends EnhancedMessage {
  type: 'visibility';
  payload: {
    agentId: string;
    timestamp: number;
    health: AgentHealthMetrics;
    performance: AgentPerformanceMetrics;
    resources: ResourceUsageMetrics;
    connections: ConnectionInfo[];
    activeOperations: ActiveOperation[];
  };
}

class VisibilityMessageHandler implements MessageHandler {
  async handle(message: VisibilityMessage): Promise<void> {
    // Update agent visibility data
    await this.visibilityStore.updateAgentVisibility(message.payload);
    
    // Update real-time dashboards
    await this.dashboardManager.updateDashboards(message.payload);
    
    // Check for health alerts
    await this.healthMonitor.checkHealthAlerts(message.payload);
    
    // Update performance analytics
    await this.analyticsEngine.updateAnalytics(message.payload);
    
    // Emit visibility update event
    this.emit('visibility_updated', message.payload);
  }
}
```

## Channel Management

### Hierarchical Channel Structure

```typescript
class ChannelManager {
  private channels: Map<string, ChannelInfo>;
  private subscriptions: Map<string, Set<MessageHandler>>;
  private patterns: Map<string, Set<MessageHandler>>;
  
  async createChannel(path: string, config: ChannelConfig): Promise<void> {
    const channel: ChannelInfo = {
      path,
      config,
      createdAt: Date.now(),
      messageCount: 0,
      lastActivity: Date.now(),
      subscribers: new Set(),
    };
    
    this.channels.set(path, channel);
    
    // Create Redis channel
    await this.redis.subscribe(path);
  }
  
  async subscribeToChannel(channelPath: string, handler: MessageHandler): Promise<void> {
    if (!this.subscriptions.has(channelPath)) {
      this.subscriptions.set(channelPath, new Set());
    }
    
    this.subscriptions.get(channelPath)!.add(handler);
    
    // Update channel info
    const channel = this.channels.get(channelPath);
    if (channel) {
      channel.subscribers.add(handler.id);
      channel.lastActivity = Date.now();
    }
  }
  
  async subscribeToPattern(pattern: string, handler: MessageHandler): Promise<void> {
    if (!this.patterns.has(pattern)) {
      this.patterns.set(pattern, new Set());
      await this.redis.psubscribe(pattern);
    }
    
    this.patterns.get(pattern)!.add(handler);
  }
  
  async routeMessage(channel: string, message: EnhancedMessage): Promise<void> {
    const handlers = this.subscriptions.get(channel);
    if (handlers) {
      await Promise.allSettled(
        Array.from(handlers).map(handler => handler.handle(message))
      );
    }
    
    // Check pattern subscriptions
    for (const [pattern, patternHandlers] of this.patterns.entries()) {
      if (this.matchesPattern(channel, pattern)) {
        await Promise.allSettled(
          Array.from(patternHandlers).map(handler => handler.handle(message))
        );
      }
    }
  }
  
  private matchesPattern(channel: string, pattern: string): boolean {
    // Implement glob pattern matching
    const regex = new RegExp(
      pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    );
    return regex.test(channel);
  }
}
```

## Priority Queue System

### Message Prioritization

```typescript
enum MessagePriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  BACKGROUND = 4
}

class PriorityQueue {
  private queues: Map<MessagePriority, Array<EnhancedMessage>>;
  private processing: boolean = false;
  private maxBatchSize: number = 100;
  
  constructor() {
    this.queues = new Map();
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    });
  }
  
  enqueue(message: EnhancedMessage): void {
    const queue = this.queues.get(message.priority);
    if (queue) {
      queue.push(message);
      this.sortQueue(queue);
    }
    
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  private async processQueue(): Promise<void> {
    this.processing = true;
    
    while (this.hasMessages()) {
      const batch = this.getNextBatch();
      if (batch.length > 0) {
        await this.processBatch(batch);
      }
    }
    
    this.processing = false;
  }
  
  private getNextBatch(): EnhancedMessage[] {
    const batch: EnhancedMessage[] = [];
    
    // Process messages by priority
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        const queue = this.queues.get(priority);
        if (queue && queue.length > 0) {
          const remainingCapacity = this.maxBatchSize - batch.length;
          const messages = queue.splice(0, remainingCapacity);
          batch.push(...messages);
          
          if (batch.length >= this.maxBatchSize) {
            break;
          }
        }
      }
    }
    
    return batch;
  }
  
  private sortQueue(queue: EnhancedMessage[]): void {
    queue.sort((a, b) => {
      // Sort by timestamp first, then by priority within same priority
      if (a.metadata.timestamp !== b.metadata.timestamp) {
        return a.metadata.timestamp - b.metadata.timestamp;
      }
      return a.priority - b.priority;
    });
  }
  
  private hasMessages(): boolean {
    for (const queue of this.queues.values()) {
      if (queue.length > 0) {
        return true;
      }
    }
    return false;
  }
}
```

## Performance Optimization

### WASM-Powered Serialization

```typescript
class WASMMessageSerializer {
  private serializer: any;
  private initialized: boolean = false;
  
  async initialize(): Promise<void> {
    try {
      const wasmModule = await import('../wasm/message-serializer.js');
      this.serializer = new wasmModule.MessageSerializer();
      this.initialized = true;
      console.log('✅ WASM message serializer initialized');
    } catch (error) {
      console.warn('⚠️ WASM serializer unavailable, using fallback:', error.message);
    }
  }
  
  async serialize(message: EnhancedMessage): Promise<string> {
    if (this.initialized && this.serializer) {
      try {
        return this.serializer.serialize(message);
      } catch (error) {
        console.warn('WASM serialization failed, using fallback:', error.message);
        return JSON.stringify(message);
      }
    }
    return JSON.stringify(message);
  }
  
  async deserialize(data: string): Promise<EnhancedMessage> {
    if (this.initialized && this.serializer) {
      try {
        return this.serializer.deserialize(data);
      } catch (error) {
        console.warn('WASM deserialization failed, using fallback:', error.message);
        return JSON.parse(data);
      }
    }
    return JSON.parse(data);
  }
  
  async serializeBatch(messages: EnhancedMessage[]): Promise<string[]> {
    if (this.initialized && this.serializer && messages.length > 5) {
      try {
        return this.serializer.batchSerialize(messages);
      } catch (error) {
        console.warn('WASM batch serialization failed, using fallback:', error.message);
        return messages.map(msg => JSON.stringify(msg));
      }
    }
    return messages.map(msg => JSON.stringify(msg));
  }
  
  async deserializeBatch(data: string[]): Promise<EnhancedMessage[]> {
    if (this.initialized && this.serializer && data.length > 5) {
      try {
        return this.serializer.batchDeserialize(data);
      } catch (error) {
        console.warn('WASM batch deserialization failed, using fallback:', error.message);
        return data.map(item => JSON.parse(item));
      }
    }
    return data.map(item => JSON.parse(item));
  }
}
```

### Message Compression

```typescript
class MessageCompressor {
  private compressionThreshold: number = 1024; // 1KB
  
  async compress(message: string): Promise<string> {
    if (message.length < this.compressionThreshold) {
      return message;
    }
    
    try {
      const compressed = await this.gzipCompress(message);
      return `compressed:${compressed}`;
    } catch (error) {
      console.warn('Message compression failed:', error.message);
      return message;
    }
  }
  
  async decompress(data: string): Promise<string> {
    if (!data.startsWith('compressed:')) {
      return data;
    }
    
    try {
      const compressed = data.substring(11); // Remove 'compressed:' prefix
      return await this.gzipDecompress(compressed);
    } catch (error) {
      console.warn('Message decompression failed:', error.message);
      throw error;
    }
  }
  
  private async gzipCompress(data: string): Promise<string> {
    // Implementation using Node.js zlib
    const zlib = await import('zlib');
    const buffer = Buffer.from(data, 'utf8');
    const compressed = zlib.gzipSync(buffer);
    return compressed.toString('base64');
  }
  
  private async gzipDecompress(data: string): Promise<string> {
    const zlib = await import('zlib');
    const buffer = Buffer.from(data, 'base64');
    const decompressed = zlib.gunzipSync(buffer);
    return decompressed.toString('utf8');
  }
}
```

## Metrics and Monitoring

### Message Bus Metrics

```typescript
interface MessageBusMetrics {
  throughput: {
    messagesPerSecond: number;
    bytesPerSecond: number;
    peakThroughput: number;
  };
  latency: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    maxLatency: number;
  };
  reliability: {
    deliveryRate: number;
    errorRate: number;
    retryRate: number;
    timeoutRate: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkIO: number;
    connectionCount: number;
  };
  queues: {
    queueSizes: Record<MessagePriority, number>;
    processingTimes: Record<MessagePriority, number>;
    dropRates: Record<MessagePriority, number>;
  };
}

class MetricsCollector {
  private metrics: Map<string, MetricValue>;
  private timers: Map<string, Timer>;
  
  recordMessagePublished(message: EnhancedMessage): void {
    this.incrementCounter('messages_published_total', {
      message_type: message.type,
      priority: message.priority.toString(),
    });
    
    this.recordHistogram('message_size_bytes', message.payload.length, {
      message_type: message.type,
    });
    
    this.setTimer(`message_${message.id}_published_at`, Date.now());
  }
  
  recordMessageDelivered(messageId: string): void {
    const publishedAt = this.getTimer(`message_${messageId}_published_at`);
    if (publishedAt) {
      const latency = Date.now() - publishedAt;
      this.recordHistogram('message_delivery_latency_ms', latency);
      this.removeTimer(`message_${messageId}_published_at`);
    }
    
    this.incrementCounter('messages_delivered_total');
  }
  
  recordMessageProcessed(messageId: string, processingTime: number): void {
    this.recordHistogram('message_processing_time_ms', processingTime);
    this.incrementCounter('messages_processed_total');
  }
  
  recordError(error: Error, context: any): void {
    this.incrementCounter('message_errors_total', {
      error_type: error.constructor.name,
      message_type: context.messageType,
    });
  }
  
  async getMetrics(timeRange: TimeRange): Promise<MessageBusMetrics> {
    // Aggregate metrics from time series storage
    return this.aggregateMetrics(timeRange);
  }
}
```

## Security Features

### Message Encryption

```typescript
class MessageEncryption {
  private encryptionKeys: Map<string, EncryptionKey>;
  
  async encryptMessage(message: EnhancedMessage, keyId: string): Promise<EnhancedMessage> {
    const key = this.encryptionKeys.get(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }
    
    const encryptedPayload = await this.encrypt(JSON.stringify(message.payload), key);
    
    return {
      ...message,
      payload: encryptedPayload,
      metadata: {
        ...message.metadata,
        encryptionKeyId: keyId,
      },
    };
  }
  
  async decryptMessage(message: EnhancedMessage): Promise<EnhancedMessage> {
    if (!message.metadata.encryptionKeyId) {
      return message; // Not encrypted
    }
    
    const key = this.encryptionKeys.get(message.metadata.encryptionKeyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${message.metadata.encryptionKeyId}`);
    }
    
    const decryptedPayload = await this.decrypt(message.payload as string, key);
    
    return {
      ...message,
      payload: JSON.parse(decryptedPayload),
    };
  }
  
  private async encrypt(data: string, key: EncryptionKey): Promise<string> {
    // Implementation using AES-256-GCM
    const crypto = await import('crypto');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key.value);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      encrypted,
      authTag: authTag.toString('hex'),
    });
  }
  
  private async decrypt(encryptedData: string, key: EncryptionKey): Promise<string> {
    const crypto = await import('crypto');
    const { iv, encrypted, authTag } = JSON.parse(encryptedData);
    
    const decipher = crypto.createDecipher('aes-256-gcm', key.value);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

## Conclusion

The Enhanced Message Bus provides a robust, high-performance foundation for the Redis messaging infrastructure. With features like priority queuing, WASM-powered serialization, comprehensive metrics, and security controls, it enables granular progress tracking and complete agent visibility while maintaining excellent performance characteristics.

The design is modular and extensible, allowing for easy integration with existing systems and future enhancements. The architecture supports the demanding requirements of multi-agent swarm coordination while providing the observability and control needed for complex distributed systems.