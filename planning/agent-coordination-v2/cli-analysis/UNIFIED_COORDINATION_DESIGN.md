# Unified Coordination Design: CLI + SDK Hybrid Architecture

**Version:** 1.0
**Date:** 2025-10-02
**Author:** Architect Agent
**Status:** Design Complete - Ready for Implementation

---

## Executive Summary

This document defines a unified configuration system that allows seamless switching between CLI-based coordination and SDK-based coordination modes. The architecture provides a single, consistent API regardless of the underlying coordination backend, enabling users to start with free CLI coordination and upgrade to SDK coordination without code changes.

**Key Design Principles:**
1. **Zero Configuration for CLI Mode** - Works out of the box with Claude Code subscription
2. **Simple Environment Variables for SDK Mode** - Add API credentials when ready
3. **Identical API Surface** - Same TypeScript interfaces for both modes
4. **Graceful Degradation** - Auto-fallback if SDK unavailable
5. **Feature Parity Matrix** - Clear documentation of what works where

---

## 1. Configuration Schema

### 1.1 Complete Configuration Structure

```json
{
  "coordination": {
    "mode": "auto",
    "fallbackMode": "cli",
    "cli": {
      "enabled": true,
      "poolSize": 5,
      "maxConcurrent": 20,
      "checkpointInterval": 30,
      "stateBackend": "tmpfs",
      "communicationStrategy": "hybrid",
      "resourceLimits": {
        "cpu": "50%",
        "memory": "1GB",
        "timeout": 3600
      },
      "healthCheck": {
        "enabled": true,
        "interval": 10,
        "retries": 3
      }
    },
    "sdk": {
      "enabled": false,
      "provider": "anthropic",
      "baseUrl": null,
      "apiKey": null,
      "model": "claude-sonnet-4-5",
      "sessionForkingEnabled": true,
      "pauseResumeEnabled": true,
      "checkpointStrategy": "message-uuid",
      "mcpServers": {},
      "proxy": {
        "enabled": false,
        "url": null,
        "mockRateLimits": true,
        "translateToolUse": true
      }
    },
    "hybrid": {
      "enabled": false,
      "coordinationMode": "sdk",
      "inferenceMode": "cli",
      "proxyConfig": {
        "port": 8000,
        "providers": ["openrouter", "ollama"]
      }
    }
  },
  "features": {
    "pauseResume": "auto",
    "sessionForking": "auto",
    "hierarchicalSpawning": true,
    "consensusValidation": true,
    "memoryPersistence": true
  },
  "performance": {
    "spawnStrategy": "pool",
    "contextSharing": true,
    "stateDeduplication": true,
    "parallelExecution": true
  },
  "debug": {
    "logLevel": "info",
    "traceCoordination": false,
    "metricsEnabled": true,
    "checkpointHistory": 10
  }
}
```

### 1.2 Environment Variable Overrides

```bash
# Mode Selection
CFN_COORDINATION_MODE=auto|cli|sdk|hybrid

# CLI Mode Settings
CFN_CLI_POOL_SIZE=5
CFN_CLI_MAX_CONCURRENT=20
CFN_CLI_CHECKPOINT_INTERVAL=30

# SDK Mode Settings
CFN_SDK_PROVIDER=anthropic|openrouter|ollama|deepseek
CFN_SDK_BASE_URL=http://localhost:8000
CFN_SDK_API_KEY=sk-xxx
CFN_SDK_MODEL=claude-sonnet-4-5

# Hybrid Mode
CFN_HYBRID_COORDINATION=sdk
CFN_HYBRID_INFERENCE=openrouter
CFN_HYBRID_PROXY_PORT=8000

# Feature Flags
CFN_PAUSE_RESUME=true|false
CFN_SESSION_FORKING=true|false
```

### 1.3 Auto-Detection Logic

```typescript
interface DetectionResult {
  recommendedMode: 'cli' | 'sdk' | 'hybrid';
  availableFeatures: Feature[];
  warnings: string[];
  capabilities: Capabilities;
}

async function detectOptimalMode(): Promise<DetectionResult> {
  const checks = {
    hasApiKey: !!process.env.ANTHROPIC_API_KEY || !!process.env.CFN_SDK_API_KEY,
    hasCliSubscription: await checkClaudeCodeAvailable(),
    hasProxySetup: await checkProxyAvailable(process.env.CFN_SDK_BASE_URL),
    sdkInstalled: await checkPackageInstalled('@anthropic-ai/claude-code'),
    systemResources: await checkSystemCapabilities()
  };

  // Decision tree
  if (checks.hasApiKey && checks.sdkInstalled) {
    return {
      recommendedMode: 'sdk',
      availableFeatures: ['pause', 'resume', 'session-forking', 'fast-spawn'],
      warnings: [],
      capabilities: { spawnTime: 50, stateManagement: 'server-side' }
    };
  }

  if (checks.hasProxySetup && checks.sdkInstalled) {
    return {
      recommendedMode: 'hybrid',
      availableFeatures: ['pause', 'resume', 'session-forking', 'alternative-models'],
      warnings: ['Using proxy for inference - some features may degrade'],
      capabilities: { spawnTime: 100, stateManagement: 'hybrid' }
    };
  }

  if (checks.hasCliSubscription) {
    return {
      recommendedMode: 'cli',
      availableFeatures: ['checkpointing', 'state-persistence', 'process-pool'],
      warnings: ['Pause/resume via checkpoint-restore, no session forking'],
      capabilities: { spawnTime: 200, stateManagement: 'file-based' }
    };
  }

  throw new Error('No coordination mode available - need CLI subscription or API key');
}
```

---

## 2. Abstraction Layer Design

### 2.1 Core Coordination Interface

```typescript
/**
 * Unified coordination interface - works with both CLI and SDK backends
 */
interface ICoordinator {
  // Agent Lifecycle
  spawnAgent(config: AgentSpawnConfig): Promise<Agent>;
  pauseAgent(agentId: string): Promise<void>;
  resumeAgent(agentId: string, instruction?: string): Promise<Agent>;
  terminateAgent(agentId: string): Promise<void>;

  // State Management
  createCheckpoint(agentId: string): Promise<Checkpoint>;
  restoreCheckpoint(checkpointId: string): Promise<Agent>;
  getAgentState(agentId: string): Promise<AgentState>;

  // Communication
  sendMessage(from: string, to: string, message: Message): Promise<void>;
  broadcastMessage(from: string, message: Message): Promise<void>;
  subscribeToEvents(topic: string, handler: EventHandler): Subscription;

  // Coordination
  waitForConsensus(agentIds: string[], threshold: number): Promise<ConsensusResult>;
  synchronizeState(agentIds: string[]): Promise<void>;
  orchestrateWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult>;

  // Monitoring
  getMetrics(): Promise<CoordinationMetrics>;
  getAgentHealth(agentId: string): Promise<HealthStatus>;
  listActiveAgents(): Promise<Agent[]>;
}

/**
 * Agent spawn configuration
 */
interface AgentSpawnConfig {
  agentId?: string;
  agentType: string;
  task: string | Task;
  parentId?: string;
  context?: Record<string, any>;
  priority?: 'high' | 'normal' | 'low';
  resourceLimits?: ResourceLimits;
  restoreFrom?: string; // Checkpoint ID
}

/**
 * Agent representation
 */
interface Agent {
  id: string;
  type: string;
  status: 'idle' | 'working' | 'paused' | 'blocked' | 'completed';
  progress: number;
  confidence: number;

  // Control methods
  pause(): Promise<void>;
  resume(instruction?: string): Promise<void>;
  injectContext(context: Record<string, any>): Promise<void>;
  getState(): Promise<AgentState>;
  createCheckpoint(): Promise<Checkpoint>;

  // Communication
  sendMessage(to: string, message: Message): Promise<void>;
  onMessage(handler: (msg: Message) => void): void;

  // Monitoring
  onProgress(handler: (progress: number) => void): void;
  onStateChange(handler: (state: AgentState) => void): void;
}

/**
 * Checkpoint structure
 */
interface Checkpoint {
  id: string;
  agentId: string;
  timestamp: number;
  state: AgentState;
  canResume: boolean;
  metadata: Record<string, any>;
}

/**
 * Agent state
 */
interface AgentState {
  phase: string;
  taskQueue: Task[];
  completedTasks: Task[];
  workingContext: WorkingContext;
  metrics: {
    confidence: number;
    progress: number;
    tokensUsed?: number;
    timeElapsed: number;
  };
}
```

### 2.2 Implementation Classes

```typescript
/**
 * CLI-based coordinator implementation
 */
class CLICoordinator implements ICoordinator {
  private poolManager: AgentPoolManager;
  private stateManager: StateManager;
  private eventBus: EventBus;
  private processMonitor: ProcessMonitor;

  constructor(config: CLIConfig) {
    this.poolManager = new AgentPoolManager(config.poolSize);
    this.stateManager = new StateManager('/dev/shm/cfn/state');
    this.eventBus = new EventBus('/tmp/cfn/events');
    this.processMonitor = new ProcessMonitor();
  }

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // Use process pool for fast spawning
    const worker = await this.poolManager.acquireWorker();

    // Restore from checkpoint if specified
    if (config.restoreFrom) {
      const checkpoint = await this.stateManager.getCheckpoint(config.restoreFrom);
      await worker.restore(checkpoint);
    }

    // Assign task to worker
    const agent = await worker.assignTask({
      agentId: config.agentId || generateId(),
      type: config.agentType,
      task: config.task,
      context: config.context
    });

    // Register for health monitoring
    this.processMonitor.register(agent.id, worker.pid);

    return new CLIAgent(agent, this.stateManager, this.eventBus);
  }

  async pauseAgent(agentId: string): Promise<void> {
    // CLI pause = checkpoint + SIGSTOP
    const checkpoint = await this.createCheckpoint(agentId);
    const pid = this.processMonitor.getPid(agentId);

    process.kill(pid, 'SIGSTOP');

    await this.stateManager.setState(agentId, 'paused', {
      checkpointId: checkpoint.id,
      pausedAt: Date.now()
    });
  }

  async resumeAgent(agentId: string, instruction?: string): Promise<Agent> {
    const state = await this.stateManager.getState(agentId);

    if (state.status === 'paused') {
      // Resume from SIGSTOP
      const pid = this.processMonitor.getPid(agentId);

      if (instruction) {
        // Inject new instruction before resume
        await this.stateManager.injectInstruction(agentId, instruction);
      }

      process.kill(pid, 'SIGCONT');

      await this.stateManager.setState(agentId, 'working');

      return new CLIAgent({ id: agentId }, this.stateManager, this.eventBus);
    } else {
      // Warm restart from checkpoint
      const checkpoint = await this.stateManager.getCheckpoint(state.checkpointId);
      return this.spawnAgent({
        agentId,
        agentType: checkpoint.agentType,
        task: checkpoint.taskQueue[0],
        restoreFrom: checkpoint.id,
        context: instruction ? { newInstruction: instruction } : {}
      });
    }
  }

  async createCheckpoint(agentId: string): Promise<Checkpoint> {
    // Request checkpoint via signal
    const pid = this.processMonitor.getPid(agentId);
    process.kill(pid, 'SIGUSR1'); // Agent handles checkpoint

    // Wait for checkpoint file
    const checkpoint = await this.stateManager.waitForCheckpoint(agentId, 5000);
    return checkpoint;
  }

  async waitForConsensus(agentIds: string[], threshold: number): Promise<ConsensusResult> {
    // Collect all agent states
    const states = await Promise.all(
      agentIds.map(id => this.stateManager.getState(id))
    );

    // Byzantine consensus voting
    const votes = states.map(s => s.deliverable);
    const consensus = computeByzantineConsensus(votes, threshold);

    return {
      agreed: consensus.agreement >= threshold,
      consensus: consensus.result,
      votes: consensus.votes,
      confidence: consensus.confidence
    };
  }

  // ... other methods
}

/**
 * SDK-based coordinator implementation
 */
class SDKCoordinator implements ICoordinator {
  private client: ClaudeCodeSDK;
  private sessions: Map<string, Query>;
  private checkpoints: Map<string, string>; // agentId -> messageUUID

  constructor(config: SDKConfig) {
    this.client = new ClaudeCodeSDK({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      model: config.model
    });
    this.sessions = new Map();
    this.checkpoints = new Map();
  }

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    const options: QueryOptions = {
      forkSession: !!config.parentId, // Fork from parent if exists
      model: config.model,
      mcpServers: config.mcpServers || {}
    };

    // Restore from checkpoint if specified
    if (config.restoreFrom) {
      options.resumeSessionAt = this.checkpoints.get(config.restoreFrom);
    }

    const query = this.client.query({
      prompt: this.buildPrompt(config),
      options
    });

    const agentId = config.agentId || generateId();
    this.sessions.set(agentId, query);

    return new SDKAgent(agentId, query, this.checkpoints);
  }

  async pauseAgent(agentId: string): Promise<void> {
    const query = this.sessions.get(agentId);
    if (!query) throw new Error(`Agent ${agentId} not found`);

    // SDK native pause
    await query.interrupt();

    // Store current message UUID as checkpoint
    const lastMessage = await query.getLastMessage();
    this.checkpoints.set(agentId, lastMessage.uuid);
  }

  async resumeAgent(agentId: string, instruction?: string): Promise<Agent> {
    const checkpointUUID = this.checkpoints.get(agentId);
    if (!checkpointUUID) throw new Error(`No checkpoint for agent ${agentId}`);

    // Resume from checkpoint with optional new instruction
    const query = this.client.query({
      prompt: instruction || '',
      options: {
        resumeSessionAt: checkpointUUID
      }
    });

    this.sessions.set(agentId, query);

    return new SDKAgent(agentId, query, this.checkpoints);
  }

  async createCheckpoint(agentId: string): Promise<Checkpoint> {
    const query = this.sessions.get(agentId);
    const lastMessage = await query.getLastMessage();

    this.checkpoints.set(agentId, lastMessage.uuid);

    return {
      id: lastMessage.uuid,
      agentId,
      timestamp: Date.now(),
      state: await this.extractStateFromMessage(lastMessage),
      canResume: true,
      metadata: { messageUUID: lastMessage.uuid }
    };
  }

  // ... other methods
}

/**
 * Hybrid coordinator - SDK coordination + proxy inference
 */
class HybridCoordinator implements ICoordinator {
  private sdkCoordinator: SDKCoordinator;
  private proxyManager: ProxyManager;

  constructor(config: HybridConfig) {
    // Setup proxy for alternative inference
    this.proxyManager = new ProxyManager(config.proxyConfig);

    // Configure SDK to use proxy
    const sdkConfig = {
      ...config.sdk,
      baseUrl: `http://localhost:${config.proxyConfig.port}`,
      apiKey: config.proxyConfig.apiKey
    };

    this.sdkCoordinator = new SDKCoordinator(sdkConfig);
  }

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // Route through proxy for inference, SDK handles coordination
    return this.sdkCoordinator.spawnAgent({
      ...config,
      model: `${config.inferenceProvider}/${config.model}`
    });
  }

  // Delegate all methods to SDK coordinator
  async pauseAgent(agentId: string): Promise<void> {
    return this.sdkCoordinator.pauseAgent(agentId);
  }

  async resumeAgent(agentId: string, instruction?: string): Promise<Agent> {
    return this.sdkCoordinator.resumeAgent(agentId, instruction);
  }

  // ... other delegated methods
}
```

### 2.3 Factory Pattern for Mode Selection

```typescript
/**
 * Coordinator factory - auto-selects mode based on config/environment
 */
class CoordinatorFactory {
  static async create(config?: Partial<CoordinationConfig>): Promise<ICoordinator> {
    // Merge config with defaults and environment
    const fullConfig = this.mergeConfig(config);

    // Auto-detect mode if set to 'auto'
    if (fullConfig.mode === 'auto') {
      const detection = await detectOptimalMode();
      fullConfig.mode = detection.recommendedMode;

      console.log(`[CFN] Auto-detected coordination mode: ${fullConfig.mode}`);
      if (detection.warnings.length > 0) {
        detection.warnings.forEach(w => console.warn(`[CFN] ${w}`));
      }
    }

    // Validate mode is available
    await this.validateMode(fullConfig);

    // Create appropriate coordinator
    switch (fullConfig.mode) {
      case 'cli':
        return new CLICoordinator(fullConfig.cli);

      case 'sdk':
        return new SDKCoordinator(fullConfig.sdk);

      case 'hybrid':
        return new HybridCoordinator(fullConfig.hybrid);

      default:
        throw new Error(`Unknown coordination mode: ${fullConfig.mode}`);
    }
  }

  private static mergeConfig(config?: Partial<CoordinationConfig>): CoordinationConfig {
    const defaults = this.loadDefaults();
    const envOverrides = this.loadEnvOverrides();

    return deepMerge(defaults, envOverrides, config || {});
  }

  private static async validateMode(config: CoordinationConfig): Promise<void> {
    switch (config.mode) {
      case 'cli':
        if (!await checkClaudeCodeAvailable()) {
          throw new Error('CLI mode requires Claude Code installation');
        }
        break;

      case 'sdk':
        if (!config.sdk.apiKey) {
          throw new Error('SDK mode requires API key (ANTHROPIC_API_KEY or CFN_SDK_API_KEY)');
        }
        if (!await checkPackageInstalled('@anthropic-ai/claude-code')) {
          throw new Error('SDK mode requires @anthropic-ai/claude-code package');
        }
        break;

      case 'hybrid':
        if (!config.hybrid.proxyConfig?.providers?.length) {
          throw new Error('Hybrid mode requires proxy configuration');
        }
        break;
    }
  }
}

/**
 * Usage - simple and consistent across modes
 */
async function example() {
  // Zero-config - uses auto-detection
  const coordinator = await CoordinatorFactory.create();

  // Spawn agent - same API regardless of mode
  const agent = await coordinator.spawnAgent({
    agentType: 'coder',
    task: 'Implement authentication system'
  });

  // Monitor progress
  agent.onProgress(p => console.log(`Progress: ${p}%`));

  // Pause mid-execution
  await agent.pause();

  // Resume with new instruction
  await agent.resume('Use JWT instead of sessions');

  // Wait for completion
  const result = await agent.getState();
  console.log(result.deliverable);
}
```

---

## 3. Feature Compatibility Matrix

### 3.1 Feature Parity Table

| Feature | CLI Mode | SDK Mode | Hybrid Mode | Notes |
|---------|----------|----------|-------------|-------|
| **Agent Spawning** | ✅ Pool-based (200ms) | ✅ Session fork (50ms) | ✅ Session fork (100ms) | CLI slower but reliable |
| **Pause/Resume** | ⚠️ Checkpoint-based | ✅ Native | ✅ Native | CLI checkpoint+restore, SDK instant |
| **Instruction Injection** | ⚠️ Kill+restart | ✅ Mid-flight | ✅ Mid-flight | CLI loses in-flight work |
| **Session Forking** | ❌ Not supported | ✅ Native | ✅ Native | CLI spawns new process |
| **State Persistence** | ✅ File-based | ✅ Server-side | ✅ Hybrid | CLI uses /dev/shm, SDK server |
| **Checkpointing** | ✅ Automatic (30s) | ✅ Message UUID | ✅ Message UUID | CLI more frequent |
| **Hierarchical Spawning** | ✅ Process tree | ✅ Session nesting | ✅ Session nesting | All support hierarchy |
| **Inter-agent Communication** | ✅ IPC/files | ✅ MCP/events | ✅ MCP/events | CLI uses pipes/sockets |
| **Consensus Validation** | ✅ Byzantine | ✅ Byzantine | ✅ Byzantine | Same algorithm both modes |
| **Resource Limits** | ✅ cgroups | ⚠️ API limits | ⚠️ API limits | CLI better resource control |
| **Health Monitoring** | ✅ Process-based | ⚠️ API status | ⚠️ API status | CLI monitors PIDs |
| **Cost** | $0 (CLI sub) | $3-15/MTok | $0.30-3/MTok | Hybrid cheapest with API |
| **Latency** | 200-500ms | 50-200ms | 100-300ms | SDK fastest |
| **Max Agents** | 20-30 | 50+ | 50+ | CLI limited by system resources |
| **Provider Choice** | Claude only | Anthropic only | 200+ models | Hybrid supports all providers |

### 3.2 Feature Detection API

```typescript
interface FeatureSupport {
  pauseResume: 'native' | 'checkpoint' | 'none';
  sessionForking: 'native' | 'process' | 'none';
  instructionInjection: 'native' | 'restart' | 'none';
  maxConcurrentAgents: number;
  avgSpawnTime: number;
  stateManagement: 'file' | 'server' | 'hybrid';
  resourceLimits: boolean;
  providerChoice: boolean;
}

class Coordinator {
  getFeatureSupport(): FeatureSupport {
    // Each implementation returns its capabilities
    return {
      pauseResume: this.mode === 'sdk' ? 'native' : 'checkpoint',
      sessionForking: this.mode === 'sdk' ? 'native' : 'process',
      instructionInjection: this.mode === 'sdk' ? 'native' : 'restart',
      maxConcurrentAgents: this.mode === 'cli' ? 20 : 50,
      avgSpawnTime: this.mode === 'cli' ? 200 : 50,
      stateManagement: this.getStateManagement(),
      resourceLimits: this.mode === 'cli',
      providerChoice: this.mode === 'hybrid'
    };
  }

  async ensureFeature(feature: keyof FeatureSupport): Promise<void> {
    const support = this.getFeatureSupport();

    if (!support[feature] || support[feature] === 'none') {
      throw new Error(
        `Feature '${feature}' not available in ${this.mode} mode. ` +
        `Consider using ${this.recommendModeForFeature(feature)} mode.`
      );
    }
  }
}
```

---

## 4. User Migration Guide

### 4.1 Starting with CLI (Free Tier)

**Step 1: Install claude-flow-novice**
```bash
npm install -g claude-flow-novice
```

**Step 2: Initialize project**
```bash
npx claude-flow-novice init my-project
cd my-project
```

**Step 3: Use CLI coordination (zero config)**
```typescript
import { CoordinatorFactory } from 'claude-flow-novice';

// Auto-detects CLI mode (no API key)
const coordinator = await CoordinatorFactory.create();

const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build REST API'
});

// Works with CLI subscription - no API costs
```

**Configuration (optional tuning):**
```json
{
  "coordination": {
    "mode": "cli",
    "cli": {
      "poolSize": 3,
      "checkpointInterval": 60
    }
  }
}
```

### 4.2 Upgrading to SDK (API Credits)

**Step 1: Add API key**
```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
```

**Step 2: Install SDK package**
```bash
npm install @anthropic-ai/claude-code
```

**Step 3: Update config (or use auto-detect)**
```json
{
  "coordination": {
    "mode": "sdk",
    "sdk": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5"
    }
  }
}
```

**Step 4: Same code, better performance**
```typescript
// NO CODE CHANGES NEEDED
const coordinator = await CoordinatorFactory.create();

// Now uses SDK - 4x faster spawning, native pause/resume
const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build REST API'
});

// New capabilities available
await agent.pause(); // Instant pause, not checkpoint
await agent.resume('Add rate limiting'); // Mid-flight injection
```

### 4.3 Cost Optimization with Hybrid Mode

**Step 1: Setup proxy for alternative models**
```bash
npm install -g claude-code-router
claude-code-router init
```

**Step 2: Configure proxy**
```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx",
      "baseURL": "https://openrouter.ai/api/v1"
    }
  }
}
```

**Step 3: Start proxy**
```bash
claude-code-router --port 8000
```

**Step 4: Use hybrid mode**
```bash
export CFN_COORDINATION_MODE=hybrid
export CFN_SDK_BASE_URL=http://localhost:8000
export CFN_SDK_MODEL=openrouter/google/gemini-2.5-pro
```

```typescript
// Same API, 60-90% cost savings
const coordinator = await CoordinatorFactory.create();

// Uses Gemini via OpenRouter, SDK coordination features intact
const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build REST API'
});
```

### 4.4 Migration Checklist

**From CLI to SDK:**
- ✅ Add `ANTHROPIC_API_KEY` environment variable
- ✅ Install `@anthropic-ai/claude-code` package
- ✅ Update config `mode: "sdk"` (or use auto-detect)
- ✅ No code changes required
- ✅ Test with single agent first
- ✅ Monitor API costs

**From SDK to Hybrid (cost savings):**
- ✅ Install `claude-code-router`
- ✅ Configure proxy with provider credentials
- ✅ Start proxy daemon
- ✅ Set `CFN_SDK_BASE_URL` to proxy
- ✅ Update model to `provider/model-name` format
- ✅ No code changes required

**Rollback Plan:**
- CLI config always available as fallback
- Change `mode: "cli"` in config
- Or `export CFN_COORDINATION_MODE=cli`
- Works immediately without API

---

## 5. Implementation Examples

### 5.1 Mode-Agnostic Agent Usage

```typescript
/**
 * This code works identically in CLI, SDK, or Hybrid mode
 */
async function buildFeature() {
  const coordinator = await CoordinatorFactory.create();

  // Spawn architect agent
  const architect = await coordinator.spawnAgent({
    agentType: 'architect',
    task: 'Design microservices architecture for e-commerce platform'
  });

  // Wait for architecture
  architect.onProgress(p => console.log(`Architecture design: ${p}%`));
  const archState = await architect.waitForCompletion();

  // Spawn implementation swarm
  const coders = await Promise.all([
    coordinator.spawnAgent({
      agentType: 'backend-dev',
      task: 'Implement user service based on architecture',
      context: archState.deliverable,
      parentId: architect.id
    }),
    coordinator.spawnAgent({
      agentType: 'backend-dev',
      task: 'Implement product service based on architecture',
      context: archState.deliverable,
      parentId: architect.id
    }),
    coordinator.spawnAgent({
      agentType: 'frontend-dev',
      task: 'Build React UI based on architecture',
      context: archState.deliverable,
      parentId: architect.id
    })
  ]);

  // Monitor all agents
  const progressBar = new ProgressBar(coders.length);
  coders.forEach((agent, i) => {
    agent.onProgress(p => progressBar.update(i, p));
  });

  // Pause all on user request
  process.on('SIGINT', async () => {
    console.log('Pausing all agents...');
    await Promise.all(coders.map(a => a.pause()));

    // Save session
    const checkpoints = await Promise.all(
      coders.map(a => coordinator.createCheckpoint(a.id))
    );

    fs.writeFileSync('session.json', JSON.stringify(checkpoints));
    process.exit(0);
  });

  // Wait for consensus
  const consensus = await coordinator.waitForConsensus(
    coders.map(a => a.id),
    0.9
  );

  if (!consensus.agreed) {
    // Inject feedback to disagreeing agents
    const outliers = findOutliers(consensus.votes);
    await Promise.all(outliers.map(agentId =>
      coordinator.resumeAgent(agentId, `Other agents disagree, review: ${consensus.consensus}`)
    ));
  }

  // Final validation
  const validator = await coordinator.spawnAgent({
    agentType: 'security-specialist',
    task: 'Security audit of implementation',
    context: consensus.result
  });

  return validator.waitForCompletion();
}
```

### 5.2 Dynamic Mode Switching

```typescript
/**
 * Switch modes at runtime based on conditions
 */
class AdaptiveCoordinator {
  private coordinator: ICoordinator;
  private currentMode: CoordinationMode;

  async initialize() {
    // Start with CLI (free)
    this.coordinator = await CoordinatorFactory.create({ mode: 'cli' });
    this.currentMode = 'cli';
  }

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // Check if we should upgrade mode
    if (this.shouldUpgradeMode(config)) {
      await this.switchMode('sdk');
    }

    return this.coordinator.spawnAgent(config);
  }

  private shouldUpgradeMode(config: AgentSpawnConfig): boolean {
    // Upgrade to SDK for:
    // 1. High-priority tasks
    // 2. Tasks requiring pause/resume
    // 3. Tasks with tight deadlines

    if (config.priority === 'high') return true;
    if (config.features?.includes('pause-resume')) return true;
    if (config.deadline && (config.deadline - Date.now()) < 3600000) return true;

    return false;
  }

  private async switchMode(newMode: CoordinationMode) {
    if (newMode === this.currentMode) return;

    console.log(`Switching coordination mode: ${this.currentMode} -> ${newMode}`);

    // Checkpoint all agents in current mode
    const agents = await this.coordinator.listActiveAgents();
    const checkpoints = await Promise.all(
      agents.map(a => this.coordinator.createCheckpoint(a.id))
    );

    // Create new coordinator
    this.coordinator = await CoordinatorFactory.create({ mode: newMode });
    this.currentMode = newMode;

    // Restore agents in new mode
    await Promise.all(checkpoints.map(cp =>
      this.coordinator.restoreCheckpoint(cp.id)
    ));

    console.log(`Mode switch complete: ${agents.length} agents migrated`);
  }
}
```

### 5.3 Provider-Specific Optimization

```typescript
/**
 * Optimize costs by routing to different providers
 */
class CostOptimizedCoordinator {
  private hybridCoordinator: ICoordinator;
  private providerCosts = {
    'anthropic/claude-opus-4-1': { input: 15, output: 75 },
    'anthropic/claude-sonnet-4-5': { input: 3, output: 15 },
    'openrouter/google/gemini-2.5-pro': { input: 1.25, output: 5 },
    'openrouter/anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
    'ollama/llama-3.3-70b': { input: 0, output: 0 }
  };

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // Select provider based on task complexity and budget
    const provider = this.selectProvider(config);

    return this.hybridCoordinator.spawnAgent({
      ...config,
      model: provider
    });
  }

  private selectProvider(config: AgentSpawnConfig): string {
    const complexity = this.estimateComplexity(config.task);
    const sensitive = config.metadata?.sensitive || false;

    // Local model for sensitive tasks
    if (sensitive) {
      return 'ollama/llama-3.3-70b';
    }

    // Route by complexity
    if (complexity > 0.8) {
      return 'anthropic/claude-opus-4-1'; // Best quality
    } else if (complexity > 0.5) {
      return 'openrouter/google/gemini-2.5-pro'; // Good balance
    } else {
      return 'anthropic/claude-sonnet-4-5'; // Fast and cheap
    }
  }

  private estimateComplexity(task: string): number {
    // Simple heuristic - can be ML model
    const complexityMarkers = [
      'architecture', 'design', 'security', 'performance',
      'distributed', 'scalability', 'optimization'
    ];

    const matches = complexityMarkers.filter(m =>
      task.toLowerCase().includes(m)
    ).length;

    return Math.min(matches / complexityMarkers.length, 1);
  }

  async estimateCost(config: AgentSpawnConfig): Promise<number> {
    const provider = this.selectProvider(config);
    const costs = this.providerCosts[provider];

    // Rough estimation
    const estimatedInputTokens = config.task.length * 1.3;
    const estimatedOutputTokens = estimatedInputTokens * 0.5;

    return (
      (estimatedInputTokens / 1_000_000) * costs.input +
      (estimatedOutputTokens / 1_000_000) * costs.output
    );
  }
}
```

---

## 6. Error Handling & Graceful Degradation

### 6.1 Fallback Strategy

```typescript
class ResilientCoordinator implements ICoordinator {
  private primary: ICoordinator;
  private fallback: ICoordinator;
  private mode: 'primary' | 'fallback' = 'primary';

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    try {
      return await this.primary.spawnAgent(config);
    } catch (error) {
      console.warn(`Primary coordinator failed: ${error.message}`);
      console.log('Falling back to CLI mode...');

      this.mode = 'fallback';
      return await this.fallback.spawnAgent(config);
    }
  }

  async pauseAgent(agentId: string): Promise<void> {
    const coordinator = this.mode === 'primary' ? this.primary : this.fallback;

    try {
      await coordinator.pauseAgent(agentId);
    } catch (error) {
      if (this.mode === 'primary') {
        // Try checkpoint-based pause in fallback
        console.warn('Native pause failed, using checkpoint-based pause');
        await this.fallback.createCheckpoint(agentId);
        // Kill agent process (CLI only)
        await this.killAgentProcess(agentId);
      } else {
        throw error;
      }
    }
  }
}
```

### 6.2 Error Translation

```typescript
class CoordinatorErrorHandler {
  static async wrap<T>(
    fn: () => Promise<T>,
    mode: CoordinationMode
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const translated = this.translateError(error, mode);
      throw translated;
    }
  }

  private static translateError(error: Error, mode: CoordinationMode): Error {
    // SDK-specific errors
    if (error.message.includes('rate limit')) {
      return new CoordinationError(
        'Rate limit exceeded',
        'RATE_LIMIT',
        {
          suggestion: mode === 'sdk'
            ? 'Consider switching to hybrid mode with OpenRouter'
            : 'CLI mode has no rate limits',
          canRetry: true,
          retryAfter: 3600
        }
      );
    }

    if (error.message.includes('API key')) {
      return new CoordinationError(
        'Invalid API key',
        'AUTH_FAILED',
        {
          suggestion: 'Set ANTHROPIC_API_KEY or switch to CLI mode',
          canRetry: false
        }
      );
    }

    // CLI-specific errors
    if (error.message.includes('ENOSPC')) {
      return new CoordinationError(
        'Insufficient disk space for checkpoints',
        'STORAGE_FULL',
        {
          suggestion: 'Clean up /dev/shm or /tmp/claude-flow-novice',
          canRetry: true
        }
      );
    }

    return error;
  }
}
```

---

## 7. NPM Package Structure

### 7.1 Package Organization

```
claude-flow-novice/
├── package.json
├── src/
│   ├── index.ts                      # Main exports
│   ├── coordination/
│   │   ├── factory.ts                # CoordinatorFactory
│   │   ├── interface.ts              # ICoordinator interface
│   │   ├── cli/
│   │   │   ├── coordinator.ts        # CLICoordinator
│   │   │   ├── agent-pool.ts         # Agent pool manager
│   │   │   ├── state-manager.ts      # State persistence
│   │   │   ├── event-bus.ts          # IPC event bus
│   │   │   └── process-monitor.ts    # Health monitoring
│   │   ├── sdk/
│   │   │   ├── coordinator.ts        # SDKCoordinator
│   │   │   ├── session-manager.ts    # Session forking
│   │   │   └── checkpoint.ts         # Message UUID checkpoints
│   │   └── hybrid/
│   │       ├── coordinator.ts        # HybridCoordinator
│   │       └── proxy-manager.ts      # Provider proxy
│   ├── agents/
│   │   ├── cli-agent.ts              # CLI agent wrapper
│   │   ├── sdk-agent.ts              # SDK agent wrapper
│   │   └── base-agent.ts             # Abstract agent
│   ├── config/
│   │   ├── schema.ts                 # Config types
│   │   ├── defaults.ts               # Default config
│   │   └── validation.ts             # Config validation
│   └── utils/
│       ├── detection.ts              # Auto mode detection
│       ├── errors.ts                 # Error handling
│       └── metrics.ts                # Performance tracking
├── cli/
│   └── coordination-scripts/         # Bash coordination layer
│       ├── agent-pool.sh
│       ├── state-manager.sh
│       └── event-bus.sh
└── test/
    ├── cli-mode.test.ts
    ├── sdk-mode.test.ts
    ├── hybrid-mode.test.ts
    └── migration.test.ts
```

### 7.2 Package.json Configuration

```json
{
  "name": "claude-flow-novice",
  "version": "2.0.0",
  "description": "Unified AI agent coordination - works with CLI or SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "claude-flow-novice": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:cli": "CFN_COORDINATION_MODE=cli jest",
    "test:sdk": "CFN_COORDINATION_MODE=sdk jest",
    "test:hybrid": "CFN_COORDINATION_MODE=hybrid jest"
  },
  "dependencies": {
    "@anthropic-ai/claude-code": "^0.1.0"
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": "^0.32.0"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": {
      "optional": true
    },
    "@anthropic-ai/claude-code": {
      "optional": true
    }
  },
  "optionalDependencies": {
    "claude-code-router": "^1.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "ai-agents",
    "claude-code",
    "coordination",
    "multi-agent",
    "orchestration"
  ]
}
```

### 7.3 Distribution Strategy

**Multiple Entry Points:**
```typescript
// Full package (auto-detects mode)
import { CoordinatorFactory } from 'claude-flow-novice';

// CLI-only (no SDK dependency)
import { CLICoordinator } from 'claude-flow-novice/cli';

// SDK-only (requires API key)
import { SDKCoordinator } from 'claude-flow-novice/sdk';

// Hybrid (requires proxy)
import { HybridCoordinator } from 'claude-flow-novice/hybrid';

// Utilities
import { detectOptimalMode } from 'claude-flow-novice/utils';
```

**Tree-Shaking Support:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./cli": {
      "import": "./dist/coordination/cli/index.mjs",
      "require": "./dist/coordination/cli/index.js",
      "types": "./dist/coordination/cli/index.d.ts"
    },
    "./sdk": {
      "import": "./dist/coordination/sdk/index.mjs",
      "require": "./dist/coordination/sdk/index.js",
      "types": "./dist/coordination/sdk/index.d.ts"
    },
    "./hybrid": {
      "import": "./dist/coordination/hybrid/index.mjs",
      "require": "./dist/coordination/hybrid/index.js",
      "types": "./dist/coordination/hybrid/index.d.ts"
    }
  }
}
```

---

## 8. Testing & Validation

### 8.1 Mode Switching Tests

```typescript
describe('Coordinator Mode Switching', () => {
  test('auto-detects CLI mode without API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const coordinator = await CoordinatorFactory.create();
    expect(coordinator).toBeInstanceOf(CLICoordinator);
  });

  test('auto-detects SDK mode with API key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';

    const coordinator = await CoordinatorFactory.create();
    expect(coordinator).toBeInstanceOf(SDKCoordinator);
  });

  test('uses explicit mode from config', async () => {
    const coordinator = await CoordinatorFactory.create({
      mode: 'cli'
    });

    expect(coordinator).toBeInstanceOf(CLICoordinator);
  });

  test('falls back to CLI on SDK failure', async () => {
    const coordinator = new ResilientCoordinator({
      primary: new SDKCoordinator({ apiKey: 'invalid' }),
      fallback: new CLICoordinator({})
    });

    const agent = await coordinator.spawnAgent({
      agentType: 'test',
      task: 'test task'
    });

    expect(agent).toBeDefined();
    expect(coordinator.mode).toBe('fallback');
  });
});
```

### 8.2 Feature Parity Tests

```typescript
describe('Feature Parity Across Modes', () => {
  const modes: CoordinationMode[] = ['cli', 'sdk', 'hybrid'];

  modes.forEach(mode => {
    describe(`${mode} mode`, () => {
      let coordinator: ICoordinator;

      beforeEach(async () => {
        coordinator = await CoordinatorFactory.create({ mode });
      });

      test('spawns agent', async () => {
        const agent = await coordinator.spawnAgent({
          agentType: 'test',
          task: 'test task'
        });

        expect(agent.id).toBeDefined();
        expect(agent.status).toBe('working');
      });

      test('creates checkpoint', async () => {
        const agent = await coordinator.spawnAgent({
          agentType: 'test',
          task: 'test task'
        });

        const checkpoint = await coordinator.createCheckpoint(agent.id);
        expect(checkpoint.id).toBeDefined();
        expect(checkpoint.canResume).toBe(true);
      });

      test('restores from checkpoint', async () => {
        const agent = await coordinator.spawnAgent({
          agentType: 'test',
          task: 'test task'
        });

        const checkpoint = await coordinator.createCheckpoint(agent.id);

        const restored = await coordinator.restoreCheckpoint(checkpoint.id);
        expect(restored.id).toBe(agent.id);
      });

      test('supports consensus', async () => {
        const agents = await Promise.all([
          coordinator.spawnAgent({ agentType: 'test', task: 'task 1' }),
          coordinator.spawnAgent({ agentType: 'test', task: 'task 2' }),
          coordinator.spawnAgent({ agentType: 'test', task: 'task 3' })
        ]);

        const consensus = await coordinator.waitForConsensus(
          agents.map(a => a.id),
          0.66
        );

        expect(consensus.agreed).toBeDefined();
      });
    });
  });
});
```

### 8.3 Performance Benchmarks

```typescript
describe('Performance Benchmarks', () => {
  test('measures spawn time across modes', async () => {
    const modes: CoordinationMode[] = ['cli', 'sdk', 'hybrid'];
    const results: Record<string, number> = {};

    for (const mode of modes) {
      const coordinator = await CoordinatorFactory.create({ mode });

      const start = Date.now();
      await coordinator.spawnAgent({
        agentType: 'benchmark',
        task: 'test'
      });
      const elapsed = Date.now() - start;

      results[mode] = elapsed;
    }

    console.table(results);

    // Verify SDK is faster
    expect(results.sdk).toBeLessThan(results.cli);
  });

  test('measures checkpoint overhead', async () => {
    const modes: CoordinationMode[] = ['cli', 'sdk'];
    const results: Record<string, number> = {};

    for (const mode of modes) {
      const coordinator = await CoordinatorFactory.create({ mode });
      const agent = await coordinator.spawnAgent({
        agentType: 'test',
        task: 'test'
      });

      const start = Date.now();
      await coordinator.createCheckpoint(agent.id);
      const elapsed = Date.now() - start;

      results[mode] = elapsed;
    }

    console.table(results);
  });
});
```

---

## 9. Documentation & User Guides

### 9.1 Quick Start Examples

**Example 1: Zero Config (CLI Mode)**
```typescript
import { CoordinatorFactory } from 'claude-flow-novice';

// Works immediately with Claude Code subscription
const coordinator = await CoordinatorFactory.create();

const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build authentication API'
});

console.log(await agent.getState());
```

**Example 2: SDK Mode with Environment Variable**
```bash
export ANTHROPIC_API_KEY=sk-ant-xxx
```

```typescript
import { CoordinatorFactory } from 'claude-flow-novice';

// Auto-detects SDK mode
const coordinator = await CoordinatorFactory.create();

const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build authentication API'
});

// Instant pause/resume available
await agent.pause();
await agent.resume('Add OAuth support');
```

**Example 3: Hybrid Mode for Cost Savings**
```bash
# Setup proxy
npm install -g claude-code-router
claude-code-router init
claude-code-router --port 8000 &

# Configure
export CFN_SDK_BASE_URL=http://localhost:8000
export CFN_SDK_MODEL=openrouter/google/gemini-2.5-pro
```

```typescript
import { CoordinatorFactory } from 'claude-flow-novice';

// Uses Gemini via proxy, SDK coordination
const coordinator = await CoordinatorFactory.create();

const agent = await coordinator.spawnAgent({
  agentType: 'coder',
  task: 'Build authentication API'
});

// 60% cost savings vs Anthropic direct
```

### 9.2 Troubleshooting Guide

| Error | Cause | Solution |
|-------|-------|----------|
| `No coordination mode available` | No CLI subscription or API key | Install Claude Code OR add ANTHROPIC_API_KEY |
| `SDK mode requires API key` | API key missing | Set ANTHROPIC_API_KEY environment variable |
| `Rate limit exceeded` | Too many SDK requests | Switch to hybrid mode with OpenRouter |
| `Agent spawn timeout` | CLI pool exhausted | Increase `cli.poolSize` in config |
| `Checkpoint restore failed` | Corrupted checkpoint file | Delete checkpoint and restart agent |
| `Proxy connection refused` | Proxy not running | Start claude-code-router daemon |

---

## 10. Conclusion & Next Steps

### 10.1 Design Summary

This unified coordination design achieves the following goals:

✅ **Single Configuration File** - Users specify mode once, it applies everywhere
✅ **Auto-Detection** - Intelligently selects best mode based on environment
✅ **Common Interface** - `ICoordinator` works identically across all modes
✅ **Zero Config CLI** - Works out-of-box with Claude Code subscription
✅ **Simple SDK Upgrade** - Add API key, no code changes
✅ **Graceful Fallback** - Automatically falls back if SDK unavailable
✅ **Migration Path** - Start CLI → upgrade SDK → optimize with Hybrid

### 10.2 Implementation Roadmap

**Phase 1: Core Abstraction (Week 1)**
- [ ] Implement `ICoordinator` interface
- [ ] Create `CLICoordinator` class
- [ ] Create `SDKCoordinator` class
- [ ] Build `CoordinatorFactory` with auto-detection
- [ ] Write unit tests for each mode

**Phase 2: Hybrid Mode (Week 2)**
- [ ] Implement `HybridCoordinator`
- [ ] Build proxy integration layer
- [ ] Add provider routing logic
- [ ] Test with OpenRouter, Ollama

**Phase 3: Migration Tools (Week 3)**
- [ ] Build checkpoint migration utilities
- [ ] Create mode-switching runtime support
- [ ] Add configuration validation
- [ ] Write migration guide

**Phase 4: Documentation & Release (Week 4)**
- [ ] Complete API documentation
- [ ] Write user migration guide
- [ ] Create example projects
- [ ] Publish NPM package

### 10.3 Success Metrics

**User Experience:**
- 90% of users never need to read docs (auto-detection works)
- <5 minute setup time for CLI mode
- <15 minute setup time for SDK upgrade

**Technical:**
- 100% API compatibility across modes
- <10ms overhead for abstraction layer
- 95% feature parity between modes

**Business:**
- 70% of users start with CLI (free)
- 30% upgrade to SDK within 30 days
- 50% of SDK users adopt hybrid mode for cost savings

---

**Document Status:** ✅ Complete - Ready for Implementation
**Next Action:** Begin Phase 1 implementation with Core Abstraction Layer

---

## Appendix: File Paths

All design documents referenced:
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/agent-coordination-v2/cli-analysis/CLI_COORDINATION_ARCHITECTURE.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/agent-coordination-v2/cli-analysis/SDK_ARCHITECTURE_ANALYSIS.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/agent-coordination-v2/cli-analysis/SDK_PROVIDER_SEPARATION.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/agent-coordination-v2/cli-analysis/INTEGRATION_GUIDE.md`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/agent-coordination-v2/cli-analysis/UNIFIED_COORDINATION_DESIGN.md` (this document)
