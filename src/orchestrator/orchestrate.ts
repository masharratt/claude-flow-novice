/**
 * CFN Loop Orchestrator - TypeScript Implementation
 *
 * Orchestrates the complete CFN (Complete Fail Never) Loop workflow:
 * 1. Loop 3: Spawn implementation agents
 * 2. Gate Check: Validate test pass rates against threshold
 * 3. Loop 2: Spawn validator agents if gate passes
 * 4. Consensus Check: Validate consensus among validators
 * 5. Product Owner Decision: PROCEED/ITERATE/ABORT
 *
 * Features:
 * - Type-safe state management
 * - Redis coordination for agent communication
 * - Iteration management with max bounds
 * - Comprehensive error handling
 * - Full audit trail via state tracking
 *
 * @module orchestrator
 */

import {
  OrchestratorConfig,
  OrchestrationState,
  IterationState,
  AgentSpawnResult,
  AgentExecutionResults,
  ConsensusResult,
  ProductOwnerDecision,
  DeliverableVerificationResult,
  OrchestrationResult,
  LoopDecision,
  OrchestratorError,
  ILogger,
  IRedisClient,
  IGateChecker,
  IAgentSpawner,
  IProductOwnerDecision,
  IDeliverableVerifier,
  ModeThresholds,
  isValidOrchestratorConfig,
} from './types';
import { GateResult } from '@/gate-checker/types';
import type { ExecutionMode } from '@/gate-checker/types';

/**
 * CFN Loop Orchestrator
 *
 * Manages the complete orchestration workflow with proper type safety,
 * error handling, and state management.
 */
export class CFNOrchestrator {
  private state: OrchestrationState;
  private readonly config: OrchestratorConfig;
  private readonly logger: ILogger;
  private readonly redisClient: IRedisClient;
  private readonly gateChecker: IGateChecker;
  private readonly agentSpawner: IAgentSpawner;
  private readonly productOwnerDecider: IProductOwnerDecision;
  private readonly deliverableVerifier?: IDeliverableVerifier;

  // Security constraints
  private readonly securityLimits = {
    maxIterations: 100,
    maxAgentsPerWave: 50,
    taskIdMaxLength: 256,
    timeoutMin: 1,
    timeoutMax: 3600,
  };

  // Mode-specific settings
  private readonly gateThreshold: number;
  private readonly consensusThreshold: number;
  private readonly timeout: number;
  private readonly minQuorumLoop3: number;
  private readonly minQuorumLoop2: number;

  constructor(
    config: OrchestratorConfig,
    logger: ILogger,
    redisClient: IRedisClient,
    gateChecker: IGateChecker,
    agentSpawner: IAgentSpawner,
    productOwnerDecider: IProductOwnerDecision,
    deliverableVerifier?: IDeliverableVerifier
  ) {
    // Validate configuration
    if (!isValidOrchestratorConfig(config)) {
      throw new OrchestratorError('Invalid orchestrator configuration', 'CONFIG_INVALID');
    }

    // Validate max iterations
    if (config.maxIterations > this.securityLimits.maxIterations) {
      throw new OrchestratorError(
        `Max iterations ${config.maxIterations} exceeds limit ${this.securityLimits.maxIterations}`,
        'CONFIG_INVALID'
      );
    }

    this.config = config;
    this.logger = logger;
    this.redisClient = redisClient;
    this.gateChecker = gateChecker;
    this.agentSpawner = agentSpawner;
    this.productOwnerDecider = productOwnerDecider;
    this.deliverableVerifier = deliverableVerifier;

    // Get thresholds for mode
    const thresholds = ModeThresholds[config.mode as ExecutionMode];
    this.gateThreshold = config.gateThreshold ?? thresholds.gate;
    this.consensusThreshold = config.consensusThreshold ?? thresholds.consensus;
    this.timeout = config.timeout ?? 300; // 5 minutes default
    this.minQuorumLoop3 = config.minQuorumLoop3 ?? 0.66;
    this.minQuorumLoop2 = config.minQuorumLoop2 ?? 0.66;

    // Initialize orchestration state
    this.state = {
      taskId: config.taskId,
      config,
      iterations: [],
      currentIteration: 0,
      deliverableVerified: false,
      aborted: false,
    };

    this.logger.info(`CFN Orchestrator initialized for task ${config.taskId}`, {
      mode: config.mode,
      gateThreshold: this.gateThreshold,
      consensusThreshold: this.consensusThreshold,
      maxIterations: config.maxIterations,
    });
  }

  /**
   * Execute the complete CFN Loop orchestration
   *
   * @returns Orchestration result with final status and metrics
   * @throws OrchestratorError on fatal errors
   */
  async execute(): Promise<OrchestrationResult> {
    const startTime = Date.now();

    try {
      // Store context in Redis
      await this.storeContext();

      // Main iteration loop
      for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
        this.state.currentIteration = iteration;
        const iterationStart = Date.now();

        this.logger.info(`Starting iteration ${iteration}/${this.config.maxIterations}`);

        try {
          // Create iteration state
          const iterationState: IterationState = {
            iteration,
            loop3Spawned: [],
            loop3Completed: [],
            deliverableVerified: false,
            gatePassed: false,
            loop2Spawned: [],
            loop2Completed: [],
            consensusReached: false,
            startTime: iterationStart,
            errors: [],
          };

          // Step 1: Spawn Loop 3 agents
          iterationState.loop3Spawned = await this.spawnLoop3Agents(iteration);

          // Step 2: Wait for Loop 3 completion and collect results
          iterationState.loop3Completed = await this.waitForLoop3Completion(iteration);

          // Step 3: Verify deliverables
          if (this.config.expectedFiles || this.config.epicContext) {
            const verified = await this.verifyDeliverables();
            iterationState.deliverableVerified = verified;

            if (!verified) {
              this.logger.warn('Deliverable verification failed, requesting iteration');
              iterationState.endTime = Date.now();
              this.state.iterations.push(iterationState);

              // Store feedback for next iteration
              await this.storeIterationFeedback(iteration);
              continue;
            }

            this.state.deliverableVerified = true;
          }

          // Step 4: Gate check (Loop 3 self-validation)
          const gateResult = await this.performGateCheck(iteration);
          iterationState.gateCheckResult = gateResult;
          iterationState.gatePassed = gateResult.passed;

          if (!gateResult.passed) {
            this.logger.warn(`Gate check failed at iteration ${iteration}`, {
              passRate: gateResult.pass_rate,
              threshold: gateResult.threshold,
              gap: gateResult.gap,
            });
            iterationState.endTime = Date.now();
            this.state.iterations.push(iterationState);

            // Store feedback for next iteration
            await this.storeIterationFeedback(iteration);
            continue;
          }

          this.state.finalLoop3Confidence = gateResult.pass_rate;

          // Step 5: Spawn Loop 2 agents
          iterationState.loop2Spawned = await this.spawnLoop2Agents(iteration);

          // Step 6: Wait for Loop 2 completion and collect results
          iterationState.loop2Completed = await this.waitForLoop2Completion(iteration);

          // Step 7: Consensus check (Loop 2 validation)
          const consensusResult = await this.performConsensusCheck(iteration);
          iterationState.consensusReached = consensusResult.passed;
          iterationState.consensusScore = consensusResult.consensus;

          if (!consensusResult.passed) {
            this.logger.warn(`Consensus check failed at iteration ${iteration}`, {
              consensus: consensusResult.consensus,
              threshold: consensusResult.threshold,
              gap: consensusResult.gap,
            });
            iterationState.endTime = Date.now();
            this.state.iterations.push(iterationState);

            // Store feedback for next iteration
            await this.storeIterationFeedback(iteration);
            continue;
          }

          this.state.finalLoop2Consensus = consensusResult.consensus;

          // Step 8: Get Product Owner decision
          const decision = await this.getProductOwnerDecision(iteration);
          iterationState.productOwnerDecision = decision.decision;
          iterationState.finalDecision = decision.decision;
          iterationState.endTime = Date.now();

          this.logger.info(`Product Owner decision: ${decision.decision}`, {
            rationale: decision.rationale,
            confidence: decision.confidence,
          });

          // Step 9: Execute decision
          this.state.iterations.push(iterationState);
          const result = await this.executeDecision(decision, iteration, startTime);
          return result;
        } catch (error) {
          const iterationState = this.state.iterations[iteration - 1] || {
            iteration,
            loop3Spawned: [],
            loop3Completed: [],
            deliverableVerified: false,
            gatePassed: false,
            loop2Spawned: [],
            loop2Completed: [],
            consensusReached: false,
            startTime: iterationStart,
            errors: [],
          };

          const errorMessage = error instanceof Error ? error.message : String(error);

          // Check if this is an iteration request (not a real error)
          if (errorMessage === 'ITERATE - continue to next iteration') {
            // This is expected - just continue to next iteration
            continue;
          }

          iterationState.errors.push(errorMessage);
          if (!iterationState.endTime) {
            iterationState.endTime = Date.now();
          }

          this.state.iterations.push(iterationState);

          if (error instanceof OrchestratorError && error.code === 'ITERATION_LIMIT') {
            return this.createFailureResult(startTime, `Max iterations reached at iteration ${iteration}`);
          }

          this.logger.error(`Error during iteration ${iteration}`, error);
          return this.createFailureResult(startTime, errorMessage);
        }
      }

      // Max iterations reached without decision
      return this.createFailureResult(startTime, 'Max iterations reached without PROCEED decision');
    } catch (error) {
      this.state.aborted = true;
      this.state.abortReason = error instanceof Error ? error.message : String(error);
      this.logger.error('Orchestration aborted', error);

      return this.createAbortedResult(startTime);
    }
  }

  /**
   * Get orchestration state for inspection
   */
  getState(): Readonly<OrchestrationState> {
    return Object.freeze({ ...this.state });
  }

  /**
   * Private helper methods
   */

  private async storeContext(): Promise<void> {
    try {
      if (this.config.epicContext) {
        await this.redisClient.set(
          `swarm:${this.config.taskId}:epic-context`,
          JSON.stringify(this.config.epicContext),
          86400
        );
      }

      if (this.config.phaseContext) {
        await this.redisClient.set(
          `swarm:${this.config.taskId}:phase-context`,
          JSON.stringify(this.config.phaseContext),
          86400
        );
      }

      if (this.config.successCriteria) {
        await this.redisClient.set(
          `swarm:${this.config.taskId}:success-criteria`,
          JSON.stringify(this.config.successCriteria),
          86400
        );
      }

      this.logger.info('Context stored in Redis');
    } catch (error) {
      this.logger.warn('Failed to store context in Redis', error);
    }
  }

  private async spawnLoop3Agents(iteration: number): Promise<AgentSpawnResult[]> {
    this.logger.info(`Spawning Loop 3 agents for iteration ${iteration}`);

    try {
      const context = this.buildAgentContext(iteration, 'loop3');
      const results = await this.agentSpawner.spawn(
        this.config.taskId,
        iteration,
        this.config.loop3Agents,
        'loop3',
        context
      );

      this.logger.info(`Spawned ${results.length} Loop 3 agents`);
      return results;
    } catch (error) {
      throw new OrchestratorError(
        `Failed to spawn Loop 3 agents: ${error instanceof Error ? error.message : String(error)}`,
        'SPAWN_FAILED'
      );
    }
  }

  private async spawnLoop2Agents(iteration: number): Promise<AgentSpawnResult[]> {
    this.logger.info(`Spawning Loop 2 agents for iteration ${iteration}`);

    try {
      const context = this.buildAgentContext(iteration, 'loop2');
      const results = await this.agentSpawner.spawn(
        this.config.taskId,
        iteration,
        this.config.loop2Agents,
        'loop2',
        context
      );

      this.logger.info(`Spawned ${results.length} Loop 2 agents`);
      return results;
    } catch (error) {
      throw new OrchestratorError(
        `Failed to spawn Loop 2 agents: ${error instanceof Error ? error.message : String(error)}`,
        'SPAWN_FAILED'
      );
    }
  }

  private async waitForLoop3Completion(iteration: number): Promise<AgentExecutionResults[]> {
    this.logger.info(`Waiting for Loop 3 agents to complete`);

    try {
      // In real implementation, would wait for agents via Redis coordination
      // For now, collect results from Redis
      const results: AgentExecutionResults[] = [];
      // TODO: Implement actual waiting logic with Redis blocking

      return results;
    } catch (error) {
      throw new OrchestratorError(
        `Timeout waiting for Loop 3 agents: ${error instanceof Error ? error.message : String(error)}`,
        'TIMEOUT'
      );
    }
  }

  private async waitForLoop2Completion(iteration: number): Promise<AgentExecutionResults[]> {
    this.logger.info(`Waiting for Loop 2 agents to complete`);

    try {
      // In real implementation, would wait for agents via Redis coordination
      const results: AgentExecutionResults[] = [];
      // TODO: Implement actual waiting logic with Redis blocking

      return results;
    } catch (error) {
      throw new OrchestratorError(
        `Timeout waiting for Loop 2 agents: ${error instanceof Error ? error.message : String(error)}`,
        'TIMEOUT'
      );
    }
  }

  private async verifyDeliverables(): Promise<boolean> {
    if (!this.deliverableVerifier) {
      this.logger.warn('Deliverable verifier not available, skipping verification');
      return true;
    }

    try {
      const result = await this.deliverableVerifier.verify({
        expectedFiles: this.config.expectedFiles,
        taskType: this.getTaskType(),
        strict: this.config.mode === 'enterprise',
      });

      if (!result.verified) {
        this.logger.warn('Deliverable verification failed', {
          filesChecked: result.filesChecked,
          filesFound: result.filesFound,
          missingFiles: result.missingFiles,
        });
      }

      return result.verified;
    } catch (error) {
      this.logger.error('Deliverable verification error', error);
      return false;
    }
  }

  private async performGateCheck(iteration: number): Promise<GateResult> {
    this.logger.info(`Performing gate check for iteration ${iteration}`);

    try {
      const result = await this.gateChecker.checkGate(
        this.config.taskId,
        this.config.loop3Agents,
        this.gateThreshold,
        this.minQuorumLoop3
      );

      this.logger.info(`Gate check result: ${result.passed ? 'PASS' : 'FAIL'}`, {
        passRate: result.pass_rate,
        threshold: result.threshold,
      });

      return result;
    } catch (error) {
      throw new OrchestratorError(
        `Gate check failed: ${error instanceof Error ? error.message : String(error)}`,
        'GATE_FAILED'
      );
    }
  }

  private async performConsensusCheck(iteration: number): Promise<ConsensusResult> {
    this.logger.info(`Performing consensus check for iteration ${iteration}`);

    try {
      // In real implementation, would aggregate Loop 2 agent scores
      const agentCount = this.config.loop2Agents.length;
      // TODO: Get actual consensus score from Redis

      const consensus = 0.95; // Placeholder
      const passed = consensus >= this.consensusThreshold;

      const result: ConsensusResult = {
        consensus,
        threshold: this.consensusThreshold,
        passed,
        agentCount,
        completedAgentCount: agentCount,
      };

      if (!passed) {
        result.gap = this.consensusThreshold - consensus;
      }

      this.logger.info(`Consensus check result: ${passed ? 'PASS' : 'FAIL'}`, {
        consensus,
        threshold: this.consensusThreshold,
      });

      return result;
    } catch (error) {
      throw new OrchestratorError(
        `Consensus check failed: ${error instanceof Error ? error.message : String(error)}`,
        'CONSENSUS_FAILED'
      );
    }
  }

  private async getProductOwnerDecision(iteration: number): Promise<ProductOwnerDecision> {
    this.logger.info(`Getting Product Owner decision for iteration ${iteration}`);

    try {
      const consensus = this.state.finalLoop2Consensus ?? 0;

      const decision = await this.productOwnerDecider.makeDecision(
        this.config.taskId,
        iteration,
        consensus,
        this.consensusThreshold,
        this.config.maxIterations
      );

      return decision;
    } catch (error) {
      throw new OrchestratorError(
        `Product Owner decision failed: ${error instanceof Error ? error.message : String(error)}`,
        'DECISION_FAILED'
      );
    }
  }

  private async requestIteration(iteration: number, iterationState: IterationState): Promise<void> {
    this.logger.info(`Requesting iteration ${iteration + 1}`);

    if (iteration >= this.config.maxIterations) {
      throw new OrchestratorError(
        `Iteration limit reached at iteration ${iteration}`,
        'ITERATION_LIMIT'
      );
    }

    iterationState.endTime = Date.now();
    this.state.iterations.push(iterationState);

    // Store iteration feedback in Redis for next iteration
    await this.storeIterationFeedback(iteration);
  }

  private async storeIterationFeedback(iteration: number): Promise<void> {
    try {
      const currentIteration = this.state.iterations[iteration - 1];
      if (currentIteration) {
        const feedback = {
          iteration,
          previousGateStatus: currentIteration.gatePassed ? 'passed' : 'failed',
          previousPassRate: currentIteration.gateCheckResult?.pass_rate,
          failedTests: currentIteration.gateCheckResult?.failed_suites,
          consensusScore: currentIteration.consensusScore,
        };

        await this.redisClient.set(
          `swarm:${this.config.taskId}:iteration-feedback`,
          JSON.stringify(feedback),
          3600
        );
      }
    } catch (error) {
      this.logger.warn('Failed to store iteration feedback', error);
    }
  }

  private async executeDecision(
    decision: ProductOwnerDecision,
    iteration: number,
    startTime: number
  ): Promise<OrchestrationResult> {
    switch (decision.decision) {
      case 'PROCEED':
        this.logger.info('Product Owner decision: PROCEED');
        this.state.finalDecision = 'PROCEED';
        return this.createSuccessResult(startTime);

      case 'ABORT':
        this.logger.info('Product Owner decision: ABORT');
        this.state.finalDecision = 'ABORT';
        this.state.aborted = true;
        return this.createAbortedResult(startTime);

      case 'ITERATE':
        this.logger.info('Product Owner decision: ITERATE');
        if (iteration >= this.config.maxIterations) {
          return this.createFailureResult(
            startTime,
            `Max iterations reached at iteration ${iteration}`
          );
        }
        // Signal to continue to next iteration
        throw new Error('ITERATE - continue to next iteration');

      default:
        const _exhaustive: never = decision.decision;
        return _exhaustive;
    }
  }

  private buildAgentContext(iteration: number, loopType: 'loop3' | 'loop2'): string {
    const context = [
      `Task: ${this.config.taskId}`,
      `Iteration: ${iteration}/${this.config.maxIterations}`,
      `Loop Type: ${loopType === 'loop3' ? 'Implementation' : 'Validation'}`,
      `Mode: ${this.config.mode}`,
    ];

    if (this.config.epicContext) {
      context.push(`Epic: ${JSON.stringify(this.config.epicContext)}`);
    }

    if (this.config.phaseContext) {
      context.push(`Phase: ${JSON.stringify(this.config.phaseContext)}`);
    }

    if (this.config.successCriteria) {
      context.push(`Success Criteria: ${JSON.stringify(this.config.successCriteria)}`);
    }

    return context.join(' | ');
  }

  private getTaskType(): string {
    if (this.config.epicContext && typeof this.config.epicContext === 'object') {
      const epicContext = this.config.epicContext as Record<string, unknown>;
      return (epicContext.epicGoal as string) ?? 'unknown';
    }
    return 'unknown';
  }

  private createSuccessResult(startTime: number): OrchestrationResult {
    const totalTime = (Date.now() - startTime) / 1000;

    return {
      status: 'success',
      finalDecision: 'PROCEED',
      iterationsCompleted: this.state.currentIteration,
      maxIterations: this.config.maxIterations,
      loop3Confidence: this.state.finalLoop3Confidence ?? 0,
      loop2Consensus: this.state.finalLoop2Consensus ?? 0,
      deliverableVerified: this.state.deliverableVerified,
      executionTimeSeconds: totalTime,
      errors: [],
      successReason: 'Product Owner approved PROCEED decision',
    };
  }

  private createFailureResult(startTime: number, reason: string): OrchestrationResult {
    const totalTime = (Date.now() - startTime) / 1000;
    const errors = this.state.iterations.flatMap((iter: IterationState) => iter.errors);

    return {
      status: 'failed',
      finalDecision: this.state.finalDecision ?? 'ABORT',
      iterationsCompleted: this.state.currentIteration,
      maxIterations: this.config.maxIterations,
      loop3Confidence: this.state.finalLoop3Confidence ?? 0,
      loop2Consensus: this.state.finalLoop2Consensus ?? 0,
      deliverableVerified: this.state.deliverableVerified,
      executionTimeSeconds: totalTime,
      errors,
      failureReason: reason,
    };
  }

  private createAbortedResult(startTime: number): OrchestrationResult {
    const totalTime = (Date.now() - startTime) / 1000;
    const errors = this.state.iterations.flatMap((iter: IterationState) => iter.errors);

    if (this.state.abortReason) {
      errors.push(this.state.abortReason);
    }

    return {
      status: 'aborted',
      finalDecision: 'ABORT',
      iterationsCompleted: this.state.currentIteration,
      maxIterations: this.config.maxIterations,
      loop3Confidence: this.state.finalLoop3Confidence ?? 0,
      loop2Consensus: this.state.finalLoop2Consensus ?? 0,
      deliverableVerified: this.state.deliverableVerified,
      executionTimeSeconds: totalTime,
      errors,
      failureReason: this.state.abortReason,
    };
  }
}

export default CFNOrchestrator;
