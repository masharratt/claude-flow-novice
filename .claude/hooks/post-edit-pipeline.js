#!/usr/bin/env node
/**
 * Enhanced Post-Edit Pipeline - Comprehensive Validation Hook
 * Validates edited files with TypeScript, ESLint, Prettier, Security Analysis, and Code Metrics
 *
 * Features:
 * - TypeScript validation with error categorization
 * - ESLint integration for code quality
 * - Prettier formatting checks
 * - Security analysis (integrated security scanner)
 * - Code metrics (lines, functions, classes, complexity)
 * - Actionable recommendations engine
 *
 * Usage: node .claude/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>] [--agent-id <id>]
 *
 * Location: this file is hand-maintained and lives in .claude/hooks/ (tracked in
 * git) precisely so a `dist/` clean cannot destroy it -- there is no TypeScript
 * source that regenerates it. Do not move it back under dist/.
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync, realpathSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Resolve CFN repo root from this module's location so paths work when invoked
// from any project (not just claude-flow-novice's CWD).
//
// This file lives at <repo>/.claude/hooks/post-edit-pipeline.js, so the repo
// root is two levels up. Every other project reaches it through the
// ~/.claude/hooks -> <repo>/.claude/hooks reverse symlink; realpathSync collapses
// that symlink so the two-levels-up walk lands in the CFN repo and not in
// /home/<user>. Node already realpaths the ESM entry point, but not under
// --preserve-symlinks, so do it explicitly rather than depend on the flag.
const __filename = realpathSync(fileURLToPath(import.meta.url));
const __dirname = dirname(__filename);
const CFN_REPO_ROOT = resolve(__dirname, '..', '..');
const SECURITY_SCANNER = resolve(CFN_REPO_ROOT, '.claude/skills/cfn-edit-safety/lib/hooks/security-scanner.sh');
// Bash/python validators dispatched by extension below. Anchored to the repo,
// not process.cwd(): this hook is invoked from every project via the
// ~/.claude/hooks symlink, so a cwd-relative path could only ever resolve when
// the caller happened to be sitting in the CFN repo root.
// CFN_HOOK_VALIDATOR_DIR overrides it (test seam; see
// tests/test-hook-pipeline-validators.sh).
const VALIDATOR_DIR = process.env.CFN_HOOK_VALIDATOR_DIR
  || resolve(CFN_REPO_ROOT, '.claude/skills/hook-pipeline');

// Parse arguments
const args = process.argv.slice(2);
const filePath = args[0];
const memoryKeyIndex = args.indexOf('--memory-key');
const memoryKey = memoryKeyIndex >= 0 ? args[memoryKeyIndex + 1] : null;
const agentIdIndex = args.indexOf('--agent-id');
const agentId = agentIdIndex >= 0 ? args[agentIdIndex + 1] : null;

if (!filePath) {
  console.error('Error: File path required');
  console.error('Usage: node .claude/hooks/post-edit-pipeline.js <file_path> [--memory-key <key>] [--agent-id <id>]');
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
const baseName = filePath.replace(ext, '').split('/').pop();

// Initialize results object
const results = {
  typescript: null,
  eslint: null,
  prettier: null,
  security: null,
  shellcheck: null,
  metrics: null,
  recommendations: []
};

// ============================================================================
// PHASE 1: TypeScript / ESLint / Prettier
// ============================================================================
//
// Restored 2026-07-25 during the two-pipeline consolidation. This file
// previously carried only the placeholder comment "[Remaining TypeScript,
// ESLint, and Prettier validation code remains the same]" -- the phases were
// dropped when the pipeline was hand-copied out of the untracked dist/hooks/
// (see 1d5bd35d0). The elision left results.typescript / .eslint / .prettier
// permanently null even though cfn-post-edit.config.json still declares
// validation.typescript.enabled = true and the exit chain in PHASE 7 still
// branches on them, so exit 1 (TYPE_WARNING) and exit 6 (LINT_ISSUES) were
// unreachable. Recovered from config/hooks/post-edit-pipeline.js, which was
// the only surviving copy, before that file was deleted.
//
// Two deliberate differences from the config/ original:
//  1. Tools are resolved from node_modules/.bin, never through bare `npx`.
//     The original ran `npx eslint`, which DOWNLOADS eslint from the registry
//     when the project does not have it -- unacceptable in a hook that every
//     project reaches through the ~/.claude/hooks symlink.
//  2. Tools run against the package that owns the EDITED FILE, not
//     process.cwd(). Agents invoke this hook from a coordinator shell that may
//     be sitting in an entirely different repo.

// Nearest ancestor of the edited file containing package.json.
function findPackageRoot(startPath) {
  let dir = dirname(resolve(startPath));
  for (let i = 0; i < 20; i++) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const filePackageRoot = findPackageRoot(filePath);

// Walk up from the edited file looking for node_modules/.bin/<name>. Returns
// null when the tool is not installed for that project, which every caller
// below treats as "skip this phase" rather than "this phase passed".
function resolveLocalBin(name) {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 20; i++) {
    const candidate = resolve(dir, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function runLocalTool(bin, toolArgs, timeout = 15000) {
  return spawnSync(bin, toolArgs, {
    cwd: filePackageRoot || dirname(resolve(filePath)),
    encoding: 'utf-8',
    timeout,
    stdio: 'pipe'
  });
}

// ---------------------------------------------------------------- TypeScript
if (['.ts', '.tsx'].includes(ext)) {
  const tscBin = resolveLocalBin('tsc');
  if (!tscBin) {
    log('SKIPPED', 'TypeScript validation skipped (tsc not installed for this project)');
  } else {
    log('VALIDATING', 'Running TypeScript validation');

    // cfn: single-file tsc, switch to a project-wide `tsc --noEmit` cache if
    // false positives from ignored tsconfig paths/aliases become noisy.
    // Naming a file on the CLI makes tsc ignore tsconfig.json by design, so
    // the flags below mirror cfn-post-edit.config.json validation.typescript.
    const proc = runLocalTool(tscBin, ['--noEmit', '--skipLibCheck', resolve(filePath)], 30000);
    const output = `${proc.stdout || ''}${proc.stderr || ''}`;
    const tsErrors = output.split('\n').filter(line => line.includes('error TS'));

    if (tsErrors.length === 0) {
      results.typescript = { passed: true, errors: [] };
      log('SUCCESS', 'TypeScript validation passed');
    } else {
      const errorTypes = {
        implicitAny: tsErrors.filter(l => l.includes('TS7006') || l.includes('TS7031')).length,
        propertyMissing: tsErrors.filter(l => l.includes('TS2339')).length,
        typeMismatch: tsErrors.filter(l => l.includes('TS2322') || l.includes('TS2345')).length,
        syntaxError: tsErrors.filter(l => l.includes('TS1005') || l.includes('TS1128')).length,
        other: 0
      };
      errorTypes.other = tsErrors.length - Object.values(errorTypes).reduce((a, b) => a + b, 0);

      const severity = errorTypes.syntaxError > 0 ? 'SYNTAX_ERROR'
        : tsErrors.length > 5 ? 'LINT_ISSUES'
        : 'TYPE_WARNING';

      results.typescript = {
        passed: false,
        errorCount: tsErrors.length,
        errorTypes,
        errors: tsErrors.slice(0, 5),
        severity
      };

      log(severity, `TypeScript errors detected: ${tsErrors.length}`, {
        errorCount: tsErrors.length,
        errorTypes,
        errors: tsErrors.slice(0, 5)
      });

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
}

// -------------------------------------------------------------------- ESLint
if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext)) {
  const eslintBin = resolveLocalBin('eslint');
  if (!eslintBin) {
    log('SKIPPED', 'ESLint validation skipped (eslint not installed for this project)');
    results.eslint = { available: false };
  } else {
    log('VALIDATING', 'Running ESLint validation');

    const proc = runLocalTool(eslintBin, ['--format', 'json', resolve(filePath)], 20000);
    let parsed = null;
    try {
      parsed = JSON.parse(proc.stdout || '[]');
    } catch {
      parsed = null;
    }

    if (!parsed) {
      // No parseable JSON means eslint itself failed (bad/missing config,
      // unsupported file). Report it; do NOT record a pass.
      log('ERROR', 'ESLint execution failed', {
        status: proc.status,
        stderr: (proc.stderr || '').slice(0, 500)
      });
      results.eslint = { available: true, ran: false, error: (proc.stderr || '').slice(0, 500) };
    } else {
      const fileResults = parsed[0] || { messages: [], errorCount: 0, warningCount: 0 };

      results.eslint = {
        available: true,
        ran: true,
        passed: fileResults.errorCount === 0,
        errorCount: fileResults.errorCount || 0,
        warningCount: fileResults.warningCount || 0,
        messages: (fileResults.messages || []).slice(0, 5)
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
  }
}

// ------------------------------------------------------------------ Prettier
if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.html'].includes(ext)) {
  const prettierBin = resolveLocalBin('prettier');
  if (!prettierBin) {
    log('SKIPPED', 'Prettier check skipped (prettier not installed for this project)');
    results.prettier = { available: false };
  } else {
    log('VALIDATING', 'Running Prettier formatting check');

    const proc = runLocalTool(prettierBin, ['--check', resolve(filePath)], 15000);
    if (proc.status === 0) {
      results.prettier = { available: true, passed: true, formatted: true };
      log('SUCCESS', 'Prettier formatting check passed');
    } else {
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
}

// ============================================================================
// PHASE 2: Security Analysis
// ============================================================================

log('VALIDATING', 'Running security analysis');

try {
  // Primary scanner method: security scanner script
  const securityScanProcess = spawnSync('bash', [
    SECURITY_SCANNER,
    filePath
  ], {
    encoding: 'utf-8',
    timeout: 10000
  });

  const securityScanOutput = securityScanProcess.stdout || '{}';
  const exitCode = securityScanProcess.status;

  log('DEBUG', 'Security scanner output', {
    stdout: securityScanOutput,
    stderr: securityScanProcess.stderr,
    exitCode: exitCode
  });

  try {
    const securityScanResults = JSON.parse(securityScanOutput);

    results.security = {
      passed: securityScanResults.passed,
      confidence: securityScanResults.confidence || 0,
      issues: Array.isArray(securityScanResults.vulnerabilities)
        ? securityScanResults.vulnerabilities
        : JSON.parse(securityScanResults.vulnerabilities || '[]'),
      details: securityScanOutput
    };

    if (results.security.issues.length > 0) {
      log('SECURITY_WARNING', `Security scanner detected ${results.security.issues.length} vulnerabilities`, {
        confidence: results.security.confidence,
        issueTypes: results.security.issues
      });

      // Transform scanner issues into recommendations
      results.security.issues.slice(0, 3).forEach(vuln => {
        results.recommendations.push({
          type: 'security',
          priority: 'critical',
          message: `Security vulnerability: ${vuln}`,
          action: `Review and remediate ${vuln} vulnerability`
        });
      });

      // Add general security warning
      results.recommendations.push({
        type: 'security',
        priority: 'critical',
        message: 'Security vulnerabilities detected by security scanner',
        action: 'Conduct thorough security review and address all vulnerabilities'
      });
    } else {
      log('SUCCESS', 'No security vulnerabilities detected');
    }
  } catch (parseError) {
    log('ERROR', 'Failed to parse security scanner output', {
      parseError: parseError.message,
      output: securityScanOutput
    });

    // Fallback vulnerability detection (minimal built-in checks)
    const builtinChecks = [
      {
        pattern: /eval\(/,
        vulnerability: 'POTENTIAL_RCE',
        severity: 'critical'
      },
      {
        pattern: /innerHTML\s*=/,
        vulnerability: 'XSS_POTENTIAL',
        severity: 'high'
      },
      {
        pattern: /(password|secret|token|api[-_]?key|anthropic|openai|openrouter|kimi|npm[-_]?token|zai|z[-_]ai).*=.*['"]?[^'"\s]{20,}['"]?/i,
        vulnerability: 'HARDCODED_SECRET',
        severity: 'critical'
      }
    ];

    const foundVulnerabilities = builtinChecks
      .filter(check => check.pattern.test(fileContent))
      .map(check => ({
        type: check.vulnerability,
        severity: check.severity
      }));

    results.security = {
      passed: foundVulnerabilities.length === 0,
      confidence: 50,
      issues: foundVulnerabilities,
      details: 'Fallback vulnerability detection'
    };

    if (foundVulnerabilities.length > 0) {
      log('SECURITY_WARNING', 'Vulnerabilities detected by fallback method', {
        vulnerabilities: foundVulnerabilities
      });

      foundVulnerabilities.forEach(vuln => {
        results.recommendations.push({
          type: 'security',
          priority: vuln.severity === 'critical' ? 'critical' : 'high',
          message: `Potential ${vuln.type} vulnerability detected`,
          action: `Manually review code for ${vuln.type} vulnerability`
        });
      });
    }
  }
} catch (error) {
  log('CRITICAL_ERROR', 'Unexpected security scanning failure', {
    error: error.message,
    stack: error.stack
  });

  results.security = {
    passed: false,
    confidence: 0,
    issues: [],
    details: 'Complete security scanning failure'
  };

  results.recommendations.push({
    type: 'security',
    priority: 'critical',
    message: 'Security scanning infrastructure failure',
    action: 'Verify security scanning script and dependencies'
  });
}

// ============================================================================
// PHASE 2.5: Bash Validator Integration
// ============================================================================

log('VALIDATING', 'Running bash validators');

// Validator mapping by file extension.
//
// INTENTIONALLY EMPTY. Ten validators used to be listed here:
//   bash-pipe-safety.sh, bash-dependency-checker.sh, enforce-lf.sh,
//   python-subprocess-safety.py, python-async-safety.py,
//   python-import-checker.py, js-promise-safety.sh, rust-command-safety.sh,
//   rust-future-safety.sh, rust-dependency-checker.sh
// They were added 2025-11-04 (ec9c69585, 938d96e60) under
// .claude/skills/hook-pipeline/ and deleted 2025-11-05 in 304584e0b as
// collateral in a bulk skill cleanup. This table was never updated, so every
// dispatch pointed at a file that no longer existed.
//
// Decision (2026-07-25): NOT restored. Eight of the ten duplicated checks
// already wired in elsewhere (security-scanner.sh, eslint/@typescript-eslint
// promise rules, cargo clippy, the .rs quality block below) or were broken as
// written. enforce-lf.sh -- the most-dispatched of the ten -- rewrote files
// mid-edit with `sed -i`; line endings now belong to git via the
// `* text=auto eol=lf` rule in .gitattributes. Shell linting is handled by the
// shellcheck phase below.
//
// Stale docs still describe these ten as live (see the removal notes in
// docs/implementation/technical-implementation/POST_EDIT_VALIDATORS.md).
// Do not re-add them from those docs.
//
// The dispatch machinery itself is deliberately kept: the existsSync preflight,
// the stderr warning, the missing/dispatched accounting and exit code 9 are
// what catch the NEXT dangling reference. tests/test-hook-pipeline-validators.sh
// exercises it through the CFN_HOOK_VALIDATOR_DIR / CFN_HOOK_VALIDATORS seams.
const validatorsByExtension = {};

// Test seam: CFN_HOOK_VALIDATORS is a JSON object of {".ext": ["name", ...]}
// merged over the table above. It exists so the missing-validator detection
// path stays testable now that no validators ship by default. Unset in
// production.
if (process.env.CFN_HOOK_VALIDATORS) {
  try {
    Object.assign(validatorsByExtension, JSON.parse(process.env.CFN_HOOK_VALIDATORS));
  } catch (error) {
    log('WARN', 'CFN_HOOK_VALIDATORS is not valid JSON; ignoring', {
      error: error.message
    });
  }
}

// Helper function to run a single validator
function runValidator(validatorName, targetFile) {
  const validatorPath = resolve(VALIDATOR_DIR, validatorName);

  // A validator that cannot be FOUND must never read like a validator that
  // found NOTHING. Without this preflight the spawn below still "runs":
  // bash exits 127 and python3 exits 2, neither of which matches the
  // pass/blocking branches -- so the run reported executed:N passed:0
  // warnings:0 errors:0 and exited SUCCESS. Worse for python: 2 IS this
  // pipeline's warning code, so an absent .py validator surfaced as a
  // warning about the edited file.
  if (!existsSync(validatorPath)) {
    console.error(
      `[post-edit-pipeline] MISSING VALIDATOR: ${validatorName} -- referenced ` +
      `for ${extname(targetFile)} files but not on disk at ${validatorPath}. ` +
      `Validation for this check did NOT run.`
    );
    log('VALIDATOR_MISSING', `Validator not found: ${validatorName}`, {
      validatorPath,
      hint: 'Restore the validator or remove it from validatorsByExtension'
    });

    return {
      validator: validatorName,
      validatorPath,
      exitCode: null,
      passed: false,
      isBlocking: false,
      isWarning: false,
      isMissing: true,
      message: `validator not found at ${validatorPath}`
    };
  }

  log('DEBUG', `Executing validator: ${validatorName}`, { targetFile });

  try {
    // Determine interpreter based on file extension
    const isPython = validatorName.endsWith('.py');
    const interpreter = isPython ? 'python3' : 'bash';

    const result = spawnSync(interpreter, [validatorPath, targetFile], {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: process.cwd()
    });

    const exitCode = result.status;
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();

    log('DEBUG', `Validator ${validatorName} completed`, {
      exitCode,
      stdout: stdout.substring(0, 200), // Truncate for logging
      stderr: stderr.substring(0, 200)
    });

    // Exit code convention:
    // 0 = pass (no issues)
    // 1 = error (blocking issue)
    // 2 = warning (non-blocking issue)
    return {
      validator: validatorName,
      validatorPath,
      exitCode,
      passed: exitCode === 0,
      isBlocking: exitCode === 1,
      isWarning: exitCode === 2,
      isMissing: false,
      message: stderr || stdout || 'Validator passed',
      stdout,
      stderr
    };
  } catch (error) {
    log('ERROR', `Validator ${validatorName} execution failed`, {
      error: error.message,
      stack: error.stack
    });

    return {
      validator: validatorName,
      validatorPath,
      exitCode: -1,
      passed: false,
      isBlocking: false,
      isWarning: true,
      isMissing: false,
      message: `Validator execution failed: ${error.message}`,
      error: error.message
    };
  }
}

// Run validators for applicable file types
const applicableValidators = validatorsByExtension[ext] || [];

if (applicableValidators.length > 0) {
  log('INFO', `Running ${applicableValidators.length} bash validators for ${ext} file`);

  // Sequential execution of validators
  const validatorResults = applicableValidators.map(validator =>
    runValidator(validator, filePath)
  );

  // Process validator results
  validatorResults.forEach(result => {
    if (result.isMissing) {
      // Loudest branch on purpose: this is a broken installation, not a
      // finding about the edited file.
      results.recommendations.push({
        type: 'bash-validator-missing',
        priority: 'critical',
        message: `${result.validator}: ${result.message}`,
        action: 'Restore the validator, or drop it from validatorsByExtension in post-edit-pipeline.js'
      });
    } else if (result.isBlocking) {
      // Blocking error (exit code 1)
      log('VALIDATOR_ERROR', `Blocking issue detected by ${result.validator}`, {
        message: result.message
      });

      results.recommendations.push({
        type: 'bash-validator',
        priority: 'critical',
        message: `${result.validator}: ${result.message}`,
        action: 'Fix blocking issue before proceeding'
      });
    } else if (result.isWarning) {
      // Warning (exit code 2)
      log('VALIDATOR_WARNING', `Warning from ${result.validator}`, {
        message: result.message
      });

      results.recommendations.push({
        type: 'bash-safety',
        priority: 'medium',
        message: `${result.validator}: ${result.message}`,
        action: 'Review recommendations and consider fixing'
      });
    } else if (result.passed) {
      // Pass (exit code 0)
      log('SUCCESS', `Validator ${result.validator} passed`);
    }
  });

  // Store validator results for exit code determination
  const missingResults = validatorResults.filter(r => r.isMissing);

  results.bashValidators = {
    // `executed` counts what actually ran. Missing validators are reported
    // separately -- folding them into `executed` is what made the old summary
    // read as a clean run.
    executed: validatorResults.length - missingResults.length,
    dispatched: validatorResults.length,
    passed: validatorResults.filter(r => r.passed).length,
    warnings: validatorResults.filter(r => r.isWarning).length,
    errors: validatorResults.filter(r => r.isBlocking).length,
    missing: missingResults.length,
    missingValidators: missingResults.map(r => r.validator),
    results: validatorResults
  };

  if (results.bashValidators.missing > 0) {
    console.error(
      `[post-edit-pipeline] ${results.bashValidators.missing} of ` +
      `${results.bashValidators.dispatched} validators for ${ext} files are ` +
      `missing: ${results.bashValidators.missingValidators.join(', ')}`
    );
    log('VALIDATOR_MISSING', `Bash validators incomplete`, {
      dispatched: results.bashValidators.dispatched,
      executed: results.bashValidators.executed,
      missing: results.bashValidators.missing,
      missingValidators: results.bashValidators.missingValidators
    });
  } else {
    log('SUCCESS', `Bash validators completed`, {
      executed: results.bashValidators.executed,
      passed: results.bashValidators.passed,
      warnings: results.bashValidators.warnings,
      errors: results.bashValidators.errors
    });
  }
} else {
  log('DEBUG', `No bash validators configured for ${ext} files`);
}

// ============================================================================
// PHASE 2.6: ShellCheck (shell files only)
// ============================================================================
//
// Replaces the deleted bash-pipe-safety.sh / bash-dependency-checker.sh pair.
// shellcheck is a SYSTEM binary, deliberately not an npm dependency:
//   apt install shellcheck   |   brew install shellcheck
//
// Three distinct outcomes, none of which may be confused with each other:
//   - not installed -> SKIPPED (one-line note on stderr, exit code untouched)
//   - installed, clean -> pass
//   - installed, findings -> non-blocking WARNING, same bucket as a validator
//     exit code 2 (config maps BASH_VALIDATOR_WARNING to nonBlocking).

if (ext === '.sh' || ext === '.bash') {
  log('VALIDATING', 'Running shellcheck');

  // CFN_HOOK_SHELLCHECK_BIN points at a shellcheck that is not on PATH (and is
  // the seam tests/test-hook-pipeline-validators.sh uses to exercise all three
  // outcomes). Passed as $1 rather than interpolated into the -c string.
  const SHELLCHECK_BIN = process.env.CFN_HOOK_SHELLCHECK_BIN || 'shellcheck';

  const shellcheckProbe = spawnSync('bash', ['-c', 'command -v "$1"', 'bash', SHELLCHECK_BIN], {
    encoding: 'utf-8',
    timeout: 5000
  });
  const shellcheckAvailable = shellcheckProbe.status === 0
    && (shellcheckProbe.stdout || '').trim().length > 0;

  if (!shellcheckAvailable) {
    // Skipped, NOT passed. Never let an absent linter read like a clean file.
    console.error(
      `[post-edit-pipeline] SHELLCHECK SKIPPED: '${SHELLCHECK_BIN}' is not on PATH, so ` +
      `${filePath} was not lint-checked. Install it (apt install shellcheck / ` +
      'brew install shellcheck) to enable this check.'
    );
    log('SHELLCHECK_SKIPPED', 'shellcheck not installed - shell lint did not run', {
      file: filePath,
      install: 'apt install shellcheck | brew install shellcheck'
    });

    results.shellcheck = {
      available: false,
      skipped: true,
      passed: null,
      findings: [],
      findingCount: 0
    };
  } else {
    const shellcheckRun = spawnSync(SHELLCHECK_BIN, ['--format=gcc', filePath], {
      encoding: 'utf-8',
      timeout: 15000
    });

    const scStatus = shellcheckRun.status;
    const scOut = (shellcheckRun.stdout || '').trim();
    const scErr = (shellcheckRun.stderr || '').trim();
    const findings = scOut ? scOut.split('\n').filter(Boolean) : [];

    if (scStatus === 0) {
      results.shellcheck = {
        available: true,
        skipped: false,
        passed: true,
        findings: [],
        findingCount: 0
      };
      log('SUCCESS', 'shellcheck found no issues');
    } else if (scStatus === 1) {
      // Findings. Non-blocking by design: surfaced as warnings so shell style
      // issues never stop an edit.
      results.shellcheck = {
        available: true,
        skipped: false,
        passed: false,
        findings: findings.slice(0, 20),
        findingCount: findings.length
      };

      log('SHELLCHECK_WARNING', `shellcheck reported ${findings.length} issue(s)`, {
        findings: findings.slice(0, 10)
      });

      findings.slice(0, 3).forEach(finding => {
        results.recommendations.push({
          type: 'shellcheck',
          priority: 'medium',
          message: `shellcheck: ${finding}`,
          action: 'Review the shellcheck finding (non-blocking)'
        });
      });

      if (findings.length > 3) {
        results.recommendations.push({
          type: 'shellcheck',
          priority: 'medium',
          message: `shellcheck reported ${findings.length} issues in total`,
          action: `Run: shellcheck ${filePath}`
        });
      }
    } else {
      // shellcheck itself failed (parse error, bad usage, killed). Report as a
      // tool problem; do not claim the file is clean and do not block.
      log('WARN', 'shellcheck did not complete', {
        exitCode: scStatus,
        stderr: scErr.substring(0, 300)
      });

      results.shellcheck = {
        available: true,
        skipped: true,
        passed: null,
        findings: [],
        findingCount: 0,
        error: scErr || `shellcheck exited ${scStatus}`
      };
    }
  }
}

// ============================================================================
// PHASE 3: Root Directory Detection
// ============================================================================

log('VALIDATING', 'Checking file location (root directory warning)');

const isRootFile = dirname(resolve(filePath)) === resolve('.');
if (isRootFile && !filePath.match(/^(package\.json|tsconfig\.json|\.gitignore|\.env.*|README\.md|LICENSE|CLAUDE\.md)$/)) {
  // Suggest appropriate location based on file type
  const suggestions = [];
  if (ext.match(/\.(js|ts|jsx|tsx)$/)) {
    suggestions.push({ location: `src/${filePath}`, reason: 'Source files belong in src/' });
  }
  if (ext.match(/\.(test|spec)\.(js|ts|jsx|tsx)$/)) {
    suggestions.push({ location: `tests/${filePath}`, reason: 'Test files belong in tests/' });
  }
  if (ext === '.md' && !filePath.match(/^(README|CLAUDE)\.md$/)) {
    suggestions.push({ location: `docs/${filePath}`, reason: 'Documentation belongs in docs/' });
  }
  if (ext === '.json' && !filePath.match(/^package\.json$/)) {
    suggestions.push({ location: `config/${filePath}`, reason: 'Config files belong in config/' });
  }
  if (ext === '.sh') {
    suggestions.push({ location: `scripts/${filePath}`, reason: 'Scripts belong in scripts/' });
  }

  if (suggestions.length > 0) {
    log('ROOT_WARNING', 'File in root directory - should be organized', {
      file: filePath,
      suggestions
    });

    results.recommendations.push({
      type: 'organization',
      priority: 'high',
      message: `File "${filePath}" should not be in root directory`,
      action: `Move to: ${suggestions[0].location}`,
      suggestions
    });

    // Store for handler processing
    results.rootWarning = { suggestions };
  }
}

// ============================================================================
// PHASE 4: TDD Violation Detection
// ============================================================================

if (ext.match(/\.(js|ts|jsx|tsx|py|go|rs)$/) && !filePath.match(/\.(test|spec)\./)) {
  log('VALIDATING', 'Checking TDD compliance');

  const testPatterns = {
    js: [`${dirname(filePath)}/${baseName}.test.js`, `tests/${baseName}.test.js`],
    ts: [`${dirname(filePath)}/${baseName}.test.ts`, `tests/${baseName}.test.ts`],
    py: [`${dirname(filePath)}/test_${baseName}.py`, `tests/test_${baseName}.py`],
    go: [`${dirname(filePath)}/${baseName}_test.go`],
    rs: null // Rust uses inline tests
  };

  const langKey = ext.replace('.', '');
  const patterns = testPatterns[langKey];

  if (patterns) {
    const hasTest = patterns.some(p => existsSync(p));

    if (!hasTest) {
      log('TDD_VIOLATION', 'No test file found', {
        file: filePath,
        expectedLocations: patterns
      });

      results.recommendations.push({
        type: 'testing',
        priority: 'high',
        message: 'No test file found for this module',
        action: 'Create test file or run feedback-resolver.sh --type TDD_VIOLATION'
      });

      results.tddViolation = {
        hasTests: false,
        testFile: patterns[0],
        recommendations: [`Create ${patterns[0]}`]
      };
    }
  }
}

// ============================================================================
// PHASE 5: Code Metrics and Complexity Analysis
// ============================================================================

log('VALIDATING', 'Calculating code metrics');

const lines = fileContent.split('\n').length;
const functions = (fileContent.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length;
const classes = (fileContent.match(/class\s+\w+/g) || []).length;
const todos = (fileContent.match(/\/\/\s*TODO/gi) || []).length;
const fixmes = (fileContent.match(/\/\/\s*FIXME/gi) || []).length;

results.metrics = {
  lines,
  functions,
  classes,
  todos,
  fixmes,
  complexity: lines > 300 ? 'high' : lines > 100 ? 'medium' : 'low'
};

log('SUCCESS', 'Code metrics calculated', results.metrics);

// ============================================================================
// PHASE 5.1: Cyclomatic Complexity Analysis
// ============================================================================

log('VALIDATING', 'Analyzing cyclomatic complexity');

// Only analyze files >200 lines to reduce overhead
if (lines > 200 && ext.match(/\.(sh|js|ts|jsx|tsx|py)$/)) {
  try {
    // Use simple-complexity.sh for bash scripts
    if (ext === '.sh') {
      const complexityResult = spawnSync('bash', [
        'tools/simple-complexity.sh',
        filePath
      ], {
        encoding: 'utf-8',
        timeout: 5000
      });

      if (complexityResult.status === 0) {
        const output = complexityResult.stdout;
        const complexityMatch = output.match(/Total Complexity:\s*(\d+)/);

        if (complexityMatch) {
          const complexity = parseInt(complexityMatch[1], 10);
          results.metrics.cyclomaticComplexity = complexity;

          log('SUCCESS', `Cyclomatic complexity: ${complexity}`, { complexity });

          // Warning threshold: 30
          if (complexity >= 30 && complexity < 40) {
            log('COMPLEXITY_WARNING', `Moderate complexity detected: ${complexity}`, {
              threshold: 30,
              complexity
            });

            results.recommendations.push({
              type: 'complexity',
              priority: 'medium',
              message: `Cyclomatic complexity is ${complexity} (threshold: 30)`,
              action: 'Consider refactoring to reduce complexity'
            });
          }

          // Critical threshold: 40 - invoke lizard for detailed analysis
          if (complexity >= 40) {
            log('COMPLEXITY_CRITICAL', `High complexity detected: ${complexity}, invoking lizard`, {
              threshold: 40,
              complexity
            });

            // Check if lizard is available
            const lizardCheck = spawnSync('which', ['lizard'], { encoding: 'utf-8' });

            if (lizardCheck.status === 0) {
              // Run lizard for detailed analysis
              const lizardResult = spawnSync('lizard', [
                filePath,
                '-C', '15'  // Show functions with complexity >15
              ], {
                encoding: 'utf-8',
                timeout: 10000
              });

              if (lizardResult.status === 0) {
                const lizardOutput = lizardResult.stdout;

                log('LIZARD_ANALYSIS', 'Detailed complexity analysis', {
                  output: lizardOutput
                });

                results.complexityAnalysis = {
                  tool: 'lizard',
                  complexity,
                  detailedReport: lizardOutput
                };

                results.recommendations.push({
                  type: 'complexity',
                  priority: 'critical',
                  message: `Critical complexity level: ${complexity} (threshold: 40)`,
                  action: 'Refactor immediately. Run cyclomatic-complexity-reducer agent',
                  details: lizardOutput
                });
              } else {
                log('WARN', 'Lizard analysis failed', {
                  stderr: lizardResult.stderr
                });
              }
            } else {
              log('WARN', 'Lizard not installed, skipping detailed analysis');

              results.recommendations.push({
                type: 'complexity',
                priority: 'critical',
                message: `Critical complexity level: ${complexity} (threshold: 40)`,
                action: 'Refactor immediately. Install lizard: ./tools/install-lizard.sh'
              });
            }
          }
        }
      } else {
        log('WARN', 'Complexity analysis failed', {
          stderr: complexityResult.stderr
        });
      }
    }
    // For TypeScript/JavaScript, use lizard directly if available
    else if (ext.match(/\.(js|ts|jsx|tsx)$/)) {
      const lizardCheck = spawnSync('which', ['lizard'], { encoding: 'utf-8' });

      if (lizardCheck.status === 0) {
        const lizardResult = spawnSync('lizard', [
          filePath,
          '--json'
        ], {
          encoding: 'utf-8',
          timeout: 10000
        });

        if (lizardResult.status === 0) {
          try {
            const lizardData = JSON.parse(lizardResult.stdout);

            // Calculate average complexity
            let totalComplexity = 0;
            let functionCount = 0;

            if (lizardData.function_list) {
              lizardData.function_list.forEach(func => {
                totalComplexity += func.cyclomatic_complexity || 0;
                functionCount++;
              });
            }

            const avgComplexity = functionCount > 0 ? Math.round(totalComplexity / functionCount) : 0;
            results.metrics.cyclomaticComplexity = avgComplexity;

            if (avgComplexity >= 30) {
              log('COMPLEXITY_WARNING', `Average complexity: ${avgComplexity}`, {
                avgComplexity,
                functionCount
              });

              results.recommendations.push({
                type: 'complexity',
                priority: avgComplexity >= 40 ? 'critical' : 'medium',
                message: `Average cyclomatic complexity: ${avgComplexity}`,
                action: avgComplexity >= 40
                  ? 'Critical: Refactor high-complexity functions immediately'
                  : 'Consider refactoring complex functions'
              });
            }
          } catch (parseError) {
            log('WARN', 'Failed to parse lizard JSON output', {
              error: parseError.message
            });
          }
        }
      }
    }
  } catch (error) {
    log('WARN', 'Complexity analysis error', {
      error: error.message
    });
  }
}

// Check for Rust-specific quality issues
if (ext === '.rs') {
  log('VALIDATING', 'Running Rust quality checks');

  const rustIssues = [];
  if (fileContent.match(/println!\(/)) rustIssues.push('debug_println');
  if (fileContent.match(/unwrap\(\)/)) rustIssues.push('unwrap_usage');
  if (fileContent.match(/panic!\(/)) rustIssues.push('panic_usage');

  if (rustIssues.length > 0) {
    log('RUST_QUALITY', 'Rust quality issues detected', { issues: rustIssues });

    results.recommendations.push({
      type: 'rust',
      priority: 'medium',
      message: 'Rust quality issues detected',
      action: 'Run: cargo fmt && cargo clippy --fix --allow-dirty'
    });

    results.rustQuality = { issues: rustIssues };
  }
}

// ============================================================================
// PHASE 6: Final Recommendations
// ============================================================================

log('VALIDATING', 'Generating recommendations');

// Type safety recommendations
if (ext.match(/\.(ts|tsx)$/) && fileContent.match(/:\s*any\b/)) {
  results.recommendations.push({
    type: 'typescript',
    priority: 'medium',
    message: 'Avoid using "any" type when possible',
    action: 'Use specific types or unknown for better type safety'
  });
}

// Testing recommendations
if (!filePath.match(/\.(test|spec)\./)) {
  results.recommendations.push({
    type: 'testing',
    priority: 'medium',
    message: 'Consider writing tests for this module',
    action: 'Create corresponding test file to ensure code reliability'
  });
}

log('SUCCESS', `Generated ${results.recommendations.length} recommendations`);

// ============================================================================
// PHASE 7: Exit Code Determination
// ============================================================================

let exitCode = 0;
let finalStatus = 'SUCCESS';

// Check for critical complexity issues
const hasComplexityIssue = results.recommendations.find(r => r.type === 'complexity');

// Check for bash validator issues
const hasBashValidatorError = results.bashValidators && results.bashValidators.errors > 0;
const hasBashValidatorWarning = results.bashValidators && results.bashValidators.warnings > 0;
// A missing validator is a hard failure, not a soft one. The pipeline claims
// these checks ran; if they cannot, the run must not exit 0 and let callers
// believe the file was checked.
const hasMissingValidator = results.bashValidators && results.bashValidators.missing > 0;
// shellcheck findings ride the same non-blocking warning bucket as a validator
// exit code 2 (BASH_VALIDATOR_WARNING is listed under feedback.nonBlocking in
// cfn-post-edit.config.json). A skipped shellcheck contributes nothing here.
const hasShellcheckWarning = results.shellcheck && results.shellcheck.findingCount > 0;

if (hasMissingValidator) {
  exitCode = 9;
  finalStatus = 'BASH_VALIDATOR_MISSING';
} else if (hasBashValidatorError) {
  exitCode = 9;
  finalStatus = 'BASH_VALIDATOR_ERROR';
} else if (results.rootWarning) {
  exitCode = 2;
  finalStatus = 'ROOT_WARNING';
} else if (results.tddViolation) {
  exitCode = 3;
  finalStatus = 'TDD_VIOLATION';
} else if (hasBashValidatorWarning || hasShellcheckWarning) {
  exitCode = 10;
  finalStatus = 'BASH_VALIDATOR_WARNING';
} else if (hasComplexityIssue && hasComplexityIssue.priority === 'critical') {
  exitCode = 7;
  finalStatus = 'COMPLEXITY_CRITICAL';
} else if (hasComplexityIssue && hasComplexityIssue.priority === 'medium') {
  exitCode = 8;
  finalStatus = 'COMPLEXITY_WARNING';
} else if (results.rustQuality) {
  exitCode = 5;
  finalStatus = 'RUST_QUALITY';
} else if (results.prettier && results.prettier.available && results.prettier.passed === false) {
  // `available` and an explicit false are both required: the Prettier phase
  // records {available:false} when the tool is not installed for the edited
  // file's project, and a bare `!results.prettier.passed` would read that
  // undefined as a formatting failure and exit 6 on every file in every
  // project without prettier.
  exitCode = 6;
  finalStatus = 'LINT_ISSUES';
} else if (results.typescript && results.typescript.passed === false) {
  exitCode = 1;
  finalStatus = 'TYPE_WARNING';
} else if (results.recommendations.length > 0) {
  finalStatus = 'IMPROVEMENTS_SUGGESTED';
}

const finalResult = {
  typescript: results.typescript,
  eslint: results.eslint,
  prettier: results.prettier,
  security: results.security,
  shellcheck: results.shellcheck,
  metrics: results.metrics,
  recommendationCount: results.recommendations.length,
  topRecommendations: results.recommendations.slice(0, 3)
};

// Include structured data for feedback handlers
if (results.rootWarning) {
  finalResult.rootWarning = results.rootWarning;
}
if (results.tddViolation) {
  finalResult.tddViolation = results.tddViolation;
}
if (results.bashValidators) {
  finalResult.bashValidators = results.bashValidators;
}
if (results.rustQuality) {
  finalResult.rustQuality = results.rustQuality;
}
if (results.complexityAnalysis) {
  finalResult.complexityAnalysis = results.complexityAnalysis;
}

log(finalStatus, 'Pipeline validation complete', finalResult);

process.exit(exitCode);