# Fleet Manager - Phase 1 Foundation Implementation

A comprehensive fleet management system for orchestrating 1000+ AI agents with Redis coordination, supporting 16 different agent pool types with priority-based resource allocation and health monitoring.

## Architecture Overview

The Fleet Manager consists of five core components that work together to provide scalable agent orchestration:

### Core Components

1. **FleetCommanderAgent** - Central fleet coordinator
2. **AgentRegistry** - Agent registration and discovery
3. **ResourceAllocator** - Intelligent resource allocation
4. **HealthMonitor** - Agent health monitoring and recovery
5. **RedisCoordinator** - Redis pub/sub coordination

## Features

### 🚀 Scalability
- Support for 1000+ concurrent agents
- 16 different agent pool types
- Dynamic scaling based on demand
- Horizontal scaling capability

### 📊 Resource Management
- Priority-based task assignment
- Multiple allocation strategies (priority, round-robin, least-loaded, capability-match, performance-based)
- Load balancing across pools
- Resource usage optimization

### 🏥 Health Monitoring
- 5-second heartbeat intervals
- Automatic failure detection
- Circuit breaker patterns
- Self-healing recovery mechanisms

### 📡 Communication
- Redis pub/sub messaging
- Event-driven architecture
- Real-time fleet status updates
- Coordination patterns

## Quick Start

### Basic Usage

```javascript
import { createFleetSystem } from './src/fleet/index.js';

// Create a fleet management system
const fleet = await createFleetSystem({
  swarmId: 'my-fleet',
  maxAgents: 100,
  redis: {
    host: 'localhost',
    port: 6379
  }
});

// Allocate an agent for a task
const allocation = await fleet.allocateAgent({
  taskId: 'task-123',
  poolType: 'coder',
  capabilities: ['javascript', 'typescript'],
  strategy: 'priority_based'
});

// Release the agent when done
await fleet.releaseAgent(allocation.agentId, {
  success: true,
  duration: 1500
});

// Get fleet status
const status = await fleet.getFleetStatus();
console.log('Fleet Status:', status);

// Shutdown when done
await fleet.shutdown();
```

### Advanced Usage

```javascript
import { FleetCommanderAgent } from './src/fleet/FleetCommanderAgent.js';

// Create fleet commander with custom configuration
const commander = new FleetCommanderAgent({
  swarmId: 'advanced-fleet',
  maxAgents: 1000,
  heartbeatInterval: 3000,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  }
});

// Initialize the fleet
await commander.initialize();

// Scale specific pools
await commander.scalePool('coder', 50);
await commander.scalePool('tester', 30);

// Register custom agents
const agentId = await commander.registerAgent({
  type: 'custom-analyzer',
  priority: 8,
  capabilities: ['data-analysis', 'machine-learning'],
  resources: { memory: 1024, cpu: 0.8 }
});

// Monitor fleet events
commander.on('agent_allocated', (event) => {
  console.log('Agent allocated:', event);
});

commander.on('health_status_updated', (event) => {
  console.log('Health status changed:', event);
});

// Get detailed metrics
const metrics = await commander.getFleetStatus();
console.log('Fleet Metrics:', metrics);
```

## Agent Pool Types

The Fleet Manager supports 16 different agent pool types:

| Pool Type | Min Agents | Max Agents | Priority | Capabilities |
|-----------|------------|------------|----------|--------------|
| coder | 5 | 100 | 8 | javascript, typescript, python, java |
| tester | 3 | 80 | 7 | unit-testing, integration-testing, e2e-testing |
| reviewer | 2 | 50 | 6 | code-review, security-review, performance-review |
| architect | 1 | 20 | 9 | system-design, api-design, database-design |
| researcher | 2 | 40 | 7 | information-gathering, analysis, documentation |
| analyst | 2 | 60 | 6 | data-analysis, statistical-analysis, reporting |
| optimizer | 1 | 30 | 5 | performance-optimization, code-optimization |
| security | 1 | 25 | 9 | security-audit, vulnerability-assessment |
| performance | 1 | 25 | 6 | performance-testing, load-testing, profiling |
| ui | 2 | 50 | 5 | frontend-development, ux-design, responsive-design |
| mobile | 1 | 30 | 5 | mobile-development, ios, android |
| devops | 1 | 30 | 7 | ci-cd, deployment, infrastructure |
| database | 1 | 25 | 6 | database-design, sql, nosql |
| network | 1 | 20 | 6 | network-configuration, protocols, security |
| infrastructure | 1 | 20 | 7 | cloud-services, containerization, orchestration |
| coordinator | 1 | 10 | 10 | project-management, coordination, planning |

## Allocation Strategies

### Priority-Based (Default)
Assigns tasks to agents with the highest priority level first.

### Round-Robin
Distributes tasks evenly across available agents in a pool.

### Least-Loaded
Assigns tasks to agents with the lowest current utilization.

### Capability-Match
Selects agents with the best matching capabilities for task requirements.

### Performance-Based
Chooses agents based on historical performance metrics and success rates.

## Redis Integration

The Fleet Manager uses Redis for:

### Data Persistence
- Agent registry storage
- Pool configuration
- Health status tracking
- Performance metrics

### Pub/Sub Communication
- Fleet coordination messages
- Health monitoring updates
- Task assignment notifications
- Scaling events

### Key Structure

```
fleet:agent:{agentId}              # Agent data
fleet:pools:{poolType}             # Pool configuration
fleet:allocations:{allocationId}   # Task allocations
health:{agentId}                   # Health monitoring data
```

### Channels

```
swarm:phase-1:fleet                # Fleet status updates
swarm:phase-1:registry            # Agent registration events
swarm:phase-1:health              # Health monitoring events
swarm:phase-1:allocation           # Resource allocation events
swarm:phase-1:scaling             # Scaling events
swarm:phase-1:tasks               # Task distribution
swarm:phase-1:results             # Task results
```

## Health Monitoring

### Health Status Levels
- **Healthy**: Agent is responding normally
- **Degraded**: Agent has missed some heartbeats
- **Unhealthy**: Agent has failed multiple health checks
- **Failed**: Agent is completely unresponsive
- **Recovering**: Agent is attempting to recover

### Circuit Breaker Pattern
- Trips after consecutive failures (default: 5)
- Prevents cascading failures
- Automatically resets after timeout (default: 30 seconds)

### Recovery Mechanisms
- Automatic recovery attempts
- Progressive backoff strategy
- Health check validation
- Performance threshold monitoring

## Performance Requirements

### Response Times
- Agent registration: <100ms
- Task allocation: <200ms
- Fleet status queries: <10ms
- Health checks: <50ms

### Scalability
- Support for 1000+ concurrent agents
- <50ms response time for fleet operations
- Horizontal scaling capability
- Resource usage optimization

### Reliability
- 99.9% uptime requirement
- Automatic failover and recovery
- Health monitoring with 5-second intervals
- Circuit breaker patterns for fault tolerance

## API Reference

### FleetCommanderAgent

#### Methods
- `initialize()` - Initialize the fleet commander
- `registerAgent(agentConfig)` - Register a new agent
- `allocateAgent(taskRequirements)` - Allocate agent for task
- `releaseAgent(agentId, result)` - Release agent from task
- `scalePool(poolType, targetSize)` - Scale agent pool
- `getFleetStatus()` - Get comprehensive fleet status
- `shutdown()` - Graceful shutdown

#### Events
- `agent_registered` - Agent registered
- `agent_allocated` - Agent allocated to task
- `agent_released` - Agent released from task
- `health_status_updated` - Agent health status changed
- `pool_scaled` - Agent pool scaled
- `error` - Error occurred

### AgentRegistry

#### Methods
- `register(agent)` - Register agent
- `unregister(agentId)` - Unregister agent
- `get(agentId)` - Get agent by ID
- `update(agentData)` - Update agent data
- `listByType(type)` - List agents by type
- `listByStatus(status)` - List agents by status
- `getIdleAgents(type, limit)` - Get idle agents

### ResourceAllocator

#### Methods
- `createPool(poolType, config)` - Create agent pool
- `allocate(taskRequirements)` - Allocate agent
- `release(allocationId, result)` - Release allocation
- `addAgentToPool(poolType, agent)` - Add agent to pool
- `removeAgentFromPool(poolType, agentId)` - Remove agent from pool
- `getPoolStatus(poolType)` - Get pool status

### HealthMonitor

#### Methods
- `registerAgent(agent)` - Register agent for monitoring
- `unregisterAgent(agentId)` - Unregister agent
- `updateHealthStatus(agentId, status)` - Update health status
- `recordHeartbeat(agentId, data)` - Record heartbeat
- `getAgentHealth(agentId)` - Get agent health
- `getHealthStats()` - Get health statistics

## Configuration

### Default Configuration

```javascript
{
  maxAgents: 1000,
  heartbeatInterval: 5000,
  healthCheckInterval: 10000,
  allocationTimeout: 30000,
  recoveryTimeout: 60000,
  scalingThreshold: 0.8,
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  }
}
```

### Environment Variables

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
FLEET_MAX_AGENTS=1000
HEARTBEAT_INTERVAL=5000
LOG_LEVEL=info
```

## Monitoring and Debugging

### Fleet Status

```javascript
const status = await fleet.getFleetStatus();
console.log('Fleet Status:', {
  totalAgents: status.agents.total,
  activeAgents: status.agents.active,
  tasksCompleted: status.metrics.tasksCompleted,
  uptime: status.metrics.uptime
});
```

### Health Monitoring

```javascript
const healthStats = fleet.healthMonitor.getHealthStats();
console.log('Health Stats:', {
  totalAgents: healthStats.totalAgents,
  healthyAgents: healthStats.healthyAgents,
  unhealthyAgents: healthStats.unhealthyAgents,
  averageResponseTime: healthStats.averageResponseTime
});
```

### Resource Allocation

```javascript
const allocationStats = await fleet.allocator.getAllocationStats();
console.log('Allocation Stats:', {
  totalAllocations: allocationStats.totalAllocations,
  activeAllocations: allocationStats.activeAllocations,
  averageAllocationTime: allocationStats.averageAllocationTime,
  byStrategy: allocationStats.byStrategy
});
```

## Error Handling

### Common Errors

1. **Redis Connection Failed**
   - Check Redis server is running
   - Verify connection parameters
   - Ensure network connectivity

2. **Agent Registration Failed**
   - Check agent configuration
   - Verify pool capacity limits
   - Validate required fields

3. **Task Allocation Failed**
   - Check task requirements
   - Verify agent availability
   - Validate pool configuration

4. **Health Check Timeout**
   - Check agent responsiveness
   - Verify network connectivity
   - Monitor resource usage

### Recovery Strategies

1. **Automatic Retry**: Built-in retry mechanisms for transient failures
2. **Circuit Breaker**: Prevents cascading failures
3. **Graceful Degradation**: Continues operation with reduced capacity
4. **Self-Healing**: Automatic recovery and reconnection

## Contributing

1. Follow the existing code style and patterns
2. Add comprehensive error handling
3. Include performance monitoring
4. Write tests for new functionality
5. Update documentation

## License

This project is part of the Claude Flow Novice fleet management system.