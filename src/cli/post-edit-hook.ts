#!/usr/bin/env node

/**
 * Post-Edit Hook CLI
 * Validates files after modifications
 *
 * Usage:
 *   npx ts-node src/cli/post-edit-hook.ts /path/to/file.ts
 *   npx ts-node src/cli/post-edit-hook.ts /path/to/file.ts --agent-id agent-123
 *   npx ts-node src/cli/post-edit-hook.ts /path/to/file.ts --blocking
 *   node dist/cli/post-edit-hook.js /path/to/file.ts --agent-id agent-123
 */

import { PostEditValidator } from '../hooks/post-edit-validator.js';
import * as process from 'process';
import * as path from 'path';

interface CliArgs {
  filePath: string;
  agentId: string;
  projectRoot: string;
  blocking: boolean;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Error: No file path provided');
    console.error('Usage: post-edit-hook.ts <file_path> [--agent-id <id>] [--blocking]');
    process.exit(1);
  }

  let filePath = '';
  let agentId = 'unknown';
  let projectRoot = process.cwd();
  let blocking = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (args[i] === '--blocking') {
      blocking = true;
    } else if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      filePath = args[i];
    }
  }

  if (!filePath) {
    console.error('Error: No file path provided');
    console.error('Usage: post-edit-hook.ts <file_path> [--agent-id <id>] [--blocking]');
    process.exit(1);
  }

  return { filePath, agentId, projectRoot, blocking };
}

/**
 * Main execution
 */
async function main() {
  try {
    const { filePath, agentId, projectRoot, blocking } = parseArgs();

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectRoot, filePath);

    // Create validator
    const validator = new PostEditValidator(projectRoot);

    // Run validation
    const result = await validator.validateFile(absolutePath, agentId);

    // Output result as JSON
    console.log(JSON.stringify(result, null, 2));

    // Log summary to stderr
    const summary = validator.getValidationSummary(result);
    console.error(summary);

    // Exit with appropriate code
    if (!result.passed && blocking) {
      console.error('\n❌ Post-edit validation failed (blocking mode)');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);
    process.exit(1);
  }
}

main();
