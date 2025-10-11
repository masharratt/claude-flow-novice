#!/usr/bin/env node

/**
 * Agent Lifecycle Hooks Validator
 *
 * Validates agent profile hooks for:
 * - Shell syntax correctness
 * - Environment variable usage
 * - Dangerous commands
 * - Performance anti-patterns
 * - Security vulnerabilities
 *
 * Usage:
 *   node scripts/validate-agent-hooks.js --all                    # Validate all agents
 *   node scripts/validate-agent-hooks.js <agent-file.md>          # Validate specific agent
 *   node scripts/validate-agent-hooks.js --all --ci               # CI mode (exit 1 on errors)
 *   node scripts/validate-agent-hooks.js --all --verbose          # Verbose output
 *
 * Sprint: 2.2 - Agent Lifecycle Hooks
 * Epic: production-blocking-coordination
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CONFIGURATION =====

const HOOK_NAMES = ['on_blocking_start', 'on_signal_received', 'on_blocking_timeout'];

const REQUIRED_ENV_VARS = ['AGENT_ID', 'TASK', 'SWARM_ID', 'ITERATION', 'PHASE'];

const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf\s+\//, severity: 'critical', message: 'Destructive: rm -rf /' },
  { pattern: /dd\s+if=/, severity: 'critical', message: 'Dangerous: dd command' },
  { pattern: /mkfs/, severity: 'critical', message: 'Dangerous: mkfs command' },
  { pattern: /chmod\s+777/, severity: 'high', message: 'Security: chmod 777' },
  { pattern: /sudo\s+/, severity: 'high', message: 'Privilege escalation: sudo' },
  { pattern: /nc\s+-l/, severity: 'medium', message: 'Network: netcat listener' },
  { pattern: /sqlite3.*DROP/, severity: 'critical', message: 'Database: Direct DROP statement' },
  { pattern: /eval\s+/, severity: 'high', message: 'Security: eval command' },
  { pattern: /\$\([^)]*rm[^)]*\)/, severity: 'high', message: 'Command substitution with rm' },
  { pattern: />\s*\/dev\/sd[a-z]/, severity: 'critical', message: 'Direct disk write' },
];

const PERFORMANCE_ANTI_PATTERNS = [
  { pattern: /sleep\s+[5-9]\d+/, severity: 'high', message: 'Performance: sleep > 50 seconds' },
  { pattern: /for\s+\w+\s+in\s+\$\(find/, severity: 'medium', message: 'Performance: Loop over find' },
  { pattern: /curl.*--max-time\s+[5-9]\d+/, severity: 'medium', message: 'Performance: Long HTTP timeout' },
  { pattern: /while\s+true/, severity: 'high', message: 'Performance: Infinite loop detected' },
];

const SHELL_SYNTAX_PATTERNS = [
  { pattern: /\$\{[^}]+\}/, name: 'Variable expansion', valid: true },
  { pattern: /\$\([^)]+\)/, name: 'Command substitution', valid: true },
  { pattern: /\$[A-Z_][A-Z0-9_]*\b(?!\{)/, name: 'Unquoted variable', valid: false, fix: 'Use "${VAR}" instead of $VAR' },
  { pattern: /\|\|/, name: 'OR operator', valid: true },
  { pattern: /&&/, name: 'AND operator', valid: true },
];

// ===== VALIDATION FUNCTIONS =====

/**
 * Extract YAML frontmatter from markdown file
 */
function extractFrontmatter(content) {
  // Normalize line endings to handle both LF and CRLF
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = normalizedContent.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  try {
    return yaml.load(match[1]);
  } catch (error) {
    throw new Error(`Invalid YAML frontmatter: ${error.message}`);
  }
}

/**
 * Validate shell syntax using bash -n
 */
function validateShellSyntax(hookScript, hookName) {
  const issues = [];

  try {
    // Create temporary file for syntax check
    const tempFile = `/tmp/hook_validate_${Date.now()}.sh`;
    fs.writeFileSync(tempFile, `#!/bin/bash\n${hookScript}`);

    // Run bash syntax check
    execSync(`bash -n ${tempFile}`, { encoding: 'utf8', stdio: 'pipe' });

    // Clean up
    fs.unlinkSync(tempFile);

    issues.push({
      severity: 'info',
      message: `Shell syntax valid for ${hookName}`,
      type: 'syntax',
    });
  } catch (error) {
    issues.push({
      severity: 'error',
      message: `Shell syntax error in ${hookName}: ${error.stderr || error.message}`,
      type: 'syntax',
    });
  }

  return issues;
}

/**
 * Check for environment variable usage
 */
function validateEnvVars(hookScript, hookName) {
  const issues = [];
  const usedVars = new Set();

  // Extract all ${VAR} patterns
  const varPattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  let match;

  while ((match = varPattern.exec(hookScript)) !== null) {
    usedVars.add(match[1]);
  }

  // Check for required variables
  const missingRequired = REQUIRED_ENV_VARS.filter((v) => !usedVars.has(v));

  if (missingRequired.length > 0 && hookName === 'on_blocking_start') {
    issues.push({
      severity: 'warning',
      message: `${hookName}: Consider using required variables: ${missingRequired.join(', ')}`,
      type: 'env_vars',
    });
  }

  // Check for unquoted variables (security risk)
  const unquotedPattern = /\$([A-Z_][A-Z0-9_]*)\b(?!\{)/g;
  const unquotedMatches = [];

  while ((match = unquotedPattern.exec(hookScript)) !== null) {
    unquotedMatches.push(match[1]);
  }

  if (unquotedMatches.length > 0) {
    issues.push({
      severity: 'high',
      message: `${hookName}: Unquoted variables (injection risk): ${unquotedMatches.join(', ')}`,
      type: 'security',
      fix: 'Use "${VAR}" instead of $VAR',
    });
  }

  return issues;
}

/**
 * Check for dangerous commands
 */
function validateDangerousCommands(hookScript, hookName) {
  const issues = [];

  for (const { pattern, severity, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(hookScript)) {
      issues.push({
        severity,
        message: `${hookName}: ${message}`,
        type: 'dangerous_command',
        pattern: pattern.toString(),
      });
    }
  }

  return issues;
}

/**
 * Check for performance anti-patterns
 */
function validatePerformance(hookScript, hookName) {
  const issues = [];

  for (const { pattern, severity, message } of PERFORMANCE_ANTI_PATTERNS) {
    if (pattern.test(hookScript)) {
      issues.push({
        severity,
        message: `${hookName}: ${message}`,
        type: 'performance',
        pattern: pattern.toString(),
      });
    }
  }

  // Check for missing error handling
  if (!hookScript.includes('|| true') && !hookScript.includes('|| echo')) {
    issues.push({
      severity: 'medium',
      message: `${hookName}: Missing error handling (consider '|| true' for non-critical commands)`,
      type: 'error_handling',
    });
  }

  return issues;
}

/**
 * Validate hook execution time estimate
 */
function estimateExecutionTime(hookScript, hookName) {
  const issues = [];
  let estimatedTime = 0;

  // Estimate based on patterns
  if (hookScript.includes('find')) estimatedTime += 2000; // 2s for find
  if (hookScript.includes('curl') || hookScript.includes('wget')) estimatedTime += 3000; // 3s for HTTP
  if (hookScript.includes('git')) estimatedTime += 1000; // 1s for git
  if (hookScript.includes('/sqlite-memory')) estimatedTime += 500; // 500ms for memory op
  if (hookScript.includes('/eventbus')) estimatedTime += 300; // 300ms for event

  // Count command substitutions
  const cmdSubCount = (hookScript.match(/\$\(/g) || []).length;
  estimatedTime += cmdSubCount * 200; // 200ms per command substitution

  if (estimatedTime > 5000) {
    issues.push({
      severity: 'critical',
      message: `${hookName}: Estimated execution time ${estimatedTime}ms exceeds 5s timeout`,
      type: 'performance',
      estimatedTime,
    });
  } else if (estimatedTime > 3000) {
    issues.push({
      severity: 'warning',
      message: `${hookName}: Estimated execution time ${estimatedTime}ms (consider optimizing for < 3s)`,
      type: 'performance',
      estimatedTime,
    });
  } else {
    issues.push({
      severity: 'info',
      message: `${hookName}: Estimated execution time ${estimatedTime}ms (good)`,
      type: 'performance',
      estimatedTime,
    });
  }

  return issues;
}

/**
 * Validate a single hook
 */
function validateHook(hookScript, hookName) {
  const issues = [];

  if (!hookScript || hookScript.trim().length === 0) {
    return [
      {
        severity: 'info',
        message: `${hookName}: Empty hook (no-op)`,
        type: 'empty',
      },
    ];
  }

  // Run all validations
  issues.push(...validateShellSyntax(hookScript, hookName));
  issues.push(...validateEnvVars(hookScript, hookName));
  issues.push(...validateDangerousCommands(hookScript, hookName));
  issues.push(...validatePerformance(hookScript, hookName));
  issues.push(...estimateExecutionTime(hookScript, hookName));

  return issues;
}

/**
 * Validate agent profile file
 */
function validateAgentProfile(filePath) {
  const results = {
    file: filePath,
    valid: true,
    issues: [],
    hooks: {},
  };

  try {
    // Read file
    const content = fs.readFileSync(filePath, 'utf8');

    // Extract frontmatter
    const frontmatter = extractFrontmatter(content);

    if (!frontmatter) {
      results.valid = false;
      results.issues.push({
        severity: 'error',
        message: 'No YAML frontmatter found',
        type: 'frontmatter',
      });
      return results;
    }

    // Check if hooks exist
    if (!frontmatter.hooks) {
      results.issues.push({
        severity: 'info',
        message: 'No hooks defined (optional)',
        type: 'hooks',
      });
      return results;
    }

    // Validate each hook
    for (const hookName of HOOK_NAMES) {
      if (frontmatter.hooks[hookName]) {
        const hookIssues = validateHook(frontmatter.hooks[hookName], hookName);
        results.hooks[hookName] = hookIssues;
        results.issues.push(...hookIssues);
      }
    }

    // Check for unknown hooks
    const unknownHooks = Object.keys(frontmatter.hooks).filter((h) => !HOOK_NAMES.includes(h));
    if (unknownHooks.length > 0) {
      results.issues.push({
        severity: 'warning',
        message: `Unknown hooks: ${unknownHooks.join(', ')}`,
        type: 'hooks',
      });
    }

    // Determine overall validity
    const hasCritical = results.issues.some((i) => i.severity === 'critical');
    const hasError = results.issues.some((i) => i.severity === 'error');

    results.valid = !hasCritical && !hasError;
  } catch (error) {
    results.valid = false;
    results.issues.push({
      severity: 'error',
      message: `Validation failed: ${error.message}`,
      type: 'exception',
    });
  }

  return results;
}

/**
 * Find all agent profile files
 */
function findAgentProfiles() {
  const agentsDir = path.join(__dirname, '..', '.claude', 'agents');
  const profiles = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        profiles.push(fullPath);
      }
    }
  }

  scanDir(agentsDir);
  return profiles;
}

/**
 * Format validation results
 */
function formatResults(results, verbose = false) {
  const severityColors = {
    critical: '\x1b[31m', // Red
    error: '\x1b[31m', // Red
    high: '\x1b[33m', // Yellow
    warning: '\x1b[33m', // Yellow
    medium: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
  };
  const reset = '\x1b[0m';

  console.log(`\n${results.valid ? '✅' : '❌'} ${path.basename(results.file)}`);

  if (verbose || !results.valid) {
    const groupedIssues = {};

    for (const issue of results.issues) {
      if (!groupedIssues[issue.severity]) {
        groupedIssues[issue.severity] = [];
      }
      groupedIssues[issue.severity].push(issue);
    }

    for (const [severity, issues] of Object.entries(groupedIssues)) {
      const color = severityColors[severity] || '';
      console.log(`\n  ${color}${severity.toUpperCase()}${reset}:`);

      for (const issue of issues) {
        console.log(`    - ${issue.message}`);
        if (issue.fix) {
          console.log(`      Fix: ${issue.fix}`);
        }
        if (verbose && issue.pattern) {
          console.log(`      Pattern: ${issue.pattern}`);
        }
      }
    }
  }

  return results.valid;
}

/**
 * Generate summary report
 */
function generateSummary(allResults) {
  const total = allResults.length;
  const valid = allResults.filter((r) => r.valid).length;
  const invalid = total - valid;

  const issuesBySeverity = {};
  for (const result of allResults) {
    for (const issue of result.issues) {
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal agents: ${total}`);
  console.log(`Valid: ${valid} ✅`);
  console.log(`Invalid: ${invalid} ❌`);

  if (Object.keys(issuesBySeverity).length > 0) {
    console.log('\nIssues by severity:');
    for (const [severity, count] of Object.entries(issuesBySeverity)) {
      console.log(`  ${severity}: ${count}`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');

  return invalid === 0;
}

// ===== MAIN =====

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    all: args.includes('--all'),
    ci: args.includes('--ci'),
    verbose: args.includes('--verbose'),
  };

  const files = args.filter((arg) => !arg.startsWith('--'));

  let profilesToValidate = [];

  if (flags.all) {
    profilesToValidate = findAgentProfiles();
    console.log(`Found ${profilesToValidate.length} agent profiles`);
  } else if (files.length > 0) {
    profilesToValidate = files.map((f) => path.resolve(f));
  } else {
    console.error('Usage: node validate-agent-hooks.js [--all] [--ci] [--verbose] [file.md...]');
    process.exit(1);
  }

  const allResults = [];

  for (const filePath of profilesToValidate) {
    const results = validateAgentProfile(filePath);
    allResults.push(results);
    formatResults(results, flags.verbose);
  }

  const success = generateSummary(allResults);

  if (flags.ci && !success) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
