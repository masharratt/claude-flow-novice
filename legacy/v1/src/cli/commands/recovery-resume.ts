/**
 * Recovery Resume CLI Command
 *
 * Interactive CLI for resuming interrupted CFN Loop executions.
 * Provides user-friendly prompts for recovery mode selection and
 * progress tracking during recovery process.
 *
 * Usage:
 * ```bash
 * claude-flow-novice recovery:resume
 * claude-flow-novice recovery:resume --epic-id epic-123 --mode resume
 * claude-flow-novice recovery:resume --list
 * ```
 *
 * @module cli/commands/recovery-resume
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { table } from 'table';
import { RecoveryEngine, RecoveryMode, RecoveryOptions, RecoveryResult } from '../../cfn-loop/recovery-engine.js';
import { CrashDetector, InterruptedExecution } from '../../cfn-loop/crash-detector.js';
import { StateCheckpointManager } from '../../cfn-loop/state-checkpoint-manager.js';
import { createClient } from 'redis';

// ===== RECOVERY RESUME COMMAND =====

/**
 * Interactive recovery prompt
 */
async function promptRecoveryMode(interrupted: InterruptedExecution): Promise<RecoveryMode> {
  console.log(chalk.bold('\n🔍 Interrupted Execution Detected\n'));

  // Display execution details
  console.log(table([
    [chalk.cyan('Epic ID'), interrupted.epicId],
    [chalk.cyan('Epic Name'), interrupted.epicName],
    [chalk.cyan('Last Heartbeat'), new Date(interrupted.lastHeartbeat).toLocaleString()],
    [chalk.cyan('Time Since Heartbeat'), formatDuration(interrupted.timeSinceHeartbeat)],
    [chalk.cyan('Sprints Completed'), `${interrupted.sprintsCompleted} / ${interrupted.sprintsTotal}`],
    [chalk.cyan('Sprints In Progress'), interrupted.sprintsInProgress.length.toString()],
    [chalk.cyan('Estimated Work Loss'), `${interrupted.estimatedWorkLoss}%`],
    [chalk.cyan('Recovery Time Estimate'), `${interrupted.recoveryTimeEstimate} minutes`],
    [chalk.cyan('Checkpoint Available'), interrupted.checkpointVersion > 0 ? '✅ Yes' : '❌ No'],
    [chalk.cyan('Clean Shutdown'), interrupted.isCleanShutdown ? '✅ Yes' : '⚠️  No (Crash)'],
  ]));

  // Show in-progress sprints
  if (interrupted.sprintsInProgress.length > 0) {
    console.log(chalk.bold('\n📊 In-Progress Sprints:\n'));
    const sprintData = [
      [chalk.cyan('Sprint ID'), chalk.cyan('Progress'), chalk.cyan('Phases'), chalk.cyan('Files')],
      ...interrupted.sprintsInProgress.map(sprint => [
        sprint.sprintId,
        `${(sprint.progress * 100).toFixed(1)}%`,
        `${sprint.phasesCompleted} / ${sprint.phasesTotal}`,
        sprint.filesInProgress.length.toString(),
      ]),
    ];
    console.log(table(sprintData));
  }

  // Prompt for recovery mode
  const { mode } = await inquirer.prompt<{ mode: RecoveryMode }>([
    {
      type: 'list',
      name: 'mode',
      message: 'How would you like to proceed?',
      choices: [
        {
          name: `${chalk.green('Resume')} - Continue from last checkpoint (recommended)`,
          value: RecoveryMode.RESUME,
        },
        {
          name: `${chalk.yellow('Inspect')} - View checkpoint state without resuming`,
          value: RecoveryMode.INSPECT,
        },
        {
          name: `${chalk.red('Restart')} - Restart epic from beginning`,
          value: RecoveryMode.RESTART,
        },
        {
          name: `${chalk.gray('Abandon')} - Clean up and exit`,
          value: RecoveryMode.ABANDON,
        },
      ],
      default: RecoveryMode.RESUME,
    },
  ]);

  return mode;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Display recovery progress
 */
function displayRecoveryProgress(result: RecoveryResult): void {
  console.log(chalk.bold('\n✅ Recovery Completed\n'));

  const statusIcon = result.success ? '✅' : '❌';
  const statusColor = result.success ? chalk.green : chalk.red;

  console.log(table([
    [chalk.cyan('Status'), `${statusIcon} ${statusColor(result.success ? 'Success' : 'Failed')}`],
    [chalk.cyan('Mode'), result.mode],
    [chalk.cyan('Duration'), formatDuration(result.recoveryDurationMs)],
    [chalk.cyan('Sprints Resumed'), result.sprintsResumed.length.toString()],
    [chalk.cyan('Sprints Skipped'), result.sprintsSkipped.length.toString()],
    [chalk.cyan('Files Reconciled'), result.filesReconciled.toString()],
    [chalk.cyan('Locks Restored'), result.locksRestored.toString()],
    [chalk.cyan('Agents Resumed'), result.agentsResumed.toString()],
    [chalk.cyan('Estimated Work Loss'), `${result.estimatedWorkLoss}%`],
  ]));

  // Show sprints resumed
  if (result.sprintsResumed.length > 0) {
    console.log(chalk.bold('\n📊 Resumed Sprints:\n'));
    result.sprintsResumed.forEach((sprintId, index) => {
      console.log(`  ${index + 1}. ${sprintId}`);
    });
  }

  // Show errors if any
  if (result.errors.length > 0) {
    console.log(chalk.bold.red('\n⚠️  Errors During Recovery:\n'));
    result.errors.forEach((error, index) => {
      console.log(chalk.red(`  ${index + 1}. ${error}`));
    });
  }

  // Show next steps
  if (result.success) {
    console.log(chalk.bold.green('\n🎯 Next Steps:\n'));
    if (result.mode === RecoveryMode.RESUME) {
      console.log(chalk.green('  ✓ Execution resumed from checkpoint'));
      console.log(chalk.green('  ✓ Monitor progress with: claude-flow-novice status'));
      console.log(chalk.green('  ✓ View logs with: tail -f logs/cfn-loop.log'));
    } else if (result.mode === RecoveryMode.RESTART) {
      console.log(chalk.yellow('  ⚠  Epic restarted from beginning'));
      console.log(chalk.yellow('  ⚠  Run: claude-flow-novice cfn-loop <epic-name>'));
    } else if (result.mode === RecoveryMode.ABANDON) {
      console.log(chalk.gray('  ✓ State cleaned up'));
      console.log(chalk.gray('  ✓ Ready for new epic execution'));
    }
  }
}

/**
 * List all interrupted executions
 */
async function listInterruptedExecutions(detector: CrashDetector): Promise<void> {
  const spinner = ora('Scanning for interrupted executions...').start();

  try {
    const interrupted = await detector.detectInterruptedExecutions();

    spinner.stop();

    if (interrupted.length === 0) {
      console.log(chalk.green('\n✓ No interrupted executions found\n'));
      return;
    }

    console.log(chalk.bold(`\n🔍 Found ${interrupted.length} Interrupted Execution(s)\n`));

    const data = [
      [
        chalk.cyan('Epic ID'),
        chalk.cyan('Epic Name'),
        chalk.cyan('Progress'),
        chalk.cyan('Work Loss'),
        chalk.cyan('Recovery Time'),
        chalk.cyan('Status'),
      ],
      ...interrupted.map(exec => [
        exec.epicId,
        exec.epicName,
        `${exec.sprintsCompleted} / ${exec.sprintsTotal}`,
        `${exec.estimatedWorkLoss}%`,
        `${exec.recoveryTimeEstimate}m`,
        exec.isCleanShutdown ? chalk.green('Clean') : chalk.red('Crash'),
      ]),
    ];

    console.log(table(data));
  } catch (error) {
    spinner.fail('Failed to scan for interrupted executions');
    throw error;
  }
}

/**
 * Execute recovery with progress tracking
 */
async function executeRecovery(
  engine: RecoveryEngine,
  options: RecoveryOptions
): Promise<RecoveryResult> {
  const spinner = ora('Initializing recovery...').start();

  // Track recovery progress
  engine.on('checkpoint-loaded', (state) => {
    spinner.text = `Checkpoint loaded: ${state.sprints.length} sprints`;
  });

  engine.on('sprint-resumed', (context) => {
    spinner.text = `Resuming sprint: ${context.name}`;
  });

  try {
    spinner.text = `Executing ${options.mode} recovery...`;
    const result = await engine.resumeFromCheckpoint(options);

    if (result.success) {
      spinner.succeed('Recovery completed successfully');
    } else {
      spinner.fail('Recovery completed with errors');
    }

    return result;
  } catch (error) {
    spinner.fail('Recovery failed');
    throw error;
  }
}

/**
 * Main recovery resume command handler
 */
async function recoveryResumeCommand(cmdOptions: {
  epicId?: string;
  mode?: string;
  list?: boolean;
  continueFrom?: string;
  skipFileReconciliation?: boolean;
  redisUrl?: string;
}): Promise<void> {
  try {
    // Initialize dependencies
    const redis = createClient({ url: cmdOptions.redisUrl || 'redis://localhost:6379' });
    await redis.connect();

    const checkpointManager = new StateCheckpointManager({
      redisUrl: cmdOptions.redisUrl,
    });
    await checkpointManager.initialize();

    const crashDetector = new CrashDetector({
      redisUrl: cmdOptions.redisUrl,
    });
    await crashDetector.initialize();

    const recoveryEngine = new RecoveryEngine({
      redisUrl: cmdOptions.redisUrl,
      checkpointManager,
      crashDetector,
    });
    await recoveryEngine.initialize();

    // Handle --list flag
    if (cmdOptions.list) {
      await listInterruptedExecutions(crashDetector);
      await redis.quit();
      return;
    }

    // Detect interrupted executions
    const spinner = ora('Scanning for interrupted executions...').start();
    const interrupted = await crashDetector.detectInterruptedExecutions();
    spinner.stop();

    if (interrupted.length === 0) {
      console.log(chalk.green('\n✓ No interrupted executions found\n'));
      await redis.quit();
      return;
    }

    // Select epic to recover
    let execution: InterruptedExecution;

    if (cmdOptions.epicId) {
      const found = interrupted.find((e) => e.epicId === cmdOptions.epicId);
      if (!found) {
        console.error(chalk.red(`\n✗ Epic ID not found: ${cmdOptions.epicId}\n`));
        await redis.quit();
        process.exit(1);
      }
      execution = found;
    } else if (interrupted.length === 1) {
      execution = interrupted[0];
    } else {
      // Multiple interrupted executions - prompt user to select
      const { selectedEpicId } = await inquirer.prompt<{ selectedEpicId: string }>([
        {
          type: 'list',
          name: 'selectedEpicId',
          message: 'Select epic to recover:',
          choices: interrupted.map((e) => ({
            name: `${e.epicName} (${e.epicId}) - ${e.estimatedWorkLoss}% work loss`,
            value: e.epicId,
          })),
        },
      ]);
      execution = interrupted.find((e) => e.epicId === selectedEpicId)!;
    }

    // Determine recovery mode
    let mode: RecoveryMode;

    if (cmdOptions.mode) {
      mode = cmdOptions.mode as RecoveryMode;
    } else {
      mode = await promptRecoveryMode(execution);
    }

    // Build recovery options
    const options: RecoveryOptions = {
      mode,
      epicId: execution.epicId,
      continueFromSprint: cmdOptions.continueFrom,
      skipFileReconciliation: cmdOptions.skipFileReconciliation,
    };

    // Execute recovery
    const result = await executeRecovery(recoveryEngine, options);

    // Display results
    displayRecoveryProgress(result);

    // Cleanup
    await recoveryEngine.shutdown();
    await redis.quit();

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(chalk.red('\n✗ Recovery failed:\n'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Register recovery resume command
 */
export function registerRecoveryResumeCommand(program: Command): void {
  program
    .command('recovery:resume')
    .description('Resume interrupted CFN Loop executions from checkpoint')
    .option('--epic-id <id>', 'Epic ID to recover (auto-detect if not specified)')
    .option('--mode <mode>', 'Recovery mode: resume, restart, inspect, abandon')
    .option('--list', 'List all interrupted executions without recovering')
    .option('--continue-from <sprint-id>', 'Resume from specific sprint')
    .option('--skip-file-reconciliation', 'Skip file reconciliation (faster but riskier)')
    .option('--redis-url <url>', 'Redis URL (default: redis://localhost:6379)', 'redis://localhost:6379')
    .action(recoveryResumeCommand);
}

// Export for direct usage
export { recoveryResumeCommand };
