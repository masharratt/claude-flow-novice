/**
 * Core type definitions for CFN Loop orchestration engine
 * TypeScript v3.0 - Test-Driven validation
 */

import { getModeConfig as getCanonicalModeConfig, MODE_CONFIGS } from '../../../../../../src/planning/orchestration/mode-config';

/**
 * Execution mode determines test gate thresholds and consensus requirements
 */
export type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

/**
 * Core orchestration configuration passed from CLI
 */
export interface OrchestrationConfig {
  taskId: string;
  mode: ExecutionMode;
  maxIterations: number;
  aceReflect?: boolean;
  timeouts?: TimeoutConfig; // Optional timeout configuration
}

/**
 * Agent specification with resource allocation
 */
export interface AgentSpec {
  id: string;
  type: string;
  memoryTier: 1 | 2 | 3 | 4;
  memoryLimit: string; // '512m', '1g', '2g', '4g'
}

/**
 * Test execution results - counts of pass/fail/skip
 */
export interface TestResult {
  pass: number;
  fail: number;
  skip?: number;
}

/**
 * Gate check result from test execution
 * Contains test results and pass rate vs threshold
 */
export interface GateResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  testResults: Map<string, TestResult>;
}

/**
 * Loop 2 consensus result from a single validator
 */
export interface Loop2Result {
  agentId: string;
  consensusScore: number;
  feedback: string;
}

/**
 * Product Owner decision on whether to proceed, iterate, or abort
 */
export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT';

/**
 * Final orchestration result after all loops complete
 */
export interface OrchestrationResult {
  taskId: string;
  decision: ProductOwnerDecision;
  iteration: number;
  gateResults: GateResult[];
  consensusScores: number[];
  deliverables: string[];
}

/**
 * Mode-specific threshold configuration
 */
export interface ModeConfig {
  testPassRateGate: number; // Loop 3 gate threshold
  consensusThreshold: number; // Loop 2 consensus threshold
  maxIterations: number;
  validatorCount: number;
  timeouts?: TimeoutConfig; // Optional timeout overrides
}

/**
 * Timeout configuration for agent execution
 */
export interface TimeoutConfig {
  loop3Agent?: number; // Loop 3 agent timeout in seconds (default: 300)
  loop2Agent?: number; // Loop 2 validator timeout in seconds (default: 300)
  productOwner?: number; // Product Owner decision timeout in seconds (default: 60)
}

/**
 * Mode configuration map
 */
export const MODE_CONFIG: Record<ExecutionMode, ModeConfig> = {
  mvp:        { testPassRateGate: MODE_CONFIGS.mvp.gateThreshold,        consensusThreshold: MODE_CONFIGS.mvp.consensusThreshold,        maxIterations: MODE_CONFIGS.mvp.maxIterations,        validatorCount: MODE_CONFIGS.mvp.validatorCount },
  standard:   { testPassRateGate: MODE_CONFIGS.standard.gateThreshold,   consensusThreshold: MODE_CONFIGS.standard.consensusThreshold,   maxIterations: MODE_CONFIGS.standard.maxIterations,   validatorCount: MODE_CONFIGS.standard.validatorCount },
  enterprise: { testPassRateGate: MODE_CONFIGS.enterprise.gateThreshold, consensusThreshold: MODE_CONFIGS.enterprise.consensusThreshold, maxIterations: MODE_CONFIGS.enterprise.maxIterations, validatorCount: MODE_CONFIGS.enterprise.validatorCount },
};

/**
 * Redis message envelope for coordination
 */
export interface RedisMessage {
  taskId: string;
  agentId: string;
  type: 'completion' | 'test-result' | 'consensus' | 'decision';
  payload: unknown;
  timestamp: number;
}

/**
 * Agent execution context for coordination
 */
export interface AgentContext {
  taskId: string;
  agentId: string;
  agentType: string;
  iteration: number;
  memoryTier: 1 | 2 | 3 | 4;
  broadcastMessages?: string[];
}

/**
 * Wave specification for parallel agent execution
 */
export interface WaveSpec {
  waveNumber: number;
  agentCount: number;
  memoryTier: 1 | 2 | 3 | 4;
  timeout: number;
}

/**
 * Orchestration state tracking
 */
export interface OrchestrationState {
  taskId: string;
  mode: ExecutionMode;
  iteration: number;
  currentWave: number;
  gateStatus: 'pending' | 'passed' | 'failed';
  consensusStatus: 'pending' | 'reached' | 'unreachable';
  decision: ProductOwnerDecision | null;
  completedAgents: Set<string>;
  failedAgents: Set<string>;
  startTime: number;
  lastUpdateTime: number;
}

/**
 * Type guard to check if value is valid ExecutionMode
 */
export function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === 'string' && ['mvp', 'standard', 'enterprise'].includes(value);
}

/**
 * Type guard to check if value is valid ProductOwnerDecision
 */
export function isValidProductOwnerDecision(value: unknown): value is ProductOwnerDecision {
  return typeof value === 'string' && ['PROCEED', 'ITERATE', 'ABORT'].includes(value);
}

/**
 * Get mode configuration for execution mode
 */
export function getModeConfig(mode: ExecutionMode): ModeConfig {
  const canonical = getCanonicalModeConfig(mode);
  return { testPassRateGate: canonical.gateThreshold, consensusThreshold: canonical.consensusThreshold, maxIterations: canonical.maxIterations, validatorCount: canonical.validatorCount };
}

/**
 * Calculate pass rate from test results
 */
export function calculatePassRate(result: TestResult): number {
  const total = result.pass + result.fail + (result.skip ?? 0);
  return total === 0 ? 0 : result.pass / total;
}

/**
 * Get timeout configuration with defaults
 * Default values: Loop 3 = 300s, Loop 2 = 300s, Product Owner = 60s
 */
export function getTimeoutConfig(config?: TimeoutConfig): Required<TimeoutConfig> {
  return {
    loop3Agent: config?.loop3Agent ?? 300,
    loop2Agent: config?.loop2Agent ?? 300,
    productOwner: config?.productOwner ?? 60,
  };
}

/**
 * Validate timeout configuration
 * Ensures timeouts are within reasonable bounds (10-3600 seconds)
 */
export function validateTimeoutConfig(config: TimeoutConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const MIN_TIMEOUT = 10;
  const MAX_TIMEOUT = 3600;

  if (config.loop3Agent !== undefined) {
    if (config.loop3Agent < MIN_TIMEOUT || config.loop3Agent > MAX_TIMEOUT) {
      errors.push(`loop3Agent timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.loop3Agent}s`);
    }
  }

  if (config.loop2Agent !== undefined) {
    if (config.loop2Agent < MIN_TIMEOUT || config.loop2Agent > MAX_TIMEOUT) {
      errors.push(`loop2Agent timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.loop2Agent}s`);
    }
  }

  if (config.productOwner !== undefined) {
    if (config.productOwner < MIN_TIMEOUT || config.productOwner > MAX_TIMEOUT) {
      errors.push(`productOwner timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.productOwner}s`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
