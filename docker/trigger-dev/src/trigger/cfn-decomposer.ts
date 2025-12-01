/**
 * CFN Task Decomposer
 *
 * Analyzes incoming tasks for atomicity and decomposes non-atomic tasks
 * into micro-tasks suitable for T1 model execution.
 *
 * This task runs BEFORE the implementer and:
 * 1. Analyzes the task description for atomicity violations
 * 2. If non-atomic, decomposes into micro-tasks using MDAP templates
 * 3. Returns an array of atomic micro-tasks to spawn as separate implementer jobs
 *
 * Key atomicity rules:
 * - One file per task
 * - One action per task (no "and")
 * - Max 50 lines of expected output
 * - No cross-file dependencies within task scope
 *
 * @module cfn-decomposer
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import {
  processTaskWithAtomicity,
  getAtomicityScore,
  needsDecomposition,
  type TaskDecomposition,
  type MicroTask,
} from "../lib/mdap-config.js";
import type { ImplementerV2Payload } from "./cfn-implementer-v2.js";

// =============================================
// Types
// =============================================

/**
 * Payload for the decomposer task
 */
export interface DecomposerPayload {
  /** CFN Loop task ID */
  taskId: string;
  /** Original task description (may be non-atomic) */
  taskDescription: string;
  /** Working directory */
  workDir: string;
  /** AI provider */
  provider?: 'zai' | 'kimi' | 'anthropic' | 'openrouter' | 'gemini' | 'xai';
  /** Agent type hint (for specialized decomposition) */
  agentType?: string;
  /** Files context (helps with decomposition) */
  files?: string[];
  /** Test files context */
  tests?: string[];
  /** Force decomposition even if task appears atomic */
  forceDecompose?: boolean;
  /** Execute micro-tasks automatically after decomposition */
  autoExecute?: boolean;
  /** Timeout per micro-task in milliseconds */
  microTaskTimeout?: number;
}

/**
 * Result from the decomposer task
 */
export interface DecomposerResult {
  /** Whether decomposition was performed */
  wasDecomposed: boolean;
  /** Original task description */
  originalTask: string;
  /** Atomicity score of original task (0.0-1.0) */
  atomicityScore: number;
  /** Decomposition analysis */
  analysis: {
    isAtomic: boolean;
    confidence: number;
    violations: string[];
    estimatedLines: number;
  };
  /** Resulting micro-tasks */
  microTasks: MicroTask[];
  /** If autoExecute=true, the run handles for spawned implementers */
  executionHandles?: Array<{
    microTaskId: string;
    runId: string;
    description: string;
  }>;
  /** Total execution time for decomposition */
  decompositionTimeMs: number;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Map a micro-task to an implementer payload
 */
function microTaskToPayload(
  microTask: MicroTask,
  basePayload: DecomposerPayload,
  index: number
): ImplementerV2Payload {
  return {
    taskId: `${basePayload.taskId}-micro-${index + 1}`,
    agentId: `${basePayload.taskId}-agent-${microTask.id}`,
    iterationId: 1,
    agentType: basePayload.agentType || 'typescript-specialist',
    taskDescription: microTask.description,
    workDir: basePayload.workDir,
    files: microTask.targetFile !== 'TBD' ? [microTask.targetFile] : (basePayload.files || []),
    tests: basePayload.tests || [],
    provider: basePayload.provider || 'zai',
    timeout: basePayload.microTaskTimeout || 300000, // 5 min per micro-task
    enableMDAP: true,
    complexityLevel: microTask.complexity,
    modelTier: 1, // Always start at T1 for micro-tasks
    failureCount: 0,
  };
}

/**
 * Build enhanced task description with context hints
 */
function buildEnhancedDescription(microTask: MicroTask): string {
  const parts = [microTask.description];

  if (microTask.contextHints.length > 0) {
    parts.push('');
    parts.push('Context hints:');
    microTask.contextHints.forEach(hint => parts.push(`- ${hint}`));
  }

  if (microTask.targetFile !== 'TBD') {
    parts.push('');
    parts.push(`Target file: ${microTask.targetFile}`);
  }

  return parts.join('\n');
}

// =============================================
// Task Definition
// =============================================

export const cfnDecomposerTask = task({
  id: "cfn-decomposer",
  retry: { maxAttempts: 1 }, // No retries for decomposition

  run: async (payload: DecomposerPayload): Promise<DecomposerResult> => {
    const startTime = Date.now();

    console.log(`[decomposer] Analyzing task for atomicity`);
    console.log(`[decomposer] Task ID: ${payload.taskId}`);
    console.log(`[decomposer] Task: ${payload.taskDescription.slice(0, 100)}...`);

    // Quick check if decomposition is needed
    const needsDecomp = payload.forceDecompose || needsDecomposition(payload.taskDescription);
    const atomicityScore = getAtomicityScore(payload.taskDescription);

    console.log(`[decomposer] Atomicity score: ${(atomicityScore * 100).toFixed(0)}%`);
    console.log(`[decomposer] Needs decomposition: ${needsDecomp}`);

    // Process with full atomicity analysis
    const decomposition = processTaskWithAtomicity(
      payload.taskDescription,
      payload.provider || 'zai',
      payload.forceDecompose || false
    );

    const decompositionTimeMs = Date.now() - startTime;

    console.log(`[decomposer] Decomposition complete in ${decompositionTimeMs}ms`);
    console.log(`[decomposer] Was decomposed: ${decomposition.wasDecomposed}`);
    console.log(`[decomposer] Micro-tasks: ${decomposition.microTasks.length}`);

    // Log each micro-task
    decomposition.microTasks.forEach((mt, i) => {
      console.log(`[decomposer]   ${i + 1}. [${mt.action}] ${mt.description}`);
      console.log(`[decomposer]      File: ${mt.targetFile}, Lines: ~${mt.estimatedLines}`);
    });

    // Auto-execute if requested
    let executionHandles: DecomposerResult['executionHandles'];

    if (payload.autoExecute && decomposition.microTasks.length > 0) {
      console.log(`[decomposer] Auto-executing ${decomposition.microTasks.length} micro-tasks`);

      executionHandles = [];

      // Spawn implementers for each micro-task
      // Note: We spawn sequentially for dependent tasks, parallel for independent
      const independentTasks = decomposition.microTasks.filter(mt => mt.dependsOn.length === 0);
      const dependentTasks = decomposition.microTasks.filter(mt => mt.dependsOn.length > 0);

      // Spawn independent tasks in parallel
      if (independentTasks.length > 0) {
        console.log(`[decomposer] Spawning ${independentTasks.length} independent tasks in parallel`);

        const handles = await Promise.all(
          independentTasks.map(async (microTask, index) => {
            const implPayload = microTaskToPayload(microTask, payload, index);
            // Add enhanced description with context hints
            implPayload.taskDescription = buildEnhancedDescription(microTask);

            const handle = await tasks.trigger("cfn-implementer-v2", implPayload);

            return {
              microTaskId: microTask.id,
              runId: handle.id,
              description: microTask.description,
            };
          })
        );

        executionHandles.push(...handles);
      }

      // Spawn dependent tasks (for now, also in parallel - full DAG execution TBD)
      if (dependentTasks.length > 0) {
        console.log(`[decomposer] Spawning ${dependentTasks.length} dependent tasks`);

        const dependentHandles = await Promise.all(
          dependentTasks.map(async (microTask, index) => {
            const implPayload = microTaskToPayload(
              microTask,
              payload,
              independentTasks.length + index
            );
            implPayload.taskDescription = buildEnhancedDescription(microTask);

            const handle = await tasks.trigger("cfn-implementer-v2", implPayload);

            return {
              microTaskId: microTask.id,
              runId: handle.id,
              description: microTask.description,
            };
          })
        );

        executionHandles.push(...dependentHandles);
      }

      console.log(`[decomposer] Spawned ${executionHandles.length} implementer tasks`);
    }

    return {
      wasDecomposed: decomposition.wasDecomposed,
      originalTask: payload.taskDescription,
      atomicityScore,
      analysis: {
        isAtomic: decomposition.analysis.isAtomic,
        confidence: decomposition.analysis.confidence,
        violations: decomposition.analysis.violationDetails,
        estimatedLines: decomposition.analysis.estimatedLines,
      },
      microTasks: decomposition.microTasks,
      executionHandles,
      decompositionTimeMs,
    };
  },
});

// =============================================
// Utility Functions (exported for orchestrators)
// =============================================

/**
 * Check if a task should be decomposed before execution
 *
 * Use this in orchestrators to decide whether to run decomposer first.
 */
export function shouldDecompose(taskDescription: string): boolean {
  return needsDecomposition(taskDescription);
}

/**
 * Get atomicity score for a task
 *
 * Returns 0.0-1.0 where higher = more atomic = better for T1.
 */
export function getTaskAtomicity(taskDescription: string): number {
  return getAtomicityScore(taskDescription);
}

/**
 * Quick decomposition without spawning a task
 *
 * Use this for synchronous decomposition in orchestrators.
 */
export function decomposeTask(
  taskDescription: string,
  provider: string = 'zai'
): TaskDecomposition {
  return processTaskWithAtomicity(taskDescription, provider, false);
}
