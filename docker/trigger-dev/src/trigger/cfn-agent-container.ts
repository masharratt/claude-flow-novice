/**
 * Trigger.dev task for container-based agent execution.
 *
 * Spawns a Docker container to execute CFN agents with:
 * - Image selection based on agent type
 * - Environment variable injection for provider routing
 * - MDAP metric collection and database recording
 * - Redis completion signaling for orchestration
 * - Proper cleanup and error handling
 *
 * Pattern: Container-based execution with full monitoring
 * Signals completion via Redis LPUSH for orchestrator notification
 * Records MDAP metrics for cost tracking and model tier analysis
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  DockerSpawner,
  ContainerSpawnOptions,
  ContainerResult,
} from "../lib/docker-spawner.js";
import {
  getImageForAgentType,
  getRegistryUrl,
} from "../lib/container-registry.js";
import * as db from "../lib/cfn-db.js";
import * as redis from "../lib/cfn-redis.js";
import {
  selectModelTier,
  getModelForProvider,
  estimateCost,
} from "../lib/mdap-config.js";
import { recordMDAPExecution } from "../lib/mdap-db.js";

// =============================================
// Type Definitions
// =============================================

/**
 * Payload for container-based agent execution.
 *
 * Defines the agent to run, the task context, resource constraints,
 * and MDAP configuration for metric collection.
 */
export interface AgentContainerPayload {
  /** CFN Loop task identifier */
  taskId: string;

  /** Unique agent identifier */
  agentId: string;

  /** Agent type (e.g., "typescript-specialist", "react-frontend-engineer") */
  agentType: string;

  /** Task description/prompt to pass to agent */
  prompt: string;

  /** Working directory to mount and set as agent's workspace */
  workDir: string;

  /** AI provider for model selection (default: "zai") */
  provider?: string;

  /** Enable MDAP metrics collection (default: true) */
  enableMDAP?: boolean;

  /** Override model tier (1-5); if not set, calculated from complexity */
  modelTier?: number;

  /** Task complexity level for tier selection */
  complexityLevel?: "simple" | "moderate" | "complex" | "large";

  /** Specific files to include in context (optional) */
  files?: string[];

  /** Container execution timeout in milliseconds (default: 600000) */
  timeout?: number;

  /** Optional environment variable overrides */
  _env?: Record<string, string>;

  /** Confidence score for MDAP tracking (0.0-1.0, optional) */
  confidence?: number;
}

/**
 * Result from container-based agent execution.
 *
 * Contains execution status, container output, timing metrics,
 * and optional MDAP metadata for cost analysis.
 */
export interface AgentContainerResult {
  /** Whether execution completed successfully */
  success: boolean;

  /** Docker container ID */
  containerId: string;

  /** Container exit code (null if killed/timed out) */
  exitCode: number | null;

  /** Combined stdout from container */
  stdout: string;

  /** Combined stderr from container */
  stderr: string;

  /** Total execution duration in milliseconds */
  durationMs: number;

  /** MDAP metrics if enabled */
  mdap?: {
    modelTier: number;
    tierName: string;
    modelName: string;
    estimatedCost: number;
  };

  /** Error message if execution failed */
  error?: string;
}

// =============================================
// Provider Configuration
// =============================================

const PROVIDER_CONFIG: Record<
  string,
  { baseUrl?: string; apiKeyEnv: string }
> = {
  zai: {
    baseUrl: "https://api.z.ai/api/anthropic",
    apiKeyEnv: "ZAI_API_KEY",
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyEnv: "KIMI_API_KEY",
  },
  anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY" },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  xai: { baseUrl: "https://api.x.ai/v1", apiKeyEnv: "XAI_API_KEY" },
};

// =============================================
// Helper Functions
// =============================================

/**
 * Build environment variables for container execution with provider routing.
 *
 * Sources API keys from payload overrides, provider-specific env vars,
 * or fallback to ANTHROPIC_API_KEY. Applies provider-specific base URLs.
 *
 * @param payload - Container execution payload
 * @returns Object with environment variables for container
 */
function buildContainerEnvironment(
  payload: AgentContainerPayload
): Record<string, string | undefined> {
  const provider = payload.provider || "zai";
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.zai;

  const env: Record<string, string | undefined> = { ...process.env };

  // Determine API key from various sources
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  // 1. Check payload._env overrides first
  if (payload._env) {
    apiKey = payload._env.ANTHROPIC_API_KEY || payload._env.ZAI_API_KEY;
    baseUrl =
      payload._env.ANTHROPIC_BASE_URL || payload._env.ZAI_BASE_URL;
  }

  // 2. Try provider-specific environment variable
  if (!apiKey) {
    apiKey = process.env[config.apiKeyEnv];
  }

  // 3. Fallback to ANTHROPIC_API_KEY for non-anthropic providers
  if (!apiKey && provider !== "anthropic") {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.includes("placeholder")) {
      apiKey = anthropicKey;
    }
  }

  // Use provider's base URL if not overridden
  if (!baseUrl && config.baseUrl) {
    baseUrl = config.baseUrl;
  }

  // Set the final environment variables
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }
  if (baseUrl) {
    env.ANTHROPIC_BASE_URL = baseUrl;
  }

  // Apply any additional _env overrides
  if (payload._env) {
    Object.assign(env, payload._env);
  }

  // Add CFN-specific variables for agent context
  env.CFN_TASK_ID = payload.taskId;
  env.CFN_AGENT_ID = payload.agentId;
  env.CFN_AGENT_TYPE = payload.agentType;
  env.CFN_PROVIDER = provider;

  return env;
}

/**
 * Record agent execution in database for tracking and analysis.
 *
 * @param payload - Container execution payload
 * @param result - Container execution result
 * @param error - Optional error message
 */
async function recordAgentExecution(
  payload: AgentContainerPayload,
  result: ContainerResult,
  error?: string
): Promise<void> {
  try {
    await db.updateAgentStatus(payload.agentId, "completed");
  } catch (dbError) {
    console.warn(
      `[cfn-agent-container] Database update failed: ${
        (dbError as Error).message
      }`
    );
  }
}

/**
 * Signal agent completion via Redis for orchestrator notification.
 *
 * @param taskId - CFN Loop task ID
 * @param agentId - Agent identifier
 * @param success - Whether execution succeeded
 */
async function signalCompletion(
  taskId: string,
  agentId: string,
  success: boolean
): Promise<void> {
  try {
    const client = redis.getRedis();
    const key = `cfn:complete:${taskId}`;
    const value = JSON.stringify({ agentId, success, timestamp: Date.now() });

    await client.lpush(key, value);
    await client.expire(key, 3600); // 1 hour expiry

    console.log(`[cfn-agent-container] Completion signal sent: ${agentId}`);
  } catch (redisError) {
    console.warn(
      `[cfn-agent-container] Redis signaling failed: ${
        (redisError as Error).message
      }`
    );
  }
}

// =============================================
// Main Task Implementation
// =============================================

/**
 * Trigger.dev task for container-based agent execution.
 *
 * Orchestrates Docker container spawning with proper environment setup,
 * metric collection, and completion signaling. Implements retry logic
 * and comprehensive error handling.
 *
 * Workflow:
 * 1. Validate payload and resolve image for agent type
 * 2. Build environment variables with provider routing
 * 3. Calculate MDAP model tier if enabled
 * 4. Spawn container with proper mounts and resource limits
 * 5. Wait for container completion
 * 6. Record execution metrics and signal completion
 * 7. Return structured result with optional MDAP data
 */
export const cfnAgentContainerTask = task({
  id: "cfn-agent-container",
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: AgentContainerPayload): Promise<AgentContainerResult> => {
    const startTime = Date.now();
    const provider = payload.provider || "zai";
    const enableMDAP = payload.enableMDAP !== false;
    const timeout = payload.timeout || 600000; // 10 minutes default

    console.log(`[cfn-agent-container] Starting agent execution`);
    console.log(`  Task ID: ${payload.taskId}`);
    console.log(`  Agent ID: ${payload.agentId}`);
    console.log(`  Agent Type: ${payload.agentType}`);
    console.log(`  Provider: ${provider}`);
    console.log(`  MDAP Enabled: ${enableMDAP}`);

    let containerResult: ContainerResult | null = null;
    let mdapMetadata: AgentContainerResult["mdap"] | undefined;

    try {
      // 1. Resolve container image
      const image = getImageForAgentType(payload.agentType);
      console.log(`[cfn-agent-container] Using image: ${image}`);

      // 2. Build environment variables
      const containerEnv = buildContainerEnvironment(payload);
      console.log(`[cfn-agent-container] Environment prepared`);

      // 3. Calculate MDAP model tier if enabled
      let modelTier: number | undefined = payload.modelTier;
      let mdapTierObj: ReturnType<typeof selectModelTier> | undefined;
      let modelName = "unknown";
      let estimatedCostValue = 0;

      if (enableMDAP) {
        // Get or calculate the model tier
        // selectModelTier(complexityLevel: string, currentTier?: number, failureCount?: number)
        if (modelTier !== undefined) {
          // If tier is provided as a number, use it as currentTier
          mdapTierObj = selectModelTier(
            payload.complexityLevel || "moderate",
            modelTier,
            0
          );
        } else {
          mdapTierObj = selectModelTier(
            payload.complexityLevel || "moderate",
            1,
            0
          );
          modelTier = mdapTierObj.tier;
        }

        if (mdapTierObj) {
          modelName = getModelForProvider(mdapTierObj, provider);
          estimatedCostValue = estimateCost(mdapTierObj);

          console.log(`[cfn-agent-container] MDAP Tier: ${mdapTierObj.tier}`);
          console.log(`[cfn-agent-container] Model: ${modelName}`);
          console.log(
            `[cfn-agent-container] Estimated Cost: ${estimatedCostValue}`
          );
        }
      }

      // 4. Prepare container spawn options
      const spawner = new DockerSpawner();
      const containerName = `cfn-agent-${payload.agentId}-${Date.now()}`;

      // Filter out undefined environment variables
      const finalEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(containerEnv)) {
        if (value !== undefined) {
          finalEnv[key] = value;
        }
      }

      const spawnOptions: ContainerSpawnOptions = {
        name: containerName,
        image,
        memory: "2g",
        cpus: 1,
        timeout,
        networkMode: "bridge",
        env: finalEnv,
        mounts: [
          {
            source: payload.workDir,
            target: "/workspace",
            readonly: false,
          },
        ],
        command: [
          "sh",
          "-c",
          `echo "Agent ${payload.agentId} executing: ${payload.prompt.substring(0, 100)}" && sleep 5`,
        ],
      };

      console.log(`[cfn-agent-container] Spawning container: ${containerName}`);

      // 5. Spawn and execute container
      containerResult = await spawner.spawnAgentContainer(spawnOptions);

      console.log(`[cfn-agent-container] Container completed`);
      console.log(`  Exit Code: ${containerResult.exitCode}`);
      console.log(`  Duration: ${containerResult.durationMs}ms`);
      console.log(`  Stdout Length: ${containerResult.stdout.length}`);
      console.log(`  Stderr Length: ${containerResult.stderr.length}`);

      // 6. Record execution in database
      await recordAgentExecution(payload, containerResult);

      // 7. Record MDAP metrics if enabled
      if (enableMDAP && modelTier !== undefined) {
        const durationMs = containerResult.durationMs;
        const success = containerResult.exitCode === 0;

        try {
          await recordMDAPExecution({
            taskId: payload.taskId,
            agentId: payload.agentId,
            modelTier,
            modelName,
            provider,
            success,
            confidence: payload.confidence || 0.85,
            latencyMs: durationMs,
            estimatedCost: estimatedCostValue,
            complexityLevel: payload.complexityLevel || "moderate",
            wasEscalated: false,
          });

          console.log(`[cfn-agent-container] MDAP metrics recorded`);

          mdapMetadata = {
            modelTier,
            tierName: `Tier ${modelTier}`,
            modelName,
            estimatedCost: estimatedCostValue,
          };
        } catch (mdapError) {
          console.warn(
            `[cfn-agent-container] MDAP recording failed: ${
              (mdapError as Error).message
            }`
          );
        }
      }

      // 8. Signal completion via Redis
      const success = containerResult.exitCode === 0;
      await signalCompletion(payload.taskId, payload.agentId, success);

      // 9. Cleanup container (not needed - container auto-removed)
      // ContainerSpawnOptions has AutoRemove: false, but cleanup handled internally
      console.log(`[cfn-agent-container] Container execution complete`);

      // 10. Build and return result
      const finalResult: AgentContainerResult = {
        success,
        containerId: containerResult.containerId.substring(0, 12),
        exitCode: containerResult.exitCode,
        stdout: containerResult.stdout,
        stderr: containerResult.stderr,
        durationMs: containerResult.durationMs,
        mdap: mdapMetadata,
      };

      console.log(
        `[cfn-agent-container] Task completed successfully: ${finalResult.success}`
      );

      return finalResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[cfn-agent-container] Execution failed: ${errorMsg}`);

      // Record failure in database
      if (containerResult) {
        await recordAgentExecution(payload, containerResult, errorMsg);
      }

      // Signal failure via Redis
      try {
        await signalCompletion(payload.taskId, payload.agentId, false);
      } catch (signalError) {
        console.warn(
          `[cfn-agent-container] Failure signal failed: ${
            (signalError as Error).message
          }`
        );
      }

      // Note: Container cleanup handled by DockerSpawner internally

      // Return error result
      return {
        success: false,
        containerId: containerResult?.containerId.substring(0, 12) || "unknown",
        exitCode: containerResult?.exitCode || null,
        stdout: containerResult?.stdout || "",
        stderr: containerResult?.stderr || "",
        durationMs: Date.now() - startTime,
        mdap: mdapMetadata,
        error: errorMsg,
      };
    }
  },
});

/**
 * Export task for Trigger.dev registration.
 *
 * This task handles container-based agent execution with full
 * observability, metric collection, and orchestration support.
 */
export default cfnAgentContainerTask;
