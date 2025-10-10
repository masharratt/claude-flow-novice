# SQLite Memory Management System

**Phase 1 Foundation Infrastructure & Event Bus Architecture**

## Overview

Comprehensive SQLite-based memory management system with 5-level ACL (Access Control Level) system and Redis coordination for swarm operations. This system provides persistent, secure, and high-performance memory storage for distributed agent swarms.

## Features

### 🏗️ **12-Table SQLite Schema**
- **agents**: Agent registry with metadata and capabilities
- **events**: Event bus with TTL and priority support
- **tasks**: Task management with dependencies and tracking
- **memory**: Encrypted and compressed memory storage
- **consensus**: Consensus tracking and validation
- **permissions**: ACL permission management
- **audit_log**: Comprehensive audit trail
- **metrics**: Performance and operational metrics
- **dependencies**: Task and resource dependencies
- **conflicts**: Conflict detection and resolution
- **artifacts**: Generated artifacts and outputs
- **swarms**: Swarm metadata and configuration

### 🔐 **5-Level ACL System**
1. **Private** (Level 1): Only accessible by specific agent
2. **Team** (Level 2): Accessible by agents in the same team
3. **Swarm** (Level 3): Accessible by all agents in the swarm
4. **Public** (Level 4): Accessible by all authenticated agents
5. **System** (Level 5): System-level access (administrative)

### 🔒 **Security Features**
- **AES-256-GCM Encryption**: For private and team-level data
- **LZ4 Compression**: For efficient storage
- **Access Control**: Fine-grained permission system
- **Audit Logging**: Complete audit trail
- **TTL Support**: Automatic expiration of data

### 🚀 **Performance Optimizations**
- **WAL Mode**: Write-Ahead Logging for concurrency
- **Memory-Mapped I/O**: 256GB memory mapping
- **Connection Pooling**: Efficient database connections
- **Caching**: ACL cache with 5-minute TTL
- **Indexes**: Optimized for read-heavy workloads

### 📡 **Redis Coordination**
- **Pub/Sub Messaging**: Real-time coordination
- **Agent Registry**: Distributed agent management
- **Consensus Building**: Distributed decision making
- **Heartbeat System**: Health monitoring
- **Event Broadcasting**: Cross-agent communication

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Agent Layer   │    │   Coordination  │    │   Storage Layer │
│                 │    │                 │    │                 │
│ • AgentRegistry │◄──►│  RedisCoordinator│◄──►│ SwarmMemoryMgr  │
│ • Permissions   │    │ • Pub/Sub       │    │ • SQLite DB     │
│ • Teams         │    │ • Heartbeat     │    │ • Encryption    │
│ • Capabilities  │    │ • Consensus     │    │ • Compression   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ MemoryStoreAdapter│
                    │                 │
                    │ • Compatibility  │
                    │ • Interface      │
                    │ • Operations     │
                    └─────────────────┘
```

## Quick Start

### Basic Usage

```javascript
const { SQLiteMemorySystem } = require('./src/sqlite');

// Initialize the system
const memorySystem = new SQLiteMemorySystem({
  swarmId: 'my-swarm',
  agentId: 'my-agent',
  dbPath: './swarm-memory.db',
  enableRedisCoordination: true,
  redisConfig: {
    host: 'localhost',
    port: 6379
  }
});

await memorySystem.initialize();

// Store data with ACL
await memorySystem.memoryAdapter.set('secret-key', 'secret-value', {
  agentId: 'agent-1',
  aclLevel: 1 // private
});

// Retrieve data
const value = await memorySystem.memoryAdapter.get('secret-key', {
  agentId: 'agent-1'
});
```

### Agent Registration

```javascript
// Register an agent
const agent = await memorySystem.registerAgent({
  id: 'agent-1',
  name: 'Backend Developer',
  type: 'backend-dev',
  capabilities: ['api', 'database', 'security']
});

// Grant permissions
await memorySystem.grantPermission('agent-1', 'memory', 3, ['read', 'write']);
```

### Performance Monitoring

```javascript
// Run performance benchmarks
const results = await memorySystem.runBenchmarks({
  testIterations: 1000,
  concurrency: 10
});

console.log('Average SET time:', results.basic_operations.set.avg);
console.log('Max GET ops/sec:', results.concurrent_operations.concurrent_gets.opsPerSecond);
```

## API Reference

### SQLiteMemorySystem

Main system class that coordinates all components.

#### Constructor Options

```javascript
const options = {
  swarmId: 'phase-1-foundation-infrastructure',
  agentId: 'sqlite-system',
  dbPath: ':memory:', // or file path
  redisConfig: {
    host: 'localhost',
    port: 6379,
    password: null,
    db: 0
  },
  encryptionKey: Buffer.from('32-byte-encryption-key'),
  compressionThreshold: 1024,
  enableRedisCoordination: true,
  enablePerformanceMonitoring: true
};
```

#### Methods

- `initialize()`: Initialize the system
- `registerAgent(agentInfo)`: Register a new agent
- `getAgent(agentId)`: Get agent information
- `listAgents(filter)`: List agents with optional filters
- `grantPermission(agentId, resourceType, level, actions)`: Grant permissions
- `hasPermission(agentId, resourceType, action, level)`: Check permissions
- `runBenchmarks(options)`: Run performance benchmarks
- `getSystemMetrics()`: Get system metrics
- `backup(backupPath)`: Create system backup
- `optimize()`: Optimize performance
- `gracefulShutdown()`: Shutdown gracefully

### SwarmMemoryManager

Core SQLite memory management with ACL.

#### Methods

- `get(key, options)`: Get value with ACL check
- `set(key, value, options)`: Set value with ACL
- `delete(key, options)`: Delete value with ACL
- `has(key, options)`: Check if key exists
- `clear(options)`: Clear namespace or all
- `getStats()`: Get database statistics
- `backup(path)`: Backup database
- `optimize()`: Optimize database

### MemoryStoreAdapter

Compatibility layer for existing MemoryStore interface.

#### Methods

- `get(key, options)`: Get value
- `set(key, value, options)`: Set value
- `delete(key, options)`: Delete value
- `has(key, options)`: Check existence
- `clear(options)`: Clear data
- `mget(keys, options)`: Get multiple values
- `mset(keyValuePairs, options)`: Set multiple values
- `keys(options)`: Get all keys
- `setex(key, ttl, value, options)`: Set with TTL
- `incr(key, options)`: Increment numeric value
- `decr(key, options)`: Decrement numeric value

### RedisCoordinator

Redis-based coordination and messaging.

#### Methods

- `initialize()`: Initialize coordinator
- `publish(channel, message, options)`: Publish message
- `subscribe(channel, handler)`: Subscribe to channel
- `getParticipants()`: Get swarm participants
- `requestConsensus(targetId, targetType, threshold)`: Request consensus
- `submitVote(consensusId, vote, confidence)`: Submit vote
- `sendHeartbeat()`: Send heartbeat
- `shutdown()`: Shutdown coordinator

### AgentRegistry

Agent and permission management.

#### Methods

- `registerAgent(agentInfo)`: Register agent
- `unregisterAgent(agentId)`: Unregister agent
- `updateAgent(agentId, updates)`: Update agent
- `getAgent(agentId)`: Get agent
- `listAgents(filter)`: List agents
- `createTeam(teamInfo)`: Create team
- `addAgentToTeam(agentId, teamId)`: Add to team
- `removeAgentFromTeam(agentId, teamId)`: Remove from team
- `grantPermission(agentId, resourceType, level, actions)`: Grant permission
- `hasPermission(agentId, resourceType, action, level)`: Check permission

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# SQLite Configuration
SQLITE_DB_PATH=./swarm-memory.db
SQLITE_ENCRYPTION_KEY=your-32-byte-encryption-key
SQLITE_COMPRESSION_THRESHOLD=1024

# Swarm Configuration
SWARM_ID=phase-1-foundation-infrastructure
AGENT_ID=sqlite-system

# Performance Monitoring
ENABLE_PERFORMANCE_MONITORING=true
BENCHMARK_OUTPUT_DIR=./performance-reports
```

### Database Schema

The system uses a 12-table schema optimized for swarm operations:

- **Indexes**: Optimized for read-heavy workloads
- **Foreign Keys**: Maintained for data integrity
- **Triggers**: Automatic timestamp updates
- **TTL Support**: Automatic expiration cleanup
- **Compression**: LZ4 compression for large data
- **Encryption**: AES-256-GCM for sensitive data

## Performance

### Benchmarks

Typical performance characteristics:

- **SET Operations**: 0.5-2ms average
- **GET Operations**: 0.2-1ms average
- **ACL Checks**: 0.1-0.5ms average (with caching)
- **Encryption**: 1-5ms for 1KB data
- **Compression**: 0.5-2ms for 10KB data
- **Compression Ratio**: 3-10x for text data
- **Concurrent Operations**: 10,000+ ops/sec

### Optimization

- **WAL Mode**: Enables concurrent reads/writes
- **Memory Mapping**: 256GB for large datasets
- **Connection Pooling**: Efficient resource usage
- **Cache Strategies**: ACL and query result caching
- **Batch Operations**: Bulk read/write support

## Security

### Access Control

- **5-Level ACL**: Granular access control
- **Permission System**: Role-based permissions
- **Agent Authentication**: Secure agent identification
- **Audit Logging**: Complete access audit trail

### Encryption

- **AES-256-GCM**: Industry-standard encryption
- **Per-Record Encryption**: Only sensitive data encrypted
- **Key Management**: Secure key storage
- **IV Generation**: Cryptographically secure initialization vectors

## Redis Integration

### Coordination Features

- **Agent Discovery**: Automatic agent registration
- **Health Monitoring**: Heartbeat and health checks
- **Event Broadcasting**: Real-time event distribution
- **Consensus Building**: Distributed decision making
- **State Synchronization**: Cross-agent state sync

### Message Types

- **coordination**: System coordination messages
- **memory**: Memory operation notifications
- **events**: Event bus messages
- **consensus**: Consensus building messages
- **heartbeat**: Health monitoring messages
- **sqlite**: Schema and database messages

## Monitoring

### Metrics

The system provides comprehensive metrics:

- **Operation Counts**: GET/SET/DELETE operations
- **Performance Metrics**: Latency and throughput
- **Cache Statistics**: Hit rates and efficiency
- **Error Rates**: System health indicators
- **Resource Usage**: Memory and disk usage

### Events

- **initialized**: System initialization
- **agentRegistered**: New agent registration
- **memoryOperation**: Memory operations
- **error**: System errors
- **benchmarksCompleted**: Performance benchmarks

## Examples

### Basic Memory Operations

```javascript
// Initialize system
const system = new SQLiteMemorySystem();
await system.initialize();

// Create memory adapter
const adapter = system.createMemoryAdapter({
  namespace: 'my-app'
});

// Store data
await adapter.set('user:123', {
  name: 'John Doe',
  email: 'john@example.com'
}, {
  agentId: 'agent-1',
  aclLevel: 2 // team level
});

// Retrieve data
const user = await adapter.get('user:123', {
  agentId: 'agent-1'
});
```

### Agent Management

```javascript
// Register agents
const backendDev = await system.registerAgent({
  name: 'Backend Developer',
  type: 'backend-dev',
  capabilities: ['api', 'database']
});

const frontendDev = await system.registerAgent({
  name: 'Frontend Developer',
  type: 'frontend-dev',
  capabilities: ['ui', 'ux']
});

// Create team
const team = await system.agentRegistry.createTeam({
  name: 'Web Development Team',
  leaderId: backendDev.id
});

// Add agents to team
await system.agentRegistry.addAgentToTeam(backendDev.id, team.id);
await system.agentRegistry.addAgentToTeam(frontendDev.id, team.id);
```

### Performance Testing

```javascript
// Run comprehensive benchmarks
const results = await system.runBenchmarks({
  testIterations: 5000,
  concurrency: 20,
  enableEncryption: true,
  enableCompression: true
});

// View results
console.log('Performance Results:');
console.log('- Average SET time:', results.basic_operations.set.avg, 'ms');
console.log('- Average GET time:', results.basic_operations.get.avg, 'ms');
console.log('- Max SET ops/sec:', results.concurrent_operations.concurrent_sets.opsPerSecond);
console.log('- Max GET ops/sec:', results.concurrent_operations.concurrent_gets.opsPerSecond);
console.log('- ACL check time:', results.acl_performance.acl_checks.avg, 'ms');
console.log('- Cache hit rate:', (results.acl_performance.cache_hit_rate * 100).toFixed(1), '%');
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check Redis server is running
   - Verify connection configuration
   - Check network connectivity

2. **Database Lock Errors**
   - Ensure proper connection cleanup
   - Check for long-running transactions
   - Verify WAL mode is enabled

3. **Permission Denied Errors**
   - Check agent ACL levels
   - Verify permission grants
   - Review agent capabilities

4. **Performance Issues**
   - Check database indexes
   - Monitor cache hit rates
   - Review compression settings

### Debug Mode

Enable debug logging:

```javascript
const system = new SQLiteMemorySystem({
  debug: true,
  logLevel: 'debug'
});
```

## License

This implementation is part of the Phase 1 Foundation Infrastructure & Event Bus Architecture for the Claude Flow Novice project.

## Contributing

When contributing to this SQLite memory management system:

1. Follow the existing code style
2. Add comprehensive tests
3. Update documentation
4. Test performance impact
5. Verify security implications