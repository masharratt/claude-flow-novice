/**
 * MDAP Diff Applicator Module
 *
 * Pure functions for applying fix instructions to source code.
 * No LLM involvement - deterministic code transformation with syntax validation.
 *
 * Extracted from Trigger.dev cfn-mdap-implementer diff mode logic
 *
 * @module diff-applicator
 * @version 1.0.0
 */

import {
  type FixInstruction,
} from './types.js';

// =============================================
// Types
// =============================================

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

// =============================================
// Syntax Validation Functions
// =============================================

/**
 * Validate bracket/brace/paren balance in code
 * Skips strings and comments for accurate validation
 */
function validateSyntax(content: string, language: string = 'typescript'): boolean {
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
  const isRust = language.toLowerCase() === 'rust';

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
    if (!inString && !inBlockComment) {
      if (isTypeScriptLike && char === "/" && next === "/") {
        inLineComment = true;
        continue;
      }
      if (isRust && char === "/" && next === "/") {
        inLineComment = true;
        continue;
      }
    }
    if (inLineComment) continue;

    // Skip block comments
    if (!inString && !inBlockComment) {
      if (isTypeScriptLike && char === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (isRust && char === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
        continue;
      }
      continue;
    }

    // Handle strings (supports escape characters)
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

// =============================================
// Fix Application Functions
// =============================================

/**
 * Apply fix instructions to file content deterministically
 * No LLM involved - pure code transformation with syntax validation
 */
export function applyFixes(
  content: string,
  fixes: FixInstruction[],
  language: string = 'typescript'
): ApplyFixesResult {
  const lines = content.split('\n');
  const failedFixes: Array<{ fix: FixInstruction; reason: string }> = [];
  let fixesApplied = 0;

  // Sort fixes in reverse line order to preserve line numbers during modification
  const sortedFixes = [...fixes].sort((a, b) => {
    // Primary sort: by line number in descending order
    if (b.line !== a.line) return b.line - a.line;

    // Secondary sort: by action priority for same line
    // This ensures predictable behavior when multiple fixes target the same line
    const actionPriority = {
      delete: 3,      // Delete first (removes lines)
      replace: 2,     // Then replace
      insert_after: 1, // Then insert after
      insert_before: 0 // Finally insert before
    };
    return actionPriority[b.action] - actionPriority[a.action];
  });

  for (const fix of sortedFixes) {
    const lineIndex = fix.line - 1; // Convert to 0-indexed

    // Validate line number is in range
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

          // Validate end line is in range
          if (endLine >= lines.length) {
            failedFixes.push({
              fix,
              reason: `End line ${fix.endLine} out of range (file has ${lines.length} lines)`
            });
            continue;
          }

          // Validate end line is not before start line
          if (endLine < lineIndex) {
            failedFixes.push({
              fix,
              reason: `End line ${fix.endLine} is before start line ${fix.line}`
            });
            continue;
          }

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

          // Validate end line is in range
          if (endLine >= lines.length) {
            failedFixes.push({
              fix,
              reason: `End line ${fix.endLine} out of range (file has ${lines.length} lines)`
            });
            continue;
          }

          // Validate end line is not before start line
          if (endLine < lineIndex) {
            failedFixes.push({
              fix,
              reason: `End line ${fix.endLine} is before start line ${fix.line}`
            });
            continue;
          }

          const deleteCount = endLine - lineIndex + 1;
          lines.splice(lineIndex, deleteCount);
          fixesApplied++;
          break;
        }

        default:
          failedFixes.push({
            fix,
            reason: `Unknown action: ${(fix as any).action}`
          });
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
 * Validate a single fix instruction before applying
 * Returns detailed validation result
 */
export function validateFix(
  fix: FixInstruction,
  content: string,
  language: string = 'typescript'
): { valid: boolean; reason?: string } {
  const lines = content.split('\n');
  const lineIndex = fix.line - 1;

  // Check line number is positive
  if (fix.line < 1) {
    return { valid: false, reason: 'Line number must be >= 1' };
  }

  // Check action is valid
  if (!['replace', 'insert_before', 'insert_after', 'delete'].includes(fix.action)) {
    return { valid: false, reason: `Invalid action: ${fix.action}` };
  }

  // Check content is provided when needed
  if (fix.action !== 'delete' && fix.content === undefined) {
    return { valid: false, reason: `Content required for ${fix.action} action` };
  }

  // Check line range
  if (lineIndex >= lines.length) {
    return {
      valid: false,
      reason: `Line ${fix.line} out of range (file has ${lines.length} lines)`
    };
  }

  // Check end line for multi-line operations
  if (fix.endLine) {
    if (fix.endLine < fix.line) {
      return {
        valid: false,
        reason: `End line ${fix.endLine} is before start line ${fix.line}`
      };
    }
    if (fix.endLine - 1 >= lines.length) {
      return {
        valid: false,
        reason: `End line ${fix.endLine} out of range (file has ${lines.length} lines)`
      };
    }
  }

  // For replace operations, optionally check original content matches
  if (fix.action === 'replace' && fix.original) {
    const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
    const actualContent = lines.slice(lineIndex, endLine + 1).join('\n');
    if (actualContent !== fix.original) {
      return {
        valid: false,
        reason: `Original content mismatch at line ${fix.line}`
      };
    }
  }

  return { valid: true };
}

/**
 * Apply a single fix instruction with detailed error reporting
 */
export function applySingleFix(
  content: string,
  fix: FixInstruction,
  language: string = 'typescript'
): ApplyFixesResult {
  // Validate the fix first
  const validation = validateFix(fix, content, language);
  if (!validation.valid) {
    return {
      success: false,
      content,
      fixesApplied: 0,
      failedFixes: [{ fix, reason: validation.reason! }],
      syntaxValid: validateSyntax(content, language)
    };
  }

  // Apply the fix
  return applyFixes(content, [fix], language);
}

/**
 * Preview changes without applying them
 * Returns a diff-like representation of what would change
 */
export function previewFixes(
  content: string,
  fixes: FixInstruction[]
): Array<{
  line: number;
  action: string;
  before?: string;
  after?: string;
  description: string;
}> {
  const lines = content.split('\n');
  const previews: Array<{
    line: number;
    action: string;
    before?: string;
    after?: string;
    description: string;
  }> = [];

  for (const fix of fixes) {
    const lineIndex = fix.line - 1;
    const description: string[] = [];

    switch (fix.action) {
      case 'replace': {
        const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
        const beforeLines = lines.slice(lineIndex, endLine + 1);
        previews.push({
          line: fix.line,
          action: 'replace',
          before: beforeLines.join('\n'),
          after: fix.content,
          description: `Replace line(s) ${fix.line}${fix.endLine ? `-${fix.endLine}` : ''}`
        });
        break;
      }

      case 'insert_before': {
        previews.push({
          line: fix.line,
          action: 'insert_before',
          after: fix.content,
          description: `Insert before line ${fix.line}`
        });
        break;
      }

      case 'insert_after': {
        previews.push({
          line: fix.line,
          action: 'insert_after',
          after: fix.content,
          description: `Insert after line ${fix.line}`
        });
        break;
      }

      case 'delete': {
        const endLine = fix.endLine ? fix.endLine - 1 : lineIndex;
        const beforeLines = lines.slice(lineIndex, endLine + 1);
        previews.push({
          line: fix.line,
          action: 'delete',
          before: beforeLines.join('\n'),
          description: `Delete line(s) ${fix.line}${fix.endLine ? `-${fix.endLine}` : ''}`
        });
        break;
      }
    }
  }

  return previews;
}