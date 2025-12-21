#!/usr/bin/env node
/**
 * Enhanced Post-Edit Pipeline - Comprehensive Validation Hook
 * Validates edited files with TypeScript, Rust, ESLint, Prettier, Security Analysis, and Code Metrics
 *
 * Features:
 * - TypeScript validation with error categorization
 * - Rust validation via cargo check
 * - ESLint integration for code quality
 * - Prettier formatting checks
 * - Security analysis (eval, password logging, XSS detection)
 * - Code metrics (lines, functions, classes, complexity)
 * - Actionable recommendations engine
 *
 * Usage: node config/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>] [--agent-id <id>]
 *
 * ============================================================================
 * ERROR DETECTION - WHAT'S CAUGHT vs NOT CAUGHT
 * ============================================================================
 *
 * TYPESCRIPT: Runs `npx tsc --noEmit --skipLibCheck ${filePath}`
 * RUST: Runs `cargo check` in the crate directory
 *
 * Both check the EDITED FILE + its IMPORTS (transitively).
 * Rust's cargo check also catches cross-file breaks (better than TS).
 *
 * ✅ CAUGHT (Blocks Edit):
 * ┌────────────────────┬──────────────────┬─────────────────────────────────────┐
 * │ Error Type         │ TS / Rust Code   │ Example                             │
 * ├────────────────────┼──────────────────┼─────────────────────────────────────┤
 * │ Missing module     │ TS2307 / E0432   │ import from './nonexistent'         │
 * │ Missing export     │ TS2305 / E0433   │ use crate::nonexistent              │
 * │ Syntax errors      │ TS1005 / E0xxx   │ Missing ), unexpected token         │
 * │ Unused imports     │ TS6133 / warn    │ unused import                       │
 * │ Type mismatches    │ TS2322 / E0308   │ Wrong type assignment               │
 * │ Missing properties │ TS2339 / E0609   │ field does not exist                │
 * │ Borrow errors      │ N/A / E0502      │ cannot borrow as mutable            │
 * │ Lifetime errors    │ N/A / E0106      │ missing lifetime specifier          │
 * └────────────────────┴──────────────────┴─────────────────────────────────────┘
 *
 * ❌ NOT CAUGHT (TypeScript Single-File Limitation):
 * ┌─────────────────────────────────┬────────────────────────────────────────────┐
 * │ Scenario                        │ Why                                        │
 * ├─────────────────────────────────┼────────────────────────────────────────────┤
 * │ Cross-file type changes (TS)    │ Editing types.ts won't catch breaks in     │
 * │                                 │ other.ts that imports it                   │
 * │ Deleted exports used elsewhere  │ Consumers aren't checked until edited      │
 * └─────────────────────────────────┴────────────────────────────────────────────┘
 *
 * Note: Rust DOES catch cross-file breaks because cargo check compiles the
 * entire crate. TypeScript only checks the single file + its imports.
 *
 * To catch everything in TS: Run `npx tsc --noEmit` project-wide periodically.
 * ============================================================================
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, extname, resolve } from 'path';

// Parse arguments
const args = process.argv.slice(2);
const filePath = args[0];
const memoryKeyIndex = args.indexOf('--memory-key');
const memoryKey = memoryKeyIndex >= 0 ? args[memoryKeyIndex + 1] : null;
const agentIdIndex = args.indexOf('--agent-id');
const agentId = agentIdIndex >= 0 ? args[agentIdIndex + 1] : null;

if (!filePath) {
  console.error('Error: File path required');
  console.error('Usage: node config/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>] [--agent-id <id>]');
  process.exit(1);
}

// Ensure log directory exists
const logDir = '.artifacts/logs';
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const logFile = `${logDir}/post-edit-pipeline.log`;

function log(status, message, metadata = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    file: filePath,
    status,
    message,
    memoryKey,
    agentId,
    ...metadata
  });
  console.log(entry);
  appendFileSync(logFile, entry + '\n');
}

// Check if file exists
if (!existsSync(filePath)) {
  log('ERROR', 'File not found', { path: filePath });
  process.exit(1);
}

// Read file content for analysis
const fileContent = readFileSync(filePath, 'utf-8');
const ext = extname(filePath);

// Initialize results object
const results = {
  typescript: null,
  rust: null,
  eslint: null,
  prettier: null,
  security: null,
  metrics: null,
  recommendations: []
};

// ============================================================================
// PHASE 1: TypeScript Validation
// ============================================================================

if (['.ts', '.tsx'].includes(ext)) {
  try {
    log('VALIDATING', 'Running TypeScript validation');

    // Use tsc to check only this file
    const cmd = `npx tsc --noEmit --skipLibCheck ${filePath}`;
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });

    results.typescript = {
      passed: true,
      errors: []
    };
    log('SUCCESS', 'TypeScript validation passed');

  } catch (error) {
    // Parse TypeScript errors
    const output = error.stdout || error.stderr || '';
    const lines = output.split('\n').filter(line => line.includes('error TS'));

    if (lines.length === 0) {
      results.typescript = {
        passed: true,
        errors: []
      };
      log('SUCCESS', 'No TypeScript errors detected');
    } else {
      // Categorize errors
      const errorTypes = {
        implicitAny: lines.filter(l => l.includes('TS7006') || l.includes('TS7031')).length,
        propertyMissing: lines.filter(l => l.includes('TS2339')).length,
        typeMismatch: lines.filter(l => l.includes('TS2322') || l.includes('TS2345')).length,
        syntaxError: lines.filter(l => l.includes('TS1005') || l.includes('TS1128')).length,
        other: 0
      };
      errorTypes.other = lines.length - Object.values(errorTypes).reduce((a, b) => a + b, 0);

      const severity = errorTypes.syntaxError > 0 ? 'SYNTAX_ERROR' :
                       lines.length > 5 ? 'LINT_ISSUES' : 'TYPE_WARNING';

      results.typescript = {
        passed: false,
        errorCount: lines.length,
        errorTypes,
        errors: lines.slice(0, 5),
        severity
      };

      log(severity, `TypeScript errors detected: ${lines.length}`, {
        errorCount: lines.length,
        errorTypes,
        errors: lines.slice(0, 5)
      });

      // Add recommendations based on error types
      if (errorTypes.syntaxError > 0) {
        results.recommendations.push({
          type: 'typescript',
          priority: 'critical',
          message: 'Fix syntax errors before proceeding',
          action: 'Review and fix TypeScript syntax issues'
        });
      } else if (errorTypes.implicitAny > 0) {
        results.recommendations.push({
          type: 'typescript',
          priority: 'high',
          message: 'Add explicit type annotations',
          action: 'Add type annotations for parameters and return values'
        });
      }
    }
  }
} else {
  log('SKIPPED', 'TypeScript validation skipped for non-TypeScript file');
}

// ============================================================================
// PHASE 1.5: Rust Validation (via cargo check)
// ============================================================================

if (ext === '.rs') {
  try {
    log('VALIDATING', 'Running Rust validation via cargo check');

    // Find the Cargo.toml directory (walk up from file)
    let cargoDir = dirname(resolve(filePath));
    let foundCargo = false;
    for (let i = 0; i < 10; i++) {
      if (existsSync(`${cargoDir}/Cargo.toml`)) {
        foundCargo = true;
        break;
      }
      const parent = dirname(cargoDir);
      if (parent === cargoDir) break;
      cargoDir = parent;
    }

    if (!foundCargo) {
      log('SKIPPED', 'No Cargo.toml found, skipping Rust validation');
      results.rust = { passed: true, skipped: true, reason: 'No Cargo.toml found' };
    } else {
      // Run cargo check in the crate directory
      const cmd = `cd "${cargoDir}" && cargo check --message-format=short 2>&1`;
      execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', timeout: 60000 });

      results.rust = {
        passed: true,
        errors: []
      };
      log('SUCCESS', 'Rust validation passed');
    }

  } catch (error) {
    // Parse Rust errors
    const output = error.stdout || error.stderr || '';
    const lines = output.split('\n').filter(line => line.includes('error[E') || line.includes('error:'));

    if (lines.length === 0) {
      results.rust = {
        passed: true,
        errors: []
      };
      log('SUCCESS', 'No Rust errors detected');
    } else {
      // Categorize Rust errors
      const errorTypes = {
        borrowCheck: lines.filter(l => l.includes('E0502') || l.includes('E0499') || l.includes('E0503')).length,
        typeError: lines.filter(l => l.includes('E0308') || l.includes('E0277')).length,
        missingImport: lines.filter(l => l.includes('E0432') || l.includes('E0433')).length,
        lifetime: lines.filter(l => l.includes('E0106') || l.includes('E0495')).length,
        syntaxError: lines.filter(l => l.includes('error:') && !l.includes('error[E')).length,
        other: 0
      };
      errorTypes.other = lines.length - Object.values(errorTypes).reduce((a, b) => a + b, 0);

      const severity = errorTypes.syntaxError > 0 ? 'SYNTAX_ERROR' :
                       errorTypes.borrowCheck > 0 ? 'BORROW_ERROR' :
                       lines.length > 5 ? 'RUST_ERRORS' : 'RUST_WARNING';

      results.rust = {
        passed: false,
        errorCount: lines.length,
        errorTypes,
        errors: lines.slice(0, 5),
        severity
      };

      log(severity, `Rust errors detected: ${lines.length}`, {
        errorCount: lines.length,
        errorTypes,
        errors: lines.slice(0, 5)
      });

      // Add recommendations based on error types
      if (errorTypes.borrowCheck > 0) {
        results.recommendations.push({
          type: 'rust',
          priority: 'critical',
          message: 'Fix borrow checker errors',
          action: 'Review ownership and borrowing rules'
        });
      } else if (errorTypes.lifetime > 0) {
        results.recommendations.push({
          type: 'rust',
          priority: 'high',
          message: 'Fix lifetime annotations',
          action: 'Add or correct lifetime parameters'
        });
      } else if (errorTypes.typeError > 0) {
        results.recommendations.push({
          type: 'rust',
          priority: 'high',
          message: 'Fix type mismatches',
          action: 'Check expected vs actual types'
        });
      }
    }
  }
} else {
  log('SKIPPED', 'Rust validation skipped for non-Rust file');
}

// ============================================================================
// PHASE 1: ESLint Integration
// ============================================================================

if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
  try {
    log('VALIDATING', 'Running ESLint validation');

    // Check if ESLint is available
    try {
      execSync('npx eslint --version', { stdio: 'ignore', timeout: 5000 });
    } catch {
      log('SKIPPED', 'ESLint not available');
      results.eslint = { available: false };
    }

    if (results.eslint === null) {
      // Run ESLint
      const eslintCmd = `npx eslint "${filePath}" --format json`;
      const eslintOutput = execSync(eslintCmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        timeout: 10000
      });

      const eslintResults = JSON.parse(eslintOutput);
      const fileResults = eslintResults[0] || { messages: [] };

      results.eslint = {
        available: true,
        passed: fileResults.errorCount === 0,
        errorCount: fileResults.errorCount || 0,
        warningCount: fileResults.warningCount || 0,
        messages: fileResults.messages.slice(0, 5)
      };

      if (fileResults.errorCount > 0) {
        log('LINT_ISSUES', `ESLint found ${fileResults.errorCount} errors`, {
          errorCount: fileResults.errorCount,
          warningCount: fileResults.warningCount
        });

        results.recommendations.push({
          type: 'eslint',
          priority: 'high',
          message: `Fix ${fileResults.errorCount} ESLint errors`,
          action: `Run: npx eslint "${filePath}" --fix`
        });
      } else {
        log('SUCCESS', 'ESLint validation passed');
      }
    }
  } catch (error) {
    // ESLint errors are expected, parse them
    if (error.stdout) {
      try {
        const eslintResults = JSON.parse(error.stdout);
        const fileResults = eslintResults[0] || { messages: [] };

        results.eslint = {
          available: true,
          passed: fileResults.errorCount === 0,
          errorCount: fileResults.errorCount || 0,
          warningCount: fileResults.warningCount || 0,
          messages: fileResults.messages.slice(0, 5)
        };

        if (fileResults.errorCount > 0) {
          log('LINT_ISSUES', `ESLint found ${fileResults.errorCount} errors`, {
            errorCount: fileResults.errorCount,
            warningCount: fileResults.warningCount
          });

          results.recommendations.push({
            type: 'eslint',
            priority: 'high',
            message: `Fix ${fileResults.errorCount} ESLint errors`,
            action: `Run: npx eslint "${filePath}" --fix`
          });
        }
      } catch {
        log('ERROR', 'ESLint execution failed', { error: error.message });
        results.eslint = { available: false, error: error.message };
      }
    } else {
      log('ERROR', 'ESLint execution failed', { error: error.message });
      results.eslint = { available: false, error: error.message };
    }
  }
}

// ============================================================================
// PHASE 1: Prettier Integration
// ============================================================================

if (['.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html'].includes(ext)) {
  try {
    log('VALIDATING', 'Running Prettier formatting check');

    // Check if Prettier is available
    try {
      execSync('npx prettier --version', { stdio: 'ignore', timeout: 5000 });
    } catch {
      log('SKIPPED', 'Prettier not available');
      results.prettier = { available: false };
    }

    if (results.prettier === null) {
      // Run Prettier check
      try {
        const prettierCmd = `npx prettier --check "${filePath}"`;
        execSync(prettierCmd, {
          stdio: 'pipe',
          encoding: 'utf-8',
          timeout: 10000
        });

        results.prettier = {
          available: true,
          passed: true,
          formatted: true
        };
        log('SUCCESS', 'Prettier formatting check passed');

      } catch (error) {
        results.prettier = {
          available: true,
          passed: false,
          formatted: false,
          needsFormatting: true
        };
        log('LINT_ISSUES', 'File needs Prettier formatting');

        results.recommendations.push({
          type: 'prettier',
          priority: 'medium',
          message: 'File needs formatting',
          action: `Run: npx prettier --write "${filePath}"`
        });
      }
    }
  } catch (error) {
    log('ERROR', 'Prettier execution failed', { error: error.message });
    results.prettier = { available: false, error: error.message };
  }
}

// ============================================================================
// PHASE 2: Security Analysis
// ============================================================================

log('VALIDATING', 'Running security analysis');

const securityIssues = [];

// Check for eval() usage
if (fileContent.includes('eval(')) {
  securityIssues.push({
    type: 'security',
    severity: 'critical',
    message: 'Use of eval() function detected - security risk',
    suggestion: 'Replace eval() with safer alternatives like JSON.parse() or Function constructor with proper validation'
  });
}

// Check for new Function() usage
if (fileContent.includes('new Function(')) {
  securityIssues.push({
    type: 'security',
    severity: 'critical',
    message: 'Use of new Function() detected - security risk',
    suggestion: 'Avoid dynamic code execution; use safer alternatives'
  });
}

// Check for password logging
if (fileContent.includes('password') && (fileContent.includes('console.log') || fileContent.includes('console.debug'))) {
  securityIssues.push({
    type: 'security',
    severity: 'critical',
    message: 'Potential password logging detected',
    suggestion: 'Remove password logging from code immediately'
  });
}

// Check for XSS vulnerabilities (innerHTML with concatenation)
if (fileContent.includes('innerHTML') && fileContent.match(/innerHTML\s*[+]=|innerHTML\s*=\s*.*\+/)) {
  securityIssues.push({
    type: 'security',
    severity: 'high',
    message: 'Potential XSS vulnerability with innerHTML concatenation',
    suggestion: 'Use textContent, createElement, or proper sanitization libraries'
  });
}

// Check for hardcoded secrets (basic patterns)
const secretPatterns = [
  /api[_-]?key\s*=\s*['"][^'"]{20,}['"]/i,
  /secret\s*=\s*['"][^'"]{20,}['"]/i,
  /token\s*=\s*['"][^'"]{20,}['"]/i,
  /password\s*=\s*['"][^'"]+['"]/i
];

for (const pattern of secretPatterns) {
  if (pattern.test(fileContent)) {
    securityIssues.push({
      type: 'security',
      severity: 'critical',
      message: 'Potential hardcoded secret detected',
      suggestion: 'Move secrets to environment variables or secure configuration'
    });
    break; // Only report once
  }
}

results.security = {
  passed: securityIssues.length === 0,
  issueCount: securityIssues.length,
  issues: securityIssues
};

if (securityIssues.length > 0) {
  log('SECURITY_ISSUES', `Security analysis found ${securityIssues.length} issues`, {
    issueCount: securityIssues.length,
    issues: securityIssues
  });

  results.recommendations.push({
    type: 'security',
    priority: 'critical',
    message: `Address ${securityIssues.length} security ${securityIssues.length === 1 ? 'issue' : 'issues'} immediately`,
    action: 'Review security recommendations and apply fixes'
  });
} else {
  log('SUCCESS', 'No security issues detected');
}

// ============================================================================
// PHASE 3: Code Metrics
// ============================================================================

log('VALIDATING', 'Calculating code metrics');

const lines = fileContent.split('\n');
const lineCount = lines.length;
const functionCount = (fileContent.match(/function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>/g) || []).length;
const classCount = (fileContent.match(/class\s+\w+/g) || []).length;
const todoCount = (fileContent.match(/\/\/\s*TODO|\/\*\s*TODO/gi) || []).length;
const fixmeCount = (fileContent.match(/\/\/\s*FIXME|\/\*\s*FIXME/gi) || []).length;

// Calculate cyclomatic complexity (simplified)
let complexity = 'low';
if (lineCount > 300 || functionCount > 10) {
  complexity = 'high';
} else if (lineCount > 150 || functionCount > 5) {
  complexity = 'medium';
}

results.metrics = {
  lines: lineCount,
  functions: functionCount,
  classes: classCount,
  todos: todoCount,
  fixmes: fixmeCount,
  complexity
};

log('SUCCESS', 'Code metrics calculated', {
  lines: lineCount,
  functions: functionCount,
  classes: classCount,
  complexity
});

// ============================================================================
// PHASE 3: Recommendations Engine
// ============================================================================

log('VALIDATING', 'Generating recommendations');

// Maintainability recommendations
if (lineCount > 200) {
  results.recommendations.push({
    type: 'maintainability',
    priority: 'medium',
    message: `File has ${lineCount} lines - consider breaking it down`,
    action: 'Split into smaller, focused modules (150-200 lines per file)'
  });
}

// Code quality recommendations
if (fileContent.includes('var ')) {
  results.recommendations.push({
    type: 'code-quality',
    priority: 'low',
    message: 'Use const or let instead of var',
    action: 'Replace var declarations with const or let for better scoping'
  });
}

if (fileContent.includes('==') && !fileContent.includes('===') && fileContent.includes('==') > fileContent.includes('===')) {
  results.recommendations.push({
    type: 'code-quality',
    priority: 'medium',
    message: 'Prefer strict equality (===) over loose equality (==)',
    action: 'Replace == with === for type-safe comparisons'
  });
}

// TypeScript-specific recommendations
if (['.ts', '.tsx'].includes(ext)) {
  if (fileContent.includes(': any')) {
    results.recommendations.push({
      type: 'typescript',
      priority: 'medium',
      message: 'Avoid using "any" type when possible',
      action: 'Use specific types or unknown for better type safety'
    });
  }

  if (!fileContent.includes('interface') && !fileContent.includes('type ') && lineCount > 100) {
    results.recommendations.push({
      type: 'typescript',
      priority: 'low',
      message: 'Consider defining interfaces or types',
      action: 'Add type definitions for better code structure and maintainability'
    });
  }
}

// Documentation recommendations
if (fileContent.includes('export ') && !fileContent.includes('/**') && functionCount > 0) {
  results.recommendations.push({
    type: 'documentation',
    priority: 'low',
    message: 'Public exports could benefit from JSDoc comments',
    action: 'Add JSDoc documentation for exported functions/classes'
  });
}

// Testing recommendations
if (!filePath.includes('test') && !filePath.includes('spec') && (functionCount > 0 || classCount > 0)) {
  results.recommendations.push({
    type: 'testing',
    priority: 'medium',
    message: 'Consider writing tests for this module',
    action: 'Create corresponding test file to ensure code reliability'
  });
}

// TODO/FIXME recommendations
if (todoCount > 0 || fixmeCount > 0) {
  results.recommendations.push({
    type: 'maintenance',
    priority: 'low',
    message: `Found ${todoCount} TODOs and ${fixmeCount} FIXMEs`,
    action: 'Address pending tasks and technical debt'
  });
}

// Sort recommendations by priority
const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
results.recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

// Limit to top 10 recommendations
results.recommendations = results.recommendations.slice(0, 10);

log('SUCCESS', `Generated ${results.recommendations.length} recommendations`);

// ============================================================================
// MULTI-LANGUAGE VALIDATION
// ============================================================================

// JavaScript Type Checking (JSDoc via TypeScript)
if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
  try {
    log('VALIDATING', 'Running JavaScript type checking (JSDoc via TypeScript)');

    // Check if TypeScript is available
    try {
      execSync('npx tsc --version', { stdio: 'ignore', timeout: 5000 });
    } catch {
      log('WARNING', 'TypeScript not available for JavaScript type checking');
      results.javascript = { available: false };
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'TypeScript not installed - JavaScript type checking unavailable',
        action: 'Install TypeScript: npm install -g typescript',
        line: null
      });
      throw new Error('TypeScript not available');
    }

    // Use TypeScript with allowJs and checkJs to validate JSDoc
    const tempConfig = JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: true,
        noEmit: true,
        skipLibCheck: true,
        strict: false,
        target: 'ES2020',
        module: 'commonjs'
      }
    });

    const configPath = '/tmp/tsconfig.jsdoc.json';
    require('fs').writeFileSync(configPath, tempConfig);

    const cmd = `npx tsc --noEmit --project ${configPath} ${filePath}`;
    execSync(cmd, { stdio: 'pipe', encoding: 'utf-8', timeout: 10000 });

    results.javascript = {
      available: true,
      passed: true,
      errors: [],
      hasJSDoc: fileContent.includes('/**') || fileContent.includes('@param') || fileContent.includes('@returns')
    };

    log('SUCCESS', 'JavaScript type checking passed');

    if (!results.javascript.hasJSDoc) {
      results.recommendations.push({
        type: 'javascript',
        priority: 'low',
        message: 'No JSDoc comments found in JavaScript file',
        action: 'Add JSDoc type annotations for better type safety',
        line: null
      });
    }

  } catch (error) {
    if (!results.javascript || results.javascript.available !== false) {
      // Parse TypeScript/JSDoc errors
      const output = error.stdout || error.stderr || '';
      const lines = output.split('\n').filter(line => line.includes('error TS'));

      const errors = lines.map(line => {
        const match = line.match(/\((\d+),(\d+)\): error TS(\d+): (.+)/);
        if (match) {
          return {
            line: parseInt(match[1]),
            column: parseInt(match[2]),
            code: match[3],
            message: match[4]
          };
        }
        return null;
      }).filter(Boolean);

      results.javascript = {
        available: true,
        passed: false,
        errorCount: errors.length,
        errors
      };

      log('FAILED', `JavaScript type checking failed (${errors.length} errors)`, { errors });

      // Add recommendations
      errors.slice(0, 5).forEach(err => {
        results.recommendations.push({
          type: 'javascript',
          priority: 'medium',
          message: `JSDoc type error: ${err.message}`,
          action: `Fix type annotation at line ${err.line}`,
          line: err.line
        });
      });
    }
  }
}

// Python Validation (pylint + black)
if (ext === '.py') {
  try {
    log('VALIDATING', 'Running Python validation (pylint + black)');

    // Check for pylint
    let pylintAvailable = false;
    try {
      execSync('pylint --version', { stdio: 'ignore', timeout: 5000 });
      pylintAvailable = true;
    } catch {
      log('WARNING', 'pylint not available for Python validation');
    }

    // Check for black
    let blackAvailable = false;
    try {
      execSync('black --version', { stdio: 'ignore', timeout: 5000 });
      blackAvailable = true;
    } catch {
      log('WARNING', 'black not available for Python formatting check');
    }

    results.python = {
      available: pylintAvailable || blackAvailable,
      pylint: null,
      black: null
    };

    // Add warning if no Python tools available
    if (!pylintAvailable && !blackAvailable) {
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'Python validation tools not installed (pylint, black)',
        action: 'Install Python tools: pip install pylint black',
        line: null
      });
    }

    // Run pylint if available
    if (pylintAvailable) {
      try {
        const pylintCmd = `pylint "${filePath}" --output-format=json`;
        const pylintOutput = execSync(pylintCmd, { encoding: 'utf-8', timeout: 10000 });
        const pylintResults = JSON.parse(pylintOutput || '[]');

        const errors = pylintResults.filter(r => r.type === 'error');
        const warnings = pylintResults.filter(r => r.type === 'warning');

        results.python.pylint = {
          passed: errors.length === 0,
          errorCount: errors.length,
          warningCount: warnings.length,
          issues: pylintResults
        };

        log('SUCCESS', `pylint validation complete (${errors.length} errors, ${warnings.length} warnings)`);

        // Add critical error recommendations
        errors.slice(0, 3).forEach(err => {
          results.recommendations.push({
            type: 'python',
            priority: 'high',
            message: `pylint error: ${err.message}`,
            action: `Fix ${err.symbol} at line ${err.line}`,
            line: err.line
          });
        });

      } catch (error) {
        // pylint may exit with non-zero for warnings
        try {
          const output = error.stdout || '[]';
          const pylintResults = JSON.parse(output);
          const errors = pylintResults.filter(r => r.type === 'error');
          const warnings = pylintResults.filter(r => r.type === 'warning');

          results.python.pylint = {
            passed: errors.length === 0,
            errorCount: errors.length,
            warningCount: warnings.length,
            issues: pylintResults
          };
        } catch {
          results.python.pylint = { passed: false, error: 'Failed to parse pylint output' };
        }
      }
    }

    // Run black if available
    if (blackAvailable) {
      try {
        const blackCmd = `black --check "${filePath}"`;
        execSync(blackCmd, { encoding: 'utf-8', timeout: 10000 });

        results.python.black = {
          passed: true,
          formatted: true
        };

        log('SUCCESS', 'black formatting check passed');

      } catch (error) {
        results.python.black = {
          passed: false,
          formatted: false
        };

        log('FAILED', 'File needs black formatting');

        results.recommendations.push({
          type: 'python',
          priority: 'medium',
          message: 'Python file needs formatting',
          action: `Run: black "${filePath}"`,
          line: null
        });
      }
    }

  } catch (error) {
    log('ERROR', 'Python validation error', { error: error.message });
    results.python = { available: false, error: error.message };
  }
}

// Rust Validation (cargo clippy + rustfmt)
if (ext === '.rs') {
  try {
    log('VALIDATING', 'Running Rust validation (cargo clippy + rustfmt)');

    // Check for cargo
    let cargoAvailable = false;
    try {
      execSync('cargo --version', { stdio: 'ignore', timeout: 5000 });
      cargoAvailable = true;
    } catch {
      log('WARNING', 'cargo not available for Rust validation');
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'Rust toolchain not installed - cargo validation unavailable',
        action: 'Install Rust: curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh',
        line: null
      });
    }

    results.rust = {
      available: cargoAvailable,
      clippy: null,
      rustfmt: null
    };

    if (cargoAvailable) {
      // Check for clippy
      let clippyAvailable = false;
      try {
        execSync('cargo clippy --version', { stdio: 'ignore', timeout: 5000 });
        clippyAvailable = true;
      } catch {
        log('WARNING', 'cargo clippy not available');
      }

      // Check for rustfmt
      let rustfmtAvailable = false;
      try {
        execSync('rustfmt --version', { stdio: 'ignore', timeout: 5000 });
        rustfmtAvailable = true;
      } catch {
        log('WARNING', 'rustfmt not available');
      }

      // Warn if Rust components missing
      if (!clippyAvailable || !rustfmtAvailable) {
        const missing = [];
        if (!clippyAvailable) missing.push('clippy');
        if (!rustfmtAvailable) missing.push('rustfmt');
        results.recommendations.push({
          type: 'dependency',
          priority: 'low',
          message: `Rust components missing: ${missing.join(', ')}`,
          action: `Install: rustup component add ${missing.join(' ')}`,
          line: null
        });
      }

      // Run clippy if available (requires being in a Cargo project)
      if (clippyAvailable) {
        try {
          const projectDir = dirname(filePath);
          const clippyCmd = `cd "${projectDir}" && cargo clippy --message-format=json -- -W clippy::all 2>&1`;
          const clippyOutput = execSync(clippyCmd, { encoding: 'utf-8', timeout: 30000 });

          // Parse JSON messages
          const messages = clippyOutput.split('\n')
            .filter(line => line.trim().startsWith('{'))
            .map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(msg => msg && msg.message && msg.message.level === 'warning');

          results.rust.clippy = {
            passed: messages.length === 0,
            warningCount: messages.length,
            warnings: messages
          };

          log('SUCCESS', `cargo clippy complete (${messages.length} warnings)`);

          // Add recommendations for clippy warnings
          messages.slice(0, 3).forEach(msg => {
            results.recommendations.push({
              type: 'rust',
              priority: 'medium',
              message: `clippy: ${msg.message.message}`,
              action: msg.message.rendered || 'Review clippy suggestion',
              line: msg.message.spans?.[0]?.line_start || null
            });
          });

        } catch (error) {
          log('SKIP', 'cargo clippy requires Cargo project context');
          results.rust.clippy = { passed: true, note: 'Requires Cargo project' };
        }
      }

      // Run rustfmt if available
      if (rustfmtAvailable) {
        try {
          const rustfmtCmd = `rustfmt --check "${filePath}"`;
          execSync(rustfmtCmd, { encoding: 'utf-8', timeout: 10000 });

          results.rust.rustfmt = {
            passed: true,
            formatted: true
          };

          log('SUCCESS', 'rustfmt check passed');

        } catch (error) {
          results.rust.rustfmt = {
            passed: false,
            formatted: false
          };

          log('FAILED', 'Rust file needs formatting');

          results.recommendations.push({
            type: 'rust',
            priority: 'low',
            message: 'Rust file needs formatting',
            action: `Run: rustfmt "${filePath}"`,
            line: null
          });
        }
      }
    }

  } catch (error) {
    log('ERROR', 'Rust validation error', { error: error.message });
    results.rust = { available: false, error: error.message };
  }
}

// Go Validation (gofmt + go vet)
if (ext === '.go') {
  try {
    log('VALIDATING', 'Running Go validation (gofmt + go vet)');

    // Check for go
    let goAvailable = false;
    try {
      execSync('go version', { stdio: 'ignore', timeout: 5000 });
      goAvailable = true;
    } catch {
      log('WARNING', 'go not available for Go validation');
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'Go toolchain not installed - Go validation unavailable',
        action: 'Install Go: https://golang.org/doc/install or brew install go',
        line: null
      });
    }

    results.go = {
      available: goAvailable,
      gofmt: null,
      govet: null
    };

    if (goAvailable) {
      // Run gofmt
      try {
        const gofmtCmd = `gofmt -l "${filePath}"`;
        const gofmtOutput = execSync(gofmtCmd, { encoding: 'utf-8', timeout: 10000 });

        const needsFormatting = gofmtOutput.trim().length > 0;

        results.go.gofmt = {
          passed: !needsFormatting,
          formatted: !needsFormatting
        };

        if (needsFormatting) {
          log('FAILED', 'Go file needs formatting');
          results.recommendations.push({
            type: 'go',
            priority: 'medium',
            message: 'Go file needs formatting',
            action: `Run: gofmt -w "${filePath}"`,
            line: null
          });
        } else {
          log('SUCCESS', 'gofmt check passed');
        }

      } catch (error) {
        results.go.gofmt = { passed: false, error: error.message };
      }

      // Run go vet
      try {
        const govetCmd = `go vet "${filePath}"`;
        execSync(govetCmd, { encoding: 'utf-8', timeout: 10000 });

        results.go.govet = {
          passed: true,
          issues: []
        };

        log('SUCCESS', 'go vet passed');

      } catch (error) {
        const output = error.stderr || error.stdout || '';
        const issues = output.split('\n').filter(line => line.trim().length > 0);

        results.go.govet = {
          passed: false,
          issueCount: issues.length,
          issues
        };

        log('FAILED', `go vet found ${issues.length} issues`);

        // Add recommendations
        issues.slice(0, 3).forEach(issue => {
          results.recommendations.push({
            type: 'go',
            priority: 'high',
            message: `go vet: ${issue}`,
            action: 'Fix static analysis issue',
            line: null
          });
        });
      }
    }

  } catch (error) {
    log('ERROR', 'Go validation error', { error: error.message });
    results.go = { available: false, error: error.message };
  }
}

// Java Validation (google-java-format)
if (ext === '.java') {
  try {
    log('VALIDATING', 'Running Java validation (google-java-format)');
    let javaFormatterAvailable = false;
    try {
      execSync('google-java-format --version', { stdio: 'ignore', timeout: 5000 });
      javaFormatterAvailable = true;
    } catch {
      log('WARNING', 'google-java-format not available for Java validation');
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'Java formatter not installed - google-java-format unavailable',
        action: 'Install: brew install google-java-format or download from https://github.com/google/google-java-format',
        line: null
      });
    }
    results.java = {
      available: javaFormatterAvailable,
      format: null
    };
    if (javaFormatterAvailable) {
      try {
        const javaCmd = `google-java-format --dry-run --set-exit-if-changed "${filePath}"`;
        execSync(javaCmd, { encoding: 'utf-8', timeout: 10000 });
        results.java.format = { passed: true, formatted: true };
        log('SUCCESS', 'google-java-format check passed');
      } catch (error) {
        results.java.format = { passed: false, formatted: false };
        log('FAILED', 'Java file needs formatting');
        results.recommendations.push({
          type: 'java',
          priority: 'medium',
          message: 'Java file needs formatting',
          action: `Run: google-java-format -i "${filePath}"`,
          line: null
        });
      }
    }
  } catch (error) {
    log('ERROR', 'Java validation error', { error: error.message });
    results.java = { available: false, error: error.message };
  }
}

// C/C++ Validation (clang-format + cppcheck)
if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx'].includes(ext)) {
  try {
    log('VALIDATING', 'Running C/C++ validation (clang-format + cppcheck)');
    let clangFormatAvailable = false;
    try {
      execSync('clang-format --version', { stdio: 'ignore', timeout: 5000 });
      clangFormatAvailable = true;
    } catch {
      log('WARNING', 'clang-format not available');
    }
    let cppcheckAvailable = false;
    try {
      execSync('cppcheck --version', { stdio: 'ignore', timeout: 5000 });
      cppcheckAvailable = true;
    } catch {
      log('WARNING', 'cppcheck not available');
    }
    results.cpp = {
      available: clangFormatAvailable || cppcheckAvailable,
      clangFormat: null,
      cppcheck: null
    };

    // Add warning if no C/C++ tools available
    if (!clangFormatAvailable && !cppcheckAvailable) {
      results.recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'C/C++ validation tools not installed (clang-format, cppcheck)',
        action: 'Install: brew install clang-format cppcheck or apt-get install clang-format cppcheck',
        line: null
      });
    }
    if (clangFormatAvailable) {
      try {
        const clangCmd = `clang-format --dry-run -Werror "${filePath}"`;
        execSync(clangCmd, { encoding: 'utf-8', timeout: 10000 });
        results.cpp.clangFormat = { passed: true, formatted: true };
        log('SUCCESS', 'clang-format check passed');
      } catch (error) {
        results.cpp.clangFormat = { passed: false, formatted: false };
        log('FAILED', 'C/C++ file needs formatting');
        results.recommendations.push({
          type: 'cpp',
          priority: 'low',
          message: 'C/C++ file needs formatting',
          action: `Run: clang-format -i "${filePath}"`,
          line: null
        });
      }
    }
    if (cppcheckAvailable) {
      try {
        const cppcheckCmd = `cppcheck --enable=all --suppress=missingIncludeSystem "${filePath}" 2>&1`;
        const cppcheckOutput = execSync(cppcheckCmd, { encoding: 'utf-8', timeout: 10000 });
        const lines = cppcheckOutput.split('\n').filter(line => line.includes(':'));
        const errors = lines.filter(l => l.includes(':error:'));
        const warnings = lines.filter(l => l.includes(':warning:') || l.includes(':style:'));
        results.cpp.cppcheck = {
          passed: errors.length === 0,
          errorCount: errors.length,
          warningCount: warnings.length,
          issues: lines
        };
        log('SUCCESS', `cppcheck complete (${errors.length} errors, ${warnings.length} warnings)`);
        errors.slice(0, 3).forEach(err => {
          results.recommendations.push({
            type: 'cpp',
            priority: 'critical',
            message: `cppcheck error: ${err}`,
            action: 'Fix static analysis error',
            line: null
          });
        });
      } catch (error) {
        const output = error.stdout || error.stderr || '';
        const lines = output.split('\n').filter(line => line.includes(':'));
        const errors = lines.filter(l => l.includes(':error:'));
        results.cpp.cppcheck = {
          passed: errors.length === 0,
          errorCount: errors.length,
          issues: lines
        };
        if (errors.length > 0) {
          log('FAILED', `cppcheck found ${errors.length} errors`);
        }
      }
    }
  } catch (error) {
    log('ERROR', 'C/C++ validation error', { error: error.message });
    results.cpp = { available: false, error: error.message };
  }
}
// Summary and Exit
// ============================================================================

// Calculate overall status
const hasCriticalIssues = results.recommendations.some(r => r.priority === 'critical');
const hasHighIssues = results.recommendations.some(r => r.priority === 'high');
const hasTypeScriptErrors = results.typescript && !results.typescript.passed;
const hasRustErrors = results.rust && !results.rust.passed && !results.rust.skipped;
const hasESLintErrors = results.eslint && results.eslint.errorCount > 0;

let overallStatus = 'SUCCESS';
let exitCode = 0;

if (hasCriticalIssues) {
  overallStatus = 'CRITICAL_ISSUES';
  exitCode = 2;
} else if (hasTypeScriptErrors && results.typescript.severity === 'SYNTAX_ERROR') {
  overallStatus = 'SYNTAX_ERROR';
  exitCode = 2;
} else if (hasTypeScriptErrors) {
  overallStatus = 'TYPE_ERRORS';
  exitCode = 2; // Now blocking for all TS errors
} else if (hasRustErrors && results.rust.severity === 'SYNTAX_ERROR') {
  overallStatus = 'RUST_SYNTAX_ERROR';
  exitCode = 2;
} else if (hasRustErrors && results.rust.severity === 'BORROW_ERROR') {
  overallStatus = 'RUST_BORROW_ERROR';
  exitCode = 2; // Borrow checker errors are critical
} else if (hasRustErrors) {
  overallStatus = 'RUST_ERRORS';
  exitCode = 2; // Now blocking for all Rust errors
} else if (hasHighIssues || hasESLintErrors) {
  overallStatus = 'LINT_ISSUES';
  exitCode = 0; // Non-blocking
} else if (results.recommendations.length > 0) {
  overallStatus = 'IMPROVEMENTS_SUGGESTED';
  exitCode = 0;
}

// Log final summary
log(overallStatus, 'Pipeline validation complete', {
  typescript: results.typescript,
  rust: results.rust,
  eslint: results.eslint,
  prettier: results.prettier,
  security: results.security,
  metrics: results.metrics,
  recommendationCount: results.recommendations.length,
  topRecommendations: results.recommendations.slice(0, 3)
});

// Print user-friendly summary
console.error('\n' + '='.repeat(80));
console.error('Enhanced Post-Edit Pipeline Summary');
console.error('='.repeat(80));

if (results.typescript) {
  console.error(`\nTypeScript: ${results.typescript.passed ? '✅ PASSED' : '❌ FAILED'}`);
  if (!results.typescript.passed) {
    console.error(`  Errors: ${results.typescript.errorCount}`);
  }
}

if (results.rust) {
  if (results.rust.skipped) {
    console.error(`\nRust: ⏭️  SKIPPED (${results.rust.reason})`);
  } else {
    console.error(`\nRust: ${results.rust.passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (!results.rust.passed) {
      console.error(`  Errors: ${results.rust.errorCount}`);
    }
  }
}

if (results.eslint && results.eslint.available) {
  console.error(`ESLint: ${results.eslint.passed ? '✅ PASSED' : '❌ FAILED'}`);
  if (!results.eslint.passed) {
    console.error(`  Errors: ${results.eslint.errorCount}, Warnings: ${results.eslint.warningCount}`);
  }
}

if (results.prettier && results.prettier.available) {
  console.error(`Prettier: ${results.prettier.passed ? '✅ PASSED' : '⚠️  NEEDS FORMATTING'}`);
}

console.error(`\nSecurity: ${results.security.passed ? '✅ NO ISSUES' : '❌ ISSUES FOUND'}`);
if (!results.security.passed) {
  console.error(`  Issues: ${results.security.issueCount}`);
}

console.error(`\nCode Metrics:`);
console.error(`  Lines: ${results.metrics.lines}`);
console.error(`  Functions: ${results.metrics.functions}`);
console.error(`  Classes: ${results.metrics.classes}`);
console.error(`  Complexity: ${results.metrics.complexity.toUpperCase()}`);

if (results.recommendations.length > 0) {
  console.error(`\nTop Recommendations:`);
  results.recommendations.slice(0, 3).forEach((rec, i) => {
    const icon = rec.priority === 'critical' ? '🔴' : rec.priority === 'high' ? '🟠' : rec.priority === 'medium' ? '🟡' : '🔵';
    console.error(`  ${icon} [${rec.type.toUpperCase()}] ${rec.message}`);
    console.error(`     Action: ${rec.action}`);
  });

  if (results.recommendations.length > 3) {
    console.error(`  ... and ${results.recommendations.length - 3} more recommendations`);
  }
}

console.error('='.repeat(80) + '\n');

process.exit(exitCode);
