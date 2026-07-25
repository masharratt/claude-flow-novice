#!/usr/bin/env node

/**
 * CLI: Validate Deliverables
 *
 * Checks if deliverable files exist and are accessible.
 *
 * Usage:
 *   validate-deliverables --paths file1.js,file2.js [--json]
 *   validate-deliverables --file-list paths.txt [--json]
 *
 * Returns JSON with validation results
 */

import * as fs from 'fs';
import * as path from 'path';
import { CFNValidator } from '../validator';

interface CLIOptions {
  paths?: string;
  fileList?: string;
  json?: boolean;
  taskId?: string;
  mode?: 'mvp' | 'standard' | 'enterprise';
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CLIOptions {
  const options: CLIOptions = {
    json: false,
    mode: 'standard',
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--paths' && process.argv[i + 1]) {
      options.paths = process.argv[++i];
    } else if (arg === '--file-list' && process.argv[i + 1]) {
      options.fileList = process.argv[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--task-id' && process.argv[i + 1]) {
      options.taskId = process.argv[++i];
    } else if (arg === '--mode' && process.argv[i + 1]) {
      options.mode = process.argv[++i] as any;
    }
  }

  return options;
}

/**
 * Load paths from file
 */
function loadPathsFromFile(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch (error) {
    console.error(`Error reading file list: ${error}`);
    process.exit(1);
  }
}

/**
 * Print human-readable output
 */
function printHumanOutput(
  result: Awaited<ReturnType<CFNValidator['validateDeliverables']>>
): void {
  console.log('\nDeliverable Validation Report:');
  console.log(`  Total files: ${result.totalFiles}`);
  console.log(`  Existing: ${result.existingFiles}`);
  console.log(`  Missing: ${result.missingFiles}`);
  console.log(`  Total size: ${(result.totalSizeBytes / 1024).toFixed(2)} KB`);
  console.log(`  Status: ${result.allExist ? 'PASS' : 'FAIL'}`);
  console.log('\nDeliverables:');

  for (const deliverable of result.deliverables) {
    const status = deliverable.exists ? '✓' : '✗';
    const size = deliverable.sizeBytes
      ? ` (${(deliverable.sizeBytes / 1024).toFixed(2)} KB)`
      : '';
    const timestamp = deliverable.lastModified
      ? ` - Modified: ${deliverable.lastModified}`
      : '';
    console.log(`  ${status} ${deliverable.path}${size}${timestamp}`);

    if (deliverable.error) {
      console.log(`    Error: ${deliverable.error}`);
    }
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const options = parseArgs();

  // Validate input
  if (!options.paths && !options.fileList) {
    console.error('Error: Must provide --paths or --file-list');
    console.error('Usage: validate-deliverables --paths file1.js,file2.js [--json]');
    process.exit(1);
  }

  // Parse paths
  let paths: string[];
  if (options.paths) {
    paths = options.paths.split(',').map((p) => p.trim());
  } else {
    paths = loadPathsFromFile(options.fileList!);
  }

  if (paths.length === 0) {
    console.error('Error: No paths provided');
    process.exit(1);
  }

  // Create validator
  const validator = new CFNValidator({
    mode: options.mode || 'standard',
    taskId: options.taskId || 'cli-validate-deliverables',
  });

  try {
    // Validate deliverables
    const result = await validator.validateDeliverables(paths);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHumanOutput(result);
    }

    // Exit with proper code
    process.exit(result.allExist ? 0 : 1);
  } catch (error) {
    if (options.json) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        code: 'VALIDATION_ERROR',
      }));
    } else {
      console.error(`Error: ${error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
