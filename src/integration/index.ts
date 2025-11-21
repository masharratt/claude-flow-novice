/**
 * Integration Module - Trigger.dev and Task Mode Adapters
 *
 * Exports all integration classes and utilities for CFN Loop orchestration:
 * - TriggerDevClient: Type-safe trigger.dev API wrapper
 * - TriggerDevWebhooks: Express webhook handlers
 * - TaskModeCoordinator: In-memory and hybrid coordination
 * - TaskModeEventQueue: Event queue for task mode
 *
 * Type exports from trigger-dev-events.d.ts are available via:
 * import type { ... } from '../types/trigger-dev-events.js'
 */

// TriggerDevClient exports
export {
  TriggerDevClient,
  TriggerDevError,
  createTriggerDevClient,
  type RunFilterOptions,
  type TriggerDevConfig,
} from './trigger-dev-client.js';

// TriggerDevWebhooks exports
export {
  TriggerDevWebhooks,
  WebhookValidationError,
  createWebhookRouter,
  type WebhookConfig,
  type WebhookHandler,
} from './trigger-dev-webhooks.js';

// TaskModeAdapter exports
export {
  TaskModeCoordinator,
  TaskModeEventQueue,
  createTaskModeCoordinator,
  getTaskModeCoordinator,
  type TaskModeCoordinationResult,
} from './task-mode-adapter.js';

// Re-export types from trigger-dev-events for convenience
export type {
  RunStatusType,
  RunStatusResponse,
  AgentType,
  AgentCompletePayload,
  GateResultPayload,
  ConsensusResultPayload,
  PODecisionPayload,
  CFNLoopPayload,
  Run,
  WebhookVerificationOptions,
  WebhookContext,
  WebhookHandlerResult,
  TaskModeEvent,
  TaskModeSpawnRequest,
  TaskModeAgentResult,
} from '../types/trigger-dev-events.js';
