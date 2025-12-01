/**
 * MDAP (Multi-Dimensional Agent Performance) Configuration
 *
 * Model tier configuration for intelligent escalation based on task complexity
 * and historical performance. Enables cost-effective agent execution by starting
 * with lower-cost models and escalating only when needed.
 *
 * MDAP outputs tier names (haiku/sonnet/opus) - provider-specific model mapping
 * is handled by .claude/config/provider-model-mappings.yaml
 *
 * ATOMICITY ENFORCEMENT:
 * - All tasks are analyzed for atomicity before execution
 * - Non-atomic tasks are auto-decomposed into micro-tasks
 * - Each micro-task: one file, one action, <50 lines
 * - This maximizes T1 success rate (target: >95%)
 *
 * @module mdap-config
 * @version 2.0.0
 */

import {
  analyzeAtomicity,
  enforceAtomicity,
  getAtomicitySummary,
  type AtomicityAnalysis,
  type MicroTask,
} from './mdap-atomicity.js';

// =============================================
// Type Definitions
// =============================================

/**
 * Canonical model tier names used across all providers
 * Provider-specific model IDs are resolved via provider-model-mappings.yaml
 */
export type ModelTierName = 'haiku' | 'sonnet' | 'opus';

/**
 * Model tier configuration
 */
export interface ModelTier {
  /** Tier level (1-3, higher = more capable/expensive) */
  tier: 1 | 2 | 3;
  /** Canonical tier name - maps to provider-specific models via YAML config */
  name: ModelTierName;
  /** Cost multiplier relative to tier 1 */
  costMultiplier: number;
  /** Target latency in milliseconds */
  latencyTarget: number;
  /** Expected quality score (0.0-1.0) */
  qualityTarget: number;
  /** Description of appropriate use cases */
  useCase: string;
}

/**
 * Complexity level classification
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'large';

// =============================================
// Model Tier Definitions
// =============================================

/**
 * Three-tier model hierarchy
 *
 * Conservative escalation strategy:
 * - Start with lowest viable tier for task complexity
 * - Escalate +1 tier per failure
 * - Maximum tier is 3 (opus)
 *
 * MDAP only defines tier names (haiku/sonnet/opus).
 * Provider-specific model IDs are resolved via provider-model-mappings.yaml
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    tier: 1,
    name: 'haiku',
    costMultiplier: 1.0,
    latencyTarget: 2000,
    qualityTarget: 0.70,
    useCase: 'Simple tasks, fast iteration, typo fixes',
  },
  {
    tier: 2,
    name: 'sonnet',
    costMultiplier: 15.0,
    latencyTarget: 4000,
    qualityTarget: 0.90,
    useCase: 'Moderate to complex tasks, production quality',
  },
  {
    tier: 3,
    name: 'opus',
    costMultiplier: 75.0,
    latencyTarget: 8000,
    qualityTarget: 0.98,
    useCase: 'Mission-critical, maximum quality',
  },
];

// =============================================
// Complexity to Starting Tier Mapping
// =============================================

/**
 * Maps complexity levels to starting model tiers
 *
 * Conservative strategy:
 * - Simple: Start T1 (haiku), escalate on failure
 * - Moderate: Start T2 (sonnet), escalate on failure
 * - Complex/Large: Start T3 (opus), no escalation possible
 */
const COMPLEXITY_STARTING_TIER: Record<ComplexityLevel, 1 | 2 | 3> = {
  simple: 1,
  moderate: 2,
  complex: 3,
  large: 3,
};

// =============================================
// Functions
// =============================================

/**
 * Get a model tier by tier number
 *
 * @param tier - Tier number (1-3)
 * @returns ModelTier or undefined if invalid tier
 */
export function getModelTier(tier: number): ModelTier | undefined {
  return MODEL_TIERS.find(t => t.tier === tier);
}

/**
 * Get a model tier by name
 *
 * @param name - Tier name (haiku/sonnet/opus)
 * @returns ModelTier or undefined if invalid name
 */
export function getModelTierByName(name: ModelTierName): ModelTier | undefined {
  return MODEL_TIERS.find(t => t.name === name);
}

/**
 * Select the appropriate model tier based on task complexity and execution history
 *
 * Algorithm:
 * 1. Determine base tier from complexity level
 * 2. Apply escalation based on failure count (+1 tier per failure)
 * 3. Use currentTier if explicitly provided and higher than calculated
 * 4. Cap at tier 3 (maximum - opus)
 *
 * @param complexityLevel - Task complexity classification
 * @param currentTier - Current tier if retrying (default: 1)
 * @param failureCount - Number of previous failures (default: 0)
 * @returns Selected ModelTier
 */
export function selectModelTier(
  complexityLevel: string,
  currentTier: number = 1,
  failureCount: number = 0
): ModelTier {
  // Normalize complexity level
  const normalizedComplexity = (complexityLevel?.toLowerCase() || 'moderate') as ComplexityLevel;

  // Get base tier from complexity
  const baseTier = COMPLEXITY_STARTING_TIER[normalizedComplexity] ??
    COMPLEXITY_STARTING_TIER.moderate;

  // Calculate escalated tier based on failures
  const escalatedTier = baseTier + failureCount;

  // Use the higher of current tier or escalated tier
  const selectedTier = Math.max(currentTier, escalatedTier);

  // Cap at tier 3 (opus)
  const finalTier = Math.min(selectedTier, 3) as 1 | 2 | 3;

  const modelTier = MODEL_TIERS.find(t => t.tier === finalTier);

  // Should never happen, but fallback to tier 2 (sonnet) if undefined
  if (!modelTier) {
    console.warn(`[mdap-config] Invalid tier ${finalTier}, falling back to tier 2`);
    return MODEL_TIERS[1]; // Tier 2 (sonnet)
  }

  return modelTier;
}

/**
 * Calculate estimated cost based on tier and token counts
 *
 * This is a rough approximation using cost multipliers.
 * Actual costs depend on provider pricing.
 *
 * @param tier - ModelTier used
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Estimated cost in relative units
 */
export function estimateCost(
  tier: ModelTier,
  inputTokens: number = 0,
  outputTokens: number = 0
): number {
  // Base cost per 1000 tokens (arbitrary units, T1 = $1/1M tokens equivalent)
  const baseCostPer1K = 0.001;

  const totalTokens = inputTokens + outputTokens;
  const baseCost = (totalTokens / 1000) * baseCostPer1K;

  return baseCost * tier.costMultiplier;
}

/**
 * Determine if escalation is recommended based on execution metrics
 *
 * @param success - Whether the task succeeded
 * @param confidence - Confidence score (0.0-1.0)
 * @param currentTier - Current model tier
 * @param latencyMs - Execution latency in milliseconds
 * @returns Escalation recommendation
 */
export function shouldEscalate(
  success: boolean,
  confidence: number,
  currentTier: ModelTier,
  latencyMs: number
): { escalate: boolean; reason: string } {
  // Already at max tier
  if (currentTier.tier >= 3) {
    return { escalate: false, reason: 'Already at maximum tier (opus)' };
  }

  // Failed task - escalate
  if (!success) {
    return { escalate: true, reason: 'Task failed, escalating for retry' };
  }

  // Low confidence - escalate if significantly below target
  if (confidence < currentTier.qualityTarget * 0.8) {
    return {
      escalate: true,
      reason: `Confidence ${confidence.toFixed(2)} below threshold ${(currentTier.qualityTarget * 0.8).toFixed(2)}`,
    };
  }

  // High latency - might indicate struggling model
  if (latencyMs > currentTier.latencyTarget * 2) {
    return {
      escalate: true,
      reason: `Latency ${latencyMs}ms exceeds 2x target ${currentTier.latencyTarget}ms`,
    };
  }

  return { escalate: false, reason: 'Performance within acceptable range' };
}

/**
 * Get tier summary for logging/debugging
 *
 * @param tier - ModelTier to summarize
 * @returns Human-readable summary string
 */
export function getTierSummary(tier: ModelTier): string {
  return `T${tier.tier}/${tier.name} (cost:${tier.costMultiplier}x, quality:${tier.qualityTarget})`;
}

/**
 * Get all tiers as a summary table
 *
 * @returns Array of tier summaries
 */
export function getTierTable(): Array<{
  tier: 1 | 2 | 3;
  name: ModelTierName;
  costMultiplier: number;
  qualityTarget: number;
  useCase: string;
}> {
  return MODEL_TIERS.map(t => ({
    tier: t.tier,
    name: t.name,
    costMultiplier: t.costMultiplier,
    qualityTarget: t.qualityTarget,
    useCase: t.useCase,
  }));
}

// =============================================
// Atomicity-Aware Task Processing
// =============================================

/**
 * Task decomposition result
 */
export interface TaskDecomposition {
  /** Original task description */
  originalTask: string;
  /** Whether decomposition was needed */
  wasDecomposed: boolean;
  /** Atomicity analysis of original task */
  analysis: AtomicityAnalysis;
  /** Resulting micro-tasks (1 if already atomic, N if decomposed) */
  microTasks: MicroTask[];
  /** Recommended model tier for each micro-task */
  recommendedTiers: Map<string, ModelTier>;
}

/**
 * Process a task description with atomicity enforcement
 *
 * This is the main entry point for MDAP task processing.
 * It analyzes the task, decomposes if needed, and assigns model tiers.
 *
 * @param taskDescription - The task to process
 * @param provider - AI provider (for model selection)
 * @param forceDecompose - Force decomposition even if task appears atomic
 * @returns TaskDecomposition with micro-tasks and tier assignments
 */
export function processTaskWithAtomicity(
  taskDescription: string,
  provider: string = 'zai',
  forceDecompose: boolean = false
): TaskDecomposition {
  // Analyze atomicity
  const analysis = analyzeAtomicity(taskDescription);

  console.log(`[mdap] Atomicity: ${getAtomicitySummary(analysis)}`);

  // Enforce atomicity (decompose if needed)
  const microTasks = enforceAtomicity(taskDescription, forceDecompose);
  const wasDecomposed = microTasks.length > 1 || !analysis.isAtomic;

  if (wasDecomposed) {
    console.log(`[mdap] Decomposed into ${microTasks.length} micro-tasks:`);
    microTasks.forEach((mt, i) => {
      console.log(`  ${i + 1}. ${mt.description} (${mt.action} → ${mt.targetFile})`);
    });
  }

  // Assign model tiers to each micro-task
  const recommendedTiers = new Map<string, ModelTier>();

  for (const microTask of microTasks) {
    // All micro-tasks start at T1 since they're atomic
    const tier = selectModelTier(microTask.complexity, 1, 0);
    recommendedTiers.set(microTask.id, tier);
  }

  return {
    originalTask: taskDescription,
    wasDecomposed,
    analysis,
    microTasks,
    recommendedTiers,
  };
}

/**
 * Get the tier name for a micro-task
 *
 * Returns the canonical tier name (haiku/sonnet/opus).
 * The caller should use provider-model-mappings.yaml to resolve
 * to a provider-specific model ID.
 *
 * @param microTask - The micro-task
 * @param decomposition - The task decomposition containing tier assignments
 * @returns Canonical tier name (haiku/sonnet/opus)
 */
export function getTierForMicroTask(
  microTask: MicroTask,
  decomposition: TaskDecomposition
): ModelTierName {
  const tier = decomposition.recommendedTiers.get(microTask.id);

  if (!tier) {
    // Fallback to T1 (haiku)
    return 'haiku';
  }

  return tier.name;
}

/**
 * Check if a task needs decomposition
 *
 * Quick check without full decomposition.
 *
 * @param taskDescription - Task to check
 * @returns true if task needs decomposition
 */
export function needsDecomposition(taskDescription: string): boolean {
  const analysis = analyzeAtomicity(taskDescription);
  return !analysis.isAtomic;
}

/**
 * Get atomicity score for a task (0.0-1.0)
 *
 * Higher score = more atomic = better for T1.
 *
 * @param taskDescription - Task to score
 * @returns Atomicity score
 */
export function getAtomicityScore(taskDescription: string): number {
  const analysis = analyzeAtomicity(taskDescription);

  if (!analysis.isAtomic) {
    // Penalize based on violations
    return Math.max(0.1, 0.5 - (analysis.violations.length * 0.1));
  }

  return analysis.confidence;
}

// Re-export atomicity functions for convenience
export {
  analyzeAtomicity,
  enforceAtomicity,
  getAtomicitySummary,
  type AtomicityAnalysis,
  type MicroTask,
};

// =============================================
// RuVector-Aware Tier Selection
// =============================================

/**
 * Select model tier with RuVector intelligence
 *
 * Uses historical performance data from RuVector to make smarter tier
 * selection decisions. Falls back to standard selection if RuVector
 * is unavailable or has insufficient data.
 *
 * @param complexityLevel - Task complexity classification
 * @param currentTier - Current tier if retrying
 * @param failureCount - Number of previous failures
 * @param taskType - Optional task type hint
 * @returns Selected ModelTier
 *
 * @example
 * // With RuVector enabled
 * const tier = await selectModelTierWithRuVector('simple', 1, 0, 'implementation');
 * // If RuVector shows T1 has <60% success for similar tasks, may recommend T2
 */
export async function selectModelTierWithRuVector(
  complexityLevel: string,
  currentTier: number = 1,
  failureCount: number = 0,
  taskType?: string
): Promise<ModelTier> {
  try {
    // Dynamic import to avoid circular dependencies
    const { selectModelTierWithRuVector: ruVectorSelect } = await import('./ruvector-mdap-analytics.js');

    // Get RuVector recommendation
    const recommendedTierNumber = await ruVectorSelect(complexityLevel, failureCount, taskType);

    // Use the higher of current tier, failure-escalated tier, or RuVector recommendation
    const baseTier = selectModelTier(complexityLevel, currentTier, failureCount);
    const selectedTierNumber = Math.max(baseTier.tier, recommendedTierNumber);

    const finalTier = Math.min(selectedTierNumber, 3) as 1 | 2 | 3;
    const modelTier = MODEL_TIERS.find(t => t.tier === finalTier);

    if (!modelTier) {
      return MODEL_TIERS[1]; // Fallback to tier 2
    }

    if (modelTier.tier !== baseTier.tier) {
      console.log(
        `[mdap-config] RuVector adjusted tier: T${baseTier.tier} -> T${modelTier.tier} ` +
        `(complexity: ${complexityLevel}, failures: ${failureCount})`
      );
    }

    return modelTier;
  } catch (error) {
    // Fallback to standard selection if RuVector unavailable
    console.warn(
      `[mdap-config] RuVector tier selection failed, using standard: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return selectModelTier(complexityLevel, currentTier, failureCount);
  }
}
