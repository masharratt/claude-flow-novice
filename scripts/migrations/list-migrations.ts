#!/usr/bin/env ts-node
/**
 * List Migrations Script - Show Migration Status
 *
 * Usage:
 *   npm run migrations:list              # List all migrations with status
 *   npm run migrations:list -- --pending # Show only pending migrations
 *   npm run migrations:list -- --applied # Show only applied migrations
 *
 * @module list-migrations
 */

import { createMigrationManager } from '../../src/db/migration-manager';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const showPending = args.includes('--pending');
  const showApplied = args.includes('--applied');

  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');

  const manager = await createMigrationManager({
    databasePath,
    migrationsDir,
    verbose: false,
  });

  try {
    // Get all migrations
    const allMigrations = await manager.discoverMigrations();
    const appliedMigrations = await manager.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map((m) => m.version));

    // Current version
    const currentVersion = await manager.getCurrentVersion();

    console.log('=== Migration Status ===');
    console.log(`Current version: ${currentVersion || '(none)'}`);
    console.log(`Total migrations: ${allMigrations.length}`);
    console.log(`Applied: ${appliedMigrations.length}`);
    console.log(`Pending: ${allMigrations.length - appliedMigrations.length}`);
    console.log('');

    // Display migrations
    console.log('Migrations:');
    console.log('');

    for (const migration of allMigrations) {
      const isApplied = appliedVersions.has(migration.version);

      // Filter based on arguments
      if (showPending && isApplied) continue;
      if (showApplied && !isApplied) continue;

      const status = isApplied ? '✅ Applied' : '⏳ Pending';
      const isCurrent = migration.version === currentVersion ? ' ← CURRENT' : '';

      console.log(`${status}  ${migration.version} - ${migration.name}${isCurrent}`);

      // Show applied date if applicable
      if (isApplied) {
        const appliedMigration = appliedMigrations.find((m) => m.version === migration.version);
        if (appliedMigration) {
          console.log(`         Applied: ${appliedMigration.applied_at} (${appliedMigration.execution_time_ms}ms)`);
        }
      }
    }

    console.log('');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main();
