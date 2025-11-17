#!/usr/bin/env ts-node
/**
 * History Script - Show Rollback History
 *
 * Usage:
 *   npm run migrations:history              # Show all rollback history
 *   npm run migrations:history -- --limit=10 # Show last 10 rollbacks
 *
 * @module history
 */

import { createMigrationManager } from '../../src/db/migration-manager';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

  const databasePath = process.env.DATABASE_PATH || './data/app.db';
  const migrationsDir = path.join(__dirname, '../../src/db/migrations');

  const manager = await createMigrationManager({
    databasePath,
    migrationsDir,
    verbose: false,
  });

  try {
    console.log('=== Rollback History ===');
    console.log('');

    const history = await manager.getRollbackHistory();

    if (history.length === 0) {
      console.log('No rollback history found');
      process.exit(0);
    }

    const displayHistory = limit ? history.slice(0, limit) : history;

    console.log(`Total rollbacks: ${history.length}`);
    if (limit && history.length > limit) {
      console.log(`Showing last ${limit} rollbacks`);
    }
    console.log('');

    for (const record of displayHistory) {
      const status = record.success ? '✅' : '❌';
      console.log(`${status} Version ${record.version} - ${record.name}`);
      console.log(`   Rolled back: ${record.rolled_back_at}`);
      console.log(`   Reason: ${record.reason || 'N/A'}`);
      console.log(`   Operator: ${record.rolled_back_by}`);
      console.log(`   Duration: ${record.execution_time_ms}ms`);

      if (!record.success && record.error_message) {
        console.log(`   Error: ${record.error_message}`);
      }

      console.log('');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main();
