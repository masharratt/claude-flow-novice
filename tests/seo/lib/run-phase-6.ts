#!/usr/bin/env tsx
/**
 * Phase 6 Test Runner
 *
 * Executes real Phase 6 strategy creation with mock RuVector collections.
 * Used by bash tests to validate actual business logic execution.
 *
 * Sprint 1.4 - BUG #21 Prevention
 *
 * Usage:
 *   npx tsx tests/seo/lib/run-phase-6.ts '{"taskId":"test-123","siteDomain":"test-site.com","industry":"genealogy"}'
 */

import { executePhase6 } from '../../../.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-6-strategy.ts';
import { createMockCollections } from './mock-collections.ts';
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

// Create mock RuVector collections
const { contentPatterns, competitorIntelligence } = createMockCollections();

// Execute Phase 6
executePhase6({
  redis,
  taskId: config.taskId || 'test-phase6',
  siteDomain: config.siteDomain || 'test-site.com',
  industry: config.industry || 'genealogy',
  currentTraffic: config.currentTraffic || 0,
  targetTimelineMonths: config.targetTimelineMonths || 12,
  contentPatterns,
  competitorIntelligence,
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
