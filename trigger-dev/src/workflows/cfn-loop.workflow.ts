/**
 * CFN Loop Workflow
 * Complete orchestration of CFN Loop: Spawn agents, validate gates, collect consensus
 */

import { workflow, logger } from '@trigger.dev/sdk/v3';
import {
  CFNLoopPayload,
  CFNLoopResult,
  AgentResult,
  ValidatorResult,
  ConsensusResult,
  SuccessCriteria,
  getThresholdConfig,
  Loop3JobPayload,
  Loop2JobPayload,
  ProductOwnerJobPayload,
} from '../types/cfn-types';
import { triggerLoop3Agent } from '../jobs/loop3-agent.job';
import { triggerGateCheck } from '../jobs/gate-check.job';
import { triggerLoop2Validator } from '../jobs/loop2-validator.job';
import { triggerProductOwnerDecision } from '../jobs/product-owner.job';

/**
 * CFN Loop Workflow
 *
 * Orchestrates complete CFN Loop execution:
 * 1. Spawn N Loop 3 implementer agents in parallel (fan-out)
 * 2. Wait for all agents to complete
 * 3. Execute gate check: pass rate >= threshold?
 *    - If FAIL: iterate Loop 3 (wake agents for round N+1)
 *    - If PASS: continue to Loop 2
 * 4. Spawn M Loop 2 validators in parallel (fan-out)
 * 5. Wait for all validators to complete
 * 6. Aggregate consensus scores
 * 7. Spawn Product Owner for final decision
 * 8. Execute decision: PROCEED/ITERATE/ABORT
 *
 * Type-Safe Execution:
 * - Strong typing for all job payloads
 * - Type-safe agent result aggregation
 * - Discriminated union for decisions
 * - Complete audit trail with timestamps
 *
 * TODO: RUNTIME_TEST - Verify complete workflow execution end-to-end
 * TODO: RUNTIME_TEST - Verify iteration looping when gate fails
 * TODO: RUNTIME_TEST - Verify agent result aggregation accuracy
 * TODO: RUNTIME_TEST - Verify consensus calculation correctness
 * TODO: RUNTIME_TEST - Verify all timeout and error cases
 */
export const cfnLoopWorkflow = workflow({
  id: 'cfn-loop-workflow',
  run: async (payload: CFNLoopPayload): Promise<CFNLoopResult> => {
    const startTime = Date.now();

    logger.log('CFN Loop workflow started', {
      taskId: payload.taskId,
      mode: payload.mode,
      description: payload.description.substring(0, 100),
      iteration: payload.currentIteration,
    });

    // Initialize tracking
    let currentIteration = payload.currentIteration || 1;
    let allAgentResults: AgentResult[] = [];
    let latestGateCheck = null as any;
    let latestConsensus = null as any;

    const thresholds = getThresholdConfig(payload.mode);

    // LOOP: Iterate until decision or max iterations
    while (currentIteration <= payload.maxIterations) {
      logger.log('CFN Loop iteration started', {
        taskId: payload.taskId,
        iteration: currentIteration,
      });

      // LOOP 3: Spawn implementer agents
      const loop3Results = await executeLoop3(
        payload,
        currentIteration,
        allAgentResults
      );

      logger.log('Loop 3 agents completed', {
        taskId: payload.taskId,
        iteration: currentIteration,
        agentCount: loop3Results.length,
        averagePassRate: (
          loop3Results.reduce((sum, r) => sum + r.testResults.passRate, 0) /
          loop3Results.length
        ).toFixed(4),
      });

      allAgentResults = allAgentResults.concat(loop3Results);

      // GATE CHECK: Validate test pass rates
      const gateCheckResult = await executeGateCheck(
        payload,
        loop3Results
      );

      logger.log('Gate check result', {
        taskId: payload.taskId,
        iteration: currentIteration,
        passed: gateCheckResult.passed,
        passRate: gateCheckResult.passRate.toFixed(4),
      });

      latestGateCheck = gateCheckResult;

      // Decision: Gate failed?
      if (!gateCheckResult.passed) {
        currentIteration++;

        if (currentIteration > payload.maxIterations) {
          // Max iterations reached, abort
          logger.log('Max iterations reached, aborting', {
            taskId: payload.taskId,
            iteration: currentIteration,
            passRate: gateCheckResult.passRate.toFixed(4),
          });

          return buildAbortResult(
            payload,
            allAgentResults,
            latestGateCheck,
            startTime,
            'Max iterations reached'
          );
        }

        logger.log('Gate failed, iterating Loop 3', {
          taskId: payload.taskId,
          iteration: currentIteration,
          reason: gateCheckResult.reason,
        });

        continue; // Next iteration of Loop 3
      }

      // GATE PASSED: Continue to Loop 2
      logger.log('Gate passed, proceeding to Loop 2', {
        taskId: payload.taskId,
        iteration: currentIteration,
        passRate: gateCheckResult.passRate.toFixed(4),
      });

      // LOOP 2: Spawn validator agents
      const validatorResults = await executeLoop2(
        payload,
        currentIteration,
        loop3Results,
        gateCheckResult
      );

      logger.log('Loop 2 validators completed', {
        taskId: payload.taskId,
        iteration: currentIteration,
        validatorCount: validatorResults.length,
        averageConsensus: (
          validatorResults.reduce((sum, r) => sum + r.consensusScore, 0) /
          validatorResults.length
      ).toFixed(4),
      });

      // Aggregate consensus
      const consensusResult = aggregateConsensus(
        validatorResults,
        thresholds
      );

      latestConsensus = consensusResult;

      logger.log('Consensus aggregated', {
        taskId: payload.taskId,
        iteration: currentIteration,
        averageScore: consensusResult.averageScore.toFixed(4),
        threshold: thresholds.loop2ConsensusThreshold.toFixed(4),
        consensusMet: consensusResult.consensusMet,
      });

      // PRODUCT OWNER: Make final decision
      const decision = await executeProductOwnerDecision(
        payload,
        consensusResult,
        gateCheckResult,
        currentIteration,
        payload.maxIterations
      );

      logger.log('Product Owner decision', {
        taskId: payload.taskId,
        iteration: currentIteration,
        decision: decision.decision,
      });

      // Handle decision
      if (decision.decision === 'PROCEED') {
        logger.log('CFN Loop completed with PROCEED', {
          taskId: payload.taskId,
          iteration: currentIteration,
        });

        return buildCompletedResult(
          payload,
          allAgentResults,
          latestGateCheck,
          latestConsensus,
          decision,
          startTime
        );
      }

      if (decision.decision === 'ABORT') {
        logger.log('CFN Loop aborted', {
          taskId: payload.taskId,
          iteration: currentIteration,
          reason: decision.abortReason,
        });

        return buildAbortResult(
          payload,
          allAgentResults,
          latestGateCheck,
          startTime,
          decision.abortReason || 'Product Owner decision'
        );
      }

      // ITERATE: Continue to next iteration
      if (decision.decision === 'ITERATE') {
        currentIteration++;
        logger.log('Product Owner requested iteration', {
          taskId: payload.taskId,
          iteration: currentIteration,
          focus: decision.iterationFocus,
        });

        continue;
      }
    }

    // Fallback: Max iterations
    logger.log('CFN Loop timeout - max iterations exceeded', {
      taskId: payload.taskId,
      iterations: currentIteration,
    });

    return buildAbortResult(
      payload,
      allAgentResults,
      latestGateCheck,
      startTime,
      'Max iterations exceeded'
    );
  },
});

/**
 * Execute Loop 3: Spawn implementer agents in parallel
 *
 * TODO: RUNTIME_TEST - Verify parallel spawning of N agents
 * TODO: RUNTIME_TEST - Verify all agents complete before proceeding
 */
async function executeLoop3(
  payload: CFNLoopPayload,
  iteration: number,
  previousResults: AgentResult[]
): Promise<AgentResult[]> {
  const thresholds = getThresholdConfig(payload.mode);

  // Determine which agents to spawn
  const agentTypes = determineAgentTypes(payload, iteration);

  logger.log('Spawning Loop 3 agents', {
    taskId: payload.taskId,
    iteration,
    agentCount: agentTypes.length,
  });

  // Create job payloads for each agent
  const jobPayloads: Loop3JobPayload[] = agentTypes.map((agentType) => ({
    taskId: payload.taskId,
    agentType,
    description: payload.description,
    successCriteria: payload.successCriteria,
    iterationNumber: iteration,
    previousContext: previousResults,
  }));

  // Trigger all agents in parallel (fan-out pattern)
  // TODO: RUNTIME_TEST - Verify batchTrigger or Promise.all
  const agentPromises = jobPayloads.map((jobPayload) =>
    triggerLoop3Agent(jobPayload)
  );

  const results = await Promise.all(agentPromises);

  return results;
}

/**
 * Execute gate check: Validate test pass rates
 */
async function executeGateCheck(
  payload: CFNLoopPayload,
  agentResults: AgentResult[]
) {
  const result = await triggerGateCheck({
    taskId: payload.taskId,
    agentResults,
    mode: payload.mode,
    iterationNumber: payload.currentIteration,
  });

  return result;
}

/**
 * Execute Loop 2: Spawn validators in parallel
 *
 * TODO: RUNTIME_TEST - Verify parallel spawning of M validators
 * TODO: RUNTIME_TEST - Verify all validators complete before aggregating
 */
async function executeLoop2(
  payload: CFNLoopPayload,
  iteration: number,
  agentResults: AgentResult[],
  gateCheckResult: any
): Promise<ValidatorResult[]> {
  const thresholds = getThresholdConfig(payload.mode);

  logger.log('Spawning Loop 2 validators', {
    taskId: payload.taskId,
    iteration,
    validatorCount: thresholds.validatorCount,
  });

  // Create job payloads for each validator
  const jobPayloads: Loop2JobPayload[] = Array.from(
    { length: thresholds.validatorCount },
    (_, index) => ({
      taskId: payload.taskId,
      validatorType: selectValidatorType(index),
      loop3Results: agentResults,
      gateResult: gateCheckResult,
      description: payload.description,
      iterationNumber: iteration,
    })
  );

  // Trigger all validators in parallel (fan-out pattern)
  const validatorPromises = jobPayloads.map((jobPayload) =>
    triggerLoop2Validator(jobPayload)
  );

  const results = await Promise.all(validatorPromises);

  return results;
}

/**
 * Execute Product Owner decision
 */
async function executeProductOwnerDecision(
  payload: CFNLoopPayload,
  consensus: ConsensusResult,
  gateCheck: any,
  iteration: number,
  maxIterations: number
) {
  const result = await triggerProductOwnerDecision({
    taskId: payload.taskId,
    consensusResult: consensus,
    gateCheckResult: gateCheck,
    mode: payload.mode,
    iterationNumber: iteration,
    maxIterations,
  });

  return result;
}

/**
 * Determine which agent types to spawn
 *
 * In production, this would read from success criteria metadata
 * For now, use sensible defaults based on task type.
 */
function determineAgentTypes(
  payload: CFNLoopPayload,
  iteration: number
): string[] {
  // Always spawn at least one implementer
  const types = ['backend-developer'];

  // For non-trivial tasks, add more specialists
  if (payload.description.length > 200) {
    if (!types.includes('typescript-specialist')) {
      types.push('typescript-specialist');
    }
  }

  // For quality-focused modes, add more agents
  if (payload.mode === 'enterprise') {
    if (!types.includes('security-specialist')) {
      types.push('security-specialist');
    }
  }

  return types;
}

/**
 * Select validator type by index
 */
function selectValidatorType(index: number): string {
  const validators = [
    'code-reviewer',
    'qa-engineer',
    'security-specialist',
    'architecture-reviewer',
    'performance-analyst',
  ];

  return validators[index % validators.length];
}

/**
 * Aggregate consensus from validators
 */
function aggregateConsensus(
  validatorResults: ValidatorResult[],
  thresholds: ReturnType<typeof getThresholdConfig>
): ConsensusResult {
  const averageScore =
    validatorResults.reduce((sum, r) => sum + r.consensusScore, 0) /
    validatorResults.length;

  const allIssues = validatorResults.flatMap((v) => v.issues || []);
  const blockingIssues = allIssues.filter((issue) =>
    issue.toLowerCase().includes('critical')
  );

  return {
    averageScore,
    validatorResults,
    consensusMet: averageScore >= thresholds.loop2ConsensusThreshold,
    threshold: thresholds.loop2ConsensusThreshold,
    summary: validatorResults
      .map((v) => v.feedback)
      .slice(0, 2)
      .join('. '),
    blockingIssues: blockingIssues.length > 0 ? blockingIssues : undefined,
    consensusAt: new Date().toISOString(),
  };
}

/**
 * Build completed result
 */
function buildCompletedResult(
  payload: CFNLoopPayload,
  allAgentResults: AgentResult[],
  gateCheck: any,
  consensus: ConsensusResult,
  decision: any,
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

/**
 * Build abort result
 */
function buildAbortResult(
  payload: CFNLoopPayload,
  allAgentResults: AgentResult[],
  gateCheck: any,
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
      summary: `Loop aborted: ${abortReason}`,
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

/**
 * Trigger CFN Loop workflow
 *
 * @param payload CFN Loop payload
 * @returns CFN Loop result
 *
 * TODO: RUNTIME_TEST - Verify workflow completes successfully
 * TODO: RUNTIME_TEST - Verify all job triggering and waiting
 * TODO: RUNTIME_TEST - Verify error propagation
 */
export async function triggerCFNLoop(
  payload: CFNLoopPayload
): Promise<CFNLoopResult> {
  const result = await cfnLoopWorkflow.trigger(payload);
  return result;
}
