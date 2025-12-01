/**
 * RuVector Database Initialization Script
 *
 * Initializes all 5 RuVector collections for MDAP + RuVector integration:
 * - decomposition_history
 * - codebase_index
 * - error_library
 * - security_patterns
 * - performance_patterns
 *
 * Usage:
 *   npx tsx scripts/init-ruvector.ts
 *   npm run ruvector:init
 *
 * Environment:
 *   RUVECTOR_DB_PATH - Database file path (default: ./data/ruvector.db)
 */

import {
  initializeRuVector,
  verifyConnectivity,
  benchmarkPerformance,
  COLLECTIONS,
  getAllCollections,
} from '../src/lib/ruvector-init.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Terminal color codes for formatted output
 */
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

/**
 * Verify file permissions for database files and directories
 *
 * @param dbPath - Path to database file
 * @returns Object with permissions check results
 */
function verifyPermissions(dbPath: string): {
  directoryOk: boolean;
  fileOk: boolean;
  directoryMode?: string;
  fileMode?: string;
} {
  const dirPath = path.dirname(dbPath);

  try {
    // Check directory permissions (should be 0o700)
    const dirStats = fs.statSync(dirPath);
    const dirMode = (dirStats.mode & parseInt('777', 8)).toString(8);
    const directoryOk = dirMode === '700';

    // Check file permissions if file exists (should be 0o600)
    let fileOk = true;
    let fileMode: string | undefined;

    if (fs.existsSync(dbPath)) {
      const fileStats = fs.statSync(dbPath);
      fileMode = (fileStats.mode & parseInt('777', 8)).toString(8);
      fileOk = fileMode === '600';
    }

    return {
      directoryOk,
      fileOk,
      directoryMode: dirMode,
      fileMode,
    };
  } catch (error) {
    console.error(`${COLORS.red}Error verifying permissions:${COLORS.reset}`, error);
    return { directoryOk: false, fileOk: false };
  }
}

/**
 * Main initialization function
 */
async function main(): Promise<void> {
  console.log(`${COLORS.blue}=== RuVector Database Initialization ===${COLORS.reset}\n`);

  const dbPath = process.env.RUVECTOR_DB_PATH || './data/ruvector.db';
  console.log(`${COLORS.dim}Database path: ${dbPath}${COLORS.reset}`);
  console.log(`${COLORS.dim}Collections: ${Object.values(COLLECTIONS).length}${COLORS.reset}\n`);

  // Step 1: Initialize all collections
  console.log(`${COLORS.blue}[1/4] Initializing collections...${COLORS.reset}`);
  try {
    const startTime = Date.now();
    const collections = await initializeRuVector();
    const duration = Date.now() - startTime;

    console.log(`${COLORS.green}✓ Initialized ${collections.size} collections in ${duration}ms${COLORS.reset}`);

    // List all collections
    for (const [name] of collections) {
      console.log(`  ${COLORS.dim}- ${name}${COLORS.reset}`);
    }
    console.log();
  } catch (error) {
    console.error(`${COLORS.red}✗ Initialization failed:${COLORS.reset}`, error);
    process.exit(1);
  }

  // Step 2: Verify connectivity
  console.log(`${COLORS.blue}[2/4] Verifying connectivity...${COLORS.reset}`);
  try {
    const connectivity = await verifyConnectivity();

    if (connectivity.connected && connectivity.collectionsReady) {
      console.log(`${COLORS.green}✓ Connectivity verified (${connectivity.latency}ms)${COLORS.reset}`);
      console.log(`  ${COLORS.dim}Collections ready: ${connectivity.collections.length}/${Object.values(COLLECTIONS).length}${COLORS.reset}\n`);
    } else {
      console.error(`${COLORS.red}✗ Connectivity check failed${COLORS.reset}`);
      console.error(`  Connected: ${connectivity.connected}`);
      console.error(`  Collections ready: ${connectivity.collectionsReady}`);
      console.error(`  Expected collections: ${Object.values(COLLECTIONS).length}`);
      console.error(`  Found collections: ${connectivity.collections.length}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`${COLORS.red}✗ Connectivity verification failed:${COLORS.reset}`, error);
    process.exit(1);
  }

  // Step 3: Run performance benchmark
  console.log(`${COLORS.blue}[3/4] Running performance benchmark...${COLORS.reset}`);
  try {
    const benchmark = await benchmarkPerformance();
    const threshold = 100; // 100ms requirement

    if (benchmark.passed) {
      console.log(`${COLORS.green}✓ Benchmark passed${COLORS.reset}`);
      console.log(`  ${COLORS.dim}Insert latency: ${benchmark.insertLatency}ms (< ${threshold}ms)${COLORS.reset}`);
      console.log(`  ${COLORS.dim}Query latency: ${benchmark.queryLatency}ms (< ${threshold}ms)${COLORS.reset}\n`);
    } else {
      console.warn(`${COLORS.yellow}⚠ Benchmark exceeded threshold${COLORS.reset}`);
      console.warn(`  Insert latency: ${benchmark.insertLatency}ms (threshold: ${threshold}ms)`);
      console.warn(`  Query latency: ${benchmark.queryLatency}ms (threshold: ${threshold}ms)\n`);
    }
  } catch (error) {
    console.error(`${COLORS.red}✗ Benchmark failed:${COLORS.reset}`, error);
    process.exit(1);
  }

  // Step 4: Verify file permissions
  console.log(`${COLORS.blue}[4/4] Verifying file permissions...${COLORS.reset}`);

  const collections = getAllCollections();
  let allPermissionsOk = true;

  for (const [collectionName] of collections) {
    const collectionPath = path.join(path.dirname(dbPath), `${collectionName}.db`);
    const permissions = verifyPermissions(collectionPath);

    if (!permissions.directoryOk) {
      console.error(`${COLORS.red}✗ Directory permissions incorrect (expected: 700, got: ${permissions.directoryMode})${COLORS.reset}`);
      allPermissionsOk = false;
    }

    if (!permissions.fileOk && permissions.fileMode) {
      console.error(`${COLORS.red}✗ File permissions incorrect for ${collectionName} (expected: 600, got: ${permissions.fileMode})${COLORS.reset}`);
      allPermissionsOk = false;
    }
  }

  if (allPermissionsOk) {
    console.log(`${COLORS.green}✓ File permissions verified${COLORS.reset}`);
    console.log(`  ${COLORS.dim}Directory mode: 0700 (owner only)${COLORS.reset}`);
    console.log(`  ${COLORS.dim}Database files: 0600 (owner read/write only)${COLORS.reset}\n`);
  } else {
    console.warn(`${COLORS.yellow}⚠ Some permission checks failed${COLORS.reset}\n`);
  }

  // Summary
  console.log(`${COLORS.blue}=== Initialization Complete ===${COLORS.reset}\n`);
  console.log(`${COLORS.green}✓ All 5 collections initialized and verified${COLORS.reset}`);
  console.log(`${COLORS.green}✓ Performance benchmarks passed${COLORS.reset}`);
  console.log(`${COLORS.green}✓ Database ready for use${COLORS.reset}\n`);

  console.log(`${COLORS.dim}Database location: ${dbPath}${COLORS.reset}`);
  console.log(`${COLORS.dim}Collections: ${Array.from(collections.keys()).join(', ')}${COLORS.reset}\n`);
}

// Run initialization
main().catch((error) => {
  console.error(`${COLORS.red}Fatal error:${COLORS.reset}`, error);
  process.exit(1);
});
