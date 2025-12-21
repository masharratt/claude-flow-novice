#!/usr/bin/env npx tsx
/**
 * Gated Rust Error Fixer V2 - Enhanced Gate Architecture
 *
 * Improvements over V1:
 * - New semantic gates (G-K) for import paths, pattern duplicates, impl location, type casts
 * - Regression seed corpus to catch known-bad patterns
 * - Hardened prompts with explicit preservation rules
 * - Enhanced Layer 3 reviewer with checklist
 * - Dry-run patch mode
 * - Gate rejection logging with feedback loop
 * - Targeted crate compile testing
 */

import createCerebrasClient from './cerebras-wrapper.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============== CONFIGURATION ==============

// Parse --file and --agent-id parameters
const fileArg = process.argv.find(arg => arg.startsWith('--file='));
const agentIdArg = process.argv.find(arg => arg.startsWith('--agent-id='));

const CONFIG = {
  maxGlobalIterations: 5,
  maxFileRetries: 2,
  maxLayer1Retries: 3,  // Max retries when Layer 1 gates reject
  maxTokens: 4000,
  model: 'zai-glm-4.6',
  projectPath: process.env.RUST_PROJECT_PATH || '/mnt/c/Users/masha/Documents/ourstories-v2/services/rust-services',
  parallelLLMCalls: 10,
  enableLayer3: !process.argv.includes('--no-layer3'),
  enableClippy: !process.argv.includes('--no-clippy'),
  dryRun: process.argv.includes('--dry-run'),
  patchDir: '/tmp/rust-fix-patches',
  verbose: process.argv.includes('--verbose'),
  singleFile: fileArg ? fileArg.split('=')[1] : null,  // Single-file mode
  agentId: agentIdArg ? agentIdArg.split('=')[1] : null,  // Agent ID for coordination mode
};

// ============== TYPE DEFINITIONS ==============

type ErrorDifficulty = 'easy' | 'medium' | 'hard';

interface RustError {
  code: string;
  line: number;
  column: number;
  message: string;
  suggestion?: string;
  difficulty: ErrorDifficulty;
}

interface LineFix {
  line: number;
  action: 'replace' | 'insert_after' | 'insert_before' | 'delete';
  content: string;
}

interface LLMFixResult {
  error: RustError;
  fixes: LineFix[];
  success: boolean;
}

interface GateResult {
  passed: boolean;
  reason?: string;
  riskLevel: 1 | 2 | 3 | 4 | 5;
}

interface ReviewResult {
  verdict: 'APPROVE' | 'REJECT';
  reason: string;
  riskLevel: 1 | 2 | 3 | 4 | 5;
}

interface GateStats {
  layer1Rejections: number;
  layer2Rejections: number;
  layer3Rejections: number;
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

interface Layer1RetryContext {
  attempt: number;
  previousFailures: Array<{ gate: string; reason: string }>;
}

const gateStats: GateStats & { layer1Retries: number } = {
  layer1Rejections: 0,
  layer2Rejections: 0,
  layer3Rejections: 0,
  layer1Retries: 0,
  approvals: 0,
  byGate: {}
};

const rejectionLog: GateRejectionLog[] = [];

const ERROR_CLASSIFICATION: Record<string, ErrorDifficulty> = {
  'E0425': 'easy', 'E0433': 'easy', 'E0432': 'easy', 'E0412': 'easy',
  'E0422': 'easy', 'E0599': 'easy', 'E0609': 'easy', 'E0616': 'easy',
  'E0624': 'easy', 'E0603': 'easy', 'E0559': 'easy',
  'E0308': 'medium', 'E0277': 'medium', 'E0061': 'medium', 'E0063': 'medium',
  'E0560': 'medium', 'E0369': 'medium', 'E0507': 'medium', 'E0515': 'medium',
  'E0596': 'medium', 'E0597': 'medium', 'E0283': 'medium', 'E0282': 'medium',
  'E0382': 'hard', 'E0499': 'hard', 'E0502': 'hard', 'E0505': 'hard',
};

// ============== REGRESSION SEED CORPUS ==============

/**
 * Known-bad patterns that should ALWAYS be rejected.
 * These are learned from previous verification agent failures.
 */
const REGRESSION_SEEDS = [
  {
    pattern: /use\s+crate::\w*errors::/,
    antiPattern: /use\s+crate::\w*error::/,
    name: 'error vs errors module confusion',
    description: 'Changed error to errors or vice versa'
  },
  {
    pattern: /(\w+):\s*_,\s*\1:\s*_/,
    name: 'duplicate field binding in match',
    description: 'Same field bound twice in pattern'
  },
  {
    pattern: /impl\s+\w+[^}]*\n\s*(enum|struct)\s+\w+/,
    name: 'impl before type definition',
    description: 'impl block appears to be inside enum/struct'
  },
  {
    pattern: /enum\s+\w+\s*\{[^}]*impl\s+/,
    name: 'impl inside enum',
    description: 'impl block nested inside enum definition'
  },
  {
    pattern: /as\s+usize\s*\)[^;]*\.get\s*\(/,
    name: 'usize cast with Redis get',
    description: 'Redis operations typically need i64, not usize'
  },
  {
    pattern: /\.get\s*\([^)]*as\s+i64/,
    name: 'i64 cast inside get call',
    description: 'Cast should be outside the get call'
  },
];

/**
 * Gate L: Regression Seed Check
 * Validates that the fix doesn't introduce known-bad patterns
 */
function gateRegressionSeeds(before: string, after: string): GateResult {
  for (const seed of REGRESSION_SEEDS) {
    const beforeHas = seed.pattern.test(before);
    const afterHas = seed.pattern.test(after);

    // Pattern introduced by fix
    if (!beforeHas && afterHas) {
      return {
        passed: false,
        reason: `Regression: ${seed.name} - ${seed.description}`,
        riskLevel: 5
      };
    }

    // Check anti-pattern (e.g., error -> errors swap)
    if (seed.antiPattern) {
      const beforeAnti = seed.antiPattern.test(before);
      const afterAnti = seed.antiPattern.test(after);

      if (beforeAnti && !afterAnti && afterHas) {
        return {
          passed: false,
          reason: `Regression: ${seed.name} - swapped pattern`,
          riskLevel: 5
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

// ============== LAYER 1: STRUCTURAL GATES (A-F from V1) ==============

/**
 * Gate A: Line Count Delta Check
 * Rejects fixes that change too many lines for the error type
 */
function gateLineCountDelta(before: string, after: string, errorCode: string): GateResult {
  const beforeLines = before.split('\n').length;
  const afterLines = after.split('\n').length;
  const delta = Math.abs(afterLines - beforeLines);

  const importErrors = ['E0432', 'E0433', 'E0425', 'E0412'];
  if (importErrors.includes(errorCode) && delta > 5) {
    return { passed: false, reason: `Too many line changes (${delta}) for import fix`, riskLevel: 3 };
  }

  if (delta > 20) {
    return { passed: false, reason: `Suspicious line count change: ${delta} lines`, riskLevel: 4 };
  }

  return { passed: true, riskLevel: delta > 10 ? 2 : 1 };
}

/**
 * Gate B: Function Signature Preservation
 * Rejects fixes that change function signatures far from the error
 */
function gateFunctionSignature(before: string, after: string, errorLine: number): GateResult {
  const fnPattern = /fn\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)/g;

  const beforeFns = new Map<string, { sig: string; line: number }>();
  let match;
  let lineNum = 1;

  for (const line of before.split('\n')) {
    fnPattern.lastIndex = 0;
    while ((match = fnPattern.exec(line)) !== null) {
      beforeFns.set(match[1], { sig: match[0], line: lineNum });
    }
    lineNum++;
  }

  lineNum = 1;
  for (const line of after.split('\n')) {
    fnPattern.lastIndex = 0;
    while ((match = fnPattern.exec(line)) !== null) {
      const existing = beforeFns.get(match[1]);
      if (existing && existing.sig !== match[0]) {
        if (Math.abs(existing.line - errorLine) > 15) {
          return {
            passed: false,
            reason: `Function ${match[1]} signature changed but not near error`,
            riskLevel: 4
          };
        }
      }
    }
    lineNum++;
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate C: Import Duplicate Check
 * Rejects fixes that introduce duplicate use statements
 */
function gateImportDuplicates(content: string): GateResult {
  const useStatements = new Map<string, number[]>();
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const useMatch = line.match(/^\s*use\s+(.+);/);
    if (useMatch) {
      const key = useMatch[1].trim();
      if (!useStatements.has(key)) useStatements.set(key, []);
      useStatements.get(key)!.push(idx + 1);
    }
  });

  for (const [stmt, lineNums] of useStatements) {
    if (lineNums.length > 1) {
      return {
        passed: false,
        reason: `Duplicate import "${stmt.substring(0, 40)}..." on lines ${lineNums.join(', ')}`,
        riskLevel: 5
      };
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate D: Brace Balance Check
 * Rejects fixes with unbalanced delimiters
 */
function gateBraceBalance(content: string): GateResult {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  const lines = content.split('\n');
  let inString = false;
  let inChar = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';

      if (char === '"' && prevChar !== '\\') inString = !inString;
      if (char === "'" && prevChar !== '\\' && !inString) inChar = !inChar;

      if (!inString && !inChar) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
        if (char === '[') bracketDepth++;
        if (char === ']') bracketDepth--;
      }
    }

    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      return { passed: false, reason: `Unbalanced delimiters at line ${i + 1}`, riskLevel: 5 };
    }
  }

  if (braceDepth !== 0) {
    return { passed: false, reason: `Unbalanced braces: ${braceDepth > 0 ? 'missing }' : 'extra }'}`, riskLevel: 5 };
  }
  if (parenDepth !== 0) {
    return { passed: false, reason: `Unbalanced parentheses`, riskLevel: 5 };
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate E: Semantic Diff Analysis
 * Rejects fixes that duplicate existing code blocks
 */
function gateSemanticDiff(before: string, after: string): GateResult {
  const beforeLines = new Set(
    before.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 15 && !l.startsWith('//') && !l.startsWith('use '))
  );

  const afterLines = after.split('\n');
  let duplicateCount = 0;

  for (const line of afterLines) {
    const trimmed = line.trim();
    if (trimmed.length > 15 && beforeLines.has(trimmed)) {
      const count = afterLines.filter(l => l.trim() === trimmed).length;
      const originalCount = before.split('\n').filter(l => l.trim() === trimmed).length;
      if (count > originalCount) {
        duplicateCount++;
      }
    }
  }

  if (duplicateCount > 3) {
    return {
      passed: false,
      reason: `${duplicateCount} lines appear more times than in original`,
      riskLevel: 4
    };
  }

  return { passed: true, riskLevel: duplicateCount > 0 ? 2 : 1 };
}

/**
 * Gate F: Orphaned Code Detection
 * Detects semicolons breaking method chains or orphaned pattern fields
 */
function gateOrphanedCode(content: string): GateResult {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || '';

    if (line.endsWith(';') && nextLine.startsWith('.')) {
      return { passed: false, reason: `Semicolon breaks method chain at line ${i + 1}`, riskLevel: 5 };
    }

    if (line.match(/\}\s*=>\s*[\(\{]/) && nextLine.match(/^\w+:\s*_,?$/)) {
      return { passed: false, reason: `Orphaned field pattern at line ${i + 2}`, riskLevel: 5 };
    }
  }

  return { passed: true, riskLevel: 1 };
}

// ============== LAYER 1: NEW SEMANTIC GATES (G-K) ==============

/**
 * Find crate root directory from a file path
 */
function findCrateRoot(filePath: string, projectPath: string): string | null {
  const parts = filePath.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const testPath = path.join(projectPath, ...parts.slice(0, i + 1), 'Cargo.toml');
    if (fs.existsSync(testPath)) {
      return path.join(projectPath, ...parts.slice(0, i + 1));
    }
  }
  return null;
}

/**
 * Gate G: Import Path Validator
 * Validates that `use crate::...` paths match actual filesystem/module structure
 */
function gateImportPath(before: string, after: string, filePath: string): GateResult {
  const beforeImports = new Set(
    before.split('\n')
      .filter(l => l.match(/^\s*use\s+/))
      .map(l => l.trim())
  );

  const afterLines = after.split('\n');
  const newImports: string[] = [];

  for (const line of afterLines) {
    const trimmed = line.trim();
    if (trimmed.match(/^use\s+/) && !beforeImports.has(trimmed)) {
      newImports.push(trimmed);
    }
  }

  const crateDir = findCrateRoot(filePath, CONFIG.projectPath);
  if (!crateDir) return { passed: true, riskLevel: 1 };

  for (const imp of newImports) {
    // Check crate imports
    const crateMatch = imp.match(/use\s+crate::(\w+)/);
    if (crateMatch) {
      const moduleName = crateMatch[1];

      const modFile = path.join(crateDir, 'src', `${moduleName}.rs`);
      const modDir = path.join(crateDir, 'src', moduleName, 'mod.rs');
      const libPath = path.join(crateDir, 'src', 'lib.rs');
      const mainPath = path.join(crateDir, 'src', 'main.rs');

      const moduleExists = fs.existsSync(modFile) || fs.existsSync(modDir);

      if (!moduleExists) {
        // Check if module is declared in lib.rs or main.rs
        let isDeclared = false;
        for (const entryPath of [libPath, mainPath]) {
          if (fs.existsSync(entryPath)) {
            try {
              const content = fs.readFileSync(entryPath, 'utf-8');
              if (content.includes(`mod ${moduleName}`) || content.includes(`pub mod ${moduleName}`)) {
                isDeclared = true;
                break;
              }
            } catch {}
          }
        }

        if (!isDeclared) {
          return {
            passed: false,
            reason: `Import references non-existent module: crate::${moduleName}`,
            riskLevel: 5
          };
        }
      }
    }

    // Check for error vs errors confusion
    if (imp.includes('::error::') || imp.includes('::errors::')) {
      const hasError = before.includes('::error::');
      const hasErrors = before.includes('::errors::');
      const newHasError = imp.includes('::error::');
      const newHasErrors = imp.includes('::errors::');

      if (hasError && newHasErrors && !hasErrors) {
        return {
          passed: false,
          reason: `Import changed 'error' to 'errors' - likely incorrect`,
          riskLevel: 5
        };
      }
      if (hasErrors && newHasError && !hasError) {
        return {
          passed: false,
          reason: `Import changed 'errors' to 'error' - likely incorrect`,
          riskLevel: 5
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate H: Pattern Duplicate Detector
 * Detects duplicate field bindings in match patterns like `field: _, field: _`
 */
function gatePatternDuplicates(content: string): GateResult {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Look for pattern lines with field bindings
    if (line.includes('=>') || line.match(/\{\s*\w+:\s*[_\w]/)) {
      // Extract all field names in pattern (field: _ or field: value)
      const fieldMatches = [...line.matchAll(/(\w+)\s*:\s*[_\w]/g)];
      const fields: string[] = [];

      for (const match of fieldMatches) {
        const field = match[1];
        // Skip common keywords
        if (['ref', 'mut', 'box'].includes(field)) continue;

        if (fields.includes(field)) {
          return {
            passed: false,
            reason: `Duplicate field binding '${field}' in match pattern at line ${i + 1}`,
            riskLevel: 5
          };
        }
        fields.push(field);
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate I: Impl Location Checker
 * Ensures impl blocks are not nested inside enum/struct definitions
 */
function gateImplLocation(content: string): GateResult {
  const lines = content.split('\n');
  let depth = 0;
  let inEnumOrStruct = false;
  let enumStructName = '';
  let enumStructStart = 0;
  let enumStructDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track enum/struct definitions (not impl blocks)
    const typeMatch = trimmed.match(/^(pub\s+)?(enum|struct)\s+(\w+)/);
    if (typeMatch && !trimmed.includes(';')) {
      // Only track if this starts a block (has { or will have { on next line)
      if (trimmed.includes('{') || (i < lines.length - 1 && lines[i + 1].trim().startsWith('{'))) {
        inEnumOrStruct = true;
        enumStructName = typeMatch[3];
        enumStructStart = i + 1;
        enumStructDepth = depth;
      }
    }

    // Count braces
    for (const char of line) {
      if (char === '{') depth++;
      if (char === '}') depth--;
    }

    // Exit enum/struct when we return to original depth
    if (inEnumOrStruct && depth <= enumStructDepth && trimmed.includes('}')) {
      inEnumOrStruct = false;
    }

    // Check for impl inside enum/struct
    if (inEnumOrStruct && depth > enumStructDepth && trimmed.match(/^impl\s+/)) {
      return {
        passed: false,
        reason: `impl block found inside ${enumStructName} definition (line ${enumStructStart})`,
        riskLevel: 5
      };
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate J: Type Cast Validator
 * Detects suspicious type cast changes (e.g., `as i64` <-> `as usize`)
 */
function gateTypeCast(before: string, after: string): GateResult {
  const castPattern = /as\s+(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|usize|isize|f32|f64)/g;

  const beforeCasts = [...before.matchAll(castPattern)];
  const afterCasts = [...after.matchAll(castPattern)];

  const beforeFreq: Record<string, number> = {};
  const afterFreq: Record<string, number> = {};

  for (const m of beforeCasts) beforeFreq[m[1]] = (beforeFreq[m[1]] || 0) + 1;
  for (const m of afterCasts) afterFreq[m[1]] = (afterFreq[m[1]] || 0) + 1;

  // Check for suspicious swaps
  const suspiciousSwaps = [
    ['i64', 'usize'],
    ['usize', 'i64'],
    ['i32', 'usize'],
    ['usize', 'i32'],
  ];

  for (const [from, to] of suspiciousSwaps) {
    const beforeFrom = beforeFreq[from] || 0;
    const afterFrom = afterFreq[from] || 0;
    const beforeTo = beforeFreq[to] || 0;
    const afterTo = afterFreq[to] || 0;

    // Cast type decreased while other increased
    if (beforeFrom > afterFrom && afterTo > beforeTo) {
      return {
        passed: false,
        reason: `Suspicious cast change: 'as ${from}' -> 'as ${to}'`,
        riskLevel: 4
      };
    }
  }

  return { passed: true, riskLevel: 1 };
}

/**
 * Gate K: Match Arm Validator
 * Validates match block structure wasn't significantly altered
 */
function gateMatchArm(before: string, after: string): GateResult {
  // Count match blocks
  const matchCount = (s: string) => (s.match(/\bmatch\s+\w+/g) || []).length;
  const beforeCount = matchCount(before);
  const afterCount = matchCount(after);

  if (Math.abs(beforeCount - afterCount) > 2) {
    return {
      passed: false,
      reason: `Match block count changed significantly: ${beforeCount} -> ${afterCount}`,
      riskLevel: 3
    };
  }

  // Check for orphaned match arms (=> without match)
  const afterLines = after.split('\n');
  for (let i = 0; i < afterLines.length; i++) {
    const line = afterLines[i].trim();
    if (line.match(/^\w+\s*=>\s*\{?$/) && i > 0) {
      // Look backward for a match statement
      let foundMatch = false;
      for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
        if (afterLines[j].includes('match ')) {
          foundMatch = true;
          break;
        }
        if (afterLines[j].trim().startsWith('fn ') || afterLines[j].trim().startsWith('impl ')) {
          break;
        }
      }
      if (!foundMatch) {
        return {
          passed: false,
          reason: `Orphaned match arm at line ${i + 1}`,
          riskLevel: 4
        };
      }
    }
  }

  return { passed: true, riskLevel: 1 };
}

// ============== RUN ALL LAYER 1 GATES ==============

interface GateDefinition {
  name: string;
  check: () => GateResult;
}

function runLayer1Gates(
  before: string,
  after: string,
  errorCode: string,
  errorLine: number,
  filePath: string
): GateResult {
  const gates: GateDefinition[] = [
    // Original gates A-F
    { name: 'LineCount', check: () => gateLineCountDelta(before, after, errorCode) },
    { name: 'FnSignature', check: () => gateFunctionSignature(before, after, errorLine) },
    { name: 'ImportDup', check: () => gateImportDuplicates(after) },
    { name: 'BraceBalance', check: () => gateBraceBalance(after) },
    { name: 'SemanticDiff', check: () => gateSemanticDiff(before, after) },
    { name: 'OrphanedCode', check: () => gateOrphanedCode(after) },
    // New gates G-L
    { name: 'ImportPath', check: () => gateImportPath(before, after, filePath) },
    { name: 'PatternDup', check: () => gatePatternDuplicates(after) },
    { name: 'ImplLocation', check: () => gateImplLocation(after) },
    { name: 'TypeCast', check: () => gateTypeCast(before, after) },
    { name: 'MatchArm', check: () => gateMatchArm(before, after) },
    { name: 'Regression', check: () => gateRegressionSeeds(before, after) },
  ];

  let maxRisk: 1 | 2 | 3 | 4 | 5 = 1;

  for (const gate of gates) {
    const result = gate.check();
    if (!result.passed) {
      if (CONFIG.verbose) {
        console.log(`      [L1] ${gate.name}: ${result.reason}`);
      }
      gateStats.byGate[gate.name] = (gateStats.byGate[gate.name] || 0) + 1;
      return { ...result, reason: `[${gate.name}] ${result.reason}` };
    }
    maxRisk = Math.max(maxRisk, result.riskLevel) as 1 | 2 | 3 | 4 | 5;
  }

  return { passed: true, riskLevel: maxRisk };
}

// ============== LAYER 2: COMPILATION VALIDATION ==============

function getPackageName(filePath: string): string {
  const parts = filePath.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const cargoPath = path.join(CONFIG.projectPath, ...parts.slice(0, i + 1), 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        const match = content.match(/name\s*=\s*"([^"]+)"/);
        if (match) return match[1];
      } catch {}
    }
  }
  return '';
}

function runTargetedCargoCheck(affectedFiles: string[]): { errors: Map<string, RustError[]>; totalCount: number } {
  const packages = new Set<string>();
  for (const file of affectedFiles) {
    const pkg = getPackageName(file);
    if (pkg) packages.add(pkg);
  }

  if (packages.size === 0) return runCargoCheck();

  const pkgArgs = [...packages].map(p => `-p ${p}`).join(' ');
  try {
    execSync(`SQLX_OFFLINE=true cargo check ${pkgArgs} 2>&1`, {
      cwd: CONFIG.projectPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return { errors: new Map(), totalCount: 0 };
  } catch (error: any) {
    const errors = parseCargoErrors(error.stdout || error.stderr || '');
    let totalCount = 0;
    for (const e of errors.values()) totalCount += e.length;
    return { errors, totalCount };
  }
}

function runClippyCheck(filePath: string): { warnings: number; critical: string[] } {
  if (!CONFIG.enableClippy) return { warnings: 0, critical: [] };

  const pkg = getPackageName(filePath);
  if (!pkg) return { warnings: 0, critical: [] };

  try {
    execSync(
      `SQLX_OFFLINE=true cargo clippy -p ${pkg} -- -W clippy::match_same_arms -W clippy::if_same_then_else 2>&1`,
      { cwd: CONFIG.projectPath, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
    return { warnings: 0, critical: [] };
  } catch (error: any) {
    const output = error.stdout || error.stderr || '';
    const warnings = (output.match(/warning:/g) || []).length;

    const criticalPatterns = [
      { pattern: /match_same_arms/, name: 'match_same_arms' },
      { pattern: /if_same_then_else/, name: 'if_same_then_else' },
      { pattern: /redundant_clone/, name: 'redundant_clone' },
      { pattern: /duplicate_mod/, name: 'duplicate_mod' },
    ];

    const critical: string[] = [];
    for (const { pattern, name } of criticalPatterns) {
      if (pattern.test(output)) {
        critical.push(name);
      }
    }

    return { warnings, critical };
  }
}

// ============== LAYER 3: ENHANCED LLM REVIEW ==============

async function llmReviewGate(
  client: any,
  originalCode: string,
  fixedCode: string,
  errorMessage: string,
  filePath: string
): Promise<ReviewResult> {
  const beforeContext = originalCode.split('\n').slice(0, 150).join('\n');
  const afterContext = fixedCode.split('\n').slice(0, 150).join('\n');

  const reviewPrompt = `ROLE: Strict Code Review Gate with Checklist

CHECKLIST - REJECT if ANY violation:
1. Import paths match filesystem (no 'error' vs 'errors' confusion)
2. No duplicate field bindings in match patterns
3. Type casts unchanged unless error explicitly requires it
4. No impl blocks inside enum/struct definitions
5. All added imports reference modules that exist
6. Match block count unchanged
7. No semantic behavior changes beyond the error fix

ERROR: ${errorMessage}
FILE: ${filePath}

BEFORE:
\`\`\`rust
${beforeContext}
\`\`\`

AFTER:
\`\`\`rust
${afterContext}
\`\`\`

Instructions:
- Review the diff against each checklist item
- If ANY violation found, output REJECT with the LINE NUMBER
- Only APPROVE if all 7 checklist items pass

Output ONLY valid JSON:
{"verdict":"APPROVE"|"REJECT","reason":"<cite line numbers if rejecting>","riskLevel":1-5}`;

  try {
    const response = await client.chat.completions.create({
      model: CONFIG.model,
      messages: [{ role: 'user', content: reviewPrompt }],
      max_completion_tokens: 200,
      temperature: 0.0,
    });

    const content = (response as any).choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          verdict: parsed.verdict === 'APPROVE' ? 'APPROVE' : 'REJECT',
          reason: String(parsed.reason || 'Unknown').substring(0, 100),
          riskLevel: Math.min(5, Math.max(1, Number(parsed.riskLevel) || 3)) as 1 | 2 | 3 | 4 | 5,
        };
      } catch {}
    }

    // Default to REJECT if can't parse (fail-safe)
    return { verdict: 'REJECT', reason: 'Could not parse review response', riskLevel: 4 };
  } catch (error: any) {
    console.log(`      [L3] Review API error`);
    return { verdict: 'REJECT', reason: 'API error', riskLevel: 3 };
  }
}

// ============== CORE FUNCTIONS ==============

function loadCerebrasKey(): string {
  const envPaths = ['/mnt/c/Users/masha/Documents/ourstories-v2/.env'];
  for (const envPath of envPaths) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/CEREBRAS_API_KEY=([^\r\n]+)/);
      if (match) return match[1].trim();
    } catch {}
  }
  return process.env.CEREBRAS_API_KEY || '';
}

function parseCargoErrors(output: string): Map<string, RustError[]> {
  const errorsByFile = new Map<string, RustError[]>();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const fileMatch = lines[i].match(/^\s*-->\s+(.+):(\d+):(\d+)/);
    if (!fileMatch) continue;

    const [, filePath, lineNum, colNum] = fileMatch;
    let code = '', message = '', suggestion = '';

    for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
      const errorMatch = lines[j].match(/error\[(E\d{4})\]:\s*(.+)/);
      if (errorMatch) {
        code = errorMatch[1];
        message = errorMatch[2];
        break;
      }
    }

    for (let j = i + 1; j < Math.min(lines.length, i + 20); j++) {
      if (lines[j].includes('help:')) {
        suggestion = lines[j].replace(/.*help:\s*/, '').trim();
        break;
      }
      if (lines[j].match(/^error\[/)) break;
    }

    if (code && message) {
      if (!errorsByFile.has(filePath)) errorsByFile.set(filePath, []);
      errorsByFile.get(filePath)!.push({
        code,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
        message,
        suggestion,
        difficulty: ERROR_CLASSIFICATION[code] || 'medium',
      });
    }
  }
  return errorsByFile;
}

function runCargoCheck(): { errors: Map<string, RustError[]>; totalCount: number } {
  try {
    execSync(`SQLX_OFFLINE=true cargo check 2>&1`, {
      cwd: CONFIG.projectPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return { errors: new Map(), totalCount: 0 };
  } catch (error: any) {
    const errors = parseCargoErrors(error.stdout || error.stderr || '');
    let totalCount = 0;
    for (const e of errors.values()) totalCount += e.length;
    return { errors, totalCount };
  }
}

function applyLineFixes(content: string, fixes: LineFix[]): string {
  const lines = content.split('\n');
  const sortedFixes = [...fixes].sort((a, b) => {
    if (b.line !== a.line) return b.line - a.line;
    const priority = { insert_before: 0, insert_after: 1, replace: 2, delete: 3 };
    return priority[a.action] - priority[b.action];
  });

  const seenLines = new Set<string>();
  const dedupedFixes = sortedFixes.filter(f => {
    const key = `${f.line}-${f.action}`;
    if (seenLines.has(key)) return false;
    seenLines.add(key);
    return true;
  });

  for (const fix of dedupedFixes) {
    const idx = fix.line - 1;
    if (idx < 0 || idx >= lines.length + 10) continue;

    switch (fix.action) {
      case 'replace': if (idx < lines.length) lines[idx] = fix.content; break;
      case 'insert_after': lines.splice(idx + 1, 0, fix.content); break;
      case 'insert_before': lines.splice(idx, 0, fix.content); break;
      case 'delete': if (idx < lines.length) lines.splice(idx, 1); break;
    }
  }
  return lines.join('\n');
}

function getCrateContext(filePath: string): string {
  const crateDir = findCrateRoot(filePath, CONFIG.projectPath);
  if (!crateDir) return '';

  let context = '';

  const libPath = path.join(crateDir, 'src', 'lib.rs');
  const mainPath = path.join(crateDir, 'src', 'main.rs');
  const entryPath = fs.existsSync(libPath) ? libPath : (fs.existsSync(mainPath) ? mainPath : '');

  if (entryPath) {
    try {
      const content = fs.readFileSync(entryPath, 'utf-8');
      const lines = content.split('\n');
      const exports = lines.slice(0, 100).filter(l =>
        l.match(/^pub\s+(mod|use|struct|enum|type|trait|fn)\s+/) ||
        l.match(/^mod\s+\w+;/)
      );
      if (exports.length > 0) {
        context += `\nCRATE EXPORTS:\n${exports.join('\n')}\n`;
      }
    } catch {}
  }

  return context;
}

function parseJsonResponse(response: string): LineFix[] | null {
  const patterns = [/\[\s*\{[\s\S]*?\}\s*\]/g, /```json\s*([\s\S]*?)\s*```/, /```\s*([\s\S]*?)\s*```/];
  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1] || match[0]);
        if (Array.isArray(parsed)) {
          return parsed.filter(f =>
            typeof f.line === 'number' &&
            ['replace', 'insert_after', 'insert_before', 'delete'].includes(f.action) &&
            typeof f.content === 'string'
          );
        }
      } catch {}
    }
  }
  return null;
}

function buildPrompt(error: RustError, fileContent: string, filePath: string, feedback?: string, layer1Context?: Layer1RetryContext): string {
  const lines = fileContent.split('\n');
  const contextSize = 20;
  const start = Math.max(0, error.line - contextSize - 1);
  const end = Math.min(lines.length, error.line + contextSize);

  const errorContext = lines.slice(start, end).map((line, i) => {
    const num = start + i + 1;
    const marker = num === error.line ? ' >>> ' : '     ';
    return `${num}:${marker}${line}`;
  }).join('\n');

  const imports = lines.filter(l =>
    l.startsWith('use ') || l.startsWith('pub use ') ||
    l.startsWith('mod ') || l.startsWith('pub mod ')
  ).slice(0, 60).join('\n');

  const crateContext = getCrateContext(filePath);

  // Build Layer 1 failure feedback if retrying
  let layer1Feedback = '';
  if (layer1Context && layer1Context.previousFailures.length > 0) {
    layer1Feedback = `
PREVIOUS LAYER 1 GATE FAILURES (attempt ${layer1Context.attempt}/${CONFIG.maxLayer1Retries}):
${layer1Context.previousFailures.map((f, i) => `  ${i + 1}. [${f.gate}] ${f.reason}`).join('\n')}

Your previous fix was REJECTED by these structural validation gates. You MUST:
- Avoid the specific issues mentioned above
- Generate a DIFFERENT fix that passes these gates
- If Gate BraceBalance failed: ensure all {}, (), [] are balanced
- If Gate ImportDup failed: do NOT add imports that already exist
- If Gate FnSignature failed: do NOT change function signatures
- If Gate SemanticDiff failed: do NOT duplicate existing code
- If Gate ImportPath failed: verify module paths exist
- If Gate PatternDup failed: no duplicate field bindings in match

`;
  }

  // HARDENED PROMPT with explicit preservation rules
  const prompt = `Fix this Rust error. Return ONLY JSON array.
${layer1Feedback}

ERROR: [${error.code}] ${error.message}
${error.suggestion ? `HINT: ${error.suggestion}` : ''}
FILE: ${filePath}

CURRENT IMPORTS:
${imports}
${crateContext}
CODE (line ${error.line}):
${errorContext}

CRITICAL RULES (VIOLATIONS WILL BE REJECTED):
1. PRESERVE EXACT MODULE PATHS - Do not change 'error' to 'errors' or vice versa
2. NO DUPLICATE IMPORTS - Never add an import that already exists
3. NO DUPLICATE PATTERN BINDINGS - Never use same field twice in a match pattern
4. KEEP TYPE CASTS UNCHANGED - Do not change 'as i64' to 'as usize' unless error requires it
5. NO IMPL INSIDE ENUM/STRUCT - impl blocks must be outside type definitions
6. IMPORTS MUST EXIST - Only add imports for modules declared in lib.rs/mod.rs
7. PRESERVE FUNCTION SIGNATURES - Don't change fn signatures unless error requires it
8. FAIL-SAFE - Return [] if uncertain about the fix

${feedback ? `PREVIOUS FIX FAILED: ${feedback}\nAdjust your fix accordingly.\n` : ''}
OUTPUT: JSON array only
[{"line": N, "action": "replace"|"insert_after"|"insert_before"|"delete", "content": "exact line"}]

Return [] if unsure or if fix requires significant changes.
JSON:`;

  return prompt;
}

async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);
  }
  return results;
}

async function getLLMFix(
  client: any,
  error: RustError,
  fileContent: string,
  filePath: string,
  feedback?: string,
  layer1Context?: Layer1RetryContext
): Promise<LLMFixResult> {
  const prompt = buildPrompt(error, fileContent, filePath, feedback, layer1Context);

  try {
    const response = await client.chat.completions.create({
      model: CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: CONFIG.maxTokens,
      temperature: 0.1,
    });

    const content = (response as any).choices?.[0]?.message?.content || '';
    const fixes = parseJsonResponse(content);

    return {
      error,
      fixes: fixes || [],
      success: fixes !== null && fixes.length > 0,
    };
  } catch (err: any) {
    return { error, fixes: [], success: false };
  }
}

function generateUnifiedDiff(before: string, after: string, filePath: string): string {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  let diff = `--- a/${filePath}\n+++ b/${filePath}\n`;

  // Simple line-by-line diff (not a true unified diff, but useful)
  const maxLines = Math.max(beforeLines.length, afterLines.length);
  let inHunk = false;
  let hunkStart = 0;
  let hunkLines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const beforeLine = beforeLines[i] || '';
    const afterLine = afterLines[i] || '';

    if (beforeLine !== afterLine) {
      if (!inHunk) {
        inHunk = true;
        hunkStart = i + 1;
        hunkLines = [`@@ -${hunkStart},3 +${hunkStart},3 @@`];
      }
      if (beforeLines[i] !== undefined) hunkLines.push(`-${beforeLine}`);
      if (afterLines[i] !== undefined) hunkLines.push(`+${afterLine}`);
    } else {
      if (inHunk) {
        hunkLines.push(` ${beforeLine}`);
        if (hunkLines.length > 10) {
          diff += hunkLines.join('\n') + '\n';
          inHunk = false;
          hunkLines = [];
        }
      }
    }
  }

  if (hunkLines.length > 0) {
    diff += hunkLines.join('\n') + '\n';
  }

  return diff;
}

async function processFileWithGates(
  client: any,
  filePath: string,
  errors: RustError[],
  feedback?: Map<number, string>
): Promise<{ applied: number; content: string }> {
  const fullPath = path.join(CONFIG.projectPath, filePath);
  const originalContent = fs.readFileSync(fullPath, 'utf-8');

  const fixableErrors = errors.filter(e => e.difficulty !== 'hard');
  if (fixableErrors.length === 0) {
    return { applied: 0, content: originalContent };
  }

  // Layer 1 retry context for tracking failures across attempts
  const layer1RetryContext: Layer1RetryContext = {
    attempt: 0,
    previousFailures: []
  };

  let candidateContent = '';
  let successCount = 0;
  let layer1RiskLevel: 1 | 2 | 3 | 4 | 5 = 1;

  // ===== LAYER 1 RETRY LOOP =====
  while (layer1RetryContext.attempt < CONFIG.maxLayer1Retries) {
    layer1RetryContext.attempt++;

    // Get LLM fixes (with retry context if not first attempt)
    const llmResults = await processInChunks(
      fixableErrors,
      (error) => getLLMFix(
        client,
        error,
        originalContent,
        filePath,
        feedback?.get(error.line),
        layer1RetryContext.attempt > 1 ? layer1RetryContext : undefined
      ),
      CONFIG.parallelLLMCalls
    );

    const allFixes: LineFix[] = [];
    successCount = 0;
    for (const result of llmResults) {
      if (result.success && result.fixes.length > 0) {
        allFixes.push(...result.fixes);
        successCount++;
      }
    }

    if (allFixes.length === 0) {
      if (layer1RetryContext.attempt === 1) {
        return { applied: 0, content: originalContent };
      }
      // No fixes on retry, give up
      console.log(`      No fixes generated on retry ${layer1RetryContext.attempt}`);
      return { applied: 0, content: originalContent };
    }

    candidateContent = applyLineFixes(originalContent, allFixes);

    // ===== LAYER 1: Pre-application structural gates =====
    const attemptLabel = layer1RetryContext.attempt > 1
      ? ` (retry ${layer1RetryContext.attempt}/${CONFIG.maxLayer1Retries})`
      : '';
    console.log(`    [L1] Running 12 structural gates...${attemptLabel}`);

    const layer1Result = runLayer1Gates(
      originalContent,
      candidateContent,
      errors[0].code,
      errors[0].line,
      filePath
    );

    if (layer1Result.passed) {
      console.log(`      OK (risk: ${layer1Result.riskLevel}/5)`);
      layer1RiskLevel = layer1Result.riskLevel;
      break;  // Exit retry loop on success
    }

    // Gate failed - record failure and potentially retry
    const failedGate = layer1Result.reason?.match(/\[(\w+)\]/)?.[1] || 'Unknown';
    layer1RetryContext.previousFailures.push({
      gate: failedGate,
      reason: layer1Result.reason || 'Unknown'
    });

    gateStats.byGate[failedGate] = (gateStats.byGate[failedGate] || 0) + 1;

    if (layer1RetryContext.attempt >= CONFIG.maxLayer1Retries) {
      // Final attempt failed, reject
      gateStats.layer1Rejections++;
      rejectionLog.push({
        timestamp: new Date().toISOString(),
        file: filePath,
        gate: 'Layer1',
        reason: `Failed after ${layer1RetryContext.attempt} attempts: ${layer1Result.reason}`,
        errorCode: errors[0].code
      });
      console.log(`      REJECTED after ${layer1RetryContext.attempt} retries: ${layer1Result.reason}`);
      return { applied: 0, content: originalContent };
    }

    // Log retry
    gateStats.layer1Retries++;
    console.log(`      Gate failed [${failedGate}]: ${layer1Result.reason}`);
    console.log(`      Retrying with feedback (attempt ${layer1RetryContext.attempt + 1}/${CONFIG.maxLayer1Retries})...`);
  }

  // ===== LAYER 3: LLM Review Gate (for high-risk fixes) =====
  if (CONFIG.enableLayer3 && layer1RiskLevel >= 2) {
    console.log(`    [L3] LLM review with checklist...`);
    const reviewResult = await llmReviewGate(
      client,
      originalContent,
      candidateContent,
      errors.map(e => `[${e.code}] ${e.message}`).join('; '),
      filePath
    );

    if (reviewResult.verdict === 'REJECT') {
      console.log(`      REJECTED: ${reviewResult.reason}`);
      gateStats.layer3Rejections++;
      rejectionLog.push({
        timestamp: new Date().toISOString(),
        file: filePath,
        gate: 'Layer3-LLMReview',
        reason: reviewResult.reason,
        errorCode: errors[0].code
      });
      return { applied: 0, content: originalContent };
    }
    console.log(`      APPROVED (risk: ${reviewResult.riskLevel}/5)`);
  }

  // ===== DRY-RUN MODE =====
  if (CONFIG.dryRun) {
    const patchContent = generateUnifiedDiff(originalContent, candidateContent, filePath);
    const patchFile = path.join(CONFIG.patchDir, `${path.basename(filePath)}.patch`);
    fs.mkdirSync(CONFIG.patchDir, { recursive: true });
    fs.writeFileSync(patchFile, patchContent);
    console.log(`    [DRY-RUN] Patch written to ${patchFile}`);
    return { applied: 0, content: originalContent };
  }

  gateStats.approvals++;
  return { applied: successCount, content: candidateContent };
}

async function main() {
  console.log('=== Gated Rust Error Fixer V2 ===');
  console.log('Enhanced Gate Architecture with 12 Layer-1 Gates + Retry-with-Feedback');
  console.log();
  console.log('Gates:');
  console.log('  A: LineCount    B: FnSignature  C: ImportDup    D: BraceBalance');
  console.log('  E: SemanticDiff F: OrphanedCode G: ImportPath   H: PatternDup');
  console.log('  I: ImplLocation J: TypeCast     K: MatchArm     L: Regression');
  console.log();
  console.log(`Layer 3 LLM Review: ${CONFIG.enableLayer3 ? 'ON' : 'OFF'}`);
  console.log(`Clippy: ${CONFIG.enableClippy ? 'ON' : 'OFF'}`);
  console.log(`Dry-Run: ${CONFIG.dryRun ? 'ON' : 'OFF'}`);
  if (CONFIG.singleFile) {
    console.log(`Single-File Mode: ${CONFIG.singleFile}`);
    if (CONFIG.agentId) {
      console.log(`Agent ID: ${CONFIG.agentId}`);
    }
  }
  console.log();

  const apiKey = loadCerebrasKey();
  if (!apiKey) {
    console.error('No CEREBRAS_API_KEY found');
    process.exit(1);
  }
  const client = createCerebrasClient(apiKey);

  let iteration = 0;
  let previousErrorCount = Infinity;
  const allAffectedFiles: string[] = [];

  while (iteration < CONFIG.maxGlobalIterations) {
    iteration++;
    console.log(`\n========== ITERATION ${iteration} ==========`);

    console.log('Running cargo check...');
    const { errors: allErrors, totalCount } = runCargoCheck();

    console.log(`Found ${totalCount} errors in ${allErrors.size} files`);

    if (totalCount === 0) {
      console.log('\n*** All errors fixed! ***');
      break;
    }

    if (totalCount >= previousErrorCount) {
      console.log(`\nNo progress (${totalCount} >= ${previousErrorCount}). Stopping.`);
      break;
    }

    previousErrorCount = totalCount;

    const originalContents = new Map<string, string>();
    const fileFeedback = new Map<string, Map<number, string>>();

    let totalApplied = 0;
    let files = [...allErrors.entries()];

    // Single-file mode: filter to only the specified file
    if (CONFIG.singleFile) {
      files = files.filter(([filePath]) => filePath === CONFIG.singleFile);
      if (files.length === 0) {
        console.log(`\nSingle-file mode: No errors found in ${CONFIG.singleFile}`);
        console.log('File may have already been fixed or has no compilation errors.');
        break;
      }
    }

    for (const [filePath, errors] of files) {
      const fullPath = path.join(CONFIG.projectPath, filePath);
      try {
        originalContents.set(filePath, fs.readFileSync(fullPath, 'utf-8'));
      } catch { continue; }

      const feedback = fileFeedback.get(filePath);
      console.log(`\n  ${filePath}: ${errors.length} errors`);

      const result = await processFileWithGates(client, filePath, errors, feedback);

      if (result.applied > 0) {
        fs.writeFileSync(fullPath, result.content);
        console.log(`    Applied ${result.applied} fixes`);
        totalApplied += result.applied;
        allAffectedFiles.push(filePath);
      } else {
        console.log(`    No fixes passed gates`);
      }
    }

    if (totalApplied === 0) {
      console.log('\nNo fixes applied this iteration. Stopping.');
      break;
    }

    // ===== LAYER 2: Targeted compilation validation =====
    console.log('\n[L2] Validating changes (targeted crates)...');
    const { totalCount: newCount, errors: newErrors } = runTargetedCargoCheck(allAffectedFiles);

    if (newCount > totalCount) {
      console.log(`\n[L2] FAILED: More errors (${newCount} > ${totalCount})`);
      gateStats.layer2Rejections++;

      for (const [filePath, original] of originalContents) {
        const fullPath = path.join(CONFIG.projectPath, filePath);
        fs.writeFileSync(fullPath, original);
      }

      for (const [filePath, errors] of newErrors) {
        if (!fileFeedback.has(filePath)) {
          fileFeedback.set(filePath, new Map());
        }
        for (const error of errors) {
          fileFeedback.get(filePath)!.set(error.line, `Previous fix caused: ${error.message}`);
        }
      }

      console.log('Rolled back. Will retry with feedback.');
    } else {
      const reduced = totalCount - newCount;
      console.log(`[L2] OK: Reduced by ${reduced} (${totalCount} -> ${newCount})`);
    }
  }

  // ===== FINAL SUMMARY =====
  console.log('\n========== FINAL SUMMARY ==========');
  const { totalCount: finalCount } = runCargoCheck();
  console.log(`Final error count: ${finalCount}`);

  console.log('\n========== GATE STATISTICS ==========');
  console.log(`Layer 1 rejections: ${gateStats.layer1Rejections}`);
  console.log(`Layer 1 retries: ${gateStats.layer1Retries}`);
  console.log(`Layer 2 rejections: ${gateStats.layer2Rejections}`);
  console.log(`Layer 3 rejections: ${gateStats.layer3Rejections}`);
  console.log(`Approved fixes: ${gateStats.approvals}`);

  if (Object.keys(gateStats.byGate).length > 0) {
    console.log('\nRejections by gate:');
    for (const [gate, count] of Object.entries(gateStats.byGate).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${gate}: ${count}`);
    }
  }

  const totalAttempts = gateStats.approvals + gateStats.layer1Rejections +
                        gateStats.layer2Rejections + gateStats.layer3Rejections;
  if (totalAttempts > 0) {
    const rejectionRate = ((gateStats.layer1Rejections + gateStats.layer2Rejections +
                           gateStats.layer3Rejections) / totalAttempts * 100).toFixed(1);
    console.log(`\nRejection rate: ${rejectionRate}%`);
  }

  // Save rejection log
  if (rejectionLog.length > 0) {
    const logPath = '/tmp/gate-rejections.json';
    fs.writeFileSync(logPath, JSON.stringify(rejectionLog, null, 2));
    console.log(`\nGate rejections logged to ${logPath}`);
  }
}

main().catch(console.error);
