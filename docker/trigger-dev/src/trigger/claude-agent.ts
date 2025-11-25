import { task } from "@trigger.dev/sdk/v3";
import { execa, type ExecaError } from "execa";
import path from "path";

/**
 * Structured result from Claude Code CLI execution
 */
export interface ClaudeAgentResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  duration: number;
  timestamp: string;
  /** Task ID used for coordination (with trigger: prefix) */
  taskId?: string;
}

/**
 * Supported AI provider configurations
 */
export type AIProvider = "zai" | "kimi" | "openrouter" | "anthropic" | "gemini" | "xai";

/**
 * Provider configuration mapping
 */
const PROVIDER_CONFIG: Record<AIProvider, { baseUrl?: string; apiKeyEnv: string }> = {
  zai: { baseUrl: "https://api.z.ai/api/anthropic", apiKeyEnv: "ZAI_API_KEY" },
  kimi: { baseUrl: "https://api.moonshot.cn/v1", apiKeyEnv: "KIMI_API_KEY" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
  anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKeyEnv: "GEMINI_API_KEY" },
  xai: { baseUrl: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" },
};

/**
 * Payload configuration for Claude agent task
 */
export interface ClaudeAgentPayload {
  /** The prompt to send to Claude Code CLI */
  prompt: string;
  /** Working directory for CLI execution */
  workDir: string;
  /** Optional agent type to customize system prompt */
  agentType?: "typescript-specialist" | "docker-specialist" | "cfn-expert" | string;
  /** Timeout in milliseconds (default 5 minutes) */
  timeout?: number;
  /** Optional environment variables to pass to CLI (overrides provider config) */
  env?: Record<string, string>;
  /** Whether to skip permissions check (dangerous, defaults to true for POC) */
  skipPermissions?: boolean;
  /** AI provider to use (default: uses process.env or falls back to anthropic) */
  provider?: AIProvider;
  /** Task ID for coordination (auto-generated with trigger: prefix if not provided) */
  taskId?: string;
  /** Enable Redis coordination for container-based agents */
  enableRedisCoordination?: boolean;
}

/**
 * Parsed JSON output from Claude Code CLI
 */
interface ClaudeCodeOutput {
  success: boolean;
  output?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * Trigger.dev v4 task that spawns Claude Code CLI to execute AI agent work
 *
 * This POC demonstrates:
 * - Process spawning via execa with configurable timeout
 * - JSON output parsing from Claude Code CLI
 * - Structured error handling with exit codes
 * - Agent type customization for system prompts
 * - Environment variable support
 * - Comprehensive result tracking with duration and timestamp
 *
 * Usage example:
 * ```typescript
 * const result = await claudeAgentTask.trigger({
 *   prompt: "Implement feature X with TypeScript",
 *   workDir: "/path/to/project",
 *   agentType: "typescript-specialist",
 *   timeout: 600000, // 10 minutes
 * });
 * ```
 */
export const claudeAgentTask = task({
  id: "claude-agent",
  description: "Spawn Claude Code CLI to execute AI agent work",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: ClaudeAgentPayload): Promise<ClaudeAgentResult> => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    // Validate required payload
    if (!payload.prompt || payload.prompt.trim().length === 0) {
      return {
        success: false,
        output: "",
        error: "Prompt is required and cannot be empty",
        duration: Date.now() - startTime,
        timestamp,
      };
    }

    if (!payload.workDir || payload.workDir.trim().length === 0) {
      return {
        success: false,
        output: "",
        error: "Working directory is required and cannot be empty",
        duration: Date.now() - startTime,
        timestamp,
      };
    }

    // Resolve working directory to absolute path
    const resolvedWorkDir = path.isAbsolute(payload.workDir)
      ? payload.workDir
      : path.resolve(process.cwd(), payload.workDir);

    // Configure timeout (default 5 minutes)
    const timeout = payload.timeout ?? 300000;
    if (timeout < 1000) {
      return {
        success: false,
        output: "",
        error: "Timeout must be at least 1000ms",
        duration: Date.now() - startTime,
        timestamp,
      };
    }

    // Build CLI command arguments
    const cliArgs: string[] = [
      "@anthropic-ai/claude-code",
      "-p",
      payload.prompt,
      "--print",
    ];

    // Add skip permissions flag (defaults to true for POC)
    const skipPermissions = payload.skipPermissions !== false;
    if (skipPermissions) {
      cliArgs.push("--dangerously-skip-permissions");
    }

    // Add agent type if specified
    if (payload.agentType) {
      cliArgs.push("--agent-type", payload.agentType);
    }

    // Generate task ID with trigger: prefix for coordination
    const generateTaskId = (): string => {
      if (payload.taskId) {
        // Ensure prefix if not already present
        return payload.taskId.startsWith("trigger:") ? payload.taskId : `trigger:${payload.taskId}`;
      }
      return `trigger:${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    };

    const taskId = generateTaskId();

    // Build environment variables with provider and CFN runtime configuration
    const buildProviderEnv = (): Record<string, string> => {
      const baseEnv = { ...process.env } as Record<string, string>;

      // If provider specified, configure API key and base URL
      if (payload.provider) {
        const config = PROVIDER_CONFIG[payload.provider];
        const apiKey = process.env[config.apiKeyEnv];

        if (apiKey) {
          baseEnv.ANTHROPIC_API_KEY = apiKey;
        }

        if (config.baseUrl) {
          baseEnv.ANTHROPIC_BASE_URL = config.baseUrl;
        }
      }

      // CFN Runtime Environment Contract (docker/runtime/cfn-runtime.contract.yml)
      // These enable container-based agent coordination
      baseEnv.CFN_TASK_ID = taskId;
      baseEnv.CFN_EXECUTION_MODE = "trigger"; // Identifies Trigger.dev execution context
      baseEnv.CFN_AGENT_TYPE = payload.agentType || "claude-agent";

      // Redis coordination for container-based agents (per contract modes.trigger)
      if (payload.enableRedisCoordination) {
        // Use Docker service name when running in containers
        baseEnv.CFN_REDIS_HOST = process.env.CFN_REDIS_HOST || "redis";
        baseEnv.CFN_REDIS_PORT = process.env.CFN_REDIS_PORT || "6379";
        baseEnv.CFN_NETWORK_NAME = process.env.CFN_NETWORK_NAME || "trigger-cfn-network";
      }

      // Caller-provided env vars override everything
      return { ...baseEnv, ...(payload.env || {}) };
    };

    try {
      // Execute Claude Code CLI
      const { stdout, stderr, exitCode } = await execa("npx", cliArgs, {
        cwd: resolvedWorkDir,
        timeout,
        reject: false, // Don't throw on non-zero exit code
        env: buildProviderEnv(),
      });

      // Parse JSON output from CLI
      let parsedOutput: ClaudeCodeOutput | null = null;
      let rawOutput = stdout || "";

      try {
        // Attempt to extract and parse JSON from output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedOutput = JSON.parse(jsonMatch[0]) as ClaudeCodeOutput;
          rawOutput = JSON.stringify(parsedOutput, null, 2);
        }
      } catch {
        // If JSON parsing fails, use raw output
        rawOutput = stdout || stderr || "";
      }

      // Determine success based on exit code and parsed output
      const cliSuccess = exitCode === 0 || (parsedOutput?.success === true);

      if (!cliSuccess) {
        const errorMsg =
          parsedOutput?.error ||
          stderr ||
          `Command exited with code ${exitCode}`;

        return {
          success: false,
          output: rawOutput,
          error: errorMsg,
          exitCode,
          duration: Date.now() - startTime,
          timestamp,
          taskId,
        };
      }

      return {
        success: true,
        output: rawOutput,
        duration: Date.now() - startTime,
        timestamp,
        taskId,
      };
    } catch (err) {
      // Handle process execution errors
      const execError = err as ExecaError;
      const errorMessage =
        execError.message || "Unknown error during CLI execution";
      const errorDetails = String(execError.stderr || execError.stdout || "");

      return {
        success: false,
        output: errorDetails,
        error: `Failed to execute Claude Code CLI: ${errorMessage}`,
        exitCode: execError.exitCode || 1,
        duration: Date.now() - startTime,
        timestamp,
        taskId,
      };
    }
  },
});

/**
 * Utility function to trigger the Claude agent task
 *
 * @param payload Configuration for the agent task
 * @returns Promise resolving to the agent result
 *
 * Example:
 * ```typescript
 * const result = await runClaudeAgent({
 *   prompt: "Analyze this code",
 *   workDir: "/workspace",
 *   agentType: "typescript-specialist",
 *   timeout: 120000,
 * });
 *
 * if (result.success) {
 *   console.log("Agent output:", result.output);
 * } else {
 *   console.error("Agent error:", result.error);
 * }
 * ```
 */
export async function runClaudeAgent(
  payload: ClaudeAgentPayload
): Promise<ClaudeAgentResult> {
  const result = await claudeAgentTask.triggerAndWait(payload);

  if (result.ok) {
    return result.output;
  }

  // Handle failed task run
  return {
    success: false,
    output: "",
    error: String(result.error),
    duration: 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to check if an agent result contains a JSON-parseable output
 *
 * @param result The agent result to check
 * @returns Parsed JSON object or null if not parseable
 */
export function parseAgentOutput<T = Record<string, unknown>>(
  result: ClaudeAgentResult
): T | null {
  if (!result.success || !result.output) {
    return null;
  }

  try {
    return JSON.parse(result.output) as T;
  } catch {
    return null;
  }
}

/**
 * Helper to format agent result for logging
 *
 * @param result The agent result to format
 * @returns Formatted string representation
 */
export function formatAgentResult(result: ClaudeAgentResult): string {
  const status = result.success ? "SUCCESS" : "FAILED";
  const lines = [
    `[${result.timestamp}] Claude Agent Result - ${status}`,
    `Duration: ${result.duration}ms`,
    `Exit Code: ${result.exitCode ?? "N/A"}`,
  ];

  if (result.output) {
    lines.push(`Output:\n${result.output}`);
  }

  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  return lines.join("\n");
}
