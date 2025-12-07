/**
 * Secure Execution Utilities for MDAP
 *
 * Provides secure command execution with whitelisting and input validation
 * to prevent command injection vulnerabilities.
 *
 * @module secure-execution
 * @version 1.0.0
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

// =============================================
// Types
// =============================================

export interface SecureExecutionOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Maximum buffer size for output (default: 50MB) */
  maxBuffer?: number;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Environment variables (default: process.env) */
  env?: Record<string, string>;
}

export interface SecureExecutionResult {
  /** Exit code */
  code: number | null;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether execution timed out */
  timedOut: boolean;
  /** Execution error if any */
  error?: Error;
}

// =============================================
// Constants
// =============================================

/** Whitelist of allowed compiler commands */
const ALLOWED_COMMANDS = new Set([
  'tsc',
  'tsc-watch',
  'rustc',
  'cargo',
  'gcc',
  'g++',
  'clang',
  'clang++',
  'javac',
  'go',
  'python',
  'python3',
  'node',
  'npm',
  'yarn',
  'pnpm',
  'pytest',
  'jest',
  'mocha',
  'eslint',
  'prettier',
]);

/** Dangerous patterns in command arguments */
const DANGEROUS_PATTERNS = [
  /;/g,
  /&&/g,
  /\|\|/g,
  /\|/g,
  />/g,
  /</g,
  /`/g,
  /\$/g,
  /\${/g,
  /\(/g,
  /\)/g,
  /&/g,
];

// =============================================
// Security Functions
// =============================================

/**
 * Validates if a command is whitelisted
 * @param command Command to validate
 * @returns Whether command is allowed
 */
export function isCommandAllowed(command: string): boolean {
  // Extract base command (first word)
  const baseCommand = command.trim().split(/\s+/)[0];

  // Check against whitelist
  return ALLOWED_COMMANDS.has(baseCommand);
}

/**
 * Sanitizes command arguments to prevent injection
 * @param args Command arguments
 * @returns Sanitized arguments
 */
export function sanitizeArgs(args: string[]): string[] {
  return args.map(arg => {
    // Remove dangerous patterns
    let sanitized = arg;
    DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    return sanitized;
  });
}

/**
 * Validates and parses a command string
 * @param commandString Full command string
 * @returns Parsed and validated command parts
 * @throws Error if command is not allowed or contains dangerous patterns
 */
export function validateCommand(commandString: string): { command: string; args: string[] } {
  // Parse command into parts
  const parts = commandString.trim().split(/\s+/);

  if (parts.length === 0) {
    throw new Error('Empty command');
  }

  const command = parts[0];
  const args = parts.slice(1);

  // Check if command is whitelisted
  if (!isCommandAllowed(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // Sanitize arguments
  const sanitizedArgs = sanitizeArgs(args);

  return { command, args: sanitizedArgs };
}

// =============================================
// Secure Execution Functions
// =============================================

/**
 * Executes a command securely using spawn
 * @param command Command to execute
 * @param options Execution options
 * @returns Promise resolving to execution result
 */
export async function secureSpawn(
  command: string,
  options: SecureExecutionOptions = {}
): Promise<SecureExecutionResult> {
  // Validate command
  const { command: validatedCommand, args } = validateCommand(command);

  // Set default options
  const {
    cwd = process.cwd(),
    maxBuffer = 50 * 1024 * 1024, // 50MB
    timeout = 30000, // 30 seconds
    env = process.env as Record<string, string>,
  } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Spawn the process
    const child = spawn(validatedCommand, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Collect output
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) {
        child.kill();
        timedOut = true;
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > maxBuffer) {
        child.kill();
        timedOut = true;
      }
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      child.kill();
      timedOut = true;
    }, timeout);

    // Handle process completion
    child.on('close', (code) => {
      clearTimeout(timeoutId);

      resolve({
        code,
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        timedOut,
      });
    });

    // Handle errors
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        code: null,
        stdout: '',
        stderr: '',
        timedOut,
        error,
      });
    });
  });
}

/**
 * Executes a command synchronously (for backward compatibility)
 * Note: This still uses spawn under the hood for security
 * @param command Command to execute
 * @param options Execution options
 * @returns Execution result
 */
export async function secureExecSync(
  command: string,
  options: SecureExecutionOptions = {}
): Promise { stdout: string; stderr: string }> {
  const result = await secureSpawn(command, options);

  if (result.error) {
    throw result.error;
  }

  if (result.timedOut) {
    throw new Error(`Command timed out: ${command}`);
  }

  if (result.code !== 0 && result.code !== null) {
    const error = new Error(`Command failed with exit code ${result.code}: ${command}`) as any;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.code = result.code;
    throw error;
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Adds a command to the whitelist
 * @param command Command to add
 */
export function addAllowedCommand(command: string): void {
  ALLOWED_COMMANDS.add(command);
}

/**
 * Removes a command from the whitelist
 * @param command Command to remove
 */
export function removeAllowedCommand(command: string): void {
  ALLOWED_COMMANDS.delete(command);
}

/**
 * Gets the current whitelist of allowed commands
 * @returns Array of allowed commands
 */
export function getAllowedCommands(): string[] {
  return Array.from(ALLOWED_COMMANDS);
}