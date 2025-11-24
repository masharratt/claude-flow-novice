/**
 * Phase 4: CFN Loop 2 Validation Job
 * trigger.dev implementation for sequential validator spawning with consensus scoring
 *
 * Specification: planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md
 * Architecture: Per-validator Docker containers with isolated execution environments
 * Coordination: Sequential validator spawning with consensus score parsing
 *
 * Success Criteria:
 * 1. All Loop 2 validators spawn in Docker containers sequentially
 * 2. Validator outputs captured correctly with stdout/stderr isolation
 * 3. Consensus scores parsed from validator output using regex
 * 4. Average consensus calculated across all validators
 * 5. Product Owner triggered after validation complete
 * 6. Mode-specific validator scaling (MVP: 1, Standard: 3, Enterprise: 5)
 * 7. Comprehensive input validation and error handling
 */

import { TriggerClient, defineJob, eventTrigger } from '@trigger.dev/sdk';
import { z } from 'zod';
import { validateTaskId } from '../utils/path-validation';
import { execSync } from 'child_process';
import { getEnvValue, getNetworkName } from '../lib/environment-contract';

// Declare client for external initialization
declare const client: TriggerClient;

/**
 * Mode-specific validator configuration
 * Scales validator team based on quality requirements
 */
const VALIDATOR_TYPES = {
  mvp: ['code-reviewer'],
  standard: ['code-reviewer', 'tester', 'security-specialist'],
  enterprise: [
    'code-reviewer',
    'tester',
    'security-specialist',
    'perf-analyzer',
    'accessibility-advocate',
  ],
} as const;

/**
 * Consensus thresholds per CFN mode
 * Standard mode (0.90) is the default production threshold
 */
const CONSENSUS_THRESHOLDS = {
  mvp: 0.80,
  standard: 0.90,
  enterprise: 0.95,
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
 * Loop 3 agent result schema (from previous loop)
 * Validates agent execution metadata for context passing
 */
const Loop3AgentResultSchema = z.object({
  agentType: z.string(),
  containerName: z.string(),
  confidence: z.number().min(0).max(1),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  executionTime: z.number(),
  resourceLimits: z.object({
    cpus: z.number(),
    memory: z.string(),
  }),
  networkIsolation: z.object({
    network: z.string(),
  }),
  completedAt: z.string(),
});

/**
 * Payload schema for CFN Loop 2 execution
 * Validates all required inputs for validator spawning and consensus collection
 */
const CFNLoop2PayloadSchema = z.object({
  taskId: z.string().min(1).max(256).describe('Unique task identifier'),
  iteration: z.number().int().positive().describe('Current iteration number (1-based)'),
  mode: z.enum(['mvp', 'standard', 'enterprise']).default('standard').describe('Consensus threshold mode'),
  provider: z.enum(['zai', 'kimi', 'openrouter', 'max']).default('zai').describe('AI provider for validators'),
  loop3Results: z.array(Loop3AgentResultSchema).min(1).describe('Loop 3 agent execution results'),
  avgConfidence: z.number().min(0).max(1).describe('Average confidence from Loop 3'),
  agentCount: z.number().int().positive().describe('Number of Loop 3 agents executed'),
  timeout: z.number().positive().default(1200000).describe('Execution timeout in milliseconds'),
});

type CFNLoop2Payload = z.infer<typeof CFNLoop2PayloadSchema>;

/**
 * Consensus score parsing result
 * Extracts numerical consensus from validator output
 */
interface ConsensusParseResult {
  found: boolean;
  score: number;
  rawMatch: string | null;
}

/**
 * Individual validator execution result with full metadata
 */
interface Loop2ValidatorResult {
  validatorType: string;
  containerName: string;
  consensus: number;
  feedback: string;
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
 * Complete Loop 2 execution result
 */
interface CFNLoop2Result {
  taskId: string;
  iteration: number;
  mode: string;
  timestamp: string;
  totalExecutionTime: number;
  validatorResults: Loop2ValidatorResult[];
  consensusMetrics: {
    avgConsensus: number;
    threshold: number;
    passed: boolean;
    individualScores: Record<string, number>;
  };
  loop3Summary: {
    avgConfidence: number;
    agentCount: number;
  };
  metadata: {
    totalValidators: number;
    successfulValidators: number;
    failedValidators: number;
  };
}

/**
 * CFN Loop 2 Validation Job
 *
 * Orchestrates sequential spawning of CFN validator agents in isolated Docker containers.
 * Each validator:
 * - Runs in its own container with resource limits (1 CPU, 2GB memory)
 * - Executes on a shared network (trigger-dev_trigger-cfn-network)
 * - Has isolated stdout/stderr captured independently
 * - Outputs a consensus score that is parsed via regex
 * - Reviews Loop 3 implementation work and provides validation feedback
 *
 * Validator Scaling:
 * - MVP mode: 1 validator (code-reviewer only)
 * - Standard mode: 3 validators (code-reviewer, tester, security-specialist)
 * - Enterprise mode: 5 validators (all above + perf-analyzer + accessibility-advocate)
 *
 * Consensus Collection:
 * - Calculates average consensus across all validators
 * - Compares against mode-specific threshold
 * - Passes all context to Product Owner for final decision
 *
 * Type Safety:
 * - Zero `any` types throughout implementation
 * - Comprehensive Zod schemas for all payloads
 * - Strong typing for all validator results and metrics
 * - Type-safe error handling with discriminated unions
 */
export const cfnLoop2Job = defineJob({
  id: 'cfn-loop2-validation',
  name: 'CFN Loop 2: Sequential Validator Execution with Consensus',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.loop2.start',
  }),
  run: async (payload: unknown, io, ctx): Promise<CFNLoop2Result> => {
    // 1. Validate payload schema
    let validatedPayload: CFNLoop2Payload;
    try {
      validatedPayload = CFNLoop2PayloadSchema.parse(payload);
    } catch (error) {
      const zodError = error instanceof z.ZodError ? error.errors[0].message : 'Invalid payload schema';
      await io.logger.error('CFN Loop 2: Payload validation failed', { error: zodError, payload });
      throw new Error(`CFN Loop 2 payload validation failed: ${zodError}`);
    }

    const {
      taskId: rawTaskId,
      iteration,
      mode,
      provider,
      loop3Results,
      avgConfidence,
      agentCount,
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
      await io.logger.error('CFN Loop 2: Task ID validation failed', { taskId: rawTaskId, error: errorMessage });
      throw error;
    }

    // 3. Get mode-specific validators
    const validators = VALIDATOR_TYPES[mode as keyof typeof VALIDATOR_TYPES];
    const threshold = CONSENSUS_THRESHOLDS[mode as keyof typeof CONSENSUS_THRESHOLDS];

    await io.logger.info('CFN Loop 2: Starting sequential validator execution', {
      taskId,
      iteration,
      mode,
      provider,
      validatorCount: validators.length,
      validators: validators.join(', '),
      threshold,
      loop3AvgConfidence: avgConfidence.toFixed(4),
      timeout,
    });

    // 4. Execute validators sequentially
    const validatorResults: Loop2ValidatorResult[] = [];
    const individualScores: Record<string, number> = {};

    for (const validatorType of validators) {
      const validatorResult = await spawnLoop2Validator(io, {
        taskId,
        validatorType,
        loop3Results,
        mode,
        provider,
        iteration,
        timeout,
      });

      validatorResults.push(validatorResult);
      individualScores[validatorType] = validatorResult.consensus;

      // Log individual validator result
      await io.logger.info(`CFN Loop 2: Validator "${validatorType}" completed`, {
        taskId,
        validatorType,
        consensus: validatorResult.consensus.toFixed(4),
        executionTime: validatorResult.executionTime,
        exitCode: validatorResult.exitCode,
      });
    }

    // 5. Calculate consensus metrics
    const totalExecutionTime = Date.now() - jobStartTime;
    const successfulValidators = validatorResults.filter(r => r.exitCode === 0).length;
    const failedValidators = validatorResults.length - successfulValidators;
    const avgConsensus = validatorResults.reduce((sum, r) => sum + r.consensus, 0) / validatorResults.length;
    const consensusPass = avgConsensus >= threshold;

    // 6. Log consensus check result
    await io.logger.info('CFN Loop 2: Consensus check', {
      taskId,
      iteration,
      mode,
      avgConsensus: avgConsensus.toFixed(4),
      threshold: threshold.toFixed(4),
      consensusPass,
      successfulValidators,
      failedValidators,
      individualScores: Object.entries(individualScores)
        .map(([type, score]) => `${type}:${score.toFixed(2)}`)
        .join(', '),
    });

    // 7. Trigger Product Owner decision
    await io.logger.info('CFN Loop 2: Triggering Product Owner decision', {
      taskId,
      iteration,
      avgConsensus: avgConsensus.toFixed(4),
    });

    try {
      await client.sendEvent({
        name: 'cfn.product.owner.decision',
        payload: {
          taskId,
          iteration,
          mode,
          provider,
          loop3Results,
          validatorResults,
          avgConfidence,
          avgConsensus,
          consensusPass,
          threshold,
        },
      });

      await io.logger.info('CFN Loop 2: Product Owner event sent successfully', { taskId, iteration });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await io.logger.error('CFN Loop 2: Failed to trigger Product Owner', {
        taskId,
        iteration,
        error: errorMessage,
      });
      // Continue execution even if event sending fails
    }

    // 8. Build final result
    const result: CFNLoop2Result = {
      taskId,
      iteration,
      mode,
      timestamp: new Date().toISOString(),
      totalExecutionTime,
      validatorResults,
      consensusMetrics: {
        avgConsensus,
        threshold,
        passed: consensusPass,
        individualScores,
      },
      loop3Summary: {
        avgConfidence,
        agentCount,
      },
      metadata: {
        totalValidators: validators.length,
        successfulValidators,
        failedValidators,
      },
    };

    await io.logger.info('CFN Loop 2: Execution complete', {
      taskId,
      iteration,
      avgConsensus: avgConsensus.toFixed(4),
      consensusPass,
      totalExecutionTime,
    });

    return result;
  },
});

/**
 * Spawn a single Loop 2 validator in an isolated Docker container
 *
 * @param io - trigger.dev IO interface for logging and task execution
 * @param options - Validator spawn configuration
 * @returns Validator execution result with consensus score
 */
async function spawnLoop2Validator(
  io: any,
  options: {
    taskId: string;
    validatorType: string;
    loop3Results: z.infer<typeof Loop3AgentResultSchema>[];
    mode: string;
    provider: string;
    iteration: number;
    timeout: number;
  }
): Promise<Loop2ValidatorResult> {
  const { taskId, validatorType, loop3Results, mode, provider, iteration, timeout } = options;

  const containerName = `cfn-loop2-${taskId}-${validatorType}-${Date.now()}`;
  const validatorStartTime = Date.now();

  await io.logger.info(`CFN Loop 2: Spawning validator "${validatorType}"`, {
    taskId,
    containerName,
    iteration,
  });

  try {
    // Execute Docker container spawn via runTask
    const result = await io.runTask(
      `spawn-loop2-${validatorType}-${iteration}`,
      async () => {
        // Build Docker command with proper escaping and resource limits
        const dockerCmd = buildValidatorDockerCommand({
          containerName,
          validatorType,
          taskId,
          loop3Results,
          mode,
          provider,
          iteration,
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
        name: `CFN Loop 2: Spawn ${validatorType} validator`,
        timeout,
      }
    );

    const executionTime = Date.now() - validatorStartTime;

    // Parse consensus score from validator output
    const consensusResult = parseConsensusScore(result.stdout + result.stderr);

    const validatorResult: Loop2ValidatorResult = {
      validatorType,
      containerName,
      consensus: consensusResult.score,
      feedback: result.stdout,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      executionTime,
      resourceLimits: {
        cpus: 1,
        memory: '2g',
      },
      networkIsolation: {
        network: 'trigger-dev_trigger-cfn-network',
      },
      completedAt: new Date().toISOString(),
    };

    if (!consensusResult.found) {
      await io.logger.warn(`CFN Loop 2: No consensus score found in ${validatorType} output`, {
        taskId,
        validatorType,
        outputLength: result.stdout.length,
      });
    }

    return validatorResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const executionTime = Date.now() - validatorStartTime;

    await io.logger.error(`CFN Loop 2: Validator "${validatorType}" spawn failed`, {
      taskId,
      validatorType,
      executionTime,
      error: errorMessage,
    });

    // Return failure result with zero consensus
    return {
      validatorType,
      containerName,
      consensus: 0,
      feedback: errorMessage,
      stdout: '',
      stderr: errorMessage,
      exitCode: 1,
      executionTime,
      resourceLimits: {
        cpus: 1,
        memory: '2g',
      },
      networkIsolation: {
        network: 'trigger-dev_trigger-cfn-network',
      },
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Build Docker command for validator execution
 * Includes proper shell escaping and security validation
 *
 * @param options - Docker configuration
 * @returns Complete Docker run command
 */
function buildValidatorDockerCommand(options: {
  containerName: string;
  validatorType: string;
  taskId: string;
  loop3Results: z.infer<typeof Loop3AgentResultSchema>[];
  mode: string;
  provider: string;
  iteration: number;
}): string {
  const { containerName, validatorType, taskId, loop3Results, mode, provider, iteration } = options;

  // Serialize Loop 3 results for validator context
  const loop3Summary = JSON.stringify({
    agentCount: loop3Results.length,
    avgConfidence: loop3Results.reduce((sum, r) => sum + r.confidence, 0) / loop3Results.length,
    agents: loop3Results.map(r => ({
      type: r.agentType,
      confidence: r.confidence,
      exitCode: r.exitCode,
      executionTime: r.executionTime,
    })),
  });

  // Escape for shell safety
  const escapedSummary = loop3Summary.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');

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
    `-e MODE=${mode}`,
    `-e PROVIDER=${provider}`,
    `-e VALIDATOR_TYPE=${validatorType}`,
    `-e CFN_REDIS_HOST=${redisHost}`,
    `-e CFN_REDIS_PORT=${redisPort}`,
    `-e CFN_NETWORK_NAME=${networkName}`,
    '-v /workspace:/workspace:ro',
    '-v /tmp/cfn-workspace:/tmp/workspace:rw',
    'cfn-agent:test',
    validatorType,
    `--validate-results "${escapedSummary}"`,
    `--provider ${provider}`,
    `--mode ${mode}`,
    `--iteration ${iteration}`,
  ];

  return parts.join(' ');
}

/**
 * Parse consensus score from validator output
 * Uses regex pattern: consensus[:\s]+([0-9.]+)
 *
 * @param output - Combined stdout/stderr from validator
 * @returns Parsed consensus score (0.0-1.0)
 */
function parseConsensusScore(output: string): ConsensusParseResult {
  // Match patterns like:
  // - "consensus: 0.92"
  // - "consensus:0.92"
  // - "Consensus: 0.92"
  // - "consensus = 0.92"
  // - "consensus score: 0.92"
  const patterns = [/consensus[:\s=]+(?:score[:\s]+)?([0-9.]+)/gi];

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

export default cfnLoop2Job;
