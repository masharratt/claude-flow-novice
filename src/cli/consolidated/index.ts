/**
 * Main entry point for the Claude Flow Consolidated CLI system
 * Exports all public APIs and provides easy integration
 */

// Core exports
export { ConsolidatedCLI, createConsolidatedCLI, main } from './ConsolidatedCLI.js';

// Tier system
export { TierManager, UserTier } from './core/TierManager.js';
export type { CommandMetadata, TierConfig } from './core/TierManager.js';

// Intelligence engine
export { IntelligenceEngine } from './intelligence/IntelligenceEngine.js';
export type { TaskAnalysis, AgentRecommendation, ProjectContext } from './intelligence/IntelligenceEngine.js';

// Command handlers
export { CommandHandlers } from './core/CommandHandlers.js';
export type {
  CommandResult,
  InitOptions,
  BuildOptions,
  StatusOptions,
  HelpOptions,
  LearnOptions
} from './core/CommandHandlers.js';

// Command routing
export { CommandRouter } from './routing/CommandRouter.js';
export type { CommandRoute, RouterConfig } from './routing/CommandRouter.js';

// Performance optimization
export { PerformanceOptimizer } from './utils/PerformanceOptimizer.js';
export type { PerformanceMetrics, OptimizationConfig } from './utils/PerformanceOptimizer.js';

// Intelligent defaults
export { IntelligentDefaults } from './utils/IntelligentDefaults.js';
export type {
  DefaultsProfile,
  UserPreferences,
  TemplateConfig,
  AgentDefaults
} from './utils/IntelligentDefaults.js';

// Interactive help system
export { InteractiveHelp } from './help/InteractiveHelp.js';
export type {
  HelpSession,
  LearningPath,
  LearningStep,
  HelpContext
} from './help/InteractiveHelp.js';

// Configuration types
export interface ConsolidatedCLIConfig {
  enablePerformanceOptimization?: boolean;
  enableProgressiveDisclosure?: boolean;
  enableNaturalLanguage?: boolean;
  enableBackwardCompatibility?: boolean;
  debugMode?: boolean;
  maxResponseTime?: number;
}

// Version information
export const VERSION = '2.0.0';
export const FEATURES = {
  progressiveDisclosure: true,
  naturalLanguageProcessing: true,
  intelligentAgentSelection: true,
  performanceOptimization: true,
  backwardCompatibility: true,
  tierProgression: true
};

/**
 * Quick setup function for common configurations
 */
export function createQuickSetup(mode: 'novice' | 'development' | 'production') {
  const configs: Record<string, ConsolidatedCLIConfig> = {
    novice: {
      enablePerformanceOptimization: true,
      enableProgressiveDisclosure: true,
      enableNaturalLanguage: true,
      enableBackwardCompatibility: false,
      debugMode: false,
      maxResponseTime: 2000
    },
    development: {
      enablePerformanceOptimization: false,
      enableProgressiveDisclosure: true,
      enableNaturalLanguage: true,
      enableBackwardCompatibility: true,
      debugMode: true,
      maxResponseTime: 5000
    },
    production: {
      enablePerformanceOptimization: true,
      enableProgressiveDisclosure: true,
      enableNaturalLanguage: true,
      enableBackwardCompatibility: true,
      debugMode: false,
      maxResponseTime: 1500
    }
  };

  return createConsolidatedCLI(configs[mode]);
}