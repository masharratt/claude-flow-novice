/**
 * Sprint Aggregator
 *
 * Aggregates micro-tasks into sprints for non-MDAP (CLI) execution.
 * Groups related tasks by category to reduce CLI invocations.
 *
 * Strategy:
 * 1. Group by category (architecture, security, performance, testing)
 * 2. Within each category, group by target directory
 * 3. Limit sprint size to MAX_TASKS_PER_SPRINT for manageable CLI execution
 *
 * Example:
 *   21 micro-tasks → 4 sprints (one per category)
 *   vs. 21 individual CLI calls
 *
 * @module sprint-aggregator
 * @version 1.0.0
 */

import type { Sprint, SprintMicroTask } from "../trigger/cfn-cli-sprint-implementer.js";
import type { DecompositionPlan } from "../trigger/cfn-decomposition-aggregator.js";

// =============================================
// Configuration
// =============================================

/** Maximum tasks per sprint (CLI can handle ~10 tasks effectively) */
const MAX_TASKS_PER_SPRINT = 10;

/** Minimum tasks to warrant a sprint (avoid single-task sprints) */
const MIN_TASKS_FOR_SPRINT = 1;

// =============================================
// Types
// =============================================

export interface AggregationResult {
  /** Generated sprints */
  sprints: Sprint[];
  /** Total micro-tasks processed */
  totalMicroTasks: number;
  /** Tasks per sprint distribution */
  distribution: {
    architecture: number;
    security: number;
    performance: number;
    testing: number;
  };
  /** Aggregation ratio (originalTasks / sprints) */
  aggregationRatio: number;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Extract category from micro-task perspective
 */
function extractCategory(microTask: DecompositionPlan['microTasks'][0]): 'architecture' | 'security' | 'performance' | 'testing' {
  const perspectives = microTask.perspectives || [];

  for (const p of perspectives) {
    if (p.perspective === 'architecture') return 'architecture';
    if (p.perspective === 'security') return 'security';
    if (p.perspective === 'performance') return 'performance';
    if (p.perspective === 'testing') return 'testing';
  }

  // Default to architecture if no perspective found
  return 'architecture';
}

/**
 * Extract target file from micro-task (heuristic)
 */
function extractTargetFile(microTask: DecompositionPlan['microTasks'][0]): string | undefined {
  // Check if description mentions a file
  const fileMatch = microTask.description.match(/(?:in|create|modify|update)\s+[`'"]([\w\/\.-]+\.[a-z]+)[`'"]/i);
  if (fileMatch) {
    return fileMatch[1];
  }

  // Check title for file references
  const titleMatch = microTask.title.match(/([\w\/\.-]+\.[a-z]+)/i);
  if (titleMatch) {
    return titleMatch[1];
  }

  return undefined;
}

/**
 * Generate sprint ID
 */
function generateSprintId(taskId: string, category: string, index: number): string {
  return `sprint-${taskId}-${category}-${index}`;
}

/**
 * Generate sprint name
 */
function generateSprintName(category: string, taskCount: number, index: number): string {
  const categoryNames = {
    architecture: 'Architecture',
    security: 'Security',
    performance: 'Performance',
    testing: 'Testing',
  };

  const name = categoryNames[category as keyof typeof categoryNames] || category;
  return `${name} Sprint ${index + 1} (${taskCount} tasks)`;
}

// =============================================
// Main Aggregation Function
// =============================================

/**
 * Aggregate micro-tasks from a decomposition plan into sprints
 *
 * @param decompositionPlan - The decomposition plan with micro-tasks
 * @param taskId - The parent task ID
 * @returns AggregationResult with sprints and statistics
 */
export function aggregateMicroTasksIntoSprints(
  decompositionPlan: DecompositionPlan,
  taskId: string
): AggregationResult {
  console.log(`[sprint-aggregator] Aggregating ${decompositionPlan.microTasks.length} micro-tasks...`);

  // Group by category
  const categoryGroups = new Map<string, SprintMicroTask[]>();

  for (const microTask of decompositionPlan.microTasks) {
    const category = extractCategory(microTask);
    const targetFile = extractTargetFile(microTask);

    const sprintTask: SprintMicroTask = {
      id: microTask.id,
      title: microTask.title,
      description: microTask.description,
      targetFile,
      category,
    };

    if (!categoryGroups.has(category)) {
      categoryGroups.set(category, []);
    }
    categoryGroups.get(category)!.push(sprintTask);
  }

  // Create sprints from category groups
  const sprints: Sprint[] = [];
  const distribution = {
    architecture: 0,
    security: 0,
    performance: 0,
    testing: 0,
  };

  for (const [category, tasks] of categoryGroups) {
    // Split into chunks if too many tasks
    const chunks: SprintMicroTask[][] = [];

    for (let i = 0; i < tasks.length; i += MAX_TASKS_PER_SPRINT) {
      const chunk = tasks.slice(i, i + MAX_TASKS_PER_SPRINT);
      if (chunk.length >= MIN_TASKS_FOR_SPRINT) {
        chunks.push(chunk);
      }
    }

    // Create a sprint for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const sprintId = generateSprintId(taskId, category, i);
      const sprintName = generateSprintName(category, chunk.length, i);

      // Collect estimated files
      const estimatedFiles = chunk
        .map(t => t.targetFile)
        .filter((f): f is string => f !== undefined);

      sprints.push({
        id: sprintId,
        name: sprintName,
        category: category as 'architecture' | 'security' | 'performance' | 'testing',
        microTasks: chunk,
        estimatedFiles,
      });
    }

    // Update distribution
    distribution[category as keyof typeof distribution] = tasks.length;
  }

  // Sort sprints by category priority (architecture first, testing last)
  const categoryOrder = ['architecture', 'security', 'performance', 'testing'];
  sprints.sort((a, b) => {
    return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
  });

  const totalMicroTasks = decompositionPlan.microTasks.length;
  const aggregationRatio = totalMicroTasks / Math.max(sprints.length, 1);

  console.log(`[sprint-aggregator] Created ${sprints.length} sprints from ${totalMicroTasks} micro-tasks`);
  console.log(`[sprint-aggregator] Aggregation ratio: ${aggregationRatio.toFixed(1)}x`);
  console.log(`[sprint-aggregator] Distribution: arch=${distribution.architecture}, sec=${distribution.security}, perf=${distribution.performance}, test=${distribution.testing}`);

  return {
    sprints,
    totalMicroTasks,
    distribution,
    aggregationRatio,
  };
}

/**
 * Estimate total execution time for sprints (CLI mode)
 *
 * @param sprints - The sprints to estimate
 * @param avgTimePerSprintMs - Average time per sprint in ms (default: 90s)
 * @returns Estimated total time in ms
 */
export function estimateSprintExecutionTime(
  sprints: Sprint[],
  avgTimePerSprintMs: number = 90000
): number {
  // Sprints execute sequentially by default (can be parallelized with care)
  return sprints.length * avgTimePerSprintMs;
}

/**
 * Get sprint summary for logging
 */
export function getSprintSummary(result: AggregationResult): string {
  const lines: string[] = [];
  lines.push(`Sprints: ${result.sprints.length}`);
  lines.push(`Micro-tasks: ${result.totalMicroTasks}`);
  lines.push(`Ratio: ${result.aggregationRatio.toFixed(1)}x reduction`);
  lines.push(`Est. time: ${(estimateSprintExecutionTime(result.sprints) / 60000).toFixed(1)} min (sequential)`);

  return lines.join(' | ');
}
