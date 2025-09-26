/**
 * Dependency-Aware Completion Tracking System
 *
 * Prevents coordinators from completing before dependent agents finish.
 * Tracks bidirectional dependencies and handles dependency chains/cycles.
 * Integrates with lifecycle management and provides memory persistence.
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { MemoryManager } from '../memory/manager.js';
import { EventBus } from '../core/event-bus.js';
import { generateId } from '../utils/helpers.js';
import type {
  AgentLifecycleState,
  AgentLifecycleManager,
  LifecycleMemoryManager
} from '../types/agent-lifecycle-types.js';

// ============================================================================
// Core Dependency Types
// ============================================================================

export interface AgentDependency {
  id: string;
  dependentAgentId: string;    // Agent that depends on another
  providerAgentId: string;     // Agent that provides the dependency
  dependencyType: DependencyType;
  dependencyData?: DependencyData;
  status: DependencyStatus;
  createdAt: Date;
  resolvedAt?: Date;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

export enum DependencyType {
  /** Agent B must complete before Agent A can complete */
  COMPLETION = 'completion',
  /** Agent B must provide data before Agent A can continue */
  DATA_DEPENDENCY = 'data_dependency',
  /** Agent B must be running for Agent A to function */
  SERVICE_DEPENDENCY = 'service_dependency',
  /** Agent B coordinates Agent A's lifecycle */
  COORDINATION = 'coordination',
  /** Custom dependency with specific rules */
  CUSTOM = 'custom'
}

export enum DependencyStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled'
}

export interface DependencyData {
  type: string;
  content?: unknown;
  schema?: Record<string, unknown>;
  validation?: (data: unknown) => boolean;
  transform?: (data: unknown) => unknown;
}

export interface DependencyChain {
  id: string;
  startAgent: string;
  endAgent: string;
  path: string[];
  length: number;
  hasCycle: boolean;
  cycleNodes?: string[];
}

export interface DependencyViolation {
  type: 'cycle' | 'timeout' | 'missing_provider' | 'invalid_state' | 'custom';
  message: string;
  affectedAgents: string[];
  dependencyIds: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolutionHints?: string[];
}

export interface CompletionBlockerInfo {
  agentId: string;
  blockedBy: string[];
  blocking: string[];
  canComplete: boolean;
  reason?: string;
  dependencyChains: DependencyChain[];
}

// ============================================================================
// Core DependencyTracker Class
// ============================================================================

export class DependencyTracker extends EventEmitter {
  private logger: Logger;
  private memoryManager: MemoryManager;
  private dependencies: Map<string, AgentDependency>;
  private agentDependencies: Map<string, Set<string>>; // agentId -> dependency IDs
  private providerDependencies: Map<string, Set<string>>; // agentId -> dependency IDs
  private pendingCompletions: Set<string>; // Agents trying to complete
  private completionBlocks: Map<string, CompletionBlockerInfo>;
  private memoryNamespace: string;
  private cyclicDependencyGraph: Map<string, Set<string>>;
  private dependencyTimeouts: Map<string, NodeJS.Timeout>;
  private isInitialized: boolean = false;

  constructor(memoryNamespace: string = 'dependency-tracker') {
    super();
    this.logger = new Logger('DependencyTracker');
    this.memoryNamespace = memoryNamespace;

    // Initialize data structures
    this.dependencies = new Map();
    this.agentDependencies = new Map();
    this.providerDependencies = new Map();
    this.pendingCompletions = new Set();
    this.completionBlocks = new Map();
    this.cyclicDependencyGraph = new Map();
    this.dependencyTimeouts = new Map();

    // Initialize memory manager
    const eventBus = EventBus.getInstance();
    this.memoryManager = new MemoryManager(
      {
        backend: 'sqlite',
        namespace: this.memoryNamespace,
        cacheSizeMB: 25,
        syncOnExit: true,
        maxEntries: 5000,
        ttlMinutes: 120, // Dependencies persist for 2 hours
      },
      eventBus,
      this.logger
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle dependency resolution events
    this.on('dependency:resolved', this.onDependencyResolved.bind(this));
    this.on('dependency:failed', this.onDependencyFailed.bind(this));
    this.on('dependency:timeout', this.onDependencyTimeout.bind(this));

    // Handle agent lifecycle events
    this.on('agent:completing', this.onAgentCompleting.bind(this));
    this.on('agent:state_changed', this.onAgentStateChanged.bind(this));
  }

  // ============================================================================
  // Initialization and Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('DependencyTracker already initialized');
      return;
    }

    this.logger.info('Initializing DependencyTracker...');

    await this.memoryManager.initialize();
    await this.restoreFromMemory();

    this.isInitialized = true;
    this.logger.info('DependencyTracker initialized successfully');
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    this.logger.info('Shutting down DependencyTracker...');

    // Clear all timeouts
    for (const timeout of this.dependencyTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.dependencyTimeouts.clear();

    // Save state to memory
    await this.saveToMemory();

    this.isInitialized = false;
    this.logger.info('DependencyTracker shutdown complete');
  }

  // ============================================================================
  // Dependency Registration and Management
  // ============================================================================

  /**
   * Register a bidirectional dependency between two agents
   */
  async registerDependency(
    dependentAgentId: string,
    providerAgentId: string,
    type: DependencyType,
    options: {
      dependencyData?: DependencyData;
      timeout?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('DependencyTracker not initialized');
    }

    if (dependentAgentId === providerAgentId) {
      throw new Error('Agent cannot depend on itself');
    }

    const dependencyId = generateId('dep');
    const dependency: AgentDependency = {
      id: dependencyId,
      dependentAgentId,
      providerAgentId,
      dependencyType: type,
      dependencyData: options.dependencyData,
      status: DependencyStatus.PENDING,
      createdAt: new Date(),
      timeout: options.timeout,
      metadata: options.metadata
    };

    // Check for cycles before adding
    if (this.wouldCreateCycle(dependentAgentId, providerAgentId)) {
      const violation: DependencyViolation = {
        type: 'cycle',
        message: `Adding dependency would create a cycle: ${dependentAgentId} -> ${providerAgentId}`,
        affectedAgents: [dependentAgentId, providerAgentId],
        dependencyIds: [dependencyId],
        severity: 'high',
        resolutionHints: [
          'Remove conflicting dependencies',
          'Restructure agent coordination flow',
          'Use event-based communication instead'
        ]
      };

      this.emit('dependency:violation', violation);
      throw new Error(violation.message);
    }

    // Store dependency
    this.dependencies.set(dependencyId, dependency);

    // Update bidirectional tracking
    this.updateAgentDependencyMappings(dependencyId, dependentAgentId, providerAgentId);

    // Update dependency graph
    this.updateDependencyGraph(dependentAgentId, providerAgentId);

    // Set timeout if specified
    if (dependency.timeout) {
      this.setDependencyTimeout(dependencyId, dependency.timeout);
    }

    // Persist to memory
    await this.persistDependency(dependency);

    // Update completion blockers
    await this.updateCompletionBlockers(dependentAgentId);

    this.logger.info(
      `Registered ${type} dependency: ${dependentAgentId} depends on ${providerAgentId} (${dependencyId})`
    );

    this.emit('dependency:registered', dependency);
    return dependencyId;
  }

  /**
   * Remove a dependency
   */
  async removeDependency(dependencyId: string): Promise<boolean> {
    const dependency = this.dependencies.get(dependencyId);
    if (!dependency) {
      return false;
    }

    // Clear timeout if set
    const timeout = this.dependencyTimeouts.get(dependencyId);
    if (timeout) {
      clearTimeout(timeout);
      this.dependencyTimeouts.delete(dependencyId);
    }

    // Remove from tracking maps
    this.removeFromAgentDependencyMappings(dependencyId, dependency);

    // Update dependency graph
    this.removeDependencyFromGraph(dependency.dependentAgentId, dependency.providerAgentId);

    // Remove from dependencies
    this.dependencies.delete(dependencyId);

    // Update completion blockers
    await this.updateCompletionBlockers(dependency.dependentAgentId);

    // Remove from memory
    await this.removeDependencyFromMemory(dependencyId);

    this.logger.info(`Removed dependency: ${dependencyId}`);
    this.emit('dependency:removed', dependency);

    return true;
  }

  /**
   * Resolve a dependency (mark as completed)
   */
  async resolveDependency(
    dependencyId: string,
    resolutionData?: unknown
  ): Promise<boolean> {
    const dependency = this.dependencies.get(dependencyId);
    if (!dependency) {
      this.logger.warn(`Cannot resolve non-existent dependency: ${dependencyId}`);
      return false;
    }

    if (dependency.status !== DependencyStatus.PENDING && dependency.status !== DependencyStatus.ACTIVE) {
      this.logger.warn(`Cannot resolve dependency in state: ${dependency.status}`);
      return false;
    }

    // Validate resolution data if dependency data schema exists
    if (dependency.dependencyData?.validation && resolutionData !== undefined) {
      try {
        if (!dependency.dependencyData.validation(resolutionData)) {
          this.logger.error(`Dependency resolution data validation failed for ${dependencyId}`);
          return false;
        }
      } catch (error) {
        this.logger.error(`Dependency validation error for ${dependencyId}:`, error);
        return false;
      }
    }

    // Transform data if transformer exists
    let finalData = resolutionData;
    if (dependency.dependencyData?.transform && resolutionData !== undefined) {
      try {
        finalData = dependency.dependencyData.transform(resolutionData);
      } catch (error) {
        this.logger.error(`Dependency data transformation failed for ${dependencyId}:`, error);
        return false;
      }
    }

    // Update dependency status
    dependency.status = DependencyStatus.RESOLVED;
    dependency.resolvedAt = new Date();
    if (finalData !== undefined) {
      dependency.dependencyData = {
        ...dependency.dependencyData,
        content: finalData
      };
    }

    // Clear timeout
    const timeout = this.dependencyTimeouts.get(dependencyId);
    if (timeout) {
      clearTimeout(timeout);
      this.dependencyTimeouts.delete(dependencyId);
    }

    // Update completion blockers
    await this.updateCompletionBlockers(dependency.dependentAgentId);

    // Persist updated state
    await this.persistDependency(dependency);

    this.logger.info(`Resolved dependency: ${dependencyId}`);
    this.emit('dependency:resolved', { dependency, resolutionData: finalData });

    return true;
  }

  // ============================================================================
  // Completion Tracking and Blocking
  // ============================================================================

  /**
   * Check if an agent can complete (has no pending dependencies)
   */
  async canAgentComplete(agentId: string): Promise<CompletionBlockerInfo> {
    const agentDeps = this.agentDependencies.get(agentId) || new Set();
    const blockedBy: string[] = [];
    const blocking: string[] = [];
    const dependencyChains: DependencyChain[] = [];

    // Check dependencies that block this agent
    for (const depId of agentDeps) {
      const dep = this.dependencies.get(depId);
      if (dep && dep.status === DependencyStatus.PENDING) {
        blockedBy.push(dep.providerAgentId);
      }
    }

    // Check what this agent is blocking
    const providerDeps = this.providerDependencies.get(agentId) || new Set();
    for (const depId of providerDeps) {
      const dep = this.dependencies.get(depId);
      if (dep && dep.status === DependencyStatus.PENDING) {
        blocking.push(dep.dependentAgentId);
      }
    }

    // Build dependency chains
    const chains = this.getDependencyChains(agentId);
    dependencyChains.push(...chains);

    const canComplete = blockedBy.length === 0;
    const reason = canComplete
      ? undefined
      : `Blocked by ${blockedBy.length} dependencies: [${blockedBy.join(', ')}]`;

    const blockerInfo: CompletionBlockerInfo = {
      agentId,
      blockedBy,
      blocking,
      canComplete,
      reason,
      dependencyChains
    };

    this.completionBlocks.set(agentId, blockerInfo);
    return blockerInfo;
  }

  /**
   * Request agent completion - will be blocked if dependencies exist
   */
  async requestAgentCompletion(agentId: string): Promise<boolean> {
    const blockerInfo = await this.canAgentComplete(agentId);

    if (blockerInfo.canComplete) {
      // Agent can complete immediately
      this.pendingCompletions.delete(agentId);
      this.completionBlocks.delete(agentId);

      this.logger.info(`Agent ${agentId} approved for completion`);
      this.emit('agent:completion_approved', { agentId });
      return true;
    } else {
      // Agent completion is blocked
      this.pendingCompletions.add(agentId);

      this.logger.info(`Agent ${agentId} completion blocked: ${blockerInfo.reason}`);
      this.emit('agent:completion_blocked', { agentId, blockerInfo });
      return false;
    }
  }

  /**
   * Force agent completion (bypass dependency checks)
   */
  async forceAgentCompletion(agentId: string, reason: string): Promise<void> {
    // Remove from pending completions
    this.pendingCompletions.delete(agentId);

    // Cancel all dependencies where this agent is dependent
    const agentDeps = this.agentDependencies.get(agentId) || new Set();
    for (const depId of agentDeps) {
      const dep = this.dependencies.get(depId);
      if (dep && dep.status === DependencyStatus.PENDING) {
        dep.status = DependencyStatus.CANCELLED;
        await this.persistDependency(dep);
      }
    }

    // Update completion blockers for affected agents
    const affectedAgents = new Set<string>();
    const providerDeps = this.providerDependencies.get(agentId) || new Set();
    for (const depId of providerDeps) {
      const dep = this.dependencies.get(depId);
      if (dep) {
        affectedAgents.add(dep.dependentAgentId);
      }
    }

    for (const affectedAgent of affectedAgents) {
      await this.updateCompletionBlockers(affectedAgent);
    }

    this.logger.warn(`Forced completion of agent ${agentId}: ${reason}`);
    this.emit('agent:completion_forced', { agentId, reason });
  }

  // ============================================================================
  // Dependency Chain and Cycle Detection
  // ============================================================================

  /**
   * Check if adding a dependency would create a cycle
   */
  private wouldCreateCycle(dependentId: string, providerId: string): boolean {
    // Use DFS to check if there's already a path from provider to dependent
    const visited = new Set<string>();
    const stack = [providerId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === dependentId) {
        return true; // Cycle detected
      }

      if (!visited.has(current)) {
        visited.add(current);
        const dependencies = this.cyclicDependencyGraph.get(current) || new Set();
        stack.push(...Array.from(dependencies));
      }
    }

    return false;
  }

  /**
   * Get all dependency chains starting from an agent
   */
  private getDependencyChains(startAgent: string): DependencyChain[] {
    const chains: DependencyChain[] = [];
    const visited = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (agentId: string, path: string[]): void => {
      if (path.includes(agentId)) {
        // Cycle detected
        const cycleStart = path.indexOf(agentId);
        const cycleNodes = path.slice(cycleStart);
        chains.push({
          id: generateId('chain'),
          startAgent,
          endAgent: agentId,
          path: [...path, agentId],
          length: path.length + 1,
          hasCycle: true,
          cycleNodes
        });
        return;
      }

      const newPath = [...path, agentId];
      const dependencies = this.cyclicDependencyGraph.get(agentId) || new Set();

      if (dependencies.size === 0) {
        // End of chain
        chains.push({
          id: generateId('chain'),
          startAgent,
          endAgent: agentId,
          path: newPath,
          length: newPath.length,
          hasCycle: false
        });
        return;
      }

      for (const depAgent of dependencies) {
        dfs(depAgent, newPath);
      }
    };

    dfs(startAgent, []);
    return chains;
  }

  /**
   * Detect all cycles in the dependency graph
   */
  detectCycles(): DependencyChain[] {
    const cycles: DependencyChain[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (agentId: string, path: string[]): void => {
      visited.add(agentId);
      recursionStack.add(agentId);

      const dependencies = this.cyclicDependencyGraph.get(agentId) || new Set();
      for (const depAgent of dependencies) {
        if (!visited.has(depAgent)) {
          dfs(depAgent, [...path, agentId]);
        } else if (recursionStack.has(depAgent)) {
          // Cycle found
          const cycleStart = path.indexOf(depAgent);
          const cyclePath = path.slice(cycleStart);
          cycles.push({
            id: generateId('cycle'),
            startAgent: depAgent,
            endAgent: agentId,
            path: [...cyclePath, agentId, depAgent],
            length: cyclePath.length + 2,
            hasCycle: true,
            cycleNodes: cyclePath
          });
        }
      }

      recursionStack.delete(agentId);
    };

    for (const agentId of this.cyclicDependencyGraph.keys()) {
      if (!visited.has(agentId)) {
        dfs(agentId, []);
      }
    }

    return cycles;
  }

  // ============================================================================
  // Memory Persistence
  // ============================================================================

  private async persistDependency(dependency: AgentDependency): Promise<void> {
    await this.memoryManager.store({
      id: `dependency:${dependency.id}`,
      agentId: 'dependency-tracker',
      type: 'dependency',
      content: JSON.stringify(dependency),
      namespace: this.memoryNamespace,
      timestamp: new Date(),
      metadata: {
        dependentAgent: dependency.dependentAgentId,
        providerAgent: dependency.providerAgentId,
        type: dependency.dependencyType,
        status: dependency.status
      }
    });
  }

  private async removeDependencyFromMemory(dependencyId: string): Promise<void> {
    // Implementation would depend on the memory manager's delete capabilities
    // For now, we mark as deleted
    await this.memoryManager.store({
      id: `dependency:${dependencyId}:deleted`,
      agentId: 'dependency-tracker',
      type: 'dependency-deletion',
      content: JSON.stringify({ dependencyId, deletedAt: new Date() }),
      namespace: this.memoryNamespace,
      timestamp: new Date(),
      metadata: { action: 'delete', dependencyId }
    });
  }

  private async saveToMemory(): Promise<void> {
    // Save current state snapshot
    const state = {
      dependencies: Array.from(this.dependencies.entries()),
      agentDependencies: Array.from(this.agentDependencies.entries()).map(([k, v]) => [k, Array.from(v)]),
      providerDependencies: Array.from(this.providerDependencies.entries()).map(([k, v]) => [k, Array.from(v)]),
      pendingCompletions: Array.from(this.pendingCompletions),
      completionBlocks: Array.from(this.completionBlocks.entries()),
      cyclicDependencyGraph: Array.from(this.cyclicDependencyGraph.entries()).map(([k, v]) => [k, Array.from(v)]),
      timestamp: new Date()
    };

    await this.memoryManager.store({
      id: 'dependency-tracker:state',
      agentId: 'dependency-tracker',
      type: 'tracker-state',
      content: JSON.stringify(state),
      namespace: this.memoryNamespace,
      timestamp: new Date(),
      metadata: {
        dependencyCount: this.dependencies.size,
        agentCount: this.agentDependencies.size,
        pendingCompletions: this.pendingCompletions.size
      }
    });
  }

  private async restoreFromMemory(): Promise<void> {
    try {
      // Restore individual dependencies
      const dependencies = await this.memoryManager.search('dependency:', this.memoryNamespace);
      for (const record of dependencies) {
        if (record.type === 'dependency') {
          try {
            const dependency = JSON.parse(record.content) as AgentDependency;
            this.dependencies.set(dependency.id, dependency);
            this.updateAgentDependencyMappings(dependency.id, dependency.dependentAgentId, dependency.providerAgentId);
            this.updateDependencyGraph(dependency.dependentAgentId, dependency.providerAgentId);

            // Restore timeout if still valid
            if (dependency.timeout && dependency.status === DependencyStatus.PENDING) {
              const elapsed = Date.now() - dependency.createdAt.getTime();
              const remaining = dependency.timeout - elapsed;
              if (remaining > 0) {
                this.setDependencyTimeout(dependency.id, remaining);
              } else {
                // Timeout has already expired
                dependency.status = DependencyStatus.TIMEOUT;
                await this.persistDependency(dependency);
              }
            }
          } catch (error) {
            this.logger.error('Error restoring dependency from memory:', error);
          }
        }
      }

      this.logger.info(`Restored ${this.dependencies.size} dependencies from memory`);
    } catch (error) {
      this.logger.error('Error restoring from memory:', error);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private updateAgentDependencyMappings(
    dependencyId: string,
    dependentAgentId: string,
    providerAgentId: string
  ): void {
    // Update dependent agent mapping
    if (!this.agentDependencies.has(dependentAgentId)) {
      this.agentDependencies.set(dependentAgentId, new Set());
    }
    this.agentDependencies.get(dependentAgentId)!.add(dependencyId);

    // Update provider agent mapping
    if (!this.providerDependencies.has(providerAgentId)) {
      this.providerDependencies.set(providerAgentId, new Set());
    }
    this.providerDependencies.get(providerAgentId)!.add(dependencyId);
  }

  private removeFromAgentDependencyMappings(dependencyId: string, dependency: AgentDependency): void {
    // Remove from dependent agent mapping
    const agentDeps = this.agentDependencies.get(dependency.dependentAgentId);
    if (agentDeps) {
      agentDeps.delete(dependencyId);
      if (agentDeps.size === 0) {
        this.agentDependencies.delete(dependency.dependentAgentId);
      }
    }

    // Remove from provider agent mapping
    const providerDeps = this.providerDependencies.get(dependency.providerAgentId);
    if (providerDeps) {
      providerDeps.delete(dependencyId);
      if (providerDeps.size === 0) {
        this.providerDependencies.delete(dependency.providerAgentId);
      }
    }
  }

  private updateDependencyGraph(dependentId: string, providerId: string): void {
    if (!this.cyclicDependencyGraph.has(dependentId)) {
      this.cyclicDependencyGraph.set(dependentId, new Set());
    }
    this.cyclicDependencyGraph.get(dependentId)!.add(providerId);
  }

  private removeDependencyFromGraph(dependentId: string, providerId: string): void {
    const deps = this.cyclicDependencyGraph.get(dependentId);
    if (deps) {
      deps.delete(providerId);
      if (deps.size === 0) {
        this.cyclicDependencyGraph.delete(dependentId);
      }
    }
  }

  private setDependencyTimeout(dependencyId: string, timeout: number): void {
    const timeoutId = setTimeout(() => {
      this.handleDependencyTimeout(dependencyId);
    }, timeout);

    this.dependencyTimeouts.set(dependencyId, timeoutId);
  }

  private async handleDependencyTimeout(dependencyId: string): Promise<void> {
    const dependency = this.dependencies.get(dependencyId);
    if (!dependency || dependency.status !== DependencyStatus.PENDING) {
      return;
    }

    dependency.status = DependencyStatus.TIMEOUT;
    await this.persistDependency(dependency);

    this.dependencyTimeouts.delete(dependencyId);

    this.logger.warn(`Dependency timeout: ${dependencyId}`);
    this.emit('dependency:timeout', dependency);
  }

  private async updateCompletionBlockers(agentId: string): Promise<void> {
    const blockerInfo = await this.canAgentComplete(agentId);

    // Check if agent was pending completion and can now complete
    if (this.pendingCompletions.has(agentId) && blockerInfo.canComplete) {
      this.pendingCompletions.delete(agentId);
      this.completionBlocks.delete(agentId);

      this.logger.info(`Agent ${agentId} dependency blockage resolved - approved for completion`);
      this.emit('agent:completion_approved', { agentId });
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async onDependencyResolved(event: { dependency: AgentDependency; resolutionData?: unknown }): Promise<void> {
    // Check if any pending completions can now proceed
    for (const agentId of this.pendingCompletions) {
      await this.updateCompletionBlockers(agentId);
    }
  }

  private async onDependencyFailed(dependency: AgentDependency): Promise<void> {
    // Handle dependency failure - might need to notify dependent agents
    this.logger.error(`Dependency failed: ${dependency.id}`);
    // Could trigger fallback mechanisms or error recovery
  }

  private async onDependencyTimeout(dependency: AgentDependency): Promise<void> {
    // Handle dependency timeout
    await this.updateCompletionBlockers(dependency.dependentAgentId);
  }

  private async onAgentCompleting(event: { agentId: string }): Promise<void> {
    // Check if agent can complete
    const canComplete = await this.requestAgentCompletion(event.agentId);
    if (!canComplete) {
      // Agent completion was blocked
      this.emit('agent:completion_deferred', event);
    }
  }

  private async onAgentStateChanged(event: { agentId: string; newState: AgentLifecycleState; oldState: AgentLifecycleState }): Promise<void> {
    // Handle state changes that might affect dependencies
    if (event.newState === 'stopped' || event.newState === 'error' || event.newState === 'cleanup') {
      // Agent is no longer providing dependencies
      const providerDeps = this.providerDependencies.get(event.agentId) || new Set();
      for (const depId of providerDeps) {
        const dependency = this.dependencies.get(depId);
        if (dependency && dependency.status === DependencyStatus.PENDING) {
          dependency.status = DependencyStatus.FAILED;
          await this.persistDependency(dependency);
          this.emit('dependency:failed', dependency);
        }
      }
    }
  }

  // ============================================================================
  // Public Query Methods
  // ============================================================================

  /**
   * Get all dependencies for an agent
   */
  getAgentDependencies(agentId: string): AgentDependency[] {
    const depIds = this.agentDependencies.get(agentId) || new Set();
    return Array.from(depIds)
      .map(id => this.dependencies.get(id))
      .filter(dep => dep !== undefined) as AgentDependency[];
  }

  /**
   * Get all agents that depend on a provider agent
   */
  getDependentAgents(providerAgentId: string): string[] {
    const depIds = this.providerDependencies.get(providerAgentId) || new Set();
    const dependentAgents = new Set<string>();

    for (const depId of depIds) {
      const dep = this.dependencies.get(depId);
      if (dep) {
        dependentAgents.add(dep.dependentAgentId);
      }
    }

    return Array.from(dependentAgents);
  }

  /**
   * Get current system statistics
   */
  getStatistics(): {
    totalDependencies: number;
    pendingDependencies: number;
    resolvedDependencies: number;
    failedDependencies: number;
    agentsWithDependencies: number;
    providingAgents: number;
    pendingCompletions: number;
    cyclesDetected: number;
  } {
    const dependencies = Array.from(this.dependencies.values());
    const cycles = this.detectCycles();

    return {
      totalDependencies: dependencies.length,
      pendingDependencies: dependencies.filter(d => d.status === DependencyStatus.PENDING).length,
      resolvedDependencies: dependencies.filter(d => d.status === DependencyStatus.RESOLVED).length,
      failedDependencies: dependencies.filter(d => d.status === DependencyStatus.FAILED).length,
      agentsWithDependencies: this.agentDependencies.size,
      providingAgents: this.providerDependencies.size,
      pendingCompletions: this.pendingCompletions.size,
      cyclesDetected: cycles.length
    };
  }

  /**
   * Get detailed dependency information for debugging
   */
  getDependencyDetails(dependencyId: string): AgentDependency | undefined {
    return this.dependencies.get(dependencyId);
  }

  /**
   * Check if system has any dependency violations
   */
  checkViolations(): DependencyViolation[] {
    const violations: DependencyViolation[] = [];

    // Check for cycles
    const cycles = this.detectCycles();
    for (const cycle of cycles) {
      violations.push({
        type: 'cycle',
        message: `Dependency cycle detected: ${cycle.path.join(' -> ')}`,
        affectedAgents: cycle.cycleNodes || [],
        dependencyIds: [],
        severity: 'high',
        resolutionHints: ['Break the cycle by removing one dependency', 'Restructure agent flow']
      });
    }

    // Check for timeout violations
    const now = Date.now();
    for (const [id, dep] of this.dependencies) {
      if (dep.status === DependencyStatus.PENDING && dep.timeout) {
        const elapsed = now - dep.createdAt.getTime();
        if (elapsed > dep.timeout * 0.9) { // 90% of timeout
          violations.push({
            type: 'timeout',
            message: `Dependency ${id} approaching timeout`,
            affectedAgents: [dep.dependentAgentId, dep.providerAgentId],
            dependencyIds: [id],
            severity: elapsed > dep.timeout ? 'critical' : 'medium',
            resolutionHints: ['Check provider agent status', 'Extend timeout', 'Provide fallback resolution']
          });
        }
      }
    }

    return violations;
  }
}

// ============================================================================
// Singleton Instance and Exports
// ============================================================================

let globalDependencyTracker: DependencyTracker | null = null;

export function getDependencyTracker(namespace?: string): DependencyTracker {
  if (!globalDependencyTracker) {
    globalDependencyTracker = new DependencyTracker(namespace);
  }
  return globalDependencyTracker;
}

export function createDependencyTracker(namespace: string): DependencyTracker {
  return new DependencyTracker(namespace);
}

// Re-export types for external use
export type {
  AgentDependency,
  DependencyData,
  DependencyChain,
  DependencyViolation,
  CompletionBlockerInfo
};

export {
  DependencyType,
  DependencyStatus
};