#!/usr/bin/env npx tsx
/**
 * Gated TypeScript Error Fixer V2 - Enhanced Gate Architecture
 *
 * Adapted from Rust fixer with TypeScript-specific logic
 *
 * Architecture:
 * - Phase 1: Cerebras LLM bulk fixer (fast, cheap, ~95%+ reduction)
 * - Phase 2: Dedicated agent cleanup (high quality)
 */

import Cerebras from '@cerebras/cerebras_cloud_sdk';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import {
  gateLineCountDelta,
  gateMethodSignature,
  gateImportDuplicate,
  gateBraceBalance,
  gateSemanticDiff,
  gateOrphanedCode,
  gateImportPathValidator,
  gateTypeAnnotationValidator,
  gateJSXIntegrity,
  gatePatternDuplicate,
  gateImportLocation,
  gateTypeCast,
  gateRegressionSeeds,
  TYPESCRIPT_REGRESSION_SEEDS,
  GateResult
} from '../gates/typescript-gates.js';

// ============== CONFIGURATION ==============

const CONFIG = {
  maxGlobalIterations: 5,
  maxFileRetries: 2,
  maxLayer1Retries: 3,
  maxTokens: 4000,
  model: 'zai-glm-4.6',
  projectPath: process.env.TS_PROJECT_PATH || '/mnt/c/Users/masha/Documents/claude-flow-novice',
  parallelLLMCalls: 10,
  enableLayer3: !process.argv.includes('--no-layer3'),
  dryRun: process.argv.includes('--dry-run'),
  patchDir: '/tmp/ts-fix-patches',
  verbose: process.argv.includes('--verbose'),
  includeTypes: process.argv.includes('--types') ? ['ts', 'tsx'] : ['ts', 'tsx'],
  excludePattern: process.env.TS_EXCLUDE_PATTERN || 'node_modules|dist|build|\\.git',
  // Security limits
  maxFileSize: 1024 * 1024, // 1MB
  maxLineLength: 1000,
  allowedExtensions: ['.ts', '.tsx'],
  apikeyPattern: /^sk-[a-zA-Z0-9]{48}$/,
};

// ============== TYPE DEFINITIONS ==============

type ErrorDifficulty = 'easy' | 'medium' | 'hard';

interface TypeScriptError {
  code: string;
  line: number;
  column: number;
  message: string;
  file: string;
  difficulty: ErrorDifficulty;
  severity?: 'error' | 'warning';
}

interface LineFix {
  line: number;
  action: 'replace' | 'insert_after' | 'insert_before' | 'delete';
  content: string;
}

interface LLMFixResult {
  error: TypeScriptError;
  fixes: LineFix[];
  success: boolean;
  reasoning?: string;
}

interface GateStats {
  layer1Rejections: number;
  layer2Rejections: number;
  layer3Rejections: number;
  layer1Retries: number;
  approvals: number;
  byGate: Record<string, number>;
}

interface GateRejectionLog {
  timestamp: string;
  file: string;
  gate: string;
  reason: string;
  errorCode: string;
}

const ERROR_CLASSIFICATION: Record<string, ErrorDifficulty> = {
  // Easy: Import/module resolution errors
  'TS2307': 'easy',   // Cannot find module
  'TS2304': 'easy',   // Cannot find name
  'TS1192': 'easy',   // Module has no default export
  'TS2614': 'easy',   // Module has no exported member

  // Easy: Property access errors
  'TS2339': 'easy',   // Property does not exist
  'TS2551': 'easy',   // Property does not exist (strict)
  'TS7053': 'easy',   // Element implicitly has 'any' type

  // Medium: Type mismatch errors
  'TS2322': 'medium', // Type mismatch
  'TS7005': 'medium', // Type mismatch (variable)
  'TS2345': 'medium', // Argument type mismatch
  'TS2769': 'medium', // No overload matches
  'TS2554': 'medium', // Expected arguments

  // Medium: Assignment errors
  'TS2416': 'medium', // Property in type incompatible
  'TS2420': 'medium', // Class incorrectly implements interface
  'TS2424': 'medium', // Class definition missing implementation

  // Hard: Generic and complex type errors
  'TS2315': 'hard',   // Type is not generic
  'TS2589': 'hard',   // Type instantiation is excessively deep
  'TS2321': 'hard',   // Excessive stack depth comparing types
  'TS2707': 'hard',   // Generic type requires type arguments

  // Hard: Async/await complex errors
  'TS2740': 'hard',   // Type missing properties from Promise
  'TS2362': 'hard',   // Left-hand side of assignment not assignable
  'TS2571': 'hard',   // Object is possibly 'null'
};

const gateStats: GateStats = {
  layer1Rejections: 0,
  layer2Rejections: 0,
  layer3Rejections: 0,
  layer1Retries: 0,
  approvals: 0,
  byGate: {}
};

const rejectionLog: GateRejectionLog[] = [];

// ============== SECURITY VALIDATION ==============

/**
 * Validate API key format
 */
function validateApiKey(apiKey: string | undefined): boolean {
  if (!apiKey) {
    console.error('❌ Security: CEREBRAS_API_KEY is not set');
    return false;
  }

  if (typeof apiKey !== 'string') {
    console.error('❌ Security: API key is not a string');
    return false;
  }

  // Check for basic format (starts with sk- and reasonable length)
  if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
    console.error('❌ Security: Invalid API key format');
    return false;
  }

  return true;
}

/**
 * Validate and sanitize file path to prevent directory traversal
 */
function validateFilePath(filePath: string, projectPath: string): string {
  // Convert to absolute paths for comparison
  const absFilePath = path.resolve(filePath);
  const absProjectPath = path.resolve(projectPath);

  // Check if the resolved path is within the project directory
  if (!absFilePath.startsWith(absProjectPath)) {
    throw new Error(`Security: Path traversal attempt detected: ${filePath}`);
  }

  // Normalize the path
  const normalizedPath = path.normalize(absFilePath);

  // Check file extension
  const ext = path.extname(normalizedPath);
  if (!CONFIG.allowedExtensions.includes(ext)) {
    throw new Error(`Security: File type not allowed: ${ext}`);
  }

  return normalizedPath;
}

/**
 * Validate file size to prevent DoS
 */
function validateFileSize(filePath: string): void {
  const stats = fs.statSync(filePath);
  if (stats.size > CONFIG.maxFileSize) {
    throw new Error(`Security: File too large: ${filePath} (${stats.size} bytes)`);
  }
}

/**
 * Validate error code format
 */
function validateErrorCode(code: string): boolean {
  // TypeScript error codes are in format TSxxxx where x is a digit
  return /^TS\d{4}$/.test(code);
}

/**
 * Validate line and column numbers
 */
function validateLineAndColumn(line: number, column: number): boolean {
  return Number.isInteger(line) && line > 0 &&
         Number.isInteger(column) && column > 0 && column <= 1000;
}

/**
 * Validate file content for suspicious patterns
 */
function validateFileContent(content: string): void {
  // Check for extremely long lines
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > CONFIG.maxLineLength) {
      throw new Error(`Security: Line ${i + 1} too long (${lines[i].length} characters)`);
    }
  }

  // Check for binary content
  if (content.includes('\0')) {
    throw new Error('Security: Binary content detected');
  }
}

/**
 * Safe file write with atomic operation
 */
function safeWriteFile(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp.${process.pid}`;
  const backupPath = `${filePath}.backup.${Date.now()}`;

  try {
    // Create backup if file exists
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    // Write to temporary file first
    fs.writeFileSync(tempPath, content, { encoding: 'utf8' });

    // Verify the written content
    const writtenContent = fs.readFileSync(tempPath, { encoding: 'utf8' });
    if (writtenContent !== content) {
      throw new Error('Security: File write verification failed');
    }

    // Atomic move
    fs.renameSync(tempPath, filePath);

    // Remove backup on success
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  } catch (error) {
    // Cleanup on failure
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    // Restore from backup if available
    if (fs.existsSync(backupPath)) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(backupPath, filePath);
    }

    throw error;
  }
}

// Initialize cerebras client with security validation
const apiKey = process.env.CEREBRAS_API_KEY;
if (!validateApiKey(apiKey)) {
  process.exit(1);
}

// Redact API key for logging
const redactedApiKey = `${apiKey?.substring(0, 7)}[REDACTED]`;
if (CONFIG.verbose) {
  console.log(`Using API key: ${redactedApiKey}`);
}

const cerebras = new Cerebras({
  apiKey: apiKey || ''
});

// ============== HELPER FUNCTIONS ==============

/**
 * Parse TypeScript compiler errors from tsc output
 */
function parseTypeScriptErrors(output: string): TypeScriptError[] {
  const errors: TypeScriptError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: file(line,column): error TSxxxx: message
    const match = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS(\d+):\s+(.+)$/);
    if (match) {
      const errorCode = `TS${match[5]}`;

      // Validate error code
      if (!validateErrorCode(errorCode)) {
        if (CONFIG.verbose) {
          console.warn(`Skipping invalid error code: ${errorCode}`);
        }
        continue;
      }

      const lineNum = parseInt(match[2]);
      const colNum = parseInt(match[3]);

      // Validate line and column
      if (!validateLineAndColumn(lineNum, colNum)) {
        if (CONFIG.verbose) {
          console.warn(`Skipping invalid line/column: ${lineNum}:${colNum}`);
        }
        continue;
      }

      errors.push({
        file: match[1],
        line: lineNum,
        column: colNum,
        severity: match[4] as 'error' | 'warning',
        code: errorCode,
        message: match[6],
        difficulty: ERROR_CLASSIFICATION[errorCode] || 'medium'
      });
    }
  }

  return errors;
}

/**
 * Get TypeScript compiler errors using secure exec
 */
function getTypeScriptErrors(): TypeScriptError[] {
  try {
    // Use execFileSync for better security (no shell interpretation)
    const result = spawnSync('npx', ['tsc', '--noEmit'], {
      cwd: CONFIG.projectPath,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 30000, // 30 second timeout
    });

    if (result.status === 0) {
      // No errors
      return [];
    }

    // Parse errors from stderr
    const output = result.stderr || result.stdout || '';
    return parseTypeScriptErrors(output);
  } catch (error) {
    console.error('Error running TypeScript compiler:', error);
    return [];
  }
}

/**
 * Apply a fix to a file with security checks
 */
function applyFix(filePath: string, fixes: LineFix[]): boolean {
  try {
    // Validate and normalize the file path
    const validatedPath = validateFilePath(filePath, CONFIG.projectPath);

    // Check file size
    validateFileSize(validatedPath);

    // Read file content
    const content = fs.readFileSync(validatedPath, 'utf8');
    validateFileContent(content);

    const lines = content.split('\n');

    // Sort fixes by line number in reverse to maintain line numbers
    const sortedFixes = [...fixes].sort((a, b) => b.line - a.line);

    // Validate line numbers in fixes
    for (const fix of sortedFixes) {
      if (fix.line < 1 || fix.line > lines.length) {
        console.warn(`Invalid line number: ${fix.line} in ${validatedPath}`);
        return false;
      }
    }

    // Apply fixes
    for (const fix of sortedFixes) {
      const lineIndex = fix.line - 1;

      switch (fix.action) {
        case 'replace':
          lines[lineIndex] = fix.content;
          break;
        case 'insert_after':
          lines.splice(lineIndex + 1, 0, fix.content);
          break;
        case 'insert_before':
          lines.splice(lineIndex, 0, fix.content);
          break;
        case 'delete':
          lines.splice(lineIndex, 1);
          break;
      }
    }

    const newContent = lines.join('\n');

    // Validate the new content
    validateFileContent(newContent);

    if (CONFIG.dryRun) {
      const patchPath = path.join(CONFIG.patchDir, path.relative(CONFIG.projectPath, validatedPath) + '.patch');
      fs.mkdirSync(path.dirname(patchPath), { recursive: true });
      safeWriteFile(patchPath, newContent);
      console.log(`[DRY RUN] Would write patch to: ${patchPath}`);
    } else {
      safeWriteFile(validatedPath, newContent);
    }

    return true;
  } catch (error) {
    console.error(`Error applying fix to ${filePath}:`, error);
    return false;
  }
}

/**
 * Generate prompt for LLM
 */
function generatePrompt(error: TypeScriptError, fileContent: string, context: string = ''): string {
  // Sanitize error message for prompt
  const sanitizedMessage = error.message.replace(/[<>]/g, '');

  return `You are fixing TypeScript compilation errors. Fix the specific error at the provided location.

FILE: ${error.file}
ERROR: ${error.code} at line ${error.line}, column ${error.column}
MESSAGE: ${sanitizedMessage}

RULES:
- Make minimal changes that fix only this error
- Preserve all existing functionality and types
- Do not add unnecessary imports or comments
- Keep the same code style and patterns
- For type errors, prefer explicit typing over 'any'
- For missing modules, check if import path needs correction
- For JSX errors, ensure proper component structure

${context ? `CONTEXT:\n${context}\n` : ''}

CODE TO FIX:
\`\`\`typescript
${fileContent}
\`\`\`

Provide a JSON response with:
{
  "fixes": [
    {
      "line": number,
      "action": "replace" | "insert_after" | "insert_before" | "delete",
      "content": "string"
    }
  ],
  "success": true,
  "reasoning": "Brief explanation of the fix"
}`;
}

/**
 * Run LLM to get fix
 */
async function getLLMFix(error: TypeScriptError, fileContent: string, context: string = ''): Promise<LLMFixResult> {
  try {
    const prompt = generatePrompt(error, fileContent, context);

    const response = await cerebras.chat.completions.create({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: 'You are a TypeScript compiler error fixer. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: CONFIG.maxTokens,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Validate the response structure
    if (!Array.isArray(result.fixes)) {
      throw new Error('Invalid response: fixes is not an array');
    }

    // Validate each fix
    for (const fix of result.fixes) {
      if (!validateLineAndColumn(fix.line || 0, 1)) {
        throw new Error(`Invalid line number in fix: ${fix.line}`);
      }

      if (!['replace', 'insert_after', 'insert_before', 'delete'].includes(fix.action)) {
        throw new Error(`Invalid fix action: ${fix.action}`);
      }

      if (typeof fix.content !== 'string' && fix.action !== 'delete') {
        throw new Error('Invalid fix content');
      }
    }

    return {
      error,
      fixes: result.fixes || [],
      success: result.success !== false,
      reasoning: result.reasoning
    };
  } catch (error) {
    console.error(`LLM error for ${error.file}:${error.line}:`, error);
    return {
      error,
      fixes: [],
      success: false
    };
  }
}

/**
 * Layer 1: Structural Gates (A-K)
 */
function applyLayer1Gates(
  before: string,
  after: string,
  error: TypeScriptError,
  retryContext?: { attempt: number; previousFailures: Array<{ gate: string; reason: string }> }
): { passed: boolean; failedGate?: string; reason?: string } {
  const gates = [
    { name: 'A:LineCount', fn: () => gateLineCountDelta(before, after, error.code) },
    { name: 'B:MethodSig', fn: () => gateMethodSignature(before, after) },
    { name: 'C:ImportDup', fn: () => gateImportDuplicate(after) },
    { name: 'D:BraceBalance', fn: () => gateBraceBalance(after) },
    { name: 'E:SemanticDiff', fn: () => gateSemanticDiff(before, after) },
    { name: 'F:OrphanedCode', fn: () => gateOrphanedCode(after) },
    { name: 'G:ImportPath', fn: () => gateImportPathValidator(after) },
    { name: 'H:TypeAnnotation', fn: () => gateTypeAnnotationValidator(after) },
    { name: 'I:JSXIntegrity', fn: () => gateJSXIntegrity(after) },
    { name: 'J:PatternDup', fn: () => gatePatternDuplicate(after) },
    { name: 'K:ImportLocation', fn: () => gateImportLocation(after) },
    { name: 'L:TypeCast', fn: () => gateTypeCast(before, after) },
    { name: 'M:Regression', fn: () => gateRegressionSeeds(before, after) },
  ];

  for (const gate of gates) {
    try {
      const result = gate.fn();
      if (!result.passed) {
        // Skip regression checks on retries (they're too strict)
        if (retryContext && gate.name === 'M:Regression') {
          continue;
        }

        gateStats.layer1Rejections++;
        gateStats.byGate[gate.name] = (gateStats.byGate[gate.name] || 0) + 1;

        if (CONFIG.verbose) {
          console.log(`  ❌ Gate ${gate.name} rejected: ${result.reason}`);
        }

        return {
          passed: false,
          failedGate: gate.name,
          reason: result.reason
        };
      }
    } catch (error) {
      console.error(`Gate ${gate.name} error:`, error);
      return {
        passed: false,
        failedGate: gate.name,
        reason: `Gate execution error`
      };
    }
  }

  return { passed: true };
}

/**
 * Layer 2: TypeScript Compiler Check
 */
async function applyLayer2Gate(filePath: string): Promise<boolean> {
  try {
    // Validate file path
    const validatedPath = validateFilePath(filePath, CONFIG.projectPath);

    // Run tsc on just this file to check if the error is fixed
    const result = spawnSync('npx', ['tsc', '--noEmit', validatedPath], {
      cwd: CONFIG.projectPath,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    if (result.status === 0) {
      // No errors
      return true;
    }

    const output = result.stderr || result.stdout || '';
    const errors = parseTypeScriptErrors(output);

    // Check if we made progress (reduced error count)
    const fileErrors = errors.filter(e => e.file === filePath);

    // If we have errors, check if we reduced the count
    if (fileErrors.length > 0) {
      gateStats.layer2Rejections++;
      return false;
    }

    return true;
  } catch (error) {
    console.error('Layer 2 gate error:', error);
    gateStats.layer2Rejections++;
    return false;
  }
}

/**
 * Layer 3: LLM Review Gate
 */
async function applyLayer3Gate(
  before: string,
  after: string,
  error: TypeScriptError
): Promise<boolean> {
  if (!CONFIG.enableLayer3) return true;

  try {
    // Sanitize inputs for prompt
    const sanitizedMessage = error.message.replace(/[<>]/g, '');

    const prompt = `Review this TypeScript fix for correctness and safety.

ORIGINAL ERROR: ${error.code} at ${error.file}:${error.line}
ERROR MESSAGE: ${sanitizedMessage}

ORIGINAL CODE:
\`\`\`typescript
${before}
\`\`\`

FIXED CODE:
\`\`\`typescript
${after}
\`\`\`

Checklist:
- Does the fix actually resolve the error?
- Does it introduce new errors or warnings?
- Does it preserve the original semantics?
- Are types correct and not overly permissive?
- Are imports and exports correct?
- Is JSX syntax valid (if applicable)?

Respond with JSON:
{
  "verdict": "APPROVE" | "REJECT",
  "reason": "Explanation",
  "riskLevel": 1-5
}`;

    const response = await cerebras.chat.completions.create({
      model: CONFIG.model,
      messages: [
        { role: 'system', content: 'You are a TypeScript code reviewer. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn('No JSON in Layer 3 review, approving');
      return true;
    }

    const review = JSON.parse(jsonMatch[0]);

    if (review.verdict === 'REJECT') {
      gateStats.layer3Rejections++;
      if (CONFIG.verbose) {
        console.log(`  ❌ Layer 3 rejected: ${review.reason}`);
      }
      return false;
    }

    gateStats.approvals++;
    return true;
  } catch (error) {
    console.error('Layer 3 review error:', error);
    // Default to approve if review fails
    return true;
  }
}

/**
 * Process a single error with retry logic
 */
async function processError(error: TypeScriptError): Promise<boolean> {
  const filePath = path.join(CONFIG.projectPath, error.file);

  // Validate and check file existence
  try {
    const validatedPath = validateFilePath(filePath, CONFIG.projectPath);

    if (!fs.existsSync(validatedPath)) {
      console.warn(`File not found: ${validatedPath}`);
      return false;
    }

    validateFileSize(validatedPath);
    const originalContent = fs.readFileSync(validatedPath, 'utf8');
    validateFileContent(originalContent);

    let currentContent = originalContent;
    let retryCount = 0;
    const retryContext = {
      attempt: 0,
      previousFailures: [] as Array<{ gate: string; reason: string }>
    };

    while (retryCount <= CONFIG.maxFileRetries) {
      retryContext.attempt = retryCount;

      // Get LLM fix
      const fixResult = await getLLMFix(error, currentContent);

      if (!fixResult.success || fixResult.fixes.length === 0) {
        if (CONFIG.verbose) {
          console.log(`  ⚠️  No fix generated for ${error.file}:${error.line}`);
        }
        return false;
      }

      // Apply fix to temporary content
      const tempContent = [...currentContent.split('\n')];
      const sortedFixes = [...fixResult.fixes].sort((a, b) => b.line - a.line);

      for (const fix of sortedFixes) {
        const lineIndex = fix.line - 1;

        switch (fix.action) {
          case 'replace':
            tempContent[lineIndex] = fix.content;
            break;
          case 'insert_after':
            tempContent.splice(lineIndex + 1, 0, fix.content);
            break;
          case 'insert_before':
            tempContent.splice(lineIndex, 0, fix.content);
            break;
          case 'delete':
            tempContent.splice(lineIndex, 1);
            break;
        }
      }

      const fixedContent = tempContent.join('\n');

      // Layer 1: Structural Gates
      const layer1Result = applyLayer1Gates(currentContent, fixedContent, error, retryContext);

      if (!layer1Result.passed) {
        retryCount++;
        gateStats.layer1Retries++;
        retryContext.previousFailures.push({
          gate: layer1Result.failedGate || 'Unknown',
          reason: layer1Result.reason || 'Unknown error'
        });

        if (retryCount <= CONFIG.maxFileRetries) {
          if (CONFIG.verbose) {
            console.log(`  🔄 Retry ${retryCount}/${CONFIG.maxFileRetries} for ${error.file}:${error.line}`);
          }
          continue;
        }

        // Log rejection
        rejectionLog.push({
          timestamp: new Date().toISOString(),
          file: error.file,
          gate: layer1Result.failedGate || 'Unknown',
          reason: layer1Result.reason || 'Unknown error',
          errorCode: error.code
        });

        return false;
      }

      // Layer 2: TypeScript Compiler Check
      const layer2Passed = await applyLayer2Gate(validatedPath);
      if (!layer2Passed) {
        gateStats.layer2Rejections++;
        return false;
      }

      // Layer 3: LLM Review
      const layer3Passed = await applyLayer3Gate(currentContent, fixedContent, error);
      if (!layer3Passed) {
        return false;
      }

      // All gates passed - apply the fix
      const success = applyFix(validatedPath, fixResult.fixes);

      if (success && CONFIG.verbose) {
        console.log(`  ✅ Fixed ${error.file}:${error.line} (${error.code})`);
      }

      return success;
    }

    return false;
  } catch (error) {
    console.error(`Error processing error in ${error.file}:`, error);
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🔧 TypeScript Gated Error Fixer V2');
  console.log(`   Project: ${CONFIG.projectPath}`);
  console.log(`   Model: ${CONFIG.model}`);
  console.log(`   Dry run: ${CONFIG.dryRun}`);

  if (CONFIG.dryRun) {
    console.log(`   Patch dir: ${CONFIG.patchDir}`);
  }

  // Security check: validate project path
  try {
    validateFilePath(CONFIG.projectPath, CONFIG.projectPath);
  } catch (error) {
    console.error('❌ Security: Invalid project path:', error);
    process.exit(1);
  }

  // Get initial error count
  console.log('\n📊 Analyzing TypeScript errors...');
  const initialErrors = getTypeScriptErrors();
  const errorCount = initialErrors.length;

  if (errorCount === 0) {
    console.log('✅ No TypeScript errors found!');
    return;
  }

  console.log(`   Found ${errorCount} errors`);

  // Group errors by file for batch processing
  const errorsByFile = new Map<string, TypeScriptError[]>();
  for (const error of initialErrors) {
    if (!errorsByFile.has(error.file)) {
      errorsByFile.set(error.file, []);
    }
    errorsByFile.get(error.file)!.push(error);
  }

  console.log(`   Across ${errorsByFile.size} files\n`);

  // Process errors
  let fixedCount = 0;
  let totalProcessed = 0;

  for (const [fileName, fileErrors] of errorsByFile.entries()) {
    console.log(`📁 Processing ${fileName} (${fileErrors.length} errors)`);

    for (const error of fileErrors) {
      totalProcessed++;
      const fixed = await processError(error);
      if (fixed) fixedCount++;

      // Progress indicator
      if (totalProcessed % 10 === 0) {
        console.log(`   Progress: ${totalProcessed}/${errorCount} (${Math.round(totalProcessed/errorCount*100)}%)`);
      }
    }
  }

  // Final check
  console.log('\n🔍 Final verification...');
  const finalErrors = getTypeScriptErrors();
  const finalCount = finalErrors.length;

  // Statistics
  console.log('\n📈 Results:');
  console.log(`   Initial errors: ${errorCount}`);
  console.log(`   Final errors: ${finalCount}`);
  console.log(`   Fixed: ${errorCount - finalCount}`);
  console.log(`   Reduction: ${Math.round((errorCount - finalCount) / errorCount * 100)}%`);

  if (CONFIG.verbose || gateStats.layer1Rejections > 0) {
    console.log('\n🚪 Gate Statistics:');
    console.log(`   Layer 1 rejections: ${gateStats.layer1Rejections}`);
    console.log(`   Layer 1 retries: ${gateStats.layer1Retries}`);
    console.log(`   Layer 2 rejections: ${gateStats.layer2Rejections}`);
    console.log(`   Layer 3 rejections: ${gateStats.layer3Rejections}`);
    console.log(`   Approvals: ${gateStats.approvals}`);

    if (Object.keys(gateStats.byGate).length > 0) {
      console.log('\n   Rejections by gate:');
      for (const [gate, count] of Object.entries(gateStats.byGate)) {
        console.log(`     ${gate}: ${count}`);
      }
    }
  }

  // Save rejection log
  if (rejectionLog.length > 0) {
    const logPath = '/tmp/ts-gate-rejections.json';
    try {
      safeWriteFile(logPath, JSON.stringify(rejectionLog, null, 2));
      console.log(`\n📝 Rejection log saved to: ${logPath}`);
    } catch (error) {
      console.error('Failed to save rejection log:', error);
    }
  }

  // Next steps
  if (finalCount > 0) {
    console.log('\n🚀 Phase 1 Complete');
    console.log('   Phase 2: Run dedicated agent for cleanup');
    console.log(`   Command: Spawn typescript-developer agent for remaining ${finalCount} errors`);
  } else {
    console.log('\n✅ All errors fixed!');
  }
}

// Run the fixer
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});