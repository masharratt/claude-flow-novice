# Redis Swarm State Key Naming Conventions

## Overview

This document defines the standardized Redis key naming conventions for swarm state persistence and recovery. The conventions ensure consistency, scalability, and efficient key management for 1000+ concurrent agents.

## Key Pattern Structure

### Base Pattern
```
swarm:{swarmId}:{component}:{identifier}
```

### Hierarchy
```
swarm:{swarmId}                           # Main swarm state
├── agents:{agentId}                      # Individual agent states
├── tasks:{taskId}                        # Task definitions and status
├── phases:{phaseId}                      # Phase management
├── memory:{memoryType}:{memoryId}        # Memory entries
├── consensus:{roundNumber}               # Consensus tracking
├── performance:{metricType}              # Performance metrics
└── recovery:{checkpointId}               # Recovery checkpoints
```

## Key Categories

### 1. Primary Swarm State
- **Pattern**: `swarm:{swarmId}`
- **Type**: Hash
- **TTL**: 3600 seconds (auto-renewal)
- **Description**: Complete swarm state including metadata, objective, agents, tasks
- **Size**: Up to 1MB (compressed)

### 2. Agent States
- **Pattern**: `swarm:{swarmId}:agents:{agentId}`
- **Type**: Hash
- **TTL**: 3600 seconds (linked to swarm)
- **Description**: Individual agent state, status, assigned tasks
- **Fields**: role, type, status, confidence, currentTask, metadata

### 3. Task Management
- **Pattern**: `swarm:{swarmId}:tasks:{taskId}`
- **Type**: Hash
- **TTL**: 3600 seconds (linked to swarm)
- **Description**: Task definitions, progress, results
- **Fields**: title, description, status, assignedAgent, progress, result

### 4. Phase Management
- **Pattern**: `swarm:{swarmId}:phases:{phaseId}`
- **Type**: Hash
- **TTL**: 3600 seconds (linked to swarm)
- **Description**: CFN loop phase states and transitions
- **Fields**: name, status, loopLevel, tasks, metrics

### 5. Memory Entries
- **Pattern**: `swarm:{swarmId}:memory:{memoryType}:{memoryId}`
- **Type**: Hash
- **TTL**: 7200 seconds (extended retention)
- **Description**: Agent memories, knowledge, results
- **Fields**: agentId, content, timestamp, metadata

### 6. Consensus Tracking
- **Pattern**: `swarm:{swarmId}:consensus:{roundNumber}`
- **Type**: Hash
- **TTL**: 3600 seconds (linked to swarm)
- **Description**: Consensus rounds and votes
- **Fields**: requiredConfidence, currentConfidence, votes, decision

### 7. Performance Metrics
- **Pattern**: `swarm:{swarmId}:performance:{metricType}`
- **Type**: Sorted Set (time-series) or Hash (current values)
- **TTL**: 86400 seconds (24-hour retention)
- **Description**: Real-time performance metrics
- **Metric Types**: latency, throughput, memory, cpu, errors

### 8. Recovery Checkpoints
- **Pattern**: `swarm:{swarmId}:recovery:{checkpointId}`
- **Type**: Hash
- **TTL**: 604800 seconds (7-day retention)
- **Description**: System state snapshots for recovery
- **Fields**: timestamp, phase, confidence, stateHash

## Index Keys for Querying

### Active Swarms Index
- **Pattern**: `swarm:index:active`
- **Type**: Sorted Set (score = last activity timestamp)
- **Purpose**: Quickly find all active swarms

### Agent Index
- **Pattern**: `swarm:index:agents:{agentRole}`
- **Type**: Set
- **Purpose**: Find swarms by agent roles

### Status Index
- **Pattern**: `swarm:index:status:{swarmStatus}`
- **Type**: Set
- **Purpose**: Find swarms by status

### Performance Index
- **Pattern**: `swarm:index:performance:{timeWindow}`
- **Type**: Sorted Set (score = performance score)
- **Purpose**: Performance monitoring and alerting

## TTL Policies

### Default TTL Values
| Key Type | TTL (seconds) | Renewal Policy |
|----------|---------------|----------------|
| Swarm State | 3600 | Auto-renew on activity |
| Agent States | 3600 | Linked to swarm TTL |
| Tasks | 3600 | Linked to swarm TTL |
| Phases | 3600 | Linked to swarm TTL |
| Memory | 7200 | Extended retention |
| Consensus | 3600 | Linked to swarm TTL |
| Performance | 86400 | 24-hour rolling window |
| Recovery | 604800 | 7-day retention |
| Indexes | 300 | 5-minute refresh |

### TTL Renewal Triggers
- Agent activity updates
- Task progress updates
- State transitions
- Consensus votes
- Performance metric updates

## Data Size Limits

### Maximum Sizes
- Swarm State: 1MB (compressed)
- Individual Keys: 512KB
- Hash Fields: 1000 per hash
- Sorted Set Members: 10000 per set
- Memory Entries: 100KB each

### Compression Strategy
- JSON compression using gzip
- Field-level compression for large text
- Binary encoding for numeric data
- Delta encoding for time-series data

## Atomic Operations

### Transaction Patterns
```lua
-- Atomic swarm state update
MULTI
HSET swarm:swarm123 status "running"
HSET swarm:swarm123 updatedAt "2025-01-08T10:30:00Z"
ZADD swarm:index:active 1704715800 "swarm123"
EXEC
```

### Lock Management
- **Pattern**: `swarm:lock:{swarmId}`
- **Type**: String
- **TTL**: 30 seconds
- **Purpose**: Prevent concurrent state modifications

## Validation Schemas

### Swarm ID Validation
```javascript
const SWARM_ID_PATTERN = /^swarm_[a-zA-Z0-9_]{8,32}$/;
```

### Agent ID Validation
```javascript
const AGENT_ID_PATTERN = /^agent_[a-zA-Z0-9_]{8,32}$/;
```

### Task ID Validation
```javascript
const TASK_ID_PATTERN = /^task_[a-zA-Z0-9_]{8,32}$/;
```

## Performance Optimization

### Key Sharding Strategy
- Distribute keys across Redis slots
- Use hash tags for related keys
- Implement consistent hashing for large deployments

### Batch Operations
- Pipeline multiple operations
- Use MULTI/EXEC for transactions
- Implement bulk reads with MGET/MHGETALL

### Connection Pooling
- Maintain persistent connections
- Implement connection reuse
- Configure appropriate pool sizes

## Monitoring and Alerting

### Key Metrics
- Key count by pattern
- Memory usage by key type
- Operation latency by command
- TTL expiration rates
- Error rates by operation

### Alert Thresholds
- Memory usage > 80% of allocated
- Write latency > 50ms (target: <50ms)
- Key expiration rate > 100/second
- Connection pool exhaustion

## Security Considerations

### Access Control
- Separate Redis databases by environment
- Implement ACLs for different key patterns
- Use authentication tokens for access

### Data Encryption
- Encrypt sensitive data at rest
- Use TLS for in-transit encryption
- Implement key rotation policies

## Migration Strategy

### Backward Compatibility
- Support multiple schema versions
- Implement gradual migration paths
- Maintain fallback mechanisms

### Version Management
- Include version in key patterns
- Support concurrent versions
- Implement deprecation schedules

## Examples

### Complete Swarm State Example
```
# Primary swarm state
swarm:swarm_abc123def456

# Agent states
swarm:swarm_abc123def456:agents:agent_dev001
swarm:swarm_abc123def456:agents:agent_test002

# Tasks
swarm:swarm_abc123def456:tasks:task_auth_001
swarm:swarm_abc123def456:tasks:task_api_002

# Memory entries
swarm:swarm_abc123def456:memory:knowledge:mem_jquery
swarm:swarm_abc123def456:memory:result:mem_test_results

# Performance metrics
swarm:swarm_abc123def456:performance:latency
swarm:swarm_abc123def456:performance:throughput

# Recovery checkpoint
swarm:swarm_abc123def456:recovery:checkpoint_phase1
```

### Query Patterns
```javascript
// Get all active swarms
const activeSwarms = await redis.zRange('swarm:index:active', 0, -1, { REV: true });

// Get swarm agents
const agentKeys = await redis.keys(`swarm:${swarmId}:agents:*`);

// Get agent details
const agentState = await redis.hGetAll(`swarm:${swarmId}:agents:${agentId}`);

// Get performance metrics
const latencyMetrics = await redis.zRange(`swarm:${swarmId}:performance:latency`, 0, -1, { WITHSCORES: true });
```

This naming convention provides a robust foundation for swarm state management, supporting scalability, performance, and reliability requirements.