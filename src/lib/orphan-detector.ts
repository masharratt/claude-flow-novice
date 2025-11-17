/**
 * Orphan Workspace Detector
 *
 * Detects and cleans up orphaned workspaces (no active agent process).
 * Implements grace period logic to prevent premature cleanup during restarts.
 *
 * Part of Task P2-1.3: Supervised Workspace Cleanup (Phase 2)
 *
 * Features:
 * - Detect orphaned workspaces (no active process)
 * - Process monitoring (PID tracking)
 * - Cleanup stale workspaces
 * - Grace period (10 minutes default before cleanup)
 * - Automatic background scanning
 * - Audit trail for orphan cleanup
 *
 * Usage:
 *   const detector = new OrphanDetector({
 *     workspaceRoot: '/tmp/cfn-workspaces',
 *     gracePeriodMinutes: 10
 *   });
 *
 *   const orphans = await detector.detectOrphans();
 *   console.log(`Found ${orphans.length} orphaned workspaces`);
 *
 *   const stats = await detector.cleanupOrphans();
 *   console.log(`Cleaned up ${stats.cleanedCount} workspaces`);
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createLogger } from './logging.js';
import { createError, ErrorCode, StandardError } from './errors.js';

const logger = createLogger('orphan-detector');

/**
 * Orphan workspace metadata
 */
export interface OrphanWorkspace {
  id: string;
  agentId: string;
  taskId: string;
  path: string;
  createdAt: Date;
  lastAccessedAt: Date;
  processId?: number;
  sizeBytes: number;
  fileCount: number;
}

/**
 * Cleanup statistics
 */
export interface OrphanCleanupStats {
  /** Number of workspaces cleaned */
  cleanedCount: number;
  /** Total size freed in bytes */
  totalSizeFreed: number;
  /** Number of files removed */
  filesRemoved: number;
  /** Number of workspaces still in grace period */
  gracePeriodCount: number;
}

/**
 * Detector configuration
 */
export interface OrphanDetectorConfig {
  /** Root directory for workspaces */
  workspaceRoot: string;
  /** Grace period in minutes (default: 10) */
  gracePeriodMinutes?: number;
  /** Scan interval in minutes (default: 30) */
  scanIntervalMinutes?: number;
}

/**
 * OrphanDetector: Detects and cleans up orphaned workspaces
 */
export class OrphanDetector {
  private config: OrphanDetectorConfig;
  private scanInterval: NodeJS.Timer | null = null;

  constructor(config: OrphanDetectorConfig) {
    this.config = {
      gracePeriodMinutes: 10,
      scanIntervalMinutes: 30,
      ...config,
    };
  }

  /**
   * Start background orphan detection scanner
   */
  start(): void {
    if (this.scanInterval) {
      return; // Already running
    }

    const intervalMs = (this.config.scanIntervalMinutes || 30) * 60 * 1000;

    this.scanInterval = setInterval(async () => {
      try {
        const stats = await this.cleanupOrphans();
        if (stats.cleanedCount > 0) {
          logger.info('Background orphan cleanup completed', {
            cleanedCount: stats.cleanedCount,
            totalFreed: stats.totalSizeFreed,
          });
        }
      } catch (error) {
        logger.error('Error in orphan detection scan', { error: String(error) });
      }
    }, intervalMs);

    logger.info('Orphan detector started', {
      gracePeriodMinutes: this.config.gracePeriodMinutes,
      scanIntervalMinutes: this.config.scanIntervalMinutes,
    });
  }

  /**
   * Stop background scanner
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      logger.info('Orphan detector stopped');
    }
  }

  /**
   * Detect orphaned workspaces
   */
  async detectOrphans(): Promise<OrphanWorkspace[]> {
    const orphans: OrphanWorkspace[] = [];
    const gracePeriodMs = (this.config.gracePeriodMinutes || 10) * 60 * 1000;
    const now = Date.now();

    try {
      const entries = await fs.readdir(this.config.workspaceRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        try {
          const workspaceInfo = await this.analyzeWorkspace(entry.path);
          if (!workspaceInfo) continue;

          // Check if process is still active
          const isProcessActive = this.isProcessActive(workspaceInfo.processId);

          if (!isProcessActive) {
            // Check grace period
            const timeSinceLastAccess = now - workspaceInfo.lastAccessedAt.getTime();

            if (timeSinceLastAccess > gracePeriodMs) {
              orphans.push(workspaceInfo);
            }
          }
        } catch (error) {
          logger.warn('Error analyzing workspace', { path: entry.path, error: String(error) });
        }
      }

      logger.info('Orphan detection scan completed', {
        found: orphans.length,
        gracePeriodMs,
      });
    } catch (error) {
      logger.error('Error scanning for orphans', { error: String(error) });
    }

    return orphans;
  }

  /**
   * Clean up detected orphaned workspaces
   */
  async cleanupOrphans(): Promise<OrphanCleanupStats> {
    const orphans = await this.detectOrphans();
    let cleanedCount = 0;
    let totalSizeFreed = 0;
    let totalFilesRemoved = 0;
    let gracePeriodCount = 0;

    const gracePeriodMs = (this.config.gracePeriodMinutes || 10) * 60 * 1000;
    const now = Date.now();

    for (const orphan of orphans) {
      try {
        // Double-check if in grace period
        const timeSinceAccess = now - orphan.lastAccessedAt.getTime();
        if (timeSinceAccess <= gracePeriodMs) {
          gracePeriodCount++;
          continue;
        }

        // Clean up workspace
        const sizeFreed = await this.removeWorkspace(orphan.path);
        cleanedCount++;
        totalSizeFreed += sizeFreed;
        totalFilesRemoved += orphan.fileCount;

        logger.info('Cleaned orphaned workspace', {
          id: orphan.id,
          agentId: orphan.agentId,
          sizeFreed,
        });
      } catch (error) {
        logger.error('Error cleaning up orphan workspace', {
          id: orphan.id,
          error: String(error),
        });
      }
    }

    return {
      cleanedCount,
      totalSizeFreed,
      filesRemoved: totalFilesRemoved,
      gracePeriodCount,
    };
  }

  /**
   * Force cleanup of specific orphan (skip grace period)
   */
  async forceCleanupOrphan(workspacePath: string): Promise<number> {
    try {
      const size = await this.removeWorkspace(workspacePath);
      logger.info('Force cleaned orphan workspace', { path: workspacePath, size });
      return size;
    } catch (error) {
      logger.error('Error force cleaning orphan', { path: workspacePath, error: String(error) });
      throw createError(ErrorCode.FILE_WRITE_FAILED, 'Failed to cleanup orphan workspace', {
        cause: String(error),
      });
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Analyze workspace to extract metadata
   */
  private async analyzeWorkspace(workspacePath: string): Promise<OrphanWorkspace | null> {
    try {
      const stats = await fs.stat(workspacePath);
      const name = path.basename(workspacePath);

      // Parse workspace name: sanitizedAgentId-sanitizedTaskId-uuid
      // UUID format: 8hex-4hex-4hex-4hex-12hex (36 chars total)
      // We need to find where the UUID starts
      const uuidRegex = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      const uuidMatch = name.match(uuidRegex);

      if (!uuidMatch) {
        return null;
      }

      const id = uuidMatch[0];
      const prefix = name.substring(0, name.length - id.length - 1); // -1 for the dash before UUID

      // Parse agent and task IDs from prefix
      // Format: sanitizedAgentId-sanitizedTaskId
      // Since both can contain characters, we use a simple heuristic:
      // Find "task" in the prefix and assume that's where taskId starts
      let agentId = '';
      let taskId = '';

      const taskStartIndex = prefix.indexOf('task-');
      if (taskStartIndex > 0) {
        agentId = prefix.substring(0, taskStartIndex - 1); // -1 to remove trailing dash
        taskId = prefix.substring(taskStartIndex);
      } else {
        // Fallback: just use the whole prefix as agentId
        agentId = prefix;
        taskId = 'unknown';
      }

      // Get workspace metadata if it exists
      let processId: number | undefined;
      let lastAccessedAt = stats.mtime;

      try {
        const metadataPath = path.join(workspacePath, '.metadata.json');
        const metadata = await fs.readFile(metadataPath, 'utf-8');
        const parsed = JSON.parse(metadata);
        processId = parsed.processId;
        if (parsed.lastAccessedAt) {
          lastAccessedAt = new Date(parsed.lastAccessedAt);
        }
      } catch (e) {
        // Metadata file doesn't exist - use current mtime
      }

      const size = await this.getDirectorySize(workspacePath);
      const fileCount = await this.countFiles(workspacePath);

      return {
        id,
        agentId,
        taskId,
        path: workspacePath,
        createdAt: stats.birthtime || stats.mtime,
        lastAccessedAt,
        processId,
        sizeBytes: size,
        fileCount,
      };
    } catch (error) {
      logger.debug('Error analyzing workspace', { path: workspacePath, error: String(error) });
      return null;
    }
  }

  /**
   * Check if process is still active
   */
  private isProcessActive(processId?: number): boolean {
    if (!processId) {
      return false; // No process ID = definitely orphaned
    }

    try {
      // Send signal 0 (check if process exists without sending signal)
      // Returns true if process is still running
      process.kill(processId, 0);
      return true;
    } catch (error) {
      // Process does not exist
      return false;
    }
  }

  /**
   * Remove workspace directory and return freed size
   */
  private async removeWorkspace(workspacePath: string): Promise<number> {
    const size = await this.getDirectorySize(workspacePath);

    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.debug('Removed workspace directory', { path: workspacePath });
      return size;
    } catch (error) {
      logger.error('Error removing workspace', { path: workspacePath, error: String(error) });
      throw error;
    }
  }

  /**
   * Get directory size in bytes
   */
  private async getDirectorySize(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: false });
      let totalSize = 0;

      for (const file of entries as string[]) {
        try {
          const filePath = path.join(dir, file);
          const stats = await fs.stat(filePath).catch(() => null);
          if (stats?.isFile()) {
            totalSize += stats.size;
          }
        } catch (e) {
          // Ignore inaccessible files
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Count files in directory
   */
  private async countFiles(dir: string): Promise<number> {
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: false });
      return Array.isArray(entries) ? entries.length : 0;
    } catch (error) {
      return 0;
    }
  }
}

export default OrphanDetector;
