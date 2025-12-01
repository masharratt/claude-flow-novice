/**
 * CFN Loop Docker Mode Adapter
 * Executes agents via trigger.dev Docker containers or falls back to memory simulation
 * CLI mode is no longer supported - use separate CLI process for local development
 */

import { execSync } from 'child_process';
import { triggerJob, getRunStatus, TriggerDevClientError } from './trigger-dev-client';

export interface ExecuteAgentOptions {
  timeout?: number;
  context?: Record<string, unknown>;
  fallbackToMemory?: boolean;
}

export interface AgentResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionMode: 'trigger.dev' | 'memory' | 'docker';
  runId?: string;
}

export class AgentExecutionError extends Error {
  constructor(
    message: string,
    public readonly agentType: string,
    public readonly taskId: string
  ) {
    super(message);
    this.name = 'AgentExecutionError';
  }
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Check if trigger.dev is configured
 */
function isTriggerDevConfigured(): boolean {
  return !!(process.env.TRIGGER_API_URL && process.env.TRIGGER_API_KEY);
}

/**
 * Execute agent via trigger.dev
 */
async function executeViaTriggerDev(
  agentType: string,
  taskId: string,
  options: ExecuteAgentOptions
): Promise<AgentResult> {
  const jobId = `cfn-agent-${agentType}`;

  const runId = await triggerJob(jobId, {
    taskId,
    agentType,
    context: options.context,
  });

  const status = await getRunStatus(runId, 20);

  return {
    success: status.status === 'COMPLETED',
    output: status.output,
    error: status.error,
    executionMode: 'trigger.dev',
    runId,
  };
}

/**
 * CLI mode has been removed from trigger process
 * Use separate CLI process for local development
 * @deprecated CLI mode is no longer supported in trigger process
 */
function executeViaCliDeprecated(
  agentType: string,
  taskId: string,
  options: ExecuteAgentOptions
): AgentResult {
  throw new Error(
    `CLI mode is no longer supported in trigger process. ` +
    `Use separate CLI mode for local development or Docker execution. ` +
    `Agent: ${agentType}, Task: ${taskId}`
  );
}

/**
 * Execute agent via memory fallback (in-process simulation)
 */
function executeViaMemory(
  agentType: string,
  taskId: string,
  _options: ExecuteAgentOptions
): AgentResult {
  // Memory fallback: log execution and return simulated success
  console.log(`[memory-fallback] Executing ${agentType} for task ${taskId}`);

  return {
    success: true,
    output: {
      message: `Agent ${agentType} executed in memory mode`,
      taskId,
      timestamp: new Date().toISOString(),
    },
    executionMode: 'memory',
  };
}

/**
 * Execute an agent via trigger.dev Docker containers or fallback mechanisms
 *
 * Auto-detection:
 * - If TRIGGER_API_URL is set: use trigger.dev Docker execution
 * - If fallbackToMemory is true and trigger.dev fails: use memory simulation
 * - CLI mode is no longer supported - use separate CLI process
 *
 * @param agentType - Type of agent to spawn (e.g., 'backend-developer', 'tester')
 * @param taskId - Unique task identifier
 * @param options - Execution options
 * @returns Agent execution result
 */
export async function executeAgent(
  agentType: string,
  taskId: string,
  options: ExecuteAgentOptions = {}
): Promise<AgentResult> {
  const opts = {
    timeout: DEFAULT_TIMEOUT,
    fallbackToMemory: true,
    ...options,
  };

  // Require trigger.dev for Docker execution
  if (isTriggerDevConfigured()) {
    try {
      return await executeViaTriggerDev(agentType, taskId, opts);
    } catch (err) {
      console.warn(`[trigger.dev] Docker execution failed: ${(err as Error).message}`);

      if (opts.fallbackToMemory) {
        console.log('[trigger.dev] Falling back to memory simulation');
        return executeViaMemory(agentType, taskId, opts);
      }

      throw new AgentExecutionError(
        `Failed to execute agent via trigger.dev Docker: ${(err as Error).message}`,
        agentType,
        taskId
      );
    }
  }

  // CLI mode is no longer supported - throw clear error
  throw new AgentExecutionError(
    `Trigger.dev Docker execution not configured and CLI mode is no longer supported. ` +
    `Set TRIGGER_API_URL and TRIGGER_API_KEY for Docker execution, or use separate CLI process for local development. ` +
    `Agent: ${agentType}, Task: ${taskId}`,
    agentType,
    taskId
  );
}

/**
 * Check execution mode that will be used
 * @returns Current execution mode based on environment (Docker-only)
 */
export function getExecutionMode(): 'trigger.dev' | 'docker' {
  return isTriggerDevConfigured() ? 'trigger.dev' : 'docker';
}

/**
 * Check if CLI mode is supported (always false now)
 * @returns false - CLI mode is no longer supported
 * @deprecated CLI mode has been removed from trigger process
 */
export function isCliModeSupported(): boolean {
  return false;
}
