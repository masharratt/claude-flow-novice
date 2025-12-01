/**
 * CFN Loop Workflow - trigger.dev v2 Implementation
 * Complete orchestration: Loop 3 -> Gate -> Loop 2 -> Consensus -> Product Owner
 *
 * Architecture:
 * - run() - Main orchestration (50 lines)
 * - executeLoop3Agents() - Spawn and execute implementer agents
 * - performGateCheck() - Execute gate validation
 * - executeLoop2Validators() - Spawn and execute validator agents
 * - collectConsensus() - Aggregate validator consensus
 * - executeProductOwnerDecision() - Get PO decision and route
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import {
  CFNLoopPayload,
  CFNLoopResult,
  AgentResult,
  ValidatorResult,
  ConsensusResult,
  GateCheckResult,
  ProductOwnerDecision,
  getThresholdConfig,
} from '../types/cfn-types';
import {
  executeAgent,
  executeTests,
  toAgentResult,
  toValidatorResult,
  createTestDeliverable,
} from '../lib/agent-executor';

// Declare client for external initialization
declare const client: TriggerClient;

// Type definitions for phase execution
interface PhaseContext {
  taskId: string;
  iteration: number;
  io: any;
  payload: CFNLoopPayload;
  thresholds: ReturnType<typeof getThresholdConfig>;
}

interface IterationState {
  currentIteration: number;
  allAgentResults: AgentResult[];
  latestGateCheck: GateCheckResult | null;
  latestConsensus: ConsensusResult | null;
  productOwnerDecision: ProductOwnerDecision | null;
}

/**
 * Execute Loop 3 Phase: Spawn and execute implementer agents
 * Responsibility: Agent execution and test validation
 * Nesting depth: 2, Lines: ~35
 */
async function executeLoop3Agents(ctx: PhaseContext): Promise<AgentResult[]> {
  const { taskId, iteration, io, payload } = ctx;

  try {
    await io.logger.log('Loop 3 started', { taskId, iteration });

    const agentTypes = determineAgentTypes(payload);
    const results: AgentResult[] = [];
    const errors: any[] = [];

    for (const agentType of agentTypes) {
      try {
        // Dispatch spawn event
        await io.sendEvent(`spawn-agent-${agentType}-${iteration}`, {
          name: 'cfn.agent.run',
          payload: {
            taskId,
            agentType,
            description: payload.description,
            successCriteria: payload.successCriteria,
            iterationNumber: iteration,
          },
        });

        // Execute agent
        const execution = await executeAgent({
          taskId,
          agentType,
          context: payload.description,
          testCommand: payload.successCriteria.testCommand,
        });

        const testResults = await executeTests(payload.successCriteria.testCommand);
        results.push(toAgentResult(execution, agentType, testResults));
      } catch (error: any) {
        await io.logger.error('Agent execution failed', { taskId, agentType, iteration, error: error.message });
        errors.push({ agentType, error: error.message });
      }
    }

    if (results.length === 0) {
      throw new Error(`All Loop 3 agents failed: ${JSON.stringify(errors)}`);
    }

    await io.logger.log('Loop 3 completed', {
      taskId,
      agentCount: results.length,
      avgPassRate: (results.reduce((s, r) => s + r.testResults.passRate, 0) / results.length).toFixed(4),
    });

    return results;
  } catch (error: any) {
    await io.logger.error('Loop 3 phase failed', { taskId, iteration, error: error.message });
    throw error;
  }
}

/**
 * Perform Gate Check: Validate Loop 3 pass rate against threshold
 * Responsibility: Gate calculation and validation
 * Nesting depth: 2, Lines: ~30
 */
async function performGateCheck(
  agentResults: AgentResult[],
  ctx: PhaseContext
): Promise<GateCheckResult> {
  const { taskId, iteration, io, thresholds } = ctx;

  try {
    // Dispatch gate check event
    await io.sendEvent(`gate-check-${iteration}`, {
      name: 'cfn.gate.check',
      payload: {
        taskId,
        agentResults,
        mode: ctx.payload.mode,
        iterationNumber: iteration,
      },
    });

    // Calculate gate result
    const gateResult = calculateGateResult(agentResults, thresholds.loop3PassRateThreshold);

    await io.logger.log('Gate check completed', {
      taskId,
      passed: gateResult.passed,
      passRate: gateResult.passRate.toFixed(4),
    });

    return gateResult;
  } catch (error: any) {
    await io.logger.error('Gate check failed', { taskId, iteration, error: error.message });

    // Fallback: fail gate to trigger iteration
    return {
      passed: false,
      passRate: 0,
      threshold: thresholds.loop3PassRateThreshold,
      agentResults,
      reason: `Gate calculation failed: ${error.message}`,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute Loop 2 Phase: Spawn and execute validator agents
 * Responsibility: Validator execution
 * Nesting depth: 2, Lines: ~40
 */
async function executeLoop2Validators(
  agentResults: AgentResult[],
  ctx: PhaseContext
): Promise<ValidatorResult[]> {
  const { taskId, iteration, io, payload, thresholds } = ctx;

  try {
    await io.logger.log('Loop 2 started', { taskId, iteration });

    const validatorTypes = ['code-reviewer', 'qa-engineer', 'security-specialist'].slice(
      0,
      thresholds.validatorCount
    );
    const results: ValidatorResult[] = [];
    const errors: any[] = [];

    // Dispatch spawn events
    for (const validatorType of validatorTypes) {
      await io.sendEvent(`spawn-validator-${validatorType}-${iteration}`, {
        name: 'cfn.agent.run',
        payload: {
          taskId,
          agentType: validatorType,
          description: `Validate Loop 3 implementation: ${payload.description}`,
          successCriteria: payload.successCriteria,
          iterationNumber: iteration,
          previousContext: agentResults,
        },
      });
    }

    // Execute validators
    for (const validatorType of validatorTypes) {
      try {
        const execution = await executeAgent({
          taskId,
          agentType: validatorType,
          context: `Validate Loop 3 implementation: ${payload.description}`,
        });
        results.push(toValidatorResult(execution, validatorType));
      } catch (error: any) {
        await io.logger.error('Validator execution failed', {
          taskId,
          validatorType,
          iteration,
          error: error.message,
        });
        errors.push({ validatorType, error: error.message });
      }
    }

    if (results.length === 0) {
      throw new Error(`All Loop 2 validators failed: ${JSON.stringify(errors)}`);
    }

    await io.logger.log('Loop 2 completed', { taskId, validatorCount: results.length });

    return results;
  } catch (error: any) {
    await io.logger.error('Loop 2 phase failed', { taskId, iteration, error: error.message });
    throw error;
  }
}

/**
 * Collect Consensus: Aggregate validator scores
 * Responsibility: Consensus calculation
 * Nesting depth: 1, Lines: ~20
 */
async function collectConsensus(
  validatorResults: ValidatorResult[],
  ctx: PhaseContext
): Promise<ConsensusResult> {
  const { taskId, iteration, io, thresholds } = ctx;

  try {
    const consensus = calculateConsensus(validatorResults, thresholds.loop2ConsensusThreshold);

    await io.logger.log('Consensus collected', {
      taskId,
      averageScore: consensus.averageScore.toFixed(4),
      consensusMet: consensus.consensusMet,
    });

    return consensus;
  } catch (error: any) {
    await io.logger.error('Consensus calculation failed', { taskId, iteration, error: error.message });

    // Fallback: fail consensus to trigger iteration
    return {
      averageScore: 0,
      validatorResults,
      consensusMet: false,
      threshold: thresholds.loop2ConsensusThreshold,
      summary: `Consensus calculation failed: ${error.message}`,
      consensusAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute Product Owner Decision: Get decision and determine route
 * Responsibility: PO decision and routing logic
 * Nesting depth: 2, Lines: ~35
 */
async function executeProductOwnerDecision(
  consensus: ConsensusResult,
  gateResult: GateCheckResult,
  agentResults: AgentResult[],
  validatorResults: ValidatorResult[],
  ctx: PhaseContext
): Promise<ProductOwnerDecision> {
  const { taskId, iteration, io, payload } = ctx;

  try {
    // Dispatch PO spawn event
    await io.sendEvent(`spawn-product-owner-${iteration}`, {
      name: 'cfn.agent.run',
      payload: {
        taskId,
        agentType: 'product-owner',
        description: `Review implementation and decide: ${payload.description}`,
        successCriteria: payload.successCriteria,
        iterationNumber: iteration,
        previousContext: [...agentResults, ...validatorResults] as any,
      },
    });

    // Parse decision
    const decision = parseProductOwnerDecision(consensus, gateResult);

    await io.logger.log('Product Owner decision made', { taskId, decision: decision.decision });

    return decision;
  } catch (error: any) {
    await io.logger.error('Product Owner decision failed', { taskId, iteration, error: error.message });

    // Fallback: iterate on parsing failure
    return {
      decision: 'ITERATE',
      reasoning: `Decision parsing failed: ${error.message}`,
      decidedAt: new Date().toISOString(),
    };
  }
}

/**
 * CFN Loop Workflow (v2 API)
 *
 * Orchestrates:
 * 1. Spawn Loop 3 implementer agents (fan-out)
 * 2. Gate check: pass rate >= threshold?
 * 3. If gate passes: spawn Loop 2 validators
 * 4. Aggregate consensus scores
 * 5. Spawn Product Owner for decision
 * 6. Route: PROCEED (return), ITERATE (loop), ABORT (throw)
 *
 * Main run() function: 55 lines, handles iteration logic only
 */
export const cfnLoopWorkflow = defineJob({
  id: 'cfn-loop-workflow',
  name: 'CFN Loop Workflow',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.loop.start',
  }),
  run: async (payload: CFNLoopPayload, io, ctx) => {
    const startTime = Date.now();
    const thresholds = getThresholdConfig(payload.mode);

    await io.logger.log('CFN Loop started', {
      taskId: payload.taskId,
      mode: payload.mode,
      description: payload.description.substring(0, 100),
    });

    const state: IterationState = {
      currentIteration: payload.currentIteration || 1,
      allAgentResults: [],
      latestGateCheck: null,
      latestConsensus: null,
      productOwnerDecision: null,
    };

    // Main iteration loop
    while (state.currentIteration <= payload.maxIterations) {
      await io.logger.log('Iteration started', {
        taskId: payload.taskId,
        iteration: state.currentIteration,
      });

      const phaseCtx: PhaseContext = {
        taskId: payload.taskId,
        iteration: state.currentIteration,
        io,
        payload,
        thresholds,
      };

      // Phase 1: Execute Loop 3 agents
      let agentResults: AgentResult[];
      try {
        agentResults = await executeLoop3Agents(phaseCtx);
      } catch (error: any) {
        state.currentIteration++;
        if (state.currentIteration > payload.maxIterations) {
          return buildAbortResult(payload, state.allAgentResults, state.latestGateCheck, startTime, 'All agents failed');
        }
        continue;
      }

      state.allAgentResults = state.allAgentResults.concat(agentResults);

      // Phase 2: Perform gate check
      const gateResult = await performGateCheck(agentResults, phaseCtx);
      state.latestGateCheck = gateResult;

      if (!gateResult.passed) {
        state.currentIteration++;
        if (state.currentIteration > payload.maxIterations) {
          return buildAbortResult(payload, state.allAgentResults, state.latestGateCheck, startTime, 'Max iterations reached');
        }
        await io.logger.log('Gate failed, iterating', {
          taskId: payload.taskId,
          nextIteration: state.currentIteration,
        });
        continue;
      }

      // Phase 3: Execute Loop 2 validators (gate passed)
      let validatorResults: ValidatorResult[];
      try {
        validatorResults = await executeLoop2Validators(agentResults, phaseCtx);
      } catch (error: any) {
        state.currentIteration++;
        if (state.currentIteration > payload.maxIterations) {
          return buildAbortResult(payload, state.allAgentResults, state.latestGateCheck, startTime, 'All validators failed');
        }
        continue;
      }

      // Phase 4: Collect consensus
      const consensus = await collectConsensus(validatorResults, phaseCtx);
      state.latestConsensus = consensus;

      // Phase 5: Get Product Owner decision
      const decision = await executeProductOwnerDecision(
        consensus,
        gateResult,
        agentResults,
        validatorResults,
        phaseCtx
      );
      state.productOwnerDecision = decision;

      // Phase 6: Route based on decision
      if (decision.decision === 'PROCEED') {
        await io.logger.log('CFN Loop completed with PROCEED', { taskId: payload.taskId });
        return buildCompletedResult(
          payload,
          state.allAgentResults,
          state.latestGateCheck,
          state.latestConsensus,
          decision,
          startTime
        );
      }

      if (decision.decision === 'ABORT') {
        await io.logger.log('CFN Loop aborted', {
          taskId: payload.taskId,
          reason: decision.abortReason,
        });
        throw new Error(`CFN Loop aborted: ${decision.abortReason}`);
      }

      // ITERATE: Continue to next iteration
      state.currentIteration++;
      await io.logger.log('Iterating per Product Owner', {
        taskId: payload.taskId,
        nextIteration: state.currentIteration,
      });
    }

    // Max iterations exceeded
    return buildAbortResult(
      payload,
      state.allAgentResults,
      state.latestGateCheck,
      startTime,
      'Max iterations exceeded'
    );
  },
});

function determineAgentTypes(payload: CFNLoopPayload): string[] {
  const types = ['backend-developer'];
  if (payload.description.length > 200) types.push('typescript-specialist');
  if (payload.mode === 'enterprise') types.push('security-specialist');
  return types;
}

function calculateGateResult(agentResults: AgentResult[], threshold: number): GateCheckResult {
  const totalPassed = agentResults.reduce((s, r) => s + r.testResults.passed, 0);
  const totalTests = agentResults.reduce((s, r) => s + r.testResults.total, 0);
  const passRate = totalTests > 0 ? totalPassed / totalTests : 0;
  const passed = passRate >= threshold;

  return {
    passed,
    passRate,
    threshold,
    agentResults,
    reason: passed
      ? `Gate PASSED: ${(passRate * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(1)}%`
      : `Gate FAILED: ${(passRate * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}%`,
    checkedAt: new Date().toISOString(),
  };
}

function calculateConsensus(validatorResults: ValidatorResult[], threshold: number): ConsensusResult {
  const averageScore = validatorResults.reduce((s, r) => s + r.consensusScore, 0) / validatorResults.length;
  return {
    averageScore,
    validatorResults,
    consensusMet: averageScore >= threshold,
    threshold,
    summary: validatorResults.map(v => v.feedback).join('. '),
    consensusAt: new Date().toISOString(),
  };
}

function parseProductOwnerDecision(consensus: ConsensusResult, gateResult: GateCheckResult): ProductOwnerDecision {
  const decision = consensus.consensusMet && gateResult.passed ? 'PROCEED' : 'ITERATE';
  return {
    decision,
    reasoning: consensus.consensusMet
      ? 'All quality gates passed and validators reached consensus'
      : 'Consensus not met, iteration required',
    decidedAt: new Date().toISOString(),
  };
}

function buildCompletedResult(
  payload: CFNLoopPayload,
  allAgentResults: AgentResult[],
  gateCheck: GateCheckResult,
  consensus: ConsensusResult,
  decision: ProductOwnerDecision,
  startTimeMs: number
): CFNLoopResult {
  return {
    taskId: payload.taskId,
    decision: 'COMPLETED',
    iterationsCompleted: payload.currentIteration,
    allAgentResults,
    finalConsensus: consensus,
    finalGateCheck: gateCheck,
    productOwnerDecision: decision,
    executionTimeSeconds: (Date.now() - startTimeMs) / 1000,
    finalPassRate: gateCheck.passRate,
    success: true,
  };
}

function buildAbortResult(
  payload: CFNLoopPayload,
  allAgentResults: AgentResult[],
  gateCheck: GateCheckResult | null,
  startTimeMs: number,
  abortReason: string
): CFNLoopResult {
  return {
    taskId: payload.taskId,
    decision: 'ABORTED',
    iterationsCompleted: payload.currentIteration,
    allAgentResults,
    finalConsensus: {
      averageScore: 0,
      validatorResults: [],
      consensusMet: false,
      threshold: 0.9,
      summary: `Aborted: ${abortReason}`,
      consensusAt: new Date().toISOString(),
    },
    finalGateCheck: gateCheck || {
      passed: false,
      passRate: 0,
      threshold: 0.95,
      agentResults: [],
      reason: abortReason,
      checkedAt: new Date().toISOString(),
    },
    productOwnerDecision: {
      decision: 'ABORT',
      abortReason,
      reasoning: abortReason,
      decidedAt: new Date().toISOString(),
    },
    executionTimeSeconds: (Date.now() - startTimeMs) / 1000,
    finalPassRate: gateCheck?.passRate || 0,
    success: false,
  };
}

export default cfnLoopWorkflow;
