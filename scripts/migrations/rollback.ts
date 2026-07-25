#!/usr/bin/env ts-node
/**
 * Rollback Script - Rollback Applied Migrations
 *
 * Usage:
 *   npm run rollback -- --last=1                    # Rollback last migration
 *   npm run rollback -- --last=3                    # Rollback last 3 migrations
 *   npm run rollback -- --to=005                    # Rollback to version 005
 *   npm run rollback -- --all                       # Rollback all migrations
 *   npm run rollback -- --dry-run --last=1          # Simulate rollback
 *   npm run rollback -- --reason="Bug fix"          # Add rollback reason
 *
 * @module rollback
 */

import { createMigrationManager } from '../../src/db/migration-manager';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const all = args.includes('--all');

  const lastArg = args.find((arg) => arg.startsWith('--last='));
  const toArg = args.find((arg) => arg.startsWith('--to='));
  const reasonArg = args.find((arg) => arg.startsWith('--reason='));

  const lastCount = lastArg ? parseInt(lastArg.split('=')[1], 10) : null;
  const targetVersion = toArg ? toArg.split('=')[1] : null;
  const reason = reasonArg ? reasonArg.split('=')[1] : 'Manual rollback via CLI';

  // Validate arguments
  if (!all && !lastCount && !targetVersion) {
    console.error('Error: Must specify --last=N, --to=VERSION, or --all');
    console.error('');
    console.error('Usage:');
    console.error('  npm run rollback -- --last=1');
    console.error('  npm run rollback -- --to=005');
    console.error('  npm run rollback -- --all');
    process.exit(1);
  }

  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');

  console.log('=== Database Rollback ===');
  console.log(`Database: ${databasePath}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Reason: ${reason}`);
  console.log('');

  const manager = await createMigrationManager({
    databasePath,
    migrationsDir,
    dryRun,
    verbose,
    operator: process.env.USER || 'cli',
  });

  try {
    // Get current version
    const currentVersion = await manager.getCurrentVersion();
    console.log(`Current version: ${currentVersion || '(none)'}`);

    if (!currentVersion) {
      console.log('✅ No migrations to rollback');
      process.exit(0);
    }

    // Execute rollback
    console.log('');
    console.log('Rolling back migrations...');

    let results;

    if (all) {
      results = await manager.rollbackAll(reason);
    } else if (lastCount) {
      results = await manager.rollbackLast(lastCount, reason);
    } else if (targetVersion) {
      results = await manager.rollbackTo(targetVersion, reason);
    }

    if (!results || results.length === 0) {
      console.log('✅ No migrations to rollback');
      process.exit(0);
    }

    // Display results
    console.log('');
    for (const result of results) {
      const status = result.success ? '✅' : '❌';
      const mode = result.dryRun ? ' [DRY-RUN]' : '';
      console.log(`${status} ${result.version} - ${result.name} (${result.executionTimeMs}ms)${mode}`);

      if (!result.success) {
        console.error(`   Error: ${result.error}`);
      }
    }

    // Check if all succeeded
    const allSucceeded = results.every((r) => r.success);

    if (allSucceeded) {
      const newVersion = await manager.getCurrentVersion();
      console.log('');
      console.log(`✅ Rollback complete! Version: ${newVersion || '(none)'}`);
      process.exit(0);
    } else {
      console.log('');
      console.error('❌ Rollback failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('❌ Rollback error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main();
