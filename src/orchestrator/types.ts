/**
 * CFN Loop Orchestrator Type Definitions
 *
 * Comprehensive type definitions for the orchestrator workflow including:
 * - Orchestration configuration and modes
 * - Agent management and execution
 * - Decision types and outcomes
 * - Iteration context and state
 * - Error handling and validation
 *
 * @module orchestrator/types
 */

import { GateResult, TestResult } from '@/gate-checker/types';
import type { ExecutionMode } from '@/gate-checker/types';

/**
 * CFN Loop execution decision from Product Owner
 */
export type LoopDecision = 'PROCEED' | 'ITERATE' | 'ABORT';

/**
 * Main orchestrator configuration
 */
export interface OrchestratorConfig {
  taskId: string;
  mode: ExecutionMode;
  loop3Agents: string[];
  loop2Agents: string[];
  productOwner: string;
  maxIterations: number;
  gateThreshold?: number;
  consensusThreshold?: number;
  timeout?: number;
  epicContext?: Record<string, unknown>;
  phaseContext?: Record<string, unknown>;
  successCriteria?: Record<string, unknown>;
  expectedFiles?: string[];
  phaseId?: string;
  minQuorumLoop3?: number;
  minQuorumLoop2?: number;
}

/**
 * Result from spawning agents
 */
export interface AgentSpawnResult {
  agentId: string;
  agentType: string;
  iteration: number;
  pid?: number;
  success: boolean;
  error?: string;
}

/**
 * Aggregated results from agent execution
 */
export interface AgentExecutionResults {
  agentId: string;
  iteration: number;
  testResults?: TestResult[];
  consensusScore?: number;
  confidence?: number;
  completed: boolean;
  error?: string;
}

/**
 * State of a single iteration
 */
export interface IterationState {
  iteration: number;
  loop3Spawned: AgentSpawnResult[];
  loop3Completed: AgentExecutionResults[];
  deliverableVerified: boolean;
  gateCheckResult?: GateResult;
  gatePassed: boolean;
  loop2Spawned: AgentSpawnResult[];
  loop2Completed: AgentExecutionResults[];
  consensusReached: boolean;
  consensusScore?: number;
  productOwnerDecision?: LoopDecision;
  finalDecision?: LoopDecision;
  startTime: number;
  endTime?: number;
  errors: string[];
}

/**
 * Complete orchestration execution state
 */
export interface OrchestrationState {
  taskId: string;
  config: OrchestratorConfig;
  iterations: IterationState[];
  currentIteration: number;
  finalDecision?: LoopDecision;
  finalLoop3Confidence?: number;
  finalLoop2Consensus?: number;
  deliverableVerified: boolean;
  totalExecutionTime?: number;
  aborted: boolean;
  abortReason?: string;
}

/**
 * Consensus check result
 */
export interface ConsensusResult {
  consensus: number; // 0.0 to 1.0
  threshold: number;
  passed: boolean;
  agentCount: number;
  completedAgentCount: number;
  gap?: number; // threshold - consensus when fails
}

/**
 * Product Owner decision with reasoning
 */
export interface ProductOwnerDecision {
  decision: LoopDecision;
  rationale: string;
  confidence: number;
  timestamp: number;
}

/**
 * Deliverable verification options
 */
export interface DeliverableVerificationOptions {
  expectedFiles?: string[];
  taskType?: string;
  strict?: boolean;
}

/**
 * Deliverable verification result
 */
export interface DeliverableVerificationResult {
  verified: boolean;
  filesChecked: number;
  filesFound: number;
  missingFiles?: string[];
  errors?: string[];
  timestamp: number;
}

/**
 * Iteration feedback for agents
 */
export interface IterationFeedback {
  iteration: number;
  previousGateStatus?: string;
  previousPassRate?: number;
  failedTests?: string[];
  consensusScore?: number;
  recommendations?: string[];
}

/**
 * Orchestrator result/outcome
 */
export interface OrchestrationResult {
  status: 'success' | 'failed' | 'aborted';
  finalDecision: LoopDecision;
  iterationsCompleted: number;
  maxIterations: number;
  loop3Confidence: number;
  loop2Consensus: number;
  deliverableVerified: boolean;
  executionTimeSeconds: number;
  errors: string[];
  successReason?: string;
  failureReason?: string;
}

/**
 * Context injection payload
 */
export interface ContextPayload {
  taskDescription: string;
  deliverables?: string[];
  acceptanceCriteria?: string[];
  epicContext?: Record<string, unknown>;
  phaseContext?: Record<string, unknown>;
  targetFiles?: string[];
  iteration: number;
  feedback?: IterationFeedback;
}

/**
 * Agent context for execution
 */
export interface AgentContext {
  taskId: string;
  iteration: number;
  agentType: string;
  originalContext: string;
  enrichedContext?: string;
  feedback?: IterationFeedback;
  loopType?: 'loop3' | 'loop2';
}

/**
 * Redis coordination event
 */
export interface CoordinationEvent {
  type: 'agent_spawned' | 'agent_completed' | 'gate_check' | 'consensus_check' | 'decision';
  taskId: string;
  iteration: number;
  agentId?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

/**
 * Orchestrator error types
 */
export type OrchestratorErrorCode =
  | 'CONFIG_INVALID'
  | 'SPAWN_FAILED'
  | 'TIMEOUT'
  | 'GATE_FAILED'
  | 'CONSENSUS_FAILED'
  | 'DECISION_FAILED'
  | 'ITERATION_LIMIT'
  | 'REDIS_ERROR'
  | 'DELIVERABLE_VERIFICATION_FAILED';

/**
 * Orchestrator error with code
 */
export class OrchestratorError extends Error {
  constructor(
    message: string,
    public code: OrchestratorErrorCode,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OrchestratorError';
    Object.setPrototypeOf(this, OrchestratorError.prototype);
  }
}

/**
 * Logger interface for dependency injection
 */
export interface ILogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}

/**
 * Redis client interface for coordination
 */
export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exSeconds?: number): Promise<string | null>;
  lpush(key: string, value: string): Promise<number>;
  blpop(key: string, timeoutSeconds: number): Promise<[string, string] | null>;
  smembers(key: string): Promise<string[]>;
  sadd(key: string, member: string): Promise<number>;
  del(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
  expire(key: string, seconds: number): Promise<number>;
}

/**
 * Gate checker interface for dependency injection
 */
export interface IGateChecker {
  checkGate(
    taskId: string,
    agents: string[],
    threshold: number,
    minQuorum?: number
  ): Promise<GateResult>;
}

/**
 * Agent spawner interface for dependency injection
 */
export interface IAgentSpawner {
  spawn(
    taskId: string,
    iteration: number,
    agents: string[],
    loopType: 'loop3' | 'loop2',
    context?: string
  ): Promise<AgentSpawnResult[]>;
}

/**
 * Product owner decision provider interface
 */
export interface IProductOwnerDecision {
  makeDecision(
    taskId: string,
    iteration: number,
    consensus: number,
    threshold: number,
    maxIterations: number
  ): Promise<ProductOwnerDecision>;
}

/**
 * Deliverable verifier interface
 */
export interface IDeliverableVerifier {
  verify(options: DeliverableVerificationOptions): Promise<DeliverableVerificationResult>;
}

/**
 * Mode-specific thresholds
 */
export const ModeThresholds = {
  mvp: { gate: 0.70, consensus: 0.80 },
  standard: { gate: 0.95, consensus: 0.90 },
  enterprise: { gate: 0.98, consensus: 0.95 },
} as const;

/**
 * Type guards and validators
 */

export function isValidLoopDecision(value: unknown): value is LoopDecision {
  return value === 'PROCEED' || value === 'ITERATE' || value === 'ABORT';
}

export function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return value === 'mvp' || value === 'standard' || value === 'enterprise';
}

export function isValidOrchestratorConfig(value: unknown): value is OrchestratorConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const config = value as Record<string, unknown>;
  return (
    typeof config.taskId === 'string' &&
    isValidExecutionMode(config.mode) &&
    Array.isArray(config.loop3Agents) &&
    Array.isArray(config.loop2Agents) &&
    typeof config.productOwner === 'string' &&
    typeof config.maxIterations === 'number' &&
    config.maxIterations > 0
  );
}

export function getThresholdsForMode(mode: ExecutionMode): {
  gate: number;
  consensus: number;
} {
  return ModeThresholds[mode as keyof typeof ModeThresholds];
}
