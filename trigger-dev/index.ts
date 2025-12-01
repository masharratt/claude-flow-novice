/**
 * Trigger.dev Integration for CFN Loop
 * @module trigger-dev
 */

// Client exports
export {
  triggerJob,
  sendEvent,
  getRunStatus,
  cancelRun,
  TriggerDevClientError,
  type TriggerJobPayload,
  type RunStatus,
  type EventResult,
} from './trigger-dev-client';

// Webhook exports
export {
  verifySignature,
  validatePayload,
  parseAgentCompleteEvent,
  handleWebhook,
  WebhookVerificationError,
  WebhookPayloadError,
  type WebhookEventType,
  type WebhookPayload,
  type AgentCompleteEvent,
} from './trigger-dev-webhooks';

// Adapter exports
export {
  executeAgent,
  getExecutionMode,
  AgentExecutionError,
  type ExecuteAgentOptions,
  type AgentResult,
} from './task-mode-adapter';
