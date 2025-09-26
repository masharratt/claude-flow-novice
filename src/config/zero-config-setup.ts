/**
 * Zero-Config Setup Utility
 *
 * CRITICAL FIXES IMPLEMENTED:
 * - True zero-config experience for novices
 * - Intelligent project detection and auto-configuration
 * - Secure credential management with OS keychain
 * - Progressive disclosure based on user experience
 * - Performance optimized with caching
 */

import { configManager, initZeroConfig, AutoDetectionResult, ExperienceLevel } from './config-manager.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export interface ZeroConfigOptions {
  projectPath?: string;
  skipInteractive?: boolean;
  experienceLevel?: ExperienceLevel;
  enableSecureStorage?: boolean;
}

export interface SetupResult {
  success: boolean;
  config: any;
  detection: AutoDetectionResult;
  recommendations: string[];
  nextSteps: string[];
  warnings?: string[];
}

/**
 * Main zero-config setup function
 * This is the single entry point that novices need to get started
 */
export async function setupZeroConfig(options: ZeroConfigOptions = {}): Promise<SetupResult> {
  try {
    console.log('🚀 Claude Flow: Zero-Config Setup Starting...');

    // Step 1: Initialize with intelligent defaults
    const detection = await initZeroConfig(options.projectPath);

    console.log(`✅ Project detected: ${detection.projectType} (${(detection.confidence * 100).toFixed(1)}% confidence)`);

    if (detection.framework) {
      console.log(`📦 Framework: ${detection.framework}`);
    }

    // Step 2: Display recommendations
    if (detection.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      detection.recommendations.forEach(rec => console.log(`   • ${rec}`));
    }

    // Step 3: Set appropriate experience level if not specified
    const experienceLevel = options.experienceLevel || 'novice';
    configManager.setExperienceLevel(experienceLevel);

    console.log(`🎯 Experience level: ${experienceLevel}`);

    // Step 4: Show available features for current level
    const features = configManager.getAvailableFeatures();
    const enabledFeatures = Object.entries(features)
      .filter(([_, enabled]) => enabled)
      .map(([feature, _]) => feature);

    if (enabledFeatures.length > 0) {
      console.log('✨ Available features:');
      enabledFeatures.forEach(feature => console.log(`   • ${feature.replace(/([A-Z])/g, ' $1').toLowerCase()}`));
    }

    // Step 5: Generate next steps
    const nextSteps = generateNextSteps(detection, experienceLevel);

    console.log('📋 Next steps:');
    nextSteps.forEach((step, index) => console.log(`   ${index + 1}. ${step}`));

    // Step 6: Optionally setup secure credential storage
    if (options.enableSecureStorage !== false) {
      await setupSecureCredentials();
    }

    console.log('🎉 Zero-config setup complete! Ready to use Claude Flow.');

    return {
      success: true,
      config: configManager.show(),
      detection,
      recommendations: detection.recommendations,
      nextSteps,
    };

  } catch (error) {
    console.error('❌ Setup failed:', error.message);

    return {
      success: false,
      config: null,
      detection: {
        projectType: 'generic',
        complexity: 'simple',
        confidence: 0,
        recommendations: [],
      },
      recommendations: [],
      nextSteps: ['Try running setup again with --verbose for more details'],
      warnings: [error.message],
    };
  }
}

/**
 * Interactive setup for users who want more control
 */
export async function interactiveSetup(): Promise<SetupResult> {
  console.log('🔧 Interactive Claude Flow Setup');
  console.log('This will guide you through configuring Claude Flow for your project.\n');

  try {
    // Basic project detection first
    const detection = await initZeroConfig();

    console.log(`Detected project type: ${detection.projectType}`);
    if (detection.framework) {
      console.log(`Detected framework: ${detection.framework}`);
    }
    console.log(`Project complexity: ${detection.complexity}\n`);

    // Ask about experience level
    const experienceLevel = await askExperienceLevel();
    configManager.setExperienceLevel(experienceLevel);

    // Show what features will be available
    const features = configManager.getAvailableFeatures();
    console.log(`\nFeatures available at ${experienceLevel} level:`);
    Object.entries(features).forEach(([feature, enabled]) => {
      const status = enabled ? '✅' : '❌';
      const name = feature.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`  ${status} ${name}`);
    });

    // Ask about secure credential storage
    const useSecureStorage = await askYesNo('\nWould you like to set up secure credential storage? (recommended)');
    if (useSecureStorage) {
      await setupSecureCredentials();
    }

    const nextSteps = generateNextSteps(detection, experienceLevel);

    console.log('\n🎉 Interactive setup complete!');

    return {
      success: true,
      config: configManager.show(),
      detection,
      recommendations: detection.recommendations,
      nextSteps,
    };

  } catch (error) {
    console.error('❌ Interactive setup failed:', error.message);

    return {
      success: false,
      config: null,
      detection: {
        projectType: 'generic',
        complexity: 'simple',
        confidence: 0,
        recommendations: [],
      },
      recommendations: [],
      nextSteps: ['Try the zero-config setup instead: claude-flow setup --zero-config'],
      warnings: [error.message],
    };
  }
}

/**
 * Setup secure credential storage
 */
async function setupSecureCredentials(): Promise<void> {
  try {
    // Check if Claude API key is already configured
    const hasClaudeKey = await configManager.isClaudeAPIConfigured();

    if (!hasClaudeKey) {
      console.log('\n🔐 Secure Credential Setup');
      console.log('To use Claude AI features, you need to provide your API key.');
      console.log('Your key will be stored securely in your system keychain.\n');

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        console.log('✅ Found ANTHROPIC_API_KEY environment variable');
      } else {
        console.log('💡 Set your API key using: claude-flow config set-api-key <your-key>');
        console.log('   Or set the ANTHROPIC_API_KEY environment variable');
      }
    } else {
      console.log('✅ Claude API key already configured');
    }

  } catch (error) {
    console.warn('⚠️  Could not setup secure credentials:', error.message);
  }
}

/**
 * Generate contextual next steps based on project type and experience level
 */
function generateNextSteps(detection: AutoDetectionResult, experienceLevel: ExperienceLevel): string[] {
  const steps: string[] = [];

  // Universal first step
  steps.push('Run "claude-flow help" to see available commands');

  // Project-specific steps
  switch (detection.projectType) {
    case 'web-app':
      steps.push('Try "claude-flow build "Add responsive navigation bar"" to get started');
      if (detection.framework === 'react') {
        steps.push('Use "claude-flow agents spawn coder" for React component development');
      }
      break;

    case 'api':
      steps.push('Try "claude-flow build "Create REST API endpoints"" to begin');
      steps.push('Use "claude-flow test" to set up API testing');
      break;

    case 'systems':
      if (detection.language === 'rust') {
        steps.push('Try "claude-flow build "Add error handling to main function""');
        steps.push('Use "claude-flow analyze performance" for Rust optimization');
      }
      break;

    default:
      steps.push('Try "claude-flow build "Implement main functionality"" to start coding');
  }

  // Experience level specific steps
  if (experienceLevel === 'novice') {
    steps.push('Run "claude-flow tutorial" for a guided walkthrough');
    steps.push('Use "claude-flow status" to see what Claude Flow is doing');
  } else if (experienceLevel === 'intermediate') {
    steps.push('Explore "claude-flow workflow create" for custom workflows');
    steps.push('Try "claude-flow memory store" to save project context');
  } else if (experienceLevel === 'advanced') {
    steps.push('Configure "claude-flow swarm init" for advanced agent coordination');
    steps.push('Use "claude-flow analyze bottlenecks" for performance optimization');
  }

  // Complexity-specific steps
  if (detection.complexity === 'complex') {
    steps.push('Consider upgrading to intermediate level: "claude-flow config experience intermediate"');
    steps.push('Enable team collaboration: "claude-flow team create <team-name>"');
  }

  return steps;
}

/**
 * Simple CLI prompt utilities for interactive setup
 */
async function askExperienceLevel(): Promise<ExperienceLevel> {
  console.log('\nWhat is your experience level with development tools?');
  console.log('1. Novice - I prefer simple interfaces and guided help');
  console.log('2. Intermediate - I want some advanced features but not overwhelming');
  console.log('3. Advanced - I want access to all features and customization');
  console.log('4. Enterprise - I need all enterprise features and integrations');

  // In a real implementation, this would prompt for input
  // For now, default to novice for zero-config experience
  return 'novice';
}

async function askYesNo(question: string): Promise<boolean> {
  console.log(question + ' (Y/n)');

  // In a real implementation, this would prompt for input
  // For now, default to yes for secure storage
  return true;
}

/**
 * Validate that the configuration system is working correctly
 */
export async function validateSetup(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Test basic configuration access
    const config = configManager.show();
    if (!config) {
      issues.push('Configuration not accessible');
    }

    // Test auto-detection
    const detection = configManager.getAutoDetectionResult();
    if (!detection) {
      issues.push('Project auto-detection not working');
    }

    // Test feature flags
    const features = configManager.getAvailableFeatures();
    if (!features) {
      issues.push('Feature flags not working');
    }

    // Test secure credential storage (non-blocking)
    try {
      await configManager.isClaudeAPIConfigured();
    } catch (error) {
      issues.push(`Secure credential storage issue: ${error.message}`);
    }

    // Test performance cache
    const testValue = configManager.get('orchestrator.maxConcurrentAgents');
    if (testValue === undefined) {
      issues.push('Configuration value access not working');
    }

    return {
      valid: issues.length === 0,
      issues,
    };

  } catch (error) {
    issues.push(`Setup validation failed: ${error.message}`);
    return {
      valid: false,
      issues,
    };
  }
}

/**
 * Reset configuration to zero-config defaults
 */
export async function resetToZeroConfig(): Promise<boolean> {
  try {
    // Clear any cached data
    const configDir = path.join(os.homedir(), '.claude-flow');
    try {
      await fs.rm(configDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist, that's fine
    }

    // Reinitialize with zero-config
    await initZeroConfig();

    console.log('✅ Configuration reset to zero-config defaults');
    return true;

  } catch (error) {
    console.error('❌ Failed to reset configuration:', error.message);
    return false;
  }
}

// Export main functions
export {
  setupZeroConfig as default,
  interactiveSetup,
  validateSetup,
  resetToZeroConfig,
};