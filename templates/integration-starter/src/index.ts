/**
 * Integration Starter - Main Entry Point
 *
 * This template demonstrates standardized integration patterns.
 * Replace this example with your actual integration logic.
 */

import { DatabaseService } from './services/database-service';
import { RedisCoordination } from './services/redis-coordination';
import { StandardError, ErrorCode } from './lib/errors';

/**
 * Main application entry point
 *
 * @returns Promise that resolves when application starts successfully
 * @throws {StandardError} If initialization fails
 *
 * @example
 * ```typescript
 * await main();
 * ```
 */
async function main(): Promise<void> {
  console.log('Starting integration...');

  // Initialize services
  const db = new DatabaseService({
    sqlite: { path: './data/app.db' },
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      database: process.env.POSTGRES_DB || 'cfn',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD
    }
  });

  const coord = new RedisCoordination({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  });

  try {
    // Initialize connections
    await db.initialize();
    console.log('✓ Database connected');

    await coord.initialize();
    console.log('✓ Redis connected');

    // Health check
    const health = await db.healthCheck();
    console.log('✓ Health check:', health);

    // Your integration logic here
    console.log('✓ Integration ready');

  } catch (error) {
    throw new StandardError(
      'Failed to initialize integration',
      ErrorCode.INITIALIZATION_ERROR,
      {
        component: 'main',
        timestamp: new Date().toISOString()
      },
      error
    );
  } finally {
    // Cleanup
    await db.close();
    await coord.close();
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => {
      console.log('Integration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Integration failed:', error);
      process.exit(1);
    });
}

export { main };
