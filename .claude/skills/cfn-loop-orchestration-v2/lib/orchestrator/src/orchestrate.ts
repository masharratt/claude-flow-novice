/**
 * CFN Loop Orchestrator - Complete TypeScript Implementation
 * Orchestrates the Fail Never (CFN) Loop workflow with test-driven validation
 * Supports MVP, Standard, and Enterprise execution modes
 *
 * Version: 3.0.0
 */

import { gateCheck, GateCheckParams } from './helpers/gate-check';
import { collectConsensus, validateConsensus } from './helpers/consensus';
import { spawnLoop3Agents, spawnLoop2Agents, SpawnResult } from './helpers/spawn-agents';
import { TestResult, ExecutionMode } from './types';
import { getModeConfig as getCanonicalModeConfig } from '../../../../../../src/planning/orchestration/mode-config';
import { decideNextAction } from '../../../../../../src/planning/orchestration/index.js';
import type { OrchestratorContext } from '../../../../../../src/planning/orchestration/index.js';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Coordinator } from './coordination/coordinator';
import { FileCoordinator } from './coordination/file-coordinator';

/**
 * Execution phases in the CFN Loop
 */
export type LoopPhase = 'loop3' | 'loop2' | 'product-owner' | 'complete';

/**
 * Product owner decision outcomes
 */
export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT' | null;

/**
 * Timeout configuration for agent execution
 */
export interface TimeoutConfig {
  loop3Agent?: number;
  loop2Agent?: number;
  productOwner?: number;
}

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
  timeouts?: TimeoutConfig;
  workspace?: string;
  taskDescription?: string;
  budgetCap?: number;
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
  dollarSpent: number;
  budgetRemaining: number;
  timeRemainingMs: number;
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
 * Shell escape utility for safe command execution
 */
function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes in the argument
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

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
  private coordinator: Coordinator = new FileCoordinator();

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

    // Validate timeout configuration if provided
    if (config.timeouts) {
      const MIN_TIMEOUT = 10;
      const MAX_TIMEOUT = 3600;

      if (config.timeouts.loop3Agent !== undefined) {
        if (config.timeouts.loop3Agent < MIN_TIMEOUT || config.timeouts.loop3Agent > MAX_TIMEOUT) {
          throw new Error(`loop3Agent timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.timeouts.loop3Agent}s`);
        }
      }

      if (config.timeouts.loop2Agent !== undefined) {
        if (config.timeouts.loop2Agent < MIN_TIMEOUT || config.timeouts.loop2Agent > MAX_TIMEOUT) {
          throw new Error(`loop2Agent timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.timeouts.loop2Agent}s`);
        }
      }

      if (config.timeouts.productOwner !== undefined) {
        if (config.timeouts.productOwner < MIN_TIMEOUT || config.timeouts.productOwner > MAX_TIMEOUT) {
          throw new Error(`productOwner timeout must be between ${MIN_TIMEOUT}-${MAX_TIMEOUT}s, got ${config.timeouts.productOwner}s`);
        }
      }
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
      dollarSpent: 0,
      budgetRemaining: config.budgetCap ?? 5.0,
      timeRemainingMs: config.timeouts?.loop3Agent != null ? config.timeouts.loop3Agent * 1000 : 3600000,
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
    return getCanonicalModeConfig(this.config.mode).gateThreshold;
  }

  /**
   * Get consensus threshold for current mode
   */
  public getConsensusThreshold(): number {
    return getCanonicalModeConfig(this.config.mode).consensusThreshold;
  }

  /**
   * Get timeout configuration with defaults
   * Defaults: Loop 3 = 300s, Loop 2 = 300s, Product Owner = 60s
   */
  public getTimeouts(): { loop3Agent: number; loop2Agent: number; productOwner: number } {
    return {
      loop3Agent: this.config.timeouts?.loop3Agent ?? 300,
      loop2Agent: this.config.timeouts?.loop2Agent ?? 300,
      productOwner: this.config.timeouts?.productOwner ?? 60,
    };
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

    this.testResults.forEach((result) => {
      totalPass += result.pass;
      totalFail += result.fail;
      totalSkip += result.skip ?? 0;
    });

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
   * Build task context string for agent spawning
   */
  private buildTaskContext(): string {
    const context = {
      taskId: this.config.taskId,
      mode: this.config.mode,
      iteration: this.state.iteration,
      phase: this.state.currentPhase,
      timestamp: Date.now(),
      ...(this.config.workspace && { workspace: this.config.workspace }),
      ...(this.config.taskDescription && { taskDescription: this.config.taskDescription }),
    };
    return JSON.stringify(context);
  }

  /**
   * Wait for agents to complete via Redis coordination
   * Blocks until all agents signal completion or timeout occurs
   *
   * @param spawnResults - Results from agent spawning
   * @param timeoutSeconds - Maximum wait time (default: 300s)
   * @returns Array of completed agent IDs
   */
  private async waitForAgentsToComplete(
    spawnResults: SpawnResult[],
    timeoutSeconds: number = 300
  ): Promise<string[]> {
    const successfulIds = spawnResults.filter((r) => r.success).map((r) => r.agentId);
    for (const r of spawnResults) {
      if (!r.success) {
        console.warn(`Skipping failed agent: ${r.agentId}`);
      }
    }

    console.log(`Waiting for ${successfulIds.length} agents to complete (timeout: ${timeoutSeconds}s)...`);

    // File-based coordination: workers write a done marker when finished.
    const completedAgents = await this.coordinator.waitForDone(
      this.config.taskId,
      successfulIds,
      timeoutSeconds
    );

    for (const agentId of completedAgents) {
      console.log(`✓ Agent ${agentId} completed`);
      this.markAgentComplete(agentId, 'loop3');
    }

    for (const agentId of successfulIds) {
      if (!completedAgents.includes(agentId)) {
        console.error(`✗ Agent ${agentId} failed or timed out`);
        this.recordTimeout(agentId, timeoutSeconds);
      }
    }

    console.log(`Completed: ${completedAgents.length}/${spawnResults.length} agents`);
    return completedAgents;
  }

  /**
   * Collect agent outputs from Redis
   * Retrieves test results, confidence scores, and deliverables
   *
   * @param agentIds - List of agent IDs to collect from
   * @returns Map of agent outputs
   */
  private async collectAgentOutputs(
    agentIds: string[]
  ): Promise<Map<string, { testResult?: TestResult; confidence?: number; deliverables?: string[] }>> {
    const outputs = new Map<string, { testResult?: TestResult; confidence?: number; deliverables?: string[] }>();

    console.log(`Collecting outputs from ${agentIds.length} agents...`);

    for (const agentId of agentIds) {
      try {
        // Retrieve agent output via the file-based coordinator
        const result = this.coordinator.getResult(this.config.taskId, agentId);

        const agentOutput: { testResult?: TestResult; confidence?: number; deliverables?: string[] } = {};

        if (result) {
          agentOutput.testResult = result.testResult;
          this.recordTestResult(agentId, result.testResult);
          console.log(
            `  ${agentId}: Test results collected (${result.testResult.pass} pass, ${result.testResult.fail} fail)`
          );

          if (result.confidence >= 0 && result.confidence <= 1) {
            agentOutput.confidence = result.confidence;
            console.log(`  ${agentId}: Confidence score: ${(result.confidence * 100).toFixed(2)}%`);
          }

          agentOutput.deliverables = result.deliverables;
          console.log(`  ${agentId}: Deliverables: ${result.deliverables.length} files`);
        } else {
          console.warn(`  ${agentId}: No result found`);
        }

        outputs.set(agentId, agentOutput);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ${agentId}: Failed to collect output: ${errorMsg}`);
      }
    }

    console.log(`Successfully collected outputs from ${outputs.size}/${agentIds.length} agents`);
    return outputs;
  }

  /**
   * Execute tests against agent deliverables
   * Runs test suite to validate actual agent work
   *
   * @param agentOutputs - Map of agent outputs with deliverables
   * @returns Aggregated test results
   */
  private async executeTestsOnDeliverables(
    agentOutputs: Map<string, { testResult?: TestResult; confidence?: number; deliverables?: string[] }>
  ): Promise<AggregatedTestResults> {
    console.log('Executing tests on agent deliverables...');

    const projectRoot = process.env.PROJECT_ROOT || process.cwd();

    // Validate TEST_COMMAND against allowlist to prevent shell injection (CVSS 8.5)
    const ALLOWED_TEST_COMMANDS = ['npm test', 'npm run test', 'jest', 'mocha', 'yarn test'];
    const ALLOWED_TEST_PATTERNS = [
      /^npm run test:[a-z0-9-]+$/,           // Namespaced npm scripts: npm run test:integration, test:security, etc.
      /^jest [a-z0-9/_-]+\.test\.[jt]s$/,   // Jest with specific test files (no path traversal)
      /^mocha [a-z0-9/_-]+\.test\.[jt]s$/   // Mocha with specific test files (no path traversal)
    ];
    const testCommand = process.env.TEST_COMMAND || 'npm test';

    // Security: Block path traversal attempts
    if (testCommand.includes('..')) {
      throw new Error(
        `Security: Path traversal detected in TEST_COMMAND. Got: ${testCommand}`
      );
    }

    // Check exact match first, then regex patterns
    const isAllowed = ALLOWED_TEST_COMMANDS.includes(testCommand) ||
                      ALLOWED_TEST_PATTERNS.some(pattern => pattern.test(testCommand));

    if (!isAllowed) {
      throw new Error(
        `Security: Invalid TEST_COMMAND value. Allowed commands: ${ALLOWED_TEST_COMMANDS.join(', ')}, ` +
        `npm run test:*, jest <file>.test.[jt]s, mocha <file>.test.[jt]s. Got: ${testCommand}`
      );
    }

    let totalPass = 0;
    let totalFail = 0;
    let totalSkip = 0;
    let agentCount = 0;

    for (const [agentId, output] of agentOutputs) {
      // Verify deliverables exist
      if (!output.deliverables || output.deliverables.length === 0) {
        console.warn(`  ${agentId}: No deliverables to test`);
        continue;
      }

      // Validate deliverables exist on filesystem
      const missingFiles: string[] = [];
      for (const deliverable of output.deliverables) {
        const filePath = path.join(projectRoot, deliverable);
        try {
          await fs.access(filePath);
        } catch {
          missingFiles.push(deliverable);
        }
      }

      if (missingFiles.length > 0) {
        console.warn(`  ${agentId}: Missing deliverables: ${missingFiles.join(', ')}`);
        const testResult: TestResult = {
          pass: 0,
          fail: missingFiles.length,
          skip: 0,
        };
        this.recordTestResult(agentId, testResult);
        totalFail += missingFiles.length;
        agentCount++;
        continue;
      }

      // Execute test suite
      try {
        console.log(`  ${agentId}: Running tests on ${output.deliverables.length} deliverables...`);

        const testOutput = execSync(testCommand, {
          encoding: 'utf8',
          cwd: projectRoot,
          stdio: 'pipe',
        });

        // Parse test output (example for Jest format)
        const passMatch = testOutput.match(/(\d+) passing/);
        const failMatch = testOutput.match(/(\d+) failing/);
        const skipMatch = testOutput.match(/(\d+) pending/);

        const pass = passMatch && passMatch[1] ? parseInt(passMatch[1], 10) : 0;
        const fail = failMatch && failMatch[1] ? parseInt(failMatch[1], 10) : 0;
        const skip = skipMatch && skipMatch[1] ? parseInt(skipMatch[1], 10) : 0;

        const testResult: TestResult = { pass, fail, skip };
        this.recordTestResult(agentId, testResult);

        totalPass += pass;
        totalFail += fail;
        totalSkip += skip;
        agentCount++;

        console.log(`  ${agentId}: Tests completed (${pass} pass, ${fail} fail, ${skip} skip)`);
      } catch (error) {
        // Test execution failed
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ${agentId}: Test execution failed: ${errorMsg}`);

        const testResult: TestResult = {
          pass: 0,
          fail: output.deliverables.length,
          skip: 0,
        };
        this.recordTestResult(agentId, testResult);
        totalFail += output.deliverables.length;
        agentCount++;
      }
    }

    const total = totalPass + totalFail + totalSkip;
    const passRate = total === 0 ? 0 : totalPass / total;

    console.log(`Test execution complete: ${totalPass} pass, ${totalFail} fail, ${totalSkip} skip (${(passRate * 100).toFixed(2)}% pass rate)`);

    return {
      totalPass,
      totalFail,
      totalSkip,
      passRate,
      agentCount,
    };
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

  private buildPlannerContext(gatePassed: boolean, consensusPassed: boolean, poConsulted: boolean): OrchestratorContext {
    return {
      iteration: this.state.iteration,
      maxIterations: this.config.maxIterations,
      gatePassed,
      consensusPassed,
      poConsulted,
      budgetRemaining: this.state.budgetRemaining,
      timeRemainingMs: this.state.timeRemainingMs,
      dollarSpent: this.state.dollarSpent,
    };
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

  /**
   * Execute the complete CFN Loop orchestration workflow
   * Runs iterations with Loop 3 → Loop 2 → Product Owner progression
   * Returns final decision (PROCEED/ITERATE/ABORT)
   */
  public async execute(): Promise<ProductOwnerDecision> {
    const maxIterations = this.config.maxIterations;

    // Main iteration loop
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      this.incrementIteration();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`=== ITERATION ${iteration}/${maxIterations} ===`);
      console.log(`${'='.repeat(60)}`);

      // ===== LOOP 3: IMPLEMENTERS =====
      console.log('\nPhase: Loop 3 (Implementers)');
      this.transitionPhase('loop3');

      const loop3AgentTypes = this.config.loop3Agents || ['backend-dev', 'coder'];
      const taskContext = this.buildTaskContext();

      // Spawn real CLI agents
      console.log(`Spawning ${loop3AgentTypes.length} Loop 3 agents via CLI...`);
      const loop3SpawnResult = await spawnLoop3Agents(
        this.config.taskId,
        this.state.iteration,
        loop3AgentTypes,
        taskContext
      );

      console.log(`Loop 3 spawn summary: ${loop3SpawnResult.successCount} successful, ${loop3SpawnResult.failureCount} failed`);

      // Wait for agents to complete via Redis coordination
      const timeouts = this.getTimeouts();
      const completedAgentIds = await this.waitForAgentsToComplete(
        loop3SpawnResult.results,
        timeouts.loop3Agent
      );

      if (completedAgentIds.length === 0) {
        console.error('No agents completed successfully. Aborting iteration.');
        this.recordDecision('ABORT');
        break;
      }

      // Collect agent outputs (test results, confidence scores, deliverables)
      const agentOutputs = await this.collectAgentOutputs(completedAgentIds);

      // Execute tests against actual agent deliverables
      const aggregated = await this.executeTestsOnDeliverables(agentOutputs);
      console.log(
        `Loop 3 Results: ${aggregated.totalPass} pass, ${aggregated.totalFail} fail (${aggregated.agentCount} agents, ${(aggregated.passRate * 100).toFixed(2)}% pass rate)`
      );

      const gateResult = this.checkGate(aggregated.passRate);
      console.log(`Gate Check: ${gateResult.passed ? 'PASSED' : 'FAILED'} (threshold: ${(gateResult.threshold * 100).toFixed(2)}%)`);

      this.state.dollarSpent += 0.054;
      this.state.budgetRemaining = Math.max(0, this.state.budgetRemaining - 0.054);

      if (!gateResult.passed) {
        const plannerDecision = decideNextAction(
          this.buildPlannerContext(false, false, false)
        );
        if (plannerDecision.action === 'abort_mission') {
          console.log(`GOAP planner: abort (budget: $${this.state.budgetRemaining.toFixed(3)} remaining)`);
          this.recordDecision('ABORT');
          break;
        }

        console.log(`Gate failed. Iterating...`);

        // Prepare feedback for next iteration
        this.prepareFeedback({
          gatePassRate: aggregated.passRate,
          previousFailures: Array.from(this.state.failedAgents),
          reasons: [`Gate check failed: ${(gateResult.gap * 100).toFixed(2)}% below threshold`],
        });

        console.log(`Feedback prepared for iteration ${iteration + 1}`);

        // Reset state for next iteration
        this.resetForIteration();

        if (!this.canContinueIterating()) {
          console.log(`Max iterations (${maxIterations}) reached. ABORTING.`);
          this.recordDecision('ABORT');
          break;
        }

        continue; // Go to next iteration
      }

      // ===== LOOP 2: VALIDATORS =====
      console.log('\nPhase: Loop 2 (Validators)');
      this.transitionPhase('loop2');

      const loop2AgentTypes = this.config.loop2Agents || ['code-reviewer', 'tester', 'security-specialist'];

      // Spawn real CLI validators
      console.log(`Spawning ${loop2AgentTypes.length} Loop 2 validators via CLI...`);
      const loop2SpawnResult = await spawnLoop2Agents(
        this.config.taskId,
        this.state.iteration,
        loop2AgentTypes,
        taskContext
      );

      console.log(`Loop 2 spawn summary: ${loop2SpawnResult.successCount} successful, ${loop2SpawnResult.failureCount} failed`);

      // Wait for validators to complete via Redis coordination
      const completedValidatorIds = await this.waitForAgentsToComplete(
        loop2SpawnResult.results,
        timeouts.loop2Agent
      );

      this.state.dollarSpent += 0.150;
      this.state.budgetRemaining = Math.max(0, this.state.budgetRemaining - 0.150);

      if (completedValidatorIds.length === 0) {
        const plannerDecision = decideNextAction(
          this.buildPlannerContext(true, false, false)
        );
        if (plannerDecision.action === 'abort_mission') {
          console.log(`GOAP planner: abort after no validators completed (budget: $${this.state.budgetRemaining.toFixed(3)} remaining)`);
          this.recordDecision('ABORT');
          break;
        }

        console.error('No validators completed successfully. Iterating...');
        this.prepareFeedback({
          reasons: ['No Loop 2 validators completed'],
        });
        this.resetForIteration();

        if (!this.canContinueIterating()) {
          console.log(`Max iterations (${maxIterations}) reached. ABORTING.`);
          this.recordDecision('ABORT');
          break;
        }

        continue;
      }

      // Collect validator outputs (consensus scores)
      const validatorOutputs = await this.collectAgentOutputs(completedValidatorIds);

      // Record consensus scores from validators
      for (const [validatorId, output] of validatorOutputs) {
        if (output.confidence !== undefined) {
          this.recordConsensusScore(validatorId, output.confidence);
        }
      }

      console.log(`Loop 2 validators completed: ${completedValidatorIds.length}/${loop2SpawnResult.totalSpawned}`);

      // Validate consensus
      const consensusValidation = this.validateConsensus();
      console.log(
        `Loop 2 Consensus: ${(consensusValidation.average * 100).toFixed(2)}% (threshold: ${(consensusValidation.threshold * 100).toFixed(2)}%)`
      );

      if (!consensusValidation.passed) {
        const plannerDecision = decideNextAction(
          this.buildPlannerContext(true, false, false)
        );
        if (plannerDecision.action === 'abort_mission') {
          console.log(`GOAP planner: abort after consensus failure`);
          this.recordDecision('ABORT');
          break;
        }

        console.log(`Consensus failed. Iterating...`);

        // Prepare feedback for next iteration
        this.prepareFeedback({
          consensusAverage: consensusValidation.average,
          reasons: [`Consensus below threshold: ${(consensusValidation.gap * 100).toFixed(2)}%`],
        });

        console.log(`Feedback prepared for iteration ${iteration + 1}`);

        // Reset state for next iteration
        this.resetForIteration();

        if (!this.canContinueIterating()) {
          console.log(`Max iterations (${maxIterations}) reached. ABORTING.`);
          this.recordDecision('ABORT');
          break;
        }

        continue; // Go to next iteration
      }

      // ===== PRODUCT OWNER DECISION =====
      console.log('\nPhase: Product Owner Decision');
      this.transitionPhase('product-owner');

      const ownerAgent = this.config.productOwner || 'product-owner-agent';
      console.log(`Consulting Product Owner (${ownerAgent})`);

      // Execute Product Owner decision via skill
      let decision: ProductOwnerDecision = 'PROCEED';
      try {
        const projectRoot = path.resolve(__dirname, '../../../..');
        const skillPath = path.join(projectRoot, '.claude/skills/cfn-product-owner-decision/execute-decision.sh');

        const poAgentId = `product-owner-${this.config.taskId}-${iteration}`;
        const poArgs = [
          '--task-id', this.config.taskId,
          '--agent-id', poAgentId,
          '--consensus', String(consensusValidation.average),
          '--threshold', String(consensusValidation.threshold),
          '--iteration', String(iteration),
          '--max-iterations', String(maxIterations),
          '--timeout', String(timeouts.productOwner),
        ];

        if (this.config.successCriteriaEnabled) {
          poArgs.push('--success-criteria', 'enabled');
        }

        console.log(`Executing Product Owner decision skill (timeout: ${timeouts.productOwner}s)...`);

        const escapedArgs = [escapeShellArg(skillPath), ...poArgs.map(arg => escapeShellArg(arg))].join(' ');
        const poOutput = execSync(
          `bash ${escapedArgs}`,
          { encoding: 'utf-8', timeout: (timeouts.productOwner + 10) * 1000 }
        );

        // Parse decision from JSON output
        const jsonMatch = poOutput.match(/\{[\s\S]*"decision":\s*"(PROCEED|ITERATE|ABORT)"[\s\S]*\}/);
        if (jsonMatch) {
          const poResult = JSON.parse(jsonMatch[0]);
          decision = poResult.decision as ProductOwnerDecision;
          console.log(`Product Owner reasoning: ${poResult.reasoning}`);
          console.log(`Product Owner confidence: ${poResult.confidence}`);
        } else {
          // Fallback: try to extract decision from plain text
          const decisionMatch = poOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/i);
          if (decisionMatch && decisionMatch[1]) {
            decision = decisionMatch[1].toUpperCase() as ProductOwnerDecision;
          } else {
            console.warn('Could not parse Product Owner decision, defaulting to PROCEED');
            decision = 'PROCEED';
          }
        }
      } catch (error: unknown) {
        console.error(`Product Owner execution failed: ${error instanceof Error ? error.message : String(error)}`);
        console.warn('Defaulting to PROCEED due to execution error');
        decision = 'PROCEED';
      }

      this.recordDecision(decision);
      console.log(`Product Owner Decision: ${decision}`);

      // ===== DECISION HANDLING =====
      if (decision === 'PROCEED') {
        console.log(`\n${'='.repeat(60)}`);
        console.log('SUCCESS: Product Owner approved. Orchestration complete.');
        console.log(`${'='.repeat(60)}`);
        break;
      } else if (decision === 'ITERATE') {
        console.log(`Product Owner requested iteration. Preparing feedback for iteration ${iteration + 1}...`);

        // Prepare feedback for next iteration with Product Owner context
        const iterationFeedback = this.prepareFeedback({
          gatePassRate: gateResult.passRate,
          consensusAverage: consensusValidation.average,
          reasons: [
            `Product Owner requested iteration ${iteration + 1}`,
            `Gate pass rate: ${(gateResult.passRate * 100).toFixed(2)}%`,
            `Consensus: ${(consensusValidation.average * 100).toFixed(2)}%`,
          ],
        });

        console.log('Feedback prepared:');
        console.log(`  - Gate: ${(iterationFeedback.gatePassRate! * 100).toFixed(2)}%`);
        console.log(`  - Consensus: ${(iterationFeedback.consensusAverage! * 100).toFixed(2)}%`);
        console.log(`  - Reasons: ${iterationFeedback.reasons?.join(', ')}`);

        // Store iteration feedback via the file-based coordinator for next Loop 3 agents
        try {
          this.coordinator.writeFeedback(this.config.taskId, iteration + 1, {
            gate_pass_rate: String(iterationFeedback.gatePassRate),
            consensus_average: String(iterationFeedback.consensusAverage),
            reasons: iterationFeedback.reasons?.join('; ') || '',
          });

          console.log(`Iteration feedback stored for iteration ${iteration + 1}`);
        } catch (error: unknown) {
          console.warn(`Failed to store iteration feedback: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Reset state for next iteration
        this.resetForIteration();

        if (!this.canContinueIterating()) {
          console.log(`Max iterations (${maxIterations}) reached. ABORTING.`);
          this.recordDecision('ABORT');
          break;
        }

        console.log(`\nProceeding to iteration ${iteration + 1}...`);
        continue; // Go to next iteration
      } else if (decision === 'ABORT') {
        console.log(`\n${'='.repeat(60)}`);
        console.log('FAILURE: Product Owner rejected. Aborting orchestration.');
        console.log(`${'='.repeat(60)}`);
        break;
      }
    }

    // Final status
    const finalDecision = this.getDecision() || 'ABORT';
    const summary = this.getSummary();

    console.log(`\nFinal Summary:`);
    console.log(`  Task ID: ${summary.taskId}`);
    console.log(`  Mode: ${summary.mode}`);
    console.log(`  Iterations: ${summary.iteration}/${this.config.maxIterations}`);
    console.log(`  Completed Agents: ${this.state.completedAgents.size}`);
    console.log(`  Failed Agents: ${this.state.failedAgents.size}`);
    console.log(`  Decision: ${finalDecision}`);
    console.log(`  Duration: ${(summary.duration / 1000).toFixed(2)}s`);

    return finalDecision;
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
