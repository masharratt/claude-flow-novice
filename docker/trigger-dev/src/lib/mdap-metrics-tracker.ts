/**
 * MDAP Metrics Tracker
 *
 * SQLite-based metrics tracking for MDAP model performance with automatic
 * tier escalation and model deprecation based on success rates.
 *
 * Features:
 * - Track success/failure per model
 * - Calculate success rates and quality scores
 * - Auto-deprecate underperforming models
 * - Recommend tier escalation based on metrics
 *
 * @module mdap-metrics-tracker
 */

import * as fs from "fs";
import * as path from "path";

// =============================================
// Types
// =============================================

/**
 * Model performance metrics stored in SQLite
 */
export interface ModelMetrics {
  /** Model name (e.g., "openai/gpt-oss-20b", "openai/gpt-oss-120b") */
  modelName: string;
  /** Tier level (1, 2, 3) */
  tier: number;
  /** Total times model was used */
  totalAttempts: number;
  /** Passed validation */
  successfulAttempts: number;
  /** Failed validation */
  failedAttempts: number;
  /** Average validator score (0-1) */
  avgQualityScore: number;
  /** Average execution time in ms */
  avgDurationMs: number;
  /** Average cost per task */
  avgCost: number;
  /** successfulAttempts / totalAttempts */
  successRate: number;
  /** When model was last used */
  lastUsed: Date;
  /** Auto-set when success rate < threshold */
  isDeprecated: boolean;
  /** Why it was deprecated */
  deprecationReason?: string;
}

/**
 * Metric recording input from MDAP implementer result
 */
export interface MetricRecordInput {
  /** Task ID */
  taskId: string;
  /** Micro-task ID */
  microTaskId: string;
  /** Model name used */
  modelName: string;
  /** Model tier (1-3) */
  modelTier: number;
  /** Whether the task succeeded */
  success: boolean;
  /** Execution duration in ms */
  durationMs: number;
  /** Estimated cost */
  estimatedCost: number;
  /** Tokens used (input/output) */
  tokens?: { input: number; output: number };
}

/**
 * Deprecation thresholds per tier
 */
export const DEPRECATION_THRESHOLDS: Record<number, number> = {
  1: 0.60, // T1 deprecated if < 60% success after 20 attempts
  2: 0.75, // T2 deprecated if < 75% success after 20 attempts
  3: 0.85, // T3 deprecated if < 85% success after 20 attempts
};

/**
 * Minimum attempts before deprecation can be evaluated
 */
export const MIN_ATTEMPTS_FOR_DEPRECATION = 20;

// =============================================
// In-Memory Storage (SQLite-like interface)
// =============================================

/**
 * In-memory metrics store (persisted to JSON file)
 * Using JSON file storage for simplicity - can be upgraded to SQLite
 */
interface MetricsStore {
  models: Record<string, ModelMetrics>;
  taskHistory: Array<{
    taskId: string;
    microTaskId: string;
    modelName: string;
    modelTier: number;
    success: boolean;
    qualityScore: number;
    durationMs: number;
    cost: number;
    timestamp: string;
  }>;
}

const METRICS_FILE_PATH = process.env.MDAP_METRICS_PATH ||
  path.join(process.cwd(), ".mdap-metrics.json");

let metricsStore: MetricsStore | null = null;

/**
 * Load metrics from persistent storage
 */
function loadMetrics(): MetricsStore {
  if (metricsStore) {
    return metricsStore;
  }

  try {
    if (fs.existsSync(METRICS_FILE_PATH)) {
      const data = fs.readFileSync(METRICS_FILE_PATH, "utf-8");
      metricsStore = JSON.parse(data);
      console.log(`[mdap-metrics] Loaded metrics from ${METRICS_FILE_PATH}`);
    } else {
      metricsStore = { models: {}, taskHistory: [] };
      console.log(`[mdap-metrics] Initialized new metrics store`);
    }
  } catch (error) {
    console.warn(`[mdap-metrics] Failed to load metrics, starting fresh: ${error}`);
    metricsStore = { models: {}, taskHistory: [] };
  }

  return metricsStore!;
}

/**
 * Save metrics to persistent storage
 */
function saveMetrics(): void {
  if (!metricsStore) return;

  try {
    // Ensure directory exists
    const dir = path.dirname(METRICS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(METRICS_FILE_PATH, JSON.stringify(metricsStore, null, 2));
  } catch (error) {
    console.error(`[mdap-metrics] Failed to save metrics: ${error}`);
  }
}

// =============================================
// Core Functions
// =============================================

/**
 * Record a metric from MDAP implementer execution
 *
 * @param input - Metric data from MDAP implementer result
 * @param validationPassed - Whether async validation passed
 * @param qualityScore - Quality score from validators (0-1)
 */
export async function recordMetric(
  input: MetricRecordInput,
  validationPassed: boolean,
  qualityScore: number
): Promise<void> {
  const store = loadMetrics();
  const { modelName, modelTier, success, durationMs, estimatedCost } = input;

  // Initialize model metrics if not exists
  if (!store.models[modelName]) {
    store.models[modelName] = {
      modelName,
      tier: modelTier,
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      avgQualityScore: 0,
      avgDurationMs: 0,
      avgCost: 0,
      successRate: 0,
      lastUsed: new Date(),
      isDeprecated: false,
    };
  }

  const model = store.models[modelName];

  // Update attempt counts
  model.totalAttempts++;
  if (success && validationPassed) {
    model.successfulAttempts++;
  } else {
    model.failedAttempts++;
  }

  // Update rolling averages
  const n = model.totalAttempts;
  model.avgQualityScore = ((model.avgQualityScore * (n - 1)) + qualityScore) / n;
  model.avgDurationMs = ((model.avgDurationMs * (n - 1)) + durationMs) / n;
  model.avgCost = ((model.avgCost * (n - 1)) + estimatedCost) / n;

  // Calculate success rate
  model.successRate = model.successfulAttempts / model.totalAttempts;
  model.lastUsed = new Date();

  // Record task history
  store.taskHistory.push({
    taskId: input.taskId,
    microTaskId: input.microTaskId,
    modelName,
    modelTier,
    success: success && validationPassed,
    qualityScore,
    durationMs,
    cost: estimatedCost,
    timestamp: new Date().toISOString(),
  });

  // Keep history bounded (last 1000 entries)
  if (store.taskHistory.length > 1000) {
    store.taskHistory = store.taskHistory.slice(-1000);
  }

  saveMetrics();

  console.log(
    `[mdap-metrics] Recorded: ${modelName} (T${modelTier}) ` +
    `success=${success && validationPassed} quality=${qualityScore.toFixed(2)} ` +
    `rate=${(model.successRate * 100).toFixed(1)}% (${model.successfulAttempts}/${model.totalAttempts})`
  );
}

/**
 * Get metrics for a specific model
 *
 * @param modelName - Model name to query
 * @returns Model metrics or undefined if not found
 */
export async function getModelMetrics(modelName: string): Promise<ModelMetrics | undefined> {
  const store = loadMetrics();
  return store.models[modelName];
}

/**
 * Get all model metrics
 *
 * @returns Array of all model metrics
 */
export async function getAllModelMetrics(): Promise<ModelMetrics[]> {
  const store = loadMetrics();
  return Object.values(store.models);
}

/**
 * Check if a model should be deprecated based on its metrics
 *
 * @param modelName - Model name to check
 * @returns True if model should be deprecated
 */
export async function checkDeprecation(modelName: string): Promise<boolean> {
  const store = loadMetrics();
  const model = store.models[modelName];

  if (!model) {
    return false; // Unknown model, can't deprecate
  }

  // Already deprecated
  if (model.isDeprecated) {
    return true;
  }

  // Need minimum attempts before deprecation
  if (model.totalAttempts < MIN_ATTEMPTS_FOR_DEPRECATION) {
    return false;
  }

  const threshold = DEPRECATION_THRESHOLDS[model.tier] || 0.60;

  if (model.successRate < threshold) {
    // Mark as deprecated
    model.isDeprecated = true;
    model.deprecationReason =
      `Success rate ${(model.successRate * 100).toFixed(1)}% below threshold ` +
      `${(threshold * 100).toFixed(0)}% after ${model.totalAttempts} attempts`;

    saveMetrics();

    console.log(
      `[mdap-metrics] DEPRECATED: ${modelName} (T${model.tier}) - ${model.deprecationReason}`
    );

    return true;
  }

  return false;
}

/**
 * Check all models for deprecation
 *
 * @returns Array of model names that were deprecated
 */
export async function checkAllModelsForDeprecation(): Promise<string[]> {
  const store = loadMetrics();
  const deprecated: string[] = [];

  for (const modelName of Object.keys(store.models)) {
    const isDeprecated = await checkDeprecation(modelName);
    if (isDeprecated) {
      deprecated.push(modelName);
    }
  }

  return deprecated;
}

/**
 * Get recommended tier based on complexity and failure history
 *
 * This function uses metrics to recommend a starting tier that's more likely
 * to succeed, avoiding known-bad models.
 *
 * @param complexity - Task complexity (simple, moderate, complex)
 * @param failureCount - Previous failure count for this task
 * @returns Recommended tier (1-3)
 */
export async function getRecommendedTier(
  complexity: string,
  failureCount: number
): Promise<number> {
  const store = loadMetrics();

  // Base tier from complexity
  const baseTier = complexity === "complex" ? 3 :
                   complexity === "moderate" ? 2 : 1;

  // Apply failure escalation
  const escalatedTier = Math.min(baseTier + failureCount, 3);

  // Check if we have any tracked models
  const models = Object.values(store.models);

  // If no models tracked yet, use the calculated tier (no deprecation data)
  if (models.length === 0) {
    return escalatedTier;
  }

  // Check if the target tier's model is deprecated
  const targetTierModels = models.filter(m => m.tier === escalatedTier);

  // If no models for target tier tracked, use the calculated tier
  if (targetTierModels.length === 0) {
    return escalatedTier;
  }

  // Check if all models for target tier are deprecated
  const allDeprecated = targetTierModels.every(m => m.isDeprecated);

  if (!allDeprecated) {
    // Use the calculated tier (at least one model is not deprecated)
    return escalatedTier;
  }

  // If target tier model is deprecated, find next best
  for (let tier = escalatedTier + 1; tier <= 3; tier++) {
    const tierModels = models.filter(m => m.tier === tier);
    const hasNonDeprecated = tierModels.some(m => !m.isDeprecated);

    // If no models for this tier or has non-deprecated model, use it
    if (tierModels.length === 0 || hasNonDeprecated) {
      console.log(
        `[mdap-metrics] T${escalatedTier} deprecated, recommending T${tier}`
      );
      return tier;
    }
  }

  // Fallback to highest tier if all lower tiers deprecated
  return 3;
}

/**
 * Reset deprecated status for a model (for testing or recovery)
 *
 * @param modelName - Model name to reset
 */
export async function resetDeprecation(modelName: string): Promise<void> {
  const store = loadMetrics();
  const model = store.models[modelName];

  if (model) {
    model.isDeprecated = false;
    model.deprecationReason = undefined;
    saveMetrics();
    console.log(`[mdap-metrics] Reset deprecation for ${modelName}`);
  }
}

/**
 * Clear all metrics (for testing)
 */
export async function clearAllMetrics(): Promise<void> {
  metricsStore = { models: {}, taskHistory: [] };
  saveMetrics();
  console.log(`[mdap-metrics] Cleared all metrics`);
}

/**
 * Get recent task history
 *
 * @param limit - Maximum number of entries to return
 * @returns Recent task history entries
 */
export async function getRecentHistory(limit: number = 50): Promise<MetricsStore["taskHistory"]> {
  const store = loadMetrics();
  return store.taskHistory.slice(-limit);
}

// =============================================
// Reporting Functions
// =============================================

/**
 * Print a formatted metrics summary to console
 */
export async function printMetricsSummary(): Promise<void> {
  const models = await getAllModelMetrics();

  if (models.length === 0) {
    console.log("\n=== MDAP Model Performance Summary ===");
    console.log("No metrics recorded yet.");
    return;
  }

  // Sort by tier
  models.sort((a, b) => a.tier - b.tier);

  console.log("\n=== MDAP Model Performance Summary ===");
  console.log("=" .repeat(50));

  for (const model of models) {
    console.log(`\n${model.modelName} (T${model.tier}):`);
    console.log(`  Success Rate: ${(model.successRate * 100).toFixed(1)}%`);
    console.log(`  Attempts: ${model.successfulAttempts}/${model.totalAttempts}`);
    console.log(`  Avg Quality: ${model.avgQualityScore.toFixed(2)}`);
    console.log(`  Avg Duration: ${Math.round(model.avgDurationMs)}ms`);
    console.log(`  Avg Cost: $${model.avgCost.toFixed(4)}`);
    console.log(`  Last Used: ${new Date(model.lastUsed).toISOString()}`);
    console.log(`  Deprecated: ${model.isDeprecated ? 'YES - ' + model.deprecationReason : 'NO'}`);
  }

  console.log("\n" + "=".repeat(50));

  // Summary stats
  const totalAttempts = models.reduce((sum, m) => sum + m.totalAttempts, 0);
  const totalSuccess = models.reduce((sum, m) => sum + m.successfulAttempts, 0);
  const deprecatedCount = models.filter(m => m.isDeprecated).length;

  console.log(`Total Attempts: ${totalAttempts}`);
  console.log(`Overall Success Rate: ${totalAttempts > 0 ? ((totalSuccess / totalAttempts) * 100).toFixed(1) : 0}%`);
  console.log(`Deprecated Models: ${deprecatedCount}/${models.length}`);
}

/**
 * Get metrics summary as an object (for API responses)
 */
export async function getMetricsSummary(): Promise<{
  models: ModelMetrics[];
  totalAttempts: number;
  overallSuccessRate: number;
  deprecatedCount: number;
  averageQuality: number;
  averageDuration: number;
}> {
  const models = await getAllModelMetrics();

  const totalAttempts = models.reduce((sum, m) => sum + m.totalAttempts, 0);
  const totalSuccess = models.reduce((sum, m) => sum + m.successfulAttempts, 0);
  const deprecatedCount = models.filter(m => m.isDeprecated).length;

  const avgQuality = models.length > 0
    ? models.reduce((sum, m) => sum + m.avgQualityScore * m.totalAttempts, 0) / Math.max(totalAttempts, 1)
    : 0;

  const avgDuration = models.length > 0
    ? models.reduce((sum, m) => sum + m.avgDurationMs * m.totalAttempts, 0) / Math.max(totalAttempts, 1)
    : 0;

  return {
    models,
    totalAttempts,
    overallSuccessRate: totalAttempts > 0 ? totalSuccess / totalAttempts : 0,
    deprecatedCount,
    averageQuality: avgQuality,
    averageDuration: avgDuration,
  };
}

// =============================================
// Exports
// =============================================

export default {
  recordMetric,
  getModelMetrics,
  getAllModelMetrics,
  checkDeprecation,
  checkAllModelsForDeprecation,
  getRecommendedTier,
  resetDeprecation,
  clearAllMetrics,
  getRecentHistory,
  printMetricsSummary,
  getMetricsSummary,
};
