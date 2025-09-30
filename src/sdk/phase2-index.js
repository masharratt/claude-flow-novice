/**
 * Claude Agent SDK Integration - Phase 2 Entry Point
 * Provides ES module exports for self-validating agent system
 *
 * @module sdk/phase2
 */

export { SelfValidatingAgent, createSelfValidatingAgent } from './self-validating-agent.js';

// Version and metadata
export const SDK_VERSION = '2.0.0-phase2';
export const SDK_PHASE = 2;
export const SDK_FEATURES = [
  'self-validation',
  'confidence-scoring',
  'retry-logic',
  'learning-system',
  'memory-integration',
  'pre-validation',
  'security-scanning'
];

/**
 * SDK Configuration Presets
 */
export const SDK_PRESETS = {
  /**
   * Development preset - lenient validation for rapid iteration
   */
  development: {
    confidenceThreshold: 0.65,
    maxRetries: 5,
    minimumCoverage: 70,
    enableTDD: true,
    enableSecurity: true,
    blockOnCritical: false,
    learningEnabled: true
  },

  /**
   * Staging preset - balanced validation for testing
   */
  staging: {
    confidenceThreshold: 0.75,
    maxRetries: 3,
    minimumCoverage: 80,
    enableTDD: true,
    enableSecurity: true,
    blockOnCritical: true,
    learningEnabled: true
  },

  /**
   * Production preset - strict validation for reliability
   */
  production: {
    confidenceThreshold: 0.85,
    maxRetries: 3,
    minimumCoverage: 90,
    enableTDD: true,
    enableSecurity: true,
    blockOnCritical: true,
    learningEnabled: true
  },

  /**
   * TDD preset - test-driven development focused
   */
  tdd: {
    confidenceThreshold: 0.80,
    maxRetries: 3,
    minimumCoverage: 95,
    enableTDD: true,
    tddFirst: true,
    enableSecurity: true,
    blockOnCritical: true,
    learningEnabled: true
  },

  /**
   * Security preset - security-focused validation
   */
  security: {
    confidenceThreshold: 0.85,
    maxRetries: 2,
    minimumCoverage: 85,
    enableTDD: true,
    enableSecurity: true,
    securityMode: 'paranoid',
    blockOnCritical: true,
    learningEnabled: true
  }
};

/**
 * Get preset configuration by name or environment
 */
export function getPreset(name) {
  // Check environment variable
  const envPreset = process.env.SDK_PRESET || process.env.NODE_ENV;

  // Use provided name, or fall back to environment
  const presetName = name || envPreset || 'development';

  const preset = SDK_PRESETS[presetName];

  if (!preset) {
    console.warn(`Unknown preset "${presetName}", using development preset`);
    return SDK_PRESETS.development;
  }

  return preset;
}

/**
 * Create agent with preset configuration
 */
export function createAgentWithPreset(agentConfig, presetName) {
  const { createSelfValidatingAgent } = await import('./self-validating-agent.js');
  const preset = getPreset(presetName);

  return createSelfValidatingAgent({
    ...preset,
    ...agentConfig
  });
}

/**
 * SDK Information
 */
export function getSDKInfo() {
  return {
    version: SDK_VERSION,
    phase: SDK_PHASE,
    features: SDK_FEATURES,
    presets: Object.keys(SDK_PRESETS)
  };
}

export default {
  SelfValidatingAgent,
  createSelfValidatingAgent,
  createAgentWithPreset,
  getPreset,
  getSDKInfo,
  SDK_VERSION,
  SDK_PHASE,
  SDK_FEATURES,
  SDK_PRESETS
};