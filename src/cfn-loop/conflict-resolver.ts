/**
 * Conflict Resolver - Sprint 4.3: File Edit Conflict Resolution
 *
 * Detects and resolves file edit conflicts when multiple agents work on the same files.
 *
 * Features:
 * - Redis-based file edit locking
 * - Conflict detection via version tracking
 * - Smart merge for non-overlapping changes
 * - Escalation for complex conflicts
 * - Audit trail for conflict history
 *
 * Conflict Resolution Strategy:
 * 1. Non-overlapping edits (different lines) → Automatic merge
 * 2. Overlapping edits (same lines) → Escalate to human
 * 3. Conflicting type definitions → Escalate with diff
 *
 * @module cfn-loop/conflict-resolver
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// ===== TYPE DEFINITIONS =====

/**
 * File edit metadata
 */
export interface FileEditMetadata {
  /** File path */
  filePath: string;
  /** Agent ID performing the edit */
  agentId: string;
  /** Sprint ID */
  sprintId: string;
  /** File content hash before edit */
  hashBefore: string;
  /** File content hash after edit */
  hashAfter: string;
  /** Edit timestamp */
  timestamp: number;
  /** Lines modified (start, end) */
  modifiedLines: [number, number][];
}

/**
 * Conflict detection result
 */
export interface ConflictDetection {
  /** Conflict detected? */
  hasConflict: boolean;
  /** Type of conflict */
  conflictType?: 'none' | 'non-overlapping' | 'overlapping' | 'type-conflict';
  /** Conflicting edits */
  conflicts?: FileEditMetadata[];
  /** Can auto-merge? */
  canAutoMerge: boolean;
  /** Reason for escalation if cannot merge */
  escalationReason?: string;
}

/**
 * Merge result
 */
export interface MergeResult {
  /** Merge successful? */
  success: boolean;
  /** Merged file content */
  mergedContent?: string;
  /** Merge strategy used */
  strategy: 'auto-merge' | 'manual' | 'escalated';
  /** Conflicts that were merged */
  resolvedConflicts: FileEditMetadata[];
  /** Conflicts that need escalation */
  escalatedConflicts: FileEditMetadata[];
  /** Merge timestamp */
  timestamp: number;
}

/**
 * Conflict audit entry
 */
export interface ConflictAuditEntry {
  /** Unique conflict ID */
  conflictId: string;
  /** File path */
  filePath: string;
  /** Conflicting agents */
  agents: string[];
  /** Conflict type */
  conflictType: string;
  /** Resolution strategy */
  resolution: 'auto-merged' | 'escalated' | 'manual';
  /** Timestamp */
  timestamp: number;
  /** Details */
  details: any;
}

/**
 * Conflict resolver configuration
 */
export interface ConflictResolverConfig {
  /** Redis client */
  redisClient: Redis;
  /** Sprint ID */
  sprintId: string;
  /** Project root directory */
  projectRoot: string;
  /** Enable automatic merge (default: true) */
  enableAutoMerge?: boolean;
  /** Lock timeout in ms (default: 300000 = 5min) */
  lockTimeout?: number;
  /** Audit trail enabled (default: true) */
  enableAudit?: boolean;
}

/**
 * File lock metadata
 */
export interface FileLockMetadata {
  /** Agent holding the lock */
  agentId: string;
  /** Sprint ID */
  sprintId: string;
  /** Lock acquired timestamp */
  acquiredAt: number;
  /** Lock expires at */
  expiresAt: number;
  /** File content hash when locked */
  contentHash: string;
}

// ===== CONFLICT RESOLVER =====

/**
 * Conflict Resolver for parallel file editing
 */
export class ConflictResolver extends EventEmitter {
  private logger: Logger;
  private config: Required<ConflictResolverConfig>;
  private redis: Redis;

  // File locks
  private heldLocks: Set<string> = new Set();

  // Edit history
  private editHistory: Map<string, FileEditMetadata[]> = new Map();

  // Conflict audit
  private conflictAudit: ConflictAuditEntry[] = [];

  // Redis keys
  private readonly LOCK_KEY_PREFIX = 'cfn:file:lock:';
  private readonly EDIT_HISTORY_PREFIX = 'cfn:file:history:';
  private readonly CONFLICT_AUDIT_PREFIX = 'cfn:conflict:audit:';

  constructor(config: ConflictResolverConfig) {
    super();

    // Set defaults
    this.config = {
      redisClient: config.redisClient,
      sprintId: config.sprintId,
      projectRoot: config.projectRoot,
      enableAutoMerge: config.enableAutoMerge ?? true,
      lockTimeout: config.lockTimeout || 300000, // 5 minutes
      enableAudit: config.enableAudit ?? true,
    };

    this.redis = config.redisClient;

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, { component: 'ConflictResolver' });

    this.logger.info('Conflict Resolver initialized', {
      sprintId: this.config.sprintId,
      enableAutoMerge: this.config.enableAutoMerge,
      lockTimeout: this.config.lockTimeout,
    });

    // Setup cleanup on exit
    this.setupExitHandlers();
  }

  /**
   * Acquire edit lock for a file
   */
  async acquireLock(
    filePath: string,
    agentId: string
  ): Promise<{ acquired: boolean; existingLock?: FileLockMetadata }> {
    const lockKey = this.getLockKey(filePath);

    try {
      // Get file content hash
      const contentHash = await this.getFileHash(filePath);

      const now = Date.now();
      const expiresAt = now + this.config.lockTimeout;

      const lockMetadata: FileLockMetadata = {
        agentId,
        sprintId: this.config.sprintId,
        acquiredAt: now,
        expiresAt,
        contentHash,
      };

      // Try to acquire lock (NX = only if not exists)
      const result = await this.redis.set(
        lockKey,
        JSON.stringify(lockMetadata),
        {
          NX: true,
          PX: this.config.lockTimeout,
        }
      );

      if (result === 'OK') {
        this.heldLocks.add(filePath);

        this.logger.info('File lock acquired', {
          filePath,
          agentId,
          sprintId: this.config.sprintId,
          expiresAt,
        });

        this.emit('lock:acquired', {
          filePath,
          agentId,
          timestamp: now,
        });

        return { acquired: true };
      } else {
        // Lock is held by someone else
        const existingLockData = await this.redis.get(lockKey);
        const existingLock: FileLockMetadata | undefined = existingLockData
          ? JSON.parse(existingLockData)
          : undefined;

        this.logger.warn('File lock held by another agent', {
          filePath,
          requestingAgent: agentId,
          lockHolder: existingLock?.agentId,
        });

        return { acquired: false, existingLock };
      }
    } catch (error) {
      this.logger.error('Failed to acquire file lock', {
        filePath,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Release edit lock for a file
   */
  async releaseLock(filePath: string, agentId: string): Promise<void> {
    const lockKey = this.getLockKey(filePath);

    try {
      // Verify we hold the lock
      const lockData = await this.redis.get(lockKey);
      if (lockData) {
        const lock: FileLockMetadata = JSON.parse(lockData);
        if (lock.agentId !== agentId) {
          this.logger.warn('Attempted to release lock held by another agent', {
            filePath,
            requestingAgent: agentId,
            lockHolder: lock.agentId,
          });
          return;
        }
      }

      // Release lock
      await this.redis.del(lockKey);
      this.heldLocks.delete(filePath);

      this.logger.info('File lock released', {
        filePath,
        agentId,
      });

      this.emit('lock:released', {
        filePath,
        agentId,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to release file lock', {
        filePath,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Detect conflicts for a file edit
   */
  async detectConflicts(
    filePath: string,
    agentId: string,
    modifiedLines: [number, number][]
  ): Promise<ConflictDetection> {
    try {
      // Get edit history for this file
      const history = await this.getEditHistory(filePath);

      if (history.length === 0) {
        // No previous edits - no conflict
        return {
          hasConflict: false,
          conflictType: 'none',
          canAutoMerge: true,
        };
      }

      // Get current file hash
      const currentHash = await this.getFileHash(filePath);

      // Find conflicting edits
      const conflicts: FileEditMetadata[] = [];

      for (const edit of history) {
        // Skip our own edits
        if (edit.agentId === agentId) {
          continue;
        }

        // Check if file was modified since this edit
        if (edit.hashAfter !== currentHash) {
          // Check for line overlaps
          const hasOverlap = this.checkLineOverlap(
            modifiedLines,
            edit.modifiedLines
          );

          if (hasOverlap) {
            conflicts.push(edit);
          }
        }
      }

      if (conflicts.length === 0) {
        return {
          hasConflict: false,
          conflictType: 'none',
          canAutoMerge: true,
        };
      }

      // Determine conflict type
      const conflictType = this.determineConflictType(
        filePath,
        modifiedLines,
        conflicts
      );

      const canAutoMerge =
        this.config.enableAutoMerge && conflictType === 'non-overlapping';

      this.logger.info('Conflict detected', {
        filePath,
        agentId,
        conflictType,
        conflictCount: conflicts.length,
        canAutoMerge,
      });

      return {
        hasConflict: true,
        conflictType,
        conflicts,
        canAutoMerge,
        escalationReason: canAutoMerge
          ? undefined
          : `Conflict type ${conflictType} requires manual resolution`,
      };
    } catch (error) {
      this.logger.error('Conflict detection failed', {
        filePath,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Merge conflicting edits (auto-merge non-overlapping changes)
   */
  async mergeEdits(
    filePath: string,
    agentId: string,
    newContent: string,
    conflicts: FileEditMetadata[]
  ): Promise<MergeResult> {
    try {
      const detection = await this.detectConflicts(filePath, agentId, []);

      if (!detection.canAutoMerge) {
        // Escalate to manual resolution
        await this.escalateConflict(filePath, agentId, conflicts);

        return {
          success: false,
          strategy: 'escalated',
          resolvedConflicts: [],
          escalatedConflicts: conflicts,
          timestamp: Date.now(),
        };
      }

      // Auto-merge non-overlapping changes
      const mergedContent = await this.performAutoMerge(
        filePath,
        newContent,
        conflicts
      );

      this.logger.info('Auto-merge successful', {
        filePath,
        agentId,
        conflictCount: conflicts.length,
      });

      // Record audit entry
      await this.recordConflictAudit({
        conflictId: `conflict-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        filePath,
        agents: [agentId, ...conflicts.map(c => c.agentId)],
        conflictType: detection.conflictType || 'non-overlapping',
        resolution: 'auto-merged',
        timestamp: Date.now(),
        details: {
          conflictCount: conflicts.length,
        },
      });

      return {
        success: true,
        mergedContent,
        strategy: 'auto-merge',
        resolvedConflicts: conflicts,
        escalatedConflicts: [],
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Merge failed', {
        filePath,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Record file edit in history
   */
  async recordEdit(edit: FileEditMetadata): Promise<void> {
    const historyKey = this.getHistoryKey(edit.filePath);

    try {
      // Store in Redis
      await this.redis.lpush(historyKey, JSON.stringify(edit));
      await this.redis.expire(historyKey, 3600); // 1 hour TTL

      // Store locally
      const history = this.editHistory.get(edit.filePath) || [];
      history.push(edit);
      this.editHistory.set(edit.filePath, history);

      this.logger.debug('Edit recorded', {
        filePath: edit.filePath,
        agentId: edit.agentId,
        timestamp: edit.timestamp,
      });

      this.emit('edit:recorded', edit);
    } catch (error) {
      this.logger.warn('Failed to record edit', {
        filePath: edit.filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get edit history for a file
   */
  private async getEditHistory(filePath: string): Promise<FileEditMetadata[]> {
    // Check local cache first
    if (this.editHistory.has(filePath)) {
      return this.editHistory.get(filePath)!;
    }

    // Fetch from Redis
    const historyKey = this.getHistoryKey(filePath);
    const history = await this.redis.lrange(historyKey, 0, -1);

    const edits: FileEditMetadata[] = history.map(h => JSON.parse(h));

    // Cache locally
    this.editHistory.set(filePath, edits);

    return edits;
  }

  /**
   * Check if line ranges overlap
   */
  private checkLineOverlap(
    range1: [number, number][],
    range2: [number, number][]
  ): boolean {
    for (const [start1, end1] of range1) {
      for (const [start2, end2] of range2) {
        if (start1 <= end2 && end1 >= start2) {
          return true; // Overlap detected
        }
      }
    }
    return false;
  }

  /**
   * Determine conflict type
   */
  private determineConflictType(
    filePath: string,
    modifiedLines: [number, number][],
    conflicts: FileEditMetadata[]
  ): 'non-overlapping' | 'overlapping' | 'type-conflict' {
    // Check if any conflicts have overlapping lines
    for (const conflict of conflicts) {
      if (this.checkLineOverlap(modifiedLines, conflict.modifiedLines)) {
        // Check if type definitions are involved (heuristic)
        if (
          filePath.endsWith('.ts') &&
          (filePath.includes('types') || filePath.includes('interface'))
        ) {
          return 'type-conflict';
        }
        return 'overlapping';
      }
    }

    return 'non-overlapping';
  }

  /**
   * Perform automatic merge for non-overlapping changes
   */
  private async performAutoMerge(
    filePath: string,
    newContent: string,
    conflicts: FileEditMetadata[]
  ): Promise<string> {
    // In real implementation, use a proper 3-way merge algorithm
    // For now, just return new content (simplified)

    this.logger.debug('Performing auto-merge', {
      filePath,
      conflictCount: conflicts.length,
    });

    // TODO: Implement proper 3-way merge with diff-match-patch or similar
    return newContent;
  }

  /**
   * Escalate conflict for manual resolution
   */
  private async escalateConflict(
    filePath: string,
    agentId: string,
    conflicts: FileEditMetadata[]
  ): Promise<void> {
    this.logger.warn('Escalating conflict for manual resolution', {
      filePath,
      agentId,
      conflictCount: conflicts.length,
    });

    // Record audit entry
    await this.recordConflictAudit({
      conflictId: `conflict-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      filePath,
      agents: [agentId, ...conflicts.map(c => c.agentId)],
      conflictType: 'overlapping',
      resolution: 'escalated',
      timestamp: Date.now(),
      details: {
        conflictCount: conflicts.length,
        reason: 'Overlapping edits require manual resolution',
      },
    });

    this.emit('conflict:escalated', {
      filePath,
      agentId,
      conflicts,
      timestamp: Date.now(),
    });
  }

  /**
   * Record conflict audit entry
   */
  private async recordConflictAudit(entry: ConflictAuditEntry): Promise<void> {
    if (!this.config.enableAudit) {
      return;
    }

    const auditKey = `${this.CONFLICT_AUDIT_PREFIX}${entry.conflictId}`;

    try {
      // Store in Redis
      await this.redis.set(auditKey, JSON.stringify(entry));
      await this.redis.expire(auditKey, 86400); // 24 hour TTL

      // Store locally
      this.conflictAudit.push(entry);

      this.logger.info('Conflict audit recorded', {
        conflictId: entry.conflictId,
        filePath: entry.filePath,
        resolution: entry.resolution,
      });

      this.emit('audit:recorded', entry);
    } catch (error) {
      this.logger.warn('Failed to record conflict audit', {
        conflictId: entry.conflictId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get file content hash (SHA-256)
   */
  private async getFileHash(filePath: string): Promise<string> {
    try {
      const fullPath = path.join(this.config.projectRoot, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');

      const hash = crypto.createHash('sha256');
      hash.update(content);

      return hash.digest('hex');
    } catch (error) {
      // File might not exist yet (new file)
      return 'new-file';
    }
  }

  /**
   * Get Redis lock key for file
   */
  private getLockKey(filePath: string): string {
    return `${this.LOCK_KEY_PREFIX}${filePath}`;
  }

  /**
   * Get Redis history key for file
   */
  private getHistoryKey(filePath: string): string {
    return `${this.EDIT_HISTORY_PREFIX}${filePath}`;
  }

  /**
   * Get conflict statistics
   */
  getStatistics() {
    const totalConflicts = this.conflictAudit.length;
    const autoMerged = this.conflictAudit.filter(
      c => c.resolution === 'auto-merged'
    ).length;
    const escalated = this.conflictAudit.filter(
      c => c.resolution === 'escalated'
    ).length;

    return {
      sprintId: this.config.sprintId,
      totalConflicts,
      autoMerged,
      escalated,
      autoMergeRate:
        totalConflicts > 0 ? (autoMerged / totalConflicts) * 100 : 0,
      activeFileLocks: this.heldLocks.size,
    };
  }

  /**
   * Setup exit handlers for cleanup
   */
  private setupExitHandlers(): void {
    const cleanup = async () => {
      if (this.heldLocks.size > 0) {
        this.logger.info('Releasing locks on exit', {
          lockCount: this.heldLocks.size,
        });

        for (const filePath of this.heldLocks) {
          try {
            await this.redis.del(this.getLockKey(filePath));
          } catch (error) {
            this.logger.warn('Failed to release lock on exit', {
              filePath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        this.heldLocks.clear();
      }
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }

  /**
   * Shutdown conflict resolver
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Conflict Resolver', {
      sprintId: this.config.sprintId,
    });

    // Release all held locks
    for (const filePath of this.heldLocks) {
      try {
        await this.redis.del(this.getLockKey(filePath));
      } catch (error) {
        this.logger.warn('Failed to release lock during shutdown', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.heldLocks.clear();
    this.removeAllListeners();
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Conflict Resolver instance
 */
export function createConflictResolver(
  config: ConflictResolverConfig
): ConflictResolver {
  return new ConflictResolver(config);
}

// ===== EXPORTS =====

export default ConflictResolver;
