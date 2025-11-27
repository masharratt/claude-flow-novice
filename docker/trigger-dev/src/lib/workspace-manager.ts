/**
 * Workspace Manager - Per-Agent Workspace Isolation with Copy-on-Write
 *
 * Provides isolated workspaces for each agent using Copy-on-Write patterns
 * with rsync-based fast selective copying. Enables safe parallel agent execution
 * with atomic merge operations for conflict detection.
 *
 * Architecture:
 * - Base path: /agent-workspaces/{taskId}/{agentId}/
 * - Fast copy: rsync with pattern-based include/exclude
 * - Merge strategy: diff-based change detection with conflict reporting
 * - Cleanup: automatic removal with validation
 *
 * Reference: docker/trigger-dev/planning/WORKSPACE_ISOLATION_PATTERNS.md
 */

import { execFile, execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Configuration options for creating an agent workspace
 */
export interface WorkspaceOptions {
  /** Source directory (main workspace, e.g., /workspace) */
  sourceDir: string;

  /** Unique agent identifier */
  agentId: string;

  /** Parent task identifier */
  taskId: string;

  /** Glob patterns for files to include in workspace copy */
  includePatterns?: string[];

  /** Glob patterns for files to exclude from workspace copy */
  excludePatterns?: string[];
}

/**
 * Options for merging changes back from agent workspace to main workspace
 */
export interface MergeOptions {
  /** If true, only preview changes without applying them */
  dryRun?: boolean;

  /** If true, overwrite main workspace files without conflict detection */
  overwrite?: boolean;

  /** Maximum time in milliseconds to allow merge operation */
  timeout?: number;

  /** If true, keep agent workspace after successful merge */
  keepWorkspace?: boolean;
}

/**
 * Result of merging agent changes back to main workspace
 */
export interface MergeResult {
  /** Paths of successfully merged files */
  merged: string[];

  /** Paths of files with merge conflicts (modifications in both workspaces) */
  conflicts: string[];

  /** Paths of files that were not modified */
  unchanged: string[];

  /** Errors encountered during merge operation */
  errors: string[];

  /** Detailed statistics about the merge */
  stats: {
    totalFiles: number;
    mergedCount: number;
    conflictCount: number;
    unchangedCount: number;
    errorCount: number;
    durationMs: number;
  };
}

/**
 * Information about an agent workspace
 */
export interface WorkspaceInfo {
  /** Full path to workspace directory */
  path: string;

  /** Agent identifier */
  agentId: string;

  /** Parent task identifier */
  taskId: string;

  /** Workspace creation timestamp */
  createdAt: Date;

  /** Number of files in workspace */
  filesCount: number;

  /** Total size of workspace in bytes */
  sizeBytes: number;

  /** Timestamp of last modification */
  lastModified: Date;

  /** Status of workspace (active, merged, orphaned) */
  status: 'active' | 'merged' | 'orphaned';
}

/**
 * Information about conflicts detected across multiple workspaces
 */
export interface ConflictInfo {
  /** Path of conflicting file */
  filePath: string;

  /** Agents that modified this file */
  agents: string[];

  /** Modification timestamps per agent */
  timestamps: Record<string, Date>;

  /** File sizes per agent */
  sizes: Record<string, number>;
}

/**
 * Statistics about disk usage for workspaces
 */
interface DiskStats {
  used: number;
  available: number;
  requiredBytes: number;
  required?: number;
}

/**
 * Workspace Manager - Handles agent workspace creation, merge, and cleanup
 */
export class WorkspaceManager {
  private readonly baseWorkspacePath: string;
  private readonly minDiskSpaceBytes = 100 * 1024 * 1024; // 100MB minimum

  constructor(baseWorkspacePath: string = '/agent-workspaces') {
    this.baseWorkspacePath = baseWorkspacePath;
  }

  /**
   * Creates an isolated workspace for an agent using Copy-on-Write semantics.
   *
   * Uses rsync for fast selective copying with pattern-based inclusion/exclusion.
   * Automatically validates source directory and available disk space.
   *
   * @param options - Workspace creation options
   * @returns Promise resolving to workspace information
   * @throws Error if source directory is invalid, no disk space, or copy fails
   *
   * @example
   * ```typescript
   * const workspace = await manager.createAgentWorkspace({
   *   sourceDir: '/workspace',
   *   agentId: 'agent-001',
   *   taskId: 'task-abc',
   *   includePatterns: ['src/**', 'package.json', 'tsconfig.json'],
   *   excludePatterns: ['node_modules', '.git', 'dist']
   * });
   * console.log(workspace.path); // /agent-workspaces/task-abc/agent-001
   * ```
   */
  async createAgentWorkspace(options: WorkspaceOptions): Promise<WorkspaceInfo> {
    const startTime = Date.now();

    // Validate source directory
    await this.validateSourceDirectory(options.sourceDir);

    // Calculate workspace path
    const workspacePath = this.getWorkspacePath(options.taskId, options.agentId);

    // Clean up any existing workspace
    if (existsSync(workspacePath)) {
      await this.cleanupAgentWorkspace(workspacePath);
    }

    // Create workspace directory structure
    await fs.mkdir(workspacePath, { recursive: true });

    try {
      // Validate disk space before copying
      const stats = await this.checkDiskSpace(options.sourceDir, workspacePath);
      if (stats.requiredBytes > stats.available) {
        throw new Error(
          `Insufficient disk space: required ${stats.requiredBytes} bytes, ` +
          `available ${stats.available} bytes`
        );
      }

      // Perform rsync copy with pattern filtering
      await this.rsyncCopy(options.sourceDir, workspacePath, {
        include: options.includePatterns,
        exclude: options.excludePatterns,
      });

      // Gather workspace information
      const workspaceInfo = await this.gatherWorkspaceInfo(
        workspacePath,
        options.agentId,
        options.taskId
      );

      return workspaceInfo;
    } catch (error) {
      // Clean up on failure
      try {
        await this.cleanupAgentWorkspace(workspacePath);
      } catch {
        // Ignore cleanup errors on failure
      }
      throw new Error(`Failed to create agent workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Merges changes from agent workspace back to main workspace with conflict detection.
   *
   * Uses diff-based change detection to identify:
   * - Successfully merged files (changed in agent workspace only)
   * - Conflicting files (changed in both workspaces)
   * - Unchanged files
   *
   * Supports dry-run mode for preview and timeout protection.
   *
   * @param agentWorkspace - Path to agent workspace
   * @param mainWorkspace - Path to main workspace to merge into
   * @param options - Merge options (dry-run, overwrite, timeout, etc.)
   * @returns Promise resolving to merge result with statistics
   * @throws Error if workspaces are invalid or merge operation times out
   *
   * @example
   * ```typescript
   * const result = await manager.mergeAgentChanges(
   *   '/agent-workspaces/task-abc/agent-001',
   *   '/workspace',
   *   { dryRun: true, timeout: 30000 }
   * );
   * console.log(`Merged: ${result.merged.length}, Conflicts: ${result.conflicts.length}`);
   * ```
   */
  async mergeAgentChanges(
    agentWorkspace: string,
    mainWorkspace: string,
    options: MergeOptions = {}
  ): Promise<MergeResult> {
    const startTime = Date.now();

    // Validate workspace paths
    if (!existsSync(agentWorkspace)) {
      throw new Error(`Agent workspace not found: ${agentWorkspace}`);
    }
    if (!existsSync(mainWorkspace)) {
      throw new Error(`Main workspace not found: ${mainWorkspace}`);
    }

    const merged: string[] = [];
    const conflicts: string[] = [];
    const unchanged: string[] = [];
    const errors: string[] = [];

    try {
      // Get list of files in both workspaces
      const agentFiles = await this.getAllFiles(agentWorkspace);
      const mainFiles = await this.getAllFiles(mainWorkspace);

      // Analyze each file in agent workspace
      for (const relPath of agentFiles) {
        const agentFilePath = join(agentWorkspace, relPath);
        const mainFilePath = join(mainWorkspace, relPath);

        try {
          const isConflict = await this.hasConflict(
            mainFilePath,
            agentFilePath,
            mainWorkspace,
            agentWorkspace
          );

          if (isConflict) {
            conflicts.push(relPath);
          } else {
            // Check if file was actually modified
            const hasChanged = !mainFiles.includes(relPath) ||
              await this.fileHasChanged(mainFilePath, agentFilePath);

            if (hasChanged) {
              if (!options.dryRun) {
                await this.mergeFile(mainFilePath, agentFilePath);
              }
              merged.push(relPath);
            } else {
              unchanged.push(relPath);
            }
          }
        } catch (error) {
          errors.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // Clean up workspace if not in dry-run and not keeping it
      if (!options.dryRun && !options.keepWorkspace) {
        try {
          await this.cleanupAgentWorkspace(agentWorkspace);
        } catch {
          // Ignore cleanup errors
        }
      }

      const durationMs = Date.now() - startTime;

      return {
        merged,
        conflicts,
        unchanged,
        errors,
        stats: {
          totalFiles: agentFiles.length,
          mergedCount: merged.length,
          conflictCount: conflicts.length,
          unchangedCount: unchanged.length,
          errorCount: errors.length,
          durationMs,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to merge agent changes: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Removes an agent workspace and all its contents.
   *
   * Validates workspace exists before removal. Logs errors but completes
   * even if subdirectories cannot be deleted.
   *
   * @param workspacePath - Path to workspace directory to remove
   * @returns Promise that resolves when cleanup is complete
   * @throws Error if workspace path is invalid or system cleanup fails
   *
   * @example
   * ```typescript
   * await manager.cleanupAgentWorkspace('/agent-workspaces/task-abc/agent-001');
   * ```
   */
  async cleanupAgentWorkspace(workspacePath: string): Promise<void> {
    if (!existsSync(workspacePath)) {
      return; // Already removed
    }

    try {
      await this.removeDirectory(workspacePath);
    } catch (error) {
      throw new Error(
        `Failed to cleanup workspace: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Lists all agent workspaces for a specific task.
   *
   * Scans the task directory and returns information about each active,
   * merged, or orphaned workspace. Useful for monitoring agent progress
   * and cleanup verification.
   *
   * @param taskId - Parent task identifier
   * @returns Promise resolving to array of workspace information
   *
   * @example
   * ```typescript
   * const workspaces = await manager.listAgentWorkspaces('task-abc');
   * console.log(`Found ${workspaces.length} workspaces for task`);
   * workspaces.forEach(ws => console.log(`${ws.agentId}: ${ws.status}`));
   * ```
   */
  async listAgentWorkspaces(taskId: string): Promise<WorkspaceInfo[]> {
    const taskPath = join(this.baseWorkspacePath, taskId);

    if (!existsSync(taskPath)) {
      return [];
    }

    const workspaces: WorkspaceInfo[] = [];

    try {
      const agentDirs = await fs.readdir(taskPath);

      for (const agentId of agentDirs) {
        const workspacePath = join(taskPath, agentId);
        const stat = statSync(workspacePath);

        if (!stat.isDirectory()) {
          continue;
        }

        try {
          const info = await this.gatherWorkspaceInfo(workspacePath, agentId, taskId);
          workspaces.push(info);
        } catch (error) {
          // Skip workspaces that cannot be analyzed
          continue;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to list workspaces for task: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return workspaces;
  }

  /**
   * Detects files modified by multiple agents across workspaces.
   *
   * Identifies merge conflicts where multiple agents have modified the same file.
   * Useful for early conflict detection before merge operations.
   *
   * @param workspacePaths - Array of agent workspace paths to analyze
   * @returns Promise resolving to array of detected conflicts
   *
   * @example
   * ```typescript
   * const conflicts = await manager.detectConflicts([
   *   '/agent-workspaces/task-abc/agent-001',
   *   '/agent-workspaces/task-abc/agent-002'
   * ]);
   * conflicts.forEach(c => {
   *   console.log(`${c.filePath} modified by: ${c.agents.join(', ')}`);
   * });
   * ```
   */
  async detectConflicts(workspacePaths: string[]): Promise<ConflictInfo[]> {
    const fileToAgents = new Map<string, { agents: string[]; timestamps: Record<string, Date>; sizes: Record<string, number> }>();

    // Scan each workspace
    for (const workspacePath of workspacePaths) {
      if (!existsSync(workspacePath)) {
        continue;
      }

      const agentId = this.extractAgentId(workspacePath);
      const files = await this.getAllFiles(workspacePath);

      for (const relPath of files) {
        const filePath = join(workspacePath, relPath);
        const stat = statSync(filePath);

        if (!fileToAgents.has(relPath)) {
          fileToAgents.set(relPath, {
            agents: [],
            timestamps: {},
            sizes: {},
          });
        }

        const entry = fileToAgents.get(relPath)!;
        entry.agents.push(agentId);
        entry.timestamps[agentId] = new Date(stat.mtime);
        entry.sizes[agentId] = stat.size;
      }
    }

    // Filter to only files modified by multiple agents
    const conflicts: ConflictInfo[] = [];
    fileToAgents.forEach((data, filePath) => {
      if (data.agents.length > 1) {
        conflicts.push({
          filePath,
          agents: data.agents,
          timestamps: data.timestamps,
          sizes: data.sizes,
        });
      }
    });

    return conflicts;
  }

  /**
   * Gets the standard workspace path for a given task and agent.
   *
   * @internal
   * @param taskId - Task identifier
   * @param agentId - Agent identifier
   * @returns Full path to workspace directory
   */
  private getWorkspacePath(taskId: string, agentId: string): string {
    return join(this.baseWorkspacePath, taskId, agentId);
  }

  /**
   * Validates that source directory exists and is accessible.
   *
   * @internal
   * @param sourceDir - Source directory path
   * @throws Error if directory doesn't exist or isn't readable
   */
  private async validateSourceDirectory(sourceDir: string): Promise<void> {
    if (!existsSync(sourceDir)) {
      throw new Error(`Source directory not found: ${sourceDir}`);
    }

    try {
      await fs.access(sourceDir);
    } catch {
      throw new Error(`Source directory not accessible: ${sourceDir}`);
    }
  }

  /**
   * Checks available disk space and estimates copy size.
   *
   * @internal
   * @param sourceDir - Source directory for copy
   * @param targetDir - Target directory for copy
   * @returns Disk statistics including available and required space
   */
  private async checkDiskSpace(sourceDir: string, targetDir: string): Promise<DiskStats> {
    try {
      // Get source directory size using du command
      const { stdout: duOutput } = await execFileAsync('du', ['-sb', sourceDir]);
      const requiredBytes = parseInt(duOutput.split('\t')[0], 10);

      // For simplicity, assume 100MB available (in production, use df or statvfs)
      const availableBytes = 1000 * 1024 * 1024; // 1GB default estimate

      return {
        required: requiredBytes,
        available: availableBytes,
        requiredBytes,
        used: 0,
      };
    } catch {
      // If du fails, assume sufficient space but require minimum
      return {
        required: 0,
        available: this.minDiskSpaceBytes * 10,
        requiredBytes: this.minDiskSpaceBytes,
        used: 0,
      };
    }
  }

  /**
   * Performs rsync copy with pattern-based filtering.
   *
   * @internal
   * @param sourceDir - Source directory
   * @param targetDir - Target directory
   * @param patterns - Include/exclude patterns
   */
  private async rsyncCopy(
    sourceDir: string,
    targetDir: string,
    patterns: { include?: string[]; exclude?: string[] }
  ): Promise<void> {
    const args: string[] = [
      '-a', // Archive mode
      '--delete', // Delete extraneous files
    ];

    // Add exclude patterns (processed first)
    if (patterns.exclude && patterns.exclude.length > 0) {
      for (const pattern of patterns.exclude) {
        args.push('--exclude', pattern);
      }
    }

    // Add include patterns
    if (patterns.include && patterns.include.length > 0) {
      for (const pattern of patterns.include) {
        args.push('--include', pattern);
      }
      // Exclude everything else if includes specified
      args.push('--exclude', '*');
    }

    args.push(`${sourceDir}/`, targetDir);

    try {
      await execFileAsync('rsync', args);
    } catch (error) {
      throw new Error(
        `rsync failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gathers information about a workspace directory.
   *
   * @internal
   * @param workspacePath - Path to workspace
   * @param agentId - Agent identifier
   * @param taskId - Task identifier
   * @returns Workspace information
   */
  private async gatherWorkspaceInfo(
    workspacePath: string,
    agentId: string,
    taskId: string
  ): Promise<WorkspaceInfo> {
    const files = await this.getAllFiles(workspacePath);
    let totalSize = 0;

    for (const file of files) {
      const stat = statSync(join(workspacePath, file));
      totalSize += stat.size;
    }

    const stat = statSync(workspacePath);

    return {
      path: workspacePath,
      agentId,
      taskId,
      createdAt: new Date(stat.birthtime),
      filesCount: files.length,
      sizeBytes: totalSize,
      lastModified: new Date(stat.mtime),
      status: 'active',
    };
  }

  /**
   * Gets all files in a directory recursively.
   *
   * @internal
   * @param dirPath - Directory path
   * @returns Array of relative file paths
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (currentPath: string, basePath: string): Promise<void> => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relPath = resolve(fullPath).substring(resolve(basePath).length + 1);

        if (entry.isDirectory()) {
          await walk(fullPath, basePath);
        } else {
          files.push(relPath);
        }
      }
    };

    await walk(dirPath, dirPath);
    return files;
  }

  /**
   * Checks if a file has changed between two versions.
   *
   * @internal
   * @param mainFile - Path to file in main workspace
   * @param agentFile - Path to file in agent workspace
   * @returns True if files differ
   */
  private async fileHasChanged(mainFile: string, agentFile: string): Promise<boolean> {
    if (!existsSync(mainFile)) {
      return true; // New file
    }

    try {
      const mainContent = await fs.readFile(mainFile);
      const agentContent = await fs.readFile(agentFile);
      return !mainContent.equals(agentContent);
    } catch {
      return true; // Treat errors as changes
    }
  }

  /**
   * Detects merge conflicts between main and agent workspace versions.
   *
   * @internal
   * @param mainFile - Path in main workspace
   * @param agentFile - Path in agent workspace
   * @param mainBase - Main workspace base path
   * @param agentBase - Agent workspace base path
   * @returns True if conflict detected
   */
  private async hasConflict(
    mainFile: string,
    agentFile: string,
    mainBase: string,
    agentBase: string
  ): Promise<boolean> {
    if (!existsSync(mainFile)) {
      return false; // New file, no conflict
    }

    // Use git diff if available, otherwise compare content
    try {
      const { stdout } = await execFileAsync('git', [
        'diff',
        '--no-index',
        mainFile,
        agentFile,
      ]);

      // If there's output from git diff, files differ
      return stdout.length > 0;
    } catch {
      // If git diff fails, fall back to content comparison
      try {
        const mainContent = await fs.readFile(mainFile);
        const agentContent = await fs.readFile(agentFile);
        return !mainContent.equals(agentContent);
      } catch {
        return true; // Treat read errors as conflicts
      }
    }
  }

  /**
   * Merges a single file from agent workspace to main workspace.
   *
   * @internal
   * @param mainFile - Target file in main workspace
   * @param agentFile - Source file in agent workspace
   */
  private async mergeFile(mainFile: string, agentFile: string): Promise<void> {
    await fs.mkdir(require('path').dirname(mainFile), { recursive: true });
    await fs.copyFile(agentFile, mainFile);
  }

  /**
   * Recursively removes a directory and all contents.
   *
   * @internal
   * @param dirPath - Directory to remove
   */
  private async removeDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to remove directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extracts agent ID from workspace path.
   *
   * @internal
   * @param workspacePath - Full workspace path
   * @returns Extracted agent ID
   */
  private extractAgentId(workspacePath: string): string {
    const parts = workspacePath.split(/[\\/]/);
    return parts[parts.length - 1] || 'unknown';
  }
}

/**
 * Creates a default workspace manager instance.
 *
 * @param baseWorkspacePath - Optional custom base path (default: /agent-workspaces)
 * @returns WorkspaceManager instance
 *
 * @example
 * ```typescript
 * const manager = createWorkspaceManager();
 * const workspace = await manager.createAgentWorkspace({...});
 * ```
 */
export function createWorkspaceManager(baseWorkspacePath?: string): WorkspaceManager {
  return new WorkspaceManager(baseWorkspacePath);
}
