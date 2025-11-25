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
      '-p',
      prompt,
      '--print',
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
    ];

    console.log(
      `[Implementer] Attempt ${context.attempt}/${context.maxAttempts}: Spawning Claude Code CLI`
    );
    console.log(`[Implementer] Working directory: ${payload.workDir}`);
    console.log(`[Implementer] Task ID: ${payload.taskId}`);
    console.log(`[Implementer] Agent type: ${payload.agentType}`);
    console.log(`[Implementer] Iteration: ${payload.iteration}`);

    const result = await execa(CLI_COMMAND, cliArgs, {
      cwd: payload.workDir,
      timeout: context.timeout,
      stripFinalNewline: true,
      reject: false, // Don't throw on non-zero exit
    });

    const output = result.stdout || result.stderr || '';
    const duration = Date.now() - startTime;

    // Check if command executed successfully
    if (result.exitCode === 0) {
      const filesModified = extractFilesModified(output);

      console.log(
        `[Implementer] ✓ Claude Code completed in ${duration}ms on attempt ${context.attempt}`
      );
      console.log(`[Implementer] Files modified: ${filesModified.length}`);

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
  run: async (payload: ImplementerPayload): Promise<ImplementerResult> => {
    return handleImplementerTask(payload);
  },
});
