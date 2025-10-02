#!/usr/bin/env node

/**
 * Enhanced Hooks CLI for Claude Flow Novice
 *
 * Wrapper for the unified post-edit-pipeline.js
 * Provides backward compatibility with enhanced-hooks command
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Build unified pipeline command with TDD mode enabled by default
    // Use __dirname to find config/hooks in the installed package location
    // Path: .claude-flow-novice/dist/src/hooks -> ../../../../config/hooks
    const pipelinePath = join(__dirname, '../../../../config/hooks/post-edit-pipeline.js');
    const pipelineArgs = [file, '--tdd-mode'];

    // Pass through all relevant flags
    if (args.includes('--memory-key')) {
      const idx = args.indexOf('--memory-key');
      pipelineArgs.push('--memory-key', args[idx + 1]);
    }
    if (args.includes('--minimum-coverage')) {
      const idx = args.indexOf('--minimum-coverage');
      pipelineArgs.push('--minimum-coverage', args[idx + 1]);
    }
    if (args.includes('--block-on-critical')) {
      pipelineArgs.push('--block-on-tdd-violations');
    }
    if (args.includes('--structured')) {
      // Structured output is default in unified pipeline
    }

    // Execute unified pipeline with timeout protection
    const proc = spawn('node', [pipelinePath, ...pipelineArgs], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    // Set timeout to kill hanging processes (5 minutes max)
    const timeout = setTimeout(() => {
      console.error('❌ Pipeline timeout - killing process');
      proc.kill('SIGKILL');
      process.exit(1);
    }, 300000); // 5 minutes

    proc.on('close', (code) => {
      clearTimeout(timeout);
      process.exit(code || 0);
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`❌ Failed to execute unified pipeline: ${error.message}`);
      proc.kill('SIGKILL');
      process.exit(1);
    });

  } else {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Use --help for available commands');
    process.exit(1);
  }
}

// Enhanced hooks function for programmatic use (delegates to unified pipeline)
export async function enhancedPostEdit(file, memoryKey = null, options = {}) {
  return new Promise((resolve, reject) => {
    const pipelinePath = join(process.cwd(), 'config/hooks/post-edit-pipeline.js');
    const args = [file, '--tdd-mode'];

    if (memoryKey) args.push('--memory-key', memoryKey);
    if (options.minimumCoverage) args.push('--minimum-coverage', options.minimumCoverage.toString());
    if (options.blockOnCritical) args.push('--block-on-tdd-violations');

    const proc = spawn('node', [pipelinePath, ...args], {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    let stdout = '';
    let stderr = '';

    // Set timeout to kill hanging processes (5 minutes max)
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Pipeline execution timeout after 5 minutes'));
    }, 300000); // 5 minutes

    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        file,
        memoryKey,
        timestamp: new Date().toISOString(),
        output: stdout,
        error: stderr,
        exitCode: code
      });
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      proc.kill('SIGKILL');
      reject(error);
    });
  });
}

// Backward compatibility function (delegates to unified pipeline)
export async function legacyPostEditHook(file, memoryKey = null, options = {}) {
  const result = await enhancedPostEdit(file, memoryKey, options);

  return {
    success: result.success,
    file: result.file,
    timestamp: result.timestamp,
    formatted: true,
    validated: result.success,
    recommendations: 0,
    enhanced: true,
    legacy: true,
    unified: true
  };
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  enhancedHooksCLI().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}