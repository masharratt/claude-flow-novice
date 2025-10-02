# Agent Coordination System V2 - Technical Specifications

## Data Structures

### Agent State Machine

```typescript
/**
 * Core agent state definition
 */
export enum AgentState {
  IDLE = 'idle',
  WORKING = 'working',
  WAITING = 'waiting',
  BLOCKED = 'blocked',
  COMPLETE = 'complete'
}

/**
 * Agent instance with state tracking
 */
export interface AgentInstance {
  id: string;
  name: string;
  type: AgentType;
  state: AgentState;
  stateHistory: StateTransition[];
  capabilities: string[];
  expertise: string[];
  priority: number;
  maxConcurrentTasks: number;
  currentLoad: number;

  // Coordination metadata
  assignedTasks: string[];
  pendingDependencies: DependencyRequest[];
  providedDependencies: DependencyResolution[];
  helpRequests: HelpRequest[];

  // Performance metrics
  metrics: {
    tasksCompleted: number;
    helpProvided: number;
    avgTaskDuration: number;
    blockedTime: number;
    waitingTime: number;
  };

  // Timestamps
  spawnedAt: Date;
  lastStateChange: Date;
  lastActivity: Date;
}

/**
 * State transition record
 */
export interface StateTransition {
  id: string;
  agentId: string;
  fromState: AgentState;
  toState: AgentState;
  timestamp: Date;
  reason: string;
  triggeredBy: 'system' | 'agent' | 'coordinator' | 'dependency';
  metadata?: Record<string, any>;
}

/**
 * State machine configuration
 */
export interface StateMachineConfig {
  allowedTransitions: Map<AgentState, AgentState[]>;
  transitionHandlers: Map<string, TransitionHandler>;
  stateTimeouts: Map<AgentState, number>;
  enableAutoTransitions: boolean;
}
```

### Dependency Graph

```typescript
/**
 * Dependency types
 */
export enum DependencyType {
  DATA = 'data',
  EXPERTISE = 'expertise',
  RESOURCE = 'resource',
  APPROVAL = 'approval',
  SEQUENCE = 'sequence'
}

/**
 * Dependency request
 */
export interface DependencyRequest {
  id: string;
  requesterId: string;
  type: DependencyType;
  status: 'pending' | 'resolving' | 'resolved' | 'failed';

  // Requirements
  requirements: {
    dataType?: string;
    dataSchema?: object;
    expertise?: string[];
    resourceId?: string;
    approvalType?: string;
    sequenceTaskId?: string;
  };

  // Priority & urgency
  urgency: 'low' | 'normal' | 'high' | 'critical';
  deadline?: Date;

  // Provider matching
  potentialProviders: string[];
  selectedProvider?: string;

  // Timestamps
  requestedAt: Date;
  resolvedAt?: Date;
}

/**
 * Dependency resolution
 */
export interface DependencyResolution {
  id: string;
  dependencyId: string;
  providerId: string;
  requesterId: string;

  status: 'resolved' | 'partial' | 'failed';

  resolution: {
    data?: any;
    expertiseProvided?: string;
    resourceHandle?: string;
    approvalGranted?: boolean;
    nextSteps?: string[];
  };

  completedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Dependency graph structure
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: DependencyEdge[];
  pendingDependencies: DependencyRequest[];
  resolvedDependencies: DependencyResolution[];
}

export interface DependencyNode {
  agentId: string;
  dependencies: string[];      // IDs of dependencies this agent needs
  dependents: string[];         // IDs of agents depending on this agent
  state: AgentState;
}

export interface DependencyEdge {
  from: string;                 // Requester agent ID
  to: string;                   // Provider agent ID
  dependencyId: string;
  type: DependencyType;
  weight: number;               // Priority weight
}
```

### Message Bus Schema

```typescript
/**
 * Base message interface
 */
export interface Message {
  id: string;
  type: MessageType;
  channel: string;
  priority: MessagePriority;
  sender: string;
  receivers: string[];
  timestamp: Date;
  ttl?: number;
  metadata?: Record<string, any>;
}

/**
 * Message types
 */
export enum MessageType {
  STATE_CHANGE = 'state_change',
  DEPENDENCY_REQUEST = 'dependency_request',
  DEPENDENCY_RESOLUTION = 'dependency_resolution',
  HELP_REQUEST = 'help_request',
  HELP_RESPONSE = 'help_response',
  TASK_ASSIGNMENT = 'task_assignment',
  COMPLETION_PROBE = 'completion_probe',
  DEADLOCK_ALERT = 'deadlock_alert',
  SYSTEM_EVENT = 'system_event'
}

export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * Specialized message types
 */
export interface StateChangeMessage extends Message {
  type: MessageType.STATE_CHANGE;
  payload: {
    agentId: string;
    fromState: AgentState;
    toState: AgentState;
    reason: string;
  };
}

export interface DependencyRequestMessage extends Message {
  type: MessageType.DEPENDENCY_REQUEST;
  payload: DependencyRequest;
}

export interface HelpRequestMessage extends Message {
  type: MessageType.HELP_REQUEST;
  payload: {
    taskId: string;
    taskContext: string;
    requiredCapabilities: string[];
    estimatedDuration: number;
    urgency: 'low' | 'normal' | 'high';
  };
}

export interface CompletionProbeMessage extends Message {
  type: MessageType.COMPLETION_PROBE;
  payload: {
    agentId: string;
    state: AgentState;
    pendingDependencies: string[];
    taskQueueSize: number;
    waitingSince?: Date;
  };
}
```

### Channel Configuration

```typescript
/**
 * Message channel types
 */
export enum ChannelType {
  BROADCAST = 'broadcast',      // All agents receive
  DIRECT = 'direct',            // Point-to-point
  MULTICAST = 'multicast',      // Selected agents
  PUBLISH_SUBSCRIBE = 'pubsub'  // Topic-based
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  name: string;
  type: ChannelType;
  persistent: boolean;
  maxQueueSize: number;
  deliveryGuarantee: 'at-most-once' | 'at-least-once' | 'exactly-once';
  enablePriority: boolean;
  enableRetention: boolean;
  retentionDuration?: number;
}

/**
 * Predefined channels
 */
export const CHANNELS = {
  STATE: {
    name: 'state_channel',
    type: ChannelType.BROADCAST,
    persistent: true,
    maxQueueSize: 1000,
    deliveryGuarantee: 'at-least-once' as const,
    enablePriority: true,
    enableRetention: true,
    retentionDuration: 3600000 // 1 hour
  },

  DEPENDENCY: {
    name: 'dependency_channel',
    type: ChannelType.MULTICAST,
    persistent: true,
    maxQueueSize: 500,
    deliveryGuarantee: 'exactly-once' as const,
    enablePriority: true,
    enableRetention: true,
    retentionDuration: 7200000 // 2 hours
  },

  TASK: {
    name: 'task_channel',
    type: ChannelType.DIRECT,
    persistent: true,
    maxQueueSize: 2000,
    deliveryGuarantee: 'exactly-once' as const,
    enablePriority: true,
    enableRetention: false
  },

  HELP: {
    name: 'help_channel',
    type: ChannelType.PUBLISH_SUBSCRIBE,
    persistent: false,
    maxQueueSize: 100,
    deliveryGuarantee: 'at-most-once' as const,
    enablePriority: true,
    enableRetention: false
  }
};
```

## API Contracts

### CoordinationManager V2 API

```typescript
export interface ICoordinationManagerV2 {
  /**
   * State Management
   */
  registerAgent(agent: AgentInstance): Promise<void>;
  transitionAgentState(
    agentId: string,
    newState: AgentState,
    reason: string
  ): Promise<StateTransition>;
  getAgentState(agentId: string): Promise<AgentState>;
  getAgentsByState(state: AgentState): Promise<AgentInstance[]>;

  /**
   * Dependency Management
   */
  requestDependency(request: DependencyRequest): Promise<string>;
  resolveDependency(
    dependencyId: string,
    resolution: DependencyResolution
  ): Promise<void>;
  getDependencyGraph(): Promise<DependencyGraph>;
  checkDependencies(agentId: string): Promise<DependencyRequest[]>;

  /**
   * Help & Collaboration
   */
  requestHelp(request: HelpRequestMessage): Promise<string>;
  offerHelp(agentId: string, requestId: string): Promise<boolean>;
  matchHelpRequest(request: HelpRequestMessage): Promise<AgentInstance[]>;

  /**
   * Completion Detection
   */
  checkSwarmCompletion(): Promise<boolean>;
  initiateCompletionConsensus(): Promise<boolean>;
  getCompletionStatus(): Promise<CompletionStatus>;

  /**
   * Deadlock Management
   */
  detectDeadlocks(): Promise<DeadlockInfo[]>;
  resolveDeadlock(deadlockId: string, strategy: string): Promise<void>;

  /**
   * Monitoring
   */
  getCoordinationMetrics(): Promise<CoordinationMetrics>;
  getAgentMetrics(agentId: string): Promise<AgentMetrics>;
}
```

### DependencyManager API

```typescript
export interface IDependencyManager {
  /**
   * Graph Operations
   */
  buildGraph(agents: AgentInstance[]): Promise<DependencyGraph>;
  addDependency(from: string, to: string, type: DependencyType): Promise<void>;
  removeDependency(dependencyId: string): Promise<void>;

  /**
   * Resolution
   */
  findProviders(request: DependencyRequest): Promise<string[]>;
  matchProvider(
    request: DependencyRequest,
    candidates: string[]
  ): Promise<string>;
  notifyResolution(resolution: DependencyResolution): Promise<void>;

  /**
   * Analysis
   */
  getPendingDependencies(agentId?: string): Promise<DependencyRequest[]>;
  getDependencyPath(from: string, to: string): Promise<string[]>;
  detectCycles(): Promise<string[][]>;
  calculateCriticalPath(): Promise<string[]>;

  /**
   * Optimization
   */
  optimizeGraph(): Promise<DependencyGraph>;
  suggestParallelization(): Promise<string[][]>;
}
```

### StateMachineManager API

```typescript
export interface IStateMachineManager {
  /**
   * Registration
   */
  registerAgent(agent: AgentInstance): Promise<StateMachine>;
  unregisterAgent(agentId: string): Promise<void>;

  /**
   * Transitions
   */
  transition(
    agentId: string,
    toState: AgentState,
    reason: string
  ): Promise<StateTransition>;
  canTransition(agentId: string, toState: AgentState): boolean;
  getValidTransitions(agentId: string): Promise<AgentState[]>;

  /**
   * Handlers
   */
  registerTransitionHandler(
    from: AgentState,
    to: AgentState,
    handler: TransitionHandler
  ): void;
  executeHandlers(transition: StateTransition): Promise<void>;

  /**
   * History
   */
  getStateHistory(agentId: string): Promise<StateTransition[]>;
  getLastTransition(agentId: string): Promise<StateTransition>;

  /**
   * Monitoring
   */
  getStateDuration(agentId: string, state: AgentState): Promise<number>;
  getStateDistribution(): Promise<Map<AgentState, number>>;
}
```

### MessageBus V2 API

```typescript
export interface IMessageBusV2 {
  /**
   * Channel Management
   */
  createChannel(config: ChannelConfig): Promise<void>;
  deleteChannel(name: string): Promise<void>;
  getChannel(name: string): Promise<Channel>;
  listChannels(): Promise<ChannelConfig[]>;

  /**
   * Messaging
   */
  send(message: Message): Promise<string>;
  broadcast(channel: string, message: Message): Promise<string[]>;
  multicast(receivers: string[], message: Message): Promise<string[]>;

  /**
   * Subscriptions
   */
  subscribe(
    channel: string,
    agentId: string,
    handler: MessageHandler
  ): Promise<string>;
  unsubscribe(subscriptionId: string): Promise<void>;

  /**
   * Priority & Routing
   */
  setPriority(messageId: string, priority: MessagePriority): Promise<void>;
  routeMessage(message: Message): Promise<string[]>;

  /**
   * Persistence
   */
  getMessageHistory(channel: string, limit?: number): Promise<Message[]>;
  retainMessage(messageId: string, duration: number): Promise<void>;

  /**
   * Metrics
   */
  getChannelMetrics(channel: string): Promise<ChannelMetrics>;
  getBusMetrics(): Promise<BusMetrics>;
}
```

## Memory Schema

### SwarmMemory V2 Schema

```typescript
/**
 * Enhanced memory structure for coordination
 */
export interface SwarmMemoryV2Schema {
  // Agent state storage
  agentStates: {
    [agentId: string]: {
      currentState: AgentState;
      stateHistory: StateTransition[];
      lastUpdate: Date;
    };
  };

  // Dependency graph storage
  dependencyGraph: {
    nodes: {
      [agentId: string]: DependencyNode;
    };
    edges: DependencyEdge[];
    pending: DependencyRequest[];
    resolved: DependencyResolution[];
  };

  // Help requests storage
  helpRequests: {
    [requestId: string]: {
      request: HelpRequestMessage;
      status: 'open' | 'assigned' | 'completed' | 'cancelled';
      assignedTo?: string;
      createdAt: Date;
      completedAt?: Date;
    };
  };

  // Completion tracking
  completion: {
    probeResults: Map<string, CompletionProbeMessage>;
    consensusVotes: Map<string, boolean>;
    completionTriggered: boolean;
    completionTime?: Date;
  };

  // Deadlock detection
  deadlocks: {
    [deadlockId: string]: {
      cycle: string[];
      detectedAt: Date;
      resolvedAt?: Date;
      resolution?: string;
    };
  };

  // Performance metrics
  metrics: {
    stateTransitions: number;
    dependenciesResolved: number;
    helpRequestsFulfilled: number;
    deadlocksResolved: number;
    avgDependencyResolutionTime: number;
    avgHelpResponseTime: number;
  };
}

/**
 * Memory operations
 */
export interface ISwarmMemoryV2 {
  // State operations
  storeAgentState(agentId: string, state: AgentState): Promise<void>;
  loadAgentState(agentId: string): Promise<AgentState>;
  storeStateTransition(transition: StateTransition): Promise<void>;

  // Dependency operations
  storeDependencyGraph(graph: DependencyGraph): Promise<void>;
  loadDependencyGraph(): Promise<DependencyGraph>;
  addDependency(request: DependencyRequest): Promise<void>;
  resolveDependency(resolution: DependencyResolution): Promise<void>;

  // Help request operations
  storeHelpRequest(request: HelpRequestMessage): Promise<void>;
  loadHelpRequest(requestId: string): Promise<HelpRequestMessage>;
  updateHelpRequestStatus(requestId: string, status: string): Promise<void>;

  // Completion operations
  storeCompletionProbe(probe: CompletionProbeMessage): Promise<void>;
  loadCompletionProbes(): Promise<CompletionProbeMessage[]>;
  recordConsensusVote(agentId: string, vote: boolean): Promise<void>;

  // Deadlock operations
  recordDeadlock(cycle: string[]): Promise<string>;
  resolveDeadlock(deadlockId: string, resolution: string): Promise<void>;

  // Metrics
  updateMetrics(metrics: Partial<SwarmMemoryV2Schema['metrics']>): Promise<void>;
  getMetrics(): Promise<SwarmMemoryV2Schema['metrics']>;
}
```

## Performance Requirements

### Latency Targets

```typescript
export const PERFORMANCE_TARGETS = {
  // State transitions
  stateTransition: {
    maxLatency: 100,           // milliseconds
    p99Latency: 50,            // milliseconds
    throughput: 1000           // transitions/second
  },

  // Dependency resolution
  dependencyResolution: {
    maxLatency: 500,           // milliseconds
    p99Latency: 300,           // milliseconds
    throughput: 200            // resolutions/second
  },

  // Help requests
  helpRequestMatching: {
    maxLatency: 200,           // milliseconds
    p99Latency: 100,           // milliseconds
    throughput: 100            // requests/second
  },

  // Completion detection
  completionCheck: {
    maxLatency: 1000,          // milliseconds (hierarchical)
    meshLatency: 2000,         // milliseconds (mesh)
    checkInterval: 5000        // milliseconds
  },

  // Message bus
  messageBus: {
    deliveryLatency: 50,       // milliseconds
    p99Latency: 100,           // milliseconds
    throughput: 5000           // messages/second
  },

  // Memory operations
  memoryOperations: {
    readLatency: 10,           // milliseconds
    writeLatency: 50,          // milliseconds
    throughput: 10000          // operations/second
  }
};
```

### Scalability Limits

```typescript
export const SCALABILITY_LIMITS = {
  hierarchical: {
    maxAgents: 50,
    maxDependenciesPerAgent: 10,
    maxConcurrentHelpRequests: 20,
    memoryPerAgent: 5 * 1024 * 1024,      // 5 MB
    cpuPerAgent: 0.1                       // 10% of 1 core
  },

  mesh: {
    maxAgents: 10,
    maxDependenciesPerAgent: 5,
    maxConcurrentHelpRequests: 10,
    memoryPerAgent: 8 * 1024 * 1024,      // 8 MB
    cpuPerAgent: 0.2                       // 20% of 1 core
  },

  messageBus: {
    maxChannels: 20,
    maxSubscriptionsPerChannel: 100,
    maxMessageRetention: 10000,
    maxMessageSize: 1024 * 1024           // 1 MB
  },

  dependencyGraph: {
    maxNodes: 100,
    maxEdges: 500,
    maxCycleLength: 10
  }
};
```

## Implementation Examples

### State Transition Implementation

```typescript
class StateMachineManager implements IStateMachineManager {
  private agents: Map<string, StateMachine>;
  private config: StateMachineConfig;

  async transition(
    agentId: string,
    toState: AgentState,
    reason: string
  ): Promise<StateTransition> {
    const machine = this.agents.get(agentId);
    if (!machine) {
      throw new Error(`Agent ${agentId} not registered`);
    }

    // Validate transition
    if (!this.canTransition(agentId, toState)) {
      throw new Error(
        `Invalid transition: ${machine.currentState} -> ${toState}`
      );
    }

    // Create transition record
    const transition: StateTransition = {
      id: generateId('transition'),
      agentId,
      fromState: machine.currentState,
      toState,
      timestamp: new Date(),
      reason,
      triggeredBy: 'system'
    };

    // Execute pre-transition handlers
    await this.executePreHandlers(transition);

    // Update state
    machine.currentState = toState;
    machine.stateHistory.push(transition);

    // Execute post-transition handlers
    await this.executePostHandlers(transition);

    // Broadcast state change
    await this.broadcastStateChange(transition);

    return transition;
  }

  canTransition(agentId: string, toState: AgentState): boolean {
    const machine = this.agents.get(agentId);
    if (!machine) return false;

    const allowedTransitions = this.config.allowedTransitions.get(
      machine.currentState
    );

    return allowedTransitions?.includes(toState) ?? false;
  }

  private async executePreHandlers(transition: StateTransition): Promise<void> {
    const key = `${transition.fromState}->${transition.toState}`;
    const handler = this.config.transitionHandlers.get(`pre:${key}`);

    if (handler) {
      await handler(transition);
    }
  }

  private async executePostHandlers(transition: StateTransition): Promise<void> {
    const key = `${transition.fromState}->${transition.toState}`;
    const handler = this.config.transitionHandlers.get(`post:${key}`);

    if (handler) {
      await handler(transition);
    }
  }
}
```

### Dependency Resolution Implementation

```typescript
class DependencyManager implements IDependencyManager {
  private graph: DependencyGraph;
  private memory: ISwarmMemoryV2;
  private messageBus: IMessageBusV2;

  async findProviders(request: DependencyRequest): Promise<string[]> {
    const providers: string[] = [];

    // Get all agents in WAITING or IDLE state
    const availableAgents = Array.from(this.graph.nodes.values())
      .filter(node =>
        node.state === AgentState.WAITING ||
        node.state === AgentState.IDLE
      );

    for (const node of availableAgents) {
      if (await this.canProvide(node.agentId, request)) {
        providers.push(node.agentId);
      }
    }

    // Sort by capability match score
    return providers.sort((a, b) =>
      this.scoreProvider(b, request) - this.scoreProvider(a, request)
    );
  }

  private async canProvide(
    agentId: string,
    request: DependencyRequest
  ): Promise<boolean> {
    const agent = await this.getAgent(agentId);

    switch (request.type) {
      case DependencyType.DATA:
        return this.hasProducedData(agent, request.requirements.dataType);

      case DependencyType.EXPERTISE:
        return request.requirements.expertise?.some(exp =>
          agent.expertise.includes(exp)
        ) ?? false;

      case DependencyType.RESOURCE:
        return this.hasResourceAccess(agent, request.requirements.resourceId);

      case DependencyType.APPROVAL:
        return this.canApprove(agent, request.requirements.approvalType);

      default:
        return false;
    }
  }

  private scoreProvider(
    providerId: string,
    request: DependencyRequest
  ): number {
    let score = 0;

    const agent = this.getAgent(providerId);

    // Capability match (0-50 points)
    if (request.type === DependencyType.EXPERTISE) {
      const matches = request.requirements.expertise?.filter(exp =>
        agent.expertise.includes(exp)
      ).length ?? 0;

      score += matches * 10;
    }

    // Historical success rate (0-30 points)
    const successRate = this.getProviderSuccessRate(providerId);
    score += successRate * 30;

    // Current load (0-20 points, inversely proportional)
    const loadFactor = 1 - (agent.currentLoad / agent.maxConcurrentTasks);
    score += loadFactor * 20;

    return score;
  }
}
```

### Completion Detection Implementation (Hierarchical)

```typescript
class HierarchicalCompletionDetector {
  private coordinator: ICoordinationManagerV2;
  private dependencyManager: IDependencyManager;
  private memory: ISwarmMemoryV2;

  async checkCompletion(): Promise<boolean> {
    // Step 1: Check all agents are in WAITING or COMPLETE state
    const agents = await this.coordinator.getAgentsByState(AgentState.WORKING);
    const blockedAgents = await this.coordinator.getAgentsByState(
      AgentState.BLOCKED
    );

    if (agents.length > 0 || blockedAgents.length > 0) {
      return false;
    }

    // Step 2: Verify no pending dependencies
    const pendingDeps = await this.dependencyManager.getPendingDependencies();
    if (pendingDeps.length > 0) {
      return false;
    }

    // Step 3: Check task queue
    const taskQueue = await this.coordinator.getTaskQueue();
    if (taskQueue.length > 0) {
      return false;
    }

    // Step 4: Verify all agents agree (final consensus)
    const consensusReached = await this.runConsensusProtocol();
    if (!consensusReached) {
      return false;
    }

    // All checks passed - swarm complete
    await this.memory.storeCompletionProbe({
      id: generateId('completion'),
      type: MessageType.COMPLETION_PROBE,
      channel: 'completion',
      priority: MessagePriority.CRITICAL,
      sender: 'coordinator',
      receivers: [],
      timestamp: new Date(),
      payload: {
        agentId: 'coordinator',
        state: AgentState.COMPLETE,
        pendingDependencies: [],
        taskQueueSize: 0
      }
    });

    return true;
  }

  private async runConsensusProtocol(): Promise<boolean> {
    const agents = await this.coordinator.getAgentsByState(AgentState.WAITING);
    const votes: Map<string, boolean> = new Map();

    // Request completion vote from each agent
    for (const agent of agents) {
      const vote = await this.requestCompletionVote(agent.id);
      votes.set(agent.id, vote);
      await this.memory.recordConsensusVote(agent.id, vote);
    }

    // Check for unanimous agreement
    const allAgree = Array.from(votes.values()).every(vote => vote === true);
    return allAgree && votes.size === agents.length;
  }

  private async requestCompletionVote(agentId: string): Promise<boolean> {
    // Send completion probe to agent
    const response = await this.coordinator.sendMessage({
      type: MessageType.COMPLETION_PROBE,
      agentId,
      requireResponse: true,
      timeout: 5000
    });

    return response?.payload?.canComplete ?? false;
  }
}
```

### Mesh Completion Detection Implementation

```typescript
class MeshCompletionDetector {
  private messageBus: IMessageBusV2;
  private memory: ISwarmMemoryV2;
  private agentId: string;

  async initiateCompletionCheck(): Promise<boolean> {
    // Phase 1: Local state verification
    if (await this.getLocalState() !== AgentState.WAITING) {
      return false;
    }

    if (await this.hasPendingDependencies()) {
      return false;
    }

    // Phase 2: Broadcast completion probe
    const probes = await this.broadcastCompletionProbe();

    // Phase 3: Analyze responses
    const allWaiting = probes.every(probe =>
      probe.payload.state === AgentState.WAITING ||
      probe.payload.state === AgentState.COMPLETE
    );

    const noPendingWork = probes.every(probe =>
      probe.payload.pendingDependencies.length === 0 &&
      probe.payload.taskQueueSize === 0
    );

    if (!allWaiting || !noPendingWork) {
      return false;
    }

    // Phase 4: Two-phase commit for consensus
    return await this.executeTwoPhaseCommit(probes);
  }

  private async broadcastCompletionProbe(): Promise<CompletionProbeMessage[]> {
    const probe: CompletionProbeMessage = {
      id: generateId('probe'),
      type: MessageType.COMPLETION_PROBE,
      channel: CHANNELS.STATE.name,
      priority: MessagePriority.HIGH,
      sender: this.agentId,
      receivers: [],
      timestamp: new Date(),
      payload: {
        agentId: this.agentId,
        state: await this.getLocalState(),
        pendingDependencies: await this.getPendingDependencies(),
        taskQueueSize: await this.getTaskQueueSize()
      }
    };

    await this.messageBus.broadcast(CHANNELS.STATE.name, probe);

    // Wait for responses (with timeout)
    return await this.collectProbeResponses(5000);
  }

  private async executeTwoPhaseCommit(
    probes: CompletionProbeMessage[]
  ): Promise<boolean> {
    // Phase 1: Prepare
    const prepareVotes = await this.sendPrepareMessages(probes);
    const allPrepared = prepareVotes.every(vote => vote === true);

    if (!allPrepared) {
      await this.sendAbortMessages(probes);
      return false;
    }

    // Phase 2: Commit
    await this.sendCommitMessages(probes);
    await this.memory.storeCompletionProbe({
      ...probes[0],
      metadata: { consensusAchieved: true, timestamp: new Date() }
    });

    return true;
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('StateMachineManager', () => {
  test('should allow valid state transitions', async () => {
    const manager = new StateMachineManager(config);
    const agent = createTestAgent();

    await manager.registerAgent(agent);

    // IDLE -> WORKING (valid)
    const transition = await manager.transition(
      agent.id,
      AgentState.WORKING,
      'Task assigned'
    );

    expect(transition.toState).toBe(AgentState.WORKING);
  });

  test('should reject invalid state transitions', async () => {
    const manager = new StateMachineManager(config);
    const agent = createTestAgent();

    await manager.registerAgent(agent);

    // IDLE -> COMPLETE (invalid)
    await expect(
      manager.transition(agent.id, AgentState.COMPLETE, 'Invalid')
    ).rejects.toThrow('Invalid transition');
  });
});
```

### Integration Tests

```typescript
describe('Dependency Resolution Integration', () => {
  test('should resolve dependencies hierarchically', async () => {
    const coordinator = new CoordinationManagerV2(config);
    const depManager = new DependencyManager(coordinator);

    // Setup: Agent 1 needs data from Agent 2
    const agent1 = await coordinator.registerAgent(createAgent('agent1'));
    const agent2 = await coordinator.registerAgent(createAgent('agent2'));

    await coordinator.transitionAgentState(
      agent2.id,
      AgentState.WAITING,
      'Task complete'
    );

    // Request dependency
    const request = createDependencyRequest(
      agent1.id,
      DependencyType.DATA,
      { dataType: 'user_data' }
    );

    const dependencyId = await depManager.requestDependency(request);

    // Should find agent2 as provider
    const providers = await depManager.findProviders(request);
    expect(providers).toContain(agent2.id);

    // Resolve dependency
    await depManager.resolveDependency(dependencyId, {
      providerId: agent2.id,
      data: { users: [] }
    });

    // Agent1 should transition to WORKING
    const agent1State = await coordinator.getAgentState(agent1.id);
    expect(agent1State).toBe(AgentState.WORKING);
  });
});
```

### Performance Tests

```typescript
describe('Performance Benchmarks', () => {
  test('should meet state transition latency targets', async () => {
    const manager = new StateMachineManager(config);
    const agents = createTestAgents(100);

    for (const agent of agents) {
      await manager.registerAgent(agent);
    }

    const start = Date.now();

    // Execute 1000 state transitions
    for (let i = 0; i < 1000; i++) {
      const agent = agents[i % agents.length];
      await manager.transition(
        agent.id,
        AgentState.WORKING,
        'Performance test'
      );
    }

    const duration = Date.now() - start;
    const avgLatency = duration / 1000;

    expect(avgLatency).toBeLessThan(
      PERFORMANCE_TARGETS.stateTransition.p99Latency
    );
  });
});
```

## Migration & Rollout Plan

### Phase 1: Foundation (Week 1-2)
- Implement core data structures
- Build StateMachineManager
- Add state tracking to SwarmMemory

### Phase 2: Dependencies (Week 3-4)
- Implement DependencyManager
- Build dependency graph
- Add resolution protocols

### Phase 3: Communication (Week 5-6)
- Enhance MessageBus with channels
- Implement specialized message types
- Add priority routing

### Phase 4: Completion (Week 7-8)
- Build hierarchical completion detector
- Implement mesh consensus protocol
- Add deadlock detection

### Phase 5: Integration (Week 9-10)
- Integrate with existing swarm coordinator
- Update agent spawning logic
- Migrate existing workflows

### Phase 6: Hardening (Week 11-12)
- Performance optimization
- Comprehensive testing
- Production deployment

## Next Steps

1. Review and approve architecture
2. Create implementation tickets
3. Set up development environment
4. Begin Phase 1 implementation
5. Establish continuous integration pipeline
