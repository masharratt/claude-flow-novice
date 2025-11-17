#!/usr/bin/env tsx

/**
 * Skill Migration Utility
 *
 * Scans existing skills and migrates them to standardized structure
 * - Adds missing frontmatter
 * - Validates structure
 * - Fixes permissions
 * - Generates migration report
 *
 * @module migrate-skills
 * @version 1.0.0
 */

import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import * as yaml from 'js-yaml';
import {
  scanSkills,
  validateSkillStructure,
  fixSkillPermissions,
  loadSkillMetadata,
  updateSkillFrontmatter,
  SkillStructureValidation,
  SkillMetadata
} from '../src/lib/skill-content-manager';
import {
  parseFrontmatter,
  validateFrontmatter,
  SkillFrontmatter,
  SkillStatus
} from '../src/lib/skill-frontmatter-parser';
import { calculateFileHash } from '../src/lib/skill-git-integration';

/**
 * Migration report entry
 */
interface MigrationEntry {
  skillName: string;
  skillPath: string;
  status: 'success' | 'partial' | 'failed';
  actions: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Migration report
 */
interface MigrationReport {
  timestamp: string;
  skillsScanned: number;
  skillsMigrated: number;
  skillsPartial: number;
  skillsFailed: number;
  entries: MigrationEntry[];
}

/**
 * Migration options
 */
interface MigrationOptions {
  dryRun: boolean;
  fixPermissions: boolean;
  addMissingFrontmatter: boolean;
  validateOnly: boolean;
  autoCommit: boolean;
}

/**
 * Default frontmatter for skills missing it
 */
function createDefaultFrontmatter(skillName: string): SkillFrontmatter {
  return {
    name: skillName,
    version: '1.0.0',
    tags: ['migration', 'needs-review'],
    status: 'draft' as SkillStatus,
    author: 'CFN Team',
    description: `${skillName} skill - needs description`,
    created: new Date().toISOString().split('T')[0],
    updated: new Date().toISOString().split('T')[0]
  };
}

/**
 * Extract existing frontmatter or create default
 */
async function extractOrCreateFrontmatter(
  skillPath: string,
  skillName: string
): Promise<{ frontmatter: SkillFrontmatter; hadFrontmatter: boolean }> {
  const skillMdPath = join(skillPath, 'SKILL.md');

  try {
    const content = await readFile(skillMdPath, 'utf-8');

    try {
      // Try to parse existing frontmatter
      const parsed = parseFrontmatter(content);
      const validation = validateFrontmatter(parsed.frontmatter);

      if (validation.valid) {
        return { frontmatter: parsed.frontmatter, hadFrontmatter: true };
      }

      // Frontmatter exists but invalid - merge with defaults
      const defaults = createDefaultFrontmatter(skillName);
      return {
        frontmatter: { ...defaults, ...parsed.frontmatter },
        hadFrontmatter: true
      };
    } catch {
      // No frontmatter - extract what we can from content
      const versionMatch = content.match(/version:\s*["']?([0-9.]+)["']?/i);
      const version = versionMatch ? versionMatch[1] : '1.0.0';

      const nameMatch = content.match(/name:\s*["']?([^"'\n]+)["']?/i);
      const name = nameMatch ? nameMatch[1].trim() : skillName;

      const defaults = createDefaultFrontmatter(skillName);
      return {
        frontmatter: {
          ...defaults,
          name,
          version
        },
        hadFrontmatter: false
      };
    }
  } catch {
    // SKILL.md doesn't exist
    return {
      frontmatter: createDefaultFrontmatter(skillName),
      hadFrontmatter: false
    };
  }
}

/**
 * Migrate a single skill
 */
async function migrateSkill(
  skillPath: string,
  options: MigrationOptions
): Promise<MigrationEntry> {
  const skillName = skillPath.split('/').pop() || 'unknown';
  const actions: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let status: 'success' | 'partial' | 'failed' = 'success';

  try {
    // Validate structure
    const validation = await validateSkillStructure(skillPath);

    if (!validation.valid) {
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
      status = validation.errors.length > 0 ? 'partial' : status;
    }

    // Fix permissions
    if (options.fixPermissions && !options.dryRun) {
      const fixed = await fixSkillPermissions(skillPath);
      if (fixed.length > 0) {
        actions.push(`Fixed permissions: ${fixed.join(', ')}`);
      }
    }

    // Add/update frontmatter
    if (options.addMissingFrontmatter && !options.dryRun) {
      const { frontmatter, hadFrontmatter } = await extractOrCreateFrontmatter(
        skillPath,
        skillName
      );

      if (!hadFrontmatter) {
        const skillMdPath = join(skillPath, 'SKILL.md');
        const existingContent = await readFile(skillMdPath, 'utf-8');

        // Create new content with frontmatter
        const frontmatterYaml = yaml.dump(frontmatter, {
          indent: 2,
          lineWidth: 100,
          noRefs: true
        });

        const newContent = `---\n${frontmatterYaml}---\n${existingContent}`;
        await writeFile(skillMdPath, newContent, 'utf-8');
        actions.push('Added missing frontmatter');
      } else {
        // Update existing frontmatter with required fields
        await updateSkillFrontmatter(skillPath, frontmatter, {
          autoCommit: options.autoCommit,
          commitMessage: `Migrate ${skillName} to standardized structure`,
          validateStructure: false
        });
        actions.push('Updated frontmatter to standard format');
      }
    }

    // Report missing files
    if (validation.missingFiles.length > 0) {
      warnings.push(`Missing files: ${validation.missingFiles.join(', ')}`);
      status = 'partial';
    }

    // If no actions needed
    if (actions.length === 0 && errors.length === 0 && warnings.length === 0) {
      actions.push('No migration needed');
    }

  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    status = 'failed';
  }

  return {
    skillName,
    skillPath,
    status,
    actions,
    errors,
    warnings
  };
}

/**
 * Generate migration report
 */
function generateReport(entries: MigrationEntry[]): MigrationReport {
  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    skillsScanned: entries.length,
    skillsMigrated: entries.filter(e => e.status === 'success').length,
    skillsPartial: entries.filter(e => e.status === 'partial').length,
    skillsFailed: entries.filter(e => e.status === 'failed').length,
    entries
  };

  return report;
}

/**
 * Print report to console
 */
function printReport(report: MigrationReport, verbose: boolean = false): void {
  console.log('\n' + '='.repeat(80));
  console.log('Skill Migration Report');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Skills Scanned: ${report.skillsScanned}`);
  console.log(`Successfully Migrated: ${report.skillsMigrated}`);
  console.log(`Partially Migrated: ${report.skillsPartial}`);
  console.log(`Failed: ${report.skillsFailed}`);
  console.log('='.repeat(80));

  if (verbose) {
    console.log('\nDetailed Results:\n');

    for (const entry of report.entries) {
      console.log(`\n${entry.skillName} [${entry.status.toUpperCase()}]`);
      console.log(`  Path: ${entry.skillPath}`);

      if (entry.actions.length > 0) {
        console.log('  Actions:');
        entry.actions.forEach(action => console.log(`    - ${action}`));
      }

      if (entry.warnings.length > 0) {
        console.log('  Warnings:');
        entry.warnings.forEach(warning => console.log(`    ! ${warning}`));
      }

      if (entry.errors.length > 0) {
        console.log('  Errors:');
        entry.errors.forEach(error => console.log(`    ✗ ${error}`));
      }
    }
  } else {
    // Summary view
    const failed = report.entries.filter(e => e.status === 'failed');
    const partial = report.entries.filter(e => e.status === 'partial');

    if (failed.length > 0) {
      console.log('\nFailed Migrations:');
      failed.forEach(e => console.log(`  ✗ ${e.skillName}: ${e.errors[0]}`));
    }

    if (partial.length > 0) {
      console.log('\nPartial Migrations:');
      partial.forEach(e => {
        const warning = e.warnings[0] || e.errors[0] || 'Issues found';
        console.log(`  ! ${e.skillName}: ${warning}`);
      });
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Save report to file
 */
async function saveReport(report: MigrationReport, outputPath: string): Promise<void> {
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report saved to: ${outputPath}`);
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    fixPermissions: !args.includes('--no-fix-permissions'),
    addMissingFrontmatter: !args.includes('--no-frontmatter'),
    validateOnly: args.includes('--validate-only'),
    autoCommit: args.includes('--auto-commit')
  };

  const verbose = args.includes('--verbose') || args.includes('-v');
  const skillsDir = args.find(arg => !arg.startsWith('--')) || './.claude/skills';
  const reportPath = args.find((arg, i) => args[i - 1] === '--report') || './migration-report.json';

  console.log('Skill Migration Utility');
  console.log(`Skills Directory: ${skillsDir}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Validate Only: ${options.validateOnly}`);
  console.log(`Fix Permissions: ${options.fixPermissions}`);
  console.log(`Add Frontmatter: ${options.addMissingFrontmatter}`);
  console.log(`Auto Commit: ${options.autoCommit}`);

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Scan skills
  console.log('\nScanning skills...');
  const skillPaths = await scanSkills(skillsDir);
  console.log(`Found ${skillPaths.length} skills\n`);

  // Migrate each skill
  const entries: MigrationEntry[] = [];
  let index = 1;

  for (const skillPath of skillPaths) {
    const skillName = skillPath.split('/').pop() || 'unknown';
    process.stdout.write(`[${index}/${skillPaths.length}] Migrating ${skillName}...`);

    const entry = await migrateSkill(skillPath, options);
    entries.push(entry);

    const statusIcon = entry.status === 'success' ? '✓' :
                       entry.status === 'partial' ? '!' : '✗';
    process.stdout.write(` ${statusIcon}\n`);

    index++;
  }

  // Generate and display report
  const report = generateReport(entries);
  printReport(report, verbose);

  // Save report
  if (!options.dryRun) {
    await saveReport(report, reportPath);
  }

  // Exit with error code if any failures
  if (report.skillsFailed > 0) {
    process.exit(1);
  }
}

export { migrateSkill, generateReport, MigrationEntry, MigrationReport };

// Run migration if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}
