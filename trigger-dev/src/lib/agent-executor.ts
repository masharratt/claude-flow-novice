/**
 * Agent Executor - DEPRECATED
 *
 * ⚠️  THIS MODULE IS DEPRECATED FOR TRIGGER PROCESS
 *
 * CLI mode has been completely removed from trigger.dev process.
 * The trigger process now exclusively handles CFN Docker loops.
 *
 * For CLI mode, use the separate CLI process:
 *   /cfn-loop-cli "task description" --mode=standard
 *
 * For Docker execution, use trigger.dev tasks directly.
 * This file is kept for backward compatibility only.
 *
 * @deprecated Use trigger.dev Docker tasks or separate CLI process
 * @removed CLI execution functionality - replaced with Docker-only execution
 */

import { AgentResult, ValidatorResult } from '../types/cfn-types';

/**
 * Legacy execution options - kept for type compatibility
 * @deprecated Use trigger.dev task payloads instead
 */
export interface AgentExecutionOptions {
  taskId: string;
  agentType: string;
  context: string;
  workDir?: string;
  timeout?: number;
  testCommand?: string;
}

/**
 * Legacy execution result - kept for type compatibility
 * @deprecated Use AgentResult from trigger.dev tasks instead
 */
export interface AgentExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  deliverables: string[];
  exitCode: number;
  executionTimeMs: number;
}

/**
 * Execute a CFN agent - DEPRECATED
 * CLI mode has been removed from trigger process
 * @deprecated Use trigger.dev Docker tasks or separate CLI process
 */
export async function executeAgent(options: AgentExecutionOptions): Promise<AgentExecutionResult> {
  throw new Error(
    `CLI agent execution is no longer supported in trigger process. ` +
    `Use trigger.dev Docker tasks for containerized execution or separate CLI process for local development. ` +
    `Agent: ${options.agentType}, Task: ${options.taskId}`
  );
}

/**
 * Legacy conversion functions - kept for type compatibility only
 * @deprecated Use trigger.dev task results directly
 */
export function toAgentResult(
  execution: AgentExecutionResult,
  agentType: string,
  testResults: { passed: number; failed: number; total: number; passRate: number }
): AgentResult {
  // Deprecated: Return mock result for compatibility
  return {
    agentId: `${agentType}-${Date.now()}-deprecated`,
    agentType,
    confidence: execution.success ? 0.85 : 0.3,
    deliverables: {
      files: execution.deliverables,
      summary: `Deprecated agent executor - use Docker tasks instead`,
    },
    testResults: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      passRate: testResults.passRate,
    },
    completedAt: new Date().toISOString(),
  };
}

/**
 * Legacy conversion functions - kept for type compatibility only
 * @deprecated Use trigger.dev task results directly
 */
export function toValidatorResult(
  execution: AgentExecutionResult,
  validatorType: string
): ValidatorResult {
  // Deprecated: Return mock result for compatibility
  return {
    validatorId: `${validatorType}-${Date.now()}-deprecated`,
    validatorType,
    consensusScore: execution.success ? 0.88 : 0.4,
    feedback: `Deprecated validator executor - use Docker tasks instead`,
    completedAt: new Date().toISOString(),
  };
}