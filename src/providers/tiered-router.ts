/**
 * Tiered Provider Router
 * Routes agents to appropriate LLM providers based on tier configuration
 * and agent profile preferences
 */

import { LLMProvider } from "./types.js";
import { AgentProfileLoader } from "./agent-profile-loader.js";

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
    name: "Tier 2: Z.ai Default",
    provider: "custom",
    agentTypes: [], // Default fallback tier (Z.ai)
    priority: 2,
  },
  {
    name: "Tier 3: Anthropic Explicit",
    provider: "anthropic",
    agentTypes: [], // Only used when explicitly requested via profile
    priority: 3,
  },
];

// ===== TIERED PROVIDER ROUTER =====

export class TieredProviderRouter {
  private subscriptionUsage: SubscriptionUsage;
  private tierConfigs: TierConfig[];
  private profileLoader: AgentProfileLoader;

  constructor(
    tierConfigs: TierConfig[] = TIER_CONFIGS,
    initialUsage: Partial<SubscriptionUsage> = {},
    agentsDir?: string,
  ) {
    this.tierConfigs = tierConfigs.sort((a, b) => a.priority - b.priority);
    this.subscriptionUsage = {
      used: initialUsage.used || 0,
      limit: initialUsage.limit || 1000,
      resetDate: initialUsage.resetDate || this.getNextResetDate(),
    };
    this.profileLoader = new AgentProfileLoader(agentsDir);
  }

  /**
   * Select provider based on agent type, profile preferences, and tier rules
   */
  async selectProvider(agentType: string): Promise<LLMProvider> {
    // Step 1: Check agent profile for explicit provider preference
    const profilePreference = this.profileLoader.getProviderPreference(agentType);
    if (profilePreference) {
      // If profile specifies anthropic and subscription has capacity, use it
      if (profilePreference === "anthropic" && this.hasSubscriptionCapacity()) {
        this.consumeSubscription();
        return "anthropic";
      }
      // Otherwise respect the profile preference
      return profilePreference;
    }

    // Step 2: Check tier configuration for agent type
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

    // Step 3: Default fallback to Tier 2 (Z.ai)
    const fallbackTier = this.tierConfigs.find((t) => t.priority === 2);
    return fallbackTier?.provider || "custom"; // "custom" maps to Z.ai
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
  agentsDir?: string,
): TieredProviderRouter {
  return new TieredProviderRouter(customTiers, initialUsage, agentsDir);
}
