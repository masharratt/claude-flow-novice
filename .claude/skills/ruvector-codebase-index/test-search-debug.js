#!/usr/bin/env node
import { VectorDB, DistanceMetric } from '@ruvector/core';
import { generateEmbedding } from './embeddings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../../data/ruvector');
const ERROR_PATTERNS_DB = path.join(DATA_DIR, 'error_patterns.db');

async function debugSearch() {
  console.log('Debug: Opening database...', ERROR_PATTERNS_DB);

  const db = new VectorDB({
    dimensions: 1536,
    distanceMetric: DistanceMetric.Cosine,
    storagePath: ERROR_PATTERNS_DB,
    hnswConfig: {
      m: 16,
      efConstruction: 200,
      efSearch: 100,
      maxElements: 10000,
    },
  });

  console.log('Debug: Generating embedding for query...');
  const queryText = 'TypeScript type errors';
  const embedding = await generateEmbedding(queryText);
  console.log('Debug: Embedding generated, length:', embedding ? embedding.length : 'null');

  console.log('Debug: Searching...');
  const results = await db.search({
    vector: Float32Array.from(embedding),
    k: 5,
  });

  console.log('Debug: Search complete');
  console.log('Debug: Results type:', typeof results);
  console.log('Debug: Results is array:', Array.isArray(results));
  console.log('Debug: Results:', JSON.stringify(results, null, 2));
}

debugSearch().catch(err => {
  console.error('Debug failed:', err);
  process.exit(1);
});
