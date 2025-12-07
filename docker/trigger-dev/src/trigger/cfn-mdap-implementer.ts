/**
 * CFN MDAP Implementer Task
 *
 * MDAP-specific implementer using Groq API as PRIMARY for rapid code generation.
 * Falls back to Cerebras API when Groq is rate-limited or unavailable.
 *
 * API Priority Chain:
 * 1. Groq (PRIMARY) - Cost-effective with billing enabled, slightly cheaper than Cerebras
 * 2. Cerebras (FALLBACK) - Used when Groq fails (429 rate limit, API errors)
 *
 * Rationale: Groq billing now enabled, providing cost savings with negligible timing difference.
 * Cerebras remains as reliable fallback for rate limit scenarios.
 *
 * Key differences from cfn-implementer-v2:
 * - Uses Groq/Cerebras APIs directly (NOT Claude Code CLI)
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
 * @version 4.0.0 - Unified GLM 4.6 model with thinking disabled (speed optimization)
 */

import { task } from "@trigger.dev/sdk/v3";
import {
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";
import {
  callGLMFast,
  GLM_MODEL_ID,
  IMPLEMENTER_PRESET,
  type GLMResponse,
} from "../lib/glm-provider.js";

// Security: Sanitize error messages to prevent API key leakage
function sanitizeErrorMessage(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Mask patterns that look like API keys
  return message
    .replace(/tr_(dev|prod|stg|preview)_[a-zA-Z0-9]+/g, 'tr_$1_[REDACTED]')
    .replace(/sk-[a-zA-Z0-9]{48}/g, 'sk-[REDACTED]')
    .replace(/gsk_[a-zA-Z0-9]+/g, 'gsk_[REDACTED]')
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
import {
  checkDeprecation,
  getRecommendedTier,
} from "../lib/mdap-metrics-tracker.js";

// =============================================
// Types
// =============================================

/** Compiler error with location information */
export interface CompilerError {
  /** Error code (e.g., E0599, TS2304) */
  code: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Error message from compiler */
  message: string;
  /** Optional suggestion from compiler */
  suggestion?: string;
}

/** A single fix instruction from LLM */
export interface FixInstruction {
  /** Line number to modify (1-indexed) */
  line: number;
  /** Action to perform */
  action: "replace" | "insert_before" | "insert_after" | "delete";
  /** New content (required for replace/insert actions) */
  content?: string;
  /** End line for multi-line replacements */
  endLine?: number;
  /** Original content being replaced (for validation) */
  original?: string;
}

/** Result of applying fixes */
export interface ApplyFixesResult {
  /** Whether all fixes were applied successfully */
  success: boolean;
  /** The modified content */
  content: string;
  /** Number of fixes applied */
  fixesApplied: number;
  /** Any fixes that failed to apply */
  failedFixes: Array<{ fix: FixInstruction; reason: string }>;
  /** Whether syntax validation passed */
  syntaxValid: boolean;
}

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
  /**
   * Raw output mode - skips JSON wrapping for transformation tasks
   * When true, the AI response is returned directly without parsing
   * Use for: YAML transformation, text processing, format conversion
   */
  rawOutput?: boolean;
  /**
   * Diff mode - LLM returns fix instructions instead of full file
   * Reduces token usage by ~80-90% for large files
   * Requires: errors array and fullFileContent
   */
  diffMode?: boolean;
  /** Compiler errors to fix (required for diffMode) */
  errors?: CompilerError[];
  /** Full file content for diff mode (required for diffMode) */
  fullFileContent?: string;
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
  /** Which API was used */
  apiUsed?: "glm" | "cerebras" | "groq";
  /** Diff mode specific: fixes that were applied */
  fixesApplied?: number;
  /** Diff mode specific: fixes that failed */
  fixesFailed?: Array<{ fix: FixInstruction; reason: string }>;
  /** Diff mode specific: whether syntax validation passed */
  syntaxValid?: boolean;
  /** Diff mode specific: number of retry attempts for validation */
  retryCount?: number;
}

// =============================================
// Model Configuration
// =============================================

/**
 * UNIFIED MODEL: Always use GLM 4.6 via Cerebras
 *
 * Per project requirements and Cerebras docs, we use zai-glm-4.6 for ALL tasks:
 * - Consistent model reduces variability
 * - Thinking DISABLED for implementation tasks (speed optimization)
 * - Thinking ENABLED for decomposition tasks (handled by decomposer modules)
 *
 * See: https://inference-docs.cerebras.ai/resources/glm-migration#7-minimize-reasoning-when-not-needed
 *
 * Legacy tier-based model selection is DEPRECATED.
 * The tier system is retained only for cost estimation and escalation logic.
 */
const UNIFIED_MODEL = GLM_MODEL_ID; // "zai-glm-4.6" from glm-provider.ts

// Legacy constants kept for backwards compatibility (not used in new code path)
const GROQ_MODELS: Record<number, string> = {
  1: GLM_MODEL_ID,
  2: GLM_MODEL_ID,
  3: GLM_MODEL_ID,
};
const CEREBRAS_MODELS: Record<number, string> = {
  1: GLM_MODEL_ID,
  2: GLM_MODEL_ID,
  3: GLM_MODEL_ID,
};

// =============================================
// Diff Mode Functions
// =============================================

/** Max retries for diff mode validation failures */
const MAX_DIFF_RETRIES = 2;

/**
 * Validate bracket/brace/paren balance in code
 * Skips strings and comments for accurate validation
 */
function validateSyntax(content: string, language: "typescript" | "rust" | string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const opens = new Set(Object.keys(pairs));
  const closes = new Set(Object.values(pairs));

  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    // Handle newlines
    if (char === "\n") {
      inLineComment = false;
      continue;
    }

    // Skip line comments
    if (!inString && !inBlockComment && char === "/" && next === "/") {
      inLineComment = true;
      continue;
    }
    if (inLineComment) continue;

    // Skip block comments
    if (!inString && char === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment && char === "*" && next === "/") {
      inBlockComment = false;
      i++;
      continue;
    }
    if (inBlockComment) continue;

    // Handle strings
    if ((char === '"' || char === "'" || char === "`") && prev !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;

    // Track brackets
    if (opens.has(char)) {
      stack.push(pairs[char]);
    } else if (closes.has(char)) {
      if (stack.length === 0 || stack.pop() !== char) {
        return false;
      }
    }
  }

  return stack.length === 0;
}

/**
 * Extract error context windows from file content
 * Returns only the lines around each error for minimal token usage
 */
function extractErrorContext(
  content: string,
  errors: CompilerError[],
  windowSize: number = 10
): string {
  const lines = content.split('\n');
  const chunks: string[] = [];
  const includedRanges: Array<{ start: number; end: number }> = [];

  const sortedErrors = [...errors].sort((a, b) => a.line - b.line);

  for (const error of sortedErrors) {
    const start = Math.max(0, error.line - 1 - windowSize);
    const end = Math.min(lines.length, error.line + windowSize);

    const lastRange = includedRanges[includedRanges.length - 1];
    if (lastRange && start <= lastRange.end + 2) {
      lastRange.end = Math.max(lastRange.end, end);
    } else {
      includedRanges.push({ start, end });
    }
  }

  for (const range of includedRanges) {
    const relevantErrors = sortedErrors.filter(
      e => e.line > range.start && e.line <= range.end
    );

    chunks.push(`// Lines ${range.start + 1}-${range.end} (errors: ${relevantErrors.map(e => `L${e.line}:${e.code}`).join(', ')})`);

    for (let i = range.start; i < range.end; i++) {
      const lineNum = i + 1;
      const isErrorLine = relevantErrors.some(e => e.line === lineNum);
      const prefix = isErrorLine ? '>>> ' : '    ';
      chunks.push(`${prefix}${lineNum}: ${lines[i]}`);
    }
    chunks.push('');
  }

  return chunks.join('\n');
}

/**
 * Apply fix instructions to file content deterministically
 * No LLM involved - pure code transformation with syntax validation
 */
function applyFixes(content: string, fixes: FixInstruction[], language: string): ApplyFixesResult {
  const lines = content.split('\n');
  const failedFixes: Array<{ fix: FixInstruction; reason: string }> = [];
  let fixesApplied = 0;

  // Sort fixes in reverse line order to preserve line numbers during modification
  const sortedFixes = [...fixes].sort((a, b) => {
    if (b.line !== a.line) return b.line - a.line;
    const actionPriority = { delete: 3, replace: 2, insert_after: 1, insert_before: 0 };
    return actionPriority[b.action] - actionPriority[a.action];
  });

  for (const fix of sortedFixes) {
    const lineIndex = fix.line - 1;

    if (lineIndex < 0 || lineIndex >= lines.length) {
      failedFixes.push({
        fix,
        reason: `Line ${fix.line} out of range (file has ${lines.length} lines)`
      });
      continue;
    }

    try {
      switch (fix.action) {
        case 'replace': {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: 'Replace action requires content' });
            continue;
          }
          const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
          const deleteCount = endLine - lineIndex + 1;
          const newLines = fix.content.split('\n');
          lines.splice(lineIndex, deleteCount, ...newLines);
          fixesApplied++;
          break;
        }

        case 'insert_before': {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: 'Insert action requires content' });
            continue;
          }
          const newLines = fix.content.split('\n');
          lines.splice(lineIndex, 0, ...newLines);
          fixesApplied++;
          break;
        }

        case 'insert_after': {
          if (fix.content === undefined) {
            failedFixes.push({ fix, reason: 'Insert action requires content' });
            continue;
          }
          const newLines = fix.content.split('\n');
          lines.splice(lineIndex + 1, 0, ...newLines);
          fixesApplied++;
          break;
        }

        case 'delete': {
          const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
          const deleteCount = endLine - lineIndex + 1;
          lines.splice(lineIndex, deleteCount);
          fixesApplied++;
          break;
        }

        default:
          failedFixes.push({ fix, reason: `Unknown action: ${(fix as FixInstruction).action}` });
      }
    } catch (err) {
      failedFixes.push({
        fix,
        reason: `Exception: ${(err as Error).message}`
      });
    }
  }

  const newContent = lines.join('\n');
  const syntaxValid = validateSyntax(newContent, language);

  return {
    success: failedFixes.length === 0 && syntaxValid,
    content: newContent,
    fixesApplied,
    failedFixes,
    syntaxValid
  };
}

/**
 * Parse fix instructions from LLM response
 */
function parseFixInstructions(content: string, contextName: string): { fixes: FixInstruction[]; explanation?: string } {
  try {
    const parsed = parseJSONFromResponse<{ fixes: FixInstruction[]; explanation?: string }>(content, contextName);

    if (!parsed.fixes || !Array.isArray(parsed.fixes)) {
      throw new Error("Response missing 'fixes' array");
    }

    // Validate each fix has required fields
    for (const fix of parsed.fixes) {
      if (typeof fix.line !== 'number' || fix.line < 1) {
        throw new Error(`Invalid line number: ${fix.line}`);
      }
      if (!['replace', 'insert_before', 'insert_after', 'delete'].includes(fix.action)) {
        throw new Error(`Invalid action: ${fix.action}`);
      }
      if (fix.action !== 'delete' && fix.content === undefined) {
        throw new Error(`Missing content for ${fix.action} action at line ${fix.line}`);
      }
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse fix instructions: ${(error as Error).message}`);
  }
}

/**
 * Build diff mode prompt for error fixing
 */
function buildDiffModePrompt(payload: MDAPImplementerPayload, tier: ModelTier): string {
  const sections: string[] = [];
  const lang = payload.language || 'TypeScript';

  sections.push(`You are an expert ${lang} developer fixing compiler errors.`);
  sections.push(`Analyze the errors and provide ONLY the specific line fixes needed.`);
  sections.push('');

  sections.push(`## File: \`${payload.targetFile}\``);
  sections.push('');

  sections.push(`## Compiler Errors to Fix`);
  for (const error of payload.errors!) {
    sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
    if (error.suggestion) {
      sections.push(`  Suggestion: ${error.suggestion}`);
    }
  }
  sections.push('');

  sections.push(`## Code Context (error regions only)`);
  sections.push('```' + lang.toLowerCase());
  sections.push(extractErrorContext(payload.fullFileContent!, payload.errors!));
  sections.push('```');
  sections.push('');

  if (payload.fileContents && payload.fileContents.length > 0) {
    sections.push(`## Related Files (for type references)`);
    for (const { path, content } of payload.fileContents) {
      sections.push(`### ${path}`);
      sections.push('```');
      sections.push(content.slice(0, 1500));
      sections.push('```');
    }
    sections.push('');
  }

  sections.push(`## Output Format`);
  sections.push(`Return ONLY valid JSON with fix instructions:`);
  sections.push('```json');
  sections.push(JSON.stringify({
    fixes: [
      { line: 45, action: "replace", content: "fixed line content here" },
      { line: 102, action: "insert_after", content: "new line to insert" },
      { line: 156, action: "delete" }
    ],
    explanation: "Brief explanation of fixes"
  }, null, 2));
  sections.push('```');
  sections.push('');

  sections.push(`## Available Actions`);
  sections.push(`- \`replace\`: Replace line(s) with new content. Use \`endLine\` for multi-line.`);
  sections.push(`- \`insert_before\`: Insert new line(s) before the specified line.`);
  sections.push(`- \`insert_after\`: Insert new line(s) after the specified line.`);
  sections.push(`- \`delete\`: Remove line(s). Use \`endLine\` for multi-line deletion.`);
  sections.push('');

  if (lang === 'Rust') {
    sections.push(`## Rust-Specific Guidance`);
    sections.push(`- E0599 (method not found): Add impl block or use correct trait`);
    sections.push(`- E0560 (struct field missing): Add the missing field to struct`);
    sections.push(`- E0308 (type mismatch): Fix the type or add conversion`);
    sections.push(`- E0277 (trait not implemented): Add impl or derive macro`);
    sections.push(`- E0382 (moved value): Use clone, reference, or restructure`);
    sections.push('');
  } else if (lang === 'TypeScript') {
    sections.push(`## TypeScript-Specific Guidance`);
    sections.push(`- TS2304 (cannot find name): Add import or declare`);
    sections.push(`- TS2339 (property doesn't exist): Add to interface or type assertion`);
    sections.push(`- TS2345 (argument type): Fix type or add conversion`);
    sections.push(`- TS2322 (type not assignable): Fix assignment or add type guard`);
    sections.push('');
  }

  sections.push(`IMPORTANT: Return ONLY the JSON object with fixes array. Do NOT return full file content.`);

  return sections.join('\n');
}

/**
 * Build NACK prompt for retry after validation failure
 */
function buildNackPrompt(
  payload: MDAPImplementerPayload,
  failedFixes: Array<{ fix: FixInstruction; reason: string }>,
  syntaxValid: boolean,
  previousFixes: FixInstruction[]
): string {
  const sections: string[] = [];
  const lang = payload.language || 'TypeScript';

  sections.push(`Your previous fix attempt FAILED. Please provide corrected fixes.`);
  sections.push('');

  sections.push(`## Validation Failures`);
  if (!syntaxValid) {
    sections.push(`- **SYNTAX ERROR**: The resulting code has unbalanced brackets/braces/parentheses`);
  }
  if (failedFixes.length > 0) {
    sections.push(`- **Failed Fixes**:`);
    for (const { fix, reason } of failedFixes) {
      sections.push(`  - Line ${fix.line} (${fix.action}): ${reason}`);
    }
  }
  sections.push('');

  sections.push(`## Your Previous Fixes (that failed)`);
  sections.push('```json');
  sections.push(JSON.stringify({ fixes: previousFixes }, null, 2));
  sections.push('```');
  sections.push('');

  sections.push(`## Original Errors to Fix`);
  for (const error of payload.errors!) {
    sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
  }
  sections.push('');

  sections.push(`## Code Context`);
  sections.push('```' + lang.toLowerCase());
  sections.push(extractErrorContext(payload.fullFileContent!, payload.errors!));
  sections.push('```');
  sections.push('');

  sections.push(`## Instructions`);
  sections.push(`1. Analyze why your previous fixes failed`);
  sections.push(`2. Ensure all line numbers are correct (1-indexed)`);
  sections.push(`3. Ensure bracket/brace balance is maintained`);
  sections.push(`4. Return corrected JSON with fixes array`);
  sections.push('');

  sections.push(`IMPORTANT: Return ONLY valid JSON with the corrected fixes array.`);

  return sections.join('\n');
}

// =============================================
// Helper Functions
// =============================================

/**
 * Build implementation prompt for code generation
 */
function buildImplementationPrompt(payload: MDAPImplementerPayload, tier: ModelTier): string {
  // RAW OUTPUT MODE: For transformation tasks
  if (payload.rawOutput) {
    return payload.taskDescription;
  }

  // DIFF MODE: Return fix instructions instead of full file
  if (payload.diffMode && payload.errors && payload.fullFileContent) {
    return buildDiffModePrompt(payload, tier);
  }

  // STANDARD MODE: Code generation with JSON wrapping
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

  // Quality hints based on tier - Enhanced prompts for T2+ tiers
  if (tier.tier >= 2) {
    sections.push(`## Quality Requirements (T${tier.tier} - ${tier.name})`);
    sections.push(`- Follow TypeScript best practices (strict types, no \`any\`)`);
    sections.push(`- Add JSDoc comments for public functions`);
    sections.push(`- Handle edge cases (null, undefined, empty strings)`);
    sections.push(`- Use descriptive variable names`);
    sections.push(`- Include proper error handling with try-catch blocks`);
    sections.push(`- Add input validation for all parameters`);

    if (tier.tier >= 3) {
      // T3 (opus) gets additional requirements for complex/retry scenarios
      sections.push('');
      sections.push(`## Advanced Requirements (T3 - ${tier.name})`);
      sections.push(`- Implement comprehensive error handling with try-catch and proper error messages`);
      sections.push(`- Add input validation for ALL parameters (type checks, bounds checks, null checks)`);
      sections.push(`- Consider performance implications (avoid N+1 loops, use efficient data structures)`);
      sections.push(`- Write defensive code anticipating failures and edge cases`);
      sections.push(`- Add comprehensive inline comments explaining complex logic`);
      sections.push(`- Consider thread safety if applicable`);
      sections.push(`- Implement proper resource cleanup (finally blocks, dispose patterns)`);
    }
    sections.push('');
  }

  sections.push(`IMPORTANT: Return ONLY the JSON object, no additional text.`);

  return sections.join('\n');
}

/**
 * Sleep helper for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Cerebras API for code generation (PRIMARY)
 * Fast inference with reliable rate limits.
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

  // Retry configuration for rate limiting
  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 30000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Add 30s timeout to prevent hanging on slow/unresponsive API
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
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          max_tokens: tier.tier >= 3 ? 4096 : 2048,
          temperature: tier.tier >= 3 ? 0.3 : 0.5,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle rate limiting with exponential backoff
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

      console.log(`[mdap-implementer] Cerebras rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Cerebras API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      // Only retry on 5xx server errors
      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[mdap-implementer] Cerebras server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    const data = await response.json() as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

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

  // All retries exhausted
  throw lastError || new Error(`Cerebras API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Call Groq API for code generation (FALLBACK)
 * Used when Cerebras is unavailable or rate-limited.
 *
 * Note: Groq free tier has aggressive rate limiting (0% success rate in tests).
 * Use as fallback only.
 */
async function callGroqAPI(
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable not set for fallback");
  }

  // Retry configuration for rate limiting
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
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          max_tokens: tier.tier >= 3 ? 4096 : 2048,
          temperature: tier.tier >= 3 ? 0.3 : 0.5,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle rate limiting with exponential backoff
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

      console.log(`[mdap-implementer] Groq rate limited (429), retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(delayMs)}ms`);
      await sleep(delayMs);
      continue;
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      lastError = new Error(
        `Groq API error: ${response.status} - ${errorBody}\n` +
        `Check API key validity and quota limits.`
      );

      if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`[mdap-implementer] Groq server error (${response.status}), retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }

      throw lastError;
    }

    const data = await response.json() as {
      choices?: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    if (!data.choices || data.choices.length === 0) {
      throw new Error("Groq API returned no choices");
    }

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      durationMs,
    };
  }

  throw lastError || new Error(`Groq API failed after ${MAX_RETRIES} retries due to rate limiting`);
}

/**
 * Parse generated code from API response with robust fallbacks
 */
function parseGeneratedCode(content: string, contextName: string): { code: string; explanation?: string } {
  try {
    const parsed = parseJSONFromResponse<{ code: string; explanation?: string }>(content, contextName);

    if (!parsed.code || typeof parsed.code !== 'string') {
      throw new Error("Response missing 'code' field");
    }

    return parsed;
  } catch (error) {
    // Fallback 1: Try to extract code from markdown code blocks
    const codeMatch = content.match(/```(?:typescript|javascript|ts|js)?\s*\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      return { code: codeMatch[1].trim(), explanation: "Extracted from code block" };
    }

    // Fallback 2: Return content as-is if it looks like code
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
    const modeStr = payload.diffMode ? 'DIFF' : (payload.rawOutput ? 'RAW' : 'FULL');
    console.log(`[mdap-implementer] Mode: ${modeStr}${payload.errors ? ` (${payload.errors.length} errors)` : ''}`);

    // Get metrics-based tier recommendation (accounts for deprecation)
    const recommendedTier = await getRecommendedTier(
      'simple', // MDAP tasks are always atomic/simple
      payload.failureCount || 0
    );

    // Select model tier based on failure history and recommendation
    let modelTier = selectModelTier(
      'simple', // MDAP tasks are always atomic/simple
      Math.max(payload.modelTier || 1, recommendedTier),
      payload.failureCount || 0
    );

    // Use unified GLM 4.6 model (thinking DISABLED for implementation tasks)
    const modelName = UNIFIED_MODEL;
    const apiUsed: "glm" | "cerebras" | "groq" = "glm";

    console.log(`[mdap-implementer] Using ${getTierSummary(modelTier)} -> ${modelName} (GLM 4.6, thinking disabled)`);

    try {
      // Build prompt
      const prompt = buildImplementationPrompt(payload, modelTier);
      console.log(`[mdap-implementer] Prompt length: ${prompt.length} chars`);

      let apiResult: GLMResponse;

      // Use unified GLM 4.6 with thinking DISABLED (per Cerebras docs for implementation tasks)
      // https://inference-docs.cerebras.ai/resources/glm-migration#7-minimize-reasoning-when-not-needed
      apiResult = await callGLMFast(prompt, {
        maxTokens: modelTier.tier >= 3 ? 4096 : 2048,
        temperature: modelTier.tier >= 3 ? 0.3 : 0.5,
      });
      console.log(`[mdap-implementer] GLM API call: ${apiResult.durationMs}ms, ${apiResult.inputTokens}+${apiResult.outputTokens} tokens (thinking: ${apiResult.thinkingEnabled})`);

      // Handle output based on mode
      let code: string;
      let explanation: string | undefined;
      let fixesApplied: number | undefined;
      let fixesFailed: Array<{ fix: FixInstruction; reason: string }> | undefined;
      let syntaxValid: boolean | undefined;
      let retryCount = 0;

      if (payload.rawOutput) {
        // RAW OUTPUT MODE: Return content directly
        code = apiResult.content.trim();
        explanation = "Raw output mode - content returned directly";
        console.log(`[mdap-implementer] Raw output: ${code.length} chars`);
      } else if (payload.diffMode && payload.fullFileContent) {
        // DIFF MODE: Parse fix instructions and apply with retry loop
        console.log(`[mdap-implementer] Diff mode: parsing fix instructions`);

        let applyResult: ApplyFixesResult | null = null;
        let currentPrompt = buildDiffModePrompt(payload, modelTier);
        let previousFixes: FixInstruction[] = [];

        // Retry loop for validation failures
        for (let attempt = 0; attempt <= MAX_DIFF_RETRIES; attempt++) {
          retryCount = attempt;

          if (attempt > 0) {
            // Build NACK prompt for retry
            console.log(`[mdap-implementer] Diff mode retry ${attempt}/${MAX_DIFF_RETRIES} - validation failed`);
            currentPrompt = buildNackPrompt(
              payload,
              applyResult!.failedFixes,
              applyResult!.syntaxValid,
              previousFixes
            );

            // Call GLM again with NACK prompt (thinking still disabled for fixes)
            try {
              apiResult = await callGLMFast(currentPrompt, {
                maxTokens: modelTier.tier >= 3 ? 4096 : 2048,
                temperature: modelTier.tier >= 3 ? 0.3 : 0.5,
              });
              console.log(`[mdap-implementer] Retry API call: ${apiResult.durationMs}ms (thinking: ${apiResult.thinkingEnabled})`);
            } catch (retryError) {
              console.error(`[mdap-implementer] Retry API call failed: ${(retryError as Error).message}`);
              break;
            }
          }

          try {
            const parsed = parseFixInstructions(apiResult.content, "mdap-implementer-diff");
            explanation = parsed.explanation;
            previousFixes = parsed.fixes;

            console.log(`[mdap-implementer] Received ${parsed.fixes.length} fix instructions`);

            // Apply fixes to original content
            applyResult = applyFixes(payload.fullFileContent, parsed.fixes, payload.language || 'typescript');

            console.log(`[mdap-implementer] Applied ${applyResult.fixesApplied}/${parsed.fixes.length} fixes, syntax valid: ${applyResult.syntaxValid}`);

            // Check if validation passed
            if (applyResult.syntaxValid && applyResult.failedFixes.length === 0) {
              console.log(`[mdap-implementer] Validation passed on attempt ${attempt + 1}`);
              break;
            }

            // Log validation failures
            if (!applyResult.syntaxValid) {
              console.warn(`[mdap-implementer] Syntax validation failed`);
            }
            if (applyResult.failedFixes.length > 0) {
              console.warn(`[mdap-implementer] Failed fixes: ${applyResult.failedFixes.map(f => `L${f.fix.line}: ${f.reason}`).join(', ')}`);
            }
          } catch (parseError) {
            console.error(`[mdap-implementer] Parse error: ${(parseError as Error).message}`);
            if (attempt === MAX_DIFF_RETRIES) {
              throw parseError;
            }
          }
        }

        if (!applyResult) {
          throw new Error("Failed to apply fixes after all retry attempts");
        }

        code = applyResult.content;
        fixesApplied = applyResult.fixesApplied;
        fixesFailed = applyResult.failedFixes.length > 0 ? applyResult.failedFixes : undefined;
        syntaxValid = applyResult.syntaxValid;

      } else {
        // STANDARD MODE: Parse JSON response with full code
        const parsed = parseGeneratedCode(apiResult.content, "mdap-implementer");
        code = parsed.code;
        explanation = parsed.explanation;
        console.log(`[mdap-implementer] Generated ${code.length} chars of code`);
        if (explanation) {
          console.log(`[mdap-implementer] Explanation: ${explanation}`);
        }
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = estimateCost(modelTier, apiResult.inputTokens, apiResult.outputTokens);

      console.log(`[mdap-implementer] Success (${apiUsed}): ${durationMs}ms, cost ~$${estimatedCost.toFixed(6)}`);

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
        apiUsed,
        fixesApplied,
        fixesFailed,
        syntaxValid,
        retryCount: retryCount > 0 ? retryCount : undefined,
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = sanitizeErrorMessage(error);

      console.error(`[mdap-implementer] Failed: ${errorMsg}`);
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
        apiUsed,
      };
    }
  },
});
