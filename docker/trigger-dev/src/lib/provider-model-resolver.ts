/**
 * Provider Model Resolver
 *
 * Resolves tier names (haiku/sonnet/opus) to provider-specific model IDs.
 * Reads configuration from .claude/config/provider-model-mappings.yaml
 *
 * @module provider-model-resolver
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import type { ModelTier, ModelTierName } from './mdap-config.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================
// Type Definitions
// =============================================

interface ProviderMappings {
  mappings: {
    [tierName: string]: {
      [provider: string]: string;
    };
  };
  defaults: {
    [provider: string]: string;
  };
  providers?: {
    [provider: string]: {
      base_url: string;
      env_key: string;
      notes: string;
    };
  };
}

// =============================================
// Fallback Mappings (used if YAML not found)
// =============================================

// Model mappings updated 2025-11-28 - glm-4.5-x for better consistency
const FALLBACK_MAPPINGS: ProviderMappings = {
  mappings: {
    haiku: {
      anthropic: 'claude-haiku-4-5',
      zai: 'glm-4.5-x',  // Upgraded from glm-4.5-air for better consistency
      kimi: 'kimi-linear',
      openrouter: 'anthropic/claude-haiku-4-5',
      gemini: 'gemini-2.5-flash-lite',
      xai: 'grok-4-1-fast-non-reasoning',
    },
    sonnet: {
      anthropic: 'claude-sonnet-4-5',
      zai: 'glm-4.6',
      kimi: 'kimi-k2-instruct-0905',
      openrouter: 'anthropic/claude-sonnet-4-5-20250929',
      gemini: 'gemini-2.5-flash',
      xai: 'grok-4-1-fast-reasoning',
    },
    opus: {
      anthropic: 'claude-opus-4-5',
      zai: 'glm-4.6',
      kimi: 'kimi-k2-thinking',
      openrouter: 'anthropic/claude-opus-4-5-20251124',
      gemini: 'gemini-2.5-pro',
      xai: 'grok-4',
    },
  },
  defaults: {
    anthropic: 'claude-sonnet-4-5',
    zai: 'glm-4.6',
    kimi: 'kimi-k2-instruct-0905',
    openrouter: 'anthropic/claude-sonnet-4-5-20250929',
    gemini: 'gemini-2.5-flash',
    xai: 'grok-4-1-fast-reasoning',
  },
};

// =============================================
// Module State
// =============================================

let mappings: ProviderMappings | null = null;
let configPath: string | null = null;

// =============================================
// Configuration Loading
// =============================================

/**
 * Find and load the provider model mappings YAML config.
 * Searches in multiple locations for the config file.
 */
function loadMappings(): ProviderMappings {
  if (mappings) {
    return mappings;
  }

  // Search paths for the config file
  const searchPaths = [
    // From trigger-dev project root
    path.join(process.cwd(), '.claude/config/provider-model-mappings.yaml'),
    // From repository root
    path.join(process.cwd(), '../../.claude/config/provider-model-mappings.yaml'),
    // From docker/trigger-dev
    path.resolve(__dirname, '../../../../.claude/config/provider-model-mappings.yaml'),
    // Absolute path (for containers)
    '/workspace/.claude/config/provider-model-mappings.yaml',
  ];

  for (const searchPath of searchPaths) {
    try {
      if (fs.existsSync(searchPath)) {
        const content = fs.readFileSync(searchPath, 'utf8');
        mappings = yaml.load(content) as ProviderMappings;
        configPath = searchPath;
        console.log(`[provider-resolver] Loaded config from: ${searchPath}`);
        return mappings;
      }
    } catch {
      // Continue to next path
    }
  }

  console.warn('[provider-resolver] Config not found, using fallback mappings');
  mappings = FALLBACK_MAPPINGS;
  return mappings;
}

// =============================================
// Resolution Functions
// =============================================

/**
 * Resolve a tier name to a provider-specific model ID.
 *
 * @param tierName - The tier name (haiku/sonnet/opus)
 * @param provider - The provider name (anthropic/zai/kimi/etc)
 * @returns Provider-specific model ID
 */
export function resolveModel(tierName: ModelTierName, provider: string): string {
  const config = loadMappings();
  const normalizedProvider = provider.toLowerCase();

  // Check mappings for specific tier
  const tierMapping = config.mappings[tierName];
  if (tierMapping && tierMapping[normalizedProvider]) {
    return tierMapping[normalizedProvider];
  }

  // Fall back to default for provider
  if (config.defaults[normalizedProvider]) {
    console.warn(`[provider-resolver] No mapping for ${tierName}/${provider}, using default`);
    return config.defaults[normalizedProvider];
  }

  // Last resort - return the tier name itself
  console.warn(`[provider-resolver] Unknown provider ${provider}, returning tier name`);
  return tierName;
}

/**
 * Get the model ID for a ModelTier and provider.
 * This is the replacement for the removed getModelForProvider in mdap-config.
 *
 * @param tier - The ModelTier object
 * @param provider - The provider name
 * @returns Provider-specific model ID
 */
export function getModelForProvider(tier: ModelTier, provider: string): string {
  return resolveModel(tier.name, provider);
}

/**
 * Get the default model for a provider.
 *
 * @param provider - The provider name
 * @returns Default model ID for the provider
 */
export function getDefaultModel(provider: string): string {
  const config = loadMappings();
  const normalizedProvider = provider.toLowerCase();

  if (config.defaults[normalizedProvider]) {
    return config.defaults[normalizedProvider];
  }

  // Fallback to anthropic default
  return config.defaults['anthropic'] ?? 'claude-3-5-sonnet-20241022';
}

/**
 * Get provider metadata (base URL, env key, etc).
 *
 * @param provider - The provider name
 * @returns Provider metadata or undefined
 */
export function getProviderMetadata(provider: string): {
  base_url: string;
  env_key: string;
  notes: string;
} | undefined {
  const config = loadMappings();
  const normalizedProvider = provider.toLowerCase();

  return config.providers?.[normalizedProvider];
}

/**
 * Check if a provider is supported.
 *
 * @param provider - The provider name
 * @returns true if provider is in the config
 */
export function isProviderSupported(provider: string): boolean {
  const config = loadMappings();
  const normalizedProvider = provider.toLowerCase();

  return normalizedProvider in config.defaults;
}

/**
 * Get list of supported providers.
 *
 * @returns Array of provider names
 */
export function getSupportedProviders(): string[] {
  const config = loadMappings();
  return Object.keys(config.defaults);
}

/**
 * Get the config file path that was loaded.
 *
 * @returns Path to the loaded config, or null if using fallback
 */
export function getConfigPath(): string | null {
  loadMappings(); // Ensure loaded
  return configPath;
}

/**
 * Force reload the config from disk.
 * Useful for testing or hot-reloading.
 */
export function reloadConfig(): void {
  mappings = null;
  configPath = null;
  loadMappings();
}
