# V2 Coordination System Transparency Guide

## Overview

The V2 Coordination System Transparency features provide comprehensive visibility into multi-level agent operations, enabling real-time monitoring, hierarchy visualization, and performance tracking.

## Features

### 🔍 Real-time Agent Hierarchy Visualization
- **Multi-level tree display** of agent relationships (parent-child)
- **Level-based organization** (Level 1: Orchestrators → Level 2: Workers → Level 3: Helpers)
- **Dynamic hierarchy updates** as agents are spawned/terminated
- **Branching factor analysis** and hierarchy balance metrics

### 📊 Agent Status Monitoring
- **Real-time state tracking** (idle, active, paused, terminated, error)
- **Resource usage monitoring** (tokens, memory, CPU)
- **Performance metrics** (execution time, pause/resume latency)
- **Progress tracking** with completion percentages
- **Error monitoring** with severity levels

### 📋 Lifecycle Event Streaming
- **Complete audit trail** of all agent operations
- **Event filtering** by type, agent, or time range
- **Performance impact tracking** for each event
- **Dependency relationship monitoring**

### ⚡ Performance Analytics
- **Token usage optimization** (identify inefficient agents)
- **Resource allocation insights** (memory/CPU bottlenecks)
- **Hierarchy efficiency metrics** (balance, depth, branching)
- **Dependency resolution rates**

## CLI Usage

### Basic Commands

```bash
# Show agent hierarchy tree
npx claude-flow-novice transparency hierarchy

# Show real-time agent status
npx claude-flow-novice transparency status

# Show recent lifecycle events
npx claude-flow-novice transparency events --number 20

# Show performance metrics
npx claude-flow-novice transparency metrics
```

### Advanced Features

```bash
# Watch mode - real-time updates every 5 seconds
npx claude-flow-novice transparency --watch

# Filter by hierarchy level
npx claude-flow-novice transparency hierarchy --level 2

# Filter by agent type
npx claude-flow-novice transparency status --type coder

# Export data as JSON
npx claude-flow-novice transparency --json --performance

# Show detailed agent information
npx claude-flow-novice transparency agent worker-coder-001 --performance --events 5
```

### Command Options

| Option | Description | Example |
|--------|-------------|---------|
| `--watch, -w` | Enable real-time watch mode | `--watch --interval 10` |
| `--interval, -i` | Update interval for watch mode (seconds) | `--interval 3` |
| `--type, -t` | Filter by agent type | `--type coder` |
| `--level, -l` | Filter by hierarchy level | `--level 2` |
| `--state, -s` | Filter by agent state | `--state active` |
| `--performance, -p` | Show performance metrics | `--performance` |
| `--events, -e` | Show recent events | `--events 50` |
| `--json, -j` | Export data as JSON | `--json` |
| `--verbose, -v` | Verbose output | `--verbose` |

## API Integration

### Basic Usage

```typescript
import { TransparencySystem } from './src/coordination/v2/transparency/index.js';

// Initialize transparency system
const transparency = new TransparencySystem();
await transparency.initialize({
  enableRealTimeMonitoring: true,
  enableEventStreaming: true,
  enablePerformanceTracking: true,
});

// Start monitoring
await transparency.startMonitoring();

// Get agent hierarchy
const hierarchy = await transparency.getAgentHierarchy();

// Get agent statuses
const statuses = await transparency.getAllAgentStatuses();

// Get recent events
const events = await transparency.getRecentEvents(100);

// Get metrics
const metrics = await transparency.getTransparencyMetrics();
```

### Event Listeners

```typescript
import type { TransparencyEventListener } from './src/coordination/v2/transparency/index.js';

const listener: TransparencyEventListener = {
  onHierarchyChange: (change) => {
    console.log(`Hierarchy ${change.type}: ${change.agentId}`);
  },

  onAgentStateChange: (change) => {
    console.log(`Agent ${change.agentId}: ${change.previousState} → ${change.newState}`);
  },

  onLifecycleEvent: (event) => {
    console.log(`Event: ${event.agentId} ${event.eventType}`);
  },

  onPerformanceAlert: (alert) => {
    console.warn(`Performance alert: ${alert.agentId} ${alert.metric} = ${alert.value}`);
  },

  onMetricsUpdate: (metrics) => {
    console.log(`Total agents: ${metrics.totalAgents}, Efficiency: ${metrics.hierarchyAnalytics.efficiency}%`);
  },
};

await transparency.registerEventListener(listener);
```

### Integrating with Coordinators

```typescript
import { withTransparency } from './src/coordination/v2/transparency/index.js';
import { CoordinatorFactory } from './src/coordination/v2/coordinator-factory.js';

// Create base coordinator
const baseCoordinator = await CoordinatorFactory.create({
  mode: 'sdk',
  topology: 'hierarchical',
  maxAgents: 10,
});

// Wrap with transparency
const coordinator = withTransparency(baseCoordinator);

// Use normally - transparency is automatic
const agent = await coordinator.spawnAgent({
  agentId: 'coder-001',
  type: 'coder',
  priority: 8,
});

// Access transparency features
const hierarchy = await coordinator.getAgentHierarchy();
const metrics = await coordinator.getTransparencyMetrics();
```

## Data Models

### Agent Hierarchy Node

```typescript
interface AgentHierarchyNode {
  agentId: string;           // Unique identifier
  type: string;              // Agent type (coder, tester, etc.)
  level: number;             // Hierarchy level (1-4+)
  parentAgentId?: string;    // Parent agent ID
  childAgentIds: string[];   // Child agent IDs
  priority: number;          // Agent priority (1-10)
  state: AgentState;         // Current state
  sessionId: string;         // Session ID
  createdAt: Date;           // Creation timestamp
  lastStateChange: Date;     // Last state change
  tokensUsed: number;        // Total tokens consumed
  tokenBudget: number;       // Token budget
  isPaused: boolean;         // Pause status
  metrics: {                 // Performance metrics
    spawnTimeMs: number;
    totalExecutionTimeMs: number;
    pauseCount: number;
    resumeCount: number;
    checkpointCount: number;
  };
  currentTask?: string;      // Current task description
  waitingFor: string[];      // Dependencies waiting for
  completedDependencies: string[]; // Completed dependencies
}
```

### Agent Status

```typescript
interface AgentStatus {
  agentId: string;
  state: AgentState;
  isPaused: boolean;
  activity: string;          // Current activity description
  progress: number;          // Progress percentage (0-100)
  estimatedCompletion?: Date;
  tokensUsed: number;
  tokenUsageRate: number;    // Tokens per second
  memoryUsage: number;       // Memory usage in bytes
  cpuUsage: number;          // CPU usage percentage
  lastHeartbeat: Date;
  currentMessage?: {         // Currently processing message
    uuid: string;
    type: string;
    startedAt: Date;
    estimatedDuration?: number;
  };
  recentErrors: Array<{      // Recent error list
    timestamp: Date;
    error: string;
    severity: 'warning' | 'error' | 'critical';
  }>;
}
```

### Lifecycle Event

```typescript
interface AgentLifecycleEvent {
  eventId: string;
  timestamp: Date;
  agentId: string;
  eventType: 'spawned' | 'paused' | 'resumed' | 'terminated' |
             'checkpoint_created' | 'checkpoint_restored' |
             'state_changed' | 'task_assigned' | 'task_completed' |
             'error_occurred';
  eventData: {
    reason?: string;
    previousState?: AgentState;
    newState?: AgentState;
    checkpointId?: string;
    taskDescription?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  };
  level: number;             // Hierarchy level at event time
  parentAgentId?: string;    // Parent agent at event time
  sessionId: string;
  tokensUsed: number;        // Token usage at event time
  performanceImpact: {
    duration?: number;       // Event duration in ms
    memoryDelta?: number;    // Memory change in bytes
    tokenCost?: number;      // Token cost
  };
}
```

## Performance Metrics

### Transparency Metrics

```typescript
interface TransparencyMetrics {
  totalAgents: number;                           // Total agents
  agentsByLevel: Record<number, number>;         // Agents per level
  agentsByState: Record<AgentState, number>;     // Agents per state
  agentsByType: Record<string, number>;          // Agents per type
  totalTokensConsumed: number;                   // Total tokens used
  totalTokensSaved: number;                      // Tokens saved via pausing
  averageExecutionTimeMs: number;                // Average execution time
  failureRate: number;                           // Failure rate percentage
  averagePauseResumeLatencyMs: number;           // Average pause/resume latency
  hierarchyDepth: number;                        // Hierarchy depth
  dependencyResolutionRate: number;              // Dependency resolution rate
  eventStreamStats: {                             // Event statistics
    totalEvents: number;
    eventsPerSecond: number;
    eventTypes: Record<string, number>;
  };
}
```

### Hierarchy Analytics

```typescript
interface HierarchyAnalytics {
  depth: number;              // Maximum hierarchy depth
  branchingFactor: number;    // Average children per parent
  balance: number;            // Hierarchy balance (0-100)
  efficiency: number;         // System efficiency (0-100)
}
```

## Configuration

### Transparency System Configuration

```typescript
interface TransparencyConfig {
  enableRealTimeMonitoring: boolean;    // Enable real-time monitoring
  enableEventStreaming: boolean;        // Enable event streaming
  eventRetentionHours: number;          // Event retention period
  metricsUpdateIntervalMs: number;      // Metrics update interval
  heartbeatIntervalMs: number;          // Agent heartbeat interval
  enablePerformanceTracking: boolean;   // Enable performance tracking
  enableDependencyTracking: boolean;    // Enable dependency tracking
  maxEventsInMemory: number;            // Maximum events in memory
  enableHierarchyNotifications: boolean; // Enable hierarchy change notifications
}
```

### Default Configuration

```typescript
const defaultConfig: TransparencyConfig = {
  enableRealTimeMonitoring: true,
  enableEventStreaming: true,
  eventRetentionHours: 24,
  metricsUpdateIntervalMs: 5000,        // 5 seconds
  heartbeatIntervalMs: 10000,           // 10 seconds
  enablePerformanceTracking: true,
  enableDependencyTracking: true,
  maxEventsInMemory: 10000,
  enableHierarchyNotifications: true,
};
```

## Performance Thresholds

The system monitors these performance thresholds and generates alerts:

| Metric | Threshold | Alert Level |
|--------|-----------|-------------|
| Token Usage Rate | >100 tokens/sec | Warning (→ Critical at 150) |
| Memory Usage | >512MB | Critical |
| CPU Usage | >80% | Warning (→ Critical at 95%) |
| Execution Time | >5 minutes | Warning |
| Pause/Resume Latency | >50ms | Warning |

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check event retention settings
   - Monitor agent lifecycle event volume
   - Consider reducing `maxEventsInMemory`

2. **Missing Agent Data**
   - Verify agents are registered with transparency system
   - Check agent heartbeat intervals
   - Ensure transparency system is initialized

3. **Performance Alerts**
   - Review agent token usage patterns
   - Check for infinite loops or stuck agents
   - Consider adjusting performance thresholds

4. **Hierarchy Inconsistencies**
   - Verify parent-child relationships during agent spawning
   - Check for orphaned agents
   - Review agent termination cleanup

### Debug Mode

Enable verbose logging for debugging:

```bash
npx claude-flow-novice transparency --verbose --watch
```

Or in code:

```typescript
await transparency.initialize({
  ...config,
  enablePerformanceTracking: true,
  metricsUpdateIntervalMs: 1000,  // Faster updates for debugging
});
```

## Integration with Existing Systems

### Adding Transparency to Existing Coordinators

```typescript
// Wrap any ICoordinator implementation
const enhancedCoordinator = withTransparency(existingCoordinator);

// All existing functionality preserved
const agent = await enhancedCoordinator.spawnAgent(config);

// New transparency features available
const hierarchy = await enhancedCoordinator.getAgentHierarchy();
```

### Custom Event Listeners

```typescript
// Create custom monitoring dashboard
await transparency.registerEventListener({
  onAgentStateChange: async (change) => {
    // Update custom dashboard
    await updateDashboard(change.agentId, change.newState);

    // Send notifications for critical states
    if (change.newState === 'error') {
      await sendAlert(`Agent ${change.agentId} entered error state`);
    }
  },

  onPerformanceAlert: async (alert) => {
    // Log to external monitoring system
    await logToMonitoring({
      agentId: alert.agentId,
      metric: alert.metric,
      value: alert.value,
      severity: alert.severity,
    });
  },
});
```

## Best Practices

### Performance Optimization

1. **Event Retention**: Set appropriate `eventRetentionHours` to manage memory
2. **Update Intervals**: Adjust `metricsUpdateIntervalMs` based on needs
3. **Filtering**: Use CLI filters to reduce data volume
4. **Selective Monitoring**: Enable performance tracking only when needed

### Monitoring Strategy

1. **Regular Checks**: Use watch mode for ongoing monitoring
2. **Performance Baselines**: Establish normal performance metrics
3. **Alert Thresholds**: Customize thresholds for your environment
4. **Historical Analysis**: Export JSON data for long-term analysis

### Development Workflow

1. **Development**: Use verbose mode and short intervals
2. **Testing**: Validate transparency features with test agents
3. **Staging**: Monitor performance impact before production
4. **Production**: Use optimized intervals and selective monitoring

## Example Workflows

### Development Monitoring

```bash
# Start development session with transparency
npx claude-flow-novice transparency --watch --interval 2 --verbose

# In another terminal, run your agent system
npx claude-flow-novice swarm --topology hierarchical --agents 5
```

### Performance Analysis

```bash
# Export performance data
npx claude-flow-novice transparency --json --performance > metrics.json

# Analyze specific agent
npx claude-flow-novice transparency agent worker-coder-001 --performance --events 20
```

### Production Monitoring

```bash
# Production dashboard
npx claude-flow-novice transparency --watch --interval 30

# Check for issues
npx claude-flow-novice transparency status --state error
npx claude-flow-novice transparency events --type error_occurred --number 10
```

This transparency system provides comprehensive visibility into your V2 coordination system, enabling effective monitoring, debugging, and optimization of multi-level agent operations.