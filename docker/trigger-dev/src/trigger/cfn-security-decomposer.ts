/**
 * CFN Security Decomposer Task
 *
 * Analyzes tasks for security implications and decomposes into security-focused micro-tasks.
 * Receives architecture context from the baseline decomposer to inform security analysis.
 *
 * API Priority Chain:
 * 1. Cerebras (PRIMARY) - Fast inference with qwen-3-235b for security reasoning
 * 2. Groq (FALLBACK) - Used when Cerebras fails (429 rate limit, API errors)
 *
 * Note: Groq free tier is unreliable with aggressive rate limiting.
 * Use as fallback only, not primary.
 *
 * JSON Parsing Robustness:
 * - Handles trailing commas, comments, unquoted property names
 * - Falls back to extracting just microTasks array if full parse fails
 * - Retries with Groq if Cerebras returns malformed JSON
 *
 * @module cfn-security-decomposer
 * @version 2.0.0 - Enhanced JSON parsing and Groq fallback
 */

import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis, ArchitectureComponent, ArchitectureBoundary } from "./cfn-architecture-decomposer.js";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

export interface SecurityDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    components?: ArchitectureComponent[];
    boundaries?: ArchitectureBoundary[];
  };
}

export interface SecurityBoundary {
  boundary: string;
  threatModel: string[];
  mitigations: string[];
  complianceRequirements?: string[];
}

export interface SecurityAnalysis {
  taskId: string;
  perspective: "security";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    threatVectors: string[];
  }>;
  securityRecommendations: string[];
  securityBoundaries: SecurityBoundary[];
  riskLevel: "critical" | "high" | "medium" | "low";
}

// =============================================
// Helper Functions
// =============================================

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Cerebras API for decomposition (PRIMARY)
 * Fast inference with reliable rate limits.
 */
async function callCerebrasAPI(prompt: string): Promise<{
  choices: Array<{ message: { content: string } }>;
}> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error("CEREBRAS_API_KEY environment variable not set");
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-3-235b-a22b-instruct-2507",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      let delayMs: number;

      if (retryAfter) {
        delayMs = parseInt(retryAfter, 10) * 1000;
      } else {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
      }

      console.log(`[security-decomposer] Cerebras rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Cerebras API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[security-decomposer] Cerebras server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    return await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
  }

  throw lastError || new Error(`Cerebras API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Call Groq API as fallback when Cerebras is rate limited or returns malformed JSON.
 *
 * Note: Groq free tier is unreliable with aggressive rate limiting.
 * Use as fallback only.
 */
async function callGroqAPI(prompt: string): Promise<{
  choices: Array<{ message: { content: string } }>;
}> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable not set for fallback");
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      let delayMs: number;

      if (retryAfter) {
        delayMs = parseInt(retryAfter, 10) * 1000;
      } else {
        const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        delayMs = Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
      }

      console.log(`[security-decomposer] Groq rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Groq API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[security-decomposer] Groq server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    return await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
  }

  throw lastError || new Error(`Groq API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Parse decomposition response with fallback to Groq if JSON is malformed.
 */
async function parseWithFallback(
  content: string,
  prompt: string,
  contextName: string
): Promise<{
  microTasks?: Array<any>;
  securityRecommendations?: string[];
  securityBoundaries?: SecurityBoundary[];
  riskLevel?: "critical" | "high" | "medium" | "low";
}> {
  try {
    // First try parsing with enhanced JSON recovery
    return parseJSONFromResponse(content, contextName) as {
      microTasks?: Array<any>;
      securityRecommendations?: string[];
      securityBoundaries?: SecurityBoundary[];
      riskLevel?: "critical" | "high" | "medium" | "low";
    };
  } catch (parseError) {
    // JSON parsing failed even with sanitization - try Groq as fallback
    console.log(`[${contextName}] Cerebras returned malformed JSON, trying Groq fallback`);
    console.log(`[${contextName}] Parse error: ${(parseError as Error).message.substring(0, 100)}`);

    try {
      const groqData = await callGroqAPI(prompt);
      const groqContent = groqData.choices[0].message.content;
      return parseJSONFromResponse(groqContent, `${contextName}-groq-fallback`) as {
        microTasks?: Array<any>;
        securityRecommendations?: string[];
        securityBoundaries?: SecurityBoundary[];
        riskLevel?: "critical" | "high" | "medium" | "low";
      };
    } catch (groqError) {
      // Both Cerebras JSON and Groq failed
      throw new Error(
        `[${contextName}] JSON parsing failed for both Cerebras and Groq.\n` +
        `Cerebras error: ${(parseError as Error).message.substring(0, 150)}\n` +
        `Groq error: ${(groqError as Error).message.substring(0, 150)}`
      );
    }
  }
}

export const cfnSecurityDecomposerTask = task({
  id: "cfn-security-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: SecurityDecomposerPayload): Promise<SecurityAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "security-decomposer");

    console.log(`[security-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Build context section if provided
      let contextSection = "";
      if (payload.previousContext?.architecture) {
        const arch = payload.previousContext.architecture;
        contextSection = `

ARCHITECTURE CONTEXT (from previous decomposer):
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}
- Recommendations: ${JSON.stringify(arch.recommendations || [])}

Use this architecture context to identify security implications:
- Microservices → need inter-service authentication
- Payment services → PCI compliance requirements
- API boundaries → input validation, rate limiting
- Database access → SQL injection prevention
- Frontend → XSS, CSRF protection`;
      }

      const prompt = `You are a security specialist. Analyze this task for security implications and decompose into security-focused micro-tasks.

Task: ${validated.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Security-focused micro-tasks (ID, title, description, threat vectors)
2. Security recommendations informed by architecture
3. Security boundaries for inter-component communication
4. Overall risk level (critical|high|medium|low)

Format as JSON:
{
  "microTasks": [
    {
      "id": "sec-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Security concern",
      "threatVectors": ["injection", "xss", ...]
    }
  ],
  "securityRecommendations": ["...", "..."],
  "securityBoundaries": [
    {
      "boundary": "API Gateway <-> Auth Service",
      "threatModel": ["Token theft", "Replay attacks"],
      "mitigations": ["JWT with short expiry", "HTTPS only", "Rate limiting"],
      "complianceRequirements": ["GDPR", "PCI-DSS"]
    }
  ],
  "riskLevel": "critical|high|medium|low"
}`;

      let data: { choices: Array<{ message: { content: string } }> };
      let usedProvider = "Cerebras";

      // Try Cerebras first, fallback to Groq on 429 or API errors
      try {
        data = await callCerebrasAPI(prompt);
      } catch (cerebrasError) {
        const errorMsg = (cerebrasError as Error).message;

        if (errorMsg.includes('429') || errorMsg.includes('rate limit') ||
            errorMsg.includes('500') || errorMsg.includes('502') ||
            errorMsg.includes('503') || errorMsg.includes('504') ||
            errorMsg.includes('timeout') || errorMsg.includes('CEREBRAS_API_KEY')) {
          console.log(`[security-decomposer] Cerebras failed, falling back to Groq: ${errorMsg.substring(0, 100)}`);
          data = await callGroqAPI(prompt);
          usedProvider = "Groq";
        } else {
          throw cerebrasError;
        }
      }

      // P0 Fix: Task 3 - API Response Validation
      const validatedData = validateCerebrasResponse(data, "security-decomposer");
      const content = validatedData.choices[0].message.content;

      // Parse with enhanced JSON recovery and Groq fallback for malformed JSON
      const analysis = await parseWithFallback(content, prompt, "security-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "security-decomposer");

      const result: SecurityAnalysis = {
        taskId: validated.taskId,
        perspective: "security",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          threatVectors: (task as any).threatVectors || [],
        })),
        securityRecommendations: analysis.securityRecommendations || [],
        securityBoundaries: analysis.securityBoundaries || [],
        riskLevel: analysis.riskLevel || "low",
      };

      console.log(`[security-decomposer] Success (${usedProvider}): Risk level ${result.riskLevel}, ${result.securityBoundaries.length} boundaries`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[security-decomposer] Critical Error: ${errorMsg}`);
      console.error(`[security-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[security-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[security-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Security analysis is mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
