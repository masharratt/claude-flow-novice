#!/usr/bin/env ts-node
/**
 * Validation Script - Validate Migration Integrity
 *
 * Usage:
 *   npm run migrations:validate    # Validate all applied migrations
 *
 * @module validate
 */

import { createMigrationManager } from '../../src/db/migration-manager';
import * as path from 'path';

async function main() {
  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');

  const manager = await createMigrationManager({
    databasePath,
    migrationsDir,
    verbose: false,
  });

  try {
    console.log('=== Migration Validation ===');
    console.log('');

    const validation = await manager.validateMigrations();

    if (validation.valid) {
      console.log('✅ All migrations are valid');
      console.log('   - All applied migrations exist');
      console.log('   - All checksums match');
      process.exit(0);
    } else {
      console.error('❌ Migration validation failed!');
      console.error('');
      console.error('Errors:');
      validation.errors.forEach((error) => {
        console.error(`  - ${error}`);
      });
      console.error('');
      console.error('Action required:');
      console.error('  1. Restore original migration files from version control');
      console.error('  2. Or rollback affected migrations and re-apply');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main();
