#!/usr/bin/env node

/**
 * Pre-Edit Hook CLI
 * Creates backups before file modifications
 *
 * Usage:
 *   npx ts-node src/cli/pre-edit-hook.ts /path/to/file.ts --agent-id agent-123
 *   node dist/cli/pre-edit-hook.js /path/to/file.ts --agent-id agent-123
 */

import { BackupManager } from '../hooks/backup-manager.js';
import * as process from 'process';
import * as path from 'path';

interface CliArgs {
  filePath: string;
  agentId: string;
  projectRoot: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Error: Insufficient arguments');
    console.error('Usage: pre-edit-hook.ts FILE_PATH --agent-id AGENT_ID');
    process.exit(1);
  }

  let filePath = '';
  let agentId = '';
  let projectRoot = process.cwd();

  // First positional argument is file path
  if (args[0] && !args[0].startsWith('--')) {
    filePath = args[0];
  }

  // Parse remaining arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--agent-id' && args[i + 1]) {
      agentId = args[i + 1];
      i++;
    } else if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[i + 1];
      i++;
    }
  }

  // Validate inputs
  if (!filePath) {
    console.error('Error: No file path provided');
    console.error('Usage: pre-edit-hook.ts FILE_PATH --agent-id AGENT_ID');
    process.exit(1);
  }

  if (!agentId) {
    console.error('Error: No agent ID provided');
    console.error('Usage: pre-edit-hook.ts FILE_PATH --agent-id AGENT_ID');
    process.exit(1);
  }

  return { filePath, agentId, projectRoot };
}

/**
 * Main execution
 */
async function main() {
  try {
    const { filePath, agentId, projectRoot } = parseArgs();

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectRoot, filePath);

    // Create backup manager
    const backupManager = new BackupManager(projectRoot);

    // Create backup
    const result = await backupManager.createBackup(absolutePath, agentId);

    // Output backup path for caller
    console.log(result.backupPath);

    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);
    process.exit(1);
  }
}

main();
