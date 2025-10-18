import { lifecycleManager } from './lifecycle-manager.js';
import { AgentDefinition } from './agent-loader.js';
import {
  AgentLifecycleState,
  AgentLifecycleContext,
  LifecycleHookResult
} from './lifecycle-manager.js';
import {
  DependencyType,
  DependencyTrackerOptions
} from '../lifecycle/dependency-tracker.js';

export const initializeLifecycleManager = () => lifecycleManager.initialize();
export const shutdownLifecycleManager = () => lifecycleManager.shutdown();

export const initializeAgent = (
  agentId: string,
  agentDefinition: AgentDefinition,
  taskId?: string,
) => lifecycleManager.initializeAgent(agentId, agentDefinition, taskId);

export const transitionAgentState = (
  agentId: string,
  newState: AgentLifecycleState,
  reason?: string,
) => lifecycleManager.transitionState(agentId, newState, reason);

export const handleTaskComplete = (
  agentId: string,
  taskResult: unknown,
  success?: boolean
) => lifecycleManager.handleTaskComplete(agentId, taskResult, success);

export const handleRerunRequest = (agentId: string, reason?: string) =>
  lifecycleManager.handleRerunRequest(agentId, reason);

export const cleanupAgent = (agentId: string) =>
  lifecycleManager.cleanupAgent(agentId);

export const getAgentContext = (agentId: string) =>
  lifecycleManager.getAgentContext(agentId);

export const updateAgentMemory = (
  agentId: string,
  key: string,
  value: unknown
) => lifecycleManager.updateAgentMemory(agentId, key, value);

export const getAgentMemory = (agentId: string, key: string) =>
  lifecycleManager.getAgentMemory(agentId, key);

export const registerAgentDependency = (
  dependentAgentId: string,
  providerAgentId: string,
  type?: DependencyType,
  options?: DependencyTrackerOptions,
) => lifecycleManager.registerAgentDependency(
  dependentAgentId,
  providerAgentId,
  type,
  options
);

export const removeAgentDependency = (dependencyId: string) =>
  lifecycleManager.removeAgentDependency(dependencyId);

export const forceAgentCompletion = (agentId: string, reason: string) =>
  lifecycleManager.forceAgentCompletion(agentId, reason);

export const getAgentDependencyStatus = (agentId: string) =>
  lifecycleManager.getAgentDependencyStatus(agentId);