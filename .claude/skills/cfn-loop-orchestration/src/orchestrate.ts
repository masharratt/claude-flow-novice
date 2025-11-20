/**
 * CFN Loop Orchestrator - Complete TypeScript Implementation
 * Orchestrates the Fail Never (CFN) Loop workflow with test-driven validation
 * Supports MVP, Standard, and Enterprise execution modes
 *
 * Version: 3.0.0
 */

import { gateCheck, GateCheckParams } from './helpers/gate-check';
import { collectConsensus, validateConsensus } from './helpers/consensus';
import { TestResult, ExecutionMode } from './types';

/**
 * Execution phases in the CFN Loop
 */
export type LoopPhase = 'loop3' | 'loop2' | 'product-owner' | 'complete';

/**
 * Product owner decision outcomes
 */
export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT' | null;

/**
 * Orchestration configuration
 */
export interface OrchestrationConfig {
  taskId: string;
  mode: ExecutionMode;
  maxIterations: number;
  aceReflect?: boolean;
  loop3Agents?: string[];
  loop2Agents?: string[];
  productOwner?: string;
  successCriteriaEnabled?: boolean;
}

/**
 * Agent execution context
 */
export interface AgentExecutionContext {
  agentId: string;
  agentType: string;
  loopType: 'loop3' | 'loop2';
  iteration: number;
  taskId: string;
  timestamp: number;
}

/**
 * Phase transition tracking
 */
export interface PhaseTransition {
  fromPhase: LoopPhase;
  toPhase: LoopPhase;
  timestamp: number;
  iteration: number;
}

/**
 * Gate check result
 */
export interface GateCheckResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  gap: number;
}

/**
 * Consensus validation result
 */
export interface ConsensusValidationResult {
  passed: boolean;
  average: number;
  threshold: number;
  gap: number;
}

/**
 * Test result aggregation
 */
export interface AggregatedTestResults {
  totalPass: number;
  totalFail: number;
  totalSkip: number;
  passRate: number;
  agentCount: number;
}

/**
 * Orchestration state tracking
 */
export interface OrchestrationState {
  taskId: string;
  mode: ExecutionMode;
  iteration: number;
  currentPhase: LoopPhase;
  completedAgents: Set<string>;
  failedAgents: Set<string>;
  startTime: number;
  lastUpdateTime: number;
}

/**
 * Feedback for next iteration
 */
export interface IterationFeedback {
  gatePassRate?: number;
  consensusAverage?: number;
  previousFailures?: string[];
  reasons?: string[];
  timestamp?: number;
}

/**
 * Mode-specific configuration
 */
interface ModeThresholds {
  gateThreshold: number;
  consensusThreshold: number;
  maxIterations: number;
}

const MODE_CONFIG: Record<ExecutionMode, ModeThresholds> = {
  mvp: {
    gateThreshold: 0.70,
    consensusThreshold: 0.80,
    maxIterations: 5,
  },
  standard: {
    gateThreshold: 0.95,
    consensusThreshold: 0.90,
    maxIterations: 10,
  },
  enterprise: {
    gateThreshold: 0.98,
    consensusThreshold: 0.95,
    maxIterations: 15,
  },
};

/**
 * Main orchestrator class
 */
export class Orchestrator {
  private config: OrchestrationConfig;
  private state: OrchestrationState;
  private testResults: Map<string, TestResult> = new Map();
  private consensusScores: Map<string, number> = new Map();
  private decision: ProductOwnerDecision = null;
  private errors: Map<string, Error> = new Map();
  private phaseHistory: PhaseTransition[] = [];

  constructor(config: OrchestrationConfig) {
    // Validate configuration
    this.validateConfig(config);

    this.config = config;
    this.state = this.initializeState(config);
  }

  /**
   * Validate configuration parameters
   */
  private validateConfig(config: OrchestrationConfig): void {
    if (!config.taskId || config.taskId.trim() === '') {
      throw new Error('Task ID cannot be empty');
    }

    const validModes: ExecutionMode[] = ['mvp', 'standard', 'enterprise'];
    if (!validModes.includes(config.mode)) {
      throw new Error(`Invalid execution mode: ${config.mode}`);
    }

    if (!Number.isInteger(config.maxIterations) || config.maxIterations < 1) {
      throw new Error('Max iterations must be at least 1');
    }

    if (config.maxIterations > 100) {
      throw new Error('Max iterations cannot exceed 100');
    }
  }

  /**
   * Initialize orchestration state
   */
  private initializeState(config: OrchestrationConfig): OrchestrationState {
    const now = Date.now();

    return {
      taskId: config.taskId,
      mode: config.mode,
      iteration: 0,
      currentPhase: 'loop3',
      completedAgents: new Set(),
      failedAgents: new Set(),
      startTime: now,
      lastUpdateTime: now,
    };
  }

  /**
   * Get current orchestration state
   */
  public getState(): OrchestrationState {
    return { ...this.state, completedAgents: new Set(this.state.completedAgents), failedAgents: new Set(this.state.failedAgents) };
  }

  /**
   * Get task ID
   */
  public getTaskId(): string {
    return this.config.taskId;
  }

  /**
   * Get execution mode
   */
  public getMode(): ExecutionMode {
    return this.config.mode;
  }

  /**
   * Get maximum iterations for mode
   */
  public getMaxIterations(): number {
    return this.config.maxIterations;
  }

  /**
   * Get gate threshold for current mode
   */
  public getGateThreshold(): number {
    return MODE_CONFIG[this.config.mode].gateThreshold;
  }

  /**
   * Get consensus threshold for current mode
   */
  public getConsensusThreshold(): number {
    return MODE_CONFIG[this.config.mode].consensusThreshold;
  }

  /**
   * Transition to next phase
   */
  public transitionPhase(newPhase: LoopPhase): void {
    const transition: PhaseTransition = {
      fromPhase: this.state.currentPhase,
      toPhase: newPhase,
      timestamp: Date.now(),
      iteration: this.state.iteration,
    };

    this.phaseHistory.push(transition);
    this.state.currentPhase = newPhase;
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Increment iteration counter
   */
  public incrementIteration(): void {
    this.state.iteration++;
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Check if can continue iterating
   */
  public canContinueIterating(): boolean {
    return this.state.iteration < this.config.maxIterations;
  }

  /**
   * Check if orchestration should terminate
   */
  public shouldTerminate(): boolean {
    if (this.decision === 'PROCEED' || this.decision === 'ABORT') {
      return true;
    }

    if (this.decision === 'ITERATE' && !this.canContinueIterating()) {
      return true;
    }

    return false;
  }

  /**
   * Mark agent as completed
   */
  public markAgentComplete(agentId: string, _loopType: 'loop3' | 'loop2'): void {
    this.state.completedAgents.add(agentId);
    this.state.failedAgents.delete(agentId);
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Mark agent as failed
   */
  public markAgentFailed(agentId: string, _loopType: 'loop3' | 'loop2'): void {
    this.state.failedAgents.add(agentId);
    this.state.completedAgents.delete(agentId);
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Record execution error for agent
   */
  public recordExecutionError(agentId: string, error: Error): void {
    this.errors.set(agentId, error);
    this.markAgentFailed(agentId, 'loop3');
  }

  /**
   * Record timeout for agent
   */
  public recordTimeout(agentId: string, timeoutSeconds: number): void {
    const error = new Error(`Agent timeout after ${timeoutSeconds}s`);
    this.recordExecutionError(agentId, error);
  }

  /**
   * Record test results for agent
   */
  public recordTestResult(agentId: string, result: TestResult): void {
    this.testResults.set(agentId, result);
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Get test result for agent
   */
  public getTestResult(agentId: string): TestResult | undefined {
    return this.testResults.get(agentId);
  }

  /**
   * Aggregate test results across all agents
   */
  public aggregateTestResults(): AggregatedTestResults {
    let totalPass = 0;
    let totalFail = 0;
    let totalSkip = 0;

    for (const result of this.testResults.values()) {
      totalPass += result.pass;
      totalFail += result.fail;
      totalSkip += result.skip ?? 0;
    }

    const total = totalPass + totalFail + totalSkip;
    const passRate = total === 0 ? 0 : totalPass / total;

    return {
      totalPass,
      totalFail,
      totalSkip,
      passRate,
      agentCount: this.testResults.size,
    };
  }

  /**
   * Check gate (Loop 3 → Loop 2 transition)
   */
  public checkGate(passRate: number): GateCheckResult {
    const threshold = this.getGateThreshold();

    const params: GateCheckParams = {
      passRate,
      mode: this.config.mode,
      threshold,
    };

    const result = gateCheck(params);

    return {
      passed: result.passed,
      passRate: result.passRate,
      threshold: result.threshold,
      gap: result.gap,
    };
  }

  /**
   * Record consensus score from validator
   */
  public recordConsensusScore(validatorId: string, score: number): void {
    if (score < 0 || score > 1) {
      throw new Error(`Invalid consensus score: ${score} (must be 0.0-1.0)`);
    }

    this.consensusScores.set(validatorId, score);
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Get all consensus scores
   */
  public getConsensusScores(): number[] {
    return Array.from(this.consensusScores.values());
  }

  /**
   * Get consensus average
   */
  public getConsensusAverage(): number {
    const scores = this.getConsensusScores();

    if (scores.length === 0) {
      throw new Error('No consensus scores recorded');
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    return sum / scores.length;
  }

  /**
   * Validate consensus against threshold
   */
  public validateConsensus(): ConsensusValidationResult {
    const scores = this.getConsensusScores();

    if (scores.length === 0) {
      throw new Error('No consensus scores recorded');
    }

    const result = collectConsensus(scores);
    const validation = validateConsensus({
      average: result.average,
      mode: this.config.mode,
      threshold: this.getConsensusThreshold(),
    });

    return {
      passed: validation.passed,
      average: validation.average,
      threshold: validation.threshold,
      gap: validation.gap,
    };
  }

  /**
   * Record product owner decision
   */
  public recordDecision(decision: ProductOwnerDecision): void {
    this.decision = decision;
    this.state.lastUpdateTime = Date.now();
  }

  /**
   * Get recorded decision
   */
  public getDecision(): ProductOwnerDecision {
    return this.decision;
  }

  /**
   * Parse decision from agent output
   */
  public parseDecisionFromOutput(output: string): ProductOwnerDecision {
    const normalizedOutput = output.toUpperCase();

    if (normalizedOutput.includes('PROCEED')) {
      return 'PROCEED';
    }

    if (normalizedOutput.includes('ITERATE')) {
      return 'ITERATE';
    }

    if (normalizedOutput.includes('ABORT')) {
      return 'ABORT';
    }

    return null;
  }

  /**
   * Spawn Loop 3 (implementer) agents
   */
  public async spawnLoop3Agents(agentTypes: string[]): Promise<AgentExecutionContext[]> {
    const agents: AgentExecutionContext[] = [];
    const now = Date.now();

    agentTypes.forEach((agentType, index) => {
      agents.push({
        agentId: `${agentType}-${this.state.iteration + 1}-${index + 1}`,
        agentType,
        loopType: 'loop3',
        iteration: this.state.iteration + 1,
        taskId: this.config.taskId,
        timestamp: now,
      });
    });

    return agents;
  }

  /**
   * Spawn Loop 2 (validator) agents
   */
  public async spawnLoop2Validators(validatorTypes: string[]): Promise<AgentExecutionContext[]> {
    const validators: AgentExecutionContext[] = [];
    const now = Date.now();

    validatorTypes.forEach((validatorType, index) => {
      validators.push({
        agentId: `${validatorType}-${this.state.iteration + 1}-${index + 1}`,
        agentType: validatorType,
        loopType: 'loop2',
        iteration: this.state.iteration + 1,
        taskId: this.config.taskId,
        timestamp: now,
      });
    });

    return validators;
  }

  /**
   * Build agent context for spawning
   */
  public buildAgentContext(
    agentId: string,
    loopType: 'loop3' | 'loop2',
    iteration: number,
    _feedback?: IterationFeedback
  ): AgentExecutionContext {
    return {
      agentId,
      agentType: 'unknown',
      loopType,
      iteration,
      taskId: this.config.taskId,
      timestamp: Date.now(),
    };
  }

  /**
   * Prepare feedback for next iteration
   */
  public prepareFeedback(feedback: IterationFeedback): IterationFeedback {
    return {
      ...feedback,
      timestamp: Date.now(),
    };
  }

  /**
   * Get phase history
   */
  public getPhaseHistory(): PhaseTransition[] {
    return [...this.phaseHistory];
  }

  /**
   * Get execution errors
   */
  public getErrors(): Map<string, Error> {
    return new Map(this.errors);
  }

  /**
   * Reset state for new iteration
   */
  public resetForIteration(): void {
    this.testResults.clear();
    this.consensusScores.clear();
    this.decision = null;
    this.errors.clear();
    this.state.completedAgents.clear();
    this.state.failedAgents.clear();
  }

  /**
   * Get orchestration summary
   */
  public getSummary(): {
    taskId: string;
    mode: ExecutionMode;
    iteration: number;
    totalAgentsCompleted: number;
    totalAgentsFailed: number;
    decision: ProductOwnerDecision;
    duration: number;
  } {
    return {
      taskId: this.config.taskId,
      mode: this.config.mode,
      iteration: this.state.iteration,
      totalAgentsCompleted: this.state.completedAgents.size,
      totalAgentsFailed: this.state.failedAgents.size,
      decision: this.decision,
      duration: Date.now() - this.state.startTime,
    };
  }
}

/**
 * CLI entry point for orchestrator
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let taskId = '';
  let mode: ExecutionMode = 'standard';
  let maxIterations = 10;
  let loop3Agents: string[] = [];
  let loop2Agents: string[] = [];
  let productOwner = '';
  let successCriteriaEnabled = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    switch (arg) {
      case '--task-id': {
        const nextArg = args[++i];
        if (nextArg) taskId = nextArg;
        break;
      }
      case '--mode': {
        const nextArg = args[++i];
        if (nextArg) mode = nextArg as ExecutionMode;
        break;
      }
      case '--max-iterations': {
        const nextArg = args[++i];
        if (nextArg) maxIterations = parseInt(nextArg, 10);
        break;
      }
      case '--loop3-agents': {
        const nextArg = args[++i];
        if (nextArg) {
          loop3Agents = nextArg.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
        }
        break;
      }
      case '--loop2-agents': {
        const nextArg = args[++i];
        if (nextArg) {
          loop2Agents = nextArg.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
        }
        break;
      }
      case '--product-owner': {
        const nextArg = args[++i];
        if (nextArg) productOwner = nextArg;
        break;
      }
      case '--success-criteria': {
        const nextArg = args[++i];
        if (nextArg) {
          successCriteriaEnabled = nextArg.toLowerCase() === 'enabled' || nextArg === 'true';
        }
        break;
      }
    }
  }

  if (!taskId) {
    console.error('Error: --task-id is required');
    process.exit(1);
  }

  const config: OrchestrationConfig = {
    taskId,
    mode,
    maxIterations,
  };

  // Add optional parameters only if they have values
  if (loop3Agents.length > 0) {
    config.loop3Agents = loop3Agents;
  }
  if (loop2Agents.length > 0) {
    config.loop2Agents = loop2Agents;
  }
  if (productOwner) {
    config.productOwner = productOwner;
  }
  if (successCriteriaEnabled) {
    config.successCriteriaEnabled = successCriteriaEnabled;
  }

  const orchestrator = new Orchestrator(config);
  console.log(JSON.stringify(orchestrator.getState(), null, 2));
  process.exit(0);
}

export default Orchestrator;
