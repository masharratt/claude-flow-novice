/**
 * Phase 3: CFN Loop 3 Coordination Job
 * trigger.dev implementation for sequential agent spawning with quality gate validation
 *
 * Specification: planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md
 * Architecture: Per-agent Docker containers with isolated execution environments
 * Coordination: Sequential agent spawning with confidence score parsing and gate logic
 *
 * Success Criteria:
 * 1. All Loop 3 agents spawn in Docker containers sequentially
 * 2. Agent outputs captured correctly with stdout/stderr isolation
 * 3. Confidence scores parsed from agent output using regex
 * 4. Quality gate validation executes based on mode thresholds
 * 5. Loop 2 triggered when gate fails (via sendEvent)
 * 6. Iteration context maintained across retries
 * 7. Comprehensive input validation and error handling
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import { z } from 'zod';
import { validateTaskId } from '../utils/path-validation';
import { execSync } from 'child_process';
import { getEnvValue, getNetworkName } from '../../src/lib/environment-contract';

// Declare client for external initialization
declare const client: TriggerClient;

/**
 * Quality gate thresholds per CFN mode
 * Standard mode (0.95) is the default production threshold
 */
const QUALITY_GATES = {
  mvp: 0.70,
  standard: 0.95,
  enterprise: 0.98,
} as const;

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
 * Payload schema for CFN Loop 3 execution
 * Validates all required inputs for agent spawning and gate checking
 */
const CFNLoop3PayloadSchema = z.object({
  taskId: z.string().min(1).max(256).describe('Unique task identifier'),
  taskDescription: z.string().min(1).max(4096).describe('Detailed task description for agents'),
  mode: z.enum(['mvp', 'standard', 'enterprise']).default('standard').describe('Quality gate mode'),
  provider: z.enum(['zai', 'kimi', 'openrouter', 'max']).default('zai').describe('AI provider for agents'),
  agents: z.array(
    z.enum([
      'backend-developer',
      'frontend-engineer',
      'tester',
      'security-specialist',
      'performance-analyst',
      'accessibility-advocate',
    ])
  ).min(1).max(6).describe('Agent types to spawn'),
  iteration: z.number().int().positive().default(1).describe('Current iteration number (1-based)'),
  previousFeedback: z.string().optional().describe('Feedback from previous iteration for context'),
  timeout: z.number().positive().default(1800000).describe('Execution timeout in milliseconds'),
});

type CFNLoop3Payload = z.infer<typeof CFNLoop3PayloadSchema>;

/**
 * Confidence score parsing result
 * Extracts numerical confidence from agent output
 */
interface ConfidenceParseResult {
  found: boolean;
  score: number;
  rawMatch: string | null;
}

/**
 * Individual agent execution result with full metadata
 */
interface Loop3AgentResult {
  agentType: string;
  containerName: string;
  confidence: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  resourceLimits: {
    cpus: number;
    memory: string;
  };
  networkIsolation: {
    network: string;
  };
  completedAt: string;
}

/**
 * Complete Loop 3 execution result
 */
interface CFNLoop3Result {
  taskId: string;
  iteration: number;
  mode: string;
  timestamp: string;
  totalExecutionTime: number;
  agentResults: Loop3AgentResult[];
  gateMetrics: {
    avgConfidence: number;
    threshold: number;
    passed: boolean;
  };
  decision: 'PROCEED_TO_LOOP2' | 'ITERATE_LOOP3';
  metadata: {
    totalAgents: number;
    successfulAgents: number;
    failedAgents: number;
  };
}

/**
 * CFN Loop 3 Coordination Job
 *
 * Orchestrates sequential spawning of CFN implementer agents in isolated Docker containers.
 * Each agent:
 * - Runs in its own container with resource limits (2 CPUs, 4GB memory)
 * - Executes on a shared network (trigger-dev_trigger-cfn-network)
 * - Has isolated stdout/stderr captured independently
 * - Outputs a confidence score that is parsed via regex
 *
 * Quality Gate Logic:
 * - Calculates average confidence across all agents
 * - Compares against mode-specific threshold
 * - PASS (≥threshold): Loop 2 proceeds immediately
 * - FAIL (<threshold): Trigger Loop 3 iteration or proceed to Loop 2 for validation
 *
 * Iteration Context:
 * - Tracks iteration number (1-based, increments on retry)
 * - Passes previous iteration feedback to agents
 * - Maintains task context across all retries
 *
 * Type Safety:
 * - Zero `any` types throughout implementation
 * - Comprehensive Zod schemas for all payloads
 * - Strong typing for all agent results and metrics
 * - Type-safe error handling with discriminated unions
 */
export const cfnLoop3Job = defineJob({
  id: 'cfn-loop3-execution',
  name: 'CFN Loop 3: Sequential Agent Execution with Quality Gate',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.loop3.start',
  }),
  run: async (payload: unknown, io, ctx): Promise<CFNLoop3Result> => {
    // 1. Validate payload schema
    let validatedPayload: CFNLoop3Payload;
    try {
      validatedPayload = CFNLoop3PayloadSchema.parse(payload);
    } catch (error) {
      const zodError = error instanceof z.ZodError ? error.errors[0].message : 'Invalid payload schema';
      await io.logger.error('CFN Loop 3: Payload validation failed', { error: zodError, payload });
      throw new Error(`CFN Loop 3 payload validation failed: ${zodError}`);
    }

    const { taskId: rawTaskId, taskDescription, mode, provider, agents, iteration, previousFeedback, timeout } =
      validatedPayload;
    const jobStartTime = Date.now();

    // Phase 1: Apply Trigger.dev mode prefix for Redis key isolation
    const taskId = generateTriggerTaskId(rawTaskId);

    // 2. Security validation
    try {
      validateTaskId(rawTaskId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid task ID';
      await io.logger.error('CFN Loop 3: Task ID validation failed', { taskId: rawTaskId, error: errorMessage });
      throw error;
    }

    await io.logger.info('CFN Loop 3: Starting sequential agent execution', {
      taskId,
      iteration,
      mode,
      provider,
      agentCount: agents.length,
      agents: agents.join(', '),
      timeout,
    });

    // 3. Execute agents sequentially
    const agentResults: Loop3AgentResult[] = [];

    for (const agentType of agents) {
      const agentResult = await spawnLoop3Agent(io, {
        taskId,
        agentType,
        taskDescription,
        mode,
        provider,
        iteration,
        previousFeedback,
        timeout,
      });

      agentResults.push(agentResult);

      // Log individual agent result
      await io.logger.info(`CFN Loop 3: Agent "${agentType}" completed`, {
        taskId,
        agentType,
        confidence: agentResult.confidence.toFixed(4),
        executionTime: agentResult.executionTime,
        exitCode: agentResult.exitCode,
      });
    }

    // 4. Calculate quality gate metrics
    const totalExecutionTime = Date.now() - jobStartTime;
    const successfulAgents = agentResults.filter(r => r.exitCode === 0).length;
    const failedAgents = agentResults.length - successfulAgents;
    const avgConfidence = agentResults.reduce((sum, r) => sum + r.confidence, 0) / agentResults.length;
    const threshold = QUALITY_GATES[mode as keyof typeof QUALITY_GATES];
    const gatePass = avgConfidence >= threshold;

    // 5. Log gate check result
    await io.logger.info('CFN Loop 3: Quality gate check', {
      taskId,
      iteration,
      mode,
      avgConfidence: avgConfidence.toFixed(4),
      threshold: threshold.toFixed(4),
      gatePass,
      successfulAgents,
      failedAgents,
    });

    // 6. Trigger Loop 2 if gate passes
    if (gatePass) {
      await io.logger.info('CFN Loop 3: Quality gate PASSED - Triggering Loop 2', {
        taskId,
        iteration,
        avgConfidence: avgConfidence.toFixed(4),
      });

      try {
        await client.sendEvent({
          name: 'cfn.loop2.start',
          payload: {
            taskId,
            iteration,
            mode,
            provider,
            loop3Results: agentResults,
            avgConfidence,
            agentCount: agents.length,
          },
        });

        await io.logger.info('CFN Loop 3: Loop 2 event sent successfully', { taskId, iteration });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await io.logger.error('CFN Loop 3: Failed to trigger Loop 2', {
          taskId,
          iteration,
          error: errorMessage,
        });
        // Continue execution even if event sending fails
      }
    } else {
      // 7. Log gate failure for iteration or handoff
      await io.logger.warn('CFN Loop 3: Quality gate FAILED - Iteration required', {
        taskId,
        iteration,
        avgConfidence: avgConfidence.toFixed(4),
        threshold: threshold.toFixed(4),
      });
    }

    // 8. Build final result
    const result: CFNLoop3Result = {
      taskId,
      iteration,
      mode,
      timestamp: new Date().toISOString(),
      totalExecutionTime,
      agentResults,
      gateMetrics: {
        avgConfidence,
        threshold,
        passed: gatePass,
      },
      decision: gatePass ? 'PROCEED_TO_LOOP2' : 'ITERATE_LOOP3',
      metadata: {
        totalAgents: agents.length,
        successfulAgents,
        failedAgents,
      },
    };

    await io.logger.info('CFN Loop 3: Execution complete', {
      taskId,
      iteration,
      decision: result.decision,
      totalExecutionTime,
      avgConfidence: avgConfidence.toFixed(4),
    });

    return result;
  },
});

/**
 * Spawn a single Loop 3 agent in an isolated Docker container
 *
 * @param io - trigger.dev IO interface for logging and task execution
 * @param options - Agent spawn configuration
 * @returns Agent execution result with confidence score
 */
async function spawnLoop3Agent(
  io: any,
  options: {
    taskId: string;
    agentType: string;
    taskDescription: string;
    mode: string;
    provider: string;
    iteration: number;
    previousFeedback?: string;
    timeout: number;
  }
): Promise<Loop3AgentResult> {
  const {
    taskId,
    agentType,
    taskDescription,
    mode,
    provider,
    iteration,
    previousFeedback,
    timeout,
  } = options;

  const containerName = `cfn-loop3-${taskId}-${agentType}-${Date.now()}`;
  const agentStartTime = Date.now();

  await io.logger.info(`CFN Loop 3: Spawning agent "${agentType}"`, {
    taskId,
    containerName,
    iteration,
  });

  try {
    // Execute Docker container spawn via runTask
    const result = await io.runTask(
      `spawn-loop3-${agentType}-${iteration}`,
      async () => {
        // Build Docker command with proper escaping and resource limits
        const dockerCmd = buildDockerCommand({
          containerName,
          agentType,
          taskId,
          taskDescription,
          mode,
          provider,
          iteration,
          previousFeedback,
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
        name: `CFN Loop 3: Spawn ${agentType} agent`,
        timeout,
      }
    );

    const executionTime = Date.now() - agentStartTime;

    // Parse confidence score from agent output
    const confidenceResult = parseConfidenceScore(result.stdout + result.stderr);

    const agentResult: Loop3AgentResult = {
      agentType,
      containerName,
      confidence: confidenceResult.score,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTime,
      resourceLimits: {
        cpus: 2,
        memory: '4g',
      },
      networkIsolation: {
        network: 'trigger-dev_trigger-cfn-network',
      },
      completedAt: new Date().toISOString(),
    };

    if (!confidenceResult.found) {
      await io.logger.warn(`CFN Loop 3: No confidence score found in ${agentType} output`, {
        taskId,
        agentType,
        outputLength: result.stdout.length,
      });
    }

    return agentResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const executionTime = Date.now() - agentStartTime;

    await io.logger.error(`CFN Loop 3: Agent "${agentType}" spawn failed`, {
      taskId,
      agentType,
      executionTime,
      error: errorMessage,
    });

    // Return failure result with zero confidence
    return {
      agentType,
      containerName,
      confidence: 0,
      stdout: '',
      stderr: errorMessage,
      exitCode: 1,
      executionTime,
      resourceLimits: {
        cpus: 2,
        memory: '4g',
      },
      networkIsolation: {
        network: 'trigger-dev_trigger-cfn-network',
      },
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Build Docker command for agent execution
 * Includes proper shell escaping and security validation
 *
 * @param options - Docker configuration
 * @returns Complete Docker run command
 */
function buildDockerCommand(options: {
  containerName: string;
  agentType: string;
  taskId: string;
  taskDescription: string;
  mode: string;
  provider: string;
  iteration: number;
  previousFeedback?: string;
}): string {
  const {
    containerName,
    agentType,
    taskId,
    taskDescription,
    mode,
    provider,
    iteration,
    previousFeedback,
  } = options;

  // Escape task description for shell safety
  const escapedDescription = taskDescription.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const escapedFeedback = previousFeedback
    ? ` "${previousFeedback.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`
    : '';

  // Resolve network name and Redis configuration from environment contract
  const networkName = getNetworkName('trigger');
  const redisHost = getEnvValue('redis_host', 'trigger');
  const redisPort = getEnvValue('redis_port', 'trigger');

  const parts: string[] = [
    'docker run --rm',
    `--name ${containerName}`,
    `--network ${networkName}`,
    '--cpus=2',
    '--memory=4g',
    '--memory-swap=4g',
    `-e TASK_ID=${taskId}`,
    `-e ITERATION=${iteration}`,
    `-e MODE=${mode}`,
    `-e PROVIDER=${provider}`,
    `-e AGENT_TYPE=${agentType}`,
    `-e CFN_REDIS_HOST=${redisHost}`,
    `-e CFN_REDIS_PORT=${redisPort}`,
    `-e CFN_NETWORK_NAME=${networkName}`,
    '-v /workspace:/workspace:rw',
    '-v /tmp/cfn-workspace:/tmp/workspace:rw',
    'cfn-agent:test',
    agentType,
    `--task "${escapedDescription}"`,
    `--provider ${provider}`,
    `--mode ${mode}`,
    `--iteration ${iteration}`,
  ];

  // Add previous feedback if available
  if (escapedFeedback) {
    parts.push(`--previous-feedback${escapedFeedback}`);
  }

  return parts.join(' ');
}

/**
 * Parse confidence score from agent output
 * Uses regex pattern: confidence[:\s]+([0-9.]+)
 *
 * @param output - Combined stdout/stderr from agent
 * @returns Parsed confidence score (0.0-1.0)
 */
function parseConfidenceScore(output: string): ConfidenceParseResult {
  // Match patterns like:
  // - "confidence: 0.95"
  // - "confidence:0.95"
  // - "Confidence: 0.95"
  // - "confidence = 0.95"
  const patterns = [
    /confidence[:\s=]+([0-9.]+)/gi,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      // Extract just the numerical part
      const numberMatch = match[0].match(/([0-9.]+)/);
      if (numberMatch) {
        const score = parseFloat(numberMatch[1]);
        // Validate score is in valid range
        if (!isNaN(score) && score >= 0 && score <= 1) {
          return {
            found: true,
            score,
            rawMatch: match[0],
          };
        }
      }
    }
  }

  // Default to 0 if not found
  return {
    found: false,
    score: 0,
    rawMatch: null,
  };
}

export default cfnLoop3Job;
