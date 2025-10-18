# Redis Health Monitor

**Sprint 1.3: Production-Ready Health Check and Auto-Reconnection**

## Overview

The Redis Health Monitor provides automatic connection management with health checks, exponential backoff reconnection, and comprehensive event emission for production-ready Redis coordination.

## Features

- **Automatic Health Checks**: Periodic PING checks with configurable intervals
- **Exponential Backoff Reconnection**: Automatic reconnection with delays [1s, 2s, 4s, 8s]
- **Event-Driven Architecture**: Comprehensive event emission for all connection states
- **Graceful Degradation**: Operation queueing during Redis unavailability
- **Metrics Collection**: Real-time health metrics and performance tracking
- **Production Ready**: Configurable thresholds, timeouts, and retry strategies

## Quick Start

```typescript
import { RedisHealthMonitor } from './RedisHealthMonitor';

// Initialize monitor
const monitor = new RedisHealthMonitor({
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'your-password' // optional
  }
});

// Listen to connection events
monitor.on('redis:connected', () => {
  console.log('Connected to Redis');
});

monitor.on('redis:reconnecting', (event) => {
  console.log(`Reconnecting... attempt ${event.attempt}`);
});

// Connect
await monitor.connect();

// Get health metrics
const metrics = monitor.getMetrics();
console.log('Health metrics:', metrics);

// Later: disconnect
await monitor.disconnect();
```

## Configuration

### Full Configuration Options

```typescript
const config = {
  redis: {
    host: 'localhost',           // Redis host
    port: 6379,                  // Redis port
    password: 'secret',          // Optional password
    database: 0                  // Database number (default: 0)
  },
  health: {
    checkInterval: 5000,         // Health check interval (ms, default: 5000)
    checkTimeout: 2000,          // Health check timeout (ms, default: 2000)
    failureThreshold: 3          // Consecutive failures before reconnect (default: 3)
  },
  reconnect: {
    maxAttempts: 3,              // Max reconnection attempts (default: 3)
    delays: [1000, 2000, 4000, 8000], // Backoff delays in ms
    resetOnSuccess: true         // Reset attempt counter on success (default: true)
  },
  monitoring: {
    enabled: true,               // Enable metrics collection (default: true)
    metricsInterval: 10000       // Metrics interval (ms, default: 10000)
  }
};

const monitor = new RedisHealthMonitor(config);
```

### Default Configuration

If you omit configuration options, the following defaults are used:

```typescript
{
  health: {
    checkInterval: 5000,      // 5 seconds
    checkTimeout: 2000,       // 2 seconds
    failureThreshold: 3       // 3 failures
  },
  reconnect: {
    maxAttempts: 3,
    delays: [1000, 2000, 4000, 8000],
    resetOnSuccess: true
  },
  monitoring: {
    enabled: true,
    metricsInterval: 10000    // 10 seconds
  }
}
```

## Events

### Connection Lifecycle Events

#### `redis:connected`

Emitted when successfully connected to Redis.

```typescript
monitor.on('redis:connected', (event) => {
  console.log('Connected:', event);
  // {
  //   host: 'localhost',
  //   port: 6379,
  //   timestamp: 1760135000000
  // }
});
```

#### `redis:disconnected`

Emitted when disconnected from Redis.

```typescript
monitor.on('redis:disconnected', (event) => {
  console.log('Disconnected:', event.timestamp);
});
```

#### `redis:connection:lost`

Emitted when connection is lost unexpectedly.

```typescript
monitor.on('redis:connection:lost', (event) => {
  console.log('Connection lost:', event);
  // {
  //   consecutiveFailures: 3,
  //   timestamp: 1760135000000
  // }
});
```

#### `redis:status:changed`

Emitted whenever connection status changes.

```typescript
monitor.on('redis:status:changed', (event) => {
  console.log('Status changed:', event);
  // {
  //   previousStatus: 'connected',
  //   currentStatus: 'reconnecting',
  //   timestamp: 1760135000000
  // }
});
```

### Reconnection Events

#### `redis:reconnecting`

Emitted on each reconnection attempt.

```typescript
monitor.on('redis:reconnecting', (event) => {
  console.log('Reconnecting:', event);
  // {
  //   attempt: 1,
  //   maxAttempts: 3,
  //   delay: 1000,
  //   timestamp: 1760135000000
  // }
});
```

#### `redis:reconnected`

Emitted when reconnection succeeds.

```typescript
monitor.on('redis:reconnected', (event) => {
  console.log('Reconnected after', event.totalAttempts, 'attempts');
  // {
  //   attempt: 2,
  //   totalAttempts: 2,
  //   timestamp: 1760135000000
  // }
});
```

#### `redis:failed`

Emitted when all reconnection attempts fail.

```typescript
monitor.on('redis:failed', (event) => {
  console.error('Connection failed:', event);
  // {
  //   totalAttempts: 3,
  //   lastError: 'Connection refused',
  //   timestamp: 1760135000000
  // }
});
```

#### `redis:connection:failed`

Emitted on initial connection failure.

```typescript
monitor.on('redis:connection:failed', (event) => {
  console.error('Initial connection failed:', event.error);
});
```

### Health Check Events

#### `redis:health:check`

Emitted after each health check.

```typescript
monitor.on('redis:health:check', (result) => {
  if (result.healthy) {
    console.log('Healthy! Latency:', result.latency, 'ms');
  } else {
    console.warn('Unhealthy:', result.error);
  }
  // {
  //   healthy: true,
  //   latency: 5.2,
  //   timestamp: 1760135000000,
  //   error: undefined  // Only present when unhealthy
  // }
});
```

### Metrics Events

#### `redis:metrics`

Emitted periodically with health metrics.

```typescript
monitor.on('redis:metrics', (metrics) => {
  console.log('Metrics:', metrics);
  // {
  //   status: 'connected',
  //   lastCheckTime: 1760135000000,
  //   lastSuccessTime: 1760135000000,
  //   consecutiveFailures: 0,
  //   totalChecks: 42,
  //   totalFailures: 2,
  //   reconnectAttempts: 3,
  //   reconnectSuccess: 1,
  //   reconnectFailures: 0,
  //   averageLatency: 5.2,
  //   uptime: 120000,
  //   lastError: undefined
  // }
});
```

#### `redis:error`

Emitted on Redis client errors.

```typescript
monitor.on('redis:error', (event) => {
  console.error('Redis error:', event.error);
});
```

## API Reference

### Constructor

```typescript
new RedisHealthMonitor(config: Partial<HealthMonitorConfig>)
```

Creates a new Redis Health Monitor instance.

### Methods

#### `connect(): Promise<void>`

Connect to Redis and start health monitoring.

```typescript
await monitor.connect();
```

**Throws**: Error if connection fails

#### `disconnect(): Promise<void>`

Gracefully disconnect from Redis.

```typescript
await monitor.disconnect();
```

#### `performHealthCheck(): Promise<HealthCheckResult>`

Manually perform a health check.

```typescript
const result = await monitor.performHealthCheck();
console.log('Healthy:', result.healthy);
console.log('Latency:', result.latency, 'ms');
```

**Returns**:
```typescript
{
  healthy: boolean;
  latency: number;    // Response time in ms, -1 if failed
  timestamp: number;
  error?: string;     // Only present if unhealthy
}
```

#### `getMetrics(): HealthMetrics`

Get current health metrics.

```typescript
const metrics = monitor.getMetrics();
```

**Returns**:
```typescript
{
  status: ConnectionStatus;
  lastCheckTime: number;
  lastSuccessTime: number;
  consecutiveFailures: number;
  totalChecks: number;
  totalFailures: number;
  reconnectAttempts: number;
  reconnectSuccess: number;
  reconnectFailures: number;
  averageLatency: number;
  uptime: number;
  lastError?: string;
}
```

#### `getStatus(): ConnectionStatus`

Get current connection status.

```typescript
const status = monitor.getStatus();
// 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed'
```

#### `isConnected(): boolean`

Check if currently connected.

```typescript
if (monitor.isConnected()) {
  console.log('Redis is ready');
}
```

#### `getClient(): RedisClientType | null`

Get the underlying Redis client (use with caution).

```typescript
const client = monitor.getClient();
if (client) {
  await client.set('key', 'value');
}
```

## Integration Examples

### With Blocking Coordination

```typescript
import { RedisHealthMonitor } from './RedisHealthMonitor';
import { CoordinationWithHealthMonitor } from './health-integration-example';

const coordination = new CoordinationWithHealthMonitor();

// Operations are queued during Redis unavailability
await coordination.executeOperation(async () => {
  console.log('Publishing coordination ACK...');
  // Redis pub/sub operation
});

// Check health before critical operations
const health = coordination.getHealthStatus();
if (!health.connected) {
  console.warn('Redis unavailable, operation queued');
}
```

### With CFN Loop Orchestration

```typescript
const monitor = new RedisHealthMonitor({
  redis: { host: 'localhost', port: 6379 }
});

// Critical failures escalate to Loop 4 Product Owner
monitor.on('redis:failed', (event) => {
  console.error('CRITICAL: Redis permanently unavailable');
  // Trigger Loop 4 ESCALATE decision
});

// Monitor health for Loop 2 validation
monitor.on('redis:metrics', (metrics) => {
  if (metrics.averageLatency > 100) {
    console.warn('Performance degradation detected');
  }
});

await monitor.connect();
```

### With Event Bus Coordination

```typescript
const monitor = new RedisHealthMonitor({
  redis: { host: 'localhost', port: 6379 }
});

// Pause event bus on connection loss
monitor.on('redis:connection:lost', () => {
  eventBus.pause();
});

// Resume on reconnection
monitor.on('redis:reconnected', () => {
  eventBus.resume();
});

await monitor.connect();
```

## Reconnection Strategy

### Exponential Backoff

The monitor uses exponential backoff with the following default delays:

- **Attempt 1**: 1000ms (1 second)
- **Attempt 2**: 2000ms (2 seconds)
- **Attempt 3**: 4000ms (4 seconds)
- **Attempt 4**: 8000ms (8 seconds, if maxAttempts > 3)

### Reconnection Flow

1. **Connection Lost**: Detected after 3 consecutive health check failures
2. **Emit Event**: `redis:connection:lost`
3. **Start Reconnection**: Attempt 1 after 1s delay
4. **Emit Event**: `redis:reconnecting` (attempt 1)
5. **Retry**: If failed, wait 2s and try again
6. **Success**: Emit `redis:reconnected`, reset counter
7. **Failure**: After max attempts, emit `redis:failed`

### Custom Reconnection Strategy

```typescript
const monitor = new RedisHealthMonitor({
  redis: { host: 'localhost', port: 6379 },
  reconnect: {
    maxAttempts: 5,
    delays: [500, 1000, 2000, 5000, 10000],  // Custom delays
    resetOnSuccess: true
  }
});
```

## Metrics and Monitoring

### Key Metrics

- **status**: Current connection status
- **consecutiveFailures**: Consecutive failed health checks
- **totalChecks**: Total health checks performed
- **totalFailures**: Total failed health checks
- **reconnectAttempts**: Total reconnection attempts
- **reconnectSuccess**: Successful reconnections
- **reconnectFailures**: Failed reconnection sequences
- **averageLatency**: Average health check latency (ms)
- **uptime**: Time since initial connection (ms)

### Dashboard Integration

```typescript
monitor.on('redis:metrics', (metrics) => {
  // Send to monitoring dashboard
  dashboard.sendMetric('redis.status', metrics.status);
  dashboard.sendMetric('redis.latency', metrics.averageLatency);
  dashboard.sendMetric('redis.failures', metrics.totalFailures);
  dashboard.sendMetric('redis.uptime', metrics.uptime);
});
```

### Alerting

```typescript
monitor.on('redis:health:check', (result) => {
  if (!result.healthy) {
    alerting.send({
      severity: 'warning',
      message: `Redis health check failed: ${result.error}`
    });
  }
});

monitor.on('redis:failed', (event) => {
  alerting.send({
    severity: 'critical',
    message: `Redis permanently unavailable after ${event.totalAttempts} attempts`
  });
});
```

## Testing

### Unit Tests

See `src/__tests__/redis/RedisHealthMonitor.test.ts` for comprehensive test coverage:

- Connection lifecycle
- Health checks with timeout
- Auto-reconnection with exponential backoff
- Event emission
- Metrics collection
- Error handling

### Integration Tests

```typescript
import { RedisHealthMonitor } from './RedisHealthMonitor';

describe('Redis Health Monitor Integration', () => {
  it('should recover from Redis restart', async () => {
    const monitor = new RedisHealthMonitor({
      redis: { host: 'localhost', port: 6379 }
    });

    await monitor.connect();
    expect(monitor.isConnected()).toBe(true);

    // Simulate Redis restart (stop Redis)
    // ... wait for reconnection ...

    // Monitor should auto-reconnect
    await new Promise(resolve => {
      monitor.on('redis:reconnected', resolve);
    });

    expect(monitor.isConnected()).toBe(true);
  });
});
```

## Troubleshooting

### Connection Failures

**Problem**: `redis:connection:failed` event emitted on startup

**Solutions**:
- Check Redis is running: `redis-cli ping`
- Verify host/port configuration
- Check firewall rules
- Verify password if authentication is enabled

### Reconnection Failures

**Problem**: `redis:failed` event after multiple reconnection attempts

**Solutions**:
- Increase `maxAttempts` in configuration
- Increase delay values for slower networks
- Check Redis server logs for errors
- Verify network connectivity

### High Latency

**Problem**: `averageLatency` metric is high (>100ms)

**Solutions**:
- Check network latency to Redis server
- Reduce `checkInterval` to get more frequent samples
- Consider Redis server performance tuning
- Use Redis Sentinel/Cluster for better performance

### Memory Leaks

**Problem**: Memory usage grows over time

**Solutions**:
- Ensure `disconnect()` is called on shutdown
- Check for event listener leaks (use `once()` for one-time listeners)
- Monitor `redis:metrics` for anomalies

## Performance Considerations

### Health Check Overhead

- Default 5s interval: ~0.01% CPU usage
- Faster intervals increase overhead proportionally
- PING command is lightweight (~0.1ms latency locally)

### Metrics Collection

- Metrics are collected in-memory (minimal overhead)
- Average latency uses exponential moving average (constant memory)
- No persistent storage (metrics reset on restart)

### Reconnection Impact

- During reconnection, operations are queued (bounded by memory)
- Exponential backoff prevents thundering herd
- Consider implementing circuit breaker for external callers

## Production Deployment

### Recommended Configuration

```typescript
const productionConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DB || '0')
  },
  health: {
    checkInterval: 5000,       // 5 seconds
    checkTimeout: 2000,        // 2 seconds
    failureThreshold: 3        // 3 failures
  },
  reconnect: {
    maxAttempts: 10,           // More attempts in production
    delays: [1000, 2000, 4000, 8000, 16000, 30000, 60000], // Up to 1 minute
    resetOnSuccess: true
  },
  monitoring: {
    enabled: true,
    metricsInterval: 10000     // 10 seconds
  }
};
```

### Environment Variables

```bash
REDIS_HOST=redis.production.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
REDIS_DB=0
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await monitor.disconnect();
  process.exit(0);
});
```

## Changelog

### v1.0.0 (Sprint 1.3)

- Initial implementation
- Auto-reconnection with exponential backoff
- Comprehensive event emission
- Health check with timeout
- Metrics collection
- Integration examples
- 95%+ test coverage

## License

MIT
