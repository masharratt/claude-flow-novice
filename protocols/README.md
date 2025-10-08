# File-Based Coordination Protocol for 50-Agent Swarm Testing

This directory contains a comprehensive file-based coordination protocol designed for high-performance 50-agent swarm testing in WSL2 environments. The protocol uses shared memory (`/dev/shm`) for low-latency inter-process communication with built-in reliability, conflict resolution, and error recovery mechanisms.

## 📁 Files Overview

- **`file-based-coordination-protocol.md`** - Complete protocol specification with schemas, architecture, and implementation guidelines
- **`file-coordination-implementation-example.js`** - Working implementation of the protocol with coordinator and agent classes
- **`file-coordination-test.js`** - Test suite for validating protocol performance and reliability

## 🚀 Quick Start

### Prerequisites

1. **WSL2 Environment**: Ensure you're running in WSL2 with shared memory support
2. **Node.js 18+**: Required for the implementation
3. **Shared Memory Access**: Verify `/dev/shm` is writable

```bash
# Check shared memory availability
ls -la /dev/shm
touch /dev/shm/test && rm /dev/shm/test && echo "✅ Shared memory accessible"
```

### Basic Usage

#### Quick Test (5 agents, 3 cycles)
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice
node protocols/file-coordination-test.js --quick
```

#### Full Test (50 agents, 10 cycles) with Monitoring
```bash
node protocols/file-coordination-test.js --full --monitor
```

#### Direct Coordinator Usage
```bash
# Start coordinator
node protocols/file-coordination-implementation-example.js coordinator

# In another terminal, start an agent
node protocols/file-coordination-implementation-example.js agent agent-0 /dev/shm/stability-test-20251007-142345
```

## 📊 Protocol Features

### Core Capabilities

- **File-Based Communication**: Uses `/dev/shm` for high-performance IPC
- **Advisory Locking**: Prevents race conditions with retry mechanisms
- **JSON Message Format**: Standardized schemas for all communication
- **Automatic Retry**: Built-in error recovery with exponential backoff
- **Heartbeat Monitoring**: Continuous agent health tracking
- **Resource Monitoring**: Memory, file descriptor, and performance metrics
- **Graceful Cleanup**: Automatic resource cleanup on completion/failure

### Performance Characteristics

- **File Write**: <1ms for 1KB JSON messages
- **File Read**: <0.5ms for typical messages
- **Concurrent Access**: Supports 50+ simultaneous agents
- **Memory Overhead**: ~4-6MB per agent process
- **Coordination Latency**: 100-500ms for 50-agent coordination

## 🏗️ Architecture

### Directory Structure
```
/dev/shm/stability-test-{session}/
├── session.json                    # Session metadata
├── coordinator/
│   ├── cycle-{cycle}/
│   │   ├── tasks-distributed.json  # Task manifest
│   │   └── results-summary.json    # Aggregated results
│   └── global-lock.json
├── agents/
│   ├── agent-{id}/
│   │   ├── task-{cycle}.json       # Current task
│   │   ├── result-{cycle}.json     # Agent result
│   │   ├── heartbeat-{timestamp}.json
│   │   └── status.json
│   └── registry.json               # Agent health registry
└── monitoring/
    ├── system-metrics.jsonl        # System metrics stream
    └── errors.jsonl                # Error log stream
```

### Message Flow

1. **Task Distribution**: Coordinator writes task files to agent directories
2. **Task Processing**: Agents detect and process tasks using file watching
3. **Result Reporting**: Agents write result files to their directories
4. **Result Collection**: Coordinator aggregates results from all agents
5. **Health Monitoring**: Continuous heartbeat file updates from all agents

## 🔧 Configuration Options

### Coordinator Configuration

```javascript
const config = {
  agentCount: 50,              // Number of agents
  totalCycles: 96,             // Total coordination cycles
  cycleInterval: 300000,       // Time between cycles (ms)
  taskTimeout: 10000,          // Task execution timeout (ms)
  collectionTimeout: 30000,    // Result collection timeout (ms)
  heartbeatInterval: 5000      // Heartbeat interval (ms)
};
```

### Test Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--quick` | 5 agents, 3 cycles | Quick validation test |
| `--full` | 50 agents, 10 cycles | Comprehensive performance test |
| `--monitor` | false | Enable real-time monitoring |

## 📈 Performance Monitoring

### Real-time Metrics

When running with `--monitor`, you'll see live updates:
```
⏱️  1:45 | 📊 45/50 agents | 📁 234 files | 💾 245MB
```

### Metrics Collected

- **Agent Health**: Active agents, response times, error rates
- **System Resources**: Memory usage, file descriptor counts
- **File System**: Read/write performance, concurrent access patterns
- **Coordination**: Cycle completion times, success rates

### Post-Test Analysis

The protocol generates comprehensive reports including:
- Performance metrics (average response times, success rates)
- File system performance analysis
- Error logs and recovery statistics
- Resource utilization patterns

## 🔒 Locking Strategy

### Advisory Locking Implementation

The protocol uses advisory file locks to prevent race conditions:

```javascript
const lock = new FileLock(filePath);
await lock.acquire();
try {
  // Critical file operations
  await fs.writeFile(filePath, data);
} finally {
  await lock.release();
}
```

### Lock Features

- **Retry Mechanism**: Exponential backoff with jitter
- **Stale Lock Detection**: Automatic cleanup of abandoned locks
- **Timeout Handling**: Configurable lock acquisition timeouts
- **Concurrent Safety**: Supports high concurrency scenarios

## 🛠️ Error Recovery

### Automatic Retry Logic

- **Task Execution**: Up to 3 retries with exponential backoff
- **File Operations**: Automatic retry for transient filesystem errors
- **Lock Acquisition**: Retry with backoff for lock contention
- **Agent Health**: Automatic detection and handling of agent failures

### Error Categories

1. **Transient Errors**: Filesystem conflicts, temporary unavailability
2. **Timeout Errors**: Agent unresponsiveness, task execution timeouts
3. **Resource Errors**: Memory exhaustion, file descriptor limits
4. **Protocol Errors**: Invalid message formats, schema violations

## 🧪 Testing and Validation

### Running Tests

```bash
# Quick validation test
node protocols/file-coordination-test.js --quick

# Comprehensive performance test
node protocols/file-coordination-test.js --full --monitor

# Custom configuration
node protocols/file-coordination-test.js --agent-count 20 --cycles 5
```

### Test Results Analysis

After each test run, examine:
- `final-report.json`: Complete performance metrics
- Session directory in `/dev/shm`: Raw coordination files
- Console output: Real-time progress and summary

### Success Criteria

- **Response Rate**: >95% of agents respond per cycle
- **Latency**: <500ms average coordination time
- **Resource Stability**: <10% variance in memory/FD usage
- **Error Rate**: <1% protocol-level errors

## 🔍 Troubleshooting

### Common Issues

#### "Shared memory not accessible"
```bash
# Check /dev/shm permissions
ls -la /dev/shm
sudo chmod 1777 /dev/shm  # Fix permissions if needed
```

#### "Agent spawn timeout"
- Increase system resources (RAM/CPU)
- Reduce concurrent agent count
- Check for process limits (`ulimit -u`)

#### "Lock acquisition timeout"
- Check for stale lock files in `/dev/shm`
- Increase lock timeout in configuration
- Verify filesystem performance

#### High memory usage
- Monitor agent memory leaks
- Adjust agent count for system resources
- Enable memory monitoring with `--monitor`

### Debug Mode

Enable detailed logging by setting the environment variable:
```bash
DEBUG=1 node protocols/file-coordination-test.js --quick
```

## 📚 Integration Examples

### Integration with Existing Test Suite

```javascript
// In your test framework
import { ProtocolTester } from './protocols/file-coordination-test.js';

const tester = new ProtocolTester({
  agentCount: 50,
  totalCycles: 10,
  monitoring: true
});

const success = await tester.runTest();
console.log(`Test ${success ? 'PASSED' : 'FAILED'}`);
```

### Custom Task Types

```javascript
// Define custom task payload
const customTask = {
  messageType: "task",
  payload: {
    type: "custom_operation",
    data: {
      // Your custom task data
    }
  }
};
```

### Monitoring Integration

```javascript
// Custom monitoring
class CustomMonitor {
  async monitor(sessionPath) {
    const metrics = await this.collectMetrics(sessionPath);
    await this.sendToMonitoringSystem(metrics);
  }
}
```

## 🚀 Performance Optimizations

### For High-Concurrency Scenarios

1. **Batch File Operations**: Group multiple file operations
2. **Async I/O**: Use non-blocking file operations
3. **Memory Mapping**: For very large data sets (advanced)
4. **Connection Pooling**: Reuse file handles where possible

### Resource Tuning

```javascript
// Optimize for your environment
const optimizedConfig = {
  agentCount: Math.min(os.cpus().length * 12, 50), // CPU-based scaling
  cycleInterval: 10000, // Adjust based on workload
  taskTimeout: 15000,   // Allow more time for complex tasks
  collectionTimeout: 45000 // Longer collection for large swarms
};
```

## 📖 Protocol Reference

### Message Schemas

See `file-based-coordination-protocol.md` for complete message schemas and protocol specifications.

### API Reference

#### FileLock Class
```javascript
const lock = new FileLock(filePath, maxRetries, retryDelay);
await lock.acquire();
await lock.release();
```

#### Coordinator Class
```javascript
const coordinator = new SimpleCoordinator(config);
await coordinator.initialize();
await coordinator.runTest();
await coordinator.cleanup();
```

#### Agent Class
```javascript
const agent = new SimpleAgent(agentId, basePath);
await agent.start();
await agent.stop();
```

## 🤝 Contributing

When extending the protocol:

1. **Maintain Compatibility**: Keep message schemas backward compatible
2. **Add Tests**: Include test cases for new functionality
3. **Update Documentation**: Keep this README and protocol spec current
4. **Performance Testing**: Validate performance impact of changes

## 📄 License

This protocol is part of the claude-flow-novice project. See the main project license for details.

---

For detailed protocol specifications, see [file-based-coordination-protocol.md](./file-based-coordination-protocol.md).