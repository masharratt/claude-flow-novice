/**
 * Shared Validation Schemas for Trigger.dev Tasks
 *
 * Purpose: Centralized Zod schemas for input validation across all decomposers,
 * merger, and coordinator tasks. Prevents prompt injection, validates data
 * integrity, and ensures type safety.
 *
 * @module validation-schemas
 * @version 1.0.0
 */

import { z } from "zod";

// =============================================
// Decomposer Input Validation
// =============================================

/**
 * Base schema for all decomposer task inputs.
 * Prevents prompt injection and validates path integrity.
 */
export const decomposerInputSchema = z.object({
  taskId: z
    .string()
    .min(1, "Task ID cannot be empty")
    .max(100, "Task ID too long (max 100 chars)"),

  taskDescription: z
    .string()
    .min(10, "Task description too short (min 10 chars)")
    .max(5000, "Task description too long (max 5000 chars)")
    .refine(
      (desc) => !desc.includes("\0"),
      "Task description contains null bytes (possible injection)"
    ),

  workDir: z
    .string()
    .refine((p) => p.startsWith("/"), "Work directory must be an absolute path")
    .refine(
      (p) => !p.includes(".."),
      "Work directory cannot contain parent directory references"
    )
    .refine(
      (p) => !p.includes("\0"),
      "Work directory contains null bytes (possible injection)"
    ),

  previousContext: z
    .object({
      microTasks: z.array(z.any()).optional(),
      recommendations: z.array(z.string()).optional(),
    })
    .optional(),
});

export type DecomposerInput = z.infer<typeof decomposerInputSchema>;

// =============================================
// Cerebras API Response Validation
// =============================================

/**
 * Schema for Cerebras API JSON responses.
 * Ensures response structure is valid before parsing content.
 */
export const cerebrasResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      })
    )
    .min(1, "Cerebras API returned no choices"),

  usage: z.object({
    prompt_tokens: z.number().nonnegative(),
    completion_tokens: z.number().nonnegative(),
  }),
});

export type CerebrasResponse = z.infer<typeof cerebrasResponseSchema>;

/**
 * Schema for decomposition analysis output (parsed from Cerebras content).
 * Validates that decomposer actually produced micro-tasks.
 */
export const decompositionOutputSchema = z.object({
  microTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        priority: z.enum(["critical", "high", "medium", "low"]),
        rationale: z.string().optional(),
        dependencies: z.array(z.string()).optional(),
      })
    )
    .min(1, "Decomposer returned 0 tasks - likely API error or invalid prompt"),

  recommendations: z.array(z.string()).optional(),
});

export type DecompositionOutput = z.infer<typeof decompositionOutputSchema>;

// =============================================
// Merger Input Validation
// =============================================

/**
 * Schema for decomposition merger inputs.
 * Ensures all 4 decomposer outputs are present and valid.
 */
export const mergerInputSchema = z.object({
  architectureOutput: z.object({
    taskId: z.string(),
    perspective: z.literal("architecture"),
    microTasks: z.array(z.any()).min(0),
    recommendations: z.array(z.string()).optional(),
    components: z.array(z.any()).optional(),
    boundaries: z.array(z.any()).optional(),
  }),

  securityOutput: z.object({
    taskId: z.string(),
    perspective: z.literal("security"),
    microTasks: z.array(z.any()).min(0),
    securityRecommendations: z.array(z.string()).optional(),
  }),

  performanceOutput: z.object({
    taskId: z.string(),
    perspective: z.literal("performance"),
    microTasks: z.array(z.any()).min(0),
    performanceRecommendations: z.array(z.string()).optional(),
  }),

  testingOutput: z.object({
    taskId: z.string(),
    perspective: z.literal("testing"),
    microTasks: z.array(z.any()).min(0),
    testingRecommendations: z.array(z.string()).optional(),
  }),
});

export type MergerInput = z.infer<typeof mergerInputSchema>;

// =============================================
// Validation Helper Functions
// =============================================

/**
 * Validates decomposer input with detailed error reporting.
 *
 * @param input - Raw input from task payload
 * @param decomposerName - Name of decomposer for error context
 * @returns Validated input
 * @throws Error with actionable message if validation fails
 */
export function validateDecomposerInput(
  input: unknown,
  decomposerName: string
): DecomposerInput {
  try {
    return decomposerInputSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(
        `[${decomposerName}] Input validation failed: ${issues}\n` +
          `Ensure taskId (1-100 chars), taskDescription (10-5000 chars), ` +
          `and workDir (absolute path) are valid.`
      );
    }
    throw error;
  }
}

/**
 * Validates Cerebras API response with detailed error reporting.
 *
 * @param data - Raw response from Cerebras API
 * @param decomposerName - Name of decomposer for error context
 * @returns Validated response
 * @throws Error with actionable message if validation fails
 */
export function validateCerebrasResponse(
  data: unknown,
  decomposerName: string
): CerebrasResponse {
  try {
    return cerebrasResponseSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(
        `[${decomposerName}] Cerebras API response validation failed: ${issues}\n` +
          `API may have returned an error or malformed JSON. Check API key and quota.`
      );
    }
    throw error;
  }
}

/**
 * Validates decomposition output (parsed content) with detailed error reporting.
 *
 * @param analysis - Parsed JSON content from Cerebras response
 * @param decomposerName - Name of decomposer for error context
 * @returns Validated analysis
 * @throws Error with actionable message if validation fails
 */
export function validateDecompositionOutput(
  analysis: unknown,
  decomposerName: string
): DecompositionOutput {
  try {
    return decompositionOutputSchema.parse(analysis);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(
        `[${decomposerName}] Decomposition output validation failed: ${issues}\n` +
          `Decomposer returned 0 tasks or invalid structure. ` +
          `This usually indicates an API error, malformed prompt, or token limit reached.`
      );
    }
    throw error;
  }
}

/**
 * Validates merger input with detailed error reporting.
 *
 * @param inputs - All 4 decomposer outputs
 * @returns Validated inputs
 * @throws Error with actionable message if validation fails
 */
export function validateMergerInput(inputs: unknown): MergerInput {
  try {
    return mergerInputSchema.parse(inputs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(
        `[merger] Input validation failed: ${issues}\n` +
          `One or more decomposer outputs are missing or have invalid structure.`
      );
    }
    throw error;
  }
}

/**
 * Validates task count from architecture baseline.
 *
 * @param taskCount - Number of tasks returned by architecture decomposer
 * @param decomposerName - Name of decomposer for error context
 * @throws Error if task count is invalid
 */
export function validateTaskCount(taskCount: number, decomposerName: string): void {
  if (taskCount === 0) {
    throw new Error(
      `[${decomposerName}] Architecture decomposer returned 0 tasks - cannot proceed with refinement. ` +
        `This indicates a critical failure in the baseline decomposition. ` +
        `Check API connectivity, prompt validity, and token limits.`
    );
  }

  if (taskCount > 50) {
    console.warn(
      `[${decomposerName}] ⚠️  Architecture decomposition produced ${taskCount} tasks - ` +
        `higher than expected (target 12-16 after refinement). ` +
        `This may indicate over-decomposition. Consider refining the task description.`
    );
  }
}

// =============================================
// Decomposer Output Type Validation (P0 FIX)
// =============================================

/**
 * Schema for generic decomposer output (perspective-agnostic).
 * Validates all decomposer outputs have required micro-task structure.
 *
 * P0 SECURITY FIX sec-1.3: Prevents invalid/malicious output injection
 * from LLM decomposers into downstream processing.
 */
export const decomposerOutputSchema = z.object({
  taskId: z
    .string()
    .min(1, "Task ID required")
    .max(100, "Task ID too long"),

  perspective: z
    .enum(["architecture", "security", "performance", "testing"], {
      errorMap: () => ({ message: "Invalid perspective - must be one of: architecture, security, performance, testing" }),
    }),

  microTasks: z
    .array(
      z.object({
        id: z
          .string()
          .min(1, "Micro-task ID cannot be empty")
          .regex(/^[a-z0-9\-]+$/, "Micro-task ID must contain only lowercase alphanumerics and hyphens"),

        title: z
          .string()
          .min(5, "Title too short (min 5 chars)")
          .max(200, "Title too long (max 200 chars)"),

        description: z
          .string()
          .min(10, "Description too short (min 10 chars)")
          .max(2000, "Description too long (max 2000 chars)"),

        priority: z
          .enum(["critical", "high", "medium", "low"], {
            errorMap: () => ({ message: "Priority must be: critical, high, medium, or low" }),
          }),

        rationale: z
          .string()
          .min(0, "Rationale must be string")
          .max(1000, "Rationale too long (max 1000 chars)")
          .optional(),

        dependencies: z
          .array(
            z.string()
              .min(1, "Dependency ID cannot be empty")
              .regex(/^[a-z0-9\-]+$/, "Dependency ID invalid format")
          )
          .optional(),
      })
    )
    .min(1, "Must have at least 1 micro-task"),

  recommendations: z
    .array(
      z.string()
        .min(5, "Recommendation too short")
        .max(500, "Recommendation too long")
    )
    .optional(),

  // Allow perspective-specific fields
  components: z.array(z.object({}).passthrough()).optional(),
  boundaries: z.array(z.object({}).passthrough()).optional(),
  securityRecommendations: z.array(z.string()).optional(),
  performanceRecommendations: z.array(z.string()).optional(),
  testingRecommendations: z.array(z.string()).optional(),
});

export type DecomposerOutput = z.infer<typeof decomposerOutputSchema>;

/**
 * Validates decomposer output with strict type checking.
 * Rejects invalid task structures, missing required fields, and type mismatches.
 *
 * SECURITY: Prevents prompt injection via malformed JSON responses.
 *
 * @param output - Raw output from decomposer task
 * @param decomposerName - Name of decomposer for error context
 * @returns Validated and typed decomposer output
 * @throws Error with detailed validation failure information
 */
export function validateDecomposerOutput(
  output: unknown,
  decomposerName: string
): DecomposerOutput {
  // Type guard: reject non-objects
  if (output === null || typeof output !== "object") {
    throw new Error(
      `[${decomposerName}] Output validation failed: Expected object, got ${typeof output}\n` +
        `Raw output: ${JSON.stringify(output).substring(0, 100)}`
    );
  }

  try {
    return decomposerOutputSchema.parse(output);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => {
          const path = i.path.length > 0 ? i.path.join(".") : "root";
          return `${path}: ${i.message} (code: ${i.code})`;
        })
        .join("\n  ");

      throw new Error(
        `[${decomposerName}] Decomposer output validation failed:\n  ${issues}\n\n` +
          `Validation issues detected in decomposer response structure. ` +
          `Ensure all micro-tasks have required fields (id, title, description, priority) ` +
          `with valid string lengths and formats.`
      );
    }
    throw error;
  }
}

/**
 * Batch validates multiple decomposer outputs with aggregated error reporting.
 * Used by merger to validate all 4 decomposer perspectives simultaneously.
 *
 * @param outputs - Map of perspective → decomposer output
 * @returns Map of validated outputs
 * @throws Error if any output fails validation
 */
export function validateMultipleDecomposerOutputs(
  outputs: Record<string, unknown>
): Record<string, DecomposerOutput> {
  const validated: Record<string, DecomposerOutput> = {};
  const errors: string[] = [];

  for (const [perspective, output] of Object.entries(outputs)) {
    try {
      validated[perspective] = validateDecomposerOutput(output, perspective);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[merger] Multiple decomposer outputs failed validation:\n${errors.join("\n\n")}`
    );
  }

  return validated;
}

/**
 * Validates micro-task dependency graph for cycles and missing references.
 * SECURITY: Prevents invalid task graphs that could cause infinite loops.
 *
 * @param microTasks - Array of micro-tasks with dependencies
 * @param decomposerName - Name of decomposer for error context
 * @throws Error if dependency graph is invalid
 */
export function validateDependencyGraph(
  microTasks: Array<{ id: string; dependencies?: string[] }>,
  decomposerName: string
): void {
  const taskIds = new Set(microTasks.map((t) => t.id));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  /**
   * DFS to detect cycles in dependency graph.
   */
  function hasCycle(taskId: string, graph: Map<string, string[]>): boolean {
    visited.add(taskId);
    recursionStack.add(taskId);

    const dependencies = graph.get(taskId) || [];
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, graph)) {
          return true;
        }
      } else if (recursionStack.has(dep)) {
        return true; // Cycle detected
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  // Build dependency graph
  const graph = new Map<string, string[]>();
  const missingRefs: string[] = [];

  for (const task of microTasks) {
    graph.set(task.id, task.dependencies || []);

    // Check for missing task references
    for (const dep of task.dependencies || []) {
      if (!taskIds.has(dep)) {
        missingRefs.push(`Task "${task.id}" depends on missing task "${dep}"`);
      }
    }
  }

  // Report missing references
  if (missingRefs.length > 0) {
    throw new Error(
      `[${decomposerName}] Dependency validation failed - missing task references:\n  ${missingRefs.join("\n  ")}\n` +
        `All task dependencies must reference other tasks in the same decomposition.`
    );
  }

  // Check for cycles
  for (const taskId of Array.from(taskIds)) {
    if (!visited.has(taskId)) {
      if (hasCycle(taskId, graph)) {
        throw new Error(
          `[${decomposerName}] Dependency validation failed - circular dependency detected\n` +
            `Task dependency graph contains a cycle. Ensure dependencies form a DAG (directed acyclic graph).`
        );
      }
    }
  }
}
