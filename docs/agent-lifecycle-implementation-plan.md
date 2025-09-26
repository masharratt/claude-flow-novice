# Agent Lifecycle Management Implementation Plan

## Executive Summary

This document outlines a comprehensive 4-checkpoint implementation plan for agent lifecycle management solutions, designed to eliminate race conditions, improve coordination, and provide robust dependency tracking. Each checkpoint is independently functional and rollback-safe.

## Current Architecture Analysis

### Existing Components
- **Agent Loader**: `/src/agents/agent-loader.ts` - Dynamic agent definition loading from `.claude/agents/`
- **Feature Lifecycle Manager**: `/src/workflows/feature-lifecycle-manager.ts` - Feature state management with agent coordination
- **Hook Integration**: `/src/config/integration/hooks-integration.ts` - Comprehensive hook system for coordination
- **GitHub Agents**: `/src/agents/github/` - Consolidated 3-agent GitHub system
- **Swarm Coordination**: Various coordinators throughout codebase

### Key Issues Identified
1. **Race Conditions**: Agents can complete independently without dependency awareness
2. **State Inconsistency**: No centralized lifecycle state management
3. **Coordination Gaps**: Limited bidirectional dependency tracking
4. **Hook Limitations**: Missing task completion and rerun hooks

---

## CHECKPOINT 1: Agent Lifecycle State Management
**Git Tag**: `v1.0-lifecycle-states`
**Duration**: 2-3 days
**Independence**: Fully functional standalone enhancement

### Objectives
- Add comprehensive lifecycle states to agent definitions
- Implement new hook types for task completion and rerun requests
- Update agent loader to support lifecycle management
- Create state persistence and recovery mechanisms

### Files to Modify

#### 1. Agent Definition Extensions
**File**: `/src/agents/agent-loader.ts`
```typescript
// Add to AgentDefinition interface
export interface AgentDefinition {
  // ... existing fields
  lifecycle?: {
    state: 'idle' | 'initializing' | 'working' | 'waiting_dependency' | 'completed' | 'failed' | 'rerunning';
    dependencies: string[];
    dependents: string[];
    completionCriteria: CompletionCriteria;
    retryConfig: RetryConfig;
    checkpoints: StateCheckpoint[];
  };
}

export interface CompletionCriteria {
  type: 'automatic' | 'manual' | 'conditional';
  conditions?: string[];
  timeout?: number;
  requiredFiles?: string[];
  requiredTests?: string[];
}

export interface RetryConfig {
  maxRetries: number;
  backoffStrategy: 'linear' | 'exponential' | 'fixed';
  retryDelay: number;
  retryConditions: string[];
}

export interface StateCheckpoint {
  id: string;
  timestamp: Date;
  state: string;
  metadata: Record<string, any>;
  rollbackData?: any;
}
```

#### 2. Lifecycle State Manager
**New File**: `/src/agents/lifecycle/AgentLifecycleManager.ts`
```typescript
import { EventEmitter } from 'events';
import { AgentDefinition } from '../agent-loader.js';

export class AgentLifecycleManager extends EventEmitter {
  private agentStates: Map<string, AgentLifecycleState> = new Map();
  private stateHistory: Map<string, StateCheckpoint[]> = new Map();
  private persistenceConfig: PersistenceConfig;

  // Core lifecycle methods
  async transitionState(agentId: string, newState: string, metadata?: any): Promise<boolean>
  async checkDependencies(agentId: string): Promise<DependencyStatus>
  async createCheckpoint(agentId: string, description?: string): Promise<StateCheckpoint>
  async rollbackToCheckpoint(agentId: string, checkpointId: string): Promise<boolean>

  // State validation and recovery
  async validateStateConsistency(): Promise<ValidationResult>
  async recoverFromInconsistency(): Promise<RecoveryResult>

  // Event handlers for coordination
  private onAgentCompletion(agentId: string): Promise<void>
  private onDependencyResolved(dependencyId: string): Promise<void>
  private onStateTransition(agentId: string, oldState: string, newState: string): Promise<void>
}
```

#### 3. Enhanced Hook Types
**File**: `/src/config/integration/hooks-integration.ts`
```typescript
// Add new hook types
const newHookMappings = {
  'task-complete': (ctx) =>
    `npx claude-flow@alpha hooks task-complete --agent-id "${ctx.agentId}" --task-id "${ctx.taskId}" --result "${ctx.result}"`,

  'on-rerun-request': (ctx) =>
    `npx claude-flow@alpha hooks on-rerun-request --agent-id "${ctx.agentId}" --reason "${ctx.reason}" --checkpoint "${ctx.checkpointId}"`,

  'dependency-resolved': (ctx) =>
    `npx claude-flow@alpha hooks dependency-resolved --dependency-id "${ctx.dependencyId}" --dependents "${ctx.dependents.join(',')}"`,

  'state-transition': (ctx) =>
    `npx claude-flow@alpha hooks state-transition --agent-id "${ctx.agentId}" --from "${ctx.fromState}" --to "${ctx.toState}"`,

  'lifecycle-checkpoint': (ctx) =>
    `npx claude-flow@alpha hooks lifecycle-checkpoint --agent-id "${ctx.agentId}" --checkpoint-id "${ctx.checkpointId}"`
};
```

#### 4. Agent State Persistence
**New File**: `/src/agents/lifecycle/StatePersistence.ts`
```typescript
export class AgentStatePersistence {
  private storage: Map<string, any> = new Map();
  private persistenceFile: string = '.claude/state/agent-lifecycle.json';

  async saveState(agentId: string, state: AgentLifecycleState): Promise<void>
  async loadState(agentId: string): Promise<AgentLifecycleState | null>
  async saveCheckpoint(agentId: string, checkpoint: StateCheckpoint): Promise<void>
  async listCheckpoints(agentId: string): Promise<StateCheckpoint[]>
  async cleanupOldCheckpoints(retentionDays: number = 7): Promise<void>

  // Bulk operations for recovery
  async saveAllStates(states: Map<string, AgentLifecycleState>): Promise<void>
  async loadAllStates(): Promise<Map<string, AgentLifecycleState>>
  async createBackup(): Promise<string>
  async restoreFromBackup(backupPath: string): Promise<boolean>
}
```

### Testing Strategy

#### Unit Tests
**New File**: `/tests/agents/lifecycle/AgentLifecycleManager.test.ts`
```typescript
describe('AgentLifecycleManager', () => {
  test('should transition agent states correctly')
  test('should validate dependencies before state transitions')
  test('should create and restore checkpoints')
  test('should handle state persistence across restarts')
  test('should emit appropriate events on state changes')
  test('should validate state consistency')
  test('should recover from corrupted states')
});
```

#### Integration Tests
**New File**: `/tests/integration/lifecycle-hooks-integration.test.ts`
```typescript
describe('Lifecycle Hook Integration', () => {
  test('should execute task-complete hooks')
  test('should handle rerun requests with checkpoints')
  test('should coordinate dependency resolution')
  test('should maintain state consistency across hook executions')
});
```

### Rollback Strategy

#### Rollback Triggers
- State transition failures
- Hook execution failures
- Dependency resolution errors
- Corruption detection

#### Rollback Process
1. **Immediate State Freeze**: Stop all agent state transitions
2. **Checkpoint Restoration**: Restore to last known good checkpoint
3. **Dependency Revalidation**: Recheck all dependency relationships
4. **Progressive Recovery**: Gradually resume state transitions
5. **Validation**: Confirm system consistency before full operation

#### Rollback Commands
```bash
# Emergency rollback
npx claude-flow@alpha lifecycle rollback --to-checkpoint <checkpoint-id>

# Graceful rollback with validation
npx claude-flow@alpha lifecycle rollback --validate --safe-mode

# State consistency check
npx claude-flow@alpha lifecycle validate --fix-inconsistencies
```

### Git Commit Strategy

#### Commit Sequence
```bash
# 1. Core interface changes
git add src/agents/agent-loader.ts
git commit -m "Add lifecycle state interfaces to AgentDefinition

- Add lifecycle state management fields
- Define completion criteria and retry configuration
- Include state checkpoint support
- Maintain backward compatibility

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Lifecycle manager implementation
git add src/agents/lifecycle/
git commit -m "Implement AgentLifecycleManager with state transitions

- Add comprehensive lifecycle state management
- Implement dependency checking and validation
- Support state checkpoints and rollback
- Include event-driven coordination

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. Hook integration enhancements
git add src/config/integration/hooks-integration.ts
git commit -m "Add new hook types for lifecycle management

- Implement task-complete and on-rerun-request hooks
- Add dependency-resolved and state-transition hooks
- Include lifecycle-checkpoint hook support
- Enhance hook execution with lifecycle context

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 4. State persistence layer
git add src/agents/lifecycle/StatePersistence.ts
git commit -m "Add agent state persistence with backup/recovery

- Implement file-based state persistence
- Add checkpoint management with retention policies
- Include backup and recovery mechanisms
- Support bulk operations for disaster recovery

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Tests and documentation
git add tests/agents/lifecycle/ tests/integration/lifecycle-hooks-integration.test.ts
git commit -m "Add comprehensive lifecycle management tests

- Unit tests for state transitions and persistence
- Integration tests for hook coordination
- Rollback and recovery test scenarios
- State consistency validation tests

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Tag the checkpoint
git tag -a v1.0-lifecycle-states -m "CHECKPOINT 1: Agent Lifecycle State Management

Core lifecycle state management implementation with:
- Agent state transitions with dependency awareness
- New hook types for task completion and reruns
- State persistence with checkpoint/rollback support
- Comprehensive testing and rollback procedures

Ready for CHECKPOINT 2: Dependency-Aware Completion Tracking"
```

---

## CHECKPOINT 2: Dependency-Aware Completion Tracking
**Git Tag**: `v1.1-dependency-tracking`
**Duration**: 2-3 days
**Dependencies**: Checkpoint 1 completed

### Objectives
- Implement DependencyTracker class for bidirectional dependency management
- Add completion eligibility checking with dependency validation
- Create automatic dependency resolution workflows
- Enhance agent coordination with dependency awareness

### Files to Modify

#### 1. Dependency Tracker Implementation
**New File**: `/src/agents/dependencies/DependencyTracker.ts`
```typescript
export class DependencyTracker extends EventEmitter {
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private completionQueue: Set<string> = new Set();
  private blockedAgents: Map<string, BlockedAgentInfo> = new Map();

  // Core dependency management
  async addDependency(agentId: string, dependsOnId: string, type: DependencyType): Promise<void>
  async removeDependency(agentId: string, dependsOnId: string): Promise<void>
  async checkCompletionEligibility(agentId: string): Promise<EligibilityResult>
  async markAgentCompleted(agentId: string): Promise<CompletionResult>

  // Dependency analysis
  async analyzeDependencyChain(agentId: string): Promise<DependencyChain>
  async detectCircularDependencies(): Promise<CircularDependency[]>
  async optimizeDependencyOrder(): Promise<OptimizedOrder>

  // Automatic resolution
  async resolveCompletedDependencies(): Promise<ResolvedDependency[]>
  async triggerEligibleAgents(): Promise<TriggeredAgent[]>

  // Bidirectional tracking
  async getDependents(agentId: string): Promise<string[]>
  async getDependencies(agentId: string): Promise<string[]>
  async updateDependencyStatus(agentId: string, status: DependencyStatus): Promise<void>
}

interface DependencyNode {
  agentId: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';
  metadata: DependencyMetadata;
  lastUpdate: Date;
}

interface DependencyMetadata {
  type: 'hard' | 'soft' | 'conditional';
  timeout?: number;
  retryOnFailure: boolean;
  conditions?: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}
```

#### 2. Completion Eligibility Engine
**New File**: `/src/agents/dependencies/CompletionEligibilityEngine.ts`
```typescript
export class CompletionEligibilityEngine {
  private dependencyTracker: DependencyTracker;
  private lifecycleManager: AgentLifecycleManager;
  private eligibilityRules: Map<string, EligibilityRule> = new Map();

  async checkEligibility(agentId: string): Promise<EligibilityResult> {
    const checks = await Promise.all([
      this.checkDependencyCompletion(agentId),
      this.checkResourceAvailability(agentId),
      this.checkBusinessRules(agentId),
      this.checkSystemConstraints(agentId)
    ]);

    return this.aggregateEligibilityResults(checks);
  }

  private async checkDependencyCompletion(agentId: string): Promise<EligibilityCheck> {
    const dependencies = await this.dependencyTracker.getDependencies(agentId);
    const completedDeps = await this.filterCompletedDependencies(dependencies);
    const pendingDeps = dependencies.filter(dep => !completedDeps.includes(dep));

    return {
      passed: pendingDeps.length === 0,
      reason: pendingDeps.length > 0 ? `Waiting for dependencies: ${pendingDeps.join(', ')}` : null,
      details: { completed: completedDeps, pending: pendingDeps }
    };
  }

  async registerEligibilityRule(name: string, rule: EligibilityRule): Promise<void>
  async removeEligibilityRule(name: string): Promise<void>
  async validateAllRules(): Promise<RuleValidationResult>
}
```

#### 3. Enhanced Agent Manager Integration
**File**: `/src/agents/agent-manager.ts` (enhance existing or create new)
```typescript
export class EnhancedAgentManager {
  private dependencyTracker: DependencyTracker;
  private lifecycleManager: AgentLifecycleManager;
  private eligibilityEngine: CompletionEligibilityEngine;

  async spawnAgent(agentDefinition: AgentDefinition): Promise<SpawnResult> {
    // Register dependencies
    if (agentDefinition.lifecycle?.dependencies) {
      for (const depId of agentDefinition.lifecycle.dependencies) {
        await this.dependencyTracker.addDependency(agentDefinition.name, depId, 'hard');
      }
    }

    // Check immediate eligibility
    const eligibility = await this.eligibilityEngine.checkEligibility(agentDefinition.name);
    if (!eligibility.eligible) {
      await this.lifecycleManager.transitionState(agentDefinition.name, 'waiting_dependency');
      return { spawned: false, reason: eligibility.reason };
    }

    return this.proceedWithSpawn(agentDefinition);
  }

  async onAgentCompletion(agentId: string, result: any): Promise<void> {
    // Mark agent as completed in dependency tracker
    const completionResult = await this.dependencyTracker.markAgentCompleted(agentId);

    // Trigger eligible dependents
    const triggeredAgents = await this.dependencyTracker.triggerEligibleAgents();

    // Update lifecycle states
    await this.lifecycleManager.transitionState(agentId, 'completed', { result });

    // Process triggered agents
    for (const triggered of triggeredAgents) {
      await this.processTriggeredAgent(triggered);
    }

    // Emit completion event with dependency info
    this.emit('agent:completed:with-dependencies', {
      completedAgent: agentId,
      triggeredAgents: triggeredAgents.map(t => t.agentId),
      dependencyChain: completionResult.resolvedDependencies
    });
  }
}
```

#### 4. Dependency Visualization and Monitoring
**New File**: `/src/agents/dependencies/DependencyVisualizer.ts`
```typescript
export class DependencyVisualizer {
  async generateDependencyGraph(format: 'mermaid' | 'dot' | 'json'): Promise<string>
  async generateCompletionTimeline(): Promise<TimelineData>
  async analyzeCriticalPath(): Promise<CriticalPathAnalysis>
  async detectBottlenecks(): Promise<BottleneckAnalysis>

  // Real-time monitoring
  async startDependencyMonitoring(): Promise<void>
  async getDependencyMetrics(): Promise<DependencyMetrics>
  async generateDependencyReport(): Promise<DependencyReport>
}
```

### Testing Strategy

#### Unit Tests
**New File**: `/tests/agents/dependencies/DependencyTracker.test.ts`
```typescript
describe('DependencyTracker', () => {
  test('should add and remove dependencies correctly')
  test('should detect circular dependencies')
  test('should check completion eligibility accurately')
  test('should trigger eligible agents on completion')
  test('should handle dependency failures gracefully')
  test('should optimize dependency order for performance')
  test('should maintain bidirectional dependency links')
});
```

#### Integration Tests
**New File**: `/tests/integration/dependency-completion-flow.test.ts`
```typescript
describe('Dependency-Aware Completion Flow', () => {
  test('should complete agents in correct dependency order')
  test('should block agents with unmet dependencies')
  test('should handle complex dependency chains')
  test('should recover from dependency failures')
  test('should optimize parallel execution opportunities')
});
```

### Rollback Strategy

#### Rollback Scenarios
- Circular dependency detection
- Dependency resolution failures
- Completion eligibility errors
- Agent spawning failures

#### Recovery Procedures
1. **Dependency Graph Reset**: Clear corrupted dependency relationships
2. **State Reconciliation**: Sync dependency states with agent states
3. **Gradual Restoration**: Rebuild dependencies incrementally
4. **Validation Phase**: Confirm dependency integrity before resuming

### Git Commit Strategy

```bash
# 1. Core dependency tracker
git add src/agents/dependencies/DependencyTracker.ts
git commit -m "Implement bidirectional dependency tracking system

- Add comprehensive dependency graph management
- Support multiple dependency types (hard/soft/conditional)
- Include circular dependency detection
- Implement automatic resolution workflows

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Completion eligibility engine
git add src/agents/dependencies/CompletionEligibilityEngine.ts
git commit -m "Add completion eligibility checking with rules engine

- Implement multi-criteria eligibility validation
- Support custom eligibility rules
- Include resource and constraint checking
- Add detailed eligibility reporting

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. Enhanced agent manager
git add src/agents/agent-manager.ts
git commit -m "Enhance agent manager with dependency awareness

- Integrate dependency tracking with agent spawning
- Add automatic dependent triggering on completion
- Include eligibility checking before agent execution
- Support complex dependency resolution workflows

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 4. Dependency visualization and monitoring
git add src/agents/dependencies/DependencyVisualizer.ts
git commit -m "Add dependency visualization and monitoring tools

- Generate dependency graphs in multiple formats
- Provide critical path and bottleneck analysis
- Include real-time dependency monitoring
- Support comprehensive dependency reporting

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Tests and integration
git add tests/agents/dependencies/ tests/integration/dependency-completion-flow.test.ts
git commit -m "Add comprehensive dependency tracking tests

- Unit tests for dependency graph operations
- Integration tests for completion workflows
- Edge case testing for circular dependencies
- Performance tests for large dependency graphs

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Tag the checkpoint
git tag -a v1.1-dependency-tracking -m "CHECKPOINT 2: Dependency-Aware Completion Tracking

Bidirectional dependency management with:
- Comprehensive dependency graph tracking
- Completion eligibility checking with rules engine
- Automatic dependent triggering on completion
- Dependency visualization and monitoring tools

Ready for CHECKPOINT 3: Enhanced Topology Coordination"
```

---

## CHECKPOINT 3: Enhanced Topology Coordination
**Git Tag**: `v1.2-topology-coordination`
**Duration**: 3-4 days
**Dependencies**: Checkpoints 1 & 2 completed

### Objectives
- Update mesh coordinator with persistence and recovery
- Enhance hierarchical coordinator with keep-alive mechanisms
- Improve resource coordinator for re-runs and optimization
- Create unified topology management system

### Files to Modify

#### 1. Enhanced Mesh Coordinator
**File**: `/src/swarm/coordinator.ts` (enhance existing mesh coordinator)
```typescript
export class EnhancedMeshCoordinator extends EventEmitter {
  private meshState: MeshState;
  private persistenceManager: TopologyPersistenceManager;
  private healthMonitor: TopologyHealthMonitor;
  private recoveryManager: TopologyRecoveryManager;

  async initializeMesh(topology: MeshTopology): Promise<MeshInitResult> {
    // Load previous state if available
    const savedState = await this.persistenceManager.loadMeshState();
    if (savedState && this.isStateValid(savedState)) {
      await this.restoreMeshFromState(savedState);
    } else {
      await this.createFreshMesh(topology);
    }

    // Start health monitoring
    await this.healthMonitor.startMonitoring();

    // Setup persistence autosave
    this.setupAutoPersistence();

    return { initialized: true, restored: !!savedState };
  }

  async addAgentToMesh(agentId: string, capabilities: AgentCapabilities): Promise<void> {
    const placement = await this.optimizeAgentPlacement(agentId, capabilities);
    await this.meshState.addAgent(agentId, placement);

    // Update connections based on mesh topology
    await this.updateMeshConnections(agentId);

    // Persist state change
    await this.persistenceManager.saveMeshState(this.meshState);

    this.emit('mesh:agent-added', { agentId, placement });
  }

  async removeAgentFromMesh(agentId: string): Promise<void> {
    const connections = await this.meshState.getAgentConnections(agentId);

    // Gracefully redistribute connections
    await this.redistributeConnections(connections);

    // Remove agent from mesh
    await this.meshState.removeAgent(agentId);

    // Update mesh topology
    await this.rebalanceMesh();

    // Persist changes
    await this.persistenceManager.saveMeshState(this.meshState);

    this.emit('mesh:agent-removed', { agentId, redistributedConnections: connections });
  }

  async handleAgentFailure(agentId: string): Promise<FailureRecoveryResult> {
    const recoveryPlan = await this.recoveryManager.createRecoveryPlan(agentId);

    // Execute recovery based on mesh topology
    const result = await this.executeRecoveryPlan(recoveryPlan);

    // Update mesh state
    await this.updateMeshAfterRecovery(agentId, result);

    return result;
  }

  private async optimizeAgentPlacement(agentId: string, capabilities: AgentCapabilities): Promise<MeshPlacement> {
    const currentLoad = await this.meshState.getLoadDistribution();
    const compatibleNodes = await this.findCompatibleNodes(capabilities);

    return this.calculateOptimalPlacement(currentLoad, compatibleNodes);
  }
}
```

#### 2. Enhanced Hierarchical Coordinator
**New File**: `/src/swarm/coordinators/HierarchicalCoordinator.ts`
```typescript
export class EnhancedHierarchicalCoordinator extends EventEmitter {
  private hierarchy: HierarchyTree;
  private keepAliveManager: KeepAliveManager;
  private leaderElection: LeaderElectionManager;
  private commandPropagation: CommandPropagationSystem;

  async initializeHierarchy(config: HierarchicalConfig): Promise<void> {
    // Build hierarchy tree
    this.hierarchy = await this.buildHierarchyTree(config);

    // Initialize keep-alive system
    await this.keepAliveManager.initialize(this.hierarchy);

    // Setup leader election for each level
    await this.setupLeaderElection();

    // Start command propagation system
    await this.commandPropagation.initialize(this.hierarchy);
  }

  async addAgentToHierarchy(agentId: string, level: number, role: HierarchyRole): Promise<void> {
    const parent = await this.findOptimalParent(level, role);
    await this.hierarchy.addAgent(agentId, parent, level, role);

    // Setup keep-alive for new agent
    await this.keepAliveManager.addAgent(agentId);

    // Update command propagation paths
    await this.commandPropagation.updatePaths(agentId);

    this.emit('hierarchy:agent-added', { agentId, level, role, parent });
  }

  async handleKeepAliveTimeout(agentId: string): Promise<void> {
    const agentInfo = await this.hierarchy.getAgentInfo(agentId);

    if (agentInfo.role === 'leader') {
      // Trigger leader election
      await this.leaderElection.triggerElection(agentInfo.level);
    } else {
      // Handle subordinate timeout
      await this.handleSubordinateTimeout(agentId);
    }

    // Update hierarchy structure
    await this.hierarchy.markAgentUnresponsive(agentId);

    this.emit('hierarchy:keep-alive-timeout', { agentId, role: agentInfo.role });
  }

  async propagateCommand(command: HierarchyCommand, fromLevel: number): Promise<PropagationResult> {
    const propagationPlan = await this.commandPropagation.createPropagationPlan(command, fromLevel);

    const results = await Promise.allSettled(
      propagationPlan.targets.map(target =>
        this.executeCommandOnTarget(command, target)
      )
    );

    return this.aggregatePropagationResults(results);
  }

  private async setupLeaderElection(): Promise<void> {
    for (const level of this.hierarchy.getLevels()) {
      await this.leaderElection.setupElectionForLevel(level);
    }
  }
}
```

#### 3. Enhanced Resource Coordinator
**New File**: `/src/swarm/coordinators/ResourceCoordinator.ts`
```typescript
export class EnhancedResourceCoordinator extends EventEmitter {
  private resourcePool: ResourcePool;
  private allocationHistory: AllocationHistory;
  private rerunManager: RerunManager;
  private optimizationEngine: ResourceOptimizationEngine;

  async allocateResources(request: ResourceRequest): Promise<AllocationResult> {
    // Check resource availability
    const availability = await this.resourcePool.checkAvailability(request);

    if (!availability.sufficient) {
      // Attempt resource optimization
      const optimized = await this.optimizationEngine.optimizeForRequest(request);

      if (optimized.feasible) {
        await this.applyOptimizations(optimized.optimizations);
      } else {
        return { allocated: false, reason: 'Insufficient resources', suggestions: optimized.suggestions };
      }
    }

    // Allocate resources
    const allocation = await this.resourcePool.allocate(request);

    // Record allocation for future optimization
    await this.allocationHistory.record(allocation);

    return { allocated: true, allocation };
  }

  async handleRerunRequest(agentId: string, rerunConfig: RerunConfig): Promise<RerunResult> {
    // Analyze previous run resource usage
    const previousUsage = await this.allocationHistory.getAgentUsage(agentId);

    // Optimize resource allocation for rerun
    const optimizedRequest = await this.optimizationEngine.optimizeForRerun(
      agentId,
      rerunConfig,
      previousUsage
    );

    // Reserve resources for rerun
    const reservation = await this.resourcePool.reserve(optimizedRequest);

    // Setup rerun monitoring
    await this.rerunManager.setupRerunMonitoring(agentId, reservation);

    return {
      approved: true,
      reservation: reservation.id,
      estimatedDuration: optimizedRequest.estimatedDuration,
      optimizations: optimizedRequest.optimizations
    };
  }

  async optimizeResourceUsage(): Promise<OptimizationResult> {
    const currentUsage = await this.resourcePool.getCurrentUsage();
    const optimization = await this.optimizationEngine.analyzeAndOptimize(currentUsage);

    if (optimization.improvements.length > 0) {
      await this.applyOptimizations(optimization.improvements);

      this.emit('resources:optimized', {
        improvements: optimization.improvements,
        estimatedSavings: optimization.estimatedSavings
      });
    }

    return optimization;
  }

  async predictResourceNeeds(timeHorizon: number): Promise<ResourcePrediction> {
    const historicalData = await this.allocationHistory.getHistoricalData(timeHorizon);
    const trends = await this.optimizationEngine.analyzeTrends(historicalData);

    return this.optimizationEngine.predictFutureNeeds(trends);
  }
}
```

#### 4. Unified Topology Management
**New File**: `/src/swarm/topology/TopologyManager.ts`
```typescript
export class UnifiedTopologyManager extends EventEmitter {
  private activeTopologies: Map<string, TopologyCoordinator> = new Map();
  private topologyRegistry: TopologyRegistry;
  private migrationManager: TopologyMigrationManager;
  private performanceMonitor: TopologyPerformanceMonitor;

  async createTopology(config: TopologyConfig): Promise<TopologyCreationResult> {
    const coordinator = this.createCoordinatorForType(config.type);

    // Initialize coordinator
    await coordinator.initialize(config);

    // Register topology
    await this.topologyRegistry.register(config.id, coordinator);
    this.activeTopologies.set(config.id, coordinator);

    // Start performance monitoring
    await this.performanceMonitor.startMonitoring(config.id);

    return { created: true, topologyId: config.id };
  }

  async migrateTopology(fromTopologyId: string, toConfig: TopologyConfig): Promise<MigrationResult> {
    const fromCoordinator = this.activeTopologies.get(fromTopologyId);
    if (!fromCoordinator) {
      throw new Error(`Topology ${fromTopologyId} not found`);
    }

    // Create migration plan
    const migrationPlan = await this.migrationManager.createMigrationPlan(
      fromCoordinator,
      toConfig
    );

    // Execute migration
    const result = await this.migrationManager.executeMigration(migrationPlan);

    // Update registrations
    if (result.success) {
      await this.updateTopologyRegistration(fromTopologyId, toConfig.id, result.newCoordinator);
    }

    return result;
  }

  async optimizeTopology(topologyId: string): Promise<OptimizationResult> {
    const coordinator = this.activeTopologies.get(topologyId);
    const metrics = await this.performanceMonitor.getMetrics(topologyId);

    const optimizations = await this.analyzeOptimizationOpportunities(coordinator, metrics);

    if (optimizations.length > 0) {
      await this.applyOptimizations(coordinator, optimizations);
    }

    return { optimizations, applied: optimizations.length };
  }

  private createCoordinatorForType(type: TopologyType): TopologyCoordinator {
    switch (type) {
      case 'mesh':
        return new EnhancedMeshCoordinator();
      case 'hierarchical':
        return new EnhancedHierarchicalCoordinator();
      case 'resource':
        return new EnhancedResourceCoordinator();
      default:
        throw new Error(`Unknown topology type: ${type}`);
    }
  }
}
```

### Testing Strategy

#### Unit Tests
```typescript
// Test individual coordinator enhancements
describe('EnhancedMeshCoordinator', () => {
  test('should persist and restore mesh state')
  test('should handle agent failures gracefully')
  test('should optimize agent placement')
  test('should rebalance mesh on topology changes')
});

describe('EnhancedHierarchicalCoordinator', () => {
  test('should maintain hierarchy integrity')
  test('should handle keep-alive timeouts')
  test('should propagate commands correctly')
  test('should elect new leaders on failure')
});

describe('EnhancedResourceCoordinator', () => {
  test('should optimize resource allocation')
  test('should handle rerun requests efficiently')
  test('should predict resource needs accurately')
  test('should apply resource optimizations')
});
```

#### Integration Tests
```typescript
describe('Topology Coordination Integration', () => {
  test('should coordinate between different topology types')
  test('should migrate topologies without data loss')
  test('should maintain consistency during coordinator failures')
  test('should optimize across multiple topologies')
});
```

### Rollback Strategy

#### Failure Scenarios
- Coordinator initialization failures
- Topology migration failures
- Resource allocation conflicts
- Keep-alive system malfunctions

#### Recovery Procedures
1. **Coordinator Isolation**: Isolate failing coordinator
2. **State Backup**: Create emergency state backup
3. **Fallback Topology**: Switch to simple fallback topology
4. **Gradual Recovery**: Incrementally restore coordinator functions
5. **Full Validation**: Validate all topology functions before resuming

### Git Commit Strategy

```bash
# Tag the checkpoint
git tag -a v1.2-topology-coordination -m "CHECKPOINT 3: Enhanced Topology Coordination

Advanced topology management with:
- Enhanced mesh coordinator with persistence and recovery
- Hierarchical coordinator with keep-alive mechanisms
- Resource coordinator with rerun optimization
- Unified topology management and migration

Ready for CHECKPOINT 4: Integration Testing & Validation"
```

---

## CHECKPOINT 4: Integration Testing & Validation
**Git Tag**: `v1.3-lifecycle-complete`
**Duration**: 3-4 days
**Dependencies**: Checkpoints 1, 2 & 3 completed

### Objectives
- Create comprehensive integration tests for all lifecycle components
- Validate race condition elimination with stress testing
- Implement performance testing and optimization
- Establish rollback procedures and disaster recovery

### Testing Framework Implementation

#### 1. Comprehensive Integration Test Suite
**New File**: `/tests/integration/lifecycle-complete-integration.test.ts`
```typescript
describe('Complete Lifecycle Management Integration', () => {
  let lifecycleManager: AgentLifecycleManager;
  let dependencyTracker: DependencyTracker;
  let topologyManager: UnifiedTopologyManager;
  let testEnvironment: LifecycleTestEnvironment;

  beforeEach(async () => {
    testEnvironment = await LifecycleTestEnvironment.create();
    // Initialize all components in integration mode
  });

  describe('Race Condition Elimination', () => {
    test('should prevent race conditions in concurrent agent completion', async () => {
      const agentIds = ['agent1', 'agent2', 'agent3', 'agent4', 'agent5'];

      // Setup complex dependency chain
      await setupComplexDependencyChain(agentIds);

      // Simulate concurrent completion attempts
      const completionPromises = agentIds.map(id =>
        simulateAgentCompletion(id, Math.random() * 100)
      );

      const results = await Promise.allSettled(completionPromises);

      // Validate no race conditions occurred
      const finalStates = await validateCompletionOrder(agentIds);
      expect(finalStates).toMatchDependencyConstraints();
    });

    test('should handle simultaneous dependency resolution correctly', async () => {
      // Test multiple agents becoming eligible simultaneously
      // Validate only appropriate agents are triggered
      // Ensure state consistency throughout
    });
  });

  describe('End-to-End Workflows', () => {
    test('should handle complete feature development lifecycle', async () => {
      const feature = await createTestFeature({
        name: 'payment-integration',
        agents: ['researcher', 'coder', 'tester', 'reviewer'],
        dependencies: ['database-ready', 'api-stable']
      });

      // Execute complete lifecycle
      const result = await executeFeatureLifecycle(feature);

      // Validate all phases completed correctly
      expect(result.completedPhases).toEqual([
        'planning', 'development', 'testing', 'review', 'staging', 'production'
      ]);
      expect(result.agentCoordination).toBeConsistent();
    });

    test('should recover from mid-lifecycle failures gracefully', async () => {
      // Simulate various failure scenarios during lifecycle
      // Validate recovery procedures work correctly
      // Ensure no data loss or corruption
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain performance with 100+ concurrent agents', async () => {
      const agentCount = 100;
      const agents = await spawnMultipleAgents(agentCount);

      const startTime = Date.now();
      await executeComplexWorkflow(agents);
      const duration = Date.now() - startTime;

      // Performance thresholds
      expect(duration).toBeLessThan(30000); // 30 seconds max
      expect(await getMemoryUsage()).toBeLessThan(500 * 1024 * 1024); // 500MB max
    });

    test('should handle rapid state transitions efficiently', async () => {
      // Test rapid fire state changes
      // Validate no state corruption
      // Ensure acceptable performance
    });
  });
});
```

#### 2. Stress Testing Framework
**New File**: `/tests/stress/lifecycle-stress-tests.ts`
```typescript
describe('Lifecycle Management Stress Tests', () => {
  test('should handle extreme dependency graphs', async () => {
    // Create dependency graph with 1000+ nodes
    const largeGraph = await createLargeDependencyGraph(1000);

    // Validate graph operations remain performant
    const analysisTime = await measureTime(() =>
      dependencyTracker.analyzeDependencyChain('root-node')
    );

    expect(analysisTime).toBeLessThan(5000); // 5 seconds max
  });

  test('should survive coordinator failures under load', async () => {
    // Start high-load scenario
    await startHighLoadScenario();

    // Randomly fail coordinators
    await simulateRandomCoordinatorFailures();

    // Validate system recovery
    const healthCheck = await performSystemHealthCheck();
    expect(healthCheck.overall).toBe('healthy');
  });

  test('should maintain consistency during resource exhaustion', async () => {
    // Exhaust system resources
    await exhaustSystemResources();

    // Attempt lifecycle operations
    const operations = await attemptLifecycleOperations();

    // Validate graceful degradation
    expect(operations.allHandledGracefully).toBe(true);
  });
});
```

#### 3. Race Condition Detection Tools
**New File**: `/tests/tools/RaceConditionDetector.ts`
```typescript
export class RaceConditionDetector {
  private eventLog: TimestampedEvent[] = [];
  private stateSnapshots: Map<string, any> = new Map();
  private detectionRules: DetectionRule[] = [];

  async detectRaceConditions(scenario: TestScenario): Promise<RaceConditionReport> {
    // Clear previous data
    this.eventLog = [];
    this.stateSnapshots.clear();

    // Setup monitoring
    await this.setupEventMonitoring();

    // Execute scenario
    await scenario.execute();

    // Analyze for race conditions
    const violations = await this.analyzeEventLog();

    return {
      detected: violations.length > 0,
      violations,
      eventCount: this.eventLog.length,
      analysis: await this.generateAnalysis(violations)
    };
  }

  private async analyzeEventLog(): Promise<RaceConditionViolation[]> {
    const violations: RaceConditionViolation[] = [];

    // Check for concurrent state modifications
    violations.push(...await this.detectConcurrentStateModifications());

    // Check for dependency order violations
    violations.push(...await this.detectDependencyOrderViolations());

    // Check for resource access conflicts
    violations.push(...await this.detectResourceAccessConflicts());

    return violations;
  }
}
```

#### 4. Performance Benchmarking Suite
**New File**: `/tests/performance/lifecycle-benchmarks.ts`
```typescript
describe('Lifecycle Performance Benchmarks', () => {
  const benchmarkSuite = new LifecycleBenchmarkSuite();

  test('should benchmark dependency graph operations', async () => {
    const results = await benchmarkSuite.runBenchmark('dependency-operations', {
      graphSizes: [10, 50, 100, 500, 1000],
      operations: ['add-dependency', 'check-eligibility', 'mark-completed', 'analyze-chain'],
      iterations: 100
    });

    // Validate performance targets
    expect(results.operations['check-eligibility'].averageTime).toBeLessThan(10); // 10ms
    expect(results.operations['mark-completed'].averageTime).toBeLessThan(50); // 50ms
    expect(results.operations['analyze-chain'].averageTime).toBeLessThan(100); // 100ms
  });

  test('should benchmark state transition performance', async () => {
    const results = await benchmarkSuite.runBenchmark('state-transitions', {
      agentCounts: [10, 50, 100, 200, 500],
      transitionTypes: ['idle-to-working', 'working-to-completed', 'completed-to-rerunning'],
      concurrency: [1, 5, 10, 20]
    });

    // Performance regression detection
    const baseline = await loadPerformanceBaseline();
    expect(results).not.toShowPerformanceRegression(baseline);
  });
});
```

### Validation Procedures

#### 1. System Health Validation
**New File**: `/src/validation/SystemHealthValidator.ts`
```typescript
export class SystemHealthValidator {
  async validateSystemHealth(): Promise<HealthValidationResult> {
    const checks = await Promise.all([
      this.validateLifecycleManagerHealth(),
      this.validateDependencyTrackerHealth(),
      this.validateTopologyCoordinatorHealth(),
      this.validateHookSystemHealth(),
      this.validatePersistenceHealth()
    ]);

    return this.aggregateHealthResults(checks);
  }

  private async validateLifecycleManagerHealth(): Promise<ComponentHealthCheck> {
    // Check agent state consistency
    // Validate checkpoint integrity
    // Verify event emission functionality
    // Test state transition logic
  }

  private async validateDependencyTrackerHealth(): Promise<ComponentHealthCheck> {
    // Validate dependency graph integrity
    // Check for orphaned dependencies
    // Verify bidirectional consistency
    // Test circular dependency detection
  }

  async performSelfHealingActions(): Promise<SelfHealingResult> {
    const issues = await this.detectSystemIssues();
    const healingActions = await this.planHealingActions(issues);

    return await this.executeHealingActions(healingActions);
  }
}
```

#### 2. Data Integrity Validation
**New File**: `/src/validation/DataIntegrityValidator.ts`
```typescript
export class DataIntegrityValidator {
  async validateDataIntegrity(): Promise<IntegrityValidationResult> {
    const checks = await Promise.all([
      this.validateStateConsistency(),
      this.validateDependencyIntegrity(),
      this.validatePersistenceIntegrity(),
      this.validateCheckpointValidity()
    ]);

    return this.aggregateIntegrityResults(checks);
  }

  async repairDataCorruption(corruptionReport: CorruptionReport): Promise<RepairResult> {
    const repairPlan = await this.createRepairPlan(corruptionReport);
    return await this.executeRepairPlan(repairPlan);
  }
}
```

### Rollback and Disaster Recovery

#### 1. Comprehensive Rollback Procedures
**New File**: `/src/lifecycle/rollback/ComprehensiveRollbackManager.ts`
```typescript
export class ComprehensiveRollbackManager {
  async createSystemCheckpoint(): Promise<SystemCheckpoint> {
    return {
      id: generateCheckpointId(),
      timestamp: new Date(),
      lifecycleStates: await this.captureLifecycleStates(),
      dependencyGraph: await this.captureDependencyGraph(),
      topologyStates: await this.captureTopologyStates(),
      persistedData: await this.capturePersistedData(),
      systemMetrics: await this.captureSystemMetrics()
    };
  }

  async rollbackToCheckpoint(checkpointId: string): Promise<RollbackResult> {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    // Stop all active operations
    await this.freezeSystemOperations();

    try {
      // Restore system state
      await this.restoreSystemState(checkpoint);

      // Validate restored state
      const validation = await this.validateRestoredState();

      if (validation.valid) {
        await this.resumeSystemOperations();
        return { success: true, restoredTo: checkpoint.timestamp };
      } else {
        throw new Error('State validation failed after rollback');
      }
    } catch (error) {
      // Emergency recovery
      await this.performEmergencyRecovery();
      throw error;
    }
  }

  async performDisasterRecovery(): Promise<DisasterRecoveryResult> {
    // Multi-level recovery strategy
    const strategies = [
      'checkpoint-rollback',
      'component-reset',
      'clean-initialization',
      'emergency-safe-mode'
    ];

    for (const strategy of strategies) {
      try {
        const result = await this.executeRecoveryStrategy(strategy);
        if (result.success) {
          return result;
        }
      } catch (error) {
        console.warn(`Recovery strategy ${strategy} failed:`, error);
      }
    }

    // Last resort: safe mode
    return await this.enterSafeMode();
  }
}
```

### Git Commit Strategy

```bash
# 1. Integration test framework
git add tests/integration/lifecycle-complete-integration.test.ts
git commit -m "Add comprehensive lifecycle integration test suite

- End-to-end workflow testing
- Race condition elimination validation
- Performance under load testing
- Multi-component coordination testing

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 2. Stress testing and race condition detection
git add tests/stress/ tests/tools/RaceConditionDetector.ts
git commit -m "Implement stress testing and race condition detection

- High-load stress testing framework
- Race condition detection tools
- Resource exhaustion testing
- Coordinator failure simulation

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 3. Performance benchmarking
git add tests/performance/lifecycle-benchmarks.ts
git commit -m "Add performance benchmarking suite for lifecycle management

- Dependency graph operation benchmarks
- State transition performance testing
- Performance regression detection
- Scalability validation

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 4. System validation and health checking
git add src/validation/
git commit -m "Implement system health validation and self-healing

- Comprehensive health validation
- Data integrity checking
- Automated self-healing capabilities
- Component health monitoring

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. Rollback and disaster recovery
git add src/lifecycle/rollback/
git commit -m "Add comprehensive rollback and disaster recovery

- System-wide checkpoint creation
- Multi-level rollback procedures
- Disaster recovery strategies
- Emergency safe mode functionality

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Tag the final checkpoint
git tag -a v1.3-lifecycle-complete -m "CHECKPOINT 4: Integration Testing & Validation COMPLETE

Complete agent lifecycle management system with:
- Comprehensive integration testing and validation
- Race condition elimination with stress testing
- Performance benchmarking and optimization
- Robust rollback procedures and disaster recovery

All checkpoints completed successfully. System ready for production use."
```

---

## Summary and Next Steps

### Implementation Timeline
- **Week 1**: CHECKPOINT 1 - Agent Lifecycle State Management
- **Week 2**: CHECKPOINT 2 - Dependency-Aware Completion Tracking
- **Week 3**: CHECKPOINT 3 - Enhanced Topology Coordination
- **Week 4**: CHECKPOINT 4 - Integration Testing & Validation

### Success Criteria
✅ Each checkpoint is independently functional
✅ Race conditions eliminated through comprehensive testing
✅ Rollback-safe architecture with recovery procedures
✅ Performance validated under stress testing
✅ Data integrity maintained throughout all operations

### Production Readiness Checklist
- [ ] All unit tests passing (>95% coverage)
- [ ] Integration tests validating end-to-end workflows
- [ ] Stress tests confirming system stability under load
- [ ] Performance benchmarks meeting targets
- [ ] Rollback procedures tested and documented
- [ ] Disaster recovery validated
- [ ] Documentation complete and reviewed
- [ ] Security audit completed

This implementation plan provides a robust, battle-tested agent lifecycle management system that eliminates race conditions while maintaining high performance and reliability.