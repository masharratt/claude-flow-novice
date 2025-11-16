#!/usr/bin/env tsx
/**
 * Skill Markdown Migration Utility
 *
 * Migrates existing SKILL.md files to standardized format with validated
 * frontmatter and content sections.
 *
 * Usage:
 *   tsx scripts/migrate-skill-markdown.ts [options]
 *   tsx scripts/migrate-skill-markdown.ts --skill=cfn-coordination
 *   tsx scripts/migrate-skill-markdown.ts --all
 *   tsx scripts/migrate-skill-markdown.ts --dry-run
 *
 * @module scripts/migrate-skill-markdown
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  parseFrontmatter,
  validateFrontmatter,
  createSkillDocument,
  SkillFrontmatter,
} from '../src/lib/skill-frontmatter-parser';
import {
  validateSkillMarkdown,
  extractSections,
  REQUIRED_SECTIONS,
} from '../src/lib/skill-markdown-validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration options
 */
interface MigrationOptions {
  skillName?: string;
  all?: boolean;
  dryRun?: boolean;
  backup?: boolean;
  verbose?: boolean;
  force?: boolean;
}

/**
 * Migration result
 */
interface MigrationResult {
  skillName: string;
  success: boolean;
  action: 'migrated' | 'skipped' | 'failed';
  errors: string[];
  warnings: string[];
  backupPath?: string;
}

/**
 * Migration statistics
 */
interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Default skills directory
 */
const SKILLS_DIR = path.resolve(__dirname, '../.claude/skills');

/**
 * Backup directory
 */
const BACKUP_DIR = path.resolve(__dirname, '../.backups/skill-migration');

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    backup: true,
    verbose: false,
    force: false,
  };

  args.forEach((arg) => {
    if (arg.startsWith('--skill=')) {
      options.skillName = arg.split('=')[1];
    } else if (arg === '--all') {
      options.all = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-backup') {
      options.backup = false;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  });

  return options;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Skill Markdown Migration Utility

Usage:
  tsx scripts/migrate-skill-markdown.ts [options]

Options:
  --skill=NAME      Migrate specific skill by name
  --all             Migrate all skills
  --dry-run         Show what would be migrated without making changes
  --no-backup       Skip creating backup files
  --verbose, -v     Enable verbose output
  --force, -f       Force migration even if validation fails
  --help, -h        Show this help message

Examples:
  tsx scripts/migrate-skill-markdown.ts --skill=cfn-coordination
  tsx scripts/migrate-skill-markdown.ts --all
  tsx scripts/migrate-skill-markdown.ts --all --dry-run
  tsx scripts/migrate-skill-markdown.ts --all --verbose
  `);
}

/**
 * Find all skill directories
 */
function findSkillDirectories(): string[] {
  if (!fs.existsSync(SKILLS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => {
      // Skip hidden directories and special directories
      return !name.startsWith('.') && !name.startsWith('_');
    });
}

/**
 * Check if skill has SKILL.md file
 */
function hasSkillFile(skillName: string): boolean {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  return fs.existsSync(skillPath);
}

/**
 * Create backup of skill file
 */
function createBackup(skillName: string): string {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, skillName, `${timestamp}_SKILL.md`);

  // Create backup directory
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });

  // Copy file
  fs.copyFileSync(skillPath, backupPath);

  return backupPath;
}

/**
 * Migrate single skill file
 */
function migrateSkill(skillName: string, options: MigrationOptions): MigrationResult {
  const result: MigrationResult = {
    skillName,
    success: false,
    action: 'skipped',
    errors: [],
    warnings: [],
  };

  try {
    const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');

    if (!fs.existsSync(skillPath)) {
      result.errors.push(`SKILL.md not found in ${skillName}`);
      result.action = 'failed';
      return result;
    }

    // Read existing content
    const content = fs.readFileSync(skillPath, 'utf-8');

    if (options.verbose) {
      console.log(`\n  Reading ${skillName}/SKILL.md...`);
    }

    // Parse existing frontmatter
    let frontmatter: SkillFrontmatter;
    let markdownContent: string;

    try {
      const parsed = parseFrontmatter(content);
      frontmatter = parsed.frontmatter;
      markdownContent = parsed.content;

      if (options.verbose) {
        console.log(`  ✓ Parsed frontmatter: ${frontmatter.name} v${frontmatter.version}`);
      }
    } catch (error) {
      result.errors.push(`Failed to parse frontmatter: ${error instanceof Error ? error.message : String(error)}`);
      result.action = 'failed';
      return result;
    }

    // Validate frontmatter
    const frontmatterValidation = validateFrontmatter(frontmatter);

    if (!frontmatterValidation.valid && !options.force) {
      result.errors.push(...frontmatterValidation.errors);
      result.warnings.push(...frontmatterValidation.warnings);
      result.action = 'failed';
      return result;
    }

    // Add auto-generated fields if missing
    if (!frontmatter.created) {
      frontmatter.created = new Date().toISOString().split('T')[0];
    }

    frontmatter.updated = new Date().toISOString().split('T')[0];

    // Extract and validate sections
    const sections = extractSections(markdownContent);
    const missingSections: string[] = [];

    REQUIRED_SECTIONS.forEach((requiredSection) => {
      if (!sections.has(requiredSection)) {
        missingSections.push(requiredSection);
      }
    });

    if (missingSections.length > 0) {
      result.warnings.push(
        `Missing required sections: ${missingSections.join(', ')}`
      );

      // Add placeholder sections
      missingSections.forEach((section) => {
        markdownContent += `\n\n## ${section}\n\n_TODO: Add ${section.toLowerCase()} documentation_\n`;
      });
    }

    // Create migrated content
    const migratedContent = createSkillDocument(frontmatter, markdownContent);

    // Validate migrated content
    try {
      const validation = validateSkillMarkdown(
        migratedContent,
        path.join(SKILLS_DIR, skillName)
      );

      if (!validation.valid && !options.force) {
        result.errors.push(...validation.errors);
        result.warnings.push(...validation.warnings);
        result.action = 'failed';
        return result;
      }

      result.warnings.push(...validation.warnings);
    } catch (error) {
      result.errors.push(
        `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      result.action = 'failed';
      return result;
    }

    // Dry run - don't write files
    if (options.dryRun) {
      result.success = true;
      result.action = 'migrated';
      if (options.verbose) {
        console.log('  ✓ Would migrate (dry run)');
      }
      return result;
    }

    // Create backup
    if (options.backup) {
      result.backupPath = createBackup(skillName);
      if (options.verbose) {
        console.log(`  ✓ Created backup: ${result.backupPath}`);
      }
    }

    // Write migrated content
    fs.writeFileSync(skillPath, migratedContent, 'utf-8');

    result.success = true;
    result.action = 'migrated';

    if (options.verbose) {
      console.log('  ✓ Migration complete');
    }
  } catch (error) {
    result.errors.push(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    result.action = 'failed';
  }

  return result;
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  const options = parseArgs();
  const results: MigrationResult[] = [];
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    startTime: Date.now(),
    endTime: 0,
    duration: 0,
  };

  console.log('========================================');
  console.log('Skill Markdown Migration Utility');
  console.log('========================================\n');

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Determine which skills to migrate
  let skillsToMigrate: string[] = [];

  if (options.skillName) {
    skillsToMigrate = [options.skillName];
  } else if (options.all) {
    skillsToMigrate = findSkillDirectories();
  } else {
    console.error('Error: Must specify --skill=NAME or --all');
    printUsage();
    process.exit(1);
  }

  console.log(`Found ${skillsToMigrate.length} skills to process\n`);
  stats.total = skillsToMigrate.length;

  // Migrate each skill
  for (const skillName of skillsToMigrate) {
    if (!hasSkillFile(skillName)) {
      console.log(`⊘ Skipping ${skillName} (no SKILL.md file)`);
      stats.skipped++;
      continue;
    }

    process.stdout.write(`⚙ Migrating ${skillName}...`);

    const result = migrateSkill(skillName, options);
    results.push(result);

    if (result.success) {
      console.log(` ✓`);
      stats.migrated++;
    } else {
      console.log(` ✗`);
      stats.failed++;

      if (result.errors.length > 0) {
        console.log(`  Errors:`);
        result.errors.forEach((error) => console.log(`    - ${error}`));
      }
    }

    if (result.warnings.length > 0 && options.verbose) {
      console.log(`  Warnings:`);
      result.warnings.forEach((warning) => console.log(`    - ${warning}`));
    }
  }

  stats.endTime = Date.now();
  stats.duration = stats.endTime - stats.startTime;

  // Print summary
  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`Total:    ${stats.total}`);
  console.log(`Migrated: ${stats.migrated}`);
  console.log(`Skipped:  ${stats.skipped}`);
  console.log(`Failed:   ${stats.failed}`);
  console.log(`Duration: ${stats.duration}ms`);

  // Check performance target
  if (stats.total > 0) {
    const avgTimePerSkill = stats.duration / stats.total;
    const performanceTarget = 2000; // 2s for all skills
    const perSkillTarget = performanceTarget / stats.total;

    console.log(`\nPerformance:`);
    console.log(`  Average: ${avgTimePerSkill.toFixed(2)}ms per skill`);
    console.log(`  Target:  ${perSkillTarget.toFixed(2)}ms per skill`);

    if (avgTimePerSkill <= perSkillTarget) {
      console.log('  ✓ Performance target met');
    } else {
      console.log('  ✗ Performance target exceeded');
    }
  }

  if (options.backup && stats.migrated > 0 && !options.dryRun) {
    console.log(`\nBackups stored in: ${BACKUP_DIR}`);
  }

  // Exit with appropriate code
  if (stats.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run migration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
