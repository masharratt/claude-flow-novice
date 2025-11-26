/**
 * Z.ai Agent Test Task
 *
 * Tests the claude-agent task with Z.ai provider routing.
 * This task spawns a real Claude Code CLI agent using Z.ai's API.
 */

import { task } from "@trigger.dev/sdk/v3";
import { execa, type ExecaError } from "execa";
import * as fs from "fs";
import * as path from "path";

/**
 * Test payload for Z.ai agent test
 */
interface ZaiTestPayload {
  testId: string;
  outputDir: string;
  /** Simple task for the agent to perform */
  taskDescription?: string;
  /** Optional: Override environment variables (for production container env bypass) */
  _env?: {
    ZAI_API_KEY?: string;
    ZAI_BASE_URL?: string;
  };
}

/**
 * Test result from Z.ai agent
 */
interface ZaiTestResult {
  testId: string;
  success: boolean;
  cliOutput: string;
  fileCreated: boolean;
  filePath?: string;
  fileContent?: string;
  duration: number;
  exitCode?: number;
  error?: string;
}

/**
 * Z.ai Agent Test Task
 *
 * This task:
 * 1. Spawns Claude Code CLI with Z.ai provider
 * 2. Asks it to create a simple file
 * 3. Verifies the file was created
 */
export const testZaiAgentTask = task({
  id: "test-zai-agent",
  retry: { maxAttempts: 1 },
  run: async (payload: ZaiTestPayload): Promise<ZaiTestResult> => {
    const startTime = Date.now();
    const testFile = path.join(payload.outputDir, `zai-test-${payload.testId}.ts`);

    console.log(`[Z.ai Test] Starting test ${payload.testId}`);
    console.log(`[Z.ai Test] Output dir: ${payload.outputDir}`);
    console.log(`[Z.ai Test] Expected file: ${testFile}`);

    // Ensure output directory exists
    if (!fs.existsSync(payload.outputDir)) {
      fs.mkdirSync(payload.outputDir, { recursive: true });
    }

    // Check for Z.ai environment variables
    // Priority: payload._env > process.env.ZAI_* > process.env.ANTHROPIC_*
    const zaiBaseUrl = payload._env?.ZAI_BASE_URL || process.env.ZAI_BASE_URL || process.env.ANTHROPIC_BASE_URL;
    const zaiApiKey = payload._env?.ZAI_API_KEY || process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY;

    console.log(`[Z.ai Test] Using payload._env: ${!!payload._env}`);
    console.log(`[Z.ai Test] API key source: ${payload._env?.ZAI_API_KEY ? 'payload' : (process.env.ZAI_API_KEY ? 'ZAI_API_KEY' : 'ANTHROPIC_API_KEY')}`);

    if (!zaiApiKey) {
      return {
        testId: payload.testId,
        success: false,
        cliOutput: "",
        fileCreated: false,
        duration: Date.now() - startTime,
        error: "Missing ZAI_API_KEY or ANTHROPIC_API_KEY environment variable",
      };
    }

    // Build prompt for Claude Code CLI
    const prompt = payload.taskDescription || `
Create a TypeScript file at ${testFile} with the following content:
- A simple function that returns "Hello from Z.ai Agent"
- Export the function as default
- Add a comment at the top with the test ID: ${payload.testId}
- Add a timestamp comment with the current date/time

Only create this one file. Do not modify any other files.
`;

    // Build CLI arguments
    const cliArgs: string[] = [
      "@anthropic-ai/claude-code",
      "-p",
      prompt,
      "--print",
      "--dangerously-skip-permissions",
    ];

    // Build environment with Z.ai configuration
    const cliEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ANTHROPIC_API_KEY: zaiApiKey,
    };

    // Set base URL if using Z.ai custom endpoint
    if (zaiBaseUrl) {
      cliEnv.ANTHROPIC_BASE_URL = zaiBaseUrl;
      console.log(`[Z.ai Test] Using custom base URL: ${zaiBaseUrl}`);
    }

    try {
      console.log(`[Z.ai Test] Executing Claude Code CLI...`);
      console.log(`[Z.ai Test] Working directory: ${payload.outputDir}`);

      const result = await execa("npx", cliArgs, {
        cwd: payload.outputDir,
        timeout: 120000, // 2 minute timeout
        reject: false,
        env: cliEnv,
      });

      const cliOutput = result.stdout || result.stderr || "";
      const duration = Date.now() - startTime;

      console.log(`[Z.ai Test] CLI exit code: ${result.exitCode}`);
      console.log(`[Z.ai Test] CLI output length: ${cliOutput.length} chars`);

      // Check if file was created
      const fileCreated = fs.existsSync(testFile);
      let fileContent: string | undefined;

      if (fileCreated) {
        fileContent = fs.readFileSync(testFile, "utf-8");
        console.log(`[Z.ai Test] File created successfully!`);
        console.log(`[Z.ai Test] File content length: ${fileContent.length} chars`);
      } else {
        console.log(`[Z.ai Test] File NOT created`);
      }

      // Determine success - file creation is the true success criteria
      // Claude Code CLI may exit with code 1 even when successful with --print mode
      const success = fileCreated;

      return {
        testId: payload.testId,
        success,
        cliOutput: cliOutput.slice(0, 5000), // Truncate for safety
        fileCreated,
        filePath: fileCreated ? testFile : undefined,
        fileContent: fileContent?.slice(0, 2000), // Truncate for safety
        duration,
        exitCode: result.exitCode,
        error: success ? undefined : `File not created. Exit code ${result.exitCode}`,
      };
    } catch (err) {
      const execError = err as ExecaError;
      const duration = Date.now() - startTime;

      console.error(`[Z.ai Test] Execution error: ${execError.message}`);

      return {
        testId: payload.testId,
        success: false,
        cliOutput: String(execError.stderr || execError.stdout || ""),
        fileCreated: false,
        duration,
        error: `CLI execution failed: ${execError.message}`,
      };
    }
  },
});
