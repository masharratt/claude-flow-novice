/**
 * MDAP Implementer Module
 *
 * Core implementation logic for MDAP tasks with support for:
 * - Diff mode: Apply targeted fixes instead of full file generation
 * - Validation loop: Retry failed fixes with NACK prompts
 * - Syntax validation: Ensure bracket/brace balance
 * - GLM 4.6 integration: Fast implementation without thinking
 *
 * Extracted from Trigger.dev cfn-mdap-implementer task
 *
 * @module implementer
 * @version 1.0.0
 */

import {
  callGLMFast,
  type GLMResponse,
} from './glm-client.js';
import {
  extractJSONFromResponse,
} from './validation.js';
import {
  type CompilerError,
  type FixInstruction,
  type MDAPResult,
} from './types.js';

// =============================================
// Types
// =============================================

export interface ImplementerPayload {
  /** Unique task identifier */
  taskId: string;
  /** Task description */
  taskDescription: string;
  /** Target file to create/modify */
  targetFile: string;
  /** Working directory context */
  workDir?: string;
  /** Context hints from decomposition */
  contextHints?: string[];
  /** Pre-read file contents for context */
  fileContents?: Array<{ path: string; content: string }>;
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

export interface ImplementerResult extends MDAPResult {
  /** Target file path */
  targetFile: string;
  /** Model name used */
  modelName?: string;
  /** Estimated cost in USD */
  estimatedCost?: number;
  /** Token usage */
  tokens?: {
    input: number;
    output: number;
  };
  /** Generated code content */
  generatedCode?: string;
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
// Constants
// =============================================

/** Maximum retries for diff mode validation failures */
const MAX_DIFF_RETRIES = 2;

/** Default language for syntax validation */
const DEFAULT_LANGUAGE = 'typescript';

// =============================================
// Diff Mode Functions
// =============================================

/**
 * Validate bracket/brace/paren balance in code
 * Skips strings and comments for accurate validation
 */
function validateSyntax(content: string, language: string = DEFAULT_LANGUAGE): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const opens = new Set(Object.keys(pairs));
  const closes = new Set(Object.values(pairs));

  let inString = false;
  let stringChar = "";
  let inLineComment = false;
  let inBlockComment = false;

  // Handle language-specific comment delimiters
  const isTypeScriptLike = ['typescript', 'javascript', 'tsx', 'jsx'].includes(language.toLowerCase());

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    // Handle newlines
    if (char === "\n") {
      inLineComment = false;
      continue;
    }

    // Skip line comments (TypeScript-like languages)
    if (isTypeScriptLike && !inString && !inBlockComment && char === "/" && next === "/") {
      inLineComment = true;
      continue;
    }
    if (inLineComment) continue;

    // Skip block comments (TypeScript-like languages)
    if (isTypeScriptLike && !inString && char === "/" && next === "*") {
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
 * Parse fix instructions from LLM response
 */
function parseFixInstructions(content: string): { fixes: FixInstruction[]; explanation?: string } {
  try {
    // Extract JSON from response
    const jsonStr = extractJSONFromResponse(content, 'fix-instructions');
    if (!jsonStr) {
      throw new Error("No JSON found in response");
    }

    // Parse JSON
    const parsed = JSON.parse(jsonStr);

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

// =============================================
// Main Implementer Function
// =============================================

/**
 * Build implementation prompt for code generation
 */
function buildImplementationPrompt(payload: ImplementerPayload): string {
  // RAW OUTPUT MODE: For transformation tasks
  if (payload.rawOutput) {
    return payload.taskDescription;
  }

  // DIFF MODE: Build specialized prompt for error fixing
  if (payload.diffMode && payload.errors && payload.errors.length > 0) {
    const sections: string[] = [];
    const lang = payload.language || DEFAULT_LANGUAGE;

    sections.push(`You are an expert ${lang} developer fixing compiler errors.`);
    sections.push(`Analyze the errors and provide ONLY the specific line fixes needed.`);
    sections.push('');

    sections.push(`## File: \`${payload.targetFile}\``);
    sections.push('');

    sections.push(`## Compiler Errors to Fix`);
    for (const error of payload.errors) {
      sections.push(`- **Line ${error.line}** [${error.code}]: ${error.message}`);
      if (error.suggestion) {
        sections.push(`  Suggestion: ${error.suggestion}`);
      }
    }
    sections.push('');

    sections.push(`## Code Context (error regions only)`);
    sections.push('```' + lang.toLowerCase());
    sections.push(extractErrorContext(payload.fullFileContent || '', payload.errors));
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

    if (lang === 'rust') {
      sections.push(`## Rust-Specific Guidance`);
      sections.push(`- E0599 (method not found): Add impl block or use correct trait`);
      sections.push(`- E0560 (struct field missing): Add the missing field to struct`);
      sections.push(`- E0308 (type mismatch): Fix the type or add conversion`);
      sections.push(`- E0277 (trait not implemented): Add impl or derive macro`);
      sections.push(`- E0382 (moved value): Use clone, reference, or restructure`);
      sections.push('');
    } else if (['typescript', 'javascript'].includes(lang.toLowerCase())) {
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

  // STANDARD MODE: Code generation with JSON wrapping
  const sections: string[] = [];

  // Role and task
  sections.push(`You are an expert ${payload.language || DEFAULT_LANGUAGE} developer.`);
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

  sections.push(`IMPORTANT: Return ONLY the JSON object, no additional text.`);

  return sections.join('\n');
}

/**
 * Build NACK prompt for retry after validation failure
 */
function buildNackPrompt(
  payload: ImplementerPayload,
  failedFixes: Array<{ fix: FixInstruction; reason: string }>,
  syntaxValid: boolean,
  previousFixes: FixInstruction[]
): string {
  const sections: string[] = [];
  const lang = payload.language || DEFAULT_LANGUAGE;

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

/**
 * Main implementer function
 *
 * Implements MDAP tasks with support for diff mode and validation loops.
 * Uses GLM 4.6 with thinking disabled for fast implementation.
 *
 * @param payload - Task implementation details
 * @returns Promise<ImplementerResult> - Implementation result
 */
export async function implement(payload: ImplementerPayload): Promise<ImplementerResult> {
  const startTime = Date.now();
  let retryCount = 0;
  let fixes: FixInstruction[] = [];
  let failedFixes: Array<{ fix: FixInstruction; reason: string }> = [];
  let syntaxValid = false;
  let generatedCode = '';

  try {
    // DIFF MODE: Apply fixes with validation loop
    if (payload.diffMode && payload.errors && payload.errors.length > 0) {
      while (retryCount <= MAX_DIFF_RETRIES) {
        const prompt = retryCount === 0
          ? buildImplementationPrompt(payload)
          : buildNackPrompt(payload, failedFixes, syntaxValid, fixes);

        // Call GLM with thinking disabled for fast implementation
        const response: GLMResponse = await callGLMFast(prompt, {
          maxTokens: 2048,
          temperature: 0.3,
        });

        // Parse fix instructions
        const parsed = parseFixInstructions(response.content);
        fixes = parsed.fixes;

        // Apply fixes using diff applicator
        const { applyFixes } = await import('./diff-applicator.js');
        const result = applyFixes(payload.fullFileContent || '', fixes, payload.language || DEFAULT_LANGUAGE);

        generatedCode = result.content;
        failedFixes = result.failedFixes;
        syntaxValid = result.syntaxValid;

        // If successful, break the retry loop
        if (result.success && syntaxValid) {
          break;
        }

        retryCount++;
      }

      return {
        success: syntaxValid && failedFixes.length === 0,
        filePath: payload.targetFile,
        targetFile: payload.targetFile,
        linesWritten: generatedCode.split('\n').length,
        confidence: syntaxValid && failedFixes.length === 0 ? 0.9 : 0.5,
        durationMs: Date.now() - startTime,
        modelName: 'zai-glm-4.6',
        generatedCode,
        fixesApplied: fixes.length - failedFixes.length,
        fixesFailed: failedFixes,
        syntaxValid,
        retryCount,
        error: syntaxValid && failedFixes.length === 0 ? undefined : 'Some fixes failed validation',
      };
    }

    // STANDARD MODE: Generate full code
    const prompt = buildImplementationPrompt(payload);

    // Call GLM with thinking disabled for fast implementation
    const response: GLMResponse = await callGLMFast(prompt, {
      maxTokens: 4096,
      temperature: 0.5,
    });

    // Parse the response
    if (payload.rawOutput) {
      // Return raw response without JSON parsing
      generatedCode = response.content;
    } else {
      // Extract JSON from response
      const jsonStr = extractJSONFromResponse(response.content, 'code-generation');
      if (!jsonStr) {
        throw new Error("No JSON found in response");
      }

      // Parse JSON
      const parsed = JSON.parse(jsonStr);

      if (!parsed.code) {
        throw new Error("Response missing 'code' field");
      }

      generatedCode = parsed.code;
    }

    return {
      success: true,
      filePath: payload.targetFile,
      targetFile: payload.targetFile,
      linesWritten: generatedCode.split('\n').length,
      confidence: 0.9,
      durationMs: Date.now() - startTime,
      modelName: 'zai-glm-4.6',
      tokens: {
        input: response.inputTokens,
        output: response.outputTokens,
      },
      generatedCode,
    };

  } catch (error) {
    return {
      success: false,
      filePath: payload.targetFile,
      targetFile: payload.targetFile,
      linesWritten: 0,
      confidence: 0.0,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      generatedCode,
    };
  }
}