/**
 * CFN MDAP Implementer Task
 *
 * MDAP-specific implementer using Cerebras API directly for rapid code generation.
 * This is the intended MDAP design: fast models (~500ms-3s) for atomic micro-tasks.
 *
 * Key differences from cfn-implementer-v2:
 * - Uses Cerebras API directly (NOT Claude Code CLI)
 * - Targets ~500ms-3s per micro-task (vs 60+ seconds with CLI)
 * - Returns generated code for external file writing and test execution
 * - Supports 3-tier model escalation per MDAP design
 *
 * TDD Flow:
 * 1. Coordinator decomposes task into atomic micro-tasks
 * 2. This implementer generates code for each micro-task
 * 3. Coordinator writes code to files
 * 4. Coordinator runs tests (gate check)
 * 5. If tests fail, escalate tier and retry
 * 6. If tests pass, proceed to validation
 *
 * @module cfn-mdap-implementer
 * @version 1.0.0
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

// Security: Sanitize error messages to prevent API key leakage
function sanitizeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Mask patterns that look like API keys
  return message
    .replace(/tr_(dev|prod|stg|preview)_[a-zA-Z0-9]+/g, 'tr_$1_[REDACTED]')
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'api_key=[REDACTED]')
    .replace(/token[:\s=]+['"]?[a-zA-Z0-9_-]+['"]?/gi, 'token=[REDACTED]');
}

import {
  selectModelTier,
  estimateCost,
  getTierSummary,
  type ModelTier,
} from "../lib/mdap-config.js";

// =============================================
// Types
// =============================================

export interface MDAPImplementerPayload {
  /** CFN Loop task ID */
  taskId: string;
  /** Micro-task identifier */
  microTaskId: string;
  /** Description of the implementation task */
  taskDescription: string;
  /** Working directory context */
  workDir: string;
  /** Target file to create/modify */
  targetFile: string;
  /** Context hints from decomposition */
  contextHints?: string[];
  /** Pre-read file contents for context */
  fileContents?: Array<{ path: string; content: string }>;
  /** Model tier override (1-3) */
  modelTier?: number;
  /** Previous failure count (for escalation) */
  failureCount?: number;
  /** Programming language hint */
  language?: string;
}

export interface MDAPImplementerResult {
  /** Task ID for tracking */
  taskId: string;
  /** Micro-task ID for tracking */
  microTaskId: string;
  /** Whether generation succeeded */
  success: boolean;
  /** Generated code content */
  generatedCode: string;
  /** Target file path */
  targetFile: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Model tier used (1-3) */
  modelTier: number;
  /** Model tier name */
  tierName: string;
  /** Model name used */
  modelName: string;
  /** Estimated cost */
  estimatedCost: number;
  /** Token usage */
  tokens?: {
    input: number;
    output: number;
  };
  /** Error message if failed */
  error?: string;
}

// =============================================
// Model Configuration
// =============================================

/**
 * Model mapping for MDAP tiers
 *
 * T1 (haiku): Fast, cheap - for atomic tasks
 * T2 (sonnet): Balanced - for moderate complexity
 * T3 (opus): Best quality - for complex/retry scenarios
 */
const CEREBRAS_MODELS: Record<number, string> = {
  1: "llama-4-scout-17b-16e-instruct",  // T1 - Fast (~500ms)
  2: "llama-4-scout-17b-16e-instruct",  // T2 - Same model, enhanced prompting
  3: "qwen-3-235b-a22b-instruct-2507",  // T3 - Best for reasoning
};

// =============================================
// Helper Functions
// =============================================

/**
 * Build implementation prompt for Cerebras API
 */
function buildImplementationPrompt(payload: MDAPImplementerPayload, tier: ModelTier): string {
  const sections: string[] = [];

  // Role and task
  sections.push(`You are an expert ${payload.language || 'TypeScript'} developer.`);
  sections.push(`Generate code for this atomic micro-task.`);
  sections.push('');

  // Task description
  sections.push(`## Task`);
  sections.push(payload.taskDescription);
  sections.push('');

  // Target file
  sections.push(`## Target File`);
  sections.push(`\`${payload.targetFile}\``);
  sections.push('');

  // Context hints
  if (payload.contextHints && payload.contextHints.length > 0) {
    sections.push(`## Context Hints`);
    payload.contextHints.forEach(hint => sections.push(`- ${hint}`));
    sections.push('');
  }

  // Pre-read file contents
  if (payload.fileContents && payload.fileContents.length > 0) {
    sections.push(`## Existing Code Context`);
    for (const { path, content } of payload.fileContents) {
      sections.push(`### ${path}`);
      sections.push('```');
      sections.push(content.slice(0, 2000)); // Limit context size
      sections.push('```');
      sections.push('');
    }
  }

  // Output format
  sections.push(`## Output Format`);
  sections.push(`Return ONLY valid JSON with this structure:`);
  sections.push('```json');
  sections.push(JSON.stringify({
    code: "// Your generated code here",
    explanation: "Brief explanation of what the code does"
  }, null, 2));
  sections.push('```');
  sections.push('');

  // Quality hints based on tier
  if (tier.tier >= 2) {
    sections.push(`## Quality Requirements`);
    sections.push(`- Add proper TypeScript types`);
    sections.push(`- Include error handling`);
    sections.push(`- Follow best practices`);
    if (tier.tier >= 3) {
      sections.push(`- Consider edge cases`);
      sections.push(`- Optimize for performance`);
      sections.push(`- Add comprehensive comments`);
    }
    sections.push('');
  }

  sections.push(`IMPORTANT: Return ONLY the JSON object, no additional text.`);

  return sections.join('\n');
}

/**
 * Call Cerebras API for code generation
 */
async function callCerebrasAPI(
  prompt: string,
  modelName: string,
  tier: ModelTier
): Promise<{
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}> {
  const startTime = Date.now();

  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY environment variable not set");
  }

  const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: tier.tier >= 3 ? 4096 : 2048,
      temperature: tier.tier >= 3 ? 0.3 : 0.5, // Lower temp for higher tiers
    }),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Cerebras API error: ${response.status} - ${errorBody}\n` +
      `Check API key validity and quota limits.`
    );
  }

  const data = await response.json();

  // Validate response structure
  if (!data.choices || data.choices.length === 0) {
    throw new Error("Cerebras API returned no choices");
  }

  return {
    content: data.choices[0].message.content,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    durationMs,
  };
}

/**
 * Parse generated code from Cerebras response
 */
function parseGeneratedCode(content: string, contextName: string): { code: string; explanation?: string } {
  try {
    const parsed = parseJSONFromResponse<{ code: string; explanation?: string }>(content, contextName);

    if (!parsed.code || typeof parsed.code !== 'string') {
      throw new Error("Response missing 'code' field");
    }

    return parsed;
  } catch (error) {
    // Fallback: try to extract code directly if JSON parsing fails
    // Sometimes models return raw code without JSON wrapper
    const codeMatch = content.match(/```(?:typescript|javascript|ts|js)?\s*\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      return { code: codeMatch[1].trim(), explanation: "Extracted from code block" };
    }

    // Last resort: return content as-is if it looks like code
    if (content.includes('function') || content.includes('const') || content.includes('export')) {
      return { code: content.trim(), explanation: "Raw code response" };
    }

    throw new Error(`Failed to parse generated code: ${(error as Error).message}`);
  }
}

// =============================================
// Task Definition
// =============================================

export const cfnMDAPImplementerTask = task({
  id: "cfn-mdap-implementer",
  retry: { maxAttempts: 1 }, // Retries handled by coordinator with tier escalation

  run: async (payload: MDAPImplementerPayload): Promise<MDAPImplementerResult> => {
    const startTime = Date.now();

    console.log(`[mdap-implementer] Starting: ${payload.microTaskId}`);
    console.log(`[mdap-implementer] Task: ${payload.taskDescription.substring(0, 80)}...`);
    console.log(`[mdap-implementer] Target: ${payload.targetFile}`);

    // Select model tier based on failure history
    const modelTier = selectModelTier(
      'simple', // MDAP tasks are always atomic/simple
      payload.modelTier || 1,
      payload.failureCount || 0
    );

    const modelName = CEREBRAS_MODELS[modelTier.tier] || CEREBRAS_MODELS[1];
    console.log(`[mdap-implementer] Using ${getTierSummary(modelTier)} -> ${modelName}`);

    try {
      // Build prompt
      const prompt = buildImplementationPrompt(payload, modelTier);
      console.log(`[mdap-implementer] Prompt length: ${prompt.length} chars`);

      // Call Cerebras API
      const apiResult = await callCerebrasAPI(prompt, modelName, modelTier);
      console.log(`[mdap-implementer] API call: ${apiResult.durationMs}ms, ${apiResult.inputTokens}+${apiResult.outputTokens} tokens`);

      // Parse generated code
      const { code, explanation } = parseGeneratedCode(apiResult.content, "mdap-implementer");
      console.log(`[mdap-implementer] Generated ${code.length} chars of code`);
      if (explanation) {
        console.log(`[mdap-implementer] Explanation: ${explanation}`);
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = estimateCost(modelTier, apiResult.inputTokens, apiResult.outputTokens);

      console.log(`[mdap-implementer] ✓ Success: ${durationMs}ms, cost ~$${estimatedCost.toFixed(6)}`);

      return {
        taskId: payload.taskId,
        microTaskId: payload.microTaskId,
        success: true,
        generatedCode: code,
        targetFile: payload.targetFile,
        durationMs,
        modelTier: modelTier.tier,
        tierName: modelTier.name,
        modelName,
        estimatedCost,
        tokens: {
          input: apiResult.inputTokens,
          output: apiResult.outputTokens,
        },
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = sanitizeErrorMessage(error);

      console.error(`[mdap-implementer] ✗ Failed: ${errorMsg}`);
      console.error(`[mdap-implementer] Duration: ${durationMs}ms`);

      return {
        taskId: payload.taskId,
        microTaskId: payload.microTaskId,
        success: false,
        generatedCode: "",
        targetFile: payload.targetFile,
        durationMs,
        modelTier: modelTier.tier,
        tierName: modelTier.name,
        modelName,
        estimatedCost: estimateCost(modelTier, 0, 0),
        error: errorMsg,
      };
    }
  },
});
