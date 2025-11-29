/**
 * Provider Router for MDAP v2
 *
 * Intelligently routes tasks between Cerebras (cost-optimized) and Sonnet (quality fallback)
 * based on task complexity and failure patterns.
 *
 * Strategy:
 * - Simple/Moderate: Cerebras with auto-iteration (fast, cheap)
 * - Complex: Sonnet with extended iteration (safe, high-quality)
 * - Failures: Fallback from Cerebras to Sonnet for safety-critical code
 */

import * as cerebrasProvider from "./cerebras-provider.js";
import * as sonnetProvider from "./sonnet-provider.js";

// =============================================
// Types
// =============================================

export type Complexity = "simple" | "moderate" | "complex";

export interface ProviderConfig {
  provider: "cerebras" | "sonnet";
  complexity: Complexity;
  reason: string;
  estimatedCost: number;
  estimatedSeconds: number;
  maxIterations: number;
  modelId?: string;
}

export interface GenerateCodeResult {
  implementation: string;
  tests: string;
  provider: string;
  modelUsed?: string;
  iterations: number;
  totalTokens?: number;
  cost: number;
  duration: number;
  success: boolean;
}

// =============================================
// Provider Selection Logic
// =============================================

export function selectProvider(complexity: Complexity): ProviderConfig {
  switch (complexity) {
    case "simple":
      return {
        provider: "cerebras",
        complexity: "simple",
        reason: "Simple tasks benefit from Cerebras speed (gpt-oss-120b)",
        estimatedCost: 0.002,
        estimatedSeconds: 5,
        maxIterations: 2,
        modelId: "gpt-oss-120b",
      };

    case "moderate":
      return {
        provider: "cerebras",
        complexity: "moderate",
        reason: "Moderate tasks use Cerebras balanced tier (llama-3.3-70b)",
        estimatedCost: 0.005,
        estimatedSeconds: 10,
        maxIterations: 3,
        modelId: "llama-3.3-70b",
      };

    case "complex":
      return {
        provider: "sonnet",
        complexity: "complex",
        reason: "Complex tasks use Sonnet for safety-critical code",
        estimatedCost: 0.06,
        estimatedSeconds: 10,
        maxIterations: 5,
      };

    default:
      throw new Error(
        `Invalid complexity: ${complexity}. Must be 'simple', 'moderate', or 'complex'`
      );
  }
}

// =============================================
// Cost Estimation
// =============================================

export function estimateCost(complexity: Complexity): number {
  const config = selectProvider(complexity);
  return config.estimatedCost;
}

export function estimateTime(complexity: Complexity): number {
  const config = selectProvider(complexity);
  return config.estimatedSeconds;
}

// =============================================
// Core Generation Function
// =============================================

export async function generateCode(
  taskDescription: string,
  complexity: Complexity
): Promise<GenerateCodeResult> {
  const config = selectProvider(complexity);
  const startTime = Date.now();

  console.log(`[ProviderRouter] Selecting provider for complexity: ${complexity}`);
  console.log(`[ProviderRouter] Provider: ${config.provider} | Reason: ${config.reason}`);
  console.log(
    `[ProviderRouter] Estimated: $${config.estimatedCost} | ${config.estimatedSeconds}s`
  );

  try {
    if (config.provider === "cerebras") {
      return await generateWithCerebras(taskDescription, config, startTime);
    } else {
      return await generateWithSonnet(taskDescription, config, startTime);
    }
  } catch (error) {
    console.error(`[ProviderRouter] ${config.provider} failed, attempting fallback...`);
    // Fallback to Sonnet if Cerebras fails on complex tasks
    if (complexity === "complex" || config.provider === "cerebras") {
      console.log(`[ProviderRouter] Falling back to Sonnet`);
      const fallbackConfig = {
        provider: "sonnet" as const,
        complexity,
        reason: "Fallback after provider failure",
        estimatedCost: 0.06,
        estimatedSeconds: 10,
        maxIterations: 5,
      };
      return await generateWithSonnet(taskDescription, fallbackConfig, startTime);
    }
    throw error;
  }
}

// =============================================
// Cerebras Generation
// =============================================

async function generateWithCerebras(
  taskDescription: string,
  config: ProviderConfig,
  startTime: number
): Promise<GenerateCodeResult> {
  if (!config.modelId) {
    throw new Error("Model ID required for Cerebras provider");
  }

  console.log(`[Cerebras] Starting generation with ${config.modelId}`);

  const result = await cerebrasProvider.generateWithIteration(
    taskDescription,
    config.maxIterations,
    config.complexity
  );

  const duration = Date.now() - startTime;
  const actualCost = (result.totalTokens ?? 0) * 0.00000125; // Cerebras pricing

  return {
    implementation: result.implementation,
    tests: result.tests,
    provider: "cerebras",
    modelUsed: config.modelId,
    iterations: result.iterations,
    totalTokens: result.totalTokens,
    cost: actualCost,
    duration: Math.round(duration / 1000),
    success: result.success,
  };
}

// =============================================
// Sonnet Generation
// =============================================

async function generateWithSonnet(
  taskDescription: string,
  config: ProviderConfig,
  startTime: number
): Promise<GenerateCodeResult> {
  console.log(`[Sonnet] Starting generation with Claude 3.5 Sonnet`);

  const result = await sonnetProvider.generateWithIteration(
    taskDescription,
    config.maxIterations
  );

  const duration = Date.now() - startTime;
  // Sonnet pricing: ~4000 tokens per task, $0.06 per task (estimated)
  const actualCost = result.totalTokens
    ? (result.totalTokens / 1000000) * 3.0 // Simplified Sonnet pricing
    : config.estimatedCost;

  return {
    implementation: result.implementation,
    tests: result.tests,
    provider: "sonnet",
    iterations: result.iterations,
    totalTokens: result.totalTokens,
    cost: actualCost,
    duration: Math.round(duration / 1000),
    success: result.success,
  };
}

// =============================================
// Analytics and Reporting
// =============================================

interface ProviderMetrics {
  complexity: Complexity;
  provider: string;
  iterations: number;
  cost: number;
  duration: number;
  success: boolean;
  tokensUsed?: number;
}

const metrics: ProviderMetrics[] = [];

export function recordMetric(metric: ProviderMetrics): void {
  metrics.push(metric);
}

export function getAnalytics() {
  const byProvider = new Map<string, ProviderMetrics[]>();
  const byComplexity = new Map<Complexity, ProviderMetrics[]>();

  for (const metric of metrics) {
    if (!byProvider.has(metric.provider)) {
      byProvider.set(metric.provider, []);
    }
    byProvider.get(metric.provider)!.push(metric);

    if (!byComplexity.has(metric.complexity)) {
      byComplexity.set(metric.complexity, []);
    }
    byComplexity.get(metric.complexity)!.push(metric);
  }

  return {
    totalCalls: metrics.length,
    byProvider: Object.fromEntries(
      Array.from(byProvider.entries()).map(([provider, items]) => [
        provider,
        {
          count: items.length,
          avgCost: items.reduce((sum, m) => sum + m.cost, 0) / items.length,
          avgDuration: items.reduce((sum, m) => sum + m.duration, 0) / items.length,
          successRate: items.filter((m) => m.success).length / items.length,
          avgIterations: items.reduce((sum, m) => sum + m.iterations, 0) / items.length,
        },
      ])
    ),
    byComplexity: Object.fromEntries(
      Array.from(byComplexity.entries()).map(([complexity, items]) => [
        complexity,
        {
          count: items.length,
          avgCost: items.reduce((sum, m) => sum + m.cost, 0) / items.length,
          avgDuration: items.reduce((sum, m) => sum + m.duration, 0) / items.length,
          successRate: items.filter((m) => m.success).length / items.length,
          avgIterations: items.reduce((sum, m) => sum + m.iterations, 0) / items.length,
        },
      ])
    ),
  };
}

// =============================================
// Export
// =============================================

export default {
  selectProvider,
  generateCode,
  estimateCost,
  estimateTime,
  recordMetric,
  getAnalytics,
};
