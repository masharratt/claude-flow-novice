# CFN Loop Phase 5 Monitoring Integration

## 1. Overview

### Purpose
This example demonstrates advanced monitoring and real-time coordination for CFN Loop using Redis pub/sub, WebSocket event streaming, and multi-channel feedback mechanisms.

### Architecture Diagram
```
┌───────────────────┐     ┌───────────────────┐
│   CFN Loop CLI    │     │   Redis Pub/Sub   │
│   (/cfn-loop)     │◄───►│   Message Broker  │
└──────┬────────────┘     └──────┬────────────┘
       │                         │
       ▼                         ▼
┌──────────────────────────────────────────┐
│  Monitoring Components:                  │
│  - Realtime Dashboard                    │
│  - CLI Monitor (monitor-swarm-redis.sh)  │
│  - WebSocket Event Server                │
│  - Metrics Collector                     │
└──────────────────────────────────────────┘
```

### Key Components
- **CFN Loop CLI**: Entry point for loop execution
- **Redis Pub/Sub**: Message broker for agent coordination
- **Realtime Dashboard**: Web-based monitoring interface
- **CLI Monitor**: Terminal-based monitoring script
- **WebSocket Event Server**: Real-time event streaming
- **Metrics Collector**: Performance and coordination tracking

## 2. Setup Requirements

### Redis Server Configuration
```bash
# Recommended Redis configuration
redis-server \
  --port 6379 \
  --maxmemory 512mb \
  --maxmemory-policy allkeys-lru \
  --save 60 1000 \
  --appendonly yes
```

### Dashboard Server Startup
```javascript
// src/monitoring/realtime-server.js
const WebSocket = require('ws');
const Redis = require('ioredis');

class RealtimeMonitorServer {
  constructor(redisUrl = 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl);
    this.wss = new WebSocket.Server({ port: 8080 });
    this.setupSubscriptions();
  }

  setupSubscriptions() {
    const channels = [
      'swarm:coordination',
      'agent:feedback',
      'cfn:loop:metrics',
      'cfn:loop:status'
    ];

    channels.forEach(channel => {
      this.redis.subscribe(channel);
    });

    this.redis.on('message', (channel, message) => {
      this.broadcastEvent(channel, message);
    });
  }

  broadcastEvent(channel, message) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          channel,
          message: JSON.parse(message),
          timestamp: Date.now()
        }));
      }
    });
  }
}

module.exports = new RealtimeMonitorServer();
```

### CLI Monitoring Script
```bash
#!/bin/bash
# scripts/monitor-swarm-redis.sh

# Requires redis-cli
CHANNEL=${1:-"swarm:coordination"}

redis-cli SUBSCRIBE "$CHANNEL" | while read event; do
  if [[ "$event" =~ ^message ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $event"
  fi
done
```

## 3. Example Workflow

### Starting CFN Loop
```bash
# Start authentication API development in MVP mode
/cfn-loop "Build authentication API" --mode=mvp
```

### Monitoring Options

#### CLI Monitoring
```bash
# Terminal 1: Monitor coordination channel
./scripts/monitor-swarm-redis.sh coordination

# Terminal 2: Monitor agent feedback
./scripts/monitor-swarm-redis.sh agent:feedback
```

#### Dashboard Monitoring
1. Start realtime server: `node src/monitoring/realtime-server.js`
2. Open browser: `http://localhost:3000/dashboard`

## 4. Code Examples

### Redis Pub/Sub Patterns
```javascript
// Agent coordination message
redis.publish('swarm:coordination', JSON.stringify({
  agentId: 'auth-coder-1',
  status: 'in_progress',
  confidence: 0.75,
  phase: 'Loop 2'
}));

// Hook feedback channel
redis.publish('agent:feedback', JSON.stringify({
  type: 'ROOT_WARNING',
  agent: 'auth-coder-1',
  message: 'File created in project root',
  suggestedAction: 'Move file to src/ directory'
}));
```

### WebSocket Client Connection
```javascript
const socket = new WebSocket('ws://localhost:8080');

socket.onmessage = (event) => {
  const { channel, message, timestamp } = JSON.parse(event.data);
  console.log(`[${new Date(timestamp).toISOString()}] ${channel}:`, message);
};
```

## 5. Expected Outputs

### CLI Monitoring
```
[2025-10-17 14:23:45] message swarm:coordination {"agentId":"auth-coder-1","status":"started"}
[2025-10-17 14:24:12] message agent:feedback {"type":"ROOT_WARNING","agent":"auth-coder-1"}
```

### WebSocket Events
```json
{
  "channel": "cfn:loop:metrics",
  "message": {
    "loopPhase": 2,
    "agentConfidence": 0.82,
    "testsRun": 24,
    "testsPassed": 22
  },
  "timestamp": 1698408285000
}
```

## 6. Troubleshooting

### Redis Connection Issues
- Verify Redis is running: `redis-cli ping`
- Check network connectivity
- Validate Redis configuration

### WebSocket Disconnections
- Implement automatic reconnection
- Log connection/disconnection events
- Monitor WebSocket server health

### Missing Feedback Channels
- Verify channel names match exactly
- Check Redis subscription setup
- Validate message publishing

### Stale Key Detection
```bash
# Check for stale keys older than 1 hour
redis-cli KEYS "*" | xargs -I {} redis-cli TTL {} | awk '$1 < 3600'
```

## 7. Performance Metrics

### Feedback Tracking
- **Latency Target**: <100ms
- **Delivery Rate**: ≥99.9%
- **Max Concurrent Agents**: 10

### Sample Metrics Collection
```javascript
class MetricsCollector {
  trackFeedbackMetrics(events) {
    const latencies = events.map(e => e.processingTime);
    return {
      avgLatency: this.calculateAverage(latencies),
      maxLatency: Math.max(...latencies),
      deliveryRate: this.calculateDeliveryRate(events)
    };
  }
}
```

## 8. Best Practices

1. Always use explicit channel names
2. Implement reconnection logic
3. Keep messages small and focused
4. Use compression for large payloads
5. Implement proper error handling

## Conclusion

This example demonstrates a comprehensive monitoring approach for CFN Loop, showcasing real-time coordination, feedback mechanisms, and performance tracking across multiple channels and interfaces.

**Key Takeaways:**
- Multiple monitoring strategies (CLI, WebSocket, Dashboard)
- Real-time event streaming
- Robust error handling
- Performance metric tracking

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)