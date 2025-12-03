#!/usr/bin/env node
/**
 * RuVector Database Initialization
 *
 * Standalone script to initialize RuVector database collections.
 * Used by index.sh to avoid inline eval path resolution issues.
 *
 * Usage: npx tsx init-db.js
 *
 * Exit codes:
 *   0 - Success
 *   1 - Initialization failed
 */

// Dynamic import for TypeScript module (requires tsx runtime)
const { initializeRuVector, getCollection, COLLECTIONS } =
  await import('../../../docker/trigger-dev/src/lib/ruvector-init.ts');

try {
  await initializeRuVector();
  const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);
  console.log('RuVector database initialized successfully');
  process.exit(0);
} catch (error) {
  console.error('Failed to initialize RuVector:', error);
  process.exit(1);
}
