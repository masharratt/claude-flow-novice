/**
 * TypeScript declarations for trigger.dev webhook events and CFN Loop integration
 * Used for type-safe event handling in trigger.dev orchestration
 */

/**
 * Run status literal type matching trigger.dev API
 */
export type RunStatusType = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELED' | 'TIMEOUT' | 'WAITING';

/**
 * CFN Loop agent type discriminated union
 */
export type AgentType = 'loop3-implementer' | 'loop2-validator' | 'product-owner' | 'orchestrator';

/**
 * Agent completion event payload
 */
export interface AgentCompletePayload {
  agentId: string;
  agentType: AgentType;
  taskId: string;
  status: 'success' | 'failure';
  output: string;
  confidenceScore?: number;
  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Gate check result from Loop 3
 */
export interface GateResultPayload {
  taskId: string;
  gateType: 'loop3-test-gate' | 'loop2-consensus-gate';
  passed: boolean;
  passRate?: number;
  details: {
    threshold: number;
    actualValue: number;
    failureReason?: string;
  };
  timestamp: string;
}

/**
 * Consensus collection result from Loop 2
 */
export interface ConsensusResultPayload {
  taskId: string;
  validatorCount: number;
  consensusScore: number;
  consensusThreshold: number;
  passed: boolean;
  validatorScores: Array<{
    validatorId: string;
    score: number;
    feedback?: string;
  }>;
  timestamp: string;
}

/**
 * Product Owner decision payload
 */
export interface PODecisionPayload {
  taskId: string;
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  reviewNotes?: string;
  deliverablesSummary?: string;
  timestamp: string;
}

/**
 * CFN Loop trigger payload
 */
export interface CFNLoopPayload {
  taskId: string;
  description: string;
  mode: 'standard' | 'mvp' | 'enterprise';
  successCriteria: {
    gate: string;
    consensusThreshold: number;
    testPassRateThreshold: number;
  };
  context?: Record<string, unknown>;
  webhookUrl?: string;
}

/**
 * Trigger.dev run status response
 */
export interface RunStatusResponse {
  id: string;
  status: RunStatusType;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
}

/**
 * Trigger.dev run object
 */
export interface Run {
  id: string;
  taskId: string;
  status: RunStatusType;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook signature verification options
 */
export interface WebhookVerificationOptions {
  algorithmType: 'sha256' | 'sha512';
  headerName: string;
}

/**
 * Typed webhook request context
 */
export interface WebhookContext<T> {
  payload: T;
  isVerified: boolean;
  timestamp: number;
  signature?: string;
}

/**
 * Webhook handler result
 */
export interface WebhookHandlerResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Task mode coordination event (in-memory)
 */
export interface TaskModeEvent {
  type: 'agent-complete' | 'gate-result' | 'consensus-result' | 'po-decision';
  taskId: string;
  payload: AgentCompletePayload | GateResultPayload | ConsensusResultPayload | PODecisionPayload;
  timestamp: number;
}

/**
 * Task mode agent spawning request
 */
export interface TaskModeSpawnRequest {
  agentType: AgentType;
  taskId: string;
  payload: Record<string, unknown>;
  timeoutMs?: number;
}

/**
 * Task mode agent result
 */
export interface TaskModeAgentResult {
  agentId: string;
  agentType: AgentType;
  success: boolean;
  output: string;
  confidenceScore?: number;
  executionTimeMs: number;
}
