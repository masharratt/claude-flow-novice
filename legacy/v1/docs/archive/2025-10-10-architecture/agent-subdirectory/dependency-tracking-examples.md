# Dependency-Aware Completion Tracking Examples

This document provides comprehensive examples of using the dependency tracking system to prevent coordinators from completing before dependent agents finish their tasks.

## Overview

The Dependency-Aware Completion Tracking system solves the race condition where coordinators complete prematurely, making them unavailable for re-run requests. It ensures proper coordination and maintains system reliability.

## Table of Contents

1. [Basic Dependency Registration](#basic-dependency-registration)
2. [Mesh Coordinator Examples](#mesh-coordinator-examples)
3. [Hierarchical Coordinator Examples](#hierarchical-coordinator-examples)
4. [Lifecycle Manager Integration](#lifecycle-manager-integration)
5. [Advanced Scenarios](#advanced-scenarios)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Basic Dependency Registration

### Simple Completion Dependency

```typescript
import {
  registerAgentDependency,
  DependencyType
} from '../src/agents/lifecycle-manager.js';

// Register a completion dependency
const dependencyId = await registerAgentDependency(
  'coordinator-agent',     // Depends on
  'worker-agent',         // Provides completion
  DependencyType.COMPLETION,
  {
    timeout: 30000,       // 30 second timeout
    metadata: {
      taskType: 'data-processing',
      priority: 'high'
    }
  }
);

console.log(`Registered dependency: ${dependencyId}`);
```

### Data Dependency with Validation

```typescript
import { DependencyType } from '../src/lifecycle/dependency-tracker.js';

// Register data dependency with validation
const dataDepId = await registerAgentDependency(
  'consumer-agent',
  'producer-agent',
  DependencyType.DATA_DEPENDENCY,
  {
    dependencyData: {
      type: 'processed-dataset',
      schema: {
        records: 'number',
        processed: 'boolean',
        timestamp: 'string'
      },
      validation: (data: any) => {
        return data &&
               typeof data.records === 'number' &&
               data.records > 0 &&
               data.processed === true;
      },
      transform: (data: any) => ({
        ...data,
        receivedAt: new Date().toISOString()
      })
    },
    timeout: 60000
  }
);
```

### Service Dependency

```typescript
// Register service dependency for coordination
const serviceDepId = await registerAgentDependency(
  'client-agent',
  'service-agent',
  DependencyType.SERVICE_DEPENDENCY,
  {
    metadata: {
      serviceType: 'coordination-service',
      healthCheckInterval: 5000
    }
  }
);
```

## Mesh Coordinator Examples

### Basic Mesh Coordination with Dependencies

```typescript
import { createMeshCoordinatorWithDependencies } from '../src/agents/mesh-coordinator.js';

async function meshCoordinationExample() {
  // Create mesh coordinator with dependency tracking
  const meshCoord = createMeshCoordinatorWithDependencies('mesh-example', {
    maxAgents: 20,
    enableDependencyTracking: true,
    completionTimeout: 60000
  });

  await meshCoord.initialize();

  // Register worker agents
  const agents = [
    { id: 'data-processor-1', capabilities: ['data-processing', 'validation'] },
    { id: 'data-processor-2', capabilities: ['data-processing', 'analysis'] },
    { id: 'result-aggregator', capabilities: ['aggregation', 'reporting'] }
  ];

  for (const agent of agents) {
    await meshCoord.registerAgent(agent.id, {
      name: agent.id,
      type: 'processor',
      status: 'ready',
      capabilities: agent.capabilities
    });
  }

  // Coordinate a complex task
  const taskId = await meshCoord.coordinateTask(
    'Process large dataset with validation and reporting',
    {
      requiredCapabilities: ['data-processing'],
      priority: 3,
      timeout: 120000
    }
  );

  console.log(`Started coordination task: ${taskId}`);

  // Set up completion monitoring
  meshCoord.on('task:completed', async (event) => {
    console.log(`Task ${event.taskId} completed with result:`, event.result);
  });

  meshCoord.on('coordinator:completion_deferred', (event) => {
    console.log(`Coordinator completion deferred: ${event.reason}`);
  });

  // Attempt shutdown - will be blocked until tasks complete
  try {
    await meshCoord.shutdown();
    console.log('Mesh coordinator shutdown successfully');
  } catch (error) {
    console.error('Coordinator shutdown error:', error);
  }
}
```

### Mesh Network with Inter-Agent Dependencies

```typescript
async function meshNetworkDependenciesExample() {
  const meshCoord = createMeshCoordinatorWithDependencies('mesh-network');
  await meshCoord.initialize();

  // Register specialized agents
  const specialists = [
    { id: 'data-collector', type: 'collector', capabilities: ['data-collection'] },
    { id: 'data-processor', type: 'processor', capabilities: ['data-processing'] },
    { id: 'data-validator', type: 'validator', capabilities: ['validation'] },
    { id: 'report-generator', type: 'reporter', capabilities: ['reporting'] }
  ];

  for (const specialist of specialists) {
    await meshCoord.registerAgent(specialist.id, {
      name: specialist.id,
      type: specialist.type,
      status: 'ready',
      capabilities: specialist.capabilities
    });
  }

  // Create dependent tasks in sequence
  const collectionTaskId = await meshCoord.coordinateTask(
    'Collect raw data',
    { requiredCapabilities: ['data-collection'], priority: 1 }
  );

  const processingTaskId = await meshCoord.coordinateTask(
    'Process collected data',
    {
      requiredCapabilities: ['data-processing'],
      priority: 2,
      dependencies: [collectionTaskId]
    }
  );

  const validationTaskId = await meshCoord.coordinateTask(
    'Validate processed data',
    {
      requiredCapabilities: ['validation'],
      priority: 2,
      dependencies: [processingTaskId]
    }
  );

  const reportingTaskId = await meshCoord.coordinateTask(
    'Generate final report',
    {
      requiredCapabilities: ['reporting'],
      priority: 3,
      dependencies: [validationTaskId]
    }
  );

  // Monitor the dependency chain completion
  let completedTasks = 0;
  meshCoord.on('task:completed', async (event) => {
    completedTasks++;
    console.log(`Task ${event.taskId} completed (${completedTasks}/4)`);

    if (completedTasks === 4) {
      console.log('All dependent tasks completed, coordinator can shutdown');
    }
  });

  console.log('Mesh network coordination started with dependency chain');
}
```

## Hierarchical Coordinator Examples

### Hierarchical Task Delegation with Dependencies

```typescript
import { createHierarchicalCoordinatorWithDependencies } from '../src/agents/hierarchical-coordinator.js';

async function hierarchicalCoordinationExample() {
  const hierCoord = createHierarchicalCoordinatorWithDependencies('hier-example', {
    maxDepth: 4,
    enableDependencyTracking: true,
    taskDelegationStrategy: 'hybrid'
  });

  await hierCoord.initialize();

  // Build management hierarchy
  await hierCoord.registerAgent('ceo', {
    name: 'CEO',
    type: 'executive',
    level: 0,
    status: 'ready',
    capabilities: ['strategic-planning', 'coordination']
  });

  await hierCoord.registerAgent('vp-engineering', {
    name: 'VP Engineering',
    type: 'executive',
    level: 1,
    status: 'ready',
    capabilities: ['engineering-management', 'coordination']
  }, 'ceo');

  await hierCoord.registerAgent('engineering-manager', {
    name: 'Engineering Manager',
    type: 'manager',
    level: 2,
    status: 'ready',
    capabilities: ['team-management', 'coordination']
  }, 'vp-engineering');

  await hierCoord.registerAgent('senior-engineer', {
    name: 'Senior Engineer',
    type: 'engineer',
    level: 3,
    status: 'ready',
    capabilities: ['architecture', 'implementation']
  }, 'engineering-manager');

  await hierCoord.registerAgent('engineer', {
    name: 'Engineer',
    type: 'engineer',
    level: 3,
    status: 'ready',
    capabilities: ['implementation', 'testing']
  }, 'engineering-manager');

  // Delegate top-level strategic task
  const strategicTaskId = await hierCoord.delegateTask(
    'Implement new product feature with full testing and documentation',
    {
      targetLevel: 0,
      priority: 5,
      requiredCapabilities: ['strategic-planning'],
      timeout: 300000 // 5 minutes
    }
  );

  console.log(`Delegated strategic task: ${strategicTaskId}`);

  // Monitor hierarchy completion
  hierCoord.on('task:delegated', (event) => {
    console.log(`Task ${event.taskId} delegated to agent ${event.agentId} at level ${event.level}`);
  });

  hierCoord.on('task:completed', (event) => {
    console.log(`Task ${event.taskId} completed by ${event.agentId}`);
  });

  hierCoord.on('coordinator:completion_deferred', (event) => {
    console.log(`Hierarchical coordinator completion deferred: ${event.reason}`);
  });

  // Shutdown will wait for entire hierarchy to complete
  await hierCoord.shutdown();
  console.log('Hierarchical coordinator completed all tasks and shutdown');
}
```

### Dynamic Hierarchy with Agent Promotion

```typescript
async function dynamicHierarchyExample() {
  const hierCoord = createHierarchicalCoordinatorWithDependencies('dynamic-hier', {
    autoPromoteCapable: true,
    maxChildrenPerNode: 5
  });

  await hierCoord.initialize();

  // Start with flat structure
  const agents = [
    { id: 'worker-1', capabilities: ['execution', 'coordination'] },
    { id: 'worker-2', capabilities: ['execution'] },
    { id: 'worker-3', capabilities: ['execution', 'coordination'] },
    { id: 'worker-4', capabilities: ['execution'] }
  ];

  for (const agent of agents) {
    await hierCoord.registerAgent(agent.id, {
      name: agent.id,
      type: 'worker',
      level: 0,
      status: 'ready',
      capabilities: agent.capabilities
    });
  }

  // Promote capable workers to managers
  await hierCoord.promoteAgent('worker-1'); // Becomes level 0 manager
  await hierCoord.promoteAgent('worker-3'); // Becomes level 0 manager

  // Re-register other workers under managers
  await hierCoord.unregisterAgent('worker-2');
  await hierCoord.registerAgent('worker-2', {
    name: 'worker-2',
    type: 'worker',
    level: 1,
    status: 'ready',
    capabilities: ['execution']
  }, 'worker-1');

  await hierCoord.unregisterAgent('worker-4');
  await hierCoord.registerAgent('worker-4', {
    name: 'worker-4',
    type: 'worker',
    level: 1,
    status: 'ready',
    capabilities: ['execution']
  }, 'worker-3');

  // Now delegate tasks to the dynamic hierarchy
  const taskId = await hierCoord.delegateTask(
    'Coordinate work across dynamic teams',
    { targetLevel: 0, priority: 3 }
  );

  console.log('Dynamic hierarchy created and task delegated');

  hierCoord.on('agent:promoted', (event) => {
    console.log(`Agent ${event.agentId} promoted to level ${event.newLevel}`);
  });

  await hierCoord.shutdown();
}
```

## Lifecycle Manager Integration

### Manual Dependency Management

```typescript
import {
  lifecycleManager,
  initializeLifecycleManager,
  registerAgentDependency,
  getAgentDependencyStatus,
  forceAgentCompletion
} from '../src/agents/lifecycle-manager.js';

async function lifecycleIntegrationExample() {
  await initializeLifecycleManager();

  // Initialize agents
  const coordinatorContext = await lifecycleManager.initializeAgent(
    'coordinator-1',
    {
      name: 'coordination-agent',
      type: 'coordinator',
      capabilities: ['coordination', 'task-management'],
      lifecycle: {
        state_management: true,
        persistent_memory: true
      }
    }
  );

  const workerContext = await lifecycleManager.initializeAgent(
    'worker-1',
    {
      name: 'worker-agent',
      type: 'worker',
      capabilities: ['data-processing'],
      lifecycle: {
        state_management: true,
        persistent_memory: false
      }
    }
  );

  // Transition agents to running state
  await lifecycleManager.transitionState('coordinator-1', 'running');
  await lifecycleManager.transitionState('worker-1', 'running');

  // Register dependency
  const depId = await registerAgentDependency(
    'coordinator-1',
    'worker-1',
    DependencyType.COMPLETION,
    {
      timeout: 60000,
      metadata: {
        description: 'Coordinator depends on worker completion',
        critical: true
      }
    }
  );

  console.log(`Registered dependency: ${depId}`);

  // Check dependency status
  const depStatus = getAgentDependencyStatus('coordinator-1');
  console.log('Coordinator dependency status:', {
    canComplete: depStatus.canComplete,
    blockedBy: depStatus.blockedBy,
    pendingCompletion: depStatus.pendingCompletion
  });

  // Try to complete coordinator (will be blocked)
  const transitionSuccess = await lifecycleManager.transitionState(
    'coordinator-1',
    'stopped',
    'Attempting completion'
  );

  console.log(`Coordinator completion allowed: ${transitionSuccess}`);

  // Complete worker to unblock coordinator
  await lifecycleManager.handleTaskComplete('worker-1', { result: 'success' }, true);

  // Wait for dependency resolution
  await new Promise(resolve => setTimeout(resolve, 100));

  // Check if coordinator is now unblocked
  const finalStatus = getAgentDependencyStatus('coordinator-1');
  console.log('Final coordinator status:', finalStatus);
}
```

### Automatic Dependency Resolution

```typescript
async function automaticResolutionExample() {
  await initializeLifecycleManager();

  // Setup agents with automatic dependency resolution
  const agents = [
    { id: 'orchestrator', type: 'coordinator' },
    { id: 'analyzer', type: 'analyst' },
    { id: 'processor', type: 'processor' },
    { id: 'validator', type: 'validator' }
  ];

  for (const agent of agents) {
    await lifecycleManager.initializeAgent(agent.id, {
      name: agent.id,
      type: agent.type,
      capabilities: [agent.type],
      hooks: {
        task_complete: `npx claude-flow@alpha hooks post-task --task-id ${agent.id}-task`,
        on_rerun_request: `echo "Rerun requested for ${agent.id}"`
      }
    });

    await lifecycleManager.transitionState(agent.id, 'running');
  }

  // Create dependency chain
  await registerAgentDependency('orchestrator', 'analyzer', DependencyType.COMPLETION);
  await registerAgentDependency('orchestrator', 'processor', DependencyType.COMPLETION);
  await registerAgentDependency('orchestrator', 'validator', DependencyType.COMPLETION);

  // Complete agents in sequence with automatic resolution
  for (const agentId of ['analyzer', 'processor', 'validator']) {
    await lifecycleManager.handleTaskComplete(agentId, {
      result: `${agentId} completed successfully`
    }, true);

    console.log(`Completed ${agentId}`);

    // Check orchestrator status after each completion
    const status = getAgentDependencyStatus('orchestrator');
    console.log(`Orchestrator can complete: ${status.canComplete}`);
  }

  console.log('All dependencies resolved automatically');
}
```

## Advanced Scenarios

### Cross-Topology Dependencies

```typescript
async function crossTopologyExample() {
  // Initialize both coordinator types
  const meshCoord = createMeshCoordinatorWithDependencies('cross-mesh');
  const hierCoord = createHierarchicalCoordinatorWithDependencies('cross-hier');

  await meshCoord.initialize();
  await hierCoord.initialize();

  // Register agents in each coordinator
  await meshCoord.registerAgent('mesh-worker-1', {
    name: 'Mesh Worker 1',
    type: 'worker',
    status: 'ready',
    capabilities: ['parallel-processing']
  });

  await hierCoord.registerAgent('hier-manager-1', {
    name: 'Hierarchical Manager',
    type: 'manager',
    level: 0,
    status: 'ready',
    capabilities: ['sequential-coordination']
  });

  // Create cross-coordinator dependency
  const meshStatus = meshCoord.getCoordinatorStatus();
  const hierStatus = hierCoord.getCoordinatorStatus();

  const crossDepId = await registerAgentDependency(
    meshStatus.coordinatorId,
    hierStatus.coordinatorId,
    DependencyType.COORDINATION,
    {
      metadata: {
        relationship: 'cross-topology',
        description: 'Mesh depends on hierarchical completion'
      }
    }
  );

  // Start tasks in both coordinators
  const meshTaskId = await meshCoord.coordinateTask('Parallel data processing');
  const hierTaskId = await hierCoord.delegateTask('Sequential oversight');

  console.log('Cross-topology coordination started');

  // Complete hierarchical task first
  await hierCoord.handleTaskCompletion(hierTaskId, 'hier-manager-1', {
    oversight: 'completed'
  });

  // Then complete mesh task
  await meshCoord.handleTaskCompletion(meshTaskId, 'mesh-worker-1', {
    processing: 'completed'
  });

  // Both coordinators should now be able to shutdown
  await hierCoord.shutdown();
  await meshCoord.shutdown();

  console.log('Cross-topology coordination completed');
}
```

### Timeout and Recovery Scenarios

```typescript
async function timeoutRecoveryExample() {
  const meshCoord = createMeshCoordinatorWithDependencies('timeout-test', {
    completionTimeout: 5000 // 5 second timeout
  });

  await meshCoord.initialize();

  await meshCoord.registerAgent('slow-worker', {
    name: 'Slow Worker',
    type: 'worker',
    status: 'ready',
    capabilities: ['slow-processing']
  });

  // Start task that may timeout
  const taskId = await meshCoord.coordinateTask(
    'Potentially slow task',
    { timeout: 3000 } // Shorter than coordinator timeout
  );

  // Set up timeout handling
  meshCoord.on('task:failed', (event) => {
    if (event.error.includes('timeout')) {
      console.log(`Task ${event.taskId} timed out, initiating recovery`);

      // Force completion as recovery mechanism
      forceAgentCompletion(meshCoord.getCoordinatorStatus().coordinatorId, 'Timeout recovery');
    }
  });

  // Simulate timeout by not completing the task
  setTimeout(async () => {
    console.log('Simulating task timeout...');
    await meshCoord.handleTaskFailure(taskId, 'slow-worker', 'Task timeout');
  }, 4000);

  try {
    await meshCoord.shutdown();
    console.log('Coordinator shutdown after timeout recovery');
  } catch (error) {
    console.error('Recovery failed:', error);
  }
}
```

### Memory Persistence and Session Recovery

```typescript
async function persistenceExample() {
  // First session - create dependencies
  const meshCoord1 = createMeshCoordinatorWithDependencies('persistent-session', {
    memoryNamespace: 'persistent-test'
  });

  await meshCoord1.initialize();

  await meshCoord1.registerAgent('persistent-worker', {
    name: 'Persistent Worker',
    type: 'worker',
    status: 'ready',
    capabilities: ['persistent-processing']
  });

  const taskId = await meshCoord1.coordinateTask('Persistent task');

  // Shutdown without completing (dependencies persist)
  await meshCoord1.shutdown(true); // Force shutdown

  console.log('First session ended with pending dependencies');

  // Second session - restore dependencies
  const meshCoord2 = createMeshCoordinatorWithDependencies('persistent-session', {
    memoryNamespace: 'persistent-test'
  });

  await meshCoord2.initialize();

  // Check if dependencies were restored
  const status = meshCoord2.getCoordinatorStatus();
  console.log('Restored coordinator status:', status);

  // Complete the persistent task
  await meshCoord2.handleTaskCompletion(taskId, 'persistent-worker', {
    result: 'Completed after session restore'
  });

  await meshCoord2.shutdown();
  console.log('Session restoration and completion successful');
}
```

## Best Practices

### 1. Dependency Design Patterns

```typescript
// Pattern 1: Hierarchical Dependencies
async function hierarchicalDependencyPattern() {
  // Create clear dependency hierarchy
  await registerAgentDependency('top-coordinator', 'middle-manager', DependencyType.COMPLETION);
  await registerAgentDependency('middle-manager', 'worker-1', DependencyType.COMPLETION);
  await registerAgentDependency('middle-manager', 'worker-2', DependencyType.COMPLETION);
}

// Pattern 2: Fan-out Dependencies
async function fanOutDependencyPattern() {
  // Single coordinator depends on multiple workers
  const workers = ['worker-1', 'worker-2', 'worker-3', 'worker-4'];

  for (const worker of workers) {
    await registerAgentDependency('coordinator', worker, DependencyType.COMPLETION, {
      timeout: 30000
    });
  }
}

// Pattern 3: Data Pipeline Dependencies
async function dataPipelineDependencyPattern() {
  // Sequential data processing pipeline
  await registerAgentDependency('processor', 'collector', DependencyType.DATA_DEPENDENCY);
  await registerAgentDependency('validator', 'processor', DependencyType.DATA_DEPENDENCY);
  await registerAgentDependency('publisher', 'validator', DependencyType.DATA_DEPENDENCY);
}
```

### 2. Error Handling Strategies

```typescript
async function robustErrorHandling() {
  try {
    const depId = await registerAgentDependency(
      'dependent-agent',
      'provider-agent',
      DependencyType.COMPLETION,
      {
        timeout: 30000,
        metadata: { retryable: true }
      }
    );

    // Monitor for violations
    const depTracker = getDependencyTracker();
    const violations = depTracker.checkViolations();

    for (const violation of violations) {
      console.warn(`Dependency violation: ${violation.message}`);

      if (violation.severity === 'critical') {
        // Handle critical violations
        await forceAgentCompletion(violation.affectedAgents[0], 'Critical violation');
      }
    }

  } catch (error) {
    console.error('Dependency registration failed:', error);

    // Fallback to non-blocking mode
    console.log('Continuing without dependency tracking');
  }
}
```

### 3. Performance Optimization

```typescript
async function optimizedDependencyManagement() {
  // Batch dependency registrations
  const dependencies = [
    { dependent: 'coord-1', provider: 'worker-1' },
    { dependent: 'coord-1', provider: 'worker-2' },
    { dependent: 'coord-1', provider: 'worker-3' }
  ];

  const depPromises = dependencies.map(dep =>
    registerAgentDependency(
      dep.dependent,
      dep.provider,
      DependencyType.COMPLETION,
      { timeout: 30000 }
    )
  );

  const depIds = await Promise.all(depPromises);
  console.log(`Registered ${depIds.length} dependencies efficiently`);

  // Use appropriate timeouts
  const shortTimeout = 10000;  // For fast operations
  const mediumTimeout = 60000; // For normal operations
  const longTimeout = 300000;  // For complex operations

  // Monitor dependency statistics
  const depTracker = getDependencyTracker();
  const stats = depTracker.getStatistics();

  if (stats.pendingDependencies > 100) {
    console.warn('High number of pending dependencies, consider optimization');
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Coordinator Won't Complete

```typescript
// Diagnosis
async function diagnoseCompletionIssue(coordinatorId: string) {
  const depStatus = getAgentDependencyStatus(coordinatorId);

  console.log('Completion diagnosis:');
  console.log(`Can complete: ${depStatus.canComplete}`);
  console.log(`Blocked by: ${depStatus.blockedBy}`);
  console.log(`Dependencies: ${depStatus.dependencies.length}`);

  if (!depStatus.canComplete) {
    console.log('Blocked dependencies:');
    for (const blockerId of depStatus.blockedBy) {
      const blockerStatus = getAgentDependencyStatus(blockerId);
      console.log(`- ${blockerId}: ${blockerStatus.pendingCompletion ? 'pending' : 'active'}`);
    }
  }
}

// Solution: Force completion if needed
async function resolveCompletionIssue(coordinatorId: string) {
  const success = await forceAgentCompletion(coordinatorId, 'Manual resolution');
  console.log(`Force completion ${success ? 'successful' : 'failed'}`);
}
```

#### 2. Memory Leaks from Unresolved Dependencies

```typescript
// Prevention
async function preventMemoryLeaks() {
  const depTracker = getDependencyTracker();

  // Regular cleanup
  setInterval(async () => {
    const violations = depTracker.checkViolations();
    const timeoutViolations = violations.filter(v => v.type === 'timeout');

    for (const violation of timeoutViolations) {
      console.warn(`Cleaning up timed-out dependencies: ${violation.dependencyIds}`);

      for (const depId of violation.dependencyIds) {
        await depTracker.removeDependency(depId);
      }
    }
  }, 60000); // Check every minute
}
```

#### 3. Cycle Detection False Positives

```typescript
// Debugging cycles
async function debugCycleDetection() {
  const depTracker = getDependencyTracker();
  const cycles = depTracker.detectCycles();

  for (const cycle of cycles) {
    console.log('Detected cycle:');
    console.log(`Path: ${cycle.path.join(' -> ')}`);
    console.log(`Length: ${cycle.length}`);

    if (cycle.hasCycle) {
      console.log(`Cycle nodes: ${cycle.cycleNodes?.join(', ')}`);
    }
  }

  // Manual cycle resolution
  if (cycles.length > 0) {
    console.log('Consider breaking cycles by:');
    console.log('1. Removing non-essential dependencies');
    console.log('2. Using event-based communication');
    console.log('3. Restructuring agent relationships');
  }
}
```

### Debugging Tools

```typescript
// Comprehensive dependency debugging
async function debugDependencySystem() {
  const depTracker = getDependencyTracker();

  // System statistics
  const stats = depTracker.getStatistics();
  console.log('Dependency System Statistics:');
  console.log(JSON.stringify(stats, null, 2));

  // Violation checking
  const violations = depTracker.checkViolations();
  if (violations.length > 0) {
    console.log('Dependency Violations:');
    violations.forEach((violation, index) => {
      console.log(`${index + 1}. ${violation.type}: ${violation.message}`);
      console.log(`   Severity: ${violation.severity}`);
      console.log(`   Affected: ${violation.affectedAgents.join(', ')}`);
    });
  }

  // Agent-specific debugging
  const allAgents = lifecycleManager.getAllAgents();
  for (const agent of allAgents) {
    const agentDepStatus = getAgentDependencyStatus(agent.agentId);
    if (!agentDepStatus.canComplete) {
      console.log(`Agent ${agent.agentId} completion blocked:`);
      console.log(`  Reason: ${agentDepStatus.blockerInfo?.reason}`);
      console.log(`  Blocked by: ${agentDepStatus.blockedBy.join(', ')}`);
    }
  }
}
```

## Conclusion

The Dependency-Aware Completion Tracking system provides robust coordination and prevents race conditions in complex agent orchestration scenarios. By following these examples and best practices, you can build reliable multi-agent systems that maintain proper coordination throughout their lifecycle.

For more advanced usage and customization options, refer to the API documentation and source code in the `/src/lifecycle/` directory.