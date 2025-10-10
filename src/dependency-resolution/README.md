# Dependency Resolution Engine

## Overview

The Dependency Resolution Engine is a high-performance cross-functional task resolution system designed for Phase 2 Auto-Scaling & Resource Management. It provides sub-10ms dependency resolution overhead for up to 10,000 nodes with comprehensive conflict detection and automated resolution.

## Features

- **High Performance**: <10ms resolution overhead for up to 10,000 nodes
- **Cycle Detection**: Tarjan's algorithm for efficient cycle detection
- **Multiple Resolution Strategies**: Topological, priority-based, resource-aware, deadline-driven, and critical-path
- **Conflict Resolution**: Automated conflict detection and resolution with multiple strategies
- **Redis Coordination**: Distributed coordination via Redis pub/sub
- **Performance Monitoring**: Comprehensive metrics and performance validation

## Architecture

### Core Components

1. **Dependency Graph**: Represents the complete dependency structure
2. **Dependency Resolver**: Main engine for resolving dependencies with multiple strategies
3. **Conflict Resolution Engine**: Detects and resolves conflicts automatically
4. **Redis Coordination**: Manages distributed coordination and state persistence

### Algorithms

- **Tarjan's Algorithm**: O(V+E) cycle detection
- **Topological Sorting**: O(V+E) dependency resolution
- **Critical Path Analysis**: O(V+E) longest path calculation
- **Resource Conflict Detection**: O(V²) in worst case, typically O(V)

## Quick Start

```javascript
import { quickStart } from './index.js';

// Define tasks
const tasks = [
  { id: 'task1', data: { priority: 5, estimatedDuration: 1000 } },
  { id: 'task2', data: { priority: 3, estimatedDuration: 1500 } },
  { id: 'task3', data: { priority: 7, estimatedDuration: 800 } }
];

// Define dependencies
const dependencies = [
  ['task2', 'task1'], // task2 depends on task1
  ['task3', 'task1']  // task3 depends on task1
];

// Create resolution system
const system = quickStart(tasks, { dependencies });

// Resolve dependencies
const resolution = await system.resolve();
console.log(resolution.executionOrder); // ['task1', 'task3', 'task2']
```

## Advanced Usage

### Custom Resolution Strategies

```javascript
import { DependencyResolver, RESOLUTION_STRATEGIES } from './index.js';

const resolver = new DependencyResolver({
  strategy: RESOLUTION_STRATEGIES.PRIORITY_BASED,
  maxResolutionTime: 5 // 5ms target
});

// Add tasks with complex requirements
resolver.addTask('build_frontend', {
  priority: 8,
  estimatedDuration: 5000,
  requiredResources: ['cpu', 'memory'],
  deadline: Date.now() + 600000, // 10 minutes
  critical: true
});

resolver.addTask('run_tests', {
  priority: 6,
  estimatedDuration: 3000,
  requiredResources: ['cpu'],
  deadline: Date.now() + 300000 // 5 minutes
});

resolver.addDependency('run_tests', 'build_frontend');

// Resolve with custom strategy
const resolution = resolver.resolve();
```

### Conflict Resolution

```javascript
import { ConflictResolutionEngine } from './index.js';

const conflictEngine = new ConflictResolutionEngine(resolver, {
  autoResolve: true,
  maxConcurrentResolutions: 3
});

// Detect conflicts
const conflicts = await conflictEngine.detectConflicts();

if (conflicts.length > 0) {
  console.log(`Found ${conflicts.length} conflicts:`);
  conflicts.forEach(conflict => {
    console.log(`- ${conflict.type}: ${conflict.involvedTasks.join(', ')}`);
  });

  // Auto-resolve conflicts
  const result = await conflictEngine.resolveAllConflicts();
  console.log(`Resolved ${result.resolved} conflicts`);
}
```

### Redis Coordination

```javascript
import { createDependencyResolutionSystem } from './index.js';

const system = createDependencyResolutionSystem({
  enableRedisCoordination: true,
  redis: {
    host: 'localhost',
    port: 6379
  },
  resolver: {
    strategy: RESOLUTION_STRATEGIES.RESOURCE_AWARE
  }
});

await system.initialize();

// Add tasks that are coordinated across the network
await system.coordinator.addTask('distributed_task_1', {
  priority: 9,
  estimatedDuration: 2000,
  requiredResources: ['gpu']
});

// Resolve with cross-node coordination
const resolution = await system.coordinator.resolveDependencies();

await system.shutdown();
```

## API Reference

### DependencyResolver

#### Methods

- `addTask(taskId, taskData)`: Add a task to the dependency graph
- `addDependency(fromTaskId, toTaskId)`: Add a dependency between tasks
- `removeDependency(fromTaskId, toTaskId)`: Remove a dependency
- `resolve()`: Resolve dependencies using current strategy
- `hasCycles()`: Check if the graph contains cycles
- `detectCycles()`: Get all cycles in the graph
- `getReadyTasks()`: Get tasks that can be executed immediately
- `setStrategy(strategy)`: Change resolution strategy
- `getStats()`: Get graph statistics
- `getMetrics()`: Get performance metrics

#### Resolution Strategies

- `TOPOLOGICAL`: Standard topological sorting
- `PRIORITY_BASED`: Sort by priority within each level
- `RESOURCE_AWARE`: Optimize for resource usage
- `DEADLINE_DRIVEN`: Prioritize tasks with deadlines
- `CRITICAL_PATH`: Focus on critical path optimization

### ConflictResolutionEngine

#### Methods

- `detectConflicts()`: Detect all conflicts in the current graph
- `resolveConflict(conflictId)`: Resolve a specific conflict
- `resolveAllConflicts()`: Auto-resolve all detected conflicts
- `getConflict(conflictId)`: Get conflict details
- `getAllConflicts()`: Get all conflicts
- `getMetrics()`: Get conflict resolution metrics

#### Conflict Types

- `RESOURCE`: Resource allocation conflicts
- `DEADLINE`: Deadline conflicts
- `PRIORITY`: Priority inversion conflicts
- `DEPENDENCY`: Dependency cycle conflicts
- `SCHEDULING`: Scheduling conflicts

### RedisCoordinationManager

#### Methods

- `initialize()`: Initialize Redis connections and coordination
- `addTask(taskId, taskData)`: Add task with network coordination
- `addDependency(fromTaskId, toTaskId)`: Add dependency with network coordination
- `resolveDependencies()`: Resolve with cross-node coordination
- `getStats()`: Get coordination statistics
- `shutdown()`: Clean shutdown

## Performance Validation

Run the performance validation test to ensure <10ms resolution overhead:

```bash
node src/dependency-resolution/performance-validation-test.js
```

### Expected Results

- **100 nodes**: <1ms average resolution time
- **1,000 nodes**: <3ms average resolution time
- **10,000 nodes**: <10ms average resolution time

## Configuration Options

### DependencyResolver Options

```javascript
const options = {
  strategy: RESOLUTION_STRATEGIES.TOPOLOGICAL,
  enableCycleDetection: true,
  enableMetrics: true,
  maxResolutionTime: 10 // ms
};
```

### ConflictResolutionEngine Options

```javascript
const options = {
  autoResolve: true,
  maxConcurrentResolutions: 5,
  enableMetrics: true,
  resolutionTimeout: 5000 // 5 seconds
};
```

### RedisCoordinationManager Options

```javascript
const options = {
  redisConfig: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  nodeId: 'unique_node_id',
  enablePersistence: true,
  syncInterval: 5000, // 5 seconds
  heartbeatInterval: 30000 // 30 seconds
};
```

## Performance Metrics

The system tracks comprehensive performance metrics:

- Resolution time per operation
- Throughput (operations per second)
- Conflict detection and resolution rates
- Memory usage patterns
- Redis coordination latency

## Error Handling

The system provides comprehensive error handling:

- Cycle detection errors
- Invalid dependency additions
- Resolution timeouts
- Redis connection failures
- Conflict resolution failures

## Examples

### Build Pipeline

```javascript
// Create a typical build pipeline
const buildTasks = [
  { id: 'lint', data: { priority: 8, estimatedDuration: 500 } },
  { id: 'test', data: { priority: 7, estimatedDuration: 2000 } },
  { id: 'build', data: { priority: 9, estimatedDuration: 3000 } },
  { id: 'deploy', data: { priority: 6, estimatedDuration: 1000 } }
];

const buildDependencies = [
  ['test', 'lint'],
  ['build', 'test'],
  ['deploy', 'build']
];

const buildSystem = quickStart(buildTasks, { dependencies: buildDependencies });
const buildOrder = await buildSystem.resolve();
```

### Microservice Orchestration

```javascript
// Orchestrate microservice deployment
const orchestrator = createDependencyResolutionSystem({
  enableRedisCoordination: true
});

await orchestrator.initialize();

// Define service dependencies
const services = ['auth', 'database', 'cache', 'api', 'frontend'];
const serviceDependencies = [
  ['api', 'auth'],
  ['api', 'database'],
  ['frontend', 'api'],
  ['api', 'cache']
];

for (const service of services) {
  await orchestrator.coordinator.addTask(`deploy_${service}`, {
    priority: service === 'database' ? 10 : 5,
    estimatedDuration: Math.random() * 5000 + 1000,
    requiredResources: ['cpu', 'memory'],
    deadline: Date.now() + 300000 // 5 minutes
  });
}

for (const [from, to] of serviceDependencies) {
  await orchestrator.coordinator.addDependency(`deploy_${from}`, `deploy_${to}`);
}

const deploymentOrder = await orchestrator.coordinator.resolveDependencies();
```

## Contributing

When contributing to the dependency resolution engine:

1. Ensure all changes maintain <10ms resolution overhead
2. Add comprehensive performance tests
3. Update documentation for new features
4. Run the full performance validation suite

## License

This dependency resolution engine is part of the Phase 2 Auto-Scaling & Resource Management system.