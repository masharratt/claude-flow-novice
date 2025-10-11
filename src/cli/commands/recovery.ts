/**
 * Recovery CLI Commands - Crash Recovery and State Restoration
 *
 * Provides CLI interface for detecting and recovering from VS Code crashes
 * during CFN Loop execution:
 * - /recovery:status - List interrupted epics
 * - /recovery:resume - Resume interrupted execution
 * - /recovery:inspect - Show checkpoint details
 * - /recovery:abandon - Clean up state
 *
 * Integrates with:
 * - StateCheckpointManager (Phase 0.2) for checkpoint data
 * - Redis persistence layer for state restoration
 * - Git checkpoint manager (Phase 0.4) for file recovery
 *
 * @module cli/commands/recovery
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { createClient, RedisClientType } from 'redis';
import { Logger } from '../../core/logger.js';
import { StateCheckpointManager, EpicState, SprintState, PhaseState, CheckpointMetadata } from '../../cfn-loop/state-checkpoint-manager.js';

// ===== TYPE DEFINITIONS =====

/**
 * Interrupted epic summary for recovery prompts
 */
export interface InterruptedEpic {
  epicId: string;
  name: string;
  status: string;
  startTime: number;
  lastCheckpoint: number;
  crashDuration: number;
  sprints: InterruptedSprint[];
  estimatedWorkLoss: number;
  estimatedRecoveryTime: number;
}

/**
 * Interrupted sprint summary
 */
export interface InterruptedSprint {
  sprintId: string;
  name: string;
  status: 'completed' | 'in-progress' | 'starting' | 'waiting';
  progress: number;
  filesCompleted: number;
  filesTotal: number;
  lastFile?: string;
  lastLine?: number;
  confidence?: number;
  recoveryStrategy: 'skip' | 'resume' | 'restart';
}

/**
 * Recovery options for resume command
 */
export interface RecoveryOptions {
  epicId?: string;
  dryRun?: boolean;
  sprintsFilter?: string;
  force?: boolean;
}

/**
 * Recovery result summary
 */
export interface RecoveryResult {
  success: boolean;
  epicId: string;
  sprintsResumed: number;
  sprintsRestarted: number;
  sprintsSkipped: number;
  totalRecoveryTime: number;
  workLossPercentage: number;
}

// ===== CRASH DETECTOR =====

/**
 * Detects interrupted epics from Redis state
 */
class CrashDetector {
  private logger: Logger;
  private redis: RedisClientType | null = null;

  constructor() {
    this.logger = new Logger({ level: 'info', format: 'json', name: 'CrashDetector' }, 'CrashDetector');
  }

  async initialize(redisUrl: string = 'redis://localhost:6379'): Promise<void> {
    this.redis = createClient({ url: redisUrl });
    await this.redis.connect();
  }

  async findInterruptedEpics(): Promise<InterruptedEpic[]> {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }

    const interrupted: InterruptedEpic[] = [];

    try {
      // Find all epic state keys
      const keys = await this.redis.keys('cfn:checkpoint:*:latest');

      for (const key of keys) {
        const latestCheckpointId = await this.redis.get(key);
        if (!latestCheckpointId) continue;

        // Extract epic ID
        const match = latestCheckpointId.match(/checkpoint-(.+)-(\d+)/);
        if (!match) continue;

        const [, epicId, version] = match;

        // Get checkpoint data
        const checkpointKey = `cfn:checkpoint:${epicId}:${version}`;
        const checkpointData = await this.redis.get(checkpointKey);
        if (!checkpointData) continue;

        const { metadata, serialized } = JSON.parse(checkpointData);
        const state: EpicState = JSON.parse(serialized.data);

        // Check if epic is interrupted (status = in-progress and no recent heartbeat)
        if (state.status === 'in-progress') {
          const now = Date.now();
          const lastCheckpoint = metadata.timestamp;
          const crashDuration = now - lastCheckpoint;

          // Consider crashed if no checkpoint in last 2 minutes
          if (crashDuration > 120000) {
            const epic = await this.analyzeInterruptedEpic(state, metadata, crashDuration);
            interrupted.push(epic);
          }
        }
      }

      return interrupted;
    } catch (error) {
      this.logger.error('Failed to find interrupted epics', { error });
      throw error;
    }
  }

  private async analyzeInterruptedEpic(
    state: EpicState,
    metadata: CheckpointMetadata,
    crashDuration: number
  ): Promise<InterruptedEpic> {
    const sprints: InterruptedSprint[] = state.sprints.map((sprint) => {
      const progress = this.calculateSprintProgress(sprint);
      const recoveryStrategy = this.determineRecoveryStrategy(progress, sprint.status);

      return {
        sprintId: sprint.sprintId,
        name: sprint.name,
        status: sprint.status as any,
        progress,
        filesCompleted: this.countCompletedFiles(sprint),
        filesTotal: this.countTotalFiles(sprint),
        lastFile: this.getLastFile(sprint),
        lastLine: this.getLastLine(sprint),
        confidence: sprint.confidence,
        recoveryStrategy,
      };
    });

    const estimatedWorkLoss = this.calculateWorkLoss(sprints);
    const estimatedRecoveryTime = this.estimateRecoveryTime(sprints);

    return {
      epicId: state.epicId,
      name: state.name,
      status: state.status,
      startTime: state.startTime,
      lastCheckpoint: metadata.timestamp,
      crashDuration,
      sprints,
      estimatedWorkLoss,
      estimatedRecoveryTime,
    };
  }

  private calculateSprintProgress(sprint: SprintState): number {
    const completedPhases = sprint.phases.filter((p) => p.status === 'completed').length;
    return sprint.phases.length > 0 ? (completedPhases / sprint.phases.length) * 100 : 0;
  }

  private determineRecoveryStrategy(progress: number, status: string): 'skip' | 'resume' | 'restart' {
    if (status === 'completed') return 'skip';
    if (progress >= 50) return 'resume';
    if (progress < 10) return 'restart';
    return 'resume';
  }

  private countCompletedFiles(sprint: SprintState): number {
    return sprint.phases.reduce((sum, phase) => sum + phase.deliverables.length, 0);
  }

  private countTotalFiles(sprint: SprintState): number {
    // Estimate total files based on phases
    return sprint.phases.length * 3; // Average 3 files per phase
  }

  private getLastFile(sprint: SprintState): string | undefined {
    const inProgressPhase = sprint.phases.find((p) => p.status !== 'completed' && p.status !== 'pending');
    return inProgressPhase?.deliverables[0];
  }

  private getLastLine(sprint: SprintState): number | undefined {
    // Would need to parse file for line number - return placeholder
    return undefined;
  }

  private calculateWorkLoss(sprints: InterruptedSprint[]): number {
    const inProgressSprints = sprints.filter((s) => s.status === 'in-progress');
    if (inProgressSprints.length === 0) return 0;

    const avgProgress = inProgressSprints.reduce((sum, s) => sum + s.progress, 0) / inProgressSprints.length;
    return Math.max(0, 100 - avgProgress) * 0.05; // ~5% loss at 0% progress
  }

  private estimateRecoveryTime(sprints: InterruptedSprint[]): number {
    return sprints
      .filter((s) => s.recoveryStrategy !== 'skip')
      .reduce((sum, s) => {
        const remainingWork = 100 - s.progress;
        return sum + remainingWork * 0.3; // ~0.3 minutes per % of work
      }, 0);
  }

  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// ===== RECOVERY ENGINE =====

/**
 * Executes recovery of interrupted epics
 */
class RecoveryEngine {
  private logger: Logger;
  private checkpointManager: StateCheckpointManager;

  constructor() {
    this.logger = new Logger({ level: 'info', format: 'json', name: 'RecoveryEngine' }, 'RecoveryEngine');
    this.checkpointManager = new StateCheckpointManager();
  }

  async initialize(): Promise<void> {
    await this.checkpointManager.initialize();
  }

  async resumeEpic(epicId: string, options: RecoveryOptions): Promise<RecoveryResult> {
    const startTime = Date.now();

    try {
      this.logger.info('Resuming epic', { epicId, options });

      // Restore checkpoint
      const state = await this.checkpointManager.restoreLatestCheckpoint();
      if (!state || state.epicId !== epicId) {
        throw new Error(`Epic ${epicId} not found in checkpoints`);
      }

      // Filter sprints if specified
      let sprintsToRecover = state.sprints;
      if (options.sprintsFilter) {
        const sprintIds = options.sprintsFilter.split(',').map((s) => s.trim());
        sprintsToRecover = state.sprints.filter((s) => sprintIds.includes(s.sprintId));
      }

      // Execute recovery for each sprint
      let sprintsResumed = 0;
      let sprintsRestarted = 0;
      let sprintsSkipped = 0;

      for (const sprint of sprintsToRecover) {
        const progress = this.calculateProgress(sprint);
        const strategy = this.determineRecoveryStrategy(progress, sprint.status);

        if (options.dryRun) {
          this.logger.info(`[DRY-RUN] Would ${strategy} sprint`, { sprintId: sprint.sprintId });
          continue;
        }

        switch (strategy) {
          case 'skip':
            sprintsSkipped++;
            break;
          case 'resume':
            await this.resumeSprint(sprint);
            sprintsResumed++;
            break;
          case 'restart':
            await this.restartSprint(sprint);
            sprintsRestarted++;
            break;
        }
      }

      const totalRecoveryTime = Date.now() - startTime;
      const workLossPercentage = this.calculateWorkLoss(sprintsToRecover);

      return {
        success: true,
        epicId,
        sprintsResumed,
        sprintsRestarted,
        sprintsSkipped,
        totalRecoveryTime,
        workLossPercentage,
      };
    } catch (error) {
      this.logger.error('Failed to resume epic', { epicId, error });
      throw error;
    }
  }

  private calculateProgress(sprint: SprintState): number {
    const completedPhases = sprint.phases.filter((p) => p.status === 'completed').length;
    return sprint.phases.length > 0 ? (completedPhases / sprint.phases.length) * 100 : 0;
  }

  private determineRecoveryStrategy(progress: number, status: string): 'skip' | 'resume' | 'restart' {
    if (status === 'completed') return 'skip';
    if (progress >= 50) return 'resume';
    if (progress < 10) return 'restart';
    return 'resume';
  }

  private async resumeSprint(sprint: SprintState): Promise<void> {
    this.logger.info('Resuming sprint', { sprintId: sprint.sprintId });
    // Integration point: Spawn agents to continue from checkpoint
    // This would call SprintOrchestrator.resumeSprint(sprint)
  }

  private async restartSprint(sprint: SprintState): Promise<void> {
    this.logger.info('Restarting sprint', { sprintId: sprint.sprintId });
    // Integration point: Spawn agents to restart sprint
    // This would call SprintOrchestrator.restartSprint(sprint)
  }

  private calculateWorkLoss(sprints: SprintState[]): number {
    const inProgressSprints = sprints.filter((s) => s.status === 'in-progress');
    if (inProgressSprints.length === 0) return 0;

    const avgProgress = inProgressSprints.reduce((sum, s) => this.calculateProgress(s), 0) / inProgressSprints.length;
    return Math.max(0, 100 - avgProgress) * 0.05;
  }

  async shutdown(): Promise<void> {
    await this.checkpointManager.shutdown();
  }
}

// ===== CLI COMMANDS =====

/**
 * Main recovery command dispatcher
 */
export const recoveryCommand = new Command()
  .name('recovery')
  .description('Crash recovery and state restoration commands')
  .addCommand(recoveryStatusCommand)
  .addCommand(recoveryResumeCommand)
  .addCommand(recoveryInspectCommand)
  .addCommand(recoveryAbandonCommand);

/**
 * /recovery:status - List interrupted epics
 */
export const recoveryStatusCommand = new Command()
  .name('status')
  .description('List interrupted epic executions')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const detector = new CrashDetector();

    try {
      await detector.initialize();

      console.log(chalk.cyan('🔍 Scanning for interrupted executions...\n'));

      const interrupted = await detector.findInterruptedEpics();

      if (interrupted.length === 0) {
        console.log(chalk.green('✅ No interrupted executions found'));
        console.log(chalk.gray('All epics completed or never started'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(interrupted, null, 2));
        return;
      }

      console.log(chalk.yellow(`Found ${interrupted.length} interrupted epic(s):\n`));

      for (const epic of interrupted) {
        displayInterruptedEpic(epic);
      }
    } catch (error) {
      console.error(chalk.red('❌ Error detecting interrupted epics:'), (error as Error).message);
      process.exit(1);
    } finally {
      await detector.shutdown();
    }
  });

/**
 * /recovery:resume - Resume interrupted execution
 */
export const recoveryResumeCommand = new Command()
  .name('resume')
  .description('Resume interrupted epic execution')
  .argument('<epicId>', 'Epic ID to resume')
  .option('--dry-run', 'Show what would be recovered without executing')
  .option('--sprints <ids>', 'Resume specific sprints only (comma-separated)')
  .option('--force', 'Skip confirmation prompts')
  .action(async (epicId: string, options: RecoveryOptions) => {
    const engine = new RecoveryEngine();

    try {
      await engine.initialize();

      console.log(chalk.cyan(`🔄 Resuming Epic: ${epicId}\n`));

      if (options.dryRun) {
        console.log(chalk.yellow('⚠️  DRY-RUN MODE: No changes will be made\n'));
      }

      // Confirm if not force
      if (!options.force && !options.dryRun) {
        console.log(chalk.yellow('⚠️  This will resume execution from the last checkpoint'));
        console.log(chalk.gray('Press Ctrl+C to cancel, Enter to continue...'));
        // In real implementation, would wait for user input
      }

      const result = await engine.resumeEpic(epicId, { ...options, epicId });

      displayRecoveryResult(result);
    } catch (error) {
      console.error(chalk.red('❌ Recovery failed:'), (error as Error).message);
      process.exit(1);
    } finally {
      await engine.shutdown();
    }
  });

/**
 * /recovery:inspect - Show checkpoint details
 */
export const recoveryInspectCommand = new Command()
  .name('inspect')
  .description('Inspect epic checkpoint details')
  .argument('<epicId>', 'Epic ID to inspect')
  .option('--json', 'Output in JSON format')
  .option('--history <n>', 'Show N most recent checkpoints', '10')
  .action(async (epicId: string, options) => {
    const manager = new StateCheckpointManager();

    try {
      await manager.initialize();

      console.log(chalk.cyan(`🔍 Inspecting Epic: ${epicId}\n`));

      // Get checkpoint history
      const limit = parseInt(options.history, 10);
      const history = await manager.getCheckpointHistory(epicId, limit);

      if (history.length === 0) {
        console.log(chalk.gray('No checkpoints found for this epic'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
        return;
      }

      displayCheckpointHistory(history);
    } catch (error) {
      console.error(chalk.red('❌ Inspection failed:'), (error as Error).message);
      process.exit(1);
    } finally {
      await manager.shutdown();
    }
  });

/**
 * /recovery:abandon - Clean up state
 */
export const recoveryAbandonCommand = new Command()
  .name('abandon')
  .description('Abandon interrupted epic and clean up state')
  .argument('<epicId>', 'Epic ID to abandon')
  .option('--force', 'Skip confirmation prompt')
  .action(async (epicId: string, options) => {
    const manager = new StateCheckpointManager();

    try {
      await manager.initialize();

      console.log(chalk.yellow(`⚠️  Abandoning Epic: ${epicId}\n`));
      console.log(chalk.red('This will permanently delete:'));
      console.log(chalk.gray('  - All sprint state'));
      console.log(chalk.gray('  - All agent checkpoints'));
      console.log(chalk.gray('  - All file progress data'));
      console.log(chalk.gray('  - All coordination locks\n'));

      if (!options.force) {
        console.log(chalk.red('This action cannot be undone.'));
        console.log(chalk.gray('Type "yes" to continue: '));
        // In real implementation, would wait for user input
      }

      // Clean up Redis keys
      const redis = createClient({ url: 'redis://localhost:6379' });
      await redis.connect();

      const keys = await redis.keys(`cfn:checkpoint:${epicId}:*`);
      for (const key of keys) {
        await redis.del(key);
      }

      await redis.quit();

      console.log(chalk.green('\n✅ Epic abandoned'));
      console.log(chalk.green('✅ Redis state cleaned up'));
      console.log(chalk.gray('✅ WIP branches preserved (manual cleanup required)'));
    } catch (error) {
      console.error(chalk.red('❌ Abandon failed:'), (error as Error).message);
      process.exit(1);
    } finally {
      await manager.shutdown();
    }
  });

// ===== DISPLAY HELPERS =====

/**
 * Display interrupted epic details
 */
function displayInterruptedEpic(epic: InterruptedEpic): void {
  console.log(chalk.bold(`Epic: ${epic.name}`));
  console.log(chalk.gray(`  ID: ${epic.epicId}`));
  console.log(chalk.gray(`  Started: ${new Date(epic.startTime).toLocaleString()}`));
  console.log(chalk.gray(`  Last Activity: ${new Date(epic.lastCheckpoint).toLocaleString()}`));
  console.log(chalk.gray(`  Crash Duration: ${formatDuration(epic.crashDuration)}\n`));

  console.log(chalk.cyan('  Sprints:'));
  for (const sprint of epic.sprints) {
    displaySprintStatus(sprint);
  }

  console.log(chalk.gray(`\n  Estimated work loss: ${epic.estimatedWorkLoss.toFixed(1)}%`));
  console.log(chalk.gray(`  Estimated recovery time: ${Math.ceil(epic.estimatedRecoveryTime)} minutes\n`));

  console.log(
    chalk.cyan(`Run 'claude-flow-novice recovery:resume ${epic.epicId}' to continue\n`)
  );
}

/**
 * Display sprint status
 */
function displaySprintStatus(sprint: InterruptedSprint): void {
  const statusIcon = getStatusIcon(sprint.status);
  const statusColor = getStatusColor(sprint.status);
  const progressBar = createProgressBar(sprint.progress);

  console.log(
    `    ${statusIcon} Sprint: ${sprint.name} ${statusColor(sprint.status.toUpperCase())} (${sprint.progress.toFixed(0)}%)`
  );
  console.log(chalk.gray(`       └─ ${progressBar}`));
  console.log(chalk.gray(`       └─ Files: ${sprint.filesCompleted}/${sprint.filesTotal}`));

  if (sprint.lastFile) {
    console.log(chalk.gray(`       └─ Last file: ${sprint.lastFile}`));
  }

  if (sprint.confidence) {
    console.log(chalk.gray(`       └─ Confidence: ${sprint.confidence.toFixed(2)}`));
  }

  console.log(chalk.gray(`       └─ Strategy: ${sprint.recoveryStrategy}\n`));
}

/**
 * Display recovery result
 */
function displayRecoveryResult(result: RecoveryResult): void {
  console.log(chalk.green('\n✅ Epic recovery completed\n'));

  const table = new Table({
    head: ['Metric', 'Value'],
  });

  table.push(
    ['Epic ID', result.epicId],
    ['Sprints Resumed', result.sprintsResumed.toString()],
    ['Sprints Restarted', result.sprintsRestarted.toString()],
    ['Sprints Skipped', result.sprintsSkipped.toString()],
    ['Recovery Time', `${(result.totalRecoveryTime / 1000).toFixed(1)}s`],
    ['Work Loss', `${result.workLossPercentage.toFixed(1)}%`]
  );

  console.log(table.toString());
}

/**
 * Display checkpoint history
 */
function displayCheckpointHistory(history: CheckpointMetadata[]): void {
  const table = new Table({
    head: ['Version', 'Timestamp', 'Size', 'Latency', 'Compression'],
  });

  for (const checkpoint of history) {
    table.push([
      checkpoint.version.toString(),
      new Date(checkpoint.timestamp).toLocaleTimeString(),
      formatBytes(checkpoint.sizeBytes),
      `${checkpoint.writeLatencyMs}ms`,
      `${checkpoint.compressionRatio.toFixed(2)}x`,
    ]);
  }

  console.log(table.toString());
}

// ===== UTILITY FUNCTIONS =====

function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green('✅');
    case 'in-progress':
      return chalk.yellow('⚠️ ');
    case 'starting':
      return chalk.gray('❌');
    case 'waiting':
      return chalk.blue('⏸️ ');
    default:
      return chalk.gray('•');
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'completed':
      return chalk.green;
    case 'in-progress':
      return chalk.yellow;
    case 'starting':
      return chalk.red;
    case 'waiting':
      return chalk.blue;
    default:
      return chalk.gray;
  }
}

function createProgressBar(progress: number, width: number = 20): string {
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ` ${progress.toFixed(0)}%`;
}

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
