/**
 * RuVector Database Initialization
 *
 * Provides connection management and collection initialization for the RuVector
 * vector database used in CFN Loop v3 learning systems.
 *
 * Collections:
 * - decomposition_history: Task decomposition patterns and success metrics
 * - codebase_index: Semantic index of code files and relationships
 * - error_library: Error patterns, root causes, and fixes
 * - security_patterns: Security vulnerabilities and prevention strategies
 * - performance_patterns: Performance issues and optimization strategies
 */

import { VectorDB, DistanceMetric } from '@ruvector/core';
import type { DbOptions } from '@ruvector/core';
import * as path from 'path';
import * as fs from 'fs';

// Type for VectorDB instance (VectorDB is exported as 'any', so we use the interface type)
type VectorDBInstance = any;

/**
 * Security: Secure file write helper function
 * Ensures database files are created with restrictive permissions (0600)
 * and non-sensitive files with (0644)
 *
 * @param filePath - Full path to file
 * @param data - File contents (string or Buffer)
 * @param sensitive - If true, uses 0o600 (owner only); otherwise 0o644 (owner+read)
 * @throws Error if file write fails
 */
function secureFileWrite(filePath: string, data: string | Buffer, sensitive = true): void {
  const mode = sensitive ? 0o600 : 0o644;
  try {
    fs.writeFileSync(filePath, data, { mode });
  } catch (error) {
    throw new Error(
      `Failed to write file securely at ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Security: Secure directory creation helper
 * Ensures directories are created with restrictive permissions (0o700)
 * Prevents other users from accessing database directories
 *
 * @param dirPath - Full path to directory
 * @param recursive - If true, create parent directories
 * @throws Error if directory creation fails
 */
function secureCreateDir(dirPath: string, recursive = true): void {
  try {
    // Only set mode if creating new directories (mkdirSync with mode is non-standard)
    // We set permissions after creation for consistency
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive, mode: 0o700 });
    }
    // Ensure permissions are correct even if directory existed
    fs.chmodSync(dirPath, 0o700);
  } catch (error) {
    throw new Error(
      `Failed to create secure directory at ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Database configuration
 */
const DB_CONFIG: Omit<DbOptions, 'storagePath'> & { storagePath?: string } = {
  dimensions: 1536, // OpenAI ada-002 / text-embedding-3-small dimension
  distanceMetric: DistanceMetric.Cosine, // Cosine similarity for semantic search
  storagePath: process.env.RUVECTOR_DB_PATH || './data/ruvector.db',
  hnswConfig: {
    m: 16, // Max connections per layer
    efConstruction: 200, // Construction time quality
    efSearch: 100, // Search time quality
    maxElements: 10000, // Can grow automatically
  },
};

/**
 * Collection names
 */
export const COLLECTIONS = {
  DECOMPOSITION_HISTORY: 'decomposition_history',
  CODEBASE_INDEX: 'codebase_index',
  ERROR_LIBRARY: 'error_library',
  SECURITY_PATTERNS: 'security_patterns',
  PERFORMANCE_PATTERNS: 'performance_patterns',
  // MDAP Performance Collections (v2.0)
  MDAP_MODEL_PERFORMANCE: 'mdap_model_performance',
  PROMPT_OPTIMIZATIONS: 'prompt_optimizations',
} as const;

/**
 * Map of collection name to database instance
 * RuVector doesn't support collections natively, so we create separate DB instances
 */
const collections: Map<string, VectorDBInstance> = new Map();

/**
 * Initialize RuVector database instances for all collections
 *
 * @returns Promise<Map<string, VectorDBInstance>> - Map of collection name to database instance
 * @throws Error if connection fails or collections cannot be created
 */
export async function initializeRuVector(): Promise<Map<string, VectorDBInstance>> {
  if (collections.size > 0) {
    return collections;
  }

  try {
    // Ensure data directory exists with secure permissions
    const dataDir = path.dirname(DB_CONFIG.storagePath || './data/ruvector.db');
    if (!fs.existsSync(dataDir)) {
      secureCreateDir(dataDir, true);
      console.log(`Created secure data directory: ${dataDir}`);
    }

    const startTime = Date.now();

    // Create all collections as separate database instances
    await createCollections();

    const connectionTime = Date.now() - startTime;
    console.log(`RuVector initialized ${collections.size} collections in ${connectionTime}ms`);

    if (connectionTime > 100) {
      console.warn(`⚠️ RuVector initialization took ${connectionTime}ms (>100ms threshold)`);
    }

    return collections;
  } catch (error) {
    console.error('Failed to initialize RuVector:', error);
    throw new Error(`RuVector initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create all required collections as separate database instances
 *
 * @throws Error if collection creation fails
 */
async function createCollections(): Promise<void> {
  const collectionNames = Object.values(COLLECTIONS);
  const dataDir = path.dirname(DB_CONFIG.storagePath || './data/ruvector.db');

  for (const collectionName of collectionNames) {
    try {
      // Each collection gets its own database file
      const collectionPath = path.join(dataDir, `${collectionName}.db`);

      // Create database instance for this collection
      const collectionDb = new VectorDB({
        ...DB_CONFIG,
        storagePath: collectionPath,
      });

      collections.set(collectionName, collectionDb);
      console.log(`Created collection: ${collectionName} at ${collectionPath}`);
    } catch (error) {
      throw new Error(
        `Failed to create collection ${collectionName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Get a specific collection database instance
 *
 * @param collectionName - Name of the collection
 * @returns VectorDBInstance - Collection database instance
 * @throws Error if database is not initialized or collection doesn't exist
 */
export function getCollection(collectionName: string): VectorDBInstance {
  if (collections.size === 0) {
    throw new Error('RuVector not initialized. Call initializeRuVector() first.');
  }

  const collection = collections.get(collectionName);
  if (!collection) {
    throw new Error(`Collection '${collectionName}' not found. Available: ${Array.from(collections.keys()).join(', ')}`);
  }

  return collection;
}

/**
 * Get all collections
 *
 * @returns Map<string, VectorDBInstance> - Map of all collections
 * @throws Error if database is not initialized
 */
export function getAllCollections(): Map<string, VectorDBInstance> {
  if (collections.size === 0) {
    throw new Error('RuVector not initialized. Call initializeRuVector() first.');
  }
  return collections;
}

/**
 * Verify database connectivity and performance
 *
 * @returns Promise<VerificationResult> - Connection and performance metrics
 */
export async function verifyConnectivity(): Promise<{
  connected: boolean;
  latency: number;
  collectionsReady: boolean;
  collections: string[];
}> {
  try {
    const startTime = Date.now();

    // Ensure database is initialized
    if (collections.size === 0) {
      await initializeRuVector();
    }

    // Get collection names
    const collectionNames = Array.from(collections.keys());
    const latency = Date.now() - startTime;

    // Verify all required collections exist
    const expectedCollections = Object.values(COLLECTIONS);
    const collectionsReady = expectedCollections.every(name =>
      collectionNames.includes(name)
    );

    return {
      connected: true,
      latency,
      collectionsReady,
      collections: collectionNames,
    };
  } catch (error) {
    console.error('Connectivity verification failed:', error);
    return {
      connected: false,
      latency: -1,
      collectionsReady: false,
      collections: [],
    };
  }
}

/**
 * Benchmark basic RuVector operations
 *
 * @returns Promise<BenchmarkResults> - Performance metrics for insert and query
 */
export async function benchmarkPerformance(): Promise<{
  insertLatency: number;
  queryLatency: number;
  passed: boolean;
}> {
  if (collections.size === 0) {
    await initializeRuVector();
  }

  const threshold = 100; // 100ms requirement from plan
  const dataDir = path.dirname(DB_CONFIG.storagePath || './data/ruvector.db');
  const testDbPath = path.join(dataDir, 'benchmark_test.db');

  let testDb: VectorDBInstance | null = null;

  try {
    // Create test database
    testDb = new VectorDB({
      ...DB_CONFIG,
      storagePath: testDbPath,
    });

    // Test insert performance
    const testVector = new Float32Array(DB_CONFIG.dimensions).map(() => Math.random());
    const insertStart = Date.now();
    await testDb.insert({
      id: 'test-1',
      vector: testVector,
      metadata: { test: true },
    });
    const insertLatency = Date.now() - insertStart;

    // Test query performance
    const queryStart = Date.now();
    await testDb.search({
      vector: testVector,
      k: 1,
    });
    const queryLatency = Date.now() - queryStart;

    const passed = insertLatency < threshold && queryLatency < threshold;

    // Cleanup - delete test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    return {
      insertLatency,
      queryLatency,
      passed,
    };
  } catch (error) {
    console.error('Benchmark failed:', error);

    // Attempt cleanup on error
    if (testDb && fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }

    throw new Error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Close all RuVector database connections
 * Note: RuVector auto-persists changes, so no explicit save is needed
 */
export async function closeRuVector(): Promise<void> {
  if (collections.size > 0) {
    // Clear collections map (RuVector handles persistence automatically)
    const count = collections.size;
    collections.clear();
    console.log(`All ${count} RuVector collections closed`);
  }
}
