# Enhanced Redis Messaging Infrastructure

A comprehensive messaging and progress tracking infrastructure for agent coordination with granular progress updates and real-time visibility.

## Overview

This module provides:

- **Granular Progress Tracking**: Detailed step-by-step progress monitoring with confidence scoring
- **Real-time Redis Messaging**: Secure pub/sub communication with HMAC authentication
- **Agent Visibility**: Comprehensive status tracking and performance metrics
- **Swarm Coordination**: Multi-agent coordination with handoffs and blocking
- **Performance Analytics**: Detailed metrics and bottleneck identification

## Core Components

### EnhancedProgressTracker

Tracks detailed progress for individual tasks with granular steps and sub-steps.

```typescript
import { EnhancedProgressTracker } from './enhanced-progress-tracker.js';

const tracker = new EnhancedProgressTracker();
await tracker.initialize();

// Create task with steps
await tracker.createTaskProgress(
  'task-1',
  'agent-1',
  'swarm-1',
  'coding',
  'Implement authentication module',
  [
    { name: 'Setup', description: 'Initialize project structure' },
    { name: 'Auth Logic', description: 'Implement authentication logic' },
    { name: 'Tests', description: 'Write unit tests' }
  ]
);

// Update progress
await tracker.updateTaskProgress('task-1', {
  stepId: 'step-1',
  status: 'in_progress',
  progressPercentage: 25,
  confidence: 0.8
});

// Add sub-steps
await tracker.addSubSteps('task-1', 'step-2', [
  { name: 'JWT Setup', description: 'Configure JWT tokens' },
  { name: 'Middleware', description: 'Create auth middleware' }
]);

// Complete task
await tracker.completeTask('task-1', ['auth.js', 'auth.test.js']);
```

### RedisMessagingInfrastructure

Provides secure, real-time messaging between agents with coordination capabilities.

```typescript
import { RedisMessagingInfrastructure } from './redis-messaging-infrastructure.js';

const messaging = new RedisMessagingInfrastructure(
  'agent-1',           // Current agent ID
  'swarm-1',           // Swarm ID
  {                    // Configuration
    redisUrl: 'redis://localhost:6379',
    hmacSecret: 'your-secret-key',
    heartbeatInterval: 30000
  }
);

await messaging.initialize();

// Send task assignment
await messaging.sendTaskAssignment(
  'agent-2',
  'task-1',
  'coding',
  'Implement user authentication',
  ['typescript', 'express'],
  ['database-setup'],
  Date.now() + 3600000 // 1 hour deadline
);

// Send coordination request
await messaging.sendCoordinationRequest(
  'agent-3',
  'handoff',
  'task-1',
  'Ready for code review'
);

// Subscribe to messages
await messaging.subscribe(
  { 
    fromAgents: ['agent-2', 'agent-3'],
    messageTypes: ['coordination_response', 'task_progress']
  },
  (message) => {
    console.log('Received message:', message);
  }
);

// Broadcast status
await messaging.broadcastStatus('active', {
  currentTask: 'task-1',
  progress: 75
});
```

## Key Features

### 1. Granular Progress Tracking

- **Step-by-step progress**: Break tasks into detailed steps
- **Sub-steps**: Create hierarchical task structures
- **Confidence scoring**: Track confidence levels for each step
- **Real-time updates**: Live progress updates via Redis pub/sub
- **Error handling**: Comprehensive error tracking and recovery

### 2. Agent Visibility

- **Status tracking**: Real-time agent status monitoring
- **Performance metrics**: Task completion rates, average duration, success rates
- **Activity history**: Recent activity logs with timestamps
- **Capability tracking**: Agent skills and availability
- **Load monitoring**: Current workload and capacity

### 3. Swarm Coordination

- **Task assignments**: Secure task distribution with requirements
- **Coordination requests**: Handoffs, approvals, blocking/unblocking
- **Swarm overview**: Overall progress and health metrics
- **Bottleneck detection**: Identify blocking issues and performance problems
- **Health scoring**: Calculate swarm health based on multiple factors

### 4. Security & Authentication

- **HMAC signatures**: All messages cryptographically signed
- **Rate limiting**: Prevent message flooding attacks
- **Size validation**: Prevent oversized messages
- **Expiration handling**: Automatic cleanup of expired messages

### 5. Performance Monitoring

- **Message history**: Track all communications with filtering
- **Analytics**: Detailed performance metrics and trends
- **Resource monitoring**: Memory, CPU, and network usage tracking
- **Bottleneck identification**: Automatic detection of performance issues

## Redis Channels

The infrastructure uses the following Redis channels:

- `progress:updates` - Real-time progress updates
- `agent:visibility` - Agent status and visibility updates
- `swarm:overview` - Swarm-wide progress summaries
- `agent:{agentId}:messages` - Agent-specific direct messages
- `swarm:{swarmId}:broadcast` - Swarm-wide broadcasts
- `swarm:{swarmId}:coordination` - Coordination messages
- `swarm:{swarmId}:heartbeat` - Agent health monitoring

## Data Storage

### Task Progress Structure

```typescript
interface TaskProgress {
  taskId: string;
  agentId: string;
  swarmId: string;
  taskType: string;
  taskDescription: string;
  overallStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  progressPercentage: number;
  currentStep?: string;
  steps: ProgressStep[];
  startTime: number;
  endTime?: number;
  estimatedCompletion?: number;
  confidence: number;
  metadata: {
    filesProcessed?: string[];
    deliverables?: string[];
    dependencies?: string[];
    blockers?: string[];
    resources?: ResourceUsage;
  };
  reasoning?: {
    currentThought?: string;
    strategy?: string;
    alternatives?: string[];
    risks?: string[];
  };
}
```

### Agent Visibility Structure

```typescript
interface AgentVisibility {
  agentId: string;
  agentType: string;
  status: 'idle' | 'active' | 'working' | 'blocked' | 'completed' | 'error';
  currentTask?: TaskProgress;
  recentActivity: ActivityEntry[];
  performance: {
    tasksCompleted: number;
    averageTaskDuration: number;
    successRate: number;
    currentStreak: number;
  };
  capabilities: string[];
  availability: {
    nextAvailable?: number;
    currentLoad: number;
    maxConcurrentTasks: number;
  };
}
```

## Usage Examples

### Basic Task Tracking

```typescript
// Initialize progress tracker
const tracker = createEnhancedProgressTracker();
await tracker.initialize();

// Create and track a task
await tracker.createTaskProgress(
  'implement-auth',
  'coder-agent-1',
  'swarm-123',
  'coding',
  'Implement JWT authentication',
  [
    { name: 'setup', description: 'Setup project structure' },
    { name: 'jwt-config', description: 'Configure JWT' },
    { name: 'middleware', description: 'Create auth middleware' },
    { name: 'routes', description: 'Add auth routes' },
    { name: 'tests', description: 'Write tests' }
  ]
);

// Update progress as work completes
await tracker.updateTaskProgress('implement-auth', {
  stepId: 'step-1',
  status: 'completed',
  progressPercentage: 20
});

await tracker.updateTaskProgress('implement-auth', {
  stepId: 'step-2',
  status: 'in_progress',
  progressPercentage: 35,
  confidence: 0.85,
  reasoning: {
    currentThought: 'Configuring JWT with proper security settings',
    strategy: 'Using RS256 for better security',
    risks: ['Key management complexity']
  }
});
```

### Agent Coordination

```typescript
// Initialize messaging
const messaging = createRedisMessagingInfrastructure(
  'coder-agent-1',
  'swarm-123'
);
await messaging.initialize();

// Subscribe to coordination messages
await messaging.subscribe(
  { messageTypes: ['coordination_request', 'coordination_response'] },
  async (message) => {
    if (message.type === 'coordination_request') {
      const { action, targetTask, reason } = message.payload;
      
      if (action === 'handoff' && targetTask === 'implement-auth') {
        // Accept handoff
        await messaging.sendCoordinationResponse(
          message.from,
          'approve',
          message.id,
          'Ready to take over authentication implementation'
        );
      }
    }
  }
);

// Update agent status
await messaging.broadcastStatus('working', {
  currentTask: 'implement-auth',
  progress: 35,
  estimatedCompletion: Date.now() + 7200000 // 2 hours
});
```

### Swarm Monitoring

```typescript
// Get swarm overview
const overview = await messaging.getSwarmOverview();
console.log(`Swarm health: ${overview.healthScore}%`);
console.log(`Active agents: ${overview.activeAgents}/${overview.totalAgents}`);
console.log(`Overall progress: ${overview.overallProgress}%`);

// Get specific agent visibility
const agentVisibility = await messaging.getAgentVisibility('coder-agent-1');
console.log(`Agent status: ${agentVisibility.status}`);
console.log(`Success rate: ${agentVisibility.performance.successRate * 100}%`);
console.log(`Current load: ${agentVisibility.availability.currentLoad}`);

// Get message history
const history = await messaging.getMessageHistory({
  timeRange: {
    start: Date.now() - 3600000, // Last hour
    end: Date.now()
  },
  messageTypes: ['task_assignment', 'coordination_request']
});

console.log(`Messages in last hour: ${history.length}`);
```

## Configuration

### Environment Variables

- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)
- `HMAC_SECRET` - Secret key for message authentication (default: `default-secret`)
- `CLAUDE_FLOW_ENV` - Environment mode (`development` | `production` | `test`)

### Configuration Options

```typescript
interface MessagingConfig {
  redisUrl?: string;           // Redis connection URL
  hmacSecret?: string;         // HMAC secret for authentication
  messageRetention?: number;   // Message retention time in ms (default: 1 hour)
  heartbeatInterval?: number;  // Heartbeat interval in ms (default: 30 seconds)
  maxMessageSize?: number;     // Maximum message size in bytes (default: 1MB)
  rateLimitPerSecond?: number; // Rate limit per second (default: 100)
  enableEncryption?: boolean;  // Enable message encryption (default: false)
}
```

## Testing

Run the test suite:

```bash
npm test src/messaging/__tests__/
```

The test suite includes:
- Unit tests for progress tracking
- Integration tests for messaging infrastructure
- Error handling and edge cases
- Security validation tests

## Best Practices

1. **Use descriptive step names** for better progress visibility
2. **Update confidence scores** regularly to reflect uncertainty
3. **Handle errors gracefully** and provide detailed error information
4. **Use appropriate message priorities** for urgent coordination
5. **Monitor swarm health** and address bottlenecks proactively
6. **Clean up resources** properly when shutting down agents

## Performance Considerations

- **Redis Connection Pooling**: Use connection pooling for high-throughput scenarios
- **Message Batching**: Batch progress updates for better performance
- **TTL Management**: Set appropriate TTL values for stored data
- **Rate Limiting**: Configure rate limits based on your infrastructure capacity
- **Memory Usage**: Monitor Redis memory usage with large swarms