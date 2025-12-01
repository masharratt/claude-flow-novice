/**
 * CFN CLI Sprint Implementer
 *
 * Executes aggregated sprints (combined micro-tasks) via Claude Code CLI.
 * Used in non-MDAP mode where tasks are aggregated to reduce CLI invocations.
 *
 * Key differences from cfn-mdap-implementer:
 * - Uses Claude Code CLI (NOT fast Cerebras API)
 * - Handles multiple related micro-tasks in a single CLI execution
 * - Optimized for ~60s execution time per sprint
 * - Supports complex, multi-file implementations
 *
 * Flow:
 * 1. Coordinator aggregates micro-tasks into sprints by category/directory
 * 2. This implementer receives a sprint with combined task descriptions
 * 3. Claude CLI executes all tasks in the sprint together
 * 4. Results are returned with files modified and success status
 *
 * @module cfn-cli-sprint-implementer
 * @version 1.0.0
 */

import { task } from "@trigger.dev/sdk/v3";
import { execa } from "execa";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Security: Sanitize error messages to prevent API key leakage
function sanitizeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/tr_(dev|prod|stg|preview)_[a-zA-Z0-9]+/g, 'tr_$1_[REDACTED]')
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'api_key=[REDACTED]')
    .replace(/token[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'token=[REDACTED]');
}

// =============================================
// Types
// =============================================

/**
 * A single micro-task within a sprint
 */
export interface SprintMicroTask {
  id: string;
  title: string;
  description: string;
  targetFile?: string;
  category: 'architecture' | 'security' | 'performance' | 'testing';
}

/**
 * An aggregated sprint containing multiple related micro-tasks
 */
export interface Sprint {
  id: string;
  name: string;
  category: 'architecture' | 'security' | 'performance' | 'testing';
  microTasks: SprintMicroTask[];
  estimatedFiles: string[];
}

export interface CLISprintImplementerPayload {
  /** CFN Loop task ID */
  taskId: string;
  /** Sprint identifier */
  sprintId: string;
  /** Sprint details with aggregated micro-tasks */
  sprint: Sprint;
  /** Working directory */
  workDir: string;
  /** CLI execution timeout in ms */
  timeout?: number;
  /** Provider for Claude CLI (optional) */
  provider?: string;
}

export interface CLISprintImplementerResult {
  /** Task ID for tracking */
  taskId: string;
  /** Sprint ID */
  sprintId: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Files modified during sprint execution */
  filesModified: string[];
  /** Micro-tasks completed */
  microTasksCompleted: string[];
  /** Micro-tasks failed */
  microTasksFailed: string[];
  /** Execution duration in milliseconds */
  durationMs: number;
  /** CLI output (truncated if too long) */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Whether execution timed out */
  timedOut: boolean;
  /** Confidence score (0-1) */
  confidence: number;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Check if Claude CLI is available in the environment
 * Returns { available: boolean, path?: string, error?: string }
 */
function checkClaudeCLI(): { available: boolean; path?: string; error?: string; version?: string } {
  try {
    // First check if 'claude' command exists
    const whichResult = execSync('which claude 2>/dev/null || echo "NOT_FOUND"', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (whichResult === 'NOT_FOUND' || !whichResult) {
      return {
        available: false,
        error: 'Claude CLI not found in PATH. Install with: npm install -g @anthropic-ai/claude-code',
      };
    }

    // Try to get version to verify it's working
    try {
      const versionResult = execSync('claude --version 2>/dev/null || echo "VERSION_ERROR"', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      if (versionResult === 'VERSION_ERROR') {
        return {
          available: true, // CLI exists but version check failed
          path: whichResult,
          error: 'Claude CLI found but version check failed',
        };
      }

      return {
        available: true,
        path: whichResult,
        version: versionResult,
      };
    } catch {
      return {
        available: true,
        path: whichResult,
        error: 'Claude CLI found but may not be functional',
      };
    }
  } catch (error) {
    return {
      available: false,
      error: `Failed to check Claude CLI: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Build a combined prompt for all micro-tasks in a sprint
 *
 * OPTIMIZED for non-interactive batch execution:
 * - Direct, action-oriented language (no exploration)
 * - Explicit file paths and code structure
 * - Parallel subagent guidance for complex sprints
 * - Time-bound execution hints
 */
function buildSprintPrompt(sprint: Sprint, workDir: string): string {
  const sections: string[] = [];
  const taskCount = sprint.microTasks.length;

  // CRITICAL: Direct action header - no exploration
  sections.push(`EXECUTE IMMEDIATELY - DO NOT EXPLORE CODEBASE`);
  sections.push('');
  sections.push(`Sprint: ${sprint.name} | Category: ${sprint.category}`);
  sections.push(`Work Directory: ${workDir}`);
  sections.push(`Tasks: ${taskCount} | Target: Complete ALL in under 3 minutes`);
  sections.push('');

  // Parallel execution guidance for complex sprints
  if (taskCount > 3) {
    sections.push('## EXECUTION STRATEGY');
    sections.push('This sprint has multiple tasks. For efficiency:');
    sections.push('- Execute tasks in parallel using subagents where independent');
    sections.push('- Group related file operations together');
    sections.push('- Do NOT read existing files unless absolutely necessary');
    sections.push('');
  }

  sections.push('## TASKS - Execute in order:');
  sections.push('');

  for (let i = 0; i < sprint.microTasks.length; i++) {
    const task = sprint.microTasks[i];
    sections.push(`### Task ${i + 1}/${taskCount}: ${task.title}`);
    sections.push(`ID: ${task.id}`);

    // Make target file explicit and required
    if (task.targetFile) {
      const fullPath = task.targetFile.startsWith('/')
        ? task.targetFile
        : `${workDir}/${task.targetFile}`;
      sections.push(`ACTION: Create/modify file: ${fullPath}`);
    }

    sections.push(`WHAT TO DO: ${task.description}`);
    sections.push('');
  }

  // Category-specific but minimal instructions
  sections.push('## CODE REQUIREMENTS');
  sections.push('- TypeScript with proper types');
  sections.push('- ES module syntax (import/export)');
  sections.push('- Minimal error handling (try/catch for external calls)');

  if (sprint.category === 'testing') {
    sections.push('- Jest test structure: describe/it/expect');
  } else if (sprint.category === 'security') {
    sections.push('- Input validation for external data');
  } else if (sprint.category === 'performance') {
    sections.push('- Avoid allocations in loops');
  }

  sections.push('');
  sections.push('## CRITICAL RULES');
  sections.push('1. START WRITING CODE IMMEDIATELY - no analysis phase');
  sections.push('2. Use the Write tool to create files directly');
  sections.push('3. Do NOT read the entire codebase - only read files mentioned in tasks');
  sections.push('4. Do NOT ask clarifying questions - make reasonable assumptions');
  sections.push('5. Complete ALL tasks before finishing');

  return sections.join('\n');
}

/**
 * Get list of modified files by comparing before/after directory state
 */
function getModifiedFiles(workDir: string, beforeFiles: Map<string, number>, afterFiles: Map<string, number>): string[] {
  const modified: string[] = [];

  for (const [file, mtime] of afterFiles) {
    const beforeMtime = beforeFiles.get(file);
    if (!beforeMtime || beforeMtime !== mtime) {
      modified.push(file);
    }
  }

  return modified;
}

/**
 * Recursively get all file mtimes in a directory
 */
function getFileMtimes(dir: string): Map<string, number> {
  const result = new Map<string, number>();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .git, etc.
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.trigger') {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = getFileMtimes(fullPath);
        for (const [file, mtime] of subFiles) {
          result.set(file, mtime);
        }
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        result.set(fullPath, stats.mtimeMs);
      }
    }
  } catch {
    // Directory might not exist yet
  }

  return result;
}

// =============================================
// Task Definition
// =============================================

export const cfnCLISprintImplementerTask = task({
  id: "cfn-cli-sprint-implementer",
  retry: { maxAttempts: 2 }, // Retry once on failure

  run: async (payload: CLISprintImplementerPayload): Promise<CLISprintImplementerResult> => {
    const startTime = Date.now();
    // Increased timeout: 5 minutes per sprint for complex multi-task execution
    const timeout = payload.timeout || 300000; // 5 minutes default (was 3 min)

    console.log(`[cli-sprint-implementer] Starting sprint: ${payload.sprintId}`);
    console.log(`[cli-sprint-implementer] Category: ${payload.sprint.category}`);
    console.log(`[cli-sprint-implementer] Micro-tasks: ${payload.sprint.microTasks.length}`);
    console.log(`[cli-sprint-implementer] Work dir: ${payload.workDir}`);

    // Pre-flight check: Verify Claude CLI is available
    const cliCheck = checkClaudeCLI();
    if (!cliCheck.available) {
      console.error(`[cli-sprint-implementer] ✗ Claude CLI not available: ${cliCheck.error}`);
      return {
        taskId: payload.taskId,
        sprintId: payload.sprintId,
        success: false,
        filesModified: [],
        microTasksCompleted: [],
        microTasksFailed: payload.sprint.microTasks.map(t => t.id),
        durationMs: Date.now() - startTime,
        output: '',
        timedOut: false,
        confidence: 0,
        error: `Claude CLI not available: ${cliCheck.error}`,
      };
    }
    console.log(`[cli-sprint-implementer] Claude CLI found: ${cliCheck.path}${cliCheck.version ? ` (${cliCheck.version})` : ''}`);

    // Build the combined prompt
    const prompt = buildSprintPrompt(payload.sprint, payload.workDir);
    console.log(`[cli-sprint-implementer] Prompt length: ${prompt.length} chars`);

    try {
      // Ensure work directory exists BEFORE taking snapshot
      if (!fs.existsSync(payload.workDir)) {
        fs.mkdirSync(payload.workDir, { recursive: true });
        console.log(`[cli-sprint-implementer] Created work directory: ${payload.workDir}`);
      }

      // Snapshot file state before execution (after directory exists)
      const beforeFiles = getFileMtimes(payload.workDir);
      console.log(`[cli-sprint-implementer] Files before: ${beforeFiles.size}`);

      // Build Claude CLI command with optimized flags for non-interactive batch execution
      const args = [
        '-p', prompt,
        '--output-format', 'text',
        '--max-turns', '15', // Increased from 10 for complex multi-task sprints
        '--dangerously-skip-permissions', // CRITICAL: Skip permission prompts for headless execution
        '--print', // CRITICAL: Force non-interactive mode (prevents TTY blocking in Trigger.dev)
      ];

      // Add provider if specified
      if (payload.provider) {
        args.push('--provider', payload.provider);
      }

      console.log(`[cli-sprint-implementer] Executing Claude CLI with args: ${args.slice(0, 3).join(' ')}... (timeout: ${timeout}ms)`);

      // Execute Claude CLI
      const result = await execa('claude', args, {
        cwd: payload.workDir,
        timeout,
        reject: false, // Don't throw on non-zero exit
        all: true, // Capture stdout + stderr combined
        stdin: 'ignore', // Don't wait for stdin (prevents blocking)
        env: {
          ...process.env,
          // Ensure Claude CLI has access to API keys
        },
      });

      const durationMs = Date.now() - startTime;
      const output = result.all || result.stdout || '';
      const timedOut = result.timedOut || false;

      // Get modified files (includes new files since beforeFiles was empty or sparse)
      const afterFiles = getFileMtimes(payload.workDir);
      const filesModified = getModifiedFiles(payload.workDir, beforeFiles, afterFiles);

      console.log(`[cli-sprint-implementer] Duration: ${durationMs}ms`);
      console.log(`[cli-sprint-implementer] Exit code: ${result.exitCode}`);
      console.log(`[cli-sprint-implementer] Files before: ${beforeFiles.size}, after: ${afterFiles.size}`);
      console.log(`[cli-sprint-implementer] Files modified/created: ${filesModified.length}`);
      if (filesModified.length > 0) {
        console.log(`[cli-sprint-implementer] Modified files: ${filesModified.slice(0, 5).join(', ')}${filesModified.length > 5 ? '...' : ''}`);
      }
      console.log(`[cli-sprint-implementer] Timed out: ${timedOut}`);

      // Log CLI error output if present (for debugging)
      if (result.exitCode !== 0 || result.stderr) {
        console.log(`[cli-sprint-implementer] CLI stderr: ${(result.stderr || 'none').slice(0, 500)}`);
      }

      // Determine success - requires exit code 0, no timeout, and files modified
      const success = result.exitCode === 0 && !timedOut && filesModified.length > 0;

      // Calculate confidence based on:
      // - Exit code (0 = good)
      // - Files modified (more = better, up to expected count)
      // - No timeout
      let confidence = 0.5;
      if (success) {
        confidence = 0.7;
        // Bonus for modifying expected number of files
        const expectedFiles = payload.sprint.microTasks.length;
        const fileRatio = Math.min(filesModified.length / expectedFiles, 1);
        confidence += fileRatio * 0.2;
      } else if (timedOut) {
        confidence = 0.2;
      } else if (result.exitCode !== 0) {
        confidence = 0.3;
      }

      // Determine which micro-tasks completed (heuristic based on file patterns)
      const microTasksCompleted: string[] = [];
      const microTasksFailed: string[] = [];

      for (const task of payload.sprint.microTasks) {
        if (task.targetFile) {
          // Check if target file was modified
          const targetPath = path.isAbsolute(task.targetFile)
            ? task.targetFile
            : path.join(payload.workDir, task.targetFile);

          if (filesModified.includes(targetPath) || filesModified.some(f => f.includes(task.targetFile!))) {
            microTasksCompleted.push(task.id);
          } else {
            microTasksFailed.push(task.id);
          }
        } else {
          // No target file specified, assume completed if sprint succeeded
          if (success) {
            microTasksCompleted.push(task.id);
          } else {
            microTasksFailed.push(task.id);
          }
        }
      }

      console.log(`[cli-sprint-implementer] Tasks completed: ${microTasksCompleted.length}/${payload.sprint.microTasks.length}`);
      console.log(`[cli-sprint-implementer] Confidence: ${confidence.toFixed(2)}`);

      if (success) {
        console.log(`[cli-sprint-implementer] ✓ Sprint completed successfully`);
      } else {
        console.log(`[cli-sprint-implementer] ✗ Sprint failed`);
      }

      return {
        taskId: payload.taskId,
        sprintId: payload.sprintId,
        success,
        filesModified,
        microTasksCompleted,
        microTasksFailed,
        durationMs,
        output: output.slice(0, 5000), // Truncate long output
        timedOut,
        confidence,
        error: success ? undefined : (result.stderr || 'Sprint execution failed'),
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = sanitizeErrorMessage(error);

      console.error(`[cli-sprint-implementer] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        sprintId: payload.sprintId,
        success: false,
        filesModified: [],
        microTasksCompleted: [],
        microTasksFailed: payload.sprint.microTasks.map(t => t.id),
        durationMs,
        output: '',
        timedOut: false,
        confidence: 0.1,
        error: errorMsg,
      };
    }
  },
});
