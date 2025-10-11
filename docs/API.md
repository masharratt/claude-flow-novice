# API Reference

**Complete API documentation for Claude Flow Novice**

This document provides comprehensive API documentation for integrating with Claude Flow Novice, including programmatic interfaces, configuration options, and extensibility points.

---

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Core API](#core-api)
- [Agent API](#agent-api)
- [Swarm API](#swarm-api)
- [Configuration API](#configuration-api)
- [Monitoring API](#monitoring-api)
- [Events API](#events-api)
- [CLI API](#cli-api)
- [Examples](#examples)

---

## 🚀 Getting Started

### Installation
```bash
npm install claude-flow-novice
```

### Basic Usage
```javascript
import { ClaudeFlowNovice } from 'claude-flow-novice';

// Initialize client
const client = new ClaudeFlowNovice({
  redisUrl: 'redis://localhost:6379',
  maxAgents: 10
});

// Start a swarm
const swarm = await client.createSwarm({
  objective: 'Build a REST API',
  agents: ['backend-dev', 'tester']
});
```

### TypeScript Support
```typescript
import {
  ClaudeFlowNovice,
  SwarmConfig,
  AgentType,
  SwarmStatus
} from 'claude-flow-novice';

const config: SwarmConfig = {
  objective: 'Create user authentication',
  agents: [AgentType.BACKEND_DEV, AgentType.TESTER],
  strategy: 'development'
};
```

---

## 🔧 Core API

### ClaudeFlowNovice Class

#### Constructor
```typescript
new ClaudeFlowNovice(options: ClaudeFlowOptions)
```

**Parameters:**
- `options` (ClaudeFlowOptions): Configuration options

**ClaudeFlowOptions:**
```typescript
interface ClaudeFlowOptions {
  redisUrl?: string;           // Redis connection URL
  maxAgents?: number;          // Maximum number of agents
  strategy?: SwarmStrategy;    // Swarm strategy
  mode?: SwarmMode;           // Swarm topology mode
  persistence?: boolean;      // Enable persistence
  logging?: LoggingConfig;    // Logging configuration
  timeout?: number;           // Operation timeout in ms
}
```

**Example:**
```javascript
const client = new ClaudeFlowNovice({
  redisUrl: 'redis://localhost:6379',
  maxAgents: 15,
  strategy: 'development',
  mode: 'mesh',
  persistence: true,
  logging: {
    level: 'info',
    format: 'json'
  },
  timeout: 30000
});
```

#### Methods

##### createSwarm()
```typescript
async createSwarm(config: SwarmConfig): Promise<Swarm>
```

Creates a new swarm with the specified configuration.

**Parameters:**
- `config` (SwarmConfig): Swarm configuration

**Returns:**
- `Promise<Swarm>`: Created swarm instance

**Example:**
```javascript
const swarm = await client.createSwarm({
  objective: 'Build a task management API',
  agents: ['backend-dev', 'frontend-dev', 'tester'],
  strategy: 'development',
  mode: 'mesh',
  timeout: 600000
});
```

##### getSwarm()
```typescript
async getSwarm(swarmId: string): Promise<Swarm | null>
```

Retrieves an existing swarm by ID.

**Parameters:**
- `swarmId` (string): Swarm identifier

**Returns:**
- `Promise<Swarm | null>`: Swarm instance or null if not found

##### listSwarms()
```typescript
async listSwarms(filter?: SwarmFilter): Promise<Swarm[]>
```

Lists all swarms, optionally filtered.

**Parameters:**
- `filter` (SwarmFilter, optional): Filter criteria

**Returns:**
- `Promise<Swarm[]>`: Array of swarms

##### getStatus()
```typescript
async getStatus(): Promise<SystemStatus>
```

Gets the current system status.

**Returns:**
- `Promise<SystemStatus>`: System status information

##### shutdown()
```typescript
async shutdown(): Promise<void>
```

Gracefully shuts down the client and all active swarms.

---

## 🤖 Agent API

### Agent Types

```typescript
enum AgentType {
  BACKEND_DEV = 'backend-dev',
  FRONTEND_DEV = 'frontend-dev',
  FULLSTACK_DEV = 'fullstack-dev',
  TESTER = 'tester',
  RESEARCHER = 'researcher',
  ARCHITECT = 'architect',
  SECURITY_SPECIALIST = 'security-specialist',
  PERFORMANCE_ANALYST = 'performance-analyst',
  UI_DESIGNER = 'ui-designer',
  API_DEVELOPER = 'api-developer',
  DATABASE_ARCHITECT = 'database-architect',
  DEVOPS_ENGINEER = 'devops-engineer'
}
```

### Agent Configuration

```typescript
interface AgentConfig {
  type: AgentType;              // Agent type
  enabled?: boolean;           // Whether agent is enabled
  maxInstances?: number;       // Maximum concurrent instances
  capabilities?: string[];     // Agent capabilities
  resources?: ResourceConfig;  // Resource allocation
  timeout?: number;           // Operation timeout
  retryConfig?: RetryConfig;  // Retry configuration
}
```

### Agent Management

#### createAgent()
```typescript
async createAgent(config: AgentConfig): Promise<Agent>
```

Creates a new agent instance.

**Example:**
```javascript
const agent = await client.createAgent({
  type: AgentType.BACKEND_DEV,
  maxInstances: 3,
  capabilities: ['api', 'database', 'authentication'],
  resources: {
    memory: '512MB',
    cpu: '0.5'
  }
});
```

#### getAgent()
```typescript
async getAgent(agentId: string): Promise<Agent | null>
```

Retrieves an agent by ID.

#### listAgents()
```typescript
async listAgents(type?: AgentType): Promise<Agent[]>
```

Lists agents, optionally filtered by type.

---

## 🐝 Swarm API

### Swarm Configuration

```typescript
interface SwarmConfig {
  objective: string;            // Swarm objective
  agents: AgentType[];         // Agent types to spawn
  strategy?: SwarmStrategy;    // Swarm strategy
  mode?: SwarmMode;           // Topology mode
  topology?: TopologyConfig;   // Topology configuration
  coordination?: CoordinationConfig; // Coordination settings
  persistence?: PersistenceConfig;   // Persistence settings
  timeout?: number;           // Overall timeout
  maxCost?: number;           // Maximum cost limit
}
```

### Swarm Operations

#### execute()
```typescript
async execute(task: Task): Promise<TaskResult>
```

Executes a task within the swarm.

**Parameters:**
- `task` (Task): Task to execute

**Returns:**
- `Promise<TaskResult>`: Task execution result

**Example:**
```javascript
const result = await swarm.execute({
  id: 'task-001',
  description: 'Implement user authentication',
  requirements: ['JWT', 'bcrypt', 'express'],
  priority: 'high'
});
```

#### getStatus()
```typescript
async getStatus(): Promise<SwarmStatus>
```

Gets the current status of the swarm.

#### pause()
```typescript
async pause(): Promise<void>
```

Pauses swarm execution.

#### resume()
```typescript
async resume(): Promise<void>
```

Resumes swarm execution.

#### terminate()
```typescript
async terminate(): Promise<void>
```

Terminates the swarm and cleans up resources.

### Swarm Events

```typescript
swarm.on('statusChange', (status: SwarmStatus) => {
  console.log('Swarm status changed:', status);
});

swarm.on('taskComplete', (result: TaskResult) => {
  console.log('Task completed:', result);
});

swarm.on('error', (error: Error) => {
  console.error('Swarm error:', error);
});
```

---

## ⚙️ Configuration API

### Configuration Management

#### getConfig()
```typescript
async getConfig(): Promise<Configuration>
```

Gets the current configuration.

#### updateConfig()
```typescript
async updateConfig(config: Partial<Configuration>): Promise<void>
```

Updates the configuration.

#### resetConfig()
```typescript
async resetConfig(): Promise<void>
```

Resets configuration to defaults.

### Configuration Schema

```typescript
interface Configuration {
  version: string;
  settings: {
    maxAgents: number;
    strategy: SwarmStrategy;
    mode: SwarmMode;
    persistence: boolean;
    logging: LoggingConfig;
    performance: PerformanceConfig;
    security: SecurityConfig;
  };
  agents: Record<string, AgentConfig>;
  templates: Record<string, TemplateConfig>;
}
```

### Environment Configuration

```typescript
interface EnvironmentConfig {
  redisUrl: string;
  logLevel: string;
  nodeEnv: string;
  apiKey?: string;
  maxMemory?: string;
  timeout?: number;
}
```

---

## 📊 Monitoring API

### Metrics

#### getMetrics()
```typescript
async getMetrics(timeframe?: Timeframe): Promise<Metrics>
```

Gets system metrics.

**Parameters:**
- `timeframe` (Timeframe, optional): Time range for metrics

**Returns:**
- `Promise<Metrics>`: System metrics

#### Metrics Schema

```typescript
interface Metrics {
  timestamp: number;
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  performance: {
    averageResponseTime: number;
    throughput: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
  };
}
```

### Health Checks

#### healthCheck()
```typescript
async healthCheck(): Promise<HealthStatus>
```

Performs a comprehensive health check.

**HealthStatus:**
```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    redis: HealthCheck;
    agents: HealthCheck;
    memory: HealthCheck;
    performance: HealthCheck;
  };
  timestamp: number;
}
```

### Performance Monitoring

#### getPerformanceReport()
```typescript
async getPerformanceReport(options?: PerformanceReportOptions): Promise<PerformanceReport>
```

Generates a detailed performance report.

---

## 📡 Events API

### Event System

#### subscribe()
```typescript
async subscribe(pattern: string, handler: EventHandler): Promise<Subscription>
```

Subscribes to events matching a pattern.

**Parameters:**
- `pattern` (string): Event pattern
- `handler` (EventHandler): Event handler function

**Returns:**
- `Promise<Subscription>`: Subscription handle

#### unsubscribe()
```typescript
async unsubscribe(subscription: Subscription): Promise<void>
```

Unsubscribes from events.

#### emit()
```typescript
async emit(event: Event): Promise<void>
```

Emits an event.

### Event Types

```typescript
interface Event {
  type: string;
  data: any;
  timestamp: number;
  source: string;
  metadata?: Record<string, any>;
}
```

#### Built-in Events

- `swarm.created`: Swarm created
- `swarm.started`: Swarm started
- `swarm.completed`: Swarm completed
- `swarm.failed`: Swarm failed
- `agent.spawned`: Agent spawned
- `agent.completed`: Agent completed task
- `agent.failed`: Agent failed
- `task.created`: Task created
- `task.completed`: Task completed
- `task.failed`: Task failed

### Event Examples

```typescript
// Subscribe to swarm events
client.subscribe('swarm.*', (event) => {
  console.log('Swarm event:', event.type, event.data);
});

// Subscribe to agent failures
client.subscribe('agent.failed', (event) => {
  console.error('Agent failed:', event.data);
  // Implement recovery logic
});

// Subscribe to task completion
client.subscribe('task.completed', (event) => {
  console.log('Task completed:', event.data.result);
});
```

---

## 💻 CLI API

### Programmatic CLI Access

#### runCommand()
```typescript
async runCommand(command: string, args?: string[]): Promise<CommandResult>
```

Runs a CLI command programmatically.

**Parameters:**
- `command` (string): Command to run
- `args` (string[], optional): Command arguments

**Returns:**
- `Promise<CommandResult>`: Command execution result

**Example:**
```javascript
const result = await client.runCommand('swarm', [
  'Build a REST API',
  '--agents', 'backend-dev,tester',
  '--timeout', '300000'
]);
```

#### CommandResult Schema

```typescript
interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}
```

### Available Commands

- `init`: Initialize new project
- `start`: Start development server
- `swarm`: Execute swarm
- `status`: Check system status
- `monitor`: Start monitoring dashboard
- `config`: Configuration management
- `agent`: Agent management
- `logs`: View logs

---

## 📚 Examples

### Basic Example

```javascript
import { ClaudeFlowNovice, AgentType } from 'claude-flow-novice';

async function basicExample() {
  // Initialize client
  const client = new ClaudeFlowNovice({
    redisUrl: 'redis://localhost:6379',
    maxAgents: 5
  });

  try {
    // Create swarm
    const swarm = await client.createSwarm({
      objective: 'Create a simple REST API',
      agents: [AgentType.BACKEND_DEV, AgentType.TESTER],
      strategy: 'development'
    });

    // Execute task
    const result = await swarm.execute({
      id: 'api-001',
      description: 'Implement user endpoints',
      requirements: ['Express.js', 'MongoDB', 'JWT']
    });

    console.log('Task result:', result);

    // Get status
    const status = await swarm.getStatus();
    console.log('Swarm status:', status);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    await client.shutdown();
  }
}

basicExample();
```

### Advanced Example

```javascript
import { ClaudeFlowNovice, AgentType } from 'claude-flow-novice';

async function advancedExample() {
  const client = new ClaudeFlowNovice({
    redisUrl: 'redis://localhost:6379',
    maxAgents: 10,
    logging: {
      level: 'debug',
      format: 'json'
    }
  });

  // Configure agents
  await client.updateConfig({
    agents: {
      'backend-dev': {
        maxInstances: 3,
        capabilities: ['api', 'database', 'auth'],
        resources: {
          memory: '1GB',
          cpu: '1.0'
        }
      },
      'frontend-dev': {
        maxInstances: 2,
        capabilities: ['react', 'typescript', 'styling'],
        resources: {
          memory: '512MB',
          cpu: '0.5'
        }
      }
    }
  });

  // Subscribe to events
  client.subscribe('swarm.*', (event) => {
    console.log('Swarm event:', event.type, event.data);
  });

  // Create complex swarm
  const swarm = await client.createSwarm({
    objective: 'Build a full-stack application',
    agents: [
      AgentType.BACKEND_DEV,
      AgentType.FRONTEND_DEV,
      AgentType.TESTER,
      AgentType.ARCHITECT
    ],
    strategy: 'development',
    mode: 'hierarchical',
    topology: {
      coordinator: AgentType.ARCHITECT,
      layers: [
        [AgentType.BACKEND_DEV, AgentType.FRONTEND_DEV],
        [AgentType.TESTER]
      ]
    },
    timeout: 600000
  });

  // Monitor progress
  const monitor = setInterval(async () => {
    const metrics = await client.getMetrics();
    const status = await swarm.getStatus();

    console.log('Metrics:', metrics);
    console.log('Status:', status);

    if (status.state === 'completed' || status.state === 'failed') {
      clearInterval(monitor);
    }
  }, 5000);

  // Execute multiple tasks
  const tasks = [
    {
      id: 'setup-001',
      description: 'Set up project structure',
      priority: 'high'
    },
    {
      id: 'backend-001',
      description: 'Implement backend API',
      priority: 'high'
    },
    {
      id: 'frontend-001',
      description: 'Create React frontend',
      priority: 'medium'
    },
    {
      id: 'test-001',
      description: 'Write comprehensive tests',
      priority: 'medium'
    }
  ];

  const results = await Promise.all(
    tasks.map(task => swarm.execute(task))
  );

  console.log('All tasks completed:', results);

  // Generate performance report
  const report = await client.getPerformanceReport({
    includeAgents: true,
    includeTasks: true,
    timeframe: '1h'
  });

  console.log('Performance report:', report);

  // Cleanup
  clearInterval(monitor);
  await client.shutdown();
}

advancedExample();
```

### Error Handling Example

```javascript
import { ClaudeFlowNovice, AgentError, SwarmError } from 'claude-flow-novice';

async function errorHandlingExample() {
  const client = new ClaudeFlowNovice({
    redisUrl: 'redis://localhost:6379',
    maxAgents: 3,
    timeout: 30000
  });

  try {
    const swarm = await client.createSwarm({
      objective: 'Build a complex system',
      agents: ['backend-dev', 'frontend-dev'],
      strategy: 'development'
    });

    // Set up error handling
    swarm.on('error', async (error) => {
      if (error instanceof AgentError) {
        console.error('Agent error:', error.agentId, error.message);

        // Retry with different agent
        if (error.retryable) {
          console.log('Retrying with different configuration...');
          // Implement retry logic
        }
      } else if (error instanceof SwarmError) {
        console.error('Swarm error:', error.swarmId, error.message);

        // Handle swarm-level errors
        if (error.recoverable) {
          console.log('Attempting recovery...');
          // Implement recovery logic
        }
      }
    });

    // Execute with timeout
    const result = await Promise.race([
      swarm.execute({
        id: 'task-001',
        description: 'Complex task',
        requirements: ['complex', 'challenging']
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 60000)
      )
    ]);

    console.log('Task completed:', result);

  } catch (error) {
    console.error('Error in swarm execution:', error);

    // Get system status for debugging
    const status = await client.getStatus();
    console.log('System status:', status);

  } finally {
    await client.shutdown();
  }
}

errorHandlingExample();
```

---

## 🔧 Extending the API

### Custom Agents

```typescript
import { Agent, AgentConfig } from 'claude-flow-novice';

class CustomAgent extends Agent {
  constructor(config: AgentConfig) {
    super(config);
  }

  async execute(task: Task): Promise<TaskResult> {
    // Custom implementation
    return {
      taskId: task.id,
      success: true,
      output: 'Custom result',
      metadata: {}
    };
  }
}

// Register custom agent
client.registerAgent('custom-agent', CustomAgent);
```

### Custom Strategies

```typescript
import { SwarmStrategy, StrategyContext } from 'claude-flow-novice';

class CustomStrategy implements SwarmStrategy {
  async execute(context: StrategyContext): Promise<void> {
    // Custom strategy implementation
  }
}

// Use custom strategy
const swarm = await client.createSwarm({
  objective: 'Custom task',
  agents: ['backend-dev'],
  strategy: new CustomStrategy()
});
```

---

## 📖 Additional Resources

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [Examples](./EXAMPLES.md) - More use cases and examples
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [Contributing](./CONTRIBUTING.md) - Development and contribution guidelines

---

## 🤝 Support

- **Documentation**: [Full docs](https://github.com/masharratt/claude-flow-novice/wiki)
- **Issues**: [Report bugs](https://github.com/masharratt/claude-flow-novice/issues)
- **Discussions**: [Ask questions](https://github.com/masharratt/claude-flow-novice/discussions)

---

**API Version**: 1.0.0
**Last Updated**: 2025-01-09