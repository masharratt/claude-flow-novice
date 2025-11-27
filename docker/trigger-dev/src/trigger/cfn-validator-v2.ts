/**
 * CFN Validator v2 Task - Phase 3 Implementation
 *
 * Code review validator that:
 * - Uses executeClaudeCli() for code review
 * - Parses review output as JSON (score, issues, suggestions)
 * - Signals completion via Redis using redis.signalCompletion()
 * - Updates agent status in database via cfn-db
 * - Returns confidence score and review output
 * - MDAP integration for model tier selection and metrics tracking
 *
 * Part of the CFN Loop orchestration system.
 */
import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db.js";
import * as redis from "../lib/cfn-redis.js";
import { executeClaudeCli } from "../lib/cli-executor.js";
import {
  selectModelTier,
  getModelForProvider,
  estimateCost,
  getTierSummary,
  type ModelTier,
} from "../lib/mdap-config.js";
import { recordMDAPExecution } from "../lib/mdap-db.js";

// =============================================
// Types
// =============================================

export interface ValidatorV2Payload {
  /** Unique task identifier for coordination */
  taskId: string;
  /** Unique agent identifier */
  agentId: string;
  /** Current iteration number */
  iterationId: number;
  /** Working directory to review */
  workDir: string;
  /** AI provider to use (zai, kimi, anthropic, etc.) */
  provider?: string;
  /** Enable MDAP tier selection and metrics (default: true) */
  enableMDAP?: boolean;
  /** Override model tier (1-5) - only used if enableMDAP is true */
  modelTier?: number;
  /** Task complexity level for MDAP (should always be 'simple' for atomic reviews) */
  complexityLevel?: 'simple' | 'moderate' | 'complex' | 'large';
}

export interface ReviewOutput {
  /** Quality score from 0.0 to 1.0 */
  score: number;
  /** List of issues found */
  issues: string[];
  /** List of improvement suggestions */
  suggestions: string[];
  /** Brief overall assessment */
  summary: string;
}

export interface ValidatorV2Result {
  /** Whether validation completed successfully */
  success: boolean;
  /** Confidence/quality score (0.0 - 1.0) */
  confidence: number;
  /** Parsed review output */
  output: ReviewOutput | Record<string, unknown>;
  /** Duration in milliseconds */
  durationMs: number;
  /** MDAP metrics */
  mdap?: {
    /** Model tier used (1-5) */
    modelTier: number;
    /** Model tier name */
    tierName: string;
    /** Model name used */
    modelName: string;
    /** Estimated cost */
    estimatedCost: number;
  };
}

// =============================================
// Constants
// =============================================

const REVIEW_TIMEOUT_MS = 300000; // 5 minutes for review
const DEFAULT_CONFIDENCE = 0.5;
const SUCCESS_DEFAULT_CONFIDENCE = 0.7;
const FAILURE_DEFAULT_CONFIDENCE = 0.3;

// =============================================
// Review Prompt
// =============================================

const REVIEW_PROMPT = `
You are a code reviewer. Review the code in this directory and provide:

1. A quality score from 0.0 to 1.0 based on:
   - Code correctness
   - Type safety
   - Test coverage
   - Error handling
   - Documentation

2. A list of issues found (if any)

3. Suggestions for improvement

Format your response as JSON:
{
  "score": 0.85,
  "issues": ["issue1", "issue2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "summary": "Brief overall assessment"
}

Do not make changes - only review and report.
`;

// =============================================
// Helper Functions
// =============================================

/**
 * Build CLI environment based on provider
 */
function buildCliEnv(provider?: string): Record<string, string> {
  const cliEnv: Record<string, string> = {};

  if (provider === "zai") {
    cliEnv.ANTHROPIC_API_KEY = process.env.ZAI_API_KEY || "";
    cliEnv.ANTHROPIC_BASE_URL =
      process.env.ZAI_BASE_URL || "https://api.z.ai/api/anthropic";
  } else if (provider === "kimi") {
    cliEnv.ANTHROPIC_API_KEY = process.env.KIMI_API_KEY || "";
    cliEnv.ANTHROPIC_BASE_URL =
      process.env.KIMI_BASE_URL || "https://api.moonshot.cn/v1";
  } else if (provider === "openrouter") {
    cliEnv.ANTHROPIC_API_KEY = process.env.OPENROUTER_API_KEY || "";
    cliEnv.ANTHROPIC_BASE_URL =
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  } else if (provider === "gemini") {
    cliEnv.ANTHROPIC_API_KEY = process.env.GEMINI_API_KEY || "";
    cliEnv.ANTHROPIC_BASE_URL =
      process.env.GEMINI_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta";
  } else if (provider === "xai") {
    cliEnv.ANTHROPIC_API_KEY = process.env.XAI_API_KEY || "";
    cliEnv.ANTHROPIC_BASE_URL =
      process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  } else {
    // Default to direct Anthropic
    cliEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
  }

  return cliEnv;
}

/**
 * Parse review output from CLI response
 * Extracts JSON from the response and validates score
 */
function parseReviewOutput(
  stdout: string,
  success: boolean
): { confidence: number; output: ReviewOutput | Record<string, unknown> } {
  try {
    // Try to extract JSON from output
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ReviewOutput;

      // Validate and clamp score to 0.0-1.0 range
      let score = parsed.score;
      if (typeof score !== "number" || isNaN(score)) {
        score = DEFAULT_CONFIDENCE;
      } else {
        score = Math.max(0, Math.min(1, score));
      }

      return {
        confidence: score,
        output: {
          score,
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          suggestions: Array.isArray(parsed.suggestions)
            ? parsed.suggestions
            : [],
          summary:
            typeof parsed.summary === "string"
              ? parsed.summary
              : "Review completed",
        },
      };
    }
  } catch {
    // JSON parsing failed, fall through to default
  }

  // If parsing fails, use default confidence based on CLI success
  return {
    confidence: success ? SUCCESS_DEFAULT_CONFIDENCE : FAILURE_DEFAULT_CONFIDENCE,
    output: {
      score: success ? SUCCESS_DEFAULT_CONFIDENCE : FAILURE_DEFAULT_CONFIDENCE,
      issues: [],
      suggestions: [],
      summary: success
        ? "Review completed but output parsing failed"
        : "Review failed",
    },
  };
}

// =============================================
// Task Definition
// =============================================

export const cfnValidatorV2Task = task({
  id: "cfn-validator-v2",
  retry: { maxAttempts: 1 }, // No retries for validators - fail fast

  run: async (payload: ValidatorV2Payload): Promise<ValidatorV2Result> => {
    const startTime = Date.now();
    const enableMDAP = payload.enableMDAP !== false; // Default: true
    const provider = payload.provider || 'zai';

    // MDAP: Select model tier
    // CRITICAL: For MDAP (micro-tasks), validators review atomic work, so complexity is 'simple'
    // Validators don't escalate on failure (no retry), so failureCount is always 0
    let modelTier: ModelTier;
    let modelName: string;

    if (enableMDAP) {
      // MDAP mode: Force 'simple' complexity (atomic micro-task reviews)
      modelTier = selectModelTier(
        'simple',  // Always atomic for MDAP
        payload.modelTier || 1,  // Start T1 for simple reviews
        0 // Validators don't retry
      );
      modelName = getModelForProvider(modelTier, provider);
      console.log(`[validator-v2] MDAP enabled: ${getTierSummary(modelTier)} -> ${modelName}`);
    } else {
      // Non-MDAP mode: Use tier 2 (better quality) for moderate complexity reviews
      modelTier = selectModelTier(
        payload.complexityLevel || 'moderate',
        payload.modelTier || 2,
        0
      );
      modelName = getModelForProvider(modelTier, provider);
      console.log(`[validator-v2] MDAP disabled: Using ${getTierSummary(modelTier)} -> ${modelName}`);
    }

    console.log(`[validator-v2] Starting validation`);
    console.log(`[validator-v2] Task ID: ${payload.taskId}`);
    console.log(`[validator-v2] Agent ID: ${payload.agentId}`);
    console.log(`[validator-v2] Provider: ${provider}`);

    await db.logger.info("validator-v2", "Starting validation", {
      taskId: payload.taskId,
      agentId: payload.agentId,
      data: {
        iterationId: payload.iterationId,
        workDir: payload.workDir,
        mdap: {
          tier: modelTier.tier,
          tierName: modelTier.name,
          modelName,
        },
      },
    });

    // Set agent status to running in Redis
    await redis.setAgentStatus(payload.agentId, "running");

    try {
      // Build CLI environment based on provider
      const cliEnv = buildCliEnv(payload.provider);

      // Execute Claude CLI in review mode (--print = no modifications)
      const result = await executeClaudeCli(
        ["--print", "--output-format", "json", "-p", REVIEW_PROMPT],
        {
          cwd: payload.workDir,
          timeout: REVIEW_TIMEOUT_MS,
          env: cliEnv,
        }
      );

      const durationMs = Date.now() - startTime;

      // Parse review output
      const { confidence, output } = parseReviewOutput(
        result.stdout,
        result.success
      );

      // Signal completion to Redis
      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: "completed",
        success: true,
        confidence,
        durationMs,
        completedAt: Date.now(),
      });

      // Update agent status in database
      await db.updateAgentStatus(payload.agentId, "completed", {
        success: true,
        confidence,
        durationMs,
        output,
      });

      await db.logger.info("validator-v2", "Validation complete", {
        taskId: payload.taskId,
        agentId: payload.agentId,
        data: { confidence, durationMs },
      });

      // Record MDAP execution metrics (only if MDAP is enabled)
      if (enableMDAP) {
        const mdapCost = estimateCost(modelTier, 0, 0);
        try {
          await recordMDAPExecution({
            taskId: payload.taskId,
            agentId: payload.agentId,
            modelTier: modelTier.tier,
            modelName,
            provider,
            success: true,
            confidence,
            latencyMs: durationMs,
            estimatedCost: mdapCost,
            complexityLevel: 'simple', // Always simple for MDAP micro-task reviews
            wasEscalated: false,
          });
          console.log(`[validator-v2] MDAP execution recorded: tier=${modelTier.tier} cost=${mdapCost.toFixed(4)}`);
        } catch (mdapError) {
          console.warn(`[validator-v2] MDAP recording failed: ${(mdapError as Error).message}`);
        }
      } else {
        console.log(`[validator-v2] MDAP metrics disabled, skipping recordMDAPExecution`);
      }

      return {
        success: true,
        confidence,
        output,
        durationMs,
        mdap: {
          modelTier: modelTier.tier,
          tierName: modelTier.name,
          modelName,
          estimatedCost: mdapCost,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await db.logger.error(
        "validator-v2",
        "Validation failed",
        error instanceof Error ? error : new Error(errorMessage),
        {
          taskId: payload.taskId,
          agentId: payload.agentId,
        }
      );

      // Signal failure to Redis
      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: "failed",
        success: false,
        confidence: 0,
        errorMessage,
        durationMs,
        completedAt: Date.now(),
      });

      // Update agent status in database
      await db.updateAgentStatus(payload.agentId, "failed", {
        success: false,
        confidence: 0,
        durationMs,
        errorMessage,
      });

      // Record MDAP failure metrics (only if MDAP is enabled)
      if (enableMDAP) {
        const mdapCost = estimateCost(modelTier, 0, 0);
        try {
          await recordMDAPExecution({
            taskId: payload.taskId,
            agentId: payload.agentId,
            modelTier: modelTier.tier,
            modelName,
            provider,
            success: false,
            confidence: 0,
            latencyMs: durationMs,
            estimatedCost: mdapCost,
            complexityLevel: 'simple', // Always simple for MDAP micro-task reviews
            wasEscalated: false,
          });
          console.log(`[validator-v2] MDAP failure recorded: tier=${modelTier.tier}`);
        } catch (mdapError) {
          console.warn(`[validator-v2] MDAP failure recording failed: ${(mdapError as Error).message}`);
        }
      }

      throw error;
    }
  },
});

/**
 * Legacy default export for backwards compatibility
 */
export default async function (
  payload: ValidatorV2Payload
): Promise<ValidatorV2Result> {
  // This is just a type wrapper - actual execution goes through Trigger.dev
  throw new Error(
    "Direct invocation not supported. Use tasks.trigger() instead."
  );
}
