#!/usr/bin/env tsx
/**
 * Phase 7 Test Runner
 *
 * Executes real Phase 7 roadmap generation.
 * Used by bash tests to validate actual business logic execution.
 *
 * Sprint 1.4 - BUG #21 Prevention
 *
 * Usage:
 *   npx tsx tests/seo/lib/run-phase-7.ts '{"taskId":"test-123","siteDomain":"test-site.com"}'
 */

import { executePhase7 } from '../../../.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-7-roadmap.ts';
import Redis from 'ioredis';

// Parse config from command line
const configJson = process.argv[2] || '{}';
let config: any;

try {
  config = JSON.parse(configJson);
} catch (error) {
  console.error(JSON.stringify({ error: 'Invalid JSON config' }));
  process.exit(1);
}

// Create Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: () => null, // Don't retry on connection failure
});

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error(JSON.stringify({ error: `Redis connection failed: ${err.message}` }));
  process.exit(1);
});

// Execute Phase 7
executePhase7({
  redis,
  taskId: config.taskId || 'test-phase7',
  siteDomain: config.siteDomain || 'test-site.com',
  outputDir: config.outputDir,
  verbose: config.verbose || false,
})
  .then((result) => {
    // Output result as JSON
    console.log(JSON.stringify(result, null, 2));
    redis.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    redis.disconnect();
    process.exit(1);
  });
