#!/usr/bin/env node

/**
 * Provider Model Resolution Service
 *
 * Resolves cross-provider model mappings for CFN Loop agent routing.
 * Translates agent-specified models (sonnet/haiku/opus) to
 * provider-specific model names.
 *
 * NO REDIS CALLS - This is a pure configuration resolver.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { URL } from 'url';
import { fileURLToPath } from 'url';

// ES module equivalents for __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProviderMappings {
  mappings: {
    [agentModel: string]: {
      [provider: string]: string;
    };
  };
  defaults: {
    [provider: string]: string;
  };
  cost_tiers?: {
    [tier: string]: {
      [provider: string]: string;
    };
  };
}

class ProviderModelResolver {
  private mappings: ProviderMappings | null = null;
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), '.claude/config/provider-model-mappings.yaml');
    this.loadMappings();
  }

  private loadMappings(): void {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.mappings = yaml.load(configContent) as ProviderMappings;
    } catch (error) {
      console.error('Failed to load provider model mappings:', error);
      // Fallback to basic mappings
      this.mappings = {
        mappings: {
          sonnet: {
            anthropic: 'claude-3-5-sonnet-20241022',
            zai: 'glm-4.6',
            kimi: 'kimi-k2-turbo-preview',
            openrouter: 'anthropic/claude-sonnet-4.5',
            gemini: 'google/gemini-2.0-flash-001',
            xai: 'grok-beta'
          },
          haiku: {
            anthropic: 'claude-3-5-haiku-20241022',
            zai: 'glm-4.6-flash',
            kimi: 'kimi-k2-turbo-preview',
            openrouter: 'anthropic/claude-3.5-haiku',
            gemini: 'google/gemini-2.0-flash-001',
            xai: 'grok-beta'
          }
        },
        defaults: {
          zai: 'glm-4.6',
          kimi: 'kimi-k2-turbo-preview',
          openrouter: 'anthropic/claude-sonnet-4.5',
          gemini: 'google/gemini-2.0-flash-001',
          xai: 'grok-beta',
          anthropic: 'claude-3-5-sonnet-20241022'
        }
      };
    }
  }

  /**
   * Resolve model for specific provider and agent model
   */
  resolveModel(provider: string, agentModel?: string, costTier?: string): string {
    if (!this.mappings) {
      throw new Error('Provider model mappings not loaded');
    }

    // If cost tier is specified, use tier-specific model
    if (costTier && this.mappings.cost_tiers?.[costTier]?.[provider]) {
      return this.mappings.cost_tiers[costTier][provider];
    }

    // If agent has specific model, map it to provider
    if (agentModel && this.mappings.mappings[agentModel]?.[provider]) {
      return this.mappings.mappings[agentModel][provider];
    }

    // Use provider default
    if (this.mappings.defaults[provider]) {
      return this.mappings.defaults[provider];
    }

    // Fallback to standard model
    return this.mappings.defaults['anthropic'];
  }

  /**
   * Get all available models for a provider
   */
  getProviderModels(provider: string): string[] {
    if (!this.mappings) {
      return [];
    }

    const models = new Set<string>();

    // Collect models from mappings
    Object.values(this.mappings.mappings).forEach(mapping => {
      if (mapping[provider]) {
        models.add(mapping[provider]);
      }
    });

    // Add default model
    if (this.mappings.defaults[provider]) {
      models.add(this.mappings.defaults[provider]);
    }

    return Array.from(models);
  }

  /**
   * Validate provider support
   */
  isProviderSupported(provider: string): boolean {
    if (!this.mappings) {
      return false;
    }

    return this.mappings.defaults.hasOwnProperty(provider);
  }

  /**
   * Get configuration summary (useful for debugging)
   */
  getConfigSummary(): {
    supportedProviders: string[];
    supportedAgentModels: string[];
    hasCostTiers: boolean;
  } {
    if (!this.mappings) {
      return {
        supportedProviders: [],
        supportedAgentModels: [],
        hasCostTiers: false
      };
    }

    return {
      supportedProviders: Object.keys(this.mappings.defaults),
      supportedAgentModels: Object.keys(this.mappings.mappings),
      hasCostTiers: !!this.mappings.cost_tiers
    };
  }
}

/**
 * Helper function to determine if the module is being run directly
 * Simplified approach for ES modules
 */
function isDirectExecution(): boolean {
  try {
    const mainModule = process.argv[1];
    
    if (!mainModule) {
      return false;
    }

    // Compare the current file path with the main module path
    const currentPath = path.resolve(__filename);
    const mainPath = path.resolve(mainModule);

    return currentPath === mainPath;
  } catch (error) {
    // If any error occurs during detection, assume it's not direct execution
    return false;
  }
}

// CLI interface for testing
if (isDirectExecution()) {
  const args = process.argv.slice(2);
  const resolver = new ProviderModelResolver();

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Provider Model Resolver

Usage:
  resolve-provider-model.ts --provider <provider> [--model <agent-model>] [--tier <cost-tier>]
  resolve-provider-model.ts --summary
  resolve-provider-model.ts --providers <provider>

Examples:
  resolve-provider-model.ts --provider zai --model sonnet
  resolve-provider-model.ts --provider kimi --model haiku --tier economy
  resolve-provider-model.ts --summary
  resolve-provider-model.ts --providers zai

Supported providers: anthropic, zai, kimi, openrouter, gemini, xai
Agent models: sonnet, haiku, opus (or defaults)
Cost tiers: economy, standard, premium
    `);
    process.exit(0);
  }

  try {
    if (args.includes('--summary')) {
      const summary = resolver.getConfigSummary();
      console.log('Configuration Summary:');
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    }

    const providerIndex = args.indexOf('--provider');
    const modelIndex = args.indexOf('--model');
    const tierIndex = args.indexOf('--tier');

    if (providerIndex === -1) {
      console.error('--provider is required');
      process.exit(1);
    }

    const provider = args[providerIndex + 1];
    const agentModel = modelIndex !== -1 ? args[modelIndex + 1] : undefined;
    const costTier = tierIndex !== -1 ? args[tierIndex + 1] : undefined;

    const resolvedModel = resolver.resolveModel(provider, agentModel, costTier);
    console.log(resolvedModel);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

export default ProviderModelResolver;