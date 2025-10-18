# JavaScript/TypeScript Integration Guide

This guide provides comprehensive examples and patterns for integrating claude-flow-novice with JavaScript and TypeScript projects.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Node.js Integration](#nodejs-integration)
3. [React Integration](#react-integration)
4. [Express.js Integration](#expressjs-integration)
5. [TypeScript Configuration](#typescript-configuration)
6. [Testing Integration](#testing-integration)
7. [Build Tool Integration](#build-tool-integration)

## Basic Setup

### NPM Project Integration

```json
{
  "name": "my-claude-flow-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "npx claude-flow-novice sparc run coder 'Start development server'",
    "build": "npx claude-flow-novice sparc batch 'coder,tester' 'Build and test project'",
    "test": "npx claude-flow-novice sparc run tester 'Run comprehensive test suite'",
    "deploy": "npx claude-flow-novice sparc pipeline 'Build, test, and deploy to production'",
    "sparc:init": "npx claude-flow-novice sparc init --topology mesh --agents 5",
    "sparc:tdd": "npx claude-flow-novice sparc tdd",
    "sparc:modes": "npx claude-flow-novice sparc modes"
  },
  "dependencies": {
    "express": "^4.18.0",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "claude-flow": "alpha",
    "jest": "^29.0.0",
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0"
  },
  "claudeFlow": {
    "topology": "mesh",
    "agents": {
      "default": ["coder", "tester", "reviewer"],
      "development": ["backend-dev", "mobile-dev", "tester"],
      "production": ["cicd-engineer", "security-manager", "performance-benchmarker"]
    },
    "hooks": {
      "preCommit": "npx claude-flow-novice sparc run reviewer 'Review changes before commit'",
      "preBuild": "npx claude-flow-novice sparc run code-analyzer 'Analyze code quality'",
      "postDeploy": "npx claude-flow-novice sparc run production-validator 'Validate deployment'"
    }
  }
}
```

### Claude Flow Integration Module

```javascript
// lib/claude-flow-integration.js
const { spawn } = require('child_process');
const EventEmitter = require('events');

class ClaudeFlowIntegration extends EventEmitter {
  constructor(options = {}) {
    super();
    this.topology = options.topology || 'mesh';
    this.defaultAgents = options.agents || ['coder', 'tester', 'reviewer'];
    this.sessionId = `session-${Date.now()}`;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Setup MCP servers
      await this.executeCLI('mcp', ['add', 'claude-flow', 'npx', 'claude-flow@alpha', 'mcp', 'start']);
      await this.executeCLI('mcp', ['add', 'ruv-swarm', 'npx', 'ruv-swarm', 'mcp', 'start']);

      // Initialize swarm
      await this.executeCLI('sparc', ['init', '--topology', this.topology, '--agents', this.defaultAgents.length]);

      // Start session
      await this.executeCLI('sparc', ['session', 'start', '--name', this.sessionId]);

      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async spawnAgents(agents, task, strategy = 'parallel') {
    if (!this.initialized) {
      throw new Error('ClaudeFlow not initialized. Call initialize() first.');
    }

    const agentList = Array.isArray(agents) ? agents.join(',') : agents;

    try {
      const result = await this.executeCLI('sparc', [
        'batch',
        agentList,
        `"${task}"`,
        '--strategy', strategy
      ]);

      this.emit('agentsSpawned', { agents, task, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async orchestrateTask(task, options = {}) {
    const {
      agents = this.defaultAgents,
      strategy = 'adaptive',
      priority = 'medium'
    } = options;

    try {
      const result = await this.executeCLI('sparc', [
        'run', 'task-orchestrator',
        `"${task}"`,
        '--agents', agents.join(','),
        '--strategy', strategy,
        '--priority', priority
      ]);

      this.emit('taskOrchestrated', { task, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async runTDD(feature) {
    try {
      const result = await this.executeCLI('sparc', ['tdd', `"${feature}"`]);
      this.emit('tddCompleted', { feature, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async executePipeline(task) {
    try {
      const result = await this.executeCLI('sparc', ['pipeline', `"${task}"`]);
      this.emit('pipelineCompleted', { task, result });
      return result;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async executeCLI(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['claude-flow', command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  async cleanup() {
    try {
      await this.executeCLI('sparc', ['session', 'end', '--export-metrics', 'true']);
      this.emit('cleanup');
    } catch (error) {
      this.emit('error', error);
    }
  }
}

module.exports = ClaudeFlowIntegration;
```

## Node.js Integration

### Express.js Server with Claude Flow

```javascript
// server.js
const express = require('express');
const ClaudeFlowIntegration = require('./lib/claude-flow-integration');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Claude Flow
const claudeFlow = new ClaudeFlowIntegration({
  topology: 'hierarchical',
  agents: ['backend-dev', 'api-docs', 'security-manager']
});

app.use(express.json());

// Middleware for Claude Flow integration
app.use(async (req, res, next) => {
  if (!claudeFlow.initialized) {
    try {
      await claudeFlow.initialize();
    } catch (error) {
      console.error('Failed to initialize Claude Flow:', error);
    }
  }
  next();
});

// API endpoint for triggering agent tasks
app.post('/api/claude-flow/task', async (req, res) => {
  try {
    const { task, agents, strategy } = req.body;

    const result = await claudeFlow.spawnAgents(agents, task, strategy);

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint for TDD workflow
app.post('/api/claude-flow/tdd', async (req, res) => {
  try {
    const { feature } = req.body;

    const result = await claudeFlow.runTDD(feature);

    res.json({
      success: true,
      result,
      feature,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Webhook endpoint for GitHub integration
app.post('/webhook/github', async (req, res) => {
  const { action, pull_request, repository } = req.body;

  if (action === 'opened' && pull_request) {
    try {
      // Trigger code review
      await claudeFlow.spawnAgents(
        ['code-review-swarm', 'security-auditor'],
        `Review pull request #${pull_request.number} in ${repository.name}`,
        'parallel'
      );

      res.json({ success: true, message: 'Review triggered' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.json({ success: true, message: 'No action needed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    claudeFlowInitialized: claudeFlow.initialized,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await claudeFlow.cleanup();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
```

### NPM Scripts Integration

```javascript
// scripts/claude-flow-scripts.js
const ClaudeFlowIntegration = require('../lib/claude-flow-integration');

class NPMScriptsIntegration {
  constructor() {
    this.claudeFlow = new ClaudeFlowIntegration();
  }

  async dev() {
    await this.claudeFlow.initialize();

    // Start development with multiple agents
    await this.claudeFlow.spawnAgents(
      ['backend-dev', 'mobile-dev', 'tester'],
      'Start development server with hot reload and testing',
      'parallel'
    );
  }

  async build() {
    await this.claudeFlow.initialize();

    // Build process with quality gates
    await this.claudeFlow.orchestrateTask(
      'Build production-ready application with optimization and validation',
      {
        agents: ['coder', 'cicd-engineer', 'performance-benchmarker'],
        strategy: 'sequential'
      }
    );
  }

  async test() {
    await this.claudeFlow.initialize();

    // Comprehensive testing
    await this.claudeFlow.spawnAgents(
      ['tester', 'tdd-london-swarm', 'performance-benchmarker'],
      'Run comprehensive test suite with coverage and performance analysis',
      'parallel'
    );
  }

  async deploy() {
    await this.claudeFlow.initialize();

    // Full deployment pipeline
    await this.claudeFlow.executePipeline(
      'Build, test, security scan, and deploy to production with monitoring'
    );
  }

  async lint() {
    await this.claudeFlow.initialize();

    // Code quality analysis
    await this.claudeFlow.spawnAgents(
      ['code-analyzer', 'reviewer'],
      'Analyze code quality, style, and best practices',
      'parallel'
    );
  }
}

// CLI interface
if (require.main === module) {
  const integration = new NPMScriptsIntegration();
  const command = process.argv[2];

  switch (command) {
    case 'dev':
      integration.dev().catch(console.error);
      break;
    case 'build':
      integration.build().catch(console.error);
      break;
    case 'test':
      integration.test().catch(console.error);
      break;
    case 'deploy':
      integration.deploy().catch(console.error);
      break;
    case 'lint':
      integration.lint().catch(console.error);
      break;
    default:
      console.log('Available commands: dev, build, test, deploy, lint');
  }
}

module.exports = NPMScriptsIntegration;
```

## React Integration

### React Development Workflow

```jsx
// src/components/ClaudeFlowProvider.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const ClaudeFlowContext = createContext();

export const useClaudeFlow = () => {
  const context = useContext(ClaudeFlowContext);
  if (!context) {
    throw new Error('useClaudeFlow must be used within a ClaudeFlowProvider');
  }
  return context;
};

export const ClaudeFlowProvider = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    initializeClaudeFlow();
  }, []);

  const initializeClaudeFlow = async () => {
    try {
      // Initialize Claude Flow for React development
      const response = await fetch('/api/claude-flow/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topology: 'mesh',
          agents: ['mobile-dev', 'tester', 'reviewer', 'ui-designer']
        })
      });

      if (response.ok) {
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Failed to initialize Claude Flow:', error);
    }
  };

  const spawnAgents = async (agentTypes, task) => {
    try {
      const response = await fetch('/api/claude-flow/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agents: agentTypes,
          task,
          strategy: 'parallel'
        })
      });

      const result = await response.json();
      if (result.success) {
        setTasks(prev => [...prev, { id: Date.now(), task, agents: agentTypes, result }]);
      }
      return result;
    } catch (error) {
      console.error('Failed to spawn agents:', error);
      throw error;
    }
  };

  const runTDD = async (feature) => {
    try {
      const response = await fetch('/api/claude-flow/tdd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature })
      });

      return await response.json();
    } catch (error) {
      console.error('Failed to run TDD:', error);
      throw error;
    }
  };

  const value = {
    isInitialized,
    agents,
    tasks,
    spawnAgents,
    runTDD
  };

  return (
    <ClaudeFlowContext.Provider value={value}>
      {children}
    </ClaudeFlowContext.Provider>
  );
};
```

### React Development Dashboard

```jsx
// src/components/ClaudeFlowDashboard.jsx
import React, { useState } from 'react';
import { useClaudeFlow } from './ClaudeFlowProvider';

const ClaudeFlowDashboard = () => {
  const { isInitialized, tasks, spawnAgents, runTDD } = useClaudeFlow();
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [taskDescription, setTaskDescription] = useState('');
  const [featureName, setFeatureName] = useState('');

  const availableAgents = [
    'mobile-dev',
    'tester',
    'reviewer',
    'ui-designer',
    'performance-benchmarker',
    'security-auditor'
  ];

  const handleSpawnAgents = async () => {
    if (selectedAgents.length > 0 && taskDescription) {
      try {
        await spawnAgents(selectedAgents, taskDescription);
        setTaskDescription('');
        setSelectedAgents([]);
      } catch (error) {
        console.error('Error spawning agents:', error);
      }
    }
  };

  const handleRunTDD = async () => {
    if (featureName) {
      try {
        await runTDD(featureName);
        setFeatureName('');
      } catch (error) {
        console.error('Error running TDD:', error);
      }
    }
  };

  if (!isInitialized) {
    return <div>Initializing Claude Flow...</div>;
  }

  return (
    <div className="claude-flow-dashboard">
      <h2>Claude Flow Development Dashboard</h2>

      <div className="agent-spawner">
        <h3>Spawn Agents</h3>
        <div className="agent-selection">
          {availableAgents.map(agent => (
            <label key={agent}>
              <input
                type="checkbox"
                value={agent}
                checked={selectedAgents.includes(agent)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedAgents([...selectedAgents, agent]);
                  } else {
                    setSelectedAgents(selectedAgents.filter(a => a !== agent));
                  }
                }}
              />
              {agent}
            </label>
          ))}
        </div>
        <textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          placeholder="Describe the task for the agents..."
          rows={3}
        />
        <button onClick={handleSpawnAgents}>Spawn Agents</button>
      </div>

      <div className="tdd-runner">
        <h3>Run TDD Workflow</h3>
        <input
          type="text"
          value={featureName}
          onChange={(e) => setFeatureName(e.target.value)}
          placeholder="Feature name for TDD"
        />
        <button onClick={handleRunTDD}>Run TDD</button>
      </div>

      <div className="task-history">
        <h3>Task History</h3>
        {tasks.map(task => (
          <div key={task.id} className="task-item">
            <strong>Agents:</strong> {task.agents.join(', ')}<br/>
            <strong>Task:</strong> {task.task}<br/>
            <strong>Status:</strong> {task.result.success ? 'Success' : 'Failed'}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClaudeFlowDashboard;
```

## TypeScript Configuration

### TypeScript Types for Claude Flow

```typescript
// types/claude-flow.d.ts
export interface AgentType {
  id: string;
  type: 'coder' | 'tester' | 'reviewer' | 'backend-dev' | 'mobile-dev' | 'cicd-engineer';
  capabilities: string[];
  status: 'idle' | 'busy' | 'error';
}

export interface TaskResult {
  success: boolean;
  result?: any;
  error?: string;
  timestamp: string;
  duration?: number;
}

export interface SwarmConfiguration {
  topology: 'mesh' | 'hierarchical' | 'ring' | 'star';
  maxAgents: number;
  strategy: 'parallel' | 'sequential' | 'adaptive';
}

export interface ClaudeFlowOptions {
  topology?: SwarmConfiguration['topology'];
  agents?: string[];
  sessionId?: string;
  hooks?: {
    preTask?: string;
    postTask?: string;
    onError?: string;
  };
}

export interface TaskOptions {
  agents?: string[];
  strategy?: 'parallel' | 'sequential' | 'adaptive';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
}

export declare class ClaudeFlowIntegration {
  constructor(options?: ClaudeFlowOptions);

  initialize(): Promise<void>;
  spawnAgents(agents: string | string[], task: string, strategy?: string): Promise<TaskResult>;
  orchestrateTask(task: string, options?: TaskOptions): Promise<TaskResult>;
  runTDD(feature: string): Promise<TaskResult>;
  executePipeline(task: string): Promise<TaskResult>;
  cleanup(): Promise<void>;

  readonly initialized: boolean;
  readonly sessionId: string;
}
```

### TypeScript Project Integration

```typescript
// src/ClaudeFlowManager.ts
import { ClaudeFlowIntegration, TaskOptions, TaskResult } from '../types/claude-flow';

export class ClaudeFlowManager {
  private claudeFlow: ClaudeFlowIntegration;
  private activeJobs: Map<string, Promise<TaskResult>> = new Map();

  constructor() {
    this.claudeFlow = new ClaudeFlowIntegration({
      topology: 'mesh',
      agents: ['coder', 'tester', 'reviewer', 'typescript-analyzer']
    });
  }

  async initialize(): Promise<void> {
    await this.claudeFlow.initialize();
  }

  async developFeature(
    featureName: string,
    description: string,
    options?: TaskOptions
  ): Promise<TaskResult> {
    const jobId = `feature-${featureName}-${Date.now()}`;

    const job = this.claudeFlow.orchestrateTask(
      `Develop TypeScript feature: ${featureName}. ${description}`,
      {
        agents: ['backend-dev', 'tester', 'typescript-analyzer'],
        strategy: 'sequential',
        ...options
      }
    );

    this.activeJobs.set(jobId, job);

    try {
      const result = await job;
      this.activeJobs.delete(jobId);
      return result;
    } catch (error) {
      this.activeJobs.delete(jobId);
      throw error;
    }
  }

  async runTypeScript TDD(featureName: string): Promise<TaskResult> {
    return this.claudeFlow.runTDD(`TypeScript feature: ${featureName} with strict typing and comprehensive tests`);
  }

  async analyzeCodeQuality(filePaths: string[]): Promise<TaskResult> {
    return this.claudeFlow.spawnAgents(
      ['code-analyzer', 'typescript-analyzer', 'security-auditor'],
      `Analyze TypeScript code quality for files: ${filePaths.join(', ')}`,
      'parallel'
    );
  }

  async buildProject(): Promise<TaskResult> {
    return this.claudeFlow.executePipeline(
      'Build TypeScript project with type checking, linting, and optimization'
    );
  }

  getActiveJobs(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (job) {
      // Note: This is a simplified cancellation - actual implementation would need more sophisticated cancellation
      this.activeJobs.delete(jobId);
      return true;
    }
    return false;
  }

  async cleanup(): Promise<void> {
    // Wait for all active jobs to complete or timeout
    const activePromises = Array.from(this.activeJobs.values());
    await Promise.allSettled(activePromises);

    await this.claudeFlow.cleanup();
  }
}

// Export singleton instance
export const claudeFlowManager = new ClaudeFlowManager();
```

## Testing Integration

### Jest Configuration with Claude Flow

```javascript
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['**/*.test.js', '**/*.spec.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{js,ts}'
  ],
  globalSetup: '<rootDir>/tests/global-setup.js',
  globalTeardown: '<rootDir>/tests/global-teardown.js',
  testTimeout: 60000 // Increased timeout for Claude Flow operations
};
```

### Test Setup with Claude Flow

```javascript
// tests/setup.js
const ClaudeFlowIntegration = require('../lib/claude-flow-integration');

global.claudeFlow = new ClaudeFlowIntegration({
  topology: 'mesh',
  agents: ['tester', 'code-analyzer', 'security-auditor']
});

beforeAll(async () => {
  // Initialize Claude Flow for testing
  await global.claudeFlow.initialize();
});

afterAll(async () => {
  // Cleanup Claude Flow after tests
  await global.claudeFlow.cleanup();
});

// Helper function for testing with agents
global.testWithAgents = async (agents, task) => {
  return global.claudeFlow.spawnAgents(agents, task, 'parallel');
};
```

### Integration Tests

```javascript
// tests/integration/claude-flow.test.js
describe('Claude Flow Integration', () => {
  test('should spawn agents and execute tasks', async () => {
    const result = await testWithAgents(
      ['coder', 'tester'],
      'Create a simple function with tests'
    );

    expect(result.success).toBe(true);
    expect(result.result).toContain('function');
    expect(result.result).toContain('test');
  });

  test('should run TDD workflow', async () => {
    const result = await global.claudeFlow.runTDD('User authentication');

    expect(result.success).toBe(true);
    expect(result.result).toMatch(/test.*implementation/i);
  });

  test('should handle parallel agent execution', async () => {
    const startTime = Date.now();

    const result = await testWithAgents(
      ['backend-dev', 'mobile-dev', 'tester'],
      'Create API endpoints with validation'
    );

    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(30000); // Should complete in parallel faster than sequential
  });

  test('should maintain state across agent interactions', async () => {
    // First agent stores data
    await testWithAgents(['coder'], 'Create user model and store schema in memory');

    // Second agent uses stored data
    const result = await testWithAgents(['tester'], 'Create tests based on stored user model schema');

    expect(result.success).toBe(true);
    expect(result.result).toContain('user');
  });
});
```

## Build Tool Integration

### Webpack Integration

```javascript
// webpack.config.js
const path = require('path');
const { spawn } = require('child_process');

class ClaudeFlowWebpackPlugin {
  constructor(options = {}) {
    this.options = {
      agents: ['coder', 'performance-benchmarker'],
      task: 'Optimize webpack build',
      ...options
    };
  }

  apply(compiler) {
    compiler.hooks.beforeCompile.tapAsync('ClaudeFlowWebpackPlugin', async (params, callback) => {
      try {
        // Run Claude Flow optimization before compilation
        await this.runClaudeFlow('Pre-build optimization and analysis');
        callback();
      } catch (error) {
        callback(error);
      }
    });

    compiler.hooks.afterCompile.tapAsync('ClaudeFlowWebpackPlugin', async (compilation, callback) => {
      try {
        // Analyze build results
        await this.runClaudeFlow('Analyze build output and suggest optimizations');
        callback();
      } catch (error) {
        callback(error);
      }
    });
  }

  async runClaudeFlow(task) {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', [
        'claude-flow', 'sparc', 'batch',
        this.options.agents.join(','),
        `"${task}"`
      ]);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`Claude Flow: ${output}`);
          resolve(output);
        } else {
          reject(new Error(`Claude Flow failed with code ${code}`));
        }
      });
    });
  }
}

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  plugins: [
    new ClaudeFlowWebpackPlugin({
      agents: ['performance-benchmarker', 'security-auditor'],
      task: 'Optimize bundle size and security'
    })
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  }
};
```

### Vite Integration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { spawn } from 'child_process';

function claudeFlowPlugin() {
  return {
    name: 'claude-flow',
    buildStart() {
      // Run Claude Flow analysis at build start
      return new Promise((resolve) => {
        const child = spawn('npx', [
          'claude-flow', 'sparc', 'run', 'performance-benchmarker',
          '"Analyze Vite configuration and suggest optimizations"'
        ]);

        child.on('close', () => resolve());
      });
    },
    generateBundle() {
      // Analyze generated bundle
      return new Promise((resolve) => {
        const child = spawn('npx', [
          'claude-flow', 'sparc', 'run', 'code-analyzer',
          '"Analyze generated bundle for optimization opportunities"'
        ]);

        child.on('close', () => resolve());
      });
    }
  };
}

export default defineConfig({
  plugins: [claudeFlowPlugin()],
  build: {
    rollupOptions: {
      external: ['claude-flow']
    }
  }
});
```

## Best Practices for JavaScript/TypeScript Integration

### 1. Initialization Patterns

```javascript
// Always initialize Claude Flow once per application lifecycle
class AppInitializer {
  static async initialize() {
    if (!global.claudeFlowInitialized) {
      const claudeFlow = new ClaudeFlowIntegration();
      await claudeFlow.initialize();
      global.claudeFlow = claudeFlow;
      global.claudeFlowInitialized = true;
    }
    return global.claudeFlow;
  }
}
```

### 2. Error Handling

```javascript
// Implement comprehensive error handling
async function executeWithClaudeFlow(task, agents) {
  try {
    return await claudeFlow.spawnAgents(agents, task);
  } catch (error) {
    console.error('Claude Flow execution failed:', error);

    // Fallback to manual execution
    return {
      success: false,
      fallback: true,
      error: error.message
    };
  }
}
```

### 3. Performance Optimization

```javascript
// Cache agent results for similar tasks
const agentCache = new Map();

async function cachedAgentExecution(agents, task) {
  const cacheKey = `${agents.join(',')}-${task}`;

  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey);
  }

  const result = await claudeFlow.spawnAgents(agents, task);
  agentCache.set(cacheKey, result);

  return result;
}
```

### 4. Development vs Production

```javascript
// Environment-specific configuration
const getClaudeFlowConfig = () => {
  if (process.env.NODE_ENV === 'development') {
    return {
      topology: 'mesh',
      agents: ['coder', 'tester', 'reviewer'],
      verbose: true
    };
  } else {
    return {
      topology: 'hierarchical',
      agents: ['cicd-engineer', 'security-manager'],
      verbose: false
    };
  }
};
```

## Next Steps

- Explore [Python Integration](../python/integration.md)
- Review [CI/CD Integration Patterns](../../examples/integration-patterns.md#cicd-pipeline-integration)
- Study [Performance Optimization](../../wiki/performance-optimization-strategies.md)