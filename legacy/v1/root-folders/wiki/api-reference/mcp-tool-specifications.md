# MCP Tool Specifications

## Overview

This document provides complete specifications for all Model Context Protocol (MCP) tools available in Claude Flow. MCP tools enable seamless integration between Claude Code and Claude Flow's coordination system.

## Table of Contents

- [Core Swarm Tools](#core-swarm-tools)
- [Agent Management Tools](#agent-management-tools)
- [Task Orchestration Tools](#task-orchestration-tools)
- [Memory & Storage Tools](#memory--storage-tools)
- [Neural Network Tools](#neural-network-tools)
- [GitHub Integration Tools](#github-integration-tools)
- [Performance & Monitoring Tools](#performance--monitoring-tools)
- [Advanced Coordination Tools](#advanced-coordination-tools)
- [Usage Patterns](#usage-patterns)

## Core Swarm Tools

### `mcp__claude-flow__swarm_init`

Initialize a swarm with specified topology and configuration.

**Function Signature:**
```typescript
function swarm_init(params: {
  topology: 'hierarchical' | 'mesh' | 'ring' | 'star';
  maxAgents?: number;
  strategy?: string;
}): Promise<SwarmInitResult>;
```

**Parameters:**
- `topology` (required): Swarm coordination topology
  - `hierarchical`: Tree structure with coordinator
  - `mesh`: Full interconnection between agents
  - `ring`: Circular topology for sequential processing
  - `star`: Central hub with spoke agents
- `maxAgents` (optional, default: 8): Maximum number of agents
- `strategy` (optional, default: "auto"): Distribution strategy

**Return Type:**
```typescript
interface SwarmInitResult {
  swarmId: string;
  topology: string;
  maxAgents: number;
  coordinatorId?: string;
  status: 'initialized' | 'error';
  message: string;
}
```

**Usage Example:**
```javascript
// Initialize hierarchical swarm for complex project
const swarm = await mcp__claude_flow__swarm_init({
  topology: 'hierarchical',
  maxAgents: 12,
  strategy: 'balanced'
});

console.log(`Swarm ${swarm.swarmId} initialized with ${swarm.topology} topology`);
```

**Error Codes:**
- `TOPOLOGY_INVALID`: Invalid topology specified
- `MAX_AGENTS_EXCEEDED`: Agent limit exceeded
- `RESOURCE_UNAVAILABLE`: Insufficient system resources

### `mcp__claude-flow__swarm_status`

Get current swarm status and health information.

**Function Signature:**
```typescript
function swarm_status(params: {
  swarmId?: string;
}): Promise<SwarmStatusResult>;
```

**Parameters:**
- `swarmId` (optional): Specific swarm ID, defaults to active swarm

**Return Type:**
```typescript
interface SwarmStatusResult {
  swarmId: string;
  status: 'active' | 'idle' | 'error' | 'terminated';
  topology: string;
  agentCount: number;
  activeAgents: number;
  coordination: {
    efficiency: number;
    communicationRate: number;
    taskDistribution: Record<string, number>;
  };
  performance: {
    throughput: number;
    latency: number;
    errorRate: number;
  };
  uptime: number;
}
```

## Agent Management Tools

### `mcp__claude-flow__agent_spawn`

Create and spawn specialized AI agents within the swarm.

**Function Signature:**
```typescript
function agent_spawn(params: {
  type: AgentType;
  name?: string;
  swarmId?: string;
  capabilities?: string[];
}): Promise<AgentSpawnResult>;
```

**Parameters:**
- `type` (required): Agent type from supported list
- `name` (optional): Custom agent name
- `swarmId` (optional): Target swarm ID
- `capabilities` (optional): Additional capabilities

**Supported Agent Types:**
```typescript
type AgentType =
  // Core development
  | 'coordinator' | 'analyst' | 'optimizer' | 'documenter' | 'monitor'
  | 'specialist' | 'architect' | 'task-orchestrator' | 'code-analyzer'
  | 'perf-analyzer' | 'api-docs' | 'performance-benchmarker'
  | 'system-architect' | 'researcher' | 'coder' | 'tester' | 'reviewer'

  // Full-stack development
  | 'backend-dev' | 'frontend-dev' | 'mobile-dev' | 'ml-developer'
  | 'cicd-engineer' | 'security-manager'

  // Specialized coordination
  | 'hierarchical-coordinator' | 'mesh-coordinator' | 'adaptive-coordinator'
  | 'collective-intelligence-coordinator' | 'swarm-memory-manager'

  // Consensus & distributed systems
  | 'byzantine-coordinator' | 'raft-manager' | 'gossip-coordinator'
  | 'consensus-builder' | 'crdt-synchronizer' | 'quorum-manager'

  // GitHub & repository management
  | 'github-modes' | 'pr-manager' | 'code-review-swarm' | 'issue-tracker'
  | 'release-manager' | 'workflow-automation' | 'project-board-sync'
  | 'repo-architect' | 'multi-repo-swarm';
```

**Return Type:**
```typescript
interface AgentSpawnResult {
  agentId: string;
  type: string;
  name: string;
  status: 'spawning' | 'ready' | 'error';
  capabilities: string[];
  swarmId: string;
  coordinates: {
    nodeId: string;
    position: [number, number];
  };
  message: string;
}
```

### `mcp__claude-flow__agent_list`

List all active agents in the swarm with filtering options.

**Function Signature:**
```typescript
function agent_list(params: {
  filter?: 'all' | 'active' | 'idle' | 'busy';
}): Promise<AgentListResult>;
```

**Return Type:**
```typescript
interface AgentListResult {
  agents: Array<{
    agentId: string;
    type: string;
    name: string;
    status: 'active' | 'idle' | 'busy' | 'error';
    currentTask?: string;
    performance: {
      tasksCompleted: number;
      averageExecutionTime: number;
      successRate: number;
    };
    coordinates: [number, number];
    lastActivity: string;
  }>;
  totalCount: number;
  swarmId: string;
}
```

### `mcp__claude-flow__agent_metrics`

Get detailed performance metrics for specific agents.

**Function Signature:**
```typescript
function agent_metrics(params: {
  agentId?: string;
  metric?: 'all' | 'cpu' | 'memory' | 'tasks' | 'performance';
}): Promise<AgentMetricsResult>;
```

**Return Type:**
```typescript
interface AgentMetricsResult {
  agentId: string;
  metrics: {
    cpu: {
      usage: number;
      peak: number;
      average: number;
    };
    memory: {
      used: number;
      allocated: number;
      peak: number;
    };
    tasks: {
      completed: number;
      failed: number;
      inProgress: number;
      averageTime: number;
    };
    performance: {
      throughput: number;
      latency: number;
      errorRate: number;
      efficiency: number;
    };
  };
  timeRange: {
    start: string;
    end: string;
    duration: number;
  };
}
```

## Task Orchestration Tools

### `mcp__claude-flow__task_orchestrate`

Orchestrate complex tasks across the swarm with intelligent distribution.

**Function Signature:**
```typescript
function task_orchestrate(params: {
  task: string;
  strategy?: 'parallel' | 'sequential' | 'adaptive' | 'balanced';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  maxAgents?: number;
  dependencies?: string[];
}): Promise<TaskOrchestrationResult>;
```

**Parameters:**
- `task` (required): Task description or instructions
- `strategy` (optional, default: 'adaptive'): Execution strategy
- `priority` (optional, default: 'medium'): Task priority level
- `maxAgents` (optional): Maximum agents to assign
- `dependencies` (optional): Task dependency IDs

**Return Type:**
```typescript
interface TaskOrchestrationResult {
  taskId: string;
  strategy: string;
  priority: string;
  assignedAgents: string[];
  estimatedDuration: number;
  stages: Array<{
    stageId: string;
    name: string;
    agentId: string;
    status: 'pending' | 'active' | 'completed' | 'failed';
    dependencies: string[];
    estimatedTime: number;
  }>;
  status: 'orchestrated' | 'error';
  message: string;
}
```

### `mcp__claude-flow__task_status`

Check progress of running tasks with detailed breakdown.

**Function Signature:**
```typescript
function task_status(params: {
  taskId?: string;
  detailed?: boolean;
}): Promise<TaskStatusResult>;
```

**Return Type:**
```typescript
interface TaskStatusResult {
  taskId: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  progress: {
    completion: number; // 0-100
    stages: Array<{
      stageId: string;
      name: string;
      status: string;
      progress: number;
      agentId: string;
      startTime?: string;
      endTime?: string;
    }>;
  };
  performance: {
    startTime: string;
    duration: number;
    estimatedRemaining?: number;
  };
  agents: Array<{
    agentId: string;
    contribution: number;
    status: string;
  }>;
}
```

### `mcp__claude-flow__task_results`

Retrieve results from completed tasks with comprehensive output.

**Function Signature:**
```typescript
function task_results(params: {
  taskId: string;
  format?: 'summary' | 'detailed' | 'raw';
}): Promise<TaskResultsData>;
```

**Return Type:**
```typescript
interface TaskResultsData {
  taskId: string;
  status: 'completed' | 'failed';
  results: {
    summary: string;
    artifacts: Array<{
      type: 'file' | 'data' | 'report' | 'metrics';
      name: string;
      content: string;
      metadata: Record<string, any>;
    }>;
    metrics: {
      executionTime: number;
      agentsUsed: number;
      resourcesConsumed: Record<string, number>;
      efficiency: number;
    };
  };
  errors?: Array<{
    agentId: string;
    error: string;
    stage: string;
    timestamp: string;
  }>;
}
```

## Memory & Storage Tools

### `mcp__claude-flow__memory_usage`

Store and retrieve persistent memory with TTL and namespacing.

**Function Signature:**
```typescript
function memory_usage(params: {
  action: 'store' | 'retrieve' | 'list' | 'delete' | 'search';
  key?: string;
  value?: string;
  namespace?: string;
  ttl?: number;
}): Promise<MemoryOperationResult>;
```

**Parameters:**
- `action` (required): Memory operation type
- `key` (optional): Memory key for store/retrieve/delete
- `value` (optional): Value to store (required for 'store')
- `namespace` (optional, default: 'default'): Memory namespace
- `ttl` (optional): Time-to-live in seconds

**Return Type:**
```typescript
interface MemoryOperationResult {
  action: string;
  success: boolean;
  key?: string;
  value?: any;
  namespace: string;
  metadata?: {
    createdAt: string;
    updatedAt: string;
    ttl?: number;
    size: number;
  };
  entries?: Array<{
    key: string;
    namespace: string;
    createdAt: string;
    size: number;
  }>; // For 'list' action
}
```

### `mcp__claude-flow__memory_search`

Search memory with pattern matching and filtering.

**Function Signature:**
```typescript
function memory_search(params: {
  pattern: string;
  namespace?: string;
  limit?: number;
}): Promise<MemorySearchResult>;
```

**Return Type:**
```typescript
interface MemorySearchResult {
  matches: Array<{
    key: string;
    value: any;
    namespace: string;
    score: number; // Relevance score 0-1
    metadata: {
      createdAt: string;
      size: number;
    };
  }>;
  totalMatches: number;
  searchTime: number;
}
```

## Neural Network Tools

### `mcp__claude-flow__neural_status`

Get neural agent status and performance metrics.

**Function Signature:**
```typescript
function neural_status(params: {
  agentId?: string;
}): Promise<NeuralStatusResult>;
```

**Return Type:**
```typescript
interface NeuralStatusResult {
  agents: Array<{
    agentId: string;
    neuralFeatures: {
      enabled: boolean;
      modelLoaded: boolean;
      trainingActive: boolean;
      pattern: string;
    };
    performance: {
      predictions: number;
      accuracy: number;
      trainingIterations: number;
      modelSize: number;
    };
    capabilities: string[];
  }>;
  systemStatus: {
    neuralEngineStatus: 'active' | 'inactive' | 'training';
    totalModels: number;
    memoryUsage: number;
  };
}
```

### `mcp__claude-flow__neural_train`

Train neural agents with sample tasks and data.

**Function Signature:**
```typescript
function neural_train(params: {
  agentId?: string;
  iterations?: number;
}): Promise<NeuralTrainingResult>;
```

**Parameters:**
- `agentId` (optional): Specific agent to train
- `iterations` (optional, default: 10): Training iterations (max: 100)

**Return Type:**
```typescript
interface NeuralTrainingResult {
  trainingId: string;
  agentId?: string;
  status: 'started' | 'completed' | 'failed';
  progress: {
    iteration: number;
    totalIterations: number;
    accuracy: number;
    loss: number;
  };
  duration: number;
  improvements: {
    accuracyGain: number;
    performanceGain: number;
    newPatterns: string[];
  };
}
```

### `mcp__claude-flow__neural_patterns`

Get and analyze cognitive patterns in the system.

**Function Signature:**
```typescript
function neural_patterns(params: {
  pattern?: 'all' | 'convergent' | 'divergent' | 'lateral' | 'systems' | 'critical' | 'abstract';
}): Promise<NeuralPatternsResult>;
```

**Return Type:**
```typescript
interface NeuralPatternsResult {
  patterns: Array<{
    type: string;
    name: string;
    description: string;
    strength: number;
    usage: number;
    effectiveness: number;
    examples: string[];
  }>;
  systemPatterns: {
    dominantPattern: string;
    adaptability: number;
    learningRate: number;
    patternDiversity: number;
  };
}
```

## GitHub Integration Tools

### `mcp__claude-flow__github_repo_analyze`

Analyze GitHub repositories for code quality and architecture.

**Function Signature:**
```typescript
function github_repo_analyze(params: {
  repo: string;
  analysis_type?: 'code_quality' | 'performance' | 'security';
}): Promise<GitHubAnalysisResult>;
```

**Parameters:**
- `repo` (required): Repository in format "owner/repo"
- `analysis_type` (optional): Type of analysis to perform

**Return Type:**
```typescript
interface GitHubAnalysisResult {
  repository: {
    owner: string;
    name: string;
    fullName: string;
    language: string;
    size: number;
  };
  analysis: {
    type: string;
    score: number; // 0-100
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      category: string;
      description: string;
      file?: string;
      line?: number;
    }>;
    recommendations: string[];
    metrics: Record<string, number>;
  };
  executionTime: number;
}
```

### `mcp__claude-flow__github_pr_manage`

Manage pull requests with automated review and operations.

**Function Signature:**
```typescript
function github_pr_manage(params: {
  repo: string;
  action: 'review' | 'merge' | 'close';
  pr_number?: number;
}): Promise<GitHubPRResult>;
```

**Return Type:**
```typescript
interface GitHubPRResult {
  repository: string;
  pullRequest: {
    number: number;
    title: string;
    state: string;
  };
  action: string;
  result: {
    success: boolean;
    message: string;
    details?: Record<string, any>;
  };
  automation: {
    reviewComments: string[];
    suggestions: string[];
    checks: Array<{
      name: string;
      status: 'passed' | 'failed' | 'skipped';
      details: string;
    }>;
  };
}
```

## Performance & Monitoring Tools

### `mcp__claude-flow__performance_report`

Generate comprehensive performance reports with real-time metrics.

**Function Signature:**
```typescript
function performance_report(params: {
  format?: 'summary' | 'detailed' | 'json';
  timeframe?: '24h' | '7d' | '30d';
}): Promise<PerformanceReportResult>;
```

**Return Type:**
```typescript
interface PerformanceReportResult {
  report: {
    timeframe: string;
    generated: string;
    summary: {
      totalTasks: number;
      successRate: number;
      averageExecutionTime: number;
      resourceEfficiency: number;
    };
    swarmMetrics: {
      coordinationEfficiency: number;
      agentUtilization: number;
      communicationOverhead: number;
    };
    bottlenecks: Array<{
      component: string;
      severity: number;
      impact: string;
      recommendations: string[];
    }>;
    trends: Record<string, number[]>;
  };
  format: string;
}
```

### `mcp__claude-flow__benchmark_run`

Execute performance benchmarks with comprehensive testing.

**Function Signature:**
```typescript
function benchmark_run(params: {
  type?: 'all' | 'wasm' | 'swarm' | 'agent' | 'task';
  iterations?: number;
}): Promise<BenchmarkResult>;
```

**Parameters:**
- `type` (optional, default: 'all'): Benchmark category
- `iterations` (optional, default: 10): Number of test iterations (max: 100)

**Return Type:**
```typescript
interface BenchmarkResult {
  benchmarkId: string;
  type: string;
  iterations: number;
  results: {
    performance: {
      averageTime: number;
      minTime: number;
      maxTime: number;
      standardDeviation: number;
    };
    throughput: {
      operationsPerSecond: number;
      peakThroughput: number;
    };
    resources: {
      memoryUsage: number;
      cpuUsage: number;
      networkIO: number;
    };
  };
  comparison: {
    baseline: number;
    improvement: number;
    percentageChange: number;
  };
  recommendations: string[];
}
```

## Advanced Coordination Tools

### DAA (Decentralized Autonomous Agents) Tools

#### `mcp__claude-flow__daa_init`

Initialize DAA service with autonomous coordination capabilities.

**Function Signature:**
```typescript
function daa_init(params: {
  enableCoordination?: boolean;
  enableLearning?: boolean;
  persistenceMode?: 'auto' | 'memory' | 'disk';
}): Promise<DAAInitResult>;
```

#### `mcp__claude-flow__daa_agent_create`

Create autonomous agents with advanced coordination capabilities.

**Function Signature:**
```typescript
function daa_agent_create(params: {
  id: string;
  cognitivePattern?: 'convergent' | 'divergent' | 'lateral' | 'systems' | 'critical' | 'adaptive';
  capabilities?: string[];
  enableMemory?: boolean;
  learningRate?: number;
}): Promise<DAAAgentResult>;
```

#### `mcp__claude-flow__daa_workflow_create`

Create autonomous workflows with intelligent coordination.

**Function Signature:**
```typescript
function daa_workflow_create(params: {
  id: string;
  name: string;
  steps?: any[];
  strategy?: 'parallel' | 'sequential' | 'adaptive';
  dependencies?: Record<string, any>;
}): Promise<DAAWorkflowResult>;
```

## Usage Patterns

### Basic Swarm Setup

```javascript
// 1. Initialize swarm
const swarm = await mcp__claude_flow__swarm_init({
  topology: 'hierarchical',
  maxAgents: 6
});

// 2. Spawn specialized agents
const agents = await Promise.all([
  mcp__claude_flow__agent_spawn({ type: 'coder' }),
  mcp__claude_flow__agent_spawn({ type: 'reviewer' }),
  mcp__claude_flow__agent_spawn({ type: 'tester' })
]);

// 3. Orchestrate tasks
const task = await mcp__claude_flow__task_orchestrate({
  task: 'Build a REST API with authentication',
  strategy: 'adaptive',
  priority: 'high'
});

// 4. Monitor progress
const status = await mcp__claude_flow__task_status({
  taskId: task.taskId,
  detailed: true
});
```

### Advanced Coordination

```javascript
// Initialize DAA system
await mcp__claude_flow__daa_init({
  enableCoordination: true,
  enableLearning: true,
  persistenceMode: 'auto'
});

// Create autonomous agents
const autonomousAgent = await mcp__claude_flow__daa_agent_create({
  id: 'adaptive-coordinator',
  cognitivePattern: 'adaptive',
  capabilities: ['coordination', 'optimization', 'learning'],
  enableMemory: true,
  learningRate: 0.1
});

// Create intelligent workflow
const workflow = await mcp__claude_flow__daa_workflow_create({
  id: 'fullstack-development',
  name: 'Full-Stack Application Development',
  strategy: 'adaptive',
  steps: [
    { stage: 'requirements', agent: 'analyst' },
    { stage: 'architecture', agent: 'architect' },
    { stage: 'implementation', agent: 'coder' },
    { stage: 'testing', agent: 'tester' }
  ]
});
```

### Memory-Driven Coordination

```javascript
// Store project context
await mcp__claude_flow__memory_usage({
  action: 'store',
  key: 'project/requirements',
  value: JSON.stringify(requirements),
  namespace: 'project-alpha',
  ttl: 86400 // 24 hours
});

// Agents retrieve context
const context = await mcp__claude_flow__memory_usage({
  action: 'retrieve',
  key: 'project/requirements',
  namespace: 'project-alpha'
});

// Share knowledge between agents
await mcp__claude_flow__daa_knowledge_share({
  sourceAgentId: 'architect-001',
  targetAgentIds: ['coder-001', 'tester-001'],
  knowledgeDomain: 'system-architecture',
  knowledgeContent: architectureDecisions
});
```

### Performance Optimization

```javascript
// Run comprehensive benchmarks
const benchmark = await mcp__claude_flow__benchmark_run({
  type: 'all',
  iterations: 50
});

// Analyze performance bottlenecks
const report = await mcp__claude_flow__performance_report({
  format: 'detailed',
  timeframe: '24h'
});

// Train neural patterns for optimization
const training = await mcp__claude_flow__neural_train({
  iterations: 100
});
```

## Error Handling

All MCP tools follow consistent error handling patterns:

```typescript
interface MCPError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}
```

**Common Error Codes:**
- `INVALID_PARAMETER`: Invalid parameter value
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `OPERATION_FAILED`: Operation failed to complete
- `RATE_LIMITED`: Rate limit exceeded
- `INSUFFICIENT_RESOURCES`: Not enough system resources
- `AGENT_SPAWN_FAILED`: Failed to create agent
- `TASK_EXECUTION_ERROR`: Task execution failed
- `MEMORY_OPERATION_FAILED`: Memory operation failed

**Error Handling Example:**
```javascript
try {
  const result = await mcp__claude_flow__agent_spawn({
    type: 'invalid-type'
  });
} catch (error) {
  console.error(`MCP Error [${error.code}]: ${error.message}`);
  if (error.details) {
    console.error('Details:', error.details);
  }
}
```

This comprehensive MCP tool specification provides complete technical documentation for all coordination tools, enabling developers to build sophisticated multi-agent systems with Claude Flow.