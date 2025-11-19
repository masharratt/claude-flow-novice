/**
 * Core type definitions for CFN Loop orchestration engine
 * TypeScript v3.0 - Test-Driven validation
 */

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
}

/**
 * Mode configuration map
 */
export const MODE_CONFIG: Record<ExecutionMode, ModeConfig> = {
  mvp: {
    testPassRateGate: 0.7,
    consensusThreshold: 0.8,
    maxIterations: 5,
    validatorCount: 2,
  },
  standard: {
    testPassRateGate: 0.95,
    consensusThreshold: 0.9,
    maxIterations: 10,
    validatorCount: 3,
  },
  enterprise: {
    testPassRateGate: 0.98,
    consensusThreshold: 0.95,
    maxIterations: 15,
    validatorCount: 5,
  },
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
  return MODE_CONFIG[mode];
}

/**
 * Calculate pass rate from test results
 */
export function calculatePassRate(result: TestResult): number {
  const total = result.pass + result.fail + (result.skip ?? 0);
  return total === 0 ? 0 : result.pass / total;
}
