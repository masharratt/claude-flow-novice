#!/usr/bin/env node

/**
 * Enhanced Hooks CLI for Claude Flow Novice
 *
 * Integrates the enhanced post-edit pipeline with the existing hooks system
 * Provides backward compatibility while adding TDD testing and advanced validation
 */

import { enhancedPostEditHook } from './enhanced-post-edit-pipeline.js';

// Enhanced hooks CLI interface
export async function enhancedHooksCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🚀 Enhanced Hooks CLI for Claude Flow Novice - v2.0.0

Available commands:
  post-edit <file> [options]         Enhanced post-edit with TDD testing
  enhanced-post-edit <file> [options] Alias for post-edit

Options:
  --memory-key <key>                 Store results with specific memory key
  --format                           Analyze formatting (default: true)
  --validate                         Run validation (default: true)
  --enable-tdd                       Enable TDD testing (default: true)
  --minimum-coverage <percent>       Minimum coverage threshold (default: 80)
  --block-on-critical               Block execution on critical errors
  --structured                       Return structured JSON data
  --generate-recommendations        Generate actionable recommendations (default: true)

Examples:
  npx claude-flow-novice enhanced-hooks post-edit src/app.js --memory-key "swarm/coder/step-1"
  npx claude-flow-novice enhanced-hooks post-edit test.js --minimum-coverage 90 --structured

Enhanced Features:
  ✅ TDD testing with single-file execution
  ✅ Real-time coverage analysis and diff reporting
  ✅ Advanced multi-language validation with error locations
  ✅ Formatting diff preview and change detection
  ✅ Actionable recommendations by category
  ✅ Blocking mechanisms for critical failures
  ✅ Enhanced memory store with versioning
    `);
    return;
  }

  if (command === 'post-edit' || command === 'enhanced-post-edit') {
    const file = args[1];
    if (!file) {
      console.log('❌ File path required for post-edit hook');
      return;
    }

    // Parse options from command line
    const options = {
      format: !args.includes('--no-format'),
      validate: !args.includes('--no-validate'),
      generateRecommendations: !args.includes('--no-recommendations'),
      blockOnCritical: args.includes('--block-on-critical'),
      enableTDD: !args.includes('--no-tdd'),
      returnStructured: args.includes('--structured')
    };

    // Parse numerical options
    const coverageIndex = args.indexOf('--minimum-coverage');
    if (coverageIndex >= 0) {
      options.minimumCoverage = parseInt(args[coverageIndex + 1]) || 80;
    }

    // Parse memory key
    const memoryKeyIndex = args.indexOf('--memory-key');
    const memoryKey = memoryKeyIndex >= 0 ? args[memoryKeyIndex + 1] : null;

    try {
      const result = await enhancedPostEditHook(file, memoryKey, options);

      if (options.returnStructured && result) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Set exit code based on success/blocking
      if (result.blocking) {
        process.exit(1);
      } else if (!result.success) {
        process.exit(2);
      }

    } catch (error) {
      console.error(`❌ Enhanced post-edit hook failed: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }

  } else {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Use --help for available commands');
    process.exit(1);
  }
}

// Enhanced hooks function for programmatic use
export async function enhancedPostEdit(file, memoryKey = null, options = {}) {
  try {
    return await enhancedPostEditHook(file, memoryKey, {
      format: options.format !== false,
      validate: options.validate !== false,
      generateRecommendations: options.generateRecommendations !== false,
      blockOnCritical: options.blockOnCritical || false,
      enableTDD: options.enableTDD !== false,
      minimumCoverage: options.minimumCoverage || 80,
      returnStructured: true,
      ...options
    });
  } catch (error) {
    return {
      success: false,
      error: error.message,
      file,
      memoryKey,
      timestamp: new Date().toISOString()
    };
  }
}

// Backward compatibility function for existing hooks system
export async function legacyPostEditHook(file, memoryKey = null, options = {}) {
  const result = await enhancedPostEdit(file, memoryKey, options);

  // Transform to legacy format for compatibility
  return {
    success: result.success,
    file: result.file,
    editId: result.editId,
    timestamp: result.timestamp,
    formatted: result.formatting?.needed || false,
    validated: result.validation?.passed || false,
    recommendations: result.recommendations?.length || 0,
    enhanced: true,
    legacy: true
  };
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  enhancedHooksCLI().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}