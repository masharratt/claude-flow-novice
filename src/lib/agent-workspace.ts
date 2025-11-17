/**
 * Agent Workspace Management
 *
 * Provides persistent, organized workspace for agent outputs with reliable completion signals.
 * Part of Task 2.1: Persistent Agent Output Workspace (Integration)
 *
 * Directory Structure:
 *   artifacts/agent-workspaces/{task_id}/{agent_id}/
 *     ├── logs/           (stdout.log, stderr.log)
 *     ├── reports/        (analysis.json, etc.)
 *     ├── metrics/        (performance.json, etc.)
 *     ├── deliverables/   (output files)
 *     └── COMPLETION_SIGNAL.json
 *
 * Usage:
 *   const workspace = await createWorkspace('task-123', 'agent-456');
 *   await writeOutput(workspace, 'logs', 'stdout.log', 'Log content');
 *   await signalCompletion(workspace, { success: true, confidence: 0.85 });
 */

import * as path from 'path';
import { atomicWrite, ensureDirectory } from './file-operations';
import { createLogger } from './logging';
import { createError, ErrorCode } from './errors';
import { writeCompletionSignal, CompletionMetadata } from './completion-signal-handler';

const logger = createLogger('agent-workspace');

/**
 * Workspace configuration
 */
const WORKSPACE_ROOT = path.resolve(process.cwd(), 'artifacts', 'agent-workspaces');

/**
 * Output types supported by workspace
 */
export type OutputType = 'logs' | 'reports' | 'metrics' | 'deliverables';

/**
 * Workspace path information
 */
export interface WorkspacePath {
  /** Root path of the workspace */
  path: string;
  /** Task ID */
  taskId: string;
  /** Agent ID */
  agentId: string;
  /** Paths to subdirectories */
  subdirectories: {
    logs: string;
    reports: string;
    metrics: string;
    deliverables: string;
  };
}

/**
 * Workspace creation options
 */
export interface WorkspaceOptions {
  /** Custom workspace root (default: artifacts/agent-workspaces) */
  workspaceRoot?: string;
  /** Skip directory creation (default: false) */
  skipCreate?: boolean;
}

/**
 * Create a workspace for an agent
 *
 * Pattern: Atomic directory creation with race-condition safety
 *
 * @param taskId - Unique task identifier
 * @param agentId - Unique agent identifier
 * @param options - Workspace creation options
 * @returns Workspace path information
 * @throws INVALID_INPUT if taskId or agentId is invalid
 * @throws DIRECTORY_CREATE_FAILED if directory creation fails
 */
export async function createWorkspace(
  taskId: string,
  agentId: string,
  options: WorkspaceOptions = {}
): Promise<WorkspacePath> {
  // Validate inputs
  if (!taskId || typeof taskId !== 'string') {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Task ID must be a non-empty string',
      { taskId }
    );
  }
  if (!agentId || typeof agentId !== 'string') {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Agent ID must be a non-empty string',
      { agentId }
    );
  }

  // Sanitize IDs to prevent path traversal
  const sanitizedTaskId = sanitizeId(taskId);
  const sanitizedAgentId = sanitizeId(agentId);

  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const workspacePath = path.join(workspaceRoot, sanitizedTaskId, sanitizedAgentId);

  // Define subdirectories
  const subdirectories = {
    logs: path.join(workspacePath, 'logs'),
    reports: path.join(workspacePath, 'reports'),
    metrics: path.join(workspacePath, 'metrics'),
    deliverables: path.join(workspacePath, 'deliverables'),
  };

  // Create directories (atomic, race-condition safe)
  if (!options.skipCreate) {
    try {
      await ensureDirectory(workspacePath);
      await Promise.all(
        Object.values(subdirectories).map((dir) => ensureDirectory(dir))
      );
      logger.info('Workspace created', { taskId, agentId, workspacePath });
    } catch (error) {
      throw createError(
        ErrorCode.DIRECTORY_CREATE_FAILED,
        'Failed to create workspace directories',
        { taskId, agentId, workspacePath, error: (error as Error).message }
      );
    }
  }

  return {
    path: workspacePath,
    taskId: sanitizedTaskId,
    agentId: sanitizedAgentId,
    subdirectories,
  };
}

/**
 * Get the path to an existing workspace
 *
 * @param taskId - Unique task identifier
 * @param agentId - Unique agent identifier
 * @param options - Workspace options
 * @returns Workspace path information
 */
export function getWorkspacePath(
  taskId: string,
  agentId: string,
  options: WorkspaceOptions = {}
): WorkspacePath {
  const sanitizedTaskId = sanitizeId(taskId);
  const sanitizedAgentId = sanitizeId(agentId);
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const workspacePath = path.join(workspaceRoot, sanitizedTaskId, sanitizedAgentId);

  const subdirectories = {
    logs: path.join(workspacePath, 'logs'),
    reports: path.join(workspacePath, 'reports'),
    metrics: path.join(workspacePath, 'metrics'),
    deliverables: path.join(workspacePath, 'deliverables'),
  };

  return {
    path: workspacePath,
    taskId: sanitizedTaskId,
    agentId: sanitizedAgentId,
    subdirectories,
  };
}

/**
 * Write output to workspace
 *
 * Pattern: Atomic write with automatic directory creation
 *
 * @param workspace - Workspace path information
 * @param type - Output type (logs, reports, metrics, deliverables)
 * @param filename - Name of the output file
 * @param content - Content to write (string or object)
 * @returns Promise that resolves when write is complete
 * @throws INVALID_INPUT if type is invalid
 * @throws FILE_WRITE_FAILED if write fails
 */
export async function writeOutput(
  workspace: WorkspacePath,
  type: OutputType,
  filename: string,
  content: string | Record<string, any>
): Promise<void> {
  // Validate type
  const validTypes: OutputType[] = ['logs', 'reports', 'metrics', 'deliverables'];
  if (!validTypes.includes(type)) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      `Invalid output type. Must be one of: ${validTypes.join(', ')}`,
      { type }
    );
  }

  // Sanitize filename
  const sanitizedFilename = sanitizeFilename(filename);
  const outputPath = path.join(workspace.subdirectories[type], sanitizedFilename);

  // Ensure directory exists
  await ensureDirectory(path.dirname(outputPath));

  // Convert content to string if necessary
  const contentStr =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  // Atomic write
  try {
    await atomicWrite(outputPath, contentStr);
    logger.debug('Output written', {
      taskId: workspace.taskId,
      agentId: workspace.agentId,
      type,
      filename: sanitizedFilename,
      sizeBytes: contentStr.length,
    });
  } catch (error) {
    throw createError(
      ErrorCode.FILE_WRITE_FAILED,
      'Failed to write output to workspace',
      {
        taskId: workspace.taskId,
        agentId: workspace.agentId,
        type,
        filename: sanitizedFilename,
        error: (error as Error).message,
      }
    );
  }
}

/**
 * Read output from workspace
 *
 * @param workspace - Workspace path information
 * @param type - Output type (logs, reports, metrics, deliverables)
 * @param filename - Name of the output file
 * @returns File content (parsed as JSON if applicable)
 * @throws INVALID_INPUT if type is invalid
 * @throws FILE_NOT_FOUND if file does not exist
 */
export async function readOutput(
  workspace: WorkspacePath,
  type: OutputType,
  filename: string
): Promise<string | Record<string, any>> {
  // Validate type
  const validTypes: OutputType[] = ['logs', 'reports', 'metrics', 'deliverables'];
  if (!validTypes.includes(type)) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      `Invalid output type. Must be one of: ${validTypes.join(', ')}`,
      { type }
    );
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const outputPath = path.join(workspace.subdirectories[type], sanitizedFilename);

  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(outputPath, 'utf8');

    // Try to parse as JSON
    if (filename.endsWith('.json')) {
      try {
        return JSON.parse(content);
      } catch {
        // Return as string if JSON parsing fails
        return content;
      }
    }

    return content;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      throw createError(
        ErrorCode.FILE_NOT_FOUND,
        'Output file not found',
        {
          taskId: workspace.taskId,
          agentId: workspace.agentId,
          type,
          filename: sanitizedFilename,
        }
      );
    }
    throw error;
  }
}

/**
 * Signal agent completion
 *
 * Writes a completion signal file that coordinators can poll for.
 *
 * @param workspace - Workspace path information
 * @param metadata - Completion metadata
 * @returns Promise that resolves when signal is written
 */
export async function signalCompletion(
  workspace: WorkspacePath,
  metadata: CompletionMetadata
): Promise<void> {
  await writeCompletionSignal(workspace, {
    ...metadata,
    taskId: workspace.taskId,
    agentId: workspace.agentId,
    timestamp: new Date(),
  });

  logger.info('Completion signal written', {
    taskId: workspace.taskId,
    agentId: workspace.agentId,
    success: metadata.success,
    confidence: metadata.confidence,
  });
}

/**
 * List all workspaces for a task
 *
 * @param taskId - Task identifier
 * @param options - Workspace options
 * @returns Array of agent IDs with workspaces
 */
export async function listWorkspaces(
  taskId: string,
  options: WorkspaceOptions = {}
): Promise<string[]> {
  const sanitizedTaskId = sanitizeId(taskId);
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const taskPath = path.join(workspaceRoot, sanitizedTaskId);

  try {
    const fs = await import('fs/promises');
    const entries = await fs.readdir(taskPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Sanitize an ID to prevent path traversal
 *
 * @param id - Input ID
 * @returns Sanitized ID
 */
function sanitizeId(id: string): string {
  // Remove path separators and special characters
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Sanitize a filename to prevent path traversal
 *
 * @param filename - Input filename
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators but keep dots for extensions
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
}
