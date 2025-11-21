/**
 * CFN Loop Type Definitions
 * Complete type safety for CFN Loop workflow orchestration
 */

/**
 * CFN Loop execution modes with test pass rate thresholds
 */
export type CFNMode = 'mvp' | 'standard' | 'enterprise';

/**
 * Forced iteration result for controlled testing
 * Allows test code to inject specific outcomes at each iteration
 */
export interface ForceIterationConfig {
  /** Iteration number to force (1-based) */
  iteration: number;

  /** Force specific gate result (pass/fail) */
  gateResult: 'PASS' | 'FAIL';

  /** Force specific consensus result (pass/fail) */
  consensusResult: 'PASS' | 'FAIL';

  /** Force Product Owner decision */
  poDecision: 'PROCEED' | 'ITERATE' | 'ABORT';

  /** Optional override for gate pass rate (0.0-1.0) */
  gatePassRate?: number;

  /** Optional override for consensus score (0.0-1.0) */
  consensusScore?: number;

  /** Optional reason for forced outcome */
  reason?: string;
}

/**
 * CFN Loop iteration state and progress tracking
 */
export interface CFNLoopPayload {
  /** Unique task identifier */
  taskId: string;

  /** User task description */
  description: string;

  /** Success criteria in JSON format */
  successCriteria: SuccessCriteria;

  /** Execution mode (MVP/Standard/Enterprise) */
  mode: CFNMode;

  /** Maximum iterations before abort */
  maxIterations: number;

  /** Current iteration number */
  currentIteration: number;

  /** Timestamp when loop started */
  startedAt: string;

  /** Metadata for tracking */
  metadata?: Record<string, unknown>;

  /** Force specific iteration outcomes for testing (optional, North Star 2) */
  forceIteration?: ForceIterationConfig;
}

/**
 * Success criteria definition with test requirements
 */
export interface SuccessCriteria {
  /** Primary test command to execute */
  testCommand: string;

  /** Minimum pass rate threshold (0.0 to 1.0) */
  passRateThreshold: number;

  /** Test coverage minimum percentage */
  coverageThreshold?: number;

  /** Required test suites/categories */
  testSuites?: string[];

  /** Performance benchmarks (optional) */
  benchmarks?: Record<string, number>;

  /** Description of success requirements */
  description?: string;
}

/**
 * Loop 3: Implementer agent job payload
 */
export interface Loop3JobPayload {
  /** Parent loop task ID */
  taskId: string;

  /** Agent specialization type */
  agentType: string;

  /** Task description for the agent */
  description: string;

  /** Success criteria for validation */
  successCriteria: SuccessCriteria;

  /** Agent iteration counter */
  iterationNumber: number;

  /** Context from previous iterations (if any) */
  previousContext?: AgentResult[];
}

/**
 * Loop 3: Agent job completion result
 */
export interface AgentResult {
  /** Unique agent execution ID */
  agentId: string;

  /** Agent specialization type */
  agentType: string;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Deliverables produced by agent */
  deliverables: {
    files: string[];
    summary: string;
  };

  /** Test execution results */
  testResults: TestResults;

  /** Timestamp of completion */
  completedAt: string;

  /** Raw output from agent execution */
  output?: string;
}

/**
 * Test execution results with pass rate calculation
 */
export interface TestResults {
  /** Total test cases */
  total: number;

  /** Number of passing tests */
  passed: number;

  /** Number of failing tests */
  failed: number;

  /** Pass rate (0.0-1.0) */
  passRate: number;

  /** Test execution output */
  output?: string;

  /** Coverage percentage if available */
  coverage?: number;

  /** Individual test suite results */
  suites?: TestSuiteResult[];
}

/**
 * Individual test suite execution result
 */
export interface TestSuiteResult {
  /** Test suite name */
  name: string;

  /** Tests passed in suite */
  passed: number;

  /** Tests failed in suite */
  failed: number;

  /** Pass rate for suite */
  passRate: number;
}

/**
 * Loop 3 gate check: Determines if Loop 2 should proceed
 */
export interface GateCheckResult {
  /** Whether gate passed */
  passed: boolean;

  /** Actual pass rate achieved */
  passRate: number;

  /** Required threshold for gate */
  threshold: number;

  /** Agent results that contributed to gate check */
  agentResults: AgentResult[];

  /** Reason for gate decision */
  reason: string;

  /** Timestamp of check */
  checkedAt: string;
}

/**
 * Loop 2: Validator job payload
 */
export interface Loop2JobPayload {
  /** Parent task ID */
  taskId: string;

  /** Validator agent type */
  validatorType: string;

  /** Results from Loop 3 to validate */
  loop3Results: AgentResult[];

  /** Gate check result */
  gateResult: GateCheckResult;

  /** Original task description */
  description: string;

  /** Iteration number for context */
  iterationNumber: number;
}

/**
 * Loop 2: Validator consensus result
 */
export interface ValidatorResult {
  /** Unique validator execution ID */
  validatorId: string;

  /** Validator type/specialty */
  validatorType: string;

  /** Consensus score (0.0-1.0) */
  consensusScore: number;

  /** Detailed feedback on quality */
  feedback: string;

  /** Issues identified if any */
  issues?: string[];

  /** Recommendations */
  recommendations?: string[];

  /** Completion timestamp */
  completedAt: string;
}

/**
 * Consensus aggregation from all Loop 2 validators
 */
export interface ConsensusResult {
  /** Average consensus score */
  averageScore: number;

  /** Individual validator results */
  validatorResults: ValidatorResult[];

  /** Whether consensus threshold met */
  consensusMet: boolean;

  /** Required consensus threshold for mode */
  threshold: number;

  /** Aggregated feedback summary */
  summary: string;

  /** Critical issues blocking proceed */
  blockingIssues?: string[];

  /** Timestamp of consensus */
  consensusAt: string;
}

/**
 * Product Owner decision on loop continuation
 */
export interface ProductOwnerDecision {
  /** Decision type */
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';

  /** Detailed reasoning for decision */
  reasoning: string;

  /** Which aspect requires iteration (if ITERATE) */
  iterationFocus?: string;

  /** Abort reason with details (if ABORT) */
  abortReason?: string;

  /** Validations passed for PROCEED decision */
  validations?: string[];

  /** Timestamp of decision */
  decidedAt: string;
}

/**
 * Iteration result tracking for North Star 2
 * Captures outcome of each iteration step (gate, consensus, product owner decision)
 */
export interface IterationResult {
  /** Iteration number (1-based) */
  iteration: number;

  /** Gate check passed this iteration */
  gatePassed: boolean;

  /** Actual gate pass rate achieved */
  gatePassRate: number;

  /** Gate pass rate threshold for mode */
  gateThreshold: number;

  /** Consensus threshold met this iteration */
  consensusMet: boolean;

  /** Actual consensus score achieved */
  consensusScore: number;

  /** Consensus threshold for mode */
  consensusThreshold: number;

  /** Product Owner decision for this iteration */
  productOwnerDecision: ProductOwnerDecision;

  /** Timestamp when iteration completed */
  completedAt: string;

  /** Whether forced override was applied */
  forceApplied: boolean;

  /** Force configuration if applied */
  forceConfig?: ForceIterationConfig;
}

/**
 * CFN Loop final result
 */
export interface CFNLoopResult {
  /** Task ID for correlation */
  taskId: string;

  /** Final decision */
  decision: 'COMPLETED' | 'ABORTED' | 'TIMED_OUT';

  /** Total iterations executed */
  iterationsCompleted: number;

  /** All agent results across iterations */
  allAgentResults: AgentResult[];

  /** Final consensus result */
  finalConsensus: ConsensusResult;

  /** Final gate check result */
  finalGateCheck: GateCheckResult;

  /** Product Owner decision */
  productOwnerDecision: ProductOwnerDecision;

  /** Total execution time in seconds */
  executionTimeSeconds: number;

  /** Final pass rate achieved */
  finalPassRate: number;

  /** Success status */
  success: boolean;

  /** Iteration results tracking (North Star 2) */
  iterationResults?: IterationResult[];

  /** Track if results from real job execution or simulated */
  realExecution: boolean;
}

/**
 * Agent completion event for io.waitForEvent() polling
 */
export interface AgentCompleteEvent {
  /** Agent specialization type */
  agentType: string;

  /** Parent task ID */
  taskId: string;

  /** Current iteration number */
  iteration: number;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Path to deliverables (if any) */
  deliverablePath?: string;

  /** Completion timestamp */
  completedAt: string;

  /** Test pass rate achieved */
  testPassRate?: number;

  /** Coverage percentage achieved */
  coverage?: number;
}

/**
 * Gate check completion event
 */
export interface GateCheckCompleteEvent {
  /** Parent task ID */
  taskId: string;

  /** Iteration number when gate was checked */
  iteration: number;

  /** Whether gate passed */
  passed: boolean;

  /** Actual pass rate achieved */
  passRate: number;

  /** Required threshold for mode */
  threshold: number;

  /** Completion timestamp */
  completedAt: string;

  /** Agent results used for gate check */
  agentResults?: AgentResult[];
}

/**
 * Consensus completion event
 */
export interface ConsensusCompleteEvent {
  /** Parent task ID */
  taskId: string;

  /** Iteration number for consensus */
  iteration: number;

  /** Whether consensus was met */
  met: boolean;

  /** Actual consensus score */
  consensusScore: number;

  /** Required threshold for mode */
  threshold: number;

  /** Completion timestamp */
  completedAt: string;

  /** Validator results that contributed to consensus */
  validatorResults?: ValidatorResult[];
}

/**
 * Product Owner decision completion event
 */
export interface ProductOwnerCompleteEvent {
  /** Parent task ID */
  taskId: string;

  /** Iteration number for decision */
  iteration: number;

  /** Decision made */
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';

  /** Detailed reasoning */
  reasoning: string;

  /** Iteration focus if ITERATE */
  iterationFocus?: string;

  /** Abort reason if ABORT */
  abortReason?: string;

  /** Completion timestamp */
  completedAt: string;
}

/**
 * Workflow completion result for polling via io.waitForEvent()
 */
export interface WorkflowCompletionResult {
  /** Unique event ID for tracking */
  eventId: string;

  /** Overall completion status */
  status: 'COMPLETED' | 'FAILED' | 'RUNNING';

  /** Final CFN Loop result if completed */
  result?: CFNLoopResult;

  /** Error message if failed */
  error?: string;

  /** Completion timestamp */
  completedAt?: string;

  /** Last known progress percentage (0-100) */
  progress?: number;

  /** Current iteration if still running */
  currentIteration?: number;
}

/**
 * Agent spawning request
 */
export interface AgentSpawningRequest {
  /** Agent specialization type */
  agentType: string;

  /** Task for agent to execute */
  taskDescription: string;

  /** Success criteria */
  successCriteria: SuccessCriteria;

  /** Unique task ID */
  taskId: string;

  /** Optional agent ID (generated if not provided) */
  agentId?: string;

  /** Context for agent (previous results, iteration state) */
  context?: Record<string, unknown>;
}

/**
 * Agent spawning response with job information
 */
export interface AgentSpawningResponse {
  /** Generated agent ID */
  agentId: string;

  /** Trigger.dev job ID */
  jobId: string;

  /** Spawn timestamp */
  spawnedAt: string;

  /** Expected completion time estimate (seconds) */
  estimatedDurationSeconds: number;
}

/**
 * Threshold configuration by mode
 */
export interface ThresholdConfig {
  /** Loop 3 gate pass rate threshold */
  loop3PassRateThreshold: number;

  /** Loop 2 consensus threshold */
  loop2ConsensusThreshold: number;

  /** Number of Loop 2 validators to spawn */
  validatorCount: number;

  /** Maximum iterations before timeout */
  maxIterations: number;
}

/**
 * Check if force iteration config applies to current iteration
 * @param forceConfig - Force iteration configuration (if any)
 * @param currentIteration - Current iteration number
 * @returns true if force config applies to this iteration
 */
export function isForceIterationApplicable(
  forceConfig: ForceIterationConfig | undefined,
  currentIteration: number
): boolean {
  if (!forceConfig) return false;
  return forceConfig.iteration === currentIteration;
}

/**
 * Create an iteration result with optional force override
 * @param iteration - Iteration number
 * @param gatePassed - Whether gate passed
 * @param gatePassRate - Actual gate pass rate
 * @param gateThreshold - Gate threshold for mode
 * @param consensusMet - Whether consensus met
 * @param consensusScore - Actual consensus score
 * @param consensusThreshold - Consensus threshold for mode
 * @param productOwnerDecision - Product Owner decision
 * @param forceConfig - Applied force configuration (if any)
 * @returns Iteration result object
 */
export function createIterationResult(
  iteration: number,
  gatePassed: boolean,
  gatePassRate: number,
  gateThreshold: number,
  consensusMet: boolean,
  consensusScore: number,
  consensusThreshold: number,
  productOwnerDecision: ProductOwnerDecision,
  forceConfig?: ForceIterationConfig
): IterationResult {
  return {
    iteration,
    gatePassed,
    gatePassRate,
    gateThreshold,
    consensusMet,
    consensusScore,
    consensusThreshold,
    productOwnerDecision,
    completedAt: new Date().toISOString(),
    forceApplied: !!forceConfig,
    forceConfig,
  };
}

/**
 * Validate force iteration config for correctness
 * @param forceConfig - Force iteration configuration to validate
 * @returns Validation errors array (empty if valid)
 */
export function validateForceIterationConfig(forceConfig: ForceIterationConfig): string[] {
  const errors: string[] = [];

  if (forceConfig.iteration < 1) {
    errors.push('ForceIterationConfig.iteration must be >= 1');
  }

  if (!['PASS', 'FAIL'].includes(forceConfig.gateResult)) {
    errors.push("ForceIterationConfig.gateResult must be 'PASS' or 'FAIL'");
  }

  if (!['PASS', 'FAIL'].includes(forceConfig.consensusResult)) {
    errors.push("ForceIterationConfig.consensusResult must be 'PASS' or 'FAIL'");
  }

  if (!['PROCEED', 'ITERATE', 'ABORT'].includes(forceConfig.poDecision)) {
    errors.push("ForceIterationConfig.poDecision must be 'PROCEED', 'ITERATE', or 'ABORT'");
  }

  if (forceConfig.gatePassRate !== undefined && (forceConfig.gatePassRate < 0 || forceConfig.gatePassRate > 1)) {
    errors.push('ForceIterationConfig.gatePassRate must be between 0.0 and 1.0');
  }

  if (forceConfig.consensusScore !== undefined && (forceConfig.consensusScore < 0 || forceConfig.consensusScore > 1)) {
    errors.push('ForceIterationConfig.consensusScore must be between 0.0 and 1.0');
  }

  return errors;
}

/**
 * Get threshold configuration for execution mode
 */
export function getThresholdConfig(mode: CFNMode): ThresholdConfig {
  const configs: Record<CFNMode, ThresholdConfig> = {
    mvp: {
      loop3PassRateThreshold: 0.70,
      loop2ConsensusThreshold: 0.80,
      validatorCount: 2,
      maxIterations: 5,
    },
    standard: {
      loop3PassRateThreshold: 0.95,
      loop2ConsensusThreshold: 0.90,
      validatorCount: 3,
      maxIterations: 10,
    },
    enterprise: {
      loop3PassRateThreshold: 0.98,
      loop2ConsensusThreshold: 0.95,
      validatorCount: 5,
      maxIterations: 15,
    },
  };

  return configs[mode];
}
