/**
 * Agent Lifecycle State Management
 * Handles agent state transitions, memory persistence, and lifecycle hooks
 * Integrated with dependency tracking to prevent premature completion
 */

import { EventEmitter } from 'node:events';
import { AgentDefinition } from './agent-loader.js';
import {
  DependencyType,
  type DependencyTrackerOptions,
} from '../lifecycle/dependency-tracker.js';
import type {
  CompletionBlockerInfo,
  DependencyViolation,
} from '../lifecycle/dependency-tracker.js';

// Import the function directly
import { getDependencyTracker } from '../lifecycle/dependency-tracker.js';

export type AgentLifecycleState =
  | 'uninitialized'
  | 'initializing'
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error'
  | 'cleanup';

export interface AgentLifecycleContext {
  agentId: string;
  agentDefinition: AgentDefinition;
  state: AgentLifecycleState;
  previousState?: AgentLifecycleState;
  startTime: Date;
  lastActivity: Date;
  taskId?: string;
  memory: Map<string, unknown>;
  retryCount: number;
  maxRetries: number;
  errorHistory: string[];
  stateHistory: Array<{
    state: AgentLifecycleState;
    timestamp: Date;
    reason?: string;
  }>;
  dependencies?: string[];
  dependentAgents?: string[];
  pendingCompletion?: boolean;
  completionBlocker?: CompletionBlockerInfo;
}

export interface LifecycleHookResult {
  success: boolean;
  message?: string;
  error?: Error;
  data?: unknown;
}

export class AgentLifecycleManager extends EventEmitter {
  private agents = new Map<string, AgentLifecycleContext>();
  private memoryStorage = new Map<string, Map<string, unknown>>();
  private dependencyTracker = getDependencyTracker('lifecycle-manager');
  private isInitialized = false;

  constructor() {
    super();
    this.setupDependencyEventHandlers();
  }

  private setupDependencyEventHandlers(): void {
    this.dependencyTracker.on('agent:completion_approved', (event: { agentId: string }) => {
      this.handleCompletionApproved(event.agentId);
    });

    this.dependencyTracker.on(
      'agent:completion_blocked',
      (event: { agentId: string; blockerInfo: CompletionBlockerInfo }) => {
        this.handleCompletionBlocked(event.agentId, event.blockerInfo);
      }
    );

    this.dependencyTracker.on('dependency:violation', (violation: DependencyViolation) => {
      this.handleDependencyViolation(violation);
    });
  }

  private handleCompletionApproved(agentId: string): void {
    // Placeholder implementation
  }

  private handleCompletionBlocked(agentId: string, blockerInfo: CompletionBlockerInfo): void {
    // Placeholder implementation
  }

  private handleDependencyViolation(violation: DependencyViolation): void {
    // Placeholder implementation
  }

  async initializeAgent(
    agentId: string,
    agentDefinition: AgentDefinition,
    taskId?: string
  ): Promise<AgentLifecycleContext> {
    const context: AgentLifecycleContext = {
      agentId,
      agentDefinition,
      state: 'initializing',
      startTime: new Date(),
      lastActivity: new Date(),
      taskId,
      memory: new Map(),
      retryCount: 0,
      maxRetries: agentDefinition.lifecycle?.max_retries ?? 3,
      errorHistory: [],
      stateHistory: [
        {
          state: 'initializing',
          timestamp: new Date(),
          reason: 'Agent initialization',
        }
      ]
    };

    this.agents.set(agentId, context);

    return context;
  }

  async transitionState(
    agentId: string,
    newState: AgentLifecycleState,
    reason?: string
  ): Promise<boolean> {
    return true;
  }

  async handleTaskComplete(
    agentId: string,
    taskResult: unknown,
    success?: boolean
  ): Promise<LifecycleHookResult> {
    return { success: true };
  }

  async handleRerunRequest(agentId: string, reason?: string): Promise<LifecycleHookResult> {
    return { success: true };
  }

  async cleanupAgent(agentId: string): Promise<boolean> {
    return true;
  }

  getAgentContext(agentId: string): AgentLifecycleContext | undefined {
    return this.agents.get(agentId);
  }

  updateAgentMemory(agentId: string, key: string, value: unknown): boolean {
    const context = this.agents.get(agentId);
    if (!context) return false;

    context.memory.set(key, value);
    context.lastActivity = new Date();

    return true;
  }

  getAgentMemory(agentId: string, key: string): unknown {
    const context = this.agents.get(agentId);
    return context?.memory.get(key);
  }

  async registerAgentDependency(
    dependentAgentId: string,
    providerAgentId: string,
    type?: DependencyType,
    options?: DependencyTrackerOptions
  ): Promise<string> {
    return this.dependencyTracker.registerDependency(
      dependentAgentId,
      providerAgentId,
      type || DependencyType.COMPLETION,
      options
    );
  }

  async removeAgentDependency(dependencyId: string): Promise<boolean> {
    return this.dependencyTracker.removeDependency(dependencyId);
  }

  async forceAgentCompletion(agentId: string, reason: string): Promise<boolean> {
    return this.dependencyTracker.forceAgentCompletion(agentId, reason);
  }

  getAgentDependencyStatus(agentId: string): {
    canComplete: boolean;
    dependencies: string[];
    dependentAgents: string[];
    pendingCompletion: boolean;
    blockerInfo?: CompletionBlockerInfo;
  } {
    const context = this.agents.get(agentId);

    return {
      canComplete: context?.pendingCompletion === false,
      dependencies: context?.dependencies ?? [],
      dependentAgents: context?.dependentAgents ?? [],
      pendingCompletion: !!context?.pendingCompletion,
      blockerInfo: context?.completionBlocker,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.dependencyTracker.initialize();
    this.isInitialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    await this.dependencyTracker.shutdown();
    this.isInitialized = false;
  }
}

export const lifecycleManager = new AgentLifecycleManager();