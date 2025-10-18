/**
 * Recovery Status CLI Command - Dashboard for Interrupted Executions
 *
 * Provides a comprehensive dashboard for crash recovery:
 * - List of interrupted epics with details
 * - Sprint progress percentages
 * - Estimated recovery time
 * - Options: resume/restart/inspect/abandon
 *
 * Usage:
 * ```bash
 * claude-flow-novice recovery:status
 * claude-flow-novice recovery:status --detailed
 * claude-flow-novice recovery:inspect <epicId>
 * claude-flow-novice recovery:resume <epicId>
 * claude-flow-novice recovery:abandon <epicId>
 * ```
 *
 * @module cli/commands/recovery-status
 */

import { Command } from 'commander';
import { CrashDetector, InterruptedExecution, InterruptedSprint } from '../../cfn-loop/crash-detector.js';
import { Logger } from '../../core/logger.js';

// ===== FORMATTING UTILITIES =====

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format timestamp to human-readable date
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Format progress percentage with bar
 */
function formatProgress(progress: number): string {
  const percentage = Math.round(progress * 100);
  const barLength = 20;
  const filled = Math.round((barLength * percentage) / 100);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}%`;
}

/**
 * Format file list with truncation
 */
function formatFileList(files: string[], maxFiles: number = 3): string {
  if (files.length === 0) return 'none';
  if (files.length <= maxFiles) return files.join(', ');
  const shown = files.slice(0, maxFiles);
  return `${shown.join(', ')} ... (+${files.length - maxFiles} more)`;
}

// ===== DASHBOARD RENDERER =====

/**
 * Render recovery dashboard
 */
function renderRecoveryDashboard(interrupted: InterruptedExecution[], detailed: boolean = false): void {
  if (interrupted.length === 0) {
    console.log('\n✅ No interrupted executions detected\n');
    console.log('All CFN Loop epics completed or shut down cleanly.\n');
    return;
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              🔍 CFN LOOP RECOVERY DASHBOARD                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📊 Summary: ${interrupted.length} interrupted execution(s) detected\n`);

  for (const execution of interrupted) {
    renderExecutionSummary(execution, detailed);
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                      RECOVERY OPTIONS                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
  console.log('  claude-flow-novice recovery:inspect <epicId>  - Detailed inspection');
  console.log('  claude-flow-novice recovery:resume <epicId>   - Resume from checkpoint');
  console.log('  claude-flow-novice recovery:restart <epicId>  - Restart from beginning');
  console.log('  claude-flow-novice recovery:abandon <epicId>  - Abandon and cleanup\n');
}

/**
 * Render execution summary
 */
function renderExecutionSummary(execution: InterruptedExecution, detailed: boolean): void {
  const statusIcon = execution.isCleanShutdown ? '🟢' : '🔴';
  const statusText = execution.isCleanShutdown ? 'CLEAN SHUTDOWN' : 'INTERRUPTED';

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`${statusIcon} Epic: ${execution.epicName} (${execution.epicId})`);
  console.log(`   Status: ${statusText}`);
  console.log(`   Last Activity: ${formatTimestamp(execution.lastHeartbeat)} (${formatDuration(execution.timeSinceHeartbeat)} ago)`);
  console.log(`   Checkpoint: v${execution.checkpointVersion} at ${formatTimestamp(execution.lastCheckpointTime)}`);
  console.log();

  // Sprint progress
  console.log(`   📈 Sprints: ${execution.sprintsCompleted}/${execution.sprintsTotal} completed`);
  if (execution.sprintsInProgress.length > 0) {
    console.log(`   🔄 In Progress:`);
    for (const sprint of execution.sprintsInProgress) {
      console.log(`      • ${sprint.name}: ${formatProgress(sprint.progress)}`);
      console.log(`        Phases: ${sprint.phasesCompleted}/${sprint.phasesTotal} completed`);
      if (detailed && sprint.filesInProgress.length > 0) {
        console.log(`        Files: ${formatFileList(sprint.filesInProgress, 5)}`);
      }
    }
  }
  console.log();

  // Recovery estimates
  console.log(`   ⚠️  Estimated Work Loss: ${execution.estimatedWorkLoss}%`);
  console.log(`   ⏱️  Recovery Time Estimate: ${execution.recoveryTimeEstimate} minutes`);
  console.log();
}

/**
 * Render detailed inspection
 */
function renderDetailedInspection(execution: InterruptedExecution): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    DETAILED INSPECTION                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log(`Epic ID: ${execution.epicId}`);
  console.log(`Epic Name: ${execution.epicName}`);
  console.log(`Status: ${execution.isCleanShutdown ? 'Clean Shutdown' : 'Interrupted'}`);
  console.log();

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('TIMELINE');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`Last Heartbeat:    ${formatTimestamp(execution.lastHeartbeat)}`);
  console.log(`Last Checkpoint:   ${formatTimestamp(execution.lastCheckpointTime)} (v${execution.checkpointVersion})`);
  console.log(`Time Since Update: ${formatDuration(execution.timeSinceHeartbeat)}`);
  console.log();

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('SPRINT DETAILS');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`Total Sprints:     ${execution.sprintsTotal}`);
  console.log(`Completed:         ${execution.sprintsCompleted}`);
  console.log(`In Progress:       ${execution.sprintsInProgress.length}`);
  console.log();

  for (const sprint of execution.sprintsInProgress) {
    console.log(`Sprint: ${sprint.name} (${sprint.sprintId})`);
    console.log(`  Progress: ${formatProgress(sprint.progress)}`);
    console.log(`  Phases: ${sprint.phasesCompleted}/${sprint.phasesTotal} completed`);
    console.log(`  Last Update: ${formatTimestamp(sprint.lastUpdateTime)}`);
    console.log(`  Files In Progress (${sprint.filesInProgress.length}):`);
    for (const file of sprint.filesInProgress) {
      console.log(`    - ${file}`);
    }
    console.log();
  }

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('RECOVERY ANALYSIS');
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log(`Estimated Work Loss:      ${execution.estimatedWorkLoss}%`);
  console.log(`Recovery Time Estimate:   ${execution.recoveryTimeEstimate} minutes`);
  console.log(`Checkpoint Available:     ${execution.checkpointVersion > 0 ? 'Yes' : 'No'}`);
  console.log(`Resume Recommended:       ${execution.estimatedWorkLoss < 50 ? 'Yes' : 'Restart may be faster'}`);
  console.log();
}

// ===== COMMAND HANDLERS =====

/**
 * Handle recovery:status command
 */
async function handleRecoveryStatus(options: { detailed?: boolean }): Promise<void> {
  const logger = new Logger({ level: 'info', format: 'json', name: 'RecoveryStatus' }, 'RecoveryStatus');
  const detector = new CrashDetector();

  try {
    console.log('\n🔍 Scanning for interrupted executions...\n');

    await detector.initialize();
    const interrupted = await detector.detectInterruptedExecutions();
    const stats = detector.getStats();

    renderRecoveryDashboard(interrupted, options.detailed || false);

    // Show statistics
    if (options.detailed) {
      console.log('╔══════════════════════════════════════════════════════════════════════╗');
      console.log('║                       SCAN STATISTICS                                ║');
      console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
      console.log(`  Epics Scanned:         ${stats.totalEpicsScanned}`);
      console.log(`  Interrupted Found:     ${stats.interruptedEpicsFound}`);
      console.log(`  Clean Shutdowns:       ${stats.cleanShutdownsFound}`);
      console.log(`  Redis Keys Scanned:    ${stats.redisKeysScanned}`);
      console.log(`  Scan Duration:         ${stats.scanDurationMs}ms`);
      console.log();
    }

    await detector.shutdown();
  } catch (error) {
    logger.error('Recovery status failed', { error });
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle recovery:inspect command
 */
async function handleRecoveryInspect(epicId: string): Promise<void> {
  const logger = new Logger({ level: 'info', format: 'json', name: 'RecoveryInspect' }, 'RecoveryInspect');
  const detector = new CrashDetector();

  try {
    await detector.initialize();
    const interrupted = await detector.detectInterruptedExecutions();
    const execution = interrupted.find((e) => e.epicId === epicId);

    if (!execution) {
      console.log(`\n❌ No interrupted execution found for epic: ${epicId}\n`);
      process.exit(1);
    }

    renderDetailedInspection(execution);
    await detector.shutdown();
  } catch (error) {
    logger.error('Recovery inspect failed', { error });
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Handle recovery:resume command
 */
async function handleRecoveryResume(epicId: string): Promise<void> {
  console.log(`\n🔄 Resuming epic: ${epicId}\n`);
  console.log('⚠️  Resume functionality not yet implemented');
  console.log('    This will restore state from latest checkpoint and continue execution\n');
  // TODO: Implement resume logic with StateCheckpointManager
}

/**
 * Handle recovery:restart command
 */
async function handleRecoveryRestart(epicId: string): Promise<void> {
  console.log(`\n🔄 Restarting epic: ${epicId}\n`);
  console.log('⚠️  Restart functionality not yet implemented');
  console.log('    This will clear checkpoints and restart from beginning\n');
  // TODO: Implement restart logic
}

/**
 * Handle recovery:abandon command
 */
async function handleRecoveryAbandon(epicId: string): Promise<void> {
  console.log(`\n🗑️  Abandoning epic: ${epicId}\n`);
  console.log('⚠️  Abandon functionality not yet implemented');
  console.log('    This will cleanup Redis keys and mark epic as abandoned\n');
  // TODO: Implement abandon logic with Redis cleanup
}

// ===== COMMAND REGISTRATION =====

/**
 * Register recovery commands
 */
function registerRecoveryCommands(program: Command): void {
  const recovery = program.command('recovery').description('CFN Loop crash recovery management');

  recovery
    .command('status')
    .description('Show recovery dashboard for interrupted executions')
    .option('-d, --detailed', 'Show detailed information')
    .action(handleRecoveryStatus);

  recovery
    .command('inspect <epicId>')
    .description('Detailed inspection of interrupted epic')
    .action(handleRecoveryInspect);

  recovery
    .command('resume <epicId>')
    .description('Resume execution from latest checkpoint')
    .action(handleRecoveryResume);

  recovery
    .command('restart <epicId>')
    .description('Restart execution from beginning')
    .action(handleRecoveryRestart);

  recovery
    .command('abandon <epicId>')
    .description('Abandon execution and cleanup')
    .action(handleRecoveryAbandon);
}

// Export named functions for direct import
export {
  registerRecoveryCommands,
  handleRecoveryStatus,
  handleRecoveryInspect,
  handleRecoveryResume,
  handleRecoveryRestart,
  handleRecoveryAbandon,
};

// Export for integration with main CLI
export default {
  registerRecoveryCommands,
  handleRecoveryStatus,
  handleRecoveryInspect,
  handleRecoveryResume,
  handleRecoveryRestart,
  handleRecoveryAbandon,
};
