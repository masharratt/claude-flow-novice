#!/usr/bin/env tsx
/**
 * Skill Markdown Linting Utility
 *
 * Validates all SKILL.md files against standardized structure.
 * Integrates with CI/CD pipeline for automated validation.
 *
 * Usage:
 *   tsx scripts/lint-skill-markdown.ts
 *   tsx scripts/lint-skill-markdown.ts --skill=cfn-coordination
 *   tsx scripts/lint-skill-markdown.ts --strict
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 *   2 - Warnings found (strict mode only)
 *
 * @module scripts/lint-skill-markdown
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { validateSkillMarkdown, getValidationSummary } from '../src/lib/skill-markdown-validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface LintOptions {
  skillName?: string;
  strict?: boolean;
  verbose?: boolean;
}

interface LintResult {
  skillName: string;
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: string[];
  warnings: string[];
}

const SKILLS_DIR = path.resolve(__dirname, '../.claude/skills');

function parseArgs(): LintOptions {
  const args = process.argv.slice(2);
  const options: LintOptions = {
    strict: false,
    verbose: false,
  };

  args.forEach((arg) => {
    if (arg.startsWith('--skill=')) {
      options.skillName = arg.split('=')[1];
    } else if (arg === '--strict') {
      options.strict = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  });

  return options;
}

function printUsage(): void {
  console.log(`
Skill Markdown Linting Utility

Usage:
  tsx scripts/lint-skill-markdown.ts [options]

Options:
  --skill=NAME      Lint specific skill by name
  --strict          Treat warnings as errors
  --verbose, -v     Enable verbose output
  --help, -h        Show this help message

Examples:
  tsx scripts/lint-skill-markdown.ts
  tsx scripts/lint-skill-markdown.ts --skill=cfn-coordination
  tsx scripts/lint-skill-markdown.ts --strict --verbose
  `);
}

function findSkillDirectories(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => !name.startsWith('.') && !name.startsWith('_'));
}

function lintSkill(skillName: string, options: LintOptions): LintResult {
  const result: LintResult = {
    skillName,
    valid: false,
    errorCount: 0,
    warningCount: 0,
    errors: [],
    warnings: [],
  };

  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    result.errors.push('SKILL.md file not found');
    result.errorCount = 1;
    return result;
  }

  try {
    const content = fs.readFileSync(skillPath, 'utf-8');
    const basePath = path.join(SKILLS_DIR, skillName);
    const validation = validateSkillMarkdown(content, basePath);

    result.valid = validation.valid;
    result.errors = validation.errors;
    result.warnings = validation.warnings;
    result.errorCount = validation.errors.length;
    result.warningCount = validation.warnings.length;
  } catch (error) {
    result.errors.push(
      `Validation failed: ${error instanceof Error ? error.message : String(error)}`
    );
    result.errorCount = result.errors.length;
  }

  return result;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const results: LintResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  console.log('========================================');
  console.log('Skill Markdown Linting');
  console.log('========================================\n');

  if (options.strict) {
    console.log('🔒 STRICT MODE - Warnings treated as errors\n');
  }

  // Determine which skills to lint
  let skillsToLint: string[] = [];

  if (options.skillName) {
    skillsToLint = [options.skillName];
  } else {
    skillsToLint = findSkillDirectories();
  }

  console.log(`Linting ${skillsToLint.length} skills...\n`);

  // Lint each skill
  for (const skillName of skillsToLint) {
    const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      console.log(`⊘ ${skillName} - No SKILL.md file`);
      continue;
    }

    const result = lintSkill(skillName, options);
    results.push(result);

    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;

    // Print result
    if (result.errorCount === 0 && result.warningCount === 0) {
      console.log(`✓ ${skillName}`);
    } else if (result.errorCount === 0) {
      console.log(`⚠ ${skillName} (${result.warningCount} warnings)`);
    } else {
      console.log(`✗ ${skillName} (${result.errorCount} errors, ${result.warningCount} warnings)`);
    }

    // Print details in verbose mode
    if (options.verbose) {
      if (result.errors.length > 0) {
        console.log('  Errors:');
        result.errors.forEach((error) => console.log(`    - ${error}`));
      }

      if (result.warnings.length > 0) {
        console.log('  Warnings:');
        result.warnings.forEach((warning) => console.log(`    - ${warning}`));
      }
    }
  }

  // Print summary
  console.log('\n========================================');
  console.log('Linting Summary');
  console.log('========================================');
  console.log(`Total skills: ${results.length}`);
  console.log(`Errors:       ${totalErrors}`);
  console.log(`Warnings:     ${totalWarnings}`);

  const passedCount = results.filter((r) => r.errorCount === 0).length;
  const failedCount = results.filter((r) => r.errorCount > 0).length;

  console.log(`Passed:       ${passedCount}`);
  console.log(`Failed:       ${failedCount}`);

  // Exit with appropriate code
  if (totalErrors > 0) {
    console.log('\n✗ Linting failed with errors');
    process.exit(1);
  } else if (options.strict && totalWarnings > 0) {
    console.log('\n✗ Linting failed with warnings (strict mode)');
    process.exit(2);
  } else {
    console.log('\n✓ All linting checks passed');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
