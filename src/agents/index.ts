/**
 * Agent System - v2.0
 */

export { AgentRegistry, type AgentRegistryEntry, type AgentQuery, type AgentStatistics } from './agent-registry.js';

export {
  AgentLoader,
  agentLoader,
  type AgentDefinition,
  type AgentCategory
} from './agent-loader.js';

export {
  AgentLifecycleManager,
  lifecycleManager,
  type AgentLifecycleState,
  type AgentLifecycleContext,
  type LifecycleHookResult
} from './lifecycle-manager.js';

export {
  AgentValidator,
  agentValidator,
  type AgentValidationResult,
  type AgentCapabilityMap
} from './agent-validator.js';

export {
  TaskAgentIntegration,
  taskAgentIntegration,
  type TaskAgentSpawnRequest,
  type TaskAgentSpawnResult
} from './task-agent-integration.js';

// Agent Loader Convenience Exports
export {
  getAvailableAgentTypes,
  getAgent,
  getAllAgents,
  getAgentCategories,
  searchAgents,
  isValidAgentType,
  getAgentsByCategory,
  refreshAgents,
  resolveLegacyAgentType,
} from './agent-loader.js';

// Lifecycle Management Convenience Exports
export {
  initializeLifecycleManager,
  shutdownLifecycleManager,
  initializeAgent,
  transitionAgentState,
  handleTaskComplete,
  handleRerunRequest,
  cleanupAgent,
  getAgentContext,
  updateAgentMemory,
  getAgentMemory,
  registerAgentDependency,
  removeAgentDependency,
  forceAgentCompletion,
  getAgentDependencyStatus,
} from './lifecycle-manager-exported-functions.js';

// Agent Validator Convenience Exports
export {
  validateAgentType,
  validateAgentTypes,
  getAgentTypeInfo,
  clearValidationCache
} from './agent-validator.js';

// Task Agent Integration Exports
export {
  prepareAgentSpawn,
  prepareBatchAgentSpawn,
  suggestAgentTypes,
  validateAgentTypeSync,
  getAgentInfo,
  claudeCodeTaskHook
} from './task-agent-integration.js';

export { DependencyType } from '../lifecycle/dependency-tracker.js';