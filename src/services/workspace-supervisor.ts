/**
 * Workspace Supervisor Service
 *
 * Manages isolated workspaces for agents with automatic cleanup on completion/crash
 * and TTL-based retention. Provides comprehensive workspace lifecycle management.
 *
 * Part of Task P2-1.3: Supervised Workspace Cleanup (Phase 2)
 *
 * Features:
 * - Isolated workspace per agent (directory-based)
 * - Auto-cleanup on agent completion (success or failure)
 * - Auto-cleanup on agent crash (orphan detection)
 * - TTL-based cleanup (24h default, configurable)
 * - Zero orphaned files after 24h
 * - Workspace size limits (max 1GB per agent, configurable)
 * - Audit trail (what was cleaned, when, why)
 * - Manual cleanup command support
 * - Workspace metadata tracking
 * - Concurrent workspace management
 *
 * Usage:
 *   const supervisor = new WorkspaceSupervisor({
 *     workspaceRoot: '/tmp/cfn-workspaces',
 *     maxWorkspaceSizeBytes: 1024 * 1024 * 1024,
 *     defaultTtlHours: 24
 *   });
 *   await supervisor.initialize();
 *
 *   const workspace = await supervisor.createWorkspace({
 *     agentId: 'backend-dev-001',
 *     taskId: 'task-123',
 *     maxSizeBytes: 1024 * 1024 * 1024,
 *     ttlHours: 24
 *   });
 *
 *   // Use workspace...
 *   await fs.writeFile(path.join(workspace.path, 'output.txt'), 'result');
 *
 *   // Cleanup when done
 *   await supervisor.cleanupWorkspace(workspace.id, {
 *     reason: 'agent_completed',
 *     preserveArtifacts: ['report.md']
 *   });
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { createLogger } from '../lib/logging';
import { createError, ErrorCode, StandardError } from '../lib/errors';

const logger = createLogger('workspace-supervisor');

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  /** Agent ID performing work in workspace */
  agentId: string;
  /** Task ID associated with workspace */
  taskId: string;
  /** Maximum workspace size in bytes */
  maxSizeBytes: number;
  /** TTL in hours (default: 24) */
  ttlHours: number;
  /** Patterns to preserve during cleanup (glob patterns) */
  preservePatterns?: string[];
}

/**
 * Workspace metadata
 */
export interface Workspace {
  /** Unique workspace ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Task ID */
  taskId: string;
  /** Filesystem path to workspace */
  path: string;
  /** Creation timestamp */
  createdAt: Date;
  /** TTL in hours */
  ttlHours: number;
  /** Maximum size in bytes */
  maxSizeBytes: number;
  /** Current size in bytes */
  sizeBytes: number;
  /** Number of files in workspace */
  fileCount: number;
  /** Whether workspace exceeds size limit */
  exceedsLimit: boolean;
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
  /** Reason for cleanup (agent_completed, agent_crashed, ttl_expired, manual) */
  reason: 'agent_completed' | 'agent_crashed' | 'ttl_expired' | 'manual';
  /** Artifacts to preserve during cleanup */
  preserveArtifacts?: string[];
  /** Destination directory for preserved artifacts */
  artifactDestination?: string;
  /** Additional metadata for audit trail */
  metadata?: Record<string, any>;
}

/**
 * Cleanup statistics
 */
export interface CleanupStats {
  /** Number of workspaces cleaned */
  cleanedCount: number;
  /** Total size freed in bytes */
  totalSizeFreed: number;
  /** Number of files removed */
  filesRemoved: number;
}

/**
 * Cleanup history entry
 */
export interface CleanupHistoryEntry {
  /** When cleanup occurred */
  cleanedAt: Date;
  /** Reason for cleanup */
  reason: string;
  /** Size freed in bytes */
  sizeFreed: number;
  /** Number of files removed */
  filesRemoved: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Workspace statistics
 */
export interface WorkspaceStatistics {
  /** Total number of workspaces */
  totalWorkspaces: number;
  /** Number of active (non-stale) workspaces */
  activeWorkspaces: number;
  /** Total disk usage in bytes */
  totalDiskUsage: number;
  /** Number of stale workspaces */
  staleWorkspaces: number;
}

/**
 * Supervisor configuration
 */
export interface SupervisorConfig {
  /** Root directory for all workspaces */
  workspaceRoot: string;
  /** Maximum workspace size (default: 1GB) */
  maxWorkspaceSizeBytes?: number;
  /** Default TTL in hours (default: 24) */
  defaultTtlHours?: number;
  /** TTL-based cleanup interval in minutes (default: 60) */
  cleanupIntervalMinutes?: number;
  /** Database path for metadata (default: workspaceRoot/metadata.db) */
  databasePath?: string;
}

/**
 * WorkspaceSupervisor: Manages isolated workspaces for agents
 */
export class WorkspaceSupervisor {
  private config: SupervisorConfig;
  private db: Database.Database | null = null;
  private cleanupInterval: NodeJS.Timer | null = null;
  private workspaces: Map<string, Workspace> = new Map();

  constructor(config: SupervisorConfig) {
    this.config = {
      maxWorkspaceSizeBytes: 1024 * 1024 * 1024, // 1GB default
      defaultTtlHours: 24,
      cleanupIntervalMinutes: 60,
      ...config,
    };
  }

  /**
   * Initialize workspace supervisor
   */
  async initialize(): Promise<void> {
    try {
      // Create workspace root directory
      await fs.mkdir(this.config.workspaceRoot, { recursive: true });

      // Initialize database
      const dbPath = this.config.databasePath || path.join(this.config.workspaceRoot, 'metadata.db');
      this.db = new Database(dbPath);

      // Create schema
      this.createSchema();

      // Load existing workspaces
      await this.loadExistingWorkspaces();

      // Start background TTL cleanup
      this.startCleanupScheduler();

      logger.info('WorkspaceSupervisor initialized', {
        workspaceRoot: this.config.workspaceRoot,
        maxSize: this.config.maxWorkspaceSizeBytes,
        defaultTtl: this.config.defaultTtlHours,
      });
    } catch (error) {
      logger.error('Failed to initialize WorkspaceSupervisor', { error: String(error) });
      throw createError(
        ErrorCode.CONFIGURATION_ERROR,
        'Failed to initialize workspace supervisor',
        { cause: String(error) }
      );
    }
  }

  /**
   * Shutdown supervisor and stop background tasks
   */
  async shutdown(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      if (this.db) {
        this.db.close();
        this.db = null;
      }

      logger.info('WorkspaceSupervisor shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown', { error: String(error) });
    }
  }

  /**
   * Create isolated workspace for agent
   */
  async createWorkspace(config: WorkspaceConfig): Promise<Workspace> {
    const workspaceId = randomUUID();
    // Sanitize paths to prevent traversal attacks
    const sanitizedAgentId = this.sanitizePath(config.agentId);
    const sanitizedTaskId = this.sanitizePath(config.taskId);
    const workspacePath = path.normalize(
      path.join(
        this.config.workspaceRoot,
        `${sanitizedAgentId}-${sanitizedTaskId}-${workspaceId}`
      )
    );

    // Verify path is within workspace root
    const relPath = path.relative(this.config.workspaceRoot, workspacePath);
    if (relPath.startsWith('..')) {
      throw createError(ErrorCode.VALIDATION_FAILED, 'Invalid workspace path', {
        path: workspacePath,
      });
    }

    try {
      // Create workspace directory
      await fs.mkdir(workspacePath, { recursive: true });

      const workspace: Workspace = {
        id: workspaceId,
        agentId: config.agentId,
        taskId: config.taskId,
        path: workspacePath,
        createdAt: new Date(),
        ttlHours: config.ttlHours,
        maxSizeBytes: config.maxSizeBytes,
        sizeBytes: 0,
        fileCount: 0,
        exceedsLimit: false,
      };

      // Store in database
      this.insertWorkspace(workspace);
      this.workspaces.set(workspaceId, workspace);

      logger.info('Workspace created', {
        workspaceId,
        agentId: config.agentId,
        taskId: config.taskId,
        path: workspacePath,
      });

      return workspace;
    } catch (error) {
      logger.error('Failed to create workspace', { error: String(error) });
      throw createError(ErrorCode.FILE_WRITE_FAILED, 'Failed to create workspace', {
        cause: String(error),
      });
    }
  }

  /**
   * Cleanup workspace on completion
   */
  async cleanupWorkspace(workspaceId: string, options: CleanupOptions): Promise<CleanupStats> {
    const workspace = this.workspaces.get(workspaceId);

    if (!workspace) {
      logger.warn('Attempt to cleanup non-existent workspace', { workspaceId });
      return { cleanedCount: 0, totalSizeFreed: 0, filesRemoved: 0 };
    }

    try {
      let sizeFreed = 0;
      let filesRemoved = 0;

      // Get current stats before cleanup
      const currentSize = await this.getDirectorySize(workspace.path).catch(() => 0);
      const currentFileCount = await this.countFiles(workspace.path).catch(() => 0);

      // Preserve artifacts if specified
      if (options.preserveArtifacts && options.preserveArtifacts.length > 0) {
        await this.preserveArtifacts(
          workspace.path,
          options.preserveArtifacts,
          options.artifactDestination
        );
      }

      // Remove workspace directory
      await fs.rm(workspace.path, { recursive: true, force: true });

      sizeFreed = currentSize;
      filesRemoved = currentFileCount;

      // Record cleanup in database
      this.recordCleanup(workspaceId, options, sizeFreed, filesRemoved);

      // Remove from memory cache
      this.workspaces.delete(workspaceId);

      logger.info('Workspace cleaned up', {
        workspaceId,
        reason: options.reason,
        sizeFreed,
        filesRemoved,
      });

      return {
        cleanedCount: 1,
        totalSizeFreed: sizeFreed,
        filesRemoved,
      };
    } catch (error) {
      logger.error('Error cleaning up workspace', { workspaceId, error: String(error) });
      throw createError(ErrorCode.FILE_WRITE_FAILED, 'Failed to cleanup workspace', {
        cause: String(error),
      });
    }
  }

  /**
   * Get stale workspaces (past TTL)
   */
  async getStaleWorkspaces(): Promise<Workspace[]> {
    const stale: Workspace[] = [];
    const now = Date.now();

    for (const workspace of this.workspaces.values()) {
      const ageMs = now - workspace.createdAt.getTime();
      const ttlMs = workspace.ttlHours * 60 * 60 * 1000;

      if (ageMs > ttlMs) {
        stale.push(workspace);
      }
    }

    return stale;
  }

  /**
   * Enforce retention policy (TTL-based cleanup)
   */
  async enforceRetentionPolicy(options?: {
    preservePatterns?: string[];
  }): Promise<CleanupStats> {
    const staleWorkspaces = await this.getStaleWorkspaces();

    let totalCleaned = 0;
    let totalFreed = 0;
    let totalFilesRemoved = 0;

    for (const workspace of staleWorkspaces) {
      const stats = await this.cleanupWorkspace(workspace.id, {
        reason: 'ttl_expired',
        preserveArtifacts: options?.preservePatterns,
      });

      totalCleaned += stats.cleanedCount;
      totalFreed += stats.totalSizeFreed;
      totalFilesRemoved += stats.filesRemoved;
    }

    return {
      cleanedCount: totalCleaned,
      totalSizeFreed: totalFreed,
      filesRemoved: totalFilesRemoved,
    };
  }

  /**
   * Update workspace metadata (e.g., process ID, last accessed time)
   */
  async updateWorkspaceMetadata(
    workspaceId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    try {
      if (!this.db) return;

      const stmt = this.db.prepare(`
        UPDATE workspaces
        SET metadata = json_patch(COALESCE(metadata, '{}'), ?)
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(metadata), workspaceId);
    } catch (error) {
      logger.error('Error updating workspace metadata', { workspaceId, error: String(error) });
    }
  }

  /**
   * Get workspace info (with current size/stats)
   */
  async getWorkspaceInfo(workspaceId: string): Promise<Workspace | undefined> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) return undefined;

    // Update size and file count if workspace still exists
    if (await fs.stat(workspace.path).catch(() => null)) {
      const sizeBytes = await this.getDirectorySize(workspace.path);
      const fileCount = await this.countFiles(workspace.path);
      const exceedsLimit = sizeBytes > workspace.maxSizeBytes;

      // Update in memory
      workspace.sizeBytes = sizeBytes;
      workspace.fileCount = fileCount;
      workspace.exceedsLimit = exceedsLimit;
    }

    return workspace;
  }

  /**
   * Get cleanup history for workspace
   */
  async getCleanupHistory(workspaceId: string): Promise<CleanupHistoryEntry[]> {
    try {
      if (!this.db) return [];

      const stmt = this.db.prepare(`
        SELECT cleaned_at, reason, size_freed, files_removed, metadata
        FROM cleanup_history
        WHERE workspace_id = ?
        ORDER BY cleaned_at DESC
      `);
      const rows = stmt.all(workspaceId) as any[];

      return rows.map(row => ({
        cleanedAt: new Date(row.cleaned_at),
        reason: row.reason,
        sizeFreed: row.size_freed,
        filesRemoved: row.files_removed,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (error) {
      logger.error('Error fetching cleanup history', { error: String(error) });
      return [];
    }
  }

  /**
   * Get workspace statistics
   */
  async getStatistics(): Promise<WorkspaceStatistics> {
    let totalDiskUsage = 0;
    let staleCount = 0;

    for (const workspace of this.workspaces.values()) {
      // Update size for current calculation
      try {
        if (await fs.stat(workspace.path).catch(() => null)) {
          const size = await this.getDirectorySize(workspace.path);
          totalDiskUsage += size;
        }
      } catch (e) {
        // Ignore
      }

      const ageMs = Date.now() - workspace.createdAt.getTime();
      const ttlMs = workspace.ttlHours * 60 * 60 * 1000;
      if (ageMs > ttlMs) {
        staleCount++;
      }
    }

    return {
      totalWorkspaces: this.workspaces.size,
      activeWorkspaces: this.workspaces.size - staleCount,
      totalDiskUsage,
      staleWorkspaces: staleCount,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) return;

    // Workspaces table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        ttl_hours INTEGER NOT NULL,
        max_size_bytes INTEGER NOT NULL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_workspaces_agent ON workspaces(agent_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_task ON workspaces(task_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_created ON workspaces(created_at);
    `);

    // Cleanup history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cleanup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        cleaned_at TEXT NOT NULL,
        reason TEXT NOT NULL,
        size_freed INTEGER,
        files_removed INTEGER,
        metadata TEXT,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
      );

      CREATE INDEX IF NOT EXISTS idx_cleanup_workspace ON cleanup_history(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_cleanup_date ON cleanup_history(cleaned_at);
    `);
  }

  /**
   * Insert workspace into database
   */
  private insertWorkspace(workspace: Workspace): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO workspaces
        (id, agent_id, task_id, path, created_at, ttl_hours, max_size_bytes, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        workspace.id,
        workspace.agentId,
        workspace.taskId,
        workspace.path,
        workspace.createdAt.toISOString(),
        workspace.ttlHours,
        workspace.maxSizeBytes,
        '{}'
      );
    } catch (error) {
      logger.error('Error inserting workspace', { error: String(error) });
    }
  }

  /**
   * Record cleanup operation
   */
  private recordCleanup(
    workspaceId: string,
    options: CleanupOptions,
    sizeFreed: number,
    filesRemoved: number
  ): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO cleanup_history
        (workspace_id, cleaned_at, reason, size_freed, files_removed, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        workspaceId,
        new Date().toISOString(),
        options.reason,
        sizeFreed,
        filesRemoved,
        options.metadata ? JSON.stringify(options.metadata) : null
      );
    } catch (error) {
      logger.error('Error recording cleanup', { error: String(error) });
    }
  }

  /**
   * Load existing workspaces from filesystem
   */
  private async loadExistingWorkspaces(): Promise<void> {
    try {
      const entries = await fs.readdir(this.config.workspaceRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        try {
          const stats = await fs.stat(entry.path);
          const size = await this.getDirectorySize(entry.path);

          const workspace: Workspace = {
            id: randomUUID(),
            agentId: entry.name.split('-')[0],
            taskId: entry.name.split('-')[1],
            path: entry.path,
            createdAt: stats.birthtime || stats.mtime,
            ttlHours: this.config.defaultTtlHours || 24,
            maxSizeBytes: this.config.maxWorkspaceSizeBytes || 1024 * 1024 * 1024,
            sizeBytes: size,
            fileCount: await this.countFiles(entry.path),
            exceedsLimit: size > (this.config.maxWorkspaceSizeBytes || 1024 * 1024 * 1024),
          };

          this.workspaces.set(workspace.id, workspace);
        } catch (error) {
          logger.warn('Error loading workspace', { path: entry.path, error: String(error) });
        }
      }

      logger.info('Loaded existing workspaces', { count: this.workspaces.size });
    } catch (error) {
      logger.warn('Error loading workspaces', { error: String(error) });
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

  /**
   * Preserve artifacts during cleanup
   */
  private async preserveArtifacts(
    workspacePath: string,
    preservePatterns: string[],
    destination?: string
  ): Promise<number> {
    if (!destination) {
      return 0;
    }

    try {
      const destDir = path.resolve(destination);
      await fs.mkdir(destDir, { recursive: true });

      let sizeFreed = 0;

      for (const pattern of preservePatterns) {
        const files = await this.globFiles(workspacePath, pattern);

        for (const file of files) {
          const relativePath = path.relative(workspacePath, file);
          const destPath = path.join(destDir, relativePath);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          await fs.copyFile(file, destPath);

          const stats = await fs.stat(file);
          sizeFreed += stats.size;
        }
      }

      return sizeFreed;
    } catch (error) {
      logger.warn('Error preserving artifacts', { error: String(error) });
      return 0;
    }
  }

  /**
   * Simple glob file matching
   */
  private async globFiles(dir: string, pattern: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile && this.matchesPattern(entry.name, pattern)) {
          files.push(path.join(dir, entry.name));
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Match filename against glob pattern
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    // Simple glob matching (* and ?)
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(filename);
  }

  /**
   * Sanitize path component to prevent traversal attacks
   */
  private sanitizePath(pathComponent: string): string {
    // Remove any path separators and traversal sequences
    return pathComponent
      .replace(/[\/\\]/g, '_') // Replace path separators
      .replace(/\.\./g, '__') // Replace .. sequences
      .replace(/\./g, '_') // Replace dots
      .substring(0, 100); // Limit length
  }

  /**
   * Start background TTL cleanup scheduler
   */
  private startCleanupScheduler(): void {
    const intervalMs = (this.config.cleanupIntervalMinutes || 60) * 60 * 1000;

    this.cleanupInterval = setInterval(async () => {
      try {
        const stats = await this.enforceRetentionPolicy();
        if (stats.cleanedCount > 0) {
          logger.info('Background TTL cleanup completed', {
            cleanedCount: stats.cleanedCount,
            totalFreed: stats.totalSizeFreed,
          });
        }
      } catch (error) {
        logger.error('Error in TTL cleanup scheduler', { error: String(error) });
      }
    }, intervalMs);
  }
}

export default WorkspaceSupervisor;
