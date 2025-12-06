#!/usr/bin/env node
/**
 * RuVector Search - Searches codebase index for relevant files
 *
 * Usage: npx tsx search.js <query_embedding_json> [top_k]
 *
 * Returns JSON array of search results with file paths and relevance scores
 *
 * NOTE: Uses direct @ruvector/core import (from skill's local node_modules)
 * instead of ruvector-init.ts which resolves to project root's stub module.
 */

import { VectorDB } from '@ruvector/core';
import * as path from 'path';

async function searchCodebase(queryEmbedding, topK = 5) {
  try {
    // Get database path from environment
    const dbPath = process.env.RUVECTOR_DB_PATH || './data/ruvector.db';
    const dataDir = path.dirname(dbPath);
    const codebaseIndexPath = path.join(dataDir, 'codebase_index.db');

    // Open database directly (same pattern as check-db.js which works)
    const db = new VectorDB({ dimensions: 1536, storagePath: codebaseIndexPath });

    // Parse embedding
    const embeddingArray = JSON.parse(queryEmbedding);

    // Search
    const results = await db.search({
      vector: new Float32Array(embeddingArray),
      k: topK,
    });

    // Output results as JSON
    console.log(JSON.stringify(results, null, 2));
    return results;
  } catch (error) {
    console.error('Search failed:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const [queryEmbedding, topKArg] = process.argv.slice(2);
const topK = parseInt(topKArg, 10) || 5;

if (!queryEmbedding) {
  console.error('Usage: npx tsx search.js <query_embedding_json> [top_k]');
  process.exit(1);
}

// Use top-level await (ESM modules support this)
await searchCodebase(queryEmbedding, topK);
process.exit(0);
