# CLI API Reference

## Overview

The Claude Flow CLI provides both command-line interface and programmatic API access to all system features. This document covers the complete CLI API, including JavaScript/TypeScript integration and programmatic usage patterns.

## Table of Contents

- [CLI Command Interface](#cli-command-interface)
- [Programmatic API](#programmatic-api)
- [ConsolidatedCLI Class](#consolidatedcli-class)
- [Command Handlers](#command-handlers)
- [Intelligence Engine](#intelligence-engine)
- [Performance Optimization](#performance-optimization)
- [Error Handling](#error-handling)
- [Examples](#examples)

## CLI Command Interface

### Core Commands

#### `claude-flow-novice init`
Initialize a new Claude Flow project.

```bash
claude-flow-novice init [project-name] [options]
```

**Parameters:**
- `project-name` (optional): Name of the project directory
- `--template, -t`: Project template (default: 'basic')
- `--tier`: User tier (novice|development|advanced|expert)
- `--sparc`: Enable SPARC methodology
- `--hooks`: Enable lifecycle hooks
- `--no-git`: Skip Git initialization

**Return Codes:**
- `0`: Success
- `1`: Directory already exists
- `2`: Permission denied
- `3`: Template not found

**Example:**
```bash
claude-flow-novice init my-project --template fullstack --tier development
```

#### `claude-flow-novice agent`
Agent management commands.

```bash
claude-flow-novice agent <subcommand> [options]
```

**Subcommands:**
- `spawn <type> "<task>"`: Create new agent
- `list`: List active agents
- `status <id>`: Get agent status
- `stop <id>`: Stop specific agent
- `kill-all`: Stop all agents

**Example:**
```bash
claude-flow-novice agent spawn coder "implement user authentication"
claude-flow-novice agent list --format table
claude-flow-novice agent status agent_123
```

#### `claude-flow-novice sparc`
SPARC methodology commands.

```bash
claude-flow-novice sparc <mode> "<task>" [options]
```

**Modes:**
- `tdd`: Test-driven development workflow
- `spec`: Specification phase only
- `arch`: Architecture phase only
- `impl`: Implementation phase only
- `full`: Complete SPARC workflow

**Example:**
```bash
claude-flow-novice sparc tdd "user management system" --agents 3
```

### Advanced Commands

#### `claude-flow-novice swarm`
Multi-agent coordination.

```bash
claude-flow-novice swarm <command> [options]
```

**Commands:**
- `init <topology>`: Initialize swarm with topology
- `scale <count>`: Scale agent count
- `optimize`: Optimize topology
- `status`: Show swarm status

#### `claude-flow-novice hooks`
Lifecycle hook management.

```bash
claude-flow-novice hooks <command> [options]
```

**Commands:**
- `list`: Show registered hooks
- `enable <hook>`: Enable specific hook
- `disable <hook>`: Disable specific hook
- `trigger <event>`: Manually trigger hook

## Programmatic API

### Core Classes

#### ConsolidatedCLI

Main entry point for programmatic CLI access.

```typescript
import { ConsolidatedCLI, createConsolidatedCLI } from 'claude-flow-novice/cli';

// Create instance
const cli = createConsolidatedCLI({
  enablePerformanceOptimization: true,
  enableProgressiveDisclosure: true,
  enableNaturalLanguage: true,
  debugMode: false
});

// Execute commands programmatically
const result = await cli.executeCommand('agent spawn coder "build API"');
```

**Interface:**
```typescript
class ConsolidatedCLI {
  constructor(config: ConsolidatedCLIConfig);

  // Command execution
  executeCommand(command: string): Promise<CommandResult>;
  executeCommandArray(args: string[]): Promise<CommandResult>;

  // Component access
  getIntelligenceEngine(): IntelligenceEngine;
  getTierManager(): TierManager;
  getCommandRouter(): CommandRouter;
  getPerformanceOptimizer(): PerformanceOptimizer;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

#### CommandResult

Standard result interface for all commands.

```typescript
interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  error?: Error;
  executionTime: number;
  tier: UserTier;
  suggestions?: string[];
}
```

### Command Handlers

The CommandHandlers class provides direct access to command logic.

```typescript
import { CommandHandlers } from 'claude-flow-novice/cli';

const handlers = new CommandHandlers(intelligence, tier, performance);

// Initialize project
const initResult = await handlers.handleInit({
  projectName: 'my-app',
  template: 'fullstack',
  tier: 'development',
  enableSparc: true
});

// Spawn agent
const agentResult = await handlers.handleAgentSpawn({
  type: 'coder',
  task: 'implement authentication',
  options: {
    language: 'typescript',
    framework: 'express'
  }
});

// Execute SPARC workflow
const sparcResult = await handlers.handleSparc({
  mode: 'tdd',
  task: 'user management system',
  agents: ['coder', 'tester', 'reviewer']
});
```

**CommandHandlers Interface:**
```typescript
class CommandHandlers {
  // Project management
  handleInit(options: InitOptions): Promise<CommandResult>;
  handleBuild(options: BuildOptions): Promise<CommandResult>;
  handleStatus(options: StatusOptions): Promise<CommandResult>;

  // Agent management
  handleAgentSpawn(options: AgentSpawnOptions): Promise<CommandResult>;
  handleAgentList(options: AgentListOptions): Promise<CommandResult>;
  handleAgentStatus(options: AgentStatusOptions): Promise<CommandResult>;

  // SPARC workflows
  handleSparc(options: SparcOptions): Promise<CommandResult>;
  handleSparcStatus(options: SparcStatusOptions): Promise<CommandResult>;

  // Swarm coordination
  handleSwarmInit(options: SwarmInitOptions): Promise<CommandResult>;
  handleSwarmStatus(options: SwarmStatusOptions): Promise<CommandResult>;

  // Help and learning
  handleHelp(options: HelpOptions): Promise<CommandResult>;
  handleLearn(options: LearnOptions): Promise<CommandResult>;
}
```

### Intelligence Engine

The IntelligenceEngine provides AI-powered command analysis and recommendations.

```typescript
import { IntelligenceEngine } from 'claude-flow-novice/cli';

const intelligence = new IntelligenceEngine();

// Analyze natural language commands
const analysis = await intelligence.analyzeCommand(
  "create a REST API with authentication"
);

// Get agent recommendations
const recommendations = await intelligence.recommendAgents({
  task: "build a web application",
  context: {
    language: "typescript",
    framework: "react"
  }
});

// Analyze project context
const projectContext = await intelligence.analyzeProjectContext("./");
```

**IntelligenceEngine Interface:**
```typescript
class IntelligenceEngine {
  // Command analysis
  analyzeCommand(command: string): Promise<TaskAnalysis>;
  translateNaturalLanguage(input: string): Promise<string>;

  // Agent recommendations
  recommendAgents(context: ProjectContext): Promise<AgentRecommendation[]>;
  optimizeAgentAssignment(task: string, agents: string[]): Promise<string[]>;

  // Project analysis
  analyzeProjectContext(path: string): Promise<ProjectContext>;
  detectProjectType(path: string): Promise<string>;

  // Learning
  learnFromSuccess(command: string, result: CommandResult): Promise<void>;
  generateSuggestions(context: ProjectContext): Promise<string[]>;
}
```

**Type Definitions:**
```typescript
interface TaskAnalysis {
  intent: string;
  entities: Entity[];
  confidence: number;
  suggestedCommand: string;
  requiredAgents: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

interface AgentRecommendation {
  type: string;
  confidence: number;
  reasoning: string;
  capabilities: string[];
}

interface ProjectContext {
  type: string;
  language: string;
  framework?: string;
  structure: ProjectStructure;
  dependencies: Dependency[];
  complexity: number;
}
```

### Performance Optimization

The PerformanceOptimizer provides automatic performance tuning and monitoring.

```typescript
import { PerformanceOptimizer } from 'claude-flow-novice/cli';

const optimizer = new PerformanceOptimizer();

// Enable optimization
await optimizer.enable();

// Get metrics
const metrics = await optimizer.getMetrics();

// Optimize specific operation
const optimized = await optimizer.optimize('agent_spawn', {
  type: 'coder',
  task: 'complex implementation'
});
```

**PerformanceOptimizer Interface:**
```typescript
class PerformanceOptimizer {
  // Lifecycle
  enable(): Promise<void>;
  disable(): Promise<void>;

  // Metrics
  getMetrics(): Promise<PerformanceMetrics>;
  recordMetric(name: string, value: number): void;

  // Optimization
  optimize(operation: string, context: any): Promise<OptimizationResult>;
  shouldOptimize(operation: string): boolean;

  // Caching
  clearCache(): Promise<void>;
  getCacheStats(): CacheStats;
}
```

## Error Handling

### Error Types

```typescript
// Base CLI error
class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public exitCode: number = 1
  ) {
    super(message);
  }
}

// Command-specific errors
class CommandNotFoundError extends CLIError {
  constructor(command: string) {
    super(`Command not found: ${command}`, 'COMMAND_NOT_FOUND', 127);
  }
}

class InvalidArgumentError extends CLIError {
  constructor(argument: string, reason: string) {
    super(`Invalid argument ${argument}: ${reason}`, 'INVALID_ARGUMENT', 2);
  }
}

class AgentSpawnError extends CLIError {
  constructor(type: string, reason: string) {
    super(`Failed to spawn ${type} agent: ${reason}`, 'AGENT_SPAWN_FAILED', 1);
  }
}
```

### Error Handling Patterns

```typescript
try {
  const result = await cli.executeCommand('agent spawn invalid-type "task"');
} catch (error) {
  if (error instanceof CLIError) {
    console.error(`CLI Error [${error.code}]: ${error.message}`);
    process.exit(error.exitCode);
  } else {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}
```

## Examples

### Complete Application Setup

```typescript
import { createConsolidatedCLI } from 'claude-flow-novice/cli';

async function setupProject() {
  // Create CLI instance
  const cli = createConsolidatedCLI({
    enablePerformanceOptimization: true,
    enableNaturalLanguage: true,
    debugMode: false
  });

  try {
    // Initialize project
    await cli.executeCommand('init web-app --template fullstack --tier development');

    // Spawn development team
    await cli.executeCommand('agent spawn backend-dev "create REST API"');
    await cli.executeCommand('agent spawn frontend-dev "create React UI"');
    await cli.executeCommand('agent spawn tester "write comprehensive tests"');

    // Execute SPARC workflow
    await cli.executeCommand('sparc tdd "user authentication system"');

    // Monitor progress
    const status = await cli.executeCommand('status --format json');
    console.log('Project status:', status.data);

  } catch (error) {
    console.error('Setup failed:', error);
  }
}
```

### Custom Command Extension

```typescript
import { ConsolidatedCLI, CommandHandlers } from 'claude-flow-novice/cli';

class CustomCommandHandlers extends CommandHandlers {
  async handleCustomDeploy(options: DeployOptions): Promise<CommandResult> {
    // Custom deployment logic
    try {
      // Build application
      await this.handleBuild({ optimize: true });

      // Run tests
      await this.executeCommand('agent spawn tester "run deployment tests"');

      // Deploy to staging
      const deployResult = await this.deployToStaging(options);

      return {
        success: true,
        message: 'Deployment successful',
        data: deployResult,
        executionTime: Date.now() - startTime,
        tier: this.tierManager.getCurrentTier()
      };
    } catch (error) {
      return {
        success: false,
        message: `Deployment failed: ${error.message}`,
        error,
        executionTime: Date.now() - startTime,
        tier: this.tierManager.getCurrentTier()
      };
    }
  }
}
```

### Progressive Enhancement Integration

```typescript
import { IntelligentDefaults, UserTier } from 'claude-flow-novice/cli';

async function adaptToUserLevel() {
  const defaults = new IntelligentDefaults();

  // Get user's current tier
  const userTier = await defaults.detectUserTier();

  // Adapt interface based on tier
  switch (userTier) {
    case UserTier.NOVICE:
      // Simplified commands with guidance
      await cli.executeCommand('learn basics');
      await cli.executeCommand('init --guided');
      break;

    case UserTier.DEVELOPMENT:
      // Standard development workflow
      await cli.executeCommand('init --template basic');
      await cli.executeCommand('sparc tdd "feature"');
      break;

    case UserTier.ADVANCED:
      // Advanced features enabled
      await cli.executeCommand('swarm init hierarchical');
      await cli.executeCommand('agent spawn custom-type "complex task"');
      break;

    case UserTier.EXPERT:
      // Full feature access
      await cli.executeCommand('neural train --pattern optimization');
      await cli.executeCommand('hooks enable all');
      break;
  }
}
```

## Integration Patterns

### Express.js Integration

```typescript
import express from 'express';
import { createConsolidatedCLI } from 'claude-flow-novice/cli';

const app = express();
const cli = createConsolidatedCLI();

app.post('/api/agent', async (req, res) => {
  try {
    const { type, task } = req.body;
    const result = await cli.executeCommand(`agent spawn ${type} "${task}"`);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', async (req, res) => {
  const result = await cli.executeCommand('status --format json');
  res.json(result.data);
});
```

### React Hook Integration

```typescript
import { useEffect, useState } from 'react';
import { createConsolidatedCLI } from 'claude-flow-novice/cli';

export function useClaudeFlow() {
  const [cli, setCli] = useState(null);
  const [status, setStatus] = useState('initializing');

  useEffect(() => {
    const initCli = async () => {
      const instance = createConsolidatedCLI({
        enablePerformanceOptimization: true
      });
      await instance.initialize();
      setCli(instance);
      setStatus('ready');
    };

    initCli();
  }, []);

  const spawnAgent = async (type: string, task: string) => {
    if (!cli) throw new Error('CLI not initialized');
    return await cli.executeCommand(`agent spawn ${type} "${task}"`);
  };

  const getAgentStatus = async () => {
    if (!cli) throw new Error('CLI not initialized');
    return await cli.executeCommand('agent list --format json');
  };

  return { cli, status, spawnAgent, getAgentStatus };
}
```

## Configuration

### CLI Configuration

```typescript
interface ConsolidatedCLIConfig {
  // Performance
  enablePerformanceOptimization?: boolean;
  maxResponseTime?: number;

  // Features
  enableProgressiveDisclosure?: boolean;
  enableNaturalLanguage?: boolean;
  enableBackwardCompatibility?: boolean;

  // Development
  debugMode?: boolean;
  verboseLogging?: boolean;

  // User experience
  tier?: UserTier;
  autoTierProgression?: boolean;
}
```

### Environment Variables

```bash
# Core configuration
CLAUDE_FLOW_TIER=development
CLAUDE_FLOW_DEBUG=true
CLAUDE_FLOW_PERFORMANCE=true

# API configuration
CLAUDE_FLOW_API_KEY=your_api_key
CLAUDE_FLOW_API_URL=https://api.claude-flow.ai

# Feature flags
CLAUDE_FLOW_NEURAL_FEATURES=true
CLAUDE_FLOW_EXPERIMENTAL=false
```

This CLI API reference provides comprehensive coverage of both command-line and programmatic interfaces, enabling developers to integrate Claude Flow into any application or workflow.