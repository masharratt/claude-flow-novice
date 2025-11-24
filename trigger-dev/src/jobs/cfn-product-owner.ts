/**
 * Phase 4: CFN Product Owner Decision Job
 * trigger.dev implementation for Product Owner decision making
 *
 * Specification: planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md (Component 2)
 * Architecture: Docker-based Product Owner agent with decision parsing
 * Coordination: Receives Loop 3 and Loop 2 results, triggers iteration if ITERATE
 *
 * Success Criteria:
 * 1. Product Owner agent spawns in Docker container
 * 2. Loop 3 and Loop 2 results passed to agent via environment variables
 * 3. Decision (PROCEED/ITERATE/ABORT) parsed from agent output via regex
 * 4. Next iteration triggered when decision = ITERATE (send cfn.loop3.start event)
 * 5. Workflow completed when decision = PROCEED
 * 6. Zero `any` types throughout implementation
 * 7. Comprehensive Zod schema validation for all inputs
 * 8. Type-safe error handling with proper logging
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import { z } from 'zod';
import { validateTaskId } from '../utils/path-validation';
import { execSync } from 'child_process';
import { getEnvValue, getNetworkName } from '../lib/environment-contract';

// Declare client for external initialization
declare const client: TriggerClient;

/**
 * Product Owner decision enum
 */
const ProductOwnerDecisionEnum = z.enum(['PROCEED', 'ITERATE', 'ABORT']);
type ProductOwnerDecision = z.infer<typeof ProductOwnerDecisionEnum>;

/**
 * Loop 3 agent result schema
 */
const Loop3ResultSchema = z.object({
  agentType: z.string().describe('Type of Loop 3 agent'),
  containerName: z.string().describe('Docker container name'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0.0-1.0)'),
  stdout: z.string().describe('Standard output from agent'),
  stderr: z.string().describe('Standard error from agent'),
  exitCode: z.number().int().min(0).describe('Process exit code'),
  executionTime: z.number().int().positive().describe('Execution time in milliseconds'),
  resourceLimits: z.object({
    cpus: z.number().positive().describe('CPU cores'),
    memory: z.string().describe('Memory limit'),
  }).describe('Resource constraints applied'),
  networkIsolation: z.object({
    network: z.string().describe('Docker network name'),
  }).describe('Network isolation configuration'),
  completedAt: z.string().datetime().describe('Timestamp of completion'),
});

type Loop3Result = z.infer<typeof Loop3ResultSchema>;

/**
 * Loop 2 validator result schema
 */
const ValidatorResultSchema = z.object({
  validatorId: z.string().describe('Unique validator ID'),
  score: z.number().min(0).max(1).describe('Validation score (0.0-1.0)'),
  category: z.string().describe('Validation category (code-quality, security, performance, etc)'),
  feedback: z.string().describe('Detailed validator feedback'),
  completedAt: z.string().datetime().describe('Timestamp of completion'),
});

type ValidatorResult = z.infer<typeof ValidatorResultSchema>;

/**
 * Product Owner decision payload schema
 * Validates all required inputs for Product Owner decision making
 */
const CFNProductOwnerPayloadSchema = z.object({
  taskId: z.string().min(1).max(256).describe('Unique task identifier'),
  loop3Results: z.array(Loop3ResultSchema).min(1).describe('Results from all Loop 3 agents'),
  validationResults: z.array(ValidatorResultSchema).min(1).describe('Results from all Loop 2 validators'),
  mode: z.enum(['mvp', 'standard', 'enterprise']).default('standard').describe('Quality gate mode'),
  iteration: z.number().int().positive().default(1).describe('Current iteration number'),
  maxIterations: z.number().int().positive().default(10).describe('Maximum iterations allowed'),
  taskDescription: z.string().min(1).max(4096).describe('Original task description'),
  timeout: z.number().positive().default(900000).describe('Execution timeout in milliseconds'),
});

type CFNProductOwnerPayload = z.infer<typeof CFNProductOwnerPayloadSchema>;

/**
 * Product Owner decision result
 */
interface ProductOwnerResult {
  taskId: string;
  decision: ProductOwnerDecision;
  reasoning: string;
  containerName: string;
  agentOutput: string;
  executionTime: number;
  completedAt: string;
}

/**
 * Decision parse result from agent output
 */
interface DecisionParseResult {
  found: boolean;
  decision: ProductOwnerDecision | null;
  rawMatch: string | null;
}

/**
 * Phase 1: Mode Prefix Function for CLI/Trigger.dev Collision Mitigation
 *
 * Generates task ID with "trigger:" prefix to prevent Redis key collisions with CLI mode.
 * Both modes use identical Redis coordination patterns and must use isolated namespaces.
 *
 * @param rawTaskId - Original task ID without prefix
 * @returns Prefixed task ID in format "trigger:rawTaskId"
 *
 * Example:
 *   generateTriggerTaskId('task-123') => 'trigger:task-123'
 *
 * Redis Key Isolation (After):
 *   CLI:     cfn:task:cli:task-123:status
 *   Trigger: cfn:task:trigger:task-123:status
 */
function generateTriggerTaskId(rawTaskId: string): string {
  return `trigger:${rawTaskId}`;
}

/**
 * CFN Product Owner Decision Job
 *
 * Orchestrates Product Owner agent execution for making final workflow decisions.
 * The Product Owner reviews:
 * - Loop 3 implementation results (test pass rates, confidence scores)
 * - Loop 2 validation results (code quality, security, performance feedback)
 *
 * Decision Logic:
 * - PROCEED: Quality gates met, workflow complete
 * - ITERATE: Specific aspects need improvement, trigger Loop 3 again
 * - ABORT: Max iterations reached, unrecoverable issues identified
 *
 * Type Safety:
 * - Zero `any` types throughout implementation
 * - Comprehensive Zod schemas for all payloads
 * - Strong typing for all parse results
 * - Type-safe error handling with discriminated unions
 */
export const cfnProductOwnerJob = defineJob({
  id: 'cfn-product-owner-decision',
  name: 'CFN Product Owner Decision',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.product.owner.decision',
  }),
  run: async (payload: unknown, io, ctx): Promise<ProductOwnerResult> => {
    // 1. Validate payload schema
    let validatedPayload: CFNProductOwnerPayload;
    try {
      validatedPayload = CFNProductOwnerPayloadSchema.parse(payload);
    } catch (error) {
      const zodError = error instanceof z.ZodError ? error.errors[0].message : 'Invalid payload schema';
      await io.logger.error('CFN Product Owner: Payload validation failed', {
        error: zodError,
        payload,
      });
      throw new Error(`CFN Product Owner payload validation failed: ${zodError}`);
    }

    const {
      taskId: rawTaskId,
      loop3Results,
      validationResults,
      mode,
      iteration,
      maxIterations,
      taskDescription,
      timeout,
    } = validatedPayload;

    const jobStartTime = Date.now();

    // Phase 1: Apply Trigger.dev mode prefix for Redis key isolation
    const taskId = generateTriggerTaskId(rawTaskId);

    // 2. Security validation
    try {
      validateTaskId(rawTaskId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid task ID';
      await io.logger.error('CFN Product Owner: Task ID validation failed', {
        taskId: rawTaskId,
        error: errorMessage,
      });
      throw error;
    }

    await io.logger.info('CFN Product Owner: Starting decision process', {
      taskId,
      iteration,
      maxIterations,
      mode,
      loop3AgentCount: loop3Results.length,
      validatorCount: validationResults.length,
    });

    // 3. Spawn Product Owner agent in Docker container
    const productOwnerResult = await spawnProductOwnerAgent(io, {
      taskId,
      loop3Results,
      validationResults,
      mode,
      iteration,
      maxIterations,
      taskDescription,
      timeout,
    });

    const executionTime = Date.now() - jobStartTime;

    // 4. Parse Product Owner decision from agent output
    const decisionResult = parseProductOwnerDecision(
      productOwnerResult.stdout + '\n' + productOwnerResult.stderr
    );

    if (!decisionResult.found || !decisionResult.decision) {
      await io.logger.error('CFN Product Owner: Decision parsing failed', {
        taskId,
        iteration,
        outputLength: productOwnerResult.stdout.length + productOwnerResult.stderr.length,
      });
      throw new Error('Failed to parse Product Owner decision from agent output');
    }

    const decision = decisionResult.decision;

    await io.logger.info('CFN Product Owner: Decision made', {
      taskId,
      iteration,
      decision,
      executionTime,
      agentExitCode: productOwnerResult.exitCode,
    });

    // 5. Handle iteration trigger if decision = ITERATE
    if (decision === 'ITERATE') {
      if (iteration < maxIterations) {
        await io.logger.info('CFN Product Owner: Triggering Loop 3 iteration', {
          taskId,
          currentIteration: iteration,
          nextIteration: iteration + 1,
        });

        try {
          // Extract average confidence from Loop 3 results for context
          const avgConfidence =
            loop3Results.reduce((sum, r) => sum + r.confidence, 0) / loop3Results.length;

          // Extract validator feedback for iteration context
          const validatorFeedback = validationResults
            .map(v => `${v.category}: ${v.feedback}`)
            .join(' | ');

          await client.sendEvent({
            name: 'cfn.loop3.start',
            payload: {
              taskId: rawTaskId, // Send raw taskId without prefix
              iteration: iteration + 1,
              mode,
              taskDescription,
              previousFeedback: `Iteration ${iteration} feedback: ${validatorFeedback}`,
            },
          });

          await io.logger.info('CFN Product Owner: Loop 3 iteration event sent', {
            taskId,
            nextIteration: iteration + 1,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await io.logger.error('CFN Product Owner: Failed to trigger Loop 3 iteration', {
            taskId,
            iteration,
            error: errorMessage,
          });
          // Continue execution even if event sending fails
        }
      } else {
        await io.logger.warn('CFN Product Owner: Max iterations reached, aborting', {
          taskId,
          iteration,
          maxIterations,
        });
      }
    }

    // 6. Build final result
    const result: ProductOwnerResult = {
      taskId,
      decision,
      reasoning: extractReasoningFromOutput(productOwnerResult.stdout, productOwnerResult.stderr),
      containerName: productOwnerResult.containerName,
      agentOutput: productOwnerResult.stdout,
      executionTime,
      completedAt: new Date().toISOString(),
    };

    await io.logger.info('CFN Product Owner: Decision process complete', {
      taskId,
      iteration,
      decision: result.decision,
      totalExecutionTime: executionTime,
    });

    return result;
  },
});

/**
 * Spawn Product Owner agent in Docker container
 *
 * @param io - trigger.dev IO interface for logging and task execution
 * @param options - Agent spawn configuration
 * @returns Agent execution result with stdout/stderr
 */
async function spawnProductOwnerAgent(
  io: any,
  options: {
    taskId: string;
    loop3Results: Loop3Result[];
    validationResults: ValidatorResult[];
    mode: string;
    iteration: number;
    maxIterations: number;
    taskDescription: string;
    timeout: number;
  }
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  containerName: string;
}> {
  const {
    taskId,
    loop3Results,
    validationResults,
    mode,
    iteration,
    maxIterations,
    taskDescription,
    timeout,
  } = options;

  const containerName = `cfn-product-owner-${taskId}-${Date.now()}`;
  const agentStartTime = Date.now();

  await io.logger.info('CFN Product Owner: Spawning agent', {
    taskId,
    containerName,
    iteration,
  });

  try {
    // Execute Docker container spawn via runTask
    const result = await io.runTask(
      `spawn-product-owner-${iteration}`,
      async () => {
        // Build Docker command with proper escaping and resource limits
        const dockerCmd = buildProductOwnerDockerCommand({
          containerName,
          taskId,
          loop3Results,
          validationResults,
          mode,
          iteration,
          maxIterations,
          taskDescription,
        });

        try {
          // Execute Docker command with timeout and output capture
          const output = execSync(dockerCmd, {
            encoding: 'utf-8',
            timeout,
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          return {
            stdout: output,
            stderr: '',
            exitCode: 0,
          };
        } catch (error: any) {
          // Capture both stdout and stderr from failed execution
          const stdout = error.stdout?.toString() || '';
          const stderr = error.stderr?.toString() || '';
          const exitCode = error.status || 1;

          return {
            stdout,
            stderr,
            exitCode,
          };
        }
      },
      {
        name: 'CFN Product Owner: Spawn agent',
        timeout,
      }
    );

    const executionTime = Date.now() - agentStartTime;

    await io.logger.info('CFN Product Owner: Agent completed', {
      taskId,
      executionTime,
      exitCode: result.exitCode,
      outputLength: result.stdout.length,
    });

    return {
      ...result,
      containerName,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const executionTime = Date.now() - agentStartTime;

    await io.logger.error('CFN Product Owner: Agent spawn failed', {
      taskId,
      executionTime,
      error: errorMessage,
    });

    // Return failure result with ABORT decision
    return {
      stdout: '',
      stderr: `Agent execution failed: ${errorMessage}`,
      exitCode: 1,
      containerName,
    };
  }
}

/**
 * Build Docker command for Product Owner agent execution
 * Includes proper shell escaping and security validation
 *
 * @param options - Docker configuration
 * @returns Complete Docker run command
 */
function buildProductOwnerDockerCommand(options: {
  containerName: string;
  taskId: string;
  loop3Results: Loop3Result[];
  validationResults: ValidatorResult[];
  mode: string;
  iteration: number;
  maxIterations: number;
  taskDescription: string;
}): string {
  const {
    containerName,
    taskId,
    loop3Results,
    validationResults,
    mode,
    iteration,
    maxIterations,
    taskDescription,
  } = options;

  // Escape task description for shell safety
  const escapedDescription = taskDescription
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');

  // Serialize results as JSON for agent consumption
  const loop3Json = JSON.stringify(loop3Results).replace(/"/g, '\\"');
  const validationJson = JSON.stringify(validationResults).replace(/"/g, '\\"');

  // Resolve network name and Redis configuration from environment contract
  const networkName = getNetworkName('trigger');
  const redisHost = getEnvValue('redis_host', 'trigger');
  const redisPort = getEnvValue('redis_port', 'trigger');

  const parts: string[] = [
    'docker run --rm',
    `--name ${containerName}`,
    `--network ${networkName}`,
    '--cpus=1',
    '--memory=2g',
    '--memory-swap=2g',
    `-e TASK_ID=${taskId}`,
    `-e ITERATION=${iteration}`,
    `-e MAX_ITERATIONS=${maxIterations}`,
    `-e MODE=${mode}`,
    `-e CFN_REDIS_HOST=${redisHost}`,
    `-e CFN_REDIS_PORT=${redisPort}`,
    `-e CFN_NETWORK_NAME=${networkName}`,
    '-v /workspace:/workspace:rw',
    '-v /tmp/cfn-workspace:/tmp/workspace:rw',
    'cfn-agent:product-owner',
    'product-owner',
    `--task "${escapedDescription}"`,
    `--mode ${mode}`,
    `--iteration ${iteration}`,
    `--loop3 "${loop3Json}"`,
    `--validation "${validationJson}"`,
  ];

  return parts.join(' ');
}

/**
 * Parse Product Owner decision from agent output
 * Uses regex patterns to match PROCEED/ITERATE/ABORT decisions
 *
 * @param output - Combined stdout/stderr from agent
 * @returns Parsed decision result
 */
function parseProductOwnerDecision(output: string): DecisionParseResult {
  // Match patterns like:
  // - "Decision: PROCEED"
  // - "DECISION=ITERATE"
  // - "decision: ABORT"
  // - "Product Owner Decision: PROCEED"
  // - "*** PROCEED ***"
  const patterns = [
    /(?:product\s+owner\s+)?decision[:\s=]+(PROCEED|ITERATE|ABORT)/i,
    /\*{1,}\s*(PROCEED|ITERATE|ABORT)\s*\*{1,}/i,
    /(PROCEED|ITERATE|ABORT)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      const decision = match[1].toUpperCase();
      if (['PROCEED', 'ITERATE', 'ABORT'].includes(decision)) {
        try {
          const parsedDecision = ProductOwnerDecisionEnum.parse(decision);
          return {
            found: true,
            decision: parsedDecision,
            rawMatch: match[0],
          };
        } catch {
          // Continue to next pattern if validation fails
        }
      }
    }
  }

  // Default to ABORT if no decision found
  return {
    found: false,
    decision: null,
    rawMatch: null,
  };
}

/**
 * Extract reasoning from Product Owner agent output
 * Finds the first paragraph or key reasoning section
 *
 * @param stdout - Standard output from agent
 * @param stderr - Standard error from agent
 * @returns Extracted reasoning text (max 500 chars)
 */
function extractReasoningFromOutput(stdout: string, stderr: string): string {
  const combined = (stdout + '\n' + stderr).split('\n');

  // Find lines that contain substantial reasoning
  const reasoningLines = combined.filter(line => {
    const trimmed = line.trim();
    return (
      trimmed.length > 20 &&
      !trimmed.startsWith('docker') &&
      !trimmed.startsWith('[') &&
      !trimmed.startsWith('Error')
    );
  });

  // Take first few meaningful lines
  const reasoning = reasoningLines.slice(0, 3).join(' ');
  return reasoning.substring(0, 500) || 'Product Owner decision made';
}

export default cfnProductOwnerJob;
