/**
 * Git Checkpoint Manager - Auto-commit WIP Progress Every 5 Minutes
 *
 * Provides automatic Git WIP commits for crash recovery:
 * - Auto-commit work in progress every 5 minutes (configurable)
 * - Creates WIP branches per sprint (cfn-epic-{epicId}/sprint-{sprintId}-wip)
 * - Tags commits with confidence scores and metadata
 * - Compares Git checkpoint vs Redis checkpoint on recovery
 * - Uses newer checkpoint (Redis usually more recent)
 *
 * Acceptance Criteria:
 * - WIP commits every 5 minutes during execution
 * - Commits include sprint progress metadata (confidence, agents, files)
 * - Recovery uses most recent checkpoint (git or Redis)
 * - WIP branches cleaned up after successful completion
 *
 * @module cfn-loop/git-checkpoint-manager
 */

import { EventEmitter } from 'node:events';
import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';
import { Logger } from '../core/logger.js';
import { createClient, RedisClientType } from 'redis';

// ===== TYPE DEFINITIONS =====

/**
 * Git checkpoint metadata stored in commit tags
 */
export interface GitCheckpoint {
  epicId: string;
  sprintId: string;
  branch: string;
  commitHash: string;
  timestamp: number;
  confidence: number;
  metadata: {
    phase?: string;
    agents?: string[];
    files?: string[];
    loop3Iterations?: number;
    loop2Iterations?: number;
    status?: string;
    [key: string]: any;
  };
}

/**
 * Checkpoint comparison result
 */
export interface CheckpointComparison {
  source: 'git' | 'redis';
  gitTimestamp: number | null;
  redisTimestamp: number | null;
  timeDiffMs: number;
  recommendation: 'use-git' | 'use-redis' | 'no-checkpoints';
  reason: string;
}

/**
 * Configuration for Git checkpoint manager
 */
export interface GitCheckpointConfig {
  redisUrl?: string;
  autoCommitIntervalMs?: number; // Default: 300000 (5 minutes)
  gitBaseDir?: string; // Default: process.cwd()
  branchPrefix?: string; // Default: 'cfn-epic'
  enableAutoCleanup?: boolean; // Default: true
  maxWIPBranchesPerEpic?: number; // Default: 10
}

/**
 * WIP commit metadata
 */
export interface WIPCommitMetadata {
  sprintId: string;
  confidence: number;
  timestamp: number;
  phase?: string;
  agents?: string[];
  files?: string[];
}

/**
 * Git checkpoint statistics
 */
export interface GitCheckpointStats {
  totalCommits: number;
  totalBranches: number;
  lastCommitTime: number;
  commitFailures: number;
  averageCommitLatencyMs: number;
}

// ===== GIT CHECKPOINT MANAGER =====

/**
 * Manages automatic Git WIP commits for crash recovery
 *
 * Features:
 * - Auto-commit every 5 minutes (configurable)
 * - WIP branches per sprint for isolation
 * - Git tags with JSON metadata for rich checkpoint data
 * - Checkpoint comparison (Git vs Redis) for recovery
 * - Automatic cleanup of WIP branches after completion
 *
 * Usage:
 * ```typescript
 * const manager = new GitCheckpointManager({
 *   autoCommitIntervalMs: 300000, // 5 minutes
 *   enableAutoCleanup: true
 * });
 *
 * await manager.initialize();
 * const branch = await manager.createWIPBranch('epic-123', 'sprint-1');
 * await manager.autoCommitProgress('sprint-1', 0.85);
 * manager.startAutoCheckpoint();
 * ```
 */
export class GitCheckpointManager extends EventEmitter {
  private logger: Logger;
  private config: Required<GitCheckpointConfig>;
  private git: SimpleGit;
  private redis: RedisClientType | null = null;
  private autoCommitTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private stats: GitCheckpointStats;
  private currentSprintId: string | null = null;
  private currentBranch: string | null = null;
  private currentMetadata: WIPCommitMetadata | null = null;

  constructor(config: GitCheckpointConfig = {}) {
    super();
    this.logger = new Logger({ level: 'info', format: 'json', name: 'GitCheckpointManager' }, 'GitCheckpointManager');

    this.config = {
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      autoCommitIntervalMs: config.autoCommitIntervalMs || 300000, // 5 minutes
      gitBaseDir: config.gitBaseDir || process.cwd(),
      branchPrefix: config.branchPrefix || 'cfn-epic',
      enableAutoCleanup: config.enableAutoCleanup ?? true,
      maxWIPBranchesPerEpic: config.maxWIPBranchesPerEpic || 10,
    };

    // Initialize simple-git
    const options: Partial<SimpleGitOptions> = {
      baseDir: this.config.gitBaseDir,
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    this.git = simpleGit(options);

    this.stats = {
      totalCommits: 0,
      totalBranches: 0,
      lastCommitTime: 0,
      commitFailures: 0,
      averageCommitLatencyMs: 0,
    };
  }

  /**
   * Initialize Git checkpoint manager and Redis connection
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Git checkpoint manager');

      // Verify Git repository
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`Not a Git repository: ${this.config.gitBaseDir}`);
      }

      // Create Redis client
      this.redis = createClient({ url: this.config.redisUrl });

      this.redis.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
        this.emit('error', err);
      });

      await this.redis.connect();

      this.emit('initialized');
      this.logger.info('Git checkpoint manager initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Git checkpoint manager', { error });
      throw error;
    }
  }

  /**
   * Create WIP branch for a sprint
   * Branch naming: cfn-epic-{epicId}/sprint-{sprintId}-wip
   */
  async createWIPBranch(epicId: string, sprintId: string): Promise<string> {
    try {
      const branchName = `${this.config.branchPrefix}-${epicId}/sprint-${sprintId}-wip`;

      // Check if branch already exists
      const branches = await this.git.branchLocal();
      const branchExists = branches.all.includes(branchName);

      if (!branchExists) {
        // Create new branch
        await this.git.checkoutBranch(branchName, 'HEAD');
        this.stats.totalBranches++;

        this.logger.info('Created WIP branch', { branchName, epicId, sprintId });
      } else {
        // Switch to existing branch
        await this.git.checkout(branchName);
        this.logger.info('Switched to existing WIP branch', { branchName });
      }

      this.currentBranch = branchName;
      this.currentSprintId = sprintId;

      // Store branch info in Redis
      if (this.redis) {
        const redisKey = `cfn:git-checkpoint:${epicId}`;
        await this.redis.setEx(
          redisKey,
          86400, // 24 hours TTL
          JSON.stringify({
            epicId,
            sprintId,
            branch: branchName,
            createdAt: Date.now(),
          })
        );
      }

      this.emit('branch-created', { epicId, sprintId, branch: branchName });
      return branchName;
    } catch (error) {
      this.logger.error('Failed to create WIP branch', { error, epicId, sprintId });
      throw error;
    }
  }

  /**
   * Auto-commit work in progress with metadata
   * Commit message format: WIP: Sprint {id} - Progress {confidence}% - {timestamp}
   */
  async autoCommitProgress(
    sprintId: string,
    confidence: number,
    metadata: Partial<WIPCommitMetadata> = {}
  ): Promise<string> {
    const startTime = Date.now();

    try {
      // Check if there are changes to commit
      const status = await this.git.status();
      const hasChanges = status.modified.length > 0 || status.not_added.length > 0 || status.created.length > 0;

      if (!hasChanges) {
        this.logger.debug('No changes to commit', { sprintId });
        return '';
      }

      // Stage all changes
      await this.git.add('.');

      // Create commit metadata
      const timestamp = Date.now();
      const commitMetadata: WIPCommitMetadata = {
        sprintId,
        confidence,
        timestamp,
        ...metadata,
      };

      // Generate commit message
      const confidencePercent = Math.round(confidence * 100);
      const dateStr = new Date(timestamp).toISOString();
      const commitMessage = `WIP: Sprint ${sprintId} - Progress ${confidencePercent}% - ${dateStr}`;

      // Create commit
      await this.git.commit(commitMessage);

      // Get commit hash
      const log = await this.git.log({ maxCount: 1 });
      const commitHash = log.latest?.hash || '';

      // Tag commit with metadata
      await this.tagCommitWithMetadata(commitHash, commitMetadata);

      // Calculate commit latency
      const commitLatencyMs = Date.now() - startTime;

      // Update statistics
      this.stats.totalCommits++;
      this.stats.lastCommitTime = timestamp;
      const totalLatency = this.stats.averageCommitLatencyMs * (this.stats.totalCommits - 1);
      this.stats.averageCommitLatencyMs = (totalLatency + commitLatencyMs) / this.stats.totalCommits;

      this.currentMetadata = commitMetadata;

      this.logger.info('Auto-committed WIP progress', {
        sprintId,
        confidence: confidencePercent,
        commitHash: commitHash.substring(0, 8),
        latencyMs: commitLatencyMs,
        files: status.modified.length + status.created.length,
      });

      this.emit('commit-created', {
        sprintId,
        commitHash,
        confidence,
        latencyMs: commitLatencyMs,
      });

      return commitHash;
    } catch (error) {
      this.stats.commitFailures++;
      this.logger.error('Failed to auto-commit progress', { error, sprintId });
      this.emit('commit-error', error);
      throw error;
    }
  }

  /**
   * Tag commit with JSON metadata
   * Tag format: wip-{sprintId}-{timestamp}
   */
  async tagCommitWithMetadata(commitHash: string, metadata: any): Promise<void> {
    try {
      const tagName = `wip-${metadata.sprintId}-${metadata.timestamp}`;
      const tagMessage = JSON.stringify(metadata, null, 2);

      // Create annotated tag with metadata
      await this.git.tag(['-a', tagName, '-m', tagMessage, commitHash]);

      this.logger.debug('Tagged commit with metadata', {
        commitHash: commitHash.substring(0, 8),
        tagName,
      });

      this.emit('commit-tagged', { commitHash, tagName, metadata });
    } catch (error) {
      this.logger.error('Failed to tag commit', { error, commitHash });
      // Don't throw - tagging failure shouldn't stop checkpoint
    }
  }

  /**
   * Compare Git checkpoint vs Redis checkpoint and return newer one
   */
  async compareCheckpoints(epicId: string): Promise<CheckpointComparison> {
    try {
      // Get Git checkpoint (latest WIP commit)
      let gitTimestamp: number | null = null;
      try {
        const branches = await this.git.branchLocal();
        const wipBranches = branches.all.filter((b) => b.includes(`${this.config.branchPrefix}-${epicId}`) && b.includes('-wip'));

        if (wipBranches.length > 0) {
          // Get latest commit from WIP branches
          for (const branch of wipBranches) {
            await this.git.checkout(branch);
            const log = await this.git.log({ maxCount: 1 });
            if (log.latest) {
              const commitDate = new Date(log.latest.date).getTime();
              if (!gitTimestamp || commitDate > gitTimestamp) {
                gitTimestamp = commitDate;
              }
            }
          }
        }
      } catch (error) {
        this.logger.warn('Failed to get Git checkpoint', { error });
      }

      // Get Redis checkpoint
      let redisTimestamp: number | null = null;
      if (this.redis) {
        try {
          const keys = await this.redis.keys(`cfn:checkpoint:${epicId}:latest`);
          if (keys.length > 0) {
            const latestCheckpointId = await this.redis.get(keys[0]);
            if (latestCheckpointId) {
              const match = latestCheckpointId.match(/checkpoint-.+-(\d+)/);
              if (match) {
                const checkpointKey = `cfn:checkpoint:${epicId}:${match[1]}`;
                const checkpointData = await this.redis.get(checkpointKey);
                if (checkpointData) {
                  const { metadata } = JSON.parse(checkpointData);
                  redisTimestamp = metadata.timestamp;
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn('Failed to get Redis checkpoint', { error });
        }
      }

      // Compare timestamps
      let source: 'git' | 'redis' | 'no-checkpoints';
      let recommendation: 'use-git' | 'use-redis' | 'no-checkpoints';
      let reason: string;
      let timeDiffMs: number;

      if (!gitTimestamp && !redisTimestamp) {
        source = 'no-checkpoints';
        recommendation = 'no-checkpoints';
        reason = 'No checkpoints found';
        timeDiffMs = 0;
      } else if (!redisTimestamp) {
        source = 'git';
        recommendation = 'use-git';
        reason = 'Only Git checkpoint available';
        timeDiffMs = 0;
      } else if (!gitTimestamp) {
        source = 'redis';
        recommendation = 'use-redis';
        reason = 'Only Redis checkpoint available';
        timeDiffMs = 0;
      } else {
        timeDiffMs = Math.abs(redisTimestamp - gitTimestamp);
        if (redisTimestamp > gitTimestamp) {
          source = 'redis';
          recommendation = 'use-redis';
          reason = `Redis checkpoint is ${Math.round(timeDiffMs / 1000)}s newer`;
        } else {
          source = 'git';
          recommendation = 'use-git';
          reason = `Git checkpoint is ${Math.round(timeDiffMs / 1000)}s newer`;
        }
      }

      const comparison: CheckpointComparison = {
        source: source === 'no-checkpoints' ? 'redis' : source,
        gitTimestamp,
        redisTimestamp,
        timeDiffMs,
        recommendation,
        reason,
      };

      this.logger.info('Checkpoint comparison complete', comparison);
      this.emit('checkpoints-compared', comparison);

      return comparison;
    } catch (error) {
      this.logger.error('Failed to compare checkpoints', { error });
      throw error;
    }
  }

  /**
   * Start automatic checkpointing at configured interval
   */
  startAutoCheckpoint(): void {
    if (this.isRunning) {
      this.logger.warn('Auto-checkpoint already running');
      return;
    }

    this.isRunning = true;
    this.autoCommitTimer = setInterval(async () => {
      if (this.currentSprintId && this.currentMetadata) {
        await this.autoCommitProgress(
          this.currentSprintId,
          this.currentMetadata.confidence,
          this.currentMetadata
        );
      }
    }, this.config.autoCommitIntervalMs);

    this.logger.info('Auto-checkpoint started', {
      intervalMs: this.config.autoCommitIntervalMs,
    });
    this.emit('auto-checkpoint-started');
  }

  /**
   * Stop automatic checkpointing
   */
  stopAutoCheckpoint(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.autoCommitTimer) {
      clearInterval(this.autoCommitTimer);
      this.autoCommitTimer = null;
    }

    this.isRunning = false;
    this.logger.info('Auto-checkpoint stopped');
    this.emit('auto-checkpoint-stopped');
  }

  /**
   * Update current sprint metadata (for auto-commits)
   */
  updateMetadata(metadata: WIPCommitMetadata): void {
    this.currentMetadata = metadata;
    this.currentSprintId = metadata.sprintId;
  }

  /**
   * Cleanup WIP branches after successful completion
   */
  async cleanupWIPBranches(epicId: string): Promise<void> {
    if (!this.config.enableAutoCleanup) {
      this.logger.debug('Auto-cleanup disabled, skipping WIP branch cleanup');
      return;
    }

    try {
      // Get all WIP branches for the epic
      const branches = await this.git.branchLocal();
      const wipBranches = branches.all.filter((b) => b.includes(`${this.config.branchPrefix}-${epicId}`) && b.includes('-wip'));

      if (wipBranches.length === 0) {
        this.logger.debug('No WIP branches to cleanup', { epicId });
        return;
      }

      // Switch to main/master before deleting
      const mainBranch = branches.all.includes('main') ? 'main' : 'master';
      await this.git.checkout(mainBranch);

      // Delete WIP branches
      for (const branch of wipBranches) {
        await this.git.deleteLocalBranch(branch, true); // Force delete
        this.logger.debug('Deleted WIP branch', { branch });
      }

      // Cleanup Git tags
      const tags = await this.git.tags();
      const wipTags = tags.all.filter((t) => t.startsWith('wip-'));
      for (const tag of wipTags) {
        await this.git.tag(['-d', tag]);
      }

      this.logger.info('Cleaned up WIP branches', {
        epicId,
        branchesDeleted: wipBranches.length,
        tagsDeleted: wipTags.length,
      });

      this.emit('branches-cleaned', { epicId, count: wipBranches.length });
    } catch (error) {
      this.logger.error('Failed to cleanup WIP branches', { error, epicId });
      // Don't throw - cleanup failure shouldn't stop execution
    }
  }

  /**
   * Get Git checkpoint statistics
   */
  getStats(): GitCheckpointStats {
    return { ...this.stats };
  }

  /**
   * Shutdown Git checkpoint manager
   */
  async shutdown(): Promise<void> {
    this.stopAutoCheckpoint();

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.logger.info('Git checkpoint manager shutdown');
    this.emit('shutdown');
  }
}
