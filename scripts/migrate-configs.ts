#!/usr/bin/env node
/**
 * Configuration Migration Utility
 * Migrates legacy JSON, ENV, and bash configs to YAML format
 *
 * Usage:
 *   npm run migrate-configs              # Migrate all configs in config/
 *   npm run migrate-configs --dry-run    # Preview without writing
 *   npm run migrate-configs --scan ./    # Scan from different directory
 *
 * @version 1.0.0
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { ConfigMigrator, MigrationResult } from '../src/lib/config-migrator';
import { program } from 'commander';
import chalk from 'chalk';

interface MigrationStats {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
}

async function main() {
  program
    .name('migrate-configs')
    .description('Migrate legacy configuration files to YAML format')
    .option('-d, --dry-run', 'Preview migration without writing files', false)
    .option('-s, --scan <directory>', 'Directory to scan for configs', './config')
    .option('-o, --output <directory>', 'Output directory for YAML files', './config')
    .option('--no-backup', 'Skip creating backup files', false)
    .option('--schema <path>', 'Path to JSON schema for validation')
    .option('-v, --verbose', 'Verbose output', false)
    .parse(process.argv);

  const options = program.opts();

  console.log(chalk.bold.blue('\n🔄 CFN Configuration Migration Utility\n'));

  // Initialize migrator
  const schemaPath = options.schema || path.join(process.cwd(), 'schemas/config-v1.schema.json');
  const migrator = new ConfigMigrator(schemaPath);

  // Check if schema exists
  try {
    await fs.access(schemaPath);
  } catch {
    console.log(chalk.yellow(`⚠️  Schema not found: ${schemaPath}`));
    console.log(chalk.yellow('   Migration will proceed without validation\n'));
  }

  // Scan for legacy config files
  console.log(chalk.cyan(`📁 Scanning directory: ${options.scan}\n`));

  const legacyFiles = await migrator.scanForLegacyConfigs(options.scan);

  if (legacyFiles.length === 0) {
    console.log(chalk.green('✅ No legacy configuration files found.'));
    console.log(chalk.gray('   All configurations are already in YAML format.\n'));
    return;
  }

  // Display found files
  console.log(chalk.yellow(`📋 Found ${legacyFiles.length} legacy configuration file(s):\n`));
  legacyFiles.forEach((file, index) => {
    console.log(chalk.gray(`   ${index + 1}. ${path.relative(process.cwd(), file)}`));
  });
  console.log();

  // Dry run warning
  if (options.dryRun) {
    console.log(chalk.yellow.bold('🔍 DRY RUN MODE - No files will be modified\n'));
  }

  // Perform migration
  const migrationOptions = {
    dryRun: options.dryRun,
    createBackup: options.backup,
    validate: !!options.schema
  };

  console.log(chalk.cyan('🚀 Starting migration...\n'));

  const results = await migrator.batchMigrate(
    legacyFiles,
    options.output,
    migrationOptions
  );

  // Display results
  const stats: MigrationStats = {
    total: results.length,
    successful: 0,
    failed: 0,
    skipped: 0
  };

  results.forEach((result: MigrationResult) => {
    const relativePath = path.relative(process.cwd(), result.sourcePath);

    if (result.success) {
      stats.successful++;
      const targetPath = path.relative(process.cwd(), result.targetPath);
      console.log(chalk.green(`✅ ${relativePath} → ${targetPath}`));

      if (options.verbose && result.preview && options.dryRun) {
        console.log(chalk.gray('\n--- Preview ---'));
        console.log(chalk.gray(result.preview.split('\n').slice(0, 10).join('\n')));
        console.log(chalk.gray('--- End Preview ---\n'));
      }
    } else {
      stats.failed++;
      console.log(chalk.red(`❌ ${relativePath}`));

      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(error => {
          console.log(chalk.red(`   Error: ${error}`));
        });
      }
    }
  });

  // Summary
  console.log(chalk.bold.cyan('\n📊 Migration Summary\n'));
  console.log(chalk.gray(`   Total files:      ${stats.total}`));
  console.log(chalk.green(`   ✅ Successful:     ${stats.successful}`));
  if (stats.failed > 0) {
    console.log(chalk.red(`   ❌ Failed:         ${stats.failed}`));
  }
  console.log();

  if (options.dryRun) {
    console.log(chalk.yellow.bold('💡 Dry run complete. Run without --dry-run to apply changes.\n'));
  } else if (stats.successful > 0) {
    console.log(chalk.green.bold('✨ Migration complete!\n'));

    // Post-migration instructions
    console.log(chalk.cyan('📝 Next steps:\n'));
    console.log(chalk.gray('   1. Review the migrated YAML files in config/'));
    console.log(chalk.gray('   2. Update your application to use ConfigManager'));
    console.log(chalk.gray('   3. Test with: npm test -- config-manager.test.ts'));
    console.log(chalk.gray('   4. Archive or remove legacy config files'));
    console.log(chalk.gray(`   5. Backups are stored with .backup extension\n`));
  }

  // Exit with error code if any migrations failed
  if (stats.failed > 0) {
    process.exit(1);
  }
}

// Error handling
main().catch((error: Error) => {
  console.error(chalk.red.bold('\n💥 Migration failed:\n'));
  console.error(chalk.red(error.message));
  if (error.stack) {
    console.error(chalk.gray('\n' + error.stack));
  }
  process.exit(1);
});
