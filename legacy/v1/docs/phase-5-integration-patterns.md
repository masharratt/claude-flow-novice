# Phase 5 Integration Patterns

## Overview

Phase 5 introduces advanced monitoring, dashboard integration, and real-time coordination mechanisms to enhance visibility and control over AI agent orchestration.

## 1. Monitoring Service Integration

### Initialization
```typescript
const monitoringService = new RedisMonitoringService({
  redisConfig: {
    host: 'localhost',
    port: 6379
  },
  swarmId: 'my-swarm-123'
});

await monitoringService.connect();
await monitoringService.subscribeToEvents([
  'swarm:coordination',
  'agent:feedback',
  'system:metrics'
]);
```

### Configuration Options
- `redisConfig`: Connection parameters
- `swarmId`: Unique identifier for swarm tracking
- `logLevel`: Verbosity of monitoring (DEBUG, INFO, WARN)
- `bufferSize`: Number of events to retain in memory

## 2. WebSocket Integration

### Connection Lifecycle
```typescript
const wsClient = new WebSocketClient('ws://localhost:3001/ws');

wsClient.onConnect(() => {
  console.log('Connected to realtime dashboard');
  wsClient.subscribe('swarm:coordination');
});

wsClient.onMessage((event) => {
  switch (event.type) {
    case 'swarm:coordination':
      handleSwarmCoordination(event.data);
      break;
    case 'agent:feedback':
      processAgentFeedback(event.data);
      break;
  }
});

wsClient.onDisconnect(() => {
  console.warn('Dashboard WebSocket disconnected');
  // Implement reconnection strategy
});
```

### Error Handling Strategies
- Exponential backoff for reconnection
- Fallback to polling mechanism
- Persistent event queue during disconnection

## 3. Dashboard Component Integration

### React Component Example
```typescript
interface SwarmMonitorProps {
  swarmId: string;
  mode: 'development' | 'production';
}

const SwarmMonitor: React.FC<SwarmMonitorProps> = ({ swarmId, mode }) => {
  const [metrics, setMetrics] = useState<SwarmMetrics>({});
  const [agentStatus, setAgentStatus] = useState<AgentStatus[]>([]);

  useEffect(() => {
    const wsClient = new WebSocketClient(`ws://localhost:3001/swarm/${swarmId}`);

    wsClient.onMessage((event) => {
      switch (event.type) {
        case 'system:metrics':
          setMetrics(event.data);
          break;
        case 'agent:status':
          setAgentStatus(event.data);
          break;
      }
    });

    return () => wsClient.disconnect();
  }, [swarmId]);

  return (
    <div>
      <MetricsPanel metrics={metrics} />
      <AgentStatusTable agents={agentStatus} />
    </div>
  );
};
```

## 4. Validation Hook Integration

### Post-Spawn Validation
```bash
# CLI validation
node config/hooks/post-spawn-validation.js [agentId]

# Task-specific validation
node config/hooks/post-spawn-validation.js [taskId] --coordinator-id [coordinatorId]
```

### Validation Result Structure
```json
{
  "agentId": "coder-1",
  "status": "PASSED" | "FAILED",
  "confidence": 0.85,
  "issues": [
    {
      "type": "LOW_COVERAGE",
      "severity": "MEDIUM",
      "details": "Test coverage below 80%"
    }
  ],
  "recommendations": [
    "Increase unit test coverage",
    "Review error handling"
  ]
}
```

## 5. CLI Monitoring Usage

### Monitoring Modes
- `feedback`: Real-time agent feedback
- `coordination`: Swarm coordination status
- `metrics`: System performance metrics

### Example Commands
```bash
# Monitor feedback stream
./scripts/monitor-swarm-redis.sh feedback --follow

# JSON-formatted metrics
./scripts/monitor-swarm-redis.sh metrics --format=json

# Detailed coordination log
./scripts/monitor-swarm-redis.sh coordination --verbose
```

## 6. Advanced Configuration

### Environment Variables
- `CLAUDE_DASHBOARD_PORT`: Custom dashboard port
- `CLAUDE_METRICS_RETENTION`: Event retention period
- `CLAUDE_WEBSOCKET_TIMEOUT`: Connection timeout

### Security Considerations
- JWT-based authentication for WebSocket
- Rate limiting on dashboard endpoints
- TLS encryption for WebSocket connections

## 7. Performance Optimization

### Event Buffering
- In-memory circular buffer for recent events
- Configurable buffer size
- Automatic pruning of old events

### Metrics Sampling
- Configurable sampling rate
- Adaptive sampling based on system load
- Compressed event storage

## 8. Troubleshooting

### Common Issues
- WebSocket disconnections
- Redis connection problems
- High memory usage
- Performance bottlenecks

### Diagnostic Commands
```bash
# Check WebSocket connectivity
npx claude-flow-novice ws-diagnostic

# Validate Redis connection
npx claude-flow-novice redis-check

# Generate performance report
npx claude-flow-novice perf-report --format=markdown
```

## 9. Future Roadmap
- Machine learning-based anomaly detection
- Predictive agent performance modeling
- Enhanced visualization capabilities
- Cross-platform dashboard support

---

**Best Practices:**
- Keep dashboard lightweight
- Use websockets for real-time updates
- Implement robust error handling
- Secure all communication channels
- Provide clear, actionable insights
