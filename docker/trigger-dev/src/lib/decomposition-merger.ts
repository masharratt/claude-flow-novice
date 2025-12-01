/**
 * Decomposition Merger - Natural Deduplication Through Context Refinement
 *
 * This merger implements sequential context passing where each decomposer
 * naturally refines the previous output instead of creating duplicates.
 *
 * Key principle: NO explicit deduplication rules. The refinement happens
 * naturally as context flows through the chain:
 *   Architecture → Security → Performance → Testing
 *
 * Each stage receives the previous output and refines it, adding constraints
 * and additional micro-tasks as needed.
 *
 * @module decomposition-merger
 * @version 1.0.0
 */

// =============================================
// Custom Error Classes (Sec-1.4: Error Handling)
// =============================================

/**
 * Base error class for decomposition merger errors.
 * Provides structured error handling with context information.
 */
export class MergerError extends Error {
  constructor(
    public message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = "MergerError";
    Object.setPrototypeOf(this, MergerError.prototype);
  }
}

/**
 * Validation error for invalid input parameters.
 * Thrown when input types or structures don't match expected contracts.
 */
export class ValidationError extends MergerError {
  constructor(
    message: string,
    context?: Record<string, any>
  ) {
    super(message, context);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Task processing error for failures during task refinement.
 * Indicates issues with individual task processing, not structural problems.
 */
export class TaskProcessingError extends MergerError {
  constructor(
    message: string,
    public taskId?: string,
    context?: Record<string, any>
  ) {
    super(message, { taskId, ...context });
    this.name = "TaskProcessingError";
    Object.setPrototypeOf(this, TaskProcessingError.prototype);
  }
}

/**
 * Stage execution error for failures during refinement stages.
 * Indicates the stage where the error occurred (architecture, security, etc.)
 */
export class StageExecutionError extends MergerError {
  constructor(
    message: string,
    public stage: "architecture" | "security" | "performance" | "testing",
    context?: Record<string, any>
  ) {
    super(message, { stage, ...context });
    this.name = "StageExecutionError";
    Object.setPrototypeOf(this, StageExecutionError.prototype);
  }
}

// =============================================
// Type Definitions
// =============================================

export interface MicroTaskConstraint {
  perspective: "architecture" | "security" | "performance" | "testing";
  description: string;
  rationale: string;
  additionalContext?: string;
}

export interface RefinedMicroTask {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";

  // Constraints accumulated from all perspectives
  constraints: {
    architecture?: MicroTaskConstraint;
    security?: MicroTaskConstraint;
    performance?: MicroTaskConstraint;
    testing?: MicroTaskConstraint;
  };

  dependencies: string[];
  estimatedEffort: "small" | "medium" | "large";

  // Track refinement history
  refinementHistory: Array<{
    stage: "architecture" | "security" | "performance" | "testing";
    change: string;
    timestamp: number;
  }>;
}

export interface DecompositionContext {
  taskId: string;
  originalTask: string;
  currentMicroTasks: RefinedMicroTask[];
  currentStage: "architecture" | "security" | "performance" | "testing";
  previousRecommendations: string[];
}

export interface MergedDecomposition {
  taskId: string;
  originalTask: string;
  microTasks: RefinedMicroTask[];

  // Quality metrics
  metrics: {
    totalTasks: number;
    constraintCompleteness: number; // % of tasks with all 4 constraint types
    avgConstraintsPerTask: number;
    refinementDepth: number; // Average refinements per task
  };

  // Aggregated recommendations
  recommendations: {
    architecture: string[];
    security: string[];
    performance: string[];
    testing: string[];
  };
}

// =============================================
// Sequential Merger - Natural Refinement
// =============================================

/**
 * Merge decompositions sequentially through natural context refinement.
 *
 * This is the core algorithm that demonstrates sequential > parallel:
 * - Architecture creates initial structure
 * - Security refines with security constraints (no duplication)
 * - Performance refines with performance constraints (no duplication)
 * - Testing refines with test requirements (no duplication)
 *
 * Result: 12-16 high-quality tasks instead of 40+ duplicate tasks.
 *
 * Throws: ValidationError if inputs are invalid or missing
 * Throws: StageExecutionError if refinement stages fail
 * Throws: MergerError if the merge process encounters unexpected errors
 */
export function mergeSequentialDecompositions(
  architectureOutput: any,
  securityOutput: any,
  performanceOutput: any,
  testingOutput: any
): MergedDecomposition {
  const startTime = Date.now();

  try {
    // Validate all inputs before processing
    validateDecomposerOutput("architecture", architectureOutput);
    validateDecomposerOutput("security", securityOutput);
    validateDecomposerOutput("performance", performanceOutput);
    validateDecomposerOutput("testing", testingOutput);

    console.log("[merger] Starting sequential context refinement");
    console.log(`  Architecture tasks: ${architectureOutput.microTasks.length}`);
    console.log(`  Security tasks: ${securityOutput.microTasks.length}`);
    console.log(`  Performance tasks: ${performanceOutput.microTasks.length}`);
    console.log(`  Testing tasks: ${testingOutput.microTasks.length}`);

    // Stage 1: Initialize with architecture decomposition
    let refinedTasks: RefinedMicroTask[] = [];
    try {
      refinedTasks = initializeFromArchitecture(architectureOutput);
      console.log(`  [Stage 1] Architecture baseline: ${refinedTasks.length} tasks`);

      // Validate architecture baseline
      if (refinedTasks.length === 0) {
        throw new StageExecutionError(
          "Architecture decomposer returned 0 tasks - cannot proceed with refinement. " +
            "The architecture stage must produce at least 1 task. " +
            "Common causes: API error, malformed prompt, empty task description, or quota exceeded.",
          "architecture",
          { stage: "architecture", taskCount: refinedTasks.length }
        );
      }

      if (refinedTasks.length > 50) {
        console.warn(
          `[merger] Architecture decomposition produced ${refinedTasks.length} tasks - ` +
            `higher than expected (target 12-16 after refinement). ` +
            `This may indicate over-decomposition.`
        );
      }
    } catch (error) {
      if (error instanceof StageExecutionError) throw error;
      throw new StageExecutionError(
        `Architecture stage initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        "architecture",
        { originalError: error }
      );
    }

    // Stage 2: Refine with security constraints
    try {
      refinedTasks = refineWithSecurityConstraints(refinedTasks, securityOutput);
      console.log(`  [Stage 2] After security refinement: ${refinedTasks.length} tasks`);
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new StageExecutionError(
        `Security refinement failed: ${error instanceof Error ? error.message : String(error)}`,
        "security",
        { originalError: error, taskCount: refinedTasks.length }
      );
    }

    // Stage 3: Refine with performance constraints
    try {
      refinedTasks = refineWithPerformanceConstraints(refinedTasks, performanceOutput);
      console.log(`  [Stage 3] After performance refinement: ${refinedTasks.length} tasks`);
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new StageExecutionError(
        `Performance refinement failed: ${error instanceof Error ? error.message : String(error)}`,
        "performance",
        { originalError: error, taskCount: refinedTasks.length }
      );
    }

    // Stage 4: Refine with testing requirements
    try {
      refinedTasks = refineWithTestingConstraints(refinedTasks, testingOutput);
      console.log(`  [Stage 4] After testing refinement: ${refinedTasks.length} tasks`);
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new StageExecutionError(
        `Testing refinement failed: ${error instanceof Error ? error.message : String(error)}`,
        "testing",
        { originalError: error, taskCount: refinedTasks.length }
      );
    }

    // Calculate quality metrics
    let metrics: MergedDecomposition["metrics"];
    try {
      metrics = calculateQualityMetrics(refinedTasks);
    } catch (error) {
      throw new MergerError(
        `Quality metrics calculation failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error, taskCount: refinedTasks.length }
      );
    }

    const result: MergedDecomposition = {
      taskId: architectureOutput.taskId,
      originalTask: architectureOutput.originalTask,
      microTasks: refinedTasks,
      metrics,
      recommendations: {
        architecture: architectureOutput.recommendations || [],
        security: securityOutput.securityRecommendations || [],
        performance: performanceOutput.performanceRecommendations || [],
        testing: testingOutput.testingRecommendations || [],
      },
    };

    const duration = Date.now() - startTime;
    console.log(`[merger] Sequential refinement complete in ${duration}ms`);
    console.log(`  Final task count: ${refinedTasks.length} (target: 12-16)`);
    console.log(`  Constraint completeness: ${(metrics.constraintCompleteness * 100).toFixed(1)}%`);
    console.log(`  Avg constraints per task: ${metrics.avgConstraintsPerTask.toFixed(1)}`);

    return result;
  } catch (error) {
    // Log error context for debugging
    console.error(
      "[merger] Sequential decomposition merge failed:",
      error instanceof Error ? error.message : String(error)
    );

    // Re-throw typed errors as-is
    if (error instanceof MergerError) {
      throw error;
    }

    // Wrap unexpected errors
    throw new MergerError(
      `Decomposition merge failed: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

// =============================================
// Input Validation (Sec-1.4: Type Validation)
// =============================================

/**
 * Validates decomposer output structure before processing.
 * Ensures all required fields are present and correctly typed.
 *
 * Throws: ValidationError if validation fails
 */
function validateDecomposerOutput(
  stageName: "architecture" | "security" | "performance" | "testing",
  output: any
): void {
  // Check if output is an object
  if (!output || typeof output !== "object") {
    throw new ValidationError(
      `${stageName} decomposer output must be an object`,
      {
        stage: stageName,
        receivedType: typeof output,
        receivedValue: output
      }
    );
  }

  // Check if microTasks exists
  if (!Array.isArray(output.microTasks)) {
    throw new ValidationError(
      `${stageName} decomposer output must have microTasks array`,
      {
        stage: stageName,
        hasMicroTasks: "microTasks" in output,
        microTasksType: typeof output.microTasks
      }
    );
  }

  // Validate each microTask has required fields
  for (let i = 0; i < output.microTasks.length; i++) {
    const task = output.microTasks[i];

    if (!task || typeof task !== "object") {
      throw new ValidationError(
        `${stageName} microTask[${i}] must be an object`,
        {
          stage: stageName,
          taskIndex: i,
          receivedType: typeof task
        }
      );
    }

    if (typeof task.id !== "string" || !task.id.trim()) {
      throw new ValidationError(
        `${stageName} microTask[${i}] must have non-empty id string`,
        {
          stage: stageName,
          taskIndex: i,
          hasId: "id" in task,
          idType: typeof task.id
        }
      );
    }

    if (typeof task.title !== "string" || !task.title.trim()) {
      throw new ValidationError(
        `${stageName} microTask[${i}] must have non-empty title string`,
        {
          stage: stageName,
          taskIndex: i,
          taskId: task.id,
          hasTitle: "title" in task,
          titleType: typeof task.title
        }
      );
    }

    if (typeof task.description !== "string" || !task.description.trim()) {
      throw new ValidationError(
        `${stageName} microTask[${i}] must have non-empty description string`,
        {
          stage: stageName,
          taskIndex: i,
          taskId: task.id,
          hasDescription: "description" in task,
          descriptionType: typeof task.description
        }
      );
    }
  }
}

// =============================================
// Stage 1: Architecture Baseline
// =============================================

function initializeFromArchitecture(architectureOutput: any): RefinedMicroTask[] {
  return architectureOutput.microTasks.map((task: any) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority || "medium",
    constraints: {
      architecture: {
        perspective: "architecture" as const,
        description: task.rationale || task.description,
        rationale: task.rationale || "Architecture baseline",
      },
    },
    dependencies: task.dependencies || [],
    estimatedEffort: task.estimatedEffort || "medium",
    refinementHistory: [
      {
        stage: "architecture" as const,
        change: "Initial architecture decomposition",
        timestamp: Date.now(),
      },
    ],
  }));
}

// =============================================
// Stage 2: Security Refinement
// =============================================

function refineWithSecurityConstraints(
  tasks: RefinedMicroTask[],
  securityOutput: any
): RefinedMicroTask[] {
  if (!Array.isArray(tasks)) {
    throw new ValidationError("refineWithSecurityConstraints: tasks must be an array", {
      receivedType: typeof tasks,
      stage: "security"
    });
  }

  if (!securityOutput || typeof securityOutput !== "object") {
    throw new ValidationError("refineWithSecurityConstraints: securityOutput must be an object", {
      receivedType: typeof securityOutput,
      stage: "security"
    });
  }

  const refinedTasks = [...tasks];
  const securityTasks = securityOutput.microTasks || [];

  if (!Array.isArray(securityTasks)) {
    throw new ValidationError("securityOutput.microTasks must be an array", {
      receivedType: typeof securityTasks,
      stage: "security"
    });
  }

  // Refine existing tasks with security constraints
  for (let i = 0; i < securityTasks.length; i++) {
    const secTask = securityTasks[i];

    try {
      if (!secTask || typeof secTask !== "object") {
        throw new ValidationError(
          `Security task[${i}] must be an object`,
          { taskIndex: i, receivedType: typeof secTask }
        );
      }

      const matchingTask = findMatchingTask(refinedTasks, secTask);

      if (matchingTask) {
        // Refine existing task
        matchingTask.constraints.security = {
          perspective: "security",
          description: secTask.description,
          rationale: secTask.rationale || "Security requirement",
          additionalContext: secTask.threatVectors?.join(", "),
        };

        matchingTask.refinementHistory.push({
          stage: "security",
          change: `Added security constraint: ${secTask.title}`,
          timestamp: Date.now(),
        });

        // Upgrade priority if security is critical
        if (secTask.priority === "critical" && matchingTask.priority !== "critical") {
          matchingTask.priority = "critical";
        }
      } else {
        // New security-specific task
        refinedTasks.push({
          id: secTask.id,
          title: secTask.title,
          description: secTask.description,
          priority: secTask.priority || "high",
          constraints: {
            security: {
              perspective: "security",
              description: secTask.description,
              rationale: secTask.rationale || "Security-specific requirement",
              additionalContext: secTask.threatVectors?.join(", "),
            },
          },
          dependencies: secTask.dependencies || [],
          estimatedEffort: secTask.estimatedEffort || "medium",
          refinementHistory: [
            {
              stage: "security",
              change: "New security-specific task",
              timestamp: Date.now(),
            },
          ],
        });
      }
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new TaskProcessingError(
        `Failed to process security task[${i}]: ${error instanceof Error ? error.message : String(error)}`,
        secTask?.id,
        { stage: "security", taskIndex: i, originalError: error }
      );
    }
  }

  return refinedTasks;
}

// =============================================
// Stage 3: Performance Refinement
// =============================================

function refineWithPerformanceConstraints(
  tasks: RefinedMicroTask[],
  performanceOutput: any
): RefinedMicroTask[] {
  if (!Array.isArray(tasks)) {
    throw new ValidationError("refineWithPerformanceConstraints: tasks must be an array", {
      receivedType: typeof tasks,
      stage: "performance"
    });
  }

  if (!performanceOutput || typeof performanceOutput !== "object") {
    throw new ValidationError("refineWithPerformanceConstraints: performanceOutput must be an object", {
      receivedType: typeof performanceOutput,
      stage: "performance"
    });
  }

  const refinedTasks = [...tasks];
  const perfTasks = performanceOutput.microTasks || [];

  if (!Array.isArray(perfTasks)) {
    throw new ValidationError("performanceOutput.microTasks must be an array", {
      receivedType: typeof perfTasks,
      stage: "performance"
    });
  }

  for (let i = 0; i < perfTasks.length; i++) {
    const perfTask = perfTasks[i];

    try {
      if (!perfTask || typeof perfTask !== "object") {
        throw new ValidationError(
          `Performance task[${i}] must be an object`,
          { taskIndex: i, receivedType: typeof perfTask }
        );
      }

      const matchingTask = findMatchingTask(refinedTasks, perfTask);

      if (matchingTask) {
        // Refine existing task
        matchingTask.constraints.performance = {
          perspective: "performance",
          description: perfTask.description,
          rationale: perfTask.rationale || "Performance optimization",
          additionalContext: perfTask.metrics?.join(", "),
        };

        matchingTask.refinementHistory.push({
          stage: "performance",
          change: `Added performance constraint: ${perfTask.title}`,
          timestamp: Date.now(),
        });
      } else {
        // New performance-specific task
        refinedTasks.push({
          id: perfTask.id,
          title: perfTask.title,
          description: perfTask.description,
          priority: perfTask.priority || "medium",
          constraints: {
            performance: {
              perspective: "performance",
              description: perfTask.description,
              rationale: perfTask.rationale || "Performance-specific requirement",
              additionalContext: perfTask.metrics?.join(", "),
            },
          },
          dependencies: perfTask.dependencies || [],
          estimatedEffort: perfTask.estimatedEffort || "medium",
          refinementHistory: [
            {
              stage: "performance",
              change: "New performance-specific task",
              timestamp: Date.now(),
            },
          ],
        });
      }
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new TaskProcessingError(
        `Failed to process performance task[${i}]: ${error instanceof Error ? error.message : String(error)}`,
        perfTask?.id,
        { stage: "performance", taskIndex: i, originalError: error }
      );
    }
  }

  return refinedTasks;
}

// =============================================
// Stage 4: Testing Refinement
// =============================================

function refineWithTestingConstraints(
  tasks: RefinedMicroTask[],
  testingOutput: any
): RefinedMicroTask[] {
  if (!Array.isArray(tasks)) {
    throw new ValidationError("refineWithTestingConstraints: tasks must be an array", {
      receivedType: typeof tasks,
      stage: "testing"
    });
  }

  if (!testingOutput || typeof testingOutput !== "object") {
    throw new ValidationError("refineWithTestingConstraints: testingOutput must be an object", {
      receivedType: typeof testingOutput,
      stage: "testing"
    });
  }

  const refinedTasks = [...tasks];
  const testTasks = testingOutput.microTasks || [];

  if (!Array.isArray(testTasks)) {
    throw new ValidationError("testingOutput.microTasks must be an array", {
      receivedType: typeof testTasks,
      stage: "testing"
    });
  }

  for (let i = 0; i < testTasks.length; i++) {
    const testTask = testTasks[i];

    try {
      if (!testTask || typeof testTask !== "object") {
        throw new ValidationError(
          `Testing task[${i}] must be an object`,
          { taskIndex: i, receivedType: typeof testTask }
        );
      }

      const matchingTask = findMatchingTask(refinedTasks, testTask);

      if (matchingTask) {
        // Refine existing task
        matchingTask.constraints.testing = {
          perspective: "testing",
          description: testTask.description,
          rationale: testTask.rationale || "Test coverage requirement",
          additionalContext: testTask.testTypes?.join(", "),
        };

        matchingTask.refinementHistory.push({
          stage: "testing",
          change: `Added testing constraint: ${testTask.title}`,
          timestamp: Date.now(),
        });
      } else {
        // New testing-specific task
        refinedTasks.push({
          id: testTask.id,
          title: testTask.title,
          description: testTask.description,
          priority: testTask.priority || "medium",
          constraints: {
            testing: {
              perspective: "testing",
              description: testTask.description,
              rationale: testTask.rationale || "Testing-specific requirement",
              additionalContext: testTask.testTypes?.join(", "),
            },
          },
          dependencies: testTask.dependencies || [],
          estimatedEffort: testTask.estimatedEffort || "medium",
          refinementHistory: [
            {
              stage: "testing",
              change: "New testing-specific task",
              timestamp: Date.now(),
            },
          ],
        });
      }
    } catch (error) {
      if (error instanceof MergerError) throw error;
      throw new TaskProcessingError(
        `Failed to process testing task[${i}]: ${error instanceof Error ? error.message : String(error)}`,
        testTask?.id,
        { stage: "testing", taskIndex: i, originalError: error }
      );
    }
  }

  return refinedTasks;
}

// =============================================
// Task Matching Logic
// =============================================

/**
 * Find matching task based on title similarity and scope overlap.
 *
 * This is the key to natural deduplication: we identify when a task
 * from a later stage is refining an earlier task vs. introducing
 * a completely new requirement.
 */
// P0 Fix: Task 2 - Merger Error Handling
function findMatchingTask(
  existingTasks: RefinedMicroTask[],
  newTask: any
): RefinedMicroTask | undefined {
  // P0 Fix: Validate inputs
  if (!Array.isArray(existingTasks)) {
    throw new Error(
      "[merger] findMatchingTask: Invalid input - existingTasks must be an array.\n" +
        `Received type: ${typeof existingTasks}. This indicates a corrupted refinement state.`
    );
  }

  if (!newTask || typeof newTask !== "object") {
    throw new Error(
      "[merger] findMatchingTask: Invalid input - newTask must be an object.\n" +
        `Received: ${JSON.stringify(newTask)} (type: ${typeof newTask}). ` +
        `This indicates malformed decomposer output.`
    );
  }

  if (!newTask.title || typeof newTask.title !== "string") {
    throw new Error(
      "[merger] findMatchingTask: newTask missing title field.\n" +
        `newTask: ${JSON.stringify(newTask)}. This indicates invalid task structure from decomposer.`
    );
  }

  // Exact title match
  const exactMatch = existingTasks.find((t) => t.title === newTask.title);
  if (exactMatch) return exactMatch;

  // Fuzzy title match (contains key words)
  const newTitleWords = extractKeyWords(newTask.title);
  const fuzzyMatch = existingTasks.find((t) => {
    const existingWords = extractKeyWords(t.title);
    const overlap = newTitleWords.filter((w) => existingWords.includes(w));
    return overlap.length >= 2; // At least 2 common words
  });

  return fuzzyMatch;
}

// P0 Fix: Task 2 - Merger Error Handling
function extractKeyWords(title: string): string[] {
  // P0 Fix: Validate input
  if (typeof title !== "string") {
    throw new Error(
      `[merger] extractKeyWords: Invalid input - title must be a string.\n` +
        `Received type: ${typeof title}, value: ${JSON.stringify(title)}. ` +
        `This indicates a task with invalid title field.`
    );
  }

  if (title.length === 0) {
    console.warn("[merger] extractKeyWords: Empty title string - returning empty keywords");
    return [];
  }

  const stopWords = ["the", "a", "an", "and", "or", "but", "with", "for"];
  return title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.includes(w));
}

// =============================================
// Quality Metrics
// =============================================

function calculateQualityMetrics(tasks: RefinedMicroTask[]): MergedDecomposition["metrics"] {
  // Validate input
  if (!Array.isArray(tasks)) {
    throw new ValidationError("calculateQualityMetrics: tasks must be an array", {
      receivedType: typeof tasks
    });
  }

  const totalTasks = tasks.length;

  // Handle edge case: no tasks
  if (totalTasks === 0) {
    throw new ValidationError("calculateQualityMetrics: cannot calculate metrics for empty task list", {
      taskCount: totalTasks
    });
  }

  try {
    // Validate task structure
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      if (!task || typeof task !== "object") {
        throw new ValidationError(
          `calculateQualityMetrics: task[${i}] must be an object`,
          { taskIndex: i, receivedType: typeof task }
        );
      }

      if (!task.constraints || typeof task.constraints !== "object") {
        throw new ValidationError(
          `calculateQualityMetrics: task[${i}].constraints must be an object`,
          { taskIndex: i, taskId: task.id }
        );
      }

      if (!Array.isArray(task.refinementHistory)) {
        throw new ValidationError(
          `calculateQualityMetrics: task[${i}].refinementHistory must be an array`,
          { taskIndex: i, taskId: task.id }
        );
      }
    }

    // Constraint completeness: % of tasks with all 4 constraint types
    const tasksWithAllConstraints = tasks.filter(
      (t) =>
        t.constraints.architecture &&
        t.constraints.security &&
        t.constraints.performance &&
        t.constraints.testing
    ).length;

    const constraintCompleteness = tasksWithAllConstraints / totalTasks;

    // Average constraints per task
    const totalConstraints = tasks.reduce((sum, t) => {
      return (
        sum +
        (t.constraints.architecture ? 1 : 0) +
        (t.constraints.security ? 1 : 0) +
        (t.constraints.performance ? 1 : 0) +
        (t.constraints.testing ? 1 : 0)
      );
    }, 0);

    const avgConstraintsPerTask = totalConstraints / totalTasks;

    // Refinement depth: average refinements per task
    const totalRefinements = tasks.reduce((sum, t) => sum + t.refinementHistory.length, 0);
    const refinementDepth = totalRefinements / totalTasks;

    // Validate calculated metrics
    if (!isFinite(constraintCompleteness) || !isFinite(avgConstraintsPerTask) || !isFinite(refinementDepth)) {
      throw new MergerError("Quality metrics calculation produced invalid values (NaN or Infinity)", {
        constraintCompleteness,
        avgConstraintsPerTask,
        refinementDepth
      });
    }

    return {
      totalTasks,
      constraintCompleteness,
      avgConstraintsPerTask,
      refinementDepth,
    };
  } catch (error) {
    if (error instanceof MergerError) throw error;
    throw new MergerError(
      `Quality metrics calculation failed: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error, totalTasks }
    );
  }
}
