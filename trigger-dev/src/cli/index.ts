#!/usr/bin/env node
/**
 * CFN Trigger CLI
 * Command-line interface for triggering and managing CFN Loop workflows
 */

import { Command } from 'commander';
import { triggerCFNLoop, TriggerCFNLoopOptions } from './trigger-cfn-loop.js';
import { getRunStatus, cancelRun } from '../../trigger-dev-client.js';
import { CFNMode } from '../types/cfn-types.js';

const program = new Command();

program
  .name('cfn-trigger')
  .description('CLI for triggering CFN Loop workflows via trigger.dev')
  .version('1.0.0');

const cfnLoop = program
  .command('cfn-loop')
  .description('CFN Loop workflow commands');

cfnLoop
  .command('start')
  .description('Start a new CFN Loop workflow')
  .requiredOption('--task-id <id>', 'Unique task identifier')
  .requiredOption('--description <desc>', 'Task description')
  .option('--mode <mode>', 'Execution mode (mvp|standard|enterprise)', 'standard')
  .option('--test-command <cmd>', 'Test command to execute', 'npm test')
  .option('--pass-rate <rate>', 'Minimum pass rate threshold (0.0-1.0)')
  .option('--max-iterations <n>', 'Maximum iterations before abort')
  .action(async (opts) => {
    const options: TriggerCFNLoopOptions = {
      taskId: opts.taskId,
      description: opts.description,
      mode: opts.mode as CFNMode,
      testCommand: opts.testCommand,
      passRateThreshold: opts.passRate ? parseFloat(opts.passRate) : undefined,
      maxIterations: opts.maxIterations ? parseInt(opts.maxIterations, 10) : undefined,
    };

    try {
      const result = await triggerCFNLoop(options);
      console.log('CFN Loop triggered successfully');
      console.log(`Event ID: ${result.eventId}`);
      console.log(`Task ID: ${result.taskId}`);
      console.log(`Mode: ${result.mode}`);
      console.log(`Timestamp: ${result.timestamp.toISOString()}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

cfnLoop
  .command('status <eventId>')
  .description('Check status of a CFN Loop run')
  .option('--poll', 'Poll until completion', false)
  .action(async (eventId: string, opts) => {
    try {
      const maxAttempts = opts.poll ? 60 : 1;
      const status = await getRunStatus(eventId, maxAttempts);
      console.log(`Run ID: ${status.id}`);
      console.log(`Status: ${status.status}`);
      if (status.completedAt) {
        console.log(`Completed: ${status.completedAt}`);
      }
      if (status.error) {
        console.log(`Error: ${status.error}`);
      }
      if (status.output) {
        console.log(`Output: ${JSON.stringify(status.output, null, 2)}`);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

cfnLoop
  .command('cancel <runId>')
  .description('Cancel a running CFN Loop')
  .action(async (runId: string) => {
    try {
      await cancelRun(runId);
      console.log(`Run ${runId} cancelled successfully`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
