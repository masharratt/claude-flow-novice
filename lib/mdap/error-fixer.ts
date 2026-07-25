/**
 * MDAP Error Fixer - P0 Fixes Ported from OurStories
 *
 * Core error fixing functionality with production-proven improvements:
 * - Single error per call for reliability (no batch conflicts)
 * - Error categorization (skip hard errors like borrow checker)
 * - Dynamic context sizing based on error type
 * - Post-fix validation with compiler check
 * - Parallel processing with configurable concurrency
 *
 * @module error-fixer
 * @version 1.0.0
 */

// =============================================
// Imports
// =============================================

import { callGLMFast, IMPLEMENTER_PRESET } from "./glm-client.js";
import { CompilerError, FixInstruction, MDAPResult } from "./types.js";
import * as fs from "fs/promises";
import * as path from "path";
import { secureExecSync, addAllowedCommand } from "./secure-execution.js";

// =============================================
// Configuration
// =============================================

export interface ErrorFixerConfig {
  /** Project root directory */
  projectPath: string;
  /** Maximum number of parallel fixes (default: 3) */
  concurrency?: number;
  /** Enable TypeScript compiler validation after fixes */
  enableValidation?: boolean;
  /** Skip hard errors (borrow checker, etc.) */
  skipHardErrors?: boolean;
  /** Base context lines around errors (default: 15) */
  baseContextLines?: number;
  /** Maximum context lines for complex errors (default: 100) */
  maxContextLines?: number;
  /** Command to run for validation (default: tsc --noEmit) */
  validationCommand?: string;
  /** File patterns to include (default: all .ts/.tsx files) */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
}

// =============================================
// Constants
// =============================================

/**
 * Hard errors that require human review - LLM success rate is too low
 * These errors involve complex ownership/lifetime concepts in Rust
 * or require deep understanding of the codebase
 */
export const HARD_ERRORS = [
  // Rust borrow checker errors
  'E0382', // borrow checker - use of moved value
  'E0499', // cannot borrow as mutable more than once
  'E0515', // cannot return value referencing local variable
  'E0597', // borrowed value does not live long enough
  'E0506', // cannot assign to borrowed value
  'E0502', // cannot borrow as immutable because also borrowed as mutable
  'E0507', // cannot move out of borrowed content
  'E0521', // borrowed data escapes outside of closure

  // TypeScript complex errors
  'TS2322', // Type 'X' is not assignable to type 'Y' (when generics involved)
  'TS2345', // Argument of type 'X' is not assignable to parameter of type 'Y'
  'TS2589', // Type instantiation is excessively deep and possibly infinite
];

/**
 * Easy errors with high LLM success rate
 * Simple imports, missing types, etc.
 */
export const EASY_ERRORS = [
  // Rust
  'E0425', // cannot find value (missing import)
  'E0412', // cannot find type (missing import)
  'E0433', // failed to resolve (missing use/import)
  'E0599', // no method named X found (wrong type or missing trait)
  'E0277', // trait bound not satisfied (often just missing derive)

  // TypeScript
  'TS2304', // Cannot find name 'X'
  'TS2307', // Cannot find module 'X' or its corresponding type declarations
  'TS2552', // Cannot find name 'X'. Did you mean 'Y'?
  'TS2339', // Property 'X' does not exist on type 'Y'
];

// =============================================
// Security Initialization
// =============================================

/**
 * Initialize allowed commands for validation
 */
function initializeAllowedCommands(): void {
  // Add common compiler commands to whitelist
  const commonCommands = [
    'tsc',
    'tsc-watch',
    'typescript',
    'ts-node',
    'ts-node-dev',
    'eslint',
    'prettier',
    'jest',
    'mocha',
    'pytest',
    'rustc',
    'cargo',
    'gcc',
    'g++',
    'clang',
    'clang++',
    'javac',
    'go',
    'python',
    'python3',
    'node',
    'npm',
    'yarn',
    'pnpm',
  ];

  commonCommands.forEach(cmd => addAllowedCommand(cmd));
}

// Initialize on module load
initializeAllowedCommands();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  concurrency: 3,
  enableValidation: true,
  skipHardErrors: false,
  baseContextLines: 15,
  maxContextLines: 100,
  validationCommand: "npx tsc --noEmit",
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules/**", "dist/**", "build/**", ".git/**"],
};

// =============================================
// Helper Functions
// =============================================

/**
 * Check if an error should be automatically fixed based on its code
 */
function shouldAutoFix(
  errorCode: string,
  skipHard: boolean
): { autoFix: boolean; reason?: string } {
  if (skipHard && HARD_ERRORS.includes(errorCode)) {
    return {
      autoFix: false,
      reason: `${errorCode} is marked as a hard error requiring human review`,
    };
  }
  return { autoFix: true };
}

/**
 * Get dynamic context size based on error type
 */
function getContextSize(
  errorCode: string,
  baseContext: number,
  maxContext: number
): number {
  // Borrow checker and complex type errors need full function context
  if (HARD_ERRORS.includes(errorCode)) {
    return maxContext;
  }

  // Type mismatches need more context to see function signatures
  if (['E0308', 'TS2322', 'TS2345'].includes(errorCode)) {
    return 50;
  }

  // Import errors need less context
  if (EASY_ERRORS.includes(errorCode)) {
    return 20;
  }

  // Default
  return baseContext;
}

/**
 * Validate brace/bracket balance to prevent syntax errors
 */
function validateSyntaxBalance(content: string): { valid: boolean; error?: string } {
  let braces = 0;
  let parens = 0;
  let brackets = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const next = content[i + 1];
    const prev = content[i - 1];

    if (!inString) {
      // Handle comments
      if (c === '/' && next === '/' && !inBlockComment) {
        inLineComment = true;
        continue;
      }
      if (c === '/' && next === '*' && !inLineComment) {
        inBlockComment = true;
        i++;
        continue;
      }
      if (c === '*' && next === '/' && inBlockComment) {
        inBlockComment = false;
        i++;
        continue;
      }
      if (c === '\n' && inLineComment) {
        inLineComment = false;
        continue;
      }
    }

    // Skip content in comments
    if (inLineComment || inBlockComment) continue;

    // Handle strings
    if (c === '"' && prev !== '\\') {
      inString = !inString;
    }
    if (inString) continue;

    // Count brackets
    if (c === '{') braces++;
    if (c === '}') braces--;
    if (c === '(') parens++;
    if (c === ')') parens--;
    if (c === '[') brackets++;
    if (c === ']') brackets--;

    // Early detection of unbalanced
    if (braces < 0 || parens < 0 || brackets < 0) {
      return {
        valid: false,
        error: `Unbalanced at character ${i}: too many closing brackets`,
      };
    }
  }

  // Final check
  if (braces !== 0 || parens !== 0 || brackets !== 0) {
    return {
      valid: false,
      error: `Unanced: {=${braces}, (=${parens}, [=${brackets}`,
    };
  }

  return { valid: true };
}

/**
 * Extract context window around error with dynamic sizing
 */
function extractContextWindow(
  content: string,
  error: CompilerError,
  contextSize: number
): string {
  const lines = content.split('\n');
  const startLine = Math.max(0, error.line - contextSize - 1);
  const endLine = Math.min(lines.length, error.line + contextSize);

  const windowLines = lines.slice(startLine, endLine).map((line, i) => {
    const lineNum = startLine + i + 1;
    const marker = lineNum === error.line ? ' >>> ' : '     ';
    return `${lineNum}:${marker}${line}`;
  });

  return [
    `--- Error at line ${error.line}: [${error.code}] ${error.message}`,
    error.suggestion ? `    Suggestion: ${error.suggestion}` : '',
    '',
    ...windowLines,
  ].filter(Boolean).join('\n');
}

/**
 * Parse JSON response from LLM
 */
function parseJsonResponse(response: string): FixInstruction[] | null {
  const patterns = [
    /\[[\s\S]*?\]/,
    /```json\n?([\s\S]*?)\n?```/,
    /```\n?([\s\S]*?)\n?```/,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      try {
        const jsonStr = match[1] || match[0];
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          return parsed.filter((fix): fix is FixInstruction => {
            return (
              typeof fix.line === 'number' &&
              typeof fix.action === 'string' &&
              ['replace', 'insert_before', 'insert_after', 'delete'].includes(fix.action) &&
              (fix.content !== undefined || fix.action === 'delete')
            );
          });
        }
      } catch {
        // Try next pattern
      }
    }
  }
  return null;
}

/**
 * Apply line fixes to content
 */
function applyFixes(content: string, fixes: FixInstruction[]): string {
  const lines = content.split('\n');

  // Sort fixes in reverse order to maintain line numbers
  const sortedFixes = [...fixes].sort((a, b) => b.line - a.line);

  for (const fix of sortedFixes) {
    const idx = fix.line - 1;

    if (idx < 0 || idx >= lines.length) {
      console.warn(`[error-fixer] Invalid line number: ${fix.line}`);
      continue;
    }

    switch (fix.action) {
      case 'replace':
        if (fix.content !== undefined) {
          // Verify original content matches if provided
          if (fix.original && fix.original !== lines[idx]) {
            console.warn(
              `[error-fixer] Original content mismatch at line ${fix.line}`
            );
          }
          lines[idx] = fix.content;
        }
        break;

      case 'insert_after':
        if (fix.content !== undefined) {
          lines.splice(idx + 1, 0, fix.content);
        }
        break;

      case 'insert_before':
        if (fix.content !== undefined) {
          lines.splice(idx, 0, fix.content);
        }
        break;

      case 'delete':
        // Verify original content matches if provided
        if (fix.original && fix.original !== lines[idx]) {
          console.warn(
            `[error-fixer] Original content mismatch at line ${fix.line}`
          );
        }
        lines.splice(idx, 1);
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Count compilation errors using secure execution
 */
async function countErrors(projectPath: string, validationCommand: string): Promise<number> {
  try {
    const { stdout } = await secureExecSync(validationCommand, {
      cwd: projectPath,
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });
    return 0;
  } catch (error: any) {
    const output = error.stdout || error.stderr || '';

    // Extract error count from TypeScript output
    const tsErrors = output.match(/Found (\d+) error/);
    if (tsErrors) {
      return parseInt(tsErrors[1], 10);
    }

    // Count individual error lines as fallback
    const errorLines = output.split('\n').filter(line =>
      line.includes('error[') || line.includes('error TS')
    );
    return errorLines.length;
  }
}

/**
 * Run validation after applying fixes
 */
async function validateFix(
  filePath: string,
  originalContent: string,
  newContent: string,
  projectPath: string,
  validationCommand: string,
  enabled: boolean
): Promise<{ valid: boolean; reason?: string }> {
  if (!enabled) {
    return { valid: true, reason: 'Validation disabled' };
  }

  const fullPath = path.join(projectPath, filePath);

  // Get error count before fix
  const errorsBefore = await countErrors(projectPath, validationCommand);

  // Apply fix temporarily
  await fs.writeFile(fullPath, newContent, 'utf-8');

  // Get error count after fix
  const errorsAfter = await countErrors(projectPath, validationCommand);

  // If errors increased, rollback
  if (errorsAfter > errorsBefore) {
    await fs.writeFile(fullPath, originalContent, 'utf-8');
    return {
      valid: false,
      reason: `Fix increased errors from ${errorsBefore} to ${errorsAfter}, rolled back`,
    };
  }

  // Keep the fix
  return {
    valid: true,
    reason:
      errorsAfter < errorsBefore
        ? `Reduced errors from ${errorsBefore} to ${errorsAfter}`
        : `Error count unchanged (${errorsAfter})`,
  };
}

// =============================================
// Main Error Fixer Class
// =============================================

export class ErrorFixer {
  private config: Required<ErrorFixerConfig>;

  constructor(config: ErrorFixerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Filter out hard errors if configured to do so
   */
  filterHardErrors(errors: CompilerError[]): CompilerError[] {
    if (!this.config.skipHardErrors) {
      return errors;
    }

    const filtered = errors.filter(error => {
      const { autoFix, reason } = shouldAutoFix(error.code, true);
      if (!autoFix) {
        console.log(`[error-fixer] Skipping hard error: [${error.code}] ${reason}`);
      }
      return autoFix;
    });

    const skipped = errors.length - filtered.length;
    if (skipped > 0) {
      console.log(`[error-fixer] Filtered out ${skipped} hard errors for human review`);
    }

    return filtered;
  }

  /**
   * Fix a single error
   */
  async fixSingleError(
    filePath: string,
    error: CompilerError,
    fileContent: string
  ): Promise<MDAPResult> {
    const startTime = Date.now();
    const contextSize = getContextSize(
      error.code,
      this.config.baseContextLines,
      this.config.maxContextLines
    );

    // Extract context
    const contextWindow = extractContextWindow(fileContent, error, contextSize);

    // Build prompt
    const prompt = `Fix this ${error.code} compilation error. Return ONLY a JSON array of fixes.

ERROR AND CONTEXT:
${contextWindow}

OUTPUT FORMAT - JSON array ONLY:
[
  {"line": N, "action": "replace", "content": "fixed line content"},
  {"line": N, "action": "insert_before", "content": "new line"},
  {"line": N, "action": "insert_after", "content": "new line"},
  {"line": N, "action": "delete", "content": ""}
]

RULES:
1. Output ONLY valid JSON array, no markdown or explanation
2. "replace" - replace line N (preserve indentation!)
3. "insert_before"/"insert_after" - add new lines
4. "delete" - remove line N entirely
5. Fix ONLY the shown error, don't change other code
6. Preserve exact indentation and existing functionality
7. If you need imports, only use standard library or known modules
8. For missing properties: add optional properties or use sensible defaults
9. NEVER remove existing functionality - compilation fix should not change behavior

JSON OUTPUT:`;

    try {
      // Call GLM with fast preset (no thinking)
      const response = await callGLMFast(prompt, IMPLEMENTER_PRESET);
      const fixes = parseJsonResponse(response.content);

      if (!fixes || fixes.length === 0) {
        return {
          success: false,
          error: 'No valid fixes in response',
          confidence: 0.1,
          durationMs: Date.now() - startTime,
        };
      }

      // Apply fixes
      const newContent = applyFixes(fileContent, fixes);

      // Validate syntax
      const syntaxValidation = validateSyntaxBalance(newContent);
      if (!syntaxValidation.valid) {
        return {
          success: false,
          error: `Syntax error in fix: ${syntaxValidation.error}`,
          confidence: 0.0,
          durationMs: Date.now() - startTime,
        };
      }

      // Post-fix validation with compiler
      const compilerValidation = await validateFix(
        filePath,
        fileContent,
        newContent,
        this.config.projectPath,
        this.config.validationCommand,
        this.config.enableValidation
      );

      if (!compilerValidation.valid) {
        return {
          success: false,
          error: compilerValidation.reason,
          confidence: 0.2,
          durationMs: Date.now() - startTime,
        };
      }

      // Write final content
      if (!this.config.enableValidation) {
        await fs.writeFile(
          path.join(this.config.projectPath, filePath),
          newContent,
          'utf-8'
        );
      }

      return {
        success: true,
        filePath,
        linesWritten: fixes.length,
        confidence: 0.85,
        durationMs: Date.now() - startTime,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        confidence: 0.0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fix multiple errors in parallel with controlled concurrency
   */
  async fixErrors(
    errorsByFile: Map<string, CompilerError[]>
  ): Promise<MDAPResult[]> {
    const results: MDAPResult[] = [];

    // Create individual error tasks (one error per task for reliability)
    const tasks: Array<{
      filePath: string;
      error: CompilerError;
      fileContent: string;
    }> = [];

    for (const [filePath, errors] of Array.from(errorsByFile.entries())) {
      // Filter hard errors if configured
      const filteredErrors = this.filterHardErrors(errors);

      // Read file content once
      const fileContent = await fs.readFile(
        path.join(this.config.projectPath, filePath),
        'utf-8'
      );

      // Create one task per error (P0 fix: single error per call)
      for (const error of filteredErrors.slice(0, 1)) { // Limit to 1 error per file initially
        tasks.push({ filePath, error, fileContent });
      }
    }

    console.log(
      `[error-fixer] Processing ${tasks.length} error tasks with concurrency ${this.config.concurrency}`
    );

    // Process tasks with controlled concurrency
    for (let i = 0; i < tasks.length; i += this.config.concurrency) {
      const batch = tasks.slice(i, i + this.config.concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(task => this.fixSingleError(task.filePath, task.error, task.fileContent))
      );

      // Collect results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: result.reason?.message || 'Unknown error',
            confidence: 0.0,
          });
        }
      }
    }

    return results;
  }

  /**
   * Parse compiler errors from output
   */
  parseErrors(output: string): Map<string, CompilerError[]> {
    const errorsByFile = new Map<string, CompilerError[]>();
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // TypeScript format: file(line,column): error TSxxxx: message
      const tsMatch = line.match(/^([^(]+)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
      if (tsMatch) {
        const [, filePath, lineNum, colNum, code, message] = tsMatch;

        if (!errorsByFile.has(filePath)) {
          errorsByFile.set(filePath, []);
        }

        errorsByFile.get(filePath)!.push({
          code,
          line: parseInt(lineNum, 10),
          column: parseInt(colNum, 10),
          message,
          filePath,
          severity: 'error',
        });

        continue;
      }

      // Rust format: --> file:line:col
      const rustMatch = line.match(/^\s*-->\s+(.+):(\d+):(\d+)/);
      if (rustMatch) {
        const [, filePath, lineNum, colNum] = rustMatch;

        // Find the error line
        let code = '';
        let message = '';
        let suggestion = '';

        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          const errorMatch = lines[j].match(/error\[([A-Z]\d{4})\]:\s*(.+)/);
          if (errorMatch) {
            code = errorMatch[1];
            message = errorMatch[2];
            break;
          }
        }

        // Look for help/suggestion
        for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
          if (lines[j].includes('help:')) {
            suggestion = lines[j].replace(/.*help:\s*/, '').trim();
            break;
          }
          if (lines[j].match(/^\s*-->/) || lines[j].match(/^error\[/)) {
            break;
          }
        }

        if (code && message) {
          if (!errorsByFile.has(filePath)) {
            errorsByFile.set(filePath, []);
          }

          errorsByFile.get(filePath)!.push({
            code,
            line: parseInt(lineNum, 10),
            column: parseInt(colNum, 10),
            message,
            suggestion,
            filePath,
            severity: 'error',
          });
        }
      }
    }

    return errorsByFile;
  }
}

// =============================================
// Convenience Functions
// =============================================

/**
 * Create a default error fixer with common configuration
 */
export function createErrorFixer(projectPath: string): ErrorFixer {
  return new ErrorFixer({ projectPath });
}

/**
 * Quick fix function for simple use cases
 */
export async function quickFix(
  projectPath: string,
  errorsByFile: Map<string, CompilerError[]>
): Promise<MDAPResult[]> {
  const fixer = createErrorFixer(projectPath);
  return fixer.fixErrors(errorsByFile);
}

// =============================================
// Exports
// =============================================

export default ErrorFixer;