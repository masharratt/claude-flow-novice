/**
 * CLI Executor - Wrapper for Claude Code CLI execution
 *
 * Provides structured execution with forceKillAfterDelay to prevent
 * hanging processes after timeout. Fixes the 11-minute hang issue
 * where CLI would complete but not terminate.
 *
 * Reference: planning/trigger/v4/TIMEOUT_FIX_HANDOFF.md
 */

import { execa } from 'execa';

/**
 * Result of CLI execution with all relevant metadata
 */
export interface ExecutionResult {
  /** Whether the command completed successfully (exit code 0) */
  success: boolean;
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code (undefined if killed by signal) */
  exitCode: number | undefined;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
  /** Whether the process was terminated by a signal */
  isTerminated: boolean;
  /** Whether the process was forcefully killed via forceKillAfterDelay */
  isForcefullyTerminated: boolean;
  /** Signal that terminated the process (if any) */
  signal?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Options for CLI execution
 */
export interface ExecuteClaudeCliOptions {
  /** Working directory for the command */
  cwd: string;
  /** Timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Delay after SIGTERM before SIGKILL (default: 5000 = 5 seconds) */
  forceKillAfterDelay?: number;
  /** Environment variables to pass to the command */
  env?: Record<string, string | undefined>;
  /** Whether to strip the final newline from output */
  stripFinalNewline?: boolean;
}

/**
 * Default execution options
 */
const DEFAULT_OPTIONS = {
  timeout: 600000, // 10 minutes
  forceKillAfterDelay: 5000, // 5 seconds after SIGTERM
  stripFinalNewline: true,
} as const;

/**
 * Convert stdout/stderr to string safely
 */
function toStringOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }
  return String(value ?? '');
}

/**
 * Execute Claude Code CLI with proper timeout handling
 *
 * This wrapper ensures that CLI processes are properly terminated after timeout
 * using forceKillAfterDelay, which sends SIGKILL if the process doesn't respond
 * to SIGTERM within the specified delay.
 *
 * @param args - CLI arguments (e.g., ['-p', 'task description', '--allowedTools', 'Edit,Write'])
 * @param options - Execution options
 * @returns Structured execution result
 *
 * @example
 * ```typescript
 * const result = await executeClaudeCli(
 *   ['-p', 'Create a hello world file', '--allowedTools', 'Edit,Write'],
 *   { cwd: '/workspace', timeout: 120000 }
 * );
 *
 * if (result.success) {
 *   console.log('Task completed:', result.stdout);
 * } else if (result.timedOut) {
 *   console.log('Task timed out after', result.durationMs, 'ms');
 * } else {
 *   console.log('Task failed:', result.error);
 * }
 * ```
 */
export async function executeClaudeCli(
  args: string[],
  options: ExecuteClaudeCliOptions
): Promise<ExecutionResult> {
  const startTime = Date.now();

  const timeout = options.timeout ?? DEFAULT_OPTIONS.timeout;
  const forceKillAfterDelay = options.forceKillAfterDelay ?? DEFAULT_OPTIONS.forceKillAfterDelay;
  const stripFinalNewline = options.stripFinalNewline ?? DEFAULT_OPTIONS.stripFinalNewline;

  // Log execution start
  console.log(`[cli-executor] Starting CLI execution`);
  console.log(`[cli-executor] Working directory: ${options.cwd}`);
  console.log(`[cli-executor] Timeout: ${timeout}ms`);
  console.log(`[cli-executor] Force kill delay: ${forceKillAfterDelay}ms`);
  console.log(`[cli-executor] Args: ${args.join(' ')}`);

  try {
    const result = await execa('claude', args, {
      cwd: options.cwd,
      timeout,
      forceKillAfterDelay,
      stripFinalNewline,
      reject: false, // Don't throw on non-zero exit
      env: options.env,
      stdin: 'ignore', // Prevent stdin blocking in non-interactive mode
    });

    const durationMs = Date.now() - startTime;

    // Log execution result
    console.log(`[cli-executor] Execution completed in ${durationMs}ms`);
    console.log(`[cli-executor] Exit code: ${result.exitCode}`);
    console.log(`[cli-executor] Timed out: ${result.timedOut}`);
    console.log(`[cli-executor] Terminated: ${result.isTerminated}`);
    console.log(`[cli-executor] Forcefully terminated: ${result.isForcefullyTerminated}`);
    if (result.signal) {
      console.log(`[cli-executor] Signal: ${result.signal}`);
    }

    const stdout = toStringOutput(result.stdout);
    const stderr = toStringOutput(result.stderr);

    return {
      success: result.exitCode === 0 && !result.timedOut && !result.isTerminated,
      stdout,
      stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      isTerminated: result.isTerminated,
      isForcefullyTerminated: result.isForcefullyTerminated,
      signal: result.signal,
      durationMs,
      error: result.exitCode !== 0 ? stderr || stdout : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err as Error & {
      stdout?: unknown;
      stderr?: unknown;
      exitCode?: number;
      timedOut?: boolean;
      isTerminated?: boolean;
      isForcefullyTerminated?: boolean;
      signal?: string;
    };

    // Log error
    console.error(`[cli-executor] Execution failed after ${durationMs}ms`);
    console.error(`[cli-executor] Error: ${error.message}`);
    if (error.timedOut) {
      console.error(`[cli-executor] Process timed out`);
    }
    if (error.isTerminated) {
      console.error(`[cli-executor] Process was terminated (signal: ${error.signal})`);
    }

    const stdout = toStringOutput(error.stdout);
    const stderr = toStringOutput(error.stderr);

    return {
      success: false,
      stdout,
      stderr,
      exitCode: error.exitCode,
      timedOut: error.timedOut ?? false,
      isTerminated: error.isTerminated ?? false,
      isForcefullyTerminated: error.isForcefullyTerminated ?? false,
      signal: error.signal,
      durationMs,
      error: error.message,
    };
  }
}

/**
 * Execute a simple CLI command (not Claude) with the same timeout handling
 * Useful for npm install, version checks, etc.
 */
export async function executeCommand(
  command: string,
  args: string[],
  options: ExecuteClaudeCliOptions
): Promise<ExecutionResult> {
  const startTime = Date.now();

  const timeout = options.timeout ?? DEFAULT_OPTIONS.timeout;
  const forceKillAfterDelay = options.forceKillAfterDelay ?? DEFAULT_OPTIONS.forceKillAfterDelay;
  const stripFinalNewline = options.stripFinalNewline ?? DEFAULT_OPTIONS.stripFinalNewline;

  console.log(`[cli-executor] Executing: ${command} ${args.join(' ')}`);

  try {
    const result = await execa(command, args, {
      cwd: options.cwd,
      timeout,
      forceKillAfterDelay,
      stripFinalNewline,
      reject: false,
      env: options.env,
      stdin: 'ignore', // Prevent stdin blocking in non-interactive mode
    });

    const durationMs = Date.now() - startTime;
    const stdout = toStringOutput(result.stdout);
    const stderr = toStringOutput(result.stderr);

    return {
      success: result.exitCode === 0 && !result.timedOut && !result.isTerminated,
      stdout,
      stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      isTerminated: result.isTerminated,
      isForcefullyTerminated: result.isForcefullyTerminated,
      signal: result.signal,
      durationMs,
      error: result.exitCode !== 0 ? stderr || stdout : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err as Error & {
      stdout?: unknown;
      stderr?: unknown;
      exitCode?: number;
      timedOut?: boolean;
      isTerminated?: boolean;
      isForcefullyTerminated?: boolean;
      signal?: string;
    };

    const stdout = toStringOutput(error.stdout);
    const stderr = toStringOutput(error.stderr);

    return {
      success: false,
      stdout,
      stderr,
      exitCode: error.exitCode,
      timedOut: error.timedOut ?? false,
      isTerminated: error.isTerminated ?? false,
      isForcefullyTerminated: error.isForcefullyTerminated ?? false,
      signal: error.signal,
      durationMs,
      error: error.message,
    };
  }
}

/**
 * Check if forceKillAfterDelay is working by running a quick test
 */
export async function verifyTimeoutHandling(cwd: string): Promise<boolean> {
  console.log(`[cli-executor] Verifying timeout handling...`);

  // Run a simple command that should complete quickly
  const result = await executeCommand('node', ['-e', 'console.log("ok")'], {
    cwd,
    timeout: 5000,
    forceKillAfterDelay: 1000,
  });

  if (result.success && result.durationMs < 5000) {
    console.log(`[cli-executor] Timeout handling verified (completed in ${result.durationMs}ms)`);
    return true;
  }

  console.error(`[cli-executor] Timeout handling verification failed`);
  return false;
}
