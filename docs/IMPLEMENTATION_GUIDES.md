# Implementation Guides

Technical implementation details and architecture patterns.

*Note: The docs/implementation/ folder was empty. This file contains essential implementation patterns extracted from other documentation.*

## Core Architecture

### Service Components
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  API Gateway    │───▶│ Orchestrator    │───▶│  Agent Registry │
│   :8000         │    │   :8080         │    │   :8081         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │  Flow Engine    │    │  Context Store  │
│                 │    │                 │    │   (Redis)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘

### Database Schema
-- Tasks table
CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  description TEXT,
  status TEXT,
  current_phase TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Agents table
CREATE TABLE agents (
  agent_id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_type TEXT,
  status TEXT,
  spawned_at TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

-- Results table
CREATE TABLE results (
  result_id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  output TEXT,
  confidence REAL,
  created_at TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id),
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

## Agent Implementation

### Base Agent Structure
abstract class BaseAgent {
  abstract readonly agentType: string;
  abstract readonly capabilities: string[];
  
  async execute(context: TaskContext): Promise<AgentResult> {
    const taskContext = await this.loadContext(context);
    const result = await this.performTask(taskContext);
    const validation = await this.validateResult(result);
    await this.storeResult(result, validation);
    return result;
  }
  
  protected abstract performTask(context: TaskContext): Promise<any>;
}

### Communication Protocol
interface AgentMessage {
  messageId: string;
  agentId: string;
  messageType: 'task' | 'status' | 'result' | 'error';
  payload: any;
  timestamp: string;
  correlationKey: string;
}

await coordinationManager.publish({
  topic: `agent:${agentId}:status`,
  message: {
    messageType: 'status',
    payload: {status: 'working', progress: 0.5},
    correlationKey: task.correlationKey
  }
});

## Flow Engine Implementation

### Loop Phases
class CFNLoop {
  async execute(task: Task): Promise<LoopResult> {
    const implementationResults = await this.loop3(task);
    const gatePassed = await this.checkGate(implementationResults);
    if (!gatePassed) {
      return this.iterateLoop3(task);
    }
    const validationResults = await this.loop2(task, implementationResults);
    const decision = await this.productOwnerReview(validationResults);
    return this.handleDecision(decision);
  }
}

### Consensus Collection
interface ConsensusResult {
  taskId: string;
  status: 'passed' | 'failed' | 'pending';
  averageConfidence: number;
  responses: ValidatorResponse[];
  threshold: number;
}

async collectConsensus(taskId: string, validators: string[]): Promise<ConsensusResult> {
  const responses = await Promise.all(
    validators.map(validatorId => 
      this.requestValidation(taskId, validatorId)
    )
  );
  
  const averageConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
  
  return {
    taskId,
    status: averageConfidence >= this.threshold ? 'passed' : 'failed',
    averageConfidence,
    responses,
    threshold: this.threshold
  };
}

## Memory Management

### Wave-Based Spawning
interface WaveConfig {
  agents: AgentConfig[];
  memoryLimit: number;
  timeout: number;
}

async executeWaves(waves: WaveConfig[]): Promise<void> {
  for (const wave of waves) {
    const promises = wave.agents.map(agent => 
      this.spawnAgent(agent)
    );
    const results = await Promise.allSettled(promises);
    await this.cleanupWave(results);
    const memoryUsage = await this.getMemoryUsage();
    if (memoryUsage > wave.memoryLimit) {
      throw new Error('Memory limit exceeded');
    }
  }
}

## Error Handling

### Multi-Layer Error Recovery
interface ErrorContext {
  errorType: 'crash' | 'timeout' | 'system';
  agentId: string;
  taskId: string;
  originalError: Error;
  retryCount: number;
}

async handleError(context: ErrorContext): Promise<ErrorResolution> {
  switch (context.errorType) {
    case 'crash':
      return await this.handleCrash(context);
    case 'timeout':
      return await this.handleTimeout(context);
    case 'system':
      return await this.handleSystemError(context);
  }
}

async handleCrash(context: ErrorContext): Promise<ErrorResolution> {
  const processExists = await this.checkProcess(context.agentId);
  
  if (!processExists) {
    return await this.restartAgent(context);
  }
  
  await this.killProcess(context.agentId);
  return await this.restartAgent(context);
}

## Configuration Management

### Environment Variables
CFN_MODE=standard|enterprise|mvp
CFN_REDIS_URL=redis://localhost:6379
CFN_DATABASE_URL=sqlite:///data/cfn.db
CFN_CUSTOM_ROUTING=true
CFN_DEFAULT_PROVIDER=kimi
CFN_FALLBACK_PROVIDER=zai
CFN_MAX_AGENTS=10
CFN_MEMORY_LIMIT=40g
CFN_TIMEOUT_SECONDS=300
COMPOSE_PROJECT_NAME=cfn-${BRANCH}
CFN_REDIS_PORT=6379
CFN_POSTGRES_PORT=5432

### Skill Loader Architecture
interface SkillManifest {
  name: string;
  version: string;
  description: string;
  environment: string[];
  outputFormat: 'json' | 'text' | 'markdown';
  timeout: number;
  dependencies?: string[];
}

class SkillLoader {
  async loadSkill(skillPath: string): Promise<SkillManifest> {
    const content = await fs.readFile(skillPath, 'utf8');
    const manifest = this.extractManifest(content);
    await this.validateManifest(manifest);
    if (manifest.dependencies) {
      await this.loadDependencies(manifest.dependencies);
    }
    return manifest;
  }
}