#!/usr/bin/env ts-node
/**
 * Skill Output Migration Utility
 * Task 5.4: Eliminate Bash Output Parsing
 *
 * Migrates existing bash skills to output structured JSON
 *
 * Usage:
 *   ./scripts/migrate-skill-outputs.ts --skill-path .claude/skills/my-skill/execute.sh
 *   ./scripts/migrate-skill-outputs.ts --skill-dir .claude/skills/
 *   ./scripts/migrate-skill-outputs.ts --dry-run --skill-dir .claude/skills/
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { ErrorCode, createError } from '../src/lib/errors';

// ============================================================================
// Types
// ============================================================================

interface MigrationOptions {
  skillPath?: string;
  skillDir?: string;
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

interface MigrationResult {
  success: boolean;
  skillPath: string;
  changes: string[];
  errors: string[];
  alreadyMigrated: boolean;
}

interface MigrationSummary {
  total: number;
  migrated: number;
  alreadyMigrated: number;
  failed: number;
  results: MigrationResult[];
}

// ============================================================================
// Constants
// ============================================================================

const JSON_OUTPUT_TEMPLATE = `
# Output structured JSON for parsing
cat << 'EOF_JSON'
{
  "success": true,
  "confidence": 0.85,
  "deliverables": [],
  "metrics": {
    "execution_time_ms": 0
  },
  "errors": []
}
EOF_JSON
`.trim();

const LEGACY_PATTERNS = [
  /echo\s+"SUCCESS"/i,
  /echo\s+"COMPLETE"/i,
  /echo\s+"Confidence:\s*[\d.]+"/i,
  /echo\s+"Created:\s*[^"]+"/i,
  /echo\s+"Modified:\s*[^"]+"/i,
];

const JSON_DETECTION_PATTERN = /cat\s+<<\s*['"]?EOF_JSON['"]?/;

// ============================================================================
// Migration Logic
// ============================================================================

/**
 * Check if skill is already migrated to JSON output
 */
function isAlreadyMigrated(content: string): boolean {
  return JSON_DETECTION_PATTERN.test(content);
}

/**
 * Detect legacy output patterns
 */
function detectLegacyPatterns(content: string): string[] {
  const detected: string[] = [];

  for (const pattern of LEGACY_PATTERNS) {
    if (pattern.test(content)) {
      detected.push(pattern.source);
    }
  }

  return detected;
}

/**
 * Generate JSON output code for skill
 */
function generateJsonOutput(content: string): string {
  const lines = content.split('\n');
  const changes: string[] = [];

  // Find success/error patterns and extract metadata
  let hasSuccess = false;
  let hasError = false;
  const deliverables: string[] = [];

  for (const line of lines) {
    if (/SUCCESS|COMPLETE/i.test(line)) {
      hasSuccess = true;
    }
    if (/ERROR|FAIL/i.test(line)) {
      hasError = true;
    }

    // Extract file paths from Created/Modified echoes
    const fileMatch = line.match(/echo\s+"(?:Created|Modified):\s*([^"]+)"/i);
    if (fileMatch) {
      deliverables.push(fileMatch[1].trim());
    }
  }

  // Generate JSON output block
  const jsonOutput = {
    success: hasSuccess || !hasError,
    confidence: 0.85, // Default - should be customized per skill
    deliverables,
    metrics: {
      execution_time_ms: 0, // Should be calculated if needed
    },
    errors: [],
  };

  return `
# Output structured JSON for parsing
cat << 'EOF_JSON'
${JSON.stringify(jsonOutput, null, 2)}
EOF_JSON
`.trim();
}

/**
 * Migrate a single skill file
 */
function migrateSkill(skillPath: string, options: MigrationOptions): MigrationResult {
  const result: MigrationResult = {
    success: false,
    skillPath,
    changes: [],
    errors: [],
    alreadyMigrated: false,
  };

  try {
    // Read skill file
    if (!fs.existsSync(skillPath)) {
      result.errors.push(`File not found: ${skillPath}`);
      return result;
    }

    const content = fs.readFileSync(skillPath, 'utf-8');

    // Check if already migrated
    if (isAlreadyMigrated(content)) {
      result.alreadyMigrated = true;
      result.success = true;
      result.changes.push('Already uses JSON output');
      return result;
    }

    // Detect legacy patterns
    const legacyPatterns = detectLegacyPatterns(content);
    if (legacyPatterns.length === 0 && !options.force) {
      result.errors.push('No legacy output patterns detected (use --force to migrate anyway)');
      return result;
    }

    result.changes.push(`Detected ${legacyPatterns.length} legacy output patterns`);

    // Generate JSON output
    const jsonOutput = generateJsonOutput(content);
    result.changes.push('Generated JSON output block');

    // Comment out legacy output patterns
    let migratedContent = content;
    for (const pattern of LEGACY_PATTERNS) {
      migratedContent = migratedContent.replace(pattern, (match) => {
        result.changes.push(`Commented out legacy pattern: ${match.substring(0, 50)}...`);
        return `# LEGACY (replaced with JSON): ${match}`;
      });
    }

    // Add JSON output at the end (before exit statements)
    const exitMatch = migratedContent.match(/exit\s+\d+/);
    if (exitMatch) {
      const exitIndex = migratedContent.indexOf(exitMatch[0]);
      migratedContent =
        migratedContent.substring(0, exitIndex) +
        '\n' +
        jsonOutput +
        '\n\n' +
        migratedContent.substring(exitIndex);
    } else {
      migratedContent += '\n\n' + jsonOutput + '\n';
    }

    result.changes.push('Added JSON output block');

    // Write migrated content (unless dry-run)
    if (!options.dryRun) {
      // Create backup
      const backupPath = `${skillPath}.backup`;
      fs.copyFileSync(skillPath, backupPath);
      result.changes.push(`Created backup: ${backupPath}`);

      // Write migrated file
      fs.writeFileSync(skillPath, migratedContent);
      result.changes.push('Wrote migrated content');
    } else {
      result.changes.push('DRY RUN - no files modified');
    }

    result.success = true;
  } catch (error) {
    result.errors.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

/**
 * Find all skill scripts in a directory
 */
function findSkillScripts(dir: string): string[] {
  const scripts: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        scripts.push(...findSkillScripts(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.sh')) {
        // Found a bash script
        scripts.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error);
  }

  return scripts;
}

/**
 * Migrate all skills in a directory
 */
function migrateSkillDirectory(dir: string, options: MigrationOptions): MigrationSummary {
  const summary: MigrationSummary = {
    total: 0,
    migrated: 0,
    alreadyMigrated: 0,
    failed: 0,
    results: [],
  };

  // Find all skill scripts
  const scripts = findSkillScripts(dir);
  summary.total = scripts.length;

  if (options.verbose) {
    console.log(`Found ${scripts.length} skill scripts in ${dir}`);
  }

  // Migrate each script
  for (const script of scripts) {
    if (options.verbose) {
      console.log(`\nMigrating: ${script}`);
    }

    const result = migrateSkill(script, options);
    summary.results.push(result);

    if (result.success) {
      if (result.alreadyMigrated) {
        summary.alreadyMigrated++;
      } else {
        summary.migrated++;
      }
    } else {
      summary.failed++;
    }

    if (options.verbose) {
      console.log(`  Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      if (result.alreadyMigrated) {
        console.log('  Already migrated');
      }
      for (const change of result.changes) {
        console.log(`  - ${change}`);
      }
      for (const error of result.errors) {
        console.error(`  ERROR: ${error}`);
      }
    }
  }

  return summary;
}

/**
 * Print migration summary
 */
function printSummary(summary: MigrationSummary): void {
  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`Total skills:      ${summary.total}`);
  console.log(`Migrated:          ${summary.migrated}`);
  console.log(`Already migrated:  ${summary.alreadyMigrated}`);
  console.log(`Failed:            ${summary.failed}`);
  console.log('========================================\n');

  if (summary.failed > 0) {
    console.log('Failed migrations:');
    for (const result of summary.results) {
      if (!result.success) {
        console.log(`  ${result.skillPath}`);
        for (const error of result.errors) {
          console.log(`    - ${error}`);
        }
      }
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): MigrationOptions {
  const options: MigrationOptions = {
    dryRun: false,
    verbose: false,
    force: false,
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    switch (arg) {
      case '--skill-path':
        options.skillPath = process.argv[++i];
        break;
      case '--skill-dir':
        options.skillDir = process.argv[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Skill Output Migration Utility

Usage:
  migrate-skill-outputs.ts [options]

Options:
  --skill-path <path>   Migrate a single skill file
  --skill-dir <path>    Migrate all skills in directory (recursive)
  --dry-run             Preview changes without modifying files
  --verbose, -v         Show detailed migration progress
  --force               Force migration even if no legacy patterns detected
  --help, -h            Show this help message

Examples:
  # Migrate single skill
  ./scripts/migrate-skill-outputs.ts --skill-path .claude/skills/my-skill/execute.sh

  # Migrate all skills (dry run)
  ./scripts/migrate-skill-outputs.ts --dry-run --skill-dir .claude/skills/

  # Migrate all skills with verbose output
  ./scripts/migrate-skill-outputs.ts --verbose --skill-dir .claude/skills/
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('Skill Output Migration Utility');
  console.log('Task 5.4: Eliminate Bash Output Parsing\n');

  if (options.dryRun) {
    console.log('DRY RUN MODE - No files will be modified\n');
  }

  try {
    if (options.skillPath) {
      // Migrate single skill
      console.log(`Migrating skill: ${options.skillPath}\n`);
      const result = migrateSkill(options.skillPath, options);

      console.log(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      if (result.alreadyMigrated) {
        console.log('Already migrated to JSON output');
      }

      console.log('\nChanges:');
      for (const change of result.changes) {
        console.log(`  - ${change}`);
      }

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
      }

      process.exit(result.success ? 0 : 1);
    } else if (options.skillDir) {
      // Migrate directory
      console.log(`Migrating skills in: ${options.skillDir}\n`);
      const summary = migrateSkillDirectory(options.skillDir, options);

      printSummary(summary);

      process.exit(summary.failed > 0 ? 1 : 0);
    } else {
      console.error('Error: Must specify --skill-path or --skill-dir');
      printHelp();
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

// ============================================================================
// Exports
// ============================================================================

export { migrateSkill, migrateSkillDirectory, MigrationOptions, MigrationResult, MigrationSummary };
