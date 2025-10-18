# QEEventBus Interface Specification

## Overview

The QEEventBus is a high-performance, distributed event-driven communication system designed for agent swarm coordination. It supports 10,000+ events/second throughput with sub-50ms latency, Redis-backed coordination, and multiple protocol support.

## Architecture

### Core Components

1. **QEEventBus** - Main event bus orchestrator
2. **RedisCoordinator** - Redis pub/sub coordination layer
3. **EventRouter** - Load balancing and event routing
4. **PerformanceMonitor** - Real-time performance metrics

### Design Principles

- **Event-Driven Architecture**: Loose coupling through asynchronous events
- **Redis Coordination**: Distributed coordination via Redis pub/sub
- **Load Balancing**: Multiple strategies for event distribution
- **High Performance**: Optimized for 10,000+ events/second throughput
- **Protocol Agnostic**: Support for WebSocket, HTTP/2, and gRPC
- **Fault Tolerance**: Built-in reconnection and error handling

## Event Types

### Agent Lifecycle Events

```javascript
AGENT_SPAWN: 'agent.spawn'
AGENT_TERMINATE: 'agent.terminate'
AGENT_ERROR: 'agent.error'
AGENT_TASK_ASSIGN: 'agent.task.assign'
AGENT_TASK_COMPLETE: 'agent.task.complete'
AGENT_HEARTBEAT: 'agent.heartbeat'
AGENT_STATUS_UPDATE: 'agent.status.update'
AGENT_CAPABILITY_REGISTER: 'agent.capability.register'
```

### Swarm Coordination Events

```javascript
SWARM_INIT: 'swarm.init'
SWARM_START: 'swarm.start'
SWARM_PAUSE: 'swarm.pause'
SWARM_RESUME: 'swarm.resume'
SWARM_COMPLETE: 'swarm.complete'
SWARM_ERROR: 'swarm.error'
SWARM_PHASE_TRANSITION: 'swarm.phase.transition'
```

### Task Management Events

```javascript
TASK_CREATE: 'task.create'
TASK_UPDATE: 'task.update'
TASK_COMPLETE: 'task.complete'
TASK_FAIL: 'task.fail'
TASK_CANCEL: 'task.cancel'
TASK_DEPENDENCY_RESOLVE: 'task.dependency.resolve'
```

### Consensus Events

```javascript
CONSENSUS_START: 'consensus.start'
CONSENSUS_VOTE: 'consensus.vote'
CONSENSUS_ACHIEVE: 'consensus.achieve'
CONSENSUS_FAIL: 'consensus.fail'
```

### System Events

```javascript
SYSTEM_STARTUP: 'system.startup'
SYSTEM_SHUTDOWN: 'system.shutdown'
SYSTEM_HEALTH_CHECK: 'system.health_check'
SYSTEM_METRICS: 'system.metrics'
```

## Event Structure

### Base Event Interface

```typescript
interface AgentEvent {
  id: string;                    // Unique event identifier
  type: EventType;               // Event type (see above)
  agentId: string;               // Source agent ID
  swarmId?: string;              // Optional swarm ID
  timestamp: number;             // Unix timestamp (ms)
  priority: EventPriority;       // Priority level (0-4)
  data: any;                     // Event payload
  metadata?: {                   // Optional metadata
    source: string;              // Source node ID
    version: string;             // Event schema version
    correlationId?: string;      // Correlation ID for tracing
    causationId?: string;        // Causation ID for event chains
    retryCount?: number;         // Retry attempt count
    timeout?: number;            // Event timeout (ms)
    tags?: string[];            // Event tags
  };
}
```

### Event Priority Levels

```javascript
const EventPriority = {
  CRITICAL: 0,    // System-critical events (errors, shutdown)
  HIGH: 1,        // High priority (consensus, task completion)
  NORMAL: 2,      // Normal priority (regular communication)
  LOW: 3,         // Low priority (metrics, health checks)
  BULK: 4         // Bulk operations (logs, analytics)
}
```

## API Interface

### Main QEEventBus Class

```typescript
class QEEventBus extends EventEmitter {
  constructor(config: QEEventBusConfig)

  // Lifecycle
  async start(): Promise<void>
  async stop(): Promise<void>

  // Event Publishing
  async publish(event: AgentEvent): Promise<void>

  // Event Subscription
  subscribe(eventType: string, handler: EventHandler, options?: SubscriptionOptions): () => void

  // Utility
  getMetrics(): PerformanceMetrics
  isConnected(): boolean
}
```

### Configuration Interface

```typescript
interface QEEventBusConfig {
  nodeId: string;                // Unique node identifier
  redis: RedisConfig;            // Redis configuration
  loadBalancer?: LoadBalancerConfig;
  protocols?: ProtocolConfig;    // Protocol configuration
  performance?: PerformanceConfig;
  logging?: LoggingConfig;
}
```

### Redis Configuration

```typescript
interface RedisConfig {
  host: string;
  port: number;
  db?: number;
  password?: string;
  keyPrefix?: string;
  ttl?: number;
  serialization?: 'json' | 'msgpack' | 'compressed';
}
```

### Load Balancing Configuration

```typescript
interface LoadBalancerConfig {
  strategy: 'round_robin' | 'least_connections' | 'weighted' | 'hash_based';
  weights?: Map<string, number>;
  healthCheckInterval?: number;
  maxConnections?: number;
}
```

## Event Subscription

### Basic Subscription

```javascript
const eventBus = new QEEventBus(config);

// Subscribe to specific event type
const unsubscribe = eventBus.subscribe('agent.task.complete', async (event) => {
  console.log('Task completed:', event.data);
});

// Unsubscribe later
unsubscribe();
```

### Advanced Subscription with Options

```javascript
const unsubscribe = eventBus.subscribe('task.*', async (event) => {
  // Handle task events
}, {
  priority: EventPriority.HIGH,    // Process with high priority
  filter: (event) => {             // Filter events
    return event.data.assignee === 'my-agent';
  },
  once: false,                     // Multiple invocations
  timeout: 30000,                  // 30 second timeout
  retryAttempts: 3,               // Retry failed handlers
  maxConcurrency: 10              // Max concurrent handlers
});
```

### Event Filtering

```javascript
const unsubscribe = eventBus.subscribe('*', async (event) => {
  // Handle all events with custom filtering
}, {
  filter: (event) => {
    // Only process events from my swarm
    return event.swarmId === 'my-swarm' &&
           event.priority <= EventPriority.HIGH;
  }
});
```

## Event Publishing

### Simple Event Publishing

```javascript
const event = {
  id: 'evt_123456',
  type: 'agent.task.complete',
  agentId: 'agent-001',
  timestamp: Date.now(),
  priority: EventPriority.NORMAL,
  data: {
    taskId: 'task-789',
    result: 'success',
    duration: 1500
  }
};

await eventBus.publish(event);
```

### Event Builder Pattern

```javascript
import { createEvent } from './types';

const event = createEvent('agent.task.complete')
  .agentId('agent-001')
  .swarmId('swarm-123')
  .priority(EventPriority.HIGH)
  .data({
    taskId: 'task-789',
    result: 'success'
  })
  .correlationId('req-456')
  .build();

await eventBus.publish(event);
```

### Batch Event Publishing

```javascript
const events = [
  createEvent('agent.task.assign').agentId('agent-001').build(),
  createEvent('agent.task.assign').agentId('agent-002').build(),
  createEvent('agent.task.assign').agentId('agent-003').build()
];

// Publish in parallel for maximum throughput
await Promise.all(events.map(event => eventBus.publish(event)));
```

## Load Balancing Strategies

### Round Robin (Default)

Events are distributed evenly across all available handlers.

```javascript
const config = {
  loadBalancer: {
    strategy: 'round_robin'
  }
};
```

### Least Connections

Events are routed to handlers with the fewest active connections.

```javascript
const config = {
  loadBalancer: {
    strategy: 'least_connections',
    healthCheckInterval: 30000
  }
};
```

### Weighted

Events are distributed based on configured weights.

```javascript
const config = {
  loadBalancer: {
    strategy: 'weighted',
    weights: new Map([
      ['handler-1', 3],  // 3x weight
      ['handler-2', 2],  // 2x weight
      ['handler-3', 1]   // 1x weight
    ])
  }
};
```

### Hash-Based

Events are routed based on a hash of the agent ID for consistency.

```javascript
const config = {
  loadBalancer: {
    strategy: 'hash_based'
  }
};
```

## Protocol Support

### WebSocket (Real-time)

```javascript
const config = {
  protocols: {
    websocket: {
      enabled: true,
      port: 8080,
      path: '/events',
      compression: true,
      maxConnections: 1000
    }
  }
};

// Client connection
const ws = new WebSocket('ws://localhost:8080/events');
ws.send(JSON.stringify(event));
```

### HTTP/2 (REST API)

```javascript
const config = {
  protocols: {
    http: {
      enabled: true,
      port: 3000,
      cors: true,
      rateLimit: 1000,
      compression: true
    }
  }
};

// REST API usage
fetch('http://localhost:3000/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(event)
});
```

### Performance Metrics

### Real-time Metrics

```javascript
const metrics = eventBus.getMetrics();
console.log('Events per second:', metrics.eventsPerSecond);
console.log('Average latency:', metrics.averageLatency);
console.log('Error rate:', metrics.errorRate);
```

### Metrics Structure

```typescript
interface PerformanceMetrics {
  eventsProcessed: number;        // Total events processed
  eventsPerSecond: number;        // Current throughput
  averageLatency: number;         // Average latency (ms)
  maxLatency: number;            // Maximum latency (ms)
  minLatency: number;            // Minimum latency (ms)
  p95Latency: number;            // 95th percentile latency
  p99Latency: number;            // 99th percentile latency
  errorCount: number;            // Total errors
  errorRate: number;             // Error rate (0-1)
  queueSize: number;             // Current queue size
  memoryUsage: number;           // Memory usage (bytes)
  activeConnections: number;     // Active connections
  throughput: number;            // Current throughput
  timestamp: number;             // Metrics timestamp
}
```

## Performance Targets

### Throughput

- **Target**: 10,000+ events/second
- **Sustained**: 5,000+ events/second for 5+ minutes
- **Peak**: 50,000+ events/second for short bursts

### Latency

- **Average**: <50ms
- **P95**: <100ms
- **P99**: <200ms

### Resource Usage

- **Memory**: <512MB for normal operation
- **CPU**: <80% on typical 4-core system
- **Network**: Optimized for minimal bandwidth

## Error Handling

### Automatic Retry

Failed events are automatically retried with exponential backoff:

```javascript
const config = {
  retryAttempts: 3,
  retryDelay: 1000,  // Initial delay (ms)
  maxRetryDelay: 30000  // Maximum delay (ms)
};
```

### Dead Letter Queue

Events that fail after all retries are moved to a dead letter queue:

```javascript
eventBus.on('error', (error) => {
  console.error('Event processing failed:', error);
  // Implement dead letter queue logic
});
```

### Circuit Breaker

Automatic circuit breaking prevents cascading failures:

```javascript
const config = {
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,    // Failures before opening
    recoveryTimeout: 60000,  // Recovery timeout (ms)
    monitoringPeriod: 30000  // Monitoring period (ms)
  }
};
```

## Security Features

### Event Validation

All events are validated against schema:

```javascript
const config = {
  validation: {
    enabled: true,
    strict: true,      // Strict validation
    schemaPath: './schemas'  // Schema directory
  }
};
```

### Rate Limiting

Built-in rate limiting prevents abuse:

```javascript
const config = {
  rateLimiting: {
    enabled: true,
    windowMs: 60000,     // 1 minute window
    maxEvents: 10000,    // Max events per window
    skipSuccessfulRequests: false
  }
};
```

### Authentication

Event source authentication:

```javascript
const config = {
  authentication: {
    enabled: true,
    type: 'jwt',         // JWT tokens
    secret: 'your-secret-key',
    algorithm: 'HS256'
  }
};
```

## Testing

### Performance Tests

Run comprehensive performance validation:

```bash
# Run full performance suite
node src/eventbus/performance-validation.test.js

# Run specific tests
node src/eventbus/performance-validation.test.js --test=throughput
node src/eventbus/performance-validation.test.js --test=latency
node src/eventbus/performance-validation.test.js --test=stress
```

### Unit Tests

```javascript
// Test event publishing
await eventBus.publish(testEvent);
expect(eventBus.getMetrics().eventsProcessed).toBe(1);

// Test event subscription
const mockHandler = jest.fn();
const unsubscribe = eventBus.subscribe('test.event', mockHandler);
await eventBus.publish(testEvent);
expect(mockHandler).toHaveBeenCalledWith(testEvent);
```

## Best Practices

### Event Design

1. **Immutable Events**: Never modify events after creation
2. **Idempotent Handlers**: Handle duplicate events gracefully
3. **Event Size**: Keep events under 1KB for optimal performance
4. **Correlation IDs**: Use correlation IDs for event tracing
5. **Versioning**: Include schema version in event metadata

### Performance Optimization

1. **Batch Operations**: Group multiple events when possible
2. **Appropriate Priority**: Use correct priority levels
3. **Filtering**: Filter events at subscription level
4. **Async Handlers**: Use async/await for event handlers
5. **Memory Management**: Clean up unused subscriptions

### Error Handling

1. **Graceful Degradation**: Continue processing during failures
2. **Retry Logic**: Implement appropriate retry strategies
3. **Dead Letter Queue**: Handle failed events properly
4. **Monitoring**: Track error rates and patterns
5. **Alerting**: Set up alerts for critical failures

## Monitoring and Observability

### Health Checks

```javascript
// Check event bus health
const health = await eventBus.healthCheck();
console.log('Health status:', health.status);
```

### Metrics Export

```javascript
// Export metrics to monitoring systems
setInterval(() => {
  const metrics = eventBus.getMetrics();
  prometheusClient.gauge('eventbus_throughput').set(metrics.throughput);
  prometheusClient.gauge('eventbus_latency').set(metrics.averageLatency);
}, 10000);
```

### Distributed Tracing

```javascript
// Add tracing information to events
const event = createEvent('agent.task.complete')
  .agentId('agent-001')
  .traceId(traceId)
  .spanId(spanId)
  .build();
```

## Migration Guide

### From Simple EventBus

1. **Replace Event Structure**: Update to new AgentEvent interface
2. **Update Configuration**: Migrate to QEEventBusConfig
3. **Add Redis**: Set up Redis coordination
4. **Update Handlers**: Modify event handlers for new interface
5. **Performance Testing**: Validate performance targets

### Scaling Considerations

1. **Redis Cluster**: Use Redis Cluster for high availability
2. **Multiple Nodes**: Deploy multiple event bus instances
3. **Load Balancing**: Configure appropriate load balancing
4. **Monitoring**: Set up comprehensive monitoring
5. **Capacity Planning**: Plan for peak loads

## Troubleshooting

### Common Issues

1. **High Latency**: Check Redis connection and network
2. **Memory Usage**: Monitor event queue sizes
3. **Connection Issues**: Verify Redis configuration
4. **Performance**: Check CPU and network utilization
5. **Event Loss**: Ensure proper error handling

### Debug Tools

```javascript
// Enable debug logging
const config = {
  logging: {
    enabled: true,
    level: 'debug'
  }
};

// Get detailed metrics
const metrics = eventBus.getDetailedMetrics();
console.log('Queue sizes:', metrics.queueSizes);
console.log('Handler stats:', metrics.handlerStats);
```

This specification provides a comprehensive guide for implementing and using the QEEventBus system in distributed agent swarm environments.