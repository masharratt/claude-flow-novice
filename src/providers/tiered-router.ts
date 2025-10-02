/**
 * Tiered Provider Router
 * Routes agents to appropriate LLM providers based on tier configuration
 */

import { LLMProvider } from "./types";

// ===== TIER CONFIGURATION =====

export interface TierConfig {
  name: string;
  provider: LLMProvider;
  agentTypes: string[];
  priority: number;
  subscriptionLimit?: number;
}

export interface SubscriptionUsage {
  used: number;
  limit: number;
  resetDate: Date;
}

// ===== TIER DEFINITIONS =====

const TIER_CONFIGS: TierConfig[] = [
  {
    name: "Tier 1: Subscription",
    provider: "anthropic",
    agentTypes: ["coordinator", "architect", "system-architect"],
    priority: 1,
    subscriptionLimit: 1000, // Mock limit for testing
  },
  {
    name: "Tier 2: Anthropic API",
    provider: "anthropic",
    agentTypes: [], // Fallback tier
    priority: 2,
  },
  {
    name: "Tier 3: Z.ai",
    provider: "custom",
    agentTypes: ["coder", "tester", "reviewer"],
    priority: 3,
  },
];

// ===== TIERED PROVIDER ROUTER =====

export class TieredProviderRouter {
  private subscriptionUsage: SubscriptionUsage;
  private tierConfigs: TierConfig[];

  constructor(
    tierConfigs: TierConfig[] = TIER_CONFIGS,
    initialUsage: Partial<SubscriptionUsage> = {},
  ) {
    this.tierConfigs = tierConfigs.sort((a, b) => a.priority - b.priority);
    this.subscriptionUsage = {
      used: initialUsage.used || 0,
      limit: initialUsage.limit || 1000,
      resetDate: initialUsage.resetDate || this.getNextResetDate(),
    };
  }

  /**
   * Select provider based on agent type and tier rules
   */
  async selectProvider(agentType: string): Promise<LLMProvider> {
    // Find matching tier for agent type
    for (const tier of this.tierConfigs) {
      if (tier.agentTypes.includes(agentType)) {
        // Check subscription limits for Tier 1
        if (tier.priority === 1 && tier.subscriptionLimit) {
          if (this.hasSubscriptionCapacity()) {
            this.consumeSubscription();
            return tier.provider;
          }
          // Fallback to Tier 2 if subscription limit exceeded
          continue;
        }

        return tier.provider;
      }
    }

    // Default fallback to Tier 2 (Anthropic API)
    const fallbackTier = this.tierConfigs.find((t) => t.priority === 2);
    return fallbackTier?.provider || "anthropic";
  }

  /**
   * Check if subscription has capacity
   */
  private hasSubscriptionCapacity(): boolean {
    // Reset usage if past reset date
    if (new Date() >= this.subscriptionUsage.resetDate) {
      this.resetSubscriptionUsage();
    }

    return this.subscriptionUsage.used < this.subscriptionUsage.limit;
  }

  /**
   * Consume subscription quota
   */
  private consumeSubscription(): void {
    this.subscriptionUsage.used++;
  }

  /**
   * Reset subscription usage
   */
  private resetSubscriptionUsage(): void {
    this.subscriptionUsage.used = 0;
    this.subscriptionUsage.resetDate = this.getNextResetDate();
  }

  /**
   * Get next reset date (30 days from now)
   */
  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /**
   * Get current subscription usage
   */
  getSubscriptionUsage(): SubscriptionUsage {
    return { ...this.subscriptionUsage };
  }

  /**
   * Get tier configuration for agent type
   */
  getTierForAgentType(agentType: string): TierConfig | undefined {
    return this.tierConfigs.find((tier) => tier.agentTypes.includes(agentType));
  }

  /**
   * Get all tier configurations
   */
  getTierConfigs(): TierConfig[] {
    return [...this.tierConfigs];
  }
}

// ===== FACTORY =====

export function createTieredRouter(
  customTiers?: TierConfig[],
  initialUsage?: Partial<SubscriptionUsage>,
): TieredProviderRouter {
  return new TieredProviderRouter(customTiers, initialUsage);
}
