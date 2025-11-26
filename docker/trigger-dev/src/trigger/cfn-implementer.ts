import { task } from "@trigger.dev/sdk/v3";
import { execa } from 'execa';
import path from 'path';

/**
 * CFN Loop 3 Implementer Task
 * Spawns Claude Code CLI to execute implementation work.
 * Supports retry, timeout, and comprehensive error handling.
 */

export interface ImplementerPayload {
  taskDescription: string;
  agentType: string;
  workDir: string;
  iteration: number;
  taskId: string;
  /** AI provider to use: zai (default), kimi, anthropic, etc. */
  provider?: 'zai' | 'kimi' | 'anthropic' | 'openrouter' | 'gemini' | 'xai';
  /** Enable post-edit validation pipeline (default: true) */
  enablePostEdit?: boolean;
  /** Timeout for post-edit validation per file in ms (default: 30000) */
  postEditTimeout?: number;
  /** Environment variable overrides (for passing API keys through payload) */
  _env?: {
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_BASE_URL?: string;
    ZAI_API_KEY?: string;
    ZAI_BASE_URL?: string;
  };
}

export interface ImplementerResult {
  success: boolean;
  agentType: string;
  filesModified: string[];
  output: string;
  duration: number;
  error?: string;
}

interface ExecutionContext {
  attempt: number;
  maxAttempts: number;
  timeout: number;
  startTime: number;
}

const TIMEOUT_MS = 600000; // 10 minutes
const MAX_ATTEMPTS = 2;
const CLI_COMMAND = 'npx';
const CLI_PACKAGE = '@anthropic-ai/claude-code';

/**
 * Provider configuration for routing API calls
 */
const PROVIDER_CONFIG: Record<string, { baseUrl?: string; apiKeyEnv: string }> = {
  zai: { baseUrl: 'https://api.z.ai/api/anthropic', apiKeyEnv: 'ZAI_API_KEY' },
  kimi: { baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'KIMI_API_KEY' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnv: 'GEMINI_API_KEY' },
  xai: { baseUrl: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY' },
};

/**
 * Build environment variables for CLI execution
 * Handles provider routing and _env overrides
 */
function buildCliEnvironment(payload: ImplementerPayload): Record<string, string | undefined> {
  const provider = payload.provider || 'zai'; // Default to Z.ai
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.zai;

  // Start with process.env
  const env: Record<string, string | undefined> = { ...process.env };

  // Get API key: payload._env > process.env[providerKey] > process.env[fallbackKey]
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (payload._env) {
    // Explicit _env overrides take priority
    apiKey = payload._env.ANTHROPIC_API_KEY || payload._env.ZAI_API_KEY;
    baseUrl = payload._env.ANTHROPIC_BASE_URL || payload._env.ZAI_BASE_URL;
  }

  if (!apiKey) {
    // Try provider-specific env var
    apiKey = process.env[config.apiKeyEnv];
  }

  if (!apiKey && provider !== 'anthropic') {
    // Fallback to ANTHROPIC_API_KEY only if it's not a placeholder
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.includes('placeholder')) {
      apiKey = anthropicKey;
    }
  }

  if (!baseUrl && config.baseUrl) {
    baseUrl = config.baseUrl;
  }

  // Set the final environment for Claude Code CLI
  // Claude Code CLI uses ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  if (baseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  // Log for debugging
  console.log(`[Implementer] Provider: ${provider}`);
  console.log(`[Implementer] API key source: ${payload._env?.ANTHROPIC_API_KEY || payload._env?.ZAI_API_KEY ? 'payload._env' : config.apiKeyEnv}`);
  console.log(`[Implementer] Base URL: ${baseUrl || 'default (api.anthropic.com)'}`);
  console.log(`[Implementer] API key present: ${!!apiKey}`);

  return env;
}

/**
 * Build the prompt for Claude Code CLI
 */
function buildPrompt(payload: ImplementerPayload): string {
  return `
You are a CFN Loop 3 Implementer agent (${payload.agentType}).
Task ID: ${payload.taskId}
Iteration: ${payload.iteration}

## Task Description
${payload.taskDescription}

## Instructions
- Complete the implementation work described above
- Modify files in ${payload.workDir}
- Ensure all changes are tested and validated
- Report all modified files in your output
- Use TypeScript for all code
- Follow existing code style and patterns

## Output Format
After completing the task, provide a JSON block at the end with this structure:
\`\`\`json
{
  "filesModified": ["path/to/file1.ts", "path/to/file2.ts"],
  "summary": "Brief description of changes made"
}
\`\`\`
`;
}

/**
 * Extract files modified from Claude Code output
 */
function extractFilesModified(output: string): string[] {
  const files: string[] = [];

  // Try to find JSON block at end of output
  const jsonMatch = output.match(/```json\s*({[\s\S]*?})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.filesModified)) {
        return parsed.filesModified.filter((f: unknown) => typeof f === 'string');
      }
    } catch (e) {
      // Fall through to regex extraction
    }
  }

  // Fallback: extract file paths from common patterns
  const patterns = [
    /Modified:\s*(.+?)(?:\n|$)/gi,
    /Created:\s*(.+?)(?:\n|$)/gi,
    /Updated:\s*(.+?)(?:\n|$)/gi,
    /File:\s*(.+?)(?:\n|$)/gi,
    /Changes to:\s*(.+?)(?:\n|$)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const file = match[1]?.trim();
      if (file && file.endsWith('.ts')) {
        files.push(file);
      }
    }
  }

  return [...new Set(files)]; // Deduplicate
}

/**
 * Check if CFN package is available in working directory
 */
async function checkCFNAvailable(workDir: string): Promise<boolean> {
  try {
    const result = await execa('npx', ['claude-flow-novice', '--version'], {
      cwd: workDir,
      reject: false,
      timeout: 5000,
      stdio: 'pipe',
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Install CFN package in working directory
 */
async function installCFN(workDir: string): Promise<boolean> {
  console.log(`[Implementer] Installing claude-flow-novice in ${workDir}...`);
  try {
    const result = await execa('npm', ['install', 'claude-flow-novice'], {
      cwd: workDir,
      timeout: 60000, // 60 second timeout for installation
      stdio: 'pipe',
      reject: false,
    });

    if (result.exitCode === 0) {
      console.log(`[Implementer] ✓ CFN installed successfully`);
      return true;
    } else {
      console.error(`[Implementer] ✗ CFN installation failed: ${result.stderr}`);
      return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Implementer] ✗ CFN installation error: ${errorMessage}`);
    return false;
  }
}

/**
 * Run post-edit validation on modified files
 */
async function runPostEditValidation(
  filesModified: string[],
  payload: ImplementerPayload
): Promise<void> {
  const timeout = payload.postEditTimeout ?? 30000; // Default 30 seconds
  console.log(`[Implementer] Running post-edit validation on ${filesModified.length} files`);

  // Check if CFN is available
  const cfnAvailable = await checkCFNAvailable(payload.workDir);
  if (!cfnAvailable) {
    const installSuccess = await installCFN(payload.workDir);
    if (!installSuccess) {
      console.warn(`[Implementer] ⚠ Skipping post-edit validation (CFN unavailable)`);
      return;
    }
  }

  // Run post-edit hook on each file
  for (const file of filesModified) {
    try {
      console.log(`[Implementer] Validating ${file}...`);

      const hookResult = await execa(
        'npx',
        [
          'claude-flow-novice',
          'post-edit',
          file,
          '--agent-id',
          payload.taskId,
          '--non-blocking', // Don't fail task on validation errors
        ],
        {
          cwd: payload.workDir,
          timeout,
          reject: false,
          stdio: 'pipe',
        }
      );

      if (hookResult.exitCode === 0) {
        console.log(`[Implementer] ✓ ${file} validated`);
      } else {
        console.warn(`[Implementer] ⚠ ${file} validation warnings:`);
        if (hookResult.stderr) {
          console.warn(hookResult.stderr.substring(0, 500)); // First 500 chars
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Implementer] ✗ ${file} validation failed: ${errorMessage}`);
      // Continue with other files, don't fail entire task
    }
  }

  console.log(`[Implementer] Post-edit validation complete`);
}

/**
 * Validate payload structure
 */
function validatePayload(payload: unknown): payload is ImplementerPayload {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const p = payload as Record<string, unknown>;
  return (
    typeof p.taskDescription === 'string' &&
    typeof p.agentType === 'string' &&
    typeof p.workDir === 'string' &&
    typeof p.iteration === 'number' &&
    typeof p.taskId === 'string' &&
    p.iteration >= 0 &&
    p.taskDescription.length > 0 &&
    p.agentType.length > 0
  );
}

/**
 * Execute Claude Code CLI with retry logic
 */
async function executeWithRetry(
  payload: ImplementerPayload,
  context: ExecutionContext
): Promise<ImplementerResult> {
  const startTime = Date.now();

  try {
    const prompt = buildPrompt(payload);
    const cliArgs = [
      CLI_PACKAGE,
      '--print',                        // Non-interactive mode
      '--output-format', 'json',        // JSON output for parsing
      '--dangerously-skip-permissions', // Skip permission prompts
      prompt,                           // Prompt as final positional argument
    ];

    console.log(
      `[Implementer] Attempt ${context.attempt}/${context.maxAttempts}: Spawning Claude Code CLI`
    );
    console.log(`[Implementer] Executing: ${CLI_COMMAND} ${cliArgs[0]} ${cliArgs[1]} ${cliArgs[2]} ${cliArgs[3]} [prompt...]`);
    console.log(`[Implementer] Working directory: ${payload.workDir}`);
    console.log(`[Implementer] Task ID: ${payload.taskId}`);
    console.log(`[Implementer] Agent type: ${payload.agentType}`);
    console.log(`[Implementer] Iteration: ${payload.iteration}`);

    // Build environment with proper provider routing
    const cliEnv = buildCliEnvironment(payload);

    const result = await execa(CLI_COMMAND, cliArgs, {
      cwd: payload.workDir,
      timeout: context.timeout,
      forceKillAfterDelay: 5000, // Force SIGKILL 5 seconds after timeout SIGTERM
      stripFinalNewline: true,
      reject: false, // Don't throw on non-zero exit
      env: cliEnv,
    });

    const output = result.stdout || result.stderr || '';
    const duration = Date.now() - startTime;

    console.log(`[Implementer] Exit code: ${result.exitCode}`);
    if (result.stderr) {
      console.log(`[Implementer] stderr: ${result.stderr.substring(0, 500)}`);
    }
    if (result.stdout) {
      console.log(`[Implementer] stdout length: ${result.stdout.length} chars`);
    }

    // Check if command executed successfully
    if (result.exitCode === 0) {
      const filesModified = extractFilesModified(output);

      console.log(
        `[Implementer] ✓ Claude Code completed in ${duration}ms on attempt ${context.attempt}`
      );
      console.log(`[Implementer] Files modified: ${filesModified.length}`);

      // Run post-edit validation if enabled
      const enablePostEdit = payload.enablePostEdit ?? true; // Default: enabled
      if (enablePostEdit && filesModified.length > 0) {
        try {
          await runPostEditValidation(filesModified, payload);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`[Implementer] ⚠ Post-edit validation failed: ${errorMessage}`);
          // Don't fail the task, validation is non-blocking
        }
      }

      return {
        success: true,
        agentType: payload.agentType,
        filesModified,
        output,
        duration,
      };
    }

    // Handle failures
    const errorMessage = `Claude Code CLI exited with code ${result.exitCode}`;
    console.error(`[Implementer] ✗ ${errorMessage}`);
    console.error(`[Implementer] stderr: ${result.stderr || 'none'}`);

    // Determine if we should retry
    if (context.attempt < context.maxAttempts) {
      console.log(`[Implementer] Retrying (${context.attempt + 1}/${context.maxAttempts})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s backoff

      return executeWithRetry(
        payload,
        {
          ...context,
          attempt: context.attempt + 1,
          timeout: context.timeout - (Date.now() - context.startTime),
        }
      );
    }

    // All retries exhausted
    return {
      success: false,
      agentType: payload.agentType,
      filesModified: [],
      output,
      duration,
      error: `${errorMessage} (after ${context.maxAttempts} attempts)`,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`[Implementer] ✗ Execution error: ${errorMessage}`);

    // Check for timeout errors
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('ETIMEDOUT') ||
      duration >= context.timeout
    ) {
      console.error(`[Implementer] Timeout after ${duration}ms`);

      if (context.attempt < context.maxAttempts) {
        console.log(`[Implementer] Retrying after timeout...`);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s backoff

        return executeWithRetry(
          payload,
          {
            ...context,
            attempt: context.attempt + 1,
            timeout: context.timeout - (Date.now() - context.startTime),
          }
        );
      }

      return {
        success: false,
        agentType: payload.agentType,
        filesModified: [],
        output: '',
        duration,
        error: `Execution timeout after ${duration}ms (max: ${TIMEOUT_MS}ms)`,
      };
    }

    // Other errors
    return {
      success: false,
      agentType: payload.agentType,
      filesModified: [],
      output: '',
      duration,
      error: `Execution failed: ${errorMessage}`,
    };
  }
}

/**
 * Main task handler
 */
export async function handleImplementerTask(
  payload: unknown
): Promise<ImplementerResult> {
  // Validate input
  if (!validatePayload(payload)) {
    console.error('[Implementer] Invalid payload structure:', payload);
    return {
      success: false,
      agentType: 'unknown',
      filesModified: [],
      output: '',
      duration: 0,
      error: 'Invalid payload: missing or incorrect fields',
    };
  }

  // Ensure working directory exists and is absolute
  const workDir = path.resolve(payload.workDir);
  const normalizedPayload: ImplementerPayload = {
    ...payload,
    workDir,
  };

  console.log('[Implementer] Starting CFN Loop 3 implementer task');
  console.log(`[Implementer] Timeout: ${TIMEOUT_MS}ms`);
  console.log(`[Implementer] Max attempts: ${MAX_ATTEMPTS}`);

  const startTime = Date.now();

  try {
    const result = await executeWithRetry(normalizedPayload, {
      attempt: 1,
      maxAttempts: MAX_ATTEMPTS,
      timeout: TIMEOUT_MS,
      startTime,
    });

    // Log final result
    if (result.success) {
      console.log('[Implementer] ✓ Task completed successfully');
      console.log(`[Implementer] Total duration: ${result.duration}ms`);
      console.log(`[Implementer] Files modified: ${result.filesModified.length}`);
    } else {
      console.error('[Implementer] ✗ Task failed');
      console.error(`[Implementer] Error: ${result.error}`);
      console.error(`[Implementer] Total duration: ${result.duration}ms`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[Implementer] ✗ Unexpected error:', errorMessage);

    return {
      success: false,
      agentType: normalizedPayload.agentType,
      filesModified: [],
      output: '',
      duration,
      error: `Unexpected error: ${errorMessage}`,
    };
  }
}

/**
 * CFN Implementer Trigger.dev Task
 */
export const cfnImplementerTask = task({
  id: "cfn-implementer",
  retry: { maxAttempts: 2 },
  maxDuration: 900, // 15 minutes (allows time for CLI + post-edit validation)
  run: async (payload: ImplementerPayload): Promise<ImplementerResult> => {
    return handleImplementerTask(payload);
  },
});
