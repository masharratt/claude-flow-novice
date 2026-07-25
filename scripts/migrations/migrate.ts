#!/usr/bin/env ts-node
/**
 * Migration Script - Apply Pending Migrations
 *
 * Usage:
 *   npm run migrate                    # Apply all pending migrations
 *   npm run migrate -- --dry-run       # Simulate migrations without applying
 *   npm run migrate -- --verbose       # Enable detailed logging
 *
 * @module migrate
 */

import { createMigrationManager } from '../../src/db/migration-manager';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');

  console.log('=== Database Migration ===');
  console.log(`Database: ${databasePath}`);
  console.log(`Migrations: ${migrationsDir}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
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

    // Discover migrations
    const allMigrations = await manager.discoverMigrations();
    console.log(`Total migrations: ${allMigrations.length}`);

    // Apply pending migrations
    console.log('');
    console.log('Applying pending migrations...');
    const results = await manager.migrateUp();

    if (results.length === 0) {
      console.log('✅ No pending migrations');
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
      console.log(`✅ Migration complete! Version: ${newVersion}`);
      process.exit(0);
    } else {
      console.log('');
      console.error('❌ Migration failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main();
