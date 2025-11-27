/**
 * MDAP (Multi-Dimensional Agent Performance) Configuration
 *
 * Model tier configuration for intelligent escalation based on task complexity
 * and historical performance. Enables cost-effective agent execution by starting
 * with lower-cost models and escalating only when needed.
 *
 * @module mdap-config
 * @version 1.0.0
 */

// =============================================
// Type Definitions
// =============================================

/**
 * Model tier configuration
 */
export interface ModelTier {
  /** Tier level (1-5, higher = more capable/expensive) */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Human-readable tier name */
  name: string;
  /** Default model identifier */
  model: string;
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
 * Provider-specific model mapping
 */
export interface ProviderModelMap {
  [provider: string]: {
    [tier: number]: string;
  };
}

/**
 * Complexity level classification
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'large';

// =============================================
// Model Tier Definitions
// =============================================

/**
 * Five-tier model hierarchy
 *
 * Conservative escalation strategy:
 * - Start with lowest viable tier for task complexity
 * - Escalate +1 tier per failure
 * - Maximum tier is 5 (opus)
 */
export const MODEL_TIERS: ModelTier[] = [
  {
    tier: 1,
    name: 'haiku',
    model: 'claude-3-haiku-20240307',
    costMultiplier: 1.0,
    latencyTarget: 2000,
    qualityTarget: 0.70,
    useCase: 'Simple tasks, fast iteration, typo fixes',
  },
  {
    tier: 2,
    name: 'mini',
    model: 'gpt-4o-mini',
    costMultiplier: 2.5,
    latencyTarget: 3000,
    qualityTarget: 0.80,
    useCase: 'Moderate tasks, balanced cost/quality',
  },
  {
    tier: 3,
    name: 'gpt4',
    model: 'gpt-4o',
    costMultiplier: 10.0,
    latencyTarget: 5000,
    qualityTarget: 0.90,
    useCase: 'Complex tasks, high quality requirements',
  },
  {
    tier: 4,
    name: 'sonnet',
    model: 'claude-3-5-sonnet-20241022',
    costMultiplier: 15.0,
    latencyTarget: 4000,
    qualityTarget: 0.95,
    useCase: 'Critical tasks, production quality',
  },
  {
    tier: 5,
    name: 'opus',
    model: 'claude-3-opus-20240229',
    costMultiplier: 75.0,
    latencyTarget: 8000,
    qualityTarget: 0.98,
    useCase: 'Mission-critical, maximum quality',
  },
];

// =============================================
// Provider Model Mappings
// =============================================

/**
 * Maps tiers to provider-specific models
 *
 * Based on late 2024/early 2025 model availability.
 * Updated: 2025-11-26
 *
 * Providers with limited model support use their best available model
 * across multiple tiers.
 */
export const PROVIDER_MODEL_MAP: ProviderModelMap = {
  // Anthropic - Full tier support with Claude models (stable aliases)
  // Haiku: $1/$5 per MTok, 200K context
  // Sonnet: $3/$15 per MTok, 200K-1M context
  // Opus: $5/$25 per MTok, 200K context
  anthropic: {
    1: 'claude-3-haiku',                 // Budget tier
    2: 'claude-3-haiku',                 // Budget tier
    3: 'claude-3-5-sonnet',              // Balanced tier
    4: 'claude-3-5-sonnet',              // Production tier
    5: 'claude-3-opus',                  // Premium tier
  },

  // Z.ai - GLM model tiers (ultra-fast to balanced)
  // GLM-4.5-air: Ultra-fast, lowest cost (tier 1)
  // GLM-4.6: Balanced quality/cost (tier 2-5)
  // Best for: Cost-optimized production workloads
  zai: {
    1: 'glm-4.5-air',  // Ultra-fast for simple micro-tasks
    2: 'glm-4.6',      // Balanced for moderate complexity
    3: 'glm-4.6',
    4: 'glm-4.6',
    5: 'glm-4.6',
  },

  // Kimi (Moonshot) - Latest K2 model for all tiers
  // Kimi K2: $0.15-$0.60/$2.50 per MTok, 256K context
  // Best for: Balanced quality/cost, long-context tasks
  kimi: {
    1: 'kimi-k2',
    2: 'kimi-k2',
    3: 'kimi-k2',
    4: 'kimi-k2',
    5: 'kimi-k2',
  },

  // OpenRouter - Anthropic models with prefix (stable aliases)
  openrouter: {
    1: 'anthropic/claude-3-haiku',
    2: 'anthropic/claude-3-haiku',
    3: 'anthropic/claude-3-5-sonnet',
    4: 'anthropic/claude-3-5-sonnet',
    5: 'anthropic/claude-3-opus',
  },

  // Gemini - Mix of Gemini 2.5 (budget) and Gemini 3 (premium)
  // Gemini 2.5 Flash: $0.20/$0.80 per MTok, 1M context (budget)
  // Gemini 2.5 Pro: $1.25/$10 per MTok, 1M context (balanced)
  // Gemini 3 Pro: $2/$12 per MTok, 1M context (premium, 1501 Elo)
  gemini: {
    1: 'gemini-2.5-flash',               // Budget
    2: 'gemini-2.5-flash',               // Budget
    3: 'gemini-2.5-pro',                 // Balanced
    4: 'gemini-3-pro-preview',           // Premium (best performance)
    5: 'gemini-3-pro-preview',           // Premium (best performance)
  },

  // XAI (Grok) - Grok models (stable aliases)
  // Grok 3: $0.20/$0.80 per MTok, 2M context (budget)
  // Grok 4 Fast: $0.80/$3 per MTok, 2M context (balanced)
  // Grok 4: $3/$10 per MTok, 2M context (premium)
  xai: {
    1: 'grok-3',                         // Budget
    2: 'grok-3',                         // Budget
    3: 'grok-4-fast-reasoning',          // Balanced
    4: 'grok-4',                         // Premium
    5: 'grok-4',                         // Premium
  },
};

// =============================================
// Complexity to Starting Tier Mapping
// =============================================

/**
 * Maps complexity levels to starting model tiers
 *
 * Conservative strategy:
 * - Simple: Start T1, escalate to T2 on failure
 * - Moderate: Start T2, escalate to T3 on failure
 * - Complex: Start T3, escalate to T4 on failure
 * - Large: Start T4, escalate to T5 on failure
 */
const COMPLEXITY_STARTING_TIER: Record<ComplexityLevel, number> = {
  simple: 1,
  moderate: 2,
  complex: 3,
  large: 4,
};

// =============================================
// Functions
// =============================================

/**
 * Get a model tier by tier number
 *
 * @param tier - Tier number (1-5)
 * @returns ModelTier or undefined if invalid tier
 */
export function getModelTier(tier: number): ModelTier | undefined {
  return MODEL_TIERS.find(t => t.tier === tier);
}

/**
 * Select the appropriate model tier based on task complexity and execution history
 *
 * Algorithm:
 * 1. Determine base tier from complexity level
 * 2. Apply escalation based on failure count (+1 tier per failure)
 * 3. Use currentTier if explicitly provided and higher than calculated
 * 4. Cap at tier 5 (maximum)
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

  // Cap at tier 5
  const finalTier = Math.min(selectedTier, 5) as 1 | 2 | 3 | 4 | 5;

  const modelTier = MODEL_TIERS.find(t => t.tier === finalTier);

  // Should never happen, but fallback to tier 3 (balanced) if undefined
  if (!modelTier) {
    console.warn(`[mdap-config] Invalid tier ${finalTier}, falling back to tier 3`);
    return MODEL_TIERS[2]; // Tier 3
  }

  return modelTier;
}

/**
 * Get the provider-specific model for a tier
 *
 * @param tier - ModelTier to map
 * @param provider - Provider name (zai, kimi, anthropic, etc.)
 * @returns Provider-specific model identifier
 */
export function getModelForProvider(tier: ModelTier, provider: string): string {
  const normalizedProvider = (provider?.toLowerCase() || 'zai');

  const providerMap = PROVIDER_MODEL_MAP[normalizedProvider];

  if (!providerMap) {
    // Unknown provider, use tier's default model
    console.warn(`[mdap-config] Unknown provider ${provider}, using tier default model`);
    return tier.model;
  }

  const model = providerMap[tier.tier];

  if (!model) {
    // Tier not mapped for provider, use tier's default
    console.warn(`[mdap-config] Tier ${tier.tier} not mapped for ${provider}, using tier default`);
    return tier.model;
  }

  return model;
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
  if (currentTier.tier >= 5) {
    return { escalate: false, reason: 'Already at maximum tier' };
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
  tier: number;
  name: string;
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
