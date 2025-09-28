# Premium Performance Monitor - 96GB Setup

A comprehensive real-time performance monitoring system optimized for high-end development environments with 62GB RAM, 24 cores, and DDR5-6400 memory.

## 🚀 Features

- **Real-time Dashboard**: 1-second update intervals with WebSocket connectivity
- **Multi-Swarm Tracking**: Monitor multiple Claude Flow swarm instances simultaneously
- **Memory Optimization**: Advanced monitoring for 62GB DDR5-6400 setup
- **Performance Benchmarking**: CPU, memory, and swarm efficiency benchmarks
- **Intelligent Alerting**: Context-aware alerts with configurable thresholds
- **Claude Flow Integration**: Seamless integration with Claude Flow hooks and memory system

## 📋 System Requirements

- **Hardware**: 62GB+ RAM, 24+ CPU cores, DDR5-6400 memory
- **Software**: Node.js 18+, npm/yarn
- **Optional**: Claude Flow for enhanced coordination

## 🔧 Installation

```bash
# Install dependencies
npm install

# Start the monitoring server
npm start

# Or run in development mode
npm run dev
```

## 🌟 Quick Start

1. **Start the server**:
   ```bash
   cd monitor
   npm start
   ```

2. **Open the dashboard**:
   - Navigate to `http://localhost:3001`
   - Dashboard will automatically connect and start receiving real-time updates

3. **Run benchmarks**:
   ```bash
   npm run benchmark
   ```

## 📊 Dashboard Features

### Real-time Metrics (1-second updates)
- **System Performance**: Memory usage, CPU utilization, DDR5-6400 bandwidth
- **Multi-Swarm Tracking**: Individual swarm instances with agent counts and task status
- **Database Performance**: Query latency, connection pools, cache hit rates
- **Network Monitoring**: Throughput, latency, active connections

### Interactive Charts
- Real-time performance timeline with 1m/5m/15m/1h views
- Memory optimization breakdowns
- Swarm efficiency trends
- Performance degradation detection

### Benchmarking Tools
- **CPU Benchmark**: Multi-threaded performance testing
- **Memory Benchmark**: DDR5-6400 bandwidth testing
- **Swarm Benchmark**: Coordination efficiency testing
- **Full System**: Comprehensive performance analysis

### Intelligent Alerting
- **Memory Alerts**: Usage thresholds optimized for 62GB setup
- **CPU Alerts**: Load average monitoring for 24-core systems
- **Performance Degradation**: Trend-based early warning
- **Swarm Coordination**: Efficiency and success rate monitoring

## 🏗️ Architecture

```
monitor/
├── dashboard/                 # Web interface
│   ├── premium-dashboard.html # Main dashboard
│   ├── premium-styles.css     # Responsive styling
│   ├── premium-dashboard.js   # Real-time client
│   └── server.js             # Express + Socket.IO server
├── collectors/               # Metrics collection
│   └── metrics-collector.js  # System & swarm metrics
├── benchmarks/              # Performance testing
│   └── runner.js            # Benchmark execution engine
├── alerts/                  # Alert management
│   └── alert-manager.js     # Intelligent alerting system
├── hooks/                   # Claude Flow integration
│   └── claude-flow-integration.js
└── package.json             # Dependencies & scripts
```

## 🔗 Claude Flow Integration

The monitor integrates seamlessly with Claude Flow for enhanced coordination:

```javascript
// Automatic hooks integration
await claudeFlowIntegration.initializeHooks();

// Store monitoring setup in Claude Flow memory
npx claude-flow@alpha hooks post-edit --memory-key "swarm/benchmarker/monitoring-setup"

// Real-time notifications for critical alerts
npx claude-flow@alpha hooks notify --message "Critical performance alert"
```

### Memory Storage Keys
- `swarm/benchmarker/monitoring-setup` - Main configuration
- `swarm/benchmarker/latest-metrics` - Current performance data
- `swarm/benchmarker/alerts/{id}` - Active alerts
- `swarm/benchmarker/benchmarks/{type}` - Benchmark results
- `swarm/benchmarker/swarms/{id}` - Individual swarm metrics

## 📈 Performance Optimization

### Memory Configuration (62GB DDR5-6400)
- **Heap Optimization**: 4GB warning, 6GB critical thresholds
- **Memory Leak Detection**: Trend-based monitoring
- **Bandwidth Monitoring**: Real DDR5-6400 performance tracking
- **GC Analysis**: Garbage collection impact measurement

### CPU Optimization (24 cores)
- **Load Average Monitoring**: 20/30 warning/critical thresholds
- **Per-core Utilization**: Individual core performance tracking
- **Thread Pool Optimization**: Optimal thread allocation
- **Thermal Throttling**: Performance degradation detection

### Swarm Coordination
- **Multi-instance Tracking**: Monitor multiple swarms simultaneously
- **Agent Load Balancing**: Optimize task distribution
- **Efficiency Metrics**: Success rates, throughput, latency
- **Fault Tolerance**: Agent failure detection and recovery

## 🚨 Alert Configuration

### System Alerts
```javascript
memory: {
  warning: 80,    // 80% of 62GB (~50GB)
  critical: 90    // 90% of 62GB (~56GB)
},
cpu: {
  warning: 80,    // 80% across 24 cores
  critical: 95    // 95% across 24 cores
}
```

### Custom Alerts
```javascript
// Add custom alert rules
alertManager.addCustomAlert({
  id: 'custom_memory_efficiency',
  name: 'Memory Efficiency Alert',
  condition: (metrics) => metrics.memory.efficiency < 75,
  severity: () => 'warning',
  message: (metrics) => `Memory efficiency: ${metrics.memory.efficiency}%`,
  cooldown: 300000 // 5 minutes
});
```

## 🔬 Benchmarking

### CPU Benchmark
- **Multi-threaded**: Utilizes all 24 cores
- **Workload Types**: Arithmetic, cryptographic, mixed
- **Metrics**: Operations/second, efficiency percentage
- **Duration**: Configurable (default 10 seconds)

### Memory Benchmark
- **DDR5-6400 Optimized**: Tests actual bandwidth capabilities
- **Patterns**: Sequential, random, alternating
- **Metrics**: Read/write bandwidth, latency
- **Efficiency**: Percentage of theoretical maximum

### Swarm Benchmark
- **Agent Simulation**: Test coordination efficiency
- **Task Distribution**: Load balancing verification
- **Success Rates**: Fault tolerance testing
- **Throughput**: Tasks per second measurement

## 🌐 API Endpoints

### Metrics
- `GET /api/metrics` - Latest system metrics
- `GET /api/metrics/history?timeframe=1h` - Historical data
- `GET /api/swarms` - Swarm-specific metrics

### Benchmarking
- `POST /api/benchmark/cpu` - Run CPU benchmark
- `POST /api/benchmark/memory` - Run memory benchmark
- `POST /api/benchmark/swarm` - Run swarm benchmark
- `POST /api/benchmark/full` - Run full system benchmark

### Alerts
- `GET /api/alerts` - Active alerts
- `POST /api/alerts/acknowledge/:id` - Acknowledge alert

### Health
- `GET /health` - System health check

## 🔧 Configuration

### Environment Variables
```bash
PORT=3001                    # Server port
UPDATE_INTERVAL=1000         # Metrics update interval (ms)
BENCHMARK_THREADS=24         # Benchmark thread count
MEMORY_WARNING_THRESHOLD=80  # Memory warning threshold (%)
CPU_WARNING_THRESHOLD=80     # CPU warning threshold (%)
```

### Dashboard Configuration
```javascript
const config = {
  updateInterval: 1000,      // 1-second updates
  realTimeEnabled: true,     // WebSocket connectivity
  multiSwarmTracking: true,  // Multiple swarm monitoring
  benchmarkingEnabled: true, // Benchmark tools
  alertingEnabled: true      // Alert system
};
```

## 🚀 Advanced Usage

### Custom Metrics Collection
```javascript
import { MetricsCollector } from './collectors/metrics-collector.js';

const collector = new MetricsCollector();
const metrics = await collector.collectMetrics();
```

### Benchmark Automation
```javascript
import { BenchmarkRunner } from './benchmarks/runner.js';

const runner = new BenchmarkRunner();
const result = await runner.runFullSystemBenchmark();
```

### Alert Integration
```javascript
import { AlertManager } from './alerts/alert-manager.js';

const alertManager = new AlertManager();
alertManager.on('alert', (alert) => {
  console.log('Alert triggered:', alert);
});
```

## 🐛 Troubleshooting

### Common Issues

1. **High Memory Usage**:
   - Check for memory leaks in monitoring code
   - Verify DDR5-6400 configuration
   - Monitor GC frequency and duration

2. **WebSocket Connection Issues**:
   - Verify firewall settings
   - Check port 3001 availability
   - Ensure Node.js version compatibility

3. **Claude Flow Integration**:
   - Verify Claude Flow installation
   - Check hook permissions
   - Validate memory storage access

### Performance Tuning

1. **Optimize Update Frequency**:
   ```javascript
   // Reduce update frequency for lower resource usage
   updateInterval: 5000 // 5-second updates
   ```

2. **Selective Metric Collection**:
   ```javascript
   // Disable expensive metrics if not needed
   const metrics = await collector.collectMetrics({
     skipNetworkDetails: true,
     skipDatabaseMetrics: true
   });
   ```

3. **Alert Tuning**:
   ```javascript
   // Adjust thresholds for your specific environment
   alertManager.updateThresholds('system', {
     memory: { warning: 85, critical: 95 }
   });
   ```

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues or questions:
- Check the troubleshooting section
- Review Claude Flow documentation
- Open an issue on GitHub