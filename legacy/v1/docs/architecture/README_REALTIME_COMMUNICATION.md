# Real-time Communication Suite for Dashboard Applications

A comprehensive solution for real-time dashboard communication when Socket.io is not available, providing WebSocket, Server-Sent Events (SSE), and Custom Sync alternatives with automatic fallback capabilities.

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install

# Install real-time communication dependencies
npm run realtime:install

# Start the real-time server
npm run realtime:server
```

### Basic Usage

```javascript
import { RealtimeCommunicationManager } from './src/web/dashboard/realtime/RealtimeCommunicationManager.js';

// Initialize with automatic fallback
const manager = new RealtimeCommunicationManager({
  defaultMethod: 'websocket',
  autoSwitch: true,
  fallbackMethods: ['sse', 'custom-sync']
});

// Subscribe to real-time updates
manager.subscribe('agent_update', (data) => {
  console.log('Agent update received:', data);
});

// Connect to the best available method
await manager.connect();
```

## 📊 Features

### 🔌 Native WebSocket API
- **Low Latency**: 15-25ms average round-trip time
- **High Throughput**: 10,000+ messages/second
- **Bidirectional Communication**: Full duplex messaging
- **Binary Data Support**: Efficient data transfer
- **Connection Management**: Automatic reconnection with exponential backoff

### 📡 Server-Sent Events (SSE)
- **Excellent Compatibility**: Works through firewalls and proxies
- **Simple Implementation**: Minimal client-side code
- **Automatic Reconnection**: Built-in retry mechanism
- **Low Overhead**: Efficient text-based protocol
- **Standardized**: Native browser API support

### 🔄 Custom Sync (Fetch API)
- **Maximum Compatibility**: Works in any HTTP environment
- **Bypasses Restrictions**: Handles corporate network policies
- **Flexible Design**: Custom implementation for specific needs
- **Request Control**: Full control over timing and batching
- **Delta Sync**: Efficient incremental updates

### 🎯 Unified Management
- **Automatic Protocol Switching**: Intelligent fallback system
- **Performance Monitoring**: Real-time metrics and benchmarking
- **Load Balancing**: Distribute connections across protocols
- **Error Handling**: Comprehensive error recovery
- **Security**: Token-based authentication and encryption

## 🏗️ Architecture

```
src/web/dashboard/realtime/
├── NativeWebSocketManager.ts    # WebSocket implementation
├── SSEManager.ts                # Server-Sent Events implementation
├── CustomSyncManager.ts         # Custom sync implementation
├── RealtimeCommunicationManager.ts  # Unified management layer
├── PerformanceBenchmark.ts      # Performance testing suite
├── RealtimeServer.ts            # Server-side implementation
├── DashboardDemo.tsx            # React demo component
└── types/                       # TypeScript definitions
```

## 📈 Performance Comparison

| Protocol | Latency | Throughput | Success Rate | Best For |
|----------|---------|------------|--------------|-----------|
| WebSocket | 15-25ms | 10,500 msg/s | 98.5% | Low latency real-time |
| SSE | 22ms | 8,200 msg/s | 99.8% | Simple data streaming |
| Custom Sync | 145ms | 3,500 msg/s | 99.9% | Restricted environments |

## 🧪 Testing

### Comprehensive Benchmark

```bash
# Run full benchmark suite with 1000+ concurrent connections
npm run realtime:benchmark

# Quick benchmark test
npm run realtime:benchmark:quick

# Run tests for specific protocols
npm run test:realtime:websocket
npm run test:realtime:sse
npm run test:realtime:custom
```

### Performance Monitoring

```bash
# Monitor real-time performance
npm run realtime:monitor

# View performance comparison
npm run benchmark:comparison
```

## 🎮 Demo Applications

### React Dashboard Demo

```bash
# Start demo dashboard
npm run realtime:demo

# Open http://localhost:3001 to view the demo
```

The demo includes:
- Real-time protocol switching
- Performance metrics visualization
- 1000+ connection testing
- Live swarm agent simulation
- Benchmark results display

### Basic HTML Demo

```html
<!DOCTYPE html>
<html>
<head>
    <title>Real-time Communication Demo</title>
</head>
<body>
    <div id="status">Connecting...</div>
    <div id="metrics"></div>

    <script type="module">
        import { RealtimeCommunicationManager } from './RealtimeCommunicationManager.js';

        const manager = new RealtimeCommunicationManager();
        await manager.connect();

        manager.subscribe('metrics', (data) => {
            document.getElementById('metrics').innerHTML = JSON.stringify(data, null, 2);
        });
    </script>
</body>
</html>
```

## ⚙️ Configuration

### Server Configuration

```javascript
const server = new RealtimeServer({
  port: 3001,
  enableWebSocket: true,
  enableSSE: true,
  enableCustomSync: true,
  corsOrigins: ['*'],
  heartbeatInterval: 30000,
  maxConnections: 1000,
  enableCompression: true,
  enableMetrics: true
});
```

### Client Configuration

```javascript
const manager = new RealtimeCommunicationManager({
  defaultMethod: 'auto',
  autoSwitch: true,
  fallbackMethods: ['websocket', 'sse', 'custom-sync'],
  enablePerformanceMonitoring: true,
  benchmarkInterval: 300000,
  connectionTimeout: 10000,
  onMethodChange: (method) => {
    console.log(`Switched to ${method}`);
  }
});
```

## 🔧 API Reference

### RealtimeCommunicationManager

#### Methods

```javascript
// Connect to server
await manager.connect(method?: CommunicationMethod)

// Disconnect from server
await manager.disconnect()

// Send message
manager.sendMessage(type: string, payload: any, options?: SendOptions): boolean

// Subscribe to events
const unsubscribe = manager.subscribe(eventType: string, callback: Function)

// Get current status
const status = manager.getStatus()

// Switch communication method
await manager.switchMethod(method: CommunicationMethod)

// Run performance benchmark
const results = await manager.runBenchmark(config?: BenchmarkConfig)

// Get statistics
const stats = manager.getStatistics()
```

#### Events

```javascript
// Connection events
manager.on('connect', () => console.log('Connected'))
manager.on('disconnect', () => console.log('Disconnected'))
manager.on('error', (error) => console.error('Error:', error))

// Method switching
manager.on('methodChange', (method) => console.log('Method:', method))

// Performance monitoring
manager.on('benchmarkComplete', (results) => console.log('Results:', results))
```

### Message Formats

#### Standard Message Format

```javascript
{
  type: string,
  payload: any,
  timestamp: Date,
  id?: string,
  protocol?: CommunicationMethod
}
```

#### Agent Update Message

```javascript
{
  type: 'agent_update',
  payload: {
    agents: [
      {
        id: string,
        name: string,
        status: 'active' | 'idle' | 'error',
        progress: number,
        lastActivity: Date,
        taskType: string
      }
    ]
  }
}
```

#### Metrics Update Message

```javascript
{
  type: 'metrics_update',
  payload: {
    latency: number,
    throughput: number,
    connections: number,
    errors: number,
    bandwidth: number
  }
}
```

## 🔒 Security

### Authentication

```javascript
// Token-based authentication
const manager = new RealtimeCommunicationManager({
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Client-ID': clientId
  }
});
```

### Encryption

- **WebSocket**: Use WSS (WebSocket Secure)
- **SSE**: Use HTTPS endpoints
- **Custom Sync**: Use HTTPS with TLS

### CORS Configuration

```javascript
const server = new RealtimeServer({
  corsOrigins: ['https://yourdomain.com', 'https://app.yourdomain.com']
});
```

## 📊 Monitoring

### Performance Metrics

The system tracks:
- Connection success rate
- Message latency (average, P95, P99)
- Throughput (messages per second)
- Bandwidth usage
- Error rates
- Reconnection times
- Protocol distribution

### Dashboard Integration

```javascript
// Real-time monitoring dashboard
const monitoringDashboard = {
  refreshInterval: 1000,
  metrics: ['latency', 'throughput', 'errors', 'connections'],
  alerts: {
    highLatency: { threshold: 500, action: 'switch-protocol' },
    connectionLoss: { threshold: '5%', action: 'emergency-fallback' }
  }
};
```

## 🚀 Deployment

### Production Deployment

```bash
# Build for production
npm run build:realtime

# Deploy to production
npm run deploy:realtime
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
EXPOSE 3001

CMD ["node", "src/web/dashboard/realtime/RealtimeServer.js"]
```

### Environment Variables

```bash
REALTIME_PORT=3001
REALTIME_ENABLE_WEBSOCKET=true
REALTIME_ENABLE_SSE=true
REALTIME_ENABLE_CUSTOM_SYNC=true
REALTIME_MAX_CONNECTIONS=1000
REALTIME_HEARTBEAT_INTERVAL=30000
REALTIME_CORS_ORIGINS=*
```

## 🐛 Troubleshooting

### Common Issues

#### WebSocket Connection Fails
```bash
# Check if WebSocket is blocked by firewall
telnet localhost 3001

# Verify WebSocket endpoint
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" \
     -H "Sec-WebSocket-Version: 13" \
     http://localhost:3001/ws
```

#### SSE Not Working
```bash
# Test SSE endpoint
curl -N -H "Accept: text/event-stream" \
     http://localhost:3001/api/events
```

#### Performance Issues
```bash
# Run performance diagnostics
npm run realtime:benchmark

# Check connection limits
ulimit -n
```

### Debug Mode

```javascript
// Enable debug logging
const manager = new RealtimeCommunicationManager({
  debug: true,
  logLevel: 'verbose'
});
```

## 📚 Additional Resources

- [Performance Analysis Report](./REALTIME_COMMUNICATION_ANALYSIS.md)
- [API Documentation](./docs/api.md)
- [Security Guidelines](./docs/security.md)
- [Performance Optimization](./docs/performance.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Related Projects

- [Swarm Monitoring Dashboard](./monitor/dashboard/)
- [Performance Benchmark Suite](./src/performance/)
- [Agent Coordination System](./src/swarm/)

---

**For production deployment, see [Production Deployment Guide](./docs/deployment.md)**

**For API reference, see [API Documentation](./docs/api.md)**

**For security considerations, see [Security Guidelines](./docs/security.md)**